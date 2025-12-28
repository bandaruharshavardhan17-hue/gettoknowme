import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Upload, FileText, StickyNote, Loader2, Trash2, 
  CheckCircle, XCircle, Clock, Share2, Sparkles, File
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type DocumentStatus = 'uploading' | 'indexing' | 'ready' | 'failed';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  content_text: string | null;
}

interface Space {
  id: string;
  name: string;
  description: string | null;
}

export default function SpaceDetail() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [creatingNote, setCreatingNote] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchSpaceAndDocuments();
  }, [spaceId]);

  const fetchSpaceAndDocuments = async () => {
    try {
      // Fetch space
      const { data: spaceData, error: spaceError } = await supabase
        .from('spaces')
        .select('*')
        .eq('id', spaceId)
        .single();

      if (spaceError) throw spaceError;
      setSpace(spaceData);

      // Fetch documents
      const { data: docsData, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;
      setDocuments(docsData || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load space',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    for (const file of Array.from(files)) {
      const fileType = file.name.endsWith('.pdf') ? 'pdf' : 'txt';
      const filePath = `${user?.id}/${spaceId}/${Date.now()}-${file.name}`;

      try {
        // Create document record
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .insert({
            space_id: spaceId,
            filename: file.name,
            file_type: fileType,
            file_path: filePath,
            status: 'uploading' as DocumentStatus,
          })
          .select()
          .single();

        if (docError) throw docError;

        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Update status to indexing
        await supabase
          .from('documents')
          .update({ status: 'indexing' as DocumentStatus })
          .eq('id', docData.id);

        // Trigger processing via edge function
        supabase.functions.invoke('process-document', {
          body: { documentId: docData.id }
        }).catch(console.error);

        setDocuments(prev => [{ ...docData, status: 'indexing' as DocumentStatus }, ...prev]);

        toast({
          title: 'File uploaded',
          description: `"${file.name}" is being processed`,
        });
      } catch (error) {
        toast({
          title: 'Upload failed',
          description: `Failed to upload "${file.name}"`,
          variant: 'destructive',
        });
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateNote = async () => {
    if (!newNote.title.trim() || !newNote.content.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both title and content',
        variant: 'destructive',
      });
      return;
    }

    setCreatingNote(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          space_id: spaceId,
          filename: newNote.title.trim(),
          file_type: 'note',
          content_text: newNote.content.trim(),
          status: 'indexing' as DocumentStatus,
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger processing
      supabase.functions.invoke('process-document', {
        body: { documentId: data.id }
      }).catch(console.error);

      setDocuments(prev => [data, ...prev]);
      setNewNote({ title: '', content: '' });
      setNoteDialogOpen(false);

      toast({
        title: 'Note added',
        description: 'Your note is being indexed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create note',
        variant: 'destructive',
      });
    } finally {
      setCreatingNote(false);
    }
  };

  const handleDeleteDocument = async (doc: Document) => {
    try {
      // Delete from database
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      // Delete file from storage if it exists
      if (doc.file_type !== 'note') {
        const filePath = `${user?.id}/${spaceId}/${doc.id}`;
        await supabase.storage.from('documents').remove([filePath]).catch(() => {});
      }

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      
      toast({
        title: 'Document deleted',
        description: `"${doc.filename}" has been removed`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'indexing':
      case 'uploading':
        return <Clock className="w-4 h-4 text-warning animate-pulse" />;
    }
  };

  const getStatusText = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'indexing':
        return 'Indexing...';
      case 'uploading':
        return 'Uploading...';
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'note') return <StickyNote className="w-5 h-5" />;
    if (fileType === 'pdf') return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
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
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Link to="/owner/spaces">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold truncate">{space.name}</h1>
              {space.description && (
                <p className="text-sm text-muted-foreground truncate">{space.description}</p>
              )}
            </div>
          </div>
          
          <Link to={`/owner/spaces/${spaceId}/share`}>
            <Button variant="outline" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </Link>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gradient-primary text-primary-foreground"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload PDF/TXT
          </Button>
          
          <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <StickyNote className="w-4 h-4 mr-2" />
                Add Note
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Add a Note</DialogTitle>
                <DialogDescription>
                  Add text content directly to your knowledge base
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="noteTitle">Title</Label>
                  <Input
                    id="noteTitle"
                    placeholder="Note title"
                    value={newNote.title}
                    onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="noteContent">Content</Label>
                  <Textarea
                    id="noteContent"
                    placeholder="Write your note content here..."
                    value={newNote.content}
                    onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                    rows={6}
                  />
                </div>
                <Button 
                  onClick={handleCreateNote} 
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={creatingNote}
                >
                  {creatingNote && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Add Note
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Documents list */}
        {documents.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-6">
                Upload PDFs, TXT files, or add notes to build your knowledge base
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {documents.map((doc, index) => (
              <Card 
                key={doc.id} 
                className="animate-fade-in hover:border-primary/30 transition-colors"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    doc.file_type === 'note' 
                      ? 'bg-warning/20 text-warning' 
                      : 'bg-primary/20 text-primary'
                  }`}>
                    {getFileIcon(doc.file_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(doc.status)}
                      <span className="text-sm text-muted-foreground">
                        {getStatusText(doc.status)}
                      </span>
                      {doc.error_message && (
                        <span className="text-sm text-destructive truncate">
                          - {doc.error_message}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteDocument(doc)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
