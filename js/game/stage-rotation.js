const HISTORY_KEY = 'emberwatch.stage-history';

/** 同一标签页共用一轮抽签。固定链接和重试会标记本关，但不会额外消耗一个名额。 */
export class StageRotation {
  constructor(stages, storage, random = Math.random) {
    if (!stages.length) throw new Error('战役至少需要一张地图');
    this.stages = stages;
    this.storage = storage;
    this.random = random;
    this.seen = [];
    try {
      const saved = JSON.parse(storage?.getItem(HISTORY_KEY) || '[]');
      const ids = new Set(stages.map(stage => stage.id));
      if (Array.isArray(saved)) this.seen = [...new Set(saved.filter(id => ids.has(id)))];
    } catch { /* 存储不可用时，本页仍可抽签。 */ }
  }

  select(requestedId) {
    let stage = this.stages.find(entry => entry.id === requestedId);
    if (!stage) {
      let pool = this.stages.filter(entry => !this.seen.includes(entry.id));
      if (pool.length === 0) {
        const last = this.seen[this.seen.length - 1];
        this.seen = [];
        pool = this.stages.length === 1 ? this.stages : this.stages.filter(entry => entry.id !== last);
      }
      stage = pool[Math.floor(this.random() * pool.length)];
    }
    this.seen = this.seen.filter(id => id !== stage.id);
    this.seen.push(stage.id);
    try { this.storage?.setItem(HISTORY_KEY, JSON.stringify(this.seen)); } catch { /* 仍保留内存记录 */ }
    return stage;
  }
}
