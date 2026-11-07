import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
} from 'react';
import confetti from 'canvas-confetti';
import type {
  CreateTypes as ConfettiInstance,
  GlobalOptions as ConfettiGlobalOptions,
  Options as ConfettiOptions,
} from 'canvas-confetti';

export type ConfettiRef = {
  fire: (options?: ConfettiOptions) => Promise<void> | void;
};

type ConfettiProps = ComponentPropsWithoutRef<'canvas'> & {
  options?: ConfettiOptions;
  globalOptions?: ConfettiGlobalOptions;
  manualstart?: boolean;
};

export const Confetti = forwardRef<ConfettiRef, ConfettiProps>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: true },
    manualstart = false,
    className,
    ...rest
  } = props;
  const canvasNodeRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const optionsRef = useRef(options);
  const globalOptionsRef = useRef(globalOptions);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    globalOptionsRef.current = globalOptions;
  }, [globalOptions]);

  useEffect(() => {
    if (canvasNodeRef.current && !instanceRef.current) {
      instanceRef.current = confetti.create(canvasNodeRef.current, {
        resize: true,
        useWorker: true,
        ...globalOptionsRef.current,
      });
    }

    return () => {
      instanceRef.current?.reset();
      instanceRef.current = null;
    };
  }, []);

  const fire = useCallback(async (nextOptions: ConfettiOptions = {}) => {
    await instanceRef.current?.({
      ...optionsRef.current,
      ...nextOptions,
    });
  }, []);
  const api = useMemo<ConfettiRef>(() => ({ fire }), [fire]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (!manualstart) void fire();
  }, [manualstart, fire]);

  return <canvas ref={canvasNodeRef} className={className} {...rest} />;
});

Confetti.displayName = 'Confetti';
