type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleAfterStartupIdle(task: () => void, delayMs = 8_000) {
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let delayTimer = 0;
  let idleTimer = 0;
  let idleHandle: number | undefined;

  delayTimer = window.setTimeout(() => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(() => {
        if (!cancelled) task();
      }, { timeout: 2_000 });
    } else {
      idleTimer = window.setTimeout(() => {
        if (!cancelled) task();
      }, 0);
    }
  }, delayMs);

  return () => {
    cancelled = true;
    window.clearTimeout(delayTimer);
    window.clearTimeout(idleTimer);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}
