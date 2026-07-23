/**
 * Projectile：弹道实体（箭/炮弹）。
 * - 追踪型（homing）：锁定一只怪兽，跟随其当前位置，命中单体。
 * - 溅射型（aoe>0）：飞向锁定点，到达后对范围内所有怪兽造成伤害。
 * - 可选附加能力：pierce（护甲穿透）、slow（减速）、chain（链式跳跃）。
 * 由 Soldier 开火创建，ProjectileManager 统一 update/遍历。
 * 命中时按 weaponType / hitSfx 播放对应命中音效。
 */
import { audio } from '../engine/audio.js';

export class Projectile {
  /**
   * @param {object} o
   * @param {number} o.x 起始像素 x
   * @param {number} o.y 起始像素 y
   * @param {Monster} o.target 目标怪兽（追踪）
   * @param {number} o.speed 像素/秒
   * @param {number} o.damage 伤害
   * @param {number} [o.aoe=0] 溅射半径（像素）
   * @param {number} [o.pierce=0] 护甲穿透
   * @param {{factor:number, duration:number}|null} [o.slow=null] 命中减速
   * @param {{count:number, range:number, falloff:number}|null} [o.chain=null] 链式跳跃
   * @param {string} [o.color] 颜色
   * @param {number} [o.radius=4] 视觉半径
   * @param {string} [o.weaponType] 武器类型，决定命中音效
   * @param {string|null} [o.hitSfx] 显式命中音效名
   */
  constructor(o) {
    this.x = o.x;
    this.y = o.y;
    this.target = o.target;
    this.speed = o.speed;
    this.damage = o.damage;
    this.aoe = o.aoe || 0;
    this.pierce = o.pierce || 0;
    this.slow = o.slow || null;
    this.chain = o.chain || null;
    this.color = o.color || '#fff';
    this.radius = o.radius || 4;
    this.weaponType = o.weaponType || null;
    this.hitSfx = o.hitSfx || null;
    this.alive = true;
    // 记录目标点（目标死亡后仍飞向最后位置，保证炮弹不悬空）
    this._tx = o.target ? o.target.x : o.x;
    this._ty = o.target ? o.target.y : o.y;
  }

  update(dt, monsters, effects) {
    if (!this.alive) return;
    // 追踪活体目标的实时位置
    if (this.target && this.target.alive) {
      this._tx = this.target.x;
      this._ty = this.target.y;
    }
    const dx = this._tx - this.x;
    const dy = this._ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step || dist === 0) {
      this.x = this._tx;
      this.y = this._ty;
      this._hit(monsters, effects);
      return;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  _applyHit(monster, damage, effects) {
    if (!monster || !monster.alive) return 0;
    const dmg = monster.takeDamage(damage, this.pierce);
    if (this.slow) monster.applySlow(this.slow.factor, this.slow.duration);
    if (effects && dmg > 0) effects.spawnDamage(monster.x, monster.y, dmg, this.color);
    return dmg;
  }

  _chainFrom(monsters, source, effects) {
    if (!this.chain || !source) return;
    const hit = new Set([source]);
    let current = source;
    let chainDamage = this.damage;

    for (let i = 0; i < this.chain.count; i++) {
      let next = null;
      let nextDist = Infinity;
      for (const m of monsters) {
        if (!m.alive || hit.has(m)) continue;
        const dist = Math.hypot(m.x - current.x, m.y - current.y);
        if (dist > this.chain.range || dist >= nextDist) continue;
        next = m;
        nextDist = dist;
      }
      if (!next) break;
      hit.add(next);
      current = next;
      chainDamage = Math.max(1, Math.round(chainDamage * this.chain.falloff));
      this._applyHit(next, chainDamage, effects);
    }
  }

  _hit(monsters, effects) {
    this.alive = false;
    // 命中/爆炸音效按弹道（武器类型）区分
    const hitSfx = this.hitSfx || (this.weaponType ? `hit_${this.weaponType}` : null);
    if (hitSfx) audio.play(hitSfx);
    if (this.aoe > 0) {
      // 范围溅射：命中点周边所有怪兽
      for (const m of monsters) {
        if (!m.alive) continue;
        if (Math.hypot(m.x - this.x, m.y - this.y) <= this.aoe) this._applyHit(m, this.damage, effects);
      }
      if (effects) effects.spawnBlast(this.x, this.y, this.aoe, this.color);
    } else {
      // 单体：只伤目标（若仍活着）
      if (this.target && this.target.alive) {
        this._applyHit(this.target, this.damage, effects);
        this._chainFrom(monsters, this.target, effects);
      }
    }
  }
}

/**
 * ProjectileManager：管理所有飞行中的弹道。
 */
export class ProjectileManager {
  constructor() {
    /** @type {Projectile[]} */
    this.projectiles = [];
  }

  add(p) {
    this.projectiles.push(p);
    return p;
  }

  update(dt, monsters, effects) {
    for (const p of this.projectiles) p.update(dt, monsters, effects);
    // 清理已命中/失效的弹道
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
  }

  getAll() {
    return this.projectiles;
  }
}
