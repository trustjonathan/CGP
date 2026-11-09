import { Share2, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ImportSetupPage } from '@/pages/ImportSetupPage';
import { ShareSetupPage } from '@/pages/ShareSetupPage';

type SetupTab = 'share' | 'import';

export function SetupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: SetupTab = searchParams.get('tab') === 'import' ? 'import' : 'share';

  const selectTab = (tab: SetupTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink-900">Setups</h1>
        <p className="mt-1 text-sm text-ink-500">Share a course setup or import one into your account.</p>
      </header>
      <div className="flex border-b border-ink-200" role="tablist" aria-label="Setup actions">
        <button
          type="button"
          role="tab"
          id="setup-share-tab"
          aria-selected={activeTab === 'share'}
          aria-controls="setup-tab-panel"
          onClick={() => selectTab('share')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
            activeTab === 'share' ? 'border-primary-600 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" /> Share my setup
        </button>
        <button
          type="button"
          role="tab"
          id="setup-import-tab"
          aria-selected={activeTab === 'import'}
          aria-controls="setup-tab-panel"
          onClick={() => selectTab('import')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
            activeTab === 'import' ? 'border-primary-600 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Import a setup
        </button>
      </div>
      <section id="setup-tab-panel" role="tabpanel" aria-labelledby={activeTab === 'share' ? 'setup-share-tab' : 'setup-import-tab'}>
        {activeTab === 'share' ? <ShareSetupPage /> : <ImportSetupPage />}
      </section>
    </div>
  );
}
