# Know Me - AI Build Guide

> **Purpose**: This document provides everything an AI needs to understand, rebuild, or extend the Know Me application. It includes complete specifications, patterns, and implementation details.

---

## Quick Reference

| Aspect | Technology | Key File(s) |
|--------|------------|-------------|
| Frontend | React + TypeScript + Vite | `src/App.tsx`, `src/main.tsx` |
| Styling | Tailwind CSS + shadcn/ui | `src/index.css`, `tailwind.config.ts` |
| Database | Supabase (PostgreSQL) | `supabase/migrations/` |
| Auth | Supabase Auth | `src/contexts/AuthContext.tsx` |
| API | Supabase Edge Functions | `supabase/functions/` |
| AI/LLM | OpenAI (GPT-4o-mini/4o) | `supabase/functions/public-chat/` |
| Vector Search | OpenAI Vector Store | `supabase/functions/process-document/` |
| Voice | OpenAI Whisper + TTS | `supabase/functions/voice-to-text/`, `text-to-speech/` |
| Audio UI | WaveformIndicator | `src/components/WaveformIndicator.tsx` |

---

## Application Summary

**Know Me** is a knowledge-grounded Q&A application that allows users to:
1. Create "Spaces" (knowledge containers)
2. Upload documents (PDF, TXT, images) or add notes
3. Choose an AI model per space (gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo)
4. Generate shareable chat links
5. Allow visitors to ask questions answered ONLY from uploaded content

### Core Principle: No Hallucinations
The AI ONLY answers using content from uploaded documents. If no relevant information exists, it returns a configurable fallback message.

---

## Database Schema

### Tables Overview

```
profiles          - User profiles (linked to Supabase Auth)
spaces            - Knowledge containers with AI model selection
documents         - Uploaded files, notes, voice transcripts
document_chunks   - Text chunks for semantic search
share_links       - Public access tokens
chat_messages     - Conversation history with AI model tracking
user_roles        - Admin role assignments
```

### Complete Table Definitions

#### `profiles`
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  tutorial_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `spaces`
```sql
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,  -- AI fallback instructions
  ai_model TEXT DEFAULT 'gpt-4o-mini',  -- OpenAI model selection
  openai_vector_store_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `documents`
```sql
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'pdf', 'txt', 'note', 'image'
  file_path TEXT,
  content_text TEXT,
  status document_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  openai_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE public.document_status AS ENUM ('uploading', 'indexing', 'ready', 'failed');
```

#### `document_chunks`
```sql
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),  -- pgvector extension required
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `share_links`
```sql
CREATE TABLE public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  name TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `chat_messages`
```sql
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  ai_model TEXT,  -- Which model generated the response
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `user_roles`
```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
```

---

## Row Level Security (RLS) Patterns

### Owner-Based Access
```sql
CREATE POLICY "owner_access" ON table_name
FOR ALL USING (auth.uid() = owner_id);
```

### Admin Override
```sql
CREATE POLICY "admin_access" ON table_name
FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

### Related Entity Access
```sql
CREATE POLICY "owner_via_relation" ON child_table
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM parent_table
    WHERE parent_table.id = child_table.parent_id
    AND parent_table.owner_id = auth.uid()
  )
);
```

---

## Edge Functions

### `public-chat` (No Auth Required)
**Purpose**: Handle public Q&A interactions

**Actions**:
- `validate`: Check if share token is valid, increment view count
- `chat`: Stream AI response using space's selected model

**Key Implementation**:
```typescript
// Get space's AI model
const aiModel = shareLink.spaces.ai_model || 'gpt-4o-mini';

// RAG Pipeline
1. Search OpenAI Vector Store for relevant content
2. Fetch document_chunks from database
3. Build system prompt with document context
4. Stream response using Chat Completions API
5. Save messages with ai_model field
```

### `process-document`
**Purpose**: Process uploaded documents for AI search

**Steps**:
1. Read file from storage
2. Extract text (OCR for images using GPT-4 Vision)
3. Create/update OpenAI Vector Store
4. Upload file to Vector Store
5. Create document_chunks for fallback search
6. Update document status to 'ready'

### `voice-to-text`
**Purpose**: Transcribe audio to text using Whisper

**Features**:
- Chunked base64 processing for large audio files
- Support for recordings up to 5 minutes (configurable)
- Memory-efficient processing with 32KB chunk size

**Input**: Base64-encoded audio (WebM/Opus preferred)
**Output**: `{ text: "transcribed text" }`

### `text-to-speech`
**Purpose**: Generate speech from text using OpenAI TTS

**Input**: `{ text: "...", voice: "alloy" }`
**Output**: Binary audio (audio/mpeg)

**Available Voices**: alloy, ash, ballad, coral, echo, sage, shimmer, verse

### `generate-content`
**Purpose**: Generate content for knowledge base using AI

**Input**: `{ prompt: "...", context?: "..." }`
**Output**: `{ title: "...", content: "..." }`

---

## Frontend Architecture

### Key Components

| Component | Purpose |
|-----------|---------|
| `AuthContext` | Manages authentication state |
| `ProtectedRoute` | Guards authenticated routes |
| `AdminRoute` | Guards admin-only routes |
| `SpaceDocumentsTab` | Document management + AI model selection |
| `SpaceChatHistoryTab` | View conversations with AI model badges |
| `SpaceAnalyticsTab` | View stats + AI model usage |
| `PublicChat` | Visitor chat interface |
| `WaveformIndicator` | Audio level visualization during recording |

### Route Structure

```
/                     → Landing page
/login               → Authentication
/owner/spaces        → Owner dashboard (space list)
/owner/spaces/:id    → Space detail (docs, history, analytics)
/owner/analytics     → Overall analytics
/admin               → Admin dashboard
/chat/:token         → Public chat interface
```

### State Management Patterns

1. **React Query** for server state
2. **Context** for auth and impersonation
3. **Local State** for UI state

---

## AI Integration Patterns

### RAG (Retrieval-Augmented Generation)

```typescript
// 1. Create vector store per space
const vectorStore = await openai.vectorStores.create({ name: spaceName });

// 2. Upload documents to vector store
await openai.vectorStores.files.upload(vectorStoreId, fileStream);

// 3. Search on query
const searchResults = await fetch(
  `https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`,
  { body: JSON.stringify({ query, max_num_results: 10 }) }
);

// 4. Build context from results + document_chunks
const context = combineResults(searchResults, chunks);

// 5. Generate response
const response = await openai.chat.completions.create({
  model: aiModel,  // From space.ai_model
  messages: [
    { role: 'system', content: buildSystemPrompt(context, fallback) },
    ...history,
    { role: 'user', content: userMessage }
  ],
  stream: true
});
```

### System Prompt Template

```
You are a helpful AI assistant. Answer questions based ONLY on the following document content:

---DOCUMENTS---
{documentContext}
---END DOCUMENTS---

CRITICAL RULES:
1. Answer ONLY based on the document content above.
2. For personal questions, answer as if YOU are the person described.
3. If info is NOT in documents, say: "{fallbackMessage}"
4. Never make up information.
```

---

## AI Model Configuration

### Available Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `gpt-4o-mini` | Fast & affordable (default) | General Q&A, high volume |
| `gpt-4o` | Most capable | Complex reasoning |
| `gpt-4-turbo` | High performance | Technical content |
| `gpt-3.5-turbo` | Economy | Simple Q&A, cost-sensitive |

### Model Selection Flow

1. Owner selects model in Space → AI Settings section
2. Model saved to `spaces.ai_model` with visual confirmation ("Model saved" indicator)
3. `public-chat` reads model when handling chat
4. Model recorded in `chat_messages.ai_model` for tracking
5. Analytics displays model usage breakdown

**Implementation Note**: Uses `initialModelLoadedRef` to prevent model reset during component re-renders (e.g., voice recording state changes).

---

## Testing

### E2E Test Suite

Run via: `import { runE2ETest } from '@/tests/e2e-flow.test'; runE2ETest();`

**Test Coverage**:
1. Space creation with AI model
2. Document creation with chunks
3. AI model update
4. Voice-to-text API
5. Image processing
6. Text-to-speech API
7. Share link creation
8. Public chat validation
9. Public chat messaging
10. Chat download format
11. Analytics verification
12. Chat history with model tracking
13. Cleanup

---

## Security Checklist

- [ ] RLS enabled on all tables
- [ ] Owner policies prevent cross-user access
- [ ] Admin policies use `has_role()` function
- [ ] `public-chat` uses token validation, not JWT
- [ ] Service role key only in edge functions
- [ ] OPENAI_API_KEY in Supabase secrets
- [ ] Rate limiting on public endpoints

---

## Environment Variables

| Variable | Purpose | Where Set |
|----------|---------|-----------|
| `OPENAI_API_KEY` | OpenAI API access | Supabase secrets |
| `SUPABASE_URL` | Database endpoint | Auto-provided |
| `SUPABASE_ANON_KEY` | Public client key | Auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin access | Supabase secrets |

---

## Common Extensions

| Feature | Implementation |
|---------|----------------|
| Add new AI model | Update `AI_MODELS` in `SpaceDocumentsTab.tsx`, update edge function |
| Add file type | Update `process-document` to handle new type |
| Add auth provider | Configure in Supabase, update `AuthContext` |
| Add team features | Create `team_members` table, update RLS |
| Add subscriptions | Integrate Stripe, add billing tables |

---

*Last Updated: December 2024*
*Version: 2.2*
