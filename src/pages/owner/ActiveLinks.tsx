import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Link2, Copy, Loader2, CheckCircle, 
  ExternalLink, LinkIcon, Folder
} from 'lucide-react';

interface ShareLinkWithSpace {
  id: string;
  token: string;
  name: string | null;
  revoked: boolean;
  created_at: string;
  spaces: {
    id: string;
    name: string;
  };
}

export default function ActiveLinks() {
  const [links, setLinks] = useState<ShareLinkWithSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchActiveLinks();
  }, []);

  const fetchActiveLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('share_links')
        .select('*, spaces(id, name)')
        .eq('revoked', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load active links',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (link: ShareLinkWithSpace) => {
    const url = `${window.location.origin}/s/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
    
    toast({
      title: 'Copied!',
      description: 'Link copied to clipboard',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center h-14 px-4 gap-4">
          <Link to="/owner/spaces">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-display font-bold">Active Links</h1>
        </div>
      </header>

      <main className="container px-4 py-8">
        <p className="text-muted-foreground mb-8">
          All your active public chat links across all spaces
        </p>

        {links.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <LinkIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No active links</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-6">
                Create share links from your spaces to let others chat with your knowledge base
              </p>
              <Link to="/owner/spaces">
                <Button className="gradient-primary text-primary-foreground">
                  Go to Spaces
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
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Link2 className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{link.name || 'Unnamed Link'}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success font-medium">
                          Active
                        </span>
                      </div>
                      
                      <Link 
                        to={`/owner/spaces/${link.spaces.id}`}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-1"
                      >
                        <Folder className="w-3 h-3" />
                        {link.spaces.name}
                      </Link>
                      
                      <div className="flex items-center gap-2 mt-3">
                        <Input
                          readOnly
                          value={`${window.location.origin}/s/${link.token}`}
                          className="text-sm bg-muted/50 font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyLink(link)}
                          className="shrink-0"
                        >
                          {copiedId === link.id ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <a
                          href={`/s/${link.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="icon" className="shrink-0">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      </div>

                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(link.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
