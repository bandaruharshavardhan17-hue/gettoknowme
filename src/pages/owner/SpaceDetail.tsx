import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, FileText, BarChart3, MessageSquare, Settings } from 'lucide-react';
import SpaceDocumentsTab from './SpaceDocumentsTab';
import SpaceAnalyticsTab from './SpaceAnalyticsTab';
import SpaceChatHistoryTab from './SpaceChatHistoryTab';
import SpaceSettingsTab from './SpaceSettingsTab';
import SpaceHealthPanel from './SpaceHealthPanel';
import { AppAssistantBot } from '@/components/AppAssistantBot';

interface Space {
  id: string;
  name: string;
  description: string | null;
  ai_model: string | null;
  ai_fallback_message: string | null;
  ai_persona_style: string | null;
  ai_tone: string | null;
  ai_audience: string | null;
  ai_do_not_mention: string | null;
  space_type: string | null;
}

export default function SpaceDetail() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('documents');
  
  const { toast } = useToast();

  useEffect(() => {
    fetchSpace();
  }, [spaceId]);

  const fetchSpace = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .eq('id', spaceId)
        .single();

      if (error) throw error;
      setSpace(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load space',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Space not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      <ImpersonationBanner />
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container flex items-center h-14 px-4 gap-4">
          <Link to="/owner/spaces">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-display font-bold truncate">{space.name}</h1>
        </div>
      </header>

      <main className="container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Documents</span>
              <span className="sm:hidden">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              <span className="sm:hidden">Chat</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <SpaceDocumentsTab spaceId={spaceId!} description={space.description} aiModel={space.ai_model} />
          </TabsContent>

          <TabsContent value="history">
            <SpaceChatHistoryTab spaceId={spaceId!} />
          </TabsContent>
          
          <TabsContent value="analytics">
            <SpaceAnalyticsTab spaceId={spaceId!} />
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SpaceSettingsTab 
                  spaceId={spaceId!} 
                  initialSettings={{
                    ai_fallback_message: space.ai_fallback_message,
                    ai_persona_style: space.ai_persona_style,
                    ai_tone: space.ai_tone,
                    ai_audience: space.ai_audience,
                    ai_do_not_mention: space.ai_do_not_mention,
                    space_type: space.space_type,
                  }}
                />
              </div>
              <div>
                <SpaceHealthPanel spaceId={spaceId!} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Floating assistant bot scoped to this space */}
      <AppAssistantBot />
    </div>
  );
}
