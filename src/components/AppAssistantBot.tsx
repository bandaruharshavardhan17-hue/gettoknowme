import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Pre-defined responses for common app usage questions
const APP_HELP_RESPONSES: Record<string, string> = {
  'create space': 'To create a new Space, click the "New Space" button on the Spaces page. Give it a name and optional description, then click "Create Space".',
  'upload document': 'Open a Space and go to the Documents tab. You can upload files by clicking "Upload", paste text using the "Note" tab, record voice notes with "Voice", or scrape web pages with "URL".',
  'share': 'Each Space has a shareable link. Go to your Space, and you\'ll find the share link in the header. You can copy it, view the QR code, or enable/disable the link.',
  'visibility': 'You can set document visibility to Public, Internal, or Owner Only. Public documents are visible in shared chats, Internal are for your reference, and Owner Only are private.',
  'ai model': 'You can change the AI model in your Space settings. Options include Fast (gpt-4o-mini), Pro (gpt-4o), Balanced (gpt-4-turbo), and Economy (gpt-3.5-turbo).',
  'persona': 'Configure how your AI responds in Settings → AI Persona. Set the tone, style, audience, and what topics to avoid.',
  'fallback': 'Set a fallback message in Settings for when the AI can\'t find relevant information in your documents.',
  'delete': 'To delete a document, hover over it in the document list and click the trash icon. To delete a Space, go to the Space and look for delete options in settings.',
  'analytics': 'View your Space analytics in the Analytics tab. See message counts, visitor engagement, and document coverage.',
};

export function AppAssistantBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m your app assistant. Ask me anything about using Know Me - creating spaces, uploading documents, sharing, or managing your AI persona.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const findBestResponse = (query: string): string | null => {
    const lowerQuery = query.toLowerCase();
    
    for (const [key, response] of Object.entries(APP_HELP_RESPONSES)) {
      if (lowerQuery.includes(key)) {
        return response;
      }
    }
    
    // Keyword matching
    if (lowerQuery.includes('how') || lowerQuery.includes('what')) {
      if (lowerQuery.includes('space') && (lowerQuery.includes('create') || lowerQuery.includes('new') || lowerQuery.includes('make'))) {
        return APP_HELP_RESPONSES['create space'];
      }
      if (lowerQuery.includes('upload') || lowerQuery.includes('add') && lowerQuery.includes('document')) {
        return APP_HELP_RESPONSES['upload document'];
      }
      if (lowerQuery.includes('share') || lowerQuery.includes('link')) {
        return APP_HELP_RESPONSES['share'];
      }
      if (lowerQuery.includes('model') || lowerQuery.includes('gpt')) {
        return APP_HELP_RESPONSES['ai model'];
      }
      if (lowerQuery.includes('persona') || lowerQuery.includes('tone') || lowerQuery.includes('style')) {
        return APP_HELP_RESPONSES['persona'];
      }
    }
    
    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // First try local responses
      const localResponse = findBestResponse(userMessage);
      
      if (localResponse) {
        setMessages(prev => [...prev, { role: 'assistant', content: localResponse }]);
      } else {
        // Use edge function for more complex questions
        const { data, error } = await supabase.functions.invoke('app-assistant', {
          body: { 
            message: userMessage,
            user_id: user?.id 
          }
        });

        if (error) throw error;

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data?.answer || 'I can help you with using Know Me - creating spaces, uploading documents, sharing links, and configuring your AI persona. What would you like to know?'
        }]);
      }
    } catch (error) {
      console.error('Assistant error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I can help with app features like creating spaces, uploading documents, sharing, and AI settings. What would you like to know?' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg z-50",
          "gradient-primary text-primary-foreground",
          "hover:scale-105 transition-transform",
          isOpen && "hidden"
        )}
        size="icon"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-card border border-border rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">App Assistant</h3>
                <p className="text-xs text-muted-foreground">Help with using Know Me</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about app features..."
                className="flex-1"
                disabled={loading}
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
