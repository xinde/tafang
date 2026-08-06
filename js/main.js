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
import { QuizBank, QuizGate } from './game/quiz.js';
import { WeatherManager, WeatherFX } from './game/weather.js';
import waveConfig from '../config/waves.json' with { type: 'json' };
import quizConfig from '../config/quiz.json' with { type: 'json' };
import weatherConfig from '../config/weather.json' with { type: 'json' };
import mapsConfig from '../config/maps.json' with { type: 'json' };

// ---------- 初始化画布 ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ---------- 模块装配 ----------
const grid = { cellSize: CONFIG.CELL_SIZE, cols: CONFIG.COLS, rows: CONFIG.ROWS };
const renderer = new Renderer(ctx, grid);

// ---------- 随机选图 ----------
const _mapPool = mapsConfig.maps || [];
const _mapConfig = _mapPool.length > 0
  ? _mapPool[Math.floor(Math.random() * _mapPool.length)]
  : undefined;
const map = new GameMap(_mapConfig);
const economy = new Economy();
const soldiers = new SoldierManager();
const waves = new WaveManager(map, waveConfig, { soldiers }); // combat 上下文：远程敌人可攻击防御塔
const projectiles = new ProjectileManager();
const effects = new EffectManager();
const upgrades = new UpgradeManager();
const input = new Input(canvas, grid);

// ---------- 天气系统 ----------
const weather = new WeatherManager(weatherConfig);
const weatherFX = new WeatherFX();
weather.setOnWeatherChange((w) => {
  // 天气切换时刷新 HUD + 重新计算士兵属性（乘数变化）
  refreshWeatherHud();
  applyWeatherToSoldiers();
});
const hudWeather = document.getElementById('hud-weather');

// ---------- 视口自适应：画布铺满 #game-wrap ----------
// 逻辑空间固定 960×576，按容器尺寸等比缩放并居中，DPR 适配高清屏；
// 游戏元素不变形（统一缩放），无滚动条，输入坐标同步换算。
const gameWrap = document.getElementById('game-wrap');
function resizeCanvas() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const w = Math.max(1, Math.floor(gameWrap.clientWidth * dpr));
  const h = Math.max(1, Math.floor(gameWrap.clientHeight * dpr));
  canvas.width = w;
  canvas.height = h;
  const scale = Math.min(w / CANVAS_WIDTH, h / CANVAS_HEIGHT);
  const originX = (w - CANVAS_WIDTH * scale) / 2;
  const originY = (h - CANVAS_HEIGHT * scale) / 2;
  renderer.setViewport(scale, originX, originY);
  input.setViewport(scale, originX, originY);
}
// ResizeObserver 优先（容器尺寸变化即触发，如面板显隐/响应式切换），回退 window resize
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(gameWrap);
} else {
  window.addEventListener('resize', resizeCanvas);
}
resizeCanvas();

// ---------- 音效系统 ----------
// 注册音效清单（全部本地文件，禁止 URL 远程引用）。首次用户手势后预解码并启用。
const SOUND_NAMES = [
  'fire_sword', 'fire_arrow', 'fire_cannon', 'fire_magic',
  'hit_arrow', 'hit_cannon', 'hit_magic',
  'place', 'upgrade', 'sell', 'wave_start', 'kill', 'leak', 'coin',
  'victory', 'gameover', 'button', 'tower_down',
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
  turret_sniper: 'assets/img/turret_sniper.svg',
  turret_frost: 'assets/img/turret_frost.svg',
  turret_storm: 'assets/img/turret_storm.svg',
  monster_normal: 'assets/img/monster_normal.svg',
  monster_fast: 'assets/img/monster_fast.svg',
  monster_tank: 'assets/img/monster_tank.svg',
  monster_swarm: 'assets/img/monster_swarm.svg',
  monster_armored: 'assets/img/monster_armored.svg',
  monster_mage: 'assets/img/monster_mage.svg',
  monster_archer: 'assets/img/monster_archer.svg',
  monster_boss: 'assets/img/monster_boss.svg',
  base: 'assets/img/base.svg',
});
assets.load();

// ---------- 当前选择的武器 ----------
let currentWeapon = WeaponType.SWORD;
const weaponOrder = [
  WeaponType.SWORD,
  WeaponType.ARROW,
  WeaponType.CANNON,
  WeaponType.MAGIC,
  WeaponType.SNIPER,
  WeaponType.FROST,
  WeaponType.STORM,
];
// ---------- 游戏结束状态 ----------
let gameOver = false;
let victory = false;
let overlayShown = false;
let paused = false; // 答题门禁暂停：update 跳过逻辑，render 照常（画面定格）

// ---------- HUD / 武器面板 ----------
const hudGold = document.getElementById('hud-gold');
const hudLives = document.getElementById('hud-lives');
const hudWave = document.getElementById('hud-wave');
const hudMapName = document.getElementById('hud-map-name');
const btnNextWave = document.getElementById('btn-next-wave');
const btnMute = document.getElementById('btn-mute');
const btnSell = document.getElementById('btn-sell');
const btnPanel = document.getElementById('btn-panel');
const weaponGrid = document.getElementById('weapon-grid');
const weaponDesc = document.getElementById('weapon-desc');

// ---------- 移动端底部栏元素 ----------
const mobileWeaponBar = document.getElementById('mobile-weapon-bar');
const btnNextWaveM = document.getElementById('btn-next-wave-m');
const btnSellM = document.getElementById('btn-sell-m');
const btnPanelM = document.getElementById('btn-panel-m');
const btnMuteM = document.getElementById('btn-mute-m');

// ---------- 出售模式（移动端：tap 即出售，无需长按） ----------
let sellMode = false;
function toggleSellMode() {
  sellMode = !sellMode;
  // 桌面端按钮
  if (btnSell) {
    btnSell.classList.toggle('active', sellMode);
    btnSell.setAttribute('aria-pressed', String(sellMode));
    btnSell.textContent = sellMode ? '出售中' : '出售';
  }
  // 移动端按钮
  if (btnSellM) {
    btnSellM.classList.toggle('active', sellMode);
    btnSellM.textContent = sellMode ? '出售中' : '出售';
  }
  if (navigator.vibrate) navigator.vibrate(15);
}
// 桌面端出售按钮
if (btnSell) {
  btnSell.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSellMode();
  });
}
// 移动端出售按钮
if (btnSellM) {
  btnSellM.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSellMode();
  });
}

// ---------- 面板切换（移动端抽屉） ----------
const sidePanel = document.getElementById('side-panel');
function togglePanel() {
  if (!sidePanel) return;
  sidePanel.classList.toggle('panel-open');
}
if (btnPanel) {
  btnPanel.addEventListener('click', (e) => { e.preventDefault(); togglePanel(); });
}
if (btnPanelM) {
  btnPanelM.addEventListener('click', (e) => { e.preventDefault(); togglePanel(); });
}

// 移动端：开波/静音按钮镜像
if (btnNextWaveM) {
  btnNextWaveM.addEventListener('click', () => { if (!gameOver) waves.startNextWave(); });
}
if (btnMuteM) {
  btnMuteM.addEventListener('click', () => {
    const muted = audio.toggleMute();
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) {}
    refreshMuteBtn();
    if (btnMuteM) btnMuteM.textContent = muted ? '🔇' : '🔊';
  });
}

function refreshMuteBtn() {
  if (!btnMute) return;
  btnMute.textContent = audio.muted ? '已静音' : '静音';
  btnMute.setAttribute('aria-pressed', String(audio.muted));
  btnMute.classList.toggle('muted', audio.muted);
}
refreshMuteBtn();

function formatWeaponRange(range) {
  const cells = range / CONFIG.CELL_SIZE;
  return Number.isInteger(cells) ? String(cells) : cells.toFixed(1);
}

function weaponCardMeta(w) {
  return `${formatWeaponRange(w.range)}格 · ${w.damage}伤 · ${w.fireRate}/s`;
}

function weaponDetail(w) {
  const extras = [];
  if (w.aoe > 0) extras.push('范围溅射');
  if (w.pierce) extras.push(`穿甲 ${w.pierce}`);
  if (w.slow) extras.push(`减速 ${Math.round((1 - w.slow.factor) * 100)}%`);
  if (w.chain) extras.push(`连锁 ${w.chain.count} 跳`);
  const extraText = extras.length ? ` · ${extras.join(' · ')}` : '';
  return `${w.name} · ${w.tag} · ${w.cost} 金 · ${w.desc}${extraText}`;
}

function renderWeaponButtons() {
  if (!weaponGrid) return;
  weaponGrid.innerHTML = weaponOrder.map((type, index) => {
    const w = WEAPONS[type];
    return `
      <button class="wpn-btn" data-weapon="${type}" type="button">
        <span class="wpn-head">
          <span class="wpn-hotkey">${index + 1}</span>
          <span class="wpn-tag">${w.tag}</span>
          <span class="wpn-cost">${w.cost} 金</span>
        </span>
        <span class="wpn-name-row">
          <span class="wpn-name">${w.name}</span>
          <span class="wpn-state"></span>
        </span>
        <span class="wpn-desc">${w.desc}</span>
        <span class="wpn-meta">${weaponCardMeta(w)}</span>
      </button>
    `;
  }).join('');
  for (const btn of weaponGrid.querySelectorAll('.wpn-btn')) {
    btn.addEventListener('click', () => selectWeapon(btn.dataset.weapon));
  }
}
renderWeaponButtons();

// ---------- 移动端武器快选条 ----------
function renderMobileWeaponBar() {
  if (!mobileWeaponBar) return;
  mobileWeaponBar.innerHTML = weaponOrder.map((type) => {
    const w = WEAPONS[type];
    return `<button class="mwp-btn" data-weapon="${type}" type="button">
      <span class="mwp-tag">${w.tag}</span>
      <span class="mwp-cost">${w.cost}金</span>
    </button>`;
  }).join('');
  for (const btn of mobileWeaponBar.querySelectorAll('.mwp-btn')) {
    btn.addEventListener('click', () => selectWeapon(btn.dataset.weapon));
  }
}
renderMobileWeaponBar();

function refreshWeaponHud() {
  const gold = economy.getState().gold;
  const w = WEAPONS[currentWeapon];
  weaponDesc.textContent = weaponDetail(w);
  for (const [index, btn] of Array.from(document.querySelectorAll('.wpn-btn')).entries()) {
    const t = btn.dataset.weapon;
    const def = WEAPONS[t];
    const locked = t === WeaponType.MAGIC && !upgrades.magicUnlocked;
    const affordable = gold >= def.cost;
    btn.classList.toggle('active', t === currentWeapon);
    btn.classList.toggle('locked', locked);
    btn.classList.toggle('is-affordable', affordable && !locked);
    btn.classList.toggle('is-unaffordable', !affordable && !locked);
    btn.disabled = locked;
    btn.querySelector('.wpn-cost').textContent = `${def.cost} 金`;
    btn.querySelector('.wpn-state').textContent = locked ? '未解锁' : (affordable ? '可部署' : '攒金中');
    btn.querySelector('.wpn-meta').textContent = weaponCardMeta(def);
    btn.setAttribute(
      'aria-label',
      locked
        ? `${index + 1} ${def.name}，${def.desc}，当前未解锁`
        : `${index + 1} ${weaponDetail(def)}`
    );
  }
  // 移动端武器快选条同步状态
  if (mobileWeaponBar) {
    for (const btn of mobileWeaponBar.querySelectorAll('.mwp-btn')) {
      const t = btn.dataset.weapon;
      const locked = t === WeaponType.MAGIC && !upgrades.magicUnlocked;
      btn.classList.toggle('active', t === currentWeapon);
      btn.classList.toggle('locked', locked);
      btn.disabled = locked;
    }
  }
}

function refreshHud({ gold, baseLives }) {
  hudGold.querySelector('.hud-val').textContent = gold;
  hudLives.querySelector('.hud-val').textContent = baseLives;
  // 移动端开波按钮状态同步
  if (btnNextWaveM) {
    btnNextWaveM.disabled = gameOver || waves.isWaveInProgress() || waves.waveIndex >= waves.maxWaves;
    btnNextWaveM.textContent = waves.waveIndex === 0 ? '开始' : (waves.isWaveInProgress() ? '进行中' : '下一波');
  }
}

/** 刷新升级面板：价格/等级/可用性 + 魔法解锁按钮 */
function refreshUpgradePanel() {
  const { gold } = economy.getState();
  for (const btn of document.querySelectorAll('.up-btn')) {
    const key = btn.dataset.up;
    const lv = upgrades.getLevel(key);
    const d = UPGRADE_DEFS[key];
    const maxed = lv >= d.maxLevel;
    const cost = maxed ? Infinity : upgrades.getCost(key);
    const currentPct = Math.round(lv * d.perLevel * 100);
    const nextPct = Math.round(Math.min(d.maxLevel, lv + 1) * d.perLevel * 100);
    const track = Array.from({ length: d.maxLevel }, (_, i) => {
      const state = i < lv ? ' is-on' : (!maxed && i === lv ? ' is-next' : '');
      return `<span class="up-dot${state}"></span>`;
    }).join('');

    btn.classList.toggle('is-maxed', maxed);
    btn.classList.toggle('is-affordable', !maxed && gold >= cost);
    btn.disabled = maxed || gold < cost;
    btn.setAttribute(
      'aria-label',
      maxed
        ? `${d.label}已满级，当前加成+${currentPct}%`
        : `${d.label}当前${lv}级，下一级${lv + 1}级，花费${cost}金，当前加成+${currentPct}%，下级+${nextPct}%`
    );
    btn.innerHTML = maxed
      ? `
        <span class="up-top">
          <span class="up-name">${d.label}</span>
          <span class="up-pill">MAX</span>
        </span>
        <span class="up-level-row">
          <span class="up-level">Lv${lv} 已满级</span>
          <span class="up-delta">总加成 +${currentPct}%</span>
        </span>
        <span class="up-track" aria-hidden="true">${track}</span>
      `
      : `
        <span class="up-top">
          <span class="up-name">${d.label}</span>
          <span class="up-pill">${cost} 金</span>
        </span>
        <span class="up-level-row">
          <span class="up-level">Lv${lv} → Lv${lv + 1}</span>
          <span class="up-delta">当前 +${currentPct}% · 下级 +${nextPct}%</span>
        </span>
        <span class="up-track" aria-hidden="true">${track}</span>
      `;
  }
  const unlockBtn = document.getElementById('btn-unlock-magic');
  if (upgrades.magicUnlocked) {
    unlockBtn.classList.add('hidden');
    unlockBtn.classList.remove('is-affordable');
  } else {
    const unlockCost = upgrades.getMagicUnlockCost();
    unlockBtn.classList.remove('hidden');
    unlockBtn.classList.toggle('is-affordable', gold >= unlockCost);
    unlockBtn.disabled = gold < unlockCost;
    unlockBtn.setAttribute('aria-label', `解锁魔法塔，花费${unlockCost}金`);
    unlockBtn.innerHTML = `
      <span class="unlock-title">解锁魔法塔</span>
      <span class="unlock-meta">额外武器位 · ${unlockCost} 金</span>
    `;
  }
}

economy.onChange((state) => {
  refreshHud(state);
  refreshUpgradePanel();
  refreshWeaponHud();
});
upgrades.onChange(() => {
  refreshUpgradePanel();
  refreshWeaponHud();
});
refreshHud(economy.getState());
refreshUpgradePanel();
refreshWeaponHud();
// 显示当前地图名称
if (hudMapName) hudMapName.textContent = map.mapName || '随机地图';

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
const weaponKeys = {
  1: WeaponType.SWORD,
  2: WeaponType.ARROW,
  3: WeaponType.CANNON,
  4: WeaponType.MAGIC,
  5: WeaponType.SNIPER,
  6: WeaponType.FROST,
  7: WeaponType.STORM,
};
window.addEventListener('keydown', (e) => {
  // 答题门禁打开时：数字 1-4 提交选项，禁用武器切换
  if (paused) {
    if (quizGate.isActive) {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < OPTION_LABELS.length) quizGate.submit(i);
    }
    return;
  }
  if (weaponKeys[e.key]) selectWeapon(weaponKeys[e.key]);
});

// ---------- 升级购买（答题门禁） ----------
// 点击全局强化按钮不直接购买，而是弹限时答题：答对才升级并扣金币，答错/超时不升级不扣钱。
// 门禁纯逻辑在 QuizGate（js/game/quiz.js），此处仅做 DOM 接线与副作用（暂停/音效/recompute）。
const quizBank = new QuizBank(quizConfig);
const quizOverlay = document.getElementById('quiz-overlay');
const quizTimerEl = document.getElementById('quiz-timer');
const quizQuestionEl = document.getElementById('quiz-question');
const quizOptionsEl = document.getElementById('quiz-options');
const quizFeedbackEl = document.getElementById('quiz-feedback');
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];

function closeQuiz() {
  quizOverlay.classList.add('hidden');
  paused = false;
  // 暂停期间固定 dt 累加器已累积帧时间，清空防止恢复后一次性回补导致怪兽瞬移
  loop.resetAccumulator();
}

const quizGate = new QuizGate({
  bank: quizBank,
  upgrades,
  economy,
  resolveDelay: 0.9,
  onOpen: () => {
    paused = true;
    quizOverlay.classList.remove('hidden');
    // 移动端：收起底部面板，避免遮挡答题弹窗
    if (sidePanel) sidePanel.classList.remove('panel-open');
  },
  onResolve: ({ correct, applied }) => {
    if (applied) {
      audio.play('upgrade');
      // 立即作用于所有已部署士兵（升级乘数 × 天气乘数）
      const mul = combinedMultipliers();
      for (const s of soldiers.getAll()) s.recompute(mul);
    } else if (correct) {
      audio.play('button'); // 答对但购买失败（金币被外部改变），保守提示
    } else {
      audio.play('button'); // 答错 / 超时
    }
    renderQuizFeedback(correct, applied);
  },
  onClose: closeQuiz,
});

function renderQuizQuestion(question, key) {
  const d = UPGRADE_DEFS[key];
  quizQuestionEl.textContent = question.q;
  // 重置底部状态与选项高亮：避免残留上一次答题的反馈/对错 class
  quizFeedbackEl.textContent = '';
  quizFeedbackEl.className = 'quiz-feedback';
  quizOptionsEl.innerHTML = '';
  question.options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-opt';
    btn.dataset.opt = String(i);
    btn.textContent = `${OPTION_LABELS[i]}. ${text}`;
    btn.addEventListener('click', () => quizGate.submit(i));
    quizOptionsEl.appendChild(btn);
  });
  // 展示升级目标（如：攻击力 Lv2 → Lv3 · 花费 90 金）
  const lv = upgrades.getLevel(key);
  const cost = upgrades.getCost(key);
  const target = document.getElementById('quiz-upgrade-label');
  if (target) target.textContent = `${d.label} Lv${lv} → Lv${lv + 1} · 答对扣除 ${cost} 金`;
}

function renderQuizFeedback(correct, applied) {
  const answerIndex = quizGate.lastResult ? quizGate.lastResult.answerIndex : null;
  const options = Array.from(quizOptionsEl.querySelectorAll('.quiz-opt'));
  options.forEach((btn, i) => {
    const isAnswer = i === quizGate.question.answer;
    btn.classList.toggle('is-correct', isAnswer);
    btn.classList.toggle('is-wrong', applied ? false : i === answerIndex && !isAnswer);
    btn.disabled = true;
  });
  if (applied) {
    quizFeedbackEl.textContent = '答对！升级成功 ✓';
    quizFeedbackEl.className = 'quiz-feedback is-correct';
  } else {
    quizFeedbackEl.textContent = correct ? '答对但金币不足，升级失败' : '答错或超时，未升级';
    quizFeedbackEl.className = 'quiz-feedback is-wrong';
  }
}

function updateQuizTimer(remaining) {
  const sec = Math.ceil(remaining);
  quizTimerEl.textContent = `${sec}s`;
  quizTimerEl.classList.toggle('is-low', sec <= 3);
}

// 替换原直接购买逻辑：点击升级按钮 → 开启答题门禁
for (const btn of document.querySelectorAll('.up-btn')) {
  btn.addEventListener('click', () => {
    if (gameOver || paused) return;
    const key = btn.dataset.up;
    if (quizGate.open(key)) {
      renderQuizQuestion(quizGate.question, key);
      updateQuizTimer(quizGate.remaining);
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

// ---------- 交互：点击放置士兵（按当前武器） / 出售模式 ----------
input.onCellClick(({ col, row }) => {
  if (gameOver) { restart(); return; }   // 游戏结束后点击画面重开
  // 出售模式：tap 即出售（移动端友好）
  if (sellMode) {
    const s = soldiers.getAt(col, row);
    if (s) {
      soldiers.removeAt(col, row);
      map.release(col, row);
      const refund = Math.floor((s.cost || 0) * 0.5);
      if (refund > 0) economy.refund(refund);
      audio.play('sell');
      if (navigator.vibrate) navigator.vibrate(20);
    }
    return;
  }
  if (!isWeaponUnlocked(currentWeapon)) return;
  if (!map.canPlace(col, row)) return;
  if (soldiers.getAt(col, row)) return;
  const w = WEAPONS[currentWeapon];
  if (!economy.canAfford(w.cost)) return;

  if (economy.spend(w.cost)) {
    map.occupy(col, row);
    const s = new Soldier(col, row, currentWeapon);
    s.recompute(combinedMultipliers()); // 应用全局强化 × 天气乘数
    soldiers.add(s);
    audio.play('place');
    if (navigator.vibrate) navigator.vibrate(10);
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
  if (navigator.vibrate) navigator.vibrate(20);
});

// ---------- 重开 ----------
function restart() {
  location.reload();
}
document.getElementById('btn-restart').addEventListener('click', restart);

// ---------- 天气 HUD 与乘数应用 ----------
/** 计算组合乘数 = 升级乘数 × 天气乘数 */
function combinedMultipliers() {
  const up = upgrades.multipliers;
  const wm = weather.modifiers;
  return {
    damageMul: up.damageMul * wm.damageMul,
    fireRateMul: up.fireRateMul * wm.fireRateMul,
    rangeMul: up.rangeMul * wm.rangeMul,
  };
}

/** 天气切换时重新计算所有士兵属性 */
function applyWeatherToSoldiers() {
  const mul = combinedMultipliers();
  for (const s of soldiers.getAll()) s.recompute(mul);
}

/** 刷新天气 HUD：显示天气名称/图标/倒计时 */
function refreshWeatherHud() {
  if (!hudWeather) return;
  const w = weather.currentWeather;
  if (w) {
    const sec = Math.ceil(weather.remaining);
    hudWeather.querySelector('.weather-icon').textContent = w.icon;
    hudWeather.querySelector('.weather-name').textContent = w.name;
    hudWeather.querySelector('.weather-timer').textContent = `${sec}s`;
    hudWeather.classList.remove('hidden');
    hudWeather.classList.remove('weather-wind', 'weather-rain', 'weather-snow');
    hudWeather.classList.add(`weather-${w.key}`);
  } else {
    hudWeather.classList.add('hidden');
    hudWeather.classList.remove('weather-wind', 'weather-rain', 'weather-snow');
  }
}

// ---------- 胜负覆盖层（分数卡片） ----------
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const scoreCard = document.getElementById('score-card');

/** 计算综合评分并渲染分数卡片 */
function showOverlay(title, sub, isWin) {
  const { gold, baseLives } = economy.getState();
  const waveReached = waves.waveIndex;
  const maxWaves = waves.maxWaves;
  const towerCount = soldiers.getAll().length;
  const upLevels = UPGRADE_KEYS.reduce((sum, k) => sum + upgrades.getLevel(k), 0);

  // 综合评分：波次进度(60%) + 剩余生命(20%) + 剩余金币(10%) + 升级投入(10%)
  const waveScore = (waveReached / maxWaves) * 600;
  const lifeScore = (baseLives / CONFIG.BASE_LIVES) * 200;
  const goldScore = Math.min(gold / 300, 1) * 100;
  const totalMaxLevels = UPGRADE_KEYS.reduce((sum, k) => sum + UPGRADE_DEFS[k].maxLevel, 0);
  const upScore = (upLevels / totalMaxLevels) * 100;
  const totalScore = Math.round(waveScore + lifeScore + goldScore + upScore);

  // 评级
  let grade, medal;
  if (isWin && totalScore >= 850) { grade = 'S+'; medal = '🏆'; }
  else if (isWin && totalScore >= 700) { grade = 'S'; medal = '🥇'; }
  else if (totalScore >= 550) { grade = 'A'; medal = '🥈'; }
  else if (totalScore >= 400) { grade = 'B'; medal = '🥉'; }
  else if (totalScore >= 250) { grade = 'C'; medal = '🎖️'; }
  else { grade = 'D'; medal = '📋'; }

  // 标题与副标题
  overlayTitle.textContent = title;
  overlayTitle.className = isWin ? 'win' : 'lose';
  overlaySub.textContent = sub;

  // 填充数据
  document.getElementById('score-medal').textContent = medal;
  document.getElementById('score-waves').textContent = `${waveReached}/${maxWaves}`;
  document.getElementById('score-gold').textContent = gold;
  document.getElementById('score-lives').textContent = `${baseLives}/${CONFIG.BASE_LIVES}`;
  document.getElementById('score-towers').textContent = towerCount;
  document.getElementById('score-grade').textContent = grade;
  document.getElementById('score-map').textContent = map.mapName || '随机地图';

  // 评级配色
  const gradeEl = document.getElementById('score-grade');
  gradeEl.className = `score-grade grade-${grade.replace('+', '').toLowerCase()}`;

  // 卡片主题色
  scoreCard.className = `score-card ${isWin ? 'theme-win' : 'theme-lose'}`;

  overlay.classList.remove('hidden');
}

// ---------- 复制战绩分享 ----------
document.getElementById('btn-share').addEventListener('click', async () => {
  const { gold, baseLives } = economy.getState();
  const waveReached = waves.waveIndex;
  const maxWaves = waves.maxWaves;
  const towerCount = soldiers.getAll().length;
  const grade = document.getElementById('score-grade').textContent;
  const result = victory ? '🏆 通关胜利' : '💀 防守失败';

  const text =
    `${result}\n` +
    `📊 塔防战绩单\n` +
    `━━━━━━━━━━━━━\n` +
    `⭐ 评级: ${grade}\n` +
    `🌊 波次: ${waveReached}/${maxWaves}\n` +
    `🏰 基地: ${baseLives}/${CONFIG.BASE_LIVES}\n` +
    `💰 金币: ${gold}\n` +
    `🏹 塔数: ${towerCount}\n` +
    `🗺️ 地图: ${map.mapName || '随机'}\n` +
    `━━━━━━━━━━━━━\n` +
    `来挑战我的战绩吧！`;

  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-share');
    const orig = btn.textContent;
    btn.textContent = '✅ 已复制';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  } catch (_) {
    // 降级：选中文本供用户手动复制
    const range = document.createRange();
    range.selectNode(scoreCard);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
});

// ---------- 主循环 ----------
function update(dt) {
  if (gameOver) return;
  if (paused) {
    // 答题门禁：只推进答题状态机（倒计时/反馈时长），游戏逻辑全部冻结
    quizGate.tick(dt);
    updateQuizTimer(quizGate.remaining);
    return;
  }
  // 天气系统：推进倒计时，切换时已由回调处理 HUD/士兵刷新
  const wasActive = weather.isActive;
  weather.tick(dt);
  // active 阶段每帧刷新倒计时显示
  if (weather.isActive) refreshWeatherHud();
  const monsters = waves.getActive();
  const combatCtx = { monsters, projectiles, effects };
  soldiers.update(dt, combatCtx);
  projectiles.update(dt, monsters, effects);
  effects.update(dt);

  // 波次：生成/移动/结算（漏怪扣血、击杀掉金币 + 死亡特效在 wave 内统一处理）
  // projectiles 供远程敌人（法师/BOSS）开火入队；天气影响怪物移动速度
  waves.update(dt, economy, effects, projectiles, weather.modifiers.monsterSpeedMul);

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
  hudWave.querySelector('.hud-val').textContent = `${waves.waveIndex}/${waves.maxWaves}`;
  const showCountdown = !gameOver && waves.waveIndex > 0 && !waves.isWaveInProgress() && waves.waveIndex < waves.maxWaves;
  hudWave.querySelector('.hud-sub').textContent = showCountdown ? `${Math.ceil(waves.nextWaveIn)}s` : '';
  btnNextWave.disabled = gameOver || waves.isWaveInProgress() || waves.waveIndex >= waves.maxWaves;

  // 士兵（武器图片 + 范围 + 炮塔朝向；图片未就绪时回退程序化绘制）
  for (const s of soldiers.getAll()) {
    renderer.drawSoldier(s.col, s.row, {
      color: s.weapon.color,
      range: s.range,
      angle: s.angle,
      image: assets.get(`turret_${s.weapon.type}`),
    });
    // 防御塔血条（仅受损时显示，避免视觉杂乱）
    if (s.hp < s.maxHp) {
      renderer.drawHealthBar(s.x, s.y - CONFIG.CELL_SIZE * 0.42, CONFIG.CELL_SIZE * 0.6, s.hpRatio, s.weapon.color);
    }
  }

  // 怪兽（按类型图片 + 血条；图片未就绪时回退纯色圆）
  for (const m of waves.getActive()) {
    renderer.drawMonster(m.x, m.y, CONFIG.CELL_SIZE * m.radius, {
      image: assets.get(`monster_${m.key}`),
      color: m.color,
      slowed: m.isSlowed,
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

  // 天气视觉特效（风线/雨滴/雪花，画在游戏内容之上、覆盖层之下）
  weatherFX.draw(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, CONFIG.FIXED_DT, weather.currentWeather);

  // 注入吸格目标：已放置士兵的格子（触摸时吸附，方便点中）
  input.setSnapTargets(soldiers.getAll().map((s) => ({ col: s.col, row: s.row })));

  // 悬停高亮 + 预览攻击范围（答题暂停时不显示，避免遮罩下残留预览）
  if (input.hoverCell && !gameOver && !paused) {
    const { col, row } = input.hoverCell;
    const valid = map.canPlace(col, row) && !soldiers.getAt(col, row);
    // 出售模式：高亮已有塔而非空地
    if (sellMode) {
      const soldier = soldiers.getAt(col, row);
      renderer.drawHover(col, row, !!soldier);
      if (soldier) {
        renderer.drawSoldier(col, row, { color: '#e05555', range: soldier.range, showRange: true });
      }
    } else {
      renderer.drawHover(col, row, valid);
      if (valid && isWeaponUnlocked(currentWeapon)) {
        const w = WEAPONS[currentWeapon];
        const mul = combinedMultipliers();
        renderer.drawSoldier(col, row, { color: w.color, range: w.range * mul.rangeMul, showRange: true });
      }
    }
  }

  // 游戏结束覆盖层（胜利/失败）——仅在状态翻转时调用一次，避免每帧 DOM 重建
  if (gameOver && !overlayShown) {
    overlayShown = true;
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
