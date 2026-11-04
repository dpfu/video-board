import { Input, ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, AudioSampleSink } from 'mediabunny';
import type { Analysis, MediaRequest } from './media';

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
      const sink = new CanvasSink(track, { poolSize: 1 });
      // currentTime can round just below an exact frame boundary.
      const target = Math.round((data.time || 0) * 1e6) / 1e6 + .000001;
      const frame = await sink.getCanvas(Math.max(start, Math.min(duration - .000001, target)));
      if (!frame) throw new Error('No video frame was found at this time.');
      ctx.postMessage({ result: { blob: await toBlob(frame.canvas, 'image/png'), time: Math.max(0, frame.timestamp), duration: frame.duration } });
      return;
    }

    const result: Analysis = { thumbnails: [], peaks: [], frameTimes: [] };
    progress('Reading frame times');
    const packets = new EncodedPacketSink(track);
    for await (const packet of packets.packets(undefined, undefined, { metadataOnly: true })) {
      if (packet.timestamp >= 0 && packet.timestamp < duration) result.frameTimes.push(packet.timestamp);
    }
    result.frameTimes = [...new Set(result.frameTimes)].sort((a, b) => a - b);
    progress('Making thumbnails');
    const thumbSink = new CanvasSink(track, { width: 160, poolSize: 1 });
    const times = Array.from({ length: 12 }, (_, i) => Math.max(start, duration * i / 12));
    for await (const frame of thumbSink.canvasesAtTimestamps(times)) {
      if (!frame) continue;
      result.thumbnails.push(await toBlob(frame.canvas));
    }
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
