import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, LoaderCircle, QrCode, ShieldCheck, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAppData } from '@/lib/useAppData';
import { platformAdapter } from '@/lib/platformAdapter';
import { supabase } from '@/lib/supabase';
import { getSharedSetupPrivacyIssues, isSharedSetupPayload } from '@/lib/sharedSetup';

type ExpiryDays = 1 | 7 | 30;

interface SharedSetupRow {
  id: string;
  title: string;
  include_assessments: boolean;
  include_topics: boolean;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  import_count: number;
}

interface CreatedSetup {
  id: string;
  link: string;
  appLink: string | null;
}

const publicWebUrl = import.meta.env.VITE_CGP_WEB_URL?.trim()
  || import.meta.env.VITE_CGP_AUTH_REDIRECT_URL?.trim();

function getPublicBaseUrl() {
  if (publicWebUrl) {
    try {
      const url = new URL(publicWebUrl);
      if (url.protocol === 'https:' && !url.search && !url.hash) return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
      return null;
    }
    return null;
  }
  if (window.location.protocol === 'https:') return `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`;
  return null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isNetworkFailure(error: unknown) {
  return platformAdapter.isNetworkError(error);
}

function createTemplatePayload(
  semesters: ReturnType<typeof useAppData>['data']['semesters'],
  courses: ReturnType<typeof useAppData>['data']['courses'],
  includeAssessments: boolean,
  includeTopics: boolean,
) {
  return {
    version: 1,
    semesters: semesters.map((semester) => ({
      academicYear: semester.academicYear,
      semesterNumber: semester.semesterNumber,
      courses: courses.filter((course) => course.semesterId === semester.id).map((course) => ({
        name: course.name,
        ...(course.code ? { code: course.code } : {}),
        creditUnits: course.creditUnits,
        targetGradePoint: course.targetGradePoint,
        ...(includeAssessments ? {
          assessments: (course.assessments ?? []).map(({ name, weight, total }) => ({ name, weight, total })),
        } : {}),
        ...(includeTopics ? { topics: (course.topics ?? []).map(({ title }) => ({ title })) } : {}),
      })),
    })),
  };
}

export function ShareSetupPage() {
  const { data } = useAppData();
  const [title, setTitle] = useState('My course setup');
  const [includeAssessments, setIncludeAssessments] = useState(false);
  const [includeTopics, setIncludeTopics] = useState(false);
  const [expiryDays, setExpiryDays] = useState<ExpiryDays>(7);
  const [links, setLinks] = useState<SharedSetupRow[]>([]);
  const [created, setCreated] = useState<CreatedSetup | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const publicBaseUrl = useMemo(getPublicBaseUrl, []);
  const payload = useMemo(
    () => createTemplatePayload(data.semesters, data.courses, includeAssessments, includeTopics),
    [data.semesters, data.courses, includeAssessments, includeTopics],
  );

  const loadLinks = useCallback(async () => {
    if (!supabase) {
      setError('Sharing is not configured in this build.');
      setLoadingLinks(false);
      return;
    }
    if (!navigator.onLine) {
      setMessage('Connect to the internet to load or manage your setup links.');
      setLoadingLinks(false);
      return;
    }
    setLoadingLinks(true);
    const { data: rows, error: requestError } = await supabase
      .from('shared_setups')
      .select('id, title, include_assessments, include_topics, created_at, expires_at, revoked_at, import_count')
      .order('created_at', { ascending: false });
    if (requestError) {
      if (!isNetworkFailure(requestError)) console.error('Unable to load CGP setup links.', requestError);
      if (isNetworkFailure(requestError)) setMessage('Connect to the internet to load or manage your setup links.');
      else setError('Your setup links could not be loaded. Try again later.');
    } else {
      setLinks((rows ?? []) as SharedSetupRow[]);
      setError('');
    }
    setLoadingLinks(false);
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const buildLink = (token: string) => `${publicBaseUrl}/#/import/${encodeURIComponent(token)}`;

  const handleCreate = async () => {
    setError('');
    setMessage('');
    setCreated(null);
    if (!navigator.onLine) {
      setMessage('Connect to the internet to create a share link. Your course setup stays safely on this device.');
      return;
    }
    if (!supabase) {
      setError('Sharing is not configured in this build.');
      return;
    }
    if (!publicBaseUrl) {
      setError('A public HTTPS CGP web address is required. Set VITE_CGP_WEB_URL for desktop or Android builds.');
      return;
    }
    if (data.semesters.length === 0) {
      setError('Add at least one semester before sharing a setup.');
      return;
    }
    const privacyIssues = getSharedSetupPrivacyIssues(
      payload,
      title.trim(),
      includeAssessments,
      includeTopics,
    );
    if (privacyIssues.length > 0) {
      setError(`Remove private or unsupported content before sharing: ${privacyIssues
        .map(({ location, reason }) => `${location} ${reason}`)
        .join('; ')}.`);
      return;
    }
    if (!isSharedSetupPayload(payload)) {
      setError('The selected setup details are incomplete or outside the supported sharing limits. Check the preview and try again.');
      return;
    }
    setBusyAction('create');
    try {
      const { data: result, error: requestError } = await supabase.rpc('create_shared_setup', {
        p_title: title.trim(),
        p_payload: payload,
        p_include_assessments: includeAssessments,
        p_include_topics: includeTopics,
        p_expiry_days: expiryDays,
      });
      if (requestError) throw requestError;
      const createdRow = Array.isArray(result) ? result[0] : result;
      if (!createdRow || typeof createdRow.setup_id !== 'string' || typeof createdRow.share_token !== 'string') {
        throw new Error('The server returned an invalid share-link response.');
      }
      setCreated({
        id: createdRow.setup_id,
        link: buildLink(createdRow.share_token),
        appLink: platformAdapter.getAppImportLink(createdRow.share_token),
      });
      setMessage('Your setup link is ready. Anyone with the link can preview and import it until it expires or you revoke it.');
      await loadLinks();
    } catch (requestError) {
      if (!isNetworkFailure(requestError)) console.error('Unable to create a CGP setup link.', requestError);
      if (isNetworkFailure(requestError)) setMessage('Connect to the internet to create a share link. Your course setup stays safely on this device.');
      else if (requestError && typeof requestError === 'object'
        && 'code' in requestError && requestError.code === '22023') {
        setError('The server rejected the selected setup details during privacy or format validation. Review the preview and remove private identifiers or unsupported content.');
      } else {
        setError('The setup link could not be created. Confirm the shared-setup migration is installed and try again.');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleCopyLink = async (id: string) => {
    if (!navigator.onLine || !supabase) {
      setMessage('Connect to the internet to create or renew a share link.');
      return;
    }
    setBusyAction(id);
    setError('');
    setMessage('');
    try {
      const { data: token, error: requestError } = await supabase.rpc('rotate_shared_setup_token', { p_setup_id: id });
      if (requestError) throw requestError;
      if (typeof token !== 'string') throw new Error('The server returned an invalid share token.');
      const link = buildLink(token);
      setCreated({ id, link, appLink: platformAdapter.getAppImportLink(token) });
      try {
        await navigator.clipboard.writeText(link);
        setMessage('A fresh share link was copied. Any earlier link for this setup no longer works.');
      } catch (copyError) {
        console.error('Unable to copy the renewed CGP setup link to clipboard.', copyError);
        setMessage('A fresh link was created, but clipboard access was unavailable. Select and copy the link above.');
      }
    } catch (requestError) {
      if (!isNetworkFailure(requestError)) console.error('Unable to copy the CGP setup link.', requestError);
      if (isNetworkFailure(requestError)) setMessage('Connect to the internet to renew this share link.');
      else setError('The link could not be copied. Confirm that this setup is still active and try again.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this setup link? Anyone with the old link will lose access.')) return;
    if (!supabase || !navigator.onLine) {
      setMessage('Connect to the internet to revoke a share link.');
      return;
    }
    setBusyAction(id);
    setError('');
    setMessage('');
    try {
      const { data: revoked, error: requestError } = await supabase.rpc('revoke_shared_setup', { p_setup_id: id });
      if (requestError) throw requestError;
      if (revoked !== true) throw new Error('The share link could not be revoked.');
      setCreated((current) => current?.id === id ? null : current);
      setMessage('The link has been revoked.');
      await loadLinks();
    } catch (requestError) {
      if (!isNetworkFailure(requestError)) console.error('Unable to revoke the CGP setup link.', requestError);
      if (isNetworkFailure(requestError)) setMessage('Connect to the internet to revoke this share link.');
      else setError('The link could not be revoked. Try again.');
    } finally {
      setBusyAction('');
    }
  };

  const copyCurrentLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setMessage('Link copied to clipboard.');
    } catch (copyError) {
      console.error('Unable to copy the CGP setup link to clipboard.', copyError);
      setError('Clipboard access was unavailable. Select and copy the link manually.');
    }
  };

  const copyAppLink = async () => {
    if (!created?.appLink) return;
    try {
      await navigator.clipboard.writeText(created.appLink);
      setMessage('CGP app link copied to clipboard.');
    } catch (copyError) {
      console.error('Unable to copy the CGP app link to clipboard.', copyError);
      setError('Clipboard access was unavailable. Select and copy the app link manually.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Setup templates</p>
        <h1 className="mt-1 font-display text-3xl font-black">Share my setup</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-100">
          Share semester and course structure without sending grades, personal details, documents, or Vault data.
        </p>
      </header>

      <section className="card space-y-5 p-5" aria-labelledby="create-setup-title">
        <div>
          <h2 id="create-setup-title" className="font-display text-xl font-bold text-ink-900">Create a share link</h2>
          <p className="mt-1 text-sm text-ink-600">You can revoke an active link at any time. Links expire automatically.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Setup name</span>
            <input className="input" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">Link expires after</span>
            <select className="input" value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value) as ExpiryDays)}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink-900">Optional template details</legend>
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <input type="checkbox" className="mt-1 accent-primary-600" checked={includeAssessments} onChange={(event) => setIncludeAssessments(event.target.checked)} />
            <span><span className="block text-sm font-semibold text-ink-800">Include assessment structure</span><span className="block text-xs leading-5 text-ink-500">Assessment names, weights, and total marks only. Scores are never included.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <input type="checkbox" className="mt-1 accent-primary-600" checked={includeTopics} onChange={(event) => setIncludeTopics(event.target.checked)} />
            <span><span className="block text-sm font-semibold text-ink-800">Include course topics</span><span className="block text-xs leading-5 text-ink-500">Topic titles only. Completion states are not shared.</span></span>
          </label>
        </fieldset>

        <details className="rounded-xl border border-ink-200 bg-ink-50 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Preview exactly what will be shared</summary>
          <div className="mt-4 max-h-80 space-y-4 overflow-auto">
            {payload.semesters.map((semester, semesterIndex) => (
              <div key={`${semester.academicYear}-${semester.semesterNumber}-${semesterIndex}`} className="rounded-lg border border-ink-200 bg-white p-3">
                <h3 className="text-sm font-bold text-ink-900">{semester.academicYear} · Semester {semester.semesterNumber}</h3>
                {semester.courses.length ? (
                  <ul className="mt-2 space-y-2">
                    {semester.courses.map((course, courseIndex) => (
                      <li key={`${course.code}-${courseIndex}`} className="rounded-md bg-ink-50 p-2 text-sm text-ink-700">
                        <span className="font-semibold">{course.name}</span>{course.code && <span className="ml-2 font-mono text-xs text-ink-500">{course.code}</span>}
                        <span className="ml-2 text-xs text-ink-500">{course.creditUnits} CU · target {course.targetGradePoint.toFixed(1)}</span>
                        {includeAssessments && <p className="mt-1 text-xs text-ink-600">Assessments: {course.assessments?.length ? course.assessments.map((assessment) => `${assessment.name} (${assessment.weight}%, total ${assessment.total})`).join(', ') : 'None'}</p>}
                        {includeTopics && <p className="mt-1 text-xs text-ink-600">Topics: {course.topics?.length ? course.topics.map((topic) => topic.title).join(', ') : 'None'}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-xs text-ink-500">No course units</p>}
              </div>
            ))}
            {!payload.semesters.length && <p className="text-sm text-ink-500">Add a semester to see the template preview.</p>}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-success-700"><ShieldCheck className="h-4 w-4" /> Scores, profile information, files, and Vault entries are excluded.</p>
        </details>

        {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-primary-50 p-3 text-sm text-primary-800">{message}</p>}

        <button type="button" className="btn-primary" disabled={busyAction === 'create' || !title.trim()} onClick={() => void handleCreate()}>
          {busyAction === 'create' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Create link
        </button>

        {created && (
          <div className="grid gap-5 rounded-xl border border-success-200 bg-success-50 p-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <label className="label" htmlFor="created-setup-link">Share link</label>
              <input id="created-setup-link" className="input bg-white" readOnly value={created.link} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" className="btn-secondary mt-3" onClick={() => void copyCurrentLink()}><Copy className="h-4 w-4" /> Copy link</button>
              {created.appLink && (
                <div className="mt-4">
                  <label className="label" htmlFor="created-setup-app-link">Open directly in CGP</label>
                  <input id="created-setup-app-link" className="input bg-white" readOnly value={created.appLink} onFocus={(event) => event.currentTarget.select()} />
                  <button type="button" className="btn-secondary mt-3" onClick={() => void copyAppLink()}><Copy className="h-4 w-4" /> Copy app link</button>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-3">
              <QRCodeSVG value={created.link} size={160} level="Q" includeMargin aria-label="QR code for the setup link" />
              <span className="inline-flex items-center gap-1 text-xs text-ink-600"><QrCode className="h-3.5 w-3.5" /> Scan to preview and import</span>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="my-links-title">
        <div>
          <h2 id="my-links-title" className="font-display text-xl font-bold text-ink-900">My setup links</h2>
          <p className="mt-1 text-sm text-ink-600">Copying a link renews its secret and disables the old link.</p>
        </div>
        {loadingLinks ? <p role="status" className="text-sm text-ink-500">Loading your links…</p>
          : links.length === 0 ? <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">You have not created any setup links yet.</p>
            : <ul className="space-y-3">
              {links.map((link) => {
                const expired = Date.parse(link.expires_at) <= Date.now();
                const inactive = Boolean(link.revoked_at) || expired;
                return (
                  <li key={link.id} className="flex flex-col gap-3 rounded-xl border border-ink-200 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-ink-900">{link.title}</h3>
                      <p className="mt-1 text-xs text-ink-500">Created {formatDate(link.created_at)} · Expires {formatDate(link.expires_at)} · {link.import_count} import{link.import_count === 1 ? '' : 's'}</p>
                      <p className={`mt-1 text-xs font-semibold ${inactive ? 'text-ink-500' : 'text-success-700'}`}>{link.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'}</p>
                      <p className="mt-1 text-xs text-ink-500">Includes {link.include_assessments ? 'assessment structure' : 'no assessments'} and {link.include_topics ? 'topics' : 'no topics'}.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {!inactive && <button type="button" className="btn-secondary text-sm" disabled={busyAction === link.id} onClick={() => void handleCopyLink(link.id)}><Copy className="h-4 w-4" /> Copy / renew</button>}
                      {!inactive && <button type="button" className="btn-secondary text-sm text-error-700" disabled={busyAction === link.id} onClick={() => void handleRevoke(link.id)}><Trash2 className="h-4 w-4" /> Revoke</button>}
                    </div>
                  </li>
                );
              })}
            </ul>}
      </section>
    </div>
  );
}
