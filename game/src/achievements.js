// =====================================================================
// achievements.js — Persistent meta-goals that reward long-term play.
// Lifetime stats live in the Economy save; unlocking one fires a toast.
// Purely additive: the rest of the game runs fine if this is ignored.
// =====================================================================

// Each achievement tests the running lifetime-stats object `s`.
export const ACHIEVEMENTS = [
  { id: 'first_blood',  icon: '💥', name: 'First Blood',   desc: 'Destroy your first enemy',   test: (s) => s.kills >= 1 },
  { id: 'centurion',    icon: '⚔️', name: 'Centurion',     desc: 'Destroy 100 enemies',        test: (s) => s.kills >= 100 },
  { id: 'exterminator', icon: '☠️', name: 'Exterminator',  desc: 'Destroy 1,000 enemies',      test: (s) => s.kills >= 1000 },
  { id: 'wave5',        icon: '🌊', name: 'Getting Warm',  desc: 'Reach wave 5',               test: (s) => s.bestWave >= 5 },
  { id: 'wave10',       icon: '🔥', name: 'Veteran',       desc: 'Reach wave 10',              test: (s) => s.bestWave >= 10 },
  { id: 'wave20',       icon: '👑', name: 'Ace Pilot',     desc: 'Reach wave 20',              test: (s) => s.bestWave >= 20 },
  { id: 'boss1',        icon: '🛸', name: 'Giant Slayer',  desc: 'Defeat a boss',              test: (s) => s.bosses >= 1 },
  { id: 'boss5',        icon: '🏆', name: 'Boss Hunter',   desc: 'Defeat 5 bosses',            test: (s) => s.bosses >= 5 },
  { id: 'combo6',       icon: '✴️', name: 'Unstoppable',   desc: 'Reach a x6 combo',           test: (s) => s.bestCombo >= 6 },
  { id: 'bomber',       icon: '💣', name: 'Shockwave',     desc: 'Use 10 Mega Bombs',          test: (s) => s.bombs >= 10 },
  { id: 'rich',         icon: '💰', name: 'Tycoon',        desc: 'Earn 5,000 total coins',     test: (s) => s.coinsEarned >= 5000 },
  { id: 'score10k',     icon: '⭐', name: 'High Roller',    desc: 'Score 10,000 in one run',    test: (s) => s.bestScore >= 10000 },
  { id: 'runs25',       icon: '🎮', name: 'Dedicated',     desc: 'Play 25 runs',               test: (s) => s.runs >= 25 },
  { id: 'collector',    icon: '🛒', name: 'Full Hangar',   desc: 'Own every ship & weapon',    test: (s) => s.fullHangar },
];

const DEFAULT_STATS = { kills: 0, bestWave: 1, bosses: 0, bestCombo: 1, bombs: 0, coinsEarned: 0, bestScore: 0, runs: 0, fullHangar: false };

export class Achievements {
  constructor(economy, onUnlock) {
    this.eco = economy;
    this.onUnlock = onUnlock;
    // Ensure the save has the containers (older saves won't).
    const st = this.eco.state;
    st.stats = Object.assign({}, DEFAULT_STATS, st.stats || {});
    if (!Array.isArray(st.unlocked)) st.unlocked = [];
  }
  get stats() { return this.eco.state.stats; }
  get unlocked() { return this.eco.state.unlocked; }
  isUnlocked(id) { return this.unlocked.includes(id); }
  count() { return this.unlocked.length; }
  total() { return ACHIEVEMENTS.length; }

  add(key, n = 1) { this.stats[key] = (this.stats[key] || 0) + n; }
  max(key, v) { if (v > (this.stats[key] || 0)) this.stats[key] = v; }
  set(key, v) { this.stats[key] = v; }

  // Evaluate all conditions; unlock + announce any newly satisfied ones.
  check() {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (!this.isUnlocked(a.id) && a.test(this.stats)) {
        this.unlocked.push(a.id); changed = true;
        if (this.onUnlock) this.onUnlock(a);
      }
    }
    if (changed) this.eco.save();
  }
}
