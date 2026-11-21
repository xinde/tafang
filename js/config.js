// 全局配置常量，供各模块共享
export const CONFIG = {
  COLS: 20,           // 地图列数
  ROWS: 12,           // 地图行数
  CELL_SIZE: 48,      // 单元格像素
  FIXED_DT: 1 / 60,   // 固定时间步长（秒）
  START_GOLD: 100,    // 初始金币
  BASE_LIVES: 20,     // 基地生命
  SOLDIER_COST: 20,   // 放置一个士兵消耗的金币
  SOLDIER_MAX_HP: 100, // 防御塔生命（远程敌人攻击塔的伤害池）
  // 全局强化：每级加成比例与递增花费
  UPGRADE: {
    DAMAGE:   { label: '攻击力',   baseCost: 40, growth: 1.5, maxLevel: 6, perLevel: 0.12 },
    FIRERATE: { label: '攻击速度', baseCost: 50, growth: 1.5, maxLevel: 6, perLevel: 0.10 },
    RANGE:    { label: '攻击范围', baseCost: 45, growth: 1.5, maxLevel: 5, perLevel: 0.08 },
  },
  MAGIC_UNLOCK_COST: 120, // 解锁魔法塔
};

export const CANVAS_WIDTH = CONFIG.COLS * CONFIG.CELL_SIZE;
export const CANVAS_HEIGHT = CONFIG.ROWS * CONFIG.CELL_SIZE;
