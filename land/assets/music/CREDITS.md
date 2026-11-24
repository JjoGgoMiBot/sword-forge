# Place music, sampled-instrument edition

Original compositions and MIDI arrangements: `scripts/compose-place-midi.mjs`.
Each piece has 32 bars, with contrasting phrases, call/response and a return.

Instruments: GeneralUser GS 2.0.3 by S. Christian Collins.
- Author: https://www.schristiancollins.com/generaluser
- Official source: https://github.com/mrbumpy409/GeneralUser-GS
- License: https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt
- SF2 SHA-256: `9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe`
- The author's license permits using the bank for music creation and distributing resulting recordings. The SoundFont itself is not bundled here.

Renderer: official FluidSynth 2.6.3, 44.1 kHz stereo; chorus disabled, room size 0.28, reverb level 0.18, synth gain 0.7. Three cycles were rendered and the middle cycle extracted, preserving the preceding loop's release/reverb instead of fading each repetition in from silence.

Mastering: 35 Hz high-pass, broad -1.5 dB correction at 300 Hz, loudness targets town/forge -21 LUFS, casino -22 LUFS, fortune -23 LUFS; -1.5 dBTP target. Vorbis quality 6, 44.1 kHz. No blanket high-frequency low-pass or muffling filter. Runtime Web Audio still applies the existing user volume controls, ducking and safety limiter.

The lightweight oscillator score in `land/sound/score.js` remains an emergency fallback when a recording cannot be loaded. It is not the sampled arrangement.
