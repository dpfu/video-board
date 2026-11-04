import type { SceneAnalysis } from './scenes';

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
  scenes?: SceneAnalysis;
  showFilmstrip: boolean;
  showWaveform: boolean;
  hidden?: boolean;
};
export type StillCard = Card & { videoId: string; time: number; duration: number; quotationId?: string; assetId?: string };
export type Rect = { x: number; y: number; width: number; height: number };
export type Quotation = {
  id: string; sourceId: string; kind: 'video' | 'range' | 'frame' | 'region';
  start: number; end: number; parentId?: string; rect?: Rect;
  title: string; memo: string; codeIds: string[]; createdAt: string; updatedAt: string;
};
export type Code = { id: string; name: string; color: string; definition: string };
export type ClipCard = Card & { videoId: string; quotationId: string; time: number };
export type CodesCard = Card & { kind: 'codes'; height: number };
export type TrackKind = 'filmstrip' | 'waveform' | 'cuts';
export type TrackCard = Card & { videoId: string; kind: TrackKind; height: number };
export type Board = {
  version: 3;
  name: string;
  videos: VideoCard[];
  stills: StillCard[];
  tracks: TrackCard[];
  clips: ClipCard[];
  panels: CodesCard[];
  quotations: Quotation[];
  codes: Code[];
  camera: Camera;
};

export type V2Board = Omit<Board, 'version' | 'clips' | 'panels' | 'quotations' | 'codes'> & { version: 2 };
export type LegacyBoard = Omit<V2Board, 'version' | 'tracks'> & { version: 1 };
export type ModuleCard = VideoCard | StillCard | TrackCard | ClipCard | CodesCard;
export const HEADER = 28;
export const DOCK_GAP = 5;
export const emptyBoard = (): Board => ({ version: 3, name: 'Untitled board', videos: [], stills: [], tracks: [], clips: [], panels: [], quotations: [], codes: [], camera: { x: 0, y: 0, scale: 1 } });
export const sourceQuotationId = (id: string) => `source-${id}`;
export const stillAssetId = (still: StillCard) => still.assetId || still.id;
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const videoImageHeight = (video: VideoCard) => video.height ? video.height - HEADER - 54 : clamp((video.width - 2) * video.sourceHeight / video.sourceWidth, 130, 360);
export const stillImageHeight = (still: StillCard, video: VideoCard) => still.height ? still.height - HEADER - 24 : (still.width - 2) * video.sourceHeight / video.sourceWidth;
export const videoHeight = (video: VideoCard) => HEADER + videoImageHeight(video) + 54;
export const stillHeight = (still: StillCard, video: VideoCard) => HEADER + stillImageHeight(still, video) + 24;
export const allCards = (board: Board): ModuleCard[] => [...board.videos.filter(v => !v.hidden), ...board.stills, ...board.tracks, ...board.clips, ...board.panels];
export const topZ = (board: Board) => Math.max(0, ...allCards(board).map(v => v.z)) + 1;
export function mapCards(board: Board, update: (card: ModuleCard) => ModuleCard): Board {
  return { ...board, videos: board.videos.map(v => v.hidden ? v : update(v) as VideoCard), stills: board.stills.map(s => update(s) as StillCard), tracks: board.tracks.map(t => update(t) as TrackCard), clips: board.clips.map(c => update(c) as ClipCard), panels: board.panels.map(p => update(p) as CodesCard) };
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
    ...board.videos.filter(v => !v.hidden).map(v => ({ ...v, height: videoHeight(v) })),
    ...board.stills.flatMap(s => {
      const video = board.videos.find(v => v.id === s.videoId);
      return video ? [{ ...s, height: stillHeight(s, video) }] : [];
    }),
    ...board.tracks.map(track => ({ ...track })),
    ...board.clips.flatMap(clip => {
      const video = board.videos.find(v => v.id === clip.videoId);
      return video ? [{ ...clip, height: clip.height || HEADER + clamp((clip.width - 2) * video.sourceHeight / video.sourceWidth, 100, 320) + 94 }] : [];
    }),
    ...board.panels,
  ];
}

/** v1 media IDs and still positions survive; embedded tracks become docked modules. */
export function migrateBoard(saved: Board | V2Board | LegacyBoard): Board {
  if (saved.version === 3) return saved;
  const board: Board = { ...saved, version: 3, tracks: saved.version === 2 ? saved.tracks : [], clips: [], panels: [], quotations: [], codes: [] };
  if (saved.version === 1) for (const video of board.videos) {
    let parent: Card = video, bottom = video.y + videoHeight(video);
    for (const kind of ['filmstrip', 'waveform'] as const) {
      if (!(kind === 'filmstrip' ? video.showFilmstrip : video.showWaveform)) continue;
      const track: TrackCard = { id: `${video.id}-${kind}`, videoId: video.id, kind, x: video.x, y: bottom + DOCK_GAP, width: video.width, height: kind === 'filmstrip' ? 104 : 88, z: video.z, dock: { to: parent.id, side: 'bottom', offset: 0 } };
      board.tracks.push(track); parent = track; bottom = track.y + track.height;
    }
  }
  const stamp = new Date().toISOString();
  // The original asset IDs remain the source catalog's stable identity. The
  // primary player can be hidden independently; clip/still view IDs are separate.
  board.quotations = board.videos.map(v => ({ id: sourceQuotationId(v.id), sourceId: v.id, kind: 'video', start: 0, end: v.duration, title: v.name, memo: '', codeIds: [], createdAt: stamp, updatedAt: stamp }));
  board.stills = board.stills.map(s => {
    const quotationId = `frame-${s.id}`;
    board.quotations.push({ id: quotationId, sourceId: s.videoId, kind: 'frame', start: s.time, end: Math.min(board.videos.find(v => v.id === s.videoId)!.duration, s.time + s.duration), title: '', memo: '', codeIds: [], createdAt: stamp, updatedAt: stamp });
    return { ...s, quotationId };
  });
  return board;
}
