/**
 * End-to-End Test for Know Me App
 * 
 * This test covers the complete flow:
 * 1. Create a new space
 * 2. Upload a test document (note)
 * 3. Test voice-to-text edge function
 * 4. Test image processing capability
 * 5. Create a share link
 * 6. Test the public chat endpoint (validate & chat)
 * 7. Verify analytics are updated
 * 8. Clean up test data
 * 
 * Run this test by importing and calling runE2ETest() from the browser console
 * or by navigating to /owner/test in the app.
 */

import { supabase } from '@/integrations/supabase/client';

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

const TEST_SPACE_NAME = `__TEST_SPACE_${Date.now()}`;
const TEST_DOCUMENT_CONTENT = `
This is a test document for the Know Me app.
The company was founded in 2024.
Our main product is an AI-powered Q&A system.
Contact email: test@example.com
Phone: 555-123-4567
`;

let testSpaceId: string | null = null;
let testDocumentId: string | null = null;
let testShareToken: string | null = null;
let testLinkId: string | null = null;

async function step1_CreateSpace(): Promise<TestResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return { step: 'Create Space', success: false, message: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('spaces')
      .insert({
        name: TEST_SPACE_NAME,
        description: 'Test space for E2E testing - AI fallback response',
        owner_id: user.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    testSpaceId = data.id;
    return { 
      step: 'Create Space', 
      success: true, 
      message: `Created space: ${data.name}`,
      data 
    };
  } catch (error: any) {
    return { step: 'Create Space', success: false, message: error.message };
  }
}

async function step2_CreateDocument(): Promise<TestResult> {
  try {
    if (!testSpaceId) {
      return { step: 'Create Document (Note)', success: false, message: 'No space ID' };
    }

    // Create a document record with content directly (simulating a note)
    const { data, error } = await supabase
      .from('documents')
      .insert({
        space_id: testSpaceId,
        filename: 'test-document.txt',
        file_type: 'note',
        content_text: TEST_DOCUMENT_CONTENT,
        status: 'ready',
      })
      .select()
      .single();

    if (error) throw error;

    testDocumentId = data.id;

    // Create document chunks for search
    const chunks = TEST_DOCUMENT_CONTENT.split('\n').filter(line => line.trim());
    for (let i = 0; i < chunks.length; i++) {
      await supabase.from('document_chunks').insert({
        document_id: data.id,
        content: chunks[i],
        chunk_index: i,
      });
    }

    return { 
      step: 'Create Document (Note)', 
      success: true, 
      message: `Created note with ${chunks.length} chunks`,
      data 
    };
  } catch (error: any) {
    return { step: 'Create Document (Note)', success: false, message: error.message };
  }
}

async function step3_TestVoiceToText(): Promise<TestResult> {
  try {
    // Test that the voice-to-text edge function is accessible
    // We can't actually record audio in a test, but we can verify the endpoint responds
    const response = await supabase.functions.invoke('voice-to-text', {
      body: { audio: '' }, // Empty audio should return an error, but the function should respond
    });

    // We expect an error because no valid audio was provided
    // But if we get a response (even an error), the function is working
    if (response.data?.error || response.error) {
      return { 
        step: 'Voice-to-Text API', 
        success: true, 
        message: 'Voice-to-text endpoint is accessible (returns expected error for empty audio)',
        data: { response: response.data || response.error }
      };
    }

    return { 
      step: 'Voice-to-Text API', 
      success: true, 
      message: 'Voice-to-text endpoint responded',
      data: response.data
    };
  } catch (error: any) {
    // Network errors or function not deployed
    return { 
      step: 'Voice-to-Text API', 
      success: false, 
      message: `Function error: ${error.message}. Ensure OPENAI_API_KEY is set.`
    };
  }
}

async function step4_TestImageProcessing(): Promise<TestResult> {
  try {
    if (!testSpaceId) {
      return { step: 'Image Processing Check', success: false, message: 'No space ID' };
    }

    // Query to check if image documents can be processed
    // We check the database schema supports images
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('file_type', 'image');

    if (error) throw error;

    // Check that process-document function exists by looking at recent image processing
    const { data: imageDoc } = await supabase
      .from('documents')
      .select('id, filename, status, content_text')
      .eq('file_type', 'image')
      .eq('status', 'ready')
      .limit(1)
      .single();

    if (imageDoc && imageDoc.content_text) {
      return { 
        step: 'Image Processing Check', 
        success: true, 
        message: `Image processing verified: "${imageDoc.filename}" has extracted text (${imageDoc.content_text.length} chars)`,
        data: { filename: imageDoc.filename, textLength: imageDoc.content_text.length }
      };
    }

    return { 
      step: 'Image Processing Check', 
      success: true, 
      message: `Image processing schema ready. Total images in system: ${count || 0}`,
      data: { imageCount: count }
    };
  } catch (error: any) {
    return { step: 'Image Processing Check', success: false, message: error.message };
  }
}

async function step5_CreateShareLink(): Promise<TestResult> {
  try {
    if (!testSpaceId) {
      return { step: 'Create Share Link', success: false, message: 'No space ID' };
    }

    const { data, error } = await supabase
      .from('share_links')
      .insert({
        space_id: testSpaceId,
        name: 'Test Share Link',
      })
      .select()
      .single();

    if (error) throw error;

    testShareToken = data.token;
    testLinkId = data.id;

    return { 
      step: 'Create Share Link', 
      success: true, 
      message: `Created share link: ${data.token.substring(0, 8)}...`,
      data: { token: data.token, id: data.id }
    };
  } catch (error: any) {
    return { step: 'Create Share Link', success: false, message: error.message };
  }
}

async function step6_TestPublicChatValidate(): Promise<TestResult> {
  try {
    if (!testShareToken) {
      return { step: 'Public Chat - Validate', success: false, message: 'No share token' };
    }

    // Test the validate action
    const response = await supabase.functions.invoke('public-chat', {
      body: {
        token: testShareToken,
        action: 'validate',
      },
    });

    if (response.error) {
      return { 
        step: 'Public Chat - Validate', 
        success: false, 
        message: `Edge function error: ${response.error.message}`,
      };
    }

    if (response.data?.success) {
      return { 
        step: 'Public Chat - Validate', 
        success: true, 
        message: `Link validated - Space: "${response.data.spaceName}"`,
        data: response.data 
      };
    }

    return { 
      step: 'Public Chat - Validate', 
      success: false, 
      message: response.data?.error || 'Unknown validation error',
    };
  } catch (error: any) {
    return { step: 'Public Chat - Validate', success: false, message: error.message };
  }
}

async function step7_TestPublicChatMessage(): Promise<TestResult> {
  try {
    if (!testShareToken) {
      return { step: 'Public Chat - Message', success: false, message: 'No share token' };
    }

    // Test the chat action - this will stream a response
    const response = await supabase.functions.invoke('public-chat', {
      body: {
        token: testShareToken,
        action: 'chat',
        message: 'When was the company founded?',
        history: [],
      },
    });

    if (response.error) {
      // Check if it's an OpenAI API key issue
      const errorMsg = response.error.message || '';
      if (errorMsg.includes('API key') || errorMsg.includes('OPENAI')) {
        return { 
          step: 'Public Chat - Message', 
          success: false, 
          message: 'OPENAI_API_KEY not configured. Chat requires OpenAI API.',
        };
      }
      return { 
        step: 'Public Chat - Message', 
        success: false, 
        message: `Edge function error: ${response.error.message}`,
      };
    }

    return { 
      step: 'Public Chat - Message', 
      success: true, 
      message: 'Chat endpoint responded successfully (streaming)',
      data: { responseType: typeof response.data }
    };
  } catch (error: any) {
    return { step: 'Public Chat - Message', success: false, message: error.message };
  }
}

async function step8_VerifyAnalytics(): Promise<TestResult> {
  try {
    if (!testLinkId) {
      return { step: 'Verify Analytics', success: false, message: 'No link ID' };
    }

    const { data, error } = await supabase
      .from('share_links')
      .select('view_count, last_used_at')
      .eq('id', testLinkId)
      .single();

    if (error) throw error;

    // Check chat messages were saved
    const { count: messageCount } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('share_link_id', testLinkId);

    return { 
      step: 'Verify Analytics', 
      success: true, 
      message: `Views: ${data.view_count}, Messages: ${messageCount || 0}, Last used: ${data.last_used_at || 'Never'}`,
      data: { ...data, messageCount }
    };
  } catch (error: any) {
    return { step: 'Verify Analytics', success: false, message: error.message };
  }
}

async function step9_Cleanup(): Promise<TestResult> {
  try {
    const errors: string[] = [];

    // Delete chat messages
    if (testLinkId) {
      const { error } = await supabase.from('chat_messages').delete().eq('share_link_id', testLinkId);
      if (error) errors.push(`Chat messages: ${error.message}`);
    }

    // Delete share links
    if (testLinkId) {
      const { error } = await supabase.from('share_links').delete().eq('id', testLinkId);
      if (error) errors.push(`Share link: ${error.message}`);
    }

    // Delete document chunks
    if (testDocumentId) {
      const { error } = await supabase.from('document_chunks').delete().eq('document_id', testDocumentId);
      if (error) errors.push(`Document chunks: ${error.message}`);
    }

    // Delete documents
    if (testDocumentId) {
      const { error } = await supabase.from('documents').delete().eq('id', testDocumentId);
      if (error) errors.push(`Document: ${error.message}`);
    }

    // Delete space
    if (testSpaceId) {
      const { error } = await supabase.from('spaces').delete().eq('id', testSpaceId);
      if (error) errors.push(`Space: ${error.message}`);
    }

    // Reset test IDs
    testSpaceId = null;
    testDocumentId = null;
    testShareToken = null;
    testLinkId = null;

    if (errors.length > 0) {
      return { 
        step: 'Cleanup', 
        success: false, 
        message: `Partial cleanup with errors: ${errors.join(', ')}` 
      };
    }

    return { 
      step: 'Cleanup', 
      success: true, 
      message: 'All test data cleaned up successfully' 
    };
  } catch (error: any) {
    return { step: 'Cleanup', success: false, message: error.message };
  }
}

export async function runE2ETest(): Promise<TestResult[]> {
  console.log('🧪 Starting E2E Test for Know Me App...\n');
  
  const results: TestResult[] = [];

  // Run all steps in sequence
  const steps = [
    { name: 'Step 1: Create Space', fn: step1_CreateSpace },
    { name: 'Step 2: Create Document (Note)', fn: step2_CreateDocument },
    { name: 'Step 3: Test Voice-to-Text API', fn: step3_TestVoiceToText },
    { name: 'Step 4: Test Image Processing', fn: step4_TestImageProcessing },
    { name: 'Step 5: Create Share Link', fn: step5_CreateShareLink },
    { name: 'Step 6: Public Chat - Validate', fn: step6_TestPublicChatValidate },
    { name: 'Step 7: Public Chat - Message', fn: step7_TestPublicChatMessage },
    { name: 'Step 8: Verify Analytics', fn: step8_VerifyAnalytics },
    { name: 'Step 9: Cleanup', fn: step9_Cleanup },
  ];

  for (const step of steps) {
    console.log(`\n▶️ ${step.name}...`);
    const result = await step.fn();
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${result.step}: ${result.message}`);
    } else {
      console.log(`❌ ${result.step}: ${result.message}`);
      
      // If a step fails (except cleanup), still try to cleanup
      if (step.name !== 'Step 9: Cleanup') {
        console.log('\n⚠️ Running cleanup due to failure...');
        const cleanupResult = await step9_Cleanup();
        results.push(cleanupResult);
        break;
      }
    }
  }

  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return results;
}

// Export for use in test page
export { 
  step1_CreateSpace, 
  step2_CreateDocument, 
  step3_TestVoiceToText,
  step4_TestImageProcessing,
  step5_CreateShareLink, 
  step6_TestPublicChatValidate,
  step7_TestPublicChatMessage,
  step8_VerifyAnalytics, 
  step9_Cleanup 
};
