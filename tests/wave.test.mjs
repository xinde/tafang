// 波次系统回归测试：WaveManager / Monster / Economy / GameMap 集成
// 运行：node --test tests/   或   node tests/wave.test.mjs
//
// 断言修正说明（原临时脚本 js/game/__verify_wave.mjs 6 项失败均为过严期望，非真实 bug）：
// 1) 生成帧：WaveManager.update 同帧生成并移动怪兽，dist 不为 0 -> 改断言"生成后已在路径起点附近且持续前进"。
// 2) 漏怪结算：GameMap.getPathPosition 在 dist 恰等于路径总长时返回 done=false（需越过才结算）
//    -> 漏怪测试将 dist 设为 pathLength 再 update，一步越过终点触发 reachedBase。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../js/game/map.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { WaveManager } from '../js/game/wave.js';
import { Economy } from '../js/game/economy.js';
import { EffectManager } from '../js/game/effects.js';

const DT = 1 / 60;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('波次生成数量与生成状态', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const waves = new WaveManager(map);
  assert.equal(waves.waveIndex, 0, '初始 waveIndex 为 0');
  assert.equal(waves.startNextWave(), true, '空闲时 startNextWave 应成功');
  assert.equal(waves.waveIndex, 1, '开波后 waveIndex 为 1');
  assert.equal(waves.isWaveInProgress(), true, '开波后应进行中');
  let steps = 0;
  while (waves.spawning && steps < 1e5) { waves.update(DT, econ, fx); steps++; }
  const expected = 4 + 1 * 2; // _buildWave(1): count = 4 + index*2 = 6
  assert.equal(waves.getActive().length, expected, `第1波应生成 ${expected} 只`);
  assert.equal(waves.spawning, false, '队列排空后 spawning 应关闭');
});

test('怪兽沿路径移动（同帧生成即推进）', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const waves = new WaveManager(map);
  waves.startNextWave();
  let steps = 0;
  while (waves.getActive().length === 0 && steps < 1e5) { waves.update(DT, econ, fx); steps++; }
  const m = waves.getActive()[0];
  // 修正：WaveManager.update 同帧生成并移动，dist 已为小幅正值（速度×dt≈1）
  assert.ok(m.dist > 0, `生成同帧已移动，dist 应 > 0，got ${m.dist}`);
  assert.ok(m.dist < 5, `dist 应为小幅正值，got ${m.dist}`);
  // 出生点 x=-24（col=-1），移动后略大于 -24，仍在第一段（x < 216 = col4 中心）
  assert.ok(m.x > -24 && m.x < 216, `应在第一段路径起点附近，x=${m.x}`);
  const d0 = m.dist, x0 = m.x;
  waves.update(DT, econ, fx);
  assert.ok(m.dist > d0, 'dist 应持续增长');
  assert.ok(m.x > x0, 'x 应向右推进');
});

test('击杀：掉金币 + 死亡特效 + 移除', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const waves = new WaveManager(map);
  waves.startNextWave();
  let steps = 0;
  while (waves.getActive().length === 0 && steps < 1e5) { waves.update(DT, econ, fx); steps++; }
  const target = waves.getActive()[0];
  const reward = target.reward;
  const goldBefore = econ.gold;
  target.takeDamage(9999);
  assert.equal(target.alive, false, '致命伤害后应死亡');
  assert.equal(target.hp, 0, 'hp 应钳位到 0');
  waves.update(DT, econ, fx);
  assert.equal(econ.gold, goldBefore + reward, `应获得击杀奖励 ${reward}`);
  assert.ok(!waves.getActive().includes(target), '击杀后应移除');
  assert.ok(fx.effects.some((e) => e.kind === 'death'), '应生成死亡爆裂特效');
});

test('漏怪：扣基地血 + 移除', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const waves = new WaveManager(map);
  waves.startNextWave();
  let steps = 0;
  while (waves.getActive().length === 0 && steps < 1e5) { waves.update(DT, econ, fx); steps++; }
  const leaker = waves.getActive()[0];
  const livesBefore = econ.baseLives;
  // 修正：设 dist=pathLength（恰在终点），update 一步后 dist 越过总长 -> getPathPosition done=true -> reachedBase
  leaker.dist = map.getPathLength();
  waves.update(DT, econ, fx);
  assert.equal(leaker.reachedBase, true, '越过终点应标记 reachedBase');
  assert.equal(leaker.alive, false, '漏怪应转为非存活');
  assert.equal(econ.baseLives, livesBefore - 1, `基地血应 -1：${livesBefore} -> ${econ.baseLives}`);
  assert.ok(!waves.getActive().includes(leaker), '漏怪结算后应移除');
});

test('基地血归 0 触发游戏结束', () => {
  const econ = new Economy();
  assert.equal(econ.isGameOver(), false, '初始不应结束');
  const start = econ.baseLives;
  econ.damageBase(start);
  assert.equal(econ.baseLives, 0, 'baseLives 应钳位到 0');
  assert.equal(econ.isGameOver(), true, '0 血应游戏结束');
});

test('波次递增：数量/血量随波增长，高波引入 FAST/TANK', () => {
  const map = new GameMap();
  const waves = new WaveManager(map);
  const w1 = waves._buildWave(1);
  const w5 = waves._buildWave(5);
  assert.ok(w5.length > w1.length, `第5波数量(${w5.length})应大于第1波(${w1.length})`);
  // NORMAL 血量缩放：wave1 hpScale=1，wave5 hpScale=1+4*0.25=2
  assert.ok(w5[0].hp > w1[0].hp, `第5波首怪血量(${w5[0].hp})应大于第1波(${w1[0].hp})`);
  const hasTank5 = w5.some((c) => c.radius === MonsterType.TANK.radius);
  const hasFast5 = w5.some((c) => c.radius === MonsterType.FAST.radius);
  assert.ok(hasTank5, '第5波应含 TANK');
  assert.ok(hasFast5, '第5波应含 FAST');
  const allNormal1 = w1.every((c) => c.radius === MonsterType.NORMAL.radius);
  assert.ok(allNormal1, '第1波应全为 NORMAL');
});

test('波进行中拒绝重复开波', () => {
  const map = new GameMap();
  const econ = new Economy();
  const waves = new WaveManager(map);
  assert.equal(waves.startNextWave(), true, '首次开波应成功');
  assert.equal(waves.startNextWave(), false, '进行中再次开波应被忽略');
});

test('hpRatio 与部分伤害', () => {
  const map = new GameMap();
  const m = new Monster(map, { hp: 100, speed: 10, reward: 5 });
  assert.ok(approx(m.hpRatio, 1), '满血 ratio 为 1');
  m.takeDamage(30);
  assert.ok(approx(m.hpRatio, 0.7), `30/100 后 ratio 应 0.7，got ${m.hpRatio}`);
  assert.equal(m.alive, true, '非致命伤害应存活');
  m.takeDamage(9999);
  assert.equal(m.alive, false, '过量伤害应死亡');
  assert.ok(approx(m.hpRatio, 0), '死亡后 ratio 为 0');
});

test('波间隔后自动开下一波', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const waves = new WaveManager(map);
  waves.startNextWave();
  // 生成并立即击杀每只，清空本波
  let steps = 0;
  while (steps < 2e5) {
    waves.update(DT, econ, fx);
    for (const m of waves.getActive()) m.takeDamage(9999);
    steps++;
    if (!waves.isWaveInProgress() && !waves.spawning) break;
  }
  assert.equal(waves.waveIndex, 1, '清空后仍在第1波');
  assert.equal(waves.isWaveInProgress(), false, '本波应已清空');
  // 步进过 autoStartDelay 后应自动开第2波
  const delay = waves.autoStartDelay;
  let t = 0;
  while (t < delay + 1 && !waves.isWaveInProgress()) { waves.update(DT, econ, fx); t += DT; }
  assert.equal(waves.waveIndex, 2, `应在 ${delay}s 后自动开第2波`);
});

test('金币 earn/spend 联动', () => {
  const econ = new Economy();
  const start = econ.gold;
  econ.earn(50);
  assert.equal(econ.gold, start + 50, 'earn 应加金币');
  assert.equal(econ.canAfford(start + 50), true, 'canAfford 应为 true');
  assert.equal(econ.spend(start + 50), true, 'spend 应成功');
  assert.equal(econ.gold, 0, '花光后应为 0');
  assert.equal(econ.spend(1), false, '余额不足应失败');
});
