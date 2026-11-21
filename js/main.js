import { CONFIG, CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js';
import { GameLoop } from './engine/loop.js';
import { Renderer } from './engine/renderer.js';
import { paintTerrain } from './engine/terrain.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { assets } from './engine/assets.js';
import { GameMap } from './game/map.js';
import { Economy } from './game/economy.js';
import { Soldier, SoldierManager } from './game/soldier.js';
import { WaveManager, campaignWaves } from './game/wave.js';
import { ProjectileManager } from './game/projectile.js';
import { EffectManager } from './game/effects.js';
import { WEAPONS, WeaponType } from './game/weapon.js';
import { UpgradeManager, UPGRADE_DEFS } from './game/upgrade.js';
import { QuizBank, QuizGate } from './game/quiz.js';
import { WeatherManager, WeatherFX } from './game/weather.js';
import { UltimateManager, ULTIMATE_DEFS } from './game/ultimate.js';
import { initCampaign, campaignDialog, guideDialog } from './campaign.js';

const byId = id => document.getElementById(id);
async function loadConfig(name) {
  const url = new URL('../config/' + name + '.json', import.meta.url);
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
const icon = key => '<svg class="icon" aria-hidden="true"><use href="assets/img/icons.svg#' + key + '"/></svg>';
const selectedId = new URLSearchParams(location.search).get('stage');
const stage = mapsConfig.maps.find(entry => entry.id === selectedId) || mapsConfig.maps[0];
const map = new GameMap(stage);
const terrain = paintTerrain(map, stage);
const economy = new Economy(stage);
const soldiers = new SoldierManager();
const level = campaignWaves(waveConfig, stage);
const waves = new WaveManager(map, level, { soldiers });
const projectiles = new ProjectileManager();
const effects = new EffectManager();
const upgrades = new UpgradeManager();
const ultimate = new UltimateManager();
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
const showResult = initCampaign(mapsConfig.maps, stage, () => waves.waveIndex > 0 || soldiers.getAll().length > 0);

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
window.addEventListener('pointerdown', () => audio.unlock(), {once:true});
window.addEventListener('keydown', () => audio.unlock(), {once:true});
try { audio.setMuted(localStorage.getItem('tafang_muted') === '1'); } catch { /* 私密模式 */ }

function refreshMute() {
  const btn = byId('btn-mute');
  btn.innerHTML = icon(audio.muted ? 'mute' : 'sound');
  btn.setAttribute('aria-pressed', String(audio.muted));
  btn.title = audio.muted ? '开启音效' : '静音';
  btn.setAttribute('aria-label', btn.title);
}
byId('btn-mute').addEventListener('click', () => {
  audio.toggleMute();
  try { localStorage.setItem('tafang_muted', audio.muted ? '1' : '0'); } catch { /* 单局偏好仍生效 */ }
  refreshMute();
  if (!audio.muted) audio.play('button');
});
refreshMute();

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
  return gameOver || manualPause || quizGate.isOpen || campaignDialog.open || guideDialog.open;
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
  const refund = Math.floor(soldier.cost / 2);
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
    const occupant = soldiers.getAt(col, row);
    hint(occupant ? occupant.weapon.name + ' · 耐久 ' + occupant.hp + '/' + occupant.maxHp : '请在带 + 的石台上部署守卫');
    return;
  }
  const w = WEAPONS[currentWeapon];
  if (!economy.spend(w.cost)) { hint('还差 ' + (w.cost - economy.gold) + ' 金才能部署' + w.name); return; }
  map.occupy(col, row);
  const soldier = new Soldier(col, row, currentWeapon);
  soldier.recompute(combinedMultipliers());
  soldiers.add(soldier);
  audio.play('place');
  hint(w.name + '已部署');
});

const quizDialog = byId('quiz-dialog');
const quizGate = new QuizGate({
  bank: new QuizBank(quizConfig), upgrades, economy,
  onOpen: () => quizDialog.showModal(),
  onClose: () => quizDialog.close(),
  onResolve: ({ correct, applied }) => {
    audio.play(applied ? 'upgrade' : 'button');
    const result = byId('quiz-feedback');
    result.textContent = applied ? '答对了，强化已生效。' : correct ? '金币不足，未能强化。' :
      quizGate.lastResult.timedOut ? '时间到，本次未扣金币。' : '本次未扣金币，绿色选项是正确答案。';
    result.className = applied ? 'is-correct' : 'is-wrong';
    [...byId('quiz-options').children].forEach((button, i) => {
      button.disabled = true;
      button.classList.toggle('is-correct', i === quizGate.question.answer);
      button.classList.toggle('is-wrong', !correct && i === quizGate.lastResult.answerIndex);
    });
  },
});
quizDialog.addEventListener('cancel', e => { e.preventDefault(); quizGate.close(); });
for (const btn of document.querySelectorAll('.up-btn')) {
  btn.addEventListener('click', () => {
    const key = btn.dataset.up;
    if (gameOver || !quizGate.open(key)) return;
    byId('quiz-upgrade-label').textContent = UPGRADE_DEFS[key].label + ' Lv.' + (upgrades.getLevel(key) + 1) + ' · 答对扣除 ' + upgrades.getCost(key) + ' 金';
    byId('quiz-question').textContent = quizGate.question.q;
    byId('quiz-feedback').textContent = '';
    const options = byId('quiz-options');
    options.replaceChildren();
    quizGate.question.options.forEach((answer, i) => {
      const opt = document.createElement('button');
      opt.className = 'quiz-opt';
      opt.textContent = (i + 1) + '. ' + answer;
      opt.addEventListener('click', () => quizGate.submit(i));
      options.append(opt);
    });
    options.firstElementChild.focus();
    byId('quiz-timer').textContent = Math.ceil(quizGate.remaining) + 's';
  });
}

const ultBar = byId('ultimate-bar');
function tryUltimate(type) {
  if (!fieldBlocked() && waves.isWaveInProgress() && ultimate.activate(type)) audio.play('upgrade');
}
for (const def of Object.values(ULTIMATE_DEFS)) {
  const btn = document.createElement('button');
  btn.className = 'ult-btn';
  btn.dataset.ult = def.key;
  btn.title = def.name + '（' + def.hotkey + '）· ' + def.desc;
  btn.innerHTML = ({meteor:'陨石',freeze:'冰冻',gold_rush:'淘金'})[def.key] + '<span class="skill-key">' + def.hotkey + '</span>';
  btn.addEventListener('click', () => tryUltimate(def.key));
  ultBar.append(btn);
}
function refreshUltimate() {
  byId('energy-count').textContent = ultimate.energy + ' / 100';
  byId('energy-fill').style.width = (ultimate.energyRatio * 100) + '%';
  for (const btn of ultBar.children) btn.disabled = !ultimate.isReady || !waves.isWaveInProgress() || fieldBlocked();
}
ultimate.onChange(refreshUltimate);
function launchWave() {
  if (fieldBlocked()) return;
  const bonus = waves.earlyBonus;
  if (!waves.startNextWave(economy)) return;
  if (bonus) hint('提前迎战，获得 ' + bonus + ' 金');
  else hint('敌人已从红旗进入');
}
byId('btn-next-wave').addEventListener('click', launchWave);
function togglePause() {
  if (gameOver || quizGate.isOpen || campaignDialog.open || guideDialog.open) return;
  manualPause = !manualPause;
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
  if (quizGate.isOpen) {
    const i = Number(e.key) - 1;
    if (quizGate.isActive && i >= 0 && i < quizGate.question.options.length) quizGate.submit(i);
    return;
  }
  if (campaignDialog.open || guideDialog.open || gameOver) return;
  const key = e.key.toLowerCase();
  if (key === 'p') return togglePause();
  if (manualPause) return;
  if (weaponOrder[Number(key) - 1]) selectWeapon(weaponOrder[Number(key) - 1]);
  const skill = { q:'meteor', w:'freeze', e:'gold_rush' }[key];
  if (skill) tryUltimate(skill);
});

let lastWaveState = '';
function refreshWaveHud() {
  const live = waves.isWaveInProgress();
  const countdown = Math.ceil(waves.nextWaveIn);
  const blocked = fieldBlocked();
  const state = [waves.waveIndex, waves.remainingEnemies, countdown, blocked, manualPause, gameOver].join('/');
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
  soldiers.update(dt, { monsters, projectiles, effects });
  projectiles.update(dt, monsters, effects);
  effects.update(dt);
  waves.update(dt, economy, effects, projectiles, weather.modifiers.monsterSpeedMul);
  if (!waves.isWaveInProgress()) ultimate.endGoldRush();
  ultimate.update(dt, { monsters: waves.getActive(), effects, economy, canvasW: CANVAS_WIDTH, canvasH: CANVAS_HEIGHT });
  if (economy.isGameOver() || waves.isVictory) {
    gameOver = true;
    const won = !economy.isGameOver();
    audio.play(won ? 'victory' : 'gameover');
    showResult(won, { waves, economy, soldiers, upgrades });
  }
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
  for (let i = 0; i < speed && !gameOver; i++) battleStep(dt);
}

let lastWeather = '';
function render() {
  renderer.clear();
  renderer.drawTerrain(terrain);
  renderer.drawBase(map.baseCell.col, map.baseCell.row, {image: assets.get('base')});
  const hover = input.hoverCell;
  if (hover && !fieldBlocked()) {
    const {col, row} = hover;
    const soldier = soldiers.getAt(col, row);
    if (soldier || (map.canPlace(col, row) && !sellMode)) {
      const w = soldier?.weapon || WEAPONS[currentWeapon];
      renderer.drawSoldier(col, row, {
        color: w.color, range: soldier?.range ?? w.range * combinedMultipliers().rangeMul, showRange: true,
        image: assets.get('turret_' + w.type), ghost: true,
      });
    }
  }
  for (const s of soldiers.getAll()) {
    renderer.drawSoldier(s.col, s.row, {color: s.weapon.color, angle: s.angle, image: assets.get('turret_' + s.weapon.type)});
    if (s.hp < s.maxHp) renderer.drawHealthBar(s.x, s.y - 27, 33, s.hpRatio);
  }
  for (const m of waves.getActive()) {
    renderer.drawMonster(m.x, m.y, CONFIG.CELL_SIZE * m.radius, {
      image: assets.get('monster_' + m.key), color: m.color, slowed: m.isSlowed, distance: m.dist,
    });
    if (m.hp < m.maxHp || m.key === 'boss') renderer.drawHealthBar(m.x, m.y - CONFIG.CELL_SIZE * m.radius * 1.35, 30, m.hpRatio, '#efab77');
  }
  for (const p of projectiles.getAll()) {
    renderer.drawLine(p.x, p.y, p.x - (p._tx - p.x) * .08, p.y - (p._ty - p.y) * .08, p.color, 2);
    renderer.drawCircle(p.x, p.y, p.radius, p.color);
  }
  effects.draw(renderer);
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
