// =====================================================================
// core.js — Engine primitives for Nitro Rush: math, seeded RNG, Storage
// (per-mode saves + prefs), fixed-resolution Canvas, Input (steer/gas/
// brake/boost + touch), AudioEngine (continuous engine hum + SFX), EventBus.
// Zero dependencies, fully procedural (no asset files required).
// =====================================================================

// ------------------------- Math / utils ------------------------------
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
export const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

// Deterministic PRNG (mulberry32) so a given track seed always builds the
// same course — important for fair leaderboards & reproducible tuning.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------- EventBus ----------------------------------
export class EventBus {
  constructor() { this.map = new Map(); }
  on(evt, fn) { (this.map.get(evt) || this.map.set(evt, new Set()).get(evt)).add(fn); return () => this.off(evt, fn); }
  off(evt, fn) { const s = this.map.get(evt); if (s) s.delete(fn); }
  emit(evt, data) { const s = this.map.get(evt); if (s) for (const fn of s) fn(data); }
}

// ------------------------- Storage (with tamper check) ---------------
function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const KEY = 'nitrorush.save.v1';
export const Storage = {
  load(key = KEY) {
    try {
      const raw = localStorage.getItem(key); if (!raw) return null;
      const { d, c } = JSON.parse(raw);
      if (checksum(d) !== c) { console.warn('Save integrity check failed, ignoring.'); return null; }
      return JSON.parse(d);
    } catch (e) { return null; }
  },
  save(obj, key = KEY) {
    try { const d = JSON.stringify(obj); localStorage.setItem(key, JSON.stringify({ d, c: checksum(d) })); }
    catch (e) { /* storage unavailable (private mode) */ }
  },
  clear(key = KEY) { try { localStorage.removeItem(key); } catch (e) {} },
  getPref(k, fallback = null) { try { return localStorage.getItem('nitrorush.' + k) ?? fallback; } catch (e) { return fallback; } },
  setPref(k, v) { try { localStorage.setItem('nitrorush.' + k, v); } catch (e) {} },
};

// ------------------------- Canvas (fixed res + letterbox) ------------
// A fixed internal resolution keeps the pseudo-3D projection math simple
// and stable; CSS scales the canvas to fit the viewport, preserving aspect.
export class Canvas {
  constructor(el) {
    this.el = el;
    this.ctx = el.getContext('2d', { alpha: false });
    this.width = el.width; this.height = el.height;
    this.scale = 1; this.offsetX = 0; this.offsetY = 0;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }
  fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / this.width, vh / this.height);
    const w = Math.round(this.width * s), h = Math.round(this.height * s);
    this.el.style.width = w + 'px'; this.el.style.height = h + 'px';
    this.scale = s; this.offsetX = (vw - w) / 2; this.offsetY = (vh - h) / 2;
  }
  // Map a viewport (client) coordinate into canvas pixel space.
  toCanvas(clientX, clientY) {
    return { x: (clientX - this.offsetX) / this.scale, y: (clientY - this.offsetY) / this.scale };
  }
}

// ------------------------- Input -------------------------------------
// Unifies keyboard + touch into a driving intent: steer (-1..1), throttle,
// brake, boost, plus edge-triggered menu keys.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.touch = { left: false, right: false, brake: false, boost: false, gas: false };
    this.usingTouch = false;

    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Lose keys if the tab is backgrounded (prevents "stuck throttle").
    addEventListener('blur', () => this.keys.clear());

    // Touch buttons are wired by UI via bindTouch().
  }
  bindTouch(root) {
    root.querySelectorAll('[data-touch]').forEach((b) => {
      const k = b.dataset.touch;
      const on = (e) => { e.preventDefault(); this.usingTouch = true; this.touch[k] = true; };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    });
  }
  // -1 (full left) .. +1 (full right)
  steer() {
    let s = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.touch.left) s -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.touch.right) s += 1;
    return s;
  }
  throttle() {
    // On touch, holding no brake means "go" (auto-throttle for one-thumb play).
    if (this.usingTouch) return this.touch.brake ? 0 : 1;
    return (this.keys.has('ArrowUp') || this.keys.has('KeyW')) ? 1 : 0;
  }
  braking() {
    if (this.usingTouch) return this.touch.brake ? 1 : 0;
    return (this.keys.has('ArrowDown') || this.keys.has('KeyS')) ? 1 : 0;
  }
  boosting() { return this.keys.has('ShiftLeft') || this.keys.has('Space') || this.touch.boost; }
}

// ------------------------- AudioEngine (procedural) ------------------
export class AudioEngine {
  constructor() { this.ctx = null; this.enabled = true; this.master = null; this.engine = null; }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.35 : 0; }

  _tone({ freq = 440, type = 'square', dur = 0.1, vol = 0.5, slide = 0 }) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + dur);
  }
  _noise({ dur = 0.2, vol = 0.5 }) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g); g.connect(this.master); src.start(t);
  }

  // Continuous engine: a detuned oscillator pair whose pitch tracks RPM. The
  // `profile` (per car) sets waveforms, detune and pitch range so every car
  // has a distinct engine voice.
  startEngine(profile = {}) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx || this.engine) return;
    const prof = { w1: profile.w1 || 'sawtooth', w2: profile.w2 || 'square', detune: profile.detune ?? -12, base: profile.base || 55, range: profile.range || 320 };
    const g = this.ctx.createGain(); g.gain.value = 0.0; g.connect(this.master);
    const o1 = this.ctx.createOscillator(); o1.type = prof.w1;
    const o2 = this.ctx.createOscillator(); o2.type = prof.w2;
    o2.detune.value = prof.detune;
    o1.connect(g); o2.connect(g);
    o1.start(); o2.start();
    this.engine = { g, o1, o2, prof };
  }
  stopEngine() {
    if (!this.engine) return;
    try { this.engine.o1.stop(); this.engine.o2.stop(); } catch (e) {}
    this.engine = null;
  }
  // rpm01 in 0..1 (idle→redline); load 0..1 raises volume under throttle.
  setEngine(rpm01, load = 0.5) {
    if (!this.engine || !this.ctx) return;
    const p = this.engine.prof;
    const base = p.base + rpm01 * p.range;            // Hz
    const t = this.ctx.currentTime;
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.03);
    this.engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.engine.g.gain.setTargetAtTime(this.enabled ? (0.05 + 0.10 * load) : 0, t, 0.05);
  }

  gearShift() { this._tone({ freq: 180, type: 'square', dur: 0.05, vol: 0.10, slide: 60 }); }
  bump()      { this._noise({ dur: 0.12, vol: 0.25 }); this._tone({ freq: 90, type: 'triangle', dur: 0.12, vol: 0.2, slide: -30 }); }
  skid()      { this._noise({ dur: 0.18, vol: 0.12 }); }
  boost()     { this._noise({ dur: 0.4, vol: 0.16 }); this._tone({ freq: 260, type: 'sawtooth', dur: 0.5, vol: 0.24, slide: 680 }); this._tone({ freq: 520, type: 'sine', dur: 0.3, vol: 0.12, slide: 400 }); }
  ui()        { this._tone({ freq: 520, type: 'sine', dur: 0.05, vol: 0.2 }); }
  countdown(hi) { this._tone({ freq: hi ? 880 : 440, type: 'sine', dur: 0.2, vol: 0.3 }); }
  finish()    { this._tone({ freq: 660, type: 'sine', dur: 0.15, vol: 0.3, slide: 220 }); setTimeout(() => this._tone({ freq: 990, type: 'sine', dur: 0.3, vol: 0.3 }), 140); }
  coin()      { this._tone({ freq: 880, type: 'sine', dur: 0.08, vol: 0.22, slide: 400 }); }
}
