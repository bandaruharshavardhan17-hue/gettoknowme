# Know Me - Public API Documentation

## Base URL
```
https://oqvvffeaffyoapdtpmjr.supabase.co/functions/v1
```

## Authentication
All API endpoints (except `public-chat`) require authentication via Bearer token:
```
Authorization: Bearer <your-supabase-access-token>
```

Get an access token by signing in via Supabase Auth.

---

## Endpoints

### 1. Spaces API (`/api-spaces`)

#### List all spaces
```http
GET /api-spaces
```
**Response:**
```json
{
  "spaces": [
    {
      "id": "uuid",
      "name": "My Knowledge Base",
      "description": "AI instructions",
      "document_count": 5,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Get single space
```http
GET /api-spaces?id=<space_id>
```

#### Create space
```http
POST /api-spaces
Content-Type: application/json

{
  "name": "My New Space",
  "description": "Optional AI instructions"
}
```
**Response:** `201 Created`
```json
{
  "space": { "id": "uuid", "name": "My New Space", ... }
}
```

#### Update space
```http
PUT /api-spaces?id=<space_id>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated instructions"
}
```

#### Delete space
```http
DELETE /api-spaces?id=<space_id>
```
**Response:**
```json
{ "success": true }
```

---

### 2. Documents API (`/api-documents`)

#### List documents in a space
```http
GET /api-documents?space_id=<space_id>
```
**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "filename": "document.txt",
      "file_type": "txt",
      "file_path": "user-id/space-id/timestamp-filename.txt",
      "status": "ready",
      "content_text": "Extracted text content...",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Document Status Values:**
- `uploading` - File is being uploaded to storage
- `indexing` - File is being processed by AI
- `ready` - Document is indexed and searchable
- `failed` - Processing failed (check `error_message`)

**Supported File Types:**
| Type | Extension | Preview | AI Indexing |
|------|-----------|---------|-------------|
| PDF | `.pdf` | Download/New tab | OpenAI Vector Store |
| Text | `.txt` | Inline text | OpenAI Vector Store |
| Image | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` | Inline image | GPT-4 Vision OCR |
| Note | (user-typed) | Inline text | Document chunks |

#### Get single document
```http
GET /api-documents?id=<document_id>
```

#### Create text document
```http
POST /api-documents
Content-Type: application/json

{
  "space_id": "<space_id>",
  "filename": "my-notes.txt",
  "content": "Your document content here...",
  "file_type": "txt"
}
```
**Response:** `201 Created`

#### Delete document
```http
DELETE /api-documents?id=<document_id>
```

---

### 3. Share Links API (`/api-links`)

#### List all share links
```http
GET /api-links
```

#### List links for a space
```http
GET /api-links?space_id=<space_id>
```

#### Get single link
```http
GET /api-links?id=<link_id>
```
**Response:**
```json
{
  "link": {
    "id": "uuid",
    "token": "abc123",
    "name": "Public Link",
    "url": "https://domain.com/s/abc123",
    "view_count": 42,
    "last_used_at": "2024-01-01T00:00:00Z",
    "revoked": false
  }
}
```

#### Create share link
```http
POST /api-links
Content-Type: application/json

{
  "space_id": "<space_id>",
  "name": "My Public Link"
}
```
**Response:** `201 Created`

#### Update link (rename or revoke)
```http
PUT /api-links?id=<link_id>
Content-Type: application/json

{
  "name": "New Name",
  "revoked": true
}
```

#### Delete link
```http
DELETE /api-links?id=<link_id>
```

---

### 4. Analytics API (`/api-analytics`)

#### Get overall analytics
```http
GET /api-analytics
```
**Response:**
```json
{
  "analytics": {
    "total_views": 1234,
    "total_active_links": 10,
    "avg_views_per_link": 123,
    "spaces": [
      { "id": "uuid", "name": "Space 1", "total_views": 500, "active_links": 3 }
    ],
    "top_links": [
      { "id": "uuid", "name": "Popular Link", "view_count": 200 }
    ]
  }
}
```

#### Get analytics for a space
```http
GET /api-analytics?space_id=<space_id>
```

#### Get analytics for a specific link
```http
GET /api-analytics?link_id=<link_id>
```

---

### 5. Public Chat API (`/public-chat`)

**No authentication required** - uses share token instead.

#### Validate a share link
```http
POST /public-chat
Content-Type: application/json

{
  "token": "<share_token>",
  "action": "validate"
}
```
**Response:**
```json
{
  "valid": true,
  "space": { "name": "My Space", "description": "..." }
}
```

#### Send a chat message (streaming)
```http
POST /public-chat
Content-Type: application/json

{
  "token": "<share_token>",
  "action": "chat",
  "message": "What is this about?",
  "history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```
**Response:** Server-Sent Events (SSE) stream

---

### 6. Admin API (`/api-admin`)

**Requires admin role** - only users with admin role can access these endpoints.

#### List all users
```http
GET /api-admin?resource=users
```
**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "John Doe",
      "avatar_url": "https://...",
      "is_admin": false,
      "spaces_count": 5,
      "documents_count": 20,
      "links_count": 5,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### List all spaces (admin view)
```http
GET /api-admin?resource=spaces
GET /api-admin?resource=spaces&owner_id=<user_id>
```
**Response:**
```json
{
  "spaces": [
    {
      "id": "uuid",
      "name": "Space Name",
      "owner_email": "user@example.com",
      "owner_name": "John Doe",
      "document_count": 5,
      "link_count": 1
    }
  ]
}
```

#### List chat messages
```http
GET /api-admin?resource=chats
GET /api-admin?resource=chats&space_id=<space_id>
GET /api-admin?resource=chats&link_id=<link_id>
```
**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Question here",
      "created_at": "2024-01-01T00:00:00Z",
      "share_links": { "token": "abc123", "name": "Default Link" },
      "spaces": { "name": "Space Name" }
    }
  ]
}
```

#### Get platform analytics
```http
GET /api-admin?resource=analytics
```
**Response:**
```json
{
  "analytics": {
    "total_users": 100,
    "total_spaces": 250,
    "total_documents": 1000,
    "total_links": 250,
    "total_views": 5000,
    "total_chat_messages": 10000
  }
}
```

#### Add admin role to user
```http
POST /api-admin?resource=roles
Content-Type: application/json

{
  "user_id": "<user_id>",
  "action": "add",
  "role": "admin"
}
```

#### Remove admin role from user
```http
POST /api-admin?resource=roles
Content-Type: application/json

{
  "user_id": "<user_id>",
  "action": "remove",
  "role": "admin"
}
```

#### Delete a user (and all their data)
```http
DELETE /api-admin?resource=users&id=<user_id>
```

#### Delete a space (admin)
```http
DELETE /api-admin?resource=spaces&id=<space_id>
```

---

### 7. Voice-to-Text API (`/voice-to-text`)

Transcribes audio to text using OpenAI Whisper. No JWT verification required.

```http
POST /voice-to-text
Content-Type: application/json

{
  "audio": "<base64_encoded_audio>"
}
```

**Audio Requirements:**
- Format: WebM with Opus codec (preferred), WebM, or MP4
- Minimum duration: ~1 second
- Sample rate: Any (Whisper handles resampling)
- The audio should be base64 encoded from a Blob

**Client-side recording example:**
```typescript
const mediaRecorder = new MediaRecorder(stream, { 
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000
});
mediaRecorder.start(250); // Collect chunks every 250ms
```

**Response:**
```json
{
  "text": "Transcribed text here..."
}
```

**Error Response:**
```json
{
  "error": "No audio data provided"
}
```

---

### 8. Text-to-Speech API (`/text-to-speech`)

Generates speech audio from text using OpenAI TTS.

```http
POST /text-to-speech
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Hello, how can I help you?",
  "voice": "alloy"
}
```

**Available voices:** `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`

**Response:** Binary audio (audio/mpeg)

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (admin access required)
- `404` - Not Found
- `405` - Method Not Allowed
- `429` - Rate Limited
- `500` - Internal Server Error

---

## Example: iOS Swift Usage

```swift
let url = URL(string: "https://oqvvffeaffyoapdtpmjr.supabase.co/functions/v1/api-spaces")!
var request = URLRequest(url: url)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    // Handle response
}
task.resume()
```

## Example: MCP Tool Integration

```typescript
// List spaces
const response = await fetch('https://oqvvffeaffyoapdtpmjr.supabase.co/functions/v1/api-spaces', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
const { spaces } = await response.json();
```

## Example: Admin API Usage

```typescript
// Get all users (admin only)
const response = await fetch('https://oqvvffeaffyoapdtpmjr.supabase.co/functions/v1/api-admin?resource=users', {
  headers: {
    'Authorization': `Bearer ${adminAccessToken}`,
    'Content-Type': 'application/json'
  }
});
const { users } = await response.json();

// Add admin role
await fetch('https://oqvvffeaffyoapdtpmjr.supabase.co/functions/v1/api-admin?resource=roles', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminAccessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: 'user-uuid',
    action: 'add',
    role: 'admin'
  })
});
```
