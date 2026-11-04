/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * TypeScript port of get_scene_score in FFmpeg libavfilter/vf_scdet.c
 * and the scalar SAD loop in libavfilter/scene_sad.c, revision
 * 38b88335f99e76ed89ff3c93f877fdefce736c13 (n8.1.2).
 * Modified 2026-11-04: typed-array input, caller-supplied dimensions,
 * reusable previous-frame buffer; FFmpeg filter/format plumbing omitted.
 *
 * FFmpeg is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FFmpeg is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * A copy is provided in public/licenses/ffmpeg/COPYING.LGPLv2.1.
 */

export type ScdetScore = { mafd: number; score: number };

/** Scalar scdet for tightly packed, equally weighted 8–16 bit sample planes. */
export class Scdet {
  private previous?: Uint8Array | Uint16Array;
  private previousWidth = 0;
  private previousHeight = 0;
  private previousMafd = 0;

  constructor(private readonly bitDepth = 8) {
    if (!Number.isInteger(bitDepth) || bitDepth < 8 || bitDepth > 16) throw new Error('scdet needs an 8–16 bit sample depth.');
  }

  push(samples: Uint8Array | Uint16Array, width: number, height: number): ScdetScore {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height !== samples.length) throw new Error('scdet needs a complete, tightly packed frame.');
    if ((this.bitDepth > 8) !== (samples instanceof Uint16Array)) throw new Error('scdet sample storage does not match its bit depth.');
    let score = 0;
    if (this.previous && width === this.previousWidth && height === this.previousHeight) {
      let sad = 0;
      for (let i = 0; i < samples.length; i++) sad += Math.abs(samples[i] - this.previous[i]);
      // FFmpeg normalizes by 2^depth, not by the maximum sample value.
      const mafd = sad * 100 / samples.length / 2 ** this.bitDepth;
      score = Math.max(0, Math.min(100, Math.fround(Math.min(mafd, Math.abs(mafd - this.previousMafd)))));
      this.previousMafd = mafd;
    }
    if (!this.previous || this.previous.length !== samples.length) this.previous = this.bitDepth > 8 ? new Uint16Array(samples) : new Uint8Array(samples);
    else this.previous.set(samples);
    this.previousWidth = width; this.previousHeight = height;
    return { mafd: this.previousMafd, score };
  }
}
