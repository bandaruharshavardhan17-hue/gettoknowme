import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, X, Sparkles, FileText, MessageSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  icon: React.ReactNode;
}

interface QuickStartChecklistProps {
  hasSpaces: boolean;
  hasDocuments: boolean;
  hasPersona: boolean;
  userId: string;
}

export function QuickStartChecklist({ hasSpaces, hasDocuments, hasPersona, userId }: QuickStartChecklistProps) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `quickstart_dismissed_${userId}`;

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'true') {
      setDismissed(true);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  const items: ChecklistItem[] = [
    { id: 'space', label: 'Create your first space', completed: hasSpaces, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'document', label: 'Upload your first document', completed: hasDocuments, icon: <FileText className="w-4 h-4" /> },
    { id: 'persona', label: 'Set persona & tone', completed: hasPersona, icon: <User className="w-4 h-4" /> },
  ];

  const completedCount = items.filter(i => i.completed).length;
  const allCompleted = completedCount === items.length;

  // Don't render if dismissed or all completed
  if (dismissed || allCompleted) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5 mb-6 animate-fade-in">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-display font-semibold text-sm">Quick Start</h3>
              <span className="text-xs text-muted-foreground">
                {completedCount}/{items.length} complete
              </span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors",
                    item.completed 
                      ? "bg-success/10 text-success" 
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.completed ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                  <span className={cn(item.completed && "line-through")}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
