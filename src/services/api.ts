/**
 * Know Me - API Service Layer
 * 
 * Centralized API functions with consistent error handling.
 * All Supabase interactions should go through these services.
 */

import { supabase } from '@/integrations/supabase/client';
import type { 
  Space, 
  Document, 
  ShareLink, 
  ChatMessage,
  CreateNotePayload,
  CreateSpacePayload,
  UpdateSpacePayload,
  DocumentStatus 
} from '@/types';
import { DOCUMENT } from '@/constants';

// =============================================================================
// SPACES SERVICE
// =============================================================================

export const spacesService = {
  /**
   * Get all spaces for the current user
   */
  async getAll(): Promise<Space[]> {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Get a single space by ID
   */
  async getById(id: string): Promise<Space | null> {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Create a new space
   */
  async create(payload: CreateSpacePayload & { owner_id: string }): Promise<Space> {
    const { data, error } = await supabase
      .from('spaces')
      .insert(payload)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Update an existing space
   */
  async update(id: string, payload: UpdateSpacePayload): Promise<Space> {
    const { data, error } = await supabase
      .from('spaces')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Delete a space and all related data
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('spaces')
      .delete()
      .eq('id', id);
    
    if (error) throw new Error(error.message);
  },
};

// =============================================================================
// DOCUMENTS SERVICE
// =============================================================================

export const documentsService = {
  /**
   * Get all documents for a space
   */
  async getBySpaceId(spaceId: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return (data || []) as Document[];
  },

  /**
   * Create a text note document
   */
  async createNote({ space_id, title, content }: CreateNotePayload): Promise<Document> {
    // Create the document
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        space_id,
        filename: title.trim(),
        content_text: content.trim(),
        file_type: 'note',
        status: 'ready' as DocumentStatus,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Create chunks for search
    await this.createChunks(doc.id, content);

    return doc as Document;
  },

  /**
   * Create document chunks for AI search
   */
  async createChunks(documentId: string, content: string): Promise<void> {
    const chunks = [];
    for (let i = 0; i < content.length; i += DOCUMENT.CHUNK_SIZE) {
      chunks.push({
        document_id: documentId,
        content: content.slice(i, i + DOCUMENT.CHUNK_SIZE),
        chunk_index: Math.floor(i / DOCUMENT.CHUNK_SIZE),
      });
    }

    if (chunks.length > 0) {
      const { error } = await supabase.from('document_chunks').insert(chunks);
      if (error) throw new Error(error.message);
    }
  },

  /**
   * Update a document (notes only)
   */
  async update(id: string, title: string, content?: string): Promise<void> {
    const updates: { filename: string; content_text?: string } = { 
      filename: title.trim() 
    };
    
    if (content !== undefined) {
      updates.content_text = content.trim();
      
      // Recreate chunks
      await supabase.from('document_chunks').delete().eq('document_id', id);
      await this.createChunks(id, content);
    }
    
    const { error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /**
   * Delete a document
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);
    
    if (error) throw new Error(error.message);
  },

  /**
   * Upload a file and create document record
   */
  async uploadFile(
    file: File, 
    spaceId: string, 
    userId: string
  ): Promise<Document> {
    const filePath = `${userId}/${spaceId}/${Date.now()}-${file.name}`;
    const fileType = this.getFileType(file.name);

    // Create document record
    const { data: doc, error: docError } = await supabase
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

    if (docError) throw new Error(docError.message);

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) {
      // Cleanup document record on upload failure
      await supabase.from('documents').delete().eq('id', doc.id);
      throw new Error(uploadError.message);
    }

    // Update status and trigger processing
    await supabase
      .from('documents')
      .update({ status: 'indexing' as DocumentStatus })
      .eq('id', doc.id);

    // Trigger background processing
    supabase.functions.invoke('process-document', {
      body: { documentId: doc.id }
    }).catch(console.error);

    return { ...doc, status: 'indexing' } as Document;
  },

  /**
   * Determine file type from extension
   */
  getFileType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'txt') return 'txt';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    return 'txt';
  },
};

// =============================================================================
// SHARE LINKS SERVICE
// =============================================================================

export const shareLinksService = {
  /**
   * Get the active share link for a space
   */
  async getBySpaceId(spaceId: string): Promise<ShareLink | null> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('space_id', spaceId)
      .eq('revoked', false)
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    return data as ShareLink | null;
  },

  /**
   * Create a new share link
   */
  async create(spaceId: string, name?: string): Promise<ShareLink> {
    const { data, error } = await supabase
      .from('share_links')
      .insert({
        space_id: spaceId,
        name: name || 'Chat Link',
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return data as ShareLink;
  },

  /**
   * Revoke a share link
   */
  async revoke(id: string): Promise<void> {
    const { error } = await supabase
      .from('share_links')
      .update({ revoked: true })
      .eq('id', id);
    
    if (error) throw new Error(error.message);
  },
};

// =============================================================================
// CHAT SERVICE
// =============================================================================

export const chatService = {
  /**
   * Get chat messages for a share link
   */
  async getMessages(shareLinkId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('share_link_id', shareLinkId)
      .order('created_at', { ascending: true });
    
    if (error) throw new Error(error.message);
    return (data || []) as ChatMessage[];
  },

  /**
   * Validate a share token and get space info
   */
  async validateToken(token: string): Promise<{
    valid: boolean;
    space?: { name: string; description: string | null };
    shareLinkId?: string;
  }> {
    const response = await supabase.functions.invoke('public-chat', {
      body: { token, action: 'validate' },
    });

    if (response.error) throw new Error(response.error.message);
    return response.data;
  },
};

// =============================================================================
// PROFILE SERVICE
// =============================================================================

export const profileService = {
  /**
   * Get current user's profile
   */
  async getCurrent(): Promise<{ tutorial_completed: boolean } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('profiles')
      .select('tutorial_completed')
      .eq('id', user.id)
      .single();
    
    return data;
  },

  /**
   * Mark tutorial as completed
   */
  async completeTutorial(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ tutorial_completed: true })
      .eq('id', userId);
    
    if (error) throw new Error(error.message);
  },
};
