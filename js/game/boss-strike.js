import { CONFIG } from '../config.js';
import { audio } from '../engine/audio.js';

export const BOSS_WINDUP = 2;
const FIRST_CAST_DELAY = 1.5;
const CAST_COOLDOWN = 9;
const IMPACT_DAMAGE = 30;
const EMBER = {name: '首领冲击', bright: '#ffab76', ink: '#572b31', wash: 'rgba(255,121,71,.21)'};
const TIDE = {name: '潮纹冲击', bright: '#9cfff0', ink: '#174855', wash: 'rgba(75,218,210,.22)'};

export function bossStrikeTheme(stageId) {
  return stageId === 'tide' ? TIDE : EMBER;
}

/** 一名首领持有一个施法时钟。锁定实体，这样出售后在原格新建的守卫不会继承标记。 */
export class BossStrike {
  constructor(boss, stageId) {
    this.boss = boss;
    this.theme = bossStrikeTheme(stageId);
    this.cooldown = FIRST_CAST_DELAY;
    this.remaining = 0;
    this.targets = [];
  }

  interrupt() {
    if (!this.targets.length) return false;
    this.targets = [];
    this.remaining = 0;
    this.cooldown = CAST_COOLDOWN;
    return true;
  }

  /** 返回 true 表示这一帧正在蓄力、释放或冰冻，暂停首领的移动和普通射击。 */
  advance(dt, guards, effects, frozen) {
    if (frozen) {
      this.interrupt();
      return true;
    }
    if (this.targets.length) {
      const live = this.targets.filter(guard => guard.alive && guards.includes(guard));
      if (!live.length) {
        this.interrupt();
        return false;
      }
      this.targets = live;
      this.remaining -= dt;
      if (this.remaining > 1e-8) return true;
      for (const guard of live) {
        const damage = guard.takeDamage(IMPACT_DAMAGE);
        if (!guard.alive) guard.killedBy = this.boss;
        effects?.spawnDamage(guard.x, guard.y - 10, damage, this.theme.bright);
        effects?.spawnBlast(guard.x, guard.y, CONFIG.CELL_SIZE * .59, this.theme.bright);
      }
      audio.play('hit_magic', {throttle: 100});
      this.interrupt();
      return true;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 1e-8 || !guards.length) return false;
    const distance = guard => Math.hypot(guard.x - this.boss.x, guard.y - this.boss.y);
    this.targets = guards.filter(guard => guard.alive).sort((a, b) => distance(a) - distance(b)).slice(0, 2);
    if (!this.targets.length) return false;
    this.remaining = BOSS_WINDUP;
    return true;
  }
}
