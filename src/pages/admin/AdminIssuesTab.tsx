/**
 * Admin Issues Tab
 * 
 * Shows issue reports (non-feedback context).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, CheckCircle, Monitor, Smartphone } from 'lucide-react';
import { format } from 'date-fns';

interface IssueReport {
  id: string;
  email: string | null;
  context: string;
  message: string;
  screen: string | null;
  device_model: string | null;
  system_version: string | null;
  app_version: string | null;
  build_number: string | null;
  is_offline: boolean | null;
  resolved: boolean | null;
  created_at: string;
}

export function AdminIssuesTab() {
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIssues();
  }, []);

  const fetchIssues = async () => {
    try {
      const { data, error } = await supabase
        .from('issue_reports')
        .select('*')
        .not('context', 'in', '("feedback","feature_request")')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (error) {
      console.error('Failed to fetch issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleResolved = async (issue: IssueReport) => {
    const newResolved = !issue.resolved;
    
    // Optimistic update
    setIssues(prev => prev.map(i => 
      i.id === issue.id ? { ...i, resolved: newResolved } : i
    ));

    try {
      const { error } = await supabase
        .from('issue_reports')
        .update({ resolved: newResolved })
        .eq('id', issue.id);

      if (error) throw error;
    } catch (error) {
      // Revert on error
      setIssues(prev => prev.map(i => 
        i.id === issue.id ? { ...i, resolved: issue.resolved } : i
      ));
    }
  };

  const getContextBadge = (context: string) => {
    switch (context) {
      case 'auth_error':
        return <Badge variant="destructive">Auth Error</Badge>;
      case 'app_error':
        return <Badge variant="destructive">App Error</Badge>;
      default:
        return <Badge variant="secondary">{context}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="w-12 h-12 text-success mb-4" />
          <p className="text-lg font-semibold">No issues reported</p>
          <p className="text-muted-foreground">All clear!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <Card key={issue.id} className={issue.resolved ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                issue.resolved ? 'bg-muted text-muted-foreground' : 'bg-destructive/20 text-destructive'
              }`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {getContextBadge(issue.context)}
                  {issue.resolved && (
                    <Badge variant="outline" className="text-success border-success">
                      Resolved
                    </Badge>
                  )}
                </div>
                
                <p className="text-sm mb-2">{issue.message}</p>
                
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {issue.email && <span>📧 {issue.email}</span>}
                  {issue.screen && <span>📍 {issue.screen}</span>}
                  {issue.device_model && (
                    <span className="flex items-center gap-1">
                      {issue.build_number === 'web' ? (
                        <Monitor className="w-3 h-3" />
                      ) : (
                        <Smartphone className="w-3 h-3" />
                      )}
                      {issue.device_model}
                    </span>
                  )}
                  {issue.system_version && <span>🌐 {issue.system_version}</span>}
                  {issue.app_version && <span>v{issue.app_version}</span>}
                  <span>{format(new Date(issue.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor={`resolved-${issue.id}`} className="text-xs text-muted-foreground">
                  Resolved
                </Label>
                <Switch
                  id={`resolved-${issue.id}`}
                  checked={issue.resolved || false}
                  onCheckedChange={() => toggleResolved(issue)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
