import { CONFIG } from '../config.js';

/**
 * 单元格类型
 */
export const CellType = {
  EMPTY: 0,     // 可放置士兵
  PATH: 1,      // 怪兽行进路径，不可放置
  BASE: 2,      // 基地，不可放置
  OCCUPIED: 3,  // 已放置士兵
  TERRAIN: 4,   // 林木、河岸等不可建造的地形
};

/**
 * Map：网格地图 + 怪兽行进路径。
 * 负责路径点定义、单元格占用状态、可放置判定、路径长度换算。
 * monster/wave 模块通过 waypoints 与 getPathPosition 驱动移动。
 *
 * 支持外部注入地图配置（config/maps.json 中的一张地图），实现开局随机选图。
 * 不传参数时使用默认地图（蛇形通道），保持向后兼容。
 */
export class GameMap {
  /**
   * @param {object} [mapConfig] 地图配置（来自 config/maps.json 的一张地图）
   * @param {Array<{col:number,row:number}>} [mapConfig.waypoints] 路径拐点
   * @param {{col:number,row:number}} [mapConfig.baseCell] 基地所在格
   * @param {string} [mapConfig.name] 地图名称
   */
  constructor(mapConfig) {
    this.cols = CONFIG.COLS;
    this.rows = CONFIG.ROWS;
    this.cellSize = CONFIG.CELL_SIZE;

    if (mapConfig && Array.isArray(mapConfig.waypoints) && mapConfig.waypoints.length >= 2) {
      this.mapName = mapConfig.title || mapConfig.name || '自定义地图';
      this.waypoints = mapConfig.waypoints.map((wp) => ({ col: wp.col, row: wp.row }));
      this.baseCell = mapConfig.baseCell
        ? { col: mapConfig.baseCell.col, row: mapConfig.baseCell.row }
        : { ...this.waypoints[this.waypoints.length - 1] };
    } else {
      // 默认地图（蛇形通道）——保持向后兼容
      this.mapName = '蛇形通道';
      this.waypoints = [
        { col: -1, row: 2 },
        { col: 4, row: 2 },
        { col: 4, row: 8 },
        { col: 10, row: 8 },
        { col: 10, row: 3 },
        { col: 15, row: 3 },
        { col: 15, row: 9 },
        { col: 19, row: 9 },
      ];
      this.baseCell = { col: 19, row: 9 };
    }

    this.sites = mapConfig?.sites;
    this._grid = [];
    this._buildGrid();
    this._pathPixels = this._buildPathPixels();
    this._pathTotalLength = this._computePathLength();
  }

  _buildGrid() {
    for (let r = 0; r < this.rows; r++) {
      const rowArr = [];
      for (let c = 0; c < this.cols; c++) rowArr.push(this.sites ? CellType.TERRAIN : CellType.EMPTY);
      this._grid.push(rowArr);
    }
    for (const [col, row] of this.sites || []) this._grid[row][col] = CellType.EMPTY;
    // 把路径经过的单元格标记为 PATH
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i];
      const b = this.waypoints[i + 1];
      const dc = Math.sign(b.col - a.col);
      const dr = Math.sign(b.row - a.row);
      let c = a.col;
      let r = a.row;
      while (c !== b.col || r !== b.row) {
        this._markPath(c, r);
        c += dc;
        r += dr;
      }
      this._markPath(b.col, b.row);
    }
    // 基地标记
    this._grid[this.baseCell.row][this.baseCell.col] = CellType.BASE;
  }

  _markPath(col, row) {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this._grid[row][col] = CellType.PATH;
    }
  }

  /** 路径点的像素坐标版本 */
  _buildPathPixels() {
    return this.waypoints.map((wp) => ({
      x: wp.col * this.cellSize + this.cellSize / 2,
      y: wp.row * this.cellSize + this.cellSize / 2,
    }));
  }

  _computePathLength() {
    let len = 0;
    for (let i = 0; i < this._pathPixels.length - 1; i++) {
      const a = this._pathPixels[i];
      const b = this._pathPixels[i + 1];
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return len;
  }

  /** 单元格类型 */
  getCell(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return this._grid[row][col];
  }

  /** 该网格是否可放置士兵（空地且未被占用） */
  canPlace(col, row) {
    return this.getCell(col, row) === CellType.EMPTY;
  }

  /** 占用某网格（放置士兵后调用） */
  occupy(col, row) {
    if (this.getCell(col, row) === CellType.EMPTY) {
      this._grid[row][col] = CellType.OCCUPIED;
      return true;
    }
    return false;
  }

  /** 释放某网格（移除士兵/被摧毁时调用） */
  release(col, row) {
    if (this._grid[row] && this._grid[row][col] === CellType.OCCUPIED) {
      this._grid[row][col] = CellType.EMPTY;
    }
  }

  /** 路径总长度（像素），供 monster 按行进距离定位 */
  getPathLength() {
    return this._pathTotalLength;
  }

  /**
   * 按行进距离返回路径上的位置与朝向。
   * monster 移动核心：dist 为已走过的像素距离。
   * @returns {{x:number,y:number,dirX:number,dirY:number,done:boolean}}
   */
  getPathPosition(dist) {
    const pts = this._pathPixels;
    if (dist <= 0) {
      const a = pts[0];
      const b = pts[1];
      return this._segPos(a, b, 0, false);
    }
    let remaining = dist;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= segLen) {
        return this._segPos(a, b, remaining / segLen, false);
      }
      remaining -= segLen;
    }
    // 已到达/超过终点（基地）
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, dirX: 0, dirY: 0, done: true };
  }

  _segPos(a, b, t, done) {
    const dirX = b.x - a.x;
    const dirY = b.y - a.y;
    const len = Math.hypot(dirX, dirY) || 1;
    return {
      x: a.x + dirX * t,
      y: a.y + dirY * t,
      dirX: dirX / len,
      dirY: dirY / len,
      done,
    };
  }

  /** 出生点像素坐标 */
  getSpawn() {
    return { ...this._pathPixels[0] };
  }
}
