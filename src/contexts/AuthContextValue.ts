import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; confirmationRequired: boolean }>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<string | null>;
  clearPasswordRecovery: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
