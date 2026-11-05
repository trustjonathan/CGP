import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { DashboardPage } from '@/pages/DashboardPage';
import { SemestersPage } from '@/pages/SemestersPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SimulatorPage } from '@/pages/SimulatorPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { HelpPage } from '@/pages/HelpPage';
import { MultiVaultManager } from '@/components/MultiVaultManager';

function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen bg-ink-50">
        <Sidebar />
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pt-20 lg:pt-6 max-w-6xl mx-auto w-full">
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
    </HashRouter>
  );
}

export default App;
