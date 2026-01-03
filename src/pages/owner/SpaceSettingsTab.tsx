import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Loader2, CheckCircle, User, MessageSquare, Users, Ban, Briefcase } from 'lucide-react';

interface SpaceSettingsTabProps {
  spaceId: string;
  initialSettings?: {
    ai_fallback_message?: string | null;
    ai_persona_style?: string | null;
    ai_tone?: string | null;
    ai_audience?: string | null;
    ai_do_not_mention?: string | null;
    space_type?: string | null;
  };
}

const SPACE_TYPES = [
  { value: 'personal', label: 'Personal Portfolio', description: 'About you, your work, resume' },
  { value: 'business', label: 'Business', description: 'Company info, products, services' },
  { value: 'support', label: 'Support / FAQ', description: 'Help desk, knowledge base' },
  { value: 'educational', label: 'Educational', description: 'Courses, learning materials' },
  { value: 'creative', label: 'Creative', description: 'Art, writing, portfolio' },
  { value: 'custom', label: 'Custom', description: 'Define your own persona' },
];

const PERSONA_PRESETS = [
  { value: '', label: 'Default', description: 'Standard helpful assistant' },
  { value: 'professional', label: 'Professional', description: 'Formal, business-like responses' },
  { value: 'friendly', label: 'Friendly', description: 'Warm, conversational tone' },
  { value: 'expert', label: 'Expert', description: 'Technical, in-depth answers' },
  { value: 'concise', label: 'Concise', description: 'Brief, to-the-point responses' },
  { value: 'custom', label: 'Custom', description: 'Write your own instructions' },
];

const TONE_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'empathetic', label: 'Empathetic' },
];

const AUDIENCE_OPTIONS = [
  { value: '', label: 'General' },
  { value: 'technical', label: 'Technical / Developers' },
  { value: 'non-technical', label: 'Non-Technical' },
  { value: 'executives', label: 'Executives / Decision Makers' },
  { value: 'students', label: 'Students' },
  { value: 'recruiters', label: 'Recruiters / HR' },
  { value: 'customers', label: 'Customers' },
];

export default function SpaceSettingsTab({ spaceId, initialSettings }: SpaceSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [spaceType, setSpaceType] = useState(initialSettings?.space_type || '');
  const [personaStyle, setPersonaStyle] = useState(initialSettings?.ai_persona_style || '');
  const [customPersona, setCustomPersona] = useState('');
  const [tone, setTone] = useState(initialSettings?.ai_tone || '');
  const [audience, setAudience] = useState(initialSettings?.ai_audience || '');
  const [doNotMention, setDoNotMention] = useState(initialSettings?.ai_do_not_mention || '');
  const [fallbackMessage, setFallbackMessage] = useState(initialSettings?.ai_fallback_message || '');
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [spaceId]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('ai_fallback_message, ai_persona_style, ai_tone, ai_audience, ai_do_not_mention, space_type')
        .eq('id', spaceId)
        .single();

      if (error) throw error;

      if (data) {
        setSpaceType(data.space_type || '');
        setTone(data.ai_tone || '');
        setAudience(data.ai_audience || '');
        setDoNotMention(data.ai_do_not_mention || '');
        setFallbackMessage(data.ai_fallback_message || '');
        
        // Check if persona is a preset or custom
        const presetValues = PERSONA_PRESETS.map(p => p.value);
        if (data.ai_persona_style && !presetValues.includes(data.ai_persona_style)) {
          setPersonaStyle('custom');
          setCustomPersona(data.ai_persona_style);
        } else {
          setPersonaStyle(data.ai_persona_style || '');
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    
    try {
      const finalPersona = personaStyle === 'custom' ? customPersona : personaStyle;
      
      const { error } = await supabase
        .from('spaces')
        .update({
          space_type: spaceType || null,
          ai_persona_style: finalPersona || null,
          ai_tone: tone || null,
          ai_audience: audience || null,
          ai_do_not_mention: doNotMention || null,
          ai_fallback_message: fallbackMessage || null,
        })
        .eq('id', spaceId);

      if (error) throw error;
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [spaceId, spaceType, personaStyle, customPersona, tone, audience, doNotMention, fallbackMessage, toast]);

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveSettings();
    }, 1000);
  }, [saveSettings]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Apply space type defaults
  const handleSpaceTypeChange = (value: string) => {
    setSpaceType(value);
    
    // Set default persona based on space type
    switch (value) {
      case 'personal':
        setPersonaStyle('friendly');
        setAudience('recruiters');
        break;
      case 'business':
        setPersonaStyle('professional');
        setAudience('customers');
        break;
      case 'support':
        setPersonaStyle('concise');
        setTone('empathetic');
        break;
      case 'educational':
        setPersonaStyle('expert');
        setAudience('students');
        break;
      case 'creative':
        setPersonaStyle('friendly');
        setTone('enthusiastic');
        break;
      default:
        break;
    }
    
    triggerAutoSave();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Status */}
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        {saving && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Saving...</span>
          </>
        )}
        {saved && (
          <>
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-success">Saved</span>
          </>
        )}
      </div>

      {/* Space Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Space Type
          </CardTitle>
          <CardDescription>
            Choose a category to get recommended persona settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={spaceType} onValueChange={handleSpaceTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select space type..." />
            </SelectTrigger>
            <SelectContent>
              {SPACE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div>
                    <div className="font-medium">{type.label}</div>
                    <div className="text-xs text-muted-foreground">{type.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Persona Style */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Persona Style
          </CardTitle>
          <CardDescription>
            How should the AI present itself?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select 
            value={personaStyle} 
            onValueChange={(v) => { setPersonaStyle(v); triggerAutoSave(); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select persona style..." />
            </SelectTrigger>
            <SelectContent>
              {PERSONA_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  <div>
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-xs text-muted-foreground">{preset.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {personaStyle === 'custom' && (
            <div className="space-y-2">
              <Label>Custom Persona Instructions</Label>
              <Textarea
                value={customPersona}
                onChange={(e) => { setCustomPersona(e.target.value); triggerAutoSave(); }}
                placeholder="Describe how the AI should behave, its personality, expertise areas..."
                className="min-h-[100px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tone & Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Tone & Audience
          </CardTitle>
          <CardDescription>
            Fine-tune how the AI communicates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select 
                value={tone} 
                onValueChange={(v) => { setTone(v); triggerAutoSave(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tone..." />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Target Audience
              </Label>
              <Select 
                value={audience} 
                onValueChange={(v) => { setAudience(v); triggerAutoSave(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select audience..." />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Do Not Mention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Topics to Avoid
          </CardTitle>
          <CardDescription>
            The AI will never discuss these topics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={doNotMention}
            onChange={(e) => { setDoNotMention(e.target.value); triggerAutoSave(); }}
            placeholder="e.g., salary expectations, competitor products, personal phone number..."
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Fallback Message */}
      <Card>
        <CardHeader>
          <CardTitle>Fallback Response</CardTitle>
          <CardDescription>
            What the AI says when it can't find relevant information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={fallbackMessage}
            onChange={(e) => { setFallbackMessage(e.target.value); triggerAutoSave(); }}
            placeholder="I don't have that information. Please reach out directly for more details."
            className="min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Leave empty to use the default: "Please reach out to [your name] for more details."
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
