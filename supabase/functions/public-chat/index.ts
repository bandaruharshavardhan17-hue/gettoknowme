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

      // Build messages for OpenAI
      const messages = [
        ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      const defaultFallback = "I don't have that information in the provided documents.";
      const fallbackMessage = shareLink.spaces.description || defaultFallback;

      console.log('Using vector store:', vectorStoreId);
      console.log('Owner instructions:', shareLink.spaces.description ? 'Yes' : 'None');
      
      // Use OpenAI Responses API with file_search
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          input: messages,
          instructions: `You are a helpful AI assistant for "${shareLink.spaces.name}". Your job is to answer questions ONLY based on the uploaded documents.

CRITICAL RULES:
1. ALWAYS use file_search to look up information in the documents before answering ANY question.
2. For questions like "What is your name?", "Who are you?", "Tell me about yourself" - search the documents for personal information (like a resume or bio) and answer based on what you find.
3. If the file_search finds relevant information, use it to answer accurately.
4. If NO relevant information is found in the documents, respond with: "${fallbackMessage}"
5. NEVER make up information that isn't in the documents.
6. NEVER say you are an AI or that you don't have friends - instead search the documents and answer based on what's there.
7. Be helpful, accurate, and conversational.

Remember: You represent the information in the documents. If someone asks personal questions, look for that info in the uploaded files (resume, bio, etc.) and answer as if you ARE that person.`,
          tools: [
            {
              type: 'file_search',
              vector_store_ids: [vectorStoreId],
            }
          ],
          stream: true,
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

      // Transform OpenAI Responses API stream to standard format
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
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }

              try {
                const event = JSON.parse(data);
                
                // Handle text delta events from Responses API
                if (event.type === 'response.output_text.delta' && event.delta) {
                  const chunk = {
                    choices: [{
                      delta: { content: event.delta },
                      index: 0,
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                } else if (event.type === 'response.completed') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
