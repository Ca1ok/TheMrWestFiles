/* GameScoring — points → payout for the Games app. Pure (no DOM, no clock, no randomness): shared by the kernel, the Games app and the tests.
 *
 * Every scored minigame reports POINTS (higher is always better). The kernel turns points into a payout "base" with a near-exponential curve
 *      base(points) = A · e^(K · points / par)           (A = 0.5, K = 2.3)
 * so the old "top tier" (points = par) is still ≈ 5, twice the par points is ≈ 50, and a run in between pays proportionally between. The result is
 * capped at `maxBase` per play (config game.maxBase), then goes through the same per-day diminishing returns / daily soft cap / collection bonus / economy index
 * as before (os/kernel/state.js K.award).
 *
 *   par = points at which the game pays what its old top tier paid · min = points needed to earn anything · max = hard ceiling on points
 * To tune a game edit its row; to retune the whole curve edit CURVE. `luck` games (no skill) have no points and no leaderboard. */
(function(root){
  const CURVE = { A: 0.5, K: 2.3 };
  const TABLE = {
    titration:      { par: 800,  min: 300, max: 1000,  unit: 'pts', how: 'Stop closer to the endpoint' },
    balance:        { par: 800,  min: 1,   max: 1000,  unit: 'pts', how: 'Balance it faster' },
    reaction:       { par: 700,  min: 1,   max: 1000,  unit: 'pts', how: 'React faster' },
    projectile:     { par: 700,  min: 1,   max: 1000,  unit: 'pts', how: 'Land closer to the flag' },
    memoryMatch:    { par: 750,  min: 100, max: 1000,  unit: 'pts', how: 'Fewer flips' },
    whackAtom:      { par: 1000, min: 800, max: 4000,  unit: 'pts', how: '100 points per atom' },
    atomBuilder:    { par: 800,  min: 1,   max: 1000,  unit: 'pts', how: 'Bigger atoms, built faster' },
    fallingCatch:   { par: 900,  min: 750, max: 1000,  unit: 'pts', how: 'Catch all six' },
    mazePaint:      { par: 800,  min: 100, max: 1000,  unit: 'pts', how: 'Bigger grid, fewer slides' },
    sandfall:       { par: 900,  min: 500, max: 1000,  unit: 'pts', how: 'More sand in the beaker' },
    colourBlocks:   { par: 900,  min: 150, max: 1000,  unit: 'pts', how: 'Fewer tiles left over' },
    tubeSort:       { par: 800,  min: 100, max: 1000,  unit: 'pts', how: 'More tubes, fewer pours' },
    elementMerge:   { par: 1000, min: 100, max: 20000, unit: 'pts', how: 'Fuse heavier elements' },
    flappyElectron: { par: 1000, min: 250, max: 6000,  unit: 'pts', how: '50 points per gate' }
  };
  const DEFAULT_MAX_BASE = 120;

  const has = id => Object.prototype.hasOwnProperty.call(TABLE, id);
  const clampPoints = (id, raw) => { if(!has(id)) return 0; raw = Math.round(+raw); if(!isFinite(raw) || raw < 0) return 0; return Math.min(TABLE[id].max, raw); };
  /* payout base for a score (0 when the score doesn't reach the game's minimum) */
  function baseFor(id, points, maxBase){
    if(!has(id)) return 0; const t = TABLE[id], p = clampPoints(id, points); if(p < t.min || p <= 0) return 0;
    const cap = maxBase > 0 ? maxBase : DEFAULT_MAX_BASE, b = CURVE.A * Math.exp(CURVE.K * p / t.par);
    return Math.min(cap, Math.round(b * 100) / 100);
  }
  const list = () => Object.keys(TABLE);
  const api = { CURVE, TABLE, DEFAULT_MAX_BASE, has, clampPoints, baseFor, list, info: id => has(id) ? Object.assign({ id }, TABLE[id]) : null };
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.GameScoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
