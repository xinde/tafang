/**
 * WeatherManager + WeatherFX：随机天气系统（纯逻辑，不依赖 DOM/Canvas，可在 Node 测试）。
 *
 * WeatherManager -- 天气状态机：
 * - phase: 'clear'（晴朗）| 'active'（天气进行中）
 * - tick(dt)：推进倒计时。clear 到期后随机切换到一种天气；active 到期后回到 clear。
 * - modifiers：当前影响乘数 { damageMul, fireRateMul, rangeMul, monsterSpeedMul }。
 *   clear 时全为 1（无影响）；active 时取当前天气的 effects。
 * - 初始为 clear 状态，firstWeatherDelay 秒后首次触发天气。
 * - 所有参数来自外部配置（config/weather.json），可自由调整。
 *
 * WeatherFX -- 画布粒子效果（风线/雨滴/雪花）：
 * - 由 main.js 在 render 中调用 draw(ctx, w, h, dt)。
 * - 纯绘制，不影响游戏逻辑；粒子在天气切换时自动重置。
 *
 * 用法（main.js）：
 *   import weatherConfig from '../config/weather.json' with { type: 'json' };
 *   const weather = new WeatherManager(weatherConfig);
 *   const weatherFX = new WeatherFX();
 *   // update 循环中：
 *   weather.tick(dt);
 *   // 计算最终乘数 = 升级乘数 × 天气乘数
 *   const mul = { damageMul: up.damageMul * weather.modifiers.damageMul, ... };
 *   // render 中：
 *   weatherFX.draw(ctx, w, h, dt, weather.currentWeather);
 */

/**
 * 天气状态机。管理 clear <-> active 切换与当前影响乘数。
 */
export class WeatherManager {
  /**
   * @param {object} config 天气配置（结构见 config/weather.json）
   * @throws {Error} 配置不合法时抛错
   */
  constructor(config) {
    this._validate(config);
    this._config = config;
    this._weathers = config.weathers;
    this.phase = 'clear';        // 'clear' | 'active'
    this.currentWeather = null;  // 当前天气对象（clear 时为 null）
    this._timer = config.firstWeatherDelay ?? 10; // 首次天气倒计时
    this._onWeatherChange = null; // 回调：天气切换时通知（main.js 用于重置粒子）
  }

  /** 校验配置合法性 */
  _validate(config) {
    if (!config || !Array.isArray(config.weathers) || config.weathers.length === 0) {
      throw new Error('weather 配置缺少非空 weathers 数组');
    }
    for (let i = 0; i < config.weathers.length; i++) {
      const w = config.weathers[i];
      if (!w.key || typeof w.key !== 'string') {
        throw new Error(`weather 第 ${i} 个天气缺少 key`);
      }
      if (!w.name || typeof w.name !== 'string') {
        throw new Error(`weather 第 ${i} 个天气缺少 name`);
      }
      if (typeof w.duration !== 'number' || w.duration <= 0) {
        throw new Error(`weather 第 ${i} 个天气 duration 非法：${w.duration}`);
      }
      if (!w.effects || typeof w.effects !== 'object') {
        throw new Error(`weather 第 ${i} 个天气缺少 effects`);
      }
    }
  }

  /** 当前影响乘数。clear 时全为 1；active 时取当前天气 effects。 */
  get modifiers() {
    if (this.phase === 'active' && this.currentWeather) {
      return { ...this.currentWeather.effects };
    }
    return { damageMul: 1, fireRateMul: 1, rangeMul: 1, monsterSpeedMul: 1 };
  }

  /** 当前天气剩余秒数（active 阶段有效；clear 阶段为距下次天气的倒计时） */
  get remaining() {
    return Math.max(0, this._timer);
  }

  /** 是否处于天气进行中 */
  get isActive() {
    return this.phase === 'active';
  }

  /** 设置天气切换回调 */
  setOnWeatherChange(fn) {
    this._onWeatherChange = fn;
  }

  /**
   * 推进天气状态机。由 main.js 在 update 中用固定 dt 驱动。
   * @param {number} dt 固定步长（秒）
   */
  tick(dt) {
    this._timer -= dt;
    if (this._timer <= 0) {
      if (this.phase === 'clear') {
        // 晴朗到期 -> 随机进入一种天气
        this._startRandomWeather();
      } else {
        // 天气到期 -> 回到晴朗
        this._startClear();
      }
    }
  }

  /** 随机选择一种天气并进入 active 状态 */
  _startRandomWeather() {
    const w = this._weathers[Math.floor(Math.random() * this._weathers.length)];
    this.currentWeather = w;
    this.phase = 'active';
    this._timer = w.duration;
    if (this._onWeatherChange) this._onWeatherChange(w);
  }

  /** 进入晴朗期，随机持续 minClearTime..maxClearTime 秒 */
  _startClear() {
    this.currentWeather = null;
    this.phase = 'clear';
    const min = this._config.minClearTime ?? 8;
    const max = this._config.maxClearTime ?? 16;
    this._timer = min + Math.random() * (max - min);
    if (this._onWeatherChange) this._onWeatherChange(null);
  }

  /** 重置为初始状态（重新开始游戏时调用） */
  reset() {
    this.phase = 'clear';
    this.currentWeather = null;
    this._timer = this._config.firstWeatherDelay ?? 10;
  }
}

/**
 * 天气画布粒子效果。根据当前天气类型绘制风线/雨滴/雪花。
 * 纯视觉，不影响游戏逻辑。
 */
export class WeatherFX {
  constructor() {
    this._particles = [];
    this._weatherKey = null;
  }

  /**
   * 更新粒子并绘制天气效果。由 main.js 在 render 中调用。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w 画布逻辑宽度
   * @param {number} h 画布逻辑高度
   * @param {number} dt 帧时间（秒）
   * @param {object|null} weather 当前天气对象（null = 晴朗，不绘制）
   */
  draw(ctx, w, h, dt, weather) {
    const key = weather ? weather.key : null;
    // 天气类型切换时重置粒子
    if (key !== this._weatherKey) {
      this._weatherKey = key;
      this._particles = [];
      if (key) this._initParticles(key, w, h);
    }
    if (!key || this._particles.length === 0) return;

    this._updateParticles(dt, w, h);
    this._renderParticles(ctx, key, weather);
  }

  _initParticles(key, w, h) {
    const count = key === 'wind' ? 40 : key === 'rain' ? 80 : 60;
    for (let i = 0; i < count; i++) {
      this._particles.push(this._spawnParticle(key, w, h));
    }
  }

  _spawnParticle(key, w, h) {
    if (key === 'wind') {
      return {
        x: -20 + Math.random() * w,
        y: Math.random() * h,
        vx: 120 + Math.random() * 80,
        vy: (Math.random() - 0.5) * 10,
        len: 20 + Math.random() * 40,
        alpha: 0.15 + Math.random() * 0.25,
      };
    }
    if (key === 'rain') {
      return {
        x: Math.random() * (w + 100) - 50,
        y: -10 - Math.random() * h,
        vx: 30,
        vy: 400 + Math.random() * 200,
        len: 8 + Math.random() * 12,
        alpha: 0.25 + Math.random() * 0.35,
      };
    }
    // snow
    return {
      x: Math.random() * w,
      y: -10 - Math.random() * h,
      vx: (Math.random() - 0.5) * 30,
      vy: 40 + Math.random() * 50,
      r: 1.5 + Math.random() * 2.5,
      alpha: 0.4 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    };
  }

  _updateParticles(dt, w, h) {
    for (const p of this._particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this._weatherKey === 'snow') {
        p.phase += dt * 2;
        p.x += Math.sin(p.phase) * 15 * dt;
      }
      // 回收重置
      if (this._weatherKey === 'wind') {
        if (p.x > w + 50) { p.x = -30; p.y = Math.random() * h; }
      } else if (this._weatherKey === 'rain') {
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * (w + 100) - 50; }
      } else { // snow
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
      }
    }
  }

  _renderParticles(ctx, key, weather) {
    const color = weather ? weather.color : '#fff';
    ctx.save();
    if (key === 'wind') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const p of this._particles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len, p.y);
        ctx.stroke();
      }
    } else if (key === 'rain') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const p of this._particles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.01, p.y - p.len);
        ctx.stroke();
      }
    } else { // snow
      ctx.fillStyle = color;
      for (const p of this._particles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** 重置粒子（重新开始游戏时调用） */
  reset() {
    this._particles = [];
    this._weatherKey = null;
  }
}
