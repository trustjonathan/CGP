import type { AppData, AppSettings, CourseUnit, Semester } from './types';

export type RecordType = 'semester' | 'course' | 'settings';

export interface CloudRecord {
  id: string;
  record_type: RecordType;
  payload: Semester | CourseUnit | AppSettings;
  is_deleted: boolean;
  revision: number;
}

export interface AccountSyncRecord extends CloudRecord {
  key: string;
  user_id: string;
  synced: boolean;
  updated_at: string;
}

export interface PendingRecordSaveResult {
  status: 'saved' | 'conflict';
  revision: number;
  conflict_id?: string;
}

export interface PendingReplayResult {
  conflict: { id: string; record_id: string } | null;
  acknowledged: number;
}

export interface SaveRecordRpcArguments {
  p_id: string;
  p_record_type: RecordType;
  p_payload: CloudRecord['payload'];
  p_is_deleted: boolean;
  p_expected_revision: number;
}

const SETTINGS_FIELDS = [
  'targetCGPA',
  'customTargetCGPA',
  'targetSet',
  'profileName',
  'university',
  'programme',
  'yearOfStudy',
  'programmeAnchor',
  'programmeJoinedAcademicYear',
  'programmeFinishDateOverride',
  'currentSemester',
  'academicYear',
  'onboardingCompleted',
  'profilePicture',
] as const;
const SEMESTER_FIELDS = ['id', 'academicYear', 'semesterNumber', 'createdAt'] as const;
const COURSE_FIELDS = [
  'id',
  'name',
  'code',
  'creditUnits',
  'targetGradePoint',
  'targetUsesGlobal',
  'semesterId',
  'assessments',
  'topics',
  'documents',
  'completed',
  'createdAt',
] as const;
const ASSESSMENT_FIELDS = ['id', 'name', 'weight', 'obtained', 'total'] as const;
const TOPIC_FIELDS = ['id', 'title', 'completed'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyFields(value: Record<string, unknown>, fields: readonly string[], label: string) {
  const unexpected = Object.keys(value).filter((field) => !fields.includes(field));
  if (unexpected.length) {
    throw new Error(
      `The ${label} payload contains unsupported field(s): ${unexpected.join(', ')}. Local-only or unknown data cannot be sent to Supabase.`,
    );
  }
}

function hasOnlyFields(value: object, fields: readonly string[]) {
  return Object.keys(value).every((field) => fields.includes(field));
}

function pickFields<T extends readonly string[]>(value: Record<string, unknown>, fields: T) {
  return Object.fromEntries(fields
    .filter((field) => Object.prototype.hasOwnProperty.call(value, field))
    .map((field) => [field, value[field]]));
}

function projectLocalPayload(recordType: RecordType, payload: unknown) {
  if (!isObject(payload)) throw new Error(`The ${recordType} record payload must be an object.`);
  if (recordType === 'semester') {
    return {
      id: payload.id as string,
      academicYear: payload.academicYear as string,
      semesterNumber: payload.semesterNumber as number,
      createdAt: payload.createdAt as number,
    } satisfies Semester;
  }
  if (recordType === 'settings') {
    return {
      targetCGPA: payload.targetCGPA as number,
      ...pickFields(payload, SETTINGS_FIELDS),
    } satisfies AppSettings;
  }

  if (payload.assessments !== undefined && !Array.isArray(payload.assessments)) {
    throw new Error('The course assessment payload must be a list.');
  }
  if (payload.topics !== undefined && !Array.isArray(payload.topics)) {
    throw new Error('The course topic payload must be a list.');
  }
  const rawAssessments = Array.isArray(payload.assessments) ? payload.assessments : [];
  const rawTopics = Array.isArray(payload.topics) ? payload.topics : [];
  if (!rawAssessments.every(isAssessment)) throw new Error('The course contains an invalid assessment record.');
  if (!rawTopics.every(isTopic)) throw new Error('The course contains an invalid topic record.');
  const assessments = rawAssessments.map((assessment) => ({
        id: assessment.id,
        name: assessment.name,
        weight: assessment.weight,
        obtained: assessment.obtained,
        total: assessment.total,
      }));
  const topics = rawTopics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        completed: topic.completed,
      }));
  return {
    id: payload.id as string,
    name: payload.name as string,
    code: payload.code as string,
    creditUnits: payload.creditUnits as number,
    targetGradePoint: payload.targetGradePoint as number,
    ...(typeof payload.targetUsesGlobal === 'boolean' ? { targetUsesGlobal: payload.targetUsesGlobal } : {}),
    semesterId: payload.semesterId as string,
    assessments,
    topics,
    documents: [],
    ...(typeof payload.completed === 'boolean' ? { completed: payload.completed } : {}),
    createdAt: payload.createdAt as number,
  } satisfies CourseUnit;
}

function serializeCloudPayload(recordType: RecordType, payload: unknown) {
  if (!isObject(payload)) throw new Error(`The ${recordType} record payload must be an object.`);
  const fields = recordType === 'semester'
    ? SEMESTER_FIELDS
    : recordType === 'course'
      ? COURSE_FIELDS
      : SETTINGS_FIELDS;
  assertOnlyFields(payload, fields, recordType);

  if (recordType === 'course') {
    if (payload.documents !== undefined && !Array.isArray(payload.documents)) {
      throw new Error('The course document payload must be a list.');
    }
    if (Array.isArray(payload.documents) && payload.documents.length > 0) {
      throw new Error('Course documents are device-local and cannot be sent to Supabase.');
    }
    for (const [field, allowedFields] of [
      ['assessments', ASSESSMENT_FIELDS],
      ['topics', TOPIC_FIELDS],
    ] as const) {
      const entries = payload[field];
      if (entries !== undefined && !Array.isArray(entries)) {
        throw new Error(`The course ${field} payload must be a list.`);
      }
      if (Array.isArray(entries)) {
        entries.forEach((entry, index) => {
          if (isObject(entry)) {
            assertOnlyFields(entry, allowedFields, `course ${field}[${index}]`);
          }
        });
      }
    }
  }

  return projectLocalPayload(recordType, payload);
}

function isAssessment(value: unknown): value is CourseUnit['assessments'][number] {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.weight === 'number'
    && (value.obtained === null || typeof value.obtained === 'number')
    && typeof value.total === 'number';
}

function isTopic(value: unknown): value is CourseUnit['topics'][number] {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.completed === 'boolean';
}

export function toCloudRecords(data: AppData): CloudRecord[] {
  return [
    ...data.semesters.map((semester) => ({
      id: `semester:${semester.id}`,
      record_type: 'semester' as const,
      payload: projectLocalPayload('semester', semester),
      is_deleted: false,
      revision: 0,
    })),
    ...data.courses.map((course) => ({
      id: `course:${course.id}`,
      record_type: 'course' as const,
      payload: projectLocalPayload('course', course),
      is_deleted: false,
      revision: 0,
    })),
    {
      id: 'settings:current',
      record_type: 'settings' as const,
      payload: projectLocalPayload('settings', data.settings),
      is_deleted: false,
      revision: 0,
    },
  ];
}

export function isCloudRecord(value: unknown): value is CloudRecord {
  if (!isObject(value)
    || typeof value.id !== 'string'
    || (value.record_type !== 'semester' && value.record_type !== 'course' && value.record_type !== 'settings')
    || !isObject(value.payload)
    || typeof value.is_deleted !== 'boolean'
    || typeof value.revision !== 'number'
    || !Number.isInteger(value.revision)
    || value.revision < 1) return false;

  const payloadId = value.payload.id;
  if (value.record_type === 'settings') {
    return hasOnlyFields(value.payload, SETTINGS_FIELDS)
      && value.id === 'settings:current'
      && typeof value.payload.targetCGPA === 'number';
  }
  if (value.record_type === 'semester') {
    return hasOnlyFields(value.payload, SEMESTER_FIELDS)
      && typeof payloadId === 'string'
      && typeof value.payload.academicYear === 'string'
      && Number.isInteger(value.payload.semesterNumber)
      && typeof value.payload.createdAt === 'number'
      && value.id === `semester:${payloadId}`;
  }
  return hasOnlyFields(value.payload, COURSE_FIELDS)
    && (value.payload.documents === undefined
      || (Array.isArray(value.payload.documents) && value.payload.documents.length === 0))
    && typeof payloadId === 'string'
    && typeof value.payload.name === 'string'
    && typeof value.payload.code === 'string'
    && typeof value.payload.creditUnits === 'number'
    && typeof value.payload.targetGradePoint === 'number'
    && typeof value.payload.semesterId === 'string'
    && typeof value.payload.createdAt === 'number'
    && (value.payload.assessments === undefined
      || (Array.isArray(value.payload.assessments)
        && value.payload.assessments.every((assessment) => (
          isAssessment(assessment) && hasOnlyFields(assessment, ASSESSMENT_FIELDS)
        ))))
    && (value.payload.topics === undefined
      || (Array.isArray(value.payload.topics)
        && value.payload.topics.every((topic) => isTopic(topic) && hasOnlyFields(topic, TOPIC_FIELDS))))
    && (value.payload.completed === undefined || typeof value.payload.completed === 'boolean')
    && value.id === `course:${payloadId}`;
}

function normalizedCloudRecord(record: CloudRecord): CloudRecord {
  if (!Number.isInteger(record.revision) || record.revision < 0) {
    throw new Error('The cloud record revision must be a non-negative integer.');
  }
  const normalized: CloudRecord = {
    ...record,
    payload: serializeCloudPayload(record.record_type, record.payload),
  };
  const expectedId = normalized.record_type === 'settings'
    ? 'settings:current'
    : `${normalized.record_type}:${'id' in normalized.payload ? normalized.payload.id : ''}`;
  if (normalized.id !== expectedId || normalized.id.length > 250) {
    throw new Error(`The ${normalized.record_type} record id does not match its payload.`);
  }
  return normalized;
}

export function serializeCloudRecord(record: CloudRecord): CloudRecord {
  return normalizedCloudRecord(record);
}

export function saveRecordRpcArguments(
  record: CloudRecord,
  expectedRevision: number,
): SaveRecordRpcArguments {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('The expected record revision must be a non-negative integer.');
  }
  const normalized = normalizedCloudRecord(record);
  return {
    p_id: normalized.id,
    p_record_type: normalized.record_type,
    p_payload: normalized.payload,
    p_is_deleted: normalized.is_deleted,
    p_expected_revision: expectedRevision,
  };
}

export function cloudRecordContent(record: CloudRecord): string {
  const normalized = normalizedCloudRecord(record);
  return JSON.stringify({
    record_type: normalized.record_type,
    payload: normalized.payload,
    is_deleted: normalized.is_deleted,
  });
}

function accountRecordToCloudRecord(record: AccountSyncRecord): CloudRecord {
  return normalizedCloudRecord({
    id: record.id,
    record_type: record.record_type,
    payload: projectLocalPayload(record.record_type, record.payload),
    is_deleted: record.is_deleted,
    revision: record.revision,
  });
}

export function orderPendingRecords(records: AccountSyncRecord[]): AccountSyncRecord[] {
  const latestById = new Map<string, AccountSyncRecord>();
  for (const record of records) {
    const previous = latestById.get(record.id);
    if (!previous || record.updated_at > previous.updated_at) latestById.set(record.id, record);
  }
  return [...latestById.values()].sort((left, right) => (
    left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id)
  ));
}

export async function replayPendingRecords(
  pendingRecords: AccountSyncRecord[],
  remoteRecords: Map<string, CloudRecord>,
  saveRecord: (record: CloudRecord, expectedRevision: number) => Promise<PendingRecordSaveResult>,
  acknowledgeRecord: (recordId: string, updatedAt: string, revision: number) => Promise<void>,
): Promise<PendingReplayResult> {
  let acknowledged = 0;
  for (const local of orderPendingRecords(pendingRecords)) {
    const record = accountRecordToCloudRecord(local);
    const remote = remoteRecords.get(record.id);
    if (remote && cloudRecordContent(remote) === cloudRecordContent(record)) {
      await acknowledgeRecord(record.id, local.updated_at, remote.revision);
      acknowledged += 1;
      continue;
    }

    const result = await saveRecord(record, remote?.revision ?? 0);
    if (result.status === 'conflict') {
      if (!result.conflict_id) throw new Error('Supabase did not return the saved conflict id.');
      return {
        conflict: { id: result.conflict_id, record_id: record.id },
        acknowledged,
      };
    }
    if (!Number.isInteger(result.revision) || result.revision < 1) {
      throw new Error('Supabase returned an invalid saved revision.');
    }
    const saved = { ...record, revision: result.revision };
    remoteRecords.set(record.id, saved);
    await acknowledgeRecord(record.id, local.updated_at, result.revision);
    acknowledged += 1;
  }
  return { conflict: null, acknowledged };
}

export function reconcileAccountRecords(
  userId: string,
  existing: AccountSyncRecord[],
  cloudRecords: CloudRecord[],
  options: { preservePending?: boolean; authoritativeRecordIds?: readonly string[] } = {},
): AccountSyncRecord[] {
  const preservePending = options.preservePending !== false;
  const authoritativeRecordIds = new Set(options.authoritativeRecordIds ?? []);
  const localById = new Map(existing.map((record) => [record.id, record]));
  const reconciled = new Map<string, AccountSyncRecord>();
  const now = new Date().toISOString();
  for (const rawRemote of cloudRecords) {
    const remote = normalizedCloudRecord(rawRemote);
    const previous = localById.get(remote.id);
    if (preservePending && previous && !previous.synced && !authoritativeRecordIds.has(remote.id)) {
      reconciled.set(previous.id, previous);
      continue;
    }
    const payload = remote.record_type === 'course'
      ? {
          ...remote.payload as CourseUnit,
          documents: (previous?.payload as CourseUnit | undefined)?.documents ?? [],
        }
      : remote.payload;
    reconciled.set(remote.id, {
      ...remote,
      payload,
      key: `${userId}:${remote.id}`,
      user_id: userId,
      synced: true,
      updated_at: now,
    });
  }

  for (const previous of existing) {
    if (preservePending && !previous.synced && !reconciled.has(previous.id)) {
      reconciled.set(previous.id, previous);
    }
  }
  return [...reconciled.values()];
}
