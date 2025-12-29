# Know Me - Developer Guide

> A knowledge-based Q&A application built with React, Supabase, and OpenAI.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                │
│  React + TypeScript + Vite + Tailwind CSS + shadcn/ui               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   src/                                                               │
│   ├── components/     UI components (shadcn + custom)                │
│   ├── contexts/       React Context providers (Auth, Impersonation) │
│   ├── hooks/          Custom hooks (useDocuments, useSpace, etc.)   │
│   ├── services/       API service layer (api.ts)                    │
│   ├── types/          TypeScript type definitions                   │
│   ├── constants/      App configuration and constants               │
│   └── pages/          Route components                              │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                              BACKEND                                 │
│  Supabase (Database + Auth + Storage + Edge Functions)              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   supabase/functions/                                                │
│   ├── api-spaces/        Space CRUD operations                       │
│   ├── api-documents/     Document management                         │
│   ├── api-links/         Share link management                       │
│   ├── api-analytics/     Usage analytics                             │
│   ├── api-admin/         Admin operations                            │
│   ├── public-chat/       Public Q&A endpoint (no auth)              │
│   ├── process-document/  AI document indexing                        │
│   ├── voice-to-text/     Whisper transcription                       │
│   └── text-to-speech/    OpenAI TTS                                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui components (don't edit directly)
│   ├── QRCodeDialog.tsx       # QR code display component
│   ├── ProtectedRoute.tsx     # Auth guard wrapper
│   ├── AdminRoute.tsx         # Admin-only route guard
│   └── ProfileDropdown.tsx    # User menu component
│
├── constants/
│   └── index.ts               # App-wide constants (API, routes, messages)
│
├── contexts/
│   ├── AuthContext.tsx        # Authentication state provider
│   └── ImpersonationContext.tsx
│
├── hooks/
│   ├── index.ts               # Hook exports
│   ├── useDocuments.ts        # Document CRUD + status polling
│   ├── useSpace.ts            # Single space management
│   ├── useShareLink.ts        # Share link management
│   ├── useAutoSave.ts         # Debounced auto-save
│   ├── useClipboard.ts        # Clipboard operations
│   ├── useVoiceRecording.ts   # Voice input
│   ├── useTextToSpeech.ts     # TTS playback
│   └── use-toast.ts           # Toast notifications
│
├── services/
│   └── api.ts                 # Centralized API service functions
│
├── types/
│   └── index.ts               # TypeScript type definitions
│
└── pages/
    ├── Login.tsx              # Auth page
    ├── PublicChat.tsx         # Visitor chat interface
    ├── owner/
    │   ├── OwnerDashboard.tsx # Main owner dashboard
    │   ├── Spaces.tsx         # Spaces list (redirects to dashboard)
    │   ├── SpaceDetail.tsx    # Single space view
    │   ├── SpaceDocumentsTab.tsx
    │   ├── SpaceChatHistoryTab.tsx
    │   └── SpaceAnalyticsTab.tsx
    └── admin/
        ├── AdminDashboard.tsx
        ├── AdminUsersTab.tsx
        ├── AdminSpacesTab.tsx
        └── AdminChatsTab.tsx
```

## Key Patterns

### 1. Service Layer Pattern

All API calls go through the service layer (`src/services/api.ts`):

```typescript
import { spacesService, documentsService } from '@/services/api';

// Good: Use service functions
const spaces = await spacesService.getAll();
const doc = await documentsService.createNote({ space_id, title, content });

// Bad: Direct Supabase calls in components
const { data } = await supabase.from('spaces').select('*');
```

### 2. Custom Hooks for State Management

Use domain-specific hooks for complex state:

```typescript
import { useDocuments, useShareLink } from '@/hooks';

function MyComponent({ spaceId }) {
  const { documents, loading, createNote, deleteDocument } = useDocuments({ spaceId });
  const { shareLink, create: createLink, getShareUrl } = useShareLink({ spaceId });
  
  // Component logic using hook data/functions
}
```

### 3. Type Safety

Always use types from `src/types/index.ts`:

```typescript
import type { Document, Space, ShareLink, DocumentStatus } from '@/types';

// Good: Typed function parameters
function processDocument(doc: Document): void { ... }

// Bad: Using 'any' or inline types
function processDocument(doc: any): void { ... }
```

### 4. Constants Over Magic Values

Use constants from `src/constants/index.ts`:

```typescript
import { API, FILE_UPLOAD, ROUTES, ERRORS } from '@/constants';

// Good: Use constants
const endpoint = API.ENDPOINTS.SPACES;
const maxSize = FILE_UPLOAD.MAX_SIZE;

// Bad: Magic strings/numbers
const endpoint = 'api-spaces';
const maxSize = 10485760;
```

## Adding New Features

### Adding a New Page

1. Create the page component in `src/pages/`
2. Add the route in `src/App.tsx`
3. Add route constant to `src/constants/index.ts`
4. Wrap with `ProtectedRoute` if auth required

### Adding a New API Endpoint

1. Create Edge Function in `supabase/functions/`
2. Add endpoint constant to `src/constants/index.ts`
3. Add service function to `src/services/api.ts`
4. Create custom hook if needed in `src/hooks/`

### Adding a New Type

1. Add type definition to `src/types/index.ts`
2. Export from the file
3. Import where needed: `import type { NewType } from '@/types'`

## Database Schema

See `docs/ARCHITECTURE.md` for complete schema documentation.

Key tables:
- `profiles` - User profile data
- `spaces` - Knowledge containers
- `documents` - Files and notes
- `document_chunks` - Text chunks with embeddings
- `share_links` - Public access tokens
- `chat_messages` - Conversation history

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=xxx
```

Edge Function secrets (configured in Supabase):
```
OPENAI_API_KEY=sk-...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Common Tasks

### Debugging Document Processing

1. Check document status in UI (Ready/Failed/Indexing)
2. View Edge Function logs: `supabase functions logs process-document`
3. Check `error_message` field in documents table
4. Verify file exists in storage bucket

### Document Preview Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| PDF shows "blocked by browser" | Chrome security | Use "Open in new tab" or Download |
| Image not loading | Signed URL expired | Refresh page to get new URL |
| "No preview available" | Unsupported file type | Use Download button |

### Testing Public Chat

1. Create a space with documents
2. Get the share link from Documents tab
3. Open the chat URL in incognito window

### Testing Document Uploads

Supported file types:
- **PDF**: `.pdf` - Indexed for AI search, viewable via download
- **Text**: `.txt` - Inline preview available
- **Images**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` - Inline preview + OCR extraction
- **Screenshots**: Same as images, OCR extracts visible text

### Adding Admin Users

```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('user-uuid-here', 'admin');
```

## Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `useCallback` and `useMemo` for performance
- Follow shadcn/ui patterns for new components
- Use semantic color tokens from design system

## Testing

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build (catches build errors)
npm run build
```

## Deployment

The app auto-deploys on push. Edge Functions deploy automatically when changes are detected.

For manual deployment:
```bash
# Deploy Edge Functions
supabase functions deploy

# Build frontend
npm run build
```
