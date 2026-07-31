// 远程攻击回归测试：法师/BOSS 远程攻击防御塔与基地
// 运行：node --test tests/   或   node tests/ranged.test.mjs
//
// 覆盖：
// - 法师类型与远程配置存在；解锁波次正确
// - acquireTarget：优先最近防御塔，无塔时可选基地
// - updateRanged：锁定目标则停下开火，无目标则继续移动
// - 弹道命中：对防御塔扣塔血；对基地扣基地生命（等价漏怪）
// - 防御塔可被摧毁：wave 层释放格子 + 返还 50% 成本 + 移除
// - 远程伤害随波次缩放
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap } from '../js/game/map.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { WaveManager } from '../js/game/wave.js';
import { Economy } from '../js/game/economy.js';
import { Soldier, SoldierManager } from '../js/game/soldier.js';
import { WeaponType } from '../js/game/weapon.js';
import { Projectile, ProjectileManager } from '../js/game/projectile.js';
import { EffectManager } from '../js/game/effects.js';
import { CONFIG } from '../js/config.js';
import waveConfig from '../config/waves.json' with { type: 'json' };

const DT = 1 / 60;

/** 构造一只已定位的法师（默认放在原点附近），便于测距 */
function makeMage(map, opts = {}) {
  const m = new Monster(map, {
    hp: opts.hp ?? MonsterType.MAGE.hp,
    speed: opts.speed ?? MonsterType.MAGE.speed,
    reward: opts.reward ?? MonsterType.MAGE.reward,
    radius: MonsterType.MAGE.radius,
    color: MonsterType.MAGE.color,
    key: 'mage',
    ranged: { ...MonsterType.MAGE.ranged },
  });
  m.x = opts.x ?? 0;
  m.y = opts.y ?? 0;
  return m;
}

/** 构造 wave.update 中同形状的 combat 上下文 */
function makeCombat({ soldiers = [], baseLives = 20, projectiles = new ProjectileManager(), baseX = 900, baseY = 456 } = {}) {
  const econ = new Economy();
  econ.baseLives = baseLives;
  return {
    soldiers,
    base: {
      x: baseX, y: baseY, lives: baseLives, alive: baseLives > 0,
      takeDamage: () => { econ.damageBase(1); return 1; },
    },
    projectiles,
    _econ: econ,
  };
}

// ---------- 类型与解锁 ----------
test('MAGE 类型定义齐全且带远程配置，BOSS 也带远程', () => {
  const mage = Object.values(MonsterType).find((t) => t.key === 'mage');
  assert.ok(mage, '应有 MAGE 类型');
  assert.ok(mage.ranged && mage.ranged.range > 0 && mage.ranged.damage > 0 && mage.ranged.fireRate > 0,
    'MAGE 应有合法远程配置');
  assert.ok(MonsterType.BOSS.ranged, 'BOSS 应带远程配置');
  assert.ok(MonsterType.BOSS.ranged.damage > MonsterType.MAGE.ranged.damage, 'BOSS 远程伤害应高于法师');
});

test('法师在配置解锁波之前不出现，解锁后确定性出现', () => {
  const map = new GameMap();
  const waves = new WaveManager(map, waveConfig);
  const unlock = waveConfig.unlock.mage;
  for (let k = 0; k < 20; k++) {
    const before = waves._buildWave(unlock - 1);
    assert.ok(!before.some((c) => c.key === 'mage'), `第${unlock - 1}波不应有 MAGE`);
    const at = waves._buildWave(unlock);
    assert.ok(at.some((c) => c.key === 'mage'), `第${unlock}波应可出现 MAGE`);
  }
});

// ---------- 索敌 ----------
test('acquireTarget：优先射程内最近防御塔', () => {
  const map = new GameMap();
  const mage = makeMage(map);
  const far = { x: 200, y: 0, alive: true, weapon: { type: 'arrow' } };
  const near = { x: 100, y: 0, alive: true, weapon: { type: 'sword' } };
  const combat = makeCombat({ soldiers: [far, near] });
  const acq = mage.acquireTarget(combat);
  assert.equal(acq.kind, 'soldier', '应选中防御塔');
  assert.equal(acq.target, near, '应选中更近的塔');
});

test('acquireTarget：跳过已摧毁或射程外的塔，无塔可打时可选基地', () => {
  const map = new GameMap();
  const mage = makeMage(map, { x: 0, y: 0 });
  const dead = { x: 50, y: 0, alive: false, weapon: {} };
  const outOfRange = { x: 500, y: 0, alive: true, weapon: {} };
  const combat = makeCombat({ soldiers: [dead, outOfRange], baseX: 200, baseY: 0 });
  const acq = mage.acquireTarget(combat);
  assert.equal(acq.kind, 'base', '无有效塔时应选中基地');
  assert.equal(acq.dist, 200, '基地距离应正确');
});

test('acquireTarget：塔与基地都不在射程内返回 null', () => {
  const map = new GameMap();
  const mage = makeMage(map, { x: 0, y: 0 });
  const combat = makeCombat({ soldiers: [], baseX: 1000, baseY: 1000 });
  assert.equal(mage.acquireTarget(combat), null, '无目标应返回 null');
});

// ---------- 攻击循环 ----------
test('updateRanged：锁定防御塔时开火，返回攻击移动系数', () => {
  const map = new GameMap();
  const tower = { x: 100, y: 0, alive: true, weapon: { type: 'arrow' } };
  const pm = new ProjectileManager();
  const mage = makeMage(map);
  const combat = makeCombat({ soldiers: [tower], projectiles: pm });
  const speedMul = mage.updateRanged(DT, combat);
  assert.ok(speedMul < 1, '攻击中应返回 <1 的移动系数（边打边走）');
  assert.ok(speedMul > 0, '攻击中移动系数应 >0（不停下）');
  assert.equal(pm.projectiles.length, 1, '应生成一枚弹道');
  assert.equal(pm.projectiles[0].target, tower, '弹道应锁定该塔');
});

test('攻击中仍缓慢移动：dist 推进但速度低于全速', () => {
  const map = new GameMap();
  const tower = { x: 100, y: 0, alive: true, weapon: { type: 'arrow' } };
  const pm = new ProjectileManager();
  const mage = makeMage(map);
  mage._attackTimer = 1; // 封住开火（避免弹道干扰测速），仅测移动系数
  const combat = makeCombat({ soldiers: [tower], projectiles: pm });
  const speedMul = mage.updateRanged(DT, combat);
  const dist0 = mage.dist;
  mage.update(DT, { speedMul });
  const moved = mage.dist - dist0;
  assert.ok(moved > 0, `攻击中应仍移动，moved=${moved}`);
  assert.ok(moved < mage.speed * DT, `攻击中移动应慢于全速（全速=${(mage.speed * DT).toFixed(3)}，实际=${moved.toFixed(3)}）`);
  assert.equal(pm.projectiles.length, 0, '冷却中不应开火');
});

test('updateRanged：射程内无目标返回 1（全速移动）', () => {
  const map = new GameMap();
  const pm = new ProjectileManager();
  const mage = makeMage(map, { x: 0, y: 0 });
  const combat = makeCombat({ soldiers: [], projectiles: pm, baseX: 1000, baseY: 1000 });
  const speedMul = mage.updateRanged(DT, combat);
  assert.equal(speedMul, 1, '无目标应返回 1（全速）');
  assert.equal(pm.projectiles.length, 0, '不应生成弹道');
});

test('近战怪（无 ranged）updateRanged 恒返回 1', () => {
  const map = new GameMap();
  const m = new Monster(map, { hp: 20, speed: 60, reward: 5 });
  const combat = makeCombat({ soldiers: [{ x: 0, y: 0, alive: true, weapon: {} }] });
  assert.equal(m.updateRanged(DT, combat), 1, '近战怪无远程行为，恒全速');
});

// ---------- 弹道命中结算 ----------
test('远程弹道命中防御塔：扣塔血并产生伤害飘字', () => {
  const map = new GameMap();
  const tower = new Soldier(2, 0, WeaponType.ARROW);
  const hpBefore = tower.hp;
  const fx = new EffectManager();
  const pm = new ProjectileManager();
  pm.add(new Projectile({ x: 0, y: 0, target: tower, speed: 600, damage: 10, hitSfx: null }));
  pm.update(10, [], fx); // 大步长瞬间命中
  assert.equal(tower.hp, hpBefore - 10, '塔血应扣除弹道伤害');
  assert.ok(tower.hp < tower.maxHp, '塔应处于受损状态');
  assert.ok(fx.effects.some((e) => e.kind === 'damage'), '应产生伤害飘字');
});

test('远程弹道命中基地：扣基地生命（等价漏怪一次）', () => {
  const map = new GameMap();
  const combat = makeCombat({ baseX: 200, baseY: 0 });
  const livesBefore = combat._econ.baseLives;
  const pm = combat.projectiles;
  pm.add(new Projectile({ x: 0, y: 0, target: combat.base, speed: 600, damage: 8, hitSfx: null }));
  pm.update(10, [], new EffectManager());
  assert.equal(combat._econ.baseLives, livesBefore - 1, '命中基地应扣 1 血');
});

// ---------- 防御塔摧毁与清理 ----------
test('防御塔可被摧毁：alive=false 后 wave 清理（释放格子 + 退款 + 移除）', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const soldiers = new SoldierManager();
  const waves = new WaveManager(map, waveConfig, { soldiers });
  const col = 2, row = 0;
  map.occupy(col, row);
  const tower = new Soldier(col, row, WeaponType.SWORD);
  soldiers.add(tower);
  tower.takeDamage(9999);
  assert.equal(tower.alive, false, '致命伤害后塔应被摧毁');
  const goldBefore = econ.gold;
  waves.update(DT, econ, fx);
  assert.equal(soldiers.getAt(col, row), null, '已摧毁的塔应从管理器移除');
  assert.equal(map.canPlace(col, row), true, '格子应释放为可放置');
  assert.equal(econ.gold, goldBefore + Math.floor(tower.cost * 0.5), '应返还 50% 塔成本');
  assert.ok(fx.effects.some((e) => e.kind === 'death'), '应产生塔损爆裂特效');
});

test('wave 集成：法师边打边走，弹道命中扣塔血', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const pm = new ProjectileManager();
  const soldiers = new SoldierManager();
  const waves = new WaveManager(map, waveConfig, { soldiers });
  // 在法师出生点（-24,120）射程内放置一座塔（(0,1) 不在路径上）
  map.occupy(0, 1);
  const tower = new Soldier(0, 1, WeaponType.SWORD);
  soldiers.add(tower);
  // 注入一只法师于出生点
  const mage = new Monster(map, {
    hp: MonsterType.MAGE.hp, speed: MonsterType.MAGE.speed,
    reward: MonsterType.MAGE.reward, key: 'mage',
    ranged: { ...MonsterType.MAGE.ranged },
  });
  waves.active.push(mage);
  const hpBefore = tower.hp;
  waves.update(DT, econ, fx, pm);
  assert.ok(mage.dist > 0, `法师攻击中应仍移动（dist=${mage.dist}）`);
  assert.ok(mage.dist < mage.speed * DT, '攻击中移动应慢于全速一帧');
  assert.equal(pm.projectiles.length, 1, '法师应开火生成弹道');
  // 推进弹道命中塔
  pm.update(10, [], fx);
  assert.ok(tower.hp < hpBefore, '弹道命中后塔血应下降');
});

// ---------- 波次缩放 ----------
test('远程伤害随波次递增（BOSS）', () => {
  const map = new GameMap();
  const waves = new WaveManager(map, waveConfig);
  const boss5 = waves._buildWave(5).find((c) => c.key === 'boss');
  const boss10 = waves._buildWave(10).find((c) => c.key === 'boss');
  assert.ok(boss5 && boss10, '第5/10波应含 BOSS');
  assert.ok(boss10.ranged.damage > boss5.ranged.damage, '高波 BOSS 远程伤害应更高');
  assert.ok(boss5.ranged.damage >= MonsterType.BOSS.ranged.damage, '第5波 BOSS 伤害不低于基础值');
});

// ---------- 防御塔基础属性 ----------
test('防御塔血量：初始满血、hpRatio 正确、护甲无关的固定扣血', () => {
  const map = new GameMap();
  const tower = new Soldier(2, 0, WeaponType.SWORD);
  assert.equal(tower.hp, CONFIG.SOLDIER_MAX_HP, '塔初始满血');
  assert.equal(tower.hpRatio, 1, '满血 ratio 为 1');
  tower.takeDamage(30);
  assert.equal(tower.hp, CONFIG.SOLDIER_MAX_HP - 30, '塔扣血固定，无护甲减伤');
  tower.takeDamage(9999);
  assert.equal(tower.hp, 0, '过量伤害钳位到 0');
  assert.equal(tower.alive, false, '血量归 0 应被摧毁');
  assert.equal(tower.takeDamage(10), 0, '已摧毁的塔受击返回 0');
});

// ---------- 击杀回血（生命窃取） ----------
test('heal：回血钳位到 maxHp，不复活已死亡怪兽', () => {
  const map = new GameMap();
  const m = new Monster(map, { hp: 100, speed: 10, reward: 5 });
  assert.equal(m.healOnKill, 0, '近战怪无回血配置');
  m.takeDamage(40);
  m.heal(30);
  assert.equal(m.hp, 90, '应回血 30');
  m.heal(9999);
  assert.equal(m.hp, m.maxHp, '回血应钳位到 maxHp');
  m.takeDamage(9999);
  assert.equal(m.alive, false, '应已死亡');
  assert.equal(m.heal(50), 0, '已死亡怪兽不可回血');
});

test('法师/BOSS 类型带 healOnKill 配置', () => {
  const mage = Object.values(MonsterType).find((t) => t.key === 'mage');
  const boss = Object.values(MonsterType).find((t) => t.key === 'boss');
  assert.ok(mage.ranged.healOnKill > 0, '法师应有回血配置');
  assert.ok(boss.ranged.healOnKill > 0, 'BOSS 应有回血配置');
  assert.ok(boss.ranged.healOnKill < mage.ranged.healOnKill, 'BOSS 回血比例应低于法师（血多）');
});

test('wave 清理塔时：击杀者（弹道 source）按 healOnKill 回血并产生飘字', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const soldiers = new SoldierManager();
  const waves = new WaveManager(map, waveConfig, { soldiers });
  const col = 2, row = 0;
  map.occupy(col, row);
  const tower = new Soldier(col, row, WeaponType.SWORD);
  soldiers.add(tower);
  // 构造一只法师作为击杀者：已被打到残血，射程/回血配置齐全
  const mage = new Monster(map, {
    hp: 100, speed: MonsterType.MAGE.speed,
    reward: MonsterType.MAGE.reward, key: 'mage',
    ranged: { ...MonsterType.MAGE.ranged },
  });
  mage.hp = 20; // 残血便于断言回血量
  mage.x = tower.x; mage.y = tower.y; // 回血飘字位置无需精确
  // 模拟法师弹道击杀塔：命中记录击杀者
  const pm = new ProjectileManager();
  pm.add(new Projectile({ x: tower.x - 1, y: tower.y, target: tower, speed: 600, damage: 9999, source: mage }));
  pm.update(10, [], fx);
  assert.equal(tower.alive, false, '塔应被弹道摧毁');
  assert.equal(tower.killedBy, mage, '塔应记录击杀者');
  const hpBefore = mage.hp;
  waves.update(DT, econ, fx); // 清理阶段触发回血
  const expected = Math.round(100 * MonsterType.MAGE.ranged.healOnKill);
  assert.equal(mage.hp, hpBefore + expected, `击杀塔后法师应回血 ${expected}`);
  assert.ok(fx.effects.some((e) => e.kind === 'heal'), '应产生绿色回血飘字');
});

test('塔被非远程击杀（无 killedBy）时无回血', () => {
  const map = new GameMap();
  const econ = new Economy();
  const fx = new EffectManager();
  const soldiers = new SoldierManager();
  const waves = new WaveManager(map, waveConfig, { soldiers });
  const col = 2, row = 0;
  map.occupy(col, row);
  const tower = new Soldier(col, row, WeaponType.SWORD);
  soldiers.add(tower);
  tower.takeDamage(9999); // 直接扣血摧毁，无击杀者
  // 单独构造一个法师确认无 killedBy 时不会凭空回血
  const mage = new Monster(map, {
    hp: 100, speed: MonsterType.MAGE.speed,
    reward: MonsterType.MAGE.reward, key: 'mage',
    ranged: { ...MonsterType.MAGE.ranged },
  });
  mage.hp = 30;
  const hpBefore2 = mage.hp;
  waves.update(DT, econ, fx);
  assert.equal(soldiers.getAt(col, row), null, '塔应被清理');
  assert.equal(mage.hp, hpBefore2, '无关法师不应回血');
});
