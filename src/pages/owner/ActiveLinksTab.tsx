import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  Link2, Copy, Loader2, CheckCircle, 
  ExternalLink, LinkIcon, Folder, Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ShareLinkWithSpace {
  id: string;
  token: string;
  name: string | null;
  revoked: boolean;
  created_at: string;
  view_count: number;
  spaces: {
    id: string;
    name: string;
  };
}

export default function ActiveLinksTab() {
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

  const handleDeleteLink = async (link: ShareLinkWithSpace) => {
    try {
      const { error } = await supabase
        .from('share_links')
        .delete()
        .eq('id', link.id);

      if (error) throw error;

      setLinks(links.filter(l => l.id !== link.id));
      
      toast({
        title: 'Link deleted',
        description: 'Share link has been removed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete link',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold">Active Links</h2>
        <p className="text-muted-foreground mt-1">
          All your active public chat links across all spaces
        </p>
      </div>

      {links.length === 0 ? (
        <Card className="border-dashed border-2 border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <LinkIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No active links</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Create share links from your spaces to let others chat with your knowledge base
            </p>
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
                      <span className="text-xs text-muted-foreground">
                        {link.view_count || 0} views
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this share link. Anyone with this link will no longer be able to access the chat.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteLink(link)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
