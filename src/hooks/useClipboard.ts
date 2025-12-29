/**
 * useClipboard Hook
 * 
 * Simplified clipboard operations with toast feedback.
 */

import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface UseClipboardReturn {
  copy: (text: string, successMessage?: string) => Promise<boolean>;
}

export function useClipboard(): UseClipboardReturn {
  const { toast } = useToast();

  const copy = useCallback(async (
    text: string, 
    successMessage = 'Copied to clipboard'
  ): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: successMessage });
      return true;
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  return { copy };
}
