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
    const docId = url.searchParams.get('id');

    const body = req.method !== 'GET' && req.method !== 'DELETE' 
      ? await req.json().catch(() => ({})) 
      : {};

    // GET - List documents
    if (req.method === 'GET') {
      if (!spaceId && !docId) {
        return new Response(JSON.stringify({ error: 'space_id or id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (docId) {
        const { data, error } = await supabase
          .from('documents')
          .select('*, spaces!inner(id, owner_id)')
          .eq('id', docId)
          .eq('spaces.owner_id', userId)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ error: 'Document not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ document: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify space ownership
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

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching documents:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch documents' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ documents: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST - Create a text document/note
    if (req.method === 'POST') {
      const { space_id, filename, content, file_type } = body;

      if (!space_id || !filename || !content) {
        return new Response(JSON.stringify({ error: 'space_id, filename, and content are required' }), {
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

      // Create document
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          space_id,
          filename,
          content_text: content,
          file_type: file_type || 'txt',
          status: 'ready',
        })
        .select()
        .single();

      if (docError) {
        console.error('Error creating document:', docError);
        return new Response(JSON.stringify({ error: 'Failed to create document' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create chunks for the content
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        await supabase.from('document_chunks').insert({
          document_id: doc.id,
          content: chunks[i],
          chunk_index: i,
        });
      }

      console.log(`Document created: ${doc.id} with ${chunks.length} chunks`);
      return new Response(JSON.stringify({ document: doc }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Delete a document
    if (req.method === 'DELETE') {
      if (!docId) {
        return new Response(JSON.stringify({ error: 'Document ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: doc } = await supabase
        .from('documents')
        .select('*, spaces!inner(owner_id)')
        .eq('id', docId)
        .single();

      if (!doc || doc.spaces.owner_id !== userId) {
        return new Response(JSON.stringify({ error: 'Document not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete chunks first
      await supabase.from('document_chunks').delete().eq('document_id', docId);
      await supabase.from('documents').delete().eq('id', docId);

      console.log(`Document deleted: ${docId} by user ${userId}`);
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