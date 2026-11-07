import { useReducedMotion } from 'motion/react';
import { AnimatedCircularProgressBar } from '@/components/ui/magicui/animated-circular-progress-bar';

interface AnimatedProgressRingProps {
  value: number;
  label?: string;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export function AnimatedProgressRing({ value, label = 'Preview progress' }: AnimatedProgressRingProps) {
  const reducedMotion = useReducedMotion();
  const percent = clampPercent(value);
  const accessibleLabel = `${label}: ${percent}%`;

  if (reducedMotion) {
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-primary-100 text-lg font-semibold text-primary-700"
      >
        {percent}%
      </div>
    );
  }

  return (
    <div role="img" aria-label={accessibleLabel}>
      <AnimatedCircularProgressBar
        min={0}
        max={100}
        value={percent}
        gaugePrimaryColor="#2563eb"
        gaugeSecondaryColor="#dbeafe"
        className="size-24 text-lg"
      />
    </div>
  );
}
