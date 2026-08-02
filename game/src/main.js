// =====================================================================
// main.js — Game orchestrator: engine wiring, fixed-timestep loop,
// spawning, collisions, run lifecycle, and monetization hooks.
// =====================================================================
import { CONFIG, ENEMY_TYPES, POWERUPS, BOSSES } from './config.js';
import { Canvas, Input, AudioEngine, EventBus, Pool, Storage, clamp, rand, dist2, pick } from './core.js';
import { Star, Particle, Bullet, Missile, Coin, Enemy, Player, PowerUp, Floater, Shockwave } from './entities.js';
import { Boss } from './boss.js';
import { Economy } from './economy.js';
import { AdManager } from './ads.js';
import { UI } from './ui.js';
import { Achievements } from './achievements.js';

const CRATE_DEF = { id: 'crate', hp: 1, speed: 130, radius: 16, damage: 0, coins: 6, color: '#ffd24d', pattern: 'sine', score: 5 };
const weightedPick = (arr) => {
  const total = arr.reduce((s, x) => s + x.weight, 0); let r = Math.random() * total;
  for (const x of arr) { if ((r -= x.weight) <= 0) return x; } return arr[0];
};

class Game {
  constructor() {
    const canvasEl = document.getElementById('game');
    this.canvas = new Canvas(canvasEl);
    this.ctx = this.canvas.ctx;
    this.input = new Input(canvasEl);
    this.audio = new AudioEngine();
    this.events = new EventBus();
    // Restore the player's last chosen mode (Free / Hardcore).
    this.economy = new Economy(Storage.getPref('mode', 'free'));
    this.ads = new AdManager();
    this.audio.setEnabled(this.economy.state.settings.sound);

    // Pools (object reuse => minimal GC).
    this.bullets   = new Pool(() => new Bullet());
    this.missiles  = new Pool(() => new Missile());
    this.particles = new Pool(() => new Particle());
    this.coins     = new Pool(() => new Coin());
    this.enemies   = new Pool(() => new Enemy());
    this.powerups  = new Pool(() => new PowerUp());
    this.stars     = new Pool(() => new Star());
    this._initStars();

    // True when served from the portfolio's /game/ subfolder → show "Back
    // to Portfolio" affordances and route Exit accordingly.
    this.embedded = /\/game(\/|$)/.test(location.pathname);

    this.state = 'menu';
    this.player = null;
    this.shakeAmt = 0;
    this.hitStop = 0;                 // brief gameplay freeze for impact
    this.flash = 0; this.flashColor = '#ffffff'; // full-screen flash alpha
    this.effects = [];               // floaters + shockwaves (screen FX)
    this._nebT = 0;                  // nebula drift clock

    this.ui = new UI(this);
    // Achievements announce through the UI, so wire after it exists.
    this.achievements = new Achievements(this.economy, (a) => this.ui.achievementToast(a));
    this.achievements.set('fullHangar', this.economy.ownsAllShipsWeapons());
    this.ui.show('menu');

    this._acc = 0; this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  _initStars() {
    this.stars.clear();
    CONFIG.starLayers.forEach((L, li) => {
      for (let i = 0; i < L.count; i++) {
        const s = this.stars.spawn(); s.reset(this.width, this.height, li);
      }
    });
  }

  // ------------------------- Run lifecycle -------------------------
  startRun() {
    this.audio.resume();
    this.bullets.clear(); this.missiles.clear(); this.enemies.clear();
    this.coins.clear(); this.particles.clear(); this.powerups.clear();
    this.effects.length = 0; this.hitStop = 0; this.flash = 0;

    this.player = new Player(this);
    this.player.stats = this.economy.computeStats();
    this.player.hp = this.player.stats.maxHp;
    this.player.shield = this.player.stats.shieldMax;
    this.missileAmmo = this.player.stats.missile.ammo || 0;

    this.score = 0; this.kills = 0; this.wave = 1; this.runCoins = 0;
    this.waveKills = 0;
    this.spawnInterval = CONFIG.spawn.baseInterval;
    this.spawnTimer = 0.6;
    this._revivedOnce = false;

    // Round manager + meta systems.
    this.roundType = 'wave';       // 'wave' | 'boss' | 'bonus'
    this.boss = null; this.bossIndex = 0;
    this.bonusTimer = 0; this.crateTimer = 0;
    this.combo = 0; this.comboTimer = 0; this.comboMult = 1;
    this.bombs = 1;                // start each run with one Mega Bomb

    this.state = 'playing';
    this.ui.show('game');
    this.ui.updateHud(this);
  }

  // ------------------------- Round manager -------------------------
  _startBoss() {
    this.roundType = 'boss';
    this.enemies.clear();
    const def = BOSSES[this.bossIndex % BOSSES.length];
    this.boss = new Boss(this, def, this.bossIndex);
    this.audio.wave(); this.shake(8);
    this.ui.toast('⚠ WARNING — ' + def.name);
    this.ui.showBossBar(def.name);
  }
  onBossKilled(boss) {
    this.audio.explode();
    for (let i = 0; i < 60; i++) this.burst(boss.x + rand(-boss.radius, boss.radius), boss.y + rand(-boss.radius, boss.radius), i % 2 ? boss.color : boss.accent, 3);
    this.shake(24);
    this.hitFreeze(CONFIG.feel.hitStopBoss);
    this.flashScreen(0.5, boss.accent);
    this.addShockwave(boss.x, boss.y, boss.accent, boss.radius * 5, 0.7, 6);
    this.addShockwave(boss.x, boss.y, '#ffffff', boss.radius * 3, 0.5, 4);
    this.addFloater(boss.x, boss.y, 'BOSS DOWN', boss.accent, 30);
    const reward = Math.round(boss.coins * this.comboMult);
    this.runCoins += reward;
    // Shower of coins + a guaranteed power-up.
    for (let i = 0; i < 14; i++) this.spawnCoin(boss.x + rand(-40, 40), boss.y + rand(-30, 30), CONFIG.economy.coinPerKill);
    this._spawnPowerup(boss.x, boss.y + 30);
    this.boss = null; this.bossIndex++;
    this.achievements.add('bosses'); this.achievements.check();
    this.ui.hideBossBar();
    this.ui.toast('BOSS DOWN +' + reward + '💰');
    this._startBonus();
  }
  _startBonus() {
    this.roundType = 'bonus';
    this.bonusTimer = CONFIG.rounds.bonusDuration; this.crateTimer = 0;
    this.audio.wave();
    this.ui.showBonus();
  }
  _endBonus() {
    this.roundType = 'wave';
    this.enemies.clear();
    this.wave++;
    this.spawnInterval = Math.max(CONFIG.spawn.minInterval,
      CONFIG.spawn.baseInterval - CONFIG.spawn.intervalDecayPerWave * (this.wave - 1));
    this.spawnTimer = 1.0;
    this.ui.hideBonus();
    this.ui.toast('WAVE ' + this.wave);
  }

  // ------------------------- Combo ---------------------------------
  _bumpCombo() {
    this.combo++; this.comboTimer = CONFIG.combo.window;
    this.comboMult = Math.min(CONFIG.combo.maxMult, 1 + Math.floor(this.combo / CONFIG.combo.perTier) * 0.5);
    this.achievements.max('bestCombo', this.comboMult);
  }

  // ------------------------- Power-ups -----------------------------
  _spawnPowerup(x, y, def) {
    this.powerups.spawn((p) => p.init(x, y, def || weightedPick(POWERUPS)));
  }
  applyPowerup(def) {
    const p = this.player; this.audio.pickup();
    switch (def.id) {
      case 'health': p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.4); this.events.emit('hpChanged', { hp: p.hp, max: p.stats.maxHp }); break;
      case 'shield': p.shield = Math.min(5, p.shield + 1); break;
      case 'rapid':  p.buffs.rapid = def.duration; break;
      case 'spread': p.buffs.spread = def.duration; break;
      case 'magnet': p.buffs.magnet = def.duration; break;
      case 'bomb':   this.bombs++; break;
      case 'coins':  this.runCoins += def.coins; break;
    }
    this.burst(p.x, p.y, def.color, 12);
    this.ui.toast(def.icon + ' ' + def.name);
  }

  // ------------------------- Mega Bomb -----------------------------
  useBomb() {
    if (this.bombs <= 0 || this.state !== 'playing') return;
    this.bombs--;
    this.achievements.add('bombs'); this.achievements.check();
    this.shake(20); this.audio.explode();
    this.flashScreen(0.6, '#7df9ff'); this.hitFreeze(0.06);
    this.addShockwave(this.player.x, this.player.y, '#7df9ff', Math.max(this.width, this.height), 0.55, 8);
    // Nuke every enemy; heavy damage to boss; wipe enemy bullets.
    for (const e of this.enemies.active.slice()) { this.burst(e.x, e.y, e.color, 8); this.onEnemyKilled(e); e.alive = false; }
    for (const b of this.bullets.active) if (b.owner === 'enemy') b.alive = false;
    if (this.boss) this.boss.hurt(this.boss.maxHp * 0.2, this);
    for (let i = 0; i < 80; i++) { const a = rand(0, Math.PI * 2); this.spawnParticle(this.player.x, this.player.y, Math.cos(a) * rand(200, 700), Math.sin(a) * rand(200, 700), rand(0.4, 0.9), pick(['#7df9ff', '#ffffff', '#ffd24d']), rand(3, 7)); }
    this.ui.toast('💣 MEGA BOMB');
  }

  async endRun() {
    this.state = 'gameover';
    const isBest = this.economy.recordScore(this.score);
    const earned = this.runCoins;
    this.economy.addCoins(earned); this.runCoins = 0; // commit run earnings once
    // Lifetime achievement stats for this run.
    this.achievements.add('runs'); this.achievements.add('coinsEarned', earned);
    this.achievements.max('bestScore', this.score);
    this.achievements.set('fullHangar', this.economy.ownsAllShipsWeapons());
    this.achievements.check();
    this.ui.showGameOver({ score: this.score, coins: earned, best: this.economy.state.highScore, isBest });
    // Interstitial cadence (non-blocking to the UI reveal).
    this.ads.maybeInterstitial();
  }

  // Rewarded-ad revive (or coin fallback handled by UI).
  revive() {
    this.player.alive = true;
    this.player.hp = this.player.stats.maxHp;
    this.player.invuln = 3;
    // Clear the screen of threats as a reward.
    for (const e of this.enemies.active) { this.burst(e.x, e.y, e.color, 10); }
    this.enemies.clear();
    this.state = 'playing';
    this.ui.show('game');
  }

  totalCoins() { return this.economy.state.coins + this.runCoins; }
  deductCoins(n) {
    if (this.runCoins >= n) { this.runCoins -= n; }
    else { const rem = n - this.runCoins; this.runCoins = 0; this.economy.state.coins -= rem; this.economy.save(); }
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.ui.show('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.ui.show('game'); }
  }

  quitToMenu() {
    if (this.state === 'playing' || this.state === 'paused') {
      this.economy.addCoins(this.runCoins); this.runCoins = 0; // bank earnings on quit
    }
    this.state = 'menu';
    this.ui.show('menu');
  }

  // Switch between Free Play and Hardcore. Each mode has its own save slot,
  // so Hardcore always starts locked even if Free has everything unlocked.
  setMode(mode) {
    mode = mode === 'hardcore' ? 'hardcore' : 'free';
    if (this.economy.mode === mode) return;
    if (this.state !== 'menu') return;      // only switchable from the menu
    Storage.setPref('mode', mode);
    this.economy = new Economy(mode);
    this.achievements = new Achievements(this.economy, (a) => this.ui.achievementToast(a));
    this.achievements.set('fullHangar', this.economy.ownsAllShipsWeapons());
    this.audio.setEnabled(this.economy.state.settings.sound);
    this.ui.toast(mode === 'hardcore' ? '🔥 HARDCORE MODE' : '😎 FREE PLAY');
    this.ui.refreshMenu();
  }

  // Return to the host portfolio. Bank any in-progress earnings first, then
  // go back in history (preserves the visitor's scroll position) or, if the
  // game was opened directly, navigate to the portfolio's Game section.
  exitToPortfolio() {
    if (this.runCoins) { this.economy.addCoins(this.runCoins); this.runCoins = 0; }
    if (document.referrer && window.history.length > 1) window.history.back();
    else window.location.href = '../index.html#game';
  }

  // ------------------------- Spawn helpers -------------------------
  spawnBullet(o) { this.bullets.spawn((b) => b.init(o)); }
  spawnMissile(o) { this.missiles.spawn((m) => m.init(o)); }
  spawnParticle(x, y, vx, vy, life, color, size) {
    this.particles.spawn((p) => p.init(x, y, vx, vy, life, color, size));
  }
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 260);
      // Bigger bursts get glowing sparks + a hot-white core for impact.
      const glow = n >= 12 && i % 2 === 0;
      const col = (n >= 12 && i % 5 === 0) ? '#ffffff' : color;
      this.particles.spawn((p) => p.init(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), col, rand(3, 6), glow));
    }
  }

  // ------------------------- Juice / screen FX ---------------------
  addFloater(x, y, text, color, size) { this.effects.push(new Floater(x, y, text, color, size)); }
  addShockwave(x, y, color, maxR, life, width) { this.effects.push(new Shockwave(x, y, color, maxR, life, width)); }
  flashScreen(a, color = '#ffffff') { this.flash = Math.max(this.flash, a); this.flashColor = color; }
  hitFreeze(s) { this.hitStop = Math.min(CONFIG.feel.maxHitStop, this.hitStop + s); }
  muzzleFlash(x, y, color, scale = 1) {
    for (let i = 0; i < 3; i++) { const a = rand(0, Math.PI * 2), sp = rand(60, 160) * scale; this.particles.spawn((p) => p.init(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.08, 0.16), '#fff', rand(2, 4) * scale, true)); }
  }
  // Rocket splash: area damage + a meaty ring/flash on impact.
  _missileSplash(m) {
    const r = m.splash, r2 = r * r, dmg = m.damage * 0.6;
    for (const e of this.enemies.active) { if (e.alive && dist2(m.x, m.y, e.x, e.y) < r2) e.hurt(dmg, this); }
    if (this.boss && this.boss.alive && dist2(m.x, m.y, this.boss.x, this.boss.y) < (r + this.boss.radius) ** 2) this.boss.hurt(dmg, this);
    this.burst(m.x, m.y, m.color, 24);
    this.addShockwave(m.x, m.y, m.color, r * 1.4, 0.42, 5);
    this.flashScreen(0.18, m.color); this.shake(9); this.hitFreeze(0.03);
  }
  spawnCoin(x, y, value) { this.coins.spawn((c) => c.init(x, y, value)); }
  collectCoin(v) {
    this.runCoins += v; this.audio.pickup();
    this.spawnParticle(this.player.x, this.player.y, 0, -60, 0.5, '#ffd24d', 4);
  }

  nearestEnemy(x, y, maxRange = Infinity) {
    let best = null, bd = maxRange * maxRange;
    for (const e of this.enemies.active) {
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    // Include the boss so auto-aim & homing missiles target it too.
    if (this.boss && this.boss.alive) { const d = dist2(x, y, this.boss.x, this.boss.y); if (d < bd) { bd = d; best = this.boss; } }
    return best;
  }
  shake(amt) { this.shakeAmt = Math.min(this.shakeAmt + amt, 24); }

  // ------------------------- Spawner -------------------------------
  _spawner(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const def = pick(ENEMY_TYPES);
      const x = rand(40, this.width - 40);
      this.enemies.spawn((e) => e.init(def, x, this.wave, this));
      this.spawnTimer = this.spawnInterval * rand(0.7, 1.3);
    }
  }
  _advanceWaveIfReady() {
    if (this.roundType !== 'wave') return;
    if (this.waveKills >= CONFIG.spawn.waveKills) {
      this.waveKills = 0; this.wave++;
      this.achievements.max('bestWave', this.wave); this.achievements.check();
      if (this.wave % CONFIG.rounds.bossEvery === 0) { this._startBoss(); return; }
      this.spawnInterval = Math.max(CONFIG.spawn.minInterval,
        CONFIG.spawn.baseInterval - CONFIG.spawn.intervalDecayPerWave * (this.wave - 1));
      this.audio.wave();
      this.ui.toast(`WAVE ${this.wave}`);
    }
  }
  _bonusSpawner(dt) {
    this.crateTimer -= dt;
    if (this.crateTimer <= 0) {
      this.crateTimer = CONFIG.rounds.bonusCrateInterval;
      const x = rand(40, this.width - 40);
      this.enemies.spawn((e) => e.init(CRATE_DEF, x, 1, this));
    }
  }

  // ------------------------- Collisions ----------------------------
  _collisions() {
    const enemies = this.enemies.active;
    // Player bullets & missiles vs enemies.
    for (const e of enemies) {
      if (!e.alive) continue;
      for (const b of this.bullets.active) {
        if (!b.alive || b.owner !== 'player') continue;
        if (dist2(b.x, b.y, e.x, e.y) < (e.radius + b.radius) ** 2) {
          this.burst(b.x, b.y, e.color, 4); e.hurt(b.damage, this);
          // Piercing rounds pass through; ordinary rounds are consumed.
          if (b.pierce > 0) b.pierce--; else b.alive = false;
          if (!e.alive) break;
        }
      }
      if (!e.alive) continue;
      for (const m of this.missiles.active) {
        if (!m.alive) continue;
        if (dist2(m.x, m.y, e.x, e.y) < (e.radius + m.radius + 6) ** 2) {
          m.alive = false; this.burst(m.x, m.y, m.color, 16); this.shake(6); e.hurt(m.damage, this);
          if (m.splash) this._missileSplash(m);
          if (!e.alive) break;
        }
      }
    }

    const p = this.player;

    // Player bullets & missiles vs boss.
    if (this.boss && this.boss.alive) {
      const bo = this.boss;
      for (const b of this.bullets.active) {
        if (!b.alive || b.owner !== 'player') continue;
        if (dist2(b.x, b.y, bo.x, bo.y) < (bo.radius + b.radius) ** 2) { this.burst(b.x, b.y, bo.accent, 4); bo.hurt(b.damage, this); if (b.pierce > 0) b.pierce--; else b.alive = false; }
      }
      for (const m of this.missiles.active) {
        if (!m.alive) continue;
        if (dist2(m.x, m.y, bo.x, bo.y) < (bo.radius + m.radius + 6) ** 2) { m.alive = false; this.burst(m.x, m.y, m.color, 16); this.shake(6); bo.hurt(m.damage, this); if (m.splash) this._missileSplash(m); }
      }
      // Boss contact.
      if (p && p.alive && this.boss && dist2(bo.x, bo.y, p.x, p.y) < (bo.radius + p.hitRadius) ** 2) p.takeHit(bo.contactDamage, this);
    }

    if (p && p.alive) {
      // Enemy bullets vs player.
      for (const b of this.bullets.active) {
        if (!b.alive || b.owner !== 'enemy') continue;
        if (dist2(b.x, b.y, p.x, p.y) < (b.radius + p.hitRadius) ** 2) { b.alive = false; p.takeHit(b.damage, this); }
      }
      // Enemy contact damage (crates are harmless; skip during bonus round).
      if (this.roundType !== 'bonus') {
        for (const e of enemies) {
          if (!e.alive || e.damage <= 0) continue;
          if (dist2(e.x, e.y, p.x, p.y) < (e.radius + p.hitRadius) ** 2) {
            e.alive = false; this.burst(e.x, e.y, e.color, 12);
            p.takeHit(e.damage, this);
          }
        }
      }
    }
  }

  // ------------------------- Enemy callbacks -----------------------
  onEnemyKilled(e) {
    this.audio.explode(); this.burst(e.x, e.y, e.color, 18); this.shake(5);
    this.addShockwave(e.x, e.y, e.color, e.radius * 3.4, 0.38, 3);
    this.hitFreeze(CONFIG.feel.hitStopKill);
    this._bumpCombo();
    const gained = Math.round(e.score * this.comboMult);
    this.score += gained;
    if (e.type !== 'crate') this.addFloater(e.x, e.y - e.radius, '+' + gained, this.comboMult > 1 ? '#ffd24d' : '#cfefff', this.comboMult > 1 ? 20 : 15);
    const isCrate = e.type === 'crate';
    if (!isCrate) { this.kills++; this.waveKills++; this.achievements.add('kills'); this.achievements.check(); }
    // Coins: crates always pay; normal enemies pay on a chance. Combo scales it.
    if (isCrate || Math.random() < CONFIG.economy.coinDropChance) {
      const n = Math.max(1, Math.round(e.coins * (isCrate ? 1 : this.comboMult)));
      for (let i = 0; i < n; i++) this.spawnCoin(e.x + rand(-10, 10), e.y + rand(-10, 10), CONFIG.economy.coinPerKill);
    }
    // Occasional power-up drop from normal enemies.
    if (!isCrate && Math.random() < 0.05) this._spawnPowerup(e.x, e.y);
    this._advanceWaveIfReady();
  }
  onEnemyLeaked(_e) { /* enemy exited bottom — no penalty in this build */ }
  onPlayerDead() { this.endRun(); }

  // ------------------------- Fixed-step update ---------------------
  _update(dt) {
    this.stars.update(dt, this);
    if (this.state !== 'playing') return;
    this.player.update(dt, this);
    this.enemies.update(dt, this);
    this.bullets.update(dt, this);
    this.missiles.update(dt, this);
    this.coins.update(dt, this);
    this.powerups.update(dt, this);
    this.particles.update(dt);
    // Screen effects (floaters + shockwaves): update & recycle in place.
    for (let i = this.effects.length - 1; i >= 0; i--) { const fx = this.effects[i]; fx.update(dt); if (!fx.alive) this.effects.splice(i, 1); }
    if (this.boss) this.boss.update(dt, this);

    // Round pacing.
    if (this.roundType === 'wave') this._spawner(dt);
    else if (this.roundType === 'bonus') {
      this._bonusSpawner(dt);
      this.bonusTimer -= dt;
      if (this.bonusTimer <= 0) this._endBonus();
    }

    // Combo decay.
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) { this.combo = 0; this.comboMult = 1; } }

    this._collisions();
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 60 * dt);
  }

  // ------------------------- Render --------------------------------
  _render() {
    const ctx = this.ctx, w = this.width, h = this.height;
    // Background gradient (space).
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05060f'); g.addColorStop(1, '#0b0720');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    this._drawNebula(ctx, w, h);

    ctx.save();
    if (this.shakeAmt > 0) ctx.translate(rand(-this.shakeAmt, this.shakeAmt), rand(-this.shakeAmt, this.shakeAmt));

    this.stars.draw(ctx);
    this.coins.draw(ctx);
    this.powerups.draw(ctx);
    this.enemies.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    this.bullets.draw(ctx);
    this.missiles.draw(ctx);
    if (this.player && (this.state === 'playing' || this.state === 'paused')) this.player.draw(ctx);
    this.particles.draw(ctx);
    for (const fx of this.effects) fx.draw(ctx);
    ctx.restore();

    // Full-screen impact flash (drawn un-shaken, on top of the world).
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // Soft drifting nebula clouds — cheap radial gradients, redrawn each frame.
  _drawNebula(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of CONFIG.nebula) {
      const cx = w * n.x + Math.sin(this._nebT * 0.05 * n.drift) * 40;
      const cy = h * n.y + Math.cos(this._nebT * 0.04 * n.drift) * 30;
      const r = Math.max(w, h) * n.r;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, n.hue); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = n.alpha; ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // ------------------------- Main loop -----------------------------
  _frame(now) {
    let frameTime = (now - this._last) / 1000;
    this._last = now;
    if (frameTime > CONFIG.maxFrameTime) frameTime = CONFIG.maxFrameTime;

    // Presentation clocks run in real time (independent of hit-stop).
    this._nebT += frameTime;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - CONFIG.feel.flashDecay * frameTime);

    if (this.hitStop > 0) {
      // Freeze gameplay for a beat on big impacts; keep rendering so the
      // frozen frame reads. Drop accumulated time so there's no catch-up burst.
      this.hitStop -= frameTime; this._acc = 0;
    } else {
      this._acc += frameTime;
      // Fixed-timestep physics for determinism & stability.
      let steps = 0;
      while (this._acc >= CONFIG.fixedDt && steps < 8) {
        this._update(CONFIG.fixedDt); this._acc -= CONFIG.fixedDt; steps++;
      }
    }
    this._render();
    if (this.state === 'playing') this.ui.updateHud(this);
    requestAnimationFrame((t) => this._frame(t));
  }
}

// Boot once the DOM is ready.
window.addEventListener('DOMContentLoaded', () => { window.GAME = new Game(); });
