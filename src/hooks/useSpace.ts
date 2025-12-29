/**
 * useSpace Hook
 * 
 * Manages single space state and operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { spacesService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import type { Space, UpdateSpacePayload } from '@/types';

interface UseSpaceOptions {
  spaceId: string;
}

interface UseSpaceReturn {
  space: Space | null;
  loading: boolean;
  update: (payload: UpdateSpacePayload) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useSpace({ spaceId }: UseSpaceOptions): UseSpaceReturn {
  const [space, setSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const data = await spacesService.getById(spaceId);
      setSpace(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load space',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [spaceId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(async (payload: UpdateSpacePayload): Promise<boolean> => {
    try {
      const updated = await spacesService.update(spaceId, payload);
      setSpace(updated);
      return true;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update space',
        variant: 'destructive',
      });
      return false;
    }
  }, [spaceId, toast]);

  return { space, loading, update, refresh };
}
