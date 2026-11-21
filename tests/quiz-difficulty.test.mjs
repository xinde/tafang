import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_DIFFICULTIES, QuizBank, QuizGate } from '../js/game/quiz.js';
import { Economy } from '../js/game/economy.js';
import { UpgradeManager } from '../js/game/upgrade.js';
import config from '../config/quiz.json' with { type: 'json' };

test('逐题标注三个难度，各主题均可选，每道错题都有独立的纯文字解析', () => {
  const explanations = new Set();
  for (const group of config.groups) {
    assert.deepEqual(new Set(group.questions.map(q => q.difficulty)), new Set(Object.keys(QUIZ_DIFFICULTIES)), group.name);
    for (const { q, explanation } of group.questions) {
      assert.equal(typeof explanation, 'string', q);
      assert.ok(explanation.trim().length > 8 && !explanations.has(explanation), q);
      assert.doesNotMatch(explanation, /https?:\/\/|data:image\/|<img\b|!\[.*?\]\(/i);
      explanations.add(explanation);
    }
  }
  const pageQuestion = config.groups.flatMap(g => g.questions).find(q => q.q.includes('第 18 页'));
  assert.equal(pageQuestion.options[pageQuestion.answer], '8 页');
  assert.match(pageQuestion.explanation, /25 − 18 \+ 1 = 8/);
  assert.equal(explanations.size, 180);
});

test('切换难度保留各档的独立抽题进度，抽完本档才重置', () => {
  const bank = new QuizBank(config);
  const played = Object.fromEntries(Object.keys(QUIZ_DIFFICULTIES).map(key => [key, new Set()]));
  const last = {};
  for (let i = 0; i < 60; i++) {
    for (const [difficulty, seen] of Object.entries(played)) {
      const card = bank.drawQuestion({ difficulty, tags: ['damage'] });
      assert.equal(card.difficulty, difficulty);
      assert.ok(!seen.has(card.q));
      seen.add(card.q);
      last[difficulty] = card.q;
      if (difficulty === 'easy') assert.ok(card.timeLimit >= 40 && card.timeLimit <= 45);
      if (difficulty === 'challenge') assert.ok(card.timeLimit >= 20 && card.timeLimit <= 30);
    }
  }
  for (const [difficulty, seen] of Object.entries(played)) {
    const next = bank.drawQuestion({ difficulty });
    assert.equal(seen.size, 60);
    assert.ok(seen.has(next.q));
    assert.notEqual(next.q, last[difficulty]);
  }
});

test('旧库缺逐题难度时能继承组别并安全抽题，拼错的新标签会报错', () => {
  const card = { q: '示例', options: ['一','二'], answer: 0 };
  const group = { difficulty: 'hard', timeLimit: 25, questions: [card] };
  const bank = new QuizBank({ groups: [group] });
  assert.equal(bank.drawQuestion().difficulty, 'challenge');
  assert.equal(bank.drawQuestion({ difficulty: 'easy' }).q, card.q);
  assert.throws(() => new QuizBank({ groups: [{ ...group, questions: [{...card,difficulty:'typo'}] }] }), /难度/);
});

test('错答和超时均可留在解析页并免费换题，答对才扣一次费用', () => {
  const bank = new QuizBank(config), upgrades = new UpgradeManager(), economy = new Economy();
  const gate = new QuizGate({ bank, upgrades, economy });
  const gold = economy.gold, cost = upgrades.getCost('damage');
  assert.equal(gate.retry(), false);
  assert.ok(gate.open('damage', 'easy'));
  const first = gate.question;
  gate.submit((first.answer + 1) % first.options.length);
  gate.tick(100);
  assert.equal(gate.phase, 'review');
  assert.equal(gate.question.explanation, first.explanation);
  assert.equal(gate.submit(first.answer), null);
  assert.ok(gate.retry());
  assert.equal(gate.question.difficulty, 'easy');
  assert.notEqual(gate.question.q, first.q);
  assert.equal(gate.retry(), false);
  gate.tick(gate.remaining + 1);
  gate.tick(100);
  assert.equal(gate.phase, 'review');
  assert.ok(gate.lastResult.timedOut);
  assert.equal(economy.gold, gold);
  assert.equal(upgrades.getLevel('damage'), 0);
  assert.ok(gate.retry());
  gate.submit(gate.question.answer);
  assert.equal(economy.gold, gold - cost);
  assert.equal(upgrades.getLevel('damage'), 1);
  assert.equal(gate.retry(), false);
  gate.tick(1);
  assert.equal(gate.isOpen, false);
});
