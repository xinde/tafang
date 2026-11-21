import { Monster, MonsterType } from './monster.js?v=tactics';
import { audio } from '../engine/audio.js';
import { BossStrike } from './boss-strike.js';

// 进阶怪兽类型按 key 索引，供关卡配置 distribution 引用（type -> MonsterType）
const ADVANCED_BY_KEY = {
  fast: MonsterType.FAST,
  tank: MonsterType.TANK,
  swarm: MonsterType.SWARM,
  armored: MonsterType.ARMORED,
  mage: MonsterType.MAGE,
  archer: MonsterType.ARCHER,
};

const TYPES_BY_KEY = Object.fromEntries(Object.values(MonsterType).map(type => [type.key, type]));

/** 将地图的编队顺序与共用的怪物模板组合。预告和实际生成使用同一份编队。 */
export function campaignWaves(config, stage) {
  return {
    ...config,
    orders: stage.waves.map(key => config.formations[key]),
    maxWaves: stage.waves.length,
    autoStartDelay: stage.rest,
    threat: stage.threat,
    stageId: stage.id,
  };
}

/**
 * WaveManager：按波生成怪兽并驱动其移动与结算。
 * - startNextWave() 由“开始下一波”按钮或波间隔自动触发。
 * - 波数越高：数量越多、血量/速度/护甲越强，并逐步引入 FAST / TANK / SWARM / ARMORED；
 *   每 5 波（5/10/15/20）追加一只 BOSS。波次组合与出现顺序含随机性，每局体验不同。
 * - update(dt, economy, effects?)：生成 → 移动 → 结算（漏怪扣基地血 / 击杀掉金币）。
 *   effects 可选，用于怪兽死亡爆裂特效。
 * - 所有波次参数（数量/缩放/解锁/Boss/随机/节奏）来自外部注入的关卡配置 levelConfig；
 *   主游戏启动时从本地 config/waves.json 导入后传入，新增或调整关卡只改 JSON，无需改本类。
 */
export class WaveManager {
  /**
   * @param {GameMap} map
   * @param {object} levelConfig 关卡/波次配置（结构见 config/waves.json）
   * @param {object} [combat] 战斗上下文（远程敌人攻击目标）
   * @param {SoldierManager} [combat.soldiers] 已部署防御塔，远程敌人优先攻击
   */
  constructor(map, levelConfig, combat = {}) {
    if (!levelConfig) throw new Error('WaveManager 需要关卡配置 levelConfig（来自 config/waves.json）');
    this.map = map;
    this._config = levelConfig;  // 关卡/波次配置
    this.combat = combat;        // 战斗上下文（soldiers 等）
    this.waveIndex = 0;          // 已开始的波数（0 = 尚未开波）
    this.leaks = 0;              // 只记敌人冲过终点的次数，抢修不会改写本关记录
    this.maxWaves = levelConfig.maxWaves; // 通关波数
    /** @type {Monster[]} */
    this.active = [];            // 场上存活怪兽
    this._bossStrikes = new Map();
    this._queue = [];            // 本波待生成的怪兽配置
    this._spawnTimer = 0;
    this.spawnInterval = levelConfig.spawnInterval;
    this.spawning = false;
    this.autoStartDelay = levelConfig.autoStartDelay;
    this._interWaveTimer = levelConfig.autoStartDelay;
  }

  /** 是否有波正在进行（仍在生成或场上还有怪兽） */
  isWaveInProgress() {
    return this.spawning || this.active.length > 0;
  }

  /** 距离自动开下一波的剩余秒数（仅波间有效） */
  get nextWaveIn() {
    return this._interWaveTimer;
  }

  get remainingEnemies() {
    return this._queue.length + this.active.length;
  }

  get bossWarnings() {
    return [...this._bossStrikes.values()].filter(strike =>
      strike.targets.length && strike.boss.alive && !strike.boss.reachedBase && this.active.includes(strike.boss))
      .sort((a, b) => a.remaining - b.remaining);
  }

  interruptBossStrikes() {
    let interrupted = 0;
    for (const strike of this.bossWarnings) {
      if (strike.interrupt()) interrupted++;
    }
    return interrupted;
  }

  get earlyBonus() {
    if (!this.waveIndex || this.waveIndex >= this.maxWaves || this.isWaveInProgress()) return 0;
    return Math.min(8, Math.ceil(Math.max(0, this.nextWaveIn) / 2));
  }

  /** 是否已通关：打满 maxWaves 且最后一波已清空 */
  get isVictory() {
    return this.waveIndex >= this.maxWaves && !this.isWaveInProgress();
  }

  /**
   * 按波数构造生成队列：数量/血量/速度/护甲递增，高波逐步引入新类型，并加入随机性。
   * 所有数值取自 this._config（config/waves.json），以下为默认值对应的曲线：
   * - 类型解锁：FAST@2、TANK@3、SWARM@6、ARMORED@8；BOSS 出现于每 5 波（5/10/15/20）。
   * - 数量：基础 4 + index*2；第 2 波起额外随机 +0..2 只（每局不同）。
   * - 血量：1 + (index-1)*0.25；速度：封顶 +60%；护甲加成：每 4 波 +1。
   * - 随机性：①部分 NORMAL 槽位随机升级为已解锁的高阶类型；②生成顺序整体洗牌。
   *
   * 不变量（回归测试依赖）：第 1 波恒为 7 只全 NORMAL（baseCount 5 + 1×countPerWave 2）；第 5 波必含 FAST 与 TANK、
   * 且任一怪兽血量均 > 第 1 波首怪（20）。
   *
   * @param {number} index 波数（从 1 开始）
   */
  _buildWave(index) {
    const cfg = this._config;
    const g = cfg.growth;
    const count = g.baseCount + index * g.countPerWave;          // 基础数量
    const hpScale = 1 + (index - 1) * g.hpScalePerWave;          // 血量递增
    const speedScale = 1 + Math.min(g.speedScaleCap, (index - 1) * g.speedScalePerWave); // 速度递增（封顶）
    const rewardBonus = Math.floor((index - 1) / g.rewardBonusEveryWaves); // 高波金币略增
    const armorBonus = Math.floor((index - 1) / g.armorBonusEveryWaves);   // 护甲随波缓慢增长
    const dmgScale = 1 + (index - 1) * g.rangedDamagePerWave;    // 远程伤害递增（法师/BOSS）

    if (cfg.orders) {
      const order = cfg.orders[index - 1];
      return order.groups.flatMap(([key, count]) =>
        Array.from({ length: count }, () => this._makeMonster(
          TYPES_BY_KEY[key], hpScale * cfg.threat, speedScale, rewardBonus, armorBonus,
          dmgScale * cfg.threat,
        ))
      );
    }

    const unlocked = {
      fast: index >= cfg.unlock.fast,
      tank: index >= cfg.unlock.tank,
      swarm: index >= cfg.unlock.swarm,
      armored: index >= cfg.unlock.armored,
      mage: index >= cfg.unlock.mage,
      archer: index >= cfg.unlock.archer,
    };
    const isBossWave = index > 0 && index % cfg.boss.every === 0; // 5/10/15/20

    const queue = [];
    for (let i = 0; i < count; i++) {
      let t = MonsterType.NORMAL;
      // 确定性基础类型分配：按 distribution 顺序逐个匹配，首个命中生效（未解锁自动落空），
      // 保证类型解锁后稳定出场，非仅靠随机。
      for (const d of cfg.distribution) {
        if (index >= cfg.unlock[d.type] && i % d.every === d.offset) {
          t = ADVANCED_BY_KEY[d.type];
          break;
        }
      }

      // 随机升级：第2波起，少量 NORMAL 槽位升级为已解锁的高阶类型（每局不同）
      if (index >= cfg.random.minWave && t === MonsterType.NORMAL && Math.random() < cfg.random.upgradeChance) {
        const upgrades = [];
        if (unlocked.fast) upgrades.push(MonsterType.FAST);
        if (unlocked.tank) upgrades.push(MonsterType.TANK);
        if (unlocked.swarm) upgrades.push(MonsterType.SWARM);
        if (unlocked.armored) upgrades.push(MonsterType.ARMORED);
        if (unlocked.mage) upgrades.push(MonsterType.MAGE);
        if (unlocked.archer) upgrades.push(MonsterType.ARCHER);
        if (upgrades.length) t = upgrades[Math.floor(Math.random() * upgrades.length)];
      }
      queue.push(this._makeMonster(t, hpScale, speedScale, rewardBonus, armorBonus, dmgScale));
    }

    // 随机额外怪兽：第2波起 +0..extraMax 只（类型从已解锁池随机）
    if (index >= cfg.random.minWave) {
      const extra = Math.floor(Math.random() * (cfg.random.extraMax + 1));
      for (let i = 0; i < extra; i++) {
        const pool = [MonsterType.NORMAL];
        if (unlocked.fast) pool.push(MonsterType.FAST);
        if (unlocked.tank) pool.push(MonsterType.TANK);
        if (unlocked.swarm) pool.push(MonsterType.SWARM);
        if (unlocked.armored) pool.push(MonsterType.ARMORED);
        if (unlocked.mage) pool.push(MonsterType.MAGE);
        if (unlocked.archer) pool.push(MonsterType.ARCHER);
        const t = pool[Math.floor(Math.random() * pool.length)];
        queue.push(this._makeMonster(t, hpScale, speedScale, rewardBonus, armorBonus, dmgScale));
      }
    }

    // Boss 波：追加一只 BOSS（高血量/高奖励/带护甲/可远程），作为阶段性强敌
    if (isBossWave) {
      queue.push(this._makeMonster(MonsterType.BOSS, hpScale, speedScale, rewardBonus, armorBonus, dmgScale));
    }

    // 洗牌生成顺序：使每波出现次序随机（第1波全 NORMAL，洗牌不影响类型分布）
    this._shuffle(queue);
    return queue;
  }

  /** 按类型模板与波次缩放系数生成一只怪兽配置 */
  _makeMonster(t, hpScale, speedScale, rewardBonus, armorBonus, dmgScale) {
    const ranged = t.ranged
      ? {
          range: t.ranged.range,
          damage: Math.round(t.ranged.damage * dmgScale),
          fireRate: t.ranged.fireRate,
          projectileSpeed: t.ranged.projectileSpeed,
          projColor: t.ranged.projColor,
          projRadius: t.ranged.projRadius,
          moveFactor: t.ranged.moveFactor,
          healOnKill: t.ranged.healOnKill,
          fireSfx: t.ranged.fireSfx,
          hitSfx: t.ranged.hitSfx,
        }
      : undefined;
    return {
      key: t.key,
      hp: Math.round(t.hp * hpScale),
      speed: t.speed * speedScale,
      reward: t.reward + rewardBonus,
      radius: t.radius,
      color: t.color,
      armor: t.armor + armorBonus,
      ...(ranged ? { ranged } : {}),
    };
  }

  /** Fisher-Yates 原地洗牌 */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * 开始下一波。一波进行中或已打满 maxWaves 则忽略并返回 false。
   * @returns {boolean} 是否成功开波
   */
  startNextWave(economy) {
    if (this.isWaveInProgress()) return false;
    if (this.waveIndex >= this.maxWaves) return false;
    if (this.combat?.tactics?.needsChoice(this)) return false;
    const bonus = this.earlyBonus;
    this._bossStrikes.clear();
    this.waveIndex += 1;
    this._queue = this._buildWave(this.waveIndex);
    this.spawnInterval = this._config.orders?.[this.waveIndex - 1].interval ?? this._config.spawnInterval;
    this._spawnTimer = 0;
    this.spawning = true;
    this._interWaveTimer = this.autoStartDelay; // 本波清空后开始倒计时
    if (economy && bonus) economy.earn(bonus);
    audio.play('wave_start');
    return true;
  }

  /**
   * @param {number} dt 固定步长（秒）
   * @param {Economy} economy
   * @param {EffectManager} [effects] 可选，怪兽死亡/防御塔损毁时播放爆裂特效
   * @param {ProjectileManager} [projectiles] 弹道管理器（远程敌人开火入队）
   * @param {number} [monsterSpeedMul=1] 天气等外部因素对怪物速度的乘数（1=无影响）
   * @param {boolean} [frozen=false] 全图冰冻打断首领冲击，并暂停施法时钟
   */
  update(dt, economy, effects, projectiles, monsterSpeedMul = 1, frozen = false) {
    // 1) 逐只生成
    if (this.spawning) {
      this._spawnTimer -= dt;
      while (this._spawnTimer <= 0 && this._queue.length > 0) {
        const cfg = this._queue.shift();
        this.active.push(new Monster(this.map, cfg));
        this._spawnTimer += this.spawnInterval;
      }
      if (this._queue.length === 0) this.spawning = false;
    }

    // 2) 移动 / 远程攻击：远程怪射程内有目标则停下射击，否则继续行进
    const cs = this.map.cellSize;
    const bc = this.map.baseCell;
    const monsterCombat = {
      soldiers: (this.combat && this.combat.soldiers) ? this.combat.soldiers.getAll() : [],
      base: {
        x: bc.col * cs + cs / 2,
        y: bc.row * cs + cs / 2,
        lives: economy.baseLives,
        // 城堡按耐久点结算，远程命中与漏过一只敌人的损失一致。
        alive: economy.baseLives > 0,
        takeDamage: () => {
          economy.damageBase(1);
          return 1;
        },
      },
      projectiles,
    };
    for (const m of this.active) {
      if (m.key === 'boss' && m.alive && !m.reachedBase) {
        if (!this._bossStrikes.has(m)) this._bossStrikes.set(m, new BossStrike(m, this._config.stageId));
        if (this._bossStrikes.get(m).advance(dt, monsterCombat.soldiers, effects, frozen || m.freezeTimer > 0)) {
          m.update(dt, {speedMul: 0});
          continue;
        }
      }
      const speedMul = m.updateRanged(dt, monsterCombat); // 攻击中返回 moveFactor（缓慢移动）
      m.update(dt, { speedMul: speedMul * monsterSpeedMul });   // 边打边走，天气影响速度
    }

    // 3) 结算：漏怪扣基地血 / 击杀掉金币 + 死亡特效 + 击杀回血
    let killCount = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      if (m.key === 'boss' && (m.reachedBase || !m.alive)) this._bossStrikes.delete(m);
      if (m.reachedBase) {
        this.leaks++;
        economy.damageBase(1);
        audio.play('leak');
        this.active.splice(i, 1);
      } else if (!m.alive) {
        economy.earn(m.reward);
        killCount++;
        if (effects) effects.spawnDeath(m.x, m.y, m.color);
        // 击杀回血：击杀者是防御塔（有 weapon 属性）时，回复该塔少量生命
        const killer = m.killedBy;
        if (killer && killer.alive && killer.weapon && typeof killer.heal === 'function') {
          // 防御塔击杀怪物回血：maxHp 的 5%（约5点），不复活已死亡塔
          const healAmount = Math.round(killer.maxHp * 0.05);
          if (healAmount > 0) {
            const healed = killer.heal(healAmount);
            if (healed > 0 && effects) effects.spawnHeal(killer.x, killer.y, healed);
          }
        }
        // 大招充能
        if (this._onKill) this._onKill(m);
        this.active.splice(i, 1);
      }
    }
    if (killCount > 0) audio.play('kill', { throttle: 50 });

    // 4) 被摧毁的防御塔：释放格子 + 返还 50% 成本 + 爆裂特效 + 击杀者回血
    const soldiers = (this.combat && this.combat.soldiers) || null;
    if (soldiers) {
      const destroyed = soldiers.getAll().filter((s) => !s.alive);
      for (const s of destroyed) {
        soldiers.removeAt(s.col, s.row);
        this.map.release(s.col, s.row);
        if (s.cost > 0) economy.refund(Math.floor(s.cost * 0.5));
        audio.play('tower_down');
        if (effects) effects.spawnDeath(s.x, s.y, s.weapon.color);
        // 击杀回血：该塔被远程敌人弹道击杀时，击杀者（source）按 healOnKill 回血
        const killer = s.killedBy;
        if (killer && killer.alive && killer.healOnKill > 0) {
          const healed = killer.heal(Math.round(killer.maxHp * killer.healOnKill));
          if (healed > 0 && effects) effects.spawnHeal(killer.x, killer.y, healed);
        }
      }
    }

    // 5) 波间隔：已开过至少一波、当前无波进行中、未打满、游戏未结束时自动开下一波
    if (this.waveIndex > 0 && this.waveIndex < this.maxWaves
        && !this.isWaveInProgress() && !economy.isGameOver() && !this.combat?.tactics?.needsChoice(this)) {
      this._interWaveTimer -= dt;
      if (this._interWaveTimer <= 0) this.startNextWave();
    }
  }

  getActive() {
    return this.active;
  }

  /** 设置击杀回调（大招充能用） */
  setOnKill(fn) {
    this._onKill = fn;
  }
}
