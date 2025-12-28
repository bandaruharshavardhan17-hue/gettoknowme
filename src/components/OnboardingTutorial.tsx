import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { 
  FolderOpen, 
  Upload, 
  MessageSquare, 
  Link2, 
  Share2, 
  FileText, 
  Bot, 
  ArrowRight, 
  ArrowLeft,
  Sparkles,
  CheckCircle,
  X
} from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to Know Me!',
    description: 'Your AI-powered knowledge assistant',
    icon: <Sparkles className="w-12 h-12 text-primary" />,
    details: [
      'Know Me helps you create knowledge bases from your documents',
      'Share them with anyone via secure links',
      'Visitors can ask questions and get AI-powered answers',
      'All answers are based only on your uploaded content'
    ]
  },
  {
    title: 'Create Spaces',
    description: 'Organize your knowledge into spaces',
    icon: <FolderOpen className="w-12 h-12 text-primary" />,
    details: [
      'A Space is a collection of related documents',
      'Example: "Product Documentation", "Company FAQ"',
      'Each space has its own AI assistant',
      'Click "New Space" to create your first one'
    ]
  },
  {
    title: 'Upload Documents',
    description: 'Add your knowledge to a space',
    icon: <Upload className="w-12 h-12 text-primary" />,
    details: [
      'Upload PDF files or text documents',
      'Add quick notes for small pieces of information',
      'All content is automatically indexed for AI search',
      'You can add as many documents as you need'
    ]
  },
  {
    title: 'AI Instructions',
    description: 'Customize how AI responds',
    icon: <Bot className="w-12 h-12 text-primary" />,
    details: [
      'Set custom instructions for your AI assistant',
      'Example: "Be friendly and concise"',
      'If AI doesn\'t find an answer, it says "I don\'t know"',
      'AI never makes up information - only uses your documents'
    ]
  },
  {
    title: 'Share with Links',
    description: 'Create shareable chat links',
    icon: <Link2 className="w-12 h-12 text-primary" />,
    details: [
      'Each space automatically gets a share link',
      'Anyone with the link can ask questions',
      'No login required for visitors',
      'Track views and usage in Analytics'
    ]
  },
  {
    title: 'You\'re Ready!',
    description: 'Start building your knowledge base',
    icon: <CheckCircle className="w-12 h-12 text-green-500" />,
    details: [
      '1. Create your first space',
      '2. Upload documents or add notes',
      '3. Share the link with others',
      '4. Watch them get instant answers!'
    ]
  }
];

interface OnboardingTutorialProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingTutorial({ open, onClose, onComplete }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;
  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  // Reset step when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Progress bar */}
        <div className="px-6 pt-6">
          <Progress value={progress} className="h-1" />
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {currentStep + 1} of {tutorialSteps.length}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center animate-float">
              {step.icon}
            </div>
          </div>
          
          <DialogHeader className="text-center space-y-2 mb-6">
            <DialogTitle className="text-2xl font-display">{step.title}</DialogTitle>
            <DialogDescription className="text-base">{step.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mb-8">
            {step.details.map((detail, idx) => (
              <div key={idx} className="flex items-start gap-3 text-left">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">{idx + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip Tutorial
            </Button>
            
            <div className="flex gap-2">
              {!isFirstStep && (
                <Button variant="outline" onClick={handlePrev}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}
              <Button onClick={handleNext} className="gradient-primary text-primary-foreground">
                {isLastStep ? 'Get Started' : 'Next'}
                {!isLastStep && <ArrowRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
