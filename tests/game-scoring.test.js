// node tests/game-scoring.test.js — the points → payout curve used by the Games app
const GS = require('../os/lib/game-scoring.js'); let fails = 0;
const ok = (c, m) => { if(!c){ fails++; console.error('FAIL', m); } };
// every table row is sane
GS.list().forEach(id => { const t = GS.TABLE[id]; ok(t.par > 0 && t.min >= 0 && t.max >= t.par, id + ': par/min/max ordering'); ok(GS.baseFor(id, t.max) > 0, id + ': max score pays'); });
// below the minimum pays nothing, unknown games pay nothing
ok(GS.baseFor('whackAtom', 700) === 0, 'whack below min'); ok(GS.baseFor('nope', 500) === 0, 'unknown game');
// par ≈ the old top tier (~5)
GS.list().forEach(id => { const b = GS.baseFor(id, GS.TABLE[id].par); ok(b > 4.5 && b < 5.5, id + ' par base ' + b); });
// strictly increasing, and near-exponential: equal point steps multiply the payout by a constant factor (until the cap)
const id = 'flappyElectron'; let prev = 0; for(let p = 250; p <= 6000; p += 250){ const b = GS.baseFor(id, p); ok(b >= prev, 'monotonic at ' + p); prev = b; }
const r1 = GS.baseFor(id, 1500) / GS.baseFor(id, 1000), r2 = GS.baseFor(id, 2000) / GS.baseFor(id, 1500); ok(Math.abs(r1 - r2) < 0.05 * r1, 'constant growth ratio ' + r1 + ' vs ' + r2);
ok(GS.baseFor(id, 2000) > 8 * GS.baseFor(id, 1000), 'doubling the par points pays far more than double');
// the per-play cap holds
ok(GS.baseFor(id, 6000, 120) === 120 && GS.baseFor(id, 6000, 40) === 40, 'cap');
// junk input is clamped
ok(GS.clampPoints(id, NaN) === 0 && GS.clampPoints(id, -5) === 0 && GS.clampPoints(id, 1e12) === GS.TABLE[id].max && GS.clampPoints('nope', 10) === 0, 'clampPoints');
if(fails){ console.error(fails + ' failed'); process.exit(1); } console.log('game-scoring: all passed');
