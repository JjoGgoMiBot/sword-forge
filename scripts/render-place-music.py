"""Render the original pastoral music with official FreePats SFZ instruments.

Requires Node, sfizz_render 1.2.3, FluidSynth 2.6.3 and FFmpeg.
The tools directory layout and upstream URLs are documented in music/CREDITS.md.
No real-time driver or audio-device access is needed.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--tools', type=Path, required=True)
parser.add_argument('--build', type=Path, required=True)
parser.add_argument('--ffmpeg', type=Path, required=True)
parser.add_argument('--master-only', action='store_true')
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
tools, build = args.tools.resolve(), args.build.resolve()
build.mkdir(parents=True, exist_ok=True)

def run(command):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Command failed: ' + str(command[0]) + '\n' + result.stderr[-2000:])
    return result.stderr

if not args.master_only:
    run(['node', repo/'scripts/compose-place-midi.mjs', build])
pieces = json.loads((build/'arrangements.json').read_text())
if not args.master_only:
    sfizz = tools/'sfizz/bin/Release/sfizz_render.exe'
    fluid = next((tools/'fluidsynth').glob('**/bin/fluidsynth.exe'))
    for piece in pieces:
        name = piece['id']
        for stem, sfz in [('piano', 'piano/UprightPianoKW-20220221.sfz'), ('guitar', 'guitar/SpanishClassicalGuitar-20190618.sfz')]:
            run([sfizz, '--sfz', tools/sfz, '--midi', build/(name+'-'+stem+'.mid'), '--wav', build/(name+'-'+stem+'.wav'), '-s', '44100', '-q', '8', '--use-eot'])
        run([fluid, '-ni', '-F', build/(name+'-texture.wav'), '-T', 'wav', '-r', '44100', '-g', '.7', '-o', 'synth.reverb.active=1', '-o', 'synth.reverb.room-size=.35', '-o', 'synth.reverb.level=.16', '-o', 'synth.chorus.active=0', tools/'GeneralUser-GS.sf2', build/(name+'-texture.mid')])
output = repo/'land/assets/music'
report = []
for piece in pieces:
    name, duration = piece['id'], piece['duration']
    count = round(duration*44100)
    inputs = []
    for stem in ['piano', 'guitar', 'texture']:
        inputs += ['-i', build/(name+'-'+stem+'.wav')]
    # Fixed stem balance and fixed gain: a quiet phrase stays quiet. No compressor,
    # dynamic loudness riding, blanket low-pass, or artificial all-instrument hall.
    graph = f'[0:a]volume=1[p];[1:a]volume=.85[g];[2:a]volume=.65[t];[p][g][t]amix=inputs=3:duration=longest:normalize=0,atrim=start={duration}:end={duration*2},asetpts=PTS-STARTPTS,highpass=f=30,aresample=44100,atrim=end_sample={count},apad=whole_len={count}[mix]'
    mix = build/(name+'-mix.wav')
    run([args.ffmpeg, '-hide_banner', '-y', *inputs, '-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_f32le', mix])
    meter = run([args.ffmpeg, '-hide_banner', '-i', mix, '-af', 'loudnorm=I=-22:TP=-2:LRA=14:print_format=json', '-f', 'null', '-'])
    values = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', meter)[-1])
    target = {'town':-22, 'casino':-23, 'forge':-22, 'fortune':-24}[name]
    gain = min(target-float(values['input_i']), -2-float(values['input_tp']))
    run([args.ffmpeg, '-hide_banner', '-y', '-i', mix, '-af', f'volume={gain}dB,atrim=end_sample={count},asetpts=PTS-STARTPTS', '-c:a', 'libvorbis', '-q:a', '6', output/(name+'.ogg')])
    report.append({'id':name, 'duration':duration, 'inputLUFS':float(values['input_i']), 'fixedGainDb':gain, 'estimatedLUFS':float(values['input_i'])+gain, 'inputLRA':float(values['input_lra']), 'estimatedTruePeak':float(values['input_tp'])+gain})
(build/'mastering.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2), flush=True)
