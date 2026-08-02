// =====================================================================
// core.js — Engine primitives shared across the game:
//   math utils, EventBus, Storage, Canvas, Input, AudioEngine, Pool
// No external dependencies. All procedural (no asset files required).
// =====================================================================

// ------------------------- Math / utils ------------------------------
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// ------------------------- EventBus ----------------------------------
export class EventBus {
  constructor() { this.map = new Map(); }
  on(evt, fn) { (this.map.get(evt) || this.map.set(evt, new Set()).get(evt)).add(fn); return () => this.off(evt, fn); }
  off(evt, fn) { const s = this.map.get(evt); if (s) s.delete(fn); }
  emit(evt, data) { const s = this.map.get(evt); if (s) for (const fn of s) fn(data); }
}

// ------------------------- Storage (with tamper check) ---------------
// Lightweight integrity check discourages casual localStorage editing.
const SAVE_KEY = 'devastator.save.v1';
function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
export const Storage = {
  // `key` lets each game mode (free / hardcore) keep an independent save slot.
  load(key = SAVE_KEY) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { d, c } = JSON.parse(raw);
      if (checksum(d) !== c) { console.warn('Save integrity check failed, ignoring.'); return null; }
      return JSON.parse(d);
    } catch (e) { return null; }
  },
  save(obj, key = SAVE_KEY) {
    try {
      const d = JSON.stringify(obj);
      localStorage.setItem(key, JSON.stringify({ d, c: checksum(d) }));
    } catch (e) { /* storage may be unavailable (private mode) */ }
  },
  clear(key = SAVE_KEY) { try { localStorage.removeItem(key); } catch (e) {} },
  // Tiny un-checksummed prefs (e.g. last chosen mode).
  getPref(k, fallback = null) { try { return localStorage.getItem('devastator.' + k) ?? fallback; } catch (e) { return fallback; } },
  setPref(k, v) { try { localStorage.setItem('devastator.' + k, v); } catch (e) {} },
};

// ------------------------- Canvas (responsive + DPR) -----------------
export class Canvas {
  constructor(el) {
    this.el = el;
    this.ctx = el.getContext('2d', { alpha: false });
    this.width = 0; this.height = 0; this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    // Cap DPR at 2 to protect fill-rate on high-density mobile screens.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.el.width = Math.floor(w * this.dpr);
    this.el.height = Math.floor(h * this.dpr);
    this.el.style.width = w + 'px';
    this.el.style.height = h + 'px';
    // Work in CSS pixels; the context scales to device pixels.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}

// ------------------------- Input -------------------------------------
// Unifies keyboard, mouse and touch into a simple intent model:
//   move vector (aim target) + fire + secondary.
export class Input {
  constructor(canvasEl) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false, down: false };
    this.fire = false;
    this.secondary = false;
    this.usePointerAim = false; // becomes true on mouse/touch use

    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space') this.fire = true;
      if (e.code === 'ShiftLeft' || e.code === 'KeyX') this.secondary = true;
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.fire = false;
      if (e.code === 'ShiftLeft' || e.code === 'KeyX') this.secondary = false;
    });

    const setPtr = (x, y) => { this.pointer.x = x; this.pointer.y = y; this.usePointerAim = true; };
    canvasEl.addEventListener('mousemove', (e) => setPtr(e.clientX, e.clientY));
    canvasEl.addEventListener('mousedown', (e) => { setPtr(e.clientX, e.clientY); this.pointer.down = true; this.fire = true; });
    addEventListener('mouseup', () => { this.pointer.down = false; this.fire = false; });

    canvasEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0]; setPtr(t.clientX, t.clientY);
      this.pointer.active = true; this.fire = true;
    }, { passive: false });
    canvasEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0]; setPtr(t.clientX, t.clientY);
    }, { passive: false });
    canvasEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length === 0) { this.pointer.active = false; this.fire = false; }
    }, { passive: false });
  }

  // Directional intent from WASD/arrows (−1..1 each axis), normalized.
  moveAxis() {
    let x = 0, y = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
    if (x || y) { const m = Math.hypot(x, y); return { x: x / m, y: y / m }; }
    return { x: 0, y: 0 };
  }
}

// ------------------------- AudioEngine (procedural) ------------------
// Generates SFX with WebAudio oscillators/noise — no audio files needed.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.enabled = true; this.master = null;
  }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.35 : 0; }

  _tone({ freq = 440, type = 'square', dur = 0.1, vol = 0.5, slide = 0 }) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }
  _noise({ dur = 0.2, vol = 0.5 }) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g); g.connect(this.master); src.start(t);
  }

  shoot()   { this._tone({ freq: 720, type: 'square',   dur: 0.06, vol: 0.18, slide: -400 }); }
  laser()   { this._tone({ freq: 1200, type: 'sawtooth',dur: 0.05, vol: 0.12, slide: -600 }); }
  missile() { this._tone({ freq: 300, type: 'sawtooth', dur: 0.25, vol: 0.25, slide: 500 }); }
  // Per-weapon firing voice — each gun sounds distinct.
  weapon(w) {
    switch (w.id) {
      case 'pulse':   return this.laser();
      case 'gatling': return this._tone({ freq: 880,  type: 'square',   dur: 0.035, vol: 0.10, slide: -260 });
      case 'flak':    return this._noise({ dur: 0.13, vol: 0.30 });
      case 'wave':    return this._tone({ freq: 560,  type: 'sine',     dur: 0.13,  vol: 0.14, slide: 360 });
      case 'rail':    this._tone({ freq: 1600, type: 'sawtooth', dur: 0.20, vol: 0.22, slide: -1200 });
                      return this._tone({ freq: 220, type: 'triangle', dur: 0.18, vol: 0.16, slide: -80 });
      case 'twin':    return this._tone({ freq: 760, type: 'square',   dur: 0.06,  vol: 0.16, slide: -380 });
      default:        return this.shoot();
    }
  }
  hit()     { this._tone({ freq: 200, type: 'square',   dur: 0.05, vol: 0.15, slide: -100 }); }
  explode() { this._noise({ dur: 0.3, vol: 0.4 }); this._tone({ freq: 90, type: 'triangle', dur: 0.3, vol: 0.3, slide: -40 }); }
  pickup()  { this._tone({ freq: 880, type: 'sine',     dur: 0.08, vol: 0.25, slide: 400 }); }
  ui()      { this._tone({ freq: 520, type: 'sine',     dur: 0.05, vol: 0.2 }); }
  hurt()    { this._tone({ freq: 160, type: 'sawtooth', dur: 0.2, vol: 0.3, slide: -80 }); }
  wave()    { this._tone({ freq: 440, type: 'sine', dur: 0.12, vol: 0.25, slide: 200 }); }
}

// ------------------------- Object Pool -------------------------------
// Reuses instances to avoid GC churn (critical for bullets/particles).
export class Pool {
  constructor(factory) { this.factory = factory; this.free = []; this.active = []; }
  spawn(init) {
    const obj = this.free.pop() || this.factory();
    obj.alive = true;
    if (init) init(obj);
    this.active.push(obj);
    return obj;
  }
  // Call each frame: updates actives, recycles the dead.
  update(dt, ctxArgs) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.update(dt, ctxArgs);
      if (!o.alive) {
        this.active.splice(i, 1);
        this.free.push(o);
      }
    }
  }
  draw(ctx) { for (const o of this.active) o.draw(ctx); }
  clear() { this.free.push(...this.active); this.active.length = 0; }
}
