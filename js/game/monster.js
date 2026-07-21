import { CONFIG } from '../config.js';

/**
 * 怪兽类型模板。每种类型决定基础血量/速度/金币奖励/体型/颜色。
 * Wave 系统按波数在此基础上缩放血量与速度。
 */
export const MonsterType = {
  NORMAL: { key: 'normal', hp: 20, speed: 60, reward: 5, radius: 0.30, color: '#e05555' },
  FAST:   { key: 'fast',   hp: 12, speed: 115, reward: 6, radius: 0.24, color: '#e0a555' },
  TANK:   { key: 'tank',   hp: 65, speed: 34, reward: 12, radius: 0.40, color: '#9b59e0' },
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
   * @param {{hp?:number, speed?:number, reward?:number, radius?:number, color?:string}} opts
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
    this.dist = 0;                          // 已行进像素距离
    this.alive = true;
    this.reachedBase = false;
    const p = map.getPathPosition(0);
    this.x = p.x;
    this.y = p.y;
  }

  update(dt) {
    if (!this.alive) return;
    this.dist += this.speed * dt;
    const p = this.map.getPathPosition(this.dist);
    this.x = p.x;
    this.y = p.y;
    if (p.done) {
      this.reachedBase = true;
      this.alive = false;
    }
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  /** 剩余血量比例 0..1，用于血条渲染 */
  get hpRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
}
