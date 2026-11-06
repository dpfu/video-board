import { readFile } from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';

/** Observe decoded-frame progress and an actual backward wrap, not elapsed wall time. */
export async function expectPreviewLoop(locator: Locator, start: number, end: number) {
  const observation = await locator.evaluate(
    async (element, { start, end }) => {
      const video = element as HTMLVideoElement;
      return new Promise<{ progressed: boolean; wrapped: boolean; min: number; max: number }>(
        (resolve, reject) => {
          let previous: number | undefined, frame: number | undefined;
          let progressed = false,
            min = Infinity,
            max = -Infinity;
          const cleanup = () => {
            clearTimeout(timeout);
            if (frame !== undefined) video.cancelVideoFrameCallback(frame);
            video.removeEventListener('error', fail);
          };
          const fail = () => {
            cleanup();
            reject(new Error(video.error?.message || 'Preview decoding failed.'));
          };
          const timeout = setTimeout(() => {
            cleanup();
            reject(
              new Error(
                `No complete preview loop observed: ${JSON.stringify({ progressed, min, max, start, end, paused: video.paused })}`,
              ),
            );
          }, 6000);
          const sample = (_: number, metadata: VideoFrameCallbackMetadata) => {
            const time = metadata.mediaTime;
            min = Math.min(min, time);
            max = Math.max(max, time);
            if (previous !== undefined && time > previous + 0.01) progressed = true;
            if (progressed && previous !== undefined && previous - time > (end - start) / 2) {
              cleanup();
              resolve({ progressed, wrapped: true, min, max });
              return;
            }
            previous = time;
            frame = video.requestVideoFrameCallback(sample);
          };
          video.addEventListener('error', fail, { once: true });
          frame = video.requestVideoFrameCallback(sample);
        },
      );
    },
    { start, end },
  );
  expect(observation.progressed, 'The preview decoded advancing frames').toBe(true);
  expect(observation.wrapped, 'The preview returned to its in-point').toBe(true);
  // Retain the existing 100 ms browser-transport tolerance; the stronger
  // assertion is actual decoded progress and wrapping, not frame-exact playback.
  expect(observation.min).toBeGreaterThanOrEqual(start - 0.1);
  expect(observation.max).toBeLessThanOrEqual(end + 0.1);
}

/** Decode the actual downloaded PNG; saturated fixture pixels distinguish evidence from UI. */
export async function pngColorBands(page: Page, path: string) {
  const data = (await readFile(path)).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG inspection needs a canvas context.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bands = [0, 0, 0];
    for (let pixel = 0; pixel < pixels.length; pixel += 4) {
      const r = pixels[pixel],
        g = pixels[pixel + 1],
        b = pixels[pixel + 2];
      if (Math.max(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) > 100) {
        const row = Math.floor(pixel / 4 / canvas.width);
        bands[Math.min(2, Math.floor((row / canvas.height) * 3))]++;
      }
    }
    return { width: canvas.width, height: canvas.height, bands };
  }, data);
}
