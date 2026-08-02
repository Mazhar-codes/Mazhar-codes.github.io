// =====================================================================
// boss.js — Multi-phase boss. Enters from the top, sways, and cycles
// attack patterns (spread / aimed / spiral) that intensify as its HP
// drops. Fires enemy bullets via g.spawnBullet({owner:'enemy'}). On
// death it hands off to g.onBossKilled() for rewards + bonus round.
// =====================================================================
import { TAU, clamp, angleTo } from './core.js';
import { drawBossShip } from './render.js';

const DOWN = Math.PI / 2; // +Y screen (downward)

export class Boss {
  constructor(g, def, index) {
    this.g = g; this.def = def;
    this.maxHp = def.baseHp * (1 + index * 0.5);
    this.hp = this.maxHp;
    this.radius = def.radius; this.color = def.color; this.accent = def.accent;
    this.coins = def.coins; this.phases = def.phases; this.contactDamage = 34;
    this.x = g.width / 2; this.y = -def.radius; this.t = 0; this.flash = 0;
    this.mode = 'enter'; this.targetY = Math.min(150, g.height * 0.22);
    this.fireTimer = 0.8; this.spiral = 0; this.alive = true;
    this.baseX = g.width / 2; this.swayT = 0;
  }
  phaseIndex() {
    const frac = 1 - this.hp / this.maxHp;
    return clamp(Math.floor(frac * this.phases.length), 0, this.phases.length - 1);
  }
  update(dt, g) {
    this.t += dt; if (this.flash > 0) this.flash -= dt;
    if (this.mode === 'enter') {
      this.y += 90 * dt;
      if (this.y >= this.targetY) { this.y = this.targetY; this.mode = 'fight'; }
      return;
    }
    // Sway side to side across the top.
    this.swayT += dt;
    this.x = g.width / 2 + Math.sin(this.swayT * 0.7) * Math.min(260, g.width * 0.3);

    const ph = this.phases[this.phaseIndex()];
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) { this.fireTimer = ph.fireEvery; this._fire(ph, g); }
  }
  _bullet(angle, speed, g) {
    g.spawnBullet({
      x: this.x + Math.cos(angle) * this.radius * 0.6,
      y: this.y + Math.sin(angle) * this.radius * 0.6,
      angle, speed, damage: 14, radius: 6, color: this.accent, owner: 'enemy', life: 6,
    });
  }
  _fire(ph, g) {
    const p = g.player;
    if (ph.attack === 'spread') {
      const arc = 1.1, half = (ph.count - 1) / 2;
      for (let i = 0; i < ph.count; i++) this._bullet(DOWN + (i / Math.max(1, ph.count - 1) - 0.5) * 2 * arc, ph.bulletSpeed, g);
      g.audio.laser();
    } else if (ph.attack === 'aimed') {
      const base = p && p.alive ? angleTo(this.x, this.y, p.x, p.y) : DOWN;
      const half = (ph.count - 1) / 2;
      for (let i = 0; i < ph.count; i++) this._bullet(base + (i - half) * 0.12, ph.bulletSpeed, g);
      g.audio.shoot();
    } else { // spiral
      this.spiral += 0.4;
      for (let i = 0; i < ph.count; i++) this._bullet(this.spiral + (i / ph.count) * TAU, ph.bulletSpeed, g);
    }
  }
  hurt(dmg, g) {
    if (this.mode === 'enter') return;
    this.hp -= dmg; this.flash = 0.06;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; g.onBossKilled(this); }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    drawBossShip(ctx, this.def.id, this.radius, this.color, this.accent, this.flash > 0, this.t);
    ctx.restore();
    // Aura ring while fighting.
    if (this.mode === 'fight') {
      ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(this.t * 3) * 0.1;
      ctx.strokeStyle = this.accent; ctx.lineWidth = 2; ctx.shadowBlur = 14; ctx.shadowColor = this.accent;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 14, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
}
