import { CONFIG } from '../config.js';

/**
 * 全局强化定义：每级加成比例、基础花费、花费增长、上限。
 * 来源于 CONFIG.UPGRADE，UI 与 UpgradeManager 共用。
 */
export const UPGRADE_KEYS = ['damage', 'fireRate', 'range'];

const DEFS = {
  damage:   CONFIG.UPGRADE.DAMAGE,
  fireRate: CONFIG.UPGRADE.FIRERATE,
  range:    CONFIG.UPGRADE.RANGE,
};

/**
 * UpgradeManager：全局强化与武器解锁的单一数据源。
 * - 三类全局属性加点（攻击力/攻速/范围），等级与递增花费，作用于所有已放置与后续士兵。
 * - 魔法塔解锁（一次性）。
 * - 购买通过 economy.spend 扣金币；multipliers 供 Soldier.recompute 应用。
 * 外部（main.js）订阅 onChange 刷新面板可用性/价格/等级。
 */
export class UpgradeManager {
  constructor() {
    this.levels = { damage: 0, fireRate: 0, range: 0 };
    this.magicUnlocked = false;
    this._listeners = new Set();
  }

  /** 订阅升级状态变化，回调签名 () => void */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => fn());
  }

  /** 当前等级 */
  getLevel(key) {
    return this.levels[key];
  }

  /** 下一级花费（已达上限返回 Infinity） */
  getCost(key) {
    const d = DEFS[key];
    if (this.levels[key] >= d.maxLevel) return Infinity;
    return Math.round(d.baseCost * Math.pow(d.growth, this.levels[key]));
  }

  /** 是否还能升级 */
  canBuy(key) {
    return this.levels[key] < DEFS[key].maxLevel;
  }

  /** 购买一级强化，扣金币；成功返回 true */
  buy(key, economy) {
    if (!this.canBuy(key)) return false;
    const cost = this.getCost(key);
    if (!economy.spend(cost)) return false;
    this.levels[key] += 1;
    this._emit();
    return true;
  }

  /** 魔法塔解锁花费 */
  getMagicUnlockCost() {
    return CONFIG.MAGIC_UNLOCK_COST;
  }

  /** 解锁魔法塔，扣金币；成功返回 true */
  unlockMagic(economy) {
    if (this.magicUnlocked) return false;
    if (!economy.spend(this.getMagicUnlockCost())) return false;
    this.magicUnlocked = true;
    this._emit();
    return true;
  }

  /** 当前全局加成倍率，供 Soldier.recompute 使用 */
  get multipliers() {
    return {
      damageMul: 1 + DEFS.damage.perLevel * this.levels.damage,
      fireRateMul: 1 + DEFS.fireRate.perLevel * this.levels.fireRate,
      rangeMul: 1 + DEFS.range.perLevel * this.levels.range,
    };
  }
}

export const UPGRADE_DEFS = DEFS;
