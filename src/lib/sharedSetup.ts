import type { Assessment, CourseTopic } from './types';

export interface SharedSetupCourse {
  name: string;
  code?: string;
  creditUnits: number;
  targetGradePoint?: number;
  assessments?: Array<Pick<Assessment, 'name' | 'weight' | 'total'>>;
  topics?: Array<Pick<CourseTopic, 'title'>>;
}

export interface SharedSetupSemester {
  academicYear: string;
  semesterNumber: number;
  courses: SharedSetupCourse[];
}

export interface SharedSetupPayload {
  version: 1;
  semesters: SharedSetupSemester[];
}

export interface SharedSetupPreview {
  id: string;
  title: string;
  payload: SharedSetupPayload;
  include_assessments: boolean;
  include_topics: boolean;
  expires_at: string;
}

export interface SharedSetupPrivacyIssue {
  location: string;
  reason: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getUnsafeTextReason(value: string): string | null {
  if (/[<>]/.test(value) || Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  })) return 'contains markup or unsupported control characters';
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return 'appears to contain an email address';
  if (/\b\d{3}[- .()][0-9]{3,}[- .()][0-9]{3,}\b/.test(value)) return 'appears to contain a phone number';
  if (/\b(student|registration|reg)\s*(id|number|no\.?)\b/i.test(value)) return 'appears to contain a student or registration identifier';
  return null;
}

export function getSharedSetupPrivacyIssues(
  value: unknown,
  title: string,
  includeAssessments: boolean,
  includeTopics: boolean,
): SharedSetupPrivacyIssue[] {
  const issues: SharedSetupPrivacyIssue[] = [];
  const check = (text: unknown, location: string) => {
    if (typeof text !== 'string') return;
    const reason = getUnsafeTextReason(text);
    if (reason) issues.push({ location, reason });
  };

  check(title, 'Setup name');
  if (!isObject(value) || !Array.isArray(value.semesters)) return issues;

  value.semesters.forEach((semester, semesterIndex) => {
    if (!isObject(semester)) return;
    const semesterLabel = typeof semester.academicYear === 'string'
      ? `Semester ${semester.academicYear} ${String(semester.semesterNumber ?? '')}`.trim()
      : `Semester ${semesterIndex + 1}`;
    check(semester.academicYear, `${semesterLabel} academic year`);
    if (!Array.isArray(semester.courses)) return;
    semester.courses.forEach((course, courseIndex) => {
      if (!isObject(course)) return;
      const courseName = typeof course.name === 'string' && course.name.trim()
        ? course.name.trim()
        : `Course ${courseIndex + 1}`;
      const courseLabel = `${semesterLabel}, ${courseName}`;
      check(course.name, `${courseLabel} course name`);
      check(course.code, `${courseLabel} course code`);
      if (includeAssessments && Array.isArray(course.assessments)) {
        course.assessments.forEach((assessment, assessmentIndex) => {
          if (isObject(assessment)) {
            check(assessment.name, `${courseLabel}, assessment ${assessmentIndex + 1} name`);
          }
        });
      }
      if (includeTopics && Array.isArray(course.topics)) {
        course.topics.forEach((topic, topicIndex) => {
          if (isObject(topic)) {
            check(topic.title, `${courseLabel}, topic ${topicIndex + 1}`);
          }
        });
      }
    });
  });
  return issues;
}

function plainText(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maximum
    && !/[<>]/.test(value)
    && !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    });
}

export function isSharedSetupPayload(value: unknown): value is SharedSetupPayload {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.semesters)
    || value.semesters.length === 0 || value.semesters.length > 20) return false;
  let totalCourses = 0;
  for (const semester of value.semesters) {
    if (!isObject(semester) || !plainText(semester.academicYear, 20)
      || !Number.isInteger(semester.semesterNumber) || Number(semester.semesterNumber) < 1
      || Number(semester.semesterNumber) > 3 || !Array.isArray(semester.courses)
      || semester.courses.length > 50) return false;
    for (const course of semester.courses) {
      totalCourses += 1;
      if (!isObject(course) || !plainText(course.name, 120)
        || (course.code !== undefined && course.code !== '' && !plainText(course.code, 40))
        || !Number.isInteger(course.creditUnits) || Number(course.creditUnits) < 1
        || Number(course.creditUnits) > 6
        || (course.targetGradePoint !== undefined && (
          typeof course.targetGradePoint !== 'number'
          || !Number.isFinite(course.targetGradePoint)
          || course.targetGradePoint < 0
          || course.targetGradePoint > 5
        ))) return false;
      if (course.assessments !== undefined) {
        if (!Array.isArray(course.assessments) || course.assessments.length > 12) return false;
        if (!course.assessments.every((assessment) => isObject(assessment)
          && plainText(assessment.name, 80)
          && typeof assessment.weight === 'number' && Number.isFinite(assessment.weight)
          && assessment.weight >= 0 && assessment.weight <= 100
          && typeof assessment.total === 'number' && Number.isFinite(assessment.total)
          && assessment.total > 0 && assessment.total <= 1_000_000
          && Object.keys(assessment).every((key) => ['name', 'weight', 'total'].includes(key)))) return false;
      }
      if (course.topics !== undefined) {
        if (!Array.isArray(course.topics) || course.topics.length > 50) return false;
        if (!course.topics.every((topic) => isObject(topic)
          && plainText(topic.title, 120)
          && Object.keys(topic).every((key) => key === 'title'))) return false;
      }
      if (Object.keys(course).some((key) => ![
        'name', 'code', 'creditUnits', 'targetGradePoint', 'assessments', 'topics',
      ].includes(key))) return false;
    }
    if (Object.keys(semester).some((key) => !['academicYear', 'semesterNumber', 'courses'].includes(key))) return false;
  }
  return totalCourses <= 200 && Object.keys(value).every((key) => ['version', 'semesters'].includes(key));
}

export function parseSharedSetupResult(value: unknown): SharedSetupPreview | null {
  if (!isObject(value)
    || typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || typeof value.expires_at !== 'string'
    || typeof value.include_assessments !== 'boolean'
    || typeof value.include_topics !== 'boolean'
    || !isSharedSetupPayload(value.payload)) return null;
  return value as unknown as SharedSetupPreview;
}

export function normalizeSetupKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function getSetupToken(value: string) {
  const trimmed = value.trim();
  const linkMatch = trimmed.match(/(?:cgp:\/\/import\/|#\/import\/|\/import\/)([A-Za-z0-9_-]{22})(?:[?#].*)?$/i);
  const token = linkMatch?.[1] ?? trimmed;
  return /^[A-Za-z0-9_-]{22}$/.test(token) ? token : null;
}
