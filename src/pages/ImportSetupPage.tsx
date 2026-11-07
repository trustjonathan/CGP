import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Check, ClipboardPaste, Download, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import type { CloudRecord } from '@/lib/useAppData';
import { platformAdapter } from '@/lib/platformAdapter';
import { supabase } from '@/lib/supabase';
import { getSetupToken, normalizeSetupKey, parseSharedSetupResult } from '@/lib/sharedSetup';
import type { SharedSetupPreview } from '@/lib/sharedSetup';
import type { Assessment, CourseTopic, CourseUnit, Semester } from '@/lib/types';

type ConflictChoice = 'skip' | 'alongside' | 'merge';

function semesterKey(academicYear: string, semesterNumber: number) {
  return `${normalizeSetupKey(academicYear)}:${semesterNumber}`;
}

function courseKey(course: Pick<CourseUnit, 'code' | 'name'>) {
  return normalizeSetupKey(course.code || course.name);
}

async function deterministicUuid(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`cgp-setup-import:${value}`)));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatExpiry(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ImportSetupPage({ onImported }: { onImported?: () => void } = {}) {
  const { token: routeToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: localData, importSetupRecords } = useAppData();
  const [pasteValue, setPasteValue] = useState('');
  const [preview, setPreview] = useState<SharedSetupPreview | null>(null);
  const [activeToken, setActiveToken] = useState('');
  const [selectedSemesters, setSelectedSemesters] = useState<Record<string, boolean>>({});
  const [selectedCourses, setSelectedCourses] = useState<Record<string, boolean>>({});
  const [conflictChoices, setConflictChoices] = useState<Record<string, ConflictChoice>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const showPreview = (parsed: SharedSetupPreview, token: string) => {
    setPreview(parsed);
    setActiveToken(token);
    setSelectedSemesters(Object.fromEntries(parsed.payload.semesters.map((_, index) => [`semester-${index}`, true])));
    setSelectedCourses(Object.fromEntries(parsed.payload.semesters.flatMap((semester, semesterIndex) =>
      semester.courses.map((_, courseIndex) => [`course-${semesterIndex}-${courseIndex}`, true]),
    )));
  };

  const loadToken = useCallback(async (input: string) => {
    const token = getSetupToken(input);
    if (!token) {
      setError('That does not look like a valid CGP setup link or token.');
      setPreview(null);
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    setPreview(null);
    setActiveToken(token);
    if (!navigator.onLine) {
      setError('Connect to the internet to load a setup preview. Web imports require Supabase access.');
      setLoading(false);
      return;
    }

    if (!supabase) {
      setError('Setup importing is not configured in this build.');
      setPreview(null);
      setLoading(false);
      return;
    }

    try {
      const { data: result, error: requestError } = await supabase.rpc('get_shared_setup', { p_token: token });
      if (requestError) throw requestError;
      const normalized = Array.isArray(result) ? result[0] : result;
      const parsed = parseSharedSetupResult(normalized);
      if (!parsed) {
        setError('This setup link is invalid, expired, or has been revoked.');
        return;
      }
      if (Date.parse(parsed.expires_at) <= Date.now()) {
        setError('This setup link has expired. Ask the sender for a new one.');
        return;
      }
      showPreview(parsed, token);
      const { data: alreadyImported, error: checkError } = await supabase.rpc('check_shared_setup_import', { p_token: token });
      if (checkError) throw checkError;
      if (alreadyImported === true) setNotice('Already imported to this CGP account.');
    } catch (requestError) {
      if (!platformAdapter.isNetworkError(requestError)) {
        console.error('Unable to load a shared CGP setup.', requestError);
      }
      const message = requestError instanceof Error ? requestError.message : '';
      setError(/429|rate limit/i.test(message)
        ? 'Too many setup-link checks were made. Please wait a while and try again.'
        : platformAdapter.isNetworkError(requestError)
          ? 'Connect to the internet to load this setup preview.'
          : 'This setup link could not be opened. It may have expired or been revoked; ask the sender for a new link.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (routeToken) void loadToken(routeToken);
  }, [routeToken, loadToken]);

  const conflicts = useMemo(() => {
    if (!preview) return new Map<string, CourseUnit>();
    const localSemesterByKey = new Map(localData.semesters.map((semester) => [
      semesterKey(semester.academicYear, semester.semesterNumber),
      semester,
    ]));
    const existing = new Map<string, CourseUnit>();
    for (const localCourse of localData.courses) {
      const semester = localSemesterByKey.get(
        semesterKey(
          localData.semesters.find((item) => item.id === localCourse.semesterId)?.academicYear ?? '',
          localData.semesters.find((item) => item.id === localCourse.semesterId)?.semesterNumber ?? 0,
        ),
      );
      if (semester) existing.set(`${semester.id}:${courseKey(localCourse)}`, localCourse);
    }
    const found = new Map<string, CourseUnit>();
    preview.payload.semesters.forEach((semester, semesterIndex) => {
      const localSemester = localSemesterByKey.get(semesterKey(semester.academicYear, semester.semesterNumber));
      if (!localSemester) return;
      semester.courses.forEach((course, courseIndex) => {
        const conflict = existing.get(`${localSemester.id}:${courseKey({ code: course.code ?? '', name: course.name })}`);
        if (conflict) found.set(`course-${semesterIndex}-${courseIndex}`, conflict);
      });
    });
    return found;
  }, [localData.courses, localData.semesters, preview]);

  const toggleSemester = (key: string, checked: boolean) => {
    setSelectedSemesters((current) => ({ ...current, [key]: checked }));
  };

  const toggleCourse = (semesterIndex: number, courseIndex: number, checked: boolean) => {
    const courseId = `course-${semesterIndex}-${courseIndex}`;
    setSelectedCourses((current) => ({ ...current, [courseId]: checked }));
  };

  const importSelected = async () => {
    if (!preview || !activeToken) return;
    if (notice === 'Already imported to this CGP account.') return;
    if (!navigator.onLine || !supabase) {
      setError('Connect to the internet to import this setup into your CGP account.');
      return;
    }
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const { data: alreadyImported, error: checkError } = await supabase.rpc('check_shared_setup_import', { p_token: activeToken });
      if (checkError) throw checkError;
      if (alreadyImported === true) {
        setNotice('Already imported to this CGP account.');
        return;
      }
      const records: CloudRecord[] = [];
      const importedIds = new Map<string, string>();
      for (let semesterIndex = 0; semesterIndex < preview.payload.semesters.length; semesterIndex += 1) {
        const semester = preview.payload.semesters[semesterIndex];
        importedIds.set(`semester-${semesterIndex}`, await deterministicUuid(`${preview.id}:semester:${semesterIndex}`));
        for (let courseIndex = 0; courseIndex < semester.courses.length; courseIndex += 1) {
          const course = semester.courses[courseIndex];
          importedIds.set(`course-${semesterIndex}-${courseIndex}`, await deterministicUuid(`${preview.id}:course:${semesterIndex}:${courseIndex}`));
          for (let assessmentIndex = 0; assessmentIndex < (course.assessments ?? []).length; assessmentIndex += 1) {
            importedIds.set(`assessment-${semesterIndex}-${courseIndex}-${assessmentIndex}`, await deterministicUuid(`${preview.id}:assessment:${semesterIndex}:${courseIndex}:${assessmentIndex}`));
          }
          for (let topicIndex = 0; topicIndex < (course.topics ?? []).length; topicIndex += 1) {
            importedIds.set(`topic-${semesterIndex}-${courseIndex}-${topicIndex}`, await deterministicUuid(`${preview.id}:topic:${semesterIndex}:${courseIndex}:${topicIndex}`));
          }
        }
      }
      const localSemesters = new Map(localData.semesters.map((semester) => [
        semesterKey(semester.academicYear, semester.semesterNumber),
        semester,
      ]));
      const destinationByTemplate = new Map<number, Semester>();
      const now = Date.now();

      preview.payload.semesters.forEach((templateSemester, semesterIndex) => {
        if (!selectedSemesters[`semester-${semesterIndex}`]) return;
        const key = semesterKey(templateSemester.academicYear, templateSemester.semesterNumber);
        const existingSemester = localSemesters.get(key);
        const destination: Semester = existingSemester ?? {
          id: importedIds.get(`semester-${semesterIndex}`)!,
          academicYear: templateSemester.academicYear.trim(),
          semesterNumber: templateSemester.semesterNumber,
          createdAt: now + semesterIndex,
        };
        destinationByTemplate.set(semesterIndex, destination);
        if (!existingSemester) {
          records.push({
            id: `semester:${destination.id}`,
            record_type: 'semester',
            payload: destination,
            is_deleted: false,
            revision: 0,
          });
        }
      });

      preview.payload.semesters.forEach((templateSemester, semesterIndex) => {
        const destinationSemester = destinationByTemplate.get(semesterIndex);
        if (!destinationSemester) return;
        templateSemester.courses.forEach((templateCourse, courseIndex) => {
          const selectionKey = `course-${semesterIndex}-${courseIndex}`;
          if (!selectedCourses[selectionKey]) return;
          const conflict = conflicts.get(selectionKey);
          const choice = conflictChoices[selectionKey] ?? (conflict ? 'skip' : 'alongside');
          if (conflict && choice === 'skip') return;

          if (conflict && choice === 'merge') {
            const assessmentByName = new Map((conflict.assessments ?? []).map((assessment) => [normalizeSetupKey(assessment.name), assessment]));
            const mergedAssessments: Assessment[] = [...(conflict.assessments ?? [])];
            for (const [assessmentIndex, assessment] of (templateCourse.assessments ?? []).entries()) {
              const normalizedName = normalizeSetupKey(assessment.name);
              if (!assessmentByName.has(normalizedName)) {
                mergedAssessments.push({ ...assessment, id: importedIds.get(`assessment-${semesterIndex}-${courseIndex}-${assessmentIndex}`)!, obtained: null });
                assessmentByName.set(normalizedName, mergedAssessments[mergedAssessments.length - 1]);
              }
            }
            const topicByName = new Set((conflict.topics ?? []).map((topic) => normalizeSetupKey(topic.title)));
            const mergedTopics: CourseTopic[] = [...(conflict.topics ?? [])];
            for (const [topicIndex, topic] of (templateCourse.topics ?? []).entries()) {
              const normalizedTitle = normalizeSetupKey(topic.title);
              if (!topicByName.has(normalizedTitle)) {
                mergedTopics.push({ id: importedIds.get(`topic-${semesterIndex}-${courseIndex}-${topicIndex}`)!, title: topic.title, completed: false });
                topicByName.add(normalizedTitle);
              }
            }
            const merged: CourseUnit = {
              ...conflict,
              assessments: mergedAssessments,
              topics: mergedTopics,
            };
            records.push({
              id: `course:${merged.id}`,
              record_type: 'course',
              payload: merged,
              is_deleted: false,
              revision: 0,
            });
            return;
          }

          const assessments: Assessment[] = (templateCourse.assessments ?? []).map((assessment, assessmentIndex) => ({
            ...assessment,
            id: importedIds.get(`assessment-${semesterIndex}-${courseIndex}-${assessmentIndex}`)!,
            obtained: null,
          }));
          const topics: CourseTopic[] = (templateCourse.topics ?? []).map((topic, topicIndex) => ({
            ...topic,
            id: importedIds.get(`topic-${semesterIndex}-${courseIndex}-${topicIndex}`)!,
            completed: false,
          }));
          const course: CourseUnit = {
            id: importedIds.get(`course-${semesterIndex}-${courseIndex}`)!,
            name: templateCourse.name.trim(),
            code: templateCourse.code?.trim() ?? '',
            creditUnits: templateCourse.creditUnits,
            targetGradePoint: templateCourse.targetGradePoint ?? 5,
            semesterId: destinationSemester.id,
            assessments,
            topics,
            documents: [],
            createdAt: now + semesterIndex * 1000 + courseIndex + 1,
          };
          records.push({
            id: `course:${course.id}`,
            record_type: 'course',
            payload: course,
            is_deleted: false,
            revision: 0,
          });
        });
      });

      if (!records.length) {
        setError('Select at least one new semester or course. Skipped and unchecked items will not be imported.');
        return;
      }
      const added = await importSetupRecords(preview.id, activeToken, records);
      if (!added) {
        setNotice('Already imported to this CGP account. No duplicate data was added.');
        onImported?.();
        return;
      }
      setNotice('Setup imported to your CGP account.');
      onImported?.();
    } catch (requestError) {
      if (!platformAdapter.isNetworkError(requestError)) {
        console.error('Unable to import the shared CGP setup.', requestError);
      }
      setError(requestError instanceof Error
        ? `The import could not be saved: ${requestError.message}`
        : 'The import could not be saved. Your existing data was not replaced.');
    } finally {
      setImporting(false);
    }
  };

  const selectedCourseCount = preview?.payload.semesters.reduce((count, semester, semesterIndex) => (
    count + (selectedSemesters[`semester-${semesterIndex}`]
      ? semester.courses.filter((_, courseIndex) => selectedCourses[`course-${semesterIndex}-${courseIndex}`]).length
      : 0)
  ), 0) ?? 0;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-100">Setup templates</p>
        <h1 className="mt-1 font-display text-3xl font-black">Import a setup</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-100">Preview another student’s course structure and choose what to add. Existing data stays in your control.</p>
      </header>

      <section className="card space-y-4 p-5">
        <label htmlFor="setup-link" className="label">Paste a CGP setup link or token</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="setup-link" className="input min-w-0 flex-1" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="Paste the link shared with you" />
          <button type="button" className="btn-secondary" disabled={loading || !pasteValue.trim()} onClick={() => void loadToken(pasteValue)}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Open link
          </button>
        </div>
        {routeToken && <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800" disabled={loading} onClick={() => void loadToken(routeToken)}><RefreshCw className="h-4 w-4" /> Reload shared link</button>}
        {!navigator.onLine && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">Connect to the internet to load or import a setup. Web setup data is read from and saved to Supabase.</p>}
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-error-50 p-3 text-sm text-error-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-success-50 p-3 text-sm text-success-800">{notice}</p>}
      </section>

      {preview && (
        <section className="card space-y-5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-700">Template preview</p>
              <h2 className="mt-1 break-words font-display text-2xl font-bold text-ink-900">{preview.title}</h2>
              <p className="mt-1 text-sm text-ink-500">Link available until {formatExpiry(preview.expires_at)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs font-medium text-primary-800">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Scores and personal data are not included
            </div>
          </div>

          <div className="space-y-4">
            {preview.payload.semesters.map((semester, semesterIndex) => {
              const semesterId = `semester-${semesterIndex}`;
              return (
                <fieldset key={`${semesterKey(semester.academicYear, semester.semesterNumber)}-${semesterIndex}`} className="rounded-xl border border-ink-200 p-4">
                  <legend className="px-1">
                    <label className="inline-flex items-center gap-2 font-semibold text-ink-900">
                      <input type="checkbox" className="accent-primary-600" checked={selectedSemesters[semesterId] ?? false} onChange={(event) => toggleSemester(semesterId, event.target.checked)} />
                      {semester.academicYear} · Semester {semester.semesterNumber}
                    </label>
                  </legend>
                  {semester.courses.length ? (
                    <ul className="mt-2 space-y-3">
                      {semester.courses.map((course, courseIndex) => {
                        const selectionKey = `course-${semesterIndex}-${courseIndex}`;
                        const conflict = conflicts.get(selectionKey);
                        return (
                          <li key={`${course.code}-${courseIndex}`} className="rounded-lg bg-ink-50 p-3">
                            <label className="flex items-start gap-3">
                              <input type="checkbox" className="mt-1 accent-primary-600" checked={selectedCourses[selectionKey] ?? false} disabled={!selectedSemesters[semesterId]} onChange={(event) => toggleCourse(semesterIndex, courseIndex, event.target.checked)} />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-ink-900">{course.name}{course.code && <span className="ml-2 font-mono text-xs text-ink-500">{course.code}</span>}</span>
                                <span className="mt-1 block text-xs text-ink-600">{course.creditUnits} CU · target {course.targetGradePoint ?? 5} GP</span>
                                {preview.include_assessments && <span className="mt-1 block text-xs text-ink-600">Assessment structure: {(course.assessments ?? []).map((assessment) => `${assessment.name} (${assessment.weight}%, ${assessment.total} marks)`).join(', ') || 'None'}</span>}
                                {preview.include_topics && <span className="mt-1 block text-xs text-ink-600">Topics: {(course.topics ?? []).map((topic) => topic.title).join(', ') || 'None'}</span>}
                              </span>
                            </label>
                            {conflict && selectedSemesters[semesterId] && (
                              <div className="ml-7 mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3">
                                <p className="text-xs font-semibold text-warning-800">Matching course found: {conflict.name}. Choose what to do; nothing is changed without your choice.</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-700">
                                  {(['skip', 'alongside', 'merge'] as const).map((choice) => (
                                    <label key={choice} className="inline-flex items-center gap-1.5">
                                      <input type="radio" name={`conflict-${selectionKey}`} className="accent-primary-600" checked={(conflictChoices[selectionKey] ?? 'skip') === choice} onChange={() => setConflictChoices((current) => ({ ...current, [selectionKey]: choice }))} />
                                      {choice === 'skip' ? 'Skip' : choice === 'alongside' ? 'Add alongside' : 'Merge missing assessments/topics'}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="mt-2 text-sm text-ink-500">This semester has no courses.</p>}
                </fieldset>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-600">{selectedCourseCount} course unit(s) selected. Existing assessment scores are retained when merging; the template contains no scores.</p>
            <button type="button" className="btn-primary" disabled={importing || loading || notice === 'Already imported to this CGP account.'} onClick={() => void importSelected()}>
              {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : notice.startsWith('Setup imported') ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {importing ? 'Importing…' : 'Import selected'}
            </button>
          </div>
          {notice.startsWith('Setup imported') && <button type="button" className="text-sm font-semibold text-primary-700 underline" onClick={() => navigate('/semesters')}>View semesters and courses</button>}
        </section>
      )}
    </div>
  );
}
