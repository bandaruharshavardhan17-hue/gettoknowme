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
    const isImage = doc.file_type === 'image';
    const isPdf = doc.file_type === 'pdf';

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

      // For images, extract text using GPT-4 Vision
      if (isImage) {
        console.log('Extracting text from image using Vision API');
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to base64 in chunks to avoid stack overflow
        let binaryString = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          binaryString += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const base64Image = btoa(binaryString);
        const mimeType = doc.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract ALL text content from this image. Include everything visible: titles, paragraphs, labels, captions, handwritten notes, etc. If there is no text, describe the image content in detail. Return only the extracted/described content, no explanations.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Image}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 4096,
          }),
        });

        if (!visionResponse.ok) {
          const error = await visionResponse.text();
          console.error('Vision API failed:', error);
          await supabase.from('documents').update({ 
            status: 'failed', 
            error_message: 'Failed to extract text from image' 
          }).eq('id', documentId);
          throw new Error('Failed to extract text from image');
        }

        const visionData = await visionResponse.json();
        const extractedText = visionData.choices?.[0]?.message?.content || 'No text found in image';
        console.log('Extracted text from image:', extractedText.substring(0, 200) + '...');

        // Save extracted text to document
        await supabase.from('documents').update({ 
          content_text: extractedText 
        }).eq('id', documentId);

        // Create a text file for OpenAI indexing
        fileContent = new Blob([`[Image: ${doc.filename}]\n\n${extractedText}`], { type: 'text/plain' });
        filename = `${doc.filename.split('.')[0]}.txt`;
      } else if (isPdf) {
        // For PDFs, we use the Vision API to extract text from pages
        console.log('Processing PDF file');
        
        // Keep the original PDF for OpenAI indexing
        fileContent = fileData;
        
        // Try to extract text preview using Vision API on first page
        // Note: Full PDF text is indexed by OpenAI, this is just for preview
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to base64 in chunks
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const base64Pdf = btoa(binaryString);
          
          // Use GPT to summarize/extract key info from PDF (OpenAI handles PDF natively now)
          const pdfResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Extract and summarize all the key text content from this PDF document. Include main headings, key points, and important details. Format it in a readable way.',
                    },
                    {
                      type: 'file',
                      file: {
                        filename: doc.filename,
                        file_data: `data:application/pdf;base64,${base64Pdf}`,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 4096,
            }),
          });

          if (pdfResponse.ok) {
            const pdfData = await pdfResponse.json();
            const extractedText = pdfData.choices?.[0]?.message?.content;
            if (extractedText) {
              console.log('Extracted text preview from PDF');
              await supabase.from('documents').update({ 
                content_text: extractedText 
              }).eq('id', documentId);
            }
          } else {
            console.log('PDF text extraction not available, using embedded viewer for preview');
          }
        } catch (extractError) {
          console.log('PDF text extraction failed, continuing with file upload:', extractError);
          // Continue without text extraction - PDF will still be viewable in iframe
        }
      } else {
        fileContent = fileData;
      }
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
