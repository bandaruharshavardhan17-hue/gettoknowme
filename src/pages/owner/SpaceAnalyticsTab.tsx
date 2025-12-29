import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, Link2, TrendingUp, Clock, Cpu, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LinkAnalytics {
  id: string;
  token: string;
  name: string | null;
  view_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface ModelUsage {
  model: string;
  count: number;
}

interface SpaceAnalyticsTabProps {
  spaceId: string;
}

export default function SpaceAnalyticsTab({ spaceId }: SpaceAnalyticsTabProps) {
  const [links, setLinks] = useState<LinkAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalViews, setTotalViews] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, [spaceId]);

  const fetchAnalytics = async () => {
    try {
      // Fetch share links
      const { data: linksData, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('space_id', spaceId)
        .eq('revoked', false)
        .order('view_count', { ascending: false });

      if (error) throw error;
      
      const links = linksData || [];
      setLinks(links);
      setTotalViews(links.reduce((sum, link) => sum + (link.view_count || 0), 0));

      // Fetch message counts and model usage
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, ai_model')
        .eq('space_id', spaceId);

      if (messages) {
        setTotalMessages(messages.length);
        
        // Calculate model usage from assistant messages
        const modelCounts: Record<string, number> = {};
        messages.forEach(msg => {
          if (msg.role === 'assistant' && msg.ai_model) {
            modelCounts[msg.ai_model] = (modelCounts[msg.ai_model] || 0) + 1;
          }
        });
        
        const usage = Object.entries(modelCounts)
          .map(([model, count]) => ({ model, count }))
          .sort((a, b) => b.count - a.count);
        setModelUsage(usage);
      }
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Views</CardDescription>
            <CardTitle className="text-3xl font-display">{totalViews}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Eye className="w-4 h-4 mr-1" />
              This space
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
              For this space
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Messages</CardDescription>
            <CardTitle className="text-3xl font-display">{totalMessages}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <MessageSquare className="w-4 h-4 mr-1" />
              Chat interactions
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
              Per link
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Model Usage */}
      {modelUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              AI Model Usage
            </CardTitle>
            <CardDescription>Which models are being used for responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {modelUsage.map((usage) => (
                <div 
                  key={usage.model}
                  className="flex items-center gap-2 p-3 rounded-lg bg-muted/50"
                >
                  <Badge variant="secondary" className="font-mono text-xs">
                    {usage.model}
                  </Badge>
                  <span className="text-sm font-medium">{usage.count}</span>
                  <span className="text-xs text-muted-foreground">responses</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Links table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Link Performance</CardTitle>
          <CardDescription>View counts and activity for this space's links</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No links to show analytics for
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
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleDateString()}
                      </p>
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