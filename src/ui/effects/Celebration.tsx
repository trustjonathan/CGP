import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';

const Confetti = lazy(() =>
  import('@/components/ui/magicui/confetti').then((module) => ({ default: module.Confetti })),
);

interface CelebrationProps {
  active: boolean;
}

export function Celebration({ active }: CelebrationProps) {
  const reducedMotion = useReducedMotionPreference();
  const confettiRef = useRef<import('@/components/ui/magicui/confetti').ConfettiRef>(null);
  const hasCelebrated = useRef(false);
  const [confettiReady, setConfettiReady] = useState(false);
  const onConfettiReady = useCallback(() => setConfettiReady(true), []);

  useEffect(() => {
    if (!active || reducedMotion || !confettiReady || hasCelebrated.current) return;
    hasCelebrated.current = true;
    void confettiRef.current?.fire({
      particleCount: 90,
      spread: 58,
      origin: { y: 0.72 },
    });
  }, [active, confettiReady, reducedMotion]);

  if (reducedMotion || !active) return null;

  return (
    <Suspense fallback={null}>
      <Confetti
        ref={confettiRef}
        manualstart
        onReady={onConfettiReady}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />
    </Suspense>
  );
}
