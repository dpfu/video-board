import { Input, ALL_FORMATS, BlobSource, CanvasSink, AudioSampleSink } from 'mediabunny';
import type { Analysis, MediaRequest } from './media';
import { Scdet } from './scdet';
import { DEFAULT_CUT_THRESHOLD, rgbaToLuma, type SceneAnalysis } from './scenes';

const ctx = self as unknown as { onmessage: ((event: MessageEvent<MediaRequest>) => void) | null; postMessage: (value: unknown) => void };
const progress = (label: string) => ctx.postMessage({ progress: label });

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type = 'image/jpeg') {
  return (canvas as OffscreenCanvas).convertToBlob({ type, quality: .88 });
}

ctx.onmessage = async ({ data }) => {
  const input = new Input({ source: new BlobSource(data.blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode this video. Try an MP4 with H.264 video, or a WebM file.');
    const duration = await input.computeDuration();
    const start = await track.getFirstTimestamp();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable duration.');
    if (data.task === 'probe') {
      ctx.postMessage({ result: { duration, start, sourceWidth: await track.getDisplayWidth(), sourceHeight: await track.getDisplayHeight() } });
      return;
    }
    if (data.task === 'capture') {
      const sink = new CanvasSink(track, { poolSize: 1, ...(data.width ? { width: data.width } : {}) });
      // currentTime can round just below an exact frame boundary.
      const target = Math.round((data.time || 0) * 1e6) / 1e6 + .000001;
      const frame = await sink.getCanvas(Math.max(start, Math.min(duration - .000001, target)));
      if (!frame) throw new Error('No video frame was found at this time.');
      ctx.postMessage({ result: { blob: await toBlob(frame.canvas, 'image/png'), time: Math.max(0, frame.timestamp), duration: frame.duration } });
      return;
    }

    const scenes: SceneAnalysis = { algorithm: 'ffmpeg-scdet-v1', width: 160, height: 90, threshold: DEFAULT_CUT_THRESHOLD, times: [], scores: [] };
    const result: Analysis = { thumbnails: [], peaks: [], frameTimes: [], scenes };
    const detector = new Scdet();
    const sink = new CanvasSink(track, { width: 160, poolSize: 1 });
    let luma = new Uint8Array(0), nextThumbnail = 0, lastProgress = -1;
    // Decode sequentially once: every frame contributes to cut scores and frame
    // stepping; the same canvases supply thumbnails. Only one previous luma
    // plane is retained by the detector, never a collection of decoded frames.
    for await (const frame of sink.canvases()) {
      const { width, height } = frame.canvas;
      const pixels = frame.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!pixels) throw new Error('Scene detection could not read video pixels.');
      if (luma.length !== width * height) luma = new Uint8Array(width * height);
      rgbaToLuma(pixels.getImageData(0, 0, width, height).data, luma);
      const { score } = detector.push(luma, width, height);
      if (frame.timestamp >= 0 && frame.timestamp < duration) {
        scenes.width = width; scenes.height = height;
        scenes.times.push(frame.timestamp); scenes.scores.push(score);
        result.frameTimes.push(frame.timestamp);
      }
      if (data.task === 'analyze') while (nextThumbnail < 12 && frame.timestamp + frame.duration > Math.max(start, duration * nextThumbnail / 12)) {
        result.thumbnails.push(await toBlob(frame.canvas)); nextThumbnail++;
      }
      const percent = Math.min(100, Math.floor((frame.timestamp + frame.duration) / duration * 10) * 10);
      if (percent !== lastProgress) { progress(`Detecting cuts · ${percent}%`); lastProgress = percent; }
    }
    if (!scenes.times.length) throw new Error('No frames could be read for scene detection.');
    if (data.task === 'scenes') { ctx.postMessage({ result: scenes }); return; }
    progress('Reading audio');
    try {
      const audio = await input.getPrimaryAudioTrack();
      if (audio) {
        if (!(await audio.canDecode())) throw new Error('Audio waveform unavailable for this codec.');
        const peaks = new Float32Array(640);
        for await (const sample of new AudioSampleSink(audio).samples()) {
          try {
            const values = new Float32Array(sample.numberOfFrames);
            for (let channel = 0; channel < sample.numberOfChannels; channel++) {
              sample.copyTo(values, { format: 'f32-planar', planeIndex: channel });
              for (let i = 0; i < values.length; i++) {
                const t = sample.timestamp + i / sample.sampleRate;
                const bin = Math.floor(t / duration * peaks.length);
                if (bin >= 0 && bin < peaks.length) peaks[bin] = Math.min(1, Math.max(peaks[bin], Math.abs(values[i])));
              }
            }
          } finally { sample.close(); }
        }
        result.peaks = Array.from(peaks);
      } else result.note = 'No audio track';
    } catch (error) { result.note = error instanceof Error ? error.message : 'Audio waveform unavailable'; }
    ctx.postMessage({ result });
  } catch (error) {
    ctx.postMessage({ error: error instanceof Error ? error.message : 'This media file could not be read.' });
  } finally { input.dispose(); }
};
