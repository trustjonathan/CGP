import type { AppData, CourseUnit, Semester } from './types';

const DATABASE_NAME = 'cgpa-tracker-local';
const DATABASE_VERSION = 2;
const RECORD_STORE = 'records';
const SYNC_STORE = 'sync_state';

type RecordType = 'semester' | 'course' | 'settings';

export interface SyncRecord {
  id: string;
  record_type: RecordType;
  payload: Semester | CourseUnit | AppData['settings'];
  synced: boolean;
  updated_at: string;
  is_deleted: boolean;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        database.createObjectStore(RECORD_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SYNC_STORE)) {
        database.createObjectStore(SYNC_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readRecords(database: IDBDatabase): Promise<SyncRecord[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(RECORD_STORE, 'readonly').objectStore(RECORD_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SyncRecord[]);
    request.onerror = () => reject(request.error);
  });
}

function saveRecords(database: IDBDatabase, records: SyncRecord[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORD_STORE, 'readwrite');
    const store = transaction.objectStore(RECORD_STORE);
    records.forEach((record) => store.put(record));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function recordId(type: RecordType, id: string) {
  return `${type}:${id}`;
}

function toRecords(data: AppData): Array<Omit<SyncRecord, 'synced' | 'updated_at' | 'is_deleted'>> {
  return [
    ...data.semesters.map((semester) => ({ id: recordId('semester', semester.id), record_type: 'semester' as const, payload: semester })),
    ...data.courses.map((course) => ({ id: recordId('course', course.id), record_type: 'course' as const, payload: course })),
    { id: recordId('settings', 'current'), record_type: 'settings' as const, payload: data.settings },
  ];
}

function appDataFromRecords(records: SyncRecord[]): AppData {
  const active = records.filter((record) => !record.is_deleted);
  return {
    semesters: active.filter((record) => record.record_type === 'semester').map((record) => record.payload as Semester),
    courses: active.filter((record) => record.record_type === 'course').map((record) => {
      const course = record.payload as CourseUnit;
      return { ...course, topics: course.topics || [], documents: course.documents || [] };
    }),
    settings: (active.find((record) => record.record_type === 'settings')?.payload as AppData['settings'] | undefined) || { targetCGPA: 5 },
  };
}

export async function loadLocalData(): Promise<AppData | null> {
  const database = await openDatabase();
  const records = await readRecords(database);
  database.close();
  return records.length ? appDataFromRecords(records) : null;
}

export async function persistLocalData(data: AppData): Promise<void> {
  const database = await openDatabase();
  const existing = await readRecords(database);
  const byId = new Map(existing.map((record) => [record.id, record]));
  const now = new Date().toISOString();
  const next = toRecords(data).map((record) => {
    const previous = byId.get(record.id);
    const changed = !previous || JSON.stringify(previous.payload) !== JSON.stringify(record.payload) || previous.is_deleted;
    return {
      ...record,
      synced: changed ? false : previous.synced,
      updated_at: changed ? now : previous.updated_at,
      is_deleted: false,
    };
  });
  const currentIds = new Set(next.map((record) => record.id));
  existing.forEach((record) => {
    if (!currentIds.has(record.id) && !record.is_deleted) {
      next.push({ ...record, synced: false, updated_at: now, is_deleted: true });
    }
  });
  await saveRecords(database, next);
  database.close();
}
