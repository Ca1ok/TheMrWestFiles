/* node tests/fx.test.js — the crash effects (os/realworld/fx.js): explosions, impact sparks, smoke emitters, budget, determinism. Pure, no browser. */
const assert = require('assert'), FX = require('../os/realworld/fx.js');
const flat = () => 0, A = new Float32Array(FX.MAX * 8), D = new Float32Array(FX.MAX * 8);
const run = (fx, sec, cam) => { for(let i = 0; i < sec * 60; i++) fx.step(1 / 60, flat, cam); };

{ // explosion: lots of particles, both blend kinds, flash + shake, everything dies away
  const fx = FX.create({ seed: 1 }); fx.explode(0, 5, 0, { power: 1, vx: 30, vz: 0 });
  assert(fx.count() > 150 && fx.count() <= FX.MAX, 'explosion size ' + fx.count()); assert(fx.flash === 1 && fx.shake === 1);
  const r = fx.fill(A, D); assert(r.na > 40 && r.nd > 60, 'alpha ' + r.na + ' additive ' + r.nd);
  for(let i = 0; i < r.na * 8; i++) assert(isFinite(A[i]), 'NaN in alpha buffer'); for(let i = 0; i < r.nd * 8; i++) assert(isFinite(D[i]), 'NaN in add buffer');
  for(let i = 0; i < r.na; i++){ const a = A[i * 8 + 7]; assert(a >= 0 && a <= 1.0001, 'alpha out of range ' + a); }
  run(fx, 1); assert(fx.flash === 0, 'flash decays'); const mid = fx.fill(A, D); assert(mid.na + mid.nd > 0);
  run(fx, 20); assert.strictEqual(fx.count(), 0, 'all particles expire (' + fx.count() + ' left)');
}
{ // debris and sparks never sink below the ground, they bounce
  const g = (x, z) => 2, fx = FX.create({ seed: 7 }); fx.explode(0, 3, 0, { power: 1.5 });
  for(let i = 0; i < 240; i++){ fx.step(1 / 60, g); const r = fx.fill(A, D); for(let k = 0; k < r.nd; k++) assert(D[k * 8 + 1] >= 1.9, 'spark under ground'); }
}
{ // a bigger power makes a bigger blast; a ditching in the sea sprays and makes less fire
  const a = FX.create({ seed: 3 }), b = FX.create({ seed: 3 }), w = FX.create({ seed: 3 }); a.explode(0, 0, 0, { power: 0.5 }); b.explode(0, 0, 0, { power: 2 }); w.explode(0, 0, 0, { power: 1, water: true });
  assert(b.count() > a.count(), 'power scales'); assert(w.flash < 1, 'water: weaker flash'); assert(w.count() > 50);
}
{ // impact: sparks fly away from the wall (along the normal), small and cheap
  const fx = FX.create({ seed: 5 }); fx.impact(0, 1, 0, 1, 0, 1); assert(fx.count() > 20 && fx.count() < 80);
  fx.step(0.1, flat); const r = fx.fill(A, D); let away = 0; for(let i = 0; i < r.nd; i++) if(D[i * 8] > 0.05) away++; assert(away > r.nd * 0.7, 'sparks leave along +x (' + away + '/' + r.nd + ')');
}
{ // smoke emitter: k decides how much and how dark; it follows get(); ttl removes it; far from the camera it costs nothing
  const lo = FX.create({ seed: 9 }), hi = FX.create({ seed: 9 }); lo.setEmitter('c', { kind: 'smoke', k: 0.25, x: 0, y: 1, z: 0 }); hi.setEmitter('c', { kind: 'smoke', k: 1, x: 0, y: 1, z: 0 }); run(lo, 4); run(hi, 4);
  assert(hi.count() > lo.count() * 1.3, 'more damage, more smoke ' + lo.count() + ' vs ' + hi.count());
  const dark = fx => { const r = fx.fill(A, D); let s = 0; for(let i = 0; i < r.na; i++) s += A[i * 8 + 4]; return s / r.na; }; assert(dark(hi) < dark(lo), 'more damage, darker smoke');
  let car = { x: 0, y: 1, z: 0 }; const m = FX.create({ seed: 2 }); m.setEmitter('c', { kind: 'smoke', k: 0.6, get: () => car, x: 0, y: 1, z: 0 }); run(m, 1); car = { x: 100, y: 1, z: 0 }; for(let i = 0; i < 6; i++) m.step(1 / 60, flat);
  const r = m.fill(A, D); let maxx = -1e9; for(let i = 0; i < r.na; i++) maxx = Math.max(maxx, A[i * 8]); assert(maxx > 90, 'the emitter follows the car'); 
  const t = FX.create({ seed: 4 }); t.setEmitter('w', { kind: 'wreck', x: 0, y: 0, z: 0, ttl: 3 }); run(t, 1); assert(t.has('w')); run(t, 3); assert(!t.has('w'), 'ttl removes the emitter');
  const far = FX.create({ seed: 4 }); far.setEmitter('f', { kind: 'smoke', k: 1, x: 0, y: 0, z: 0 }); run(far, 3, [1000, 0, 0]); assert.strictEqual(far.count(), 0, 'no particles for an emitter far from the camera');
  far.removeEmitter('f'); assert(!far.has('f'));
}
{ // budget: a burning wreck + several explosions never exceed MAX and never blow up the arrays
  const fx = FX.create({ seed: 11 }); fx.setEmitter('w', { kind: 'wreck', x: 0, y: 0, z: 0, ttl: 50 }); for(let i = 0; i < 6; i++){ fx.explode(i, 3, 0, { power: 2.5 }); run(fx, 0.2); } assert(fx.count() <= FX.MAX);
  run(fx, 30); assert(fx.count() <= FX.MAX && fx.count() > 20, 'a wreck keeps burning: ' + fx.count()); const r = fx.fill(A, D); assert(r.na + r.nd === fx.count());
}
{ // deterministic with a seed
  const a = FX.create({ seed: 42 }), b = FX.create({ seed: 42 }); a.explode(1, 2, 3, {}); b.explode(1, 2, 3, {}); run(a, 1); run(b, 1); a.fill(A, D); b.fill(new Float32Array(FX.MAX * 8), new Float32Array(FX.MAX * 8)); assert.strictEqual(a.count(), b.count());
}
console.log('fx.test.js: all passed');
