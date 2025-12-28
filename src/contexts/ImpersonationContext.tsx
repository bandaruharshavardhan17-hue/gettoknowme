import { createContext, useContext, useState, ReactNode } from 'react';

interface ImpersonatedUser {
  id: string;
  email: string | null;
  display_name: string | null;
}

interface ImpersonationContextType {
  impersonatedUser: ImpersonatedUser | null;
  isImpersonating: boolean;
  startImpersonating: (user: ImpersonatedUser) => void;
  stopImpersonating: () => void;
  getEffectiveUserId: (realUserId: string | undefined) => string | undefined;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  const startImpersonating = (user: ImpersonatedUser) => {
    setImpersonatedUser(user);
  };

  const stopImpersonating = () => {
    setImpersonatedUser(null);
  };

  const getEffectiveUserId = (realUserId: string | undefined): string | undefined => {
    if (impersonatedUser) {
      return impersonatedUser.id;
    }
    return realUserId;
  };

  return (
    <ImpersonationContext.Provider 
      value={{ 
        impersonatedUser, 
        isImpersonating: !!impersonatedUser,
        startImpersonating, 
        stopImpersonating,
        getEffectiveUserId,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
