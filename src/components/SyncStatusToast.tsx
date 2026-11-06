import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';

interface SyncStatusToastProps {
  syncing: boolean;
  syncError: string;
  retrySync: () => void;
  pendingConflict: boolean;
  resolveConflict: (resolution: 'keep_local' | 'keep_server') => Promise<void>;
}

export function SyncStatusToast({
  syncing,
  syncError,
  retrySync,
  pendingConflict,
  resolveConflict,
}: SyncStatusToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (syncError || pendingConflict) {
      setVisible(true);
      return;
    }

    if (syncing) {
      if (visible) return;
      const timer = window.setTimeout(() => setVisible(true), 1200);
      return () => window.clearTimeout(timer);
    }

    if (visible) {
      const timer = window.setTimeout(() => setVisible(false), 700);
      return () => window.clearTimeout(timer);
    }
  }, [pendingConflict, syncError, syncing, visible]);

  return (
    <div
      aria-hidden={!visible}
      role={visible ? (syncError ? 'alert' : 'status') : undefined}
      className={`fixed left-1/2 top-16 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 transition-[opacity,transform] duration-300 ease-out sm:left-auto sm:right-6 sm:translate-x-0 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
    >
      <div className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
        syncError ? 'border-error-200 bg-error-50 text-error-800' : 'border-primary-200 bg-white text-primary-800'
      }`}>
        <div className="flex items-center gap-3">
          {syncError
            ? <AlertCircle className="h-4 w-4 shrink-0 text-error-600" aria-hidden="true" />
            : <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary-600" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{syncError || 'Saving your changes to Supabase…'}</span>
          {pendingConflict ? null : syncError ? (
            <button type="button" tabIndex={visible ? 0 : -1} className="shrink-0 font-semibold underline" onClick={retrySync}>
              Retry
            </button>
          ) : null}
        </div>
        {pendingConflict && (
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-error-200 pt-3">
            <button
              type="button"
              tabIndex={visible ? 0 : -1}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-error-800 shadow-sm"
              onClick={() => void resolveConflict('keep_local')}
            >
              Keep this version
            </button>
            <button
              type="button"
              tabIndex={visible ? 0 : -1}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-error-800 shadow-sm"
              onClick={() => void resolveConflict('keep_server')}
            >
              Keep cloud version
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
