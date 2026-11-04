import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { boardBoxes, type Board, type Point } from './model';

const settle = { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' };

/** Presentation-only FLIP. Saved geometry is final immediately, even mid-motion. */
export function useBoardMotion(board: Board, stage: RefObject<HTMLDivElement>, enabled: boolean, manipulating: () => boolean) {
  const previous = useRef(new Map<string, Point>()), ready = useRef(false);
  const transforms = useRef(new Map<string, Animation>()), glows = useRef(new Map<string, Animation>());
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const find = (id: string) => stage.current?.querySelector<HTMLElement>(`[data-module-id="${CSS.escape(id)}"]`);
  function cancel() {
    for (const animation of [...transforms.current.values(), ...glows.current.values()]) animation.cancel();
    transforms.current.clear(); glows.current.clear();
  }
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduced.current = media.matches; if (media.matches) cancel(); };
    media.addEventListener('change', change);
    return () => { media.removeEventListener('change', change); cancel(); };
  }, []);
  function highlight(id: string) {
    const el = find(id); if (!el || reduced.current) return;
    glows.current.get(id)?.cancel();
    const end = getComputedStyle(el).boxShadow;
    const animation = el.animate([{ boxShadow: '0 0 0 2px #c8ddf0, 0 4px 18px #0008' }, { boxShadow: end }], { duration: 420, easing: 'ease-out' });
    glows.current.set(id, animation);
    animation.onfinish = () => { if (glows.current.get(id) === animation) glows.current.delete(id); };
  }
  useLayoutEffect(() => {
    const boxes = boardBoxes(board), next = new Map(boxes.map(c => [c.id, { x: c.x, y: c.y }]));
    if (ready.current && enabled && !reduced.current) for (const box of boxes) {
      const el = find(box.id), old = previous.current.get(box.id); if (!el) continue;
      if (!old) {
        transforms.current.get(box.id)?.cancel();
        const animation = el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { ...settle, duration: 200 });
        transforms.current.set(box.id, animation);
        const linked = board.stills.find(s => s.id === box.id) || board.clips.find(c => c.id === box.id);
        if (linked) { highlight(linked.videoId); highlight(box.id); }
        animation.onfinish = () => { if (transforms.current.get(box.id) === animation) transforms.current.delete(box.id); };
      } else if (!manipulating() && (old.x !== box.x || old.y !== box.y)) {
        transforms.current.get(box.id)?.cancel();
        const animation = el.animate([{ transform: `translate(${old.x - box.x}px,${old.y - box.y}px)` }, { transform: 'translate(0,0)' }], settle);
        transforms.current.set(box.id, animation);
        animation.onfinish = () => { if (transforms.current.get(box.id) === animation) transforms.current.delete(box.id); };
      }
    }
    for (const [id, animation] of transforms.current) if (!next.has(id)) { animation.cancel(); transforms.current.delete(id); }
    for (const [id, animation] of glows.current) if (!next.has(id)) { animation.cancel(); glows.current.delete(id); }
    previous.current = next; ready.current = enabled;
  }, [board, enabled]);
  function interrupt(ids: Set<string>) {
    const offsets = new Map<string, Point>();
    for (const id of ids) {
      const el = find(id);
      if (el) { const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform); offsets.set(id, { x: matrix.m41, y: matrix.m42 }); }
      transforms.current.get(id)?.cancel(); transforms.current.delete(id); glows.current.get(id)?.cancel(); glows.current.delete(id);
    }
    return offsets;
  }
  return { highlight, interrupt };
}
