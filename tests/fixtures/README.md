# Native scdet references

`scdet-gray8.raw` and `scdet-gray10.raw` contain generated, tightly packed 32×18
grayscale frames (10-bit samples are little-endian unsigned 16-bit integers).
Their JSON companions are metadata emitted by native FFmpeg 8.1.2's `scdet`
filter, not by the TypeScript implementation. They cover holds, hard cuts,
rapid alternating frames/a flash, a brightness ramp and sustained motion.
The 10-bit reference feeds those same Y samples in YUV444P10 with neutral chroma,
avoiding implicit range conversion; scdet compares only Y for planar YUV.

The unit suite compares every MAFD, score and threshold decision with those
references. Metadata has three decimal places. Tests need no installed FFmpeg.
Regenerate both references and the browser scene fixture from the repo root:

```sh
python3 scripts/generate-scene-fixtures.py
```

The script documents the raw sources and full FFmpeg invocation. The port is
pinned to FFmpeg revision `38b88335f99e76ed89ff3c93f877fdefce736c13` (n8.1.2).
Downscaling and RGB-to-luma conversion in the browser are separate preprocessing;
scores from that path need not equal FFmpeg run on an original YUV file.
