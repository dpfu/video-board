import type { Board } from './model';
import { boardBoxes, clamp, HEADER, sourceQuotationId, stillAssetId, stillImageHeight, timecode, videoImageHeight } from './model';
import { shotAt, shotRanges } from './scenes';
import { captureFrame } from './media';

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}

// Paint the full layout model, including detached scrubbers, independent of viewport.
export async function exportBoard(board: Board, assets: Map<string, Blob>, players: Map<string, HTMLVideoElement>) {
  const boxes = boardBoxes(board);
  if (!boxes.length) throw new Error('Add a video before exporting the board.');
  const left = Math.min(...boxes.map(c => c.x)) - 32, top = Math.min(...boxes.map(c => c.y)) - 32;
  const width = Math.max(...boxes.map(c => c.x + c.width)) - left + 32;
  const height = Math.max(...boxes.map(c => c.y + c.height)) - top + 32;
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(12e6 / (width * height)));
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  ctx.scale(scale, scale); ctx.translate(-left, -top); ctx.fillStyle = '#292b2e'; ctx.fillRect(left, top, width, height);
  ctx.fillStyle = '#46494f';
  const step = 24 * Math.max(1, Math.ceil(.5 / scale));
  for (let y = Math.ceil(top / step) * step; y < top + height; y += step) for (let x = Math.ceil(left / step) * step; x < left + width; x += step) { ctx.beginPath(); ctx.arc(x, y, .7, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#78869a'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
  for (const still of [...board.stills, ...board.clips]) {
    const video = board.videos.find(v => v.id === still.videoId); if (!video || video.hidden) continue;
    ctx.beginPath(); ctx.moveTo(video.x + video.width / 2, video.y + 14); ctx.bezierCurveTo(video.x + video.width / 2, video.y - 40, still.x + still.width / 2, still.y - 40, still.x + still.width / 2, still.y + 14); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const card of [...boxes].sort((a, b) => a.z - b.z)) {
    const video = board.videos.find(v => v.id === card.id), still = board.stills.find(s => s.id === card.id), track = board.tracks.find(t => t.id === card.id), clip = board.clips.find(c => c.id === card.id), panel = board.panels.find(p => p.id === card.id);
    const source = video || board.videos.find(v => v.id === (still?.videoId || track?.videoId || clip?.videoId)); if (!source && !panel) continue;
    const quote = board.quotations.find(q => q.id === (clip?.quotationId || still?.quotationId || (video ? sourceQuotationId(video.id) : '')));
    ctx.save(); ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, 6); ctx.clip();
    ctx.fillStyle = '#34363a'; ctx.fillRect(card.x, card.y, card.width, card.height);
    const gradient = ctx.createLinearGradient(0, card.y, 0, card.y + HEADER); gradient.addColorStop(0, '#51555c'); gradient.addColorStop(1, '#41454b');
    ctx.fillStyle = gradient; ctx.fillRect(card.x, card.y, card.width, HEADER);
    ctx.fillStyle = '#e0e3e9'; ctx.font = '10px system-ui';
    ctx.fillText(panel ? 'Codes & quotations' : video ? video.name : still ? timecode(still.time) : clip ? quote?.title || 'Clip' : `${track!.kind === 'filmstrip' ? 'Frames' : track!.kind === 'cuts' ? 'Cuts' : 'Audio'} · ${source!.name}`, card.x + 9, card.y + 18, card.width - 18);
    if (panel) {
      let y = card.y + HEADER + 18;
      ctx.fillStyle = '#b4c7df'; ctx.font = '10px system-ui';
      for (const code of board.codes) {
        if (y > card.y + card.height - 15) break;
        ctx.fillStyle = code.color; ctx.fillRect(card.x + 9, y - 8, 7, 7);
        ctx.fillText(`${code.name} · ${board.quotations.filter(q => q.codeIds.includes(code.id)).length}`, card.x + 23, y, card.width - 32); y += 20;
      }
      ctx.fillStyle = '#a3b1c5'; ctx.font = '9px system-ui';
      ctx.fillText(`${board.quotations.length} quotations · ${board.codes.length} codes`, card.x + 9, card.y + card.height - 12, card.width - 18);
      ctx.restore(); ctx.strokeStyle = '#686c74'; ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, 6); ctx.stroke(); continue;
    }
    if (!source) { ctx.restore(); continue; }
    const time = players.get(clip?.id || source.id)?.currentTime ?? (clip ? quote!.start : source.time);
    if (video || still || clip) {
      const imageHeight = video ? videoImageHeight(video) : clip ? (clip.height ? clip.height - HEADER - 94 : clamp((clip.width - 2) * source.sourceHeight / source.sourceWidth, 100, 320)) : stillImageHeight(still!, source);
      let image: CanvasImageSource;
      if (video) {
        const player = players.get(video.id);
        if (!player || player.readyState < 2) throw new Error(`Wait for ${video.name} to load before exporting.`);
        image = player;
      } else if (clip) {
        const player = players.get(clip.id);
        if (player && player.readyState >= 2) image = player;
        else { const original = assets.get(source.id); if (!original) throw new Error('A source video is missing.'); image = await loadImage((await captureFrame(original, quote!.start)).blob); }
      } else {
        const blob = assets.get(stillAssetId(still!)); if (!blob) throw new Error('A linked still is missing.');
        image = await loadImage(blob);
      }
      ctx.fillStyle = '#121316'; ctx.fillRect(card.x, card.y + HEADER, card.width, imageHeight);
      const ratio = Math.min(card.width / source.sourceWidth, imageHeight / source.sourceHeight), w = source.sourceWidth * ratio, h = source.sourceHeight * ratio;
      ctx.drawImage(image, card.x + (card.width - w) / 2, card.y + HEADER + (imageHeight - h) / 2, w, h);
      if (still) for (const region of board.quotations.filter(q => q.kind === 'region' && q.parentId === still.quotationId)) {
        const r = region.rect!, color = board.codes.find(c => region.codeIds.includes(c.id))?.color || '#b8cde5';
        const rx = card.x + (card.width - w) / 2 + r.x * w, ry = card.y + HEADER + (imageHeight - h) / 2 + r.y * h;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(rx, ry, r.width * w, r.height * h);
        const label = region.title || region.codeIds.map(id => board.codes.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'Region';
        ctx.font = '8px system-ui'; const labelWidth = Math.min(w, ctx.measureText(label).width + 6);
        ctx.fillStyle = color; ctx.fillRect(rx, Math.max(card.y + HEADER, ry - 13), labelWidth, 12); ctx.fillStyle = '#202832'; ctx.fillText(label, rx + 3, Math.max(card.y + HEADER + 9, ry - 4), labelWidth - 6);
      }
      ctx.fillStyle = '#b4bdcb'; ctx.font = '10px system-ui';
      const codes = quote?.codeIds.map(id => board.codes.find(c => c.id === id)?.name).filter(Boolean).join(', ');
      ctx.fillText(clip ? `${timecode(quote!.start)}–${timecode(quote!.end)} · ${source.name}` : video ? `${timecode(time)}${codes ? ` · ${codes}` : ''}` : `${source.name}${codes ? ` · ${codes}` : ''}`, card.x + 9, card.y + HEADER + imageHeight + (video ? 23 : 14), card.width - 18);
      if (video) {
        const y = card.y + card.height - 11;
        ctx.fillStyle = '#22252a'; ctx.fillRect(card.x + 8, y, card.width - 16, 5);
        ctx.fillStyle = '#e5f0ff'; ctx.fillRect(card.x + 8 + time / source.duration * (card.width - 16), y - 2, 1, 9);
      }
    } else if (track) {
      const x = card.x + 6, y = card.y + HEADER + 18, w = card.width - 12, h = Math.max(8, card.height - HEADER - 25 - (track.kind === 'cuts' ? 22 : 0));
      const shots = shotRanges(source.scenes, source.duration, source.start), active = shotAt(shots, time);
      ctx.fillStyle = '#a0a5af'; ctx.font = '8px system-ui';
      for (const f of [0, .25, .5, .75, 1]) {
        const label = timecode(source.duration * f, false), labelW = ctx.measureText(label).width;
        ctx.fillText(label, x + f * w - (f === 1 ? labelW : f ? labelW / 2 : 0), y - 5);
      }
      ctx.fillStyle = '#22252b'; ctx.fillRect(x, y, w, h);
      if (track.kind === 'filmstrip' && source.thumbnails.length) {
        const thumbW = w / source.thumbnails.length;
        for (let i = 0; i < source.thumbnails.length; i++) {
          const blob = assets.get(source.thumbnails[i]); if (!blob) continue;
          const image = await loadImage(blob), cropW = Math.min(image.width, image.height * thumbW / h);
          ctx.drawImage(image, (image.width - cropW) / 2, 0, cropW, image.height, x + i * thumbW, y, thumbW, h);
        }
      } else if (track.kind === 'waveform' && source.peaks.length) {
        const max = Math.max(.001, ...source.peaks), middle = y + h / 2;
        ctx.beginPath();
        source.peaks.forEach((peak, i) => {
          const px = x + i / (source.peaks.length - 1) * w, py = middle - Math.sqrt(peak / max) * h * .43;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        for (let i = source.peaks.length - 1; i >= 0; i--) ctx.lineTo(x + i / (source.peaks.length - 1) * w, middle + Math.sqrt(source.peaks[i] / max) * h * .43);
        ctx.closePath(); ctx.fillStyle = '#a5b1c3'; ctx.fill();
      } else if (track.kind === 'cuts' && source.scenes) {
        shots.forEach((shot, i) => {
          const sx = x + shot.start / source.duration * w, sw = (shot.end - shot.start) / source.duration * w;
          ctx.fillStyle = i === active ? '#64768d' : i % 2 ? '#424851' : '#363c44'; ctx.fillRect(sx, y, Math.max(0, sw - 1), h);
          if (sw > 16) { ctx.fillStyle = '#d6dee9'; ctx.fillText(String(i + 1), sx + 4, y + h / 2 + 3, sw - 5); }
        });
        ctx.fillStyle = '#a0a5af'; ctx.fillText(`${shots.length} shots · threshold ${source.scenes.threshold}`, x, y + h + 16, w);
      } else { ctx.fillStyle = '#929ca9'; ctx.fillText(track.kind === 'cuts' ? 'Cut detection unavailable' : source.analysisNote || 'Processing…', x + 6, y + h / 2 + 3, w - 12); }
      if (track.kind !== 'cuts' && source.scenes) {
        ctx.fillStyle = '#b7c3d1'; for (const shot of shots.slice(1)) ctx.fillRect(x + shot.start / source.duration * w, y, .7, h);
      }
      ctx.fillStyle = '#e5f0ff'; ctx.fillRect(x + time / source.duration * w, y - 2, 1, h + 4);
    }
    ctx.restore(); ctx.strokeStyle = '#686c74'; ctx.beginPath(); ctx.roundRect(card.x, card.y, card.width, card.height, 6); ctx.stroke();
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png'));
}
