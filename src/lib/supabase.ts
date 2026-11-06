import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError = !supabaseUrl || !supabaseAnonKey
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.'
  : null;

const projectReference = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
export const supabaseSessionStorageKey = `sb-${projectReference}-auth-token`;

const sessionStorage = {
  getItem: async (key: string) => window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: async (key: string) => window.localStorage.removeItem(key),
};

export async function readPersistedSession(): Promise<Session | null> {
  const raw = await sessionStorage.getItem(supabaseSessionStorageKey);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<Session>;
    if (typeof session.access_token !== 'string'
      || typeof session.refresh_token !== 'string'
      || typeof session.expires_at !== 'number'
      || !session.user
      || typeof session.user.id !== 'string') return null;
    return session as Session;
  } catch (error) {
    console.error('Unable to parse the stored CGP session.', error);
    return null;
  }
}

export async function clearPersistedSession() {
  await sessionStorage.removeItem(supabaseSessionStorageKey);
}

export function isRejectedRefreshError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return ['invalid_grant', 'refresh_token_not_found', 'refresh_token_already_used', 'session_expired'].includes(code)
    || candidate.status === 400 && /invalid.*refresh token|refresh token.*(?:invalid|revoked|expired)/i.test(message);
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: supabaseSessionStorageKey,
        storage: sessionStorage,
        skipAutoInitialize: true,
      },
    })
  : null;
