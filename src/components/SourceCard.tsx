import { ExternalLink, Copy, AlertTriangle, Trash2, RefreshCw, Globe, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface SourceCardProps {
  title: string;
  excerpt?: string;
  domain?: string;
  thumbnail?: string;
  sourceUrl?: string;
  extractionQuality?: 'high' | 'medium' | 'low' | string;
  warnings?: string[];
  pageType?: 'content' | 'login' | 'generic' | 'paywall' | 'error' | string;
  // Action handlers
  onKeep?: () => void;
  onDelete?: () => void;
  onTryAgain?: () => void;
  onRequestSupport?: () => void;
  // Display modes
  showActions?: boolean;
  showWarningActions?: boolean;
  compact?: boolean;
}

export function SourceCard({
  title,
  excerpt,
  domain,
  thumbnail,
  sourceUrl,
  extractionQuality,
  warnings = [],
  pageType = 'content',
  onKeep,
  onDelete,
  onTryAgain,
  onRequestSupport,
  showActions = true,
  showWarningActions = false,
  compact = false,
}: SourceCardProps) {
  const { toast } = useToast();
  
  const needsAction = pageType === 'login' || pageType === 'generic' || pageType === 'paywall';
  const isLowQuality = extractionQuality === 'low';
  const showThumbnail = thumbnail && !isLowQuality && pageType === 'content';

  const handleCopyExcerpt = () => {
    if (excerpt) {
      navigator.clipboard.writeText(excerpt);
      toast({ title: 'Copied', description: 'Summary copied to clipboard' });
    }
  };

  const handleViewSource = () => {
    if (sourceUrl) {
      window.open(sourceUrl, '_blank');
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
        <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {domain && (
            <p className="text-xs text-muted-foreground truncate">{domain}</p>
          )}
        </div>
        {sourceUrl && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleViewSource}>
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={`overflow-hidden ${needsAction ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
      {/* Warning banner for problematic pages */}
      {needsAction && warnings.length > 0 && (
        <div className="bg-amber-500/20 px-4 py-2 flex items-center gap-2 border-b border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {warnings[0]}
          </p>
        </div>
      )}
      
      <CardContent className="p-0">
        <div className="flex gap-3 p-4">
          {/* Thumbnail */}
          {showThumbnail && (
            <div className="shrink-0">
              <img 
                src={thumbnail} 
                alt={title}
                className="w-16 h-16 rounded-lg object-cover border bg-muted"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h4 className="font-medium text-sm line-clamp-2 flex-1">{title}</h4>
              {extractionQuality && extractionQuality !== 'high' && (
                <Badge 
                  variant="outline" 
                  className={`text-xs shrink-0 ${
                    extractionQuality === 'low' 
                      ? 'border-destructive/50 text-destructive' 
                      : 'border-amber-500/50 text-amber-600'
                  }`}
                >
                  {extractionQuality}
                </Badge>
              )}
            </div>
            
            {domain && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {domain}
              </p>
            )}
            
            {excerpt && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {excerpt}
              </p>
            )}
            
            {/* Additional warnings */}
            {warnings.length > 1 && (
              <div className="mt-2 space-y-1">
                {warnings.slice(1).map((warning, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        {showActions && (
          <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
            {sourceUrl && (
              <Button variant="outline" size="sm" onClick={handleViewSource}>
                <ExternalLink className="w-3 h-3 mr-1" />
                View Source
              </Button>
            )}
            {excerpt && (
              <Button variant="outline" size="sm" onClick={handleCopyExcerpt}>
                <Copy className="w-3 h-3 mr-1" />
                Copy Summary
              </Button>
            )}
          </div>
        )}
        
        {/* Warning actions for login/generic pages */}
        {showWarningActions && needsAction && (
          <div className="px-4 pb-4 pt-2 border-t border-border/50 flex items-center gap-2 flex-wrap">
            {onKeep && (
              <Button variant="outline" size="sm" onClick={onKeep}>
                Keep Anyway
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            )}
            {onTryAgain && (
              <Button variant="outline" size="sm" onClick={onTryAgain}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Try Another URL
              </Button>
            )}
            {onRequestSupport && (
              <Button variant="default" size="sm" onClick={onRequestSupport}>
                <MessageCircle className="w-3 h-3 mr-1" />
                Request Support
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
