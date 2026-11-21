// 升级答题门禁回归测试：QuizBank 题库 + QuizGate 状态机 + 升级购买集成
// 运行：node --test tests/quiz.test.mjs
//
// 覆盖：
// - 题库加载与结构校验（缺字段/选项<2/答案越界/限时非法抛错）
// - 抽题：随机、全局不连续重复、tags 过滤、单题池回退
// - 判定：答对/答错、超时优先于答案
// - 门禁状态机：open 幂等、submit 后重复提交无效、超时只触发一次结算
// - 升级集成：答对 buy 扣金币升级、答错/超时金币等级不变、满级 open 拒绝
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuizBank, QuizGate } from '../js/game/quiz.js';
import { UpgradeManager, UPGRADE_DEFS } from '../js/game/upgrade.js';
import { Economy } from '../js/game/economy.js';
import quizConfig from '../config/quiz.json' with { type: 'json' };

const DT = 1 / 60;

// ---------- 题库加载与校验 ----------
test('题库加载：合法配置解析出题目，含 _doc 注释字段不影响', () => {
  const bank = new QuizBank(quizConfig);
  assert.ok(bank.size >= 10, `题库应含足够题目，got ${bank.size}`);
  assert.ok(bank.groups.length >= 2, '应有多个题组');
  for (const q of bank.questions) {
    assert.ok(typeof q.q === 'string' && q.q.trim(), '题干非空');
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, '选项至少 2 个');
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, '答案索引越界');
    assert.ok(q.timeLimit > 0, '限时为正数');
  }
});

test('题库校验：缺 groups / 空组 / 答案越界 / 限时非法抛错', () => {
  assert.throws(() => new QuizBank(null), /groups/);
  assert.throws(() => new QuizBank({ groups: [] }), /groups/);
  assert.throws(() => new QuizBank({ groups: [{ questions: [] }] }), /questions/);
  assert.throws(() => new QuizBank({ groups: [{ timeLimit: 10, questions: [{ q: 'x', options: ['a', 'b'], answer: 5 }] }] }), /answer/);
  assert.throws(() => new QuizBank({ groups: [{ timeLimit: 10, questions: [{ q: 'x', options: ['a'], answer: 0 }] }] }), /options/);
  assert.throws(() => new QuizBank({ groups: [{ timeLimit: 0, questions: [{ q: 'x', options: ['a', 'b'], answer: 0 }] }] }), /限时/);
});

// ---------- 抽题 ----------
test('抽题：连续抽不重复（全局池内），出尽后重置', () => {
  const bank = new QuizBank(quizConfig);
  const seen = new Set();
  const ids = [];
  for (let i = 0; i < bank.size; i++) {
    const q = bank.drawQuestion();
    const id = `${q.q}|${q.options.join('')}`;
    ids.push(id);
    seen.add(id);
  }
  assert.equal(seen.size, bank.size, `一轮内应抽到 ${bank.size} 道互异题，got ${seen.size}`);
  // 出尽后下一抽（重置）不应与最后一道相同（若池>1）
  if (bank.size > 1) {
    const q = bank.drawQuestion();
    assert.notEqual(`${q.q}|${q.options.join('')}`, ids[ids.length - 1], '重置后首题不应与上一题相同');
  }
});

test('抽题：无匹配 tags 时回退任意题（通用知识题库无标签）', () => {
  const bank = new QuizBank(quizConfig);
  // 新题库为通用知识题，无 damage/fireRate/range 标签；
  // tags 过滤找不到匹配时应回退任意题（不抛错、返回合法题）
  for (let i = 0; i < 20; i++) {
    const q = bank.drawQuestion({ tags: ['damage'] });
    assert.ok(q && q.q && q.options.length >= 2, '应返回合法题');
  }
});

test('抽题：单题池回退不挂死', () => {
  const bank = new QuizBank({ groups: [{ timeLimit: 10, questions: [{ q: '唯一题', options: ['a', 'b', 'c', 'd'], answer: 0 }] }] });
  const q1 = bank.drawQuestion();
  const q2 = bank.drawQuestion();
  assert.equal(q1.q, '唯一题');
  assert.equal(q2.q, '唯一题', '单题池允许重复且不挂死');
});

test('换轮后，即使随机数再次指向上一轮末题，也先出另一道题', (t) => {
  const questions = ['第一题', '第二题'].map(q => ({ q, options: ['甲', '乙'], answer: 0 }));
  const bank = new QuizBank({ groups: [{ timeLimit: 20, questions }] });
  t.mock.method(Math, 'random', () => 0.99);
  assert.equal(bank.drawQuestion().q, '第二题');
  assert.equal(bank.drawQuestion().q, '第一题');
  Math.random.mock.mockImplementation(() => 0);
  assert.equal(bank.drawQuestion().q, '第二题');
  assert.equal(bank.drawQuestion().q, '第一题');
});

// ---------- 判定 ----------
test('判定：答对/答错/越界索引', () => {
  const bank = new QuizBank(quizConfig);
  const q = bank.drawQuestion();
  assert.equal(bank.checkAnswer(q, q.answer), true, '正确答案应判定为对');
  assert.equal(bank.checkAnswer(q, (q.answer + 1) % q.options.length), false, '错误答案应判定为错');
  assert.equal(bank.checkAnswer(q, 999), false, '越界索引视为错');
  assert.equal(bank.checkAnswer(null, 0), false, 'null 题视为错');
});

// ---------- 门禁状态机 ----------
test('门禁：open 幂等、满级/金币不足拒绝', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const bank = new QuizBank(quizConfig);
  const gate = new QuizGate({ bank, upgrades, economy, resolveDelay: 0 });
  assert.equal(gate.open('damage'), true, '可升级时应成功开启');
  assert.equal(gate.open('damage'), false, '已激活时再次 open 应拒绝');
  gate.close();
  // 满级：直接设为 maxLevel（canBuy=false → open 应拒绝）
  const up2 = new UpgradeManager();
  const eco2 = new Economy();
  const gate2 = new QuizGate({ bank: new QuizBank(quizConfig), upgrades: up2, economy: eco2, resolveDelay: 0 });
  up2.levels.damage = UPGRADE_DEFS.damage.maxLevel;
  assert.equal(up2.canBuy('damage'), false, '满级后 canBuy 为 false');
  assert.equal(gate2.open('damage'), false, '满级后应拒绝开启');
  // 金币不足
  const up3 = new UpgradeManager();
  const eco3 = new Economy();
  eco3.gold = 0;
  const gate3 = new QuizGate({ bank: new QuizBank(quizConfig), upgrades: up3, economy: eco3, resolveDelay: 0 });
  assert.equal(gate3.open('damage'), false, '金币不足应拒绝开启');
});

test('门禁：答对升级扣金币 + onResolve 触发 + 状态推进', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const bank = new QuizBank(quizConfig);
  const events = [];
  const gate = new QuizGate({
    bank, upgrades, economy, resolveDelay: 0.9,
    onOpen: () => events.push('open'),
    onResolve: (r) => events.push(`resolve:${r.correct}:${r.applied}`),
    onClose: () => events.push('close'),
  });
  const goldBefore = economy.gold;
  assert.equal(gate.open('damage'), true);
  assert.equal(events.join(','), 'open', 'open 触发 onOpen');
  assert.ok(gate.isActive, '开启后进入答题阶段');
  const cost = upgrades.getCost('damage'); // 升级前价格（Lv1 -> Lv2 的花费）
  const correct = gate.submit(gate.question.answer);
  assert.equal(correct.correct, true, '答对应返回 correct');
  assert.equal(gate.lastResult.applied, true, '答对应应用升级');
  assert.equal(upgrades.getLevel('damage'), 1, '攻击力等级应 +1');
  assert.equal(economy.gold, goldBefore - cost, `答对应扣升级前价格 ${cost}`);
  assert.equal(events.filter((e) => e.startsWith('resolve:')).length, 1, '应恰好触发一次 onResolve');
  assert.ok(!gate.isActive, '提交后退出答题阶段');
  // 反馈期 tick 推进到关闭
  let closed = false;
  while (gate.phase === 'feedback') { gate.tick(DT); if (gate.phase === 'idle') closed = true; }
  assert.equal(closed, true, '反馈期结束应关闭');
  assert.equal(gate.isOpen, false, '关闭后 isOpen 为 false');
});

test('门禁：答错/超时 金币等级不变、不 buy', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const gate = new QuizGate({ bank: new QuizBank(quizConfig), upgrades, economy, resolveDelay: 0 });
  const goldBefore = economy.gold;

  // 答错
  assert.equal(gate.open('fireRate'), true);
  const wrongIndex = (gate.question.answer + 1) % gate.question.options.length;
  gate.submit(wrongIndex);
  assert.equal(gate.lastResult.correct, false, '答错应返回 correct=false');
  assert.equal(gate.lastResult.applied, false, '答错不应用升级');
  assert.equal(upgrades.getLevel('fireRate'), 0, '等级不变');
  assert.equal(economy.gold, goldBefore, '金币不变');
  gate.close();

  // 超时
  assert.equal(gate.open('range'), true);
  gate.remaining = 0.001;
  gate.tick(DT); // remaining <= 0 -> 超时结算
  assert.equal(gate.lastResult.correct, false, '超时视为答错');
  assert.equal(gate.lastResult.timedOut, true, '应标记 timedOut');
  assert.equal(gate.lastResult.applied, false, '超时不升级');
  assert.equal(upgrades.getLevel('range'), 0, '等级不变');
  assert.equal(economy.gold, goldBefore, '金币不变');
});

test('门禁：提交后重复提交无效（不二次 buy）', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const gate = new QuizGate({ bank: new QuizBank(quizConfig), upgrades, economy, resolveDelay: 0.9 });
  assert.equal(gate.open('damage'), true);
  const goldBefore = economy.gold;
  gate.submit(gate.question.answer);
  assert.equal(upgrades.getLevel('damage'), 1, '第一次答对应升级');
  assert.ok(economy.gold < goldBefore, '应扣一次金币');
  const after = economy.gold;
  assert.equal(gate.submit(0), null, 'feedback 阶段重复提交返回 null');
  gate.close();
  assert.equal(gate.submit(0), null, 'idle 阶段提交返回 null');
  assert.equal(economy.gold, after, '重复提交不再扣钱');
  assert.equal(upgrades.getLevel('damage'), 1, '等级不变');
});

test('门禁：反馈结束后超时判定不再触发（幂等）', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const gate = new QuizGate({ bank: new QuizBank(quizConfig), upgrades, economy, resolveDelay: 0.9 });
  gate.open('damage');
  gate.submit(gate.question.answer); // 进入 feedback
  const resolves = [gate.lastResult];
  gate.tick(DT); // feedback 计时（非 active，不触发超时）
  gate.tick(DT);
  assert.equal(gate.lastResult, resolves[0], 'feedback 阶段 tick 不改变 lastResult');
  assert.equal(upgrades.getLevel('damage'), 1, '等级保持 1（未被超时逻辑回滚）');
});

test('门禁：答题结束后 buy 失败（答对但金币被外部扣光）不崩溃', () => {
  const upgrades = new UpgradeManager();
  const economy = new Economy();
  const gate = new QuizGate({ bank: new QuizBank(quizConfig), upgrades, economy, resolveDelay: 0 });
  assert.equal(gate.open('damage'), true);
  economy.gold = 0; // 模拟极端竞态：答题期间金币被外部清空
  gate.submit(gate.question.answer);
  assert.equal(gate.lastResult.applied, false, 'buy 失败应 applied=false');
  assert.equal(upgrades.getLevel('damage'), 0, '等级不变（未升级）');
  // 反馈期推进（resolveDelay=0 时一帧即关闭）
  let guard = 0;
  while (gate.phase === 'feedback' && guard++ < 100) gate.tick(DT);
  assert.equal(gate.phase, 'idle', '门禁仍应正常推进关闭');
});

// ---------- 配置文档字段不影响解析 ----------
test('发布题库为纯文字四选一，题干和每题选项互不重复', () => {
  const seen = new Set();
  for (const { questions } of quizConfig.groups) {
    for (const { q, options } of questions) {
      assert.equal(options.length, 4, q);
      for (const value of [q, ...options]) {
        assert.equal(typeof value, 'string', q);
        assert.ok(value.trim(), q);
        assert.doesNotMatch(value, /https?:\/\/|data:image\/|<img\b|!\[.*?\]\(/i, q);
      }
      assert.equal(new Set(options.map(s => s.trim())).size, 4, q);
      assert.ok(!seen.has(q.trim()), q);
      seen.add(q.trim());
    }
  }
});
