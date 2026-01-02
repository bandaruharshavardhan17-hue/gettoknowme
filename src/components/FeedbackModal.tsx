/**
 * Reusable Feedback Modal Component
 * 
 * Writes to public.issue_reports table with context, message, and device info.
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';

export type FeedbackContext = 'feedback' | 'feature_request' | 'auth_error' | 'app_error';

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContext?: FeedbackContext;
  defaultMessage?: string;
  screenName?: string;
}

const CONTEXT_OPTIONS: { value: FeedbackContext; label: string }[] = [
  { value: 'feedback', label: 'General Feedback' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'auth_error', label: 'Login/Auth Issue' },
  { value: 'app_error', label: 'App Error/Bug' },
];

// Get device and browser info
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  
  // Simple browser detection
  let browser = 'Unknown';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  
  return {
    device_model: platform || 'Unknown',
    system_version: browser,
    app_version: '1.0.0', // Could be from env/config
    build_number: 'web',
    is_offline: !navigator.onLine,
  };
}

export function FeedbackModal({
  open,
  onOpenChange,
  defaultContext = 'feedback',
  defaultMessage = '',
  screenName,
}: FeedbackModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [context, setContext] = useState<FeedbackContext>(defaultContext);
  const [message, setMessage] = useState(defaultMessage);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens with new defaults
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setContext(defaultContext);
      setMessage(defaultMessage);
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const deviceInfo = getDeviceInfo();
      const currentScreen = screenName || window.location.pathname;

      const { error } = await supabase.from('issue_reports').insert({
        user_id: user?.id || null,
        email: user?.email || null,
        context,
        message: message.trim(),
        screen: currentScreen,
        ...deviceInfo,
      });

      if (error) throw error;

      toast({
        title: 'Thank you!',
        description: 'Your feedback has been submitted.',
      });

      setMessage('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Send Feedback</DialogTitle>
          <DialogDescription>
            Share your feedback, report issues, or request features
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={context} onValueChange={(v) => setContext(v as FeedbackContext)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEXT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Tell us what's on your mind..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            className="w-full gradient-primary text-primary-foreground"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
