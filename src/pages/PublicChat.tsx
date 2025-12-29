import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { 
  Send, Loader2, Sparkles, User, AlertCircle, BookOpen, 
  Mic, MicOff, Volume2, VolumeX, Square, Download, X
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
}

interface SpaceInfo {
  name: string;
  description: string | null;
}

export default function PublicChat() {
  const { token } = useParams<{ token: string }>();
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Voice recording hook
  const { isRecording, isProcessing, toggleRecording } = useVoiceRecording({
    onTranscript: (text) => {
      setInput(prev => prev ? `${prev} ${text}` : text);
    },
    onError: (error) => {
      toast({
        title: 'Voice Error',
        description: error,
        variant: 'destructive',
      });
    },
  });
  
  // Text-to-speech hook
  const { speak, stop, isPlaying, isLoading: ttsLoading } = useTextToSpeech({
    onError: (error) => {
      toast({
        title: 'TTS Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    validateToken();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const validateToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('public-chat', {
        body: { token, action: 'validate' }
      });

      if (error) throw error;
      if (!data.valid) throw new Error(data.message || 'Invalid or expired link');

      setSpaceInfo(data.space);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat');
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setSending(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          token, 
          action: 'chat',
          message: userMessage,
          history: messages.slice(-10) // Send last 10 messages for context
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment.');
        }
        if (response.status === 402) {
          throw new Error('Service temporarily unavailable.');
        }
        throw new Error('Failed to get response');
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let citations: string[] = [];

      if (reader) {
        let textBuffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          textBuffer += decoder.decode(value, { stream: true });
          
          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;
            
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(jsonStr);
              
              // Check for citations in the response
              if (parsed.citations) {
                citations = parsed.citations;
              }
              
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                assistantContent += content;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return prev.map((m, i) => 
                      i === prev.length - 1 ? { ...m, content: assistantContent, citations } : m
                    );
                  }
                  return [...prev, { role: 'assistant', content: assistantContent, citations }];
                });
              }
            } catch {
              textBuffer = line + '\n' + textBuffer;
              break;
            }
          }
        }
      }
      
      // Auto-play TTS if enabled and we have content
      if (autoPlayTTS && assistantContent.trim()) {
        speak(assistantContent);
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to send message',
        variant: 'destructive',
      });
      setMessages(prev => prev.slice(0, -1)); // Remove the user message on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const downloadChat = () => {
    if (messages.length === 0) {
      toast({
        title: 'No messages',
        description: 'Start a conversation first to download it.',
        variant: 'destructive',
      });
      return;
    }

    const chatContent = messages.map(m => {
      const role = m.role === 'user' ? 'You' : spaceInfo?.name || 'Assistant';
      let text = `${role}:\n${m.content}`;
      if (m.citations && m.citations.length > 0) {
        text += `\n\nSources:\n${m.citations.map(c => `- "${c}"`).join('\n')}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const header = `Chat with ${spaceInfo?.name || 'Knowledge Base'}\nDownloaded: ${new Date().toLocaleString()}\n\n${'='.repeat(50)}\n\n`;
    const fullContent = header + chatContent;

    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${spaceInfo?.name?.replace(/\s+/g, '-').toLowerCase() || 'conversation'}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Chat downloaded',
      description: 'Your conversation has been saved.',
    });
  };

  const closeChat = () => {
    window.close();
    // Fallback if window.close() doesn't work (common in browsers)
    window.location.href = 'about:blank';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">Link Unavailable</h2>
            <p className="text-muted-foreground text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md shrink-0">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold truncate">{spaceInfo?.name}</h1>
              {spaceInfo?.description && (
                <p className="text-sm text-muted-foreground truncate">{spaceInfo.description}</p>
              )}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadChat}
              disabled={messages.length === 0}
              className="hidden sm:flex"
            >
              <Download className="w-4 h-4 mr-2" />
              Save Chat
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={downloadChat}
              disabled={messages.length === 0}
              className="sm:hidden"
              title="Save chat"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCloseDialog(true)}
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 container px-4 py-6 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 animate-float">
              <BookOpen className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-2">Ask me anything!</h2>
            <p className="text-muted-foreground max-w-md">
              I can answer questions based on the documents in this knowledge base. 
              What would you like to know?
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 animate-fade-in ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  message.role === 'user' 
                    ? 'bg-primary text-primary-foreground'
                    : 'gradient-primary text-primary-foreground'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>
                
                <div className={`flex-1 max-w-[80%] ${
                  message.role === 'user' ? 'text-right' : ''
                }`}>
                  <Card className={`inline-block ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card'
                  }`}>
                    <CardContent className="p-3">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <p className="text-xs font-medium mb-2 opacity-70">Sources:</p>
                          <div className="space-y-1">
                            {message.citations.map((citation, i) => (
                              <p key={i} className="text-xs opacity-60 italic">
                                "{citation}"
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* TTS button for assistant messages */}
                      {message.role === 'assistant' && message.content && (
                        <div className="mt-2 pt-2 border-t border-border/20">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => isPlaying ? stop() : speak(message.content)}
                            disabled={ttsLoading}
                            className="h-7 px-2 text-xs"
                          >
                            {ttsLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : isPlaying ? (
                              <Square className="w-3 h-3 mr-1" />
                            ) : (
                              <Volume2 className="w-3 h-3 mr-1" />
                            )}
                            {isPlaying ? 'Stop' : 'Listen'}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ))}
            
            {sending && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <Card className="inline-block">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-muted-foreground">Thinking...</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <footer className="sticky bottom-0 backdrop-blur-md bg-background/80 border-t border-border/50 p-4">
        <div className="container max-w-3xl mx-auto">
          {/* Auto TTS Toggle */}
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoPlayTTS(!autoPlayTTS)}
              className={`h-7 px-2 text-xs ${autoPlayTTS ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {autoPlayTTS ? (
                <Volume2 className="w-3 h-3 mr-1" />
              ) : (
                <VolumeX className="w-3 h-3 mr-1" />
              )}
              Auto-read answers
            </Button>
          </div>
          
          <div className="flex gap-2">
            {/* Voice Input Button */}
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={toggleRecording}
              disabled={isProcessing || sending}
              className={`shrink-0 ${isRecording ? 'animate-pulse' : ''}`}
              title={isRecording ? 'Stop recording' : 'Start voice input'}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
            
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={isRecording ? "Listening..." : "Ask a question..."}
              disabled={sending || isRecording}
              className="flex-1"
            />
            <Button 
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="gradient-primary text-primary-foreground shrink-0"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {isRecording ? 'Speak now... click mic to stop' : 'Type or speak your question'}
          </p>
        </div>
      </footer>

      {/* Close Chat Confirmation Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {messages.length > 0 
                ? "Your conversation will not be saved. Would you like to download it first?"
                : "Are you sure you want to close this chat?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {messages.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => {
                  downloadChat();
                  setShowCloseDialog(false);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download & Stay
              </Button>
            )}
            <AlertDialogAction onClick={closeChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Close Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
