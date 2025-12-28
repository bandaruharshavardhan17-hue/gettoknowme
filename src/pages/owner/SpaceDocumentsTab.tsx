import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, FileText, StickyNote, Loader2, Trash2, 
  CheckCircle, XCircle, Clock, Sparkles, File, Image
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
      </div>

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