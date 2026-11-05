import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextValue } from './AuthContextValue';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigurationError } from '@/lib/supabase';
import { AuthContext } from './AuthContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Unable to restore the Supabase session.', error);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfigurationError, confirmationRequired: false };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error: error?.message ?? null,
      confirmationRequired: !error && !data.session,
    };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return supabaseConfigurationError;
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return error?.message ?? null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setIsPasswordRecovery(false);
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.signOut();
    return error?.message ?? null;
  }, []);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    isPasswordRecovery,
    configurationError: supabaseConfigurationError,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    clearPasswordRecovery,
  }), [
    session,
    loading,
    isPasswordRecovery,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    clearPasswordRecovery,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
