import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Github,
  Laptop,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';

const RELEASE_API_URL = 'https://api.github.com/repos/trustjonathan/CGP/releases/latest';
const RELEASES_URL = 'https://github.com/trustjonathan/CGP/releases';
const EXE_DOWNLOAD_URL = 'https://github.com/trustjonathan/CGP/releases/latest/download/cgp-Setup.exe';
const APK_DOWNLOAD_URL = 'https://github.com/trustjonathan/CGP/releases/latest/download/cgp-app-release.apk';
const CHECK_TIMEOUT_MS = 12_000;

interface LatestRelease {
  version: string;
  title: string;
  publishedAt: Date | null;
  notes: string;
  assets: Set<string>;
}

type ReleaseStatus =
  | { kind: 'checking' }
  | { kind: 'available'; release: LatestRelease }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

function getReleaseErrorMessage(status: number): string {
  if (status === 403 || status === 429) {
    return 'GitHub is temporarily limiting release checks. You can retry or browse the releases page directly.';
  }
  return `GitHub could not provide release information (HTTP ${status}). You can retry or browse the releases page directly.`;
}

function formatReleaseDate(date: Date | null): string {
  if (!date) return 'Publication date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

function DownloadCard({
  platform,
  description,
  fileName,
  downloadUrl,
  available,
  children,
}: {
  platform: 'Windows' | 'Android';
  description: string;
  fileName: string;
  downloadUrl: string;
  available: boolean;
  children: ReactNode;
}) {
  const isWindows = platform === 'Windows';
  const PlatformIcon = isWindows ? Laptop : Smartphone;

  return (
    <article className="card flex h-full flex-col p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <PlatformIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <span className="badge border border-ink-200 bg-ink-50 text-ink-600">
          {platform}
        </span>
      </div>

      <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
        CGP for {platform}
      </h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-ink-600">{description}</p>

      <div className="mt-5 flex-1">
        {children}
      </div>

      <div className="mt-6 border-t border-ink-100 pt-4">
        <p className="break-all font-mono text-xs text-ink-500">{fileName}</p>
        {available ? (
          <a
            href={downloadUrl}
            className="btn-primary mt-4 w-full"
            download
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
            Download for {platform}
          </a>
        ) : (
          <button type="button" className="btn-secondary mt-4 w-full" disabled>
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Not included in this release
          </button>
        )}
      </div>
    </article>
  );
}

export function ReleasePage() {
  const [status, setStatus] = useState<ReleaseStatus>({ kind: 'checking' });

  const checkLatestRelease = useCallback(async (signal?: AbortSignal) => {
    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), CHECK_TIMEOUT_MS);
    const forwardAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });

    setStatus({ kind: 'checking' });
    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: timeoutController.signal,
      });

      if (response.status === 404) {
        setStatus({ kind: 'none' });
        return;
      }
      if (!response.ok) {
        throw new Error(getReleaseErrorMessage(response.status));
      }

      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error('GitHub returned an invalid release response.');
      }
      const releaseData = data as {
        tag_name?: unknown;
        name?: unknown;
        body?: unknown;
        published_at?: unknown;
        assets?: unknown;
      };
      if (typeof releaseData.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseData.tag_name)) {
        throw new Error('The latest GitHub release does not have a valid version tag.');
      }

      const assets = Array.isArray(releaseData.assets)
        ? releaseData.assets
          .filter((asset): asset is { name: string; state?: string } => (
            typeof asset === 'object'
            && asset !== null
            && 'name' in asset
            && typeof asset.name === 'string'
          ))
          .filter((asset) => asset.state === undefined || asset.state === 'uploaded')
          .map((asset) => asset.name)
        : [];
      const publishedAt = typeof releaseData.published_at === 'string'
        ? new Date(releaseData.published_at)
        : null;

      setStatus({
        kind: 'available',
        release: {
          version: releaseData.tag_name.replace(/^v/, ''),
          title: typeof releaseData.name === 'string' && releaseData.name.trim()
            ? releaseData.name.trim()
            : `CGP ${releaseData.tag_name}`,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          notes: typeof releaseData.body === 'string' ? releaseData.body.trim() : '',
          assets: new Set(assets),
        },
      });
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Unable to load CGP release information.', error);
      setStatus({
        kind: 'error',
        message: error instanceof Error && error.name !== 'AbortError'
          ? error.message
          : 'The release check timed out. Please try again.',
      });
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkLatestRelease(controller.signal);

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void checkLatestRelease();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      controller.abort();
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [checkLatestRelease]);

  const release = status.kind === 'available' ? status.release : null;
  const hasWindowsInstaller = release?.assets.has('cgp-Setup.exe') ?? false;
  const hasAndroidPackage = release?.assets.has('cgp-app-release.apk') ?? false;

  return (
    <main className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="CGP home">
            <img src="/cgp-mark.svg" alt="" className="h-10 w-10 rounded-xl shadow-sm" />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold tracking-tight text-ink-900">CGP</span>
              <span className="block text-[10px] font-semibold tracking-[0.14em] text-ink-400">ACADEMIC SUITE</span>
            </span>
          </Link>
          <Link to="/" className="btn-ghost shrink-0">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to CGP</span>
            <span className="sm:hidden">Sign in</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-primary-900 p-6 text-white shadow-xl sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-200">Official CGP downloads</p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">Your academic workspace, wherever you work.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-100 sm:text-base">
              Install CGP on Windows or Android for a dedicated app experience. Once installed, your app is designed to work offline; sign in and reconnect when you want to synchronize your account.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-ink-100">
              <span className="inline-flex items-center gap-2"><WifiOff className="h-4 w-4 text-primary-200" aria-hidden="true" /> Work offline</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary-200" aria-hidden="true" /> Official release files</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="latest-release-heading" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">Release channel</p>
              <h2 id="latest-release-heading" className="mt-1 font-display text-2xl font-bold text-ink-900">Latest stable release</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-primary-700">
                <Github className="h-4 w-4" aria-hidden="true" /> All GitHub releases <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => void checkLatestRelease()}
                disabled={status.kind === 'checking'}
                className="btn-secondary"
              >
                <RefreshCw className={`h-4 w-4 ${status.kind === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
                Check again
              </button>
            </div>
          </div>

          {status.kind === 'checking' && (
            <div role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
              Checking GitHub for the latest CGP release…
            </div>
          )}
          {status.kind === 'none' && (
            <div role="status" className="rounded-xl border border-ink-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-ink-900">No public release is available yet.</p>
                  <p className="mt-1 text-sm leading-6 text-ink-600">The official download buttons will become available when a stable GitHub release is published with the Windows and Android files.</p>
                </div>
              </div>
            </div>
          )}
          {status.kind === 'error' && (
            <div role="alert" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-900">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{status.message}</p>
              </div>
            </div>
          )}
          {release && (
            <div className="flex flex-col gap-2 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {release.title} · v{release.version}</span>
              <span className="text-xs text-success-800">Published {formatReleaseDate(release.publishedAt)}</span>
            </div>
          )}
        </section>

        <section aria-label="Platform downloads" className="grid gap-5 md:grid-cols-2">
          <DownloadCard
            platform="Windows"
            description="Install CGP as a dedicated desktop app for your Windows computer."
            fileName="cgp-Setup.exe"
            downloadUrl={EXE_DOWNLOAD_URL}
            available={hasWindowsInstaller}
          >
            <ul className="space-y-2 text-sm text-ink-600">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" /> Dedicated Windows installer</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" /> Keep working when offline</li>
            </ul>
          </DownloadCard>
          <DownloadCard
            platform="Android"
            description="Install the CGP Android app on your phone or tablet."
            fileName="cgp-app-release.apk"
            downloadUrl={APK_DOWNLOAD_URL}
            available={hasAndroidPackage}
          >
            <ul className="space-y-2 text-sm text-ink-600">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" /> Android APK package</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" /> Keep working when offline</li>
            </ul>
          </DownloadCard>
        </section>

        {release?.notes && (
          <section aria-labelledby="release-notes-heading" className="card p-5 sm:p-6">
            <h2 id="release-notes-heading" className="font-display text-lg font-bold text-ink-900">Release notes</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-600">{release.notes}</p>
          </section>
        )}

        <section aria-labelledby="publishing-heading" className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-ink-100 p-2 text-ink-700">
              <Github className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="publishing-heading" className="font-display text-lg font-bold text-ink-900">How official downloads are published</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                This page follows the latest stable release in the official CGP GitHub repository. To publish an update, create a versioned release (for example, <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-800">v1.1.0</code>) and attach the installer files using these exact names:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-ink-700">
                <li><span className="font-semibold">Windows:</span> <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs">cgp-Setup.exe</code></li>
                <li><span className="font-semibold">Android:</span> <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs">cgp-app-release.apk</code></li>
              </ul>
              <p className="mt-4 text-xs leading-5 text-ink-500">
                The page checks GitHub’s release metadata and enables only downloads attached to that release. Draft releases are not shown; once published, the page updates automatically. Android may ask you to allow installation from your browser.
              </p>
            </div>
          </div>
        </section>

        <footer className="border-t border-ink-200 pt-5 text-center text-xs leading-5 text-ink-500">
          Only download CGP installers from this page or the official <a className="font-semibold text-primary-700 hover:text-primary-900" href={RELEASES_URL} target="_blank" rel="noreferrer">CGP GitHub Releases</a> page.
        </footer>
      </div>
    </main>
  );
}
