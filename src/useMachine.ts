import { useCallback, useRef, useState } from 'react';

/** Event handlers and delayed callbacks see the same transition as the next render. */
export function useMachine<State, Event>(
  reduce: (state: State, event: Event) => State,
  initial: State,
) {
  const current = useRef(initial);
  const [state, setState] = useState(initial);
  const send = useCallback(
    (event: Event) => {
      const next = reduce(current.current, event);
      if (next === current.current) return false;
      current.current = next;
      setState(next);
      return true;
    },
    [reduce],
  );
  return { state, current, send };
}
