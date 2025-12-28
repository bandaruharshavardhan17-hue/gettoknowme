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

      // Use OpenAI Responses API with file_search
      console.log('Using vector store:', vectorStoreId);
      
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          input: messages,
          instructions: `You are a helpful AI assistant for "${shareLink.spaces.name}".

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. Answer questions ONLY based on information found in the documents via file search.
2. If the answer is NOT found in the documents, you MUST respond: "I don't know from the provided documents."
3. NEVER make up, guess, or infer information that isn't explicitly in the documents.
4. Always cite the source document and include relevant quotes when answering.
5. If asked about something outside the document scope, politely decline and explain you can only answer based on the uploaded documents.

${shareLink.spaces.description ? `OWNER INSTRUCTIONS:\n${shareLink.spaces.description}\n` : ''}
Be helpful, accurate, and concise.`,
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
                
                // Handle different event types from Responses API
                if (event.type === 'response.output_text.delta') {
                  // Convert to chat completions format
                  const chunk = {
                    choices: [{
                      delta: { content: event.delta },
                      index: 0,
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                } else if (event.type === 'response.completed') {
                  // Extract citations if available
                  const output = event.response?.output;
                  if (output && Array.isArray(output)) {
                    for (const item of output) {
                      if (item.type === 'message' && item.content) {
                        for (const content of item.content) {
                          if (content.annotations) {
                            // Send citations as a special message
                            const citations = content.annotations
                              .filter((a: any) => a.type === 'file_citation')
                              .map((a: any) => ({
                                text: a.text,
                                file_id: a.file_citation?.file_id,
                                quote: a.file_citation?.quote,
                              }));
                            
                            if (citations.length > 0) {
                              const citationChunk = {
                                choices: [{
                                  delta: { citations },
                                  index: 0,
                                }]
                              };
                              controller.enqueue(encoder.encode(`data: ${JSON.stringify(citationChunk)}\n\n`));
                            }
                          }
                        }
                      }
                    }
                  }
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                }
              } catch (e) {
                // Skip malformed JSON
                console.error('Failed to parse event:', e);
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
