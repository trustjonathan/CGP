import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { BlurFade } from '@/components/ui/magicui/blur-fade';

interface StepTransitionProps {
  step: number;
  children: ReactNode;
  className?: string;
}

export function StepTransition({ step, children, className }: StepTransitionProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className={className}>{children}</div>;

  return (
    <BlurFade key={step} className={className} duration={0.24} offset={8}>
      {children}
    </BlurFade>
  );
}
