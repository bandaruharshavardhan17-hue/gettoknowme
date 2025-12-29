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
      .select('*, spaces(id, name, description, openai_vector_store_id, ai_model)')
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
      const aiModel = shareLink.spaces.ai_model || 'gpt-4o-mini';
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

      // Get document content from our database as fallback/supplement
      const { data: documents } = await supabase
        .from('documents')
        .select('filename, content_text')
        .eq('space_id', shareLink.spaces.id)
        .not('content_text', 'is', null);

      // Also get chunks for more content
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('content, documents!inner(space_id)')
        .eq('documents.space_id', shareLink.spaces.id)
        .limit(20);

      let documentContext = '';
      
      // Add document content
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          if (doc.content_text) {
            documentContext += `\n--- ${doc.filename} ---\n${doc.content_text}\n`;
          }
        }
      }

      // Add chunk content
      if (chunks && chunks.length > 0) {
        documentContext += '\n--- Additional Content ---\n';
        for (const chunk of chunks) {
          documentContext += chunk.content + '\n';
        }
      }

      console.log('Document context length:', documentContext.length);

      // Try vector store search with a more relevant query
      const searchQueries = [message, 'name experience education skills background'];
      let vectorContext = '';

      for (const query of searchQueries) {
        try {
          const searchResponse = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/search`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2',
            },
            body: JSON.stringify({
              query: query,
              max_num_results: 10,
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.data && searchData.data.length > 0) {
              for (const result of searchData.data) {
                if (result.content && Array.isArray(result.content)) {
                  for (const content of result.content) {
                    if (content.type === 'text' && content.text) {
                      vectorContext += content.text + '\n\n';
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('Vector search error:', e);
        }
        
        if (vectorContext.length > 0) break;
      }

      console.log('Vector context length:', vectorContext.length);

      // Combine all available context
      const allContext = (vectorContext + documentContext).trim();
      console.log('Total context length:', allContext.length);

      // Build the system prompt
      let systemPrompt: string;
      
      if (allContext.length > 100) {
        systemPrompt = `You are a helpful AI assistant. Answer questions based ONLY on the following document content:

---DOCUMENTS---
${allContext.slice(0, 15000)}
---END DOCUMENTS---

CRITICAL RULES:
1. Answer ONLY based on the document content above.
2. For personal questions (name, experience, skills, education), find the info in the documents and answer as if YOU are that person.
3. Example: If documents show "Harsha Vardhan Bandaru" as the name, and user asks "What's your name?", say "My name is Harsha Vardhan Bandaru."
4. Be conversational and helpful.
5. If the specific info is NOT in the documents, say: "${ownerInstructions}"
6. Never make up information not in the documents.`;
      } else {
        systemPrompt = `You are a helpful AI assistant. No document content was found for this query.
Your response should be: "${ownerInstructions}"`;
      }

      // Build messages
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      console.log('Using AI model:', aiModel);

      // Use Chat Completions API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiModel,
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

      // Save user message to chat history
      await supabase
        .from('chat_messages')
        .insert({
          share_link_id: shareLink.id,
          space_id: shareLink.spaces.id,
          role: 'user',
          content: message,
        });

      // Stream the response and collect it
      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      let fullAssistantResponse = '';

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
                // Save assistant response to chat history with AI model info
                if (fullAssistantResponse.trim()) {
                  await supabase
                    .from('chat_messages')
                    .insert({
                      share_link_id: shareLink.id,
                      space_id: shareLink.spaces.id,
                      role: 'assistant',
                      content: fullAssistantResponse.trim(),
                      ai_model: aiModel,
                    });
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  fullAssistantResponse += parsed.choices[0].delta.content;
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