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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get document with space info
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*, spaces(id, name, openai_vector_store_id)')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error('Document not found');
    }

    const space = doc.spaces;
    let vectorStoreId = space.openai_vector_store_id;

    // Create vector store for space if it doesn't exist
    if (!vectorStoreId) {
      console.log('Creating vector store for space:', space.name);
      const vsResponse = await fetch('https://api.openai.com/v1/vector_stores', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          name: `knowme-space-${space.id}`,
        }),
      });

      if (!vsResponse.ok) {
        const error = await vsResponse.text();
        console.error('Failed to create vector store:', error);
        throw new Error('Failed to create vector store');
      }

      const vsData = await vsResponse.json();
      vectorStoreId = vsData.id;
      console.log('Created vector store:', vectorStoreId);

      // Save vector store ID to space
      await supabase
        .from('spaces')
        .update({ openai_vector_store_id: vectorStoreId })
        .eq('id', space.id);
    }

    let fileContent: Blob;
    let filename = doc.filename;

    // Get file content
    if (doc.file_type === 'note') {
      // For notes, create a text file from content
      fileContent = new Blob([doc.content_text || ''], { type: 'text/plain' });
      filename = `${doc.filename}.txt`;
    } else if (doc.file_path) {
      // Download file from storage
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

      fileContent = fileData;
    } else {
      throw new Error('No file content available');
    }

    // Upload file to OpenAI
    console.log('Uploading file to OpenAI:', filename);
    const formData = new FormData();
    formData.append('file', fileContent, filename);
    formData.append('purpose', 'assistants');

    const uploadResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error('Failed to upload file to OpenAI:', error);
      await supabase.from('documents').update({ 
        status: 'failed', 
        error_message: 'Failed to upload to OpenAI' 
      }).eq('id', documentId);
      throw new Error('Failed to upload file to OpenAI');
    }

    const uploadData = await uploadResponse.json();
    const openaiFileId = uploadData.id;
    console.log('Uploaded file to OpenAI:', openaiFileId);

    // Add file to vector store
    console.log('Adding file to vector store:', vectorStoreId);
    const addFileResponse = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        file_id: openaiFileId,
      }),
    });

    if (!addFileResponse.ok) {
      const error = await addFileResponse.text();
      console.error('Failed to add file to vector store:', error);
      await supabase.from('documents').update({ 
        status: 'failed', 
        error_message: 'Failed to index file' 
      }).eq('id', documentId);
      throw new Error('Failed to add file to vector store');
    }

    console.log('File added to vector store successfully');

    // Update document status
    const { error: updateError } = await supabase.from('documents').update({ 
      status: 'ready',
      openai_file_id: openaiFileId,
    }).eq('id', documentId);

    if (updateError) {
      console.error('Failed to update document status:', updateError);
    } else {
      console.log('Document processed successfully');
    }

    return new Response(JSON.stringify({ success: true, openaiFileId }), {
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
