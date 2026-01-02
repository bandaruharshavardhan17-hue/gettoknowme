import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { space_id, url, title } = await req.json();

    if (!space_id || !url) {
      return new Response(
        JSON.stringify({ error: 'space_id and url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns the space
    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('id, owner_id')
      .eq('id', space_id)
      .single();

    if (spaceError || !space) {
      return new Response(
        JSON.stringify({ error: 'Space not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (space.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to add documents to this space' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping URL: ${url} for space: ${space_id}`);

    // Fetch the URL content
    let pageContent = '';
    let pageTitle = title || url;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('This website blocks automated access. Try a different URL or copy the content manually.');
        }
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      
      // Extract title from HTML if not provided
      if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          pageTitle = titleMatch[1].trim();
        }
      }

      // Extract text content from HTML (basic extraction)
      // Remove script and style tags
      let cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

      // Extract text from remaining HTML
      pageContent = cleanHtml
        .replace(/<[^>]+>/g, ' ')  // Remove all HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')  // Collapse whitespace
        .trim();

      if (!pageContent || pageContent.length < 50) {
        return new Response(
          JSON.stringify({ error: 'Could not extract meaningful content from the URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Extracted ${pageContent.length} characters from URL`);

    } catch (fetchError: unknown) {
      console.error('Fetch error:', fetchError);
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL: ${message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the document record
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        space_id,
        filename: pageTitle,
        file_type: 'url',
        content_text: pageContent,
        status: 'indexing',
      })
      .select()
      .single();

    if (docError) {
      console.error('Document creation error:', docError);
      return new Response(
        JSON.stringify({ error: 'Failed to create document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Created document: ${document.id}`);

    // Split content into chunks and create document_chunks
    const chunkSize = 1000;
    const chunks: string[] = [];
    for (let i = 0; i < pageContent.length; i += chunkSize) {
      chunks.push(pageContent.slice(i, i + chunkSize));
    }

    const chunkInserts = chunks.map((content, index) => ({
      document_id: document.id,
      content,
      chunk_index: index,
    }));

    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunkInserts);

    if (chunksError) {
      console.error('Chunks creation error:', chunksError);
      // Don't fail - just log the error
    }

    // Update document status to ready
    await supabase
      .from('documents')
      .update({ status: 'ready' })
      .eq('id', document.id);

    console.log(`Document ${document.id} is now ready with ${chunks.length} chunks`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        document: { ...document, status: 'ready' }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Scrape URL error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
