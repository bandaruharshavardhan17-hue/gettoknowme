import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

async function authenticateRequest(req: Request, supabase: any): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get('authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      return { userId: user.id, error: null };
    }
  }

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
    const { userId, error: authError } = await authenticateRequest(req, supabase);
    if (authError || !userId) {
      return new Response(JSON.stringify({ error: authError || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const spaceId = url.searchParams.get('space_id');
    const linkId = url.searchParams.get('id');

    const body = req.method !== 'GET' && req.method !== 'DELETE' 
      ? await req.json().catch(() => ({})) 
      : {};

    // GET - List links for a space or all links
    if (req.method === 'GET') {
      // Get single link by ID
      if (linkId) {
        const { data, error } = await supabase
          .from('share_links')
          .select('*, spaces!inner(id, name, owner_id)')
          .eq('id', linkId)
          .eq('spaces.owner_id', userId)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ error: 'Link not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ 
          link: {
            ...data,
            space_name: data.spaces.name,
            url: `${url.origin}/s/${data.token}`,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // List all links or filter by space
      let query = supabase
        .from('share_links')
        .select('*, spaces!inner(id, name, owner_id)')
        .eq('spaces.owner_id', userId)
        .order('created_at', { ascending: false });

      if (spaceId) {
        query = query.eq('space_id', spaceId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching links:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch links' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const links = data?.map(l => ({
        ...l,
        space_name: l.spaces.name,
        url: `${url.origin}/s/${l.token}`,
      })) || [];

      return new Response(JSON.stringify({ links }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST - Create a share link
    if (req.method === 'POST') {
      const { space_id, name } = body;

      if (!space_id) {
        return new Response(JSON.stringify({ error: 'space_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify space ownership
      const { data: space } = await supabase
        .from('spaces')
        .select('id')
        .eq('id', space_id)
        .eq('owner_id', userId)
        .single();

      if (!space) {
        return new Response(JSON.stringify({ error: 'Space not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('share_links')
        .insert({
          space_id,
          name: name || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating link:', error);
        return new Response(JSON.stringify({ error: 'Failed to create link' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Share link created: ${data.token} for space ${space_id}`);
      return new Response(JSON.stringify({ 
        link: {
          ...data,
          url: `${url.origin}/s/${data.token}`,
        }
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT - Update a link (revoke/unrevoke, rename)
    if (req.method === 'PUT') {
      if (!linkId) {
        return new Response(JSON.stringify({ error: 'Link ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { name, revoked } = body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (revoked !== undefined) updateData.revoked = revoked;

      // Verify ownership via space
      const { data: existingLink } = await supabase
        .from('share_links')
        .select('*, spaces!inner(owner_id)')
        .eq('id', linkId)
        .single();

      if (!existingLink || existingLink.spaces.owner_id !== userId) {
        return new Response(JSON.stringify({ error: 'Link not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('share_links')
        .update(updateData)
        .eq('id', linkId)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Update failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ link: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Delete a link
    if (req.method === 'DELETE') {
      if (!linkId) {
        return new Response(JSON.stringify({ error: 'Link ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: existingLink } = await supabase
        .from('share_links')
        .select('*, spaces!inner(owner_id)')
        .eq('id', linkId)
        .single();

      if (!existingLink || existingLink.spaces.owner_id !== userId) {
        return new Response(JSON.stringify({ error: 'Link not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('share_links').delete().eq('id', linkId);

      console.log(`Share link deleted: ${linkId} by user ${userId}`);
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