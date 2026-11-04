#!/usr/bin/env python3
"""Regenerate synthetic fixtures and native-FFmpeg scdet reference results."""
import json
from pathlib import Path
import re
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REVISION = '38b88335f99e76ed89ff3c93f877fdefce736c13'


def run(arguments):
    return subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *arguments],
                          cwd=ROOT, check=True, capture_output=True, text=True)


def reference(depth):
    width, height = 32, 18
    maximum = 2 ** depth - 1
    levels = [0, 0, 1, 1, 0, 0, 1, 0, 0, .25, .5, .75, 1, 1]
    frames = [[round(level * maximum)] * (width * height) for level in levels]
    # Sustained motion, repeated frames and small changes supplement hard cuts,
    # a one-frame flash and a gradual brightness ramp.
    for offset in [0, 1, 2, 3, 3, 4, 8, 9]:
        frames.append([round(((x + offset) % width) / (width - 1) * maximum)
                       for _ in range(height) for x in range(width)])
    directory = ROOT / 'tests/fixtures'
    directory.mkdir(parents=True, exist_ok=True)
    raw = directory / f'scdet-gray{depth}.raw'
    flat = [value for frame in frames for value in frame]
    raw.write_bytes(bytes(flat) if depth == 8 else struct.pack('<' + 'H' * len(flat), *flat))
    metadata = ROOT / f'tmp/scene-detection/reference-gray{depth}.txt'
    metadata.parent.mkdir(parents=True, exist_ok=True)
    native_input, pixel_format = raw, 'gray'
    if depth > 8:
        # FFmpeg 8.1.2's scdet accepts 10-bit YUV but not gray10le. Feed the
        # exact Y samples with neutral chroma; allowing an automatic grey→YUV
        # conversion would change their range and invalidate numerical parity.
        native_input, pixel_format = metadata.with_suffix('.yuv'), f'yuv444p{depth}le'
        chroma = [2 ** (depth - 1)] * (width * height * 2)
        native_input.write_bytes(b''.join(struct.pack('<' + 'H' * (len(frame) + len(chroma)), *(frame + chroma)) for frame in frames))
    run(['-f', 'rawvideo', '-pixel_format', pixel_format,
         '-video_size', f'{width}x{height}', '-framerate', '12', '-i', str(native_input),
         '-vf', f'scdet=threshold=10,metadata=mode=print:file={metadata.relative_to(ROOT)}', '-f', 'null', '-'])
    scores = []
    for line in metadata.read_text().splitlines():
        if re.match(r'frame:\d+', line):
            scores.append({'mafd': 0, 'score': 0, 'cut': False})
        elif line.startswith('lavfi.scd.mafd='):
            scores[-1]['mafd'] = float(line.split('=', 1)[1])
        elif line.startswith('lavfi.scd.score='):
            scores[-1]['score'] = float(line.split('=', 1)[1])
        elif line.startswith('lavfi.scd.time='):
            scores[-1]['cut'] = True
    assert len(scores) == len(frames), (len(scores), len(frames))
    version = subprocess.run(['ffmpeg', '-version'], check=True, capture_output=True, text=True).stdout.splitlines()[0]
    data = {'sourceRevision': REVISION, 'generatedWith': version, 'width': width, 'height': height,
            'depth': depth, 'threshold': 10, 'frames': scores}
    raw.with_suffix('.json').write_text(json.dumps(data, indent=2) + '\n')


def browser_video():
    sources = ['color=c=black', 'color=c=white', 'testsrc2', 'color=c=gray', 'color=c=black']
    arguments = []
    for source in sources:
        arguments += ['-f', 'lavfi', '-i', f'{source}:size=320x180:rate=12:duration=1' if source.startswith('color')
                      else 'testsrc2=size=320x180:rate=12:duration=1']
    run([*arguments, '-filter_complex', '[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0[v]',
         '-map', '[v]', '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-deadline', 'realtime',
         '-cpu-used', '8', '-an', 'e2e/fixtures/scenes.webm'])


if __name__ == '__main__':
    reference(8)
    reference(10)
    browser_video()
    print('Generated 8/10-bit native references and a five-shot browser clip.')
