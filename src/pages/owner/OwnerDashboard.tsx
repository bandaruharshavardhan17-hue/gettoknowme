import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, FolderOpen, BarChart3, Shield, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SpacesTab from './SpacesTab';
import Analytics from './Analytics';

export default function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState('spaces');
  const [showTutorial, setShowTutorial] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { isImpersonating } = useImpersonation();
  const navigate = useNavigate();

  // Check if this is a first-time user (tutorial not completed in DB)
  useEffect(() => {
    const checkTutorialStatus = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('tutorial_completed')
        .eq('id', user.id)
        .single();
      
      if (data && !data.tutorial_completed) {
        setShowTutorial(true);
      }
    };
    
    checkTutorialStatus();
  }, [user]);

  const handleTutorialComplete = async () => {
    if (user) {
      await supabase
        .from('profiles')
        .update({ tutorial_completed: true })
        .eq('id', user.id);
    }
    setShowTutorial(false);
  };

  const handleTutorialClose = () => {
    setShowTutorial(false);
  };

  const handleShowTutorial = () => {
    setShowTutorial(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      <ImpersonationBanner />
      <OnboardingTutorial 
        open={showTutorial} 
        onClose={handleTutorialClose} 
        onComplete={handleTutorialComplete} 
      />
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-display font-bold gradient-text">Speak2MyAI</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleShowTutorial}
              className="text-muted-foreground"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Help</span>
            </Button>
            {isAdmin && !isImpersonating && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin')}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                <Shield className="w-4 h-4 mr-2" />
                Admin
              </Button>
            )}
            <ProfileDropdown />
          </div>
        </div>
      </header>

      <main className="container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="spaces" className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Your Spaces</span>
              <span className="sm:hidden">Spaces</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="spaces">
            <SpacesTab />
          </TabsContent>
          
          <TabsContent value="analytics">
            <Analytics />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
