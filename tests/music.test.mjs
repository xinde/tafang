import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundMusic } from '../js/engine/music.js';

function media() {
  return {
    src: '', paused: true, currentTime: 0, starts: 0, pauses: 0,
    getAttribute(key) { return this[key] || null; },
    play() { this.paused = false; this.starts++; return Promise.resolve(); },
    pause() { this.paused = true; this.pauses++; },
  };
}

test('背景音乐等待手势，关闭时不加载，重复操作只有一个循环', () => {
  const track = media(), music = new BackgroundMusic(track, 'loop.mp3', false);
  music.onGesture();
  assert.equal(track.src, '');
  assert.equal(track.starts, 0);
  music.setEnabled(true);
  music.onGesture();
  assert.equal(track.src, 'loop.mp3');
  assert.equal(track.loop, true);
  assert.equal(track.preload, 'none');
  assert.equal(track.starts, 1);
});

test('暂停和后台保留播放位置，回到前台仍尊重音乐开关', () => {
  const track = media(), music = new BackgroundMusic(track, 'loop.mp3');
  music.setActive(false);
  music.onGesture();
  assert.equal(track.src, '');
  music.setActive(true);
  track.currentTime = 18;
  music.setActive(false);
  assert.ok(track.paused);
  music.setEnabled(false);
  music.setActive(true);
  assert.equal(track.starts, 1);
  music.setEnabled(true);
  assert.equal(track.currentTime, 18);
  assert.equal(track.starts, 2);
});

test('浏览器暂时拒绝播放后可通过下一次手势恢复', async () => {
  const track = media(), play = track.play;
  track.play = () => Promise.reject(new Error('暂未获得播放许可'));
  const music = new BackgroundMusic(track, 'loop.mp3');
  music.setActive(true);
  assert.equal(track.src, '');
  music.onGesture();
  await Promise.resolve();
  track.play = play;
  music.onGesture();
  assert.equal(track.paused, false);
  assert.equal(track.starts, 1);
});

test('下载中断后重新开启音乐会重新载入曲目', () => {
  const track = media(), music = new BackgroundMusic(track, 'loop.mp3');
  music.onGesture();
  music.setEnabled(false);
  track.error = {code: 2};
  let loads = 0;
  track.load = () => { loads++; track.error = null; };
  music.setEnabled(true);
  assert.equal(loads, 1);
  assert.equal(track.paused, false);
});
