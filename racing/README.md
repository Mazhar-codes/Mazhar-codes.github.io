# 🏎️ Nitro Rush — Arcade Racer

A fast, responsive **pseudo-3D arcade racer** built from scratch in vanilla
JavaScript — no engine, no libraries, no build step. Race across six themed
tracks, tune your car NFS-style with visible parts, and chase the checkered
flag against a full AI grid. Pure HTML5 Canvas + ES modules; runs on any
static host.

## ▶️ Run locally
```bash
node serve.mjs      # then open http://localhost:8080
# or:  npx serve .   /   python -m http.server 8080
```
> ES modules require an HTTP server — opening `index.html` via `file://` won't work.

## 🎮 Controls
| Action  | Keyboard              | Touch                     |
|---------|-----------------------|---------------------------|
| Throttle| `W` / `↑`             | auto (release brake)      |
| Brake   | `S` / `↓`             | BRAKE button              |
| Steer   | `A·D` / `←·→`         | ◀ ▶ buttons               |
| Nitro   | `Shift` / `Space`     | NITRO button              |
| Pause   | `P` / `Esc`           | ⏸ button                  |

## 🌍 Tracks & environments
Six locations, each with its own palette, roadside props **and handling feel**:

- 🏜️ **Dune Sprint** — long shimmering straights, top-speed heaven
- 🏖️ **Coast Run** — soft sand off the line punishes mistakes
- 🌴 **Isla Verde** — tight jungle switchbacks, a pure handling test
- ❄️ **Glacier Pass** — ice-slick tarmac; brake early, stay smooth
- ⛰️ **Summit Climb** — steep hairpins and blind crests
- 🌃 **Neon Mile** — midnight city, neon walls, full-chat threading

## 🚗 Cars & tuning
Six cars from the balanced **Cadet** to the apex **Apex GT**, each with distinct
top speed / acceleration / grip / braking. Tune them **NFS-style** with parts
that change how the car *looks* as well as drives:

| Upgrade | Effect | Visible change |
|---------|--------|----------------|
| Engine  | top speed | roof air scoop grows |
| Tires   | grip | wider rubber |
| Brakes  | braking | bigger glowing calipers |
| Spoiler | high-speed grip | GT rear wing |
| Exhaust | acceleration | twin tips + backfire |
| Carbon Hood | acceleration | carbon-weave roof |
| Driver Skill | steering response | helmet in the cabin |

## 🏁 Modes
- **Circuit** — 3 laps, first across the line wins.
- **Sprint** — one long point-to-point dash.
- **Free Play** — every car & upgrade unlocked; just drive.
- **Hardcore** — earn credits, buy cars, tune parts, beat your best times.
  (Separate save slot, so Hardcore always starts stock.)

## 🧩 Architecture
```
index.html      canvas + HUD + menus + touch controls
src/
  main.js       Orchestrator: race loop, road render, positions/laps/timing, HUD, minimap
  core.js       Engine: math, seeded RNG, per-mode Storage, Canvas(letterbox), Input, Audio
  config.js     Tunables + data (cars, environments, tracks, upgrades, modes)
  render3d.js   Pseudo-3D projection: road segments, fog, sky, roadside props
  track.js      Procedural course builder + minimap path (deterministic per seed)
  car.js        Car physics + rear-view render with visible upgrade parts
  ai.js         Opponent racers (racing line, curve braking, rubber-band)
  economy.js    Credits, car ownership, per-car upgrades, best times (Free/Hardcore slots)
  ui.js         DOM menus: mode, track/mode select, garage, pause, results
  styles.css    Neon "night garage" responsive theme
```

**Design choices**
- **Pseudo-3D projected road** (Out Run style) → real 3D depth & speed in Canvas 2D.
- **Fixed-timestep physics** (`1/60s`) → deterministic, frame-rate independent.
- **Deterministic track seeds** → every course is reproducible & fair.
- **Procedural everything** → cars, props, audio and tracks ship as code, zero assets.
- **Continuous engine audio** whose pitch tracks RPM, plus per-event SFX.

## 🌐 Portfolio embed (later)
When served from an `/game`-style path or inside an iframe, the menu & pause
screens show a **← Back to Portfolio** button and route Exit back to the host
site — so this drops into the portfolio below the space shooter with no changes.

## 📄 License
MIT.
