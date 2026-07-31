import { CONFIG } from '../config.js';

/**
 * GameLoop：requestAnimationFrame 主循环 + 固定时间步长更新。
 * 更新用固定 dt（保证逻辑确定性与帧率无关），渲染每帧执行。
 *
 * 用法：
 *   const loop = new GameLoop({ update: (dt) => {...}, render: (alpha) => {...} });
 *   loop.start();
 */
export class GameLoop {
  /**
   * @param {{update: (dt:number)=>void, render: (alpha:number)=>void}} handlers
   */
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.fixedDt = CONFIG.FIXED_DT;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
  }

  /**
   * 清空固定时间步长累加器。游戏暂停恢复时调用，防止暂停期间累积的
   * 帧时间在恢复后一次性回补（while 循环连跑数百帧 update 导致怪兽瞬移）。
   */
  resetAccumulator() {
    this.accumulator = 0;
  }

  _tick(now) {
    if (!this.running) return;
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // 防止后台标签页切换后帧时间过长导致“螺旋死亡”
    if (frameTime > 0.25) frameTime = 0.25;
    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);
    requestAnimationFrame(this._tick);
  }
}
