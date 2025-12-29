/**
 * Know Me - Application Constants
 * 
 * Centralized configuration values and constants.
 * Avoid magic numbers and strings scattered throughout the codebase.
 */

// =============================================================================
// API CONFIGURATION
// =============================================================================

export const API = {
  /** Base URL for Supabase functions */
  FUNCTIONS_URL: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`,
  
  /** Edge function endpoints */
  ENDPOINTS: {
    SPACES: 'api-spaces',
    DOCUMENTS: 'api-documents',
    LINKS: 'api-links',
    ANALYTICS: 'api-analytics',
    ADMIN: 'api-admin',
    PUBLIC_CHAT: 'public-chat',
    PROCESS_DOCUMENT: 'process-document',
    VOICE_TO_TEXT: 'voice-to-text',
    TEXT_TO_SPEECH: 'text-to-speech',
  },
} as const;

// =============================================================================
// FILE UPLOAD CONFIGURATION
// =============================================================================

export const FILE_UPLOAD = {
  /** Accepted file types for document upload */
  ACCEPTED_TYPES: '.pdf,.txt,.png,.jpg,.jpeg,.webp,.gif',
  
  /** Accepted MIME types */
  MIME_TYPES: {
    PDF: 'application/pdf',
    TXT: 'text/plain',
    PNG: 'image/png',
    JPG: 'image/jpeg',
    WEBP: 'image/webp',
    GIF: 'image/gif',
  },
  
  /** Maximum file size in bytes (10MB) */
  MAX_SIZE: 10 * 1024 * 1024,
  
  /** Image extensions for type detection */
  IMAGE_EXTENSIONS: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
} as const;

// =============================================================================
// DOCUMENT PROCESSING
// =============================================================================

export const DOCUMENT = {
  /** Chunk size for text splitting (characters) */
  CHUNK_SIZE: 1000,
  
  /** Polling interval for status updates (ms) */
  STATUS_POLL_INTERVAL: 2000,
  
  /** File types that can be edited */
  EDITABLE_TYPES: ['note'],
} as const;

// =============================================================================
// CHAT CONFIGURATION
// =============================================================================

export const CHAT = {
  /** Maximum messages to include in context */
  MAX_HISTORY_LENGTH: 50,
  
  /** Default TTS voice */
  DEFAULT_VOICE: 'alloy',
  
  /** Available TTS voices */
  VOICES: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'],
} as const;

// =============================================================================
// UI CONFIGURATION
// =============================================================================

export const UI = {
  /** Animation delays for staggered lists (ms) */
  STAGGER_DELAY: 30,
  
  /** Debounce delay for auto-save (ms) */
  AUTOSAVE_DEBOUNCE: 1000,
  
  /** Toast display duration (ms) */
  TOAST_DURATION: 3000,
  
  /** "Saved" indicator display time (ms) */
  SAVED_INDICATOR_DURATION: 2000,
} as const;

// =============================================================================
// ROUTES
// =============================================================================

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  OWNER: {
    DASHBOARD: '/owner',
    SPACES: '/owner/spaces',
    SPACE_DETAIL: (id: string) => `/owner/spaces/${id}`,
    SHARE_SPACE: (id: string) => `/owner/spaces/${id}/share`,
  },
  ADMIN: {
    DASHBOARD: '/admin',
  },
  PUBLIC: {
    CHAT: (token: string) => `/chat/${token}`,
    LEGACY_CHAT: (token: string) => `/s/${token}`,
  },
} as const;

// =============================================================================
// LOCAL STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  THEME: 'theme',
  TUTORIAL_COMPLETED: 'tutorial_completed',
} as const;

// =============================================================================
// ERROR MESSAGES
// =============================================================================

export const ERRORS = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  UPLOAD_FAILED: 'Failed to upload file.',
  SAVE_FAILED: 'Failed to save changes.',
  DELETE_FAILED: 'Failed to delete.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  AI_ERROR: 'AI service error. Please try again.',
} as const;

// =============================================================================
// SUCCESS MESSAGES
// =============================================================================

export const SUCCESS = {
  SAVED: 'Changes saved successfully.',
  DELETED: 'Deleted successfully.',
  UPLOADED: 'File uploaded successfully.',
  COPIED: 'Copied to clipboard.',
  LINK_CREATED: 'Share link created.',
} as const;
