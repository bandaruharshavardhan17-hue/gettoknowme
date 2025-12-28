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
    const { documentId } = await req.json();
    console.log('Processing document:', documentId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get document
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*, spaces(id)')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error('Document not found');
    }

    let textContent = doc.content_text || '';

    // If file upload, download and extract text
    if (doc.file_path && doc.file_type !== 'note') {
      const { data: fileData, error: fileError } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (fileError) {
        await supabase.from('documents').update({ 
          status: 'failed', 
          error_message: 'Failed to download file' 
        }).eq('id', documentId);
        throw fileError;
      }

      textContent = await fileData.text();
    }

    if (!textContent.trim()) {
      await supabase.from('documents').update({ 
        status: 'failed', 
        error_message: 'No text content found' 
      }).eq('id', documentId);
      return new Response(JSON.stringify({ error: 'No content' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chunk the text (simple chunking by paragraphs/sentences)
    const chunks = chunkText(textContent, 500);
    console.log(`Created ${chunks.length} chunks`);

    // Insert chunks (without embeddings for now - simplified version)
    for (let i = 0; i < chunks.length; i++) {
      await supabase.from('document_chunks').insert({
        document_id: documentId,
        chunk_index: i,
        content: chunks[i],
      });
    }

    // Update document status
    await supabase.from('documents').update({ 
      status: 'ready',
      content_text: textContent.substring(0, 10000) // Store first 10k chars
    }).eq('id', documentId);

    console.log('Document processed successfully');

    return new Response(JSON.stringify({ success: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing document:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += para + '\n\n';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.substring(0, maxChunkSize)];
}
