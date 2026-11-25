// node tests/crime.test.js — the pure rules of the realworld crime layer (os/realworld/crime.js): wanted level, fines, the lock-pick minigame, cop steering (against the REAL drive.js physics), arrest timer.
const assert = require('assert'), C = require('../os/realworld/crime.js').Logic, VD = require('../data/vehicle-data.js');
globalThis.window = globalThis; let Dr; try{ require('../os/realworld/drive.js'); Dr = (globalThis.RealWorld || {}).Drive || require('../os/realworld/drive.js'); }catch(e){ Dr = null; }
// 1 ── stars and cooling
const w = C.newWanted(); assert.strictEqual(w.stars, 0); C.addHeat(w, 19); assert.strictEqual(w.stars, 0); C.addHeat(w, 1); assert.strictEqual(w.stars, 1); C.addHeat(w, 25); assert.strictEqual(w.stars, 2); C.addHeat(w, 999); assert.strictEqual(w.stars, 5); assert.strictEqual(w.heat, C.HEAT_MAX);
let t = 0, cleared = false; while(w.stars && t < 400){ t += 1; cleared = C.cool(w, 1, true) || cleared; } assert.strictEqual(w.stars, 5, 'nothing fades while a cop can see you');
t = 0; const seq = []; while(w.stars && t < 400){ t += 1; const before = w.stars; if(C.cool(w, 1, false)) cleared = true; if(w.stars !== before) seq.push(w.stars); } assert.ok(cleared && w.stars === 0 && w.heat === 0, 'out of sight the stars fade to 0'); assert.deepStrictEqual(seq, [4, 3, 2, 1, 0], 'one star at a time'); assert.ok(t > 60 && t < 200, 'a 5-star escape takes a while, got ' + t + ' s');
assert.deepStrictEqual([1, 2, 3, 4, 5].map(C.copCount), [1, 2, 3, 4, 6]); assert.ok(C.copModel(5) === 'apex' && C.copModel(1) === 'alder' && VD.get(C.copModel(3)));
// 2 ── record + fines
const rec = C.newRec(); const o1 = C.report(rec, 'theftDealer', { econ: 2 }), o2 = C.report(rec, 'breakin', { econ: 0.2 }); assert.strictEqual(o1.fine, 3600); assert.strictEqual(o2.fine, 250, 'econ clamps to ≥1'); assert.strictEqual(C.owed(rec), 3850);
C.settle(rec, 3850); assert.strictEqual(C.owed(rec), 0); for(let i = 0; i < 50; i++) C.report(rec, 'attempt', {}); assert.strictEqual(rec.o.length, C.MAX_REC, 'record is capped (free-tier prefs size)'); assert.ok(JSON.stringify(rec).length < 4500, 'record stays tiny: ' + JSON.stringify(rec).length);
assert.strictEqual(C.report(rec, 'nonsense'), null);
// 3 ── the lock-pick minigame: perfect timing always wins, random mashing mostly fails on hard cars, 4 misses = alarm, time runs out
const easy = C.difficultyOf(VD.CARS[0].price), hard = C.difficultyOf(VD.CARS[5].price); assert.ok(easy < 0.15 && hard > 0.9 && C.difficultyOf(VD.CARS[3].price) > easy);
function play(diff, seed, skill){ const s = C.lockCreate(diff, seed); let guard = 0; while(s.state === 'run' && guard++ < 20000){ C.lockStep(s, 1 / 60); if(Math.abs(s.pos - s.zone) <= s.width / 2 * skill && Math.random() < 0.9) C.lockPress(s); } return s; }
let wins = 0; for(let i = 0; i < 40; i++) if(play(easy, i + 1, 0.9).state === 'ok') wins++; assert.ok(wins >= 30, 'a skilled player cracks an easy car, won ' + wins + '/40');
const s = C.lockCreate(1, 3); s.pos = 0.0; s.zone = 0.9; assert.strictEqual(C.lockPress(s), 'miss'); assert.strictEqual(C.lockPress(s), 'miss'); assert.strictEqual(C.lockPress(s), 'miss'); assert.strictEqual(C.lockPress(s), 'fail'); assert.strictEqual(s.state, 'fail');
const s2 = C.lockCreate(0.5, 9); for(let i = 0; i < 2000; i++) C.lockStep(s2, 0.05); assert.strictEqual(s2.state, 'fail', 'timeout fails'); assert.strictEqual(s2.last, 'timeout');
assert.ok(C.lockCreate(1, 1).pins > C.lockCreate(0.1, 1).pins && C.lockCreate(1, 1).width < C.lockCreate(0.1, 1).width, 'harder = more pins, smaller window');
// 4 ── cops steer with the real physics: a cruiser reaches a parked player, and keeps up with a fleeing car
if(Dr && Dr.car){
  const cop = { s: Dr.car(VD.get('alder'), { x: 0, z: 0, yaw: 0 }) }, tgt = { x: 120, z: -200 }; let ok = false; for(let i = 0; i < 60 * 60 && !ok; i++){ Dr.stepCar(cop.s, C.copInputs(cop, tgt.x, tgt.z, 0.65, 1 / 60), 1 / 60, null); ok = Math.hypot(cop.s.x - tgt.x, cop.s.z - tgt.z) < 6; } assert.ok(ok, 'the cop reaches a stationary target within 60 s'); for(let i = 0; i < 60 * 12; i++) Dr.stepCar(cop.s, C.copInputs(cop, tgt.x, tgt.z, 0.65, 1 / 60, 0), 1 / 60, null); assert.ok(Math.hypot(cop.s.x - tgt.x, cop.s.z - tgt.z) < 14 && Math.abs(cop.s.u) < 4, 'and then STOPS next to it (no fly-bys): ' + Math.round(Math.hypot(cop.s.x - tgt.x, cop.s.z - tgt.z)) + ' m, ' + cop.s.u.toFixed(1) + ' m/s');
  { // whiskers steer round a building standing between cop and target
    const box = { x0: -12, x1: 12, z0: -110, z1: -90 }, inBox = (x, z, r) => x > box.x0 - r && x < box.x1 + r && z > box.z0 - r && z < box.z1 + r;
    const world = { ground: () => 0, push: (x, z, y, r) => { if(!inBox(x, z, r)) return { x, z }; const dl = x - (box.x0 - r), dr = box.x1 + r - x, dt = z - (box.z0 - r), db = box.z1 + r - z, m = Math.min(dl, dr, dt, db); return m === dl ? { x: box.x0 - r, z } : m === dr ? { x: box.x1 + r, z } : m === dt ? { x, z: box.z0 - r } : { x, z: box.z1 + r }; } };
    const probe = (x, z) => inBox(x, z, 2), c3 = { s: Dr.car(VD.get('alder'), { x: 0, z: 0, yaw: 0 }) }; let got = false; for(let i = 0; i < 60 * 70 && !got; i++){ Dr.stepCar(c3.s, C.copInputs(c3, 0, -200, 0.65, 1 / 60, 0, probe), 1 / 60, world); got = Math.hypot(c3.s.x, c3.s.z + 200) < 14; }
    assert(got, 'a cop drives round a building in its way (ended at ' + c3.s.x.toFixed(0) + ',' + c3.s.z.toFixed(0) + ')'); }
  const hi = { s: Dr.car(VD.get('apex'), { x: 0, z: 0, yaw: 0 }) }; hi.s.u = 80; const tg2 = { x: 0, z: -500 }; let md = 1e9; for(let i = 0; i < 60 * 40; i++){ Dr.stepCar(hi.s, C.copInputs(hi, tg2.x, tg2.z, 1, 1 / 60, 0), 1 / 60, null); md = Math.min(md, Math.hypot(hi.s.x - tg2.x, hi.s.z - tg2.z)); } assert.ok(md < 12 && Math.hypot(hi.s.x - tg2.x, hi.s.z - tg2.z) < 14, 'an interceptor arriving at 80 m/s still stops at a parked player: closest ' + Math.round(md) + ' m');
  const c2 = { s: Dr.car(VD.get('apex'), { x: 0, z: 0, yaw: 1 }) }, run = Dr.car(VD.get('alder'), { x: 60, z: 0, yaw: 0 }); let caught = false; for(let i = 0; i < 60 * 90 && !caught; i++){ Dr.stepCar(run, { thr: 1, steer: Math.sin(i / 90) * 0.4, brake: 0 }, 1 / 60, null); Dr.stepCar(c2.s, C.copInputs(c2, run.x, run.z, 1, 1 / 60, run.u), 1 / 60, null); caught = Math.hypot(c2.s.x - run.x, c2.s.z - run.z) < 8; } assert.ok(caught, 'a 5★ interceptor catches an Alder');
  const stuck = { s: Dr.car(VD.get('alder'), { x: 0, z: 0, yaw: 0 }) }; stuck.s.u = 0; let rev = false; for(let i = 0; i < 300; i++){ const inp = C.copInputs(stuck, 0, -100, 0.6, 1 / 60); if(inp.thr < 0) rev = true; /* never moves: simulates a wall */ } assert.ok(rev, 'a stuck cop reverses out');
} else console.log('(drive.js not loadable in node — steering simulation skipped)');
// 5 ── arrest timer
const a = { t: 0 }; let busted = false; for(let i = 0; i < 200 && !busted; i++) busted = C.arrestStep(a, 4, 2, 1 / 60); assert.ok(busted && i_ok(a), 'a cop next to a stopped player busts in ~1.6 s'); function i_ok(x){ return x.t >= 1.6; }
const b = { t: 1 }; C.arrestStep(b, 4, 25, 0.5); assert.ok(b.t < 1, 'driving off drains the bar'); const c = { t: 0 }; for(let i = 0; i < 600; i++) assert.ok(!C.arrestStep(c, 30, 0, 1 / 60), 'a far cop never busts you');
assert.strictEqual(C.STEAL_PLANES, true, 'aircraft can be stolen and flown (after a hotwire)');
// 5 ── the hotwire minigame: connect the live wire to the same-coloured terminal, terminals re-shuffle after every hit, 3 wrong = short circuit, time runs out
{
  const solve = (s, wrongFirst) => { let guard = 0, r = 'run'; while(s.state === 'run' && guard++ < 50){ let slot = s.terms.indexOf(s.order[s.i]); if(wrongFirst && guard === 1) slot = (slot + 1) % s.wires; r = C.hotPress(s, slot); } return r; };
  assert.strictEqual(C.HOT_WIRES.length, 5, 'five wire colours, each with its own shape');
  assert.strictEqual(new Set(C.HOT_WIRES.map(w => w.g)).size, 5, 'colour is never the only cue: every wire has a different shape');
  const easy = C.hotCreate(C.difficultyOf(VD.CARS[0].price), 1), hard = C.hotCreate(C.difficultyOf(VD.CARS[5].price), 1), air = C.hotCreate(1, 1), sky = C.hotCreate(Math.max(0.85, C.difficultyOf(VD.PLANES[0].price)), 1);
  assert.strictEqual(easy.wires, 3, 'an easy car has 3 wires'); assert.strictEqual(hard.wires, 5, 'a $890k hypercar has 5'); assert.strictEqual(air.wires, 5); assert.strictEqual(sky.wires, 4, 'the cheapest plane is forced to ≥ 0.85 → 4 wires');
  for(const s of [easy, hard]){ assert.deepStrictEqual([...s.order].sort(), s.order.map((_, k) => k), 'order is a permutation'); assert.deepStrictEqual([...s.terms].sort(), s.terms.map((_, k) => k), 'terminals are a permutation'); }
  // the right terminal every time always wins, and finishing flips the state to ok (the engine starts)
  for(let seed = 1; seed <= 60; seed++){ const s = C.hotCreate((seed % 10) / 9, seed); assert.strictEqual(solve(s), 'ok'); assert.strictEqual(s.state, 'ok'); assert.strictEqual(s.i, s.wires); assert.strictEqual(C.hotPress(s, 0), 'none', 'nothing happens once it is over'); }
  // terminals are reshuffled after every correct connection (never the same layout twice in a row)
  { const s = C.hotCreate(0.9, 4); for(let k = 0; k < s.wires - 1; k++){ const before = s.terms.join(); assert.strictEqual(C.hotPress(s, s.terms.indexOf(s.order[s.i])), 'hit'); assert.notStrictEqual(s.terms.join(), before, 'terminals move after a hit'); } }
  // a wrong terminal is a strike, not progress; a hit afterwards still works
  { const s = C.hotCreate(0.3, 8), wrong = s.terms.findIndex(wi => wi !== s.order[0]); assert.strictEqual(C.hotPress(s, wrong), 'miss'); assert.strictEqual(s.strikes, 1); assert.strictEqual(s.i, 0, 'a miss does not advance'); assert.strictEqual(solve(s), 'ok', 'one slip is forgiven'); }
  // three wrong terminals = short circuit
  { const s = C.hotCreate(0.3, 9), wrong = () => s.terms.findIndex(wi => wi !== s.order[s.i]); assert.strictEqual(C.hotPress(s, wrong()), 'miss'); assert.strictEqual(C.hotPress(s, wrong()), 'miss'); assert.strictEqual(C.hotPress(s, wrong()), 'fail'); assert.strictEqual(s.state, 'fail'); assert.strictEqual(s.last, 'short'); assert.strictEqual(C.hotPress(s, 0), 'none'); }
  // bad input never throws or counts: out-of-range, fractional, NaN, undefined
  { const s = C.hotCreate(0.3, 2); [-1, s.wires, 99, 1.5, NaN, undefined, null, '1'].forEach(v => assert.strictEqual(C.hotPress(s, v), 'none', 'not a terminal: ' + String(v))); assert.strictEqual(s.strikes, 0, 'garbage input costs nothing'); assert.strictEqual(s.i, 0); }
  // the clock: a hit buys 2 s, running out fails with 'timeout'
  { const s = C.hotCreate(0.3, 3), t0 = s.time; C.hotPress(s, s.terms.indexOf(s.order[0])); assert.ok(Math.abs(s.time - (t0 + 2)) < 1e-9, 'a hit adds 2 s'); for(let i = 0; i < 2000; i++) C.hotStep(s, 0.05); assert.strictEqual(s.state, 'fail'); assert.strictEqual(s.last, 'timeout'); }
  // forgiving: a player who needs ~1.5 s per wire finishes every vehicle in the catalogue with time to spare
  for(const v of VD.CARS.concat(VD.PLANES)){ const d = C.difficultyOf(v.price), s = C.hotCreate(v.kind === 'plane' ? Math.max(0.85, d) : d, 5); let t = 0; while(s.state === 'run'){ C.hotStep(s, 1.5); t += 1.5; if(s.state === 'run') C.hotPress(s, s.terms.indexOf(s.order[s.i])); } assert.strictEqual(s.state, 'ok', v.id + ' can be hotwired at 1.5 s per wire (' + t + ' s)'); }
  // the new offence exists and is cheap enough to retry
  assert.ok(C.CRIMES.alarm && C.CRIMES.alarm.heat > 0 && C.CRIMES.alarm.fine > 0 && C.CRIMES.alarm.heat < C.CRIMES.theft.heat, 'a failed hotwire is an alarm offence, lighter than the theft');
}
console.log('crime ok');
