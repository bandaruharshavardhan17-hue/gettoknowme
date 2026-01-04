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

    // HARD-DISABLE CHECK: First validate the token exists
    const { data: linkCheck, error: checkError } = await supabase
      .from('share_links')
      .select('id, revoked, token, expires_at')
      .eq('token', token)
      .single();

    // If link not found at all
    if (checkError || !linkCheck) {
      console.log(`[DENIED] Invalid token attempt: ${token?.slice(0, 8)}...`);
      return new Response(JSON.stringify({ 
        valid: false, 
        disabled: false,
        expired: false,
        message: 'This link is invalid.' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // EXPIRATION CHECK: If expires_at is set and in the past, return 403 immediately
    if (linkCheck.expires_at && new Date(linkCheck.expires_at) < new Date()) {
      console.log(`[DENIED] Expired link access attempt | link_id: ${linkCheck.id} | expired_at: ${linkCheck.expires_at}`);
      return new Response(JSON.stringify({ 
        valid: false, 
        disabled: false,
        expired: true,
        message: 'This link has expired.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // HARD-DISABLE CHECK: If link is revoked/disabled, return 403 immediately
    if (linkCheck.revoked) {
      console.log(`[DENIED] Disabled link access attempt | link_id: ${linkCheck.id}`);
      return new Response(JSON.stringify({ 
        valid: false, 
        disabled: true,
        expired: false,
        message: 'This link is disabled.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Now fetch full share link data with space info (only for non-revoked links)
    const { data: shareLink, error: linkError } = await supabase
      .from('share_links')
      .select(`*, spaces(
        id, name, description, openai_vector_store_id, ai_model, owner_id,
        ai_fallback_message, ai_persona_style, ai_tone, ai_audience, ai_do_not_mention
      )`)
      .eq('token', token)
      .eq('revoked', false)
      .single();

    if (linkError || !shareLink) {
      console.log(`[DENIED] Link validation failed: ${token?.slice(0, 8)}...`);
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

      console.log(`[ACCESS] Valid link accessed | link_id: ${shareLink.id} | space: ${shareLink.spaces.name}`);

      return new Response(JSON.stringify({ 
        valid: true, 
        disabled: false,
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
      const ownerId = shareLink.spaces.owner_id;

      // Fetch persona settings from space
      const personaStyle = shareLink.spaces.ai_persona_style || '';
      const tone = shareLink.spaces.ai_tone || '';
      const audience = shareLink.spaces.ai_audience || '';
      const doNotMention = shareLink.spaces.ai_do_not_mention || '';
      const fallbackMessage = shareLink.spaces.ai_fallback_message;

      // Fetch owner's display name for personalized fallback
      let ownerName = 'the owner';
      if (ownerId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', ownerId)
          .single();
        if (profile?.display_name) {
          ownerName = profile.display_name;
        }
      }

      // Build personalized fallback response
      const defaultFallback = `I don't have that information in the provided documents. Please reach out to ${ownerName} for more details.`;
      const finalFallback = fallbackMessage || defaultFallback;

      console.log('Using vector store:', vectorStoreId || 'none (using local content)');
      console.log('Space ID:', shareLink.spaces.id);

      // Get document content from our database - ONLY PUBLIC visibility for public chat
      const { data: documents } = await supabase
        .from('documents')
        .select('id, filename, content_text, created_at, visibility')
        .eq('space_id', shareLink.spaces.id)
        .or('visibility.eq.public,visibility.is.null')
        .order('created_at', { ascending: false });
      
      // Check if there are any documents at all
      if ((!documents || documents.length === 0) && !vectorStoreId) {
        return new Response(JSON.stringify({ 
          error: 'No documents have been added to this space yet.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build document context with source tracking for citations
      let documentContext = '';
      const docSources: { id: string; filename: string; excerpt: string }[] = [];
      
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          if (doc.content_text) {
            documentContext += `\n--- [Document: ${doc.filename}] ---\n${doc.content_text}\n`;
            docSources.push({
              id: doc.id,
              filename: doc.filename,
              excerpt: doc.content_text.slice(0, 100),
            });
          }
        }
      }

      // Also get chunks for more content
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('content, documents!inner(space_id, filename, visibility)')
        .eq('documents.space_id', shareLink.spaces.id)
        .or('documents.visibility.eq.public,documents.visibility.is.null')
        .limit(20);

      if (chunks && chunks.length > 0) {
        documentContext += '\n--- Additional Content ---\n';
        for (const chunk of chunks) {
          documentContext += chunk.content + '\n';
        }
      }

      console.log('Document context length:', documentContext.length);

      // Try vector store search only if we have a vector store
      let vectorContext = '';
      
      if (vectorStoreId) {
        const searchQueries = [message, 'name experience education skills background'];

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
      }

      console.log('Vector context length:', vectorContext.length);

      // Combine all available context
      const allContext = (vectorContext + documentContext).trim();
      console.log('Total context length:', allContext.length);

      // FALLBACK CHECK: If no meaningful content, return fallback immediately
      const MIN_CONTEXT_LENGTH = 100;
      if (allContext.length < MIN_CONTEXT_LENGTH) {
        console.log('[FALLBACK] No relevant content found, using fallback response');
        
        // Save user message
        await supabase
          .from('chat_messages')
          .insert({
            share_link_id: shareLink.id,
            space_id: shareLink.spaces.id,
            role: 'user',
            content: message,
          });
        
        // Save fallback response
        await supabase
          .from('chat_messages')
          .insert({
            share_link_id: shareLink.id,
            space_id: shareLink.spaces.id,
            role: 'assistant',
            content: finalFallback,
            ai_model: aiModel,
          });

        return new Response(JSON.stringify({ 
          answer: finalFallback,
          used_fallback: true,
          citations: []
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build persona instructions
      let personaInstructions = '';
      if (personaStyle) {
        personaInstructions += `\nPERSONA STYLE: ${personaStyle}`;
      }
      if (tone) {
        personaInstructions += `\nTONE: Respond in a ${tone} tone.`;
      }
      if (audience) {
        personaInstructions += `\nAUDIENCE: The audience is ${audience}. Adjust your language and explanations accordingly.`;
      }
      if (doNotMention) {
        personaInstructions += `\nDO NOT MENTION: Never discuss or reference the following topics: ${doNotMention}`;
      }

      // Build the system prompt with persona settings and STRICT fallback instruction
      const systemPrompt = `You are a helpful AI assistant.${personaInstructions}

DOCUMENT CONTEXT:
---DOCUMENTS---
${allContext.slice(0, 15000)}
---END DOCUMENTS---

CRITICAL RULES:
1. Answer ONLY based on the document content above.
2. For personal questions (name, experience, skills, education), find the info in the documents and answer as if YOU are that person.
3. Example: If documents show "John Smith" as the name, and user asks "What's your name?", say "My name is John Smith."
4. Be conversational and helpful.
5. When providing information, cite the source document: "Based on [Document Name]..."
6. If information could be outdated or documents have conflicting info, mention this and ask for clarification if needed.
7. **STRICT FALLBACK RULE**: If the answer is NOT found in the provided documents, respond ONLY with this exact message: "${finalFallback}"
8. Never make up information not in the documents. Do not guess or infer beyond what is explicitly stated.`;

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
