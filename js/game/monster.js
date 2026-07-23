import { CONFIG } from '../config.js';

/**
 * 怪兽类型模板。每种类型决定基础血量/速度/金币奖励/体型/颜色/护甲。
 * Wave 系统按波数在此基础上缩放血量、速度与护甲。
 * - armor：每次受击的固定减伤（下限 1），使 ARMORED 对高频低伤武器（弓箭）有抗性，
 *   但对单发高伤武器（炮击）仍脆弱。
 */
export const MonsterType = {
  NORMAL:  { key: 'normal',  hp: 20,  speed: 60,  reward: 5,  radius: 0.30, color: '#e05555', armor: 0 },
  FAST:    { key: 'fast',    hp: 12,  speed: 115, reward: 6,  radius: 0.24, color: '#e0a555', armor: 0 },
  TANK:    { key: 'tank',    hp: 65,  speed: 34,  reward: 12, radius: 0.40, color: '#9b59e0', armor: 0 },
  SWARM:   { key: 'swarm',   hp: 8,   speed: 95,  reward: 2,  radius: 0.20, color: '#5ad07a', armor: 0 },
  ARMORED: { key: 'armored', hp: 40,  speed: 50,  reward: 10, radius: 0.36, color: '#5a8ad0', armor: 4 },
  BOSS:    { key: 'boss',    hp: 280, speed: 30,  reward: 50, radius: 0.52, color: '#b02030', armor: 6 },
};

/**
 * Monster：沿地图路径移动的敌人。
 * - 用 dist（已行进像素距离）+ map.getPathPosition 定位，保证折线路径上匀速移动。
 * - 到达终点置 reachedBase=true 并转为非存活，由 Wave 统一结算扣基地血。
 * - 被 takeDamage 击杀后 alive=false，由 Wave 结算掉金币。
 *
 * 接口供 combat（projectile/effects）依赖：alive/x/y/takeDamage/reward。
 */
export class Monster {
  /**
   * @param {GameMap} map
   * @param {{hp?:number, speed?:number, reward?:number, radius?:number, color?:string, armor?:number}} opts
   *   radius 为 cellSize 的比例（0..1）
   */
  constructor(map, opts = {}) {
    this.map = map;
    this.maxHp = opts.hp ?? 20;
    this.hp = this.maxHp;
    this.speed = opts.speed ?? 60;          // 像素/秒
    this.reward = opts.reward ?? 5;         // 击杀金币
    this.radius = opts.radius ?? 0.30;      // 体型（cellSize 比例）
    this.color = opts.color ?? '#e05555';
    this.key = opts.key ?? 'normal';        // 类型 key，用于选图与调试
    this.armor = opts.armor ?? 0;           // 每次受击固定减伤（下限 1）
    this.dist = 0;                          // 已行进像素距离
    this.alive = true;
    this.reachedBase = false;
    this.slowTimer = 0;                     // 剩余减速时长（秒），>0 时按 slowFactor 减速
    this.slowFactor = 1;                    // 减速比例（0..1），1 = 无减速
    const p = map.getPathPosition(0);
    this.x = p.x;
    this.y = p.y;
  }

  update(dt) {
    if (!this.alive) return;
    // 减速生效期间按比例降低本帧速度；slowTimer 递减，过期恢复全速
    let speed = this.speed;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      speed = this.speed * this.slowFactor;
    }
    this.dist += speed * dt;
    const p = this.map.getPathPosition(this.dist);
    this.x = p.x;
    this.y = p.y;
    if (p.done) {
      this.reachedBase = true;
      this.alive = false;
    }
  }

  /**
   * 施加减速（寒冰武器）。多次命中取更强减速（factor 更小者）与更长时间。
   * @param {number} factor 减速比例（0..1），如 0.5 = 速度减半
   * @param {number} duration 持续秒数
   */
  applySlow(factor, duration) {
    if (!this.alive) return;
    if (this.slowTimer <= 0 || factor < this.slowFactor) this.slowFactor = factor;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 当前是否处于减速状态（可供渲染加特效） */
  get isSlowed() {
    return this.alive && this.slowTimer > 0;
  }

  /**
   * 受击结算。
   * @param {number} amount 武器原始伤害
   * @param {number} [pierce=0] 护甲穿透：结算时忽略的护甲点数
   * @returns {number} 护甲减伤后的实际扣血量（供伤害飘字）
   */
  takeDamage(amount, pierce = 0) {
    if (!this.alive) return 0;
    // 护甲减伤：固定值，最低扣 1（保证不会因护甲过高而无法击杀）；穿透先抵消护甲
    const effArmor = Math.max(0, (this.armor || 0) - (pierce || 0));
    const dmg = Math.max(1, amount - effArmor);
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return dmg; // 返回实际扣血量，供调用方驱动伤害飘字（护甲减伤后）
  }

  /** 剩余血量比例 0..1，用于血条渲染 */
  get hpRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
}
