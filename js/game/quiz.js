/**
 * QuizBank + QuizGate：升级答题门禁（纯逻辑，不依赖 DOM/audio，可在 Node 测试）。
 *
 * QuizBank —— 题库：
 * - 从配置（config/quiz.json）加载题库并校验结构合法性。
 * - drawQuestion({ tags }): 随机抽题，全局不重复（同题不连续出现）；全池出尽后重置。
 *   可选 tags 过滤：优先抽带指定标签的题（如升级"攻击力"传 ['damage']），无匹配则回退任意题。
 * - checkAnswer(): 判定选择是否答对。
 *
 * QuizGate —— 门禁状态机（idle → active → feedback → idle）：
 * - open(key)：点击升级时开启门禁。校验可升级/金币足够后抽题（tags=[key]），进入答题计时。
 * - submit(index)：答题阶段提交选项；答对立即 upgrades.buy（扣金币+升级），进入反馈展示；
 *   答错不 buy。反馈结束 onClose 恢复游戏。
 * - tick(dt)：由 main.js 在 paused 分支用固定 dt 驱动。active 阶段递减倒计时，超时视为答错
 *   （幂等，只触发一次 onResolve）；feedback 阶段结束后 onClose。
 * - 音频/士兵 recompute 等副作用由注入的 onOpen/onResolve/onClose 回调处理（main.js 提供）。
 *
 * 用法（main.js）：
 *   import quizConfig from '../config/quiz.json' with { type: 'json' };
 *   const bank = new QuizBank(quizConfig);
 *   const gate = new QuizGate({ bank, upgrades, economy, onOpen, onResolve, onClose });
 *   gate.open('damage');      // 点击升级按钮时
 *   gate.submit(2);           // 玩家点击选项
 *   gate.tick(dt);            // 主循环 paused 分支里每帧调用
 */
export class QuizBank {
  /**
   * @param {object} config 题库配置（结构见 config/quiz.json）
   * @throws {Error} 配置不合法时抛错（缺字段/选项<2/答案越界/限时非法）
   */
  constructor(config) {
    this.groups = this._validate(config);
    // 展平所有题，全局"已出题"集合（跨组不重复，全出尽后重置）
    /** @type {{q:string, options:string[], answer:number, timeLimit:number, group:number, tags:string[]}[]} */
    this.questions = [];
    this.groups.forEach((g, gi) => g.questions.forEach((q) => this.questions.push({ ...q, group: gi })));
    this._used = new Set();
    this._lastQuestion = null;
  }

  /** 校验题库结构，返回规范化后的组列表 */
  _validate(config) {
    if (!config || !Array.isArray(config.groups) || config.groups.length === 0) {
      throw new Error('quiz 配置缺少非空 groups 数组');
    }
    return config.groups.map((g, gi) => {
      if (!Array.isArray(g.questions) || g.questions.length === 0) {
        throw new Error(`quiz 第 ${gi} 组缺少非空 questions 数组`);
      }
      const groupTime = Number(g.timeLimit);
      const questions = g.questions.map((q, qi) => {
        if (!q || typeof q.q !== 'string' || q.q.trim() === '') {
          throw new Error(`quiz 第 ${gi} 组第 ${qi} 题缺少题干 q`);
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          throw new Error(`quiz 第 ${gi} 组第 ${qi} 题 options 至少需要 2 个选项`);
        }
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
          throw new Error(`quiz 第 ${gi} 组第 ${qi} 题 answer 越界（应为 0-${q.options.length - 1}）`);
        }
        const timeLimit = q.timeLimit != null ? Number(q.timeLimit) : groupTime;
        if (!Number.isFinite(timeLimit) || timeLimit <= 0) {
          throw new Error(`quiz 第 ${gi} 组第 ${qi} 题限时非法：${q.timeLimit}`);
        }
        return {
          q: q.q,
          options: q.options.map((s) => String(s)),
          answer: q.answer,
          timeLimit,
          tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
        };
      });
      return { name: g.name, difficulty: g.difficulty, timeLimit: groupTime, questions };
    });
  }

  /** 题库总题数（供 UI/测试） */
  get size() {
    return this.questions.length;
  }

  /**
   * 随机抽一道未出过的题（全局不重复）。全部出尽后重置（保证随时可升级）。
   * @param {{tags?: string[]}} [opts] tags 优先匹配（如 ['damage']）；无匹配回退任意题
   * @returns {{q:string, options:string[], answer:number, timeLimit:number, group:number, tags:string[]}}
   */
  drawQuestion({ tags } = {}) {
    if (this.questions.length === 0) throw new Error('题库为空，无法抽题');
    let fresh = this.questions.filter(q => !this._used.has(q));
    if (fresh.length === 0) {
      this._used.clear();
      // 只在新一轮的首抽避开上一轮末题，它仍可在本轮后续抽到。
      fresh = this.size === 1 ? this.questions : this.questions.filter(q => q !== this._lastQuestion);
    }
    // 标签优先：优先从带匹配标签的未出题里抽
    let candidates = fresh;
    if (tags && tags.length) {
      const tagged = fresh.filter((q) => tags.some((t) => q.tags.includes(t)));
      if (tagged.length) candidates = tagged;
    }
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    this._used.add(q);
    this._lastQuestion = q;
    return { ...q };
  }

  /**
   * 判定选项是否答对。
   * @param {object} question drawQuestion 返回的题
   * @param {number} optionIndex 玩家选择的选项下标
   * @returns {boolean}
   */
  checkAnswer(question, optionIndex) {
    if (!question || !Number.isInteger(optionIndex)) return false;
    return optionIndex === question.answer;
  }
}

/** 门禁结果展示时长（秒）：答对/答错/超时后高亮选项再关闭遮罩 */
export const DEFAULT_RESOLVE_DELAY = 0.8;

/**
 * QuizGate：答题门禁状态机。控制"点击升级 → 答题 → 结算 → 恢复"的完整流程。
 * 答对升级（buy 扣金币）在 submit 时立即执行；feedback 阶段仅做展示。
 */
export class QuizGate {
  /**
   * @param {object} opts
   * @param {QuizBank} opts.bank
   * @param {UpgradeManager} opts.upgrades
   * @param {Economy} opts.economy
   * @param {() => void} [opts.onOpen] 门禁开启（main：paused=true + 显示遮罩）
   * @param {({key:string, correct:boolean, applied:boolean}) => void} [opts.onResolve] 结算（main：音效+recompute+反馈文案）
   * @param {() => void} [opts.onClose] 门禁关闭（main：paused=false + 隐藏遮罩）
   * @param {number} [opts.resolveDelay=DEFAULT_RESOLVE_DELAY] 反馈展示时长（秒）
   */
  constructor({ bank, upgrades, economy, onOpen, onResolve, onClose, resolveDelay = DEFAULT_RESOLVE_DELAY }) {
    if (!bank || !upgrades || !economy) throw new Error('QuizGate 需要 bank/upgrades/economy');
    this.bank = bank;
    this.upgrades = upgrades;
    this.economy = economy;
    this._onOpen = onOpen || (() => {});
    this._onResolve = onResolve || (() => {});
    this._onClose = onClose || (() => {});
    this.resolveDelay = resolveDelay;

    this.phase = 'idle';        // idle | active | feedback
    this.key = null;            // 待升级键（damage/fireRate/range）
    this.question = null;       // 当前题目
    this.remaining = 0;         // 剩余答题秒数
    this._feedbackTimer = 0;
    this.lastResult = null;     // {key, correct, applied, answerIndex}
  }

  /** 当前是否处于答题计时阶段 */
  get isActive() {
    return this.phase === 'active';
  }

  /** 当前是否处于门禁流程（答题或反馈展示） */
  get isOpen() {
    return this.phase !== 'idle';
  }

  /**
   * 开启门禁（点击升级按钮时）。校验可升级与金币足够后抽题并进入答题。
   * @param {string} key 升级键（damage/fireRate/range）
   * @returns {boolean} 是否成功开启
   */
  open(key) {
    if (this.isOpen) return false;
    if (!this.upgrades.canBuy(key)) return false;
    const cost = this.upgrades.getCost(key);
    if (!this.economy.canAfford(cost)) return false;

    this.key = key;
    this.question = this.bank.drawQuestion({ tags: [key] });
    this.remaining = this.question.timeLimit;
    this.phase = 'active';
    this.lastResult = null;
    this._onOpen();
    return true;
  }

  /**
   * 提交选项答案（答题阶段）。答对立即 buy 升级（扣金币+等级+1），答错不 buy。
   * @param {number} optionIndex 玩家选择的选项下标
   * @returns {{correct:boolean, answerIndex:number}|null} 非答题阶段返回 null
   */
  submit(optionIndex) {
    if (this.phase !== 'active') return null;
    const answerIndex = Number(optionIndex);
    const correct = this.bank.checkAnswer(this.question, answerIndex);
    let applied = false;
    if (correct) {
      // 答对才升级：buy 内部 spend 扣金币并升级；若暂停期间金币被外部改变导致失败，则不升级（不崩溃）
      applied = this.upgrades.buy(this.key, this.economy);
    }
    this.lastResult = { key: this.key, correct, applied, answerIndex };
    this._enterFeedback(this.lastResult);
    return { correct, answerIndex };
  }

  /** 由 main.js 在 paused 分支每帧调用，用固定 dt 驱动倒计时与反馈时长 */
  tick(dt) {
    if (this.phase === 'active') {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.remaining = 0;
        // 超时视为答错（幂等，仅进入一次 feedback）
        this.lastResult = { key: this.key, correct: false, applied: false, answerIndex: null, timedOut: true };
        this._enterFeedback(this.lastResult);
      }
    } else if (this.phase === 'feedback') {
      this._feedbackTimer -= dt;
      if (this._feedbackTimer <= 0) this._close();
    }
  }

  /** 防御性兜底：非 idle 时强制结束并 onClose（如重开时调用） */
  close() {
    if (this.phase === 'idle') return;
    this.phase = 'idle';
    this.key = null;
    this.question = null;
    this._onClose();
  }

  _enterFeedback(result) {
    this.phase = 'feedback';
    this._feedbackTimer = this.resolveDelay;
    this._onResolve(result);
  }

  _close() {
    this.phase = 'idle';
    this.key = null;
    this.question = null;
    this._onClose();
  }
}
