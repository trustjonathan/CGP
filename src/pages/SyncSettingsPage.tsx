import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Cloud, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/contexts/useAuth';
import { readOnboardingState, saveOnboardingState } from '@/lib/localSync';
import type { OnboardingLocalState, SetupReminderState } from '@/lib/onboarding';

const defaultReminder: SetupReminderState = { lastShownAt: null, snoozedUntil: null, dismissals: 0, notificationsEnabled: false };

function formatSyncTime(value: string | null) {
  if (!value) return 'Not synced yet';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SyncSettingsPage() {
  const { lastSyncedAt, syncing, retrySync } = useAppData();
  const { user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const notificationsAvailable = typeof Notification !== 'undefined';

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    void readOnboardingState(user.id).then((state) => {
      if (active) setNotificationsEnabled(state?.reminder.notificationsEnabled === true);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to load CGP notification preferences.', error);
      setNotificationMessage('Notification preferences could not be loaded from this device.');
    });
    return () => { active = false; };
  }, [user?.id]);

  const setNotificationPreference = async (enabled: boolean) => {
    if (!user?.id || !notificationsAvailable) return;
    setNotificationBusy(true);
    setNotificationMessage('');
    try {
      if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setNotificationMessage('Notifications were not enabled. You can continue using CGP without them.');
          return;
        }
      }
      const state = await readOnboardingState(user.id);
      const nextState: Omit<OnboardingLocalState, 'user_id' | 'updated_at'> = {
        draft: state?.draft ?? null,
        metrics: state?.metrics ?? { stepReached: {}, stepSkipped: {}, completed: 0, timeToFirstCgpaMs: null },
        reminder: { ...(state?.reminder ?? defaultReminder), notificationsEnabled: enabled },
      };
      await saveOnboardingState(user.id, nextState);
      setNotificationsEnabled(enabled);
      setNotificationMessage(enabled ? 'Local notifications are enabled on this device.' : 'Local notifications are disabled.');
    } catch (error) {
      console.error('Unable to update CGP local notification preferences.', error);
      setNotificationMessage('Notification preference could not be saved on this device.');
    } finally {
      setNotificationBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Preferences</p>
        <h1 className="mt-1 font-display text-3xl font-black">Sync &amp; storage</h1>
      </header>

      <section className="card space-y-5 p-5" aria-labelledby="sync-status-title">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary-50 p-2 text-primary-700"><Cloud className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="sync-status-title" className="font-display text-xl font-bold text-ink-900">Account sync</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">Your workspace syncs when connected.</p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Connection</dt>
            <dd className={`mt-2 flex items-center gap-2 text-sm font-semibold ${online ? 'text-success-700' : 'text-error-700'}`}>
              {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              {online ? 'Online' : 'Offline — changes sync when connected'}
            </dd>
          </div>
          <div className="rounded-xl border border-ink-200 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Last synced</dt>
            <dd className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
              {formatSyncTime(lastSyncedAt)}
            </dd>
          </div>
        </dl>

        <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={retrySync} disabled={!online || syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </section>

      <section className="card p-5" aria-labelledby="version-title">
        <h2 id="version-title" className="font-display text-lg font-bold text-ink-900">Application version</h2>
        <p className="mt-2 text-sm text-ink-600">
          CGP Web <span className="font-semibold text-ink-900">{version}</span>
        </p>
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="setup-preferences-title">
        <div>
          <h2 id="setup-preferences-title" className="font-display text-lg font-bold text-ink-900">Academic setup</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">Update your academic details.</p>
        </div>
        <Link to="/onboarding?again=1" className="btn-secondary inline-flex items-center gap-2">Run setup again</Link>
        {notificationsAvailable && (
          <div className="border-t border-ink-100 pt-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 text-primary-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-ink-900">Local setup reminders</h3>
                <p className="mt-1 text-sm leading-6 text-ink-600">Optional Windows notifications.</p>
                <button type="button" className="btn-secondary mt-3" disabled={notificationBusy} onClick={() => void setNotificationPreference(!notificationsEnabled)}>
                  {notificationBusy ? 'Saving…' : notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
                </button>
                {notificationMessage && <p role="status" className="mt-2 text-sm text-ink-600">{notificationMessage}</p>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
