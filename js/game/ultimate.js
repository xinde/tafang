/**
 * UltimateManager：玩家大招（手动技能）系统。
 *
 * 击杀怪兽积累能量，满后可手动释放三种大招之一：
 * - METEOR（陨石雨）：全屏随机位置范围伤害，持续 3 秒
 * - FREEZE（全图冰冻）：所有怪物暂停移动 3 秒（冰冻状态）
 * - GOLD_RUSH（金币狂暴）：下波击杀奖励 ×2，持续到下次波间
 *
 * 能量上限 100，每次击杀 +2（BOSS +10）。满 100 后可释放。
 * 释放后能量清零，重新积累。
 *
 * 用法（main.js）：
 *   const ult = new UltimateManager();
 *   ult.onKill(monster.reward >= 50);  // 击杀时充能
 *   ult.update(dt, ctx);               // 推进大招持续效果
 *   ult.activate('meteor');            // 释放大招
 *   ult.energy                         // 当前能量值 0..100
 *   ult.isReady                        // 是否可释放
 */
export const UltimateType = {
  METEOR: 'meteor',
  FREEZE: 'freeze',
  GOLD_RUSH: 'gold_rush',
};

export const ULTIMATE_DEFS = {
  [UltimateType.METEOR]: {
    key: UltimateType.METEOR,
    name: '陨石雨',
    icon: '☄️',
    hotkey: 'Q',
    desc: '全屏陨石轰炸，持续 3 秒',
    cost: 100,
    duration: 3.0,
  },
  [UltimateType.FREEZE]: {
    key: UltimateType.FREEZE,
    name: '全图冰冻',
    icon: '❄️',
    hotkey: 'W',
    desc: '所有怪物冻结 3 秒，无法移动',
    cost: 100,
    duration: 3.0,
  },
  [UltimateType.GOLD_RUSH]: {
    key: UltimateType.GOLD_RUSH,
    name: '金币狂暴',
    icon: '💰',
    hotkey: 'E',
    desc: '下波击杀奖励 ×2，持续到波间',
    cost: 100,
    duration: 0, // 无固定时长，波间自动结束
  },
};

const ENERGY_MAX = 100;
const ENERGY_PER_KILL = 2;
const ENERGY_PER_BOSS = 10;
const METEOR_INTERVAL = 0.15; // 陨石生成间隔（秒）
const METEOR_COUNT_PER_HIT = 3;
const METEOR_DAMAGE = 40;
const FREEZE_FACTOR = 0; // 完全停止

import { CONFIG } from '../config.js';
const METEOR_RADIUS = CONFIG.CELL_SIZE * 1.5;

export class UltimateManager {
  constructor() {
    this.energy = 0;
    this.activeUltimate = null;       // 当前激活的大招类型
    this._timer = 0;                  // 大招剩余时长
    this._meteorTimer = 0;           // 陨石生成计时
    this._listeners = new Set();
  }

  /** 订阅能量/状态变化 */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => fn());
  }

  /** 当前能量比例 0..1 */
  get energyRatio() {
    return this.energy / ENERGY_MAX;
  }

  /** 是否满能量可释放 */
  get isReady() {
    return this.energy >= ENERGY_MAX && !this.activeUltimate;
  }

  /** 是否有大招进行中 */
  get isActive() {
    return this.activeUltimate !== null;
  }

  /** 击杀时充能 */
  onKill(isBoss = false) {
    if (this.activeUltimate) return; // 大招期间不充能
    this.energy = Math.min(ENERGY_MAX, this.energy + (isBoss ? ENERGY_PER_BOSS : ENERGY_PER_KILL));
    this._emit();
  }

  /**
   * 释放大招。
   * @param {string} type UltimateType
   * @returns {boolean} 是否成功释放
   */
  activate(type) {
    if (!this.isReady) return false;
    const def = ULTIMATE_DEFS[type];
    if (!def) return false;
    this.activeUltimate = type;
    this._timer = def.duration;
    this._meteorTimer = 0;
    this.energy = 0;
    this._emit();
    return true;
  }

  /**
   * 推进大招状态。由 main.js 在 update 中调用。
   * @param {number} dt
   * @param {object} ctx { monsters, effects, economy, waves }
   * @returns {object|null} 本帧产生的指令（如 meteor hit），供 main 处理
   */
  update(dt, ctx) {
    if (!this.activeUltimate) return null;

    const def = ULTIMATE_DEFS[this.activeUltimate];
    let result = null;

    if (this.activeUltimate === UltimateType.METEOR) {
      // 陨石雨：每 METEOR_INTERVAL 秒沿怪物行进路径附近生成陨石
      this._meteorTimer -= dt;
      if (this._meteorTimer <= 0) {
        this._meteorTimer = METEOR_INTERVAL;
        const hits = [];
        for (let i = 0; i < METEOR_COUNT_PER_HIT; i++) {
          // 优先落在怪物附近（50% 概率锁定怪物附近，50% 落在路径随机位置）
          let x, y;
          const liveMonsters = ctx.monsters.filter((m) => m.alive);
          if (liveMonsters.length > 0 && Math.random() < 0.7) {
            // 锁定一只随机怪物的附近
            const target = liveMonsters[Math.floor(Math.random() * liveMonsters.length)];
            const offset = METEOR_RADIUS * 0.6;
            x = target.x + (Math.random() - 0.5) * offset * 2;
            y = target.y + (Math.random() - 0.5) * offset * 2;
          } else {
            // 路径附近随机位置（使用怪物位置作为路径近似）
            if (liveMonsters.length > 0) {
              const target = liveMonsters[Math.floor(Math.random() * liveMonsters.length)];
              x = target.x + (Math.random() - 0.5) * METEOR_RADIUS * 3;
              y = target.y + (Math.random() - 0.5) * METEOR_RADIUS * 3;
            } else {
              x = Math.random() * ctx.canvasW;
              y = Math.random() * ctx.canvasH;
            }
          }
          // 对范围内怪物造成伤害
          const hitMonsters = [];
          for (const m of ctx.monsters) {
            if (!m.alive) continue;
            if (Math.hypot(m.x - x, m.y - y) <= METEOR_RADIUS) {
              const dmg = m.takeDamage(METEOR_DAMAGE);
              hitMonsters.push({ monster: m, damage: dmg });
              if (ctx.effects) {
                ctx.effects.spawnDamage(m.x, m.y, dmg, '#ff8030');
              }
            }
          }
          // 陨石视觉特效
          if (ctx.effects) {
            ctx.effects.spawnMeteor(x, y, METEOR_RADIUS);
          }
          hits.push({ x, y, hitCount: hitMonsters.length });
        }
        result = { type: 'meteor', hits };
      }
      this._timer -= dt;
      if (this._timer <= 0) this._end();
    } else if (this.activeUltimate === UltimateType.FREEZE) {
      // 冰冻：每帧对所有怪物施加减速（factor=0，duration=0.5s 持续刷新）
      for (const m of ctx.monsters) {
        if (m.alive) m.applySlow(FREEZE_FACTOR, 0.5);
      }
      this._timer -= dt;
      if (this._timer <= 0) this._end();
    } else if (this.activeUltimate === UltimateType.GOLD_RUSH) {
      // 金币狂暴：无固定时长，波间结束时由 main 调用 endGoldRush()
      // 不自动结束
    }

    return result;
  }

  /** 结束金币狂暴（波间调用） */
  endGoldRush() {
    if (this.activeUltimate === UltimateType.GOLD_RUSH) {
      this._end();
    }
  }

  /** 金币狂暴是否激活（用于击杀奖励翻倍判定） */
  get isGoldRushActive() {
    return this.activeUltimate === UltimateType.GOLD_RUSH;
  }

  /** 冰冻是否激活（用于渲染全屏冰蓝色覆盖） */
  get isFreezeActive() {
    return this.activeUltimate === UltimateType.FREEZE;
  }

  /** 陨石雨是否激活（用于渲染全屏火光） */
  get isMeteorActive() {
    return this.activeUltimate === UltimateType.METEOR;
  }

  /** 当前大招剩余秒数 */
  get remaining() {
    return Math.max(0, this._timer);
  }

  _end() {
    this.activeUltimate = null;
    this._timer = 0;
    this._meteorTimer = 0;
    this._emit();
  }

  /** 重置（重新开始游戏时调用） */
  reset() {
    this.energy = 0;
    this.activeUltimate = null;
    this._timer = 0;
    this._meteorTimer = 0;
    this._emit();
  }
}
