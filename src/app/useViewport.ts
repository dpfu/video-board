import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { boardBoxes, clamp, mapCards, topZ, type Camera, type Point } from '../model';
import type { BoardDocument } from './useDocument';
import { useActions } from '../useActions';
import { cameraCovered } from '../viewport';

export function useViewport(document: BoardDocument) {
  const {
    current,
    actions: { change },
  } = document;
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const painted = useRef<Camera | null>(null);
  const zoomValue = useRef<HTMLButtonElement>(null);
  const renderedCamera = useRef(document.board.camera);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  function paintCamera(camera: Camera, force = false) {
    const before = painted.current;
    const scaleChanged = force || before?.scale !== camera.scale;
    if (force || before?.x !== camera.x || before?.y !== camera.y || scaleChanged) {
      if (world.current)
        world.current.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
      if (grid.current) {
        const cell = 24 * camera.scale;
        grid.current.style.transform = `translate(${(camera.x + 80) % cell}px, ${(camera.y + 80) % cell}px)`;
      }
    }
    if (scaleChanged) {
      if (grid.current)
        grid.current.style.backgroundSize = `${24 * camera.scale}px ${24 * camera.scale}px`;
      if (zoomValue.current) {
        const label = `${Math.round(camera.scale * 100)}%`;
        if (zoomValue.current.textContent !== label) zoomValue.current.textContent = label;
      }
    }
    painted.current = camera;
  }
  function previewCamera(camera: Camera) {
    const before = current.current.camera;
    if (before.x === camera.x && before.y === camera.y && before.scale === camera.scale) return;
    document.actions.preview((board) => ({ ...board, camera }));
    paintCamera(camera);
    if (!cameraCovered(renderedCamera.current, camera, size)) {
      renderedCamera.current = camera;
      document.actions.publish();
    }
  }
  useLayoutEffect(() => {
    renderedCamera.current = document.board.camera;
    paintCamera(current.current.camera, true);
  });
  function zoom(factor: number, anchor?: Point, preview = false) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const at = anchor || { x: box.width / 2, y: box.height / 2 };
    const c = current.current.camera,
      scale = clamp(c.scale * factor, 0.15, 3);
    const camera = {
      scale,
      x: at.x - ((at.x - c.x) / c.scale) * scale,
      y: at.y - ((at.y - c.y) / c.scale) * scale,
    };
    if (preview) previewCamera(camera);
    else change((board) => ({ ...board, camera }));
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
  const actions = useActions({ zoom, fit, exposeModule, previewCamera });
  return { stage, world, grid, zoomValue, size, actions };
}
export type Viewport = ReturnType<typeof useViewport>;
