import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { AnimatedList } from '@/components/ui/magicui/animated-list';

interface EnterListProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function EnterList({ children, className, delay = 180 }: EnterListProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className={className}>{children}</div>;

  return (
    <AnimatedList className={className} delay={delay}>
      {children}
    </AnimatedList>
  );
}
