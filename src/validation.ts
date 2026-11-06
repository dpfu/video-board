import {
  sourceQuotationId,
  stillAssetId,
  type Card,
  type ClipCard,
  type Code,
  type CodesCard,
  type Dock,
  type PersistedBoard,
  type Quotation,
  type Rect,
  type StillCard,
  type SpaceCard,
  type SpaceItem,
  type TrackCard,
  type VideoCard,
} from './model';
import type { SceneAnalysis } from './scenes';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const bounded = (value: unknown, min: number, max: number): value is number =>
  finite(value) && value >= min && value <= max;
const text = (value: unknown, max = 100_000): value is string =>
  typeof value === 'string' && value.length <= max;
const identifier = (value: unknown, max = 100): value is string =>
  text(value, max) && /^[a-zA-Z0-9_-]+$/.test(value);

function arrayOf<T>(
  value: unknown,
  max: number,
  valid: (item: unknown) => item is T,
): value is T[] {
  if (!Array.isArray(value) || value.length > max) return false;
  // for…of visits sparse entries too; Array.every would silently accept holes.
  for (const item of value) if (!valid(item)) return false;
  return true;
}

function list<T>(
  value: unknown,
  max: number,
  valid: (item: unknown) => item is T,
  error: string,
): T[] {
  if (!arrayOf(value, max, valid)) throw new Error(error);
  return value;
}

function orderedTimes(value: unknown, duration: number): value is number[] {
  if (!Array.isArray(value) || value.length > 3_000_000) return false;
  let previous = -Infinity;
  for (const time of value) {
    if (!bounded(time, 0, duration) || time < previous) return false;
    previous = time;
  }
  return true;
}

function isDock(value: unknown): value is Dock {
  return (
    record(value) &&
    identifier(value.to) &&
    typeof value.side === 'string' &&
    ['top', 'right', 'bottom', 'left'].includes(value.side) &&
    bounded(value.offset, -10_000, 10_000)
  );
}

function isCard(value: unknown): value is Card & Record<string, unknown> {
  if (
    !record(value) ||
    !identifier(value.id) ||
    !bounded(value.x, -1e6, 1e6) ||
    !bounded(value.y, -1e6, 1e6) ||
    !bounded(value.width, 140, 2000) ||
    !bounded(value.z, 0, 1e9) ||
    (value.height !== undefined && !bounded(value.height, 60, 1400))
  )
    return false;
  if (value.dock !== undefined && !isDock(value.dock)) throw new Error('Invalid module docking.');
  return true;
}

function isScenes(value: unknown, duration: number): value is SceneAnalysis {
  return (
    record(value) &&
    value.algorithm === 'ffmpeg-scdet-v1' &&
    bounded(value.width, 1, 32768) &&
    bounded(value.height, 1, 32768) &&
    bounded(value.threshold, 0, 100) &&
    orderedTimes(value.times, duration) &&
    value.times.length > 0 &&
    arrayOf(value.scores, value.times.length, (score) => bounded(score, 0, 100)) &&
    value.scores.length === value.times.length
  );
}

function isVideo(value: unknown): value is VideoCard {
  if (
    !isCard(value) ||
    !text(value.name, 10_000) ||
    !bounded(value.duration, 0.001, 86400) ||
    !finite(value.start) ||
    !bounded(value.sourceWidth, 1, 32768) ||
    !bounded(value.sourceHeight, 1, 32768) ||
    !bounded(value.time, 0, value.duration) ||
    !arrayOf(value.thumbnails, 100, identifier) ||
    !arrayOf(value.peaks, 10_000, (peak) => bounded(peak, 0, 1)) ||
    !orderedTimes(value.frameTimes, value.duration) ||
    typeof value.showFilmstrip !== 'boolean' ||
    typeof value.showWaveform !== 'boolean' ||
    typeof value.analysis !== 'string' ||
    !['pending', 'ready', 'partial'].includes(value.analysis) ||
    (value.analysisNote !== undefined && !text(value.analysisNote)) ||
    (value.hidden !== undefined && typeof value.hidden !== 'boolean')
  )
    return false;
  if (value.scenes !== undefined && !isScenes(value.scenes, value.duration)) {
    throw new Error('Invalid scene detection data in project backup.');
  }
  return true;
}

function isStill(value: unknown): value is StillCard {
  return (
    isCard(value) &&
    identifier(value.videoId) &&
    finite(value.time) &&
    finite(value.duration) &&
    (value.quotationId === undefined || identifier(value.quotationId, 200)) &&
    (value.assetId === undefined || identifier(value.assetId))
  );
}

function isTrack(value: unknown): value is TrackCard {
  return (
    isCard(value) &&
    identifier(value.videoId) &&
    typeof value.kind === 'string' &&
    ['filmstrip', 'waveform', 'cuts'].includes(value.kind) &&
    bounded(value.height, value.kind === 'cuts' ? 96 : 72, 600)
  );
}

function isCode(value: unknown): value is Code {
  return (
    record(value) &&
    identifier(value.id) &&
    text(value.name, 200) &&
    !!value.name.trim() &&
    text(value.definition) &&
    typeof value.color === 'string' &&
    /^#[\da-fA-F]{6}$/.test(value.color)
  );
}

function isRect(value: unknown): value is Rect {
  return (
    record(value) &&
    bounded(value.x, 0, 1) &&
    bounded(value.y, 0, 1) &&
    bounded(value.width, 0.001, 1) &&
    bounded(value.height, 0.001, 1) &&
    value.x + value.width <= 1.000001 &&
    value.y + value.height <= 1.000001
  );
}

function isQuotation(value: unknown): value is Quotation {
  if (
    !record(value) ||
    !identifier(value.id, 200) ||
    !identifier(value.sourceId) ||
    (value.parentId !== undefined && !identifier(value.parentId, 200)) ||
    typeof value.kind !== 'string' ||
    !['video', 'range', 'frame', 'region'].includes(value.kind) ||
    !finite(value.start) ||
    !finite(value.end) ||
    !text(value.title, 10_000) ||
    !text(value.memo) ||
    !arrayOf(value.codeIds, 10_000, identifier) ||
    new Set(value.codeIds).size !== value.codeIds.length ||
    !text(value.createdAt, 100) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !text(value.updatedAt, 100) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    return false;
  if (value.kind === 'region' && !isRect(value.rect))
    throw new Error('Invalid region geometry in project backup.');
  return true;
}

function isClip(value: unknown): value is ClipCard {
  return (
    isCard(value) &&
    identifier(value.videoId) &&
    identifier(value.quotationId, 200) &&
    finite(value.time) &&
    (value.rate === undefined ||
      (typeof value.rate === 'number' && [0.25, 0.5, 1, 1.5, 2].includes(value.rate)))
  );
}

function isPanel(value: unknown): value is CodesCard {
  return isCard(value) && value.kind === 'codes' && bounded(value.height, 280, 1200);
}

function isSpaceItem(value: unknown): value is SpaceItem {
  return (
    record(value) &&
    identifier(value.quotationId, 200) &&
    bounded(value.x, 0, 1e7) &&
    bounded(value.y, 0, 1e7)
  );
}

function isSpace(value: unknown): value is SpaceCard {
  return (
    isCard(value) &&
    value.kind === 'space' &&
    bounded(value.width, 400, 2000) &&
    bounded(value.height, 320, 1200) &&
    text(value.name, 200) &&
    text(value.memo) &&
    (value.codeId === undefined || identifier(value.codeId)) &&
    arrayOf(value.items, 100_000, isSpaceItem)
  );
}

function register(ids: Set<string>, id: string, error: string) {
  if (ids.has(id)) throw new Error(error);
  ids.add(id);
}

/** Resolve each parent chain once, without recursion or quadratic repeated searches. */
function acyclic(parents: ReadonlyMap<string, string | undefined>, error: string) {
  const resolved = new Set<string>();
  for (const id of parents.keys()) {
    const path = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor !== undefined && !resolved.has(cursor)) {
      if (path.has(cursor)) throw new Error(error);
      path.add(cursor);
      cursor = parents.get(cursor);
    }
    for (const member of path) resolved.add(member);
  }
}

/** Validate external project data before migration or storage replacement. */
export function validateBoard(value: unknown): asserts value is PersistedBoard {
  if (
    !record(value) ||
    typeof value.version !== 'number' ||
    ![1, 2, 3, 4].includes(value.version) ||
    !text(value.name, 200) ||
    !record(value.camera) ||
    !bounded(value.camera.scale, 0.15, 3) ||
    !finite(value.camera.x) ||
    !finite(value.camera.y)
  )
    throw new Error('This is not a Video Board project.');
  const videos = list(value.videos, 500, isVideo, 'Invalid video in project backup.');
  const stills = list(value.stills, 10_000, isStill, 'Invalid linked still in project backup.');
  const tracks =
    value.version >= 2 ? list(value.tracks, 10_000, isTrack, 'Invalid scrubber module.') : [];
  const clips =
    value.version >= 3 ? list(value.clips, 10_000, isClip, 'Invalid linked clip view.') : [];
  const panels =
    value.version >= 3 ? list(value.panels, 100, isPanel, 'Invalid codes module.') : [];
  const spaces =
    value.version === 4
      ? list(value.spaces, 1000, isSpace, 'Invalid evidence space in project backup.')
      : [];
  const codes =
    value.version >= 3 ? list(value.codes, 10_000, isCode, 'Invalid code in project backup.') : [];
  const quotes =
    value.version >= 3
      ? list(value.quotations, 100_000, isQuotation, 'Invalid quotation in project backup.')
      : [];
  const sources = new Map(videos.map((video) => [video.id, video]));
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const codeIds = new Set<string>(),
    quoteIds = new Set<string>(),
    moduleIds = new Set<string>();
  const originalAssets = new Set<string>();

  for (const video of videos) {
    for (const key of [video.id, ...video.thumbnails]) {
      register(originalAssets, key, 'Duplicate media identifier.');
      register(moduleIds, key, 'Duplicate media identifier.');
    }
  }
  for (const card of [...stills, ...tracks, ...clips, ...panels, ...spaces])
    register(moduleIds, card.id, 'Duplicate module identifier.');
  for (const code of codes) register(codeIds, code.id, 'Duplicate code identifier.');
  for (const quote of quotes) {
    register(quoteIds, quote.id, 'Duplicate quotation identifier.');
    const source = sources.get(quote.sourceId);
    if (
      !source ||
      !bounded(quote.start, 0, source.duration) ||
      !bounded(quote.end, quote.start, source.duration) ||
      (quote.kind === 'range' && quote.end <= quote.start) ||
      !quote.codeIds.every((id) => codeIds.has(id))
    ) {
      throw new Error('Invalid quotation in project backup.');
    }
    const parent = quote.parentId === undefined ? undefined : quoteById.get(quote.parentId);
    if (
      (quote.parentId !== undefined && (!parent || parent.sourceId !== quote.sourceId)) ||
      (quote.kind === 'region' &&
        (!parent ||
          parent.kind !== 'frame' ||
          Math.abs(parent.start - quote.start) > 0.00001 ||
          Math.abs(parent.end - quote.end) > 0.00001))
    ) {
      throw new Error('Invalid quotation source context.');
    }
  }
  acyclic(new Map(quotes.map((quote) => [quote.id, quote.parentId])), 'Cyclic quotation context.');
  const frameAssets = new Map<string, string>();
  for (const still of stills) {
    const source = sources.get(still.videoId);
    if (
      !source ||
      !bounded(still.time, 0, source.duration) ||
      !bounded(still.duration, 0, source.duration) ||
      originalAssets.has(stillAssetId(still))
    )
      throw new Error('Invalid linked still in project backup.');
    if (value.version < 3) continue;
    const frame = still.quotationId === undefined ? undefined : quoteById.get(still.quotationId);
    if (
      !frame ||
      frame.kind !== 'frame' ||
      frame.sourceId !== still.videoId ||
      Math.abs(frame.start - still.time) > 0.00001 ||
      Math.abs(frame.end - Math.min(source.duration, still.time + still.duration)) > 0.00001 ||
      (frameAssets.has(frame.id) && frameAssets.get(frame.id) !== stillAssetId(still))
    ) {
      throw new Error('Invalid still quotation.');
    }
    frameAssets.set(frame.id, stillAssetId(still));
  }
  for (const track of tracks)
    if (!sources.has(track.videoId)) throw new Error('Invalid scrubber source.');
  for (const clip of clips) {
    const quote = quoteById.get(clip.quotationId),
      source = sources.get(clip.videoId);
    if (
      !quote ||
      quote.kind !== 'range' ||
      !source ||
      quote.sourceId !== source.id ||
      !bounded(clip.time, 0, source.duration)
    ) {
      throw new Error('Invalid linked clip view.');
    }
  }
  for (const space of spaces) {
    if (space.codeId && !codeIds.has(space.codeId))
      throw new Error('Invalid collection code in project backup.');
    const members = new Set<string>();
    for (const item of space.items) {
      if (!quoteById.has(item.quotationId))
        throw new Error('Missing evidence quotation in project backup.');
      register(members, item.quotationId, 'Duplicate evidence in a space.');
    }
  }
  if (value.version >= 3)
    for (const source of videos) {
      const quote = quoteById.get(sourceQuotationId(source.id));
      if (
        !quote ||
        quote.sourceId !== source.id ||
        quote.kind !== 'video' ||
        quote.start !== 0 ||
        quote.end !== source.duration
      ) {
        throw new Error('Missing whole-video quotation.');
      }
    }
  const visible = new Map(
    [
      ...videos.filter((video) => !video.hidden),
      ...stills,
      ...tracks,
      ...clips,
      ...panels,
      ...spaces,
    ].map((card) => [card.id, card]),
  );
  const cards = [...videos, ...stills, ...tracks, ...clips, ...panels, ...spaces];
  for (const card of cards)
    if (card.dock && (!visible.has(card.dock.to) || card.dock.to === card.id)) {
      throw new Error('Invalid module docking.');
    }
  acyclic(new Map(cards.map((card) => [card.id, card.dock?.to])), 'Cyclic module docking.');
}
