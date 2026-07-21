import { Monster, MonsterType } from './monster.js';
import { CONFIG } from '../config.js';

// 波次节奏常量（集中在 wave 模块，避免改动公共 config）
const SPAWN_INTERVAL = 0.8;   // 同波内相邻怪兽生成间隔（秒）
const AUTO_START_DELAY = 3.0; // 一波清空后自动开下一波的倒计时（秒）

/**
 * WaveManager：按波生成怪兽并驱动其移动与结算。
 * - startNextWave() 由“开始下一波”按钮或波间隔自动触发。
 * - 波数越高：数量越多、血量越厚、速度越快，并逐步引入 FAST / TANK 类型。
 * - update(dt, economy, effects?)：生成 → 移动 → 结算（漏怪扣基地血 / 击杀掉金币）。
 *   effects 可选，用于怪兽死亡爆裂特效。
 */
export class WaveManager {
  /**
   * @param {GameMap} map
   */
  constructor(map) {
    this.map = map;
    this.waveIndex = 0;          // 已开始的波数（0 = 尚未开波）
    this.maxWaves = CONFIG.MAX_WAVES; // 通关波数
    /** @type {Monster[]} */
    this.active = [];            // 场上存活怪兽
    this._queue = [];            // 本波待生成的怪兽配置
    this._spawnTimer = 0;
    this.spawnInterval = SPAWN_INTERVAL;
    this.spawning = false;
    this.autoStartDelay = AUTO_START_DELAY;
    this._interWaveTimer = AUTO_START_DELAY;
  }

  /** 是否有波正在进行（仍在生成或场上还有怪兽） */
  isWaveInProgress() {
    return this.spawning || this.active.length > 0;
  }

  /** 距离自动开下一波的剩余秒数（仅波间有效） */
  get nextWaveIn() {
    return this._interWaveTimer;
  }

  /** 是否已通关：打满 maxWaves 且最后一波已清空 */
  get isVictory() {
    return this.waveIndex >= this.maxWaves && !this.isWaveInProgress();
  }

  /**
   * 按波数构造生成队列：数量/血量/速度递增，高波引入更快/更硬类型。
   * @param {number} index 波数（从 1 开始）
   */
  _buildWave(index) {
    const count = 4 + index * 2;                    // 数量递增
    const hpScale = 1 + (index - 1) * 0.25;         // 血量递增
    const speedScale = 1 + Math.min(0.5, (index - 1) * 0.05); // 速度递增（封顶 +50%）
    const rewardBonus = Math.floor((index - 1) / 2);// 高波金币略增
    const queue = [];
    for (let i = 0; i < count; i++) {
      let t = MonsterType.NORMAL;
      if (index >= 3 && i % 5 === 4) t = MonsterType.TANK;       // 第3波起每5只一个坦克
      else if (index >= 2 && i % 3 === 2) t = MonsterType.FAST;  // 第2波起每3只一个快速
      queue.push({
        hp: Math.round(t.hp * hpScale),
        speed: t.speed * speedScale,
        reward: t.reward + rewardBonus,
        radius: t.radius,
        color: t.color,
      });
    }
    return queue;
  }

  /**
   * 开始下一波。一波进行中或已打满 maxWaves 则忽略并返回 false。
   * @returns {boolean} 是否成功开波
   */
  startNextWave() {
    if (this.isWaveInProgress()) return false;
    if (this.waveIndex >= this.maxWaves) return false;
    this.waveIndex += 1;
    this._queue = this._buildWave(this.waveIndex);
    this._spawnTimer = 0;
    this.spawning = true;
    this._interWaveTimer = this.autoStartDelay; // 本波清空后开始倒计时
    return true;
  }

  /**
   * @param {number} dt 固定步长（秒）
   * @param {Economy} economy
   * @param {EffectManager} [effects] 可选，怪兽死亡时播放爆裂特效
   */
  update(dt, economy, effects) {
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

    // 2) 移动
    for (const m of this.active) m.update(dt);

    // 3) 结算：漏怪扣基地血 / 击杀掉金币 + 死亡特效
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      if (m.reachedBase) {
        economy.damageBase(1);
        this.active.splice(i, 1);
      } else if (!m.alive) {
        economy.earn(m.reward);
        if (effects) effects.spawnDeath(m.x, m.y, m.color);
        this.active.splice(i, 1);
      }
    }

    // 4) 波间隔：已开过至少一波、当前无波进行中、未打满、游戏未结束时自动开下一波
    if (this.waveIndex > 0 && this.waveIndex < this.maxWaves
        && !this.isWaveInProgress() && !economy.isGameOver()) {
      this._interWaveTimer -= dt;
      if (this._interWaveTimer <= 0) this.startNextWave();
    }
  }

  getActive() {
    return this.active;
  }
}
