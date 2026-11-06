import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { parseTimecode, timecode } from './model';
import { useActions } from './useActions';

type Options = {
  accept?: (value: number) => boolean;
  onCommit: (value: number) => void;
  onValidity?: (valid: boolean) => void;
  formatOnCommit?: boolean;
};

/** Draft text stays local; only a valid committed timestamp changes evidence. */
export function useTimecode(value: number, options: Options) {
  const [text, setText] = useState(timecode(value));
  const [invalid, setInvalid] = useState(false);
  const actions = useActions({
    reset() {
      setText(timecode(value));
      setInvalid(false);
      options.onValidity?.(true);
    },
    onChange(event: ChangeEvent<HTMLInputElement>) {
      const text = event.target.value;
      setText(text);
      setInvalid(false);
      const parsed = parseTimecode(text);
      options.onValidity?.(Number.isFinite(parsed) && (options.accept?.(parsed) ?? true));
    },
    onBlur() {
      const parsed = parseTimecode(text);
      const valid = Number.isFinite(parsed) && (options.accept?.(parsed) ?? true);
      setInvalid(!valid);
      options.onValidity?.(valid);
      if (!valid) return;
      options.onCommit(parsed);
      if (options.formatOnCommit !== false) setText(timecode(value));
    },
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        actions.reset();
      }
    },
  });
  useEffect(actions.reset, [value, actions]);
  return {
    value: text,
    'aria-invalid': invalid,
    onChange: actions.onChange,
    onBlur: actions.onBlur,
    onKeyDown: actions.onKeyDown,
  };
}
