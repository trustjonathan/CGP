import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  BookOpen,
  Award,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Clock3,
  X,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useAppData } from '@/lib/useAppData';
import {
  cgpa,
  semesterGPA,
  formatGPA,
  totalCompletedCredits,
  totalCredits,
  TARGET_CGPA,
  getGradeLabel,
  getGradeColor,
  type CourseUnit,
} from '@/lib/types';
import { getGapToTarget } from '@/lib/forecast';
import { ProgressRing, StatCard, GradeBadge, ProgressBar, EmptyState } from '@/components/ui';
import { useAuth } from '@/contexts/useAuth';
import { readOnboardingState, saveOnboardingState } from '@/lib/localSync';
import { getSetupCompleteness, shouldShowSetupReminder, type OnboardingLocalState, type SetupReminderState } from '@/lib/onboarding';

const emptyReminder: SetupReminderState = { lastShownAt: null, snoozedUntil: null, dismissals: 0, notificationsEnabled: false };

export function DashboardPage() {
  const { data, loadSampleData } = useAppData();
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reminder, setReminder] = useState<SetupReminderState>(emptyReminder);
  const [reminderReady, setReminderReady] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const completeness = getSetupCompleteness(data);
  const showSetupReminder = reminderReady && Boolean(completeness.nextStep) && shouldShowSetupReminder(reminder);

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    void readOnboardingState(user.id).then((state) => {
      if (!active) return;
      setReminder(state?.reminder ?? emptyReminder);
      setReminderReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to load local CGP setup reminder state.', error);
      setReminderReady(true);
      setReminderError('Setup reminder preferences could not be loaded.');
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!showSetupReminder || !user?.id) return;
    const today = new Date().toDateString();
    if (reminder.lastShownAt && new Date(reminder.lastShownAt).toDateString() === today) return;
    if (reminder.notificationsEnabled && window.desktopApp && window.Notification?.permission === 'granted' && completeness.nextStep) {
      new window.Notification('CGP setup reminder', { body: completeness.nextStep.label, tag: 'cgp-setup-reminder' });
    }
    const next = { ...reminder, lastShownAt: Date.now() };
    setReminder(next);
    void persistReminder(user.id, next, reminder).catch((error: unknown) => {
      console.error('Unable to save the setup reminder date.', error);
      setReminderError('Setup reminder preferences could not be saved.');
    });
  }, [completeness.nextStep, reminder, showSetupReminder, user?.id]);

  const snoozeReminder = async () => {
    if (!user?.id) return;
    const next = { ...reminder, snoozedUntil: Date.now() + 24 * 60 * 60 * 1000 };
    setReminder(next);
    try {
      await persistReminder(user.id, next, reminder);
      setReminderError('');
    } catch (error) {
      console.error('Unable to snooze the CGP setup reminder.', error);
      setReminderError('The reminder could not be snoozed on this device.');
    }
  };

  const dismissReminder = async () => {
    if (!user?.id) return;
    const next = { ...reminder, dismissals: reminder.dismissals + 1, snoozedUntil: Date.now() + 24 * 60 * 60 * 1000 };
    setReminder(next);
    try {
      await persistReminder(user.id, next, reminder);
      setReminderError('');
    } catch (error) {
      console.error('Unable to dismiss the CGP setup reminder.', error);
      setReminderError('The reminder could not be dismissed on this device.');
    }
  };
  const currentCGPA = cgpa(data.courses);
  const targetIsSet = data.settings.targetSet !== false;
  const targetCGPA = targetIsSet ? data.settings.targetCGPA : TARGET_CGPA;
  const completedCU = totalCompletedCredits(data.courses);
  const totalCU = totalCredits(data.courses);
  const gap = getGapToTarget(currentCGPA, targetCGPA);

  const semestersWithGPA = data.semesters
    .map((s) => ({
      ...s,
      gpa: semesterGPA(data.courses, s.id),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);

  const chartData = semestersWithGPA.map((s) => ({
    name: `Y${s.academicYear.split('/')[0].slice(-2)} S${s.semesterNumber}`,
    gpa: s.gpa,
  }));

  const cumulativeData: { name: string; cgpa: number | null }[] = [];
  let runningCourses: CourseUnit[] = [];
  for (const s of semestersWithGPA) {
    runningCourses = runningCourses.concat(
      data.courses.filter((c) => c.semesterId === s.id)
    );
    cumulativeData.push({
      name: `Y${s.academicYear.split('/')[0].slice(-2)} S${s.semesterNumber}`,
      cgpa: cgpa(runningCourses),
    });
  }

  const hasData = data.semesters.length > 0;
  const ringColor = gap.status === 'on-track' ? '#16a34a' : gap.status === 'behind' ? '#f59e0b' : '#2563eb';

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const result = await window.desktopApp?.refreshApp();
    if (result?.installerLaunched) {
      window.setTimeout(() => window.close(), 750);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="text-ink-500 text-sm">Track your academic performance in real time</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary relative overflow-hidden"
            title="Reload the latest app changes while preserving saved data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {!hasData && (
            <button onClick={loadSampleData} className="btn-secondary">
              <Sparkles className="w-4 h-4" />
              Load Sample Data
            </button>
          )}
        </div>
      </div>
      {isRefreshing && (
        <div className="h-1 overflow-hidden rounded-full bg-primary-100" role="status" aria-label="Refreshing application">
          <div className="h-full w-1/3 rounded-full bg-primary-600 animate-refresh-line" />
        </div>
      )}

      {showSetupReminder && completeness.nextStep && (
        <section className="card flex flex-col gap-4 border-primary-200 bg-primary-50/60 p-4 sm:flex-row sm:items-center sm:p-5" aria-labelledby="setup-reminder-title">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-primary-700"><Clock3 className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0">
              <h2 id="setup-reminder-title" className="font-display font-bold text-ink-900">
                {data.settings.onboardingCompleted ? `Setup ${completeness.percentage}% complete` : 'Finish setting up'}
              </h2>
              <p className="mt-1 text-sm leading-5 text-ink-600">Next: {completeness.nextStep.label}</p>
              {reminderError && <p role="status" className="mt-1 text-xs text-error-700">{reminderError}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link to={completeness.nextStep.to} className="btn-primary">Continue setup</Link>
            <button type="button" className="btn-secondary" onClick={() => void snoozeReminder()}>Snooze 1 day</button>
            <button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-white hover:text-ink-800" aria-label="Dismiss setup reminder" onClick={() => void dismissReminder()}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {!hasData ? (
        <EmptyState
          icon={BookOpen}
          title="No academic data yet"
          description="Start by adding your first semester and course units to track your GPA and get predictive insights."
          action={
            <Link to="/semesters" className="btn-primary">
              Add Your First Semester
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        />
      ) : (
        <>
          {/* Top row: CGPA ring + stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* CGPA Ring card */}
            <div className="card p-6 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 text-ink-500 text-sm mb-3">
                <Target className="w-4 h-4" />
                <span className="font-medium">Current CGPA</span>
              </div>
              <ProgressRing
                value={currentCGPA}
                max={5}
                size={160}
                stroke={12}
                label="out of 5.0"
                color={ringColor}
              />
              <div className="mt-4 flex items-center gap-2">
                {!targetIsSet && (
                  <span className="badge bg-ink-100 text-ink-600">No target set</span>
                )}
                {targetIsSet && gap.status === 'on-track' && (
                  <span className="badge bg-success-100 text-success-700">
                    <TrendingUp className="w-3 h-3" />
                    On Track
                  </span>
                )}
                {targetIsSet && gap.status === 'behind' && (
                  <span className="badge bg-warning-100 text-warning-700">
                    <TrendingDown className="w-3 h-3" />
                    {gap.gap.toFixed(2)} below target
                  </span>
                )}
                {gap.status === 'no-data' && (
                  <span className="badge bg-ink-100 text-ink-600">
                    No grades yet
                  </span>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-4">
              <StatCard
                label="Target CGPA"
                value={targetIsSet ? targetCGPA.toFixed(2) : '--'}
                icon={Target}
                color="accent"
                hint={targetIsSet ? 'Your goal' : 'Set a goal when ready'}
              />
              <StatCard
                label="Completed Credits"
                value={completedCU}
                icon={Award}
                color="success"
                hint={`out of ${totalCU} total`}
              />
              <StatCard
                label="Active Courses"
                value={data.courses.length}
                icon={BookOpen}
                color="primary"
                hint={`${data.semesters.length} semester${data.semesters.length !== 1 ? 's' : ''}`}
              />
              <StatCard
                label="Gap to Target"
                value={!targetIsSet || currentCGPA === null ? '--' : gap.gap.toFixed(2)}
                icon={gap.status === 'on-track' ? TrendingUp : TrendingDown}
                color={gap.status === 'on-track' ? 'success' : 'warning'}
                hint={!targetIsSet ? 'Set a target first' : gap.status === 'on-track' ? 'Above target!' : 'Points to close'}
              />
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Semester GPA trend */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-ink-900 mb-1">
                Semester GPA Trend
              </h3>
              <p className="text-xs text-ink-500 mb-4">GPA per semester vs target line</p>
              {chartData.length === 0 || chartData.every((d) => d.gpa === null) ? (
                <div className="h-64 flex items-center justify-center text-ink-400 text-sm">
                  No graded semesters yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                      formatter={(v) => [formatGPA(typeof v === 'number' ? v : null), 'GPA']}
                    />
                    {targetIsSet && <ReferenceLine y={targetCGPA} stroke="#d946ef" strokeDasharray="5 5" label={{ value: 'Target', fontSize: 10, fill: '#a21caf' }} />}
                    <Line
                      type="monotone"
                      dataKey="gpa"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#2563eb' }}
                      activeDot={{ r: 7 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Cumulative CGPA progress */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-ink-900 mb-1">
                Cumulative CGPA Progress
              </h3>
              <p className="text-xs text-ink-500 mb-4">How your CGPA has evolved over time</p>
              {cumulativeData.length === 0 || cumulativeData.every((d) => d.cgpa === null) ? (
                <div className="h-64 flex items-center justify-center text-ink-400 text-sm">
                  No graded data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cumulativeData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                      formatter={(v) => [formatGPA(typeof v === 'number' ? v : null), 'CGPA']}
                    />
                    {targetIsSet && <ReferenceLine y={targetCGPA} stroke="#d946ef" strokeDasharray="5 5" />}
                    <Line
                      type="monotone"
                      dataKey="cgpa"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#16a34a' }}
                      activeDot={{ r: 7 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent courses */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-ink-900">Recent Courses</h3>
              <Link to="/semesters" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {data.courses.slice(0, 5).map((course) => {
                const pct = courseAggregatePercent(course);
                const gp = courseCurrentGP(course);
                return (
                  <Link
                    key={course.id}
                    to={`/course/${course.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-ink-50 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-5 h-5 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-900 text-sm truncate">{course.name}</span>
                        <span className="text-xs text-ink-400 font-mono">{course.code}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {pct !== null ? (
                          <>
                            <ProgressBar value={pct} color={getGradeColor(gp ?? 0) === 'success' ? 'success' : getGradeColor(gp ?? 0) === 'warning' ? 'warning' : 'primary'} height="h-1.5" />
                            <span className="text-xs text-ink-500 font-medium flex-shrink-0">{pct.toFixed(1)}%</span>
                          </>
                        ) : (
                          <span className="text-xs text-ink-400">No scores entered yet</span>
                        )}
                      </div>
                    </div>
                    {gp !== null && <GradeBadge gp={gp} label={getGradeLabel(pct!)} />}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Re-import locally used helpers
import { courseAggregatePercent, courseCurrentGP } from '@/lib/types';

async function persistReminder(userId: string, reminder: SetupReminderState, previous: SetupReminderState) {
  const state = await readOnboardingState(userId);
  const nextState: Omit<OnboardingLocalState, 'user_id' | 'updated_at'> = {
    draft: state?.draft ?? null,
    metrics: state?.metrics ?? { stepReached: {}, stepSkipped: {}, completed: 0, timeToFirstCgpaMs: null },
    reminder: { ...previous, ...reminder },
  };
  await saveOnboardingState(userId, nextState);
}
