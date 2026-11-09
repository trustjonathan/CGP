import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import { SyncStatusToast } from '@/components/SyncStatusToast';
import { HelpAssistant } from '@/components/HelpAssistant';
import { SyncSettingsPage } from '@/pages/SyncSettingsPage';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PublicImportPage } from '@/pages/PublicImportPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SetupsPage } from '@/pages/SetupsPage';
import { ImportSetupPage } from '@/pages/ImportSetupPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { CalendarPage } from '@/pages/CalendarPage';

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/releases" element={<ReleasePage />} />
          <Route path="/import/:token" element={<ImportRoute />} />
          <Route path="*" element={<AuthenticatedApp />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

function ImportRoute() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-ink-500">
          <img src="/cgp-mark.svg" alt="" className="h-9 w-9 rounded-xl" />
          Opening your shared setup…
        </div>
      </main>
    );
  }

  if (!user || isPasswordRecovery) return <PublicImportPage />;
  return (
    <AppDataProvider>
      <CloudWorkspace />
    </AppDataProvider>
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
    data,
    loading,
    loadError,
    syncError,
    syncing,
    pendingConflict,
    retryLoad,
    retrySync,
    resolveConflict,
  } = useAppData();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-ink-500">
          <img src="/cgp-mark.svg" alt="" className="h-9 w-9 rounded-xl" />
          Loading your workspace…
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-ink-50 flex items-center justify-center px-4">
        <section className="relative w-full max-w-lg rounded-2xl border border-error-200 bg-white p-7 shadow-sm">
          <h1 className="font-display text-xl font-bold text-ink-900">Your cloud workspace isn’t ready</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-error-700">
            Your workspace could not be loaded. Check your connection and try again.
          </p>
          <button type="button" className="btn-primary mt-5" onClick={retryLoad}>Retry</button>
          <HelpAssistant />
        </section>
      </main>
    );
  }

  if (location.pathname === '/onboarding'
    || (!data.semesters.length && data.settings.onboardingCompleted !== true)) {
    return <main className="min-h-screen bg-ink-50 px-3 py-5 sm:px-6 sm:py-8"><OnboardingPage /></main>;
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 pt-20 lg:pb-6 lg:pt-6 max-w-6xl mx-auto w-full">
        <SyncStatusToast
          syncError={syncError}
          syncing={syncing}
          retrySync={retrySync}
          pendingConflict={Boolean(pendingConflict)}
          resolveConflict={resolveConflict}
        />
        <OfflineStatusBanner />
        <HelpAssistant />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/semesters" element={<SemestersPage />} />
          <Route path="/course/:id" element={<CourseDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentsPage />} />
          <Route path="/vault" element={<MultiVaultManager />} />
          <Route path="/setups" element={<SetupsPage />} />
          <Route path="/share-setup" element={<Navigate to="/setups?tab=share" replace />} />
          <Route path="/import/:token" element={<ImportSetupPage />} />
          <Route path="/import" element={<Navigate to="/setups?tab=import" replace />} />
          <Route path="/settings/sync" element={<SyncSettingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </main>
    </div>
  );
}

function OfflineStatusBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  if (online) return null;
  return (
    <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm leading-6 text-primary-800">
      <WifiOff className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Offline. Some features need a connection.</span>
    </p>
  );
}

export default App;
