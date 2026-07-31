/**
 * EffectManager：战斗可视化特效。
 * - 飘字伤害数字
 * - 炮击溅射冲击环
 * - 近战斩击弧光
 * - 怪兽死亡爆裂
 * 所有特效都是短生命周期纯视觉对象，update 推进、过期清除。
 * 绘制由 main 渲染循环调用 draw(renderer) 完成（复用 renderer 图元）。
 */
export class EffectManager {
  constructor() {
    /** @type {Array<object>} */
    this.effects = [];
  }

  /** 飘起的伤害数字 */
  spawnDamage(x, y, amount, color = '#ffd24a') {
    this.effects.push({
      kind: 'damage', x, y, amount: Math.round(amount), color,
      life: 0.7, maxLife: 0.7, vy: -34,
    });
  }

  /** 回血飘字（击杀者生命窃取），颜色绿、前缀 + */
  spawnHeal(x, y, amount) {
    this.effects.push({
      kind: 'heal', x, y, amount: Math.round(amount), color: '#58d968',
      life: 0.7, maxLife: 0.7, vy: -34,
    });
  }

  /** 炮击溅射冲击环 */
  spawnBlast(x, y, radius, color = '#e07b3a') {
    this.effects.push({
      kind: 'blast', x, y, radius, color,
      life: 0.28, maxLife: 0.28,
    });
  }

  /** 近战斩击弧光（从士兵朝目标方向的一小段弧） */
  spawnSlash(x, y, angle, color = '#e8d24a') {
    this.effects.push({
      kind: 'slash', x, y, angle, color,
      life: 0.16, maxLife: 0.16,
    });
  }

  /** 怪兽死亡爆裂 */
  spawnDeath(x, y, color = '#e05555') {
    this.effects.push({
      kind: 'death', x, y, color,
      life: 0.4, maxLife: 0.4,
    });
  }

  update(dt) {
    for (const e of this.effects) {
      e.life -= dt;
      if (e.kind === 'damage') e.y += e.vy * dt;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
  }

  /** 用 renderer 图元绘制所有特效 */
  draw(renderer) {
    const ctx = renderer.ctx;
    for (const e of this.effects) {
      const t = Math.max(0, e.life / e.maxLife); // 1 -> 0
      ctx.save();
      ctx.globalAlpha = t;
      if (e.kind === 'damage') {
        ctx.fillStyle = e.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`-${e.amount}`, e.x, e.y);
      } else if (e.kind === 'heal') {
        ctx.fillStyle = e.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${e.amount}`, e.x, e.y);
      } else if (e.kind === 'blast') {
        const r = e.radius * (1 - t * 0.4);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'slash') {
        const r = 22;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, e.angle - 0.7, e.angle + 0.7);
        ctx.stroke();
      } else if (e.kind === 'death') {
        const r = 6 + (1 - t) * 18;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
