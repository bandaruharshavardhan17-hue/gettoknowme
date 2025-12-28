import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { FolderOpen, FileText, Link2 } from 'lucide-react';

interface SpaceWithDetails {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  owner_email: string | null;
  owner_name: string | null;
  documents_count: number;
  links_count: number;
}

export function AdminSpacesTab() {
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['admin', 'spaces'],
    queryFn: async () => {
      // Get all spaces
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (spacesError) throw spacesError;

      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, display_name');

      if (profilesError) throw profilesError;

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

      // Create profile lookup
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Enrich spaces with details
      const spacesWithDetails: SpaceWithDetails[] = (spacesData || []).map(space => {
        const owner = profileMap.get(space.owner_id);
        const docsCount = documents?.filter(d => d.space_id === space.id).length || 0;
        const linksCount = links?.filter(l => l.space_id === space.id).length || 0;

        return {
          id: space.id,
          name: space.name,
          description: space.description,
          created_at: space.created_at,
          owner_email: owner?.email || null,
          owner_name: owner?.display_name || null,
          documents_count: docsCount,
          links_count: linksCount,
        };
      });

      return spacesWithDetails;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Spaces</CardTitle>
          <CardDescription>Loading spaces...</CardDescription>
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
          <FolderOpen className="h-5 w-5" />
          All Spaces ({spaces?.length || 0})
        </CardTitle>
        <CardDescription>
          View all spaces across all users
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Space</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Created</TableHead>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces?.map(space => (
              <TableRow key={space.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{space.name}</p>
                    {space.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {space.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm">{space.owner_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{space.owner_email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(space.created_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{space.documents_count}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{space.links_count}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {(!spaces || spaces.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No spaces found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
