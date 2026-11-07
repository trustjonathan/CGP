import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Confetti, type ConfettiRef } from '@/components/ui/magicui/confetti';

interface CelebrationProps {
  active: boolean;
}

export function Celebration({ active }: CelebrationProps) {
  const reducedMotion = useReducedMotion();
  const confettiRef = useRef<ConfettiRef>(null);
  const hasCelebrated = useRef(false);

  useEffect(() => {
    if (!active || reducedMotion || hasCelebrated.current) return;
    hasCelebrated.current = true;
    void confettiRef.current?.fire({
      particleCount: 90,
      spread: 58,
      origin: { y: 0.72 },
    });
  }, [active, reducedMotion]);

  if (reducedMotion || !active) return null;

  return (
    <Confetti
      ref={confettiRef}
      manualstart
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
