import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, Link2, TrendingUp, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LinkAnalytics {
  id: string;
  token: string;
  name: string | null;
  view_count: number;
  last_used_at: string | null;
  created_at: string;
  spaces: {
    id: string;
    name: string;
  };
}

export default function Analytics() {
  const [links, setLinks] = useState<LinkAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalViews, setTotalViews] = useState(0);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) fetchAnalytics();
  }, [user]);

  const fetchAnalytics = async () => {
    if (!user) return;
    
    try {
      // First get user's space IDs
      const { data: userSpaces } = await supabase
        .from('spaces')
        .select('id')
        .eq('owner_id', user.id);
      
      const spaceIds = userSpaces?.map(s => s.id) || [];
      
      if (spaceIds.length === 0) {
        setLinks([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('share_links')
        .select('*, spaces(id, name)')
        .in('space_id', spaceIds)
        .eq('revoked', false)
        .order('view_count', { ascending: false });

      if (error) throw error;
      
      const linksData = data || [];
      setLinks(linksData);
      setTotalViews(linksData.reduce((sum, link) => sum + (link.view_count || 0), 0));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Views</CardDescription>
            <CardTitle className="text-3xl font-display">{totalViews}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Eye className="w-4 h-4 mr-1" />
              Across all links
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Links</CardDescription>
            <CardTitle className="text-3xl font-display">{links.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Link2 className="w-4 h-4 mr-1" />
              Currently active
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Views/Link</CardDescription>
            <CardTitle className="text-3xl font-display">
              {links.length > 0 ? Math.round(totalViews / links.length) : 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4 mr-1" />
              Per active link
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Links table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Link Performance</CardTitle>
          <CardDescription>View counts and last activity for each link</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active links to show analytics for
            </p>
          ) : (
            <div className="space-y-3">
              {links.map((link, index) => (
                <div 
                  key={link.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Link2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{link.name || 'Unnamed Link'}</p>
                      <p className="text-sm text-muted-foreground truncate">{link.spaces.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold">{link.view_count || 0}</p>
                      <p className="text-xs text-muted-foreground">views</p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDate(link.last_used_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
