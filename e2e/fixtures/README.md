# Synthetic video fixture

`synthetic.webm` is a four-second, 320×180, 12 fps VP9/Opus clip generated
entirely from FFmpeg test sources. It contains a changing test pattern and a
440 Hz tone with varying amplitude; no research media or external downloads.
The committed fixture lets the browser suite run without FFmpeg installed.
No decoder, worker, waveform or IndexedDB operation is mocked in the browser.

`scenes.webm` is a five-second, 320×180, 12 fps silent VP9 clip: black, white,
moving test pattern, grey, then black. Its four hard cuts are at 1, 2, 3 and 4
seconds. Regenerate it and the native-score references with
`python3 scripts/generate-scene-fixtures.py` from the repository root.

To regenerate from the repository root with FFmpeg:

```sh
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i 'testsrc2=size=320x180:rate=12:duration=4' \
  -f lavfi -i 'aevalsrc=0.3*sin(2*PI*440*t)*(0.55+0.45*sin(2*PI*1.7*t)):s=48000:d=4' \
  -c:v libvpx-vp9 -crf 42 -b:v 0 -deadline realtime -cpu-used 8 \
  -c:a libopus -b:a 24k -shortest e2e/fixtures/synthetic.webm
```
