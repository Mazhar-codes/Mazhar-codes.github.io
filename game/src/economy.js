// =====================================================================
// economy.js — Persistent progression: coins, ownership, upgrades,
// and computing the effective player loadout stats from all sources.
// =====================================================================
import { Storage } from './core.js';
import { SHIPS, WEAPONS, MISSILES, UPGRADES, SKINS, CONFIG, DEFAULT_MODE } from './config.js';

const byId = (arr, id) => arr.find((x) => x.id === id);
const KEY_FREE = 'devastator.save.v1';
const KEY_HARDCORE = 'devastator.save.hardcore.v1';

export class Economy {
  constructor(mode = DEFAULT_MODE) {
    this.mode = mode === 'hardcore' ? 'hardcore' : 'free';
    this.key = this.mode === 'hardcore' ? KEY_HARDCORE : KEY_FREE;
    this.state = this._default();
    const saved = Storage.load(this.key);
    if (saved) this.state = Object.assign(this._default(), saved);
  }
  // Free mode gives everything at zero cost; hardcore enforces the economy.
  isFree() { return this.mode !== 'hardcore'; }
  _default() {
    return {
      coins: 0,
      highScore: 0,
      ownedShips: ['scout'],
      ownedWeapons: ['blaster'],
      ownedMissiles: ['none'],
      ownedSkins: ['stock'],
      selectedShip: 'scout',
      selectedWeapon: 'blaster',
      selectedMissile: 'none',
      selectedSkin: 'stock',
      upgrades: { engine: 0, armor: 0, damage: 0, firerate: 0, magnet: 0, shield: 0 },
      settings: { sound: true },
      stats: {},          // lifetime achievement stats (managed by Achievements)
      unlocked: [],       // unlocked achievement ids
    };
  }
  save() { Storage.save(this.state, this.key); }

  addCoins(n) { this.state.coins += n; this.save(); }
  spend(n) { if (this.state.coins < n) return false; this.state.coins -= n; this.save(); return true; }

  // ---- Upgrade pricing scales geometrically with current level ----
  upgradeLevel(id) { return this.state.upgrades[id] || 0; }
  upgradePrice(id) {
    const def = byId(UPGRADES, id); const lvl = this.upgradeLevel(id);
    if (lvl >= def.max) return null; // maxed
    if (this.isFree()) return 0;
    return Math.round(def.basePrice * Math.pow(def.priceMult, lvl));
  }
  buyUpgrade(id) {
    const price = this.upgradePrice(id);
    if (price == null) return { ok: false, reason: 'maxed' };
    if (!this.spend(price)) return { ok: false, reason: 'poor' };
    this.state.upgrades[id]++; this.save();
    return { ok: true };
  }

  // ---- Generic item purchase (ship/weapon/missile/skin) ----
  _buy(catalog, ownedKey, id) {
    const def = byId(catalog, id);
    if (!def) return { ok: false, reason: 'invalid' };
    if (this.state[ownedKey].includes(id)) return { ok: false, reason: 'owned' };
    if (!this.spend(this.isFree() ? 0 : def.price)) return { ok: false, reason: 'poor' };
    this.state[ownedKey].push(id); this.save();
    return { ok: true };
  }
  buyShip(id)    { return this._buy(SHIPS, 'ownedShips', id); }
  buyWeapon(id)  { return this._buy(WEAPONS, 'ownedWeapons', id); }
  buyMissile(id) { return this._buy(MISSILES, 'ownedMissiles', id); }
  buySkin(id)    { return this._buy(SKINS, 'ownedSkins', id); }

  select(kind, id) {
    const map = { ship: 'selectedShip', weapon: 'selectedWeapon', missile: 'selectedMissile', skin: 'selectedSkin' };
    const owned = { ship: 'ownedShips', weapon: 'ownedWeapons', missile: 'ownedMissiles', skin: 'ownedSkins' };
    if (!this.state[owned[kind]].includes(id)) return false;
    this.state[map[kind]] = id; this.save(); return true;
  }

  owns(kind, id) {
    const owned = { ship: 'ownedShips', weapon: 'ownedWeapons', missile: 'ownedMissiles', skin: 'ownedSkins' };
    return this.state[owned[kind]].includes(id);
  }

  // True once the player owns every ship and every weapon (for achievements).
  ownsAllShipsWeapons() {
    return SHIPS.every((s) => this.state.ownedShips.includes(s.id)) &&
           WEAPONS.every((w) => this.state.ownedWeapons.includes(w.id));
  }

  // ---- Compute the effective stats used by the Player each run ----
  computeStats() {
    const s = this.state;
    const ship = byId(SHIPS, s.selectedShip);
    const weapon = byId(WEAPONS, s.selectedWeapon);
    const missile = byId(MISSILES, s.selectedMissile);
    const skin = byId(SKINS, s.selectedSkin);
    const u = s.upgrades;
    const def = (id) => UPGRADES.find((x) => x.id === id);

    return {
      shipId: ship.id,
      color: ship.color,
      trail: skin.trail,
      hitRadius: CONFIG.player.hitRadius,
      maxHp: Math.round(ship.hp * (1 + u.armor * def('armor').perLevel)),
      speedMult: ship.speedMult * (1 + u.engine * def('engine').perLevel),
      fireMult: ship.fireMult * (1 + u.firerate * def('firerate').perLevel),
      damageMult: 1 * (1 + u.damage * def('damage').perLevel),
      weapon,
      missile,
      magnetRange: 45 + u.magnet * def('magnet').perLevel,
      shieldMax: u.shield * def('shield').perLevel,
    };
  }

  recordScore(score) {
    if (score > this.state.highScore) { this.state.highScore = score; this.save(); return true; }
    return false;
  }
}
