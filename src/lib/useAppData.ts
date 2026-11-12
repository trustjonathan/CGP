import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData, Semester, CourseUnit, Assessment, CourseDocument, CourseTopic } from './types';
import { TARGET_CGPA, uid } from './types';
import type { SettingsUpdate } from './gradingConfig';
import { supabase } from './supabase';
import { useAuth } from '@/contexts/useAuth';
import {
  loadAccountData,
  markAccountRecordSynced,
  mergeCloudSnapshot,
  persistAccountData,
  readPendingAccountRecords,
} from './localSync';
import {
  cloudRecordContent,
  isCloudRecord,
  replayPendingRecords,
  saveRecordRpcArguments,
  serializeCloudRecord,
} from './syncContract';
import type { CloudRecord } from './syncContract';
export type { CloudRecord, RecordType } from './syncContract';

interface SaveResult {
  status: 'saved' | 'conflict';
  revision: number;
  conflict_id?: string;
}

interface OpenConflict {
  id: string;
  record_id: string;
}

const emptyData: AppData = {
  semesters: [],
  courses: [],
  settings: { targetCGPA: TARGET_CGPA },
};

function loadData(): AppData {
  return emptyData;
}

function isSaveResult(value: unknown): value is SaveResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const minimumRevision = result.status === 'saved' ? 1 : 0;
  return typeof result.revision === 'number'
    && Number.isInteger(result.revision)
    && result.revision >= minimumRevision
    && (result.status === 'saved' || result.status === 'conflict')
    && (result.status !== 'conflict' || typeof result.conflict_id === 'string');
}

function appDataFromCloudRecords(records: CloudRecord[]): AppData {
  const active = records.filter((record) => !record.is_deleted);
  return {
    semesters: active
      .filter((record) => record.record_type === 'semester')
      .map((record) => record.payload as Semester),
    courses: active
      .filter((record) => record.record_type === 'course')
      .map((record) => {
        const course = record.payload as CourseUnit;
        return {
          ...course,
          assessments: course.assessments || [],
          topics: course.topics || [],
          documents: course.documents || [],
        };
      }),
    settings: (active.find((record) => record.record_type === 'settings')?.payload as AppData['settings'] | undefined)
      || { targetCGPA: TARGET_CGPA },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected Supabase error occurred.';
}

function isNetworkError(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  return (candidate.name === 'TypeError' && /fetch|network|load failed/i.test(message))
    || /failed to fetch|fetch failed|network request failed|network error|internet disconnected|connection (?:was )?(?:lost|closed|reset)|timed out|econnreset|enotfound/i.test(message)
    || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ERR_INTERNET_DISCONNECTED'].includes(code);
}

function useAppDataState() {
  const { user } = useAuth();
  const userId = user?.id;
  const [data, setData] = useState<AppData>(loadData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<OpenConflict | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const ready = useRef(false);
  const initializedUser = useRef<string | undefined>();
  const cloudInitialized = useRef(false);
  const remoteRecords = useRef(new Map<string, CloudRecord>());
  const syncInProgress = useRef(false);
  const syncQueued = useRef(false);

  useEffect(() => {
    if (!userId || !ready.current) return;
    let active = true;
    void persistAccountData(userId, data).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to persist the local CGP account cache.', error);
      setSyncError('Your changes could not be saved to this device. Check available storage and try again.');
    });
    return () => { active = false; };
  }, [data, userId]);

  useEffect(() => {
    const userChanged = initializedUser.current !== userId;
    if (userChanged) {
      initializedUser.current = userId;
      ready.current = false;
      cloudInitialized.current = false;
      remoteRecords.current = new Map();
      setData(emptyData);
      setLastSyncedAt(null);
      setLoading(Boolean(userId));
    }
    setLoadError('');
    setSyncError('');
    setPendingConflict(null);

    const client = supabase;
    if (!userId || !client) {
      setLoading(false);
      setLoadError('Supabase is not available. Sign in again after Supabase is configured.');
      return;
    }

    let active = true;
    ready.current = false;
    cloudInitialized.current = false;
    setLoading(true);
    void (async () => {
      const cachedData = await loadAccountData(userId);
      if (!active) return;
      if (cachedData) {
        setData(cachedData);
        ready.current = true;
        setLoading(false);
      }

      if (!navigator.onLine) {
        ready.current = true;
        setData((current) => cachedData ?? current);
        setLoadError('');
        setLoading(false);
        return;
      }

      const { data: rows, error } = await client
        .from('cgpa_records')
        .select('id, record_type, payload, is_deleted, revision')
        .eq('user_id', userId);
      if (error) throw error;

      const records: CloudRecord[] = [];
      for (const row of rows || []) {
        if (!isCloudRecord(row)) throw new Error('Supabase returned a malformed CGP record.');
        records.push(serializeCloudRecord(row));
      }

      const { data: conflicts, error: conflictsError } = await client
        .from('cgpa_record_conflicts')
        .select('id, record_id')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(1);
      if (conflictsError) throw conflictsError;
      if (!active) return;

      await mergeCloudSnapshot(userId, records);
      const mergedData = await loadAccountData(userId);
      if (!active) return;
      remoteRecords.current = new Map(records.map((record) => [record.id, record]));
      cloudInitialized.current = true;
      ready.current = true;
      setData(mergedData ?? appDataFromCloudRecords(records));
      setPendingConflict(conflicts?.[0] ?? null);
      setLastSyncedAt(new Date().toISOString());
      setLoadError('');
      if (conflicts?.length) {
        setSyncError(`A saved edit conflicts with a newer version of ${conflicts[0].record_id}. Choose which version to keep.`);
      }
      setLoading(false);
    })().catch((error: unknown) => {
      if (!active) return;
      if (isNetworkError(error)) {
        ready.current = true;
        setLoadError('');
        setLoading(false);
      } else {
        console.error('Unable to load CGP data from Supabase.', error);
        if (ready.current) {
          setSyncError(`CGP is showing the saved local copy. Cloud refresh failed: ${errorMessage(error)}`);
        } else {
          setLoadError(`CGP could not load your Supabase records. Confirm the CGP database migrations are applied, then retry. ${errorMessage(error)}`);
        }
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId, loadAttempt]);

  useEffect(() => {
    const client = supabase;
    if (!ready.current || !cloudInitialized.current || !userId || !client || pendingConflict) return;

    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return;
      if (syncInProgress.current) {
        syncQueued.current = true;
        return;
      }

      syncInProgress.current = true;
      setSyncing(true);
      void (async () => {
        let conflictFound = false;
        try {
          const currentRecords = remoteRecords.current;
          await persistAccountData(userId, data);
          const pendingRecords = await readPendingAccountRecords(userId);
          const replay = await replayPendingRecords(
            pendingRecords,
            currentRecords,
            async (record, expectedRevision) => {
              const { data: result, error } = await client.rpc(
                'save_cgpa_record',
                saveRecordRpcArguments(record, expectedRevision),
              );
              if (error) throw error;
              if (!isSaveResult(result)) throw new Error('Supabase returned an invalid save response.');
              return result;
            },
            (recordId, updatedAt, revision) => (
              markAccountRecordSynced(userId, recordId, updatedAt, revision)
            ),
          );
          if (replay.conflict) {
            conflictFound = true;
            setPendingConflict(replay.conflict);
            setSyncError(`Both edits were preserved for ${replay.conflict.record_id}. Choose which version to keep.`);
          }
          if (!conflictFound) {
            setSyncError('');
            if (replay.acknowledged) setLastSyncedAt(new Date().toISOString());
          }
        } catch (error) {
          if (isNetworkError(error)) {
            setSyncError('');
          } else {
            console.error('Unable to save CGP data to Supabase.', error);
            setSyncError(`Your change could not be saved to Supabase. ${errorMessage(error)}`);
          }
        } finally {
          syncInProgress.current = false;
          setSyncing(false);
          if (syncQueued.current) {
            syncQueued.current = false;
            setSyncAttempt((attempt) => attempt + 1);
          }
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [data, pendingConflict, userId, syncAttempt]);

  useEffect(() => {
    const retryWhenOnline = () => {
      setLoadAttempt((attempt) => attempt + 1);
      setSyncAttempt((attempt) => attempt + 1);
    };
    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, []);

  const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
  const retrySync = useCallback(() => {
    setSyncError('');
    setSyncAttempt((attempt) => attempt + 1);
  }, []);

  const resolveConflict = useCallback(async (resolution: 'keep_local' | 'keep_server') => {
    const client = supabase;
    if (!pendingConflict || !client || !userId) return;

    const { data: result, error } = await client.rpc('resolve_cgpa_record_conflict', {
      p_conflict_id: pendingConflict.id,
      p_resolution: resolution,
    });
    if (error) {
      console.error('Unable to resolve CGP record conflict.', error);
      setSyncError(`The conflict could not be resolved. ${error.message}`);
      return;
    }

    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'resolved') {
      setSyncError('The conflict changed while it was being resolved. Reload the latest cloud data and try again.');
      setLoadAttempt((attempt) => attempt + 1);
      return;
    }

    const { data: rows, error: loadError } = await client
      .from('cgpa_records')
      .select('id, record_type, payload, is_deleted, revision')
      .eq('user_id', userId);
    if (loadError) {
      console.error('Unable to refresh CGP records after conflict resolution.', loadError);
      setSyncError(`The conflict was resolved, but the latest records could not be loaded. ${loadError.message}`);
      return;
    }

    const records: CloudRecord[] = [];
    for (const row of rows || []) {
      if (!isCloudRecord(row)) {
        setSyncError('Supabase returned a malformed CGP record. Contact support before continuing.');
        return;
      }
      records.push(serializeCloudRecord(row));
    }

    const { data: conflicts, error: conflictsError } = await client
      .from('cgpa_record_conflicts')
      .select('id, record_id')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(1);
    if (conflictsError) {
      console.error('Unable to refresh CGP conflicts.', conflictsError);
      setSyncError(`The records were refreshed, but conflict status could not be loaded. ${conflictsError.message}`);
      return;
    }

    await mergeCloudSnapshot(userId, records, [pendingConflict.record_id]);
    const reconciledData = await loadAccountData(userId);
    remoteRecords.current = new Map(records.map((record) => [record.id, record]));
    setData(reconciledData ?? appDataFromCloudRecords(records));
    setPendingConflict(conflicts?.[0] ?? null);
    setLastSyncedAt(new Date().toISOString());
    setSyncError(conflicts?.length
      ? `A saved edit conflicts with a newer version of ${conflicts[0].record_id}. Choose which version to keep.`
      : '');
  }, [pendingConflict, userId]);

  const addSemester = useCallback((academicYear: string, semesterNumber: number) => {
    const sem: Semester = {
      id: uid(),
      academicYear,
      semesterNumber,
      createdAt: Date.now(),
    };
    setData((d) => ({ ...d, semesters: [...d.semesters, sem] }));
    return sem.id;
  }, []);

  const deleteSemester = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      semesters: d.semesters.filter((s) => s.id !== id),
      courses: d.courses.filter((c) => c.semesterId !== id),
    }));
  }, []);

  const updateSemester = useCallback((id: string, updates: Partial<Semester>) => {
    setData((d) => ({
      ...d,
      semesters: d.semesters.map((semester) => semester.id === id ? { ...semester, ...updates } : semester),
    }));
  }, []);

  const updateSettings = useCallback((updates: SettingsUpdate) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...updates } }));
  }, []);

  const addCourse = useCallback(
    (
      semesterId: string,
      name: string,
      code: string,
      creditUnits: number,
      targetGradePoint: number
    ) => {
      const course: CourseUnit = {
        id: uid(),
        name,
        code,
        creditUnits,
        targetGradePoint,
        semesterId,
        assessments: [],
        topics: [],
        documents: [],
        completed: false,
        createdAt: Date.now(),
      };
      setData((d) => ({ ...d, courses: [...d.courses, course] }));
      return course.id;
    },
    []
  );

  const updateCourse = useCallback((id: string, updates: Partial<CourseUnit>) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  }, []);

  const deleteCourse = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      courses: d.courses.filter((c) => c.id !== id),
    }));
  }, []);

  const addTopic = useCallback((courseId: string, title: string) => {
    const topic: CourseTopic = { id: uid(), title, completed: false };
    setData((d) => ({
      ...d,
      courses: d.courses.map((course) =>
        course.id === courseId ? { ...course, topics: [...course.topics, topic] } : course
      ),
    }));
  }, []);

  const updateTopic = useCallback((courseId: string, topicId: string, updates: Partial<CourseTopic>) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((course) =>
        course.id === courseId
          ? { ...course, topics: course.topics.map((topic) => topic.id === topicId ? { ...topic, ...updates } : topic) }
          : course
      ),
    }));
  }, []);

  const deleteTopic = useCallback((courseId: string, topicId: string) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((course) =>
        course.id === courseId ? { ...course, topics: course.topics.filter((topic) => topic.id !== topicId) } : course
      ),
    }));
  }, []);

  const addDocument = useCallback((courseId: string, document: CourseDocument) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((course) =>
        course.id === courseId ? { ...course, documents: [...course.documents, document] } : course
      ),
    }));
  }, []);

  const deleteDocument = useCallback((courseId: string, documentId: string) => {
    setData((d) => {
      const course = d.courses.find((item) => item.id === courseId);
      const document = course?.documents.find((item) => item.id === documentId);
      if (document?.fileUrl.startsWith('blob:')) URL.revokeObjectURL(document.fileUrl);
      return {
        ...d,
        courses: d.courses.map((item) =>
          item.id === courseId ? { ...item, documents: item.documents.filter((file) => file.id !== documentId) } : item
        ),
      };
    });
  }, []);

  const addAssessment = useCallback(
    (
      courseId: string,
      name: string,
      weight: number,
      total: number
    ) => {
      const assessment: Assessment = {
        id: uid(),
        name,
        weight,
        obtained: null,
        total,
      };
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, assessments: [...c.assessments, assessment] }
            : c
        ),
      }));
      return assessment.id;
    },
    []
  );

  const updateAssessment = useCallback(
    (
      courseId: string,
      assessmentId: string,
      updates: Partial<Assessment>
    ) => {
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                assessments: c.assessments.map((a) =>
                  a.id === assessmentId ? { ...a, ...updates } : a
                ),
              }
            : c
        ),
      }));
    },
    []
  );

  const deleteAssessment = useCallback(
    (courseId: string, assessmentId: string) => {
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                assessments: c.assessments.filter((a) => a.id !== assessmentId),
              }
            : c
        ),
      }));
    },
    []
  );

  const setTargetCGPA = useCallback((target: number) => {
    setData((d) => ({ ...d, settings: { ...d.settings, targetCGPA: target, targetSet: true } }));
  }, []);

  const importSetupRecords = useCallback(async (
    _setupId: string,
    shareToken: string,
    records: CloudRecord[],
  ) => {
    if (!supabase || !userId || !navigator.onLine) {
      throw new Error('Connect to the internet to import this setup into your CGP account.');
    }

    const { data: alreadyImported, error: importCheckError } = await supabase.rpc(
      'check_shared_setup_import',
      { p_token: shareToken },
    );
    if (importCheckError) throw importCheckError;
    if (alreadyImported === true) return false;

    for (const rawRecord of records) {
      const record = serializeCloudRecord(rawRecord);
      const current = remoteRecords.current.get(record.id);
      if (current && cloudRecordContent(current) === cloudRecordContent(record)) continue;
      const { data: result, error } = await supabase.rpc(
        'save_cgpa_record',
        saveRecordRpcArguments(record, current?.revision ?? 0),
      );
      if (error) throw error;
      if (!isSaveResult(result)) throw new Error('Supabase returned an invalid setup-import save response.');
      if (result.status === 'conflict') {
        const conflict = { id: result.conflict_id ?? '', record_id: record.id };
        if (conflict.id) setPendingConflict(conflict);
        setSyncError(`A newer cloud version of ${record.id} needs conflict resolution before import can continue.`);
        throw new Error('A cloud record changed while the setup was being imported. Resolve the conflict and retry.');
      }
      remoteRecords.current.set(record.id, { ...record, revision: result.revision });
    }

    const { data: importStatus, error: markImportError } = await supabase.rpc(
      'record_shared_setup_import',
      { p_token: shareToken },
    );
    if (markImportError) throw markImportError;
    if (importStatus !== 'recorded' && importStatus !== 'already_imported') {
      throw new Error('Supabase could not record this setup import. Check that the link is still active.');
    }
    setLastSyncedAt(new Date().toISOString());

    setData((current) => {
      let semesters = [...current.semesters];
      let courses = [...current.courses];
      for (const record of records) {
        if (record.is_deleted) continue;
        if (record.record_type === 'semester') {
          const semester = record.payload as Semester;
          semesters = [...semesters.filter((item) => item.id !== semester.id), semester];
        } else if (record.record_type === 'course') {
          const course = record.payload as CourseUnit;
          const existing = courses.find((item) => item.id === course.id);
          courses = [...courses.filter((item) => item.id !== course.id), {
            ...course,
            documents: existing?.documents ?? [],
          }];
        }
      }
      return { ...current, semesters, courses };
    });
    return true;
  }, [userId]);

  const loadSampleData = useCallback(() => {
    const sem1Id = uid();
    const sem2Id = uid();
    const semesters: Semester[] = [
      { id: sem1Id, academicYear: '2024/2025', semesterNumber: 1, createdAt: Date.now() },
      { id: sem2Id, academicYear: '2024/2025', semesterNumber: 2, createdAt: Date.now() + 1 },
    ];

    const mkCourse = (
      semId: string,
      name: string,
      code: string,
      cu: number,
      assessments: Assessment[]
    ): CourseUnit => ({
      id: uid(),
      name,
      code,
      creditUnits: cu,
      targetGradePoint: TARGET_CGPA,
      semesterId: semId,
      assessments,
      topics: [],
      documents: [],
      completed: true,
      createdAt: Date.now(),
    });

    const mkAssess = (name: string, weight: number, total: number, obtained: number | null): Assessment => ({
      id: uid(),
      name,
      weight,
      obtained,
      total,
    });

    const courses: CourseUnit[] = [
      mkCourse(sem1Id, 'Data Structures & Algorithms', 'CSC 2101', 4, [
        mkAssess('Coursework', 30, 100, 85),
        mkAssess('Midterm Test', 20, 100, 78),
        mkAssess('Final Exam', 50, 100, 82),
      ]),
      mkCourse(sem1Id, 'Database Systems', 'CSC 2102', 3, [
        mkAssess('Coursework', 30, 100, 88),
        mkAssess('Final Exam', 70, 100, 76),
      ]),
      mkCourse(sem1Id, 'Computer Architecture', 'CSC 2103', 3, [
        mkAssess('Coursework', 40, 100, 72),
        mkAssess('Final Exam', 60, 100, 80),
      ]),
      mkCourse(sem2Id, 'Software Engineering', 'CSC 2201', 4, [
        mkAssess('Coursework', 30, 100, 90),
        mkAssess('Final Exam', 70, 100, null),
      ]),
      mkCourse(sem2Id, 'Operating Systems', 'CSC 2202', 3, [
        mkAssess('Coursework', 30, 100, 65),
        mkAssess('Final Exam', 70, 100, null),
      ]),
    ];

    setData({ semesters, courses, settings: { targetCGPA: TARGET_CGPA } });
  }, []);

  const clearAllData = useCallback(() => {
    setData(emptyData);
  }, []);

  return {
    data,
    addSemester,
    deleteSemester,
    updateSemester,
    updateSettings,
    addCourse,
    updateCourse,
    deleteCourse,
    addTopic,
    updateTopic,
    deleteTopic,
    addDocument,
    deleteDocument,
    addAssessment,
    updateAssessment,
    deleteAssessment,
    setTargetCGPA,
    importSetupRecords,
    loadSampleData,
    clearAllData,
    loading,
    loadError,
    syncError,
    syncing,
    lastSyncedAt,
    pendingConflict,
    retryLoad,
    retrySync,
    resolveConflict,
  };
}

type AppDataContextValue = ReturnType<typeof useAppDataState>;
const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const value = useAppDataState();
  return createElement(AppDataContext.Provider, { value, children });
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used within AppDataProvider.');
  return context;
}
