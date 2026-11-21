import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../js/game/map.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { Soldier, SoldierManager } from '../js/game/soldier.js';
import { EffectManager } from '../js/game/effects.js';
import { Economy } from '../js/game/economy.js';
import { ProjectileManager } from '../js/game/projectile.js';
import { UltimateManager, UltimateType } from '../js/game/ultimate.js';
import { WaveManager, campaignWaves } from '../js/game/wave.js';
import { bossStrikeTheme } from '../js/game/boss-strike.js';
import catalog from '../config/maps.json' with {type:'json'};
import patterns from '../config/waves.json' with {type:'json'};

const DT = 1 / 60;
function arena(id = 'tide', guardCount = 3) {
  const stage = catalog.maps.find(s => s.id === id);
  const map = new GameMap(stage), economy = new Economy(stage);
  const soldiers = new SoldierManager(), effects = new EffectManager();
  const waves = new WaveManager(map, campaignWaves(patterns, stage), {soldiers});
  for (const [col, row] of stage.sites.slice(0, guardCount)) {
    map.occupy(col, row);
    soldiers.add(new Soldier(col, row, 'arrow'));
  }
  const addBoss = () => {
    const boss = new Monster(map, MonsterType.BOSS);
    waves.active.push(boss);
    return boss;
  };
  const step = (frames = 1, frozen = false) => {
    for (let i = 0; i < frames; i++) waves.update(DT, economy, effects, undefined, 1, frozen);
  };
  const waitForCast = () => {
    for (let i = 0; i < 800 && !waves.bossWarnings.length; i++) step();
    assert.ok(waves.bossWarnings.length, stage.title + ' 应出现预警');
    return waves.bossWarnings[0];
  };
  return {stage, map, economy, soldiers, effects, waves, addBoss, step, waitForCast};
}

test('所有战场的首领锁定最近两座守卫并完整预告两个游戏秒，冲击后可抢修', () => {
  for (const {id} of catalog.maps) {
    const a = arena(id), boss = a.addBoss();
    const warning = a.waitForCast();
    assert.equal(warning.remaining, 2);
    assert.equal(warning.theme, bossStrikeTheme(id));
    assert.equal(warning.theme.name, id === 'tide' ? '潮纹冲击' : '首领冲击');
    const distance = s => Math.hypot(s.x - boss.x, s.y - boss.y);
    const ordered = [...a.soldiers.getAll()].sort((x, y) => distance(x) - distance(y));
    assert.deepEqual(warning.targets, ordered.slice(0, 2));
    a.step(119);
    assert.ok(ordered.every(s => s.hp === s.maxHp));
    assert.ok(a.waves.bossWarnings[0].remaining > 0);
    a.step();
    assert.deepEqual(ordered.map(s => s.maxHp - s.hp), [30,30,0]);
    assert.equal(a.waves.bossWarnings.length, 0);
    assert.equal(a.economy.baseLives, a.economy.maxLives);
    const ult = new UltimateManager(a);
    for (let i = 0; i < 25; i++) ult.onKill();
    assert.ok(ult.activate(UltimateType.REPAIR));
    assert.ok(ordered.every(s => s.hp === s.maxHp));
  }
});

test('双王分别蓄力，冰冻可在命中前一帧打断全部警示，冻结期不计入冷却', () => {
  const a = arena();
  const first = a.addBoss();
  a.step(30);
  const second = a.addBoss();
  a.waitForCast();
  a.step(119);
  const warnings = a.waves.bossWarnings;
  assert.deepEqual(warnings.map(w => w.boss), [first, second]);
  assert.ok(warnings[0].remaining < warnings[1].remaining);
  assert.equal(a.waves.interruptBossStrikes(), 2);
  assert.equal(a.waves.interruptBossStrikes(), 0);
  a.step(180, true);
  a.step(480);
  assert.equal(a.waves.bossWarnings.length, 0);
  assert.ok(a.soldiers.getAll().every(s => s.hp === s.maxHp));
  a.step(62);
  assert.equal(a.waves.bossWarnings.length, 2);
});

test('仅传入全图冰冻状态也会取消进行中的蓄力，暂停时钟不会消耗预警', () => {
  const a = arena();
  a.addBoss(); a.waitForCast();
  a.waves.update(0, a.economy, a.effects);
  assert.equal(a.waves.bossWarnings[0].remaining, 2);
  a.step(1, true);
  assert.equal(a.waves.bossWarnings.length, 0);
  a.step(120);
  assert.ok(a.soldiers.getAll().every(s => s.hp === s.maxHp));
});

test('霜晶减速不打断冲击，首领自身的冻结计时会打断冲击', () => {
  const a = arena(), boss = a.addBoss();
  a.waitForCast();
  boss.applySlow(.5, 2);
  a.step();
  assert.equal(a.waves.bossWarnings.length, 1);
  boss.applySlow(0, .5);
  a.step();
  assert.equal(a.waves.bossWarnings.length, 0);
  assert.ok(a.soldiers.getAll().every(s => s.hp === s.maxHp));
});

test('卖掉被标记的塔并在原格重建，原塔和新塔都不会承受该次冲击', () => {
  const a = arena();
  a.addBoss();
  const [sold, retained] = a.waitForCast().targets;
  a.soldiers.removeAt(sold.col, sold.row);
  const replacement = a.soldiers.add(new Soldier(sold.col, sold.row, 'cannon'));
  a.step();
  assert.deepEqual(a.waves.bossWarnings[0].targets, [retained]);
  a.step(119);
  assert.equal(sold.hp, sold.maxHp);
  assert.equal(replacement.hp, replacement.maxHp);
  assert.equal(retained.hp, retained.maxHp - 30);
});

test('目标先被击毁或首领先被击杀时取消锁定，首领漏过只结算一次', () => {
  const a = arena('moon', 1), [guard] = a.soldiers.getAll();
  const boss = a.addBoss();
  a.waitForCast();
  guard.takeDamage(guard.maxHp);
  a.step();
  assert.equal(a.waves.bossWarnings.length, 0);
  const backup = a.soldiers.add(new Soldier(guard.col, guard.row, 'arrow'));
  a.waitForCast();
  boss.takeDamage(99999);
  assert.equal(a.waves.bossWarnings.length, 0);
  a.step(120);
  assert.equal(backup.hp, backup.maxHp);
  const runner = a.addBoss();
  a.waitForCast();
  runner.reachedBase = true; runner.alive = false;
  a.step(120);
  assert.equal(a.waves.leaks, 1);
  assert.equal(a.economy.baseLives, a.economy.maxLives - 1);
  a.economy.repairBase();
  assert.equal(a.waves.leaks, 1);
  assert.equal(a.waves.bossWarnings.length, 0);
  assert.equal(backup.hp, backup.maxHp);
});

test('空场不锁定城堡，首领原有的远程弹道仍可命中城堡', () => {
  const a = arena('tide', 0), boss = a.addBoss();
  a.step(360);
  assert.equal(a.waves.bossWarnings.length, 0);
  const nearGate = a.map.getPathPosition(a.map.getPathLength() - 72);
  boss.dist = a.map.getPathLength() - 72;
  boss.x = nearGate.x; boss.y = nearGate.y;
  const shots = new ProjectileManager();
  a.waves.update(DT, a.economy, a.effects, shots);
  assert.equal(shots.getAll().length, 1);
  shots.update(1, [], a.effects);
  assert.equal(a.economy.baseLives, a.economy.maxLives - 1);
  assert.equal(a.waves.leaks, 0);
});
