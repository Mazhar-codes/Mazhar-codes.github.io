// =====================================================================
// entities.js — Game objects. Pooled types expose {alive, update, draw}.
// The player is a singleton. Second arg to update() is the Game (`g`)
// so entities can spawn bullets/particles and read shared state.
// =====================================================================
import { CONFIG } from './config.js';
import { TAU, clamp, rand, dist2, angleTo } from './core.js';
import { drawPlayerShip, drawEnemyShip } from './render.js';

// ------------------------- Star (parallax depth) --------------------
export class Star {
  constructor() { this.reset(); }
  reset(w = 1280, h = 720, layer = 0) {
    const L = CONFIG.starLayers[layer] || CONFIG.starLayers[0];
    this.x = rand(0, w); this.y = rand(0, h);
    this.speed = L.speed; this.size = L.size; this.alpha = L.alpha;
    this.tw = rand(0, TAU); this.twSpeed = rand(1.5, 3.5); // twinkle phase
    this.alive = true;
  }
  update(dt, g) {
    this.y += this.speed * dt;
    this.tw += this.twSpeed * dt;
    if (this.y > g.height + 4) { this.y = -4; this.x = rand(0, g.width); }
  }
  draw(ctx) {
    ctx.globalAlpha = this.alpha * (0.7 + 0.3 * Math.sin(this.tw));
    ctx.fillStyle = '#cfefff';
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ------------------------- Particle ---------------------------------
export class Particle {
  constructor() { this.alive = false; }
  init(x, y, vx, vy, life, color, size, glow = false) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
    this.glow = glow; this.alive = true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= (1 - 2.5 * dt); this.vy *= (1 - 2.5 * dt);
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    const s = this.size * t;
    if (this.glow) {
      // Additive round spark — reads as hot, glowing debris.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t;
      ctx.shadowBlur = 8; ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, s * 0.7 + 0.5, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = t;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

// ------------------------- Bullet -----------------------------------
export class Bullet {
  constructor() { this.alive = false; }
  init(o) {
    this.x = o.x; this.y = o.y;
    this.vx = Math.cos(o.angle) * o.speed;
    this.vy = Math.sin(o.angle) * o.speed;
    this.damage = o.damage; this.radius = o.radius || 4;
    this.color = o.color; this.owner = o.owner; // 'player' | 'enemy'
    this.pierce = o.pierce || 0;   // remaining enemies a shot can pass through
    this.life = o.life || 2.2; this.alive = true;
  }
  update(dt, g) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.life <= 0 || this.x < -20 || this.x > g.width + 20 || this.y < -20 || this.y > g.height + 20)
      this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ------------------------- Missile (homing) -------------------------
export class Missile {
  constructor() { this.alive = false; }
  init(o) {
    this.x = o.x; this.y = o.y; this.angle = o.angle;
    this.speed = 480; this.damage = o.damage; this.turn = o.turn;
    this.color = o.color; this.radius = 6; this.life = 3.5;
    this.splash = o.splash || 0;   // AoE blast radius on impact (rockets)
    this.owner = 'player'; this.target = null; this.alive = true;
  }
  update(dt, g) {
    this.life -= dt;
    if (this.life <= 0) { g.burst(this.x, this.y, this.color, 8); this.alive = false; return; }
    // Re-acquire nearest living enemy.
    if (!this.target || !this.target.alive) this.target = g.nearestEnemy(this.x, this.y);
    if (this.target) {
      const desired = angleTo(this.x, this.y, this.target.x, this.target.y);
      let diff = ((desired - this.angle + Math.PI * 3) % TAU) - Math.PI;
      this.angle += clamp(diff, -this.turn * dt, this.turn * dt);
    }
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    // Smoke trail.
    if (Math.random() < 0.6) g.spawnParticle(this.x, this.y, rand(-20, 20), rand(-20, 20), 0.4, '#ffb37a', 4);
    if (this.x < -30 || this.x > g.width + 30 || this.y < -30 || this.y > g.height + 30) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.angle);
    ctx.shadowBlur = 14; ctx.shadowColor = this.color; ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ------------------------- Coin pickup ------------------------------
export class Coin {
  constructor() { this.alive = false; }
  init(x, y, value) {
    this.x = x; this.y = y; this.vx = rand(-40, 40); this.vy = rand(-30, 20);
    this.value = value; this.radius = 9; this.life = 12; this.alive = true;
  }
  update(dt, g) {
    this.life -= dt;
    const p = g.player;
    // Magnet: drift toward player when within range.
    if (p && p.alive) {
      const d2 = dist2(this.x, this.y, p.x, p.y);
      const range = p.stats.magnetRange + (p.buffs.magnet > 0 ? 260 : 0);
      if (d2 < range * range) {
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.vx += Math.cos(a) * 900 * dt; this.vy += Math.sin(a) * 900 * dt;
      }
      if (d2 < (p.stats.hitRadius + this.radius) ** 2) {
        g.collectCoin(this.value); this.alive = false; return;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= (1 - 1.5 * dt); this.vy *= (1 - 1.5 * dt);
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 10; ctx.shadowColor = '#ffd24d'; ctx.fillStyle = '#ffd24d';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a5a00'; ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', this.x, this.y + 0.5);
    ctx.restore();
  }
}

// ------------------------- PowerUp pickup ---------------------------
export class PowerUp {
  constructor() { this.alive = false; }
  init(x, y, def) {
    this.x = x; this.y = y; this.vy = 60; this.def = def;
    this.radius = 15; this.life = 11; this.t = rand(0, TAU); this.alive = true;
  }
  update(dt, g) {
    this.life -= dt; this.t += dt;
    this.y += this.vy * dt;
    const p = g.player;
    if (p && p.alive) {
      const d2 = dist2(this.x, this.y, p.x, p.y);
      const range = p.stats.magnetRange + 80 + (p.buffs.magnet > 0 ? 260 : 0);
      if (d2 < range * range) {
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.x += Math.cos(a) * 520 * dt; this.y += Math.sin(a) * 520 * dt;
      }
      if (d2 < (p.stats.hitRadius + this.radius) ** 2) { g.applyPowerup(this.def); this.alive = false; return; }
    }
    if (this.life <= 0 || this.y > g.height + 30) this.alive = false;
  }
  draw(ctx) {
    const d = this.def, bob = Math.sin(this.t * 3) * 2;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.shadowBlur = 16; ctx.shadowColor = d.color;
    ctx.fillStyle = 'rgba(8,12,26,0.9)'; ctx.strokeStyle = d.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = d.color; ctx.font = '15px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.icon, 0, 1);
    ctx.restore();
  }
}

// ------------------------- Enemy ------------------------------------
export class Enemy {
  constructor() { this.alive = false; }
  init(def, x, wave, g) {
    const d = CONFIG.difficulty;
    this.type = def.id;
    this.x = x; this.y = -30;
    this.maxHp = def.hp * (1 + d.enemyHpPerWave * wave);
    this.hp = this.maxHp;
    this.speed = def.speed * (1 + d.enemySpeedPerWave * wave);
    this.radius = def.radius; this.color = def.color;
    this.damage = def.damage * (1 + d.enemyDamagePerWave * wave);
    this.coins = def.coins; this.score = def.score; this.pattern = def.pattern;
    this.baseX = x; this.t = rand(0, TAU); this.alive = true; this.flash = 0;
    // Ranged behaviour (optional).
    this.fireEvery = def.fireEvery || 0;
    this.bulletSpeed = def.bulletSpeed || 0;
    this.bulletDamage = def.bulletDamage || 0;
    this.burst = def.burst || 1;
    this.fireTimer = rand(0.8, 1.8);
    this.hoverY = rand(90, 220);   // strafers settle into this band
  }
  update(dt, g) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    switch (this.pattern) {
      case 'sine':
        this.y += this.speed * dt;
        this.x = this.baseX + Math.sin(this.t * 2) * 70;
        break;
      case 'diver':
        this.y += this.speed * dt;
        this.x += Math.sin(this.t * 5) * 40 * dt * this.speed * 0.02;
        break;
      case 'chase': {
        const p = g.player;
        this.y += this.speed * 0.6 * dt;
        if (p && p.alive) {
          const a = angleTo(this.x, this.y, p.x, p.y);
          this.x += Math.cos(a) * this.speed * dt;
          this.y += Math.max(0, Math.sin(a)) * this.speed * dt;
        }
        break;
      }
      case 'strafe':
        // Descend into a hover band, then slide side-to-side and snipe.
        if (this.y < this.hoverY) this.y += this.speed * dt;
        else this.x = this.baseX + Math.sin(this.t * 1.4) * Math.min(160, g.width * 0.2);
        break;
    }
    // Aimed fire (gunner-style enemies).
    if (this.fireEvery && this.y > 8) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireEvery * rand(0.8, 1.2);
        this._shoot(g);
      }
    }
    this.x = clamp(this.x, this.radius, g.width - this.radius);
    if (this.y > g.height + 40) { this.alive = false; g.onEnemyLeaked(this); }
  }
  _shoot(g) {
    const p = g.player;
    if (!p || !p.alive) return;
    const base = angleTo(this.x, this.y, p.x, p.y);
    const half = (this.burst - 1) / 2;
    for (let i = 0; i < this.burst; i++) {
      g.spawnBullet({
        x: this.x, y: this.y, angle: base + (i - half) * 0.18,
        speed: this.bulletSpeed, damage: this.bulletDamage, radius: 5,
        color: this.color, owner: 'enemy', life: 5,
      });
    }
    g.audio.shoot();
    g.muzzleFlash(this.x, this.y, this.color, 0.6);
  }
  hurt(dmg, g) {
    this.hp -= dmg; this.flash = 0.08;
    if (this.hp <= 0) { this.alive = false; g.onEnemyKilled(this); }
    else g.audio.hit();
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    drawEnemyShip(ctx, this.type, this.radius, this.color, this.flash > 0, this.t);
    ctx.restore();
    // HP bar when damaged.
    if (this.hp < this.maxHp) {
      const w = this.radius * 2, hpc = this.hp / this.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(this.x - w / 2, this.y - this.radius - 8, w, 3);
      ctx.fillStyle = hpc > 0.5 ? '#6bff8c' : hpc > 0.25 ? '#ffd24d' : '#ff5d5d';
      ctx.fillRect(this.x - w / 2, this.y - this.radius - 8, w * hpc, 3);
    }
  }
}

// ------------------------- Player -----------------------------------
export class Player {
  constructor(g) {
    this.g = g;
    this.x = g.width / 2; this.y = g.height * 0.75;
    this.vx = 0; this.vy = 0; this.angle = -Math.PI / 2;
    this.fireCd = 0; this.missileCd = 0; this.trail = 0; this.thrusting = false;
    this.buffs = { rapid: 0, spread: 0, magnet: 0 }; // timed power-up seconds left
    this.alive = true; this.invuln = CONFIG.player.invulnOnSpawn;
    this.hitRadius = CONFIG.player.hitRadius;
    this.stats = null; // set by Game via applyLoadout()
  }
  respawn() {
    this.x = this.g.width / 2; this.y = this.g.height * 0.75;
    this.vx = this.vy = 0; this.alive = true;
    this.invuln = CONFIG.player.invulnOnSpawn;
    this.hp = this.stats.maxHp; this.shield = this.stats.shieldMax;
  }
  update(dt, g) {
    const inp = g.input;
    const P = CONFIG.player;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.missileCd > 0) this.missileCd -= dt;
    for (const k in this.buffs) if (this.buffs[k] > 0) this.buffs[k] -= dt;

    // ---- Movement intent ----
    let ax = 0, ay = 0;
    if (inp.pointer.active) {
      // Touch: ship eases toward finger (deadzone to avoid jitter).
      const dx = inp.pointer.x - this.x, dy = inp.pointer.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) { ax = dx / d; ay = dy / d; }
    } else {
      const a = inp.moveAxis(); ax = a.x; ay = a.y;
    }
    const accel = P.accel * this.stats.speedMult;
    this.vx += ax * accel * dt; this.vy += ay * accel * dt;
    // Drag.
    this.vx -= this.vx * P.drag * dt; this.vy -= this.vy * P.drag * dt;
    // Clamp speed.
    const sp = Math.hypot(this.vx, this.vy);
    const maxSp = P.maxSpeed * this.stats.speedMult;
    if (sp > maxSp) { this.vx = this.vx / sp * maxSp; this.vy = this.vy / sp * maxSp; }
    this.x = clamp(this.x + this.vx * dt, this.hitRadius, g.width - this.hitRadius);
    this.y = clamp(this.y + this.vy * dt, this.hitRadius, g.height - this.hitRadius);

    // ---- Aim ----
    if (inp.usePointerAim && !inp.pointer.active) {
      this.angle = angleTo(this.x, this.y, inp.pointer.x, inp.pointer.y); // mouse aim
    } else {
      const e = g.nearestEnemy(this.x, this.y, 640);
      this.angle = e ? angleTo(this.x, this.y, e.x, e.y) : -Math.PI / 2; // auto-aim / up
    }

    // ---- Fire primary ----
    if (inp.fire && this.fireCd <= 0) this._firePrimary(g);
    // ---- Fire secondary (missiles) ----
    if (inp.secondary && this.missileCd <= 0) this._fireMissile(g);

    // Thrust particles.
    this.thrusting = !!(ax || ay);
    this.trail -= dt;
    if ((ax || ay) && this.trail <= 0) {
      this.trail = 0.02;
      const back = this.angle + Math.PI;
      g.spawnParticle(this.x + Math.cos(back) * 14, this.y + Math.sin(back) * 14,
        Math.cos(back) * 120 + rand(-30, 30), Math.sin(back) * 120 + rand(-30, 30),
        0.35, this.stats.trail, 5);
    }
  }
  _firePrimary(g) {
    const w = this.stats.weapon;
    const rapid = this.buffs.rapid > 0 ? 1.8 : 1;      // Overdrive power-up
    const scatter = this.buffs.spread > 0;             // Scatter power-up
    this.fireCd = 1 / (w.fireRate * this.stats.fireMult * rapid);
    const dmg = w.damage * this.stats.damageMult;
    const muzzleX = this.x + Math.cos(this.angle) * 20;
    const muzzleY = this.y + Math.sin(this.angle) * 20;
    const bulletRadius = w.kind === 'rail' ? 7 : w.id === 'pulse' ? 3 : 4;
    const shoot = (ang, ox = 0, oy = 0) => g.spawnBullet({
      x: muzzleX + ox, y: muzzleY + oy, angle: ang, speed: w.speed,
      damage: dmg, radius: bulletRadius, color: w.color, owner: 'player',
      pierce: w.pierce || 0,
    });
    if (w.kind === 'spread' || w.kind === 'wave') {
      const n = w.pellets, half = (n - 1) / 2;
      for (let i = 0; i < n; i++) shoot(this.angle + (i - half) * w.spread);
    } else if (w.kind === 'twin') {
      const perp = this.angle + Math.PI / 2;
      shoot(this.angle, Math.cos(perp) * 8, Math.sin(perp) * 8);
      shoot(this.angle, -Math.cos(perp) * 8, -Math.sin(perp) * 8);
    } else if (w.kind === 'rail') {
      shoot(this.angle);
      // Rail leaves a bright recoil flash + kick.
      g.muzzleFlash(muzzleX, muzzleY, w.color, 1.6); g.shake(3);
    } else {
      shoot(this.angle);
    }
    // Scatter power-up: bonus wide pellets on top of the base weapon.
    if (scatter) { shoot(this.angle + 0.5); shoot(this.angle - 0.5); }
    // Per-weapon firing sound + muzzle flash.
    g.audio.weapon(w);
    g.muzzleFlash(muzzleX, muzzleY, w.color, 0.8);
  }
  _fireMissile(g) {
    const m = this.stats.missile;
    if (!m || m.id === 'none' || g.missileAmmo <= 0) return;
    this.missileCd = 0.4;
    const count = m.count || 1;
    for (let i = 0; i < count && g.missileAmmo > 0; i++) {
      g.missileAmmo--;
      g.spawnMissile({
        x: this.x, y: this.y,
        angle: this.angle + rand(-0.3, 0.3),
        damage: m.damage, turn: m.turn, color: m.color, splash: m.splash || 0,
      });
    }
    g.audio.missile();
    g.events.emit('missileFired', g.missileAmmo);
  }
  takeHit(dmg, g) {
    if (this.invuln > 0 || !this.alive) return;
    if (this.shield > 0) {
      this.shield--; this.invuln = 0.8; g.audio.hit();
      g.burst(this.x, this.y, '#7df9ff', 14);
      g.events.emit('shieldChanged', this.shield);
      return;
    }
    this.hp -= dmg; this.invuln = 0.6; g.audio.hurt();
    g.shake(10); g.burst(this.x, this.y, '#ff5d5d', 12);
    g.events.emit('hpChanged', { hp: this.hp, max: this.stats.maxHp });
    if (this.hp <= 0) { this.alive = false; g.onPlayerDead(); }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Blink during i-frames.
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    drawPlayerShip(ctx, this.stats.shipId, this.stats.color, this.stats.trail,
      performance.now() / 1000, this.thrusting, this.angle);
    ctx.restore();
    // Shield ring.
    if (this.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 2;
      ctx.shadowBlur = 10; ctx.shadowColor = '#7df9ff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hitRadius + 10, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

// ------------------------- Floater (rising score/combo text) --------
// Lightweight, non-pooled screen-space popups for kill scores & events.
export class Floater {
  constructor(x, y, text, color = '#ffffff', size = 16) {
    this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
    this.life = 0.9; this.maxLife = 0.9; this.vy = -46; this.alive = true;
  }
  update(dt) {
    this.life -= dt; this.y += this.vy * dt; this.vy *= (1 - 1.4 * dt);
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.font = `900 ${this.size}px 'Space Grotesk', system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10; ctx.shadowColor = this.color;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// ------------------------- Shockwave (expanding ring) ---------------
// A crisp additive ring that snaps outward — the signature "impact" of a
// big explosion (enemy death, bomb, boss kill).
export class Shockwave {
  constructor(x, y, color = '#ffffff', maxR = 90, life = 0.4, width = 4) {
    this.x = x; this.y = y; this.color = color;
    this.maxR = maxR; this.life = life; this.maxLife = life; this.width = width; this.alive = true;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.alive = false; }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;         // 0→1 expansion
    const r = this.maxR * (1 - Math.pow(1 - t, 2));  // ease-out
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = this.color; ctx.lineWidth = this.width * (1 - t) + 0.5;
    ctx.shadowBlur = 16; ctx.shadowColor = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
