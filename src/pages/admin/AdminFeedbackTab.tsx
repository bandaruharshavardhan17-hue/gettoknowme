/**
 * Admin Feedback Tab
 * 
 * Shows feedback and feature requests.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, MessageSquare, Lightbulb, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface FeedbackReport {
  id: string;
  email: string | null;
  context: string;
  message: string;
  screen: string | null;
  device_model: string | null;
  system_version: string | null;
  app_version: string | null;
  build_number: string | null;
  resolved: boolean | null;
  created_at: string;
}

export function AdminFeedbackTab() {
  const [feedback, setFeedback] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      const { data, error } = await supabase
        .from('issue_reports')
        .select('*')
        .in('context', ['feedback', 'feature_request'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedback(data || []);
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleResolved = async (item: FeedbackReport) => {
    const newResolved = !item.resolved;
    
    // Optimistic update
    setFeedback(prev => prev.map(f => 
      f.id === item.id ? { ...f, resolved: newResolved } : f
    ));

    try {
      const { error } = await supabase
        .from('issue_reports')
        .update({ resolved: newResolved })
        .eq('id', item.id);

      if (error) throw error;
    } catch (error) {
      // Revert on error
      setFeedback(prev => prev.map(f => 
        f.id === item.id ? { ...f, resolved: item.resolved } : f
      ));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (feedback.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-lg font-semibold">No feedback yet</p>
          <p className="text-muted-foreground">User feedback will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => (
        <Card key={item.id} className={item.resolved ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                item.context === 'feature_request' 
                  ? 'bg-warning/20 text-warning' 
                  : 'bg-primary/20 text-primary'
              }`}>
                {item.context === 'feature_request' ? (
                  <Lightbulb className="w-5 h-5" />
                ) : (
                  <MessageSquare className="w-5 h-5" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {item.context === 'feature_request' ? (
                    <Badge className="bg-warning/20 text-warning border-warning/30">
                      Feature Request
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Feedback</Badge>
                  )}
                  {item.resolved && (
                    <Badge variant="outline" className="text-success border-success">
                      Addressed
                    </Badge>
                  )}
                </div>
                
                <p className="text-sm mb-2">{item.message}</p>
                
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {item.email && <span>📧 {item.email}</span>}
                  {item.screen && <span>📍 {item.screen}</span>}
                  {item.app_version && <span>v{item.app_version}</span>}
                  <span>{format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor={`resolved-${item.id}`} className="text-xs text-muted-foreground">
                  Addressed
                </Label>
                <Switch
                  id={`resolved-${item.id}`}
                  checked={item.resolved || false}
                  onCheckedChange={() => toggleResolved(item)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
