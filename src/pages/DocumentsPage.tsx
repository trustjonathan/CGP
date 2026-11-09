import { lazy, Suspense } from 'react';
import { ArrowLeft, BookOpen, ExternalLink, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { documentsConfig } from '@/config/documents.config';

const PdfReader = lazy(async () => {
  const module = await import('@/pages/PdfReader');
  return { default: module.PdfReader };
});

function LoadingReader() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-3 rounded-xl border border-ink-200 bg-white p-5" role="status" aria-label="Loading reader">
      <div className="h-5 w-1/3 rounded bg-ink-100" />
      <div className="h-[55vh] rounded bg-ink-100" />
      <span className="sr-only">Loading PDF reader…</span>
    </div>
  );
}

export function DocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const document = documentsConfig.documents.find((item) => item.id === id);

  if (id && !document) {
    return (
      <section className="card p-6">
        <h1 className="font-display text-xl font-bold text-ink-900">Document not found</h1>
        <p className="mt-2 text-sm text-ink-500">This document is not in the university documents list.</p>
        <Link to="/documents" className="btn-secondary mt-4"><ArrowLeft className="h-4 w-4" /> Documents</Link>
      </section>
    );
  }

  if (document && documentsConfig.bundlePdfs) {
    return (
      <div className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{document.versionLabel}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">{document.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{document.note}</p>
        </header>
        <Suspense fallback={<LoadingReader />}>
          <PdfReader key={document.id} document={document} />
        </Suspense>
      </div>
    );
  }

  if (document) {
    return (
      <div className="space-y-4">
        <Link to="/documents" className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-800">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Documents
        </Link>
        <section className="card p-5 sm:p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-700">{document.versionLabel}</p>
          <h1 className="mt-1 font-display text-xl font-bold text-ink-900">{document.title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">{document.note}</p>
          <a href={document.officialUrl} target="_blank" rel="noreferrer" className="btn-primary mt-5">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open official source
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink-900">Rules & Documents</h1>
        <p className="mt-1 text-sm text-ink-500">University policy and handbook references.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {documentsConfig.documents.map((item) => (
          <article key={item.id} className="card flex flex-col p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary-700">{item.versionLabel}</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">{item.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-ink-600">{item.note}</p>
            {documentsConfig.bundlePdfs ? (
              <Link to={`/documents/${item.id}?page=1`} className="btn-primary mt-5">Read in app</Link>
            ) : (
              <a href={item.officialUrl} target="_blank" rel="noreferrer" className="btn-primary mt-5">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open official source
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
