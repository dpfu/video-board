import { expect, it } from 'vitest';
import { migrateBoard, type LegacyBoard } from '../src/model';
import { boardFixture } from './board';

it('opens a v1 project with docked modules while preserving media references, still times and the old snapshot', () => {
  const { tracks: _, ...base } = boardFixture();
  const legacy: LegacyBoard = { ...base, version: 1 };
  const before = structuredClone(legacy);
  const migrated = migrateBoard(legacy);
  expect(migrated.version).toBe(2);
  expect(migrated.videos).toEqual(before.videos);
  expect(migrated.stills).toEqual(before.stills);
  expect(migrated.tracks.map(t => [t.kind, t.videoId, t.dock?.to, t.y])).toEqual([
    ['filmstrip', 'video', 'video', 305], ['waveform', 'video', 'video-filmstrip', 414],
  ]);
  expect(legacy).toEqual(before);
});

it('does not reintroduce a scrubber that was hidden in a v1 project', () => {
  const { tracks: _, ...base } = boardFixture();
  const legacy: LegacyBoard = { ...base, version: 1, videos: [{ ...base.videos[0], showFilmstrip: false }] };
  const migrated = migrateBoard(legacy);
  expect(migrated.tracks).toHaveLength(1);
  expect(migrated.tracks[0]).toMatchObject({ kind: 'waveform', dock: { to: 'video', side: 'bottom' } });
});
