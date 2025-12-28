import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Link2, Copy, Trash2, Loader2, Plus, 
  CheckCircle, XCircle, ExternalLink, Share2, QrCode 
} from 'lucide-react';
import { QRCodeDialog } from '@/components/QRCodeDialog';

interface ShareLink {
  id: string;
  token: string;
  name: string | null;
  revoked: boolean;
  created_at: string;
}

interface Space {
  id: string;
  name: string;
}

export default function ShareSpace() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrLink, setQrLink] = useState<ShareLink | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchSpaceAndLinks();
  }, [spaceId]);

  const fetchSpaceAndLinks = async () => {
    try {
      // Fetch space
      const { data: spaceData, error: spaceError } = await supabase
        .from('spaces')
        .select('id, name')
        .eq('id', spaceId)
        .single();

      if (spaceError) throw spaceError;
      setSpace(spaceData);

      // Fetch share links
      const { data: linksData, error: linksError } = await supabase
        .from('share_links')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (linksError) throw linksError;
      setShareLinks(linksData || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load share links',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('share_links')
        .insert({
          space_id: spaceId,
          name: newLinkName.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setShareLinks(prev => [data, ...prev]);
      setNewLinkName('');
      setDialogOpen(false);

      toast({
        title: 'Link created!',
        description: 'Your share link is ready to use',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async (link: ShareLink) => {
    const url = `${window.location.origin}/s/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
    
    toast({
      title: 'Copied!',
      description: 'Link copied to clipboard',
    });
  };

  const handleRevokeLink = async (link: ShareLink) => {
    try {
      const { error } = await supabase
        .from('share_links')
        .update({ revoked: !link.revoked })
        .eq('id', link.id);

      if (error) throw error;

      setShareLinks(prev => 
        prev.map(l => l.id === link.id ? { ...l, revoked: !l.revoked } : l)
      );

      toast({
        title: link.revoked ? 'Link restored' : 'Link revoked',
        description: link.revoked 
          ? 'People can use this link again' 
          : 'People can no longer use this link',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update link',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLink = async (link: ShareLink) => {
    try {
      const { error } = await supabase
        .from('share_links')
        .delete()
        .eq('id', link.id);

      if (error) throw error;

      setShareLinks(prev => prev.filter(l => l.id !== link.id));

      toast({
        title: 'Link deleted',
        description: 'The share link has been removed',
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Space not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center h-16 px-4">
          <Link to={`/owner/spaces/${spaceId}`}>
            <Button variant="ghost" size="icon" className="shrink-0 mr-3">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-display font-bold">Share Links</h1>
            <p className="text-sm text-muted-foreground">{space.name}</p>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-muted-foreground">
              Create public links to let anyone chat with your knowledge base
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                New Link
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Create Share Link</DialogTitle>
                <DialogDescription>
                  Anyone with this link can ask questions about your documents
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="linkName">Link Name (optional)</Label>
                  <Input
                    id="linkName"
                    placeholder="e.g., Public Access"
                    value={newLinkName}
                    onChange={(e) => setNewLinkName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Give this link a name to help you identify it later
                  </p>
                </div>
                <Button 
                  onClick={handleCreateLink} 
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={creating}
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create Link
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Share links list */}
        {shareLinks.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Share2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No share links yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-6">
                Create a share link to let others ask questions about your documents
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Create First Link
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {shareLinks.map((link, index) => (
              <Card 
                key={link.id} 
                className={`animate-fade-in transition-colors ${link.revoked ? 'opacity-60' : 'hover:border-primary/30'}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      link.revoked ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-primary'
                    }`}>
                      <Link2 className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{link.name || 'Unnamed Link'}</p>
                        {link.revoked ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-medium">
                            Revoked
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2">
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
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setQrLink(link);
                            setQrDialogOpen(true);
                          }}
                          className="shrink-0"
                          title="Show QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                        {!link.revoked && (
                          <a
                            href={`/s/${link.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="icon" className="shrink-0">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(link.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeLink(link)}
                        className={link.revoked ? 'text-success' : 'text-destructive'}
                      >
                        {link.revoked ? 'Restore' : 'Revoke'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLink(link)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* QR Code Dialog */}
        {qrLink && (
          <QRCodeDialog
            open={qrDialogOpen}
            onOpenChange={setQrDialogOpen}
            url={`${window.location.origin}/s/${qrLink.token}`}
            title={qrLink.name ? `QR: ${qrLink.name}` : 'Share QR Code'}
          />
        )}
      </main>
    </div>
  );
}
