import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { ChevronRight, Loader2, FileText, Clock, Eye, User, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpaceImprovementsRowProps {
  spaceId: string;
}

interface HealthMetrics {
  coverageScore: number;
  recencyScore: number;
  readabilityScore: number;
  personaCompleteness: number;
  totalDocuments: number;
  readyDocuments: number;
  failedDocuments: number;
  recentDocuments: number;
  averageQuality: string;
  hasPersona: boolean;
  hasTone: boolean;
  hasAudience: boolean;
  hasFallback: boolean;
}

export function SpaceImprovementsRow({ spaceId }: SpaceImprovementsRowProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchHealthMetrics();
  }, [spaceId]);

  const fetchHealthMetrics = async () => {
    try {
      const { data: documents } = await supabase
        .from('documents')
        .select('id, status, created_at, extraction_quality, text_length')
        .eq('space_id', spaceId);

      const { data: space } = await supabase
        .from('spaces')
        .select('ai_persona_style, ai_tone, ai_audience, ai_fallback_message')
        .eq('id', spaceId)
        .single();

      if (!documents) {
        setMetrics(null);
        return;
      }

      const totalDocuments = documents.length;
      const readyDocuments = documents.filter(d => d.status === 'ready').length;
      const failedDocuments = documents.filter(d => d.status === 'failed').length;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentDocuments = documents.filter(d => new Date(d.created_at) > thirtyDaysAgo).length;

      const coverageScore = totalDocuments > 0 ? (readyDocuments / totalDocuments) * 100 : 0;
      const recencyScore = totalDocuments > 0 ? (recentDocuments / totalDocuments) * 100 : 0;

      const qualityScores = documents
        .filter(d => d.extraction_quality)
        .map(d => {
          switch (d.extraction_quality) {
            case 'high': return 100;
            case 'medium': return 60;
            case 'low': return 30;
            default: return 50;
          }
        });
      const readabilityScore = qualityScores.length > 0 
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
        : 80;

      let averageQuality = 'Unknown';
      if (readabilityScore >= 80) averageQuality = 'High';
      else if (readabilityScore >= 50) averageQuality = 'Medium';
      else averageQuality = 'Low';

      const hasPersona = !!space?.ai_persona_style;
      const hasTone = !!space?.ai_tone;
      const hasAudience = !!space?.ai_audience;
      const hasFallback = !!space?.ai_fallback_message;
      
      const personaFields = [hasPersona, hasTone, hasAudience, hasFallback];
      const personaCompleteness = (personaFields.filter(Boolean).length / personaFields.length) * 100;

      setMetrics({
        coverageScore,
        recencyScore,
        readabilityScore,
        personaCompleteness,
        totalDocuments,
        readyDocuments,
        failedDocuments,
        recentDocuments,
        averageQuality,
        hasPersona,
        hasTone,
        hasAudience,
        hasFallback,
      });
    } catch (error) {
      console.error('Error fetching health metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getOverallScore = () => {
    if (!metrics) return { label: 'Unknown', variant: 'secondary' as const, score: 0 };
    const avg = (metrics.coverageScore + metrics.recencyScore + metrics.readabilityScore + metrics.personaCompleteness) / 4;
    if (avg >= 75) return { label: 'Strong', variant: 'default' as const, score: avg };
    if (avg >= 50) return { label: 'Good', variant: 'secondary' as const, score: avg };
    return { label: 'Needs Work', variant: 'outline' as const, score: avg };
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="w-4 h-4 text-success" />;
    if (score >= 50) return <AlertCircle className="w-4 h-4 text-warning" />;
    return <XCircle className="w-4 h-4 text-destructive" />;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 bg-muted/50 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading health...</span>
      </div>
    );
  }

  if (!metrics) return null;

  const overall = getOverallScore();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-between py-2 px-3 h-auto bg-muted/30 hover:bg-muted/50 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Space Improvements</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={overall.variant} className="text-xs">
              {overall.label}
            </Badge>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Button>
      </SheetTrigger>
      
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Space Health
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Document Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{metrics.totalDocuments}</div>
              <div className="text-xs text-muted-foreground">Total Docs</div>
            </div>
            <div className="p-3 rounded-lg bg-success/10">
              <div className="text-2xl font-bold text-success">{metrics.readyDocuments}</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10">
              <div className="text-2xl font-bold text-destructive">{metrics.failedDocuments}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>

          {/* Score Bars */}
          <div className="space-y-4">
            {/* Coverage Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="w-4 h-4" />
                  Coverage
                  {getScoreIcon(metrics.coverageScore)}
                </div>
                <span className={cn("text-sm font-bold", getScoreColor(metrics.coverageScore))}>
                  {Math.round(metrics.coverageScore)}%
                </span>
              </div>
              <Progress value={metrics.coverageScore} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {metrics.readyDocuments} of {metrics.totalDocuments} documents are ready
              </p>
            </div>

            {/* Recency Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Recency
                  {getScoreIcon(metrics.recencyScore)}
                </div>
                <span className={cn("text-sm font-bold", getScoreColor(metrics.recencyScore))}>
                  {Math.round(metrics.recencyScore)}%
                </span>
              </div>
              <Progress value={metrics.recencyScore} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {metrics.recentDocuments} documents updated in last 30 days
              </p>
            </div>

            {/* Readability Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="w-4 h-4" />
                  Readability
                  {getScoreIcon(metrics.readabilityScore)}
                </div>
                <span className={cn("text-sm font-bold", getScoreColor(metrics.readabilityScore))}>
                  {metrics.averageQuality}
                </span>
              </div>
              <Progress value={metrics.readabilityScore} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Average extraction quality across documents
              </p>
            </div>

            {/* Persona Completeness */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <User className="w-4 h-4" />
                  Persona Setup
                  {getScoreIcon(metrics.personaCompleteness)}
                </div>
                <span className={cn("text-sm font-bold", getScoreColor(metrics.personaCompleteness))}>
                  {Math.round(metrics.personaCompleteness)}%
                </span>
              </div>
              <Progress value={metrics.personaCompleteness} className="h-2" />
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant={metrics.hasPersona ? 'default' : 'outline'} className="text-xs">
                  Persona
                </Badge>
                <Badge variant={metrics.hasTone ? 'default' : 'outline'} className="text-xs">
                  Tone
                </Badge>
                <Badge variant={metrics.hasAudience ? 'default' : 'outline'} className="text-xs">
                  Audience
                </Badge>
                <Badge variant={metrics.hasFallback ? 'default' : 'outline'} className="text-xs">
                  Fallback
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
