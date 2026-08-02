// =====================================================================
// config.js — All tunables + content data (cars, environments, tracks,
// upgrades). Data lives here so balancing & adding content is easy.
// =====================================================================

// Game modes (chosen on the menu, persisted per player):
//   'free'     — every car & upgrade costs 0; jump straight into driving.
//   'hardcore' — full credit economy; earn everything. Separate save slot.
export const DEFAULT_MODE = 'free';

// Fixed internal render resolution (canvas is CSS-scaled to fit).
export const VIEW = { width: 1024, height: 640 };

export const CONFIG = {
  fixedDt: 1 / 60,          // physics step (s) — deterministic
  maxFrameTime: 0.1,        // clamp huge frame gaps (tab switch)

  // ---- Pseudo-3D projection / road ----
  segmentLength: 200,       // length of a single road segment (world z)
  rumbleLength: 3,          // segments per rumble/stripe cycle
  roadWidth: 2200,          // half-width of the road surface
  lanes: 3,
  fieldOfView: 100,         // degrees
  cameraHeight: 1050,       // camera height above the road
  drawDistance: 260,        // segments rendered ahead

  // ---- Base vehicle physics (scaled per car + upgrades) ----
  // maxSpeed is authored as segmentLength / fixedDt so top speed ≈ one
  // segment per frame (the classic Out Run tuning).
  get maxSpeed() { return this.segmentLength / this.fixedDt; }, // = 12000
  accelRate: 1 / 4.2,       // fraction of maxSpeed gained per second
  brakeRate: -1 / 1.7,
  decelRate: -1 / 5.5,      // coasting
  offRoadDecel: -1 / 1.6,
  offRoadLimit: 1 / 3.2,    // top speed while off-road (fraction of maxSpeed)
  centrifugal: 0.30,        // how hard curves pull you outward
  boostMult: 1.28,          // nitro top-speed & accel multiplier
  boostDrainPerSec: 0.42,   // nitro tank drain
  boostRegenPerSec: 0.10,   // refill when not boosting

  // Display: convert internal speed → km/h shown on the HUD.
  speedToKmh: 300 / 12000,  // maxSpeed(12000) → ~300 km/h baseline
  gears: 6,

  economy: {
    creditsPerPosition: [500, 300, 180, 100, 60, 40], // finish payout by place
    lapBonus: 25,
    cleanLapBonus: 60,
  },
};

// ---------------------------------------------------------------------
// CARS — 6 hulls with distinct handling. Multipliers scale the base
// physics; `topKmh` is the displayed top speed. Colors drive the paint.
// ---------------------------------------------------------------------
// `sound` gives every car a distinct engine voice (procedural oscillators):
//   w1/w2 = waveforms, detune (cents), base Hz at idle, range Hz to redline.
export const CARS = [
  { id: 'cadet',   name: 'Cadet',    price: 0,     color: '#4da6ff', accent: '#0a2a4a', topKmh: 248, accel: 1.00, grip: 1.05, brake: 1.00, desc: 'Balanced trainer. Forgiving and friendly.', sound: { w1: 'sawtooth', w2: 'square',   detune: -12, base: 58, range: 300 } },
  { id: 'vortex',  name: 'Vortex',   price: 9000,  color: '#ff4d6a', accent: '#3a0a14', topKmh: 296, accel: 1.05, grip: 0.86, brake: 0.92, desc: 'Top-speed monster. Twitchy in the corners.', sound: { w1: 'sawtooth', w2: 'sawtooth', detune: -7,  base: 92, range: 430 } },
  { id: 'anvil',   name: 'Anvil',    price: 8000,  color: '#8cff6b', accent: '#123a0a', topKmh: 236, accel: 0.86, grip: 1.30, brake: 1.22, desc: 'Heavy bruiser. Immense grip & braking.',    sound: { w1: 'square',   w2: 'triangle', detune: -16, base: 40, range: 210 } },
  { id: 'dart',    name: 'Dart',     price: 12000, color: '#ffd24d', accent: '#4a3a0a', topKmh: 262, accel: 1.24, grip: 1.10, brake: 1.05, desc: 'Rocket launch. Explosive acceleration.',    sound: { w1: 'sawtooth', w2: 'square',   detune: -20, base: 72, range: 370 } },
  { id: 'viper',   name: 'Viper',    price: 16000, color: '#b14dff', accent: '#2a0a4a', topKmh: 284, accel: 1.14, grip: 1.14, brake: 1.08, desc: 'Track weapon. Sharp all-round pace.',       sound: { w1: 'sawtooth', w2: 'square',   detune: -9,  base: 78, range: 400 } },
  { id: 'apex',    name: 'Apex GT',  price: 24000, color: '#4dffd2', accent: '#0a3a34', topKmh: 300, accel: 1.20, grip: 1.24, brake: 1.16, desc: 'Apex prototype. No weakness anywhere.',      sound: { w1: 'sawtooth', w2: 'triangle', detune: -8,  base: 84, range: 420 } },
];

// ---------------------------------------------------------------------
// UPGRADES — NFS-style parts. `stat` is what they buff; `part` is the
// visible change rendered on the car (see car.js). max levels + pricing.
// ---------------------------------------------------------------------
export const UPGRADES = [
  { id: 'engine',  name: 'Engine',       icon: '⚙️', part: 'scoop',  stat: 'topSpeed', max: 4, basePrice: 1200, priceMult: 1.7, perLevel: 0.05, desc: '+5% top speed / level' },
  { id: 'tires',   name: 'Tires',        icon: '🛞', part: 'tire',   stat: 'grip',     max: 4, basePrice: 1000, priceMult: 1.6, perLevel: 0.07, desc: '+7% grip / level · wider rubber' },
  { id: 'brakes',  name: 'Brakes',       icon: '🅿️', part: 'brake',  stat: 'brake',    max: 3, basePrice: 900,  priceMult: 1.7, perLevel: 0.12, desc: '+12% braking / level · big calipers' },
  { id: 'spoiler', name: 'Spoiler',      icon: '🪽', part: 'wing',   stat: 'downforce',max: 3, basePrice: 1100, priceMult: 1.8, perLevel: 0.06, desc: '+6% high-speed grip · GT wing' },
  { id: 'muffler', name: 'Exhaust',      icon: '🔩', part: 'exhaust',stat: 'accel',    max: 3, basePrice: 800,  priceMult: 1.6, perLevel: 0.04, desc: '+4% accel / level · twin tips' },
  { id: 'hood',    name: 'Carbon Hood',  icon: '🏁', part: 'hood',   stat: 'accel',    max: 2, basePrice: 1500, priceMult: 1.9, perLevel: 0.05, desc: '+5% accel / level · lighter body' },
  { id: 'driver',  name: 'Driver Skill', icon: '🧑‍✈️', part: 'driver', stat: 'steer',  max: 4, basePrice: 700,  priceMult: 1.5, perLevel: 0.08, desc: '+8% steering response / level' },
];

// ---------------------------------------------------------------------
// ENVIRONMENTS — each track's palette, roadside props, and gameplay
// feature set. `feature` values tweak physics & course generation so
// every location genuinely plays differently.
// ---------------------------------------------------------------------
export const ENVIRONMENTS = {
  desert: {
    id: 'desert', name: 'Dune Sprint', emoji: '🏜️',
    sky: ['#ffcf8b', '#ff9e5e'], haze: '#ffd9a0', fogDensity: 3.2,
    grass: ['#e8b976', '#e0ad64'], road: ['#6b6b6b', '#666666'], rumble: ['#c94b2b', '#efe8dd'], lane: '#efe8dd',
    props: ['cactus', 'rock', 'sign', 'cactus'], density: 0.55,
    feature: { grip: 1.0, offRoad: 1.0, curviness: 0.6, hills: 0.5, night: false, sand: true },
    hazards: ['rock', 'barrel', 'cone', 'tumbleweed'],
    blurb: 'Long shimmering straights. Open it up and chase the horizon.',
  },
  snow: {
    id: 'snow', name: 'Glacier Pass', emoji: '❄️',
    sky: ['#cfe8ff', '#9cc4e6'], haze: '#eaf4ff', fogDensity: 5.5,
    grass: ['#f2f6fb', '#e3ebf5'], road: ['#7a828c', '#727a84'], rumble: ['#2f6bd4', '#f4f8ff'], lane: '#dfe9f7',
    props: ['pine', 'snowman', 'pine', 'rock'], density: 0.7,
    feature: { grip: 0.72, offRoad: 1.3, curviness: 0.9, hills: 0.7, night: false, slick: true },
    hazards: ['snowman', 'snowball', 'iceblock'],
    blurb: 'Ice-slick tarmac. Brake early, feather the throttle, stay smooth.',
  },
  beach: {
    id: 'beach', name: 'Coast Run', emoji: '🏖️',
    sky: ['#79d0ff', '#3aa6e6'], haze: '#bfeaff', fogDensity: 3.6,
    grass: ['#f2e2b0', '#ecd89a'], road: ['#6f6f74', '#68686d'], rumble: ['#ff9f43', '#fff4e0'], lane: '#fff4e0',
    props: ['palm', 'umbrella', 'palm', 'rock'], density: 0.6,
    feature: { grip: 0.95, offRoad: 1.5, curviness: 0.7, hills: 0.4, night: false, water: true },
    hazards: ['ball', 'sandcastle', 'barrel'],
    blurb: 'Sun, surf and soft sand off the racing line. Keep it on the black.',
  },
  island: {
    id: 'island', name: 'Isla Verde', emoji: '🌴',
    sky: ['#7fe6c4', '#37b48c'], haze: '#d6fff0', fogDensity: 4.4,
    grass: ['#3fbf7a', '#37b06f'], road: ['#5f5f66', '#585860'], rumble: ['#137a52', '#eafff6'], lane: '#eafff6',
    props: ['palm', 'flower', 'rock', 'palm'], density: 0.85,
    feature: { grip: 0.9, offRoad: 1.2, curviness: 1.25, hills: 0.8, night: false, water: true },
    hazards: ['rock', 'log', 'barrel'],
    blurb: 'Tight jungle switchbacks hugging the coastline. A handling test.',
  },
  mountain: {
    id: 'mountain', name: 'Summit Climb', emoji: '⛰️',
    sky: ['#b7c6e0', '#7d8eab'], haze: '#dfe6f2', fogDensity: 5.0,
    grass: ['#5a7a4a', '#527043'], road: ['#5b5b60', '#54545a'], rumble: ['#b23b3b', '#f2f2f2'], lane: '#f2f2f2',
    props: ['pine', 'rock', 'pine', 'sign'], density: 0.9,
    feature: { grip: 0.9, offRoad: 1.4, curviness: 1.4, hills: 0.9, night: false, steep: true },
    hazards: ['boulder', 'rock', 'log'],
    blurb: 'Steep hairpins and blind crests. Momentum is everything up here.',
  },
  city: {
    id: 'city', name: 'Neon Mile', emoji: '🌃',
    sky: ['#0f1030', '#241a4a'], haze: '#3a2a6a', fogDensity: 4.0,
    grass: ['#141826', '#111420'], road: ['#3a3a44', '#34343e'], rumble: ['#ff2e88', '#22d3ee'], lane: '#f5f5f5',
    props: ['building', 'lamp', 'building', 'lamp'], density: 1.0,
    feature: { grip: 1.02, offRoad: 1.1, curviness: 1.0, hills: 0.5, night: true, neon: true },
    hazards: ['trashbin', 'cone', 'barrier', 'pit'],
    blurb: 'Midnight streets lined with neon. Threading walls at full chat.',
  },
};

// Selectable tracks (one per environment). Each references an environment
// and the course shape parameters used by the builder.
export const TRACKS = [
  { id: 'desert',   env: 'desert',   length: 1600, seed: 101 },
  { id: 'beach',    env: 'beach',    length: 1600, seed: 202 },
  { id: 'island',   env: 'island',   length: 1700, seed: 303 },
  { id: 'snow',     env: 'snow',     length: 1650, seed: 404 },
  { id: 'mountain', env: 'mountain', length: 1900, seed: 505 },
  { id: 'city',     env: 'city',     length: 1650, seed: 606 },
];

// Race modes: circuit laps vs. point-to-point sprint. Free/Hardcore is an
// orthogonal economy toggle handled by the Economy.
export const RACE_MODES = [
  { id: 'laps',   name: 'Circuit',  icon: '🔁', laps: 3, desc: '3 laps around the circuit. First across the line wins.' },
  { id: 'sprint', name: 'Sprint',   icon: '🏁', laps: 1, lengthMult: 2.2, desc: 'One long point-to-point dash to the finish.' },
];

export const OPPONENT_COUNT = 5;   // AI racers (player + 5 = 6-car grid)
