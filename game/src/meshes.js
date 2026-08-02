// =====================================================================
// meshes.js — Builds & caches low-poly meshes for ships, enemies, bosses,
// plus their colour palettes. One robust parametric "fighter" generator
// is reused everywhere (varied by params + palette) so no hand-authored
// mesh can end up broken/holey. Nose = +X, up = +Z.
// =====================================================================
import { hexToRgb } from './mesh3d.js';

const clamp255 = (n) => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
export function mix(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  const h = (n) => n.toString(16).padStart(2, '0');
  return '#' + h(clamp255(ar + (br - ar) * t)) + h(clamp255(ag + (bg - ag) * t)) + h(clamp255(ab + (bb - ab) * t));
}

// Parametric low-poly fighter. L=length, W=wingspan, H=thickness, sweep=wing back-sweep.
function buildFighter({ L = 1, W = 0.7, H = 0.28, sweep = 0.5 } = {}) {
  const v = [
    [L, 0, 0.15 * H],          // 0 nose
    [0.15 * L, 0, H],          // 1 ridge / cockpit peak
    [-0.55 * L, 0, 0.45 * H],  // 2 tail top
    [0.05 * L, 0, -0.5 * H],   // 3 belly
    [-0.55 * L, 0, -0.15 * H], // 4 tail bottom
    [-0.05 * L, 0.28 * L, 0],  // 5 body right
    [-0.05 * L, -0.28 * L, 0], // 6 body left
    [-0.55 * L, 0.14 * L, 0],  // 7 tail right
    [-0.55 * L, -0.14 * L, 0], // 8 tail left
    [-0.15 * L, W, -0.02 * H], // 9 wing right tip
    [-0.15 * L, -W, -0.02 * H],// 10 wing left tip
    [-0.5 * L, sweep * W, 0],  // 11 wing back right
    [-0.5 * L, -sweep * W, 0], // 12 wing back left
    [0.42 * L, 0, 0.55 * H],   // 13 canopy front
    [0.05 * L, 0.1 * L, 0.78 * H], // 14 canopy back-right
    [0.05 * L, -0.1 * L, 0.78 * H],// 15 canopy back-left
  ];
  const F = (a, b, c, role) => ({ v: [a, b, c], role });
  const faces = [
    // top hull
    F(0, 5, 1, 'top'), F(1, 5, 7, 'top'), F(1, 7, 2, 'top'),
    F(0, 1, 6, 'top'), F(1, 8, 6, 'top'), F(1, 2, 8, 'top'),
    // belly
    F(0, 3, 5, 'bottom'), F(3, 7, 5, 'bottom'), F(3, 4, 7, 'bottom'),
    F(0, 6, 3, 'bottom'), F(3, 6, 8, 'bottom'), F(3, 8, 4, 'bottom'),
    // wings
    F(5, 9, 7, 'wing'), F(9, 11, 7, 'wing'),
    F(6, 8, 10, 'wing'), F(10, 8, 12, 'wing'),
    // tail cap
    F(2, 7, 4, 'top'), F(2, 4, 8, 'top'),
    // canopy (emissive)
    F(13, 14, 15, 'cockpit'),
  ];
  return { verts: v, faces };
}

// ---- caches ----
const shipCache = new Map(), enemyCache = new Map(), bossCache = new Map();

const SHIP_PARAMS = {
  scout:   { L: 1.0, W: 0.72, H: 0.28, sweep: 0.5 },
  striker: { L: 1.05, W: 0.6, H: 0.26, sweep: 0.2 },  // narrow, forward
  tank:    { L: 0.92, W: 0.82, H: 0.4, sweep: 0.7 },  // fat, wide
  phantom: { L: 1.2, W: 0.7, H: 0.24, sweep: 0.85 },  // long, swept
  titan:   { L: 0.98, W: 0.98, H: 0.52, sweep: 0.6 }, // massive fortress
  reaper:  { L: 1.28, W: 0.56, H: 0.2, sweep: 0.35 }, // knife-thin racer
  nova:    { L: 1.15, W: 0.82, H: 0.3, sweep: 0.7 },  // sleek apex craft
};
const ENEMY_PARAMS = {
  drone:  { L: 0.8, W: 0.7, H: 0.3, sweep: 0.4 },
  darter: { L: 1.0, W: 0.5, H: 0.22, sweep: 0.15 },
  brute:  { L: 0.85, W: 0.95, H: 0.5, sweep: 0.8 },
  weaver: { L: 0.9, W: 0.85, H: 0.3, sweep: 0.9 },
  gunner: { L: 0.95, W: 0.9, H: 0.42, sweep: 0.55 }, // broad gun platform
};

export function getShipMesh(id) {
  if (!shipCache.has(id)) shipCache.set(id, buildFighter(SHIP_PARAMS[id] || SHIP_PARAMS.scout));
  return shipCache.get(id);
}
export function getEnemyMesh(type) {
  if (!enemyCache.has(type)) enemyCache.set(type, buildFighter(ENEMY_PARAMS[type] || ENEMY_PARAMS.drone));
  return enemyCache.get(type);
}
export function getBossMesh(id) {
  if (!bossCache.has(id)) bossCache.set(id, buildFighter({ L: 1.0, W: 1.05, H: 0.55, sweep: 0.75 }));
  return bossCache.get(id);
}

// ---- palettes (derive metallic hull tinted by the craft's accent) ----
export function shipPalette(accent) {
  return {
    top: mix(accent, '#ffffff', 0.5),
    bottom: mix(accent, '#05060f', 0.55),
    wing: accent,
    cockpit: '#cdfaff',
  };
}
export function enemyPalette(color) {
  return {
    top: mix(color, '#ffffff', 0.32),
    bottom: mix(color, '#05060f', 0.6),
    wing: mix(color, '#000000', 0.15),
    cockpit: mix(color, '#ffffff', 0.7),
  };
}
export function bossPalette(color, accent) {
  return {
    top: mix(color, '#ffffff', 0.28),
    bottom: mix(color, '#05060f', 0.55),
    wing: accent,
    cockpit: accent,
  };
}
