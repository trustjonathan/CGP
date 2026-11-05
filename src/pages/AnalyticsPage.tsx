import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  BookOpen,
  Target,
  Award,
} from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
  cgpa,
  semesterGPA,
  courseAggregatePercent,
  courseCurrentGP,
  getGradeLabel,
  getGradeColor,
  formatGPA,
  totalCompletedCredits,
  TARGET_CGPA,
} from '@/lib/types';
import { ProgressRing, ProgressBar, StatCard, EmptyState } from '@/components/ui';

export function AnalyticsPage() {
  const { data } = useAppData();
  const currentCGPA = cgpa(data.courses);
  const hasData = data.courses.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
          <p className="text-ink-500 text-sm">Visualize your academic performance trends</p>
        </div>
        <EmptyState
          icon={TrendingUp}
          title="No data to analyze yet"
          description="Add semesters and courses with assessment scores to see your analytics."
        />
      </div>
    );
  }

  // Semester GPA bar chart data
  const semesterData = data.semesters
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({
      name: `S${s.semesterNumber} ${s.academicYear.split('/')[0].slice(-2)}`,
      gpa: semesterGPA(data.courses, s.id),
      credits: data.courses
        .filter((c) => c.semesterId === s.id)
        .reduce((sum, c) => sum + c.creditUnits, 0),
    }))
    .filter((d) => d.gpa !== null);

  // Course breakdown data
  const courseData = data.courses
    .map((c) => ({
      name: c.code || c.name.slice(0, 12),
      fullName: c.name,
      percent: courseAggregatePercent(c),
      gp: courseCurrentGP(c),
      cu: c.creditUnits,
    }))
    .filter((d) => d.percent !== null)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));

  const barColors = ['#16a34a', '#2563eb', '#d946ef', '#f59e0b', '#ef4444'];
  const ringColor =
    currentCGPA === null ? '#94a3b8'
    : currentCGPA >= TARGET_CGPA ? '#16a34a'
    : currentCGPA >= 4.0 ? '#2563eb'
    : '#f59e0b';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
        <p className="text-ink-500 text-sm">Visualize your academic performance trends</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current CGPA"
          value={formatGPA(currentCGPA)}
          icon={Target}
          color={currentCGPA !== null && currentCGPA >= TARGET_CGPA ? 'success' : 'primary'}
        />
        <StatCard
          label="Target CGPA"
          value={TARGET_CGPA.toFixed(2)}
          icon={Award}
          color="accent"
        />
        <StatCard
          label="Courses Graded"
          value={courseData.length}
          icon={BookOpen}
          color="primary"
          hint={`of ${data.courses.length} total`}
        />
        <StatCard
          label="Credits Earned"
          value={totalCompletedCredits(data.courses)}
          icon={TrendingUp}
          color="success"
        />
      </div>

      {/* Semester GPA bar chart */}
      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-1">Semester GPA Comparison</h3>
        <p className="text-xs text-ink-500 mb-4">GPA by semester with target reference line</p>
        {semesterData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-ink-400 text-sm">
            No graded semesters yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={semesterData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [formatGPA(typeof v === 'number' ? v : null), 'GPA']}
              />
              <ReferenceLine y={5} stroke="#d946ef" strokeDasharray="5 5" />
              <Bar dataKey="gpa" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {semesterData.map((_, i) => (
                  <Cell key={i} fill={barColors[i % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* CGPA Ring + Course breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CGPA Ring */}
        <div className="card p-6 flex flex-col items-center justify-center">
          <h3 className="font-display font-semibold text-ink-900 mb-4">Overall CGPA</h3>
          <ProgressRing value={currentCGPA} max={5} size={140} stroke={12} label="out of 5.0" color={ringColor} />
          <div className="mt-4 text-center">
            {currentCGPA !== null && (
              <>
                <div className="text-sm text-ink-500">
                  {currentCGPA >= TARGET_CGPA ? (
                    <span className="text-success-600 font-medium flex items-center gap-1 justify-center">
                      <TrendingUp className="w-4 h-4" /> Meeting your target!
                    </span>
                  ) : (
                    <span className="text-warning-600 font-medium">
                      {(TARGET_CGPA - currentCGPA).toFixed(2)} points from target
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Course breakdown progress bars */}
        <div className="lg:col-span-2 card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-1">Course Performance Breakdown</h3>
          <p className="text-xs text-ink-500 mb-4">Current aggregate score and grade per course</p>
          {courseData.length === 0 ? (
            <div className="py-8 text-center text-ink-400 text-sm">No graded courses yet</div>
          ) : (
            <div className="space-y-3">
              {courseData.map((c, i) => {
                const color = getGradeColor(c.gp ?? 0);
                const barColor = color === 'success' ? 'success' : color === 'primary' ? 'primary' : color === 'warning' ? 'warning' : 'error';
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-ink-800 truncate">{c.fullName}</span>
                        <span className="text-xs text-ink-400 font-mono flex-shrink-0">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-ink-900">{c.percent?.toFixed(1)}%</span>
                        <span className={`badge ${
                          color === 'success' ? 'bg-success-100 text-success-700' :
                          color === 'primary' ? 'bg-primary-100 text-primary-700' :
                          color === 'warning' ? 'bg-warning-100 text-warning-700' :
                          'bg-error-100 text-error-700'
                        }`}>
                          {getGradeLabel(c.percent!)}
                        </span>
                      </div>
                    </div>
                    <ProgressBar value={c.percent ?? 0} color={barColor as 'success' | 'primary' | 'warning' | 'error'} height="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grade distribution */}
      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-1">Score Distribution by Course</h3>
        <p className="text-xs text-ink-500 mb-4">Aggregate percentage per course unit</p>
        {courseData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-ink-400 text-sm">No graded courses yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={courseData}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={70}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [`${typeof v === 'number' ? v.toFixed(1) : '0.0'}%`, 'Score']}
              />
              <ReferenceLine x={80} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'A (80%)', fontSize: 10, fill: '#16a34a', position: 'top' }} />
              <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {courseData.map((d, i) => {
                  const pct = d.percent ?? 0;
                  const fill = pct >= 80 ? '#16a34a' : pct >= 60 ? '#2563eb' : pct >= 50 ? '#f59e0b' : '#ef4444';
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
