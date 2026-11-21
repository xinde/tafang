/** 循环曲独立于战斗音效。第一次操作之前不给媒体元素设置 src。 */
export class BackgroundMusic {
  constructor(track, url, enabled = true) {
    this.track = track;
    this.url = url;
    this.enabled = enabled;
    this.active = true;
    this.unlocked = false;
    track.loop = true;
    track.preload = 'none';
    track.volume = .64;
  }

  onGesture() {
    this.unlocked = true;
    this.sync();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && this.track.error) this.track.load();
    this.sync();
  }

  setActive(active) {
    this.active = active;
    this.sync();
  }

  sync() {
    const track = this.track;
    if (!this.enabled || !this.active || !this.unlocked) {
      if (!track.paused) track.pause();
      return;
    }
    if (!track.paused) return;
    if (!track.getAttribute('src')) track.src = this.url;
    // 切后台和快速关开都可能中断一次 play；之后的真实手势可以重试。
    track.play()?.catch(() => {});
  }
}
