import type { AppData, CourseUnit, Semester } from './types';

const DATABASE_NAME = 'cgpa-tracker-local';
const DATABASE_VERSION = 3;
const RECORD_STORE = 'records';
const SYNC_STORE = 'sync_state';
const ACCOUNT_RECORD_STORE = 'account_records';
const OUTBOX_STORE = 'sync_outbox';

type RecordType = 'semester' | 'course' | 'settings';

export interface SyncRecord {
  id: string;
  record_type: RecordType;
  payload: Semester | CourseUnit | AppData['settings'];
  synced: boolean;
  updated_at: string;
  is_deleted: boolean;
}

export interface AccountSyncRecord extends SyncRecord {
  key: string;
  user_id: string;
  revision: number;
}

interface AccountOutboxItem {
  id: string;
  user_id: string;
  record_id: string;
  updated_at: string;
  status: 'pending' | 'done';
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
      if (!database.objectStoreNames.contains(ACCOUNT_RECORD_STORE)) {
        const store = database.createObjectStore(ACCOUNT_RECORD_STORE, { keyPath: 'key' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        outbox.createIndex('user_id', 'user_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function accountKey(userId: string, id: string) {
  return `${userId}:${id}`;
}

export async function readAccountRecords(userId: string): Promise<AccountSyncRecord[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(ACCOUNT_RECORD_STORE, 'readonly')
        .objectStore(ACCOUNT_RECORD_STORE).index('user_id').getAll(userId);
      request.onsuccess = () => resolve(request.result as AccountSyncRecord[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadAccountData(userId: string): Promise<AppData | null> {
  const records = await readAccountRecords(userId);
  return records.length ? appDataFromRecords(records) : null;
}

export async function persistAccountData(userId: string, data: AppData): Promise<AccountSyncRecord[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([ACCOUNT_RECORD_STORE, OUTBOX_STORE], 'readwrite');
      const store = transaction.objectStore(ACCOUNT_RECORD_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const request = store.index('user_id').getAll(userId);
      let next: AccountSyncRecord[] = [];
      request.onsuccess = () => {
        const existing = request.result as AccountSyncRecord[];
        const byId = new Map(existing.map((record) => [record.id, record]));
        const now = new Date().toISOString();
        next = toRecords(data).map((record): AccountSyncRecord => {
          const previous = byId.get(record.id);
          const changed = !previous
            || JSON.stringify(previous.payload) !== JSON.stringify(record.payload)
            || previous.is_deleted;
          return {
            ...record,
            key: accountKey(userId, record.id),
            user_id: userId,
            revision: previous?.revision ?? 0,
            synced: changed ? false : previous.synced,
            updated_at: changed ? now : previous.updated_at,
            is_deleted: false,
          };
        });
        const currentIds = new Set(next.map((record) => record.id));
        existing.forEach((record) => {
          if (!currentIds.has(record.id) && !record.is_deleted) {
            next.push({ ...record, synced: false, updated_at: now, is_deleted: true });
          } else if (!currentIds.has(record.id)) {
            next.push(record);
          }
        });
        next.forEach((record) => {
          store.put(record);
          const outboxId = accountKey(userId, record.id);
          if (record.synced) {
            outbox.delete(outboxId);
          } else {
            outbox.put({
              id: outboxId,
              user_id: userId,
              record_id: record.id,
              updated_at: record.updated_at,
              status: 'pending',
            } satisfies AccountOutboxItem);
          }
        });
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Local account data write was aborted.'));
    });
  } finally {
    database.close();
  }
}

export async function mergeCloudSnapshot(
  userId: string,
  cloudRecords: Array<Omit<SyncRecord, 'synced' | 'updated_at'> & { revision: number }>,
) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([ACCOUNT_RECORD_STORE, OUTBOX_STORE], 'readwrite');
      const store = transaction.objectStore(ACCOUNT_RECORD_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const request = store.index('user_id').getAll(userId);
      request.onsuccess = () => {
        const existing = request.result as AccountSyncRecord[];
        const byId = new Map(existing.map((record) => [record.id, record]));
        const now = new Date().toISOString();
        for (const remote of cloudRecords) {
          const previous = byId.get(remote.id);
          if (previous && !previous.synced) continue;
          const payload = remote.record_type === 'course'
            ? {
                ...remote.payload as CourseUnit,
                documents: (previous?.payload as CourseUnit | undefined)?.documents ?? [],
              }
            : remote.payload;
          store.put({
            ...remote,
            payload,
            key: accountKey(userId, remote.id),
            user_id: userId,
            synced: true,
            updated_at: now,
          } satisfies AccountSyncRecord);
          outbox.delete(accountKey(userId, remote.id));
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('The local cloud snapshot could not be saved.'));
    });
  } finally {
    database.close();
  }
}

export async function markAccountRecordSynced(
  userId: string,
  recordId: string,
  updatedAt: string,
  revision: number,
) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([ACCOUNT_RECORD_STORE, OUTBOX_STORE], 'readwrite');
      const store = transaction.objectStore(ACCOUNT_RECORD_STORE);
      const key = accountKey(userId, recordId);
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as AccountSyncRecord | undefined;
        if (record?.updated_at === updatedAt) {
          store.put({ ...record, revision, synced: true });
          transaction.objectStore(OUTBOX_STORE).delete(key);
        }
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('The local sync status could not be updated.'));
    });
  } finally {
    database.close();
  }
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
