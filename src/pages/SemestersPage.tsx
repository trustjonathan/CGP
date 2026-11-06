import { useState } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  ArrowRight,
  Check,
  ListChecks,
  X,
  Edit2,
} from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  semesterGPA,
  formatGPA,
  type Semester,
  type CourseUnit,
  type CourseTopic,
} from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { GradeBadge, ProgressBar, EmptyState } from '@/components/ui';
import { Link } from 'react-router-dom';

export function SemestersPage() {
  const {
    data,
    addSemester,
    deleteSemester,
    updateSemester,
    addCourse,
    deleteCourse,
    addTopic,
    updateTopic,
    deleteTopic,
  } = useAppData();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [semModalOpen, setSemModalOpen] = useState(false);
  const [courseModalSemId, setCourseModalSemId] = useState<string | null>(null);
  const [editSemester, setEditSemester] = useState<Semester | null>(null);

  // Semester form
  const [semYear, setSemYear] = useState('');
  const [semNumber, setSemNumber] = useState(1);

  const openEditSemester = (semester: Semester) => {
    setEditSemester(semester);
    setSemYear(semester.academicYear);
    setSemNumber(semester.semesterNumber);
  };

  const handleEditSemester = () => {
    if (!editSemester || !semYear.trim()) return;
    updateSemester(editSemester.id, { academicYear: semYear.trim(), semesterNumber: semNumber });
    setEditSemester(null);
    setSemYear('');
    setSemNumber(1);
  };

  // Course form
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseCU, setCourseCU] = useState(3);
  const [courseTargetGP, setCourseTargetGP] = useState(5.0);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSemester = () => {
    if (!semYear.trim()) return;
    addSemester(semYear.trim(), semNumber);
    setSemYear('');
    setSemNumber(1);
    setSemModalOpen(false);
  };

  const handleAddCourse = () => {
    if (!courseName.trim() || !courseModalSemId) return;
    addCourse(courseModalSemId, courseName.trim(), courseCode.trim(), courseCU, courseTargetGP);
    setCourseName('');
    setCourseCode('');
    setCourseCU(3);
    setCourseTargetGP(5.0);
    setCourseModalSemId(null);
  };

  const handleDeleteSemester = (id: string) => {
    if (!confirm('Delete this semester and all its courses?')) return;
    deleteSemester(id);
  };

  const handleDeleteCourse = (id: string) => {
    if (!confirm('Delete this course and all its assessments?')) return;
    deleteCourse(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Semesters & Courses</h1>
          <p className="text-ink-500 text-sm">Organize your academic years, semesters, and course units</p>
        </div>
        <button onClick={() => setSemModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Semester
        </button>
      </div>

      {data.semesters.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No semesters yet"
          description="Add your first semester to start tracking courses and assessments."
          action={
            <button onClick={() => setSemModalOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Add Your First Semester
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {data.semesters
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((sem) => {
              const semCourses = data.courses.filter((c) => c.semesterId === sem.id);
              const gpa = semesterGPA(data.courses, sem.id);
              const isOpen = expanded.has(sem.id);
              return (
                <SemesterCard
                  key={sem.id}
                  semester={sem}
                  courses={semCourses}
                  gpa={gpa}
                  isOpen={isOpen}
                  onToggle={() => toggleExpand(sem.id)}
                  onAddCourse={() => setCourseModalSemId(sem.id)}
                  onDeleteSemester={() => handleDeleteSemester(sem.id)}
                  onEditSemester={() => openEditSemester(sem)}
                  onDeleteCourse={handleDeleteCourse}
                  onAddTopic={addTopic}
                  onUpdateTopic={updateTopic}
                  onDeleteTopic={deleteTopic}
                />
              );
            })}
        </div>
      )}

      {/* Add Semester Modal */}
      <Modal open={semModalOpen || !!editSemester} onClose={() => { setSemModalOpen(false); setEditSemester(null); }} title={editSemester ? 'Edit Semester' : 'Add Semester'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Academic Year</label>
            <input
              type="text"
              value={semYear}
              onChange={(e) => setSemYear(e.target.value)}
              placeholder="e.g. 2024/2025"
              className="input"
            />
          </div>
          <div>
            <label className="label">Semester Number</label>
            <select value={semNumber} onChange={(e) => setSemNumber(parseInt(e.target.value))} className="input">
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
              <option value={3}>Semester 3</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setSemModalOpen(false); setEditSemester(null); }} className="btn-secondary">Cancel</button>
            <button onClick={editSemester ? handleEditSemester : handleAddSemester} className="btn-primary">{editSemester ? 'Save Changes' : 'Add Semester'}</button>
          </div>
        </div>
      </Modal>

      {/* Add Course Modal */}
      <Modal open={!!courseModalSemId} onClose={() => setCourseModalSemId(null)} title="Add Course Unit" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Course Name</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. Data Structures & Algorithms"
              className="input"
            />
          </div>
          <div>
            <label className="label">Course Code</label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CSC 2101"
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Credit Units</label>
              <input
                type="number"
                value={courseCU}
                onChange={(e) => setCourseCU(parseInt(e.target.value) || 1)}
                min="1"
                max="6"
                className="input"
              />
            </div>
            <div>
              <label className="label">Target Grade Point</label>
              <select value={courseTargetGP} onChange={(e) => setCourseTargetGP(parseFloat(e.target.value))} className="input">
                <option value={5.0}>5.0 (A)</option>
                <option value={4.5}>4.5 (B+)</option>
                <option value={4.0}>4.0 (B)</option>
                <option value={3.5}>3.5 (C+)</option>
                <option value={3.0}>3.0 (C)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setCourseModalSemId(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleAddCourse} className="btn-primary">Add Course</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SemesterCard({
  semester,
  courses,
  gpa,
  isOpen,
  onToggle,
  onAddCourse,
  onDeleteSemester,
  onEditSemester,
  onDeleteCourse,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
}: {
  semester: Semester;
  courses: CourseUnit[];
  gpa: number | null;
  isOpen: boolean;
  onToggle: () => void;
  onAddCourse: () => void;
  onDeleteSemester: () => void;
  onEditSemester: () => void;
  onDeleteCourse: (id: string) => void;
  onAddTopic: (courseId: string, title: string) => void;
  onUpdateTopic: (courseId: string, topicId: string, updates: Partial<CourseTopic>) => void;
  onDeleteTopic: (courseId: string, topicId: string) => void;
}) {
  const totalCU = courses.reduce((s, c) => s + c.creditUnits, 0);

  return (
    <div className="card overflow-hidden">
      {/* Semester header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-ink-50 transition-colors"
        onClick={onToggle}
      >
        <button className="text-ink-400 hover:text-ink-600">
          {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-ink-900">
            {semester.academicYear} — Semester {semester.semesterNumber}
          </div>
          <div className="text-xs text-ink-500">
            {courses.length} course{courses.length !== 1 ? 's' : ''} · {totalCU} CU
          </div>
        </div>
        {gpa !== null && <GradeBadge gp={gpa} label={`GPA ${formatGPA(gpa)}`} />}
        <button
          onClick={(e) => { e.stopPropagation(); onEditSemester(); }}
          className="p-1.5 rounded-lg text-ink-300 hover:text-primary-500 hover:bg-primary-50 transition-colors"
          title="Edit semester"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteSemester(); }}
          className="p-1.5 rounded-lg text-ink-300 hover:text-error-500 hover:bg-error-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Course list */}
      {isOpen && (
        <div className="border-t border-ink-100 animate-fade-in">
          {courses.length === 0 ? (
            <div className="px-4 py-6 text-center text-ink-400 text-sm">
              No courses in this semester yet.
            </div>
          ) : (
            <div className="divide-y divide-ink-50">
              {courses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  onDeleteCourse={onDeleteCourse}
                  onAddTopic={onAddTopic}
                  onUpdateTopic={onUpdateTopic}
                  onDeleteTopic={onDeleteTopic}
                />
              ))}
            </div>
          )}
          <div className="px-4 py-3 bg-ink-50/50">
            <button onClick={onAddCourse} className="btn-secondary text-sm w-full">
              <Plus className="w-4 h-4" />
              Add Course Unit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseRow({
  course,
  onDeleteCourse,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
}: {
  course: CourseUnit;
  onDeleteCourse: (id: string) => void;
  onAddTopic: (courseId: string, title: string) => void;
  onUpdateTopic: (courseId: string, topicId: string, updates: Partial<CourseTopic>) => void;
  onDeleteTopic: (courseId: string, topicId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [outline, setOutline] = useState('');
  const completed = course.topics.filter((topic) => topic.completed).length;
  const progress = course.topics.length ? (completed / course.topics.length) * 100 : 0;

  const addOne = () => {
    if (!topicTitle.trim()) return;
    onAddTopic(course.id, topicTitle.trim());
    setTopicTitle('');
  };

  const addOutline = () => {
    outline.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => onAddTopic(course.id, line));
    setOutline('');
  };

  return (
    <div className="border-b border-ink-50 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 group">
                  <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-500 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                    <span className="break-words font-medium text-ink-900 text-sm sm:min-w-0 sm:truncate">{course.name}</span>
                    {course.code && <span className="shrink-0 text-xs text-ink-400 font-mono">{course.code}</span>}
                    <div className="text-xs text-ink-500">
                      {course.creditUnits} CU · {course.assessments.length} assessment{course.assessments.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1 max-sm:basis-full max-sm:justify-end sm:ml-0">
                  <Link
                    to={`/course/${course.id}`}
                    className="p-2 rounded-lg text-ink-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="Open course"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => setOpen((value) => !value)}
                    className={`p-2 rounded-lg transition-colors ${open ? 'text-primary-600 bg-primary-50' : 'text-ink-400 hover:text-primary-600 hover:bg-primary-50'}`}
                    title="Course Outline & Topics"
                    aria-expanded={open}
                  >
                    <ListChecks className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteCourse(course.id)}
                    className="p-2 rounded-lg text-ink-300 hover:text-error-500 hover:bg-error-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pl-16 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-ink-900">Course Outline & Topics</h4>
              <p className="text-xs text-ink-500">{completed} of {course.topics.length} topics complete</p>
            </div>
            <span className="text-xs font-semibold text-primary-600">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} height="h-1.5" color={progress === 100 ? 'success' : 'primary'} />
          <div className="flex gap-2">
            <input value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addOne(); }} placeholder="Add a topic" className="input py-2 text-sm" />
            <button onClick={addOne} className="btn-primary text-sm whitespace-nowrap"><Plus className="w-3.5 h-3.5" /> Add Topic</button>
          </div>
          <div>
            <textarea value={outline} onChange={(event) => setOutline(event.target.value)} placeholder="Paste an outline, one topic per line" rows={3} className="input text-sm" />
            <button onClick={addOutline} disabled={!outline.trim()} className="btn-secondary text-xs mt-2">Add Outline</button>
          </div>
          {course.topics.length > 0 && (
            <div className="space-y-1">
              {course.topics.map((topic) => (
                <div key={topic.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                  <button onClick={() => onUpdateTopic(course.id, topic.id, { completed: !topic.completed })} className={`w-5 h-5 rounded border flex items-center justify-center ${topic.completed ? 'bg-success-500 border-success-500 text-white' : 'border-ink-300 text-transparent'}`} aria-label={`Mark ${topic.title} ${topic.completed ? 'incomplete' : 'complete'}`}><Check className="w-3 h-3" /></button>
                  <span className={`text-sm flex-1 ${topic.completed ? 'line-through text-ink-400' : 'text-ink-700'}`}>{topic.title}</span>
                  <button onClick={() => onDeleteTopic(course.id, topic.id)} className="p-1 text-ink-300 hover:text-error-500" aria-label={`Delete ${topic.title}`}><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
