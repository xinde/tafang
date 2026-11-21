const TYPES = {
  guards: { title: '四卫通关', metric: '驻场峰值', condition: n => '同时在场最多 ' + n + ' 名守卫并通关' },
  leaks: { title: '滴水不漏', metric: '漏怪', condition: () => '全程零漏怪并通关' },
  early: { title: '先声夺人', metric: '提前迎战', condition: n => '在整备倒计时内提前迎战至少 ' + n + ' 次并通关' },
};

export function challengeInfo(stage) {
  const {type, target} = stage.challenge || {type:'guards', target:4};
  const def = TYPES[type];
  return {type, target, title: def.title, metric: def.metric, goal: def.condition(target),
    storageKey: 'emberwatch.challenge.' + stage.id + '.' + type + '.' + target};
}

/** 一局只统计本关选定的可选目标，结算失败不会覆盖此前获得的勋章。 */
export class StageChallenge {
  constructor(stage, storage) {
    this.info = challengeInfo(stage);
    this.storage = storage;
    this.value = 0;
    this.awarded = false;
  }

  recordDeployment(livingCount) { return this._record('guards', livingCount); }
  recordLeaks(totalLeaks) { return this._record('leaks', totalLeaks); }
  recordEarlyWave() { return this._record('early', this.value + 1); }

  _record(type, next) {
    if (this.info.type !== type || !Number.isInteger(next) || next <= this.value) return false;
    this.value = next;
    return true;
  }

  get qualified() {
    return this.info.type === 'early' ? this.value >= this.info.target : this.value <= this.info.target;
  }

  get progress() {
    if (this.info.type === 'leaks') return '漏怪 ' + this.value + ' 次';
    return this.info.metric + ' ' + this.value + '/' + this.info.target;
  }

  hasMedal(info = this.info) {
    if (info.storageKey === this.info.storageKey && this.awarded) return true;
    try { return this.storage?.getItem(info.storageKey) === '1'; }
    catch { return false; }
  }

  finish(won) {
    if (!won || !this.qualified) return false;
    this.awarded = true;
    try { this.storage?.setItem(this.info.storageKey, '1'); } catch { /* 本局战报仍显示勋章。 */ }
    return true;
  }
}
