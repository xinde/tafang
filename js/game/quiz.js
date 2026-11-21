/**
 * QuizBank + QuizGate：升级答题门禁（纯逻辑，不依赖 DOM/audio，可在 Node 测试）。
 *
 * QuizBank —— 题库：
 * - 从配置（config/quiz.json）加载题库并校验结构合法性。
 * - drawQuestion({ tags, difficulty }): 按档抽题，每档出尽后单独开启下一轮。
 *   可选 tags 过滤：优先抽带指定标签的题（如升级"攻击力"传 ['damage']），无匹配则回退任意题。
 * - checkAnswer(): 判定选择是否答对。
 *
 * QuizGate —— 答对后短暂显示结果，答错与超时则停留在 review 供阅读解析。
 * - open(key)：点击升级时开启门禁。校验可升级/金币足够后抽题（tags=[key]），进入答题计时。
 * - submit(index)：答题阶段提交选项；答对立即 upgrades.buy（扣金币+升级），进入反馈展示；
 *   在 review 可调用 retry() 换一道本档新题，或 close() 返回战场。
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
export const QUIZ_DIFFICULTIES = Object.freeze({ easy: '轻松', standard: '标准', challenge: '挑战' });

function secondsFor(question, difficulty) {
  if (difficulty === 'easy') return Math.max(40, question.timeLimit + 10);
  if (difficulty === 'challenge') return Math.max(20, question.timeLimit - 5);
  return question.timeLimit;
}

export class QuizBank {
  /**
   * @param {object} config 题库配置（结构见 config/quiz.json）
   * @throws {Error} 配置不合法时抛错（缺字段/选项<2/答案越界/限时非法）
   */
  constructor(config) {
    this.groups = this._validate(config);
    this.questions = this.groups.flatMap((g, group) => g.questions.map(q => ({ ...q, group })));
    this._decks = new Map();
    // 每档独立记忆本轮题目；无难度参数的调用仍使用全题库。
    for (const mode of ['all', ...Object.keys(QUIZ_DIFFICULTIES)]) {
      const pool = mode === 'all' ? this.questions : this.questions.filter(q => q.difficulty === mode);
      if (pool.length) this._decks.set(mode, { pool, used: new Set(), last: null });
    }
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
      const groupLevel = { medium: 'standard', hard: 'challenge' }[g.difficulty] || g.difficulty;
      const defaultDifficulty = Object.hasOwn(QUIZ_DIFFICULTIES, groupLevel) ? groupLevel : 'standard';
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
        const difficulty = q.difficulty ?? defaultDifficulty;
        if (!Object.hasOwn(QUIZ_DIFFICULTIES, difficulty)) {
          throw new Error(`quiz 第 ${gi} 组第 ${qi} 题难度非法：${difficulty}`);
        }
        return {
          q: q.q,
          options: q.options.map((s) => String(s)),
          answer: q.answer,
          timeLimit,
          difficulty,
          explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
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
   * 在指定难度内抽取本轮未出过的题目，优先匹配强化标签。旧库缺档时回退全库。
   * @param {{tags?: string[], difficulty?: string}} [opts]
   */
  drawQuestion({ tags, difficulty } = {}) {
    const deck = this._decks.get(difficulty) || this._decks.get('all');
    let fresh = deck.pool.filter(q => !deck.used.has(q));
    if (fresh.length === 0) {
      deck.used.clear();
      fresh = deck.pool.length === 1 ? deck.pool : deck.pool.filter(q => q !== deck.last);
    }
    // 标签优先：优先从带匹配标签的未出题里抽
    let candidates = fresh;
    if (tags && tags.length) {
      const tagged = fresh.filter((q) => tags.some((t) => q.tags.includes(t)));
      if (tagged.length) candidates = tagged;
    }
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    deck.used.add(q);
    deck.last = q;
    return { ...q, timeLimit: secondsFor(q, difficulty) };
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

/** 答对后自动返回战场的反馈时长（秒）。 */
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

    this.phase = 'idle';        // idle | active | feedback（成功后自动关闭）| review（等待阅读）
    this.key = null;            // 待升级键（damage/fireRate/range）
    this.difficulty = undefined;
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
  open(key, difficulty) {
    if (this.isOpen) return false;
    return this._startQuestion(key, difficulty);
  }

  retry() {
    if (this.phase !== 'review') return false;
    return this._startQuestion(this.key, this.difficulty);
  }

  _startQuestion(key, difficulty) {
    if (!this.upgrades.canBuy(key)) return false;
    const cost = this.upgrades.getCost(key);
    if (!this.economy.canAfford(cost)) return false;

    this.key = key;
    this.difficulty = difficulty;
    this.question = this.bank.drawQuestion({ tags: [key], difficulty });
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
    this._close();
  }

  _enterFeedback(result) {
    this.phase = result.correct ? 'feedback' : 'review';
    this._feedbackTimer = this.resolveDelay;
    this._onResolve(result);
  }

  _close() {
    this.phase = 'idle';
    this.key = null;
    this.difficulty = undefined;
    this.question = null;
    this._onClose();
  }
}
