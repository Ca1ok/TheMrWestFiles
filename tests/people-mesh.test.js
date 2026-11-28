// node tests/people-mesh.test.js — the eight procedural people (gfx.js actorMeshes): sane meshes (finite, human-sized, valid limb parts and colour slots, 16-bit indices), clearly different from each other.
const assert = require('assert'); globalThis.self = globalThis; require('../os/realworld/gfx.js');
const AM = globalThis.RealWorld.GFX.actorMeshes(), N = globalThis.RealWorld.GFX.PEOPLE_N; assert.strictEqual(N, 8);
const sig = [];
for(let v = 0; v < N; v++){ const M = AM['personV' + v]; assert(M, 'person variant ' + v + ' exists'); const n = M.p.length / 3;
  assert(n > 150 && n < 3000 && M.i.length % 3 === 0 && Math.max(...M.i) < n && n < 65536, 'variant ' + v + ' has a sane vertex / index count (' + n + ')');
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9, z0 = 9, z1 = -9; for(let i = 0; i < n; i++){ const x = M.p[i * 3], y = M.p[i * 3 + 1], z = M.p[i * 3 + 2]; assert(isFinite(x) && isFinite(y) && isFinite(z)); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    assert(M.m[i * 4] <= 4, 'limb part 0..4'); assert(M.m[i * 4 + 1] <= 6, 'colour slot 0..6'); }
  assert(y0 >= -0.001 && y0 < 0.01, 'stands on the ground'); assert(y1 > 1.7 && y1 < 1.9, 'a person-sized height (' + y1.toFixed(2) + ')'); assert(x1 - x0 > 0.55 && x1 - x0 < 0.85, 'shoulder-to-shoulder width (' + (x1 - x0).toFixed(2) + ')'); assert(z0 > -0.25 && z1 < 0.3, 'not deeper than a person');
  const used = new Set(), parts = new Set(); for(let i = 0; i < n; i++){ used.add(M.m[i * 4 + 1]); parts.add(M.m[i * 4]); } for(const k of [0, 1, 3, 4].concat(v === 2 ? [] : [2])) assert(used.has(k), 'variant ' + v + ' uses colour slot ' + k + ' (skin, shirt, [trousers], hair / brows, shoes)'); assert.deepStrictEqual([...parts].sort(), [0, 1, 2, 3, 4], 'legs and arms are separate moving parts');
  sig.push(n + ':' + [...used].sort().join('')); }
assert(new Set(sig).size >= 6, 'the eight people are different meshes: ' + sig.join(' '));
// the old plain person is still there as the fallback
assert(AM.person && AM.person.p.length > 0);
console.log('people-mesh.test.js: all passed (' + sig.join(', ') + ')');
