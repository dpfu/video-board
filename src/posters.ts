import { useEffect, useRef, useState } from 'react';
import { boardBoxes, type Board } from './model';
import { captureFrame } from './media';

export const posterKey = (sourceId: string, time: number) => `${sourceId}:${Math.round(time * 1e6)}`;

/** One cancellable capture at a time; at most 48 small, shared visible covers. */
export function useClipPosters(board: Board, assets: Map<string, Blob>, viewport: { width: number; height: number }, generation: number) {
  const cache = useRef(new Map<string, string>()), failed = useRef(new Set<string>());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const visible = boardBoxes(board).filter(c => board.clips.some(clip => clip.id === c.id) &&
    c.x * board.camera.scale + board.camera.x < viewport.width && (c.x + c.width) * board.camera.scale + board.camera.x > 0 &&
    c.y * board.camera.scale + board.camera.y < viewport.height && (c.y + c.height) * board.camera.scale + board.camera.y > 0);
  const requests = visible.flatMap(c => {
    const clip = board.clips.find(clip => clip.id === c.id)!, q = board.quotations.find(q => q.id === clip.quotationId);
    return q ? [{ key: posterKey(q.sourceId, q.start), sourceId: q.sourceId, time: q.start }] : [];
  }).filter((item, i, all) => all.findIndex(other => other.key === item.key) === i).slice(0, 48);
  const key = requests.map(r => r.key).join('|');
  useEffect(() => {
    for (const url of cache.current.values()) URL.revokeObjectURL(url);
    cache.current.clear(); failed.current.clear(); setUrls({});
    return () => { for (const url of cache.current.values()) URL.revokeObjectURL(url); cache.current.clear(); };
  }, [generation]);
  useEffect(() => {
    const controller = new AbortController();
    const needed = new Set(requests.map(r => r.key));
    const timer = setTimeout(() => { void (async () => {
      for (const request of requests) {
        if (cache.current.has(request.key) || failed.current.has(request.key)) continue;
        const source = assets.get(request.sourceId); if (!source) continue;
        try {
          const frame = await captureFrame(source, request.time, { width: 320, signal: controller.signal });
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(frame.blob); cache.current.set(request.key, url);
          while (cache.current.size > 48) {
            const stale = [...cache.current.keys()].find(k => !needed.has(k)); if (!stale) break;
            URL.revokeObjectURL(cache.current.get(stale)!); cache.current.delete(stale);
          }
          setUrls(Object.fromEntries(cache.current));
        } catch (error) { if (controller.signal.aborted) return; failed.current.add(request.key); }
      }
    })(); }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, generation]);
  return urls;
}
