import { lazy, Suspense } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';

const NumberTicker = lazy(() =>
  import('@/components/ui/magicui/number-ticker').then((module) => ({ default: module.NumberTicker })),
);

interface CountUpProps {
  value: number;
  decimalPlaces?: number;
  className?: string;
}

export function CountUp({ value, decimalPlaces = 0, className }: CountUpProps) {
  const reducedMotion = useReducedMotionPreference();
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);

  if (reducedMotion) return <span className={className}>{formattedValue}</span>;

  return (
    <Suspense fallback={<span className={className}>{formattedValue}</span>}>
      <NumberTicker value={value} decimalPlaces={decimalPlaces} className={className} />
    </Suspense>
  );
}
