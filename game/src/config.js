// =====================================================================
// config.js — All tunable constants + game data (ships, weapons, etc.)
// Keeping data separate from logic makes balancing & content easy.
// =====================================================================

// Game modes (chosen on the menu, persisted per player):
//   'free'     — everything in the shop costs 0; pick any ship/gun/rocket.
//   'hardcore' — full coin economy; nothing is given. Separate save slot.
// Each mode has its own progression so Hardcore always starts locked.
export const DEFAULT_MODE = 'free';

// Render ships/enemies as real 3D low-poly meshes (self-contained software
// renderer). If a ship ever looks off, set false to fall back to 2D vector art.
export const RENDER_3D = true;

// 3D display tuning: fixed camera tilt so top-down craft show their 3D form.
export const R3D = { pitch: 0.62, light: [-0.35, -0.5, 0.78], ambient: 0.32 };

export const CONFIG = {
  // Reference resolution used for tuning. The world scales to fit the
  // viewport but gameplay speeds are authored against this size.
  refWidth: 1280,
  refHeight: 720,

  // Fixed-timestep physics (deterministic, frame-rate independent).
  fixedDt: 1 / 120,          // physics step (seconds)
  maxFrameTime: 0.25,        // clamp huge frame gaps (tab switch, etc.)

  player: {
    accel: 2600,             // px/s^2 thrust
    drag: 6.5,               // velocity damping per second
    maxSpeed: 620,           // px/s cap
    hitRadius: 16,
    invulnOnSpawn: 2.0,      // seconds of i-frames after (re)spawn
  },

  starLayers: [              // parallax depth layers => pseudo-3D
    { count: 60, speed: 18,  size: 1.0, alpha: 0.35 },
    { count: 40, speed: 42,  size: 1.6, alpha: 0.55 },
    { count: 24, speed: 90,  size: 2.4, alpha: 0.9  },
  ],

  spawn: {
    baseInterval: 1.4,       // seconds between spawns at wave 1
    minInterval: 0.35,
    intervalDecayPerWave: 0.06,
    waveKills: 12,           // kills to advance a wave
  },

  economy: {
    coinPerKill: 1,
    coinDropChance: 0.35,    // chance an enemy drops a coin pickup
    reviveCostCoins: 150,    // fallback revive price if player skips ad
  },

  // Difficulty scaling helpers (multipliers per wave).
  difficulty: {
    enemyHpPerWave: 0.14,
    enemySpeedPerWave: 0.05,
    enemyDamagePerWave: 0.04,
  },

  // Round structure: a boss appears on every Nth wave; a bonus coin-rush
  // stage follows each boss.
  rounds: {
    bossEvery: 5,          // boss on wave 5, 10, 15, ...
    bonusDuration: 14,     // seconds of coin rush
    bonusCrateInterval: 0.4,
  },

  // Combo: chained kills raise a score/coin multiplier that decays.
  combo: {
    window: 2.6,           // seconds before combo resets
    perTier: 4,            // kills per +0.5x tier
    maxMult: 6,            // hard cap
  },

  // Game-feel "juice" tuning.
  feel: {
    hitStopKill: 0.035,    // brief freeze on a normal kill (seconds)
    hitStopBoss: 0.12,     // longer freeze when a boss dies
    maxHitStop: 0.13,      // clamp so the game never stalls
    flashDecay: 4.2,       // screen-flash fade speed (alpha/sec)
  },

  // Drifting nebula clouds behind the starfield (pseudo-depth backdrop).
  nebula: [
    { hue: '#3a1d6e', x: 0.24, y: 0.30, r: 0.55, drift: 6,  alpha: 0.26 },
    { hue: '#0e4d63', x: 0.78, y: 0.62, r: 0.62, drift: -4, alpha: 0.22 },
    { hue: '#5c1750', x: 0.55, y: 0.18, r: 0.40, drift: 3,  alpha: 0.18 },
  ],
};

// ---------------------------------------------------------------------
// SHIPS — buyable hulls with distinct base stats.
// ---------------------------------------------------------------------
export const SHIPS = [
  { id: 'scout',   name: 'Scout',      price: 0,    hp: 100, speedMult: 1.10, fireMult: 1.00, color: '#4dd0ff', desc: 'Balanced starter. Fast and nimble.' },
  { id: 'striker', name: 'Striker',    price: 800,  hp: 130, speedMult: 1.00, fireMult: 1.20, color: '#ff5da2', desc: 'Higher rate of fire. Aggressive.' },
  { id: 'tank',    name: 'Aegis',      price: 1800, hp: 220, speedMult: 0.90, fireMult: 0.95, color: '#8cff6b', desc: 'Heavy armor. Soaks up damage.' },
  { id: 'phantom', name: 'Phantom',    price: 4200, hp: 150, speedMult: 1.25, fireMult: 1.15, color: '#c58cff', desc: 'Elite hull. Speed and firepower.' },
  { id: 'titan',   name: 'Titan',      price: 5000, hp: 320, speedMult: 0.82, fireMult: 1.00, color: '#ffb84d', desc: 'Fortress hull. Immense armor.' },
  { id: 'reaper',  name: 'Reaper',     price: 6800, hp: 120, speedMult: 1.32, fireMult: 1.28, color: '#ff3d6e', desc: 'Glass cannon. Blistering speed & fire.' },
  { id: 'nova',    name: 'Nova',       price: 9000, hp: 190, speedMult: 1.20, fireMult: 1.30, color: '#4dffd2', desc: 'Apex prototype. No weakness.' },
];

// ---------------------------------------------------------------------
// WEAPONS — primary guns the player can own/switch.
// ---------------------------------------------------------------------
export const WEAPONS = [
  { id: 'blaster', name: 'Blaster',    price: 0,    fireRate: 6,  damage: 10, speed: 900, kind: 'single', color: '#7df9ff', desc: 'Reliable single-shot.' },
  { id: 'spread',  name: 'Spread',     price: 600,  fireRate: 4,  damage: 8,  speed: 820, kind: 'spread', pellets: 3, spread: 0.32, color: '#ffe066', desc: 'Three-way shotgun blast.' },
  { id: 'pulse',   name: 'Pulse Laser',price: 1500, fireRate: 11, damage: 7,  speed: 1150, kind: 'single', color: '#ff7de0', desc: 'Rapid-fire laser stream.' },
  { id: 'twin',    name: 'Twin Cannon',price: 2600, fireRate: 7,  damage: 12, speed: 980, kind: 'twin', color: '#9bffb0', desc: 'Dual synchronized barrels.' },
  { id: 'gatling', name: 'Gatling',    price: 3600, fireRate: 16, damage: 6,  speed: 1080, kind: 'single', color: '#ffd24d', desc: 'Insane rate of fire. Shreds swarms.' },
  { id: 'flak',    name: 'Flak Cannon',price: 4400, fireRate: 3,  damage: 7,  speed: 760,  kind: 'spread', pellets: 5, spread: 0.24, color: '#ff8a3d', desc: 'Five-pellet wall of lead.' },
  { id: 'wave',    name: 'Wave Beam',  price: 5600, fireRate: 5,  damage: 9,  speed: 940,  kind: 'wave',   pellets: 5, spread: 0.20, color: '#7df9ff', desc: 'Sweeping 5-way energy fan.' },
  { id: 'rail',    name: 'Railgun',    price: 7200, fireRate: 2.4, damage: 55, speed: 1700, kind: 'rail', pierce: 4, color: '#c58cff', desc: 'Piercing slug — hits everything in line.' },
];

// ---------------------------------------------------------------------
// MISSILES — secondary homing weapon (fires on demand, limited ammo).
// ---------------------------------------------------------------------
export const MISSILES = [
  { id: 'none',    name: 'None',        price: 0,    damage: 0,   ammo: 0,  turn: 0,   color: '#888',    desc: 'No secondary.' },
  { id: 'seeker',  name: 'Seeker',      price: 1000, damage: 45,  ammo: 6,  turn: 3.2, color: '#ff8a3d', desc: 'Homing missile. 6 rounds/run.' },
  { id: 'swarm',   name: 'Swarm Pod',   price: 3000, damage: 30,  ammo: 12, turn: 4.0, color: '#ff5c5c', desc: 'Fires 2 seekers. 12 rounds/run.', count: 2 },
  { id: 'barrage', name: 'Barrage',     price: 5200, damage: 26,  ammo: 24, turn: 4.4, color: '#ff5c5c', desc: 'Fires 3 rockets. 24 rounds/run.', count: 3 },
  { id: 'nuke',    name: 'Nuke',        price: 7800, damage: 120, ammo: 3,  turn: 2.0, color: '#ffd24d', desc: 'One-shot devastation with splash blast.', splash: 150 },
];

// ---------------------------------------------------------------------
// UPGRADES — permanent, level-based stat boosts (buy with coins).
// ---------------------------------------------------------------------
export const UPGRADES = [
  { id: 'engine',  name: 'Engine',   icon: '🚀', max: 5, basePrice: 200, priceMult: 1.6, perLevel: 0.07, desc: '+7% move speed / level' },
  { id: 'armor',   name: 'Armor',    icon: '🛡️', max: 5, basePrice: 250, priceMult: 1.7, perLevel: 0.12, desc: '+12% max HP / level' },
  { id: 'damage',  name: 'Damage',   icon: '💥', max: 5, basePrice: 300, priceMult: 1.7, perLevel: 0.10, desc: '+10% weapon damage / level' },
  { id: 'firerate',name: 'Fire Rate',icon: '🔥', max: 5, basePrice: 300, priceMult: 1.7, perLevel: 0.08, desc: '+8% fire rate / level' },
  { id: 'magnet',  name: 'Magnet',   icon: '🧲', max: 3, basePrice: 250, priceMult: 1.8, perLevel: 60,   desc: '+60px coin pickup range' },
  { id: 'shield',  name: 'Shield',   icon: '🔆', max: 3, basePrice: 400, priceMult: 2.0, perLevel: 1,    desc: '+1 shield charge (blocks 1 hit)' },
];

// ---------------------------------------------------------------------
// SKINS — cosmetic trail/glow colors.
// ---------------------------------------------------------------------
export const SKINS = [
  { id: 'stock',   name: 'Stock',      price: 0,    trail: '#4dd0ff' },
  { id: 'ember',   name: 'Ember',      price: 300,  trail: '#ff6a3d' },
  { id: 'toxic',   name: 'Toxic',      price: 300,  trail: '#8cff3d' },
  { id: 'void',    name: 'Void',       price: 700,  trail: '#b14dff' },
  { id: 'gold',    name: 'Gold',       price: 1500, trail: '#ffd24d' },
];

// ---------------------------------------------------------------------
// POWER-UPS — drops that grant instant or timed buffs (Sky Force style).
// ---------------------------------------------------------------------
export const POWERUPS = [
  { id: 'health', name: 'Repair',    icon: '❤', color: '#ff5d7a', weight: 20, kind: 'instant' },
  { id: 'shield', name: 'Shield',    icon: '🛡', color: '#7df9ff', weight: 16, kind: 'instant' },
  { id: 'rapid',  name: 'Overdrive', icon: '⚡', color: '#ffe066', weight: 20, kind: 'timed', duration: 8 },
  { id: 'spread', name: 'Scatter',   icon: '✳', color: '#9bffb0', weight: 16, kind: 'timed', duration: 8 },
  { id: 'magnet', name: 'Magnet',    icon: '🧲', color: '#c58cff', weight: 12, kind: 'timed', duration: 10 },
  { id: 'bomb',   name: 'Mega Bomb', icon: '💣', color: '#ff8a3d', weight: 10, kind: 'instant' },
  { id: 'coins',  name: 'Cache',     icon: '💰', color: '#ffd24d', weight: 14, kind: 'instant', coins: 25 },
];

// ---------------------------------------------------------------------
// BOSSES — cycled by boss index. Multi-phase; each phase changes attack.
// ---------------------------------------------------------------------
export const BOSSES = [
  {
    id: 'dreadnought', name: 'DREADNOUGHT', color: '#ff5d5d', accent: '#ffb84d',
    baseHp: 1400, radius: 66, coins: 300,
    phases: [
      { attack: 'spread', fireEvery: 1.1, bulletSpeed: 240, count: 7 },
      { attack: 'aimed',  fireEvery: 0.5, bulletSpeed: 320, count: 3 },
      { attack: 'spiral', fireEvery: 0.09, bulletSpeed: 210, count: 2 },
    ],
  },
  {
    id: 'leviathan', name: 'LEVIATHAN', color: '#b14dff', accent: '#4dffd2',
    baseHp: 2200, radius: 74, coins: 450,
    phases: [
      { attack: 'spiral', fireEvery: 0.08, bulletSpeed: 230, count: 3 },
      { attack: 'spread', fireEvery: 0.9,  bulletSpeed: 260, count: 11 },
      { attack: 'aimed',  fireEvery: 0.35, bulletSpeed: 360, count: 5 },
    ],
  },
];

// Enemy archetypes (visual + behavior). Stats scale with wave at runtime.
// `fire*` fields (optional) make an enemy shoot aimed bullets at the player.
export const ENEMY_TYPES = [
  { id: 'drone',   hp: 20,  speed: 90,  radius: 16, damage: 12, coins: 1, color: '#ff5d7a', pattern: 'sine',   score: 10 },
  { id: 'darter',  hp: 14,  speed: 170, radius: 13, damage: 10, coins: 1, color: '#ffb84d', pattern: 'diver',  score: 15 },
  { id: 'brute',   hp: 60,  speed: 60,  radius: 26, damage: 22, coins: 3, color: '#c04dff', pattern: 'chase',  score: 30 },
  { id: 'weaver',  hp: 26,  speed: 120, radius: 15, damage: 14, coins: 2, color: '#4dffd2', pattern: 'sine',   score: 20 },
  // Ranged strafer: hovers near the top and snipes the player. Adds the
  // dodge-and-weave pressure that pure melee waves were missing.
  { id: 'gunner',  hp: 34,  speed: 95,  radius: 17, damage: 16, coins: 2, color: '#5ad1ff', pattern: 'strafe', score: 25,
    fireEvery: 1.7, bulletSpeed: 250, bulletDamage: 9, burst: 1 },
];
