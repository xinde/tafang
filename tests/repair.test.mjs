import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../js/game/economy.js';
import { EffectManager } from '../js/game/effects.js';
import { Soldier, SoldierManager } from '../js/game/soldier.js';
import { UltimateManager, UltimateType } from '../js/game/ultimate.js';

function battlefield() {
  const economy = new Economy({startGold: 84, baseLives: 17});
  const soldiers = new SoldierManager(), effects = new EffectManager();
  const basePosition = {x: 420, y: 60};
  const ult = new UltimateManager({economy, soldiers, effects, basePosition});
  for (let i = 0; i < 25; i++) ult.onKill();
  return {economy, soldiers, effects, ult};
}

test('一次抢修回满本关城堡和所有存活守卫，耗一格满能量，显示实际回血量', () => {
  const {economy, soldiers, effects, ult} = battlefield();
  const [a, b, intact, lost] = [1,2,3,4].map(col => soldiers.add(new Soldier(col, 2, 'arrow')));
  a.takeDamage(32); b.takeDamage(91); lost.takeDamage(lost.maxHp);
  economy.damageBase(9);
  const events = [];
  economy.onChange(e => events.push(e));
  assert.ok(ult.canActivate(UltimateType.REPAIR));
  assert.ok(ult.activate(UltimateType.REPAIR));
  assert.equal(a.hp, a.maxHp); assert.equal(b.hp, b.maxHp); assert.equal(intact.hp, intact.maxHp);
  assert.equal(lost.alive, false); assert.ok(lost.hp <= 0);
  assert.deepEqual(events, [{gold: 84, baseLives: 17}]);
  assert.deepEqual(effects.effects.filter(e => e.kind === 'heal').map(e => e.amount).sort((x,y) => x-y), [9,32,91]);
  assert.equal(ult.energy, 0); assert.equal(ult.activeUltimate, null);
  assert.equal(ult.activate(UltimateType.REPAIR), false);
  ult.onKill();
  assert.equal(ult.energy, 4);
});

test('只有城堡或只有守卫受损时都可以修，完好或已失守时保留能量', () => {
  const {economy, soldiers, ult} = battlefield();
  assert.equal(ult.activate(UltimateType.REPAIR), false);
  assert.equal(ult.energy, 100);
  economy.damageBase(1);
  assert.ok(ult.activate(UltimateType.REPAIR));
  assert.equal(economy.baseLives, economy.maxLives);
  const guard = soldiers.add(new Soldier(1, 3, 'cannon'));
  guard.takeDamage(17);
  assert.equal(ult.activate(UltimateType.REPAIR), false);
  assert.equal(guard.hp, guard.maxHp - 17);
  for (let i = 0; i < 25; i++) ult.onKill();
  assert.ok(ult.activate(UltimateType.REPAIR));
  assert.equal(guard.hp, guard.maxHp);
  for (let i = 0; i < 25; i++) ult.onKill();
  economy.damageBase(17); guard.takeDamage(3);
  assert.equal(ult.activate(UltimateType.REPAIR), false);
  assert.equal(economy.baseLives, 0); assert.equal(ult.energy, 100);
});

test('抢修与其余技能共用能量', () => {
  const {economy, ult} = battlefield();
  economy.damageBase(2);
  assert.ok(ult.activate(UltimateType.FREEZE));
  assert.equal(ult.canActivate(UltimateType.REPAIR), false);
  assert.equal(ult.activate(UltimateType.REPAIR), false);
  assert.equal(economy.baseLives, 15);
});
