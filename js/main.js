import { CONFIG, CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js';
import { GameLoop } from './engine/loop.js';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { assets } from './engine/assets.js';
import { GameMap } from './game/map.js';
import { Economy } from './game/economy.js';
import { Soldier, SoldierManager } from './game/soldier.js';
import { WaveManager } from './game/wave.js';
import { ProjectileManager } from './game/projectile.js';
import { EffectManager } from './game/effects.js';
import { WEAPONS, WeaponType } from './game/weapon.js';
import { UpgradeManager, UPGRADE_KEYS, UPGRADE_DEFS } from './game/upgrade.js';

// ---------- 初始化画布 ----------
const canvas = document.getElementById('game-canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d');

// ---------- 模块装配 ----------
const grid = { cellSize: CONFIG.CELL_SIZE, cols: CONFIG.COLS, rows: CONFIG.ROWS };
const renderer = new Renderer(ctx, grid);
const map = new GameMap();
const economy = new Economy();
const soldiers = new SoldierManager();
const waves = new WaveManager(map);
const projectiles = new ProjectileManager();
const effects = new EffectManager();
const upgrades = new UpgradeManager();
const input = new Input(canvas, grid);

// ---------- 音效系统 ----------
// 注册音效清单（全部本地文件，禁止 URL 远程引用）。首次用户手势后预解码并启用。
const SOUND_NAMES = [
  'fire_sword', 'fire_arrow', 'fire_cannon', 'fire_magic',
  'hit_arrow', 'hit_cannon', 'hit_magic',
  'place', 'upgrade', 'sell', 'wave_start', 'kill', 'leak', 'coin',
  'victory', 'gameover', 'button',
];
const audioManifest = {};
for (const n of SOUND_NAMES) audioManifest[n] = `assets/audio/${n}.wav`;
audio.setManifest(audioManifest);
// 浏览器要求用户手势才能发声：首次 pointerdown/keydown 时解锁 AudioContext 并预加载
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
// 静音偏好持久化
const MUTE_KEY = 'tafang_muted';
try {
  if (localStorage.getItem(MUTE_KEY) === '1') audio.setMuted(true);
} catch (_) { /* localStorage 不可用时忽略 */ }

// ---------- 图片资源 ----------
// 全部本地 SVG（禁止 URL 远程引用）。加载完成前 renderer 回退到程序化绘制。
assets.setManifest({
  turret_sword: 'assets/img/turret_sword.svg',
  turret_arrow: 'assets/img/turret_arrow.svg',
  turret_cannon: 'assets/img/turret_cannon.svg',
  turret_magic: 'assets/img/turret_magic.svg',
  monster_normal: 'assets/img/monster_normal.svg',
  monster_fast: 'assets/img/monster_fast.svg',
  monster_tank: 'assets/img/monster_tank.svg',
  base: 'assets/img/base.svg',
});
assets.load();

// ---------- 当前选择的武器 ----------
let currentWeapon = WeaponType.SWORD;
// ---------- 游戏结束状态 ----------
let gameOver = false;
let victory = false;

// ---------- HUD ----------
const hudGold = document.getElementById('hud-gold');
const hudLives = document.getElementById('hud-lives');
const hudWave = document.getElementById('hud-wave');
const btnNextWave = document.getElementById('btn-next-wave');
const btnMute = document.getElementById('btn-mute');

function refreshMuteBtn() {
  if (!btnMute) return;
  btnMute.textContent = audio.muted ? '已静音' : '静音';
  btnMute.setAttribute('aria-pressed', String(audio.muted));
  btnMute.classList.toggle('muted', audio.muted);
}
refreshMuteBtn();

function refreshWeaponHud() {
  const w = WEAPONS[currentWeapon];
  document.getElementById('weapon-desc').textContent = `${w.name}：${w.desc}`;
  for (const btn of document.querySelectorAll('.wpn-btn')) {
    const t = btn.dataset.weapon;
    const locked = t === WeaponType.MAGIC && !upgrades.magicUnlocked;
    btn.classList.toggle('active', t === currentWeapon);
    btn.classList.toggle('locked', locked);
    btn.disabled = locked && t !== currentWeapon;
  }
}

function refreshHud({ gold, baseLives }) {
  hudGold.textContent = `金币: ${gold}`;
  hudLives.textContent = `基地生命: ${baseLives}`;
}

/** 刷新升级面板：价格/等级/可用性 + 魔法解锁按钮 */
function refreshUpgradePanel() {
  const { gold } = economy.getState();
  for (const btn of document.querySelectorAll('.up-btn')) {
    const key = btn.dataset.up;
    const lv = upgrades.getLevel(key);
    const d = UPGRADE_DEFS[key];
    if (lv >= d.maxLevel) {
      btn.textContent = `${d.label} Lv${lv} · 已满级`;
      btn.disabled = true;
    } else {
      const cost = upgrades.getCost(key);
      btn.textContent = `${d.label} Lv${lv} → ${lv + 1} · ${cost}金`;
      btn.disabled = gold < cost;
    }
  }
  const unlockBtn = document.getElementById('btn-unlock-magic');
  if (upgrades.magicUnlocked) {
    unlockBtn.classList.add('hidden');
  } else {
    unlockBtn.classList.remove('hidden');
    unlockBtn.disabled = gold < upgrades.getMagicUnlockCost();
  }
}

economy.onChange((state) => {
  refreshHud(state);
  refreshUpgradePanel();
});
upgrades.onChange(() => {
  refreshUpgradePanel();
  refreshWeaponHud();
});
refreshHud(economy.getState());
refreshUpgradePanel();
refreshWeaponHud();

// ---------- 武器选择 ----------
function isWeaponUnlocked(type) {
  if (type === WeaponType.MAGIC) return upgrades.magicUnlocked;
  return true;
}
function selectWeapon(type) {
  if (!isWeaponUnlocked(type)) return;
  if (type !== currentWeapon) audio.play('button');
  currentWeapon = type;
  refreshWeaponHud();
}
for (const btn of document.querySelectorAll('.wpn-btn')) {
  btn.addEventListener('click', () => selectWeapon(btn.dataset.weapon));
}
const weaponKeys = { 1: WeaponType.SWORD, 2: WeaponType.ARROW, 3: WeaponType.CANNON, 4: WeaponType.MAGIC };
window.addEventListener('keydown', (e) => {
  if (weaponKeys[e.key]) selectWeapon(weaponKeys[e.key]);
});

// ---------- 升级购买 ----------
for (const btn of document.querySelectorAll('.up-btn')) {
  btn.addEventListener('click', () => {
    if (gameOver) return;
    const key = btn.dataset.up;
    if (upgrades.buy(key, economy)) {
      audio.play('upgrade');
      // 立即作用于所有已放置士兵
      const mul = upgrades.multipliers;
      for (const s of soldiers.getAll()) s.recompute(mul);
    }
  });
}
document.getElementById('btn-unlock-magic').addEventListener('click', () => {
  if (gameOver) return;
  if (upgrades.unlockMagic(economy)) {
    audio.play('upgrade');
    selectWeapon(WeaponType.MAGIC);
  }
});

// ---------- 静音开关 ----------
btnMute.addEventListener('click', () => {
  const muted = audio.toggleMute();
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) {}
  refreshMuteBtn();
  // 取消静音时给一声确认反馈；静音时不发声
  if (!muted) audio.play('button');
});

// ---------- 波次控制：开始下一波按钮 ----------
btnNextWave.addEventListener('click', () => {
  if (!gameOver) waves.startNextWave();
});

// ---------- 交互：点击放置士兵（按当前武器） ----------
input.onCellClick(({ col, row }) => {
  if (gameOver) { restart(); return; }   // 游戏结束后点击画面重开
  if (!isWeaponUnlocked(currentWeapon)) return;
  if (!map.canPlace(col, row)) return;
  if (soldiers.getAt(col, row)) return;
  const w = WEAPONS[currentWeapon];
  if (!economy.canAfford(w.cost)) return;

  if (economy.spend(w.cost)) {
    map.occupy(col, row);
    const s = new Soldier(col, row, currentWeapon);
    s.recompute(upgrades.multipliers); // 应用全局强化
    soldiers.add(s);
    audio.play('place');
  }
});

// ---------- 交互：右键出售士兵（返还 50% 武器成本） ----------
input.onCellRightClick(({ col, row }) => {
  if (gameOver) return;
  const s = soldiers.getAt(col, row);
  if (!s) return;
  soldiers.removeAt(col, row);
  map.release(col, row);
  const refund = Math.floor((s.cost || 0) * 0.5);
  if (refund > 0) economy.refund(refund);
  audio.play('sell');
});

// ---------- 重开 ----------
function restart() {
  location.reload();
}
document.getElementById('btn-restart').addEventListener('click', restart);

// ---------- 胜负覆盖层 ----------
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
function showOverlay(title, sub, isWin) {
  overlayTitle.textContent = title;
  overlayTitle.className = isWin ? 'win' : 'lose';
  overlaySub.textContent = sub;
  overlay.classList.remove('hidden');
}

// ---------- 主循环 ----------
function update(dt) {
  if (gameOver) return;
  const monsters = waves.getActive();
  const combatCtx = { monsters, projectiles, effects };
  soldiers.update(dt, combatCtx);
  projectiles.update(dt, monsters, effects);
  effects.update(dt);

  // 波次：生成/移动/结算（漏怪扣血、击杀掉金币 + 死亡特效在 wave 内统一处理）
  waves.update(dt, economy, effects);

  if (economy.isGameOver()) {
    gameOver = true;
    victory = false;
    audio.play('gameover');
  } else if (waves.isVictory) {
    gameOver = true;
    victory = true;
    audio.play('victory');
  }
}

function render() {
  renderer.clear();
  renderer.drawGrid();
  renderer.drawPath(map.waypoints);
  renderer.drawBase(map.baseCell.col, map.baseCell.row, { image: assets.get('base') });

  // 波次 HUD + 按钮状态
  let waveText = `波次: ${waves.waveIndex}/${waves.maxWaves}`;
  if (!gameOver && waves.waveIndex > 0 && !waves.isWaveInProgress() && waves.waveIndex < waves.maxWaves) {
    waveText += ` · 下一波 ${Math.ceil(waves.nextWaveIn)}s`;
  }
  hudWave.textContent = waveText;
  btnNextWave.disabled = gameOver || waves.isWaveInProgress() || waves.waveIndex >= waves.maxWaves;

  // 士兵（武器图片 + 范围 + 炮塔朝向；图片未就绪时回退程序化绘制）
  for (const s of soldiers.getAll()) {
    renderer.drawSoldier(s.col, s.row, {
      color: s.weapon.color,
      range: s.range,
      angle: s.angle,
      image: assets.get(`turret_${s.weapon.type}`),
    });
  }

  // 怪兽（按类型图片 + 血条；图片未就绪时回退纯色圆）
  for (const m of waves.getActive()) {
    renderer.drawMonster(m.x, m.y, CONFIG.CELL_SIZE * m.radius, {
      image: assets.get(`monster_${m.key}`),
      color: m.color,
    });
    renderer.drawHealthBar(m.x, m.y - CONFIG.CELL_SIZE * 0.42, CONFIG.CELL_SIZE * 0.6, m.hpRatio);
  }

  // 弹道 + 短轨迹线
  for (const p of projectiles.getAll()) {
    renderer.drawLine(p.x, p.y, p.x - (p._tx - p.x) * 0.1, p.y - (p._ty - p.y) * 0.1, p.color, 2);
    renderer.drawCircle(p.x, p.y, p.radius, p.color);
  }

  // 战斗特效（飘字/斩击/爆裂）
  effects.draw(renderer);

  // 悬停高亮 + 预览攻击范围
  if (input.hoverCell && !gameOver) {
    const { col, row } = input.hoverCell;
    const valid = map.canPlace(col, row) && !soldiers.getAt(col, row);
    renderer.drawHover(col, row, valid);
    if (valid && isWeaponUnlocked(currentWeapon)) {
      const w = WEAPONS[currentWeapon];
      const mul = upgrades.multipliers;
      renderer.drawSoldier(col, row, { color: w.color, range: w.range * mul.rangeMul, showRange: true });
    }
  }

  // 游戏结束覆盖层（胜利/失败）
  if (gameOver) {
    if (victory) {
      showOverlay('胜利！', `坚守阵地，成功抵御全部 ${waves.maxWaves} 波怪兽。`, true);
    } else {
      showOverlay('游戏结束', `坚持到第 ${waves.waveIndex} 波 · 点击画面或按钮重新开始`, false);
    }
  }
}

const loop = new GameLoop({ update, render });
loop.start();

// 暴露给调试/并行开发（可选）
window.__game = { map, economy, soldiers, waves, projectiles, effects, upgrades, renderer, WEAPONS };
