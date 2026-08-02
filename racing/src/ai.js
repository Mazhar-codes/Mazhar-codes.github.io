// =====================================================================
// ai.js — Opponent racers. Each drives the racing line at its own pace,
// slows for tight curves, keeps to a lane, and rubber-bands gently toward
// the player so races stay close without feeling unfair.
// =====================================================================
import { CONFIG } from './config.js';
import { clamp } from './core.js';

export class Opponent {
  constructor(carDef, stats, env, lane, skill) {
    this.car = carDef; this.stats = stats; this.env = env;
    this.pos = 0; this.x = lane; this.laneTarget = lane; this.speed = 0;
    this.skill = skill;            // 0..1 fraction of its top speed it will hold
    this.laneTimer = 2 + Math.random() * 4;
    this.finished = false; this.finishTime = 0;
  }
  update(dt, track, player, trackLength) {
    const seg = track.findSegment(this.pos);

    // Ease off for sharp corners so they look like they're actually driving.
    const curveSlow = 1 - Math.min(0.55, (Math.abs(seg.curve) / 6) * 0.55);
    let target = this.stats.maxSpeed * this.skill * curveSlow;

    // Rubber-band: catch up a little if far behind, back off if way ahead.
    const gap = (player.pos - this.pos) / trackLength;
    target *= 1 + clamp(gap * 0.6, -0.1, 0.14);

    this.speed += (target - this.speed) * Math.min(1, dt * 1.6);
    this.speed = clamp(this.speed, 0, this.stats.maxSpeed * 1.05);

    // Occasionally pick a new lane so the pack weaves realistically.
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) { this.laneTarget = -0.62 + Math.random() * 1.24; this.laneTimer = 2 + Math.random() * 4; }
    this.x += (this.laneTarget - this.x) * Math.min(1, dt * 1.5);
    // Fight the curve just enough to stay on the black stuff.
    this.x -= seg.curve * 0.00035 * (this.speed / this.stats.maxSpeed);
    this.x = clamp(this.x, -0.92, 0.92);

    this.pos += this.speed * dt;
  }
  kmh() { return Math.round(this.speed * CONFIG.speedToKmh); }
}

// Build a grid of opponents from the remaining cars (excluding the player's).
// Their pace is BRACKETED around the player's *actual* stats (car + upgrades),
// so the field stays competitive no matter how tuned the player's car is —
// and they line up AHEAD of the player so you can see and chase them down.
export function buildGrid(count, carsPool, computeStats, env, playerStats) {
  const grid = [];
  for (let i = 0; i < count; i++) {
    const car = carsPool[i % carsPool.length];
    const stats = computeStats(car, {}, env);
    // Field spans ~0.90×..~1.06× the player's top speed (slower cars in front
    // to be overtaken, a couple genuinely quick rivals to hunt down).
    const spread = count > 1 ? i / (count - 1) : 0;      // 0..1
    const factor = 0.90 + spread * 0.16 + (Math.random() * 0.03 - 0.015);
    stats.maxSpeed = playerStats.maxSpeed * factor;
    stats.accelRate = playerStats.accelRate * (0.95 + Math.random() * 0.12);
    const lane = -0.55 + spread * 1.1;
    const o = new Opponent(car, stats, env, lane, 1.0);
    // Grid AHEAD of the player, well staggered in depth so they read as a line
    // receding up the road (not a giant wall right on the player's bumper).
    o.pos = CONFIG.segmentLength * (14 + i * 8);
    grid.push(o);
  }
  return grid;
}
