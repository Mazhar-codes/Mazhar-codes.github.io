// =====================================================================
// track.js — Procedural course builder. Composes straights, curves and
// hills (scaled by each environment's feel), scatters roadside props,
// marks the start/finish line, and precomputes a top-down minimap path.
// Deterministic per track seed so a course is always identical.
// =====================================================================
import { CONFIG, ENVIRONMENTS } from './config.js';
import { mulberry32, easeIn, easeInOut } from './core.js';

const LEN = { SHORT: 25, MEDIUM: 50, LONG: 100 };
const CURVE = { EASY: 2, MEDIUM: 4, HARD: 6 };
// Gentle hills — steep values made the road drop out of view on crests
// (the car looked like it was floating). Keep elevation subtle.
const HILL = { LOW: 8, MEDIUM: 16, HIGH: 24 };

export class Track {
  constructor(trackDef, mode) {
    this.def = trackDef;
    this.env = ENVIRONMENTS[trackDef.env];
    this.mode = mode;
    this.rng = mulberry32(trackDef.seed + (mode.id === 'sprint' ? 7000 : 0));
    this.segments = [];
    this._build();
    this._addProps();
    this._addObstacles();
    this._buildMinimap();
  }

  get segCount() { return this.segments.length; }
  get length() { return this.segments.length * CONFIG.segmentLength; }
  findSegment(z) {
    const i = Math.floor(z / CONFIG.segmentLength) % this.segments.length;
    return this.segments[(i + this.segments.length) % this.segments.length];
  }

  // ---- low-level builder (Out Run style) ----
  _lastY() { return this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y; }
  _addSegment(curve, y) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: { world: { y: this._lastY(), z: n * CONFIG.segmentLength }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * CONFIG.segmentLength }, camera: {}, screen: {} },
      curve,
      dark: Math.floor(n / CONFIG.rumbleLength) % 2 === 0,
      props: [], cars: [], obstacles: [], finish: false,
    });
  }
  _addRoad(enter, hold, leave, curve, y) {
    const startY = this._lastY();
    const endY = startY + y * CONFIG.segmentLength;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this._addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this._addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this._addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }
  _straight(n = LEN.MEDIUM) { this._addRoad(n, n, n, 0, 0); }
  _curve(n, c, h = 0) { this._addRoad(n, n, n, c, h); }
  _hill(n, h) { this._addRoad(n, n, n, 0, h); }
  _scurve(cv, hl) { // an S: one way then the other, with a little elevation
    this._addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, -cv, hl);
    this._addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, cv, -hl);
  }

  _build() {
    const f = this.env.feature;
    const cMul = f.curviness, hMul = f.hills;
    const rng = this.rng;
    const targetSegs = Math.round(this.def.length * (this.mode.lengthMult || 1));

    // A short flat run off the line so the grid can launch cleanly.
    this._straight(LEN.SHORT);
    // Compose random sections until we reach the target length.
    const sideSign = () => (rng() < 0.5 ? -1 : 1);
    while (this.segments.length < targetSegs) {
      const roll = rng();
      const cur = (rng() < 0.5 ? CURVE.EASY : rng() < 0.7 ? CURVE.MEDIUM : CURVE.HARD) * cMul * sideSign();
      const hgt = (rng() < 0.5 ? HILL.LOW : HILL.MEDIUM) * hMul;
      if (roll < 0.22) this._straight(rng() < 0.5 ? LEN.MEDIUM : LEN.LONG);
      else if (roll < 0.5) this._curve(rng() < 0.5 ? LEN.MEDIUM : LEN.LONG, cur, rng() < 0.5 ? hgt : 0);
      else if (roll < 0.72) this._scurve(Math.abs(cur), hgt);
      else if (roll < 0.9) this._hill(LEN.MEDIUM, sideSign() * hgt);
      else { // rolling bumps
        for (let k = 0; k < 4; k++) this._hill(LEN.SHORT, sideSign() * HILL.LOW * hMul);
      }
    }
    // Smooth the elevation back toward 0 at the end so a lap loops nicely.
    this._addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.LONG, 0, -this._lastY() / CONFIG.segmentLength);
    this._straight(LEN.SHORT);

    // Start/finish stripe over the first few segments.
    for (let i = 0; i < CONFIG.rumbleLength * 2 && i < this.segments.length; i++) this.segments[i].finish = true;
    this.startLine = 0;
  }

  _addProps() {
    const rng = this.rng, props = this.env.props, density = this.env.density;
    for (let i = 10; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (rng() < density * 0.5) {
        const side = rng() < 0.5 ? -1 : 1;
        seg.props.push({ type: props[(rng() * props.length) | 0], offset: side * (1.25 + rng() * 2.4) });
      }
      // City/mountain get denser walls of props on both sides.
      if ((this.env.id === 'city' || this.env.id === 'mountain') && rng() < density * 0.4) {
        const side = rng() < 0.5 ? -1 : 1;
        seg.props.push({ type: props[(rng() * props.length) | 0], offset: side * (1.35 + rng() * 1.8) });
      }
    }
  }

  // On-road hazards spaced along the course. Environment-specific, placed at
  // a lateral offset within the road so the player must dodge them. Skips the
  // launch zone and the run-in to the finish so laps stay fair.
  _addObstacles() {
    const rng = this.rng, types = this.env.hazards || ['rock'];
    const start = 120, end = this.segments.length - 60;
    let next = start + Math.floor(rng() * 30);
    for (let i = start; i < end; i++) {
      if (i < next) continue;
      const seg = this.segments[i];
      // Lateral offset within the road, biased away from dead-centre so there's
      // always a clean line through — never a wall you can't avoid.
      const offset = (rng() < 0.5 ? -1 : 1) * (0.18 + rng() * 0.52);
      seg.obstacles.push({ type: types[(rng() * types.length) | 0], offset, hit: false, bob: rng() * Math.PI * 2 });
      // Sparse: a hazard roughly every ~35–75 segments.
      const gap = 35 + Math.floor(rng() * 40);
      next = i + gap;
    }
  }

  // Top-down path for the minimap: integrate heading from the curve values.
  _buildMinimap() {
    let heading = 0, x = 0, y = 0;
    const pts = []; const step = 3;
    for (let i = 0; i < this.segments.length; i++) {
      heading += this.segments[i].curve * 0.0055;
      x += Math.sin(heading); y += Math.cos(heading);
      if (i % step === 0) pts.push({ x, y });
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pts) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    this.mapPoints = pts; this.mapStep = step;
    this.mapBounds = { minx, miny, maxx, maxy, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
  }
  // Map a track z position to a point index on the minimap path.
  // Wraps (laps) and clamps so pre-grid negative positions stay in range.
  mapIndexForZ(z) {
    const n = this.segments.length;
    let seg = Math.floor(z / CONFIG.segmentLength) % n;
    seg = ((seg % n) + n) % n;
    return Math.max(0, Math.min(this.mapPoints.length - 1, Math.floor(seg / this.mapStep)));
  }

  // Resolve the palette for a segment (handles stripes + finish line).
  colors(seg) {
    const e = this.env;
    if (seg.finish) {
      const c = seg.dark;
      return { grass: c ? e.grass[1] : e.grass[0], road: c ? '#e9e9e9' : '#20242c', rumble: c ? '#20242c' : '#e9e9e9', lane: null, fog: e.haze };
    }
    return {
      grass: seg.dark ? e.grass[1] : e.grass[0],
      road: seg.dark ? e.road[1] : e.road[0],
      rumble: seg.dark ? e.rumble[0] : e.rumble[1],
      lane: (Math.floor(seg.index / CONFIG.rumbleLength) % 2 === 0) ? e.lane : null,
      fog: e.haze,
    };
  }
}
