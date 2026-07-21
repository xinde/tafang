/**
 * AudioManager：轻量音效播放（Web Audio API）。
 *
 * 设计要点：
 * - 懒创建 AudioContext：浏览器要求用户手势后才能发声，故首次用户手势调用 unlock()。
 * - 预解码所有音效为 AudioBuffer，play() 时新建 BufferSource 一次性播放，支持并发。
 * - 主音量 + 静音通过一个 GainNode 统一控制；静音/音量可在运行时切换。
 * - 每个音效按名字做最小间隔节流（防同帧大量触发叠加爆音），并有全局最大并发上限。
 * - 任何浏览器 API 都只在方法内部访问，不在模块加载期执行 -> 可在 Node 环境（测试）安全 import。
 *
 * 用法：
 *   import { audio } from './engine/audio.js';
 *   audio.setManifest({ kill: 'assets/audio/kill.wav', ... });
 *   window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
 *   audio.play('kill');
 */
export class AudioManager {
  constructor({ volume = 0.6, maxVoices = 24, throttleMs = 30 } = {}) {
    this.volume = volume;
    this.muted = false;
    this.maxVoices = maxVoices;
    this.throttleMs = throttleMs;
    /** @type {AudioContext|null} */
    this._ctx = null;
    /** @type {GainNode|null} */
    this._master = null;
    /** @type {Map<string, AudioBuffer>} */
    this._buffers = new Map();
    /** @type {Map<string, number>} */
    this._lastPlay = new Map();
    this._activeCount = 0;
    this._manifest = null;
    this._loading = null;
    this.ready = false;
  }

  /** 注册音效清单：name -> 文件路径（相对页面）。不立即加载，等 unlock()。 */
  setManifest(manifest) {
    this._manifest = manifest;
  }

  /** 首次用户手势时调用：创建上下文并预解码全部文件。幂等。 */
  unlock() {
    if (this._loading) return this._loading;
    this._loading = this._initAndLoad();
    return this._loading;
  }

  async _initAndLoad() {
    this._ensureCtx();
    if (!this._ctx || !this._manifest) return;
    await Promise.all(
      Object.entries(this._manifest).map(async ([name, path]) => {
        try {
          const res = await fetch(path);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const buf = await this._ctx.decodeAudioData(arr);
          this._buffers.set(name, buf);
        } catch (_) {
          // 单个文件加载失败不阻塞其他音效
        }
      }),
    );
    this.ready = true;
  }

  _ensureCtx() {
    if (typeof window === 'undefined') return;
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ctx = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.value = this.muted ? 0 : this.volume;
      this._master.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  setMuted(m) {
    this.muted = !!m;
    if (this._master && this._ctx) {
      this._master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this._ctx.currentTime, 0.01);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVolume(v) {
    this.volume = v;
    if (!this.muted && this._master && this._ctx) {
      this._master.gain.setTargetAtTime(v, this._ctx.currentTime, 0.01);
    }
  }

  /**
   * 播放某音效。未就绪/静音/被节流/超并发上限时安全跳过，绝不抛错。
   * @param {string} name
   * @param {{throttle?:number, gain?:number}} [opts]
   */
  play(name, { throttle = this.throttleMs, gain = 1 } = {}) {
    if (this.muted) return;
    if (!this._ctx || !this.ready) return;
    const buf = this._buffers.get(name);
    if (!buf) return;
    const now = this._ctx.currentTime;
    if (throttle > 0) {
      const last = this._lastPlay.get(name) || -Infinity;
      if ((now - last) * 1000 < throttle) return;
      this._lastPlay.set(name, now);
    }
    if (this._activeCount >= this.maxVoices) return;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const g = this._ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this._master);
    this._activeCount++;
    src.onended = () => { this._activeCount = Math.max(0, this._activeCount - 1); };
    src.start();
  }
}

// 单例：供各游戏模块直接 import 使用
export const audio = new AudioManager();
