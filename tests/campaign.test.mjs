import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import maps from '../config/maps.json' with { type: 'json' };
import patterns from '../config/waves.json' with { type: 'json' };
import climate from '../config/weather.json' with { type: 'json' };
import { GameMap, CellType } from '../js/game/map.js';
import { campaignWaves, WaveManager } from '../js/game/wave.js';
import { Monster, MonsterType } from '../js/game/monster.js';
import { ProjectileManager } from '../js/game/projectile.js';
import { Economy } from '../js/game/economy.js';
import { CONFIG } from '../js/config.js';
import { StageRotation } from '../js/game/stage-rotation.js';
import { Renderer } from '../js/engine/renderer.js';

const dt = CONFIG.FIXED_DT;
const stage = maps.maps[0];

test('各场景有独立地貌、本地 WebP 横幅和有效天气', () => {
  const weatherKeys = new Set(climate.weathers.map(w => w.key));
  assert.equal(new Set(maps.maps.map(s => s.biome)).size, maps.maps.length);
  const pictures = new Set();
  for (const s of maps.maps) {
    const file = readFileSync(new URL('../' + s.landscape, import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF');
    assert.equal(file.toString('ascii', 8, 12), 'WEBP');
    pictures.add(file.toString('base64'));
    assert.ok(s.weather.length && s.weather.every(key => weatherKeys.has(key)), s.title);
    assert.ok(s.river.length >= 2 && s.river.every(Number.isFinite), s.title);
  }
  assert.equal(pictures.size, maps.maps.length);
});

test('边缘城堡的整幅精灵留在棋盘之内', () => {
  const boxes = [];
  const ctx = {drawImage: (_image, x, y, w, h) => boxes.push({x, y, w, h})};
  const renderer = new Renderer(ctx, {cellSize: CONFIG.CELL_SIZE, cols: CONFIG.COLS, rows: CONFIG.ROWS});
  for (const [col, row] of [[0,0],[CONFIG.COLS-1,0],[0,CONFIG.ROWS-1],[CONFIG.COLS-1,CONFIG.ROWS-1]]) {
    renderer.drawBase(col, row, {image:{}});
  }
  assert.equal(boxes.length, 4);
  assert.ok(boxes.every(b => b.x >= 0 && b.y >= 0 && b.x + b.w <= renderer.width && b.y + b.h <= renderer.height));
});

test('每关路线为相连的直角段，所有标记石台都能建造、出售和重建', () => {
  assert.equal(new Set(maps.maps.map(s => s.id)).size, maps.maps.length);
  for (const s of maps.maps) {
    assert.deepEqual(s.waypoints.at(-1), s.baseCell);
    for (let i = 1; i < s.waypoints.length; i++) {
      const a = s.waypoints[i - 1], b = s.waypoints[i];
      assert.notEqual(a.col === b.col, a.row === b.row, s.title);
    }
    const map = new GameMap(s);
    assert.equal(new Set(s.sites.map(pos => pos.join(','))).size, s.sites.length);
    assert.ok(map._grid.flat().includes(CellType.TERRAIN));
    assert.equal(map._grid.flat().filter(v => v === CellType.EMPTY).length, s.sites.length);
    for (const [col, row] of s.sites) {
      assert.ok(map.occupy(col, row), s.title + ' 塔位不可用 ' + [col, row]);
      assert.equal(map.occupy(col, row), false);
      map.release(col, row);
      assert.ok(map.canPlace(col, row));
    }
  }
});

test('各关实际敌群顺序与预告一致，最后一波包含首领', () => {
  const known = new Set(Object.values(MonsterType).map(m => m.key));
  assert.equal(new Set(maps.maps.map(s => s.waves.join('/'))).size, maps.maps.length);
  for (const s of maps.maps) {
    const level = campaignWaves(patterns, s);
    const waves = new WaveManager(new GameMap(s), level);
    assert.equal(waves.maxWaves, s.waves.length);
    assert.equal(waves.autoStartDelay, s.rest);
    assert.deepEqual(new Economy(s).getState(), { gold: s.startGold, baseLives: s.baseLives });
    level.orders.forEach((order, i) => {
      const keys = order.groups.flatMap(([key, n]) => {
        assert.ok(known.has(key) && Number.isInteger(n) && n > 0);
        return Array(n).fill(key);
      });
      assert.ok(order.interval > 0);
      assert.deepEqual(waves._buildWave(i + 1).map(enemy => enemy.key), keys);
    });
    assert.ok(waves._buildWave(waves.maxWaves).some(m => m.key === 'boss'));
    assert.ok(waves.startNextWave());
    assert.equal(waves.spawnInterval, level.orders[0].interval);
  }
});

test('每条路从入口走到城堡，不自交、不折回，也不与非相邻路段贴成岔口', () => {
  for (const stage of maps.maps) {
    const map = new GameMap(stage);
    const visited = new Set();
    const end = map.getPathLength();
    assert.equal(end % map.cellSize, 0);
    for (let distance = 0; distance <= end; distance += map.cellSize) {
      const {x, y, done} = map.getPathPosition(distance);
      const col = x / map.cellSize - .5, row = y / map.cellSize - .5;
      const key = col + ',' + row;
      assert.ok(Number.isInteger(col) && Number.isInteger(row) && !visited.has(key), stage.title + ' ' + key);
      visited.add(key);
      assert.equal(done, distance === end);
      if (distance) assert.equal(map.getCell(col, row), done ? CellType.BASE : CellType.PATH);
    }
    const entry = stage.waypoints[0];
    for (const key of visited) {
      const [col, row] = key.split(',').map(Number);
      const around = [[col-1,row],[col+1,row],[col,row-1],[col,row+1]];
      const terminal = (col === entry.col && row === entry.row) || (col === map.baseCell.col && row === map.baseCell.row);
      assert.equal(around.filter(cell => visited.has(cell.join(','))).length, terminal ? 1 : 2, stage.title + ' ' + key);
    }
  }
});

test('跨页面随机选关：整轮不重复，换轮不连抽同关，首关不是固定值', () => {
  let saved;
  const storage = {getItem: () => saved, setItem: (_, value) => { saved = value; }};
  let previous;
  for (let round = 0; round < 3; round++) {
    const played = new Set();
    for (const _ of maps.maps) {
      // 每次重新实例化，相当于离开上一个页面再进入。
      const stage = new StageRotation(maps.maps, storage, () => .999).select();
      assert.notEqual(stage.id, previous);
      assert.ok(!played.has(stage.id));
      played.add(stage.id);
      previous = stage.id;
    }
    assert.equal(played.size, maps.maps.length);
  }
  const starts = [0, .5, .999].map(r => new StageRotation(maps.maps, null, () => r).select().id);
  assert.equal(new Set(starts).size, starts.length);
});

test('指定关卡和重试均可复现；过期记录、无存储和单关也能抽签', () => {
  const stages = maps.maps.slice(0, 3);
  let saved = JSON.stringify(['removed', stages[0].id, stages[0].id]);
  const storage = {getItem: () => saved, setItem: (_, value) => { saved = value; }};
  const deck = new StageRotation(stages, storage, () => 0);
  assert.equal(deck.select(stages[1].id), stages[1]);
  assert.equal(deck.select(stages[1].id), stages[1]);
  assert.equal(deck.select('invalid'), stages[2]);
  saved = 'broken JSON';
  assert.equal(new StageRotation(stages, storage, () => 0).select(), stages[0]);
  const denied = {getItem() { throw Error(); }, setItem() { throw Error(); }};
  const single = new StageRotation([stages[0]], denied);
  assert.equal(single.select(), single.select());
});

function clearWave(waves, economy) {
  for (let i = 0; i < 3000 && waves.isWaveInProgress(); i++) {
    waves.update(dt, economy);
    for (const enemy of waves.getActive()) enemy.takeDamage(9999);
  }
  assert.equal(waves.isWaveInProgress(), false);
}

test('提前迎战奖励只发一次，首波、重复点击和自动开波都不会发奖', () => {
  const economy = new Economy(stage);
  const waves = new WaveManager(new GameMap(stage), campaignWaves(patterns, stage));
  assert.equal(waves.earlyBonus, 0);
  waves.startNextWave(economy);
  assert.equal(economy.gold, stage.startGold);
  clearWave(waves, economy);
  const before = economy.gold, bonus = waves.earlyBonus;
  assert.ok(bonus > 0 && bonus <= 8);
  assert.ok(waves.startNextWave(economy));
  assert.equal(waves.startNextWave(economy), false);
  assert.equal(economy.gold, before + bonus);
  clearWave(waves, economy);
  const beforeAuto = economy.gold;
  for (let i = 0; i < 1500 && waves.waveIndex === 2; i++) waves.update(dt, economy);
  assert.equal(waves.waveIndex, 3);
  assert.equal(economy.gold, beforeAuto);
});

test('远程命中实际城堡只消耗一点耐久', () => {
  const map = new GameMap(stage), economy = new Economy(stage);
  const waves = new WaveManager(map, campaignWaves(patterns, stage));
  const projectiles = new ProjectileManager();
  const mage = new Monster(map, MonsterType.MAGE);
  mage.dist = map.getPathLength() - 96;
  const pos = map.getPathPosition(mage.dist);
  mage.x = pos.x; mage.y = pos.y;
  waves.active.push(mage);
  waves.update(dt, economy, undefined, projectiles);
  assert.equal(projectiles.getAll().length, 1);
  projectiles.update(1, []);
  assert.equal(economy.baseLives, stage.baseLives - 1);
});
