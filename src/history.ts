import type { Board } from './model';

/** Undo restores analytical/layout edits without rolling completed analysis back. */
export function restoreEdit(previous: Board, live: Board): Board {
  const sources = new Map(live.videos.map((video) => [video.id, video]));
  const videos = previous.videos.map((video) => {
    const source = sources.get(video.id);
    return source
      ? {
          ...source,
          x: video.x,
          y: video.y,
          z: video.z,
          width: video.width,
          height: video.height,
          dock: video.dock,
          hidden: video.hidden,
          time: video.time,
        }
      : video;
  });
  return { ...previous, videos, camera: live.camera };
}
