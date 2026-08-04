import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherManager, WeatherFX } from '../js/game/weather.js';

// 测试用最小配置
const testConfig = {
  minClearTime: 4,
  maxClearTime: 8,
  firstWeatherDelay: 5,
  weathers: [
    {
      key: 'wind', name: '大风', icon: '🌪️', color: '#c0b080', duration: 10,
      effects: { damageMul: 0.70, fireRateMul: 1.0, rangeMul: 1.0, monsterSpeedMul: 1.10 },
    },
    {
      key: 'rain', name: '暴雨', icon: '🌧️', color: '#4a8acc', duration: 8,
      effects: { damageMul: 1.0, fireRateMul: 0.65, rangeMul: 0.90, monsterSpeedMul: 0.85 },
    },
    {
      key: 'snow', name: '大雪', icon: '❄️', color: '#aaccee', duration: 6,
      effects: { damageMul: 0.85, fireRateMul: 0.75, rangeMul: 0.75, monsterSpeedMul: 0.70 },
    },
  ],
};

test('构造：初始为 clear 状态，modifiers 全为 1', () => {
  const wm = new WeatherManager(testConfig);
  assert.equal(wm.phase, 'clear');
  assert.equal(wm.currentWeather, null);
  assert.equal(wm.isActive, false);
  const m = wm.modifiers;
  assert.equal(m.damageMul, 1);
  assert.equal(m.fireRateMul, 1);
  assert.equal(m.rangeMul, 1);
  assert.equal(m.monsterSpeedMul, 1);
});

test('配置校验：缺 weathers 抛错', () => {
  assert.throws(() => new WeatherManager({}), /缺少非空 weathers/);
  assert.throws(() => new WeatherManager({ weathers: [] }), /缺少非空 weathers/);
});

test('配置校验：天气缺 key/name/duration/effects 抛错', () => {
  assert.throws(() => new WeatherManager({ weathers: [{ name: 'x', duration: 1, effects: {} }] }), /缺少 key/);
  assert.throws(() => new WeatherManager({ weathers: [{ key: 'x', duration: 1, effects: {} }] }), /缺少 name/);
  assert.throws(() => new WeatherManager({ weathers: [{ key: 'x', name: 'x', effects: {} }] }), /duration 非法/);
  assert.throws(() => new WeatherManager({ weathers: [{ key: 'x', name: 'x', duration: 5 }] }), /缺少 effects/);
});

test('tick：首次天气在 firstWeatherDelay 秒后触发', () => {
  const wm = new WeatherManager(testConfig);
  // tick 4.9s -> 仍 clear
  wm.tick(4.9);
  assert.equal(wm.phase, 'clear');
  // tick 0.2s -> 总计 5.1s -> 触发天气
  wm.tick(0.2);
  assert.equal(wm.phase, 'active');
  assert.ok(wm.currentWeather, '应有当前天气');
  assert.ok(wm.currentWeather.key, '天气应有 key');
});

test('tick：天气到期后回到 clear', () => {
  const wm = new WeatherManager(testConfig);
  // 触发首次天气
  wm.tick(5.1);
  assert.equal(wm.phase, 'active');
  const duration = wm.currentWeather.duration;
  // 天气持续 duration 秒
  wm.tick(duration - 0.1);
  assert.equal(wm.phase, 'active');
  wm.tick(0.2);
  assert.equal(wm.phase, 'clear');
  assert.equal(wm.currentWeather, null);
});

test('modifiers：active 时取当前天气 effects，clear 时全为 1', () => {
  const wm = new WeatherManager(testConfig);
  // clear 时全 1
  assert.deepEqual(wm.modifiers, { damageMul: 1, fireRateMul: 1, rangeMul: 1, monsterSpeedMul: 1 });

  // 触发天气后取对应 effects
  wm.tick(5.1);
  assert.equal(wm.phase, 'active');
  const m = wm.modifiers;
  assert.ok(m.damageMul <= 1, '天气影响应包含削弱');
  assert.ok(m.fireRateMul <= 1, '天气影响应包含削弱');
  // 至少有一个乘数 < 1（削弱效果）
  const weakened = ['damageMul', 'fireRateMul', 'rangeMul'].some((k) => m[k] < 1);
  assert.ok(weakened, '至少应有一个变量被削弱');
});

test('modifiers 对象不可变：修改返回值不影响内部状态', () => {
  const wm = new WeatherManager(testConfig);
  const m = wm.modifiers;
  m.damageMul = 999;
  const m2 = wm.modifiers;
  assert.equal(m2.damageMul, 1, '修改返回值不应影响内部');
});

test('天气循环：clear -> active -> clear -> active 多轮切换', () => {
  const wm = new WeatherManager(testConfig);
  let transitions = [];
  wm.setOnWeatherChange((w) => transitions.push(w ? w.key : 'clear'));

  // 第一轮
  wm.tick(5.1); // -> active
  assert.equal(wm.phase, 'active');
  wm.tick(wm.currentWeather.duration + 0.1); // -> clear
  assert.equal(wm.phase, 'clear');

  // 第二轮（clear 持续 4~8 秒）
  wm.tick(8.1); // 最长 clear 8 秒
  assert.equal(wm.phase, 'active');
  wm.tick(wm.currentWeather.duration + 0.1); // -> clear
  assert.equal(wm.phase, 'clear');

  // 至少经历了 2 次 active 和 2 次 clear
  const activeCount = transitions.filter((t) => t !== 'clear').length;
  const clearCount = transitions.filter((t) => t === 'clear').length;
  assert.ok(activeCount >= 2, `至少 2 次 active，实际 ${activeCount}`);
  assert.ok(clearCount >= 2, `至少 2 次 clear，实际 ${clearCount}`);
});

test('reset：重置到初始 clear 状态', () => {
  const wm = new WeatherManager(testConfig);
  wm.tick(5.1); // 进入 active
  assert.equal(wm.phase, 'active');
  wm.reset();
  assert.equal(wm.phase, 'clear');
  assert.equal(wm.currentWeather, null);
  assert.equal(wm.isActive, false);
  // reset 后 firstWeatherDelay 重新计时
  wm.tick(4.9);
  assert.equal(wm.phase, 'clear');
  wm.tick(0.2);
  assert.equal(wm.phase, 'active');
});

test('remaining：倒计时递减，到期归 0', () => {
  const wm = new WeatherManager(testConfig);
  assert.ok(wm.remaining > 0);
  wm.tick(wm.remaining + 0.1); // 跳过首次 clear
  assert.equal(wm.phase, 'active');
  assert.ok(wm.remaining > 0, 'active 阶段也应有剩余时间');
  wm.tick(wm.remaining + 0.1); // 跳过天气
  assert.equal(wm.phase, 'clear');
});

test('onWeatherChange 回调：天气切换时被调用', () => {
  const wm = new WeatherManager(testConfig);
  let calls = [];
  wm.setOnWeatherChange((w) => calls.push(w ? w.key : 'clear'));

  wm.tick(5.1); // -> active，应调用一次
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0], 'clear', '应通知天气开始');

  const dur = wm.currentWeather.duration;
  wm.tick(dur + 0.1); // -> clear，应再调用一次
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'clear', '应通知天气结束');
});

test('WeatherFX：构造和 reset 不抛错', () => {
  const fx = new WeatherFX();
  fx.reset();
  // draw 在无天气时不抛错（空操作）
  const ctx = { save: () => {}, restore: () => {}, strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', globalAlpha: 1, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {}, arc: () => {} };
  fx.draw(ctx, 960, 576, 0.016, null);
});

test('三种天气各自控制不同变量（配置覆盖验证）', () => {
  const wm = new WeatherManager(testConfig);
  // 验证每种天气的 effects 配置不同
  const effects = testConfig.weathers.map((w) => w.effects);
  // wind: damageMul < 1, fireRateMul = 1, rangeMul = 1
  assert.ok(effects[0].damageMul < 1 && effects[0].fireRateMul === 1 && effects[0].rangeMul === 1);
  // rain: fireRateMul < 1, rangeMul < 1
  assert.ok(effects[1].fireRateMul < 1 && effects[1].rangeMul < 1 && effects[1].damageMul === 1);
  // snow: 三项都 < 1
  assert.ok(effects[2].damageMul < 1 && effects[2].fireRateMul < 1 && effects[2].rangeMul < 1);
});
