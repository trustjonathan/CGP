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

export function normalizeSharedText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/./gs, (character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function getUnsafeTextReason(value: string): string | null {
  if (/<[^>]*>/.test(value) || Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159);
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
    && !/<[^>]*>/.test(value)
    && !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159);
    });
}

export function isSharedSetupPayload(value: unknown): value is SharedSetupPayload {
  return getSharedSetupPayloadIssues(value).length === 0;
}

export function getSharedSetupPayloadIssues(value: unknown): SharedSetupPrivacyIssue[] {
  const issues: SharedSetupPrivacyIssue[] = [];
  const addIssue = (location: string, reason: string) => issues.push({ location, reason });
  if (!isObject(value)) {
    addIssue('Setup', 'has an invalid format');
    return issues;
  }
  if (value.version !== 1) addIssue('Setup', 'has an unsupported format version');
  if (!Array.isArray(value.semesters)) {
    addIssue('Semesters', 'must be a list');
    return issues;
  }
  if (value.semesters.length === 0) addIssue('Semesters', 'add at least one semester');
  if (value.semesters.length > 20) addIssue('Semesters', 'limit is 20 semesters');
  let totalCourses = 0;
  value.semesters.forEach((semester, semesterIndex) => {
    const semesterLabel = `Semester ${semesterIndex + 1}`;
    if (!isObject(semester)) {
      addIssue(semesterLabel, 'has an invalid format');
      return;
    }
    if (!plainText(semester.academicYear, 20)) {
      addIssue(`${semesterLabel} academic year`, 'must be plain text up to 20 characters');
    }
    if (!Number.isInteger(semester.semesterNumber) || Number(semester.semesterNumber) < 1 || Number(semester.semesterNumber) > 3) {
      addIssue(`${semesterLabel} number`, 'must be between 1 and 3');
    }
    if (!Array.isArray(semester.courses)) {
      addIssue(`${semesterLabel} courses`, 'must be a list');
      return;
    }
    if (semester.courses.length > 50) addIssue(`${semesterLabel} courses`, 'limit is 50 courses');
    semester.courses.forEach((course, courseIndex) => {
      totalCourses += 1;
      const courseLabel = `${semesterLabel}, course ${courseIndex + 1}`;
      if (!isObject(course)) {
        addIssue(courseLabel, 'has an invalid format');
        return;
      }
      if (!plainText(course.name, 120)) addIssue(`${courseLabel} name`, 'must be plain text up to 120 characters');
      if (course.code !== undefined && course.code !== '' && !plainText(course.code, 40)) {
        addIssue(`${courseLabel} code`, 'must be plain text up to 40 characters');
      }
      if (!Number.isInteger(course.creditUnits) || Number(course.creditUnits) < 1 || Number(course.creditUnits) > 6) {
        addIssue(`${courseLabel} credits`, 'must be a whole number from 1 to 6');
      }
      if (course.targetGradePoint !== undefined && (
        typeof course.targetGradePoint !== 'number' || !Number.isFinite(course.targetGradePoint)
        || course.targetGradePoint < 0 || course.targetGradePoint > 5
      )) addIssue(`${courseLabel} target`, 'must be between 0 and 5');
      if (course.assessments !== undefined) {
        if (!Array.isArray(course.assessments)) addIssue(`${courseLabel} assessments`, 'must be a list');
        else {
          if (course.assessments.length > 12) addIssue(`${courseLabel} assessments`, 'limit is 12 assessments');
          course.assessments.forEach((assessment, assessmentIndex) => {
            const label = `${courseLabel}, assessment ${assessmentIndex + 1}`;
            if (!isObject(assessment)) {
              addIssue(label, 'has an invalid format');
              return;
            }
            if (!plainText(assessment.name, 80)) addIssue(`${label} name`, 'must be plain text up to 80 characters');
            if (typeof assessment.weight !== 'number' || !Number.isFinite(assessment.weight)
              || assessment.weight < 0 || assessment.weight > 100) addIssue(`${label} weight`, 'must be from 0 to 100');
            if (typeof assessment.total !== 'number' || !Number.isFinite(assessment.total)
              || assessment.total <= 0 || assessment.total > 1_000_000) addIssue(`${label} total`, 'must be greater than 0 and at most 1,000,000');
            if (Object.keys(assessment).some((key) => !['name', 'weight', 'total'].includes(key))) {
              addIssue(label, 'contains unsupported fields');
            }
          });
        }
      }
      if (course.topics !== undefined) {
        if (!Array.isArray(course.topics)) addIssue(`${courseLabel} topics`, 'must be a list');
        else course.topics.forEach((topic, topicIndex) => {
          const label = `${courseLabel}, topic ${topicIndex + 1}`;
          if (!isObject(topic)) {
            addIssue(label, 'has an invalid format');
            return;
          }
          if (!plainText(topic.title, 120)) addIssue(`${label} title`, 'must be plain text up to 120 characters');
          if (Object.keys(topic).some((key) => key !== 'title')) addIssue(label, 'contains unsupported fields');
        });
      }
      if (Object.keys(course).some((key) => ![
        'name', 'code', 'creditUnits', 'targetGradePoint', 'assessments', 'topics',
      ].includes(key))) addIssue(courseLabel, 'contains unsupported fields');
    });
    if (Object.keys(semester).some((key) => !['academicYear', 'semesterNumber', 'courses'].includes(key))) {
      addIssue(semesterLabel, 'contains unsupported fields');
    }
  });
  if (totalCourses > 200) addIssue('Courses', 'limit is 200 courses total');
  if (Object.keys(value).some((key) => !['version', 'semesters'].includes(key))) {
    addIssue('Setup', 'contains unsupported fields');
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 262144) {
      addIssue('Setup size', 'is larger than the 256 KB sharing limit');
    }
  } catch {
    addIssue('Setup', 'contains data that cannot be shared');
  }
  return issues;
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
