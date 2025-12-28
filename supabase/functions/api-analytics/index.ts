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
    const linkId = url.searchParams.get('link_id');

    // GET - Get analytics
    if (req.method === 'GET') {
      // If space_id provided, get analytics for that space
      if (spaceId) {
        // Verify ownership
        const { data: space } = await supabase
          .from('spaces')
          .select('id, name')
          .eq('id', spaceId)
          .eq('owner_id', userId)
          .single();

        if (!space) {
          return new Response(JSON.stringify({ error: 'Space not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: links, error } = await supabase
          .from('share_links')
          .select('*')
          .eq('space_id', spaceId)
          .order('view_count', { ascending: false });

        if (error) {
          console.error('Error fetching analytics:', error);
          return new Response(JSON.stringify({ error: 'Failed to fetch analytics' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const totalViews = links?.reduce((sum, l) => sum + (l.view_count || 0), 0) || 0;
        const activeLinks = links?.filter(l => !l.revoked).length || 0;

        return new Response(JSON.stringify({
          analytics: {
            space_id: spaceId,
            space_name: space.name,
            total_views: totalViews,
            active_links: activeLinks,
            avg_views_per_link: activeLinks > 0 ? Math.round(totalViews / activeLinks) : 0,
            links: links?.map(l => ({
              id: l.id,
              name: l.name,
              token: l.token,
              view_count: l.view_count || 0,
              last_used_at: l.last_used_at,
              revoked: l.revoked,
              created_at: l.created_at,
            })) || [],
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If link_id provided, get analytics for that specific link
      if (linkId) {
        const { data: link, error } = await supabase
          .from('share_links')
          .select('*, spaces!inner(id, name, owner_id)')
          .eq('id', linkId)
          .single();

        if (error || !link || link.spaces.owner_id !== userId) {
          return new Response(JSON.stringify({ error: 'Link not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          analytics: {
            link_id: link.id,
            link_name: link.name,
            space_name: link.spaces.name,
            view_count: link.view_count || 0,
            last_used_at: link.last_used_at,
            revoked: link.revoked,
            created_at: link.created_at,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get overall analytics for all spaces
      const { data: allLinks, error } = await supabase
        .from('share_links')
        .select('*, spaces!inner(id, name, owner_id)')
        .eq('spaces.owner_id', userId)
        .order('view_count', { ascending: false });

      if (error) {
        console.error('Error fetching analytics:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch analytics' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const totalViews = allLinks?.reduce((sum, l) => sum + (l.view_count || 0), 0) || 0;
      const activeLinks = allLinks?.filter(l => !l.revoked).length || 0;

      // Group by space
      const spaceStats: Record<string, { name: string; views: number; links: number }> = {};
      allLinks?.forEach(l => {
        if (!spaceStats[l.spaces.id]) {
          spaceStats[l.spaces.id] = { name: l.spaces.name, views: 0, links: 0 };
        }
        spaceStats[l.spaces.id].views += l.view_count || 0;
        if (!l.revoked) spaceStats[l.spaces.id].links++;
      });

      return new Response(JSON.stringify({
        analytics: {
          total_views: totalViews,
          total_active_links: activeLinks,
          avg_views_per_link: activeLinks > 0 ? Math.round(totalViews / activeLinks) : 0,
          spaces: Object.entries(spaceStats).map(([id, stats]) => ({
            id,
            name: stats.name,
            total_views: stats.views,
            active_links: stats.links,
          })),
          top_links: allLinks?.slice(0, 10).map(l => ({
            id: l.id,
            name: l.name,
            space_name: l.spaces.name,
            view_count: l.view_count || 0,
            last_used_at: l.last_used_at,
          })) || [],
        }
      }), {
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