# Place music: pastoral / ambient edition

Original compositions and arrangements: `scripts/compose-place-midi.mjs`.
Broad direction: an unhurried village, soft acoustic instruments, isolated piano phrases and room to breathe. No music from Stardew Valley or Minecraft is sampled or transcribed.

## Main instruments

**FreePats Upright Piano KW, 2022-02-21**: Kawai upright piano recorded by Gonzalo and Roberto, January 2017. Edited by Roberto. CC0 1.0.
- https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- Official release: https://github.com/freepats/upright-piano-KW/releases/tag/v1.0.0
- Download: `UprightPianoKW-20220221.zip`
- ZIP SHA-256: `3d602dcff94bcf9fb9b2d78df8c689814c895fd2776ee104a95b73c44bdc7e18`

**FreePats Spanish Classical Guitar, 2019-06-18**: recorded and edited by Roberto, 2008. CC0 1.0.
- https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
- Official release: https://github.com/freepats/spanish-classical-guitar/releases/tag/v1.0.0
- Download: `SpanishClassicalGuitar-20190618.zip`
- ZIP SHA-256: `173f775222991061291767724d57c7c21242a3c3254407b266aabd548df23dbb`

The original SFZ banks are rendered directly with official sfizz 1.2.3, 44.1 kHz, resampling quality 8. These are separate piano/guitar recordings, replacing the earlier General MIDI lead instruments. Their quiet attacks and release recordings remain audible; no blanket low-pass is applied.

## Very quiet supporting instruments

GeneralUser GS 2.0.3 by S. Christian Collins: occasional bass, warm ambient texture, celesta and soft casino brush. Rendered separately by official FluidSynth 2.6.3. No brass, flute lead, marching drums or constant walking bass in this edition.
- https://www.schristiancollins.com/generaluser
- https://github.com/mrbumpy409/GeneralUser-GS
- License: https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt
- SF2 SHA-256: `9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe`
- The license permits music creation and distributing resulting recordings. The bank itself is not bundled.

## Reproduction and mastering

`scripts/render-place-music.py` orchestrates Node, sfizz, FluidSynth and FFmpeg. Its `--tools` directory contains `piano/`, `guitar/`, `sfizz/bin/Release/sfizz_render.exe`, `fluidsynth/<release>/bin/fluidsynth.exe`, and `GeneralUser-GS.sf2`. `--build` is a separate temporary directory. `--ffmpeg` selects the local encoder. `--master-only` reuses existing stems.

Three cycles are rendered; the middle cycle is extracted to preserve tails. The mix uses fixed piano/guitar/texture weights of 1 / 0.85 / 0.65, a 30 Hz infrasonic high-pass, and fixed overall gain. LUFS is measured only; the loudnorm filter is not applied to the recording. There is no dynamic loudness riding or bus compressor in the files. Quiet passages remain quiet. Targets are town/forge -22 LUFS, casino -23, fortune -24, capped at -2 dBTP before encoding. Vorbis quality 6, 44.1 kHz. The game retains its user volume controls, effect ducking and safety limiter.

Place-file loading failures keep the previous track (or silence if nothing is playing) rather than substituting the rejected oscillator score. Legacy manual sound concepts still use their own recipes.
