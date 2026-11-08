import { describe, expect, it } from 'vitest';
import { validateExcerpt } from '../src/clipExport';

const media = new Blob(['original media']);
describe('bounded clip downloads', () => {
  it('accepts a source range without reading or mutating the original', () => {
    const source = new Blob(['video']),
      range = { start: 2.125, end: 62.125, duration: 90 };
    expect(() => validateExcerpt(source, range)).not.toThrow();
    expect(source.size).toBe(5);
    expect(range).toEqual({ start: 2.125, end: 62.125, duration: 90 });
  });

  it.each([
    { start: -1, end: 2, duration: 4 },
    { start: 2, end: 2, duration: 4 },
    { start: 3, end: 2, duration: 4 },
    { start: 1, end: 5, duration: 4 },
    { start: NaN, end: 2, duration: 4 },
    { start: 1, end: Infinity, duration: 4 },
  ])('rejects invalid bounds before loading a runtime: %j', (range) => {
    expect(() => validateExcerpt(media, range)).toThrow('valid clip range');
  });

  it('rejects empty media and applies the experiment limits before allocating a worker', () => {
    expect(() => validateExcerpt(new Blob(), { start: 0, end: 1, duration: 4 })).toThrow('empty');
    expect(() => validateExcerpt(media, { start: 0, end: 61, duration: 90 })).toThrow('60 seconds');
    const oversized = { size: 256 * 1024 * 1024 + 1 } as Blob;
    expect(() => validateExcerpt(oversized, { start: 0, end: 1, duration: 4 })).toThrow('256 MB');
  });
});
