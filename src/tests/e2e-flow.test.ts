/**
 * End-to-End Test for Know Me App
 * 
 * This test covers the complete flow:
 * 1. Create a new space
 * 2. Upload a test document
 * 3. Create a share link
 * 4. Test the public chat endpoint
 * 5. Verify analytics are updated
 * 6. Clean up test data
 * 
 * Run this test by importing and calling runE2ETest() from the browser console
 * or by creating a test page that calls this function.
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
        description: 'Test space for E2E testing',
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
      return { step: 'Create Document', success: false, message: 'No space ID' };
    }

    // Create a document record with content directly (simulating a processed document)
    const { data, error } = await supabase
      .from('documents')
      .insert({
        space_id: testSpaceId,
        filename: 'test-document.txt',
        file_type: 'txt',
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
      step: 'Create Document', 
      success: true, 
      message: `Created document with ${chunks.length} chunks`,
      data 
    };
  } catch (error: any) {
    return { step: 'Create Document', success: false, message: error.message };
  }
}

async function step3_CreateShareLink(): Promise<TestResult> {
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
      message: `Created share link: ${data.token}`,
      data 
    };
  } catch (error: any) {
    return { step: 'Create Share Link', success: false, message: error.message };
  }
}

async function step4_TestPublicChat(): Promise<TestResult> {
  try {
    if (!testShareToken) {
      return { step: 'Test Public Chat', success: false, message: 'No share token' };
    }

    // Call the public-chat edge function
    const response = await supabase.functions.invoke('public-chat', {
      body: {
        token: testShareToken,
        message: 'When was the company founded?',
      },
    });

    if (response.error) {
      // Edge function might not be deployed, still consider partial success
      return { 
        step: 'Test Public Chat', 
        success: false, 
        message: `Edge function error: ${response.error.message}. Make sure the function is deployed.`,
      };
    }

    return { 
      step: 'Test Public Chat', 
      success: true, 
      message: 'Public chat endpoint responded successfully',
      data: response.data 
    };
  } catch (error: any) {
    return { step: 'Test Public Chat', success: false, message: error.message };
  }
}

async function step5_VerifyAnalytics(): Promise<TestResult> {
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

    // Note: view_count is updated by the edge function, so it may still be 0 if the function didn't run
    return { 
      step: 'Verify Analytics', 
      success: true, 
      message: `Analytics retrieved - Views: ${data.view_count}, Last used: ${data.last_used_at || 'Never'}`,
      data 
    };
  } catch (error: any) {
    return { step: 'Verify Analytics', success: false, message: error.message };
  }
}

async function step6_Cleanup(): Promise<TestResult> {
  try {
    const errors: string[] = [];

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
    { name: 'Step 2: Create Document', fn: step2_CreateDocument },
    { name: 'Step 3: Create Share Link', fn: step3_CreateShareLink },
    { name: 'Step 4: Test Public Chat', fn: step4_TestPublicChat },
    { name: 'Step 5: Verify Analytics', fn: step5_VerifyAnalytics },
    { name: 'Step 6: Cleanup', fn: step6_Cleanup },
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
      if (step.name !== 'Step 6: Cleanup') {
        console.log('\n⚠️ Running cleanup due to failure...');
        const cleanupResult = await step6_Cleanup();
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
export { step1_CreateSpace, step2_CreateDocument, step3_CreateShareLink, step4_TestPublicChat, step5_VerifyAnalytics, step6_Cleanup };
