import { CONFIG } from '../config.js';
import { getWeapon, WeaponType } from './weapon.js';
import { Projectile } from './projectile.js';
import { audio } from '../engine/audio.js';

/**
 * 索敌策略：
 * - 'first'：优先攻击最接近基地（沿路径 dist 最大）的怪兽 —— 塔防常规
 * - 'nearest'：优先攻击距离士兵最近的怪兽
 */
export const TargetMode = {
  FIRST: 'first',
  NEAREST: 'nearest',
};

const TURRET_ROT_SPEED = 8; // 炮塔转向速度（弧度/秒），平滑跟随目标避免抖动

/** 以最大角速度 maxStep 将 cur 旋向 desired，取最短弧（处理 -PI..PI 环绕） */
function aimToward(cur, desired, maxStep) {
  let diff = desired - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // 归一化到 [-PI, PI]
  if (Math.abs(diff) <= maxStep) return desired;
  return cur + Math.sign(diff) * maxStep;
}

/**
 * Soldier（士兵/防御塔）：装备一种武器，自动索敌并开火。
 * 伤害结算通过 monster.takeDamage，击杀由 wave 层判定掉金币（接口约定）。
 */
export class Soldier {
  /**
   * @param {number} col 网格列
   * @param {number} row 网格行
   * @param {string} weaponType WeaponType
   */
  constructor(col, row, weaponType = WeaponType.SWORD) {
    this.col = col;
    this.row = row;
    this.setWeapon(weaponType);
    this.targetMode = TargetMode.FIRST;
    this._cooldown = 0;
    this.angle = 0;          // 炮塔当前朝向（弧度），平滑跟随发射方向
    this.target = null;      // 当前目标（丢失时保留最后朝向）
    // 像素中心坐标（由 map cellSize 推算）
    const cs = CONFIG.CELL_SIZE;
    this.x = col * cs + cs / 2;
    this.y = row * cs + cs / 2;
  }

  /** 切换武器（保留当前冷却），返回新武器定义 */
  setWeapon(weaponType) {
    const w = getWeapon(weaponType);
    this.weaponType = w.type;
    this.weapon = w;
    this.range = w.range;
    this.damage = w.damage;
    this.fireRate = w.fireRate;
    this.cost = w.cost;
    return w;
  }

  /**
   * 应用全局强化加成（攻击力/攻速/范围）。升级购买后与放置新士兵时调用。
   * @param {{damageMul:number, fireRateMul:number, rangeMul:number}} mul
   */
  recompute(mul) {
    this.damage = this.weapon.damage * mul.damageMul;
    this.fireRate = this.weapon.fireRate * mul.fireRateMul;
    this.range = this.weapon.range * mul.rangeMul;
  }

  /**
   * 在范围内挑选目标。
   * @param {Monster[]} monsters
   * @returns {Monster|null}
   */
  acquireTarget(monsters) {
    let best = null;
    for (const m of monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - this.x, m.y - this.y);
      if (d > this.range) continue;
      if (!best) { best = m; continue; }
      if (this.targetMode === TargetMode.FIRST) {
        if ((m.dist || 0) > (best.dist || 0)) best = m;
      } else {
        const bd = Math.hypot(best.x - this.x, best.y - this.y);
        if (d < bd) best = m;
      }
    }
    return best;
  }

  /**
   * @param {number} dt
   * @param {{monsters: Monster[], projectiles: ProjectileManager, effects: EffectManager}} ctx
   */
  update(dt, ctx) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    // 持续索敌并平滑转向目标（冷却中也在跟踪，炮塔始终朝向发射方向）
    const target = this.acquireTarget(ctx.monsters);
    if (target) {
      this.target = target;
      const desired = Math.atan2(target.y - this.y, target.x - this.x);
      this.angle = aimToward(this.angle, desired, TURRET_ROT_SPEED * dt);
    }
    // 目标丢失时保留最后朝向（this.angle 不变）

    if (this._cooldown > 0 || !target) return;

    this._fire(target, ctx);
    this._cooldown = 1 / this.fireRate;
  }

  _fire(target, ctx) {
    const w = this.weapon;
    // 不同武器不同开火音效（剑/弓/炮/魔 各一种）
    audio.play(`fire_${w.type}`);
    if (w.projectileSpeed > 0) {
      // 弹道武器（箭/炮弹）
      ctx.projectiles.add(new Projectile({
        x: this.x, y: this.y,
        target,
        speed: w.projectileSpeed,
        damage: this.damage,
        aoe: w.aoe,
        color: w.color,
        radius: w.type === WeaponType.CANNON ? 6 : 4,
        weaponType: w.type,
      }));
    } else {
      // 近战即时命中 + 斩击弧光
      target.takeDamage(this.damage);
      const angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (ctx.effects) {
        ctx.effects.spawnSlash(this.x, this.y, angle, w.color);
        ctx.effects.spawnDamage(target.x, target.y, this.damage, w.color);
      }
    }
  }
}

/**
 * SoldierManager：管理所有已放置士兵的增删与遍历。
 */
export class SoldierManager {
  constructor() {
    /** @type {Soldier[]} */
    this.soldiers = [];
  }

  add(soldier) {
    this.soldiers.push(soldier);
    return soldier;
  }

  removeAt(col, row) {
    const i = this.soldiers.findIndex((s) => s.col === col && s.row === row);
    if (i !== -1) {
      const [removed] = this.soldiers.splice(i, 1);
      return removed;
    }
    return null;
  }

  getAt(col, row) {
    return this.soldiers.find((s) => s.col === col && s.row === row) || null;
  }

  update(dt, ctx) {
    for (const s of this.soldiers) s.update(dt, ctx);
  }

  getAll() {
    return this.soldiers;
  }
}
