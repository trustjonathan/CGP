import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppData, Semester, CourseUnit, Assessment, CourseDocument, CourseTopic } from './types';
import { TARGET_CGPA, uid } from './types';
import { loadLocalData, persistLocalData } from './localSync';

const emptyData: AppData = {
  semesters: [],
  courses: [],
  settings: { targetCGPA: TARGET_CGPA },
};

function loadData(): AppData {
  return emptyData;
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    void loadLocalData().then((localData) => {
      if (active && localData) setData(localData);
      hydrated.current = true;
    }).catch(() => {
      hydrated.current = true;
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void persistLocalData(data);
  }, [data]);

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

  const updateSettings = useCallback((updates: Partial<AppData['settings']>) => {
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
    setData((d) => ({ ...d, settings: { targetCGPA: target } }));
  }, []);

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
      targetGradePoint: 5.0,
      semesterId: semId,
      assessments,
      topics: [],
      documents: [],
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
    loadSampleData,
    clearAllData,
  };
}
