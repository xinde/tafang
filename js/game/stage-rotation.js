const HISTORY_KEY = 'emberwatch.stage-history';
const SCOPE_KEY = 'emberwatch.random-scope';
const LAST_STAGE_KEY = 'emberwatch.last-stage';

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}

function read(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* 本页仍按内存中的记录抽签。 */ }
}

function knownIds(list, stages) {
  if (!Array.isArray(list)) return [];
  const ids = new Set(stages.map(stage => stage.id));
  return [...new Set(list.filter(id => ids.has(id)))];
}

function remember(list, id) {
  const index = list.indexOf(id);
  if (index !== -1) list.splice(index, 1);
  list.push(id);
}

/** 全池与各难度分别记轮次，手选/重试也会记作已访问。 */
export class StageRotation {
  static forBrowser(stages) {
    return new StageRotation(stages, browserStorage('sessionStorage'), Math.random, browserStorage('localStorage'));
  }

  constructor(stages, storage, random = Math.random, preferences = null) {
    if (!stages.length) throw new Error('战役至少需要一张地图');
    this.stages = stages;
    this.storage = storage;
    this.preferences = preferences;
    this.random = random;
    this.scope = read(preferences, SCOPE_KEY) === 'same' ? 'same' : 'all';

    let saved;
    try { saved = JSON.parse(read(storage, HISTORY_KEY)); } catch { /* 忽略损坏的旧记录。 */ }
    // 旧版只保存全池 ID 数组。迁移时也据此恢复各难度已访问的地图。
    this.seen = knownIds(Array.isArray(saved) ? saved : saved?.all, stages);
    this.tiers = new Map();
    for (const tier of new Set(stages.map(stage => stage.difficulty))) {
      const group = stages.filter(stage => stage.difficulty === tier);
      this.tiers.set(tier, knownIds(saved?.tiers?.[tier] ?? this.seen, group));
    }
    this.lastId = this.seen[this.seen.length - 1] || read(preferences, LAST_STAGE_KEY);
    this.isFirstVisit = !this.lastId && read(preferences, 'tafang_muted') === null &&
      read(preferences, 'emberwatch.music') === null && !stages.some(stage => read(preferences, 'emberwatch.rank.' + stage.id));
  }

  setScope(scope) {
    if (scope !== 'all' && scope !== 'same') return;
    this.scope = scope;
    write(this.preferences, SCOPE_KEY, scope);
  }

  select(requestedId) {
    let stage = this.stages.find(entry => entry.id === requestedId);
    if (!stage) {
      const previous = this.stages.find(entry => entry.id === this.lastId);
      const tier = this.isFirstVisit ? '初阵' : this.scope === 'same' ? previous?.difficulty : undefined;
      const restricted = tier !== undefined && this.tiers.has(tier);
      const pool = restricted ? this.stages.filter(entry => entry.difficulty === tier) : this.stages;
      const seen = restricted ? this.tiers.get(tier) : this.seen;
      let available = pool.filter(entry => !seen.includes(entry.id));
      if (available.length === 0) {
        seen.length = 0;
        available = pool;
      }
      // 包括换轮或打开新标签页后的第一次随机。单图池允许重复。
      const others = available.filter(entry => entry.id !== this.lastId);
      const choices = others.length ? others : available;
      stage = choices[Math.floor(this.random() * choices.length)];
    }
    remember(this.seen, stage.id);
    remember(this.tiers.get(stage.difficulty), stage.id);
    this.lastId = stage.id;
    this.isFirstVisit = false;
    write(this.storage, HISTORY_KEY, JSON.stringify({all: this.seen, tiers: Object.fromEntries(this.tiers)}));
    write(this.preferences, LAST_STAGE_KEY, stage.id);
    return stage;
  }
}
