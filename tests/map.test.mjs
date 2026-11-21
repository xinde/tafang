import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, CellType } from '../js/game/map.js';
import mapsConfig from '../config/maps.json' with { type: 'json' };

// 默认地图配置（与原硬编码路径一致，用于回归测试）
const defaultMap = {
  name: '蛇形通道',
  waypoints: [
    { col: -1, row: 2 },
    { col: 4, row: 2 },
    { col: 4, row: 8 },
    { col: 10, row: 8 },
    { col: 10, row: 3 },
    { col: 15, row: 3 },
    { col: 15, row: 9 },
    { col: 19, row: 9 },
  ],
  baseCell: { col: 19, row: 9 },
};

test('默认构造（无参数）：与原硬编码路径一致（向后兼容）', () => {
  const map = new GameMap();
  assert.equal(map.mapName, '蛇形通道');
  assert.equal(map.waypoints.length, 8);
  assert.deepEqual(map.baseCell, { col: 19, row: 9 });
  assert.equal(map.waypoints[0].col, -1, '出生点应在屏幕外');
  assert.equal(map.waypoints[0].row, 2);
  // 路径长度 > 0
  assert.ok(map.getPathLength() > 0);
});

test('注入地图配置：waypoints 和 baseCell 正确加载', () => {
  const map = new GameMap(defaultMap);
  assert.equal(map.mapName, '蛇形通道');
  assert.equal(map.waypoints.length, 8);
  assert.deepEqual(map.baseCell, { col: 19, row: 9 });
  // 路径像素坐标数量与 waypoints 一致
  assert.equal(map._pathPixels.length, 8);
});

test('注入地图配置：与默认构造结果一致（同一张地图）', () => {
  const mapDefault = new GameMap();
  const mapInjected = new GameMap(defaultMap);
  assert.equal(mapDefault.getPathLength(), mapInjected.getPathLength());
  assert.deepEqual(mapDefault.waypoints, mapInjected.waypoints);
  assert.deepEqual(mapDefault.baseCell, mapInjected.baseCell);
});

test('路径格子正确标记为 PATH，基地格标记为 BASE', () => {
  const map = new GameMap(defaultMap);
  // 路径上的格子应为 PATH
  assert.equal(map.getCell(4, 2), CellType.PATH);
  assert.equal(map.getCell(4, 8), CellType.PATH);
  assert.equal(map.getCell(10, 8), CellType.PATH);
  assert.equal(map.getCell(15, 3), CellType.PATH);
  // 基地格应为 BASE
  assert.equal(map.getCell(19, 9), CellType.BASE);
  // 非路径格应为 EMPTY
  assert.equal(map.getCell(0, 0), CellType.EMPTY);
  assert.equal(map.getCell(7, 5), CellType.EMPTY);
});

test('不同地图产生不同路径长度', () => {
  const maps = mapsConfig.maps;
  const lengths = maps.map((m) => new GameMap(m).getPathLength());
  // 每张地图路径长度 > 0
  for (const len of lengths) assert.ok(len > 0);
  // 至少有两张地图路径长度不同
  const unique = new Set(lengths);
  assert.ok(unique.size >= 2, `地图路径长度应不完全相同，实际唯一值 ${unique.size} 个`);
});

test('所有预配置地图可正常构造且路径完整', () => {
  for (const m of mapsConfig.maps) {
    const map = new GameMap(m);
    assert.ok(map.waypoints.length >= 2, `${m.name} waypoints 应 >= 2`);
    assert.ok(map.getPathLength() > 0, `${m.name} 路径长度应 > 0`);
    // 基地格应为 BASE
    assert.equal(map.getCell(m.baseCell.col, m.baseCell.row), CellType.BASE, `${m.name} 基地格标记`);
    // 出生点第一个 waypoint 在屏幕外（col < 0）
    assert.ok(map.waypoints[0].col < 0, `${m.name} 出生点应在屏幕外`);
  }
});

test('getPathPosition：起点返回出生点坐标', () => {
  const map = new GameMap(defaultMap);
  const p = map.getPathPosition(0);
  // 出生点 col=-1，像素 x = -1*48 + 24 = -24
  assert.equal(p.x, -24);
  assert.equal(p.y, 2 * 48 + 24);
  assert.equal(p.done, false);
});

test('getPathPosition：超过路径总长返回 done=true', () => {
  const map = new GameMap(defaultMap);
  const total = map.getPathLength();
  const p = map.getPathPosition(total + 1);
  assert.equal(p.done, true);
  // 终点坐标 = 基地格中心
  assert.equal(p.x, 19 * 48 + 24);
  assert.equal(p.y, 9 * 48 + 24);
});

test('走满路线长度的这一帧就到达城堡', () => {
  const map = new GameMap();
  assert.equal(map.getPathPosition(map.getPathLength()).done, true);
});

test('地图拒绝自交路线和压在通道上的塔位', () => {
  const waypoints = [[-1, 2], [6, 2], [6, 6], [3, 6], [3, 1]]
    .map(([col, row]) => ({col, row}));
  assert.throws(() => new GameMap({waypoints}), /道路重复/);
  assert.throws(() => new GameMap({waypoints: waypoints.slice(0, 2), sites: [[2, 2]]}), /塔位/);
});

test('无效的斜线、零长段、越界坐标和重叠石台在建图时报告', () => {
  const start = {col: -1, row: 2}, turn = {col: 5, row: 2};
  for (const next of [{col: 8, row: 7}, turn, {col: 100, row: 2}, {col: 4.5, row: 2}]) {
    assert.throws(() => new GameMap({waypoints: [start,turn,next]}), /道路/);
  }
  for (const sites of [[[1,3],[1,3]], [[-1,3]], [[5,2]]]) {
    assert.throws(() => new GameMap({waypoints:[start,turn], sites}), /塔位/);
  }
  assert.throws(() => new GameMap({waypoints:[start,turn], baseCell:{col:1,row:1}}), /城堡/);
});

test('canPlace / occupy / release：路径格不可放置，空地可放置', () => {
  const map = new GameMap(defaultMap);
  // 路径格不可放置
  assert.equal(map.canPlace(4, 2), false);
  assert.equal(map.canPlace(10, 8), false);
  // 基地格不可放置
  assert.equal(map.canPlace(19, 9), false);
  // 空地可放置
  assert.equal(map.canPlace(0, 0), true);
  assert.equal(map.canPlace(7, 5), true);
  // 占用后不可再放
  assert.equal(map.occupy(0, 0), true);
  assert.equal(map.canPlace(0, 0), false);
  // 释放后恢复
  map.release(0, 0);
  assert.equal(map.canPlace(0, 0), true);
});

test('地图配置缺 waypoints 时回退默认地图', () => {
  const map = new GameMap({ name: '空地图' });
  assert.equal(map.mapName, '蛇形通道', '无 waypoints 应回退默认');
  assert.equal(map.waypoints.length, 8);
});

test('地图配置 waypoints 不足 2 个时回退默认地图', () => {
  const map = new GameMap({ waypoints: [{ col: 0, row: 0 }] });
  assert.equal(map.mapName, '蛇形通道');
});

test('baseCell 缺省时取最后一个 waypoint', () => {
  const cfg = {
    name: '测试图',
    waypoints: [
      { col: -1, row: 0 },
      { col: 5, row: 0 },
      { col: 5, row: 5 },
      { col: 19, row: 5 },
    ],
  };
  const map = new GameMap(cfg);
  assert.deepEqual(map.baseCell, { col: 19, row: 5 });
  assert.equal(map.getCell(19, 5), CellType.BASE);
});

test('回旋弯路地图：路径标记正确，非路径区域可放置', () => {
  const spiralMap = mapsConfig.maps.find((m) => m.name === '回旋弯路');
  assert.ok(spiralMap);
  const map = new GameMap(spiralMap);
  // 路径上的拐点应为 PATH
  assert.equal(map.getCell(3, 5), CellType.PATH);
  assert.equal(map.getCell(3, 1), CellType.PATH);
  assert.equal(map.getCell(14, 1), CellType.PATH);
  assert.equal(map.getCell(6, 6), CellType.PATH);
  // 基地
  assert.equal(map.getCell(19, 4), CellType.BASE);
  // 非路径区可放置
  assert.equal(map.canPlace(10, 8), true);
});

test('随机选图：多次构造不同地图配置产生不同的路径形状', () => {
  const maps = mapsConfig.maps;
  const allLengths = maps.map((m) => new GameMap(m).getPathLength());
  const allBaseCells = maps.map((m) => new GameMap(m).baseCell);
  // 不同地图的基地位置或路径长度应有差异
  const baseCellSet = new Set(allBaseCells.map((c) => `${c.col},${c.row}`));
  assert.ok(baseCellSet.size >= 2, `不同地图基地位置应有差异，实际 ${baseCellSet.size} 种`);
});
