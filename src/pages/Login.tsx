import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, Eye, EyeOff, User, ArrowLeft, Phone, Info, MessageCircle, Linkedin } from 'lucide-react';
import { z } from 'zod';
import { AppLogo } from '@/components/AppLogo';
import { FeedbackModal } from '@/components/FeedbackModal';

// Social provider icons as simple components
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const AmazonIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726-1.54.407-3.1.61-4.68.61-1.837 0-3.616-.264-5.34-.79-1.72-.527-3.253-1.26-4.6-2.2-.09-.062-.18-.132-.27-.21-.09-.08-.12-.15-.12-.22.09-.04.15-.1.21-.17zm8.464-5.8c0-1.636.57-2.97 1.71-4.006 1.14-1.03 2.64-1.55 4.5-1.55.6 0 1.14.06 1.62.16V5.44c0-.68.16-1.15.48-1.41.32-.26.69-.39 1.11-.39.42 0 .79.13 1.11.39s.48.73.48 1.41v8.7c0 .68-.16 1.15-.48 1.41-.32.26-.69.39-1.11.39-.42 0-.79-.13-1.11-.39-.32-.26-.48-.73-.48-1.41v-.48c-.72.64-1.47 1.12-2.25 1.44-.78.32-1.65.48-2.61.48-1.56 0-2.79-.45-3.69-1.35-.9-.9-1.35-2.07-1.35-3.51zm3.3-.06c0 .72.21 1.29.63 1.71.42.42.99.63 1.71.63.72 0 1.29-.21 1.71-.63.42-.42.63-.99.63-1.71 0-.72-.21-1.29-.63-1.71-.42-.42-.99-.63-1.71-.63-.72 0-1.29.21-1.71.63-.42.42-.63.99-.63 1.71z"/>
  </svg>
);

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AuthMode = 'login' | 'signup' | 'forgot';

const DISABLED_PROVIDERS = [
  { name: 'Phone', icon: Phone },
  { name: 'Apple', icon: AppleIcon },
  { name: 'Google', icon: GoogleIcon },
  { name: 'Facebook', icon: FacebookIcon },
  { name: 'Amazon', icon: AmazonIcon },
];

export default function Login() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [errors, setErrors] = useState<{ displayName?: string; email?: string; password?: string; confirmPassword?: string }>({});
  
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/owner/spaces';
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, location.state]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is logged in, don't render the form (useEffect will redirect)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const validateForm = () => {
    if (mode === 'forgot') {
      const result = z.object({ email: z.string().email('Please enter a valid email') }).safeParse({ email });
      if (!result.success) {
        setErrors({ email: result.error.errors[0].message });
        return false;
      }
      setErrors({});
      return true;
    }
    
    if (mode === 'login') {
      const result = loginSchema.safeParse({ email, password });
      if (!result.success) {
        const fieldErrors: typeof errors = {};
        result.error.errors.forEach((err) => {
          const field = err.path[0] as keyof typeof errors;
          fieldErrors[field] = err.message;
        });
        setErrors(fieldErrors);
        return false;
      }
    } else {
      const result = signupSchema.safeParse({ displayName, email, password, confirmPassword });
      if (!result.success) {
        const fieldErrors: typeof errors = {};
        result.error.errors.forEach((err) => {
          const field = err.path[0] as keyof typeof errors;
          fieldErrors[field] = err.message;
        });
        setErrors(fieldErrors);
        return false;
      }
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Check your email',
            description: 'We sent you a password reset link.',
          });
          setMode('login');
        }
      } else if (mode === 'login') {
        const { error } = await signIn(email, password, rememberMe);
        if (error) {
          let message = error.message;
          if (message.includes('Invalid login credentials')) {
            message = 'Invalid email or password. Please try again.';
          }
          toast({
            title: 'Error',
            description: message,
            variant: 'destructive',
          });
        } else {
          const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/owner/spaces';
          navigate(from, { replace: true });
        }
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) {
          let message = error.message;
          if (message.includes('User already registered') || message.includes('already been registered')) {
            message = 'This email is already registered. Try logging in instead.';
          }
          toast({
            title: 'Error',
            description: message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Account created!',
            description: 'You can now log in with your credentials.',
          });
          setMode('login');
          setConfirmPassword('');
          setDisplayName('');
        }
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrors({});
    setConfirmPassword('');
    setDisplayName('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary/20 to-accent/20">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <Card className="w-full max-w-md shadow-glow border-border/50 backdrop-blur-sm bg-card/95 animate-fade-in">
        <CardHeader className="text-center space-y-2">
          {/* Coming soon banner */}
          <Alert className="mb-2 bg-info/10 border-info/30">
            <Info className="h-4 w-4 text-info" />
            <AlertDescription className="text-sm text-info">
              Social sign‑in is coming soon.
            </AlertDescription>
          </Alert>

          <div className="mx-auto mb-2">
            <AppLogo size="md" className="shadow-lg" />
          </div>
          <CardTitle className="text-3xl font-display gradient-text">
            Speak2MyAI
          </CardTitle>
          <CardDescription className="text-base">
            {mode === 'login' && 'Welcome back! Sign in to your account'}
            {mode === 'signup' && 'Create an account to get started'}
            {mode === 'forgot' && 'Enter your email to reset your password'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name - only for signup */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">
                  Your Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
                {errors.displayName && (
                  <p className="text-sm text-destructive">{errors.displayName}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Password fields - only for login/signup */}
            {mode !== 'forgot' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-primary hover:underline"
                        disabled={loading}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>

                {/* Confirm Password - only for signup */}
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 pr-10"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                    )}
                  </div>
                )}

                {/* Remember Me - only for login */}
                {mode === 'login' && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rememberMe"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                )}
              </>
            )}

            <Button 
              type="submit" 
              className="w-full gradient-primary text-primary-foreground font-semibold h-11 shadow-lg hover:opacity-90 transition-opacity"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {mode === 'login' && 'Sign In'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Send Reset Link'}
            </Button>
          </form>

          {/* Disabled social sign-in buttons */}
          {mode !== 'forgot' && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {DISABLED_PROVIDERS.map((provider) => {
                  const Icon = provider.icon;
                  return (
                    <Button
                      key={provider.name}
                      variant="outline"
                      size="icon"
                      disabled
                      className="relative opacity-50 cursor-not-allowed"
                      title={`${provider.name} - Coming soon`}
                    >
                      <Icon className="w-5 h-5" />
                    </Button>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-2">
                Coming soon
              </p>
            </div>
          )}

          <div className="mt-6 text-center space-y-2">
            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                disabled={loading}
              >
                <ArrowLeft className="w-3 h-3" />
                Back to login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                disabled={loading}
              >
                {mode === 'login' 
                  ? "Don't have an account? Sign up" 
                  : 'Already have an account? Sign in'}
              </button>
            )}

            {/* Feedback link */}
            <div>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <MessageCircle className="w-3 h-3" />
                Share feedback / report a problem
              </button>
            </div>
          </div>

          {/* Contact Developer Section */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground mb-3 text-center">Contact Developer</p>
            <div className="space-y-2 text-sm">
              <a
                href="mailto:harsha@speak2myai.com"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors justify-center"
              >
                <Mail className="w-4 h-4" />
                <span>harsha@speak2myai.com</span>
              </a>
              <button
                type="button"
                onClick={() => setShowPhone(!showPhone)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors justify-center w-full"
              >
                <Phone className="w-4 h-4" />
                {showPhone ? (
                  <a href="tel:+16317100432" className="hover:underline">+1 631-710-0432</a>
                ) : (
                  <span>Show phone number</span>
                )}
              </button>
              <a
                href="https://www.linkedin.com/in/bandaruharshavardhan17/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors justify-center"
              >
                <Linkedin className="w-4 h-4" />
                <span>LinkedIn Profile</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Modal */}
      <FeedbackModal
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        defaultContext="auth_error"
        screenName="Login"
      />
    </div>
  );
}
