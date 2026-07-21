// 音效生成器：用 Web Audio 风格的简单 DSP 本地合成 CC0 音效 WAV 文件。
// 运行：node scripts/gen-audio.mjs
// 输出：assets/audio/*.wav
//
// 设计目标：每个事件/武器音效彼此可区分、短促、不刺耳；全部为程序生成、CC0。
// 不依赖任何外部素材或网络下载（用户要求：禁止 URL 远程引用，全部本地化）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'audio');
const SR = 22050; // 采样率：SFX 够用且文件小

// ---------- 工具 ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1337);
function noise() { return rand() * 2 - 1; }

function osc(type, phase) {
  const t = phase - Math.floor(phase);
  switch (type) {
    case 'sine': return Math.sin(2 * Math.PI * t);
    case 'square': return t < 0.5 ? 1 : -1;
    case 'tri': return 4 * Math.abs(t - 0.5) - 1;
    case 'saw': return 2 * t - 1;
    default: return 0;
  }
}

/** ADSR 简化版：attack 线性上升至 1，随后指数衰减 */
function env(t, attack, decay) {
  if (t < attack) return attack > 0 ? t / attack : 1;
  return Math.exp(-(t - attack) / decay);
}

function tone({ dur, freq, type = 'sine', attack = 0.004, decay = 0.1, freqEnd = null, gain = 0.8 }) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freqEnd != null ? freq + (freqEnd - freq) * (t / dur) : freq;
    phase += f / SR;
    out[i] = osc(type, phase) * env(t, attack, decay) * gain;
  }
  return out;
}

function noiseBurst({ dur, attack = 0.001, decay = 0.1, gain = 0.8, filter = 'none' }) {
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = noise();
    lp = lp + 0.25 * (w - lp); // 一阶低通
    let s = w;
    if (filter === 'lp') s = lp;
    else if (filter === 'hp') s = w - lp;
    out[i] = s * env(t, attack, decay) * gain;
  }
  return out;
}

function mix(...arrs) {
  const n = Math.max(...arrs.map((a) => a.length));
  const out = new Float32Array(n);
  for (const a of arrs) for (let i = 0; i < a.length; i++) out[i] += a[i];
  return out;
}
function concat(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function normalize(arr, target = 0.9) {
  let peak = 0;
  for (const v of arr) peak = Math.max(peak, Math.abs(v));
  if (peak < 1e-6) return arr;
  const g = target / peak;
  for (let i = 0; i < arr.length; i++) arr[i] *= g;
  return arr;
}

function writeWav(path, samples) {
  const num = samples.length;
  const buf = Buffer.alloc(44 + num * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + num * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);   // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(num * 2, 40);
  for (let i = 0; i < num; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// ---------- 音效定义 ----------
// 武器开火（4 种，彼此明显不同）
const fire_sword = normalize(noiseBurst({ dur: 0.18, attack: 0.004, decay: 0.06, gain: 0.8, filter: 'hp' }));           // 剑：短促高频气声
const fire_arrow = normalize(mix(
  tone({ dur: 0.14, freq: 520, freqEnd: 260, type: 'tri', attack: 0.002, decay: 0.05, gain: 0.7 }),
  noiseBurst({ dur: 0.03, attack: 0.001, decay: 0.01, gain: 0.4 }),
));                                                                                                                        // 弓：弦音下行
const fire_cannon = normalize(mix(
  tone({ dur: 0.34, freq: 130, freqEnd: 48, type: 'sine', attack: 0.003, decay: 0.18, gain: 0.95 }),
  noiseBurst({ dur: 0.18, attack: 0.002, decay: 0.08, gain: 0.55, filter: 'lp' }),
));                                                                                                                        // 炮：低频轰鸣 + 爆破
const fire_magic = normalize(mix(
  tone({ dur: 0.2, freq: 780, freqEnd: 1560, type: 'sine', attack: 0.003, decay: 0.08, gain: 0.6 }),
  tone({ dur: 0.2, freq: 1560, freqEnd: 3120, type: 'sine', attack: 0.003, decay: 0.06, gain: 0.3 }),
));                                                                                                                        // 魔：上扬亮闪

// 命中/爆炸（按弹道区分）
const hit_arrow = normalize(mix(
  tone({ dur: 0.08, freq: 220, freqEnd: 140, type: 'sine', attack: 0.001, decay: 0.03, gain: 0.7 }),
  noiseBurst({ dur: 0.05, attack: 0.001, decay: 0.02, gain: 0.45 }),
));                                                                                                                        // 箭命中：短促 thunk
const hit_cannon = normalize(mix(
  tone({ dur: 0.3, freq: 90, freqEnd: 40, type: 'sine', attack: 0.002, decay: 0.16, gain: 0.85 }),
  noiseBurst({ dur: 0.28, attack: 0.002, decay: 0.12, gain: 0.6, filter: 'lp' }),
));                                                                                                                        // 炮爆炸：低频 + 噪声
const hit_magic = normalize(mix(
  tone({ dur: 0.18, freq: 1200, type: 'sine', attack: 0.002, decay: 0.07, gain: 0.6 }),
  tone({ dur: 0.18, freq: 2400, type: 'sine', attack: 0.002, decay: 0.05, gain: 0.25 }),
));                                                                                                                        // 魔命中：亮 ping

// UI / 游戏事件
const place = normalize(concat(
  tone({ dur: 0.08, freq: 523, type: 'tri', attack: 0.003, decay: 0.05, gain: 0.7 }),
  tone({ dur: 0.1, freq: 784, type: 'tri', attack: 0.003, decay: 0.07, gain: 0.7 }),
));                                                                                                                        // 放置：上行二音
const upgrade = normalize(concat(
  tone({ dur: 0.1, freq: 523, type: 'tri', decay: 0.06, gain: 0.6 }),
  tone({ dur: 0.1, freq: 659, type: 'tri', decay: 0.06, gain: 0.6 }),
  tone({ dur: 0.16, freq: 784, type: 'tri', decay: 0.1, gain: 0.65 }),
));                                                                                                                        // 升级：上行琶音
const sell = normalize(mix(
  tone({ dur: 0.22, freq: 660, freqEnd: 300, type: 'tri', attack: 0.003, decay: 0.12, gain: 0.55 }),
  tone({ dur: 0.1, freq: 1568, type: 'sine', attack: 0.002, decay: 0.05, gain: 0.35 }),
));                                                                                                                        // 出售：下行 + 金币
const wave_start = normalize(concat(
  tone({ dur: 0.16, freq: 440, type: 'square', attack: 0.004, decay: 0.1, gain: 0.45 }),
  tone({ dur: 0.22, freq: 330, type: 'square', attack: 0.004, decay: 0.14, gain: 0.45 }),
));                                                                                                                        // 波次开始：警报双音
const kill = normalize(mix(
  tone({ dur: 0.12, freq: 420, freqEnd: 110, type: 'sine', attack: 0.001, decay: 0.05, gain: 0.65 }),
  noiseBurst({ dur: 0.06, attack: 0.001, decay: 0.02, gain: 0.35 }),
));                                                                                                                        // 击杀：挤压 pop
const leak = normalize(mix(
  tone({ dur: 0.3, freq: 300, freqEnd: 70, type: 'saw', attack: 0.003, decay: 0.14, gain: 0.55 }),
  noiseBurst({ dur: 0.2, attack: 0.002, decay: 0.1, gain: 0.28, filter: 'lp' }),
));                                                                                                                        // 漏怪：下行噪杂
const coin = normalize(concat(
  tone({ dur: 0.06, freq: 1318, type: 'sine', attack: 0.001, decay: 0.04, gain: 0.55 }),
  tone({ dur: 0.1, freq: 1568, type: 'sine', attack: 0.001, decay: 0.06, gain: 0.55 }),
));                                                                                                                        // 得金币：亮双 ping
const victory = normalize(concat(
  tone({ dur: 0.18, freq: 523, type: 'tri', decay: 0.1, gain: 0.55 }),
  tone({ dur: 0.18, freq: 659, type: 'tri', decay: 0.1, gain: 0.55 }),
  tone({ dur: 0.18, freq: 784, type: 'tri', decay: 0.1, gain: 0.55 }),
  tone({ dur: 0.34, freq: 1047, type: 'tri', decay: 0.2, gain: 0.6 }),
));                                                                                                                        // 胜利：大调上行
const gameover = normalize(concat(
  tone({ dur: 0.2, freq: 523, type: 'tri', decay: 0.12, gain: 0.55 }),
  tone({ dur: 0.2, freq: 440, type: 'tri', decay: 0.12, gain: 0.55 }),
  tone({ dur: 0.2, freq: 349, type: 'tri', decay: 0.12, gain: 0.55 }),
  tone({ dur: 0.36, freq: 262, type: 'tri', decay: 0.22, gain: 0.6 }),
));                                                                                                                        // 失败：下行
const button = normalize(tone({ dur: 0.05, freq: 1000, type: 'sine', attack: 0.001, decay: 0.03, gain: 0.45 }));          // 通用 UI 点击

const SOUNDS = {
  fire_sword, fire_arrow, fire_cannon, fire_magic,
  hit_arrow, hit_cannon, hit_magic,
  place, upgrade, sell, wave_start, kill, leak, coin, victory, gameover, button,
};

// ---------- 输出 ----------
mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const [name, samples] of Object.entries(SOUNDS)) {
  const path = join(OUT_DIR, `${name}.wav`);
  writeWav(path, samples);
  count++;
  console.log(`wrote ${name}.wav (${samples.length} samples, ${(samples.length / SR).toFixed(2)}s)`);
}
console.log(`\n生成 ${count} 个音效 -> ${OUT_DIR}`);
