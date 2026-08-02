// =====================================================================
// render3d.js — The pseudo-3D road renderer. Projects road segments from
// world space to screen and paints grass / rumble strips / road / lanes
// with distance fog, plus roadside props. Classic "projected segments"
// technique (Out Run style): cheap, sharp, and genuinely 3D-looking.
//
// World: +z runs into the screen, +x is right, +y is up (hills).
// =====================================================================
import { CONFIG } from './config.js';

export const Util = {
  // Project a world point into screen space given the camera.
  project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
  },
  // Exponential distance fog (1 = clear, 0 = fully fogged).
  fog(distance, density) { return 1 / Math.pow(Math.E, distance * distance * density); },
  rumbleWidth(projWidth, lanes) { return projWidth / Math.max(6, 2 * lanes); },
  laneWidth(projWidth, lanes) { return projWidth / Math.max(32, 8 * lanes); },
};

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

// ---- Sky / horizon backdrop (parallaxes gently with the curve) ----
export function drawBackground(ctx, env, width, height, offset = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, env.sky[0]); g.addColorStop(1, env.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.5;
  if (env.feature.night) {
    // City: starfield + a low neon glow on the horizon.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 173.13 + offset * 0.2) % width;
      const sy = (i * 71.7) % (horizon - 20);
      ctx.globalAlpha = 0.3 + ((i * 37) % 100) / 200;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    const gg = ctx.createLinearGradient(0, horizon - 60, 0, horizon);
    gg.addColorStop(0, 'rgba(255,46,136,0)'); gg.addColorStop(1, 'rgba(255,46,136,0.35)');
    ctx.fillStyle = gg; ctx.fillRect(0, horizon - 60, width, 60);
  } else {
    // Sun / haze glow near the horizon.
    const sunX = width / 2 - offset * 0.35;
    const rg = ctx.createRadialGradient(sunX, horizon, 8, sunX, horizon, height * 0.5);
    rg.addColorStop(0, env.haze); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.8; ctx.fillStyle = rg;
    ctx.fillRect(0, 0, width, horizon + 40); ctx.globalAlpha = 1;
    // Distant ridge line for depth.
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.moveTo(0, horizon);
    for (let x = 0; x <= width; x += 64) {
      const h = 18 * Math.sin((x + offset * 0.5) * 0.008) + 10 * Math.sin((x) * 0.02);
      ctx.lineTo(x, horizon - Math.max(0, h));
    }
    ctx.lineTo(width, horizon); ctx.closePath(); ctx.fill();
  }
}

// ---- One road segment (a trapezoid band from far edge y2 up to near y1) ----
export function renderSegment(ctx, width, lanes, x1, y1, w1, x2, y2, w2, fog, col) {
  const r1 = Util.rumbleWidth(w1, lanes), r2 = Util.rumbleWidth(w2, lanes);
  const l1 = Util.laneWidth(w1, lanes), l2 = Util.laneWidth(w2, lanes);

  // Grass band behind the road.
  ctx.fillStyle = col.grass; ctx.fillRect(0, y2, width, y1 - y2);

  // Rumble strips.
  polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, col.rumble);
  polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, col.rumble);

  // Road surface.
  polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, col.road);

  // Dashed lane markers.
  if (col.lane) {
    const lw1 = (w1 * 2) / lanes, lw2 = (w2 * 2) / lanes;
    let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
    for (let lane = 1; lane < lanes; lx1 += lw1, lx2 += lw2, lane++)
      polygon(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, col.lane);
  }

  // Distance fog.
  if (fog < 1) {
    ctx.globalAlpha = 1 - fog; ctx.fillStyle = col.fog;
    ctx.fillRect(0, y2, width, y1 - y2); ctx.globalAlpha = 1;
  }
}

// ---- Roadside props (procedural, scaled by the segment's projection) ----
// x,y = base (bottom-centre) on screen; scale = segment.screen.scale.
export function drawProp(ctx, type, x, yBase, roadW, env, width) {
  // Size off the projected road half-width so props scale naturally with depth.
  const S = Math.min(roadW * 0.02, 42);
  if (S < 0.6) { // too far: cheap blob so the roadside never looks empty
    ctx.globalAlpha = 0.5; ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 1, yBase - 3, 2, 3); ctx.globalAlpha = 1; return;
  }
  ctx.save(); ctx.translate(x, yBase);
  switch (type) {
    case 'cactus': {
      ctx.fillStyle = '#3f8f4a'; ctx.strokeStyle = '#2c6a34'; ctx.lineWidth = Math.max(1, S * 0.14);
      const h = 26 * S; roundBar(ctx, -S * 0.6, -h, S * 1.2, h, S * 0.5);
      roundBar(ctx, -S * 0.6 - S * 1.4, -h * 0.7, S * 0.8, h * 0.45, S * 0.35);
      roundBar(ctx, S * 0.6 + S * 0.6, -h * 0.8, S * 0.8, h * 0.5, S * 0.35);
      break;
    }
    case 'rock': {
      ctx.fillStyle = env.feature.night ? '#3a3a46' : '#8a7f6f';
      ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(-2.6 * S, -5 * S); ctx.lineTo(1 * S, -6.5 * S);
      ctx.lineTo(4 * S, -3 * S); ctx.lineTo(3.4 * S, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-2.6 * S, -5 * S, 3 * S, 1.4 * S);
      break;
    }
    case 'pine': {
      ctx.fillStyle = '#5b3b1f'; ctx.fillRect(-S * 0.5, -6 * S, S, 6 * S);
      ctx.fillStyle = env.id === 'snow' ? '#2e6a45' : '#245a34';
      for (let i = 0; i < 3; i++) { const yy = -6 * S - i * 6 * S, wgt = (3 - i) * 3.2 * S; tri(ctx, 0, yy - 8 * S, wgt, 8 * S); }
      if (env.id === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 3; i++) { const yy = -6 * S - i * 6 * S; tri(ctx, 0, yy - 8 * S, (3 - i) * 3.2 * S, 2.4 * S); } }
      break;
    }
    case 'palm': {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(1.5, S * 0.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(S * 1.4, -12 * S, S * 0.6, -22 * S); ctx.stroke();
      ctx.fillStyle = '#2fae6a';
      for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2; frond(ctx, S * 0.6, -22 * S, ang, 9 * S); }
      break;
    }
    case 'snowman': {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#cdd8e6'; ctx.lineWidth = 1;
      circle(ctx, 0, -3.2 * S, 3.2 * S, true); circle(ctx, 0, -8 * S, 2.4 * S, true); circle(ctx, 0, -11.6 * S, 1.7 * S, true);
      ctx.fillStyle = '#ff7a3d'; tri(ctx, 1.7 * S, -11.6 * S, 0.8 * S, 1.2 * S, true);
      ctx.fillStyle = '#222'; dot(ctx, -0.6 * S, -12 * S, 0.35 * S); dot(ctx, 0.6 * S, -12 * S, 0.35 * S);
      break;
    }
    case 'umbrella': {
      ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = Math.max(1, S * 0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12 * S); ctx.stroke();
      ctx.fillStyle = '#ff5d6a'; ctx.beginPath(); ctx.arc(0, -12 * S, 6 * S, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -12 * S, 6 * S, Math.PI, Math.PI * 1.25); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -12 * S, 6 * S, Math.PI * 1.5, Math.PI * 1.75); ctx.fill();
      break;
    }
    case 'flower': {
      ctx.fillStyle = '#2fae6a'; ctx.fillRect(-S * 0.2, -4 * S, S * 0.4, 4 * S);
      ctx.fillStyle = ['#ff5d8f', '#ffd24d', '#b14dff'][(x | 0) % 3];
      for (let a = 0; a < 5; a++) { const ang = (a / 5) * Math.PI * 2; dot(ctx, Math.cos(ang) * 1.6 * S, -4 * S + Math.sin(ang) * 1.6 * S, 1.1 * S); }
      ctx.fillStyle = '#fff3b0'; dot(ctx, 0, -4 * S, 0.9 * S);
      break;
    }
    case 'sign': {
      ctx.fillStyle = '#c9ccd2'; ctx.fillRect(-S * 0.3, -10 * S, S * 0.6, 10 * S);
      ctx.fillStyle = env.feature.night ? '#22d3ee' : '#e23b3b'; roundRect(ctx, -5 * S, -16 * S, 10 * S, 6 * S, S);
      ctx.fillStyle = '#fff'; ctx.fillRect(-3.4 * S, -13.6 * S, 6.8 * S, 1.1 * S);
      break;
    }
    case 'lamp': {
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(-S * 0.3, -20 * S, S * 0.6, 20 * S);
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(-4 * S, -20 * S, 4 * S, S * 0.6);
      ctx.fillStyle = '#ffe08a'; ctx.shadowBlur = 12; ctx.shadowColor = '#ffe08a';
      circle(ctx, -4 * S, -19 * S, 1.6 * S, true); ctx.shadowBlur = 0;
      break;
    }
    case 'building':
    default: {
      const h = (14 + ((x | 0) % 5) * 6) * S, w = 9 * S;
      ctx.fillStyle = env.feature.night ? '#1b2030' : '#8a8f9c';
      ctx.fillRect(-w / 2, -h, w, h);
      // Lit windows.
      ctx.fillStyle = env.feature.night ? '#ffd36b' : 'rgba(255,255,255,0.35)';
      for (let wy = -h + 2 * S; wy < -2 * S; wy += 3 * S)
        for (let wx = -w / 2 + 1.6 * S; wx < w / 2 - 1.2 * S; wx += 3 * S)
          if ((wx * 7 + wy * 3 | 0) % 3 !== 0) ctx.fillRect(wx, wy, 1.4 * S, 1.6 * S);
      if (env.feature.night) { ctx.fillStyle = '#22d3ee'; ctx.globalAlpha = 0.6; ctx.fillRect(-w / 2, -h, w, 1.4 * S); ctx.globalAlpha = 1; }
      break;
    }
  }
  ctx.restore();
}

// ---- On-road hazards (collidable). Drawn bottom-centred at x,yBase. ----
export function drawObstacle(ctx, type, x, yBase, roadW, env, width) {
  // Size off the projected road half-width — visible from a proper distance.
  const S = Math.min(roadW * 0.024, 46);
  if (S < 0.7) return;
  ctx.save(); ctx.translate(x, yBase);
  const shadow = () => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 0, 5 * S, 1.8 * S, 0, 0, Math.PI * 2); ctx.fill(); };
  switch (type) {
    case 'rock': shadow(); ctx.fillStyle = env.feature.night ? '#3a3a46' : '#8a7f6f';
      ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(-2.6 * S, -5 * S); ctx.lineTo(1 * S, -6.2 * S); ctx.lineTo(4 * S, -2.8 * S); ctx.lineTo(3.2 * S, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-2.4 * S, -4.6 * S, 3 * S, 1.3 * S); break;
    case 'boulder': shadow(); ctx.fillStyle = env.feature.night ? '#45454f' : '#777069';
      ctx.beginPath(); ctx.arc(0, -6 * S, 6.5 * S, Math.PI, 0); ctx.lineTo(6 * S, 0); ctx.lineTo(-6 * S, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(2 * S, -5 * S, 2 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(-2 * S, -8 * S, 2.4 * S, 0, Math.PI * 2); ctx.fill(); break;
    case 'barrel': shadow();
      ctx.fillStyle = '#d23b2b'; roundRect(ctx, -3.4 * S, -9 * S, 6.8 * S, 9 * S, 1.4 * S); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-3.4 * S, -7 * S, 6.8 * S, 1.2 * S); ctx.fillRect(-3.4 * S, -3.2 * S, 6.8 * S, 1.2 * S);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, -9 * S, 3.4 * S, 1 * S, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'cone': shadow();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(0, -9 * S); ctx.lineTo(3.2 * S, 0); ctx.lineTo(-3.2 * S, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-2.4 * S, -5.4 * S, 4.8 * S, 1.6 * S);
      ctx.fillStyle = '#ff7a1a'; ctx.fillRect(-4 * S, -1.2 * S, 8 * S, 1.2 * S); break;
    case 'tumbleweed': shadow(); ctx.strokeStyle = '#a5813f'; ctx.lineWidth = Math.max(1, S * 0.25);
      for (let a = 0; a < 7; a++) { const an = a / 7 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 4 * S, -3.5 * S + Math.sin(an) * 3.5 * S); ctx.lineTo(Math.cos(an + 2) * 3 * S, -3.5 * S + Math.sin(an + 2) * 3 * S); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, -3.5 * S, 4 * S, 0, Math.PI * 2); ctx.stroke(); break;
    case 'snowman': shadow(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cdd8e6'; ctx.lineWidth = 1;
      circle(ctx, 0, -3.4 * S, 3.6 * S, true); circle(ctx, 0, -8.6 * S, 2.6 * S, true); circle(ctx, 0, -12.6 * S, 1.9 * S, true);
      ctx.fillStyle = '#ff7a3d'; tri(ctx, 1.9 * S, -12.6 * S, 0.9 * S, 1.3 * S, true);
      ctx.fillStyle = '#222'; dot(ctx, -0.7 * S, -13 * S, 0.4 * S); dot(ctx, 0.7 * S, -13 * S, 0.4 * S); break;
    case 'snowball': shadow(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cdd8e6'; ctx.lineWidth = 1;
      circle(ctx, 0, -4 * S, 4.2 * S, true); ctx.fillStyle = 'rgba(180,210,240,0.5)'; dot(ctx, 1.4 * S, -3 * S, 1.2 * S); break;
    case 'iceblock': shadow(); ctx.fillStyle = 'rgba(150,220,255,0.7)'; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      roundRect(ctx, -4 * S, -7 * S, 8 * S, 7 * S, 1 * S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-3 * S, -6 * S, 2 * S, 5 * S); break;
    case 'ball': shadow();
      { const g = ctx.createRadialGradient(-1.5 * S, -6 * S, 0.5 * S, 0, -4.5 * S, 5 * S); g.addColorStop(0, '#fff'); g.addColorStop(1, '#ff4d6a'); ctx.fillStyle = g; circle(ctx, 0, -4.5 * S, 4.5 * S); }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -4.5 * S, 4.5 * S, 0.4, 2.7); ctx.stroke(); break;
    case 'sandcastle': shadow(); ctx.fillStyle = '#e6c07a';
      roundRect(ctx, -4.5 * S, -6 * S, 9 * S, 6 * S, 0.6 * S); ctx.fill();
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * 3 * S - 0.8 * S, -8.5 * S, 1.6 * S, 3 * S);
      ctx.fillStyle = '#c99a4a'; ctx.fillRect(-4.5 * S, -3.2 * S, 9 * S, 0.8 * S); break;
    case 'log': shadow(); ctx.fillStyle = '#6b4a2a'; roundRect(ctx, -7 * S, -3.4 * S, 14 * S, 3.4 * S, 1.6 * S); ctx.fill();
      ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.ellipse(-7 * S, -1.7 * S, 1.1 * S, 1.7 * S, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a5794a'; ctx.beginPath(); ctx.arc(-7 * S, -1.7 * S, 0.7 * S, 0, Math.PI * 2); ctx.fill(); break;
    case 'trashbin': shadow(); ctx.fillStyle = '#3f7a4a'; roundRect(ctx, -3.4 * S, -9 * S, 6.8 * S, 9 * S, 0.8 * S); ctx.fill();
      ctx.fillStyle = '#2c5a37'; roundRect(ctx, -4 * S, -10.5 * S, 8 * S, 1.8 * S, 0.8 * S); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-2 * S, -8 * S, 1.2 * S, 6 * S); break;
    case 'barrier': shadow(); // striped road block
      ctx.fillStyle = '#e23b3b'; roundRect(ctx, -8 * S, -5 * S, 16 * S, 5 * S, 0.8 * S); ctx.fill();
      ctx.fillStyle = '#fff'; for (let i = -8; i < 8; i += 3) ctx.fillRect(i * S, -5 * S, 1.5 * S, 5 * S);
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(-8 * S, -1.2 * S, 16 * S, 1.2 * S); break;
    case 'pit':
      // A pothole flush with the road — dark hole + rim, no height.
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.ellipse(0, -1 * S, 7 * S, 2.4 * S, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,90,0.5)'; ctx.lineWidth = Math.max(1, S * 0.3); ctx.beginPath(); ctx.ellipse(0, -1 * S, 7 * S, 2.4 * S, 0, 0, Math.PI * 2); ctx.stroke(); break;
    default: shadow(); ctx.fillStyle = '#8a7f6f'; circle(ctx, 0, -3 * S, 3 * S);
  }
  ctx.restore();
}

// ---- tiny shape helpers ----
function tri(ctx, cx, cy, halfW, h, up = false) {
  ctx.beginPath();
  if (up) { ctx.moveTo(cx, cy - h); ctx.lineTo(cx + halfW, cy); ctx.lineTo(cx - halfW, cy); }
  else { ctx.moveTo(cx, cy); ctx.lineTo(cx + halfW, cy + h); ctx.lineTo(cx - halfW, cy + h); }
  ctx.closePath(); ctx.fill();
}
function circle(ctx, cx, cy, r, stroke) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); if (stroke) ctx.stroke(); }
function dot(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
function roundBar(ctx, x, y, w, h, r) { roundRect(ctx, x, y, w, h, r); ctx.fill(); ctx.stroke(); }
function frond(ctx, x, y, ang, len) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.6, -len * 0.2, len, len * 0.2); ctx.quadraticCurveTo(len * 0.6, len * 0.1, 0, 0); ctx.fill(); ctx.restore(); }
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
