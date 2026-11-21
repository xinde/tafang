import { test } from 'node:test';
import assert from 'node:assert/strict';
import maps from '../config/maps.json' with { type: 'json' };
import climate from '../config/weather.json' with { type: 'json' };
import patterns from '../config/waves.json' with { type: 'json' };
import { CONFIG } from '../js/config.js';
import { GameMap } from '../js/game/map.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { Soldier } from '../js/game/soldier.js';
import { Projectile, ProjectileManager } from '../js/game/projectile.js';
import { WEAPONS } from '../js/game/weapon.js';
import { WaveManager, campaignWaves } from '../js/game/wave.js';

const dt = CONFIG.FIXED_DT;
const clear = {key: 'clear', effects: {damageMul: 1, fireRateMul: 1, rangeMul: 1, monsterSpeedMul: 1}};

function hitsBeforeGate(soldier, map, enemyConfig, weather) {
  const enemy = new Monster(map, enemyConfig);
  const monsters = [enemy], projectiles = new ProjectileManager();
  const ctx = {monsters, projectiles};
  soldier.recompute(weather.effects);
  const speedMul = weather.effects.monsterSpeedMul;
  const ticks = Math.ceil(map.getPathLength() / (enemy.speed * speedMul * dt)) + 1;
  for (let step = 0; step < ticks && !enemy.reachedBase; step++) {
    // 与主循环一致：守卫开火、弹道命中、敌人前进。到达城堡后的伤害不能计入。
    soldier.update(dt, ctx);
    projectiles.update(dt, monsters);
    if (enemy.hp < enemy.maxHp) return true;
    enemy.update(dt, {speedMul});
  }
  return false;
}

for (const stage of maps.maps) {
  test(stage.title + '：每个石台的七种基础守卫在本关各种天气下都能命中路过的快敌', () => {
    const map = new GameMap(stage);
    const waves = new WaveManager(map, campaignWaves(patterns, stage));
    const roster = stage.waves.flatMap((_, i) => waves._buildWave(i + 1));
    const fastest = roster.reduce((a, b) => a.speed >= b.speed ? a : b);
    const conditions = [clear, ...climate.weathers.filter(w => stage.weather.includes(w.key))];
    const failures = [];
    for (const [col, row] of stage.sites) {
      for (const weather of conditions) {
        for (const w of Object.values(WEAPONS)) {
          const soldier = new Soldier(col, row, w.type);
          const parts = map.coveredRoad(col, row, w.range * weather.effects.rangeMul);
          const covers = parts.some(([x,y,u,v]) => x !== u || y !== v);
          const hits = hitsBeforeGate(soldier, map, fastest, weather);
          if (!covers || !hits) failures.push([col, row, w.type, weather.key, covers ? '未命中' : '无覆盖']);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
}

test('重炮在弹体接触活怪时爆炸，溅射半径按被命中怪物的位置结算', () => {
  const map = new GameMap(), w = WEAPONS.cannon;
  const target = new Monster(map, MonsterType.FAST);
  target.x = 180; target.y = 100;
  const near = new Monster(map, MonsterType.TANK);
  const far = new Monster(map, MonsterType.TANK);
  near.x = target.x + w.aoe - 1; far.x = target.x + w.aoe + 1;
  near.y = far.y = target.y;
  const step = w.projectileSpeed * dt;
  const x = target.x - target.radius * map.cellSize - w.projRadius - step - 1;
  const shell = new Projectile({x, y: target.y, target, speed: w.projectileSpeed,
    radius: w.projRadius, damage: w.damage, aoe: w.aoe, weaponType: w.type});
  const monsters = [target, near, far];
  shell.update(dt, monsters);
  assert.ok(shell.alive);
  assert.equal(target.hp, target.maxHp);
  shell.update(dt, monsters);
  assert.equal(shell.alive, false);
  assert.ok(target.hp < target.maxHp);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('已失去目标的炮弹正常飞到最后位置，再结算在场怪物的溅射', () => {
  const map = new GameMap(), target = new Monster(map, MonsterType.TANK);
  target.x = 120; target.y = 90;
  const neighbour = new Monster(map, MonsterType.NORMAL);
  neighbour.x = 130; neighbour.y = 90;
  const shell = new Projectile({x: 110, y: 90, target, speed: 220, radius: 6, damage: 22, aoe: 58, weaponType:'cannon'});
  target.takeDamage(9999);
  shell.update(dt, [target, neighbour]);
  assert.ok(shell.alive);
  assert.equal(neighbour.hp, neighbour.maxHp);
  shell.update(1, [target, neighbour]);
  assert.equal(shell.alive, false);
  assert.ok(neighbour.hp < neighbour.maxHp);
});
