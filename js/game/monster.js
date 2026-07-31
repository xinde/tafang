import { CONFIG } from '../config.js';
import { Projectile } from './projectile.js';

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
  MAGE:    { key: 'mage',    hp: 26,  speed: 40,  reward: 14, radius: 0.30, color: '#b46ae8', armor: 0, ranged: {
    range: 220,          // 索敌/攻击射程（像素）
    damage: 8,           // 单发弹道伤害（对塔 / 对基地）
    fireRate: 0.9,       // 每秒攻击次数
    projectileSpeed: 300,
    projColor: '#c98af5',
    projRadius: 5,
    moveFactor: 0.35,    // 攻击期间移动速度比例（边打边走，不原地站桩）
    healOnKill: 0.3,     // 击杀防御塔后按自身 maxHp 的 30% 回血（生命窃取）
    fireSfx: 'fire_magic',
    hitSfx: 'hit_magic',
  } },
  BOSS:    { key: 'boss',    hp: 280, speed: 30,  reward: 50, radius: 0.52, color: '#b02030', armor: 6, ranged: {
    range: 300,          // 攻击射程（像素）
    damage: 16,          // 单发弹道伤害（对塔 / 对基地）
    fireRate: 0.55,      // 每秒攻击次数
    projectileSpeed: 240,
    projColor: '#ff8030',
    projRadius: 7,
    moveFactor: 0.3,     // 攻击期间移动速度比例（BOSS 更慢）
    healOnKill: 0.2,     // 击杀防御塔后按自身 maxHp 的 20% 回血
    fireSfx: 'fire_cannon',
    hitSfx: 'hit_cannon',
  } },
};

/**
 * Monster：沿地图路径移动的敌人。
 * - 用 dist（已行进像素距离）+ map.getPathPosition 定位，保证折线路径上匀速移动。
 * - 到达终点置 reachedBase=true 并转为非存活，由 Wave 统一结算扣基地血。
 * - 被 takeDamage 击杀后 alive=false，由 Wave 结算掉金币。
 * - 远程型（opts.ranged 存在）：射程内有防御塔/基地时锁定目标并开火，同时**放慢但不停下**
 *   （边打边走，移动速度按 moveFactor 降低）；射程内无目标则按原速行进。
 *   - 远程怪击杀防御塔后可回血：healOnKill（自身 maxHp 比例），通过弹道携带 source 记录击杀者。
 *
 * 接口供 combat（projectile/effects）依赖：alive/x/y/takeDamage/reward。
 */
export class Monster {
  /**
   * @param {GameMap} map
   * @param {{hp?:number, speed?:number, reward?:number, radius?:number, color?:string, armor?:number, ranged?:object}} opts
   *   radius 为 cellSize 的比例（0..1）
   *   ranged：远程攻击配置 {range, damage, fireRate, projectileSpeed, projColor, projRadius, moveFactor, fireSfx, hitSfx}
   *   由 Wave 按波缩放其中 range/damage/fireRate。
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
    this.ranged = opts.ranged || null;      // 远程攻击配置，null = 近战怪
    this.dist = 0;                          // 已行进像素距离
    this.alive = true;
    this.reachedBase = false;
    this.slowTimer = 0;                     // 剩余减速时长（秒），>0 时按 slowFactor 减速
    this.slowFactor = 1;                    // 减速比例（0..1），1 = 无减速
    this._attackTimer = 0;                  // 远程攻击冷却
    const p = map.getPathPosition(0);
    this.x = p.x;
    this.y = p.y;
  }

  /**
   * 远程攻击目标：射程内最近的防御塔；无塔则基地。都不可及返回 null。
   * @param {{soldiers?: Soldier[], base?: {x:number, y:number, lives:number}}} combat 战斗上下文（Wave 注入）
   * @returns {{kind:'soldier'|'base', target:any, dist:number}|null}
   */
  acquireTarget(combat) {
    if (!this.ranged || !combat) return null;
    const range = this.ranged.range;
    let bestSoldier = null;
    let bestD = Infinity;
    for (const s of (combat.soldiers || [])) {
      if (!s.alive || !s.weapon) continue; // 仅装备武器的已部署塔可被攻击
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d <= range && d < bestD) { bestSoldier = s; bestD = d; }
    }
    if (bestSoldier) return { kind: 'soldier', target: bestSoldier, dist: bestD };
    if (combat.base && combat.base.lives > 0) {
      const d = Math.hypot(combat.base.x - this.x, combat.base.y - this.y);
      if (d <= range) return { kind: 'base', target: combat.base, dist: d };
    }
    return null;
  }

  /**
   * 远程开火：生成一枚追踪弹道（对塔/对基地），由 projectile 命中后结算。
   * 复用 Projectile 单体追踪逻辑：目标对象（Monster/Soldier/基地标记）只需
   * 提供 x/y/alive/takeDamage 接口，命中音效由 hitSfx 驱动。
   * source 记录开火者：若击杀目标是防御塔，wave 层据此给击杀者回血。
   */
  _fireProjectile(target, projectiles) {
    const r = this.ranged;
    projectiles.add(new Projectile({
      x: this.x, y: this.y,
      target,                                   // Monster/Soldier/BaseMarker 均具备 x/y/alive/takeDamage 接口
      speed: r.projectileSpeed,
      damage: r.damage,
      color: r.projColor,
      radius: r.projRadius,
      weaponType: null,                         // 不按武器类型取名（回退为 null）
      hitSfx: r.hitSfx,
      source: this,                             // 击杀者（防御塔被摧毁时回血）
    }));
  }

  /**
   * 远程怪的攻击循环。由 Wave 在 update 中驱动：
   * - 射程内锁定目标则按冷却开火，本帧返回移动速度系数（攻击期间缓慢移动）；
   * - 射程内无目标则返回 1（全速移动）。
   * @param {number} dt 固定步长（秒）
   * @param {{soldiers?: Soldier[], base?: {x:number,y:number,lives:number}, projectiles?: ProjectileManager, audio?: object}} combat
   * @returns {number} 本帧移动速度系数（0..1，1 = 全速；攻击中 = moveFactor）
   */
  updateRanged(dt, combat) {
    if (!this.ranged || !this.alive) return 1;
    const acq = this.acquireTarget(combat);
    if (!acq) return 1; // 射程内无目标：全速移动

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      if (combat.projectiles) this._fireProjectile(acq.target, combat.projectiles);
      this._attackTimer = 1 / this.ranged.fireRate;
    }
    return this.ranged.moveFactor || 0.5; // 攻击中：边打边走（放慢但不停下）
  }

  /**
   * 推进状态（每帧调用）。
   * - 减速计时无论是否攻击都流逝。
   * - speedMul：本帧速度系数（远程怪攻击中返回 moveFactor 实现边打边走；
   *   普通帧为 1）。减速（slowFactor）与它相乘。
   * @param {number} dt
   * @param {{speedMul?: number}} [opts]
   */
  update(dt, { speedMul = 1 } = {}) {
    if (!this.alive) return;
    if (this.slowTimer > 0) this.slowTimer -= dt; // 减速计时持续流逝
    let speed = this.speed * speedMul;
    if (this.slowTimer > 0) speed *= this.slowFactor;
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
   * 回血（生命窃取）。不复活已死亡的怪兽，上限钳位到 maxHp。
   * @param {number} amount 回血量
   * @returns {number} 实际回血量（供飘字，0 = 未回血）
   */
  heal(amount) {
    if (!this.alive) return 0;
    const healed = Math.min(amount, this.maxHp - this.hp);
    this.hp += healed;
    return healed;
  }

  /** 远程怪击杀防御塔后的回血比例（0..1，按自身 maxHp 计）；非远程/未配置返回 0 */
  get healOnKill() {
    return (this.ranged && this.ranged.healOnKill) || 0;
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
