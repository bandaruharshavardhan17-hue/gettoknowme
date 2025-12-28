import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Link2, Copy, ExternalLink, Loader2, Plus, Eye, Clock } from 'lucide-react';

interface ShareLink {
  id: string;
  token: string;
  name: string | null;
  view_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface SpaceLinksTabProps {
  spaceId: string;
}

export default function SpaceLinksTab({ spaceId }: SpaceLinksTabProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLinks();
  }, [spaceId]);

  const fetchLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('space_id', spaceId)
        .eq('revoked', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load links',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/chat/${token}`;
    await navigator.clipboard.writeText(url);
    toast({
      title: 'Copied!',
      description: 'Link copied to clipboard',
    });
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link to={`/owner/spaces/${spaceId}/share`}>
          <Button size="sm" className="gradient-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            New Link
          </Button>
        </Link>
      </div>

      {links.length === 0 ? (
        <Card className="border-dashed border-2 border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Link2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No share links yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              Create a share link to let others chat with your knowledge base
            </p>
            <Link to={`/owner/spaces/${spaceId}/share`}>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Create Share Link
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link, index) => (
            <Card 
              key={link.id}
              className="animate-fade-in hover:border-primary/30 transition-colors"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Link2 className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{link.name || 'Unnamed Link'}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {link.view_count || 0} views
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(link.last_used_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyLink(link.token)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(`/chat/${link.token}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}