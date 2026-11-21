import { CONFIG, CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js';
import { GameLoop } from './engine/loop.js';
import { Renderer } from './engine/renderer.js?v=tactics';
import { paintTerrain } from './engine/terrain.js?v=12maps';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { BackgroundMusic } from './engine/music.js';
import { assets } from './engine/assets.js';
import { GameMap } from './game/map.js?v=tactics';
import { StageRotation } from './game/stage-rotation.js?v=tactics';
import { Economy } from './game/economy.js?v=music-repair';
import { Soldier, SoldierManager } from './game/soldier.js?v=pad-fix';
import { WaveManager, campaignWaves } from './game/wave.js?v=pad-fix';
import { ProjectileManager } from './game/projectile.js?v=pad-fix';
import { EffectManager } from './game/effects.js?v=music-repair';
import { WEAPONS, WeaponType } from './game/weapon.js';
import { UpgradeManager, UPGRADE_DEFS } from './game/upgrade.js';
import { initQuizPanel } from './quiz-panel.js';
import { BattleTactics } from './game/tactics.js';
import { initTacticChoice, initGuardOrders, tacticDialog } from './battle-panel.js';
import { drawBossWarnings } from './engine/boss-warning.js';
import { WeatherManager, WeatherFX } from './game/weather.js';
import { UltimateManager, UltimateType, ULTIMATE_DEFS } from './game/ultimate.js?v=music-repair';
import { initCampaign, campaignDialog, guideDialog } from './campaign.js?v=tactics';

const byId = id => document.getElementById(id);
async function loadConfig(name) {
  const url = new URL('../config/' + name + '.json', import.meta.url);
  if (name === 'maps' || name === 'waves' || name === 'quiz') url.search = new URL(import.meta.url).search;
  const response = await fetch(url);
  if (!response.ok) throw new Error(name + '.json HTTP ' + response.status);
  return response.json();
}
const [waveConfig, quizConfig, weatherConfig, mapsConfig] = await Promise.all(
  ['waves', 'quiz', 'weather', 'maps'].map(loadConfig)
).catch(error => {
  byId('stage-title').textContent = '关卡未能加载，请刷新重试';
  throw error;
});
const iconSheet = 'assets/img/icons.svg?v=music#';
const icon = key => '<svg class="icon" aria-hidden="true"><use href="' + iconSheet + key + '"/></svg>';
const selectedId = new URLSearchParams(location.search).get('stage');
const rotation = StageRotation.forBrowser(mapsConfig.maps);
const stage = rotation.select(selectedId);
const map = new GameMap(stage);
const terrain = paintTerrain(map, stage);
const economy = new Economy(stage);
const soldiers = new SoldierManager();
const level = campaignWaves(waveConfig, stage);
const tactics = new BattleTactics();
const waves = new WaveManager(map, level, { soldiers, tactics });
const projectiles = new ProjectileManager();
const effects = new EffectManager();
const upgrades = new UpgradeManager();
const ultimate = new UltimateManager({economy, soldiers, effects, basePosition: map.getPathPosition(map.getPathLength())});
const weather = new WeatherManager({
  ...weatherConfig, weathers: weatherConfig.weathers.filter(w => stage.weather.includes(w.key)),
});
const weatherFX = new WeatherFX();
const canvas = byId('game-canvas');
const ctx = canvas.getContext('2d');
const grid = {
  cellSize: CONFIG.CELL_SIZE, cols: CONFIG.COLS, rows: CONFIG.ROWS,
  sites: stage.sites.map(([col, row]) => ({col, row})),
};
const renderer = new Renderer(ctx, grid);
const input = new Input(canvas, grid);
let currentWeapon = WeaponType.ARROW;
let sellMode = false;
let manualPause = false;
let speed = 1;
let gameOver = false;
const {showResult, recordDeployment, recordEarlyWave, recordLeaks} = initCampaign(
  mapsConfig.maps, stage, () => waves.waveIndex > 0 || soldiers.getAll().length > 0, rotation);
const orders = initGuardOrders(tactics);
const offerTactic = initTacticChoice(tactics, waves, def => {
  hint('已采用' + def.name);
  audio.play('upgrade');
});
let pendingBuild = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const scale = Math.min(canvas.width / CANVAS_WIDTH, canvas.height / CANVAS_HEIGHT);
  const x = (canvas.width - CANVAS_WIDTH * scale) / 2;
  const y = (canvas.height - CANVAS_HEIGHT * scale) / 2;
  renderer.setViewport(scale, x, y);
  input.setViewport(scale, x, y);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeCanvas).observe(byId('game-wrap'));
else window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const weaponOrder = Object.values(WeaponType);
const enemyNames = { normal: '青泥怪', fast: '快狼', tank: '石像', swarm: '夜蝠', armored: '铁卫', mage: '巫师', archer: '骷髅弓手', boss: '领主' };
const sprites = ['base', ...weaponOrder.map(t => 'turret_' + t), ...Object.keys(enemyNames).map(t => 'monster_' + t)];
assets.setManifest(Object.fromEntries(sprites.map(key => [key, 'assets/img/' + key + '.svg'])));
assets.load();
const sounds = ['fire_sword','fire_arrow','fire_cannon','fire_magic','hit_arrow','hit_cannon','hit_magic',
  'place','upgrade','sell','wave_start','kill','leak','coin','victory','gameover','button','tower_down'];
audio.setManifest(Object.fromEntries(sounds.map(key => [key, 'assets/audio/' + key + '.wav'])));
let musicEnabled = true;
try {
  audio.setMuted(localStorage.getItem('tafang_muted') === '1');
  const saved = localStorage.getItem('emberwatch.music');
  musicEnabled = saved === null ? !audio.muted : saved === '1';
} catch { /* 本次游戏仍可调节声音 */ }
const music = new BackgroundMusic(byId('background-music'), 'assets/audio/watchfire.mp3', musicEnabled);
function syncMusicActivity() {
  music.setActive(!document.hidden && !manualPause && !gameOver);
}
document.addEventListener('visibilitychange', syncMusicActivity);
window.addEventListener('pagehide', () => music.setActive(false));
window.addEventListener('pageshow', syncMusicActivity);
syncMusicActivity();

function unlockSound(event) {
  if (!event.isTrusted) return;
  if (!audio.muted) audio.unlock();
  // 先让开关自己的 click 处理新偏好，避免首次点“关”时短暂起播。
  if (event.type === 'click' || !event.target?.closest?.('#btn-music')) music.onGesture();
}
for (const event of ['click', 'keydown', 'touchend']) window.addEventListener(event, unlockSound, {passive: true});

function refreshSoundButtons() {
  const musicButton = byId('btn-music'), effectsButton = byId('btn-mute');
  musicButton.setAttribute('aria-pressed', String(music.enabled));
  musicButton.title = music.enabled ? '关闭背景音乐' : '开启背景音乐';
  musicButton.querySelector('use').setAttribute('href', iconSheet + (music.enabled ? 'music' : 'music-off'));
  effectsButton.setAttribute('aria-pressed', String(!audio.muted));
  effectsButton.title = audio.muted ? '开启战斗音效' : '关闭战斗音效';
  effectsButton.querySelector('use').setAttribute('href', iconSheet + (audio.muted ? 'mute' : 'sound'));
}
byId('btn-music').addEventListener('click', () => {
  music.setEnabled(!music.enabled);
  try { localStorage.setItem('emberwatch.music', music.enabled ? '1' : '0'); } catch { /* 本局偏好仍生效 */ }
  refreshSoundButtons();
});
byId('btn-mute').addEventListener('click', () => {
  audio.toggleMute();
  try { localStorage.setItem('tafang_muted', audio.muted ? '1' : '0'); } catch { /* 单局偏好仍生效 */ }
  refreshSoundButtons();
  if (!audio.muted) audio.play('button');
});
refreshSoundButtons();

function combinedMultipliers() {
  const up = upgrades.multipliers, wm = weather.modifiers;
  return { damageMul: up.damageMul * wm.damageMul, fireRateMul: up.fireRateMul * wm.fireRateMul, rangeMul: up.rangeMul * wm.rangeMul };
}
function recomputeSoldiers() {
  const mul = combinedMultipliers();
  for (const soldier of soldiers.getAll()) soldier.recompute(mul);
}
weather.setOnWeatherChange(recomputeSoldiers);
waves.setOnKill(m => {
  ultimate.onKill(m.key === 'boss');
  if (ultimate.isGoldRushActive) economy.earn(m.reward);
});

function fieldBlocked() {
  return gameOver || manualPause || quizGate.isOpen || campaignDialog.open || guideDialog.open || tacticDialog.open;
}
function hint(message) { byId('field-hint').textContent = message; }
const weaponGrid = byId('weapon-grid');
const weaponDetails = {
  sword: '贴身斩击', arrow: '单体速射', cannon: '范围溅射', magic: '秘术连弹',
  sniper: '远程穿甲', frost: '减速控制', storm: '连锁闪电',
};

weaponOrder.forEach((type, i) => {
  const w = WEAPONS[type];
  const button = document.createElement('button');
  button.className = 'wpn-btn';
  button.dataset.weapon = type;
  button.innerHTML = '<span class="wpn-icon"><img width="29" height="29" alt="" src="assets/img/turret_' + type + '.svg"></span>' +
    '<span class="wpn-info"><b>' + w.name + '<span class="key-num">' + (i + 1) + '</span></b><small>' +
    weaponDetails[type] + '</small></span><span class="cost"></span>';
  button.addEventListener('click', () => selectWeapon(type));
  weaponGrid.append(button);
});
function selectWeapon(type) {
  if (!WEAPONS[type] || gameOver || quizGate.isOpen) return;
  if (type === WeaponType.MAGIC && !upgrades.magicUnlocked) return;
  if (type !== currentWeapon) audio.play('button');
  currentWeapon = type;
  setSellMode(false);
  refreshShop();
  hint(economy.canAfford(WEAPONS[type].cost) ? '点击石台部署' + WEAPONS[type].name : '金币不足，击杀敌人可获得金币');
}
function refreshShop() {
  byId('hud-gold').querySelector('b').textContent = economy.gold;
  byId('hud-lives').querySelector('b').textContent = economy.baseLives + '/' + economy.maxLives;
  for (const btn of weaponGrid.children) {
    const type = btn.dataset.weapon, w = WEAPONS[type];
    const locked = type === WeaponType.MAGIC && !upgrades.magicUnlocked;
    btn.disabled = locked;
    btn.setAttribute('aria-pressed', String(type === currentWeapon && !sellMode));
    btn.classList.toggle('locked', locked);
    btn.classList.toggle('is-unaffordable', !economy.canAfford(w.cost));
    btn.querySelector('.cost').innerHTML = locked ? icon('lock') : icon('coin') + w.cost;
    btn.setAttribute('aria-label', w.name + '，' + weaponDetails[type] + '，' + (locked ? '需解锁' : w.cost + ' 金币'));
  }
  const w = WEAPONS[currentWeapon];
  const range = Number((w.range / CONFIG.CELL_SIZE).toFixed(1));
  byId('weapon-desc').textContent = w.name + '　' + range + ' 格射程 · ' + w.damage + ' 伤害 · ' + w.fireRate + ' 次/秒';
  const unlock = byId('btn-unlock-magic');
  unlock.classList.toggle('hidden', upgrades.magicUnlocked);
  unlock.disabled = !economy.canAfford(upgrades.getMagicUnlockCost());
  unlock.textContent = '解锁秘术师 ' + upgrades.getMagicUnlockCost() + ' 金 · 部署 ' + WEAPONS.magic.cost + ' 金';
  for (const btn of document.querySelectorAll('.up-btn')) {
    const key = btn.dataset.up, def = UPGRADE_DEFS[key], lv = upgrades.getLevel(key);
    const cost = upgrades.getCost(key), maxed = !upgrades.canBuy(key);
    btn.disabled = maxed || !economy.canAfford(cost);
    btn.innerHTML = '<strong>' + def.label + '<span class="cost">' + (maxed ? '已满级' : icon('coin') + cost) +
      '</span></strong><small>Lv.' + lv + ' / ' + def.maxLevel + '　每级 +' + Math.round(def.perLevel * 100) + '%</small>';
  }
}
economy.onChange(refreshShop);
upgrades.onChange(() => { recomputeSoldiers(); refreshShop(); });
byId('btn-unlock-magic').addEventListener('click', () => {
  if (!gameOver && upgrades.unlockMagic(economy)) { audio.play('upgrade'); selectWeapon(WeaponType.MAGIC); }
});
for (const tab of ['deploy', 'upgrade']) {
  byId('tab-' + tab).addEventListener('click', () => {
    for (const name of ['deploy','upgrade']) {
      byId(name + '-panel').classList.toggle('hidden', name !== tab);
      byId('tab-' + name).setAttribute('aria-pressed', String(name === tab));
    }
  });
}
function setSellMode(active) {
  sellMode = active;
  pendingBuild = null;
  orders.select(null);
  byId('btn-sell').setAttribute('aria-pressed', String(active));
  byId('btn-sell').textContent = active ? '退出出售' : '出售守卫';
}
byId('btn-sell').addEventListener('click', () => {
  if (gameOver) return;
  setSellMode(!sellMode);
  refreshShop();
  hint(sellMode ? '点击已部署守卫出售' : '选择守卫，点击石台部署');
});
function sellAt({col, row}) {
  if (fieldBlocked()) return;
  const soldier = soldiers.getAt(col, row);
  if (!soldier) { hint('这里没有可出售的守卫'); return; }
  soldiers.removeAt(col, row);
  map.release(col, row);
  if (orders.selected === soldier) orders.select(null);
  const refund = tactics.saleRefund(soldier.cost);
  economy.refund(refund);
  hint('已出售' + soldier.weapon.name + '，返还 ' + refund + ' 金');
  audio.play('sell');
}
input.onCellRightClick(sellAt);
input.onCellClick(cell => {
  if (fieldBlocked()) return;
  if (sellMode) return sellAt(cell);
  const {col, row} = cell;
  if (!map.canPlace(col, row)) {
    pendingBuild = null;
    const occupant = soldiers.getAt(col, row);
    orders.select(occupant || null);
    hint(occupant ? '可在地图下方设置索敌顺序' : '请在带 + 的石台上部署守卫');
    return;
  }
  orders.select(null);
  const w = WEAPONS[currentWeapon];
  const range = w.range * combinedMultipliers().rangeMul;
  if (!map.coveredRoad(col, row, range).length && (pendingBuild?.col !== col || pendingBuild?.row !== row)) {
    pendingBuild = {col, row};
    hint('当前射程未覆盖道路，再点同一石台可确认部署');
    return;
  }
  pendingBuild = null;
  if (!economy.spend(w.cost)) { hint('还差 ' + (w.cost - economy.gold) + ' 金才能部署' + w.name); return; }
  map.occupy(col, row);
  const soldier = new Soldier(col, row, currentWeapon);
  soldier.recompute(combinedMultipliers());
  soldiers.add(soldier);
  recordDeployment(soldiers.getAll().filter(s => s.alive).length);
  audio.play('place');
  hint(w.name + '已部署');
});

const quizGate = initQuizPanel({config: quizConfig, upgrades, economy, isGameOver: () => gameOver});

const ultBar = byId('ultimate-bar');
function tryUltimate(type) {
  if (fieldBlocked() || !waves.isWaveInProgress() || !ultimate.activate(type)) return;
  if (type === UltimateType.FREEZE && waves.interruptBossStrikes()) hint('冰冻打断了首领冲击');
  audio.play('upgrade');
  if (type === UltimateType.REPAIR) hint('抢修完成，城堡和守卫耐久已回满');
}
byId('interrupt-strike').addEventListener('click', () => tryUltimate(UltimateType.FREEZE));
for (const def of Object.values(ULTIMATE_DEFS)) {
  const btn = document.createElement('button');
  btn.className = 'ult-btn';
  btn.dataset.ult = def.key;
  btn.title = def.name + '（' + def.hotkey + '）· ' + def.desc;
  btn.innerHTML = def.label + '<span class="skill-key">' + def.hotkey + '</span>';
  btn.setAttribute('aria-label', btn.title);
  btn.addEventListener('click', () => tryUltimate(def.key));
  ultBar.append(btn);
}
function refreshUltimate() {
  byId('energy-count').textContent = ultimate.energy + ' / 100';
  byId('energy-fill').style.width = (ultimate.energyRatio * 100) + '%';
  const inBattle = waves.isWaveInProgress() && !fieldBlocked();
  for (const btn of ultBar.children) {
    const type = btn.dataset.ult;
    btn.disabled = !inBattle || !ultimate.canActivate(type);
    if (type === UltimateType.REPAIR) {
      btn.title = inBattle && ultimate.isReady && btn.disabled ? '所有设施耐久已满，保留能量' : btn.getAttribute('aria-label');
    }
  }
}
ultimate.onChange(refreshUltimate);
function launchWave() {
  if (fieldBlocked()) return;
  const bonus = waves.earlyBonus;
  if (!waves.startNextWave(economy)) return;
  if (bonus) { recordEarlyWave(); hint('提前迎战，获得 ' + bonus + ' 金'); }
  else hint('敌人已从红旗进入');
}
byId('btn-next-wave').addEventListener('click', launchWave);
function togglePause() {
  if (gameOver || quizGate.isOpen || campaignDialog.open || guideDialog.open || tacticDialog.open) return;
  manualPause = !manualPause;
  syncMusicActivity();
  const btn = byId('btn-pause');
  btn.innerHTML = icon(manualPause ? 'play' : 'pause');
  btn.title = manualPause ? '继续战斗（P）' : '暂停（P）';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(manualPause));
  byId('resume').classList.toggle('hidden', !manualPause);
}
byId('btn-pause').addEventListener('click', togglePause);
byId('resume').addEventListener('click', togglePause);
byId('btn-speed').addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  const button = byId('btn-speed');
  button.querySelector('b').textContent = speed + '×';
  button.setAttribute('aria-label', '切换战斗速度，当前 ' + speed + ' 倍');
});
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target?.matches?.('select, input, textarea') || e.target?.isContentEditable) return;
  if (quizGate.isOpen) {
    const i = Number(e.key) - 1;
    if (quizGate.isActive && i >= 0 && i < quizGate.question.options.length) quizGate.submit(i);
    return;
  }
  if (campaignDialog.open || guideDialog.open || tacticDialog.open || gameOver) return;
  const key = e.key.toLowerCase();
  if (key === 'p') return togglePause();
  if (manualPause) return;
  if (weaponOrder[Number(key) - 1]) selectWeapon(weaponOrder[Number(key) - 1]);
  const skill = Object.values(ULTIMATE_DEFS).find(def => def.hotkey.toLowerCase() === key);
  if (skill) tryUltimate(skill.key);
});

let lastWaveState = '';
function refreshWaveHud() {
  const live = waves.isWaveInProgress();
  const countdown = Math.ceil(waves.nextWaveIn);
  const blocked = fieldBlocked();
  const state = [waves.waveIndex, waves.remainingEnemies, countdown, blocked, manualPause, gameOver,
    ultimate.canActivate(UltimateType.REPAIR)].join('/');
  if (state === lastWaveState) return;
  lastWaveState = state;
  const index = Math.min(level.orders.length - 1, live ? waves.waveIndex - 1 : waves.waveIndex);
  const order = level.orders[index];
  const phase = byId('phase');
  phase.classList.toggle('live', live);
  phase.querySelector('span').textContent = gameOver ? '已结算' : manualPause ? '已暂停' : live ? '交战中' : waves.waveIndex ? '整备中' : '布防中';
  byId('hud-wave').querySelector('b').textContent = waves.waveIndex + '/' + waves.maxWaves;
  byId('forecast-label').textContent = (live ? '当前敌情' : '下波预告') + '　' + String(index + 1).padStart(2, '0') + ' / ' + String(waves.maxWaves).padStart(2, '0');
  byId('forecast-name').textContent = order.name;
  const counts = {};
  for (const [key, n] of order.groups) counts[key] = (counts[key] || 0) + n;
  const portrait = counts.boss ? 'boss' : Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
  const portraitSrc = 'assets/img/monster_' + portrait + '.svg';
  const portraitImg = byId('forecast-portrait');
  if (portraitImg.getAttribute('src') !== portraitSrc) portraitImg.src = portraitSrc;
  byId('forecast-detail').textContent = Object.entries(counts).map(([key, n]) => enemyNames[key] + ' ×' + n).join(' · ');
  const btn = byId('btn-next-wave');
  btn.disabled = blocked || live || waves.waveIndex >= waves.maxWaves;
  btn.querySelector('span').textContent = gameOver ? '战斗结束' : live ? '余 ' + waves.remainingEnemies + ' 敌' :
    waves.waveIndex ? '迎战 +' + waves.earlyBonus + ' 金 · ' + countdown + 's' : '开始第 1 波';
  refreshUltimate();
}

function battleStep(dt) {
  weather.tick(dt);
  const monsters = waves.getActive();
  soldiers.update(dt, { monsters, projectiles, effects, tactic: tactics.choice });
  projectiles.update(dt, monsters, effects);
  effects.update(dt);
  waves.update(dt, economy, effects, projectiles, weather.modifiers.monsterSpeedMul, ultimate.isFreezeActive);
  recordLeaks(waves.leaks);
  if (!waves.isWaveInProgress()) ultimate.endGoldRush();
  ultimate.update(dt, { monsters: waves.getActive(), effects, economy, canvasW: CANVAS_WIDTH, canvasH: CANVAS_HEIGHT });
  if (economy.isGameOver() || waves.isVictory) {
    gameOver = true;
    syncMusicActivity();
    const won = !economy.isGameOver();
    audio.play(won ? 'victory' : 'gameover');
    showResult(won, { waves, economy, soldiers, upgrades });
  } else if (!waves.isWaveInProgress()) offerTactic();
}
function update(dt) {
  if (quizGate.isOpen) {
    quizGate.tick(dt);
    if (quizGate.isOpen) {
      const timer = byId('quiz-timer'), value = Math.ceil(quizGate.remaining);
      if (timer.textContent !== value + 's') timer.textContent = value + 's';
      timer.classList.toggle('is-low', value <= 3);
    }
    return;
  }
  if (fieldBlocked() || !waves.waveIndex) return;
  for (let i = 0; i < speed && !fieldBlocked(); i++) battleStep(dt);
}

let lastWeather = '';
const rangeReadout = byId('range-readout'), fieldHint = byId('field-hint');
let coverageCache = null;
function previewRoad() {
  orders.refresh();
  const cell = input.hoverCell || pendingBuild || orders.selected;
  if (cell && !fieldBlocked()) {
    const {col, row} = cell, soldier = soldiers.getAt(col, row);
    if (soldier || (!sellMode && map.canPlace(col, row))) {
      const weapon = soldier?.weapon || WEAPONS[currentWeapon];
      const range = soldier?.range ?? weapon.range * combinedMultipliers().rangeMul;
      if (!coverageCache || coverageCache.col !== col || coverageCache.row !== row || coverageCache.range !== range) {
        const parts = map.coveredRoad(col, row, range);
        const length = parts.reduce((sum, [x,y,u,v]) => sum + Math.hypot(u - x, v - y), 0);
        coverageCache = {col, row, range, parts, cells: (length / CONFIG.CELL_SIZE).toFixed(1)};
      }
      renderer.drawSoldier(col, row, {color: weapon.color, range, showRange: true, image: assets.get('turret_' + weapon.type), ghost: true});
      renderer.drawRoadCoverage(coverageCache.parts);
      const empty = !coverageCache.parts.length;
      const confirm = pendingBuild?.col === col && pendingBuild?.row === row;
      const label = empty ? (confirm ? '未覆盖道路 · 再点石台确认部署' : '当前射程未覆盖道路') : '可攻击 ' + coverageCache.cells + ' 格路段';
      if (rangeReadout.textContent !== label) rangeReadout.textContent = label;
      rangeReadout.classList.toggle('no-range', empty);
      if (rangeReadout.hidden) { rangeReadout.hidden = false; fieldHint.hidden = true; }
      return;
    }
  }
  if (!rangeReadout.hidden) { rangeReadout.hidden = true; fieldHint.hidden = false; }
}

const bossAlert = byId('boss-alert'), bossName = byId('boss-alert-name'), bossClock = byId('boss-countdown'), interrupt = byId('interrupt-strike');
let announcedStrike = '';
function renderBossAlert() {
  const warnings = waves.bossWarnings, first = warnings[0];
  if (bossAlert.hidden !== !first) bossAlert.hidden = !first;
  const title = first ? first.theme.name + (warnings.length > 1 ? ' ×' + warnings.length : '') : '';
  if (title !== announcedStrike) {
    bossName.textContent = title;
    byId('boss-announce').textContent = first ? title + '即将命中标记石台，可用冰冻打断' : '';
    announcedStrike = title;
  }
  if (first) {
    const canInterrupt = !fieldBlocked() && ultimate.canActivate(UltimateType.FREEZE);
    if (interrupt.hidden !== !canInterrupt) interrupt.hidden = !canInterrupt;
    const time = (Math.ceil(first.remaining * 10) / 10).toFixed(1) + 's';
    if (bossClock.textContent !== time) bossClock.textContent = time;
  }
}

function render() {
  renderer.clear();
  renderer.drawTerrain(terrain);
  previewRoad();
  renderer.drawBase(map.baseCell.col, map.baseCell.row, {image: assets.get('base')});
  for (const s of soldiers.getAll()) {
    renderer.drawSoldier(s.col, s.row, {color: s.weapon.color, angle: s.angle, image: assets.get('turret_' + s.weapon.type)});
    if (s.hp < s.maxHp) renderer.drawHealthBar(s.x, s.y - 27, 33, s.hpRatio);
  }
  for (const m of waves.getActive()) {
    renderer.drawMonster(m.x, m.y, m.radiusPx, {
      image: assets.get('monster_' + m.key), color: m.color, slowed: m.isSlowed, distance: m.dist,
    });
    if (m.hp < m.maxHp || m.key === 'boss') renderer.drawHealthBar(m.x, m.y - m.radiusPx * 1.35, 30, m.hpRatio, '#efab77');
  }
  for (const p of projectiles.getAll()) {
    renderer.drawLine(p.x, p.y, p.x - (p._tx - p.x) * .08, p.y - (p._ty - p.y) * .08, p.color, 2);
    renderer.drawCircle(p.x, p.y, p.radius, p.color);
  }
  effects.draw(renderer);
  drawBossWarnings(renderer, waves, stage);
  renderBossAlert();
  weatherFX.draw(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, fieldBlocked() ? 0 : CONFIG.FIXED_DT * speed, weather.currentWeather);
  if (ultimate.isFreezeActive || ultimate.isMeteorActive) {
    ctx.fillStyle = ultimate.isFreezeActive ? 'rgba(90,175,240,.14)' : 'rgba(236,112,51,.10)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (ultimate.isGoldRushActive) {
    ctx.strokeStyle = '#ecc15d'; ctx.lineWidth = 5; ctx.strokeRect(2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4);
  }
  const weatherText = weather.isActive ? weather.currentWeather.name + ' ' + Math.ceil(weather.remaining) + 's' : '晴朗';
  if (lastWeather !== weatherText) { byId('hud-weather').textContent = weatherText; lastWeather = weatherText; }
  input.setSnapTargets(soldiers.getAll());
  refreshWaveHud();
}
refreshShop();
const loop = new GameLoop({ update, render });
loop.start();
window.__game = { map, economy, soldiers, waves, projectiles, effects, upgrades, ultimate, renderer, WEAPONS };
