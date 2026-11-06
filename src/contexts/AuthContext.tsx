import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextValue } from './AuthContextValue';
import type { Session } from '@supabase/supabase-js';
import {
  clearPersistedSession,
  isRejectedRefreshError,
  readPersistedSession,
  supabase,
  supabaseConfigurationError,
} from '@/lib/supabase';
import { scheduleAfterStartupIdle } from '@/lib/startup';
import { AuthContext } from './AuthContextValue';

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  return (candidate.name === 'TypeError' && /fetch|network|load failed/i.test(message))
    || /failed to fetch|fetch failed|network request failed|network error|internet disconnected|connection (?:was )?(?:lost|closed|reset)|timed out|econnreset|enotfound/i.test(message)
    || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ERR_INTERNET_DISCONNECTED'].includes(code);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const cachedSession = useRef<Session | null>(null);
  const authInitialized = useRef(false);
  const refreshInProgress = useRef(false);
  const refreshTimer = useRef<number | null>(null);
  const authSubscription = useRef<{ unsubscribe: () => void } | null>(null);

  const handleAuthStateChange = useCallback((event: string, nextSession: Session | null) => {
    if (event === 'INITIAL_SESSION' && !nextSession && cachedSession.current) {
      setLoading(false);
      return;
    }

    if (event === 'SIGNED_OUT') cachedSession.current = null;
    else if (nextSession) cachedSession.current = nextSession;
    setSession(nextSession);
    setLoading(false);
    if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
  }, []);

  const subscribeToAuthChanges = useCallback(() => {
    if (!supabase || authSubscription.current) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);
    authSubscription.current = subscription;
  }, [handleAuthStateChange]);

  const refreshCurrentSession = useCallback(async () => {
    const currentSession = cachedSession.current;
    if (!supabase || !navigator.onLine || !currentSession?.refresh_token || refreshInProgress.current) return;
    if (typeof currentSession.expires_at === 'number'
      && currentSession.expires_at * 1000 - Date.now() > 5 * 60 * 1000) return;

    refreshInProgress.current = true;
    try {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: currentSession.refresh_token });
      if (error) {
        if (isRejectedRefreshError(error)) {
          try {
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
            if (signOutError) throw signOutError;
          } catch (signOutError) {
            console.error('Unable to clear the rejected CGP session from the auth client.', signOutError);
            await clearPersistedSession();
          }
          cachedSession.current = null;
          setSession(null);
          setIsPasswordRecovery(false);
        } else if (!isNetworkError(error)) {
          console.error('Unable to refresh the saved CGP session in the background.', error);
        }
        return;
      }
      if (data.session) {
        cachedSession.current = data.session;
        setSession(data.session);
      }
    } catch (error) {
      if (!isNetworkError(error)) console.error('Unable to refresh the saved CGP session in the background.', error);
    } finally {
      refreshInProgress.current = false;
    }
  }, []);

  const beginAuthInitialization = useCallback(async () => {
    if (!supabase || authInitialized.current || !navigator.onLine) return;
    authInitialized.current = true;
    subscribeToAuthChanges();
    try {
      const { error } = await supabase.auth.initialize();
      if (error && !isNetworkError(error)) console.error('Unable to initialize background CGP session handling.', error);
    } catch (error) {
      if (!isNetworkError(error)) console.error('Unable to initialize background CGP session handling.', error);
    }
    if (refreshTimer.current === null) {
      refreshTimer.current = window.setInterval(() => void refreshCurrentSession(), 60_000);
    }
    await refreshCurrentSession();
  }, [refreshCurrentSession, subscribeToAuthChanges]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const cancelDeferredInitialization = scheduleAfterStartupIdle(() => void beginAuthInitialization());
    const initializeWhenOnline = () => {
      cancelDeferredInitialization();
      void beginAuthInitialization().then(refreshCurrentSession);
    };
    const refreshWhenFocused = () => {
      if (authInitialized.current) void refreshCurrentSession();
    };
    window.addEventListener('online', initializeWhenOnline);
    window.addEventListener('focus', refreshWhenFocused);
    void readPersistedSession().then((storedSession) => {
      if (!active) return;
      if (storedSession) {
        cachedSession.current = storedSession;
        setSession(storedSession);
      }
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to restore the saved CGP session.', error);
      setLoading(false);
    });

    return () => {
      active = false;
      cancelDeferredInitialization();
      window.removeEventListener('online', initializeWhenOnline);
      window.removeEventListener('focus', refreshWhenFocused);
      if (refreshTimer.current !== null) {
        window.clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
      authSubscription.current?.unsubscribe();
      authSubscription.current = null;
    };
  }, [beginAuthInitialization, refreshCurrentSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return supabaseConfigurationError;
    if (!navigator.onLine) return 'Connect to the internet to sign in to CGP.';
    await beginAuthInitialization();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, [beginAuthInitialization]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfigurationError, confirmationRequired: false };
    if (!navigator.onLine) return { error: 'Connect to the internet to create a CGP account.', confirmationRequired: false };
    await beginAuthInitialization();
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error: error?.message ?? null,
      confirmationRequired: !error && !data.session,
    };
  }, [beginAuthInitialization]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return supabaseConfigurationError;
    if (!navigator.onLine) return 'Connect to the internet to reset your CGP password.';
    await beginAuthInitialization();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return error?.message ?? null;
  }, [beginAuthInitialization]);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return supabaseConfigurationError;
    if (!navigator.onLine) return 'Connect to the internet to update your password.';
    await beginAuthInitialization();
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setIsPasswordRecovery(false);
    return error?.message ?? null;
  }, [beginAuthInitialization]);

  const signOut = useCallback(async () => {
    if (!supabase) return supabaseConfigurationError;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      await clearPersistedSession();
      cachedSession.current = null;
      setSession(null);
    }
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
