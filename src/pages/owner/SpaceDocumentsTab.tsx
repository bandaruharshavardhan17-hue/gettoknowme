import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, FileText, StickyNote, Loader2, Trash2, 
  CheckCircle, XCircle, Clock, Sparkles, File, Image,
  PenLine, Link, Copy, ExternalLink, Mic, MicOff, QrCode,
  Eye, Pencil, ChevronDown, ChevronUp, Download, Bot
} from 'lucide-react';
import { QRCodeDialog } from '@/components/QRCodeDialog';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DocumentStatus = 'uploading' | 'indexing' | 'ready' | 'failed';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_path: string | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  content_text: string | null;
}

interface SpaceDocumentsTabProps {
  spaceId: string;
  description: string | null;
  aiModel?: string | null;
}

const AI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast & affordable' },
  { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'High performance' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Economy option' },
];

export default function SpaceDocumentsTab({ spaceId, description, aiModel }: SpaceDocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [aiInstructions, setAiInstructions] = useState(description || '');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // AI model state - use ref to track if initial load is done
  const [selectedModel, setSelectedModel] = useState(aiModel || 'gpt-4o-mini');
  const [savingModel, setSavingModel] = useState(false);
  const initialModelLoadedRef = useRef(false);
  
  // Input tab state
  const [activeInputTab, setActiveInputTab] = useState('upload');
  
  // Note content state (combined paste/type)
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Voice note state
  const [voiceTitle, setVoiceTitle] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [savingVoice, setSavingVoice] = useState(false);
  
  // Share link state
  const [creatingLink, setCreatingLink] = useState(false);
  const [existingLinkToken, setExistingLinkToken] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  
  // QR code dialog state
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  
  // View/Edit document dialog
  const [viewDocDialog, setViewDocDialog] = useState(false);
  const [editDocDialog, setEditDocDialog] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // AI instructions section open state
  const [aiSectionOpen, setAiSectionOpen] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { isRecording, isProcessing, toggleRecording } = useVoiceRecording({
    onTranscript: (text) => {
      setVoiceTranscript(prev => prev ? `${prev} ${text}` : text);
    },
    onError: (error) => {
      toast({
        title: 'Voice Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    fetchDocuments();
    fetchExistingLink();
  }, [spaceId]);

  const fetchExistingLink = async () => {
    try {
      const { data } = await supabase
        .from('share_links')
        .select('token')
        .eq('space_id', spaceId)
        .eq('revoked', false)
        .limit(1)
        .single();

      if (data) {
        setExistingLinkToken(data.token);
      }
    } catch {
      // No existing link
    } finally {
      setLoadingLink(false);
    }
  };

  useEffect(() => {
    setAiInstructions(description || '');
    setInstructionsSaved(false);
  }, [description]);

  // Only sync from prop on initial load, not on subsequent prop changes
  // This prevents the model from resetting when parent re-renders
  useEffect(() => {
    if (!initialModelLoadedRef.current && aiModel) {
      setSelectedModel(aiModel);
      initialModelLoadedRef.current = true;
    }
  }, [aiModel]);

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    setSavingModel(true);
    try {
      const { error } = await supabase
        .from('spaces')
        .update({ ai_model: model })
        .eq('id', spaceId);

      if (error) throw error;
      toast({ title: 'AI model updated', description: `Using ${AI_MODELS.find(m => m.value === model)?.label}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update AI model', variant: 'destructive' });
      setSelectedModel(aiModel || 'gpt-4o-mini');
    } finally {
      setSavingModel(false);
    }
  };

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
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveInstructions(value);
    }, 1000);
  };

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

  const saveNote = async (title: string, content: string) => {
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        space_id: spaceId,
        filename: title.trim(),
        content_text: content.trim(),
        file_type: 'note',
        status: 'ready' as DocumentStatus,
      })
      .select()
      .single();

    if (error) throw error;

    // Create chunks for the content
    const chunkSize = 1000;
    for (let i = 0; i < content.length; i += chunkSize) {
      await supabase.from('document_chunks').insert({
        document_id: doc.id,
        content: content.slice(i, i + chunkSize),
        chunk_index: Math.floor(i / chunkSize),
      });
    }

    return doc;
  };

  const handleNoteSubmit = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      toast({ title: 'Error', description: 'Please enter a title and content', variant: 'destructive' });
      return;
    }

    setSavingNote(true);
    try {
      const doc = await saveNote(noteTitle, noteContent);
      setDocuments(prev => [doc, ...prev]);
      setNoteTitle('');
      setNoteContent('');
      toast({ title: 'Note added', description: `"${doc.filename}" has been added` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save note', variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };


  const handleVoiceSubmit = async () => {
    if (!voiceTitle.trim() || !voiceTranscript.trim()) {
      toast({ title: 'Error', description: 'Please add a title and record audio', variant: 'destructive' });
      return;
    }

    setSavingVoice(true);
    try {
      const doc = await saveNote(voiceTitle, voiceTranscript);
      setDocuments(prev => [doc, ...prev]);
      setVoiceTitle('');
      setVoiceTranscript('');
      toast({ title: 'Voice note added', description: `"${doc.filename}" has been added` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save voice note', variant: 'destructive' });
    } finally {
      setSavingVoice(false);
    }
  };

  const handleEditDocument = async () => {
    if (!selectedDoc || !editTitle.trim()) return;
    
    setSavingEdit(true);
    try {
      const updates: { filename: string; content_text?: string } = { filename: editTitle.trim() };
      if (selectedDoc.file_type === 'note') {
        updates.content_text = editContent.trim();
        
        // Update chunks
        await supabase.from('document_chunks').delete().eq('document_id', selectedDoc.id);
        const chunkSize = 1000;
        for (let i = 0; i < editContent.length; i += chunkSize) {
          await supabase.from('document_chunks').insert({
            document_id: selectedDoc.id,
            content: editContent.slice(i, i + chunkSize),
            chunk_index: Math.floor(i / chunkSize),
          });
        }
      }
      
      const { error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', selectedDoc.id);

      if (error) throw error;

      setDocuments(prev => prev.map(d => 
        d.id === selectedDoc.id 
          ? { ...d, filename: editTitle.trim(), content_text: editContent.trim() || d.content_text }
          : d
      ));
      setEditDocDialog(false);
      toast({ title: 'Document updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update document', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
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
      case 'ready': return 'Ready';
      case 'failed': return 'Failed';
      case 'indexing': return 'Indexing...';
      case 'uploading': return 'Uploading...';
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

      setExistingLinkToken(data.token);
      toast({ title: 'Chat link created!', description: 'Your shareable chat link is ready' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create chat link', variant: 'destructive' });
    } finally {
      setCreatingLink(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/chat/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied!', description: 'Chat link copied to clipboard' });
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
      {/* Chat Link Section */}
      <div className="flex items-center justify-end">
        {loadingLink ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : existingLinkToken ? (
          <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-3 py-2">
            <Link className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-success">Chat Link</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyLink(existingLinkToken)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setQrDialogOpen(true)} title="Show QR Code">
              <QrCode className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openLink(existingLinkToken)}>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button onClick={handleCreateChatLink} disabled={creatingLink} className="bg-success hover:bg-success/90 text-success-foreground">
            {creatingLink ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link className="w-4 h-4 mr-2" />}
            Create Chat Link
          </Button>
        )}
      </div>

      {/* Add Content Section with Tabs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Add Knowledge</CardTitle>
          <CardDescription>Choose how you want to add information to your knowledge base</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeInputTab} onValueChange={setActiveInputTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="upload" className="text-xs sm:text-sm">
                <Upload className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Upload</span>
              </TabsTrigger>
              <TabsTrigger value="note" className="text-xs sm:text-sm">
                <PenLine className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Note</span>
              </TabsTrigger>
              <TabsTrigger value="voice" className="text-xs sm:text-sm">
                <Mic className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Voice</span>
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload" className="mt-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <div 
                className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium mb-1">Click to upload files</p>
                <p className="text-sm text-muted-foreground">PDF, TXT, PNG, JPG, WEBP, GIF</p>
                {uploading && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Uploading...</span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Note Tab (combined paste/type) */}
            <TabsContent value="note" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g., Company FAQ, Contact Info" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea placeholder="Type or paste your content here..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={6} />
              </div>
              <Button onClick={handleNoteSubmit} disabled={savingNote || !noteTitle.trim() || !noteContent.trim()} className="w-full gradient-primary text-primary-foreground">
                {savingNote && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Note
              </Button>
            </TabsContent>

            {/* Voice Tab */}
            <TabsContent value="voice" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g., Meeting Notes" value={voiceTitle} onChange={(e) => setVoiceTitle(e.target.value)} />
              </div>
              <div className="flex flex-col items-center gap-4 py-6">
                <button
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isRecording 
                      ? 'bg-destructive text-destructive-foreground animate-pulse' 
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <p className="text-sm text-muted-foreground">
                  {isProcessing ? 'Transcribing...' : isRecording ? 'Recording... Click to stop' : 'Click to record'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Transcript</Label>
                <Textarea placeholder="Transcribed text will appear here..." value={voiceTranscript} onChange={(e) => setVoiceTranscript(e.target.value)} rows={4} />
              </div>
              <Button onClick={handleVoiceSubmit} disabled={savingVoice || !voiceTitle.trim() || !voiceTranscript.trim()} className="w-full gradient-primary text-primary-foreground">
                {savingVoice && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Voice Note
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* AI Settings (Collapsible) */}
      <Collapsible open={aiSectionOpen} onOpenChange={setAiSectionOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base font-display">AI Settings</CardTitle>
                </div>
                {aiSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
              <CardDescription className="text-left">
                Configure the AI model and fallback response
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {/* AI Model Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  AI Model
                </Label>
                <Select value={selectedModel} onValueChange={handleModelChange} disabled={savingModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{model.label}</span>
                          <span className="text-muted-foreground text-xs">- {model.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {savingModel && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Updating model...</span>
                  </div>
                )}
              </div>

              {/* AI Fallback Response */}
              <div className="space-y-2">
                <Label>Fallback Response</Label>
                <Textarea
                  placeholder="e.g., I'm sorry, I don't have information about that. Please contact us at support@company.com for more help."
                  value={aiInstructions}
                  onChange={(e) => handleInstructionsChange(e.target.value)}
                  rows={3}
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
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Documents List */}
      <div className="space-y-3">
        <h3 className="text-lg font-display font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Your Documents ({documents.length})
        </h3>
        
        {documents.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                Use the tabs above to add your first document
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <Card 
                key={doc.id} 
                className="animate-fade-in hover:border-primary/30 transition-colors"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    doc.file_type === 'note' 
                      ? 'bg-warning/20 text-warning' 
                      : doc.file_type === 'image'
                      ? 'bg-accent/20 text-accent-foreground'
                      : 'bg-primary/20 text-primary'
                  }`}>
                    {getFileIcon(doc.file_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{doc.filename}</p>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(doc.status)}
                      <span className="text-xs text-muted-foreground">{getStatusText(doc.status)}</span>
                      {doc.error_message && (
                        <span className="text-xs text-destructive truncate">- {doc.error_message}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* View button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        setSelectedDoc(doc);
                        setFilePreviewUrl(null);
                        setViewDocDialog(true);
                        
                        // If it's a file (PDF/image), get the signed URL
                        if (doc.file_path && (doc.file_type === 'pdf' || doc.file_type === 'image')) {
                          setLoadingPreview(true);
                          try {
                            const { data } = await supabase.storage
                              .from('documents')
                              .createSignedUrl(doc.file_path, 3600); // 1 hour expiry
                            if (data?.signedUrl) {
                              setFilePreviewUrl(data.signedUrl);
                            }
                          } catch (error) {
                            console.error('Failed to get preview URL:', error);
                          } finally {
                            setLoadingPreview(false);
                          }
                        }
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    
                    {/* Edit button (only for notes) */}
                    {doc.file_type === 'note' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setEditTitle(doc.filename);
                          setEditContent(doc.content_text || '');
                          setEditDocDialog(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    
                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteDocument(doc)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* View Document Dialog */}
      <Dialog open={viewDocDialog} onOpenChange={(open) => {
        setViewDocDialog(open);
        if (!open) {
          setFilePreviewUrl(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {selectedDoc && getFileIcon(selectedDoc.file_type)}
              {selectedDoc?.filename}
            </DialogTitle>
            <DialogDescription>
              {selectedDoc?.file_type === 'note' ? 'Text content' : `${selectedDoc?.file_type.toUpperCase()} file`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {loadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading preview...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Show original image/PDF preview for uploaded files */}
                {selectedDoc?.file_type === 'image' && filePreviewUrl && (
                  <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                    <img 
                      src={filePreviewUrl} 
                      alt={selectedDoc.filename}
                      className="max-w-full max-h-[30vh] object-contain rounded-lg border"
                    />
                  </div>
                )}
                
                {selectedDoc?.file_type === 'pdf' && filePreviewUrl && (
                  <div className="text-center py-4 bg-muted/30 rounded-lg">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      PDF document - use buttons below to view
                    </p>
                  </div>
                )}

                {/* Show extracted text for all file types */}
                {selectedDoc?.content_text ? (
                  <div>
                    {(selectedDoc.file_type === 'image' || selectedDoc.file_type === 'pdf') && (
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Extracted Text (AI-indexed content):
                      </p>
                    )}
                    <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm">
                      {selectedDoc.content_text}
                    </div>
                  </div>
                ) : selectedDoc?.file_type !== 'image' && selectedDoc?.file_type !== 'pdf' && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      No content available
                    </p>
                  </div>
                )}

                {/* Show message if no extracted text for image/PDF */}
                {!selectedDoc?.content_text && (selectedDoc?.file_type === 'image' || selectedDoc?.file_type === 'pdf') && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      No text was extracted from this file
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          
          {/* Action buttons for files */}
          {selectedDoc?.file_path && (
            <div className="flex justify-center gap-3 pt-2 border-t">
              <Button
                variant="outline"
                onClick={async () => {
                  if (selectedDoc?.file_path) {
                    const { data } = await supabase.storage
                      .from('documents')
                      .createSignedUrl(selectedDoc.file_path, 3600);
                    if (data?.signedUrl) {
                      window.open(data.signedUrl, '_blank');
                    }
                  }
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in new tab
              </Button>
              <Button
                variant="default"
                className="gradient-primary text-primary-foreground"
                onClick={async () => {
                  if (selectedDoc?.file_path) {
                    const { data } = await supabase.storage
                      .from('documents')
                      .download(selectedDoc.file_path);
                    if (data) {
                      const url = URL.createObjectURL(data);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = selectedDoc.filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast({ title: 'Download started', description: selectedDoc.filename });
                    }
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={editDocDialog} onOpenChange={setEditDocDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDocDialog(false)}>Cancel</Button>
              <Button onClick={handleEditDocument} disabled={savingEdit} className="gradient-primary text-primary-foreground">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      {existingLinkToken && (
        <QRCodeDialog
          open={qrDialogOpen}
          onOpenChange={setQrDialogOpen}
          url={`${window.location.origin}/chat/${existingLinkToken}`}
          title="Share Chat Link"
        />
      )}
    </div>
  );
}
