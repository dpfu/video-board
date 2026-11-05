export const DEFAULT_CUT_THRESHOLD = 10;
export type SceneAnalysis = {
  algorithm: 'ffmpeg-scdet-v1';
  width: number;
  height: number;
  threshold: number;
  times: number[];
  scores: number[];
};
export type Shot = { start: number; end: number };

/** Cut time belongs to the first frame of the next shot; ranges are [start, end). */
export function shotRanges(
  analysis: SceneAnalysis | undefined,
  duration: number,
  start = 0,
): Shot[] {
  const beginning = Math.max(0, start);
  if (duration <= beginning) return [];
  const boundaries = [beginning];
  if (analysis)
    for (let i = 0; i < analysis.times.length; i++) {
      const time = analysis.times[i];
      if (
        analysis.scores[i] >= analysis.threshold &&
        time > boundaries[boundaries.length - 1] &&
        time < duration
      )
        boundaries.push(time);
    }
  boundaries.push(duration);
  return boundaries.slice(0, -1).map((time, i) => ({ start: time, end: boundaries[i + 1] }));
}

export function shotAt(shots: Shot[], time: number) {
  return Math.max(
    0,
    shots.findIndex((shot, i) => time < shot.end || i === shots.length - 1),
  );
}

/** Canvas RGB → full-range 8-bit luma. This preprocessing is separate from scdet. */
export function rgbaToLuma(rgba: Uint8ClampedArray, output: Uint8Array) {
  for (let i = 0, p = 0; p < output.length; p++, i += 4)
    output[p] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2] + 128) >> 8;
}
