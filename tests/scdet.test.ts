import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Scdet } from '../src/scdet';
import { rgbaToLuma, shotAt, shotRanges, type SceneAnalysis } from '../src/scenes';

it.each([8, 10])('matches native FFmpeg on every %i-bit reference frame, including cuts, motion, flash and ramp', depth => {
  const metadata = JSON.parse(readFileSync(new URL(`./fixtures/scdet-gray${depth}.json`, import.meta.url), 'utf8')) as {
    width: number; height: number; threshold: number; frames: { mafd: number; score: number; cut: boolean }[];
  };
  const bytes = readFileSync(new URL(`./fixtures/scdet-gray${depth}.raw`, import.meta.url));
  const detector = new Scdet(depth), size = metadata.width * metadata.height;
  expect(bytes.length).toBe(metadata.frames.length * size * (depth > 8 ? 2 : 1));
  metadata.frames.forEach((expected, frame) => {
    const samples = depth === 8 ? bytes.subarray(frame * size, (frame + 1) * size)
      : Uint16Array.from({ length: size }, (_, i) => bytes.readUInt16LE((frame * size + i) * 2));
    const actual = detector.push(samples, metadata.width, metadata.height);
    // FFmpeg prints its metadata to three decimal places.
    expect(Math.abs(actual.mafd - expected.mafd), `MAFD at frame ${frame}`).toBeLessThanOrEqual(.000501);
    expect(Math.abs(actual.score - expected.score), `score at frame ${frame}`).toBeLessThanOrEqual(.000501);
    expect(actual.score >= metadata.threshold, `cut at frame ${frame}`).toBe(expected.cut);
  });
});

it('owns the previous pixels when a canvas buffer is reused, and uses 256 rather than 255 for 8-bit normalization', () => {
  const detector = new Scdet(), pixels = Buffer.alloc(4);
  expect(detector.push(pixels, 2, 2)).toEqual({ mafd: 0, score: 0 });
  pixels.fill(64);
  expect(detector.push(pixels, 2, 2)).toEqual({ mafd: 25, score: 25 });
  pixels.fill(128);
  expect(detector.push(pixels, 2, 2)).toEqual({ mafd: 25, score: 0 });
});

it('skips a geometry change even with the same pixel count, retaining FFmpeg’s previous-change state', () => {
  const detector = new Scdet();
  detector.push(new Uint8Array(4), 2, 2);
  detector.push(new Uint8Array(4).fill(64), 2, 2);
  expect(detector.push(new Uint8Array(4), 1, 4)).toEqual({ mafd: 25, score: 0 });
  expect(detector.push(new Uint8Array(4).fill(64), 1, 4)).toEqual({ mafd: 25, score: 0 });
});

it('supports full-range 16-bit sample normalization without integer overflow', () => {
  const detector = new Scdet(16);
  detector.push(new Uint16Array(16), 4, 4);
  expect(detector.push(new Uint16Array(16).fill(65535), 4, 4).score).toBe(Math.fround(65535 / 65536 * 100));
});

it('uses the threshold inclusively and assigns the boundary frame to the following shot', () => {
  const detector = new Scdet();
  detector.push(new Uint8Array(5), 5, 1);
  const { score } = detector.push(new Uint8Array([26, 26, 26, 25, 25]), 5, 1);
  expect(score).toBe(10);
  const analysis: SceneAnalysis = { algorithm: 'ffmpeg-scdet-v1', width: 5, height: 1, threshold: 10, times: [0, 1, 2, 3], scores: [0, score, 8, 80] };
  const shots = shotRanges(analysis, 3);
  expect(shots).toEqual([{ start: 0, end: 1 }, { start: 1, end: 3 }]);
  expect(shotAt(shots, 1 - .001)).toBe(0);
  expect(shotAt(shots, 1)).toBe(1);
  expect(shotAt(shots, 3)).toBe(1);
  expect(shotRanges({ ...analysis, threshold: 11 }, 3)).toEqual([{ start: 0, end: 3 }]);
  expect(analysis.scores).toEqual([0, 10, 8, 80]);
});

it('keeps uncut and not-yet-analysed videos as one range, including nonzero source starts', () => {
  expect(shotRanges(undefined, 4, .2)).toEqual([{ start: .2, end: 4 }]);
  expect(shotRanges(undefined, 0)).toEqual([]);
});

it('converts canvas RGB to luma independently of its alpha channel', () => {
  const luma = new Uint8Array(4);
  rgbaToLuma(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 0, 255]), luma);
  expect([...luma]).toEqual([0, 255, 77, 149]);
});
