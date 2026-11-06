import { useEffect, useRef, useState } from 'react';
import { boardBoxes, clamp, mapCards, topZ, type Camera, type Point } from '../model';
import type { BoardDocument } from './useDocument';
import { useActions } from '../useActions';

export function useViewport(document: BoardDocument) {
  const {
    current,
    actions: { change },
  } = document;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  function zoom(factor: number, anchor?: Point) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const at = anchor || { x: box.width / 2, y: box.height / 2 };
    change((b) => {
      const c = b.camera,
        scale = clamp(c.scale * factor, 0.15, 3);
      return {
        ...b,
        camera: {
          scale,
          x: at.x - ((at.x - c.x) / c.scale) * scale,
          y: at.y - ((at.y - c.y) / c.scale) * scale,
        },
      };
    });
  }
  function fit() {
    const boxes = boardBoxes(current.current),
      viewport = stage.current?.getBoundingClientRect();
    if (!boxes.length || !viewport) {
      change((b) => ({ ...b, camera: { x: 0, y: 0, scale: 1 } }));
      return;
    }
    const minX = Math.min(...boxes.map((c) => c.x)),
      minY = Math.min(...boxes.map((c) => c.y));
    const w = Math.max(...boxes.map((c) => c.x + c.width)) - minX,
      h = Math.max(...boxes.map((c) => c.y + c.height)) - minY;
    const scale = clamp(
      Math.min((viewport.width - 140) / w, (viewport.height - 140) / h, 1),
      0.15,
      3,
    );
    const camera: Camera = {
      scale,
      x: (viewport.width - w * scale) / 2 - minX * scale,
      y: (viewport.height - h * scale) / 2 - minY * scale,
    };
    change((b) => ({ ...b, camera }));
  }
  function exposeModule(id: string, preferredScale?: number) {
    const b = current.current,
      box = boardBoxes(b).find((c) => c.id === id),
      viewport = stage.current?.getBoundingClientRect();
    if (!box || !viewport) return;
    const c = b.camera,
      margin = 24;
    // Source reveal keeps the current scale. Explicitly opening a space starts
    // at a readable scale, reduced only when its frame cannot fit.
    const scale = clamp(
      Math.min(
        preferredScale ?? c.scale,
        (viewport.width - margin * 2) / box.width,
        (viewport.height - margin * 2) / box.height,
      ),
      0.15,
      3,
    );
    const x = clamp(
      box.x * scale + c.x,
      margin,
      Math.max(margin, viewport.width - margin - box.width * scale),
    );
    const y = clamp(
      box.y * scale + c.y,
      margin,
      Math.max(margin, viewport.height - margin - box.height * scale),
    );
    change((b) =>
      mapCards({ ...b, camera: { scale, x: x - box.x * scale, y: y - box.y * scale } }, (card) =>
        card.id === id ? { ...card, z: topZ(b) } : card,
      ),
    );
  }
  const actions = useActions({ zoom, fit, exposeModule });
  return { stage, size, actions };
}
export type Viewport = ReturnType<typeof useViewport>;
