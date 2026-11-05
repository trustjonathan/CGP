import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { DashboardPage } from '@/pages/DashboardPage';
import { SemestersPage } from '@/pages/SemestersPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SimulatorPage } from '@/pages/SimulatorPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { HelpPage } from '@/pages/HelpPage';
import { MultiVaultManager } from '@/components/MultiVaultManager';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { AuthScreen } from '@/components/AuthScreen';
import { AppDataProvider, useAppData } from '@/lib/useAppData';
import { ReleasePage } from '@/pages/ReleasePage';

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/releases" element={<ReleasePage />} />
          <Route path="*" element={<AuthenticatedApp />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f6fa] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-ink-500">
          <img src="/cgp-mark.svg" alt="" className="h-9 w-9 rounded-xl" />
          Securing your workspace…
        </div>
      </main>
    );
  }

  if (!user || isPasswordRecovery) return <AuthScreen />;

  return (
    <AppDataProvider>
      <CloudWorkspace />
    </AppDataProvider>
  );
}

function CloudWorkspace() {
  const {
    loading,
    loadError,
    syncError,
    syncing,
    pendingConflict,
    retryLoad,
    retrySync,
    resolveConflict,
  } = useAppData();

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-ink-500">
          <img src="/cgp-mark.svg" alt="" className="h-9 w-9 rounded-xl" />
          Loading your CGP records from Supabase…
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-ink-50 flex items-center justify-center px-4">
        <section className="w-full max-w-lg rounded-2xl border border-error-200 bg-white p-7 shadow-sm">
          <h1 className="font-display text-xl font-bold text-ink-900">Your cloud workspace isn’t ready</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-error-700">{loadError}</p>
          <button type="button" className="btn-primary mt-5" onClick={retryLoad}>Retry</button>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pt-20 lg:pt-6 max-w-6xl mx-auto w-full">
        {(syncing || syncError) && (
          <div
            role={syncError ? 'alert' : 'status'}
            className={`mb-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
              syncError
                ? 'border-error-200 bg-error-50 text-error-800'
                : 'border-primary-200 bg-primary-50 text-primary-800'
            }`}
          >
            <span>{syncError || 'Saving your changes to Supabase…'}</span>
            {pendingConflict ? (
              <span className="flex shrink-0 flex-wrap gap-2">
                <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-error-800 shadow-sm" onClick={() => void resolveConflict('keep_local')}>
                  Keep this version
                </button>
                <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-error-800 shadow-sm" onClick={() => void resolveConflict('keep_server')}>
                  Keep cloud version
                </button>
              </span>
            ) : syncError ? (
              <button className="shrink-0 font-semibold underline" onClick={retrySync}>Retry</button>
            ) : null}
          </div>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/semesters" element={<SemestersPage />} />
          <Route path="/course/:id" element={<CourseDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/vault" element={<MultiVaultManager />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
