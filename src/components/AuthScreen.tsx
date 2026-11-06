import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

const passwordRequirements = 'Use at least 8 characters.';

function getDisplayAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('email not confirmed')) {
    return 'Sign-in is not enabled for this account yet. Please contact CGP support.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'Could not reach CGP sign-in. Check your internet connection and try again.';
  }
  return message;
}

export function AuthScreen({ onBack }: { onBack?: () => void } = {}) {
  const {
    isPasswordRecovery,
    configurationError,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    clearPasswordRecovery,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>(isPasswordRecovery ? 'reset-password' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isPasswordRecovery) setMode('reset-password');
  }, [isPasswordRecovery]);

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
    setPassword('');
    if (nextMode !== 'reset-password') clearPasswordRecovery();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (mode !== 'forgot-password' && password.length < 8) {
      setErrorMessage(passwordRequirements);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const error = await signIn(email.trim(), password);
        if (error) setErrorMessage(getDisplayAuthError(error));
      } else if (mode === 'sign-up') {
        const result = await signUp(email.trim(), password);
        if (result.error) {
          setErrorMessage(getDisplayAuthError(result.error));
        } else if (result.confirmationRequired) {
          setSuccessMessage('Your account request was received, but sign-in is not enabled yet. Please contact CGP support.');
          setMode('sign-in');
        }
      } else if (mode === 'forgot-password') {
        const error = await requestPasswordReset(email.trim());
        if (error) setErrorMessage(getDisplayAuthError(error));
        else setSuccessMessage('If an account exists for this address, a password reset link is on its way.');
      } else {
        const error = await updatePassword(password);
        if (error) setErrorMessage(getDisplayAuthError(error));
        else {
          setPassword('');
          setSuccessMessage('Your password has been updated.');
        }
      }
    } catch (error) {
      console.error('Authentication request failed.', error);
      setErrorMessage('We could not complete that request. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const isPasswordMode = mode === 'sign-in' || mode === 'sign-up' || mode === 'reset-password';
  const title = mode === 'sign-in'
    ? 'Welcome back'
    : mode === 'sign-up'
      ? 'Create your CGP account'
      : mode === 'forgot-password'
        ? 'Reset your password'
        : 'Choose a new password';
  const description = mode === 'sign-in'
    ? 'Sign in to access your academic workspace.'
    : mode === 'sign-up'
      ? 'Create an account to keep your academic records connected.'
      : mode === 'forgot-password'
        ? 'We’ll email you a secure link to reset your password.'
        : 'Set a new password for your CGP account.';
  const submitLabel = mode === 'sign-in'
    ? 'Sign in'
    : mode === 'sign-up'
      ? 'Create account'
      : mode === 'forgot-password'
        ? 'Send reset link'
        : 'Update password';

  return (
    <main className="min-h-screen bg-[#f3f6fa] px-4 py-10 sm:px-6 flex flex-col items-center justify-center">
      {onBack && (
        <button type="button" className="btn-ghost mb-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to setup preview
        </button>
      )}
      <div className="w-full max-w-[440px]">
        <div className="mb-7 flex items-center justify-center gap-3">
          <img src="/cgp-mark.svg" alt="" className="h-12 w-12 rounded-2xl shadow-sm" />
          <div>
            <div className="font-display text-xl font-bold tracking-tight text-ink-950">CGP</div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-500">ACADEMIC SUITE</div>
          </div>
        </div>

        <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-[0_24px_70px_-35px_rgba(16,38,63,0.28)] sm:p-8">
          <div className="mb-7">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              {mode === 'forgot-password' || mode === 'reset-password'
                ? <KeyRound className="h-5 w-5" />
                : <ShieldCheck className="h-5 w-5" />}
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-950">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-ink-500">{description}</p>
          </div>

          {configurationError && (
            <div role="alert" className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-900">
              <div className="font-semibold">Supabase configuration required</div>
              <p>{configurationError}</p>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="mb-5 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-5 flex gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm leading-6 text-success-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== 'reset-password' && (
              <div>
                <label htmlFor="auth-email" className="label">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="input pl-10"
                    placeholder="you@university.edu"
                    disabled={busy || Boolean(configurationError)}
                  />
                </div>
              </div>
            )}

            {isPasswordMode && (
              <div>
                <label htmlFor="auth-password" className="label">
                  {mode === 'reset-password' ? 'New password' : 'Password'}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === 'sign-up' ? 'new-password' : mode === 'reset-password' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input"
                  placeholder="At least 8 characters"
                  disabled={busy || Boolean(configurationError)}
                />
              </div>
            )}

            {mode === 'sign-in' && (
              <div className="-mt-1 flex justify-end">
                <button type="button" onClick={() => selectMode('forgot-password')} className="text-sm font-medium text-primary-700 hover:text-primary-800">
                  Forgot password?
                </button>
              </div>
            )}

            <button type="submit" className="btn-primary w-full !py-3" disabled={busy || Boolean(configurationError)}>
              {busy ? 'Please wait…' : submitLabel}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {mode === 'sign-in' && (
            <p className="mt-6 text-center text-sm text-ink-500">
              New to CGP?{' '}
              <button onClick={() => selectMode('sign-up')} className="font-semibold text-primary-700 hover:text-primary-800">
                Create an account
              </button>
            </p>
          )}

          {mode === 'sign-up' && (
            <p className="mt-6 text-center text-sm text-ink-500">
              Already have an account?{' '}
              <button onClick={() => selectMode('sign-in')} className="font-semibold text-primary-700 hover:text-primary-800">
                Sign in
              </button>
            </p>
          )}

          {(mode === 'forgot-password' || mode === 'reset-password') && (
            <button
              onClick={() => selectMode('sign-in')}
              className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-medium text-ink-600 hover:text-ink-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          )}

          <div className="mt-7 border-t border-ink-100 pt-4 text-center text-xs leading-5 text-ink-400">
            Your account protects your academic workspace. Your password is handled securely by Supabase Auth.
          </div>
          <Link to="/releases" className="btn-secondary mt-4 w-full">
            <Download className="h-4 w-4" aria-hidden="true" />
            Download the Windows or Android app
          </Link>
        </section>
      </div>
    </main>
  );
}
