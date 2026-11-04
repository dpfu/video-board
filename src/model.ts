export type Point = { x: number; y: number };
export type Camera = Point & { scale: number };
export type Dock = { to: string; side: 'top' | 'right' | 'bottom' | 'left'; offset: number };
export type Card = Point & { id: string; width: number; height?: number; z: number; dock?: Dock };
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
export type TrackKind = 'filmstrip' | 'waveform';
export type TrackCard = Card & { videoId: string; kind: TrackKind; height: number };
export type Board = {
  version: 2;
  name: string;
  videos: VideoCard[];
  stills: StillCard[];
  tracks: TrackCard[];
  camera: Camera;
};

export type LegacyBoard = Omit<Board, 'version' | 'tracks'> & { version: 1 };
export type ModuleCard = VideoCard | StillCard | TrackCard;
export const HEADER = 28;
export const DOCK_GAP = 5;
export const emptyBoard = (): Board => ({ version: 2, name: 'Untitled board', videos: [], stills: [], tracks: [], camera: { x: 0, y: 0, scale: 1 } });
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const videoImageHeight = (video: VideoCard) => video.height ? video.height - HEADER - 54 : clamp((video.width - 2) * video.sourceHeight / video.sourceWidth, 130, 360);
export const stillImageHeight = (still: StillCard, video: VideoCard) => still.height ? still.height - HEADER - 24 : (still.width - 2) * video.sourceHeight / video.sourceWidth;
export const videoHeight = (video: VideoCard) => HEADER + videoImageHeight(video) + 54;
export const stillHeight = (still: StillCard, video: VideoCard) => HEADER + stillImageHeight(still, video) + 24;
export const allCards = (board: Board): ModuleCard[] => [...board.videos, ...board.stills, ...board.tracks];
export const topZ = (board: Board) => Math.max(0, ...allCards(board).map(v => v.z)) + 1;
export function mapCards(board: Board, update: (card: ModuleCard) => ModuleCard): Board {
  return { ...board, videos: board.videos.map(v => update(v) as VideoCard), stills: board.stills.map(s => update(s) as StillCard), tracks: board.tracks.map(t => update(t) as TrackCard) };
}

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
    ...board.tracks.map(track => ({ ...track })),
  ];
}

/** v1 media IDs and still positions survive; embedded tracks become docked modules. */
export function migrateBoard(saved: Board | LegacyBoard): Board {
  if (saved.version === 2) return saved;
  const board: Board = { ...saved, version: 2, tracks: [] };
  for (const video of board.videos) {
    let parent: Card = video, bottom = video.y + videoHeight(video);
    for (const kind of ['filmstrip', 'waveform'] as const) {
      if (!(kind === 'filmstrip' ? video.showFilmstrip : video.showWaveform)) continue;
      const track: TrackCard = { id: `${video.id}-${kind}`, videoId: video.id, kind, x: video.x, y: bottom + DOCK_GAP, width: video.width, height: kind === 'filmstrip' ? 104 : 88, z: video.z, dock: { to: parent.id, side: 'bottom', offset: 0 } };
      board.tracks.push(track); parent = track; bottom = track.y + track.height;
    }
  }
  return board;
}
