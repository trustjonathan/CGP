import { useReducedMotion } from 'motion/react';
import { NumberTicker } from '@/components/ui/magicui/number-ticker';

interface CountUpProps {
  value: number;
  decimalPlaces?: number;
  className?: string;
}

export function CountUp({ value, decimalPlaces = 0, className }: CountUpProps) {
  const reducedMotion = useReducedMotion();
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);

  if (reducedMotion) return <span className={className}>{formattedValue}</span>;

  return <NumberTicker value={value} decimalPlaces={decimalPlaces} className={className} />;
}
