# Know Me - Architecture Documentation

> **Purpose**: A knowledge-based Q&A app where owners upload documents, share links, and visitors ask questions answered by AI using only the uploaded content.

---

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Database Schema](#database-schema)
4. [Edge Functions (APIs)](#edge-functions-apis)
5. [AI Integration](#ai-integration)
6. [Authentication Flow](#authentication-flow)
7. [Code Flow](#code-flow)
8. [Security Model](#security-model)
9. [File Structure](#file-structure)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         KNOW ME ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐    │
│  │   OWNER     │     │   VISITOR   │     │      ADMIN          │    │
│  │  (Auth'd)   │     │  (Public)   │     │   (Auth'd+Role)     │    │
│  └──────┬──────┘     └──────┬──────┘     └──────────┬──────────┘    │
│         │                   │                       │                │
│         ▼                   ▼                       ▼                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    REACT FRONTEND (Vite)                     │    │
│  │  • OwnerDashboard • PublicChat • SpaceDetail • AdminPanel   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   SUPABASE EDGE FUNCTIONS                    │    │
│  │  • api-spaces    • api-documents   • api-links              │    │
│  │  • api-analytics • api-admin       • public-chat            │    │
│  │  • process-document                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐       │
│  │  SUPABASE   │     │  SUPABASE   │     │    OPENAI       │       │
│  │  DATABASE   │     │  STORAGE    │     │  Vector Store   │       │
│  │  (Postgres) │     │  (Files)    │     │  + Chat API     │       │
│  └─────────────┘     └─────────────┘     └─────────────────┘       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite + TypeScript | SPA with fast HMR |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first CSS with component library |
| **State** | TanStack Query (React Query) | Server state management & caching |
| **Routing** | React Router v6 | Client-side routing |
| **Backend** | Supabase Edge Functions (Deno) | Serverless API endpoints |
| **Database** | PostgreSQL (Supabase) | Primary data store with RLS |
| **Auth** | Supabase Auth | Email/password authentication |
| **Storage** | Supabase Storage | File storage for documents |
| **AI** | OpenAI API | GPT-4o-mini + Vector Store for RAG |
| **Validation** | Zod | Schema validation |

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     profiles     │       │      spaces      │       │    documents     │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK, FK→auth) │◄──────│ owner_id (FK)    │──────►│ space_id (FK)    │
│ email            │       │ id (PK)          │       │ id (PK)          │
│ display_name     │       │ name             │       │ filename         │
│ avatar_url       │       │ description      │       │ content_text     │
│ tutorial_completed│      │ openai_vector_id │       │ file_path        │
│ created_at       │       │ created_at       │       │ file_type        │
│ updated_at       │       │ updated_at       │       │ status           │
└──────────────────┘       └────────┬─────────┘       │ openai_file_id   │
                                    │                 │ error_message    │
                                    │                 │ created_at       │
                                    ▼                 └────────┬─────────┘
                           ┌──────────────────┐                │
                           │   share_links    │                ▼
                           ├──────────────────┤       ┌──────────────────┐
                           │ id (PK)          │       │ document_chunks  │
                           │ space_id (FK)    │       ├──────────────────┤
                           │ token (unique)   │       │ id (PK)          │
                           │ name             │       │ document_id (FK) │
                           │ revoked          │       │ content          │
                           │ view_count       │       │ chunk_index      │
                           │ last_used_at     │       │ embedding        │
                           │ created_at       │       │ created_at       │
                           └────────┬─────────┘       └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐       ┌──────────────────┐
                           │  chat_messages   │       │    user_roles    │
                           ├──────────────────┤       ├──────────────────┤
                           │ id (PK)          │       │ id (PK)          │
                           │ share_link_id(FK)│       │ user_id (FK)     │
                           │ space_id (FK)    │       │ role (enum)      │
                           │ role             │       │ created_at       │
                           │ content          │       └──────────────────┘
                           │ created_at       │
                           └──────────────────┘
```

### Table Details

#### `profiles`
User profile data synced from auth on signup.
```sql
id: uuid (PK, references auth.users)
email: text
display_name: text
avatar_url: text
tutorial_completed: boolean (default: false)
created_at: timestamptz
updated_at: timestamptz
```

#### `spaces`
Knowledge containers that hold documents.
```sql
id: uuid (PK)
owner_id: uuid (FK → profiles.id)
name: text (required)
description: text (optional, used as AI fallback response)
openai_vector_store_id: text (created on first document upload)
created_at: timestamptz
updated_at: timestamptz
```

#### `documents`
Files/notes uploaded to a space.
```sql
id: uuid (PK)
space_id: uuid (FK → spaces.id)
filename: text (required)
content_text: text (extracted text content)
file_path: text (storage path for PDFs/images)
file_type: text ('pdf', 'txt', 'note', 'image')
status: enum ('uploading', 'indexing', 'ready', 'failed')
openai_file_id: text (OpenAI file reference)
error_message: text
created_at: timestamptz
updated_at: timestamptz
```

#### `document_chunks`
Text chunks for semantic search.
```sql
id: uuid (PK)
document_id: uuid (FK → documents.id)
content: text
chunk_index: integer
embedding: vector(1536) (pgvector)
created_at: timestamptz
```

#### `share_links`
Public access tokens for spaces.
```sql
id: uuid (PK)
space_id: uuid (FK → spaces.id)
token: text (unique, auto-generated hex)
name: text (optional label)
revoked: boolean (default: false)
view_count: integer (default: 0)
last_used_at: timestamptz
created_at: timestamptz
```

#### `chat_messages`
Conversation history per share link.
```sql
id: uuid (PK)
share_link_id: uuid (FK → share_links.id)
space_id: uuid (FK → spaces.id)
role: text ('user' | 'assistant')
content: text
created_at: timestamptz
```

#### `user_roles`
Admin role assignment.
```sql
id: uuid (PK)
user_id: uuid (references auth.users)
role: enum ('admin', 'user')
created_at: timestamptz
```

### Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: Creates profile on auth signup |
| `create_default_share_link()` | Trigger: Creates share link when space created |
| `has_role(user_id, role)` | Helper: Check if user has specific role |
| `match_document_chunks()` | Vector similarity search for RAG |
| `update_updated_at_column()` | Trigger: Auto-update timestamps |

---

## Edge Functions (APIs)

### Public API (No Auth)

#### `public-chat`
Public Q&A endpoint for visitors.

```typescript
POST /functions/v1/public-chat
Body: { token, action, message?, history? }

Actions:
- 'validate': Validate token, return space info, increment view_count
- 'chat': Send message, get AI response (streaming SSE)

Response (validate): { valid: true, space: { name, description } }
Response (chat): SSE stream with OpenAI chunks
```

### Authenticated APIs (Bearer Token)

All require `Authorization: Bearer <supabase_access_token>`

#### `api-spaces`
CRUD operations for spaces.

```typescript
GET    ?id=<uuid>           → Get single space
GET                         → List all user's spaces
POST   { name, description } → Create space
PUT    ?id=<uuid> { name }  → Update space
DELETE ?id=<uuid>           → Delete space + related data
```

#### `api-documents`
Manage documents within spaces.

```typescript
GET    ?space_id=<uuid>     → List documents in space
GET    ?id=<uuid>           → Get single document
POST   { space_id, filename, content } → Create text document
DELETE ?id=<uuid>           → Delete document + chunks
```

#### `api-links`
Manage share links.

```typescript
GET    ?space_id=<uuid>     → List links for space
GET    ?id=<uuid>           → Get single link
POST   { space_id, name }   → Create link
PUT    ?id=<uuid> { revoked, name } → Update link
DELETE ?id=<uuid>           → Delete link
```

#### `api-analytics`
View usage statistics.

```typescript
GET                         → Overall analytics (all spaces)
GET    ?space_id=<uuid>     → Space-specific analytics
GET    ?link_id=<uuid>      → Link-specific analytics

Response: { total_views, active_links, spaces[], top_links[] }
```

#### `api-admin`
Admin-only operations.

```typescript
GET    ?resource=users      → List all users
GET    ?resource=spaces     → List all spaces (all owners)
GET    ?resource=chats      → List all chat messages
GET    ?resource=analytics  → Platform-wide analytics
POST   ?action=impersonate  → Impersonate user (returns temp session)
POST   ?action=assign_role  → Assign admin role
```

### Background Processing

#### `process-document`
Processes uploaded files for AI indexing.

```typescript
POST { documentId }

Flow:
1. Get document from DB
2. Create/get vector store for space
3. Download file from storage (or use content_text for notes)
4. For images: Use GPT-4 Vision to extract text
5. Upload file to OpenAI
6. Add to vector store
7. Update document status to 'ready'
```

---

## AI Integration

### Vector Store Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPENAI VECTOR STORES                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Space A                    Space B                    Space C       │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────┐  │
│  │ Vector Store  │         │ Vector Store  │         │   None    │  │
│  │ vs_abc123     │         │ vs_def456     │         │  (no docs)│  │
│  ├───────────────┤         ├───────────────┤         └───────────┘  │
│  │ file_1.pdf    │         │ resume.pdf    │                        │
│  │ file_2.txt    │         │ notes.txt     │                        │
│  │ note_1.txt    │         └───────────────┘                        │
│  └───────────────┘                                                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Chat Flow (RAG Pipeline)

```
User Question
      │
      ▼
┌─────────────────┐
│ 1. Validate     │ ← Check token is valid & not revoked
│    Token        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Get Context  │ ← Query OpenAI Vector Store
│    from Docs    │ ← Also fetch from document_chunks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Build System │ ← Inject document context
│    Prompt       │ ← Set "only use documents" rule
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Call GPT-4o  │ ← Stream response via SSE
│    -mini        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Save to      │ ← Store in chat_messages
│    History      │
└────────┬────────┘
         │
         ▼
   AI Response
```

### AI Models Used

| Model | Use Case | Location |
|-------|----------|----------|
| `gpt-4o-mini` | Chat completions | `public-chat` |
| `gpt-4o-mini` (Vision) | Image text extraction | `process-document` |
| OpenAI Vector Store | Document embedding & search | `process-document`, `public-chat` |

### Prompt Engineering

**System Prompt Template:**
```
You are a helpful AI assistant. Answer questions based ONLY on the following document content:

---DOCUMENTS---
{extracted_content}
---END DOCUMENTS---

CRITICAL RULES:
1. Answer ONLY based on the document content above.
2. For personal questions, find info in docs and answer as if YOU are that person.
3. If info is NOT in documents, say: "{owner_fallback_message}"
4. Never make up information not in the documents.
```

**No Hallucination Guarantee**: If no relevant content found → "I don't know from the provided documents."

---

## Authentication Flow

### Signup Flow

```
┌─────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────────┐
│  User   │───►│ Login Page   │───►│ Supabase   │───►│ handle_new_ │
│ Signup  │    │ (Form)       │    │ Auth       │    │ user()      │
└─────────┘    └──────────────┘    └────────────┘    └──────┬──────┘
                                                            │
                                         Creates profile ◄──┘
                                         with display_name
```

### Session Management

```typescript
// AuthContext.tsx
const { user, session, signIn, signUp, signOut } = useAuth();

// Access token for API calls
const token = session?.access_token;

// API call pattern
fetch('/functions/v1/api-spaces', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Role-Based Access

```typescript
// Check admin status
const { isAdmin } = useIsAdmin();  // Queries user_roles table

// Protect admin routes
<AdminRoute><AdminDashboard /></AdminRoute>

// RLS Policy example
CREATE POLICY "Admins can view all"
ON spaces FOR SELECT
USING (has_role(auth.uid(), 'admin'));
```

---

## Code Flow

### Owner Creates Space → Uploads Document → Shares

```
1. Create Space
   OwnerDashboard → SpacesTab → "New Space" dialog
   → supabase.from('spaces').insert()
   → Trigger: create_default_share_link() auto-creates link

2. Upload Document
   SpaceDetail → SpaceDocumentsTab → Upload/Note button
   → Upload to supabase.storage.from('documents')
   → Insert to documents table (status: 'uploading')
   → Call process-document edge function
   → OpenAI: Create vector store (if first doc)
   → OpenAI: Upload file & add to vector store
   → Update status to 'ready'

3. Share Link
   SpaceDetail → SpaceLinksTab → Copy link button
   → Link format: /chat/{token}
   → Share with visitors
```

### Visitor Asks Question

```
1. Access Link
   PublicChat receives token from URL
   → Call public-chat?action=validate
   → Increment view_count, return space info

2. Send Message
   Type question → Call public-chat?action=chat
   → Validate token (not revoked)
   → Search vector store for relevant chunks
   → Build context from documents
   → Stream GPT response back
   → Save both messages to chat_messages

3. Continue Conversation
   Previous messages passed as 'history'
   → Context maintained for follow-ups
```

---

## Security Model

### Row Level Security (RLS) Policies

| Table | Policy | Rule |
|-------|--------|------|
| `profiles` | View own | `auth.uid() = id` |
| `profiles` | Admin view all | `has_role(auth.uid(), 'admin')` |
| `spaces` | Owner CRUD | `auth.uid() = owner_id` |
| `spaces` | Admin view | `has_role(auth.uid(), 'admin')` |
| `documents` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `share_links` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `chat_messages` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `chat_messages` | Service insert | `true` (for edge functions) |
| `user_roles` | Admin only | `has_role(auth.uid(), 'admin')` |

### Storage Policies

| Bucket | Policy |
|--------|--------|
| `documents` | Private - owner access only via RLS |
| `avatars` | Public read, owner write |

### API Security

- **Authenticated endpoints**: Validate Bearer token via `supabase.auth.getUser()`
- **Public chat**: Token-based access (no auth required)
- **Admin endpoints**: Check `has_role(userId, 'admin')` after auth
- **Service role**: Edge functions use service role key for DB operations

---

## File Structure

```
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── OnboardingTutorial.tsx # First-time user tutorial
│   │   ├── ProfileDropdown.tsx    # User menu
│   │   ├── ProtectedRoute.tsx     # Auth guard
│   │   └── AdminRoute.tsx         # Admin guard
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Auth state provider
│   │   └── ImpersonationContext.tsx
│   │
│   ├── hooks/
│   │   ├── useIsAdmin.ts          # Admin role check
│   │   └── use-mobile.tsx         # Responsive detection
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts              # Supabase client (auto-generated)
│   │   └── types.ts               # DB types (auto-generated)
│   │
│   ├── pages/
│   │   ├── Login.tsx              # Auth page
│   │   ├── PublicChat.tsx         # Visitor chat interface
│   │   ├── owner/
│   │   │   ├── OwnerDashboard.tsx # Main dashboard
│   │   │   ├── SpaceDetail.tsx    # Single space view
│   │   │   ├── SpacesTab.tsx      # Space list
│   │   │   ├── SpaceDocumentsTab.tsx
│   │   │   ├── SpaceLinksTab.tsx
│   │   │   └── Analytics.tsx
│   │   └── admin/
│   │       ├── AdminDashboard.tsx
│   │       ├── AdminUsersTab.tsx
│   │       └── AdminSpacesTab.tsx
│   │
│   └── lib/
│       └── utils.ts               # cn() helper
│
├── supabase/
│   ├── config.toml                # Supabase config
│   ├── functions/
│   │   ├── api-spaces/index.ts
│   │   ├── api-documents/index.ts
│   │   ├── api-links/index.ts
│   │   ├── api-analytics/index.ts
│   │   ├── api-admin/index.ts
│   │   ├── public-chat/index.ts
│   │   └── process-document/index.ts
│   └── migrations/                # SQL migrations
│
├── docs/
│   ├── API.md                     # API documentation
│   ├── openapi.yaml               # OpenAPI spec
│   └── ARCHITECTURE.md            # This file
│
└── index.html
```

---

## Quick Reference: Building Similar Apps

### 1. Setup Checklist
- [ ] Supabase project with Auth enabled
- [ ] Auto-confirm emails for development
- [ ] Storage bucket for files
- [ ] pgvector extension for embeddings
- [ ] OpenAI API key in secrets

### 2. Core Patterns to Reuse

**Auth with Profiles:**
```sql
-- Trigger on auth.users to create profile
CREATE FUNCTION handle_new_user() RETURNS trigger ...
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users ...
```

**RLS Pattern:**
```sql
-- Owner-based access
CREATE POLICY "owner_access" ON table
FOR ALL USING (auth.uid() = owner_id);

-- Admin override
CREATE POLICY "admin_access" ON table
FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

**Edge Function Auth:**
```typescript
const token = req.headers.get('authorization')?.slice(7);
const { data: { user } } = await supabase.auth.getUser(token);
if (!user) return new Response('Unauthorized', { status: 401 });
```

**RAG Pipeline:**
1. Create OpenAI Vector Store per collection
2. Upload files to vector store
3. On query: search vector store + fetch chunks
4. Inject context into system prompt
5. Stream response via SSE

### 3. Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One link per space | Auto-created | Simpler UX, fewer edge cases |
| Vector store per space | Yes | Isolated search contexts |
| Store chat history | Yes | Analytics + context for follow-ups |
| Image OCR | GPT-4 Vision | No extra service needed |
| Streaming | SSE | Real-time feel, works everywhere |

---

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | GPT + Vector Store API calls |
| `SUPABASE_URL` | Database/auth endpoint |
| `SUPABASE_ANON_KEY` | Public client access |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function admin access |

---

*Last updated: December 2024*
