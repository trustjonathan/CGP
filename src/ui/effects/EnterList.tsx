import { lazy, Suspense, type ReactNode } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';

const AnimatedList = lazy(() =>
  import('@/components/ui/magicui/animated-list').then((module) => ({ default: module.AnimatedList })),
);

interface EnterListProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function EnterList({ children, className, delay = 180 }: EnterListProps) {
  const reducedMotion = useReducedMotionPreference();
  if (reducedMotion) return <div className={className}>{children}</div>;

  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <AnimatedList className={className} delay={delay}>
        {children}
      </AnimatedList>
    </Suspense>
  );
}
