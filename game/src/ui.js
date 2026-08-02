// =====================================================================
// ui.js — DOM/CSS user interface: menu, HUD, shop, pause, game over.
// Canvas draws the world; the UI is HTML for crisp, responsive, and
// accessible screens. UI reads game state; buttons call game methods.
// =====================================================================
import { SHIPS, WEAPONS, MISSILES, UPGRADES, SKINS } from './config.js';
import { ACHIEVEMENTS } from './achievements.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor(game) {
    this.g = game;
    this.hud = $('#hud');
    this.overlay = $('#overlay');
    this.toastEl = $('#toast');
    this.shopTab = 'ship';
    this._buildMenu();
    this._buildShop();
    this._buildAchievements();
    this._buildPause();
    this._buildGameOver();
    this._wireHud();
    this.refreshMenu();
  }

  // ------------------------- Screen switching ----------------------
  show(screen) {
    // screen: 'menu' | 'game' | 'shop' | 'pause' | 'gameover'
    const inGame = screen === 'game';
    this.hud.classList.toggle('hidden', !(inGame || screen === 'pause'));
    for (const p of this.overlay.querySelectorAll('.panel')) p.classList.add('hidden');
    this.overlay.classList.toggle('hidden', inGame);
    if (!inGame) { const panel = $('#' + screen); if (panel) panel.classList.remove('hidden'); }
    if (screen === 'menu') this.refreshMenu();
    if (screen === 'shop') this.refreshShop();
    if (screen === 'achievements') this.refreshAchievements();
  }

  // ------------------------- Menu ----------------------------------
  _buildMenu() {
    const p = el('section', 'panel', `
      <div class="brand">
        <h1>DEVASTATOR</h1>
        <p class="tag">Arcade Space Shooter</p>
      </div>
      <div class="stat-row">
        <span>💰 <b data-coins>0</b></span>
        <span>🏆 Best <b data-best>0</b></span>
      </div>
      <div class="mode-select" data-mode-select>
        <button data-mode="free">😎 Free Play</button>
        <button data-mode="hardcore">🔥 Hardcore</button>
      </div>
      <p class="mode-note" data-mode-note></p>
      <div class="menu-btns">
        <button class="btn primary" data-play>▶ PLAY</button>
        <button class="btn" data-shop>🛒 HANGAR / SHOP</button>
        <button class="btn" data-achv>🏅 ACHIEVEMENTS</button>
        <button class="btn ghost" data-sound>🔊 Sound: On</button>
        <button class="btn ghost" data-exit hidden>← Back to Portfolio</button>
      </div>
      <p class="hint">Desktop: WASD/Arrows move · Mouse aim · Click/Space fire · Shift/X missile · B bomb · P pause<br>
      Mobile: touch to move &amp; auto-fire · missile button bottom-right</p>`);
    p.id = 'menu';
    this.overlay.appendChild(p);
    $('[data-play]', p).onclick = () => { this.g.audio.ui(); this.g.startRun(); };
    $('[data-shop]', p).onclick = () => { this.g.audio.ui(); this.show('shop'); };
    $('[data-achv]', p).onclick = () => { this.g.audio.ui(); this.show('achievements'); };
    this.soundBtn = $('[data-sound]', p);
    this.soundBtn.onclick = () => this._toggleSound();
    // Mode selector (Free Play / Hardcore) — swaps the save slot & economy.
    this.modeBtns = p.querySelectorAll('[data-mode]');
    this.modeBtns.forEach((b) => b.onclick = () => { this.g.audio.ui(); this.g.setMode(b.dataset.mode); });
    // Exit affordance only when the game is embedded in the portfolio (/game/).
    const exitBtn = $('[data-exit]', p);
    if (this.g.embedded) { exitBtn.hidden = false; exitBtn.onclick = () => { this.g.audio.ui(); this.g.exitToPortfolio(); }; }
  }
  refreshMenu() {
    const s = this.g.economy.state;
    $('[data-coins]').textContent = s.coins;
    $('[data-best]').textContent = s.highScore;
    if (this.soundBtn) this.soundBtn.textContent = s.settings.sound ? '🔊 Sound: On' : '🔇 Sound: Off';
    // Reflect the active game mode.
    const free = this.g.economy.isFree();
    if (this.modeBtns) this.modeBtns.forEach((b) => b.classList.toggle('active', (b.dataset.mode === 'hardcore') === !free));
    const note = $('[data-mode-note]');
    if (note) note.textContent = free
      ? 'Free Play · every ship, gun & rocket unlocked. Just blast.'
      : 'Hardcore · nothing given. Earn coins, unlock everything, chase a real high score.';
  }
  _toggleSound() {
    const s = this.g.economy.state.settings;
    s.sound = !s.sound; this.g.economy.save();
    this.g.audio.setEnabled(s.sound); this.g.audio.resume(); this.g.audio.ui();
    this.refreshMenu();
  }

  // ------------------------- Shop -----------------------------------
  _buildShop() {
    const p = el('section', 'panel shop', `
      <header class="shop-head">
        <h2>HANGAR</h2>
        <span class="free-tag hidden" data-free-tag>FREE MODE</span>
        <span class="coins-pill">💰 <b data-shop-coins>0</b></span>
        <button class="btn ghost small" data-close>✕ Close</button>
      </header>
      <nav class="tabs">
        <button data-tab="ship" class="active">Ships</button>
        <button data-tab="weapon">Weapons</button>
        <button data-tab="missile">Missiles</button>
        <button data-tab="upgrade">Upgrades</button>
        <button data-tab="skin">Skins</button>
      </nav>
      <div class="shop-grid" data-grid></div>`);
    p.id = 'shop';
    this.overlay.appendChild(p);
    $('[data-close]', p).onclick = () => { this.g.audio.ui(); this.show('menu'); };
    this.tabBtns = p.querySelectorAll('[data-tab]');
    this.tabBtns.forEach((b) => b.onclick = () => {
      this.shopTab = b.dataset.tab; this.g.audio.ui();
      this.tabBtns.forEach((x) => x.classList.toggle('active', x === b));
      this.refreshShop();
    });
    this.grid = $('[data-grid]', p);
  }

  refreshShop() {
    const free = this.g.economy.isFree();
    $('[data-shop-coins]').textContent = this.g.economy.state.coins;
    $('[data-free-tag]').classList.toggle('hidden', !free);
    this.grid.innerHTML = '';
    const kind = this.shopTab;
    if (kind === 'upgrade') return this._renderUpgrades();
    const catalog = { ship: SHIPS, weapon: WEAPONS, missile: MISSILES, skin: SKINS }[kind];
    const selectedId = {
      ship: this.g.economy.state.selectedShip, weapon: this.g.economy.state.selectedWeapon,
      missile: this.g.economy.state.selectedMissile, skin: this.g.economy.state.selectedSkin,
    }[kind];

    for (const item of catalog) {
      const owned = this.g.economy.owns(kind, item.id);
      const selected = item.id === selectedId;
      const card = el('div', 'card' + (selected ? ' selected' : ''));
      const stats = this._statLine(kind, item);
      card.innerHTML = `
        <div class="card-top" style="--accent:${item.color || item.trail || '#4dd0ff'}">
          <span class="swatch"></span><h3>${item.name}</h3>
        </div>
        <p class="desc">${item.desc || ''}</p>
        ${stats}
        <div class="card-foot"></div>`;
      const foot = $('.card-foot', card);
      if (!owned) {
        const buy = el('button', 'btn small primary', free ? 'Unlock · FREE' : `Buy 💰${item.price}`);
        buy.disabled = free ? false : this.g.economy.state.coins < item.price;
        buy.onclick = () => this._doBuy(kind, item.id);
        foot.appendChild(buy);
      } else if (selected) {
        foot.appendChild(el('span', 'badge', '✓ Equipped'));
      } else {
        const sel = el('button', 'btn small', 'Equip');
        sel.onclick = () => { this.g.economy.select(kind, item.id); this.g.audio.ui(); this.refreshShop(); };
        foot.appendChild(sel);
      }
      this.grid.appendChild(card);
    }
  }

  _statLine(kind, item) {
    if (kind === 'ship') return `<ul class="stats"><li>HP ${item.hp}</li><li>SPD ${(item.speedMult*100)|0}%</li><li>FIRE ${(item.fireMult*100)|0}%</li></ul>`;
    if (kind === 'weapon') return `<ul class="stats"><li>DMG ${item.damage}</li><li>RATE ${item.fireRate}/s</li></ul>`;
    if (kind === 'missile') return item.id === 'none' ? '' : `<ul class="stats"><li>DMG ${item.damage}</li><li>AMMO ${item.ammo}</li></ul>`;
    return '';
  }

  _renderUpgrades() {
    const free = this.g.economy.isFree();
    for (const u of UPGRADES) {
      const lvl = this.g.economy.upgradeLevel(u.id);
      const price = this.g.economy.upgradePrice(u.id);
      const maxed = price == null;
      const card = el('div', 'card');
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      card.innerHTML = `
        <div class="card-top" style="--accent:#7df9ff"><span class="ico">${u.icon}</span><h3>${u.name}</h3></div>
        <p class="desc">${u.desc}</p>
        <div class="pips">${pips}</div>
        <div class="card-foot"></div>`;
      const foot = $('.card-foot', card);
      if (maxed) foot.appendChild(el('span', 'badge', '★ MAX'));
      else {
        const b = el('button', 'btn small primary', free ? 'Upgrade · FREE' : `Upgrade 💰${price}`);
        b.disabled = free ? false : this.g.economy.state.coins < price;
        b.onclick = () => {
          const r = this.g.economy.buyUpgrade(u.id);
          if (r.ok) { this.g.audio.pickup(); this.refreshShop(); }
          else this.toast(r.reason === 'poor' ? 'Not enough coins' : 'Maxed');
        };
        foot.appendChild(b);
      }
      this.grid.appendChild(card);
    }
  }

  _doBuy(kind, id) {
    const fn = { ship: 'buyShip', weapon: 'buyWeapon', missile: 'buyMissile', skin: 'buySkin' }[kind];
    const r = this.g.economy[fn](id);
    if (r.ok) {
      this.g.economy.select(kind, id); this.g.audio.pickup(); this.toast('Purchased & equipped!');
      this.g.achievements.set('fullHangar', this.g.economy.ownsAllShipsWeapons()); this.g.achievements.check();
      this.refreshShop();
    }
    else this.toast(r.reason === 'poor' ? 'Not enough coins' : 'Already owned');
  }

  // ------------------------- Achievements ---------------------------
  _buildAchievements() {
    const p = el('section', 'panel shop', `
      <header class="shop-head">
        <h2>ACHIEVEMENTS</h2>
        <span class="coins-pill" data-achv-count>0 / 0</span>
        <button class="btn ghost small" data-close>✕ Close</button>
      </header>
      <div class="shop-grid" data-achv-grid></div>`);
    p.id = 'achievements';
    this.overlay.appendChild(p);
    $('[data-close]', p).onclick = () => { this.g.audio.ui(); this.show('menu'); };
    this.achvGrid = $('[data-achv-grid]', p);
  }
  refreshAchievements() {
    const A = this.g.achievements;
    $('[data-achv-count]').textContent = `${A.count()} / ${A.total()}`;
    this.achvGrid.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const done = A.isUnlocked(a.id);
      const card = el('div', 'card achv' + (done ? ' selected' : ' locked'));
      card.innerHTML = `
        <div class="card-top" style="--accent:${done ? '#ffd24d' : '#5c5c66'}">
          <span class="ico">${done ? a.icon : '🔒'}</span><h3>${a.name}</h3>
        </div>
        <p class="desc">${a.desc}</p>
        <div class="card-foot">${done ? '<span class="badge">✓ Unlocked</span>' : '<span class="badge locked-badge">Locked</span>'}</div>`;
      this.achvGrid.appendChild(card);
    }
  }
  // Distinct, celebratory unlock popup (separate from the plain toast).
  achievementToast(a) {
    this.g.audio.pickup();
    const t = el('div', 'achv-pop', `<span class="ap-ico">${a.icon}</span><div><b>Achievement Unlocked</b><span>${a.name}</span></div>`);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  // ------------------------- Pause ----------------------------------
  _buildPause() {
    const p = el('section', 'panel small-panel', `
      <h2>PAUSED</h2>
      <div class="menu-btns">
        <button class="btn primary" data-resume>Resume</button>
        <button class="btn" data-quit>Quit to Menu</button>
        <button class="btn ghost" data-exit hidden>← Back to Portfolio</button>
      </div>`);
    p.id = 'pause';
    this.overlay.appendChild(p);
    $('[data-resume]', p).onclick = () => { this.g.audio.ui(); this.g.togglePause(); };
    $('[data-quit]', p).onclick = () => { this.g.audio.ui(); this.g.quitToMenu(); };
    const exitBtn = $('[data-exit]', p);
    if (this.g.embedded) { exitBtn.hidden = false; exitBtn.onclick = () => { this.g.audio.ui(); this.g.exitToPortfolio(); }; }
  }

  // ------------------------- Game Over ------------------------------
  _buildGameOver() {
    const p = el('section', 'panel small-panel', `
      <h2 class="danger">SHIP DESTROYED</h2>
      <div class="go-stats">
        <div><span>Score</span><b data-go-score>0</b></div>
        <div><span>Coins</span><b data-go-coins>0</b></div>
        <div><span>Best</span><b data-go-best>0</b></div>
      </div>
      <div class="menu-btns" data-go-btns></div>`);
    p.id = 'gameover';
    this.overlay.appendChild(p);
    this.goBtns = $('[data-go-btns]', p);
  }
  showGameOver(data) {
    $('[data-go-score]').textContent = data.score;
    $('[data-go-coins]').textContent = data.coins;
    $('[data-go-best]').textContent = data.best + (data.isBest ? ' ★' : '');
    this.goBtns.innerHTML = '';
    // One rewarded-ad revive per run.
    if (!this.g._revivedOnce) {
      const adBtn = el('button', 'btn primary', '📺 Revive (Watch Ad)');
      adBtn.onclick = async () => {
        adBtn.disabled = true; adBtn.textContent = 'Loading ad…';
        const ok = await this.g.ads.showRewarded('revive');
        if (ok) { this.g._revivedOnce = true; this.g.revive(); }
        else { adBtn.disabled = false; adBtn.textContent = '📺 Revive (Watch Ad)'; this.toast('Ad unavailable'); }
      };
      this.goBtns.appendChild(adBtn);
    }
    this.show('gameover');
    const playAgain = el('button', 'btn', '🔁 Play Again');
    playAgain.onclick = () => { this.g.audio.ui(); this.g.startRun(); };
    const menu = el('button', 'btn ghost', '🏠 Menu');
    menu.onclick = () => { this.g.audio.ui(); this.g.state = 'menu'; this.show('menu'); };
    this.goBtns.appendChild(playAgain);
    this.goBtns.appendChild(menu);
  }

  // ------------------------- HUD ------------------------------------
  _wireHud() {
    $('[data-pause]', this.hud).onclick = () => this.g.togglePause();
    $('[data-fire-missile]', this.hud).onclick = () => { this.g.input.secondary = true; setTimeout(() => this.g.input.secondary = false, 50); };
    $('[data-bomb]', this.hud).onclick = () => this.g.useBomb();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') this.g.togglePause();
      if (e.code === 'KeyB') this.g.useBomb();
    });
  }

  // ---- Boss bar ----
  showBossBar(name) {
    const bar = $('[data-boss-bar]', this.hud);
    $('[data-boss-name]', this.hud).textContent = name;
    bar.classList.remove('hidden');
  }
  hideBossBar() { $('[data-boss-bar]', this.hud).classList.add('hidden'); }

  // ---- Bonus round banner ----
  showBonus() { this.toast('💰 COIN RUSH!'); this._bonus = true; }
  hideBonus() { this._bonus = false; }
  updateHud(g) {
    const p = g.player; if (!p) return;
    $('[data-hud-score]').textContent = g.score;
    $('[data-hud-coins]').textContent = g.totalCoins();
    $('[data-hud-wave]').textContent = g.roundType === 'bonus' ? '★' : g.wave;
    const pct = Math.max(0, p.hp / p.stats.maxHp) * 100;
    $('[data-hp-fill]').style.width = pct + '%';
    $('[data-hp-fill]').style.background = pct > 50 ? '#6bff8c' : pct > 25 ? '#ffd24d' : '#ff5d5d';
    const mAmmo = $('[data-missile-ammo]');
    if (g.player.stats.missile.id === 'none') { $('[data-fire-missile]').style.display = 'none'; }
    else { $('[data-fire-missile]').style.display = ''; mAmmo.textContent = g.missileAmmo; }
    $('[data-shield]').textContent = p.shield > 0 ? '🔆'.repeat(p.shield) : '';

    // Bomb count.
    $('[data-bomb-count]').textContent = g.bombs;
    $('[data-bomb]').style.opacity = g.bombs > 0 ? '1' : '0.35';

    // Boss HP bar.
    if (g.boss) { const f = Math.max(0, g.boss.hp / g.boss.maxHp) * 100; $('[data-boss-hp]').style.width = f + '%'; }

    // Combo multiplier.
    const combo = $('[data-combo]');
    if (g.comboMult > 1) { combo.classList.remove('hidden'); $('[data-combo-mult]').textContent = 'x' + g.comboMult.toFixed(1); }
    else combo.classList.add('hidden');

    // Active timed buffs.
    const buffs = $('[data-buffs]');
    const icons = [];
    if (p.buffs.rapid > 0) icons.push('⚡' + Math.ceil(p.buffs.rapid));
    if (p.buffs.spread > 0) icons.push('✳' + Math.ceil(p.buffs.spread));
    if (p.buffs.magnet > 0) icons.push('🧲' + Math.ceil(p.buffs.magnet));
    buffs.innerHTML = icons.map((i) => `<span>${i}</span>`).join('');
  }

  // ------------------------- Toast ----------------------------------
  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; // restart anim
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.add('hidden'), 1400);
  }
}
