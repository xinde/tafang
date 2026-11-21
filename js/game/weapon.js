import { CONFIG } from '../config.js';

/**
 * 武器类型定义。每种武器决定士兵的 range/damage/fireRate/弹道行为。
 * combat 与 UI 都以此为单一数据源，新增武器只需在此加一项。
 *
 * 可选差异化能力字段（缺省即无该特性，向后兼容）：
 * - pierce  护甲穿透：结算伤害时忽略的护甲点数（克制 ARMORED/BOSS）。
 * - slow    减速：{ factor, duration }，命中后按比例减速目标若干秒（控制/辅助）。
 * - chain   链式：{ count, range, falloff }，弹道命中后跳跃攻击附近额外目标（对群）。
 */
export const WeaponType = {
  SWORD: 'sword',   // 近战剑：短程、高伤、即时光圈斩击，无弹道
  ARROW: 'arrow',   // 弓箭：远程、中伤、快攻速、快速追踪弹道
  CANNON: 'cannon', // 炮击：远程、高伤、慢攻速、范围溅射弹道
  MAGIC: 'magic',   // 魔法：远程、稳定输出、快速追踪弹（需在升级面板解锁）
  SNIPER: 'sniper', // 狙击：超远程、单发高伤、护甲穿透，极慢攻速（克制硬甲/Boss）
  FROST: 'frost',   // 寒冰：中程低伤、命中减速，控制辅助
  STORM: 'storm',   // 雷霆：中程、链式闪电跳跃多目标，对群
};

export const WEAPONS = {
  [WeaponType.SWORD]: {
    type: WeaponType.SWORD,
    name: '近卫',
    tag: '近战',
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
    name: '弩手',
    tag: '速射',
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
    name: '重炮',
    tag: '溅射',
    range: CONFIG.CELL_SIZE * 4.5,
    damage: 22,
    fireRate: 0.6,
    projectileSpeed: 220,
    aoe: CONFIG.CELL_SIZE * 1.2,    // 范围溅射
    projRadius: 6,
    color: '#e07b3a',
    cost: CONFIG.SOLDIER_COST + 30,
    desc: '远程重炮，范围溅射',
  },
  [WeaponType.MAGIC]: {
    type: WeaponType.MAGIC,
    name: '秘术师',
    tag: '稳定',
    range: CONFIG.CELL_SIZE * 3.2,
    damage: 10,
    fireRate: 2.0,
    projectileSpeed: 520,
    aoe: 0,
    color: '#b06ae0',
    cost: CONFIG.SOLDIER_COST + 25,
    desc: '远程快弹，稳定输出（需解锁）',
  },
  [WeaponType.SNIPER]: {
    type: WeaponType.SNIPER,
    name: '穿甲弩',
    tag: '穿甲',
    range: CONFIG.CELL_SIZE * 5.5,  // 全场最远
    damage: 42,                     // 单发高伤
    fireRate: 0.5,                  // 极慢攻速（2 秒一发）
    projectileSpeed: 720,           // 高速子弹
    aoe: 0,
    pierce: 6,                      // 护甲穿透：全额打穿 ARMORED(4)/BOSS(6)
    projRadius: 3,
    color: '#e04848',
    cost: CONFIG.SOLDIER_COST + 50,
    desc: '超远程穿甲，克制硬甲与 Boss',
    fireSfx: 'fire_cannon',
    hitSfx: 'hit_cannon',
  },
  [WeaponType.FROST]: {
    type: WeaponType.FROST,
    name: '霜晶',
    tag: '控制',
    range: CONFIG.CELL_SIZE * 3.0,
    damage: 5,                      // 低伤，定位控制辅助
    fireRate: 1.8,
    projectileSpeed: 380,
    aoe: 0,
    slow: { factor: 0.5, duration: 1.5 }, // 命中减速 50%，持续 1.5s
    projRadius: 4,
    color: '#5fd0e8',
    cost: CONFIG.SOLDIER_COST + 20,
    desc: '减速控场，辅助全队输出',
    fireSfx: 'fire_magic',
    hitSfx: 'hit_magic',
  },
  [WeaponType.STORM]: {
    type: WeaponType.STORM,
    name: '雷塔',
    tag: '连锁',
    range: CONFIG.CELL_SIZE * 3.0,
    damage: 9,
    fireRate: 1.4,
    projectileSpeed: 620,
    aoe: 0,
    chain: { count: 3, range: CONFIG.CELL_SIZE * 2.2, falloff: 0.7 }, // 链式跳跃 3 个额外目标
    projRadius: 4,
    color: '#a8e04a',
    cost: CONFIG.SOLDIER_COST + 45,
    desc: '链式闪电，清理成群目标',
    fireSfx: 'fire_magic',
    hitSfx: 'hit_magic',
  },
};

export function getWeapon(type) {
  return WEAPONS[type] || WEAPONS[WeaponType.SWORD];
}
