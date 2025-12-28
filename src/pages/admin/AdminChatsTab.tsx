import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';

interface ChatSummary {
  share_link_id: string;
  space_name: string;
  owner_email: string | null;
  messages_count: number;
  last_message_at: string;
}

export function AdminChatsTab() {
  const { data: chats, isLoading } = useQuery({
    queryKey: ['admin', 'chats'],
    queryFn: async () => {
      // Get all chat messages
      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      // Get all spaces
      const { data: spaces, error: spacesError } = await supabase
        .from('spaces')
        .select('id, name, owner_id');

      if (spacesError) throw spacesError;

      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;

      // Create lookups
      const spaceMap = new Map(spaces?.map(s => [s.id, s]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Group messages by share_link_id
      const chatGroups = new Map<string, typeof messages>();
      messages?.forEach(msg => {
        const existing = chatGroups.get(msg.share_link_id) || [];
        existing.push(msg);
        chatGroups.set(msg.share_link_id, existing);
      });

      // Create chat summaries
      const summaries: ChatSummary[] = [];
      chatGroups.forEach((msgs, shareLinkId) => {
        const firstMsg = msgs[0];
        const space = spaceMap.get(firstMsg.space_id);
        const owner = space ? profileMap.get(space.owner_id) : null;

        summaries.push({
          share_link_id: shareLinkId,
          space_name: space?.name || 'Unknown Space',
          owner_email: owner?.email || null,
          messages_count: msgs.length,
          last_message_at: msgs[0].created_at,
        });
      });

      // Sort by last message
      summaries.sort((a, b) => 
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

      return summaries;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chat Sessions</CardTitle>
          <CardDescription>Loading chat data...</CardDescription>
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

  const totalMessages = chats?.reduce((sum, c) => sum + c.messages_count, 0) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Chat Sessions ({chats?.length || 0})
        </CardTitle>
        <CardDescription>
          Total messages: {totalMessages}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Space</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead className="text-center">Messages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chats?.map(chat => (
              <TableRow key={chat.share_link_id}>
                <TableCell className="font-medium">{chat.space_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {chat.owner_email || 'Unknown'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(chat.last_message_at), 'MMM d, yyyy h:mm a')}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{chat.messages_count}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {(!chats || chats.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No chat sessions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
