import { useEffect, useRef } from 'react';

/** Pointer ownership is local; cancellation retains values already applied by the owner. */
export function usePointerGesture<Gesture extends { pointer: number }>(ended?: () => void) {
  const active = useRef<Gesture | null>(null);
  const onFinish = useRef(ended);
  onFinish.current = ended;
  function finish(pointer?: number) {
    if (!active.current || (pointer !== undefined && active.current.pointer !== pointer))
      return false;
    active.current = null;
    onFinish.current?.();
    return true;
  }
  useEffect(() => {
    const cancel = () => {
      finish();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  return { active, finish };
}
