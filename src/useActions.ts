import { useRef, useState } from 'react';

/** Fixed action names, stable identities, and the latest render's dependencies. */
export function useActions<Actions extends Record<string, (...args: never[]) => unknown>>(
  actions: Actions,
): Actions {
  const latest = useRef(actions);
  latest.current = actions;
  const [stable] = useState(
    () =>
      Object.fromEntries(
        Object.keys(actions).map((key) => [
          key,
          (...args: unknown[]) => Reflect.apply(latest.current[key], undefined, args),
        ]),
      ) as unknown as Actions,
  );
  return stable;
}
