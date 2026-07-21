import { CONFIG } from '../config.js';

/**
 * Economy：金币与基地生命。
 * combat/wave 模块通过 earn/spend/damageBase 与游戏结算联动。
 */
export class Economy {
  constructor() {
    this.gold = CONFIG.START_GOLD;
    this.baseLives = CONFIG.BASE_LIVES;
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
    this._emit();
  }

  /** 基地受到伤害（怪兽到达终点） */
  damageBase(amount = 1) {
    this.baseLives = Math.max(0, this.baseLives - amount);
    this._emit();
  }

  isGameOver() {
    return this.baseLives <= 0;
  }

  getState() {
    return { gold: this.gold, baseLives: this.baseLives };
  }
}
