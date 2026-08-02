// =====================================================================
// main.js — Nitro Rush orchestrator. Wires the engine, builds the race,
// runs a fixed-timestep loop, renders the pseudo-3D world + cars, tracks
// positions / laps / timing, and drives the HUD, minimap and menus.
// =====================================================================
import { CONFIG, VIEW, CARS, TRACKS, RACE_MODES, ENVIRONMENTS, OPPONENT_COUNT, DEFAULT_MODE } from './config.js';
import { Canvas, Input, AudioEngine, EventBus, Storage, clamp, lerp } from './core.js';
import { Track } from './track.js';
import { PlayerCar, computeStats, drawCar } from './car.js';
import { buildGrid } from './ai.js';
import { Util, drawBackground, renderSegment, drawProp, drawObstacle } from './render3d.js';
import { Economy } from './economy.js';
import { UI } from './ui.js';

const fmtTime = (ms) => {
  if (!isFinite(ms)) return '--:--';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
};

class Game {
  constructor() {
    const canvasEl = document.getElementById('game');
    this.canvas = new Canvas(canvasEl);
    this.ctx = this.canvas.ctx;
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.events = new EventBus();
    this.economy = new Economy(Storage.getPref('mode', DEFAULT_MODE));
    this.audio.setEnabled(this.economy.state.settings.sound);

    // Embedded = reached from the portfolio (inside its iframe, or navigated
    // in from any page → a referrer is present). Standalone direct visits
    // (no referrer, top window) hide the "Back to Portfolio" affordance.
    this.embedded = (window.self !== window.top) || (document.referrer !== '');

    // Camera geometry (constant).
    this.cameraDepth = 1 / Math.tan((CONFIG.fieldOfView / 2) * Math.PI / 180);

    // Race selection defaults.
    this.trackDef = TRACKS[0];
    this.raceMode = RACE_MODES[0];

    this.state = 'menu';           // menu | countdown | racing | paused | finished
    this._bgOffset = 0;

    // HUD element cache.
    this.hud = document.getElementById('hud');
    this.mini = document.getElementById('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this._h = {
      pos: this.hud.querySelector('[data-pos]'), posTotal: this.hud.querySelector('[data-pos-total]'),
      lap: this.hud.querySelector('[data-lap]'), time: this.hud.querySelector('[data-time]'),
      last: this.hud.querySelector('[data-last]'), best: this.hud.querySelector('[data-best]'),
      gear: this.hud.querySelector('[data-gear]'), speed: this.hud.querySelector('[data-speed]'),
      rpm: this.hud.querySelector('[data-rpm]'), toast: this.hud.querySelector('[data-race-toast]'),
    };

    this.ui = new UI(this);
    this.input.bindTouch(document.getElementById('touch'));
    this.ui.show('menu');

    this._acc = 0; this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  // ------------------------- Mode (Free/Hardcore) ------------------
  setMode(mode) {
    mode = mode === 'hardcore' ? 'hardcore' : 'free';
    if (this.economy.mode === mode || this.state !== 'menu') return;
    Storage.setPref('mode', mode);
    this.economy = new Economy(mode);
    this.audio.setEnabled(this.economy.state.settings.sound);
    // Selected car might not be owned in the other slot — fall back safely.
    if (!this.economy.owns(this.economy.state.selectedCar)) this.economy.select('cadet');
    this.ui.toast(mode === 'hardcore' ? '🔥 HARDCORE MODE' : '😎 FREE PLAY');
    this.ui.refreshMenu();
  }

  // ------------------------- Race lifecycle ------------------------
  startRace() {
    this.audio.resume();
    this.env = ENVIRONMENTS[this.trackDef.env];
    this.track = new Track(this.trackDef, this.raceMode);
    this.laps = this.raceMode.laps;
    this.finishDistance = this.track.length * this.laps;

    const carDef = CARS.find((c) => c.id === this.economy.state.selectedCar) || CARS[0];
    const up = this.economy.carUpgrades(carDef.id);
    const stats = computeStats(carDef, up, this.env);
    this.player = new PlayerCar(carDef, stats, this.env);

    // Opponent grid from the other cars.
    const pool = CARS.filter((c) => c.id !== carDef.id);
    this.opponents = buildGrid(OPPONENT_COUNT, pool, computeStats, this.env, stats);
    this.field = this.opponents.length + 1;

    // Timing / laps.
    this.raceTime = 0; this.lapStart = 0; this.lastLap = 0; this.bestLap = Infinity;
    this._lapIndex = 0; this._cleanLap = true; this.position = 1;

    this.countdown = 3.999;
    this.state = 'countdown';
    this._cdBeep = 4;
    this.audio.startEngine(carDef.sound);
    this.ui.show('race');
    this._updateHud();
  }

  finishRace() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.player.finished = true;
    this.audio.finish(); this.audio.stopEngine();
    // Payout by finishing position (Hardcore earns credits; Free is just fun).
    const place = this.position;
    let credits = 0;
    if (!this.economy.isFree()) {
      credits = (CONFIG.economy.creditsPerPosition[place - 1] || 30);
      credits += this.laps * CONFIG.economy.lapBonus;
      if (this._cleanLap) credits += CONFIG.economy.cleanLapBonus;
      this.economy.addCredits(credits);
    }
    const improved = this.economy.recordResult(this.trackDef.id, this.raceMode.id, this.raceTime, this.bestLap);
    this.ui.showResults({
      place, field: this.field, time: this.raceTime, bestLap: this.bestLap,
      credits, improved, mode: this.raceMode, track: this.trackDef,
    });
  }

  togglePause() {
    if (this.state === 'racing') { this.state = 'paused'; this.audio.stopEngine(); this.ui.show('pause'); }
    else if (this.state === 'paused') { this.state = 'racing'; this.audio.startEngine(this.player.car.sound); this.ui.show('race'); }
  }
  quitToMenu() { this.state = 'menu'; this.audio.stopEngine(); this.ui.show('menu'); }
  exitToPortfolio() {
    this.audio.stopEngine();
    if (document.referrer && window.history.length > 1) window.history.back();
    else window.location.href = '../index.html';
  }

  // ------------------------- Update --------------------------------
  _update(dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this._cdBeep && n >= 0) { this._cdBeep = n; this.audio.countdown(n === 0); if (n > 0) this.ui.raceToast(String(n)); else this.ui.raceToast('GO!'); }
      // Idle revs during the countdown.
      this.audio.setEngine(0.25 + Math.abs(Math.sin(performance.now() / 120)) * 0.15, 0.3);
      if (this.countdown <= 0) { this.state = 'racing'; this.lapStart = 0; }
      return;
    }
    if (this.state !== 'racing') return;

    this.raceTime += dt * 1000;

    // Player.
    const prevPos = this.player.pos;
    this.player.update(dt, this.input, this.track, this.audio);
    this.audio.setEngine(this.player.rpm, this.input.throttle() ? (this.player.boostActive ? 1 : 0.7) : 0.25);
    if (this.player.offroad) this._cleanLap = false;

    // Opponents.
    for (const o of this.opponents) o.update(dt, this.track, this.player, this.track.length);

    // Collisions with opponents (simple overlap in z + lane).
    for (const o of this.opponents) {
      if (Math.abs(o.pos - this.player.pos) < CONFIG.segmentLength * 1.2 && Math.abs(o.x - this.player.x) < 0.5) {
        const dir = Math.sign(this.player.x - o.x) || 1;
        if (this.player.speed > o.speed) { this.player.collide(dir); this.audio.bump(); this._cleanLap = false; }
        o.x -= dir * 0.02;
      }
    }

    // Obstacle collisions — scan every segment the player crossed this frame
    // (at top speed the car covers multiple segments per step).
    const segs = this.track.segments, sc = segs.length, sl = CONFIG.segmentLength;
    const startIdx = Math.floor(prevPos / sl), endIdx = Math.floor(this.player.pos / sl);
    for (let si = startIdx; si <= endIdx; si++) {
      const seg = segs[((si % sc) + sc) % sc];
      for (const ob of seg.obstacles) {
        if (ob.hit) continue;
        // Only a genuine overlap counts (car half-width vs hazard half-width).
        if (Math.abs(ob.offset - this.player.x) < 0.17) {
          ob.hit = true; this._cleanLap = false;
          const dir = Math.sign(this.player.x - ob.offset) || 1;
          this.player.collide(dir, ob.type === 'pit' || ob.type === 'barrier' ? 0.5 : 0.68);
          this.audio.bump(); this.ui.raceToast('💥');
        }
      }
    }

    // Background parallax follows the curve.
    const baseSeg = this.track.findSegment(this.player.pos);
    this._bgOffset += baseSeg.curve * (this.player.speed / this.player.stats.maxSpeed) * dt * 240;

    // Lap crossing.
    const lapNow = Math.floor(this.player.pos / this.track.length);
    if (lapNow > this._lapIndex && this.player.pos < this.finishDistance) {
      const lapTime = this.raceTime - this.lapStart;
      this.lastLap = lapTime;
      if (lapTime < this.bestLap) { this.bestLap = lapTime; this.ui.raceToast('BEST ' + fmtTime(lapTime)); }
      else this.ui.raceToast('LAP ' + fmtTime(lapTime));
      this.lapStart = this.raceTime; this._lapIndex = lapNow; this._cleanLap = true;
      if (!this.economy.isFree()) this.economy.addCredits(CONFIG.economy.lapBonus);
    }

    // Position (rank by cumulative distance).
    let rank = 1;
    for (const o of this.opponents) if (o.pos > this.player.pos) rank++;
    this.position = rank;

    // Finish.
    if (this.player.pos >= this.finishDistance) { this.player.pos = this.finishDistance; this.finishRace(); }

    this._updateHud();
  }

  // ------------------------- Render --------------------------------
  _render() {
    const ctx = this.ctx, W = VIEW.width, H = VIEW.height;
    if (this.state === 'menu') { // quiet animated backdrop behind menus
      drawBackground(ctx, this.menuEnv || ENVIRONMENTS.desert, W, H, performance.now() * 0.02);
      ctx.fillStyle = 'rgba(5,7,12,0.35)'; ctx.fillRect(0, H * 0.5, W, H * 0.5);
      return;
    }
    const track = this.track, env = this.env, player = this.player;
    // Camera position must WRAP within the track (player.pos is cumulative
    // across laps); otherwise on lap 2+ every segment falls behind the camera
    // and the road disappears.
    const position = ((player.pos % track.length) + track.length) % track.length;
    const cameraX = player.x * CONFIG.roadWidth;

    const baseSegment = track.findSegment(position);
    const basePercent = (position % CONFIG.segmentLength) / CONFIG.segmentLength;
    const playerY = lerp(baseSegment.p1.world.y, baseSegment.p2.world.y, basePercent);

    drawBackground(ctx, env, W, H, this._bgOffset);

    // ---- Road ----
    let maxy = H, x = 0, dx = -(baseSegment.curve * basePercent);
    const seen = [];
    for (let n = 0; n < CONFIG.drawDistance; n++) {
      const seg = track.segments[(baseSegment.index + n) % track.segments.length];
      seg.looped = seg.index < baseSegment.index;
      seg.fog = Util.fog(n / CONFIG.drawDistance, env.fogDensity);
      seg.clip = maxy;
      const camZ = position - (seg.looped ? track.length : 0);
      Util.project(seg.p1, cameraX - x, playerY + CONFIG.cameraHeight, camZ, this.cameraDepth, W, H, CONFIG.roadWidth);
      Util.project(seg.p2, cameraX - x - dx, playerY + CONFIG.cameraHeight, camZ, this.cameraDepth, W, H, CONFIG.roadWidth);
      x += dx; dx += seg.curve;
      if (seg.p1.camera.z <= this.cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      const col = track.colors(seg);
      renderSegment(ctx, W, CONFIG.lanes, seg.p1.screen.x, seg.p1.screen.y, seg.p1.screen.w, seg.p2.screen.x, seg.p2.screen.y, seg.p2.screen.w, seg.fog, col);
      maxy = seg.p2.screen.y;
      seen.push(seg);
    }

    // Bucket opponents by their current segment for back-to-front draw.
    const oppBySeg = new Map();
    for (const o of this.opponents) {
      const idx = track.findSegment(o.pos).index;
      (oppBySeg.get(idx) || oppBySeg.set(idx, []).get(idx)).push(o);
    }

    // ---- Props + opponents (far → near) ----
    for (let n = seen.length - 1; n >= 0; n--) {
      const seg = seen[n];
      for (const pr of seg.props) {
        const sx = seg.p1.screen.x + seg.p1.screen.w * pr.offset;
        drawProp(ctx, pr.type, sx, seg.p1.screen.y, seg.p1.screen.w, env, W);
      }
      // On-road hazards (only until hit).
      for (const ob of seg.obstacles) {
        if (ob.hit) continue;
        const ox = seg.p1.screen.x + seg.p1.screen.w * ob.offset;
        drawObstacle(ctx, ob.type, ox, seg.p1.screen.y, seg.p1.screen.w, env, W);
      }
      const cars = oppBySeg.get(seg.index);
      if (cars) for (const o of cars) {
        const sx = seg.p1.screen.x + o.x * seg.p1.screen.w;
        // Keep opponents a sane size (never bigger than the player's car).
        const cw = clamp(seg.p1.screen.w * 0.42, 4, W * 0.15);
        drawCar(ctx, sx, seg.p1.screen.y, cw, o.car, {}, { steer: 0 });
      }
    }

    // ---- Player car (fixed near the bottom) ----
    if (this.state !== 'menu') {
      const cw = W * 0.16;
      drawCar(ctx, W / 2, H * 0.9, cw, player.car, player.stats.parts, {
        steer: player.steerVis, braking: this.input.braking() > 0 && this.state === 'racing',
        boosting: player.boostActive, bounce: player.bounce,
      });
      // Speed lines when boosting.
      if (player.boostActive) {
        ctx.save(); ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) { const yy = (i * 53 + (performance.now() * 0.6 % 53)); const xx = (i % 2 ? 80 : W - 80) + Math.sin(i) * 20; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 40); ctx.stroke(); }
        ctx.restore();
      }
    }

    this._drawMinimap();
  }

  // ------------------------- Minimap -------------------------------
  _drawMinimap() {
    if (!this.track || !this.track.mapPoints) return;
    const c = this.miniCtx, w = this.mini.width, h = this.mini.height, pad = 18;
    c.clearRect(0, 0, w, h);
    const b = this.track.mapBounds;
    const sx = (w - pad * 2) / b.w, sy = (h - pad * 2) / b.h, s = Math.min(sx, sy);
    const ox = pad + ((w - pad * 2) - b.w * s) / 2, oy = pad + ((h - pad * 2) - b.h * s) / 2;
    const map = (p) => ({ x: ox + (p.x - b.minx) * s, y: oy + (p.y - b.miny) * s });
    // Track line.
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 6; c.beginPath();
    this.track.mapPoints.forEach((p, i) => { const m = map(p); i ? c.lineTo(m.x, m.y) : c.moveTo(m.x, m.y); }); c.stroke();
    c.strokeStyle = this.env.rumble[0]; c.lineWidth = 2.4; c.stroke();
    // Start/finish marker.
    const start = map(this.track.mapPoints[0]);
    c.fillStyle = '#fff'; c.fillRect(start.x - 3, start.y - 3, 6, 6);
    // Opponents.
    for (const o of this.opponents) { const mp = map(this.track.mapPoints[this.track.mapIndexForZ(o.pos)]); c.fillStyle = o.car.color; c.beginPath(); c.arc(mp.x, mp.y, 3, 0, Math.PI * 2); c.fill(); }
    // Player.
    const pp = map(this.track.mapPoints[this.track.mapIndexForZ(this.player.pos)]);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(pp.x, pp.y, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = this.player.car.color; c.beginPath(); c.arc(pp.x, pp.y, 3, 0, Math.PI * 2); c.fill();
  }

  // ------------------------- HUD -----------------------------------
  _updateHud() {
    const p = this.player, H = this._h;
    H.pos.textContent = this.position; H.posTotal.textContent = '/' + this.field;
    H.lap.textContent = this.raceMode.id === 'sprint' ? 'SPRINT' : `${clamp(this._lapIndex + 1, 1, this.laps)}/${this.laps}`;
    H.time.textContent = fmtTime(this.raceTime);
    H.last.textContent = this.lastLap ? fmtTime(this.lastLap) : '--:--';
    H.best.textContent = isFinite(this.bestLap) ? fmtTime(this.bestLap) : '--:--';
    H.gear.textContent = p.gear === 0 ? 'N' : p.gear;
    H.speed.textContent = p.kmh();
    H.speed.style.color = p.boostActive ? '#7ec8ff' : '';
    H.rpm.style.width = Math.round(p.rpm * 100) + '%';
    H.rpm.style.background = p.rpm > 0.85 ? '#ff4d4d' : p.boostActive ? '#7ec8ff' : '';
  }

  // ------------------------- Loop ----------------------------------
  _frame(now) {
    // Schedule the next frame FIRST so a transient error can never kill the
    // loop (the game keeps running and we log the fault once).
    requestAnimationFrame((t) => this._frame(t));
    let ft = (now - this._last) / 1000; this._last = now;
    if (ft > CONFIG.maxFrameTime) ft = CONFIG.maxFrameTime;
    this._acc += ft;
    try {
      let steps = 0;
      while (this._acc >= CONFIG.fixedDt && steps < 6) { this._update(CONFIG.fixedDt); this._acc -= CONFIG.fixedDt; steps++; }
      this._render();
    } catch (e) {
      if (!this._erred) { this._erred = true; console.error('Frame error:', e); }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { window.GAME = new Game(); });
