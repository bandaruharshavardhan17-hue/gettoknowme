import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export function useIsAdmin() {
  const { user } = useAuth();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await supabase
        .rpc('has_role', { _user_id: user.id, _role: 'admin' });
      
      if (error) {
        console.error('Error checking admin role:', error);
        return false;
      }
      
      return data === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return { isAdmin: isAdmin ?? false, isLoading };
}
