import { getGradeColor } from '@/lib/types';

export function GradeBadge({ gp, label }: { gp: number; label?: string }) {
  const color = getGradeColor(gp);
  const colorMap: Record<string, string> = {
    success: 'bg-success-100 text-success-700',
    primary: 'bg-primary-100 text-primary-700',
    secondary: 'bg-accent-100 text-accent-700',
    warning: 'bg-warning-100 text-warning-700',
    error: 'bg-error-100 text-error-700',
  };
  return (
    <span className={`badge ${colorMap[color]}`}>
      {label || `GP ${gp.toFixed(1)}`}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  color = 'primary',
  height = 'h-2.5',
}: {
  value: number;
  max?: number;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'accent';
  height?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    accent: 'bg-accent-500',
  };
  return (
    <div className={`w-full ${height} bg-ink-100 rounded-full overflow-hidden`}>
      <div
        className={`h-full ${colorMap[color]} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  max = 5,
  size = 120,
  stroke = 10,
  label,
  sublabel,
  color = '#2563eb',
}: {
  value: number | null;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayValue = value ?? 0;
  const pct = Math.min(1, Math.max(0, displayValue / max));
  const dashoffset = circumference * (1 - pct);
  const isNull = value === null;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        {!isNull && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className="transition-all duration-700 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-2xl text-ink-900">
          {isNull ? '--' : displayValue.toFixed(2)}
        </span>
        {label && <span className="text-xs text-ink-500 font-medium">{label}</span>}
        {sublabel && <span className="text-[10px] text-ink-400">{sublabel}</span>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  color = 'primary',
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'accent';
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    error: 'bg-error-50 text-error-600',
    accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-xl text-ink-900 truncate">{value}</div>
          <div className="text-xs text-ink-500">{label}</div>
          {hint && <div className="text-xs text-ink-400 mt-0.5">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-10 text-center">
      <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-ink-400" />
      </div>
      <h3 className="font-display font-semibold text-ink-900 mb-1">{title}</h3>
      <p className="text-ink-500 text-sm mb-4 max-w-sm mx-auto">{description}</p>
      {action}
    </div>
  );
}
