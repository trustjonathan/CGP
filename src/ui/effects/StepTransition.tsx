import { lazy, Suspense, type ReactNode } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';

const BlurFade = lazy(() =>
  import('@/components/ui/magicui/blur-fade').then((module) => ({ default: module.BlurFade })),
);

interface StepTransitionProps {
  step: number;
  children: ReactNode;
  className?: string;
}

export function StepTransition({ step, children, className }: StepTransitionProps) {
  const reducedMotion = useReducedMotionPreference();
  if (reducedMotion) return <div className={className}>{children}</div>;

  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <BlurFade key={step} className={className} duration={0.24} offset={8}>
        {children}
      </BlurFade>
    </Suspense>
  );
}
