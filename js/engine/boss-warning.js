import { BOSS_WINDUP, bossStrikeTheme } from '../game/boss-strike.js';

/** 预警只跟随模拟时钟。暂停时，石台上的读秒和收拢圆环会一起定格。 */
export function drawBossWarnings(renderer, waves, stage) {
  const warnings = waves.bossWarnings;
  if (!warnings.length) return;
  const {ctx, cellSize} = renderer;
  const tidal = stage.id === 'tide';
  const theme = bossStrikeTheme(stage.id);
  const marked = new Map();
  ctx.save();
  for (const {boss, targets, remaining} of warnings) {
    const y = boss.y - cellSize * .72;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(boss.x - 9, y - 8, 18, 13);
    ctx.fillStyle = theme.bright;
    ctx.fillRect(boss.x - 2, y - 6, 4, 5);
    ctx.fillRect(boss.x - 2, y + 1, 4, 2);
    // 同一石台被双首领锁定时只画一次，显示先抵达的那次冲击。
    for (const guard of targets) {
      if (guard.alive) marked.set(guard, Math.min(marked.get(guard) ?? remaining, remaining));
    }
  }
  for (const [guard, remaining] of marked) {
    const x = guard.x, y = guard.y + cellSize * .1;
    const fraction = Math.max(0, Math.min(1, remaining / BOSS_WINDUP));
    const radius = cellSize * (.34 + fraction * .15);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = theme.wash;
    ctx.fill();
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = theme.bright;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tidal) {
      ctx.beginPath();
      ctx.arc(x, y, radius * .78, .14, Math.PI - .14);
      ctx.stroke();
    }
    const labelY = guard.y + cellSize * .32;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(x - 10, labelY - 6, 20, 18);
    ctx.fillStyle = theme.bright;
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.ceil(remaining)), x, labelY + 3);
  }
  ctx.restore();
}
