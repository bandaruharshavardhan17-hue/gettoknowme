import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to authenticate user and check admin role
async function authenticateAdmin(req: Request, supabase: any): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Unauthorized. Provide a valid Bearer token.' };
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (!user || error) {
    return { userId: null, error: 'Unauthorized. Invalid token.' };
  }

  // Check if user has admin role
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();

  if (roleError || !roleData) {
    return { userId: null, error: 'Forbidden. Admin access required.' };
  }

  return { userId: user.id, error: null };
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
    const resource = url.searchParams.get('resource'); // users, spaces, documents, links, chats

    const { userId, error: authError } = await authenticateAdmin(req, supabase);
    if (authError || !userId) {
      const status = authError?.includes('Forbidden') ? 403 : 401;
      return new Response(JSON.stringify({ error: authError || 'Unauthorized' }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET - List resources
    if (req.method === 'GET') {
      switch (resource) {
        case 'users': {
          const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          // Get counts for each user
          const usersWithStats = await Promise.all(
            (profiles || []).map(async (profile: any) => {
              const [spacesRes, docsRes, linksRes] = await Promise.all([
                supabase.from('spaces').select('id', { count: 'exact' }).eq('owner_id', profile.id),
                supabase.from('documents').select('id', { count: 'exact' }).in(
                  'space_id',
                  (await supabase.from('spaces').select('id').eq('owner_id', profile.id)).data?.map((s: any) => s.id) || []
                ),
                supabase.from('share_links').select('id', { count: 'exact' }).in(
                  'space_id',
                  (await supabase.from('spaces').select('id').eq('owner_id', profile.id)).data?.map((s: any) => s.id) || []
                ),
              ]);

              // Check if user is admin
              const { data: roleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', profile.id)
                .eq('role', 'admin')
                .single();

              return {
                ...profile,
                is_admin: !!roleData,
                spaces_count: spacesRes.count || 0,
                documents_count: docsRes.count || 0,
                links_count: linksRes.count || 0,
              };
            })
          );

          return new Response(JSON.stringify({ users: usersWithStats }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        case 'spaces': {
          const ownerId = url.searchParams.get('owner_id');
          
          let query = supabase
            .from('spaces')
            .select('*, documents(count), share_links(count), profiles!spaces_owner_id_fkey(email, display_name)')
            .order('created_at', { ascending: false });

          if (ownerId) {
            query = query.eq('owner_id', ownerId);
          }

          const { data, error } = await query;
          if (error) throw error;

          const spaces = (data || []).map((s: any) => ({
            ...s,
            document_count: s.documents?.[0]?.count || 0,
            link_count: s.share_links?.[0]?.count || 0,
            owner_email: s.profiles?.email,
            owner_name: s.profiles?.display_name,
          }));

          return new Response(JSON.stringify({ spaces }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        case 'chats': {
          const spaceId = url.searchParams.get('space_id');
          const linkId = url.searchParams.get('link_id');

          let query = supabase
            .from('chat_messages')
            .select('*, share_links(token, name), spaces(name)')
            .order('created_at', { ascending: false })
            .limit(100);

          if (spaceId) query = query.eq('space_id', spaceId);
          if (linkId) query = query.eq('share_link_id', linkId);

          const { data, error } = await query;
          if (error) throw error;

          return new Response(JSON.stringify({ messages: data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        case 'analytics': {
          // Get overall platform stats
          const [usersRes, spacesRes, docsRes, linksRes, chatsRes] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact' }),
            supabase.from('spaces').select('id', { count: 'exact' }),
            supabase.from('documents').select('id', { count: 'exact' }),
            supabase.from('share_links').select('id, view_count'),
            supabase.from('chat_messages').select('id', { count: 'exact' }),
          ]);

          const totalViews = (linksRes.data || []).reduce((sum: number, l: any) => sum + (l.view_count || 0), 0);

          return new Response(JSON.stringify({
            analytics: {
              total_users: usersRes.count || 0,
              total_spaces: spacesRes.count || 0,
              total_documents: docsRes.count || 0,
              total_links: linksRes.data?.length || 0,
              total_views: totalViews,
              total_chat_messages: chatsRes.count || 0,
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        default:
          return new Response(JSON.stringify({ error: 'Invalid resource. Use: users, spaces, chats, analytics' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    }

    // POST - Manage user roles
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      
      if (resource === 'roles') {
        const { user_id, action, role } = body;

        if (!user_id || !action) {
          return new Response(JSON.stringify({ error: 'user_id and action are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (action === 'add') {
          const { error } = await supabase
            .from('user_roles')
            .insert({ user_id, role: role || 'admin' });

          if (error) {
            if (error.code === '23505') {
              return new Response(JSON.stringify({ error: 'User already has this role' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            throw error;
          }

          return new Response(JSON.stringify({ success: true, message: 'Role added' }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (action === 'remove') {
          const { error } = await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', user_id)
            .eq('role', role || 'admin');

          if (error) throw error;

          return new Response(JSON.stringify({ success: true, message: 'Role removed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: 'Invalid action. Use: add, remove' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid resource for POST' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Delete resources
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ error: 'id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      switch (resource) {
        case 'spaces': {
          // Delete related data first
          await supabase.from('chat_messages').delete().eq('space_id', id);
          await supabase.from('share_links').delete().eq('space_id', id);
          
          const { data: docs } = await supabase.from('documents').select('id').eq('space_id', id);
          if (docs?.length) {
            await supabase.from('document_chunks').delete().in('document_id', docs.map((d: any) => d.id));
          }
          await supabase.from('documents').delete().eq('space_id', id);
          
          const { error } = await supabase.from('spaces').delete().eq('id', id);
          if (error) throw error;

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        case 'users': {
          // Delete all user data
          const { data: userSpaces } = await supabase.from('spaces').select('id').eq('owner_id', id);
          
          for (const space of userSpaces || []) {
            await supabase.from('chat_messages').delete().eq('space_id', space.id);
            await supabase.from('share_links').delete().eq('space_id', space.id);
            const { data: docs } = await supabase.from('documents').select('id').eq('space_id', space.id);
            if (docs?.length) {
              await supabase.from('document_chunks').delete().in('document_id', docs.map((d: any) => d.id));
            }
            await supabase.from('documents').delete().eq('space_id', space.id);
          }
          
          await supabase.from('spaces').delete().eq('owner_id', id);
          await supabase.from('user_roles').delete().eq('user_id', id);
          await supabase.from('profiles').delete().eq('id', id);
          
          // Delete auth user
          const { error } = await supabase.auth.admin.deleteUser(id);
          if (error) throw error;

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        default:
          return new Response(JSON.stringify({ error: 'Invalid resource for DELETE' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Admin API error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
