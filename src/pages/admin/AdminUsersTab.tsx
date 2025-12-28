import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { User, FolderOpen, FileText, Link2, Eye } from 'lucide-react';

interface ProfileWithStats {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  spaces_count: number;
  documents_count: number;
  links_count: number;
}

export function AdminUsersTab() {
  const navigate = useNavigate();
  const { startImpersonating } = useImpersonation();
  
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      // First get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get all spaces to count per user
      const { data: spaces, error: spacesError } = await supabase
        .from('spaces')
        .select('id, owner_id');

      if (spacesError) throw spacesError;

      // Get all documents
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('id, space_id');

      if (docsError) throw docsError;

      // Get all share links
      const { data: links, error: linksError } = await supabase
        .from('share_links')
        .select('id, space_id');

      if (linksError) throw linksError;

      // Create space to owner mapping
      const spaceOwnerMap = new Map<string, string>();
      spaces?.forEach(s => spaceOwnerMap.set(s.id, s.owner_id));

      // Calculate stats per user
      const usersWithStats: ProfileWithStats[] = (profiles || []).map(profile => {
        const userSpaces = spaces?.filter(s => s.owner_id === profile.id) || [];
        const userSpaceIds = new Set(userSpaces.map(s => s.id));
        
        const userDocsCount = documents?.filter(d => userSpaceIds.has(d.space_id)).length || 0;
        const userLinksCount = links?.filter(l => userSpaceIds.has(l.space_id)).length || 0;

        return {
          ...profile,
          spaces_count: userSpaces.length,
          documents_count: userDocsCount,
          links_count: userLinksCount,
        };
      });

      return usersWithStats;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Loading user data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          All Users ({users?.length || 0})
        </CardTitle>
        <CardDescription>
          View all registered users and their activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <FolderOpen className="h-4 w-4" />
                  Spaces
                </div>
              </TableHead>
              <TableHead className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <FileText className="h-4 w-4" />
                  Docs
                </div>
              </TableHead>
              <TableHead className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Link2 className="h-4 w-4" />
                  Links
                </div>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(user => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{user.display_name || 'No name'}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(user.created_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{user.spaces_count}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{user.documents_count}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{user.links_count}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      startImpersonating({
                        id: user.id,
                        email: user.email,
                        display_name: user.display_name,
                      });
                      navigate('/owner/spaces');
                    }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View As
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!users || users.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
