# 🚀 Devastator — Arcade Space Shooter

A fast, responsive, web-based arcade space shooter with a coin economy, a
**Hangar/Shop** (ships, weapons, missiles, skins, upgrades), and **pluggable ad
monetization**. Pure HTML5 Canvas + ES modules — **no build step, no
dependencies**. Runs on any static host.

## ▶️ Run locally

```bash
node serve.mjs      # then open http://localhost:8080
# or:
npx serve .         # or:  python -m http.server 8080
```

> ES modules require an HTTP server — opening `index.html` via `file://` won't work.

## 🎮 Controls

| Action        | Desktop                     | Mobile                         |
|---------------|-----------------------------|--------------------------------|
| Move          | `WASD` / Arrow keys         | Touch & drag (ship follows)    |
| Aim           | Mouse                       | Auto-aim nearest enemy         |
| Fire          | `Space` / Left-click        | Auto-fires while touching      |
| Missile       | `Shift` / `X`               | 🚀 button (bottom-right)       |
| Pause         | `P` / ⏸ button              | ⏸ button                       |

## 🧩 Architecture

```
index.html ── canvas + HTML overlays (HUD / menu / shop)
src/
  main.js         Orchestrator: fixed-timestep loop, spawning, collisions, run lifecycle, screen FX
  core.js         Engine primitives: math, EventBus, Storage, Canvas(DPR), Input, Audio, Pool
  entities.js     Player, Enemy (incl. ranged gunner), Bullet (piercing), Missile (homing/splash),
                  Coin, Particle, Star (twinkle), Floater (score text), Shockwave (impact ring)
  boss.js         Multi-phase bosses (spread / aimed / spiral bullet patterns)
  economy.js      Coins, ownership, upgrades, effective-stat computation, save/load
  achievements.js Persistent lifetime stats + 14 unlockable achievements
  render.js       Detailed vector + software-3D ship rendering
  mesh3d.js       Tiny self-contained software 3D renderer (flat-shaded low-poly)
  meshes.js       Parametric low-poly meshes + palettes for every ship/enemy/boss
  ads.js          Provider-agnostic ad adapter (rewarded revive + interstitial cadence)
  ui.js           DOM UI: menu, HUD, shop tabs, achievements, pause, game over, toasts
  config.js       All tunables + content data (ships/weapons/missiles/upgrades/skins/enemies)
  styles.css      Neon "space arcade" responsive theme
```

**Design choices**
- **Fixed-timestep physics** (`1/120s`) → deterministic, frame-rate independent.
- **Game-feel juice** → hit-stop freezes, screen flash, expanding shockwaves, floating score popups.
- **Object pooling** for bullets/enemies/particles → minimal garbage collection.
- **DPR-aware canvas** capped at 2× → sharp on retina, protects mobile fill-rate.
- **Procedural audio** (WebAudio) → zero audio files to ship; every weapon has its own firing voice.
- **Software 3D renderer** → real rotating low-poly ships, no textures or model files.
- **Pseudo-3D depth** via 3 parallax star layers + drifting nebula clouds.

## 🕹️ Content
- **7 ships** (Scout · Striker · Aegis · Phantom · Titan · Reaper · Nova)
- **8 weapons** including Gatling, Flak Cannon, Wave Beam, and a piercing **Railgun**
- **5 missiles/rockets** including a 3-round **Barrage** and a splash-damage **Nuke**
- **14 achievements**, timed power-ups, a Mega Bomb, combos, bosses and a coin-rush bonus round

## 🌐 Portfolio embed
This game ships inside the portfolio at `/game/`. When served from that path it
shows a **← Back to Portfolio** button (menu + pause) that returns the visitor to
the site's Game section. Detection is automatic (`location.pathname` contains
`/game/`), so the same build runs standalone or embedded with no changes.

## 💰 Monetization (wire up at launch)

Revenue for HTML5 games comes mainly from **arcade portals/SDKs**, not AdSense.
`src/ads.js` exposes ONE interface; drop any network behind it:

```js
// Implement: { ready(), rewarded(placement)->Promise<bool>, interstitial()->Promise }
new AdManager(new CrazyGamesProvider());
```

Supported patterns out of the box: **rewarded revive** (watch ad to continue)
and **interstitial** every 3 runs. Ships with a working demo stub so it's
playable today. Recommended networks: **CrazyGames**, **GameDistribution**,
**GameMonetize**, **Poki**.

## 🚢 Deploy (static)

Push the folder to **GitHub Pages / Netlify / Vercel / Cloudflare Pages** — no
build required. Serve over HTTPS. Add cache-busting (hashed filenames) when you
introduce a bundler.

## 🗺️ Roadmap

- [x] Enemy bosses & bullet-hell patterns (enemy projectiles)
- [x] Ranged enemies, piercing/splash weapons, more ships
- [x] Achievements / progression goals
- [ ] Real ad-network provider + consent/GDPR gate
- [ ] Daily rewards / missions to drive retention
- [ ] Server leaderboard (with input validation)
- [ ] PWA offline support (service worker)
