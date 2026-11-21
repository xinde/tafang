// 原创循环曲《城墙上的灯》。每行是一小节，八个位置分别是八分音符，- 延音，. 休止。
// 运行 node scripts/gen-music.mjs。仅重新生成曲目时需要本机 FFmpeg。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const score = [
  ['Dm', 'A4 - F4 G4 A4 - D5 -'],
  ['Bb', 'C5 - A4 - F4 - . G4'],
  ['F',  'A4 C5 - A4 G4 - F4 -'],
  ['C',  'E4 - G4 - . E4 G4 -'],
  ['Gm', 'G4 - Bb4 A4 G4 - D4 -'],
  ['Dm', 'F4 A4 - D5 C5 - A4 -'],
  ['Bb', 'Bb4 - A4 F4 D4 - F4 -'],
  ['A',  'E4 - C#5 - A4 - . .'],

  ['F',  'C5 - A4 C5 F5 - E5 -'],
  ['C',  'D5 - C5 - G4 - . A4'],
  ['Dm', 'F4 A4 D5 - F5 E5 D5 -'],
  ['Am', 'E5 - C5 - A4 - . .'],
  ['Bb', 'D5 - F5 - D5 C5 Bb4 -'],
  ['Gm', 'Bb4 - A4 G4 D5 - Bb4 -'],
  ['C',  'G4 C5 - E5 D5 - C5 -'],
  ['A',  'C#5 - B4 - A4 - E4 -'],

  ['Dm', 'A4 - F4 G4 A4 D5 - A4'],
  ['Bb', 'F4 - D4 - Bb4 - A4 -'],
  ['Gm', 'G4 Bb4 D5 - F5 - D5 -'],
  ['A',  'E5 - C#5 - A4 - . G4'],
  ['Dm', 'F4 A4 - C5 D5 - A4 -'],
  ['F',  'C5 - A4 G4 F4 - . A4'],
  ['Gm', 'Bb4 - G4 D4 G4 - F4 -'],
  ['A',  'E4 - C#4 E4 A4 - . .'],
];
const chords = {
  Dm: ['D3', 'F4', 'A4', 'D5'], Bb: ['Bb2', 'F4', 'Bb4', 'D5'],
  F:  ['F3', 'F4', 'A4', 'C5'], C:  ['C3', 'E4', 'G4', 'C5'],
  Gm: ['G2', 'D4', 'G4', 'Bb4'], A:  ['A2', 'E4', 'A4', 'C#5'],
  Am: ['A2', 'E4', 'A4', 'C5'],
};
const rate = 22050;
const eighth = 60 / 112 / 2;
const mix = new Float32Array(Math.round(score.length * 8 * eighth * rate));
const pitchClasses = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
function frequency(note) {
  const [, letter, accidental, octave] = /^([A-G])([b#]?)(\d)$/.exec(note);
  const midi = 12 * (Number(octave) + 1) + pitchClasses[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// 有限泛音使旋律保留芯片音色，又给箭矢与命中音效留出高频空间。
function timbre(harmonics) {
  return Float32Array.from({length: 1024}, (_, i) =>
    harmonics.reduce((v, gain, h) => v + gain * Math.sin(2 * Math.PI * (h + 1) * i / 1024), 0));
}
const lead = timbre([1, .19, .22, .06, .08, 0, .03]);
const bass = timbre([1, 0, -.11, 0, .04]);
const pluck = timbre([1, .36, .16, .06]);
const chime = timbre([1, 0, .42, 0, 0, .09]);
function note(start, length, hz, wave, gain) {
  const offset = Math.round(start * eighth * rate);
  const duration = length * eighth;
  const release = wave === pluck ? .075 : .055;
  const count = Math.ceil((duration + release) * rate);
  const echo = Math.round(eighth * 1.5 * rate);
  const phaseStep = hz * wave.length / rate;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / .013);
    const sustain = wave === pluck || wave === chime ? Math.exp(-6.8 * t) : .72 + .28 * Math.exp(-9 * t);
    const tail = Math.min(1, Math.max(0, (duration + release - t) / release));
    const value = wave[Math.floor(i * phaseStep) % wave.length] * gain * attack * sustain * tail;
    mix[(offset + i) % mix.length] += value;
    if (wave === lead) mix[(offset + i + echo) % mix.length] += value * .13;
  }
}

let seed = 219;
function percussion(start, kick, gain) {
  const offset = Math.round(start * eighth * rate);
  const duration = kick ? .17 : .078;
  let phase = 0, previous = 0;
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate;
    let sample;
    if (kick) {
      phase += 2 * Math.PI * (54 + 56 * Math.exp(-36 * t)) / rate;
      sample = Math.sin(phase) * Math.exp(-25 * t);
    } else {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      sample = (.4 * (noise - previous) + .6 * Math.sin(2 * Math.PI * 202 * t)) * Math.exp(-57 * t);
      previous = noise;
    }
    mix[(offset + i) % mix.length] += gain * sample * Math.min(1, t / .003);
  }
}

for (const [bar, [harmony, melody]] of score.entries()) {
  const start = bar * 8, phrase = melody.split(' ');
  if (phrase.length !== 8) throw new Error('小节时值错误 ' + (bar + 1));
  const [root, ...upper] = chords[harmony].map(frequency);
  for (let i = 0; i < phrase.length; i++) {
    if (phrase[i] === '.') continue;
    const hz = frequency(phrase[i]);
    let beats = 1;
    while (phrase[i + beats] === '-') beats++;
    note(start + i, beats - .12, hz, lead, .25);
    i += beats - 1;
  }
  note(start, 2.65, root, bass, .24);
  note(start + 4, 1.65, root * 1.5, bass, .19);
  note(start + 6, .8, root * (bar % 2 ? 2 : 1), bass, .13);
  const pattern = bar % 2 ? [1, 0, 2, 1] : [0, 1, 2, 1];
  for (let i = 0; i < 4; i++) note(start + 1 + 2 * i, .58, upper[pattern[i]], pluck, .11);
  if (bar >= 8 && bar < 16) note(start + 4.5, 1.6, upper[2] * 2, chime, .065);
  percussion(start, true, .19);
  percussion(start + 4, true, .14);
  percussion(start + 2, false, .075);
  percussion(start + 6, false, .085);
}
let peak = 0;
for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
for (let i = 0; i < mix.length; i++) mix[i] *= .48 / peak;

const output = fileURLToPath(new URL('../assets/audio/watchfire.mp3', import.meta.url));
const result = spawnSync('ffmpeg', [
  '-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0',
  '-c:a', 'libmp3lame', '-b:a', '32k', '-metadata', 'title=城墙上的灯', '-metadata', 'artist=Emberwatch', output,
], {input: Buffer.from(mix.buffer), stdio: ['pipe', 'inherit', 'inherit']});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = 1;
