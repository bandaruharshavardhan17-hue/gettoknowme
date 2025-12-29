/**
 * useDocuments Hook
 * 
 * Manages document state and operations for a space.
 * Includes polling for processing status updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { documentsService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DOCUMENT } from '@/constants';
import type { Document, CreateNotePayload } from '@/types';

interface UseDocumentsOptions {
  spaceId: string;
}

interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  uploading: boolean;
  refresh: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
  createNote: (title: string, content: string) => Promise<Document | null>;
  updateDocument: (id: string, title: string, content?: string) => Promise<boolean>;
  deleteDocument: (doc: Document) => Promise<boolean>;
}

export function useDocuments({ spaceId }: UseDocumentsOptions): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch documents
  const refresh = useCallback(async () => {
    try {
      const data = await documentsService.getBySpaceId(spaceId);
      setDocuments(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [spaceId, toast]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll for status updates on processing documents
  useEffect(() => {
    const hasProcessing = documents.some(
      d => d.status === 'indexing' || d.status === 'uploading'
    );
    if (!hasProcessing) return;

    const interval = setInterval(refresh, DOCUMENT.STATUS_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  // Upload files
  const uploadFiles = useCallback(async (files: FileList) => {
    if (!user) return;
    
    setUploading(true);
    
    for (const file of Array.from(files)) {
      try {
        const doc = await documentsService.uploadFile(file, spaceId, user.id);
        setDocuments(prev => [doc, ...prev]);
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
  }, [spaceId, user, toast]);

  // Create a note
  const createNote = useCallback(async (
    title: string, 
    content: string
  ): Promise<Document | null> => {
    try {
      const doc = await documentsService.createNote({ 
        space_id: spaceId, 
        title, 
        content 
      });
      setDocuments(prev => [doc, ...prev]);
      toast({
        title: 'Content added',
        description: `"${doc.filename}" has been added`,
      });
      return doc;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save content',
        variant: 'destructive',
      });
      return null;
    }
  }, [spaceId, toast]);

  // Update a document
  const updateDocument = useCallback(async (
    id: string, 
    title: string, 
    content?: string
  ): Promise<boolean> => {
    try {
      await documentsService.update(id, title, content);
      setDocuments(prev => prev.map(d => 
        d.id === id 
          ? { ...d, filename: title, content_text: content ?? d.content_text }
          : d
      ));
      toast({ title: 'Document updated' });
      return true;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update document',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Delete a document
  const deleteDocument = useCallback(async (doc: Document): Promise<boolean> => {
    try {
      await documentsService.delete(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({
        title: 'Document deleted',
        description: `"${doc.filename}" has been removed`,
      });
      return true;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  return {
    documents,
    loading,
    uploading,
    refresh,
    uploadFiles,
    createNote,
    updateDocument,
    deleteDocument,
  };
}
