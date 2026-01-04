import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Clock, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export type FileUploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface FileUploadItem {
  id: string;
  filename: string;
  status: FileUploadStatus;
  error?: string;
}

interface BulkUploadProgressProps {
  files: FileUploadItem[];
  onClose: () => void;
}

export function BulkUploadProgress({ files, onClose }: BulkUploadProgressProps) {
  if (files.length === 0) return null;

  const succeeded = files.filter(f => f.status === 'done').length;
  const failed = files.filter(f => f.status === 'failed').length;
  const inProgress = files.some(f => f.status === 'uploading' || f.status === 'queued');
  const progressPercent = files.length > 0 ? ((succeeded + failed) / files.length) * 100 : 0;

  const getStatusIcon = (status: FileUploadStatus) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'uploading':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'queued':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: FileUploadStatus) => {
    switch (status) {
      case 'done': return 'Done';
      case 'failed': return 'Failed';
      case 'uploading': return 'Uploading';
      case 'queued': return 'Queued';
    }
  };

  return (
    <Card className="border-primary/20 animate-fade-in">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Uploading Files</CardTitle>
          </div>
          {!inProgress && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-0 pb-4 px-4 space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{succeeded + failed} of {files.length} complete</span>
            <div className="flex items-center gap-2">
              {succeeded > 0 && (
                <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                  {succeeded} succeeded
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">
                  {failed} failed
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* File list */}
        <ScrollArea className="max-h-40">
          <div className="space-y-1.5">
            {files.map((file) => (
              <div 
                key={file.id}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm"
              >
                <span className="truncate flex-1 mr-2">{file.filename}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {getStatusIcon(file.status)}
                  <span className="text-xs text-muted-foreground">
                    {getStatusLabel(file.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
