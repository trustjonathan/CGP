import { useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Trash2,
  Edit2,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Upload,
  Download,
  ExternalLink,
  File,
  Presentation,
} from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  courseAggregatePercent,
  courseCurrentGP,
  getGradeLabel,
  getGradePoint,
  getGradeColor,
  GRADE_SCALE,
  MAX_GRADE_POINT,
  minPercentForGradePoint,
  type Assessment,
  type CourseDocument,
} from '@/lib/types';
import { calculateCourseForecast, formatPoints } from '@/lib/forecast';
import {
  COURSEWORK_EXAM_REQUIREMENT,
  gradePointForTargetChoice,
  targetLabelForCourse,
  targetPercentForCourse,
  targetSummary,
} from '@/lib/gradingConfig';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar, GradeBadge, EmptyState } from '@/components/ui';

export function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data,
    updateAssessment,
    deleteAssessment,
    addAssessment,
    addTopic,
    updateTopic,
    deleteTopic,
    updateCourse,
    deleteCourse,
    addDocument,
    deleteDocument,
  } = useAppData();

  const [assessModalOpen, setAssessModalOpen] = useState(false);
  const [editAssess, setEditAssess] = useState<Assessment | null>(null);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [expandedTopicsByCourse, setExpandedTopicsByCourse] = useState<Record<string, boolean>>({});
  const topicsSectionRef = useRef<HTMLDivElement>(null);

  // Assessment form
  const [aName, setAName] = useState('');
  const [aWeight, setAWeight] = useState(30);
  const [aTotal, setATotal] = useState(100);

  // Course edit form
  const [cName, setCName] = useState('');
  const [cCode, setCCode] = useState('');
  const [cCU, setCCU] = useState(3);
  const [cTargetGP, setCTargetGP] = useState(MAX_GRADE_POINT);
  const [cTargetUsesGlobal, setCTargetUsesGlobal] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [topicInput, setTopicInput] = useState('');

  const course = data.courses.find((c) => c.id === id);
  const semester = course ? data.semesters.find((s) => s.id === course.semesterId) : null;

  if (!course) {
    return (
      <div className="space-y-4">
        <Link to="/semesters" className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft className="w-4 h-4" /> Back to Semesters
        </Link>
        <EmptyState
          icon={FileText}
          title="Course not found"
          description="This course may have been deleted."
          action={<Link to="/semesters" className="btn-primary">Go to Semesters</Link>}
        />
      </div>
    );
  }

  const currentPct = courseAggregatePercent(course);
  const currentGP = courseCurrentGP(course);
  const completedTopicCount = course.topics.filter((topic) => topic.completed).length;
  const topicsExpanded = expandedTopicsByCourse[course.id] ?? false;
  const topicProgress = course.topics.length > 0
    ? (completedTopicCount / course.topics.length) * 100
    : 0;
  const targetPercent = targetPercentForCourse(course, data.settings);
  const targetLabel = targetLabelForCourse(course, data.settings);
  const required = calculateCourseForecast(course, targetPercent);
  const isPassTarget = targetPercent === minPercentForGradePoint(gradePointForTargetChoice('pass') ?? 0);

  const openAddAssess = () => {
    setEditAssess(null);
    setAName('');
    setAWeight(30);
    setATotal(100);
    setAssessModalOpen(true);
  };

  const openEditAssess = (a: Assessment) => {
    setEditAssess(a);
    setAName(a.name);
    setAWeight(a.weight);
    setATotal(a.total);
    setAssessModalOpen(true);
  };

  const handleSaveAssess = () => {
    if (!aName.trim()) return;
    if (editAssess) {
      updateAssessment(course.id, editAssess.id, { name: aName.trim(), weight: aWeight, total: aTotal });
    } else {
      addAssessment(course.id, aName.trim(), aWeight, aTotal);
    }
    setAssessModalOpen(false);
  };

  const openEditCourse = () => {
    setCName(course.name);
    setCCode(course.code);
    setCCU(course.creditUnits);
    setCTargetGP(course.targetGradePoint);
    setCTargetUsesGlobal(course.targetUsesGlobal !== false);
    setEditCourseOpen(true);
  };

  const handleSaveCourse = () => {
    if (!cName.trim()) return;
    updateCourse(course.id, {
      name: cName.trim(),
      code: cCode.trim(),
      creditUnits: cCU,
      targetGradePoint: cTargetGP,
      targetUsesGlobal: cTargetUsesGlobal,
    });
    setEditCourseOpen(false);
  };

  const handleDeleteCourse = () => {
    if (!confirm('Delete this course and all its assessments?')) return;
    deleteCourse(course.id);
    navigate('/semesters');
  };

  const handleAddTopics = () => {
    const topics = topicInput
      .split(/\r?\n/)
      .map((topic) => topic.trim())
      .filter(Boolean);
    topics.forEach((topic) => addTopic(course.id, topic));
    if (topics.length > 0) setTopicInput('');
  };

  const toggleTopics = () => {
    setExpandedTopicsByCourse((previous) => ({
      ...previous,
      [course.id]: !topicsExpanded,
    }));
  };

  const openTopicsAndScroll = () => {
    setExpandedTopicsByCourse((previous) => ({ ...previous, [course.id]: true }));
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    window.requestAnimationFrame(() => {
      topicsSectionRef.current?.scrollIntoView({ behavior, block: 'start' });
    });
  };

  const acceptedExtensions = ['pdf', 'docx', 'doc', 'pptx', 'ppt'];
  const addFiles = async (files: FileList | File[]) => {
    await Promise.all(Array.from(files).map(async (file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!acceptedExtensions.includes(extension)) return;
      const fileUrl = window.desktopApp
        ? await window.desktopApp.saveCourseDocument(file.name, await file.arrayBuffer())
        : URL.createObjectURL(file);
      const document: CourseDocument = {
        id: `${Date.now()}-${file.name}`,
        fileName: file.name,
        fileType: extension,
        fileSize: file.size,
        uploadDate: Date.now(),
        fileUrl,
      };
      addDocument(course.id, document);
    }));
  };

  const openDocument = async (document: CourseDocument) => {
    if (window.desktopApp && !document.fileUrl.startsWith('blob:')) {
      await window.desktopApp.openCourseDocument(document.fileUrl);
      return;
    }
    window.open(document.fileUrl, '_blank', 'noopener,noreferrer');
  };

  const removeDocument = async (document: CourseDocument) => {
    if (window.desktopApp && !document.fileUrl.startsWith('blob:')) {
      await window.desktopApp.deleteCourseDocument(document.fileUrl);
    } else if (document.fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(document.fileUrl);
    }
    deleteDocument(course.id, document.id);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const documentIcon = (fileType: string) => fileType === 'pdf' ? FileText : fileType.startsWith('ppt') ? Presentation : File;

  const totalWeight = course.assessments.reduce((s, a) => s + a.weight, 0);
  const weightWarning = totalWeight !== 100;

  return (
    <div className="space-y-6">
      <Link to="/semesters" className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-700 w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Semesters
      </Link>

      {/* Course header */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-ink-900">{course.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-ink-500">
                <span className="font-mono">{course.code}</span>
                <span>·</span>
                <span>{course.creditUnits} CU</span>
                {semester && (
                  <>
                    <span>·</span>
                    <span>{semester.academicYear} S{semester.semesterNumber}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEditCourse} className="btn-secondary text-sm">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={handleDeleteCourse} className="btn-danger text-sm">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* Current status bar */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-ink-100">
          <div>
            <div className="text-xs text-ink-500 mb-1">Current Score</div>
            <div className="font-display font-bold text-lg text-ink-900">
              {currentPct !== null ? `${currentPct.toFixed(1)}%` : '--'}
            </div>
            {currentPct !== null && (
              <ProgressBar value={currentPct} color={getGradeColor(currentGP ?? 0) === 'success' ? 'success' : getGradeColor(currentGP ?? 0) === 'warning' ? 'warning' : 'primary'} height="h-1.5" />
            )}
          </div>
          <div>
            <div className="text-xs text-ink-500 mb-1">Current Grade</div>
            <div className="font-display font-bold text-lg text-ink-900">
              {currentGP !== null ? getGradeLabel(currentPct!) : '--'}
            </div>
            {currentGP !== null && <GradeBadge gp={currentGP} label={`GP ${currentGP.toFixed(1)}`} />}
          </div>
          <div>
            <div className="text-xs text-ink-500 mb-1">Target</div>
            <div className="font-display font-bold text-lg text-ink-900">{targetLabel}</div>
            <span className="text-xs text-ink-400">Course target</span>
          </div>
        </div>
      </div>

      {/* Required Mark Calculator */}
      {(required.hasRemaining || isPassTarget || course.assessments.length > 0) && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${required.achievable ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600'}`}>
              {required.achievable ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-display font-semibold text-ink-900">Target Safety Forecast</h3>
              <p className="text-xs text-ink-500">Minimum score needed to reach {targetLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-ink-50 p-4 text-center">
              <div className="text-xs text-ink-500 mb-1">Required Average</div>
              <div className="font-display font-bold text-2xl text-ink-900">
                {required.requiredPercent?.toFixed(1) ?? '--'}%
              </div>
              <div className="text-xs text-ink-400 mt-1">on remaining work</div>
            </div>
            <div className="rounded-lg bg-ink-50 p-4 text-center">
              <div className="text-xs text-ink-500 mb-1">Points Needed</div>
              <div className="font-display font-bold text-2xl text-ink-900">
                {required.hasRemaining
                  ? `${formatPoints(required.requiredPoints)} of ${formatPoints(required.remainingWeight)} points needed`
                  : '--'}
              </div>
              <div className="text-xs text-ink-400 mt-1">of remaining course weight</div>
            </div>
            <div className="rounded-lg bg-ink-50 p-4 text-center">
              <div className="text-xs text-ink-500 mb-1">Remaining Weight</div>
              <div className="font-display font-bold text-2xl text-ink-900">
                {formatPoints(required.remainingWeight)}%
              </div>
              <div className="text-xs text-ink-400 mt-1">of total grade</div>
            </div>
          </div>

          {required.assessmentRequirements.length > 0 && (
            <div className="mt-4 rounded-lg border border-ink-100 p-3">
              <h4 className="text-xs font-semibold text-ink-700">Required score by remaining assessment</h4>
              <ul className="mt-2 space-y-2">
                {required.assessmentRequirements.map((assessment) => (
                  <li key={assessment.assessmentId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="min-w-0 flex-1 text-ink-700">{assessment.name}</span>
                    <span className="font-semibold tabular-nums text-ink-900">
                      {formatPoints(assessment.requiredPoints)} of {formatPoints(assessment.total)}
                    </span>
                    <span className="text-xs tabular-nums text-ink-500">
                      {assessment.requiredPercent?.toFixed(1) ?? '--'}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isPassTarget && (
            <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900">
              <strong>Safe zone:</strong>{' '}
              {required.hasRemaining && required.requiredPercent !== null
                ? `you need at least ${required.requiredPercent.toFixed(1)}% on remaining work to reach a total of ${minPercentForGradePoint(gradePointForTargetChoice('pass') ?? 0)}%. `
                : required.status === 'already secured'
                  ? 'the pass target is already secured. '
                  : course.assessments.length > 0
                    ? 'there is no remaining assessment weight to raise the total to the pass mark. '
                    : 'add assessment weights to calculate the minimum mark needed to reach the pass total. '}
              Coursework must be at least {COURSEWORK_EXAM_REQUIREMENT.minimum}/{COURSEWORK_EXAM_REQUIREMENT.total} to sit the exam.
            </div>
          )}
          {course.assessments.length > 0 && required.status === 'not reachable' && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-warning-50 text-warning-800 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This target is not reachable with the remaining assessment weight. Best reachable:
                <strong> {required.bestReachableGrade} ({required.bestReachablePercent.toFixed(1)}%)</strong>.
              </span>
            </div>
          )}
          {course.assessments.length > 0 && required.status === 'already secured' && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-success-50 text-success-800 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Your {targetLabel} target is already secured.</span>
            </div>
          )}
          {course.assessments.length > 0 && required.status === 'on track' && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-success-50 text-success-800 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>On track for {targetLabel}. Average at least <strong>{required.requiredPercent?.toFixed(1)}%</strong> on remaining assessments.</span>
            </div>
          )}
        </div>
      )}

      {/* Assessments */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-ink-900">Assessments</h3>
            {weightWarning && (
              <p className="text-xs text-warning-600 mt-0.5">
                Weights total {totalWeight}% — should add up to 100%
              </p>
            )}
          </div>
          <button onClick={openAddAssess} className="btn-primary text-sm">
            <Plus className="w-3.5 h-3.5" /> Add Assessment
          </button>
        </div>

        {course.assessments.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No assessments yet"
            description="Add assessments like coursework, tests, and exams with their weights and scores."
          />
        ) : (
          <div className="space-y-2">
            {/* Header row for desktop */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-3 text-xs font-medium text-ink-400 uppercase tracking-wide">
              <div className="col-span-4">Assessment</div>
              <div className="col-span-2 text-center">Weight</div>
              <div className="col-span-3 text-center">Score (Obtained / Total)</div>
              <div className="col-span-2 text-center">Weighted</div>
              <div className="col-span-1"></div>
            </div>
            {course.assessments.map((a) => {
              const weightedPct = a.obtained !== null && a.total > 0 ? (a.obtained / a.total) * 100 : null;
              const weightedScore = a.obtained !== null && a.total > 0 ? (a.obtained / a.total) * a.weight : null;
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center px-3 py-3 rounded-lg hover:bg-ink-50 transition-colors border border-ink-100"
                >
                  <div className="sm:col-span-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-ink-400" />
                    <span className="text-sm font-medium text-ink-900">{a.name}</span>
                  </div>
                  <div className="sm:col-span-2 text-sm text-ink-600 sm:text-center">
                    <span className="sm:hidden text-xs text-ink-400 mr-1">Weight:</span>
                    {a.weight}%
                  </div>
                  <div className="sm:col-span-3 flex items-center gap-2">
                    <input
                      type="number"
                      value={a.obtained ?? ''}
                      onChange={(e) =>
                        updateAssessment(course.id, a.id, {
                          obtained: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      placeholder="0"
                      min="0"
                      max={a.total}
                      className="input py-1.5 text-sm w-24"
                    />
                    <span className="text-sm text-ink-400">/ {a.total}</span>
                  </div>
                  <div className="sm:col-span-2 text-sm sm:text-center">
                    {weightedPct !== null ? (
                      <div className="flex flex-col">
                        <span className={`font-semibold ${
                          getGradeColor(getGradePoint(weightedPct)) === 'success' ? 'text-success-600'
                            : getGradeColor(getGradePoint(weightedPct)) === 'warning' ? 'text-warning-600'
                              : getGradeColor(getGradePoint(weightedPct)) === 'primary' ? 'text-primary-600' : 'text-error-600'
                        }`}>
                          {weightedPct.toFixed(1)}%
                        </span>
                        <span className="text-xs text-ink-400">{weightedScore?.toFixed(1)} pts</span>
                      </div>
                    ) : (
                      <span className="text-ink-300 text-sm">—</span>
                    )}
                  </div>
                  <div className="sm:col-span-1 flex items-center gap-1 justify-end">
                    <button
                      onClick={() => openEditAssess(a)}
                      className="p-1.5 rounded text-ink-300 hover:text-primary-500 hover:bg-primary-50"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteAssessment(course.id, a.id)}
                      className="p-1.5 rounded text-ink-300 hover:text-error-500 hover:bg-error-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div ref={topicsSectionRef} id="course-topics" className="card p-5 scroll-mt-6">
        <button
          type="button"
          onClick={toggleTopics}
          aria-expanded={topicsExpanded}
          aria-controls="course-topics-content"
          className="w-full text-left"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-display font-semibold text-ink-900">
              Topics · {course.topics.length} · {completedTopicCount} done
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-ink-500 transition-transform motion-reduce:transition-none ${topicsExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
          <span
            className="mt-2 block h-1 overflow-hidden rounded-full bg-ink-100"
            role="progressbar"
            aria-label="Course topic completion"
            aria-valuemin={0}
            aria-valuemax={Math.max(course.topics.length, 1)}
            aria-valuenow={completedTopicCount}
            aria-valuetext={`${completedTopicCount} of ${course.topics.length} topics done`}
          >
            <span className="block h-full rounded-full bg-primary-500" style={{ width: `${topicProgress}%` }} />
          </span>
        </button>
        <div id="course-topics-content" hidden={!topicsExpanded} className="pt-4">
          <div className="mb-4">
            <h3 className="font-display font-semibold text-ink-900">Course Topics</h3>
            <p className="text-xs text-ink-500 mt-0.5">Add one topic per line to enter several topics at once.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <textarea
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
              placeholder={'Topic 1\nTopic 2\nTopic 3'}
              className="input min-h-24 resize-y flex-1"
              aria-label="Topics to add"
            />
            <button type="button" onClick={handleAddTopics} className="btn-primary sm:self-end">
              <Plus className="w-3.5 h-3.5" /> Add Topics
            </button>
          </div>
          {course.topics.length > 0 && (
            <div className="mt-4 space-y-2">
              {course.topics.map((topic) => (
                <div key={topic.id} className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={topic.completed}
                    onChange={(event) => updateTopic(course.id, topic.id, { completed: event.target.checked })}
                    className="h-4 w-4 accent-primary-600"
                    aria-label={`Mark ${topic.title} complete`}
                  />
                  <span className={`flex-1 text-sm ${topic.completed ? 'text-ink-400 line-through' : 'text-ink-800'}`}>{topic.title}</span>
                  <button type="button" onClick={() => deleteTopic(course.id, topic.id)} className="p-1.5 text-ink-300 hover:text-error-500" title="Delete topic">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Course resources */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button type="button" onClick={openTopicsAndScroll} className="text-primary-600 hover:text-primary-800 hover:underline">Jump to topics</button>
            <span className="text-ink-300">•</span>
            <button type="button" onClick={openTopicsAndScroll} className="text-primary-600 hover:text-primary-800 hover:underline">View topics</button>
          </div>
          <span className="badge bg-primary-100 text-primary-700">{course.documents.length} file{course.documents.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-semibold text-ink-900">Resource Files</h3>
            <p className="text-xs text-ink-500 mt-0.5">Keep lecture notes, slides, and reference documents with this course.</p>
          </div>
        </div>
        <label
          className={`block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-ink-200 hover:border-primary-300 hover:bg-ink-50'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}
        >
          <Upload className="w-7 h-7 mx-auto text-primary-500 mb-2" />
          <span className="text-sm font-medium text-ink-800">Drop files here or browse</span>
          <span className="block text-xs text-ink-400 mt-1">PDF, DOC, DOCX, PPT, or PPTX</span>
          <input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx" className="sr-only" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ''; }} />
        </label>
        {course.documents.length > 0 && (
          <div className="mt-4 divide-y divide-ink-100">
            {course.documents.map((document) => {
              const Icon = documentIcon(document.fileType);
              return (
                <div key={document.id} className="flex items-center gap-3 py-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${document.fileType === 'pdf' ? 'bg-error-50 text-error-600' : document.fileType.startsWith('ppt') ? 'bg-warning-50 text-warning-600' : 'bg-primary-50 text-primary-600'}`}><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-900 truncate">{document.fileName}</div>
                    <div className="text-xs text-ink-400">{formatFileSize(document.fileSize)} · {new Date(document.uploadDate).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => openDocument(document)} className="p-2 rounded-lg text-ink-400 hover:text-primary-600 hover:bg-primary-50" title="Open with default reader"><ExternalLink className="w-4 h-4" /></button>
                  <a href={document.fileUrl.startsWith('blob:') ? document.fileUrl : undefined} download={document.fileName} onClick={(event) => { if (!document.fileUrl.startsWith('blob:')) { event.preventDefault(); openDocument(document); } }} className="p-2 rounded-lg text-ink-400 hover:text-primary-600 hover:bg-primary-50" title="Download"><Download className="w-4 h-4" /></a>
                  <button onClick={() => removeDocument(document)} className="p-2 rounded-lg text-ink-300 hover:text-error-500 hover:bg-error-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assessment Modal */}
      <Modal
        open={assessModalOpen}
        onClose={() => setAssessModalOpen(false)}
        title={editAssess ? 'Edit Assessment' : 'Add Assessment'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Assessment Name</label>
            <input type="text" value={aName} onChange={(e) => setAName(e.target.value)} placeholder="e.g. Coursework" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Weight (%)</label>
              <input type="number" value={aWeight} onChange={(e) => setAWeight(parseFloat(e.target.value) || 0)} min="0" max="100" className="input" />
            </div>
            <div>
              <label className="label">Total Marks</label>
              <input type="number" value={aTotal} onChange={(e) => setATotal(parseFloat(e.target.value) || 100)} min="1" className="input" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setAssessModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveAssess} className="btn-primary">{editAssess ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      {/* Course Edit Modal */}
      <Modal open={editCourseOpen} onClose={() => setEditCourseOpen(false)} title="Edit Course" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Course Name</label>
            <input type="text" value={cName} onChange={(e) => setCName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Course Code</label>
            <input type="text" value={cCode} onChange={(e) => setCCode(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Credit Units</label>
            <input type="number" value={cCU} onChange={(e) => setCCU(parseInt(e.target.value) || 1)} min="1" max="6" className="input" />
          </div>
          <div>
            <label className="label">Target grade</label>
            <select
              value={cTargetUsesGlobal ? 'global' : String(cTargetGP)}
              onChange={(event) => {
                if (event.target.value === 'global') {
                  setCTargetUsesGlobal(true);
                } else {
                  setCTargetUsesGlobal(false);
                  setCTargetGP(Number(event.target.value));
                }
              }}
              className="input"
            >
              <option value="global">Use global target ({targetSummary(data.settings)})</option>
              {GRADE_SCALE.filter((grade) => grade.label !== 'F').map((grade) => (
                <option key={grade.label} value={grade.gp}>{grade.label} · {grade.gp.toFixed(1)} GP ({grade.minPercent}%)</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-500">Existing courses without an individual override follow the global target.</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setEditCourseOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveCourse} className="btn-primary">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
