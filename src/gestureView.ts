import type { Board, ModuleCard, Point } from './model';
import type { Snap } from './docking';

export const linkPath = (source: Point & { width: number }, view: Point & { width: number }) => {
  const x1 = source.x + source.width / 2,
    x2 = view.x + view.width / 2;
  return `M ${x1} ${source.y + 14} C ${x1} ${source.y - 40}, ${x2} ${view.y - 40}, ${x2} ${view.y + 14}`;
};

/** Only the moving assembly and its visible connectors need per-pixel DOM writes. */
export class MoveView {
  private cards: { element: HTMLElement; origin: ModuleCard; rendered: ModuleCard }[] = [];
  private links: {
    element: SVGPathElement;
    sourceId: string;
    viewId: string;
    source: Point & { width: number };
    view: Point & { width: number };
    sourceMoves: boolean;
    viewMoves: boolean;
  }[] = [];
  constructor(stage: HTMLElement, board: Board, originals: Map<string, ModuleCard>) {
    const rendered = new Map(
      [
        ...board.videos,
        ...board.stills,
        ...board.tracks,
        ...board.clips,
        ...board.panels,
        ...board.spaces,
      ].map((card) => [card.id, card]),
    );
    for (const element of stage.querySelectorAll<HTMLElement>('[data-module-id]')) {
      const origin = originals.get(element.dataset.moduleId!);
      if (origin && rendered.has(origin.id))
        this.cards.push({ element, origin, rendered: rendered.get(origin.id)! });
    }
    const sources = new Map(board.videos.map((video) => [video.id, video]));
    const views = new Map([...board.stills, ...board.clips].map((view) => [view.id, view]));
    for (const element of stage.querySelectorAll<SVGPathElement>('[data-link-id]')) {
      const view = views.get(element.dataset.linkId!),
        source = view && sources.get(view.videoId);
      if (!view || !source || (!originals.has(view.id) && !originals.has(source.id))) continue;
      this.links.push({
        element,
        sourceId: source.id,
        viewId: view.id,
        source: originals.get(source.id) || source,
        view: originals.get(view.id) || view,
        sourceMoves: originals.has(source.id),
        viewMoves: originals.has(view.id),
      });
    }
  }
  clear(board: Board) {
    for (const { element } of this.cards) element.style.transform = '';
    const sources = new Map(board.videos.map((video) => [video.id, video]));
    const views = new Map([...board.stills, ...board.clips].map((view) => [view.id, view]));
    for (const { element, sourceId, viewId } of this.links) {
      const source = sources.get(sourceId),
        view = views.get(viewId);
      if (source && view && element.isConnected) element.setAttribute('d', linkPath(source, view));
    }
  }
  paint(delta: Point) {
    for (const { element, origin, rendered } of this.cards)
      element.style.transform = `translate(${origin.x + delta.x - rendered.x}px, ${origin.y + delta.y - rendered.y}px)`;
    for (const { element, source, view, sourceMoves, viewMoves } of this.links)
      element.setAttribute(
        'd',
        linkPath(
          sourceMoves ? { ...source, x: source.x + delta.x, y: source.y + delta.y } : source,
          viewMoves ? { ...view, x: view.x + delta.x, y: view.y + delta.y } : view,
        ),
      );
  }
}

export function paintSnap(stage: HTMLElement | null, snap: Snap | null) {
  if (!snap) return;
  const element = stage?.querySelector<HTMLElement>('.dock-preview');
  if (!element) return;
  element.style.left = `${snap.x}px`;
  element.style.top = `${snap.y}px`;
  element.style.width = `${snap.width}px`;
  element.style.height = `${snap.height}px`;
}
