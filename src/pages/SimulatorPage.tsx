import { useState, useMemo, useCallback } from 'react';
import {
  SlidersHorizontal,
  TrendingUp,
  Zap,
  RotateCcw,
  Info,
  BarChart3,
  Target,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
} from 'recharts';
import { useAppData } from '@/lib/useAppData';
import {
  cgpa,
  semesterGPA,
  courseAggregatePercent,
  getGradeLabel,
  getGradeColor,
  MAX_GRADE_POINT,
  formatGPA,
} from '@/lib/types';
import { formatPoints, runWhatIf } from '@/lib/forecast';
import { targetPercentForCourse, targetPercentForSettings, targetSummary } from '@/lib/gradingConfig';
import { ProgressBar, EmptyState } from '@/components/ui';

export function SimulatorPage() {
  const { data } = useAppData();
  const targetCGPA = data.settings.targetCGPA;
  const targetPercent = targetPercentForSettings(data.settings);
  const targetLabel = targetSummary(data.settings);
  const [projectedScores, setProjectedScores] = useState<Record<string, number>>({});
  const [globalScore, setGlobalScore] = useState<number | null>(null);
  const effectiveGlobalScore = globalScore ?? targetPercent;
  const courseTargetPercents = useMemo(() => Object.fromEntries(
    data.courses.map((course) => [course.id, targetPercentForCourse(course, data.settings)]),
  ), [data.courses, data.settings]);
  const defaultScores = courseTargetPercents;

  const currentCGPA = cgpa(data.courses);

  const hasUngraded = useMemo(() => {
    return data.courses.some((c) => {
      const pct = courseAggregatePercent(c);
      return pct === null && c.assessments.length > 0;
    });
  }, [data.courses]);

  const result = useMemo(
    () => runWhatIf(data.courses, projectedScores, defaultScores, courseTargetPercents),
    [data.courses, courseTargetPercents, defaultScores, projectedScores]
  );

  const scenarioData = useMemo(() => [...new Set([0, 20, 40, 60, 70, targetPercent, 90, 100])]
    .sort((a, b) => a - b).map((score) => ({
    score,
    cgpa: runWhatIf(data.courses, Object.fromEntries(
      data.courses
        .filter((course) => courseAggregatePercent(course) === null)
        .map((course) => [course.id, score])
    ), defaultScores, courseTargetPercents).projectedCGPA,
  })), [data.courses, courseTargetPercents, defaultScores, targetPercent]);

  const setScore = useCallback((courseId: string, score: number) => {
    setProjectedScores((prev) => ({ ...prev, [courseId]: score }));
  }, []);

  const applyGlobal = useCallback(() => {
    const updates: Record<string, number> = {};
    for (const c of data.courses) {
      const pct = courseAggregatePercent(c);
      if (pct === null) {
        updates[c.id] = effectiveGlobalScore;
      }
    }
    setProjectedScores(updates);
  }, [data.courses, effectiveGlobalScore]);

  const reset = useCallback(() => {
    setProjectedScores({});
    setGlobalScore(null);
  }, []);

  if (data.courses.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">What-If Simulator</h1>
          <p className="text-ink-500 text-sm">Project your CGPA based on estimated final exam scores</p>
        </div>
        <EmptyState
          icon={SlidersHorizontal}
          title="No courses to simulate"
          description="Add courses with assessments to use the What-If simulator."
        />
      </div>
    );
  }

  const gapToTarget = targetCGPA - result.projectedCGPA;
  const meetsTarget = result.projectedCGPA >= targetCGPA;
  const projectedGradeColor = getGradeColor(result.projectedCGPA);
  const projectedRingColor = meetsTarget ? '#16a34a'
    : projectedGradeColor === 'primary' ? '#2563eb'
      : projectedGradeColor === 'warning' ? '#f59e0b' : '#ef4444';

  // Chart data for projected GP per course
  const chartData = result.courseProjections
    .map((cp) => {
      const course = data.courses.find((item) => item.id === cp.courseId)!;
      const currentPercent = courseAggregatePercent(course);
      return {
      courseId: cp.courseId,
      name: cp.code || cp.courseName.slice(0, 10),
      fullName: cp.courseName,
      current: currentPercent,
      gp: cp.projectedGP,
      grade: cp.gradeLabel,
      percent: cp.projectedPercent,
      isProjected: currentPercent === null,
      projectedScore: projectedScores[course.id] ?? defaultScores[course.id],
    };
    });

  const semesterData = result.projectedSemesterGPAs.map((semester) => {
    const label = data.semesters.find((item) => item.id === semester.semesterId);
    return {
      name: label ? `S${label.semesterNumber}` : 'Semester',
      projected: semester.gpa,
      current: label ? semesterGPA(data.courses, label.id) : null,
    };
  });

  const projectedCourses = chartData.filter((course) => course.isProjected);
  const averageProjectedScore = projectedCourses.length
    ? projectedCourses.reduce((sum, course) => sum + course.projectedScore, 0) / projectedCourses.length
    : null;
  const highestScenario = scenarioData[scenarioData.length - 1].cgpa;
  const lowestScenario = scenarioData[0].cgpa;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">What-If Simulator</h1>
        <p className="text-ink-500 text-sm">
          Adjust projected final exam scores to see how your CGPA would change
        </p>
      </div>

      {!hasUngraded && (
        <div className="card p-4 flex items-start gap-3 bg-primary-50/50 border-primary-200">
          <Info className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-700">
            All your courses have complete scores. The simulator shows your final CGPA.
            Add courses with unscored assessments to see projections.
          </div>
        </div>
      )}

      {/* Projected CGPA display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-6 flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 text-ink-500 text-sm mb-3">
            <Zap className="w-4 h-4" />
            <span className="font-medium">Projected CGPA</span>
          </div>
          <div className="relative inline-flex items-center justify-center w-[160px] h-[160px]">
            <svg width={160} height={160} className="-rotate-90">
              <circle cx={80} cy={80} r={70} fill="none" stroke="#e2e8f0" strokeWidth={12} />
              <circle
                cx={80}
                cy={80}
                r={70}
                fill="none"
                stroke={projectedRingColor}
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 70}
                strokeDashoffset={2 * Math.PI * 70 * (1 - Math.min(1, result.projectedCGPA / MAX_GRADE_POINT))}
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display font-bold text-3xl text-ink-900">
                {result.projectedCGPA.toFixed(2)}
              </span>
              <span className="text-xs text-ink-500">out of {MAX_GRADE_POINT.toFixed(1)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {meetsTarget ? (
              <span className="badge bg-success-100 text-success-700">
                <TrendingUp className="w-3 h-3" /> Meets target!
              </span>
            ) : (
              <span className="badge bg-warning-100 text-warning-700">
                {Math.abs(gapToTarget).toFixed(2)} {gapToTarget > 0 ? 'below' : 'above'} target
              </span>
            )}
          </div>
        </div>

        {/* Current vs projected comparison */}
        <div className="lg:col-span-2 card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-4">Current vs Projected</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink-600">Current CGPA (graded only)</span>
                <span className="font-display font-bold text-lg text-ink-900">
                  {formatGPA(currentCGPA)}
                </span>
              </div>
              <ProgressBar value={currentCGPA ?? 0} max={MAX_GRADE_POINT} color="primary" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink-600">Projected CGPA (with estimates)</span>
                <span className="font-display font-bold text-lg" style={{ color: projectedRingColor }}>
                  {result.projectedCGPA.toFixed(2)}
                </span>
              </div>
              <ProgressBar value={result.projectedCGPA} max={MAX_GRADE_POINT} color={meetsTarget ? 'success' : 'warning'} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink-600">Target CGPA</span>
                <span className="font-display font-bold text-lg text-accent-600">
                  {targetCGPA.toFixed(2)}
                </span>
              </div>
              <ProgressBar value={targetCGPA} max={MAX_GRADE_POINT} color="accent" />
              <p className="mt-1 text-xs text-ink-500">Course target: {targetLabel} ({targetPercent}%)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display font-semibold text-ink-900">CGPA sensitivity curve</h3>
              <p className="text-xs text-ink-500 mt-1">Projected CGPA when every unfinished assessment receives the same score</p>
            </div>
            <BarChart3 className="w-5 h-5 text-primary-500 flex-shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={scenarioData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="score" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, MAX_GRADE_POINT]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : '--', 'Projected CGPA']}
                labelFormatter={(label) => `Unfinished assessment score: ${label}%`}
              />
              <ReferenceLine y={targetCGPA} stroke="#d946ef" strokeDasharray="5 5" label={{ value: 'Target', fontSize: 10, fill: '#a21caf' }} />
              <Line type="monotone" dataKey="cgpa" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-accent-500" />
            <h3 className="font-display font-semibold text-ink-900">Scenario range</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-ink-500">At 0% on unfinished work</div>
              <div className="font-display text-2xl font-bold text-error-600">{lowestScenario.toFixed(2)}</div>
            </div>
            <div className="border-t border-ink-100 pt-4">
              <div className="text-xs text-ink-500">At 100% on unfinished work</div>
              <div className="font-display text-2xl font-bold text-success-600">{highestScenario.toFixed(2)}</div>
            </div>
            <div className="border-t border-ink-100 pt-4">
              <div className="text-xs text-ink-500">Current working assumption</div>
              <div className="font-display text-2xl font-bold text-primary-600">{averageProjectedScore === null ? '--' : `${averageProjectedScore.toFixed(0)}%`}</div>
              <p className="text-xs text-ink-500 mt-1">Average of editable unfinished-course estimates</p>
            </div>
          </div>
        </div>
      </div>

      {semesterData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-1">Semester impact</h3>
          <p className="text-xs text-ink-500 mb-4">Completed semester results compared with the current projection</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={semesterData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, MAX_GRADE_POINT]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : '--', name === 'current' ? 'Current GPA' : 'Projected GPA']}
              />
              <Legend />
              <Bar dataKey="current" name="Current GPA" fill="#94a3b8" radius={[5, 5, 0, 0]} />
              <Bar dataKey="projected" name="Projected GPA" fill="#2563eb" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Global slider + apply */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="label flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-ink-400" />
              Global projected score for all unscored courses
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                value={effectiveGlobalScore}
                onChange={(e) => setGlobalScore(parseInt(e.target.value))}
                className="flex-1 accent-primary-600"
              />
              <span className="font-mono font-bold text-lg text-ink-900 w-16 text-right">
                {effectiveGlobalScore}%
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={applyGlobal} className="btn-primary">
              <Zap className="w-4 h-4" /> Apply to All
            </button>
            <button onClick={reset} className="btn-secondary">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Per-course sliders */}
      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-4">
          Per-Course Score Projection
        </h3>
        <p className="text-xs text-ink-500 mb-4">
          Adjust the estimated final exam score for each course with unscored assessments
        </p>
        <div className="space-y-4">
          {data.courses.map((course) => {
            const pct = courseAggregatePercent(course);
            const projection = result.courseProjections.find((cp) => cp.courseId === course.id);
            const score = projectedScores[course.id] ?? defaultScores[course.id];
            const isUngraded = pct === null;
            const remainingWeight = course.assessments
              .filter((assessment) => assessment.weight > 0 && (assessment.obtained === null || assessment.total <= 0))
              .reduce((sum, assessment) => sum + assessment.weight, 0);
            return (
              <div key={course.id} className={`p-4 rounded-lg border ${isUngraded ? 'border-primary-200 bg-primary-50/30' : 'border-ink-100 bg-ink-50/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900 truncate">{course.name}</span>
                      <span className="text-xs text-ink-400 font-mono">{course.code}</span>
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {course.creditUnits} CU · {isUngraded ? `${remainingWeight}% of course weight still open` : `Current: ${pct?.toFixed(1)}% (${getGradeLabel(pct!)})`}
                    </div>
                  </div>
                  {projection && isUngraded && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-ink-900">{projection.projectedPercent.toFixed(1)}%</span>
                      <span className={`badge ${
                        getGradeColor(projection.projectedGP) === 'success' ? 'bg-success-100 text-success-700' :
                        getGradeColor(projection.projectedGP) === 'primary' ? 'bg-primary-100 text-primary-700' :
                        getGradeColor(projection.projectedGP) === 'warning' ? 'bg-warning-100 text-warning-700' :
                        'bg-error-100 text-error-700'
                      }`}>
                        {projection.gradeLabel} ({projection.projectedGP.toFixed(1)})
                      </span>
                    </div>
                  )}
                </div>
                {isUngraded && (
                  <>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={score}
                        onChange={(e) => setScore(course.id, parseInt(e.target.value))}
                        className="flex-1 accent-primary-600"
                      />
                      <span className="font-mono font-semibold text-sm text-ink-700 w-12 text-right">
                        {score}%
                      </span>
                    </div>
                    {projection?.forecast.hasRemaining && (
                      <div className="mt-3 space-y-2 text-xs">
                        <p className="text-ink-600">
                          Target {projection.forecast.targetPercent}%: {formatPoints(projection.forecast.requiredPoints)} of {formatPoints(projection.forecast.remainingWeight)} points needed; {projection.forecast.requiredPercent?.toFixed(1) ?? '--'}% on remaining work.
                          {' '}{projection.forecast.status === 'not reachable'
                            ? `Not reachable; best is ${projection.forecast.bestReachableGrade} (${projection.forecast.bestReachablePercent.toFixed(1)}%).`
                            : projection.forecast.status === 'already secured' ? 'Already secured.' : 'On track.'}
                        </p>
                        {projection.forecast.assessmentRequirements.length > 1 && (
                          <ul className="space-y-1 text-ink-500">
                            {projection.forecast.assessmentRequirements.map((assessment) => (
                              <li key={assessment.assessmentId}>
                                {assessment.name}: {assessment.requiredPercent?.toFixed(1) ?? '--'}% ({formatPoints(assessment.requiredPoints)} of {formatPoints(assessment.total)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Projected GP bar chart */}
      {chartData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-1">Course outcome analysis</h3>
          <p className="text-xs text-ink-500 mb-4">Projected grade points across all courses; completed scores remain unchanged</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, MAX_GRADE_POINT]} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v, _name, props) => {
                  const numericValue = typeof v === 'number' ? v : 0;
                  const payload = props && 'payload' in props ? props.payload as { grade?: string; percent?: number } : undefined;
                  return [`${numericValue.toFixed(2)} GP (${payload?.grade ?? ''})`, `${(payload?.percent ?? 0).toFixed(1)}%`];
                }}
              />
              <ReferenceLine y={targetCGPA} stroke="#d946ef" strokeDasharray="4 4" />
              <Bar dataKey="gp" radius={[6, 6, 0, 0]} maxBarSize={50}>
                {chartData.map((d, i) => {
                  const gradeColor = getGradeColor(d.gp);
                  const fill = gradeColor === 'success' ? '#16a34a'
                    : gradeColor === 'primary' ? '#2563eb'
                      : gradeColor === 'warning' ? '#f59e0b' : '#ef4444';
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
