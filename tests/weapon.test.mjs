import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../js/game/map.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { Projectile } from '../js/game/projectile.js';
import { WEAPONS, WeaponType } from '../js/game/weapon.js';

function spawnMonster(map, opts = {}, x = 120, y = 120) {
  const m = new Monster(map, { hp: 100, speed: 60, reward: 5, armor: 0, ...opts });
  m.x = x;
  m.y = y;
  return m;
}

test('新增武器定义齐全：狙击/寒冰/雷霆各自带差异化能力', () => {
  const sniper = WEAPONS[WeaponType.SNIPER];
  const frost = WEAPONS[WeaponType.FROST];
  const storm = WEAPONS[WeaponType.STORM];

  assert.ok(sniper, '应存在 SNIPER 定义');
  assert.ok(frost, '应存在 FROST 定义');
  assert.ok(storm, '应存在 STORM 定义');
  assert.ok(sniper.pierce > 0, '狙击应具有穿甲');
  assert.ok(frost.slow && frost.slow.factor < 1, '寒冰应具有减速');
  assert.ok(storm.chain && storm.chain.count > 0, '雷霆应具有链式跳跃');
});

test('狙击命中装甲怪时按穿甲结算，高于普通无穿甲命中', () => {
  const map = new GameMap();
  const armoredA = spawnMonster(map, { hp: 60, armor: MonsterType.ARMORED.armor }, 120, 120);
  const armoredB = spawnMonster(map, { hp: 60, armor: MonsterType.ARMORED.armor }, 120, 120);

  const sniperShot = new Projectile({
    x: 0,
    y: 0,
    target: armoredA,
    speed: 1,
    damage: WEAPONS[WeaponType.SNIPER].damage,
    pierce: WEAPONS[WeaponType.SNIPER].pierce,
  });
  const arrowShot = new Projectile({
    x: 0,
    y: 0,
    target: armoredB,
    speed: 1,
    damage: WEAPONS[WeaponType.SNIPER].damage,
    pierce: 0,
  });

  sniperShot._hit([armoredA]);
  arrowShot._hit([armoredB]);

  assert.equal(armoredA.hp, 18, '狙击穿甲后应吃满 42 伤害');
  assert.equal(armoredB.hp, 22, '无穿甲时应被护甲减到 38 伤害');
});

test('寒冰命中后会减速，下一秒移动距离减半', () => {
  const map = new GameMap();
  const target = spawnMonster(map, { hp: 100, speed: 60 }, 120, 120);
  const frost = WEAPONS[WeaponType.FROST];
  const shot = new Projectile({
    x: 0,
    y: 0,
    target,
    speed: 1,
    damage: frost.damage,
    slow: frost.slow,
  });

  shot._hit([target]);

  assert.equal(target.hp, 95, '寒冰应造成基础伤害');
  assert.equal(target.isSlowed, true, '命中后应进入减速状态');
  target.update(1);
  assert.equal(target.dist, 30, '减速 50% 后，1 秒只前进 30 像素');
});

test('雷霆命中后会按最近目标链式跳跃并逐跳衰减伤害', () => {
  const map = new GameMap();
  const storm = WEAPONS[WeaponType.STORM];
  const m1 = spawnMonster(map, { hp: 100 }, 120, 120);
  const m2 = spawnMonster(map, { hp: 100 }, 180, 120);
  const m3 = spawnMonster(map, { hp: 100 }, 240, 120);
  const m4 = spawnMonster(map, { hp: 100 }, 300, 120);
  const shot = new Projectile({
    x: 0,
    y: 0,
    target: m1,
    speed: 1,
    damage: storm.damage,
    chain: storm.chain,
  });

  shot._hit([m1, m2, m3, m4]);

  assert.equal(m1.hp, 91, '主目标应先吃满 9 伤害');
  assert.equal(m2.hp, 94, '第 1 跳应按 9*0.7 ≈ 6 伤害');
  assert.equal(m3.hp, 96, '第 2 跳应继续衰减到约 4 伤害');
  assert.equal(m4.hp, 97, '第 3 跳应继续衰减到约 3 伤害');
});
