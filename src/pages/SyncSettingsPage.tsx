import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';

function formatSyncTime(value: string | null) {
  if (!value) return 'Not synced in this session';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SyncSettingsPage() {
  const { lastSyncedAt, syncing, retrySync } = useAppData();
  const [online, setOnline] = useState(navigator.onLine);
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0';

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Preferences</p>
        <h1 className="mt-1 font-display text-3xl font-black">Sync &amp; storage</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-100">
          The web app loads and saves your account records with Supabase. Internet access is required to open and update your workspace.
        </p>
      </header>

      <section className="card space-y-5 p-5" aria-labelledby="sync-status-title">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary-50 p-2 text-primary-700"><Cloud className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="sync-status-title" className="font-display text-xl font-bold text-ink-900">Account sync</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Academic records are authoritative in your signed-in Supabase account. The web app does not keep an offline-first local copy.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Connection</dt>
            <dd className={`mt-2 flex items-center gap-2 text-sm font-semibold ${online ? 'text-success-700' : 'text-error-700'}`}>
              {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              {online ? 'Online' : 'Offline — connect to load or save records'}
            </dd>
          </div>
          <div className="rounded-xl border border-ink-200 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Last cloud sync</dt>
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
    </div>
  );
}
