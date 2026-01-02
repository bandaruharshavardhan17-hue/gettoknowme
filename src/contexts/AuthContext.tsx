import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Storage key for remember me preference
const REMEMBER_ME_KEY = 'auth_remember_me';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || null,
        }
      }
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    // Store remember me preference
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      // If not remembering, we'll clear on tab close via beforeunload
    }
    
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    // If not remembering and login successful, set up session cleanup on tab close
    if (!error && !rememberMe && data.session) {
      // Copy session to sessionStorage for reference
      sessionStorage.setItem('auth_session_active', 'true');
    }
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    localStorage.removeItem(REMEMBER_ME_KEY);
    sessionStorage.removeItem('auth_session_active');
    await supabase.auth.signOut();
  };

  // Handle session expiry for "don't remember me" users
  useEffect(() => {
    const handleBeforeUnload = () => {
      const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
      const sessionActive = sessionStorage.getItem('auth_session_active');
      
      // If user chose not to remember and has an active session, sign out
      if (!rememberMe && sessionActive) {
        // Note: Can't await in beforeunload, so this is best-effort
        supabase.auth.signOut();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Check on mount if we should clear the session (browser was closed)
  useEffect(() => {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
    const wasSessionActive = sessionStorage.getItem('auth_session_active');
    
    // If there's no remember me preference and the session flag isn't in sessionStorage,
    // this might be a new browser session - check and clear if needed
    if (!rememberMe && !wasSessionActive) {
      // User didn't choose to remember, and this is a new browser session
      // The beforeunload might not have worked, so check if we should sign out
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // There's a session but user didn't want to remember - this shouldn't happen
          // unless beforeunload failed. Sign out to be safe.
          supabase.auth.signOut();
        }
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
