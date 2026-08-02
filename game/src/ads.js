// =====================================================================
// ads.js — Provider-agnostic ad adapter.
//
// HTML5 game revenue comes mainly from arcade portals / SDKs, NOT AdSense.
// This class gives the game ONE interface; you drop a real SDK behind it
// at launch. To integrate a network, implement a provider object with:
//   { ready(): bool, rewarded(placement): Promise<boolean>, interstitial(): Promise<void> }
// and pass it to `new AdManager(provider)`.
//
// Popular options (add their <script> in index.html, then wrap here):
//   • CrazyGames SDK   — window.CrazyGames.SDK.ad.requestAd('rewarded'|'midgame')
//   • GameDistribution — window.gdsdk.showAd('rewarded'|'interstitial')
//   • Google AdSense (Ad Placement API / H5 games) — adBreak({ type:'reward' })
// The default StubProvider simulates ads locally so the game is fully
// playable during development.
// =====================================================================

// A local, no-network provider that simulates a short ad.
class StubProvider {
  ready() { return true; }
  _simulate(label, ms) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-sim';
      el.innerHTML = `<div class="ad-sim-box">
        <div class="ad-sim-tag">AD</div>
        <div class="ad-sim-title">${label}</div>
        <div class="ad-sim-bar"><i></i></div>
        <div class="ad-sim-note">Demo ad — replace AdManager provider at launch</div>
      </div>`;
      document.body.appendChild(el);
      const bar = el.querySelector('.ad-sim-bar i');
      requestAnimationFrame(() => { bar.style.transition = `width ${ms}ms linear`; bar.style.width = '100%'; });
      setTimeout(() => { el.remove(); resolve(); }, ms);
    });
  }
  async rewarded() { await this._simulate('Rewarded Video', 2200); return true; }
  async interstitial() { await this._simulate('Interstitial', 1600); }
}

export class AdManager {
  constructor(provider) {
    this.provider = provider || new StubProvider();
    this.runsSinceAd = 0;
    this.interstitialEvery = 3; // show interstitial every N runs
  }
  isReady() { try { return this.provider.ready(); } catch { return false; } }

  // Returns true if the reward should be granted (ad watched to completion).
  async showRewarded(placement = 'reward') {
    try {
      const ok = await this.provider.rewarded(placement);
      return ok !== false;
    } catch (e) { console.warn('Rewarded ad failed', e); return false; }
  }

  // Call at end of a run; shows an interstitial on a cadence.
  async maybeInterstitial() {
    this.runsSinceAd++;
    if (this.runsSinceAd < this.interstitialEvery) return;
    this.runsSinceAd = 0;
    try { await this.provider.interstitial(); } catch (e) { console.warn('Interstitial failed', e); }
  }
}
