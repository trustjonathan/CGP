import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, BookOpen, CalendarDays, LoaderCircle, ShieldCheck } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { getSetupToken, parseSharedSetupResult } from '@/lib/sharedSetup';
import type { SharedSetupPreview } from '@/lib/sharedSetup';
import { supabase } from '@/lib/supabase';

function formatExpiry(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function PublicImportPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const [preview, setPreview] = useState<SharedSetupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const token = routeToken ? getSetupToken(routeToken) : null;

    if (!token) {
      setError('This setup link is incomplete or invalid. Ask the sender for a new link.');
      setLoading(false);
      return () => { active = false; };
    }

    if (!supabase) {
      setError('CGP could not open this setup right now. Please try again later.');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: requestError } = await supabase.rpc('get_shared_setup', { p_token: token });
        if (requestError) throw requestError;
        const normalized = Array.isArray(data) ? data[0] : data;
        const parsed = parseSharedSetupResult(normalized);
        if (!parsed || Date.parse(parsed.expires_at) <= Date.now()) {
          if (active) setError('This setup link is invalid, expired, or has been revoked. Ask the sender for a new link.');
          return;
        }
        if (active) setPreview(parsed);
      } catch (requestError) {
        console.error('Unable to open the public CGP setup preview.', requestError);
        if (active) setError(navigator.onLine
          ? 'CGP could not open this setup preview. Please try the link again.'
          : 'Connect to the internet to open this setup preview.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [routeToken]);

  if (showSignIn) return <AuthScreen onBack={() => setShowSignIn(false)} />;

  return (
    <main className="min-h-screen bg-ink-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <img src="/cgp-mark.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Shared course template</p>
              <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Import a setup</h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-primary-100">
            Review the shared semester and course structure. You can sign in to choose what to add to your CGP account.
          </p>
        </header>

        {loading && (
          <section role="status" className="card flex items-center gap-3 p-6 text-sm text-ink-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary-600" aria-hidden="true" />
            Loading the shared setup preview…
          </section>
        )}

        {error && (
          <section role="alert" className="card flex items-start gap-3 border-error-200 p-5 text-sm leading-6 text-error-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </section>
        )}

        {preview && (
          <>
            <section className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Template preview</p>
                  <h2 className="mt-1 font-display text-xl font-bold text-ink-900">{preview.title}</h2>
                  <p className="mt-1 text-sm text-ink-500">Available until {formatExpiry(preview.expires_at)}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-700">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Scores and personal data excluded
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {preview.payload.semesters.map((semester, semesterIndex) => (
                  <section key={`${semester.academicYear}-${semester.semesterNumber}-${semesterIndex}`} className="rounded-xl border border-ink-200 p-4">
                    <h3 className="flex items-center gap-2 font-semibold text-ink-900">
                      <CalendarDays className="h-4 w-4 text-primary-600" aria-hidden="true" />
                      {semester.academicYear} · Semester {semester.semesterNumber}
                    </h3>
                    {semester.courses.length ? (
                      <ul className="mt-3 divide-y divide-ink-100">
                        {semester.courses.map((course, courseIndex) => (
                          <li key={`${course.code ?? course.name}-${courseIndex}`} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="break-words font-medium text-ink-900">{course.name}</span>
                                  {course.code && <span className="font-mono text-xs text-ink-500">{course.code}</span>}
                                </div>
                                <p className="mt-1 text-xs text-ink-500">
                                  {course.creditUnits} CU · target {course.targetGradePoint ?? 5} GP
                                </p>
                                {preview.include_assessments && (course.assessments?.length ?? 0) > 0 && (
                                  <p className="mt-1 text-xs leading-5 text-ink-600">
                                    Assessment structure: {course.assessments?.map((assessment) => `${assessment.name} (${assessment.weight}%, total ${assessment.total})`).join(', ')}
                                  </p>
                                )}
                                {preview.include_topics && (course.topics?.length ?? 0) > 0 && (
                                  <p className="mt-1 text-xs leading-5 text-ink-600">
                                    Topics: {course.topics?.map((topic) => topic.title).join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-ink-500">No course units in this semester.</p>
                    )}
                  </section>
                ))}
              </div>
            </section>

            <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-sm leading-6 text-ink-600">
                Nothing is added until you sign in and confirm your import choices.
              </p>
              <button type="button" className="btn-primary shrink-0" onClick={() => setShowSignIn(true)}>
                Sign in to import
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
