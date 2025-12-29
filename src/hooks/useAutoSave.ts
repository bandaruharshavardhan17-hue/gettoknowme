/**
 * useAutoSave Hook
 * 
 * Debounced auto-save with save status tracking.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { UI } from '@/constants';

interface UseAutoSaveOptions {
  onSave: (value: string) => Promise<void>;
  debounceMs?: number;
}

interface UseAutoSaveReturn {
  value: string;
  setValue: (newValue: string) => void;
  isSaving: boolean;
  isSaved: boolean;
  reset: (newValue: string) => void;
}

export function useAutoSave({ 
  onSave, 
  debounceMs = UI.AUTOSAVE_DEBOUNCE 
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [value, setValueState] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setValue = useCallback((newValue: string) => {
    setValueState(newValue);
    setIsSaved(false);

    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
    }

    // Debounce save
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onSave(newValue);
        setIsSaved(true);
        
        // Hide "Saved" indicator after delay
        savedTimeoutRef.current = setTimeout(() => {
          setIsSaved(false);
        }, UI.SAVED_INDICATOR_DURATION);
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);
  }, [onSave, debounceMs]);

  const reset = useCallback((newValue: string) => {
    setValueState(newValue);
    setIsSaved(false);
    setIsSaving(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  return { value, setValue, isSaving, isSaved, reset };
}
