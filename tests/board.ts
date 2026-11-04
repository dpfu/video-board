import type { Board, VideoCard } from '../src/model';

export function boardFixture(): Board {
  const video: VideoCard = {
    id: 'video', name: 'synthetic.webm', x: 100, y: 100, width: 400, height: 200, z: 1,
    duration: 4, start: 0, sourceWidth: 320, sourceHeight: 180, time: 1.25,
    thumbnails: [], peaks: [], frameTimes: [0, .04, .08], analysis: 'ready',
    showFilmstrip: true, showWaveform: true,
  };
  return {
    version: 2, name: 'Test board', camera: { x: 0, y: 0, scale: 1 }, videos: [video],
    stills: [{ id: 'still', videoId: 'video', time: 1.25, duration: .04, x: 850, y: 120, width: 280, z: 4 }],
    tracks: [
      { id: 'frames', videoId: 'video', kind: 'filmstrip', x: 100, y: 305, width: 400, height: 100, z: 2, dock: { to: 'video', side: 'bottom', offset: 0 } },
      { id: 'audio', videoId: 'video', kind: 'waveform', x: 100, y: 410, width: 600, height: 80, z: 3, dock: { to: 'frames', side: 'bottom', offset: 0 } },
    ],
  };
}
