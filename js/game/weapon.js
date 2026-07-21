import { CONFIG } from '../config.js';

/**
 * 武器类型定义。每种武器决定士兵的 range/damage/fireRate/弹道行为。
 * combat 与 UI 都以此为单一数据源，新增武器只需在此加一项。
 */
export const WeaponType = {
  SWORD: 'sword',   // 近战剑：短程、高伤、即时光圈斩击，无弹道
  ARROW: 'arrow',   // 弓箭：远程、中伤、快攻速、快速追踪弹道
  CANNON: 'cannon', // 炮击：远程、高伤、慢攻速、范围溅射弹道
  MAGIC: 'magic',   // 魔法：远程、稳定输出、快速追踪弹（需在升级面板解锁）
};

export const WEAPONS = {
  [WeaponType.SWORD]: {
    type: WeaponType.SWORD,
    name: '近战剑',
    range: CONFIG.CELL_SIZE * 1.4,  // 攻击范围（像素）
    damage: 12,
    fireRate: 1.6,                  // 每秒攻击次数
    projectileSpeed: 0,             // 0 = 即时命中，无弹道
    aoe: 0,                         // 溅射半径（像素），0 = 单体
    color: '#e8d24a',
    cost: CONFIG.SOLDIER_COST,
    desc: '短程高伤，即时斩击',
  },
  [WeaponType.ARROW]: {
    type: WeaponType.ARROW,
    name: '弓箭',
    range: CONFIG.CELL_SIZE * 3.5,
    damage: 7,
    fireRate: 2.2,
    projectileSpeed: 420,           // 像素/秒
    aoe: 0,
    color: '#4aa3e8',
    cost: CONFIG.SOLDIER_COST + 10,
    desc: '远程快射，单体追踪箭',
  },
  [WeaponType.CANNON]: {
    type: WeaponType.CANNON,
    name: '炮击',
    range: CONFIG.CELL_SIZE * 4.5,
    damage: 22,
    fireRate: 0.6,
    projectileSpeed: 220,
    aoe: CONFIG.CELL_SIZE * 1.2,    // 范围溅射
    color: '#e07b3a',
    cost: CONFIG.SOLDIER_COST + 30,
    desc: '远程重炮，范围溅射',
  },
  [WeaponType.MAGIC]: {
    type: WeaponType.MAGIC,
    name: '魔法',
    range: CONFIG.CELL_SIZE * 3.2,
    damage: 10,
    fireRate: 2.0,
    projectileSpeed: 520,
    aoe: 0,
    color: '#b06ae0',
    cost: CONFIG.SOLDIER_COST + 25,
    desc: '远程快弹，稳定输出（需解锁）',
  },
};

export function getWeapon(type) {
  return WEAPONS[type] || WEAPONS[WeaponType.SWORD];
}
