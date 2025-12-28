import { useState, useEffect, useRef } from 'react';
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
  ClipboardPaste, MessageSquarePlus, Send, Bot
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
  
  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Chat dialog state
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedTitle, setGeneratedTitle] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, [spaceId]);

  useEffect(() => {
    setAiInstructions(description || '');
  }, [description]);

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

  const handleSaveInstructions = async () => {
    setSavingInstructions(true);
    try {
      const { error } = await supabase
        .from('spaces')
        .update({ description: aiInstructions.trim() || null })
        .eq('id', spaceId);

      if (error) throw error;
      
      toast({
        title: 'Instructions saved',
        description: 'AI behavior has been updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save instructions',
        variant: 'destructive',
      });
    } finally {
      setSavingInstructions(false);
    }
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

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await supabase.functions.invoke('generate-content', {
        body: { 
          prompt: userMessage,
          context: chatMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        },
      });

      if (response.error) throw response.error;

      const { content, title } = response.data;
      setChatMessages(prev => [...prev, { role: 'assistant', content }]);
      setGeneratedContent(content);
      setGeneratedTitle(title || 'Generated Content');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate content. Please try again.',
        variant: 'destructive',
      });
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveGeneratedContent = async () => {
    if (!generatedContent.trim()) return;

    setSavingNote(true);
    try {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          space_id: spaceId,
          filename: generatedTitle || 'AI Generated Content',
          content_text: generatedContent.trim(),
          file_type: 'note',
          status: 'ready' as DocumentStatus,
        })
        .select()
        .single();

      if (error) throw error;

      // Create chunks
      const chunkSize = 1000;
      const chunks = [];
      for (let i = 0; i < generatedContent.length; i += chunkSize) {
        chunks.push(generatedContent.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        await supabase.from('document_chunks').insert({
          document_id: doc.id,
          content: chunks[i],
          chunk_index: i,
        });
      }

      setDocuments(prev => [doc, ...prev]);
      setChatDialogOpen(false);
      setChatMessages([]);
      setGeneratedContent('');
      setGeneratedTitle('');

      toast({
        title: 'Content saved',
        description: `"${doc.filename}" has been added to your knowledge base`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save content',
        variant: 'destructive',
      });
    } finally {
      setSavingNote(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
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
          onClick={() => setChatDialogOpen(true)}
        >
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          Add via Chat
        </Button>
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

      {/* Chat Dialog */}
      <Dialog open={chatDialogOpen} onOpenChange={(open) => {
        setChatDialogOpen(open);
        if (!open) {
          setChatMessages([]);
          setGeneratedContent('');
          setGeneratedTitle('');
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Generate Content with AI
            </DialogTitle>
            <DialogDescription>
              Chat with AI to generate content for your knowledge base
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col h-[400px]">
            <ScrollArea className="flex-1 pr-4 mb-4">
              <div className="space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Start a conversation to generate content</p>
                    <p className="text-sm mt-1">Try: "Write a FAQ about product returns"</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="flex gap-2">
              <Input
                placeholder="Describe the content you want to generate..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
                disabled={chatLoading}
              />
              <Button onClick={handleChatSubmit} disabled={chatLoading || !chatInput.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
            
            {generatedContent && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Input
                      value={generatedTitle}
                      onChange={(e) => setGeneratedTitle(e.target.value)}
                      placeholder="Content title"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button 
                    onClick={handleSaveGeneratedContent}
                    disabled={savingNote}
                    size="sm"
                    className="gradient-primary text-primary-foreground"
                  >
                    {savingNote && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save to Knowledge Base
                  </Button>
                </div>
              </div>
            )}
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
            onChange={(e) => setAiInstructions(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <Button 
            onClick={handleSaveInstructions}
            disabled={savingInstructions}
            size="sm"
          >
            {savingInstructions && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Instructions
          </Button>
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