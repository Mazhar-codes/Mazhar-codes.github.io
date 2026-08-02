// =====================================================================
// ui.js — DOM menus & overlays: main menu (Free/Hardcore), race setup
// (track + mode), garage (buy cars + NFS upgrades with a live car preview
// that shows the visible parts), pause, and results. HUD text/minimap are
// handled by main.js; this owns everything else.
// =====================================================================
import { CARS, TRACKS, RACE_MODES, UPGRADES, ENVIRONMENTS } from './config.js';
import { computeStats, drawCar } from './car.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (ms) => { if (!ms || !isFinite(ms)) return '--:--'; const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10); return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`; };
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export class UI {
  constructor(game) {
    this.g = game;
    this.overlay = document.getElementById('overlay');
    this.toastEl = document.getElementById('toast');
    this.touch = document.getElementById('touch');
    this.garageCarId = game.economy.state.selectedCar;
    this._build();
    this._wire();
    this.refreshMenu();
  }

  // ------------------------- Screen switching ----------------------
  show(screen) {
    const inRace = screen === 'race';
    this.g.hud.classList.toggle('hidden', !(inRace || screen === 'pause'));
    this.touch.classList.toggle('hidden', !(inRace && hasTouch));
    for (const p of this.overlay.querySelectorAll('.panel')) p.classList.add('hidden');
    this.overlay.classList.toggle('hidden', inRace);
    if (!inRace) { const p = document.getElementById('scr-' + screen); if (p) p.classList.remove('hidden'); }
    if (screen === 'menu') this.refreshMenu();
    if (screen === 'setup') this.refreshSetup();
    if (screen === 'garage') this.refreshGarage();
  }

  _build() { this._buildMenu(); this._buildSetup(); this._buildGarage(); this._buildPause(); this._buildResults(); }

  // ------------------------- Menu ----------------------------------
  _buildMenu() {
    const p = el('section', 'panel center', `
      <div class="brand"><h1>NITRO<span>RUSH</span></h1><p class="tag">Arcade Racer</p></div>
      <div class="stat-row"><span>🪙 <b data-credits>0</b></span></div>
      <div class="mode-select" data-mode-select>
        <button data-mode="free">😎 Free Play</button>
        <button data-mode="hardcore">🔥 Hardcore</button>
      </div>
      <p class="mode-note" data-mode-note></p>
      <div class="btns">
        <button class="btn primary" data-race>▶ RACE</button>
        <button class="btn" data-garage>🔧 GARAGE</button>
        <button class="btn ghost" data-sound>🔊 Sound: On</button>
        <button class="btn ghost" data-exit hidden>← Back to Portfolio</button>
      </div>
      <p class="hint">Drive: <b>W/↑</b> gas · <b>S/↓</b> brake · <b>A·D / ←·→</b> steer · <b>Shift/Space</b> nitro · <b>P</b> pause</p>`);
    p.id = 'scr-menu'; this.overlay.appendChild(p);
    p.querySelector('[data-race]').onclick = () => { this.g.audio.ui(); this.show('setup'); };
    p.querySelector('[data-garage]').onclick = () => { this.g.audio.ui(); this.show('garage'); };
    this.soundBtn = p.querySelector('[data-sound]'); this.soundBtn.onclick = () => this._toggleSound();
    this.modeBtns = p.querySelectorAll('[data-mode]');
    this.modeBtns.forEach((b) => b.onclick = () => { this.g.audio.ui(); this.g.setMode(b.dataset.mode); });
    const exit = p.querySelector('[data-exit]');
    if (this.g.embedded) { exit.hidden = false; exit.onclick = () => { this.g.audio.ui(); this.g.exitToPortfolio(); }; }
  }
  refreshMenu() {
    const s = this.g.economy.state;
    document.querySelector('[data-credits]').textContent = s.credits.toLocaleString();
    if (this.soundBtn) this.soundBtn.textContent = s.settings.sound ? '🔊 Sound: On' : '🔇 Sound: Off';
    const free = this.g.economy.isFree();
    this.modeBtns.forEach((b) => b.classList.toggle('active', (b.dataset.mode === 'hardcore') === !free));
    const note = document.querySelector('[data-mode-note]');
    if (note) note.textContent = free ? 'Free Play · every car & upgrade unlocked. Just drive.'
      : 'Hardcore · earn credits, buy cars, tune parts, chase best times.';
  }
  _toggleSound() {
    const s = this.g.economy.state.settings; s.sound = !s.sound; this.g.economy.save();
    this.g.audio.setEnabled(s.sound); this.g.audio.resume(); this.g.audio.ui(); this.refreshMenu();
  }

  // ------------------------- Setup (track + mode) ------------------
  _buildSetup() {
    const p = el('section', 'panel wide', `
      <header class="head"><h2>CHOOSE TRACK</h2><button class="btn ghost small" data-back>✕ Back</button></header>
      <div class="track-grid" data-tracks></div>
      <div class="mode-row"><span class="lbl">MODE</span><div class="seg" data-race-modes></div></div>
      <div class="setup-foot">
        <div class="chosen" data-chosen></div>
        <button class="btn primary" data-start>▶ START RACE</button>
      </div>`);
    p.id = 'scr-setup'; this.overlay.appendChild(p);
    p.querySelector('[data-back]').onclick = () => { this.g.audio.ui(); this.show('menu'); };
    p.querySelector('[data-start]').onclick = () => { this.g.audio.ui(); this.g.startRace(); };
    this.trackGrid = p.querySelector('[data-tracks]');
    this.modeSeg = p.querySelector('[data-race-modes]');
    this.chosen = p.querySelector('[data-chosen]');
  }
  refreshSetup() {
    const g = this.g;
    this.trackGrid.innerHTML = '';
    for (const t of TRACKS) {
      const env = ENVIRONMENTS[t.env];
      const best = g.economy.best(t.id, g.raceMode.id);
      const card = el('div', 'track-card' + (t.id === g.trackDef.id ? ' sel' : ''));
      card.style.setProperty('--sky0', env.sky[0]); card.style.setProperty('--sky1', env.sky[1]);
      card.innerHTML = `<div class="tc-emoji">${env.emoji}</div><h3>${env.name}</h3>
        <p>${env.blurb}</p>
        <div class="tc-foot"><span>${env.feature.night ? 'NIGHT' : 'DAY'}</span><span>BEST ${best ? fmt(best.time) : '--:--'}</span></div>`;
      card.onclick = () => { g.audio.ui(); g.trackDef = t; g.menuEnv = env; this.refreshSetup(); };
      this.trackGrid.appendChild(card);
    }
    this.modeSeg.innerHTML = '';
    for (const m of RACE_MODES) {
      const b = el('button', 'seg-btn' + (m.id === g.raceMode.id ? ' active' : ''), `${m.icon} ${m.name}`);
      b.onclick = () => { g.audio.ui(); g.raceMode = m; this.refreshSetup(); };
      this.modeSeg.appendChild(b);
    }
    const car = CARS.find((c) => c.id === g.economy.state.selectedCar);
    const modeDesc = RACE_MODES.find((m) => m.id === g.raceMode.id).desc;
    this.chosen.innerHTML =
      `<span style="display:block;color:var(--muted);font-size:13px;line-height:1.4">${modeDesc}</span>` +
      `<b style="display:block;margin-top:6px;color:var(--text);font-size:14px">🚗 ${car.name}</b>`;
  }

  // ------------------------- Garage --------------------------------
  _buildGarage() {
    const p = el('section', 'panel wide', `
      <header class="head"><h2>GARAGE</h2>
        <span class="free-tag hidden" data-free-tag>FREE MODE</span>
        <span class="credits-pill">🪙 <b data-g-credits>0</b></span>
        <button class="btn ghost small" data-back>✕ Back</button></header>
      <div class="garage-body">
        <div class="garage-left">
          <canvas id="carPreview" width="300" height="180"></canvas>
          <div class="car-strip" data-car-strip></div>
        </div>
        <div class="garage-right">
          <div class="car-name" data-car-name></div>
          <div class="stat-bars" data-stat-bars></div>
          <div class="upgrades" data-upgrades></div>
        </div>
      </div>`);
    p.id = 'scr-garage'; this.overlay.appendChild(p);
    p.querySelector('[data-back]').onclick = () => { this.g.audio.ui(); this.show('menu'); };
    this.carStrip = p.querySelector('[data-car-strip]');
    this.statBars = p.querySelector('[data-stat-bars]');
    this.upgradesBox = p.querySelector('[data-upgrades]');
    this.carName = p.querySelector('[data-car-name]');
    this.previewCanvas = p.querySelector('#carPreview');
    this.previewCtx = this.previewCanvas.getContext('2d');
  }
  refreshGarage() {
    const g = this.g, eco = g.economy, free = eco.isFree();
    document.querySelector('[data-g-credits]').textContent = eco.state.credits.toLocaleString();
    document.querySelector('[data-free-tag]').classList.toggle('hidden', !free);
    // Allow PREVIEWING any car (owned or not) — only fall back if the id is
    // somehow invalid. (Previously unowned cars snapped back to the equipped
    // car, so clicking a locked car appeared to do nothing.)
    if (!CARS.find((c) => c.id === this.garageCarId)) this.garageCarId = eco.state.selectedCar;

    // Car strip (owned/buy/equip).
    this.carStrip.innerHTML = '';
    for (const c of CARS) {
      const owned = eco.owns(c.id), equipped = eco.state.selectedCar === c.id, viewing = c.id === this.garageCarId;
      const chip = el('button', 'car-chip' + (viewing ? ' viewing' : '') + (equipped ? ' equipped' : ''));
      chip.style.setProperty('--c', c.color);
      chip.innerHTML = `<span class="dot"></span>${c.name}${equipped ? ' ✓' : owned ? '' : ` · ${free ? 'FREE' : '🪙' + c.price.toLocaleString()}`}`;
      chip.onclick = () => { g.audio.ui(); this.garageCarId = c.id; this.refreshGarage(); };
      this.carStrip.appendChild(chip);
    }

    const car = CARS.find((c) => c.id === this.garageCarId);
    const up = eco.carUpgrades(car.id);
    const st = computeStats(car, up, null);
    this.carName.innerHTML = `<h3 style="color:${car.color}">${car.name}</h3><p>${car.desc}</p>`;

    // Stat bars.
    const bar = (label, val, max) => `<div class="sb"><span>${label}</span><i style="width:${Math.round(val / max * 100)}%"></i></div>`;
    this.statBars.innerHTML =
      bar('TOP SPEED', st.topKmh, 320) +
      bar('ACCEL', st.accelRate, 4200) +
      bar('GRIP', st.grip, 1.9) +
      bar('BRAKE', -st.brakeRate, 9000);

    // Buy / equip / upgrades.
    this.upgradesBox.innerHTML = '';
    if (!eco.owns(car.id)) {
      const buy = el('button', 'btn primary full', free ? 'Unlock · FREE' : `Buy Car · 🪙${car.price.toLocaleString()}`);
      buy.disabled = !free && eco.state.credits < car.price;
      buy.onclick = () => { const r = eco.buyCar(car.id); if (r.ok) { eco.select(car.id); this.toast('Purchased!'); this.g.audio.coin(); this.refreshGarage(); } else this.toast('Not enough credits'); };
      this.upgradesBox.appendChild(buy);
    } else {
      if (eco.state.selectedCar !== car.id) {
        const eq = el('button', 'btn full', 'Equip This Car');
        eq.onclick = () => { eco.select(car.id); this.g.audio.ui(); this.refreshGarage(); };
        this.upgradesBox.appendChild(eq);
      }
      for (const u of UPGRADES) {
        const lvl = eco.upgradeLevel(car.id, u.id), price = eco.upgradePrice(car.id, u.id), maxed = price == null;
        const row = el('div', 'up-row');
        const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        // Inline styles force clean vertical stacking (the class-based flex was
        // unreliable here, letting the name/description/pips overlap).
        row.innerHTML =
          `<div class="up-ico">${u.icon}</div>` +
          `<div class="up-mid" style="flex:1;min-width:0">` +
            `<b style="display:block;font-size:14px;line-height:1.25">${u.name}</b>` +
            `<span style="display:block;font-size:11px;color:var(--muted);line-height:1.35;margin:2px 0 4px">${u.desc}</span>` +
            `<div class="pips" style="display:flex;gap:4px">${pips}</div>` +
          `</div>` +
          `<div class="up-act"></div>`;
        const act = row.querySelector('.up-act');
        if (maxed) act.innerHTML = '<span class="badge">MAX</span>';
        else {
          const b = el('button', 'btn small primary', free ? 'FREE' : `🪙${price.toLocaleString()}`);
          b.disabled = !free && eco.state.credits < price;
          b.onclick = () => { const r = eco.buyUpgrade(car.id, u.id); if (r.ok) { this.g.audio.coin(); this.refreshGarage(); } else this.toast('Not enough credits'); };
          act.appendChild(b);
        }
        this.upgradesBox.appendChild(row);
      }
    }
    this._drawPreview(car, st.parts);
  }
  _drawPreview(car, parts) {
    const ctx = this.previewCtx, w = this.previewCanvas.width, h = this.previewCanvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#141a2a'); g.addColorStop(1, '#0a0e17');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, h * 0.58 + i * 7); ctx.lineTo(w, h * 0.58 + i * 7); ctx.stroke(); }
    drawCar(ctx, w / 2, h * 0.92, w * 0.42, car, parts, { steer: 0 });
  }

  // ------------------------- Pause ---------------------------------
  _buildPause() {
    const p = el('section', 'panel center small', `
      <h2>PAUSED</h2>
      <div class="btns">
        <button class="btn primary" data-resume>Resume</button>
        <button class="btn" data-restart>Restart</button>
        <button class="btn" data-quit>Quit to Menu</button>
        <button class="btn ghost" data-exit hidden>← Back to Portfolio</button>
      </div>`);
    p.id = 'scr-pause'; this.overlay.appendChild(p);
    p.querySelector('[data-resume]').onclick = () => { this.g.audio.ui(); this.g.togglePause(); };
    p.querySelector('[data-restart]').onclick = () => { this.g.audio.ui(); this.g.startRace(); };
    p.querySelector('[data-quit]').onclick = () => { this.g.audio.ui(); this.g.quitToMenu(); };
    const exit = p.querySelector('[data-exit]');
    if (this.g.embedded) { exit.hidden = false; exit.onclick = () => { this.g.audio.ui(); this.g.exitToPortfolio(); }; }
  }

  // ------------------------- Results -------------------------------
  _buildResults() {
    const p = el('section', 'panel center', `
      <h2 class="res-title" data-res-title>FINISHED</h2>
      <div class="res-place" data-res-place></div>
      <div class="res-stats" data-res-stats></div>
      <div class="btns" data-res-btns></div>`);
    p.id = 'scr-results'; this.overlay.appendChild(p);
    this.resTitle = p.querySelector('[data-res-title]');
    this.resPlace = p.querySelector('[data-res-place]');
    this.resStats = p.querySelector('[data-res-stats]');
    this.resBtns = p.querySelector('[data-res-btns]');
  }
  showResults(d) {
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'][d.place - 1] || d.place + 'th';
    const win = d.place === 1;
    this.resTitle.textContent = win ? '🏆 VICTORY' : d.place <= 3 ? '🏁 PODIUM' : 'RACE COMPLETE';
    this.resTitle.style.color = win ? '#ffd24d' : '#e8f0ff';
    this.resPlace.innerHTML = `<b>${ord}</b><span>of ${d.field}</span>`;
    const rows = [
      ['Total Time', fmt(d.time)],
      ['Best Lap', fmt(d.bestLap)],
    ];
    if (!this.g.economy.isFree()) rows.push(['Credits Earned', '🪙 ' + d.credits.toLocaleString()]);
    else rows.push(['Mode', 'Free Play']);
    if (d.improved) rows.push(['', '★ New record!']);
    this.resStats.innerHTML = rows.map(([k, v]) => `<div class="rs"><span>${k}</span><b>${v}</b></div>`).join('');
    this.resBtns.innerHTML = '';
    const again = el('button', 'btn primary', '🔁 Race Again'); again.onclick = () => { this.g.audio.ui(); this.g.startRace(); };
    const garage = el('button', 'btn', '🔧 Garage'); garage.onclick = () => { this.g.audio.ui(); this.g.state = 'menu'; this.show('garage'); };
    const menu = el('button', 'btn ghost', '🏠 Menu'); menu.onclick = () => { this.g.audio.ui(); this.g.quitToMenu(); };
    this.resBtns.append(again, garage, menu);
    this.show('results');
  }

  // ------------------------- Toasts --------------------------------
  toast(text) {
    this.toastEl.textContent = text; this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; this.toastEl.classList.add('show');
    clearTimeout(this._t); this._t = setTimeout(() => this.toastEl.classList.add('hidden'), 1400);
  }
  raceToast(text) {
    const e = this.g._h.toast;
    e.textContent = text; e.classList.remove('hidden'); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(this._rt); this._rt = setTimeout(() => e.classList.add('hidden'), 1100);
  }

  _wire() {
    this.g.hud.querySelector('[data-pause]').onclick = () => this.g.togglePause();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') { if (this.g.state === 'racing' || this.g.state === 'paused') this.g.togglePause(); }
    });
  }
}
