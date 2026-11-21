import { paintRoutePreview } from './engine/terrain.js?v=12maps';
import { UPGRADE_DEFS, UPGRADE_KEYS } from './game/upgrade.js';
import { StageChallenge, challengeInfo } from './game/stage-challenge.js';

const byId = id => document.getElementById(id);
export const campaignDialog = byId('campaign-dialog');
export const guideDialog = byId('guide-dialog');
const scoreDialog = byId('score-dialog');

function bestRank(id) {
  try { return localStorage.getItem('emberwatch.rank.' + id) || ''; }
  catch { return ''; }
}

function saveRank(id, grade) {
  const ranks = ['', 'D', 'C', 'B', 'A', 'S', 'S+'];
  if (ranks.indexOf(grade) > ranks.indexOf(bestRank(id))) {
    try { localStorage.setItem('emberwatch.rank.' + id, grade); } catch { /* 仍可继续战役 */ }
  }
}

export function initCampaign(stages, stage, hasProgress, rotation) {
  const index = stages.indexOf(stage);
  const challenge = new StageChallenge(stage, rotation.preferences);
  const goals = stages.map(challengeInfo);
  let chosen = index;
  let returnToResult = false;
  let leaving = false;
  window.addEventListener('pageshow', () => { leaving = false; });
  function enterStage(target) {
    if (leaving) return;
    leaving = true;
    const url = new URL(location.href);
    url.searchParams.set('stage', (target || rotation.select()).id);
    if (url.href === location.href) location.reload();
    else location.assign(url.href);
  }
  byId('stage-landscape').src = stage.landscape;
  byId('chapter-number').textContent = '地图 ' + String(index + 1).padStart(2, '0') + ' / ' + String(stages.length).padStart(2, '0');
  byId('stage-title').textContent = stage.title;
  byId('stage-difficulty').textContent = stage.difficulty;
  byId('stage-desc').textContent = stage.desc;
  document.title = stage.title + ' · 余烬守卫';

  function refreshChallenge() {
    const el = byId('guard-challenge');
    el.textContent = '可选勋章「' + challenge.info.title + '」 · ' + challenge.progress;
    el.title = '可选目标 · ' + challenge.info.goal;
    el.classList.toggle('challenge-missed', challenge.info.type !== 'early' && !challenge.qualified);
  }
  refreshChallenge();
  const scope = byId('stage-pool');
  scope.value = rotation.scope;
  scope.querySelector('[value="same"]').textContent = '同难度随机（' + stage.difficulty + '）';
  scope.addEventListener('change', () => rotation.setScope(scope.value));

  function refreshChoice() {
    [...byId('stage-list').children].forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === chosen));
      const rank = bestRank(stages[i].id);
      button.querySelector('.stage-rank').textContent = rank ? '最佳 ' + rank : i === index ? '本关' : '';
      button.querySelector('.stage-honor').hidden = !challenge.hasMedal(goals[i]);
    });
    byId('enter-stage').textContent = chosen === index ? '重新布防' : '进入关卡';
    const briefing = hasProgress() ? '进入关卡将重新布防。' : stages[chosen].desc;
    byId('campaign-note').textContent = briefing + ' ' + goals[chosen].goal + '，可获「' + goals[chosen].title + '」勋章。';
  }
  function openMap() {
    chosen = index;
    const list = byId('stage-list');
    if (!list.children.length) {
      stages.forEach((entry, i) => {
        const button = document.createElement('button');
        button.className = 'stage-choice';
        const preview = paintRoutePreview(entry);
        preview.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '　' + entry.title + '</b><small>' +
          entry.difficulty + ' · ' + entry.waves.length + ' 波 · ' + entry.startGold + ' 初始金币</small>';
        const record = document.createElement('span');
        record.className = 'stage-record';
        const rank = document.createElement('span'), honor = document.createElement('small');
        rank.className = 'stage-rank'; honor.className = 'stage-honor';
        honor.textContent = '★ ' + goals[i].title;
        record.append(rank, honor);
        button.append(preview, text, record);
        button.addEventListener('click', () => { chosen = i; refreshChoice(); });
        list.append(button);
      });
    }
    refreshChoice();
    campaignDialog.showModal();
    list.children[chosen].scrollIntoView({block:'nearest'});
  }
  byId('btn-campaign').addEventListener('click', openMap);
  byId('btn-guide').addEventListener('click', () => guideDialog.showModal());
  byId('enter-stage').addEventListener('click', () => enterStage(stages[chosen]));
  byId('random-stage').addEventListener('click', () => enterStage());
  document.querySelectorAll('[data-close]').forEach(button =>
    button.addEventListener('click', () => button.closest('dialog').close()));
  byId('btn-restart').addEventListener('click', () => enterStage(stage));
  scoreDialog.addEventListener('cancel', e => e.preventDefault());
  campaignDialog.addEventListener('close', () => {
    if (returnToResult) { returnToResult = false; scoreDialog.showModal(); }
  });

  let report = '';
  byId('btn-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(report);
      byId('btn-share').textContent = '已复制';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(scoreDialog);
      selection.removeAllRanges();
      selection.addRange(range);
      byId('btn-share').textContent = '已选中战绩';
    }
  });
  byId('btn-continue').addEventListener('click', () => {
    if (scoreDialog.dataset.win === 'true') enterStage();
    else { returnToResult = true; scoreDialog.close(); openMap(); }
  });

  function showResult(won, { waves, economy, soldiers, upgrades }) {
    challenge.recordLeaks(waves.leaks);
    challenge.recordDeployment(soldiers.getAll().filter(soldier => soldier.alive).length);
    refreshChallenge();
    const earned = challenge.finish(won);
    const { gold, baseLives } = economy;
    const wave = waves.waveIndex + '/' + waves.maxWaves;
    const lives = baseLives + '/' + economy.maxLives;
    const towerCount = soldiers.getAll().length;
    const levels = UPGRADE_KEYS.reduce((sum, k) => sum + upgrades.getLevel(k), 0);
    const maxLevels = UPGRADE_KEYS.reduce((sum, k) => sum + UPGRADE_DEFS[k].maxLevel, 0);
    const score = Math.round(waves.waveIndex / waves.maxWaves * 600 + baseLives / economy.maxLives * 200 +
      Math.min(1, gold / 300) * 100 + levels / maxLevels * 100);
    const grade = won && score >= 850 ? 'S+' : won && score >= 700 ? 'S' : score >= 550 ? 'A' :
      score >= 400 ? 'B' : score >= 250 ? 'C' : 'D';
    if (won) saveRank(stage.id, grade);
    byId('score-medal').textContent = grade;
    byId('score-map').textContent = stage.title;
    byId('overlay-title').textContent = won ? '防线守住了' : '城门失守';
    byId('overlay-sub').textContent = won ? '击退全部 ' + waves.maxWaves + ' 波敌军，城堡还剩 ' + baseLives + ' 点耐久。' :
      '敌军在第 ' + waves.waveIndex + ' 波突破了防线。' + stage.desc;
    byId('score-waves').textContent = wave;
    byId('score-lives').textContent = lives;
    byId('score-gold').textContent = gold;
    byId('score-towers').textContent = towerCount;
    const medalResult = (earned ? '★ 获得勋章' : '本局未达成') + '「' + challenge.info.title + '」 · ' + challenge.progress;
    byId('score-challenge').textContent = medalResult;
    byId('score-challenge').classList.toggle('challenge-earned', earned);
    scoreDialog.dataset.win = String(won);
    byId('btn-continue').textContent = won ? '随机下一关' : '战役地图';
    report = ['余烬守卫 · ' + stage.title, byId('overlay-title').textContent + ' · ' + grade,
      '波次 ' + wave + '　耐久 ' + lives, '金币 ' + gold + '　守卫 ' + towerCount, medalResult].join('\n');
    scoreDialog.showModal();
  }
  return {
    showResult,
    recordDeployment(count) { if (challenge.recordDeployment(count)) refreshChallenge(); },
    recordEarlyWave() { if (challenge.recordEarlyWave()) refreshChallenge(); },
    recordLeaks(count) { if (challenge.recordLeaks(count)) refreshChallenge(); },
  };
}
