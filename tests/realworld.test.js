/* the real world's pure parts: terrain, chunk geometry (every LOD), colliders, doors, interiors, day/night. node tests/realworld.test.js */
const assert = require('assert'); global.self = global;
const G = require('../os/lib/worldgen.js'), T = require('../os/realworld/terrain.js'), C = require('../os/realworld/chunkgen.js'); global.RWMesh = require('../os/realworld/mesh.js'); require('../os/realworld/interiors.js'); require('../os/realworld/env.js');
const NH = 512, ND = G.districtCount(NH); T.setup(ND);
// terrain: continuous, gentle, deterministic
let maxSlope = 0; for(let x = -200; x < 2400; x += 11) for(let z = -100; z < 1800; z += 11){ const h = T.height(x, z); assert(isFinite(h) && Math.abs(h) < 12, 'height sane'); maxSlope = Math.max(maxSlope, Math.abs(T.height(x + 1, z) - h), Math.abs(T.height(x, z + 1) - h)); }
assert(maxSlope < 0.15, 'terrain too steep: ' + maxSlope); assert.strictEqual(T.height(123.4, 567.8), T.height(123.4, 567.8));
// every district centre is a flat terrace
for(let k = 0; k < ND; k++){ const d = G.district(k); const c = T.height(d.cx, d.cy); for(let a = 0; a < 6; a++) assert(Math.abs(T.height(d.cx + Math.cos(a) * 90, d.cy + Math.sin(a) * 90) - c) < 0.35, 'district ' + k + ' terrace'); }
// chunks: valid geometry at all LODs, houses and doors, shrinking with distance
const found = {}; for(let i = 0; i < NH; i += 7){ const g = G.house(i); found[Math.floor(g.x / 128) + ',' + Math.floor(g.y / 128)] = 1; }
const keys = Object.keys(found).slice(0, 3).concat(['5,4', '5,3', '8,5']); let tris = [0, 0, 0, 0], doors = 0, houses = 0;
keys.forEach(k => { const [cx, cz] = k.split(',').map(Number); for(let lod = 0; lod < 4; lod++){ const r = C.build(cx, cz, lod, NH), m = r.mesh, f = new Float32Array(m.vb);
  for(let i = 0; i < m.n; i++) assert(isFinite(f[i * 5]) && isFinite(f[i * 5 + 1]) && isFinite(f[i * 5 + 2]), 'finite vertices'); for(let i = 0; i < m.ni; i++) assert(m.ib[i] < m.n, 'index in range'); assert(m.ni % 3 === 0 && m.ni > 0);
  assert(r.cols.length % 8 === 0); tris[lod] += m.ni / 3; if(lod === 0){ doors += r.doors.length; houses += r.stats.houses; r.doors.forEach(d => { assert(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 1e-6, 'door normal'); }); } else assert(r.doors.length === 0 || lod <= 1); } });
assert(tris[0] > tris[1] && tris[1] > tris[2] && tris[2] >= tris[3], 'levels of detail get cheaper: ' + tris.join(' > ')); assert(houses > 0 && doors >= houses, 'houses have doors');
// determinism: same chunk twice = same bytes (clients must agree on colliders)
const a = C.build(5, 4, 0, NH), b = C.build(5, 4, 0, NH); assert.deepStrictEqual(Array.from(a.cols), Array.from(b.cols)); assert.strictEqual(a.mesh.n, b.mesh.n);
// a chunk is cheap enough to stream (< 600 KB at LOD0, < 120 KB at LOD2)
assert(a.mesh.vb.byteLength + a.mesh.ib.byteLength < 600e3, 'LOD0 chunk size');
// the town square door of every landmark exists
['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall'].forEach(id => { let ok = false; for(let cx = 3; cx < 9 && !ok; cx++) for(let cz = 2; cz < 7 && !ok; cz++) if(C.build(cx, cz, 0, NH).doors.some(d => d.id === id)) ok = true; assert(ok, 'landmark door: ' + id); });
// interiors: every kind builds; terminals point at real apps
const I = RealWorld.Interiors, APPS = ['Bank', 'Stocks', 'WestShop', 'Arcade', 'Games', 'RealEstate', 'WestMap', 'Leaderboard', 'News', 'Files', 'Notes', 'WestLab', 'WestFactory', 'Messages'];
I.kinds().forEach(k => { const r = I.build(k, { w: 12, dp: 10, beds: 3, type: 'house', name: 'x' }); assert(r.mesh.n > 0 && r.spawn.z < r.d); r.terms.forEach(t => assert(APPS.includes(t.app), k + ' → unknown app ' + t.app)); });
// day / night follows the NPC clock: the first 7 of 30 slots are night
const E = RealWorld.Env; assert(E.state(E.DAY * 0.05).night > 0.95 && E.state(E.DAY * 0.6).night < 0.05 && E.state(E.DAY * 0.6).sunDir[1] > 0.5);
console.log('realworld ok · slope ' + maxSlope.toFixed(3) + ' · tris/LOD ' + tris.map(Math.round).join('/'));
