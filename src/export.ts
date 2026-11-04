import type { Board } from './model';
import { boardBoxes, stillImageHeight, timecode, videoImageHeight } from './model';

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}

// Adapted from Folder Sort: export the full model, with bounded canvas dimensions.
export async function exportBoard(board: Board, assets: Map<string, Blob>, players: Map<string, HTMLVideoElement>) {
  const boxes = boardBoxes(board);
  if (!boxes.length) throw new Error('Add a video before exporting the board.');
  const left = Math.min(...boxes.map(c => c.x)) - 40, top = Math.min(...boxes.map(c => c.y)) - 40;
  const width = Math.max(...boxes.map(c => c.x + c.width)) - left + 40;
  const height = Math.max(...boxes.map(c => c.y + c.height)) - top + 40;
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(12e6 / (width * height)));
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  ctx.scale(scale, scale); ctx.translate(-left, -top); ctx.fillStyle = '#18221e'; ctx.fillRect(left, top, width, height);
  ctx.fillStyle = '#34483c';
  const step = 24 * Math.max(1, Math.ceil(.5 / scale));
  for (let y = Math.ceil(top / step) * step; y < top + height; y += step) for (let x = Math.ceil(left / step) * step; x < left + width; x += step) { ctx.beginPath(); ctx.arc(x, y, .8, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#739b81'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
  for (const still of board.stills) {
    const video = board.videos.find(v => v.id === still.videoId);
    if (!video) continue;
    ctx.beginPath(); ctx.moveTo(video.x + video.width / 2, video.y + 18); ctx.bezierCurveTo(video.x + video.width / 2, video.y - 40, still.x + still.width / 2, still.y - 40, still.x + still.width / 2, still.y + 18); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const card of [...boxes].sort((a, b) => a.z - b.z)) {
    const video = board.videos.find(v => v.id === card.id);
    const still = board.stills.find(s => s.id === card.id);
    const source = video || board.videos.find(v => v.id === still?.videoId);
    if (!source) continue;
    ctx.save(); ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, 10); ctx.clip();
    ctx.fillStyle = '#111c17'; ctx.fillRect(card.x, card.y, card.width, card.height);
    ctx.fillStyle = '#203329'; ctx.fillRect(card.x, card.y, card.width, 36);
    ctx.fillStyle = '#e2ede5'; ctx.font = '12px system-ui'; ctx.fillText(video ? video.name : timecode(still!.time), card.x + 12, card.y + 23, card.width - 24);
    const imageHeight = video ? videoImageHeight(video) : stillImageHeight(still!, source);
    ctx.fillStyle = '#080e0b'; ctx.fillRect(card.x, card.y + 36, card.width, imageHeight);
    let image: CanvasImageSource;
    if (video) {
      const player = players.get(video.id);
      if (!player || player.readyState < 2) throw new Error(`Wait for ${video.name} to load before exporting.`);
      image = player;
    } else {
      const blob = assets.get(still!.id);
      if (!blob) throw new Error('A linked still is missing.');
      image = await loadImage(blob);
    }
    const ratio = Math.min(card.width / source.sourceWidth, imageHeight / source.sourceHeight);
    const w = source.sourceWidth * ratio, h = source.sourceHeight * ratio;
    ctx.drawImage(image, card.x + (card.width - w) / 2, card.y + 36 + (imageHeight - h) / 2, w, h);
    ctx.fillStyle = '#acc1b1'; ctx.font = '11px system-ui';
    if (video) {
      const time = players.get(video.id)?.currentTime ?? video.time;
      ctx.fillText(timecode(time), card.x + 12, card.y + 36 + imageHeight + 26);
      let trackY = card.y + 36 + imageHeight + 46 + 26;
      const trackX = card.x + 12, trackW = card.width - 24;
      ctx.fillStyle = '#7f9b8a'; ctx.font = '9px system-ui';
      for (const f of [0, .25, .5, .75, 1]) {
        const label = timecode(video.duration * f, false);
        ctx.fillText(label, trackX + trackW * f - (f === 1 ? ctx.measureText(label).width : f ? ctx.measureText(label).width / 2 : 0), trackY - 9);
      }
      const trackTop = trackY;
      if (video.showFilmstrip) {
        ctx.fillStyle = '#1a2b20'; ctx.fillRect(trackX, trackY, trackW, 46);
        const thumbW = trackW / video.thumbnails.length;
        for (let i = 0; i < video.thumbnails.length; i++) {
          const blob = assets.get(video.thumbnails[i]);
          if (blob) {
            const thumb = await loadImage(blob), cropW = Math.min(thumb.width, thumb.height * thumbW / 46);
            ctx.drawImage(thumb, (thumb.width - cropW) / 2, 0, cropW, thumb.height, trackX + i * thumbW, trackY, thumbW, 46);
          }
        }
        trackY += 46;
      }
      if (video.showWaveform) {
        ctx.fillStyle = '#14251c'; ctx.fillRect(trackX, trackY, trackW, 42);
        if (video.peaks.length) {
          const max = Math.max(.001, ...video.peaks), middle = trackY + 21;
          ctx.beginPath();
          video.peaks.forEach((peak, i) => {
            const x = trackX + i / (video.peaks.length - 1) * trackW, y = middle - Math.sqrt(peak / max) * 17;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          for (let i = video.peaks.length - 1; i >= 0; i--) ctx.lineTo(trackX + i / (video.peaks.length - 1) * trackW, middle + Math.sqrt(video.peaks[i] / max) * 17);
          ctx.closePath(); ctx.fillStyle = '#82ae94'; ctx.fill();
        } else { ctx.fillStyle = '#809e8b'; ctx.fillText(video.analysisNote || 'Waveform unavailable', trackX + 8, trackY + 24, trackW - 16); }
        trackY += 42;
      }
      if (!video.showFilmstrip && !video.showWaveform) trackY += 10;
      const playhead = trackX + time / video.duration * trackW;
      ctx.strokeStyle = '#d1f7dd'; ctx.beginPath(); ctx.moveTo(playhead, trackTop - 3); ctx.lineTo(playhead, trackY + 3); ctx.stroke();
    } else ctx.fillText(source.name, card.x + 10, card.y + card.height - 10, card.width - 20);
    ctx.restore(); ctx.strokeStyle = '#3f5949'; ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, 10); ctx.stroke();
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png'));
}
