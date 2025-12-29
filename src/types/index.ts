/**
 * Know Me - Core Type Definitions
 * 
 * This file contains all shared TypeScript types used across the application.
 * Keep types organized by domain (Space, Document, Chat, User, etc.)
 */

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

/**
 * Document processing status
 * - uploading: File is being uploaded to storage
 * - indexing: File is being processed for AI search
 * - ready: Document is ready for Q&A
 * - failed: Processing failed (check error_message)
 */
export type DocumentStatus = 'uploading' | 'indexing' | 'ready' | 'failed';

/**
 * Supported file types for document uploads
 */
export type DocumentFileType = 'pdf' | 'txt' | 'note' | 'image';

/**
 * Document entity - represents uploaded files, notes, and voice transcripts
 */
export interface Document {
  id: string;
  space_id: string;
  filename: string;
  file_type: DocumentFileType | string;
  file_path: string | null;
  content_text: string | null;
  status: DocumentStatus;
  error_message: string | null;
  openai_file_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for creating a new document (note type)
 */
export interface CreateNotePayload {
  space_id: string;
  title: string;
  content: string;
}

// =============================================================================
// SPACE TYPES
// =============================================================================

/**
 * Available AI models for chat responses
 */
export type AIModel = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4-turbo' | 'gpt-3.5-turbo';

/**
 * Space entity - a knowledge container that holds documents
 */
export interface Space {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  ai_model: AIModel | string | null;
  openai_vector_store_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for creating a new space
 */
export interface CreateSpacePayload {
  name: string;
  description?: string;
  ai_model?: AIModel;
}

/**
 * Payload for updating a space
 */
export interface UpdateSpacePayload {
  name?: string;
  description?: string;
  ai_model?: AIModel;
}

// =============================================================================
// SHARE LINK TYPES
// =============================================================================

/**
 * Share link entity - public access token for a space
 */
export interface ShareLink {
  id: string;
  space_id: string;
  token: string;
  name: string | null;
  revoked: boolean;
  view_count: number;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Payload for creating a share link
 */
export interface CreateShareLinkPayload {
  space_id: string;
  name?: string;
}

// =============================================================================
// CHAT TYPES
// =============================================================================

/**
 * Chat message roles
 */
export type ChatRole = 'user' | 'assistant';

/**
 * Chat message entity
 */
export interface ChatMessage {
  id: string;
  space_id: string;
  share_link_id: string;
  role: ChatRole;
  content: string;
  ai_model?: string | null;
  created_at: string;
}

/**
 * Message format for AI chat API
 */
export interface AIChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Public chat validation response
 */
export interface ChatValidationResponse {
  valid: boolean;
  space?: {
    name: string;
    description: string | null;
  };
  error?: string;
}

// =============================================================================
// USER TYPES
// =============================================================================

/**
 * User roles in the system
 */
export type AppRole = 'admin' | 'user';

/**
 * User profile entity
 */
export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tutorial_completed: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

/**
 * Space analytics summary
 */
export interface SpaceAnalytics {
  total_views: number;
  total_messages: number;
  active_links: number;
  documents_count: number;
}

/**
 * Overall analytics summary
 */
export interface OverallAnalytics {
  total_spaces: number;
  total_documents: number;
  total_views: number;
  total_messages: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
