import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// App help knowledge base (public FAQ)
const APP_KNOWLEDGE = `
Know Me is a knowledge-based Q&A app with shareable public chat links.

CORE FEATURES:
1. Spaces - Create knowledge containers to organize documents
2. Documents - Upload PDFs, text files, images, notes, or scrape URLs
3. Share Links - Generate public links so anyone can ask questions about your documents
4. AI Persona - Configure how the AI responds (tone, style, audience)
5. Document Visibility - Mark docs as Public, Internal, or Owner Only

HOW TO CREATE A SPACE:
- Click "New Space" button on the Spaces page
- Enter a name and optional description
- Click "Create Space"

HOW TO ADD DOCUMENTS:
- Open a Space and go to Documents tab
- Upload: Click upload and select PDF, TXT, or image files
- Note: Use the Note tab to paste or type text content
- Voice: Use the Voice tab to record and transcribe voice notes
- URL: Use the URL tab to scrape web page content

HOW TO SHARE:
- Each Space has a shareable link shown in the header
- Copy the link or scan the QR code
- Toggle the link on/off to control access
- Visitors can ask questions through the public chat

AI CONFIGURATION:
- AI Model: Choose Fast, Pro, Balanced, or Economy models
- Persona Settings: Set tone, style, target audience
- Fallback Message: Define what to say when no relevant info is found
- Do Not Mention: Topics the AI should avoid

DOCUMENT VISIBILITY:
- Public: Visible to visitors via share link
- Internal: For your reference, hidden from public chat
- Owner Only: Completely private

ANALYTICS:
- View message counts and visitor engagement
- Track document coverage and health metrics
- Monitor Space activity over time
`;

// Blocked topics/keywords
const BLOCKED_PATTERNS = [
  /admin/i, /other user/i, /all users/i, /database/i, /backend/i,
  /service.?role/i, /api.?key/i, /secret/i, /internal system/i,
  /supabase/i, /sql/i, /query/i, /table/i, /schema/i,
];

function isBlockedQuery(message: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(message));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  try {
    const body = await req.json();
    const { action, message, history = [], context = {} } = body;

    // Support both old format and new iOS format
    const userMessage = message || body.message;
    const userName = context.userName || 'User';
    const providedSpaceNames = context.spaceNames || [];

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for blocked queries
    if (isBlockedQuery(userMessage)) {
      const refusal = "I can only help with using the Know Me app. I can't provide information about admin features, other users, or internal systems. What would you like to know about creating spaces, uploading documents, or sharing?";
      
      // Return SSE stream for blocked query
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: refusal })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let userSpaces: { name: string; id: string }[] = [];
    let userDocuments: { filename: string; space_name: string }[] = [];

    // Create Supabase client with user JWT (NOT service role)
    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: authHeader }
        }
      });

      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (!authError && user) {
        userId = user.id;

        // Fetch user's own spaces only (RLS enforced via owner_id = auth.uid())
        const { data: spaces } = await supabase
          .from('spaces')
          .select('id, name')
          .limit(10);

        if (spaces) {
          userSpaces = spaces;
        }

        // Fetch user's document names for context (limited)
        if (userSpaces.length > 0) {
          const spaceIds = userSpaces.map(s => s.id);
          const { data: docs } = await supabase
            .from('documents')
            .select('filename, space_id')
            .in('space_id', spaceIds)
            .eq('status', 'ready')
            .limit(20);

          if (docs) {
            userDocuments = docs.map(d => ({
              filename: d.filename,
              space_name: userSpaces.find(s => s.id === d.space_id)?.name || 'Unknown'
            }));
          }
        }
      }
    }

    // Build user context
    let userContext = '';
    const spaceNames = userSpaces.length > 0 
      ? userSpaces.map(s => s.name) 
      : providedSpaceNames;

    if (spaceNames.length > 0) {
      userContext += `\n\nUser's spaces: ${spaceNames.join(', ')}`;
    }
    if (userDocuments.length > 0) {
      const docList = userDocuments.slice(0, 10).map(d => `"${d.filename}" in ${d.space_name}`).join(', ');
      userContext += `\nRecent documents: ${docList}`;
    }
    if (userName && userName !== 'User') {
      userContext = `\nUser name: ${userName}` + userContext;
    }

    // If no OpenAI key, return basic FAQ response
    if (!openaiKey) {
      const fallback = "I can help you with Know Me features! Try asking about creating spaces, uploading documents, sharing links, or AI persona settings.";
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: `You are the Know Me app assistant. You ONLY answer app usage questions and info about the user's own spaces.

${APP_KNOWLEDGE}${userContext}

STRICT RULES:
1. ONLY answer questions about using the Know Me app
2. You may reference the user's own spaces and documents listed above
3. NEVER provide information about:
   - Admin features or tools
   - Other users or their data
   - Internal systems, databases, or APIs
   - Technical implementation details
4. If asked about anything outside scope, politely refuse and redirect to app usage help
5. Keep responses concise (under 150 words)
6. Do not use markdown lists longer than 5 items

If the question is not about app usage or the user's own data, say: "I can only help with using Know Me. What would you like to know about your spaces, documents, or sharing?"`,
      },
      // Include conversation history (limited)
      ...history.slice(-6).map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];

    console.log(`App assistant query from ${userId ? 'authenticated user' : 'anonymous'}: ${userMessage.substring(0, 100)}`);

    // Call OpenAI with streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 300,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error('OpenAI API error');
    }

    // Stream the response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk);
        const lines = text.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            } else {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    });

    const streamedResponse = response.body?.pipeThrough(transformStream);

    return new Response(streamedResponse, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error) {
    console.error('App assistant error:', error);
    
    const fallback = "I can help with app features like creating spaces, uploading documents, and sharing. What would you like to know?";
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }
});
