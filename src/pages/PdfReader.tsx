import { useCallback, useEffect, useRef, useState, type ComponentProps, type TouchEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus, Search, ZoomIn } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import type { UniversityDocument } from '@/config/documents.config';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PdfDocument = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];
type PinchOrigin = { distance: number; scale: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetweenTouches(touches: TouchEvent<HTMLDivElement>['touches']) {
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-3 rounded-xl border border-ink-200 bg-white p-5" role="status" aria-label="Loading PDF">
      <div className="h-5 w-1/3 rounded bg-ink-100" />
      <div className="h-[55vh] rounded bg-ink-100" />
      <span className="sr-only">Loading document pages…</span>
    </div>
  );
}

export function PdfReader({ document }: { document: UniversityDocument }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get('page')) || 1;
  const [pageNumber, setPageNumber] = useState(Math.max(1, requestedPage));
  const [jumpValue, setJumpValue] = useState(String(Math.max(1, requestedPage)));
  const [pageCount, setPageCount] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(760);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageError, setPageError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchPages, setSearchPages] = useState<number[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const readerRef = useRef<HTMLDivElement>(null);
  const pinchOriginRef = useRef<PinchOrigin | null>(null);

  const pdfUrl = new URL(`${import.meta.env.BASE_URL}${document.file}`, window.location.href).toString();

  useEffect(() => {
    const container = readerRef.current;
    if (!container) return;
    const resize = () => setPageWidth(Math.max(240, Math.min(760, container.clientWidth - 24)));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const updatePage = useCallback((page: number) => {
    const nextPage = clamp(Math.floor(page), 1, pageCount || Number.MAX_SAFE_INTEGER);
    setPageNumber(nextPage);
    setJumpValue(String(nextPage));
    setPageError('');
    setSearchParams({ page: String(nextPage) }, { replace: true });
  }, [pageCount, setSearchParams]);

  const handleLoadSuccess = (loadedPdf: PdfDocument) => {
    const total = loadedPdf.numPages;
    setPdfDocument(loadedPdf);
    setPageCount(total);
    setLoading(false);
    setLoadError('');
    updatePage(clamp(requestedPage, 1, total));
  };

  const handleLoadError = (error: Error) => {
    console.error(`Unable to load bundled document ${document.id}.`, error);
    setLoading(false);
    setLoadError('This document could not be loaded. Open the official source instead.');
  };

  const searchDocument = async () => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query || !pdfDocument) {
      setSearchPages([]);
      setSearchError('');
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchPages([]);
    setHasSearched(true);
    try {
      const matchingPages: number[] = [];
      for (let page = 1; page <= pdfDocument.numPages; page += 1) {
        const content = await (await pdfDocument.getPage(page)).getTextContent();
        const pageText = content.items
          .filter((item): item is typeof item & { str: string } => 'str' in item && typeof item.str === 'string')
          .map((item) => item.str)
          .join(' ')
          .toLocaleLowerCase();
        if (pageText.includes(query)) matchingPages.push(page);
      }
      setSearchPages(matchingPages);
      setActiveSearchIndex(0);
      if (matchingPages.length > 0) updatePage(matchingPages[0]);
    } catch (error) {
      console.error(`Unable to search bundled document ${document.id}.`, error);
      setSearchError('Text search failed for this document. Try again or open the official source.');
    } finally {
      setSearching(false);
    }
  };

  const moveSearchResult = (direction: -1 | 1) => {
    if (searchPages.length === 0) return;
    const nextIndex = (activeSearchIndex + direction + searchPages.length) % searchPages.length;
    setActiveSearchIndex(nextIndex);
    updatePage(searchPages[nextIndex]);
  };

  const handlePinchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    pinchOriginRef.current = { distance: distanceBetweenTouches(event.touches), scale: zoom };
  };

  const handlePinchMove = (event: TouchEvent<HTMLDivElement>) => {
    const origin = pinchOriginRef.current;
    if (!origin || event.touches.length !== 2) return;
    event.preventDefault();
    setZoom(clamp(origin.scale * (distanceBetweenTouches(event.touches) / origin.distance), 0.6, 2.5));
  };

  const handlePinchEnd = () => {
    pinchOriginRef.current = null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/documents" className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-800">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Documents
        </Link>
        <a href={document.officialUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-700 hover:text-primary-800">
          Open official source
        </a>
      </div>

      <section className="card overflow-hidden" aria-label={`${document.title} PDF reader`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <button type="button" className="btn-secondary px-3" onClick={() => updatePage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-sm tabular-nums text-ink-600">Page {pageNumber} of {pageCount || '—'}</span>
          <button type="button" className="btn-secondary px-3" onClick={() => updatePage(pageNumber + 1)} disabled={!pageCount || pageNumber >= pageCount} aria-label="Next page">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const nextPage = Number(jumpValue);
              if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage <= pageCount) updatePage(nextPage);
              else setPageError(`Enter a page from 1 to ${pageCount}.`);
            }}
          >
            <label htmlFor="pdf-page-jump" className="sr-only">Jump to page</label>
            <input id="pdf-page-jump" className="input w-20 py-2 text-sm" inputMode="numeric" pattern="[0-9]*" value={jumpValue} onChange={(event) => setJumpValue(event.target.value)} />
            <button type="submit" className="btn-secondary px-3" disabled={!pageCount}>Go</button>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-secondary px-3" onClick={() => setZoom((value) => clamp(value - 0.15, 0.6, 2.5))} aria-label="Zoom out">
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-12 text-center text-xs tabular-nums text-ink-600">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn-secondary px-3" onClick={() => setZoom((value) => clamp(value + 0.15, 0.6, 2.5))} aria-label="Zoom in">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {pageError && <p role="alert" className="mt-2 text-xs text-error-700">{pageError}</p>}
        </div>

        <div className="border-b border-ink-100 p-3">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void searchDocument();
            }}
          >
            <label htmlFor="pdf-text-search" className="sr-only">Search document text</label>
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" aria-hidden="true" />
              <input id="pdf-text-search" className="input pl-9" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search text in this document" />
            </div>
            <button type="submit" className="btn-secondary" disabled={!pdfDocument || searching}>
              <Search className="h-4 w-4" aria-hidden="true" /> {searching ? 'Searching…' : 'Search'}
            </button>
            {searchPages.length > 0 && <div className="flex items-center gap-2 text-xs text-ink-600" aria-live="polite">
              <span>{activeSearchIndex + 1} of {searchPages.length} matching pages</span>
              <button type="button" onClick={() => moveSearchResult(-1)} className="rounded p-1 hover:bg-ink-100" aria-label="Previous search result"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => moveSearchResult(1)} className="rounded p-1 hover:bg-ink-100" aria-label="Next search result"><ChevronRight className="h-4 w-4" /></button>
            </div>}
          </form>
          {searchError && <p role="alert" className="mt-2 text-sm text-error-700">{searchError}</p>}
          {hasSearched && searchPages.length === 0 && !searching && !searchError && (
            <p className="mt-2 text-xs text-ink-500" aria-live="polite">No matching pages found.</p>
          )}
        </div>

        <div
          ref={readerRef}
          className="max-h-[72vh] overflow-auto bg-ink-100 p-3 sm:p-5"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={handlePinchStart}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          onTouchCancel={handlePinchEnd}
        >
          {loading && <ReaderSkeleton />}
          {loadError ? (
            <div role="alert" className="mx-auto max-w-lg rounded-xl border border-error-200 bg-white p-5 text-center">
              <p className="text-sm text-error-700">{loadError}</p>
              <a href={document.officialUrl} target="_blank" rel="noreferrer" className="btn-primary mt-4">Open official source</a>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              loading={null}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={handleLoadError}
              onSourceError={handleLoadError}
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                scale={zoom}
                renderMode="canvas"
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<ReaderSkeleton />}
                onRenderError={handleLoadError}
                className="mx-auto shadow-lg"
              />
            </Document>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> Pinch to zoom on touch screens
        </div>
      </section>
    </div>
  );
}
