import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, FolderOpen, Loader2, LogOut, Sparkles, FileText, Share2 } from 'lucide-react';

interface Space {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  document_count?: number;
}

export default function Spaces() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: '', description: '' });
  
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchSpaces();
  }, []);

  const fetchSpaces = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select(`
          *,
          documents(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const spacesWithCount = data?.map(space => ({
        ...space,
        document_count: space.documents?.[0]?.count || 0
      })) || [];

      setSpaces(spacesWithCount);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load spaces',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSpace = async () => {
    if (!newSpace.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a space name',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('spaces')
        .insert({
          name: newSpace.name.trim(),
          description: newSpace.description.trim() || null,
          owner_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      setSpaces([{ ...data, document_count: 0 }, ...spaces]);
      setNewSpace({ name: '', description: '' });
      setDialogOpen(false);
      
      toast({
        title: 'Space created!',
        description: `"${data.name}" is ready for your documents`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create space',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-display font-bold gradient-text">Know Me</h1>
          </div>
          
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Your Spaces</h2>
            <p className="text-muted-foreground mt-1">
              Create knowledge spaces and share them with anyone
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4 mr-2" />
                New Space
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Create New Space</DialogTitle>
                <DialogDescription>
                  A space is a collection of documents that people can ask questions about
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Space Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Product Knowledge Base"
                    value={newSpace.name}
                    onChange={(e) => setNewSpace({ ...newSpace, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="What is this space about?"
                    value={newSpace.description}
                    onChange={(e) => setNewSpace({ ...newSpace, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={handleCreateSpace} 
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={creating}
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create Space
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Spaces grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : spaces.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No spaces yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-6">
                Create your first space to start building your knowledge base
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Space
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space, index) => (
              <Link key={space.id} to={`/owner/spaces/${space.id}`}>
                <Card 
                  className="h-full hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer group animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <FolderOpen className="w-6 h-6 text-primary" />
                      </div>
                      <Share2 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardTitle className="text-lg font-display mt-3 group-hover:text-primary transition-colors">
                      {space.name}
                    </CardTitle>
                    {space.description && (
                      <CardDescription className="line-clamp-2">
                        {space.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-4 h-4" />
                      <span>{space.document_count} document{space.document_count !== 1 ? 's' : ''}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
