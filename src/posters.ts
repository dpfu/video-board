import { useEffect, useMemo, useRef, useState } from 'react';
import { clipHeight, type Board } from './model';
import { captureFrame } from './media';

export const posterKey = (sourceId: string, time: number) =>
  `${sourceId}:${Math.round(time * 1e6)}`;

/** One cancellable capture at a time; at most 48 small, shared visible covers. */
export function useClipPosters(
  board: Board,
  assets: Map<string, Blob>,
  viewport: { width: number; height: number },
  generation: number,
  evidenceIds: string[] = [],
) {
  const cache = useRef(new Map<string, string>()),
    failed = useRef(new Set<string>());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requests = useMemo(() => {
    const sources = new Map(board.videos.map((v) => [v.id, v])),
      quotes = new Map(board.quotations.map((q) => [q.id, q]));
    const seen = new Set<string>(),
      requests: { key: string; sourceId: string; time: number }[] = [];
    for (const id of evidenceIds) {
      const q = quotes.get(id);
      if (!q || !sources.has(q.sourceId)) continue;
      if (
        (q.kind === 'frame' || q.kind === 'region') &&
        board.stills.some((s) => s.quotationId === (q.kind === 'region' ? q.parentId : q.id))
      )
        continue;
      const key = posterKey(q.sourceId, q.start);
      if (!seen.has(key)) {
        seen.add(key);
        requests.push({ key, sourceId: q.sourceId, time: q.start });
      }
      if (requests.length === 48) break;
    }
    const { x, y, scale } = board.camera;
    for (const c of board.clips) {
      if (requests.length === 48) break;
      const source = sources.get(c.videoId),
        q = quotes.get(c.quotationId);
      if (
        !source ||
        !q ||
        c.x * scale + x >= viewport.width ||
        (c.x + c.width) * scale + x <= 0 ||
        c.y * scale + y >= viewport.height ||
        (c.y + clipHeight(c, source)) * scale + y <= 0
      )
        continue;
      const key = posterKey(q.sourceId, q.start);
      if (!seen.has(key)) {
        seen.add(key);
        requests.push({ key, sourceId: q.sourceId, time: q.start });
      }
      if (requests.length === 48) break;
    }
    return requests;
  }, [
    board.videos,
    board.quotations,
    board.clips,
    board.stills,
    board.camera,
    viewport,
    JSON.stringify(evidenceIds),
  ]);
  const key = JSON.stringify(requests.map((r) => r.key));
  useEffect(() => {
    for (const url of cache.current.values()) URL.revokeObjectURL(url);
    cache.current.clear();
    failed.current.clear();
    setUrls({});
    return () => {
      for (const url of cache.current.values()) URL.revokeObjectURL(url);
      cache.current.clear();
    };
  }, [generation]);
  useEffect(() => {
    const controller = new AbortController();
    const needed = new Set(requests.map((r) => r.key));
    const timer = setTimeout(() => {
      void (async () => {
        for (const request of requests) {
          if (cache.current.has(request.key) || failed.current.has(request.key)) continue;
          const source = assets.get(request.sourceId);
          if (!source) continue;
          try {
            const frame = await captureFrame(source, request.time, {
              width: 320,
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(frame.blob);
            cache.current.set(request.key, url);
            while (cache.current.size > 48) {
              const stale = [...cache.current.keys()].find((k) => !needed.has(k));
              if (!stale) break;
              URL.revokeObjectURL(cache.current.get(stale)!);
              cache.current.delete(stale);
            }
            setUrls(Object.fromEntries(cache.current));
          } catch (error) {
            if (controller.signal.aborted) return;
            failed.current.add(request.key);
          }
        }
      })();
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, generation]);
  return urls;
}
