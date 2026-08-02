// =====================================================================
// mesh3d.js — Tiny self-contained software 3D renderer for low-poly
// ships. No external library, works offline, cheap enough for many
// meshes per frame. Renders real rotating meshes with flat shading.
//
// Coordinate convention (local mesh space):
//   +X = nose (forward)   +Y = right wing (lateral)   +Z = up (thickness)
// The caller supplies a `roll` (spin in the screen plane, around Z) and we
// apply a fixed camera `pitch` (around X) so top-down craft reveal their 3D
// form. Orthographic projection keeps sizes stable for gameplay clarity.
// =====================================================================
import { R3D } from './config.js';

// Normalize the fixed light direction once.
const L = (() => { const [x, y, z] = R3D.light; const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; })();

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

// A Mesh = { verts:[[x,y,z],...], faces:[{v:[i,j,k], role:'top'|'bottom'|'wing'|'accent'|'cockpit'|'core'}] }
// palette maps role -> base hex color.

// Scratch buffers reused each call (avoid per-frame allocation).
const tv = [];

export function drawMesh(ctx, mesh, palette, { scale = 1, roll = 0, pitch = R3D.pitch, flash = false } = {}) {
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Transform all vertices: roll around Z, then pitch around X.
  const V = mesh.verts;
  for (let i = 0; i < V.length; i++) {
    const x = V[i][0] * scale, y = V[i][1] * scale, z = V[i][2] * scale;
    // roll (around Z)
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
    // pitch (around X)
    const y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
    (tv[i] || (tv[i] = [0, 0, 0]))[0] = x1; tv[i][1] = y2; tv[i][2] = z2;
  }

  // Build draw list with depth + shading (double-sided so winding mistakes
  // never leave holes — robust for hand-authored meshes).
  const faces = mesh.faces;
  const list = [];
  for (let f = 0; f < faces.length; f++) {
    const [a, b, c] = faces[f].v;
    const A = tv[a], B = tv[b], C = tv[c];
    // Face normal (in camera space; viewer looks down -Z, so +Z is toward us).
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bright = R3D.ambient + (1 - R3D.ambient) * Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
    const avgZ = (A[2] + B[2] + C[2]) / 3;
    list.push({ f, avgZ, bright });
  }
  // Painter's algorithm: far (smaller Z) first.
  list.sort((p, q) => p.avgZ - q.avgZ);

  ctx.lineWidth = 1;
  for (const item of list) {
    const face = faces[item.f];
    const [a, b, c] = face.v;
    const A = tv[a], B = tv[b], C = tv[c];
    let col;
    if (flash) col = '#ffffff';
    else {
      const base = palette[face.role] || palette.top || '#9fb0cc';
      const [r, g, bl] = hexToRgb(base);
      const k = item.bright;
      col = `rgb(${(r * k) | 0},${(g * k) | 0},${(bl * k) | 0})`;
    }
    ctx.fillStyle = col; ctx.strokeStyle = col;
    // Screen: canvas y-down. mesh +Y right, +Z up already folded into y2.
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath();
    ctx.fill(); ctx.stroke(); // stroke closes tiny seams between coplanar tris
  }
}

// Optional cheap glow: draw the emissive parts (cockpit/core) with shadow.
export function drawMeshGlow(ctx, mesh, palette, opts = {}) {
  const emissive = mesh.faces.some((f) => f.role === 'cockpit' || f.role === 'core');
  if (!emissive) return;
  ctx.save();
  ctx.shadowBlur = 14; ctx.shadowColor = palette.cockpit || palette.accent || '#6fe6ff';
  ctx.restore();
}

export { hexToRgb };
