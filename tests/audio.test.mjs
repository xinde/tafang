// AudioManager 烟雾测试：验证在不具备浏览器 AudioContext 的环境下也能安全构造与调用（不抛错）。
// 关键性质：play() 在未就绪/静音时必须静默跳过，绝不让游戏逻辑因音频失败而崩溃。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, audio } from '../js/engine/audio.js';

test('单例与构造：默认状态正确', () => {
  assert.ok(audio instanceof AudioManager, 'audio 应为 AudioManager 单例');
  assert.equal(audio.muted, false, '默认未静音');
  assert.equal(audio.ready, false, '加载前 ready=false');
  assert.equal(audio.volume > 0, true, '音量应 > 0');
});

test('构造时不触碰浏览器 API（Node 环境安全）', () => {
  const m = new AudioManager();
  assert.equal(m._ctx, null, '构造后不应创建 AudioContext');
  assert.equal(m._master, null, '构造后不应创建 GainNode');
});

test('setMuted / toggleMute 在无上下文时不抛错', () => {
  const m = new AudioManager();
  m.setMuted(true);
  assert.equal(m.muted, true, 'setMuted(true) 生效');
  const back = m.toggleMute();
  assert.equal(back, false, 'toggleMute 切回 false');
  assert.equal(m.muted, false, 'toggleMute 生效');
});

test('play() 未就绪时静默跳过，不抛错（关键安全保证）', () => {
  const m = new AudioManager();
  // 无 ctx / 未 ready，调用任意音效名都不应抛错
  assert.doesNotThrow(() => m.play('kill'));
  assert.doesNotThrow(() => m.play('anything'));
  m.setMuted(true);
  assert.doesNotThrow(() => m.play('kill'));
});

test('setManifest 注册清单不立即加载', () => {
  const m = new AudioManager();
  m.setManifest({ kill: 'assets/audio/kill.wav' });
  assert.equal(m.ready, false, 'setManifest 不应触发加载');
  assert.equal(m._manifest.kill, 'assets/audio/kill.wav');
});
