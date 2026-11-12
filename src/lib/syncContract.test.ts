import { describe, expect, it, vi } from 'vitest';
import type { AppData, CourseUnit, Semester } from './types';
import {
  reconcileAccountRecords,
  replayPendingRecords,
  saveRecordRpcArguments,
  toCloudRecords,
} from './syncContract';
import type { AccountSyncRecord, CloudRecord } from './syncContract';

const semester: Semester = {
  id: 'semester-1',
  academicYear: '2025/2026',
  semesterNumber: 1,
  createdAt: 1,
};

function course(overrides: Partial<CourseUnit> = {}): CourseUnit {
  return {
    id: 'course-1',
    name: 'Biology',
    code: 'BIO 101',
    creditUnits: 3,
    targetGradePoint: 5,
    semesterId: semester.id,
    assessments: [],
    topics: [],
    documents: [],
    completed: false,
    createdAt: 2,
    ...overrides,
  };
}

function accountRecord(
  payload: Semester | CourseUnit | AppData['settings'],
  options: Partial<AccountSyncRecord> = {},
): AccountSyncRecord {
  const recordType = 'semesterId' in payload
    ? 'course'
    : 'semesterNumber' in payload
      ? 'semester'
      : 'settings';
  const id = recordType === 'settings'
    ? 'settings:current'
    : `${recordType}:${'id' in payload ? payload.id : ''}`;
  return {
    id,
    record_type: recordType,
    payload,
    synced: false,
    updated_at: '2026-01-01T00:00:00.000Z',
    is_deleted: false,
    key: `user-1:${id}`,
    user_id: 'user-1',
    revision: 0,
    ...options,
  } as AccountSyncRecord;
}

function cloudRecord(
  payload: Semester | CourseUnit | AppData['settings'],
  revision: number,
  isDeleted = false,
): CloudRecord {
  const local = accountRecord(payload);
  return { ...local, revision, is_deleted: isDeleted };
}

describe('sync contract', () => {
  it('retains a failed offline save for replay after reconnect', async () => {
    const queued = accountRecord(course({ name: 'Edited Biology' }));
    const save = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 'saved', revision: 1 });
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const remote = new Map<string, CloudRecord>();

    await expect(replayPendingRecords([queued], remote, save, acknowledge))
      .rejects.toThrow('Failed to fetch');
    expect(acknowledge).not.toHaveBeenCalled();

    await replayPendingRecords([queued], remote, save, acknowledge);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'course:course-1', record_type: 'course' }),
      0,
    );
    expect(acknowledge).toHaveBeenCalledWith(queued.id, queued.updated_at, 1);
    expect(remote.get(queued.id)?.revision).toBe(1);
  });

  it('does not duplicate a save when a prior attempt committed but its response was lost', async () => {
    const queued = accountRecord(course({ name: 'Edited Biology' }));
    const remoteAfterLostResponse = new Map([
      [queued.id, cloudRecord(queued.payload as CourseUnit, 7)],
    ]);
    const save = vi.fn();
    const acknowledge = vi.fn().mockResolvedValue(undefined);

    await replayPendingRecords([queued], remoteAfterLostResponse, save, acknowledge);

    expect(save).not.toHaveBeenCalled();
    expect(acknowledge).toHaveBeenCalledWith(queued.id, queued.updated_at, 7);
  });

  it('stops deterministic replay at a conflict against the latest remote revision', async () => {
    const first = accountRecord(course({ name: 'Local Biology' }), {
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const second = accountRecord(semester, {
      updated_at: '2026-01-02T00:00:00.000Z',
    });
    const remote = new Map([
      [first.id, cloudRecord(course({ name: 'Server Biology' }), 4)],
    ]);
    const save = vi.fn().mockResolvedValue({
      status: 'conflict',
      revision: 4,
      conflict_id: 'conflict-1',
    });
    const acknowledge = vi.fn();

    const result = await replayPendingRecords([second, first], remote, save, acknowledge);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: first.id }), 4);
    expect(result.conflict).toEqual({ id: 'conflict-1', record_id: first.id });
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('keeps unsynced local edits, adopts fresh cloud records, and drops stale synced cache rows', () => {
    const localUnsynced = accountRecord(course({ id: 'course-unsynced', name: 'Offline edit' }), {
      synced: false,
      payload: course({
        id: 'course-unsynced',
        name: 'Offline edit',
        documents: [{
          id: 'doc-1',
          fileName: 'notes.pdf',
          fileType: 'application/pdf',
          fileSize: 10,
          uploadDate: 3,
          fileUrl: 'blob:local-document',
        }],
      }),
    });
    const localSynced = accountRecord(course({ name: 'Old server name' }), {
      synced: true,
      revision: 2,
    });
    const stale = accountRecord({ ...semester, id: 'semester-stale' }, {
      id: 'semester:semester-stale',
      synced: true,
    });
    const freshRemoteCourse = cloudRecord(course({ name: 'New server name' }), 5);
    const freshRemoteSemester = cloudRecord(semester, 3);

    const merged = reconcileAccountRecords(
      'user-1',
      [localUnsynced, localSynced, stale],
      [freshRemoteCourse, freshRemoteSemester],
      { preservePending: true },
    );
    const byId = new Map(merged.map((record) => [record.id, record]));

    expect(byId.get(localUnsynced.id)?.payload).toMatchObject({
      name: 'Offline edit',
      documents: [{ fileUrl: 'blob:local-document' }],
    });
    expect(byId.get(localUnsynced.id)?.synced).toBe(false);
    expect(byId.get(localSynced.id)?.payload).toMatchObject({ name: 'New server name' });
    expect(byId.get(localSynced.id)?.revision).toBe(5);
    expect(byId.has(stale.id)).toBe(false);
    expect(byId.has(freshRemoteSemester.id)).toBe(true);
  });

  it('applies the selected conflict result without discarding other pending edits', () => {
    const resolved = accountRecord(course({ name: 'Local resolved edit' }), { synced: false });
    const unrelated = accountRecord(semester, { synced: false });
    const remoteResolved = cloudRecord(course({ name: 'Server-selected edit' }), 8);

    const records = reconcileAccountRecords(
      'user-1',
      [resolved, unrelated],
      [remoteResolved],
      { authoritativeRecordIds: [resolved.id] },
    );
    const byId = new Map(records.map((record) => [record.id, record]));

    expect(byId.get(resolved.id)).toMatchObject({
      payload: { name: 'Server-selected edit' },
      revision: 8,
      synced: true,
    });
    expect(byId.get(unrelated.id)).toMatchObject({ synced: false, payload: semester });
  });

  it('strips device-local document URLs, onboarding drafts, and unknown notification state from cloud payloads', () => {
    const data: AppData = {
      semesters: [semester],
      courses: [course({
        documents: [{
          id: 'doc-1',
          fileName: 'notes.pdf',
          fileType: 'application/pdf',
          fileSize: 10,
          uploadDate: 3,
          fileUrl: 'blob:private-document',
        }],
      })],
      settings: {
        targetCGPA: 4,
        onboardingDraft: { privateNotes: 'local-only' },
        notificationPreferences: { enabled: true },
      } as AppData['settings'],
    };

    const serialized = toCloudRecords(data);
    const serializedText = JSON.stringify(serialized);
    const coursePayload = serialized.find((record) => record.record_type === 'course')?.payload;
    const settingsPayload = serialized.find((record) => record.record_type === 'settings')?.payload;

    expect(serializedText).not.toContain('private-document');
    expect(serializedText).not.toContain('onboardingDraft');
    expect(serializedText).not.toContain('notificationPreferences');
    expect(coursePayload).toMatchObject({ documents: [] });
    expect(settingsPayload).toEqual({ targetCGPA: 4 });
  });

  it('locks record identity and outbound course payload keys', () => {
    const courseWithDeviceState = {
      ...course(),
      localReminderState: 'device-only',
    } as CourseUnit;
    const data: AppData = {
      semesters: [semester],
      courses: [courseWithDeviceState],
      settings: { targetCGPA: 4 },
    };
    const cloudCourse = toCloudRecords(data).find((record) => record.record_type === 'course');
    expect(cloudCourse).toBeDefined();
    expect(Object.keys(cloudCourse!.payload).sort()).toEqual([
      'assessments',
      'code',
      'completed',
      'createdAt',
      'creditUnits',
      'documents',
      'id',
      'name',
      'semesterId',
      'targetGradePoint',
      'topics',
    ]);

    expect(() => saveRecordRpcArguments({
      ...cloudCourse!,
      id: 'semester:course-1',
    }, 3)).toThrow('does not match its payload');
  });
});
