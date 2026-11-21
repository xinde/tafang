import { CONFIG } from '../config.js';
import { audio } from '../engine/audio.js';

/**
 * Economy：金币与基地生命。
 * combat/wave 模块通过 earn/spend/damageBase 与游戏结算联动。
 */
export class Economy {
  constructor({ startGold = CONFIG.START_GOLD, baseLives = CONFIG.BASE_LIVES } = {}) {
    this.gold = startGold;
    this.baseLives = baseLives;
    this.maxLives = baseLives;
    this._listeners = new Set();
  }

  /** 订阅资源变化，回调签名 ({gold, baseLives}) => void */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    const state = { gold: this.gold, baseLives: this.baseLives };
    this._listeners.forEach((fn) => fn(state));
  }

  /** 是否有足够金币 */
  canAfford(amount) {
    return this.gold >= amount;
  }

  /** 消费金币，成功返回 true */
  spend(amount) {
    if (!this.canAfford(amount)) return false;
    this.gold -= amount;
    this._emit();
    return true;
  }

  /** 获得金币（击杀奖励等） */
  earn(amount) {
    this.gold += amount;
    audio.play('coin', { throttle: 50 });
    this._emit();
  }

  /** 退还金币（出售士兵等），不播放得金币音效 */
  refund(amount) {
    this.gold += amount;
    this._emit();
  }

  /** 基地受到伤害（怪兽到达终点） */
  damageBase(amount = 1) {
    this.baseLives = Math.max(0, this.baseLives - amount);
    this._emit();
  }

  /** 回满本关城堡耐久，仅在实际恢复时通知 HUD。 */
  repairBase() {
    if (this.isGameOver() || this.baseLives >= this.maxLives) return 0;
    const restored = this.maxLives - this.baseLives;
    this.baseLives = this.maxLives;
    this._emit();
    return restored;
  }

  isGameOver() {
    return this.baseLives <= 0;
  }

  getState() {
    return { gold: this.gold, baseLives: this.baseLives };
  }
}
