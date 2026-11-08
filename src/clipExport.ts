import { safeFilename } from './download';

export const CLIP_EXPORT_SECONDS = 60;
export const CLIP_EXPORT_BYTES = 256 * 1024 * 1024;
export type ClipExcerpt = { start: number; end: number; duration: number };

export function validateExcerpt(blob: Blob, excerpt: ClipExcerpt) {
  const { start, end, duration } = excerpt;
  if (
    ![start, end, duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > duration + 0.000001
  )
    throw new Error('Choose a valid clip range before exporting.');
  if (end - start > CLIP_EXPORT_SECONDS)
    throw new Error(
      `For this experiment, trim the clip to ${CLIP_EXPORT_SECONDS} seconds or less.`,
    );
  if (!blob.size) throw new Error('The original video is empty.');
  if (blob.size > CLIP_EXPORT_BYTES)
    throw new Error('This export experiment supports original videos up to 256 MB.');
}

/** Accurate seeking/re-encoding, not a keyframe-aligned stream copy. */
export function clipExportArgs({ start, end }: ClipExcerpt) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-seek_timestamp',
    '1',
    '-ss',
    start.toFixed(6),
    '-i',
    '/input/source',
    '-t',
    (end - start).toFixed(6),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-threads',
    '1',
    '/clip.mp4',
  ];
}

export function clipFilename(name: string, start: number, end: number) {
  const stamp = (time: number) => time.toFixed(3).replace('.', '-');
  return `${safeFilename(name.replace(/\.[a-z0-9]{2,5}$/i, ''))}-${stamp(start)}-${stamp(end)}.mp4`;
}
