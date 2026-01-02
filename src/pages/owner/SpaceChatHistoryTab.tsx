import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Bot, MessageSquare, Cpu } from 'lucide-react';
import { format } from 'date-fns';
import { getModelLabel } from '@/lib/modelUtils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  share_link_id: string;
  ai_model?: string | null;
}

interface ShareLink {
  id: string;
  name: string | null;
  token: string;
}

interface SpaceChatHistoryTabProps {
  spaceId: string;
}

export default function SpaceChatHistoryTab({ spaceId }: SpaceChatHistoryTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [shareLinks, setShareLinks] = useState<Map<string, ShareLink>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [spaceId]);

  const fetchData = async () => {
    try {
      // Fetch share links for this space
      const { data: linksData } = await supabase
        .from('share_links')
        .select('id, name, token')
        .eq('space_id', spaceId);

      const linksMap = new Map<string, ShareLink>();
      linksData?.forEach(link => linksMap.set(link.id, link));
      setShareLinks(linksMap);

      // Fetch chat messages for this space
      const { data: messagesData, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, created_at, share_link_id, ai_model')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setMessages((messagesData || []) as ChatMessage[]);
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group messages by share_link_id and session (messages within 30 min)
  const groupedSessions = messages.reduce((acc, msg) => {
    const linkId = msg.share_link_id;
    if (!acc[linkId]) acc[linkId] = [];
    acc[linkId].push(msg);
    return acc;
  }, {} as Record<string, ChatMessage[]>);

  const filteredSessions = selectedLinkId 
    ? { [selectedLinkId]: groupedSessions[selectedLinkId] || [] }
    : groupedSessions;

  const uniqueLinkIds = Array.from(new Set(messages.map(m => m.share_link_id)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground">No chat history yet</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Visitor conversations will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter by link */}
      {uniqueLinkIds.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedLinkId(null)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              !selectedLinkId 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            All Links
          </button>
          {uniqueLinkIds.map(linkId => {
            const link = shareLinks.get(linkId);
            return (
              <button
                key={linkId}
                onClick={() => setSelectedLinkId(linkId)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  selectedLinkId === linkId 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {link?.name || `Link ${linkId.slice(0, 8)}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat sessions */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {Object.entries(filteredSessions).map(([linkId, linkMessages]) => {
            const link = shareLinks.get(linkId);
            const sortedMessages = [...linkMessages].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            return (
              <Card key={linkId}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {link?.name || `Link: ${link?.token.slice(0, 12)}...`}
                    <span className="ml-2 text-xs">
                      ({linkMessages.length} messages)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sortedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'flex-row' : 'flex-row'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'user' 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium capitalize">{msg.role}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                          </span>
                          {msg.role === 'assistant' && msg.ai_model && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4 gap-1">
                              <Cpu className="w-2.5 h-2.5" />
                              {getModelLabel(msg.ai_model)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}