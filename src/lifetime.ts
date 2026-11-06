import { useEffect, useRef, useState } from 'react';

/** Effect replay reacquires the same owner before final cleanup can run. */
export function createLifetime(dispose: () => void) {
  let generation = 0;
  return () => {
    const owned = ++generation;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      queueMicrotask(() => {
        if (generation === owned) dispose();
      });
    };
  };
}

/** Keep long-lived resources through Strict Mode/hot refresh; release on actual unmount. */
export function useLifetime(dispose: () => void) {
  const latest = useRef(dispose);
  latest.current = dispose;
  const [acquire] = useState(() => createLifetime(() => latest.current()));
  useEffect(acquire, [acquire]);
}
