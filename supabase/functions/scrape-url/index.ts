import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Login/generic page detection patterns
const LOGIN_PATTERNS = [
  /sign\s*in/i, /log\s*in/i, /log\s*on/i,
  /authentication/i, /authenticate/i,
  /password/i, /forgot\s*password/i,
  /create\s*account/i, /register/i,
  /sso/i, /oauth/i, /saml/i,
];

const GENERIC_PAGE_PATTERNS = [
  /access\s*denied/i, /403\s*forbidden/i, /401\s*unauthorized/i,
  /not\s*found/i, /404\s*error/i,
  /maintenance/i, /under\s*construction/i,
  /please\s*enable\s*javascript/i,
  /captcha/i, /prove\s*you['']?re\s*human/i,
];

const PAYWALL_PATTERNS = [
  /subscribe\s*to\s*continue/i, /subscription\s*required/i,
  /premium\s*content/i, /unlock\s*this\s*article/i,
  /free\s*trial/i, /start\s*your\s*free/i,
];

interface PageAnalysis {
  page_type: 'content' | 'login' | 'generic' | 'paywall' | 'error';
  warnings: string[];
  extraction_quality: 'high' | 'medium' | 'low';
  is_login_page: boolean;
  is_generic_page: boolean;
}

function analyzePageContent(html: string, textContent: string): PageAnalysis {
  const warnings: string[] = [];
  let page_type: PageAnalysis['page_type'] = 'content';
  let extraction_quality: PageAnalysis['extraction_quality'] = 'high';
  let is_login_page = false;
  let is_generic_page = false;

  // Check for login page patterns
  const loginMatches = LOGIN_PATTERNS.filter(p => p.test(html));
  if (loginMatches.length >= 2 && textContent.length < 2000) {
    is_login_page = true;
    page_type = 'login';
    warnings.push('This page appears to require login/authentication');
    extraction_quality = 'low';
  }

  // Check for generic/error page patterns
  const genericMatches = GENERIC_PAGE_PATTERNS.filter(p => p.test(html));
  if (genericMatches.length >= 1) {
    is_generic_page = true;
    page_type = 'generic';
    warnings.push('This page appears to be an error or generic page');
    extraction_quality = 'low';
  }

  // Check for paywall patterns
  const paywallMatches = PAYWALL_PATTERNS.filter(p => p.test(html));
  if (paywallMatches.length >= 1) {
    page_type = 'paywall';
    warnings.push('This page may be behind a paywall');
    extraction_quality = 'low';
  }

  // Check content quality
  if (textContent.length < 200) {
    warnings.push('Very little content was extracted');
    extraction_quality = 'low';
  } else if (textContent.length < 500) {
    if (extraction_quality === 'high') extraction_quality = 'medium';
    warnings.push('Limited content was extracted');
  }

  // Check for mostly navigation/boilerplate
  const wordCount = textContent.split(/\s+/).length;
  const avgWordLength = textContent.length / Math.max(wordCount, 1);
  if (avgWordLength < 3 || wordCount < 50) {
    if (extraction_quality === 'high') extraction_quality = 'medium';
    warnings.push('Content may be mostly navigation or boilerplate');
  }

  return { page_type, warnings, extraction_quality, is_login_page, is_generic_page };
}

function extractPageMetadata(html: string, url: string) {
  let pageTitle = '';
  let pageExcerpt = '';
  let pageThumbnail = '';

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    pageTitle = titleMatch[1].trim();
  }

  // Try og:title as fallback
  if (!pageTitle) {
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitleMatch) pageTitle = ogTitleMatch[1].trim();
  }

  // Extract description/excerpt
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch) {
    pageExcerpt = descMatch[1].trim();
  }
  
  // Try og:description as fallback
  if (!pageExcerpt) {
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDescMatch) pageExcerpt = ogDescMatch[1].trim();
  }

  // Extract thumbnail
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    pageThumbnail = ogImageMatch[1].trim();
    // Make relative URLs absolute
    if (pageThumbnail.startsWith('/')) {
      try {
        const urlObj = new URL(url);
        pageThumbnail = `${urlObj.protocol}//${urlObj.host}${pageThumbnail}`;
      } catch {}
    }
  }

  // Extract domain
  let pageDomain = '';
  try {
    const urlObj = new URL(url);
    pageDomain = urlObj.hostname.replace(/^www\./, '');
  } catch {}

  return { pageTitle, pageExcerpt, pageThumbnail, pageDomain };
}

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
    let html = '';
    let pageMetadata = { pageTitle: '', pageExcerpt: '', pageThumbnail: '', pageDomain: '' };
    let pageAnalysis: PageAnalysis;
    
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
        if (response.status === 403 || response.status === 401) {
          return new Response(
            JSON.stringify({ 
              error: 'LOGIN_REQUIRED: This website blocks external access or requires login.',
              page_type: 'login',
              needs_action: true
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 404) {
          return new Response(
            JSON.stringify({ 
              error: 'Page not found. Please check the URL is correct.',
              page_type: 'error'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unable to access this page (${response.status}). Please try a different URL or report this issue.`);
      }

      html = await response.text();
      
      // Extract metadata
      pageMetadata = extractPageMetadata(html, url);
      
      // Use provided title or extracted title
      const finalTitle = title || pageMetadata.pageTitle || url;

      // Extract text content from HTML
      let cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

      pageContent = cleanHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

      // Analyze the page
      pageAnalysis = analyzePageContent(html, pageContent);

      console.log(`Page analysis: ${JSON.stringify(pageAnalysis)}`);

      // If it's a login or generic page, return early with preview info
      if (pageAnalysis.is_login_page || pageAnalysis.is_generic_page) {
        return new Response(
          JSON.stringify({
            success: false,
            needs_action: true,
            page_type: pageAnalysis.page_type,
            warnings: pageAnalysis.warnings,
            preview: {
              title: finalTitle,
              excerpt: pageMetadata.pageExcerpt,
              domain: pageMetadata.pageDomain,
              thumbnail: pageMetadata.pageThumbnail,
            },
            message: pageAnalysis.is_login_page 
              ? 'This page requires login. Would you like to keep this content anyway, delete it, or try another URL?'
              : 'This appears to be an error or generic page. Would you like to keep this content anyway, delete it, or try another URL?'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!pageContent || pageContent.length < 50) {
        return new Response(
          JSON.stringify({ 
            error: 'Could not extract meaningful content from the URL',
            page_type: 'error',
            extraction_quality: 'low'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Extracted ${pageContent.length} characters from URL`);

      // Create the document record with enhanced metadata
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          space_id,
          filename: finalTitle,
          file_type: 'url',
          content_text: pageContent,
          status: 'indexing',
          source_url: url,
          page_title: pageMetadata.pageTitle,
          page_excerpt: pageMetadata.pageExcerpt,
          page_thumbnail_url: pageMetadata.pageThumbnail,
          page_domain: pageMetadata.pageDomain,
          extraction_quality: pageAnalysis.extraction_quality,
          text_length: pageContent.length,
          is_image_only: false,
          extraction_warnings: pageAnalysis.warnings.length > 0 ? pageAnalysis.warnings : null,
          visibility: 'public',
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
          document: { ...document, status: 'ready' },
          preview: {
            title: finalTitle,
            excerpt: pageMetadata.pageExcerpt,
            domain: pageMetadata.pageDomain,
            thumbnail: pageMetadata.pageThumbnail,
            page_type: pageAnalysis.page_type,
            warnings: pageAnalysis.warnings,
          },
          extraction_quality: pageAnalysis.extraction_quality,
          text_length: pageContent.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError: unknown) {
      console.error('Fetch error:', fetchError);
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL: ${message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    console.error('Scrape URL error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
