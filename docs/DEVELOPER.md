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
│   ├── WaveformIndicator.tsx  # Audio level visualization during recording
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
- `spaces` - Knowledge containers (includes `ai_model` for per-space model selection)
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

### Testing Voice Recording

1. Navigate to a space → Voice tab or use Public Chat
2. Click the microphone button to start recording
3. **Visual Feedback**: Waveform indicator shows audio levels in real-time
4. **Duration Display**: Recording time shown next to waveform
5. Speak clearly for 1-2 seconds minimum
6. Click again to stop and transcribe
7. Review transcript before saving

**Features**:
- Visual waveform indicator during recording
- Recording duration display (up to 5 minutes max)
- Chunked processing for longer recordings
- Auto-stop at maximum duration

**Troubleshooting Voice Issues:**
- Ensure browser has microphone permissions
- Speak for at least 1 second (short recordings may fail)
- Check console logs for debug output (`Using mime type:`, `Audio blob size:`)
- Verify OPENAI_API_KEY is configured
- Large recordings (>25MB) are processed in chunks automatically

### Running E2E Tests

Navigate to `/owner/test` in the app to run comprehensive tests:

1. **Create Space** - Creates a test space
2. **Create Document (Note)** - Adds test content
3. **Voice-to-Text API** - Verifies Whisper endpoint
4. **Image Processing** - Checks image OCR capability
5. **Create Share Link** - Generates shareable token
6. **Public Chat - Validate** - Tests link validation
7. **Public Chat - Message** - Tests AI response
8. **Verify Analytics** - Checks view counts
9. **Cleanup** - Removes all test data

### Adding Admin Users

```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('user-uuid-here', 'admin');
```

## Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `useCallback` and `useMemo` for performance
- Store callback refs to avoid dependency issues in hooks
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

## Key Implementation Notes

### Voice Recording Hook

The `useVoiceRecording` hook provides advanced audio recording with visual feedback:

**Features**:
- Real-time audio level monitoring for waveform visualization
- Chunked processing for large audio files (up to 5 minutes)
- Recording duration tracking with auto-stop at max duration
- Memory-efficient base64 processing

```typescript
const { 
  isRecording, 
  isProcessing, 
  audioLevel,        // 0-1 normalized audio level for waveform
  recordingDuration, // Current recording duration in ms
  toggleRecording 
} = useVoiceRecording({
  onTranscript: (text) => setInput(text),
  onError: (error) => toast({ title: 'Error', description: error }),
  maxDurationMs: 5 * 60 * 1000, // 5 minutes max
});
```

**Implementation Details**:
- Uses callback refs to avoid React hooks dependency issues
- AudioContext and AnalyserNode for real-time audio level monitoring
- RequestAnimationFrame for smooth waveform updates
- Automatic cleanup on unmount

### Waveform Indicator Component

The `WaveformIndicator` component visualizes audio levels during recording:

```typescript
<WaveformIndicator 
  audioLevel={audioLevel}  // 0-1 normalized value
  isRecording={isRecording}
  className="optional-class"
/>
```

Features:
- 5-bar equalizer-style visualization
- Smooth transitions with CSS transitions
- Color changes based on recording state (destructive when recording)

### Add Knowledge UI

The "Add Knowledge" section uses a 3-tab layout:
- **Upload** - File uploads (PDF, TXT, images)
- **Note** - Combined paste/type content entry
- **Voice** - Voice recording with transcription

Note: "Paste" and "Type" were consolidated into a single "Note" tab as they served identical functionality.

### AI Settings Section

Each space has an "AI Settings" section that allows:
- **Model Selection** - Choose from GPT-4o-mini (default), GPT-4o, GPT-4 Turbo, or GPT-3.5 Turbo
- **Visual Save Confirmation** - Shows "Model saved" indicator when successfully updated
- **Fallback Response** - Custom message when AI doesn't find an answer

The selected model is stored in `spaces.ai_model` and used by `public-chat` edge function.

**Implementation Note**: The component uses `initialModelLoadedRef` to prevent the AI model from resetting when the parent component re-renders (e.g., during voice recording state changes).

### Public Chat Features

The visitor chat interface (`PublicChat.tsx`) includes:
- **Save Chat** - Download conversation as a text file
- **Close Chat** - Closes with optional download prompt
- **Voice Input** - Microphone recording with waveform visualization and duration display
- **Text-to-Speech** - Listen to AI responses
- **Auto-read** - Toggle automatic TTS for AI responses

---

*Last updated: December 2024*
