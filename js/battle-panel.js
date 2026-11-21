import { TACTICS } from './game/tactics.js';

const byId = id => document.getElementById(id);
export const tacticDialog = byId('tactic-dialog');

export function initTacticChoice(tactics, waves, onChoose) {
  const list = byId('tactic-options');
  for (const [key, def] of Object.entries(TACTICS)) {
    const button = document.createElement('button');
    button.className = 'tactic-card';
    button.dataset.tactic = key;
    const image = def.portrait ? '<img src="assets/img/turret_' + def.portrait + '.svg" width="30" height="30" alt="">' :
      '<svg class="icon" aria-hidden="true"><use href="assets/img/icons.svg?v=music#' + def.icon + '"/></svg>';
    button.innerHTML = image + '<span><strong>' + def.name + '</strong><small>' + def.detail + '</small></span>';
    button.addEventListener('click', () => {
      if (!tactics.choose(key, waves)) return;
      tacticDialog.close();
      const badge = byId('chosen-tactic');
      badge.textContent = '本局战术 · ' + def.name;
      badge.title = def.detail;
      badge.hidden = false;
      byId('sell-rate').textContent = '出售返还 ' + Math.round(tactics.refundRate * 100) + '%';
      onChoose(def);
    });
    list.append(button);
  }
  tacticDialog.addEventListener('cancel', e => e.preventDefault());
  return () => {
    if (!tacticDialog.open && tactics.needsChoice(waves)) tacticDialog.showModal();
  };
}

export function initGuardOrders(tactics) {
  const bar = byId('guard-orders'), status = byId('guard-status');
  const buttons = [...bar.querySelectorAll('[data-target-mode]')];
  let selected = null;
  function refresh() {
    if (!selected) return;
    if (!selected.alive) { select(null); return; }
    const streak = tactics.choice === 'volley' && selected.weapon.type === 'arrow' ? ' · 连射 ' + selected.volleyHits + '/3' : '';
    const text = selected.weapon.name + ' · 耐久 ' + Math.ceil(selected.hp) + '/' + selected.maxHp + streak;
    if (status.textContent !== text) status.textContent = text;
  }
  function select(soldier) {
    selected = soldier;
    bar.hidden = !soldier;
    if (!soldier) return;
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(btn.dataset.targetMode === soldier.targetMode));
    refresh();
  }
  for (const btn of buttons) btn.addEventListener('click', () => {
    if (selected?.alive && selected.setTargetMode(btn.dataset.targetMode)) select(selected);
  });
  byId('close-orders').addEventListener('click', () => select(null));
  return {select, refresh, get selected() { return selected; }};
}
