export type Point = { x: number; y: number };
export type Camera = Point & { scale: number };
export type Card = Point & { id: string; width: number; z: number };
export type VideoCard = Card & {
  name: string;
  duration: number;
  start: number;
  sourceWidth: number;
  sourceHeight: number;
  time: number;
  thumbnails: string[];
  peaks: number[];
  frameTimes: number[];
  analysis: 'pending' | 'ready' | 'partial';
  analysisNote?: string;
  showFilmstrip: boolean;
  showWaveform: boolean;
};
export type StillCard = Card & { videoId: string; time: number; duration: number };
export type Board = {
  version: 1;
  name: string;
  videos: VideoCard[];
  stills: StillCard[];
  camera: Camera;
};

export const emptyBoard = (): Board => ({ version: 1, name: 'Untitled board', videos: [], stills: [], camera: { x: 0, y: 0, scale: 1 } });
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const videoImageHeight = (video: VideoCard) => clamp(video.width * video.sourceHeight / video.sourceWidth, 150, 380);
export const stillImageHeight = (still: StillCard, video: VideoCard) => still.width * video.sourceHeight / video.sourceWidth;
export const videoHeight = (video: VideoCard) => 36 + videoImageHeight(video) + 46 + 26 + (video.showFilmstrip ? 46 : 0) + (video.showWaveform ? 42 : 0) + (!video.showFilmstrip && !video.showWaveform ? 10 : 0) + 16;
export const stillHeight = (still: StillCard, video: VideoCard) => 36 + stillImageHeight(still, video) + 29;
export const topZ = (board: Board) => Math.max(0, ...board.videos.map(v => v.z), ...board.stills.map(s => s.z)) + 1;

export function timecode(time: number, millis = true) {
  const ms = Math.max(0, Math.round(time * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${millis ? `.${String(ms % 1000).padStart(3, '0')}` : ''}`;
}

export function parseTimecode(value: string) {
  if (!/^\d+(?::\d{1,2}){0,2}(?:[.,]\d{1,6})?$/.test(value.trim())) return NaN;
  return value.trim().replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

export function boardBoxes(board: Board) {
  return [
    ...board.videos.map(v => ({ ...v, height: videoHeight(v) })),
    ...board.stills.flatMap(s => {
      const video = board.videos.find(v => v.id === s.videoId);
      return video ? [{ ...s, height: stillHeight(s, video) }] : [];
    }),
  ];
}
