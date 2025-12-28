import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Helper to authenticate user via Bearer token or API key
async function authenticateRequest(req: Request, supabase: any): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');

  // Try Bearer token first (for logged-in users)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      return { userId: user.id, error: null };
    }
  }

  // For now, we only support Bearer token auth
  // API key support can be added later via a separate api_keys table
  return { userId: null, error: 'Unauthorized. Provide a valid Bearer token.' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Expected paths: /api/v1/spaces, /api/v1/spaces/:id, etc.
    const version = pathParts[0]; // 'api-spaces' is the function name
    
    const { userId, error: authError } = await authenticateRequest(req, supabase);
    if (authError || !userId) {
      return new Response(JSON.stringify({ error: authError || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method !== 'GET' && req.method !== 'DELETE' 
      ? await req.json().catch(() => ({})) 
      : {};
    const spaceId = url.searchParams.get('id');

    // GET - List spaces or get single space
    if (req.method === 'GET') {
      if (spaceId) {
        const { data, error } = await supabase
          .from('spaces')
          .select('*, documents(count), share_links(count)')
          .eq('id', spaceId)
          .eq('owner_id', userId)
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: 'Space not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ 
          space: {
            ...data,
            document_count: data.documents?.[0]?.count || 0,
            link_count: data.share_links?.[0]?.count || 0,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('spaces')
        .select('*, documents(count)')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching spaces:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch spaces' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const spaces = data?.map(s => ({
        ...s,
        document_count: s.documents?.[0]?.count || 0,
      })) || [];

      return new Response(JSON.stringify({ spaces }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST - Create space
    if (req.method === 'POST') {
      const { name, description } = body;

      if (!name) {
        return new Response(JSON.stringify({ error: 'Name is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('spaces')
        .insert({
          name,
          description: description || null,
          owner_id: userId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating space:', error);
        return new Response(JSON.stringify({ error: 'Failed to create space' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Space created: ${data.id} by user ${userId}`);
      return new Response(JSON.stringify({ space: data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT - Update space
    if (req.method === 'PUT') {
      if (!spaceId) {
        return new Response(JSON.stringify({ error: 'Space ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { name, description } = body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      const { data, error } = await supabase
        .from('spaces')
        .update(updateData)
        .eq('id', spaceId)
        .eq('owner_id', userId)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Space not found or update failed' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ space: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Delete space
    if (req.method === 'DELETE') {
      if (!spaceId) {
        return new Response(JSON.stringify({ error: 'Space ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: space } = await supabase
        .from('spaces')
        .select('id')
        .eq('id', spaceId)
        .eq('owner_id', userId)
        .single();

      if (!space) {
        return new Response(JSON.stringify({ error: 'Space not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete related data
      await supabase.from('share_links').delete().eq('space_id', spaceId);
      
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('space_id', spaceId);
      
      if (docs?.length) {
        await supabase
          .from('document_chunks')
          .delete()
          .in('document_id', docs.map(d => d.id));
      }
      
      await supabase.from('documents').delete().eq('space_id', spaceId);
      await supabase.from('spaces').delete().eq('id', spaceId);

      console.log(`Space deleted: ${spaceId} by user ${userId}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});