/**
 * useShareLink Hook
 * 
 * Manages share link for a space.
 */

import { useState, useEffect, useCallback } from 'react';
import { shareLinksService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import type { ShareLink } from '@/types';

interface UseShareLinkOptions {
  spaceId: string;
}

interface UseShareLinkReturn {
  shareLink: ShareLink | null;
  loading: boolean;
  creating: boolean;
  create: (name?: string) => Promise<ShareLink | null>;
  getShareUrl: () => string | null;
}

export function useShareLink({ spaceId }: UseShareLinkOptions): UseShareLinkReturn {
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const fetchLink = useCallback(async () => {
    try {
      const link = await shareLinksService.getBySpaceId(spaceId);
      setShareLink(link);
    } catch (error) {
      // No link exists, which is fine
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  const create = useCallback(async (name?: string): Promise<ShareLink | null> => {
    setCreating(true);
    try {
      const link = await shareLinksService.create(spaceId, name);
      setShareLink(link);
      toast({
        title: 'Chat link created!',
        description: 'Your shareable chat link is ready',
      });
      return link;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create chat link',
        variant: 'destructive',
      });
      return null;
    } finally {
      setCreating(false);
    }
  }, [spaceId, toast]);

  const getShareUrl = useCallback((): string | null => {
    if (!shareLink) return null;
    return `${window.location.origin}/chat/${shareLink.token}`;
  }, [shareLink]);

  return { shareLink, loading, creating, create, getShareUrl };
}
