import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// App help knowledge base
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

SECURITY:
- Each Space is private to its owner
- Share links can be revoked anytime
- Admin access is separate and protected
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, user_id } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiKey) {
      // Return helpful default response without AI
      return new Response(
        JSON.stringify({ 
          answer: "I can help you with Know Me features! Try asking about creating spaces, uploading documents, sharing links, or AI persona settings." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's space info if authenticated (for context)
    let userContext = '';
    if (user_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data: spaces } = await supabase
        .from('spaces')
        .select('name, id')
        .eq('owner_id', user_id)
        .limit(5);
      
      if (spaces && spaces.length > 0) {
        userContext = `\n\nUser's spaces: ${spaces.map(s => s.name).join(', ')}`;
      }
    }

    console.log(`App assistant query: ${message}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are the Know Me app assistant. Help users understand how to use the app.

${APP_KNOWLEDGE}${userContext}

RULES:
1. ONLY answer questions about using the Know Me app
2. Do NOT answer questions about other users' data or admin features
3. Do NOT provide information outside of app usage
4. Keep responses concise and helpful
5. If asked about something unrelated, politely redirect to app help

If the question is not about app usage, say: "I can only help with using Know Me. What would you like to know about creating spaces, uploading documents, or sharing?"`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 
      "I can help you with creating spaces, uploading documents, sharing links, and configuring your AI. What would you like to know?";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('App assistant error:', error);
    return new Response(
      JSON.stringify({ 
        answer: "I can help with app features like creating spaces, uploading documents, and sharing. What would you like to know?" 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
