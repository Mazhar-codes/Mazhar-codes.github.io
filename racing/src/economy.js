// =====================================================================
// economy.js — Persistent progression: credits, owned cars, per-car
// upgrade levels, and best lap/race times. Free vs Hardcore each keep an
// independent save slot, so Hardcore always starts from a bone-stock grid.
// =====================================================================
import { Storage } from './core.js';
import { CARS, UPGRADES, DEFAULT_MODE } from './config.js';

const byId = (arr, id) => arr.find((x) => x.id === id);
const KEY_FREE = 'nitrorush.save.v1';
const KEY_HARDCORE = 'nitrorush.save.hardcore.v1';

export class Economy {
  constructor(mode = DEFAULT_MODE) {
    this.mode = mode === 'hardcore' ? 'hardcore' : 'free';
    this.key = this.mode === 'hardcore' ? KEY_HARDCORE : KEY_FREE;
    this.state = this._default();
    const saved = Storage.load(this.key);
    if (saved) this.state = Object.assign(this._default(), saved);
    // Hardcore starts with a little seed money so the first upgrade is reachable.
    if (this.mode === 'hardcore' && !saved) this.state.credits = 1500;
  }
  isFree() { return this.mode !== 'hardcore'; }
  _default() {
    return {
      credits: 0,
      ownedCars: ['cadet'],
      selectedCar: 'cadet',
      upgrades: {},          // { carId: { engine:0, tires:0, ... } }
      best: {},              // { "trackId:mode": { time, lap } }
      settings: { sound: true },
    };
  }
  save() { Storage.save(this.state, this.key); }

  addCredits(n) { this.state.credits += n; this.save(); }
  spend(n) { if (this.state.credits < n) return false; this.state.credits -= n; this.save(); return true; }

  // ---- Cars ----
  owns(id) { return this.state.ownedCars.includes(id); }
  buyCar(id) {
    const def = byId(CARS, id); if (!def) return { ok: false, reason: 'invalid' };
    if (this.owns(id)) return { ok: false, reason: 'owned' };
    if (!this.spend(this.isFree() ? 0 : def.price)) return { ok: false, reason: 'poor' };
    this.state.ownedCars.push(id); this.save();
    return { ok: true };
  }
  select(id) { if (this.owns(id)) { this.state.selectedCar = id; this.save(); return true; } return false; }
  ownsAllCars() { return CARS.every((c) => this.owns(c.id)); }

  // ---- Upgrades (per car) ----
  carUpgrades(carId) {
    if (!this.state.upgrades[carId]) this.state.upgrades[carId] = {};
    return this.state.upgrades[carId];
  }
  upgradeLevel(carId, id) { return this.carUpgrades(carId)[id] || 0; }
  upgradePrice(carId, id) {
    const def = byId(UPGRADES, id); const lvl = this.upgradeLevel(carId, id);
    if (lvl >= def.max) return null;
    if (this.isFree()) return 0;
    return Math.round(def.basePrice * Math.pow(def.priceMult, lvl));
  }
  buyUpgrade(carId, id) {
    const price = this.upgradePrice(carId, id);
    if (price == null) return { ok: false, reason: 'maxed' };
    if (!this.spend(price)) return { ok: false, reason: 'poor' };
    const u = this.carUpgrades(carId); u[id] = (u[id] || 0) + 1; this.save();
    return { ok: true };
  }

  // ---- Results / bests ----
  resultKey(trackId, modeId) { return `${trackId}:${modeId}`; }
  recordResult(trackId, modeId, timeMs, bestLapMs) {
    const k = this.resultKey(trackId, modeId);
    const cur = this.state.best[k] || { time: Infinity, lap: Infinity };
    let improved = false;
    if (timeMs < cur.time) { cur.time = timeMs; improved = true; }
    if (bestLapMs && bestLapMs < cur.lap) { cur.lap = bestLapMs; improved = true; }
    this.state.best[k] = cur; this.save();
    return improved;
  }
  best(trackId, modeId) { return this.state.best[this.resultKey(trackId, modeId)] || null; }
}
