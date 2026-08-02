// =====================================================================
// car.js — Vehicles. computeStats() folds car base stats + upgrade levels
// + environment grip into effective physics. PlayerCar runs the driving
// model. drawCar() renders a car from behind with VISIBLE upgrade parts
// (wider tires, GT wing, twin exhaust, brake glow, engine scoop, carbon
// hood) so tuning is something you can actually see.
// =====================================================================
import { CONFIG, UPGRADES } from './config.js';
import { clamp } from './core.js';

const U = (id) => UPGRADES.find((u) => u.id === id);

export function computeStats(car, up = {}, env = null) {
  const lvl = (id) => up[id] || 0;
  const base = CONFIG.maxSpeed;
  const topMult = (car.topKmh / 300) * (1 + lvl('engine') * U('engine').perLevel);
  const accelMult = car.accel * (1 + lvl('muffler') * U('muffler').perLevel) * (1 + lvl('hood') * U('hood').perLevel);
  const gripMult = car.grip * (1 + lvl('tires') * U('tires').perLevel);
  const brakeMult = car.brake * (1 + lvl('brakes') * U('brakes').perLevel);
  return {
    topKmh: Math.round(car.topKmh * (1 + lvl('engine') * U('engine').perLevel)),
    maxSpeed: base * topMult,
    accelRate: base * CONFIG.accelRate * accelMult,
    brakeRate: base * CONFIG.brakeRate * brakeMult,
    decelRate: base * CONFIG.decelRate,
    offRoadDecel: base * CONFIG.offRoadDecel,
    offRoadLimit: base * CONFIG.offRoadLimit,
    grip: gripMult * (env ? env.feature.grip : 1),
    downforce: 1 + lvl('spoiler') * U('spoiler').perLevel,
    steer: (0.9 + car.grip * 0.2) * (1 + lvl('driver') * U('driver').perLevel),
    parts: {
      engine: lvl('engine'), tire: lvl('tires'), brake: lvl('brakes'),
      wing: lvl('spoiler'), exhaust: lvl('muffler'), hood: lvl('hood'), driver: lvl('driver'),
    },
  };
}

export class PlayerCar {
  constructor(carDef, stats, env) {
    this.car = carDef; this.stats = stats; this.env = env;
    this.pos = 0;           // cumulative distance along the track
    this.x = 0;             // lateral position (-1..1 = road edges)
    this.speed = 0;
    this.boost = 1;         // nitro tank 0..1
    this.boostActive = false;
    this.gear = 0; this.prevGear = 0; this.rpm = 0;
    this.offroad = false; this.bounce = 0; this.steerVis = 0;
    this.finished = false;
  }
  reset() { this.pos = 0; this.x = 0; this.speed = 0; this.boost = 1; this.finished = false; }

  update(dt, input, track, audio) {
    const st = this.stats;
    const seg = track.findSegment(this.pos);
    const speedPct = this.speed / st.maxSpeed;

    // Nitro tank.
    const wantBoost = input.boosting() && this.boost > 0.02 && input.throttle() > 0 && this.speed > st.maxSpeed * 0.1;
    this.boostActive = wantBoost;
    // Nitro "whoosh" on the rising edge (only when it actually engages).
    if (this.boostActive && !this._wasBoost) audio.boost();
    this._wasBoost = this.boostActive;
    if (wantBoost) this.boost = Math.max(0, this.boost - CONFIG.boostDrainPerSec * dt);
    else this.boost = Math.min(1, this.boost + CONFIG.boostRegenPerSec * dt);
    const boostMult = this.boostActive ? CONFIG.boostMult : 1;
    const maxSpeed = st.maxSpeed * boostMult;

    // Longitudinal.
    if (input.braking() > 0) this.speed += st.brakeRate * dt;
    else if (input.throttle() > 0) this.speed += st.accelRate * boostMult * dt;
    else this.speed += st.decelRate * dt;

    // Steering authority scales with speed (no pivoting when stopped).
    const steerIn = input.steer();
    const authority = dt * 2.7 * Math.min(1, speedPct + 0.22);
    this.x += steerIn * authority * st.steer;
    this.steerVis += (steerIn - this.steerVis) * Math.min(1, dt * 8);

    // Curve pull (centrifugal), softened by grip + downforce at speed.
    const grip = st.grip * (1 + (st.downforce - 1) * Math.min(1, speedPct));
    this.x -= authority * seg.curve * speedPct * CONFIG.centrifugal / grip;

    // Off-road penalty (worse on sand/snow/mountain shoulders).
    this.offroad = Math.abs(this.x) > 1;
    if (this.offroad && this.speed > st.offRoadLimit) {
      this.speed += st.offRoadDecel * dt * (this.env.feature.offRoad || 1);
      this.bounce = Math.sin(this.pos * 0.02) * 2.2;
      if (Math.random() < 0.05) audio.skid();
    } else this.bounce *= 0.8;

    this.speed = clamp(this.speed, 0, maxSpeed);
    this.x = clamp(this.x, -2.6, 2.6);
    this.pos += this.speed * dt;

    // Gear + RPM (display + engine audio).
    const sp = clamp(this.speed / st.maxSpeed, 0, 1);
    const gearF = sp * CONFIG.gears;
    this.gear = this.speed <= 1 ? 0 : Math.min(CONFIG.gears, Math.floor(gearF) + 1);
    this.rpm = this.speed <= 1 ? 0.12 : (gearF - Math.floor(gearF)) * 0.85 + 0.15;
    if (this.gear !== this.prevGear && this.gear > 0 && this.prevGear > 0) audio.gearShift();
    this.prevGear = this.gear;
  }

  // Slam: called on collision — scrub speed (retain 0..1) and shove sideways.
  collide(dir = 0, retain = 0.55) {
    this.speed *= retain;
    if (dir) this.x += dir * 0.1;   // gentle nudge, not a teleport
    this.bounce = 6;
  }
  kmh() { return Math.round(this.speed * CONFIG.speedToKmh); }
}

// Per-car silhouette specs (rear view). Values are fractions of W (x) / H (y).
// These make every car structurally distinct — not just a recolour.
const CAR_SHAPES = {
  // Compact friendly hatchback — tall greenhouse, narrow-ish, rounded.
  cadet:  { bodyBotW: 0.50, bodyBotY: -0.16, bodyTopW: 0.45, bodyTopY: -0.56, roofBotW: 0.42, roofBotY: -0.52, roofTopW: 0.30, roofTopY: -0.96, tireBase: 0.20, fender: 0.0, rails: false, diffuser: 0.0, lip: 0.0, rounded: true },
  // Low, wide muscle car — fat rear haunches, low roof, ducktail lip.
  vortex: { bodyBotW: 0.55, bodyBotY: -0.18, bodyTopW: 0.46, bodyTopY: -0.50, roofBotW: 0.40, roofBotY: -0.48, roofTopW: 0.24, roofTopY: -0.80, tireBase: 0.24, fender: 0.6, rails: false, diffuser: 0.1, lip: 0.5, rounded: false },
  // Boxy tall SUV / truck — slab sides, big square roof + roof rails.
  anvil:  { bodyBotW: 0.53, bodyBotY: -0.20, bodyTopW: 0.51, bodyTopY: -0.62, roofBotW: 0.50, roofBotY: -0.60, roofTopW: 0.46, roofTopY: -1.06, tireBase: 0.27, fender: 0.0, rails: true, diffuser: 0.0, lip: 0.0, rounded: false },
  // Narrow sleek coupe — slim body, sloping roof, small lip.
  dart:   { bodyBotW: 0.45, bodyBotY: -0.14, bodyTopW: 0.37, bodyTopY: -0.48, roofBotW: 0.34, roofBotY: -0.46, roofTopW: 0.20, roofTopY: -0.90, tireBase: 0.19, fender: 0.0, rails: false, diffuser: 0.1, lip: 0.25, rounded: true },
  // Wide, ultra-low angular supercar — aggressive stance, diffuser.
  viper:  { bodyBotW: 0.55, bodyBotY: -0.14, bodyTopW: 0.43, bodyTopY: -0.46, roofBotW: 0.40, roofBotY: -0.44, roofTopW: 0.16, roofTopY: -0.78, tireBase: 0.25, fender: 0.35, rails: false, diffuser: 0.35, lip: 0.4, rounded: false },
  // Race GT — low & wide, big diffuser + a permanent lip/aero.
  apex:   { bodyBotW: 0.53, bodyBotY: -0.14, bodyTopW: 0.41, bodyTopY: -0.48, roofBotW: 0.38, roofBotY: -0.44, roofTopW: 0.18, roofTopY: -0.80, tireBase: 0.26, fender: 0.25, rails: false, diffuser: 0.6, lip: 0.6, rounded: false },
};

// ---------------------------------------------------------------------
// drawCar — rear view. cx/cyBase = screen centre / ground contact.
// width = pixel width. parts = upgrade levels. Shape varies per car.
// ---------------------------------------------------------------------
export function drawCar(ctx, cx, cyBase, width, carDef, parts = {}, o = {}) {
  const W = width, H = W * 0.86;
  const S = CAR_SHAPES[carDef.id] || CAR_SHAPES.cadet;
  const tire = parts.tire || 0, wing = parts.wing || 0, exhaust = parts.exhaust || 0;
  const engine = parts.engine || 0, hood = parts.hood || 0, brake = parts.brake || 0;
  const steer = o.steer || 0, braking = o.braking, boosting = o.boosting;
  const color = carDef.color, accent = carDef.accent;

  // Silhouette dimensions in pixels.
  const bBotW = S.bodyBotW * W, bBotY = S.bodyBotY * H, bTopW = S.bodyTopW * W, bTopY = S.bodyTopY * H;
  const rBotW = S.roofBotW * W, rBotY = S.roofBotY * H, rTopW = S.roofTopW * W, rTopY = S.roofTopY * H;

  ctx.save();
  ctx.translate(cx, cyBase + (o.bounce || 0));
  ctx.rotate(steer * 0.045);

  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, -H * 0.02, bBotW * 1.28, H * 0.12, 0, 0, Math.PI * 2); ctx.fill();

  // Rear aero: big GT wing if upgraded, else the car's own lip spoiler.
  if (wing > 0) {
    const wy = rTopY * 0.9 - H * wing * 0.06, ww = W * (0.86 + wing * 0.07), th = H * (0.05 + wing * 0.015);
    ctx.fillStyle = accent;
    ctx.fillRect(-ww * 0.32, bTopY, W * 0.05, H * 0.16); ctx.fillRect(ww * 0.27, bTopY, W * 0.05, H * 0.16);
    ctx.fillStyle = color; roundRectFill(ctx, -ww / 2, wy, ww, th, th * 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-ww / 2, wy, ww, th * 0.35);
  } else if (S.lip > 0) {
    ctx.fillStyle = shade(color, 0.85);
    roundRectFill(ctx, -bTopW * 1.02, bTopY - H * 0.03 * S.lip, bTopW * 2.04, H * 0.05 * S.lip + 2, 2);
  }

  // Tires (wider with the Tires upgrade + the car's base stance).
  const tireW = W * (S.tireBase + tire * 0.03), tireH = H * 0.36, tx = bBotW - tireW * 0.3;
  ctx.fillStyle = '#15171d';
  for (const s of [-1, 1]) roundRectFill(ctx, s * tx - tireW / 2, -tireH, tireW, tireH, tireW * 0.28);
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#4a4f5a'; ctx.beginPath(); ctx.arc(s * tx, -tireH * 0.5, tireW * 0.26, 0, Math.PI * 2); ctx.fill();
    const bg2 = (braking ? 1 : 0.55) * (0.5 + brake * 0.35);
    ctx.fillStyle = `rgba(255,${braking ? 80 : 120},40,${bg2})`;
    ctx.beginPath(); ctx.arc(s * tx, -tireH * 0.5, tireW * (0.12 + brake * 0.03), 0, Math.PI * 2); ctx.fill();
  }

  // Lower bumper / valance.
  ctx.fillStyle = accent; roundRectFill(ctx, -bBotW, -H * 0.2, bBotW * 2, H * 0.2, H * 0.05);
  // Rear diffuser fins (race-oriented cars).
  if (S.diffuser > 0) {
    ctx.fillStyle = '#0a0c11';
    const n = 5, span = bBotW * 1.5;
    for (let i = 0; i <= n; i++) { const dx = -span / 2 + (span / n) * i; ctx.fillRect(dx - W * 0.006, -H * 0.14 * S.diffuser, W * 0.012, H * 0.14 * S.diffuser); }
  }
  // Exhaust tips + boost flame.
  if (exhaust > 0) {
    ctx.fillStyle = '#c8ccd4';
    const n = exhaust >= 2 ? 2 : 1, gap = W * 0.12, r = W * (0.045 + exhaust * 0.012);
    for (let i = 0; i < n; i++) { const ex = (n === 1 ? 0 : (i === 0 ? -gap : gap)); ctx.beginPath(); ctx.arc(ex, -H * 0.06, r, 0, Math.PI * 2); ctx.fill(); }
    if (boosting) { ctx.fillStyle = 'rgba(120,200,255,0.9)'; for (let i = 0; i < n; i++) { const ex = (n === 1 ? 0 : (i === 0 ? -gap : gap)); flame(ctx, ex, -H * 0.06, W * (0.16 + Math.random() * 0.1)); } }
  } else if (boosting) { flame(ctx, 0, -H * 0.06, W * 0.16); }

  // Main body.
  const grad = ctx.createLinearGradient(0, bTopY, 0, bBotY);
  grad.addColorStop(0, shade(color, 1.25)); grad.addColorStop(1, shade(color, 0.8));
  ctx.fillStyle = grad;
  trap(ctx, -bBotW, bBotY, bBotW, bBotY, bTopW, bTopY, -bTopW, bTopY);
  // Wide rear haunches (muscle / supercar).
  if (S.fender > 0) {
    ctx.fillStyle = shade(color, 0.92);
    for (const s of [-1, 1]) roundRectFill(ctx, s * bBotW - (s < 0 ? W * 0.1 * S.fender : 0), bBotY - H * 0.24, W * 0.1 * S.fender, H * 0.24, W * 0.03);
  }
  // Body character line.
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-bBotW * 0.94, (bBotY + bTopY) / 2, bBotW * 1.88, H * 0.03);

  // Cabin / roof.
  const roofCol = hood > 0 ? shade('#2a2d34', 1 + hood * 0.1) : shade(color, 0.72);
  ctx.fillStyle = roofCol;
  ctx.beginPath(); ctx.moveTo(-rBotW, rBotY); ctx.lineTo(-rTopW, rTopY);
  if (S.rounded) ctx.quadraticCurveTo(0, rTopY - Math.abs(rTopY - rBotY) * 0.14, rTopW, rTopY);
  else ctx.lineTo(rTopW, rTopY);
  ctx.lineTo(rBotW, rBotY); ctx.closePath(); ctx.fill();
  if (hood > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * W * 0.08, rTopY); ctx.lineTo(i * W * 0.08 + W * 0.05, rBotY); ctx.stroke(); } }
  // Roof rails (SUV).
  if (S.rails) { ctx.fillStyle = shade(color, 0.5); for (const s of [-1, 1]) ctx.fillRect(s * rTopW - (s < 0 ? W * 0.03 : 0), rTopY, W * 0.03, Math.abs(rBotY - rTopY)); }

  // Rear window + driver helmet (Driver Skill colour).
  ctx.fillStyle = '#0d1016';
  const wB = rBotW * 0.8, wT = rTopW * 0.78;
  trap(ctx, -wB, rBotY - H * 0.02, wB, rBotY - H * 0.02, wT, rTopY + H * 0.05, -wT, rTopY + H * 0.05);
  if (parts.driver > 0) { ctx.fillStyle = ['#8892a0', '#4dd0ff', '#ffd24d', '#ff5da2'][Math.min(3, parts.driver)]; ctx.beginPath(); ctx.arc(0, (rBotY + rTopY) / 2, W * 0.08, 0, Math.PI * 2); ctx.fill(); }

  // Engine scoop (bulges with Engine upgrade) at the roof peak.
  if (engine > 0) {
    ctx.fillStyle = shade(color, 0.6);
    const sw = W * (0.14 + engine * 0.03), sh = H * (0.06 + engine * 0.02);
    roundRectFill(ctx, -sw / 2, rTopY - sh, sw, sh, sh * 0.4);
    ctx.fillStyle = '#05070b'; ctx.fillRect(-sw / 2 + 2, rTopY - sh + 2, sw - 4, sh * 0.4);
  }

  // Tail lights + brake glow (positioned to the car's body width).
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#5a0f16'; roundRectFill(ctx, s * bBotW * 0.72 - W * 0.08, -H * 0.34, W * 0.16, H * 0.07, 2);
    ctx.fillStyle = braking ? '#ff2b2b' : '#c62b2b';
    if (braking) { ctx.shadowBlur = 10 + brake * 6; ctx.shadowColor = '#ff2b2b'; }
    roundRectFill(ctx, s * bBotW * 0.72 - W * 0.06, -H * 0.33, W * 0.12, H * 0.05, 2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ---- helpers ----
function trap(ctx, x1, y1, x2, y2, x3, y3, x4, y4) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); }
function roundRectFill(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}
function flame(ctx, x, y, len) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x, y, x, y + len);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(120,200,255,0.8)'); g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - len * 0.3, y); ctx.lineTo(x + len * 0.3, y); ctx.lineTo(x, y + len); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function shade(hex, mult) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  r = Math.min(255, r * mult) | 0; g = Math.min(255, g * mult) | 0; b = Math.min(255, b * mult) | 0;
  const s = (n) => n.toString(16).padStart(2, '0');
  return '#' + s(r) + s(g) + s(b);
}
