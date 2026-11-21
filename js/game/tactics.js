export const TACTICS = {
  shatter: {
    name: '碎冰炮弹', portrait: 'frost', radiusScale: 1.75,
    detail: '重炮命中被霜晶减速的目标时消耗减速，溅射半径扩大 75%。',
  },
  volley: {
    name: '连射弩', portrait: 'arrow', damageScale: 2,
    detail: '每名弩手连续命中同一目标时，第三箭造成双倍基础伤害。',
  },
  salvage: {
    name: '机动工坊', icon: 'hammer', refundRate: .8,
    detail: '主动出售守卫时返还造价的 80%，可在两波之间重新布防。',
  },
};

export class BattleTactics {
  constructor() { this.choice = null; }

  needsChoice(waves) {
    return !this.choice && waves.waveIndex === 2 && waves.maxWaves > 2 && !waves.isWaveInProgress();
  }

  choose(key, waves) {
    if (!Object.hasOwn(TACTICS, key) || !this.needsChoice(waves)) return false;
    this.choice = key;
    return true;
  }

  get refundRate() { return this.choice === 'salvage' ? TACTICS.salvage.refundRate : .5; }
  saleRefund(cost) { return Math.floor(cost * this.refundRate); }
}
