import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, action, message, history } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate token
    const { data: shareLink, error: linkError } = await supabase
      .from('share_links')
      .select('*, spaces(id, name, description, openai_vector_store_id)')
      .eq('token', token)
      .eq('revoked', false)
      .single();

    if (linkError || !shareLink) {
      return new Response(JSON.stringify({ 
        valid: false, 
        message: 'This link is invalid or has been revoked' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'validate') {
      // Increment view count when link is accessed
      await supabase
        .from('share_links')
        .update({ 
          view_count: (shareLink.view_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', shareLink.id);

      return new Response(JSON.stringify({ 
        valid: true, 
        space: { 
          name: shareLink.spaces.name, 
          description: shareLink.spaces.description 
        } 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'chat') {
      if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const vectorStoreId = shareLink.spaces.openai_vector_store_id;

      if (!vectorStoreId) {
        return new Response(JSON.stringify({ 
          error: 'No documents have been uploaded to this space yet.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const defaultFallback = "I don't have that information in the provided documents.";
      const ownerInstructions = shareLink.spaces.description || defaultFallback;

      console.log('Using vector store:', vectorStoreId);
      console.log('Owner instructions:', shareLink.spaces.description ? 'Yes' : 'None');

      // First, search the vector store for relevant content
      const searchQuery = message;
      console.log('Searching for:', searchQuery);

      // Use OpenAI's vector store search
      const searchResponse = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
        body: JSON.stringify({
          query: searchQuery,
          max_num_results: 5,
        }),
      });

      let context = '';
      let citations: string[] = [];

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log('Search results:', JSON.stringify(searchData).slice(0, 500));
        
        if (searchData.data && searchData.data.length > 0) {
          // Extract content from search results
          for (const result of searchData.data) {
            if (result.content && Array.isArray(result.content)) {
              for (const content of result.content) {
                if (content.type === 'text' && content.text) {
                  context += content.text + '\n\n';
                  // Add first 100 chars as citation
                  if (content.text.length > 20) {
                    citations.push(content.text.slice(0, 150) + '...');
                  }
                }
              }
            }
          }
        }
      } else {
        const errorText = await searchResponse.text();
        console.error('Vector store search error:', searchResponse.status, errorText);
      }

      console.log('Found context length:', context.length);
      console.log('Citations count:', citations.length);

      // Build the system prompt with context
      const systemPrompt = context.length > 0 
        ? `You are a helpful AI assistant. Answer the user's question based ONLY on the following information from the documents:

---DOCUMENT CONTENT---
${context}
---END DOCUMENT CONTENT---

RULES:
1. Answer based ONLY on the document content above.
2. If the user asks about your name, education, experience, skills, or any personal info - look for it in the document content.
3. Be conversational and answer as if YOU are the person described in the documents.
4. If the specific information is not in the documents, say: "${ownerInstructions}"
5. Never make up information.`
        : `You are a helpful AI assistant. The user asked a question but no relevant information was found in the documents.

Your response should be: "${ownerInstructions}"`;

      // Build messages for chat
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      // Use standard Chat Completions API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          stream: true,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI error:', response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error('AI service error');
      }

      // Stream the response
      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          if (!reader) {
            controller.close();
            return;
          }

          let buffer = '';
          let sentCitations = false;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                // Send citations at the end if we have them
                if (citations.length > 0 && !sentCitations) {
                  const citationChunk = {
                    citations: citations.slice(0, 3),
                    choices: [{ delta: { content: '' }, index: 0 }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(citationChunk)}\n\n`));
                  sentCitations = true;
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                }
              } catch (e) {
                // Skip malformed JSON
              }
            }
          }

          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});