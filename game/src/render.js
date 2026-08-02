// =====================================================================
// render.js — Detailed vector spacecraft rendering (metallic, shaded,
// "3D-lit" look) for the player ships and enemy craft. Pure canvas 2D,
// self-contained (no external model files). Ships are drawn in local
// space with the NOSE pointing +X; the caller applies translate/rotate.
// =====================================================================
import { TAU } from './core.js';
import { RENDER_3D, R3D } from './config.js';
import { drawMesh } from './mesh3d.js';
import { getShipMesh, getEnemyMesh, getBossMesh, shipPalette, enemyPalette, bossPalette } from './meshes.js';

const poly = (ctx, pts) => {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
};

// Mirror a set of upper points to build a symmetric hull (+y is mirrored).
const mirror = (pts) => pts.concat(pts.slice(0, -1).reverse().map(([x, y]) => [x, -y]));

// ---- Per-hull silhouettes (upper half only; mirrored at draw time) ----
// Coordinates are in units of s (~half-length). Nose at +x.
function geometry(id, s) {
  switch (id) {
    case 'striker': // aggressive forward-swept interceptor
      return {
        hull: mirror([[1.05, 0], [0.55, -0.16], [0.1, -0.2], [-0.55, -0.16], [-0.5, 0]]),
        wings: [mirror([[0.05, -0.18], [-0.15, -0.62], [-0.55, -0.6], [-0.45, -0.2]])],
        pods: [[0.0, -0.34], [0.0, 0.34]],  // side engine pods
        canopy: [0.45, 0.0, 0.22, 0.12],
        barrels: [[0.9, -0.5], [0.9, 0.5]],
        nose: 1.05,
      };
    case 'tank': // Aegis — bulky armored gunship
      return {
        hull: mirror([[0.95, 0], [0.7, -0.3], [0.2, -0.42], [-0.55, -0.4], [-0.7, 0]]),
        wings: [mirror([[0.1, -0.4], [-0.1, -0.78], [-0.6, -0.72], [-0.55, -0.35]])],
        pods: [[-0.1, -0.5], [-0.1, 0.5]],
        canopy: [0.4, 0.0, 0.24, 0.16],
        barrels: [[1.0, -0.22], [1.0, 0.22], [0.95, -0.6], [0.95, 0.6]],
        nose: 0.95,
      };
    case 'phantom': // angular stealth elite
      return {
        hull: mirror([[1.2, 0], [0.3, -0.14], [-0.2, -0.3], [-0.6, -0.22], [-0.5, 0]]),
        wings: [mirror([[-0.1, -0.28], [-0.7, -0.72], [-0.85, -0.5], [-0.5, -0.16]])],
        pods: [[-0.3, -0.26], [-0.3, 0.26]],
        canopy: [0.45, 0.0, 0.26, 0.1],
        barrels: [[1.0, -0.18], [1.0, 0.18]],
        nose: 1.2,
      };
    default: // scout — sleek balanced arrow
      return {
        hull: mirror([[1.1, 0], [0.4, -0.18], [-0.1, -0.24], [-0.6, -0.16], [-0.5, 0]]),
        wings: [mirror([[0.0, -0.22], [-0.5, -0.64], [-0.72, -0.5], [-0.45, -0.18]])],
        pods: [[-0.2, -0.3], [-0.2, 0.3]],
        canopy: [0.45, 0.0, 0.24, 0.12],
        barrels: [[0.95, -0.34], [0.95, 0.34]],
        nose: 1.1,
      };
  }
}

function flame(ctx, x, y, len, color) {
  // Layered flame: outer glow -> body -> hot white core.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createLinearGradient(x, y, x - len, y);
  grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.shadowBlur = 14; ctx.shadowColor = color;
  poly(ctx, [[x, y - 0.14 * len], [x - len, y], [x, y + 0.14 * len]]); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  poly(ctx, [[x, y - 0.06 * len], [x - len * 0.6, y], [x, y + 0.06 * len]]); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------
// Player ship. Handles its own orientation for BOTH render modes.
// accent = hull color, trail = engine flame color, angle = aim (radians).
// ---------------------------------------------------------------------
export function drawPlayerShip(ctx, id, accent, trail, t, thrust, angle = -Math.PI / 2) {
  if (RENDER_3D) {
    try {
      // Engine flames (world space, behind the ship along its facing).
      ctx.save(); ctx.rotate(angle);
      const g = geometry(id, 22);
      const len = (thrust ? 26 : 12) + Math.sin(t * 40) * 4;
      for (const [px, py] of g.pods) flame(ctx, px * 22 - 2, py * 22, len, trail);
      ctx.restore();
      // 3D hull mesh.
      drawMesh(ctx, getShipMesh(id), shipPalette(accent), { scale: 22, roll: angle, pitch: R3D.pitch });
      return;
    } catch (e) { /* fall back to 2D below */ }
  }
  ctx.rotate(angle);
  _drawPlayerShip2D(ctx, id, accent, trail, t, thrust);
}

function _drawPlayerShip2D(ctx, id, accent, trail, t, thrust) {
  const s = 22;
  const g = geometry(id, s);
  const S = (p) => [p[0] * s, p[1] * s];
  const sc = (arr) => arr.map(S);

  // Engine flames (behind hull), flickering.
  const baseLen = (thrust ? 26 : 12) + Math.sin(t * 40) * 4;
  for (const [px, py] of g.pods) flame(ctx, px * s - 2, py * s, baseLen, trail);

  // Wings (darker, behind hull).
  ctx.lineJoin = 'round';
  for (const w of g.wings) {
    const wg = ctx.createLinearGradient(0, -s, 0, s);
    wg.addColorStop(0, '#5a6472'); wg.addColorStop(1, '#2a2f3a');
    ctx.fillStyle = wg; poly(ctx, sc(w)); ctx.fill();
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
  }

  // Weapon barrels.
  ctx.fillStyle = '#20242e';
  for (const [bx, by] of g.barrels) ctx.fillRect(bx * s - 3, by * s - 1.6, 8, 3.2);

  // Main hull — top-lit metallic gradient + accent rim glow.
  const hg = ctx.createLinearGradient(0, -s * 0.7, 0, s * 0.7);
  hg.addColorStop(0, '#f2f6ff'); hg.addColorStop(0.5, '#aeb9cc'); hg.addColorStop(1, '#4c5566');
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = accent;
  ctx.fillStyle = hg; poly(ctx, sc(g.hull)); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = accent; ctx.lineWidth = 1.6; poly(ctx, sc(g.hull)); ctx.stroke();

  // Accent spine stripe down the fuselage.
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(g.nose * s, 0); ctx.lineTo(-s * 0.45, 0); ctx.stroke(); ctx.globalAlpha = 1;

  // Cockpit canopy — glassy cyan glow.
  const [cx, cy, rx, ry] = g.canopy;
  const cg = ctx.createRadialGradient(cx * s, cy * s - 2, 1, cx * s, cy * s, rx * s);
  cg.addColorStop(0, '#dffbff'); cg.addColorStop(0.6, '#39c6ff'); cg.addColorStop(1, '#0a4a72');
  ctx.fillStyle = cg; ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = '#6fe6ff';
  ctx.beginPath(); ctx.ellipse(cx * s, cy * s, rx * s, ry * s, 0, 0, TAU); ctx.fill(); ctx.restore();

  // Wingtip nav lights.
  ctx.fillStyle = accent; ctx.shadowBlur = 8; ctx.shadowColor = accent;
  for (const w of g.wings) { const tip = S(w[1]); ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(tip[0], -tip[1], 1.8, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------
// Enemy craft. Drawn with NOSE pointing downward, toward the player.
// ---------------------------------------------------------------------
export function drawEnemyShip(ctx, type, r, color, flash, t) {
  if (RENDER_3D) {
    try {
      drawMesh(ctx, getEnemyMesh(type), enemyPalette(color), { scale: r * 1.15, roll: Math.PI / 2, pitch: R3D.pitch, flash });
      return;
    } catch (e) { /* fall back to 2D */ }
  }
  ctx.save();
  ctx.rotate(Math.PI / 2); // reorient local +x nose to point down
  const s = r * 1.25;
  const body = flash ? '#ffffff' : color;

  const drawHull = (pts, grad) => {
    ctx.fillStyle = grad || body; poly(ctx, pts.map(([x, y]) => [x * s, y * s])); ctx.fill();
  };

  ctx.shadowBlur = 14; ctx.shadowColor = color;
  if (type === 'brute') {
    // Heavy hexagonal cruiser.
    drawHull(mirror([[0.9, 0], [0.5, -0.55], [-0.4, -0.65], [-0.85, 0]]));
    ctx.shadowBlur = 0; ctx.fillStyle = flash ? '#fff' : 'rgba(0,0,0,0.35)';
    drawHull(mirror([[0.2, 0], [0.0, -0.3], [-0.4, -0.32], [-0.5, 0]]));
    ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(-0.15 * s, 0, r * 0.22, 0, TAU); ctx.fill();
  } else if (type === 'darter') {
    // Fast dart with swept fins.
    drawHull(mirror([[1.0, 0], [0.1, -0.2], [-0.5, -0.5], [-0.4, -0.12], [-0.6, 0]]));
  } else if (type === 'weaver') {
    // Organic manta shape.
    drawHull(mirror([[0.9, 0], [0.2, -0.7], [-0.4, -0.5], [-0.5, 0]]));
    ctx.fillStyle = '#04121c'; ctx.beginPath(); ctx.arc(0.25 * s, 0, r * 0.18, 0, TAU); ctx.fill();
  } else {
    // drone — angular fighter.
    drawHull(mirror([[0.85, 0], [0.3, -0.35], [-0.3, -0.5], [-0.6, -0.2], [-0.5, 0]]));
  }

  // Accent rim + glowing core "eye".
  ctx.shadowBlur = 0; ctx.strokeStyle = flash ? '#fff' : color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
  ctx.stroke(); ctx.globalAlpha = 1;
  const pulse = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.fillStyle = flash ? '#fff' : color; ctx.shadowBlur = 8 + pulse * 6; ctx.shadowColor = color;
  ctx.beginPath(); ctx.arc(0.35 * s, 0, r * 0.16, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------
// Boss craft — large mesh with a slow menacing spin + glowing core.
// ---------------------------------------------------------------------
export function drawBossShip(ctx, id, r, color, accent, flash, t) {
  if (RENDER_3D) {
    try {
      // Subtle idle roll about facing adds life without confusing aim.
      drawMesh(ctx, getBossMesh(id), bossPalette(color, accent),
        { scale: r, roll: Math.PI / 2 + Math.sin(t * 0.6) * 0.15, pitch: R3D.pitch, flash });
      // Pulsing core.
      ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = accent;
      ctx.fillStyle = flash ? '#fff' : accent; ctx.globalAlpha = 0.85;
      const pr = r * (0.16 + Math.sin(t * 4) * 0.03);
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill(); ctx.restore();
      return;
    } catch (e) { /* fall back to 2D */ }
  }
  // 2D fallback: layered hexagon hull.
  ctx.save(); ctx.rotate(Math.PI / 2);
  ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = flash ? '#fff' : color;
  poly(ctx, mirror([[0.95 * r, 0], [0.5 * r, -0.6 * r], [-0.5 * r, -0.7 * r], [-0.95 * r, 0]]).map(([x, y]) => [x, y]));
  ctx.fill();
  ctx.shadowBlur = 24; ctx.shadowColor = accent; ctx.fillStyle = flash ? '#fff' : accent;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fill();
  ctx.restore();
}
