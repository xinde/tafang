import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../js/game/map.js';
import { Soldier, TargetMode } from '../js/game/soldier.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { ProjectileManager } from '../js/game/projectile.js';
import { WaveManager } from '../js/game/wave.js';
import { Economy } from '../js/game/economy.js';
import { BattleTactics } from '../js/game/tactics.js';
import wavesConfig from '../config/waves.json' with { type:'json' };
import maps from '../config/maps.json' with { type:'json' };

const map = new GameMap();
function enemy(x, y = 24) {
  const m = new Monster(map, {...MonsterType.NORMAL, hp: 100});
  m.x = x; m.y = y; m.dist = x;
  return m;
}
function shoot(soldier, target, monsters, tactic) {
  const projectiles = new ProjectileManager();
  soldier._fire(target, {monsters, projectiles, tactic});
  projectiles.update(2, monsters);
}

test('第二波清空后整备计时和手动开波都等待选择，本局只能选择一次', () => {
  const tactics = new BattleTactics(), economy = new Economy();
  const waves = new WaveManager(map, wavesConfig, {tactics});
  assert.equal(tactics.choose('salvage', waves), false);
  for (let i = 1; i <= 2; i++) {
    assert.ok(waves.startNextWave());
    assert.equal(tactics.needsChoice(waves), false);
    while (waves.isWaveInProgress()) {
      waves.update(.1, economy);
      for (const m of waves.getActive()) m.takeDamage(99999);
    }
  }
  const balance = economy.gold, rest = waves.nextWaveIn;
  assert.ok(tactics.needsChoice(waves));
  assert.equal(waves.startNextWave(economy), false);
  waves.update(30, economy);
  assert.equal(waves.waveIndex, 2); assert.equal(waves.nextWaveIn, rest); assert.equal(economy.gold,balance);
  assert.equal(tactics.saleRefund(45),22);
  assert.ok(tactics.choose('salvage',waves));
  assert.equal(tactics.saleRefund(45),36);
  assert.equal(tactics.choose('volley',waves),false);
  assert.ok(waves.startNextWave(economy));
  assert.equal(tactics.needsChoice(waves),false);
});

test('碎冰在炮弹实际命中时使用目标的霜晶减速，扩大溅射，并保留全图冰冻', () => {
  const tower = new Soldier(0,0,'cannon'), a = enemy(80), b = enemy(164);
  a.applySlow(.5,1.5); a.applySlow(0,.5);
  shoot(tower,a,[a,b],'shatter');
  assert.equal(a.hp,78); assert.equal(b.hp,78);
  assert.ok(a.isSlowed); assert.equal(a.consumeFrost(),false);
  shoot(tower,a,[a,b],'shatter');
  assert.equal(b.hp,78);
  a.applySlow(.5,1);
  shoot(tower,a,[a,b],'salvage');
  assert.equal(b.hp,78); assert.equal(a.consumeFrost(),true);
});

test('弩手按实际命中给第三箭加伤，换目标重计，两座弩手独立', () => {
  const one = new Soldier(0,0,'arrow'), two = new Soldier(0,1,'arrow'), a = enemy(52), b = enemy(70);
  shoot(one,a,[a,b],'volley'); shoot(one,a,[a,b],'volley'); shoot(two,a,[a,b],'volley');
  assert.equal(a.hp,79);
  shoot(one,a,[a,b],'volley'); assert.equal(a.hp,65);
  shoot(one,b,[a,b],'volley'); shoot(one,a,[a,b],'volley'); assert.equal(a.hp,58);
  shoot(two,a,[a,b],'volley'); shoot(two,a,[a,b],'volley'); assert.equal(a.hp,37);
});

test('覆盖预览能识别空射程和相切路段，调整后的两个石台都有近卫覆盖', () => {
  const straight = new GameMap({waypoints:[{col:-1,row:2},{col:7,row:2}]});
  const part = straight.coveredRoad(3,1,60);
  assert.deepEqual(part, [[132,120,204,120]]);
  assert.deepEqual(straight.coveredRoad(3,1,47),[]);
  assert.deepEqual(straight.coveredRoad(3,1,48),[[168,120,168,120]]);
  for (const [id,oldSite,newSite] of [['tide',[19,5],[19,8]],['amber',[10,8],[11,9]]]) {
    const stageMap = new GameMap(maps.maps.find(s=>s.id===id));
    const range = new Soldier(...newSite, 'sword').range;
    assert.equal(stageMap.canPlace(...oldSite), false);
    assert.deepEqual(stageMap.coveredRoad(...oldSite, range), []);
    assert.ok(stageMap.canPlace(...newSite));
    assert.ok(stageMap.coveredRoad(...newSite, range).length > 0);
  }
});

test('同一座守卫可即时切换领头和最近，其他守卫保持各自的索敌方式', () => {
  const s = new Soldier(0,0,'arrow'), other = new Soldier(0,0,'arrow');
  const near = enemy(46), front = enemy(130);
  assert.equal(s.acquireTarget([near,front]),front);
  assert.ok(s.setTargetMode(TargetMode.NEAREST));
  assert.equal(s.acquireTarget([near,front]),near);
  assert.equal(other.acquireTarget([near,front]),front);
  assert.equal(s.setTargetMode('other'),false);
  assert.ok(s.setTargetMode(TargetMode.FIRST));
  assert.equal(s.acquireTarget([near,front]),front);
});
