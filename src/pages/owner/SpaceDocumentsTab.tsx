import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, FileText, StickyNote, Loader2, Trash2, 
  CheckCircle, XCircle, Clock, Sparkles, File, Image,
  ClipboardPaste, PenLine, Link, Copy, ExternalLink
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface SpaceDocumentsTabProps {
  spaceId: string;
  description: string | null;
}

export default function SpaceDocumentsTab({ spaceId, description }: SpaceDocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [aiInstructions, setAiInstructions] = useState(description || '');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Quick add dialog state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddContent, setQuickAddContent] = useState('');
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  
  // Share link state
  const [creatingLink, setCreatingLink] = useState(false);
  const [newLinkToken, setNewLinkToken] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, [spaceId]);

  useEffect(() => {
    setAiInstructions(description || '');
    setInstructionsSaved(false);
  }, [description]);

  // Auto-save AI instructions with debounce
  const saveInstructions = useCallback(async (instructions: string) => {
    setSavingInstructions(true);
    setInstructionsSaved(false);
    try {
      const { error } = await supabase
        .from('spaces')
        .update({ description: instructions.trim() || null })
        .eq('id', spaceId);

      if (error) throw error;
      setInstructionsSaved(true);
      
      // Hide the saved indicator after 2 seconds
      setTimeout(() => setInstructionsSaved(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save instructions',
        variant: 'destructive',
      });
    } finally {
      setSavingInstructions(false);
    }
  }, [spaceId, toast]);

  const handleInstructionsChange = (value: string) => {
    setAiInstructions(value);
    setInstructionsSaved(false);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save (1 second debounce)
    saveTimeoutRef.current = setTimeout(() => {
      saveInstructions(value);
    }, 1000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Poll for status updates on documents that are still processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'indexing' || d.status === 'uploading');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });
      
      if (data) setDocuments(data);
    }, 2000);

    return () => clearInterval(interval);
  }, [documents, spaceId]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getFileType = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'txt') return 'txt';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    return 'txt';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    for (const file of Array.from(files)) {
      const fileType = getFileType(file.name);
      const filePath = `${user?.id}/${spaceId}/${Date.now()}-${file.name}`;

      try {
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

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        await supabase
          .from('documents')
          .update({ status: 'indexing' as DocumentStatus })
          .eq('id', docData.id);

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

  const handleDeleteDocument = async (doc: Document) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

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

  const handleSaveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a title and content',
        variant: 'destructive',
      });
      return;
    }

    setSavingNote(true);
    try {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          space_id: spaceId,
          filename: noteTitle.trim(),
          content_text: noteContent.trim(),
          file_type: 'note',
          status: 'ready' as DocumentStatus,
        })
        .select()
        .single();

      if (error) throw error;

      // Create chunks for the content
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < noteContent.length; i += chunkSize) {
        chunks.push(noteContent.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        await supabase.from('document_chunks').insert({
          document_id: doc.id,
          content: chunks[i],
          chunk_index: i,
        });
      }

      setDocuments(prev => [doc, ...prev]);
      setNoteTitle('');
      setNoteContent('');
      setNoteDialogOpen(false);

      toast({
        title: 'Note added',
        description: `"${doc.filename}" has been added to your knowledge base`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save note',
        variant: 'destructive',
      });
    } finally {
      setSavingNote(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddTitle.trim() || !quickAddContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a title and content',
        variant: 'destructive',
      });
      return;
    }

    setSavingQuickAdd(true);
    try {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          space_id: spaceId,
          filename: quickAddTitle.trim(),
          content_text: quickAddContent.trim(),
          file_type: 'note',
          status: 'ready' as DocumentStatus,
        })
        .select()
        .single();

      if (error) throw error;

      // Create chunks for the content
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < quickAddContent.length; i += chunkSize) {
        chunks.push(quickAddContent.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        await supabase.from('document_chunks').insert({
          document_id: doc.id,
          content: chunks[i],
          chunk_index: i,
        });
      }

      setDocuments(prev => [doc, ...prev]);
      setQuickAddTitle('');
      setQuickAddContent('');
      setQuickAddOpen(false);

      toast({
        title: 'Info added',
        description: `"${doc.filename}" has been added to your knowledge base`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save info',
        variant: 'destructive',
      });
    } finally {
      setSavingQuickAdd(false);
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
    if (fileType === 'image') return <Image className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const handleCreateChatLink = async () => {
    setCreatingLink(true);
    try {
      const { data, error } = await supabase
        .from('share_links')
        .insert({
          space_id: spaceId,
          name: 'Chat Link',
        })
        .select()
        .single();

      if (error) throw error;

      setNewLinkToken(data.token);
      toast({
        title: 'Chat link created!',
        description: 'Your shareable chat link is ready',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create chat link',
        variant: 'destructive',
      });
    } finally {
      setCreatingLink(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/chat/${token}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copied!',
      description: 'Chat link copied to clipboard',
    });
  };

  const openLink = (token: string) => {
    window.open(`${window.location.origin}/chat/${token}`, '_blank');
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
      {/* Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif"
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
            Upload Files
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => setNoteDialogOpen(true)}
          >
            <ClipboardPaste className="w-4 h-4 mr-2" />
            Paste Content
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => setQuickAddOpen(true)}
          >
            <PenLine className="w-4 h-4 mr-2" />
            Quick Add Info
          </Button>
        </div>

        {/* Create Chat Link Button */}
        {newLinkToken ? (
          <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-3 py-2">
            <Link className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-success">Link Created!</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => copyLink(newLinkToken)}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => openLink(newLinkToken)}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleCreateChatLink}
            disabled={creatingLink}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {creatingLink ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Link className="w-4 h-4 mr-2" />
            )}
            Create Chat Link
          </Button>
        )}
      </div>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5" />
              Add Note
            </DialogTitle>
            <DialogDescription>
              Paste or type content to add to your knowledge base
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                placeholder="e.g., Company FAQ"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                placeholder="Paste or type your content here..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={10}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveNote} 
                disabled={savingNote || !noteTitle.trim() || !noteContent.trim()}
                className="gradient-primary text-primary-foreground"
              >
                {savingNote && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Note
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <PenLine className="w-5 h-5" />
              Quick Add Info
            </DialogTitle>
            <DialogDescription>
              Type or paste information to add to your knowledge base
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="quick-title">Title</Label>
              <Input
                id="quick-title"
                placeholder="e.g., Contact Info, About Us"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-content">Information</Label>
              <Textarea
                id="quick-content"
                placeholder="Type your information here..."
                value={quickAddContent}
                onChange={(e) => setQuickAddContent(e.target.value)}
                rows={8}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleQuickAdd} 
                disabled={savingQuickAdd || !quickAddTitle.trim() || !quickAddContent.trim()}
                className="gradient-primary text-primary-foreground"
              >
                {savingQuickAdd && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Info
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Instructions
          </CardTitle>
          <CardDescription>
            Tell the AI what to say and what not to say when answering questions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g., Only answer questions about our products. Don't discuss competitors. Always be friendly and professional. If unsure, say 'I don't know'..."
            value={aiInstructions}
            onChange={(e) => handleInstructionsChange(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground h-5">
            {savingInstructions && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {instructionsSaved && !savingInstructions && (
              <>
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-green-600">Saved</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents list */}
      {documents.length === 0 ? (
        <Card className="border-dashed border-2 border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              Upload PDFs, images, TXT files, or add notes to build your knowledge base
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
                    : doc.file_type === 'image'
                    ? 'bg-accent/20 text-accent-foreground'
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
    </div>
  );
}