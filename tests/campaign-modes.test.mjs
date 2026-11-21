import { test } from 'node:test';
import assert from 'node:assert/strict';
import maps from '../config/maps.json' with { type: 'json' };
import { StageRotation } from '../js/game/stage-rotation.js';
import { challengeInfo, StageChallenge } from '../js/game/stage-challenge.js';

const stages = maps.maps;
const find = id => stages.find(stage => stage.id === id);
function memory() {
  const data = new Map();
  return {getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v))};
}

test('首次首页只抽初阵，三张都可出现；固定链接可以直接进决战', () => {
  const starts = [0, .5, .99].map(random =>
    new StageRotation(stages, memory(), () => random, memory()).select());
  assert.ok(starts.every(stage => stage.difficulty === '初阵'));
  assert.equal(new Set(starts.map(stage => stage.id)).size, 3);
  const deck = new StageRotation(stages, memory(), () => 0, memory());
  assert.equal(deck.select('moon'), find('moon'));
});

test('新标签页能识别回访者；旧版历史与最佳评级继续生效', () => {
  const local = memory(), first = new StageRotation(stages, memory(), () => 0, local);
  first.select();
  const returning = new StageRotation(stages, memory(), () => .999, local).select();
  assert.equal(returning.difficulty, '决战');
  const oldLocal = memory(); oldLocal.setItem('emberwatch.rank.moss', 'A');
  assert.equal(new StageRotation(stages, memory(), () => .999, oldLocal).select().difficulty, '决战');
  const legacy = memory(); legacy.setItem('emberwatch.stage-history', JSON.stringify(['missing','frost','frost']));
  assert.notEqual(new StageRotation(stages, legacy, () => .5, memory()).select().id, 'frost');
});

test('同难度在本级轮换，切回全池时仍记住已经出现的地图', () => {
  const tab = memory(), prefs = memory();
  const next = () => new StageRotation(stages, tab, () => .9, prefs);
  let deck = next();
  const first = deck.select('quartz');
  deck.setScope('same');
  const tier = [first];
  for (let i = 0; i < 2; i++) tier.push(next().select());
  assert.ok(tier.every(stage => stage.difficulty === '艰难'));
  assert.equal(new Set(tier.map(stage => stage.id)).size, 3);
  const firstOfNext = next().select();
  assert.notEqual(firstOfNext.id, tier[2].id);
  deck = next(); deck.setScope('all');
  const remaining = new Set();
  for (let i = 0; i < stages.length - 3; i++) remaining.add(next().select().id);
  assert.equal(remaining.size, stages.length - 3);
  assert.ok(tier.every(stage => !remaining.has(stage.id)));
});

test('同难度跟随实际进入的关卡，重试不多占一次，记得在新标签页使用所选范围', () => {
  const local = memory(), session = memory();
  const first = new StageRotation(stages, session, () => 0, local);
  first.select('dunes');
  first.setScope('same');
  first.select('tide');
  const resume = new StageRotation(stages, session, () => .99, local);
  assert.equal(resume.scope, 'same');
  assert.equal(resume.select('tide').id, 'tide');
  assert.ok(['moss','mill'].includes(resume.select().id));
  const anotherTab = new StageRotation(stages, memory(), () => .99, local);
  assert.equal(anotherTab.select().difficulty, '初阵');
});

test('无存储和单图难度均可游玩；过期与损坏存档可恢复', () => {
  const denied = {getItem() { throw Error(); }, setItem() { throw Error(); }};
  const one = new StageRotation([find('moss'),find('moon')], denied, () => 0, denied);
  one.select('moon'); one.setScope('same');
  assert.equal(one.select().id, 'moon');
  one.setScope('all');
  assert.equal(one.select().id, 'moss');
  const invalid = memory(); invalid.setItem('emberwatch.stage-history','broken');
  assert.equal(new StageRotation(stages, invalid, () => 0).select().id, 'moss');
});

test('四卫勋章按在场峰值，事后减少人数或通关失败都不能冒领奖励', () => {
  const store = memory(), stage = find('moss');
  const run = new StageChallenge(stage, store);
  for (const count of [2, 4, 5, 2]) run.recordDeployment(count);
  assert.equal(run.value, 5);
  assert.equal(run.finish(true), false);
  assert.equal(run.hasMedal(), false);
  const retry = new StageChallenge(stage, store);
  assert.equal(retry.value, 0);
  for (const count of [2, 4, 1, 3]) retry.recordDeployment(count);
  assert.equal(retry.finish(false), false);
  assert.equal(retry.hasMedal(), false);
  assert.ok(retry.finish(true));
  assert.ok(new StageChallenge(stage, store).hasMedal());
  assert.equal(retry.hasMedal(challengeInfo(find('fen'))), false);
  run.finish(false);
  assert.ok(run.hasMedal());
});

test('零漏怪用累计进城次数，抢修后的城堡耐久不参与结算', () => {
  const store = memory(), stage = find('tide');
  const run = new StageChallenge(stage, store);
  run.recordDeployment(10); run.recordEarlyWave();
  assert.equal(run.value, 0);
  run.recordLeaks(1); run.recordLeaks(0);
  assert.equal(run.finish(true), false);
  const clean = new StageChallenge(stage, store);
  clean.recordLeaks(0);
  assert.ok(clean.finish(true));
});

test('两次与三次提前迎战分别达标；每张图独立，存储被禁用时本局也可见', () => {
  const noStorage = {getItem() { throw Error(); }, setItem() { throw Error(); }};
  for (const [id, goal] of [['mill',2],['amber',3]]) {
    const run = new StageChallenge(find(id), noStorage);
    run.recordDeployment(9); run.recordLeaks(7);
    assert.equal(run.value, 0);
    for (let i=1; i<goal; i++) run.recordEarlyWave();
    assert.equal(run.finish(true), false);
    run.recordEarlyWave();
    assert.ok(run.finish(true));
    assert.ok(run.hasMedal());
  }
});

test('十二关都有可达的可选目标，勋章键不重合', () => {
  const goals = stages.map(challengeInfo);
  assert.deepEqual(new Set(goals.map(g => g.type)), new Set(['guards','leaks','early']));
  assert.equal(new Set(goals.map(g => g.storageKey)).size, stages.length);
  goals.forEach((g,i) => {
    assert.ok(Number.isInteger(g.target));
    if (g.type === 'early') assert.ok(g.target > 0 && g.target <= stages[i].waves.length-1);
  });
});
