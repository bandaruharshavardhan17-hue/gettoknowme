import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { WaveformIndicator } from '@/components/WaveformIndicator';
import { 
  Send, Loader2, Sparkles, User, AlertCircle, BookOpen, 
  Mic, MicOff, Volume2, VolumeX, Square, Download, X, WifiOff, RefreshCw, MessageCircle, Copy, CheckCircle
} from 'lucide-react';
import { FeedbackModal, FeedbackContext } from '@/components/FeedbackModal';
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
  role: 'user' | 'assistant' | 'error';
  content: string;
  citations?: string[];
  errorType?: 'rate_limit' | 'service_unavailable' | 'no_documents' | 'network' | 'unknown';
  retryCount?: number;
  pending?: boolean; // For queued messages waiting to be sent
}

interface SpaceInfo {
  name: string;
  description: string | null;
}

// User-friendly error messages with helpful suggestions
const getErrorMessage = (status: number, errorBody?: string): { message: string; errorType: Message['errorType'] } => {
  if (status === 429) {
    return {
      message: "You're sending messages too quickly. Please wait a moment before trying again.",
      errorType: 'rate_limit'
    };
  }
  if (status === 402) {
    return {
      message: "This service is temporarily unavailable. Please try again later.",
      errorType: 'service_unavailable'
    };
  }
  if (status === 400 && errorBody?.includes('No documents')) {
    return {
      message: "This knowledge base doesn't have any documents yet. The owner needs to upload content before questions can be answered.",
      errorType: 'no_documents'
    };
  }
  if (status >= 500) {
    return {
      message: "Something went wrong on our end. Please try again in a few moments.",
      errorType: 'service_unavailable'
    };
  }
  return {
    message: "Unable to get a response. Please check your connection and try again.",
    errorType: 'unknown'
  };
};

// Exponential backoff delay calculator
const getRetryDelay = (attempt: number): number => {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds max
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add some jitter to prevent thundering herd
  return delay + Math.random() * 1000;
};

// Custom hook for online/offline detection
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
};

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
  const [retrying, setRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackContext>('public_chat_error');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [copiedChat, setCopiedChat] = useState(false);
  const isOnline = useOnlineStatus();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queueProcessingRef = useRef(false);
  const { toast } = useToast();
  
  // Voice recording hook with waveform support
  const { isRecording, isProcessing, audioLevel, recordingDuration, toggleRecording } = useVoiceRecording({
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
    maxDurationMs: 5 * 60 * 1000, // 5 minutes max
  });
  
  // Format recording duration
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
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
      
      // Check if link is disabled (403 from backend)
      if (data.disabled) {
        setError('This link has been disabled by the owner.');
        setLoading(false);
        return;
      }
      
      if (!data.valid) throw new Error(data.message || 'Invalid or expired link');

      setSpaceInfo(data.space);
      setLoading(false);
    } catch (err: any) {
      // Handle the disabled case from error response
      if (err?.message?.includes('disabled') || err?.context?.body?.includes('disabled')) {
        setError('This link has been disabled by the owner.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load chat');
      }
      setLoading(false);
    }
  };

  const sendMessage = async (messageToSend?: string, attempt: number = 0, fromQueue: boolean = false) => {
    const userMessage = messageToSend || input.trim();
    if (!userMessage || sending || retrying) return;

    // Queue message if offline (unless already from queue processing)
    if (!isOnline && !fromQueue) {
      setInput('');
      // Add message as pending
      setMessages(prev => [...prev, { role: 'user', content: userMessage, pending: true }]);
      setMessageQueue(prev => [...prev, userMessage]);
      toast({
        title: 'Message queued',
        description: 'Your message will be sent when you reconnect.',
      });
      return;
    }

    // Only add user message on first attempt (if not already added as pending)
    if (attempt === 0 && !fromQueue) {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    }
    
    // If from queue, mark the pending message as no longer pending
    if (fromQueue && attempt === 0) {
      setMessages(prev => prev.map(m => 
        m.role === 'user' && m.content === userMessage && m.pending 
          ? { ...m, pending: false } 
          : m
      ));
    }
    
    setSending(true);
    setRetryAttempt(attempt);

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
          history: messages.filter(m => m.role !== 'error').slice(-10)
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const { message, errorType } = getErrorMessage(response.status, errorBody);
        
        // Check if we should retry (for retryable errors)
        const isRetryable = errorType === 'service_unavailable' || errorType === 'network';
        const maxRetries = 3;
        
        if (isRetryable && attempt < maxRetries) {
          const delay = getRetryDelay(attempt);
          setRetrying(true);
          setSending(false);
          
          // Show retrying message
          setMessages(prev => {
            const filtered = prev.filter(m => m.role !== 'error' || !m.retryCount);
            return [...filtered, { 
              role: 'error', 
              content: `Connection issue. Retrying in ${Math.ceil(delay / 1000)} seconds... (Attempt ${attempt + 2}/${maxRetries + 1})`,
              errorType: 'network',
              retryCount: attempt + 1
            }];
          });
          
          retryTimeoutRef.current = setTimeout(() => {
            // Remove the retrying message
            setMessages(prev => prev.filter(m => !m.retryCount));
            setRetrying(false);
            sendMessage(userMessage, attempt + 1);
          }, delay);
          return;
        }
        
        // Add final error message after all retries exhausted
        setMessages(prev => {
          const filtered = prev.filter(m => !m.retryCount);
          return [...filtered, { 
            role: 'error', 
            content: attempt > 0 
              ? `${message} We tried ${attempt + 1} times but couldn't connect.`
              : message,
            errorType
          }];
        });
        setSending(false);
        setRetrying(false);
        return;
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
      // Reset retry state on success
      setRetryAttempt(0);
      setRetrying(false);
    } catch (err) {
      // Network error - attempt retry with exponential backoff
      const maxRetries = 3;
      
      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt);
        setRetrying(true);
        setSending(false);
        
        // Find the last user message to retry
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        
        setMessages(prev => {
          const filtered = prev.filter(m => !m.retryCount);
          return [...filtered, { 
            role: 'error', 
            content: `Connection issue. Retrying in ${Math.ceil(delay / 1000)} seconds... (Attempt ${attempt + 2}/${maxRetries + 1})`,
            errorType: 'network',
            retryCount: attempt + 1
          }];
        });
        
        retryTimeoutRef.current = setTimeout(() => {
          setMessages(prev => prev.filter(m => !m.retryCount));
          setRetrying(false);
          if (lastUserMsg) {
            sendMessage(lastUserMsg.content, attempt + 1);
          }
        }, delay);
        return;
      }
      
      // Final error after all retries exhausted
      setMessages(prev => {
        const filtered = prev.filter(m => !m.retryCount);
        return [...filtered, { 
          role: 'error', 
          content: attempt > 0 
            ? "Unable to connect after multiple attempts. Please check your internet connection and try again."
            : "Something went wrong. Please try sending your message again.",
          errorType: 'network'
        }];
      });
      setRetrying(false);
    } finally {
      setSending(false);
    }
  };

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Process queued messages when coming back online
  useEffect(() => {
    const processQueue = async () => {
      if (!isOnline || messageQueue.length === 0 || queueProcessingRef.current || sending) {
        return;
      }
      
      queueProcessingRef.current = true;
      setProcessingQueue(true);
      
      // Process messages one at a time
      const queueCopy = [...messageQueue];
      setMessageQueue([]);
      
      for (const queuedMessage of queueCopy) {
        // Wait for any ongoing send to complete
        await new Promise<void>(resolve => {
          const checkSending = () => {
            if (!sending && !retrying) {
              resolve();
            } else {
              setTimeout(checkSending, 100);
            }
          };
          checkSending();
        });
        
        // Send the queued message
        await sendMessage(queuedMessage, 0, true);
        
        // Small delay between queued messages
        await new Promise(r => setTimeout(r, 500));
      }
      
      queueProcessingRef.current = false;
      setProcessingQueue(false);
      
      if (queueCopy.length > 0) {
        toast({
          title: 'Messages sent',
          description: `${queueCopy.length} queued message${queueCopy.length > 1 ? 's' : ''} sent successfully.`,
        });
      }
    };
    
    processQueue();
  }, [isOnline, messageQueue.length, sending, retrying]);

  // Cancel retry when going offline
  const cancelRetry = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetrying(false);
    setMessages(prev => prev.filter(m => !m.retryCount));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getChatContent = () => {
    if (messages.length === 0) return '';

    const chatContent = messages.map(m => {
      const role = m.role === 'user' ? 'You' : spaceInfo?.name || 'Assistant';
      let text = `${role}:\n${m.content}`;
      if (m.citations && m.citations.length > 0) {
        text += `\n\nSources:\n${m.citations.map(c => `- "${c}"`).join('\n')}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const header = `Chat with ${spaceInfo?.name || 'Knowledge Base'}\nDate: ${new Date().toLocaleString()}\n\n${'='.repeat(50)}\n\n`;
    return header + chatContent;
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

    const fullContent = getChatContent();
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

  const copyChat = async () => {
    if (messages.length === 0) {
      toast({
        title: 'No messages',
        description: 'Start a conversation first to copy it.',
        variant: 'destructive',
      });
      return;
    }

    const fullContent = getChatContent();
    await navigator.clipboard.writeText(fullContent);
    setCopiedChat(true);
    setTimeout(() => setCopiedChat(false), 2000);

    toast({
      title: 'Chat copied',
      description: 'Conversation copied to clipboard.',
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
    const isDisabled = error.includes('disabled');
    const isExpired = error.includes('expired');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              isDisabled || isExpired ? 'bg-amber-500/20' : 'bg-destructive/20'
            }`}>
              <AlertCircle className={`w-8 h-8 ${isDisabled || isExpired ? 'text-amber-600' : 'text-destructive'}`} />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">
              {isDisabled ? 'Link Disabled' : isExpired ? 'Link Expired' : 'Link Unavailable'}
            </h2>
            <p className="text-muted-foreground text-center mb-4">{error}</p>
            {isDisabled && (
              <p className="text-sm text-muted-foreground text-center mb-4">
                The owner of this knowledge base has temporarily disabled this link.
              </p>
            )}
            {isExpired && (
              <p className="text-sm text-muted-foreground text-center mb-4">
                This link is no longer valid. Contact the owner for a new link.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFeedbackContext('public_chat_error');
                setFeedbackMessage(`Error: ${error}`);
                setFeedbackOpen(true);
              }}
              className="mt-2"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Report Issue
            </Button>
          </CardContent>
        </Card>
        
        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          defaultContext={feedbackContext}
          defaultMessage={feedbackMessage}
          screenName="PublicChat"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium flex-wrap">
          <WifiOff className="w-4 h-4" />
          <span>
            You're offline.
            {messageQueue.length > 0 && (
              <span className="ml-1">
                {messageQueue.length} message{messageQueue.length > 1 ? 's' : ''} queued.
              </span>
            )}
            {messageQueue.length === 0 && ' Messages will be queued until you reconnect.'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFeedbackContext('public_chat_offline');
              setFeedbackMessage('I was offline while using the chat.');
              setFeedbackOpen(true);
            }}
            className="h-6 px-2 text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-950"
          >
            Report Issue
          </Button>
        </div>
      )}
      
      {/* Processing Queue Banner */}
      {processingQueue && isOnline && (
        <div className="bg-green-500/20 text-green-700 dark:text-green-400 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Sending queued messages...</span>
        </div>
      )}
      
      {/* Retrying Banner */}
      {retrying && isOnline && (
        <div className="bg-primary/10 text-primary px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Reconnecting...</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={cancelRetry}
            className="h-6 px-2 text-xs ml-2"
          >
            Cancel
          </Button>
        </div>
      )}
      
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
              onClick={copyChat}
              disabled={messages.length === 0}
              className="hidden sm:flex"
            >
              {copiedChat ? (
                <CheckCircle className="w-4 h-4 mr-2 text-success" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {copiedChat ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={copyChat}
              disabled={messages.length === 0}
              className="sm:hidden"
              title="Copy chat"
            >
              {copiedChat ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadChat}
              disabled={messages.length === 0}
              className="hidden sm:flex"
            >
              <Download className="w-4 h-4 mr-2" />
              Save
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
                    ? message.pending 
                      ? 'bg-primary/50 text-primary-foreground/70'
                      : 'bg-primary text-primary-foreground'
                    : message.role === 'error'
                    ? 'bg-destructive/20 text-destructive'
                    : 'gradient-primary text-primary-foreground'
                }`}>
                  {message.role === 'user' ? (
                    message.pending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <User className="w-4 h-4" />
                    )
                  ) : message.role === 'error' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>
                
                <div className={`flex-1 max-w-[80%] ${
                  message.role === 'user' ? 'text-right' : ''
                }`}>
                  <Card className={`inline-block ${
                    message.role === 'user' 
                      ? message.pending
                        ? 'bg-primary/50 text-primary-foreground/70'
                        : 'bg-primary text-primary-foreground'
                      : message.role === 'error'
                      ? 'bg-destructive/10 border-destructive/30'
                      : 'bg-card'
                  }`}>
                    <CardContent className="p-3">
                      {message.role === 'error' ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-destructive font-medium text-sm">
                            {message.errorType === 'rate_limit' && '⏱️ Slow down'}
                            {message.errorType === 'service_unavailable' && '🔧 Service issue'}
                            {message.errorType === 'no_documents' && '📄 No content'}
                            {message.errorType === 'network' && '📡 Connection issue'}
                            {message.errorType === 'unknown' && '⚠️ Something went wrong'}
                          </p>
                          <p className="text-sm text-muted-foreground">{message.content}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Find the last user message and retry
                              const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                              if (lastUserMsg) {
                                setInput(lastUserMsg.content);
                              }
                            }}
                            className="self-start mt-1 h-7 text-xs"
                          >
                            Try again
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          
                          {/* Pending indicator for queued messages */}
                          {message.pending && (
                            <p className="text-xs mt-1 opacity-60 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Waiting to send...
                            </p>
                          )}
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
                        </>
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
            {/* Voice Input Button with Waveform */}
            <div className="flex items-center gap-2">
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="icon"
                onClick={toggleRecording}
                disabled={isProcessing || sending}
                className="shrink-0"
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
              
              {/* Waveform indicator and duration when recording */}
              {isRecording && (
                <div className="flex items-center gap-2 px-2 py-1 bg-destructive/10 rounded-md">
                  <WaveformIndicator audioLevel={audioLevel} isRecording={isRecording} />
                  <span className="text-xs font-mono text-destructive">
                    {formatDuration(recordingDuration)}
                  </span>
                </div>
              )}
            </div>
            
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={isRecording ? "Listening..." : "Ask a question..."}
              disabled={sending || isRecording}
              className="flex-1"
            />
            <Button 
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending || retrying}
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
      
      {/* Feedback Modal */}
      <FeedbackModal
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        defaultContext={feedbackContext}
        defaultMessage={feedbackMessage}
        screenName="PublicChat"
      />
    </div>
  );
}
