/* the real world's pure parts: street layout (no clipping, trees off the roads), terrain, chunk geometry at every LOD, colliders, doors, interiors, NPC routes, day/night.  node tests/realworld.test.js */
const assert = require('assert'); global.self = global;
const G = require('../os/lib/worldgen.js'), BG = require('../os/lib/buildgen.js'), T = require('../os/realworld/terrain.js'), L = require('../os/realworld/layout.js'), C = require('../os/realworld/chunkgen.js'); global.RWMesh = require('../os/realworld/mesh.js'); global.RealWorld = {}; require('../os/realworld/interiors.js'); require('../os/realworld/env.js'); require('../os/realworld/npcs.js');
const NH = 512; L.setup(NH); T.setup(L.radius());
/* ---- layout: every house exists, in a stable place; nothing touches a street or another building; trees stay off the roads ---- */
for(const nh of [NH, 3000]){
  L.setup(nh); const R = L.radius(), lines = [], segs = L.streetsNear(-R - 100, -R - 100, R + 100, R + 100);
  segs.forEach(sg => { const n = Math.ceil(Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) / 4), pts = []; for(let q = 0; q <= n; q++) pts.push(L.warp(sg.a[0] + (sg.b[0] - sg.a[0]) * q / n, sg.a[1] + (sg.b[1] - sg.a[1]) * q / n)); lines.push({ pts, hw: sg.hw }); });
  const dseg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
  const clear = p => { let m = 1e9; for(const ln of lines) for(let q = 0; q < ln.pts.length - 1; q++){ const a = ln.pts[q]; if(Math.abs(a[0] - p[0]) > 60 || Math.abs(a[1] - p[1]) > 60) continue; m = Math.min(m, dseg(p, a, ln.pts[q + 1]) - ln.hw); } return m; };
  const obbs = [], trees = [], add = (x, z, w, d, ang, tag) => { const c = Math.cos(ang), s = Math.sin(ang); obbs.push({ x, z, c, s, w, d, tag, k: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + c * w / 2 * a - s * d / 2 * b, z + s * w / 2 * a + c * d / 2 * b]) }); };
  for(let i = -14; i <= 14; i++) for(let j = -14; j <= 14; j++){ const c = L.content(i, j); if(!c) continue; c.houses.forEach(h => { if(h.idx < nh) add(h.g.x, h.g.y, h.g.w, h.g.dp, h.g.ang, 'h' + h.idx); }); c.pois.forEach(p => { const S = BG.landmark(p.id); add(p.x, p.z, S.w, S.d, p.ang, p.id); }); c.fillers.forEach((f, q) => add(f.x, f.z, f.w, f.d, f.ang, 'f' + q)); c.plots.forEach(p => add(p.x, p.z, p.w, p.d, p.ang, 'plot')); c.trees.forEach(t => { if(!(t[4] >= nh)) trees.push(t); }); }
  let worst = 1e9; obbs.forEach(o => o.k.forEach(p => { worst = Math.min(worst, clear(p)); })); assert(worst >= 2, nh + ': a building corner is only ' + worst.toFixed(2) + ' m from a road edge (the pavement is 3 m)');
  let tw = 1e9; trees.forEach(t => { tw = Math.min(tw, clear([t[0], t[1]])); }); assert(tw >= 2, nh + ': a tree is ' + tw.toFixed(2) + ' m from a road edge');
  const proj = (pts, ax) => { let a = 1e9, b = -1e9; pts.forEach(p => { const d = p[0] * ax[0] + p[1] * ax[1]; a = Math.min(a, d); b = Math.max(b, d); }); return [a, b]; };
  for(let a = 0; a < obbs.length; a++) for(let b = a + 1; b < obbs.length; b++){ const A = obbs[a], B = obbs[b]; if(Math.abs(A.x - B.x) > 60 || Math.abs(A.z - B.z) > 60) continue; let sep = false; for(const o of [A, B]){ for(const ax of [[o.c, o.s], [-o.s, o.c]]){ const p = proj(A.k, ax), q = proj(B.k, ax); if(p[1] < q[0] - 0.5 || q[1] < p[0] - 0.5){ sep = true; break; } } if(sep) break; } assert(sep, nh + ': buildings overlap ' + A.tag + ' ~ ' + B.tag); }
  trees.forEach(t => { for(const o of obbs){ if(Math.abs(o.x - t[0]) > 30 || Math.abs(o.z - t[1]) > 30) continue; const dx = t[0] - o.x, dz = t[1] - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; if(nh <= 3000) assert(!(Math.abs(lx) < o.w / 2 + 0.8 && Math.abs(lz) < o.d / 2 + 0.8), nh + ': tree inside ' + o.tag); } });
}
L.setup(NH); const h5 = L.house(5), h5b = (L.setup(5000), L.house(5)); assert.deepStrictEqual([h5.g.x, h5.g.y], [h5b.g.x, h5b.g.y], 'a house never moves when the city grows'); L.setup(NH); T.setup(L.radius());
['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'uni', 'lab', 'ind', 'plant', 'park', 'dealer', 'airport'].forEach(id => assert(L.poi(id), 'landmark ' + id));
for(let i = 0; i < NH; i++) assert(L.house(i), 'house ' + i);
// terrain: gentle and deterministic
let maxSlope = 0, hMin = 1e9, hMax = -1e9, cityH = 0, cityS = 0; const CRr = L.radius();
for(let x = -4000; x <= 4000; x += 13) for(let z = -4000; z <= 4000; z += 13){ const h = T.height(x, z); assert(isFinite(h) && h > -40 && h < 320, 'terrain height out of range ' + h); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); const s = T.slope(x, z); maxSlope = Math.max(maxSlope, s);
  if(Math.hypot(x, z) < CRr + 60){ cityH = Math.max(cityH, Math.abs(h)); cityS = Math.max(cityS, s); } }
assert(cityH < 1 && cityS < 0.05, 'the city plateau stays flat: |h| ' + cityH.toFixed(2) + ' slope ' + cityS.toFixed(3)); assert(hMax > 120 && hMin < -5, 'the country has real relief: ' + hMin.toFixed(0) + ' … ' + hMax.toFixed(0) + ' m');
{ const R = T.rwy(); for(let x = R.x0 - 150; x < R.x1 + 250; x += 7) for(let z = -150; z <= 150; z += 7) assert(Math.abs(T.height(x, z)) < 5.2, 'open ground around the runway'); for(let x = R.x0; x <= R.x1; x += 5) for(let z = -R.hw; z <= R.hw; z += 5) assert(Math.abs(T.height(x, z)) < 1e-6, 'the runway is flat'); }
assert(T.height(1234.5, -987.6) === T.height(1234.5, -987.6), 'terrain is a pure function');
// chunks: valid at all LODs, shrinking, with doors and colliders
const keys = [[0, 0], [-1, 0], [1, 1], [0, 2], [-4, 0], [3, 2]]; let tris = [0, 0, 0, 0], doors = 0, houses = 0;
keys.forEach(([cx, cz]) => { for(let lod = 0; lod < 4; lod++){ const r = C.build(cx, cz, lod, NH), m = r.mesh, f = new Float32Array(m.vb); for(let i = 0; i < m.n; i++) assert(isFinite(f[i * 5] + f[i * 5 + 1] + f[i * 5 + 2])); for(let i = 0; i < m.ni; i++) assert(m.ib[i] < m.n); assert(r.cols.length % 8 === 0); tris[lod] += m.ni / 3; if(lod === 0){ doors += r.doors.length; houses += r.stats.houses; r.doors.forEach(d => assert(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 1e-6)); } } });
assert(tris[0] > tris[1] && tris[1] > tris[2] && tris[2] >= tris[3] * 0.9, 'LOD triangle counts ' + tris.join('>')); assert(houses > 0 && doors >= houses);
const a = C.build(0, 0, 0, NH), b = C.build(0, 0, 0, NH); assert.deepStrictEqual(Array.from(a.cols), Array.from(b.cols)); assert(a.mesh.vb.byteLength + a.mesh.ib.byteLength < 600e3, 'LOD0 chunk size');
['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'dealer', 'airport'].forEach(id => { const p = L.poi(id); assert(C.build(Math.floor(p.x / 128), Math.floor(p.z / 128), 0, NH).doors.some(d => d.id === id), 'landmark door ' + id); });
// interiors: every kind builds; every clerk option opens a real app; screens use known painters
const I = RealWorld.Interiors, APPS = ['Bank', 'Stocks', 'WestShop', 'Arcade', 'Games', 'RealEstate', 'WestMap', 'Leaderboard', 'News', 'Files', 'Notes', 'WestLab', 'WestFactory', 'Messages'], KINDS = ['bank', 'stocks', 'news', 'tv', 'movers', 'board', 'arcade', 'listings', 'lab', 'factory', 'cars', 'planes'];
I.kinds().forEach(k => { const r = I.build(k, { w: 12, dp: 10, beds: 3, type: 'house', name: 'x' }); assert(r.mesh.n > 0 && r.spawn.z < r.d); r.npcs.forEach(n => n.opts.forEach(o => assert(APPS.includes(o.app), k + ' → ' + o.app))); r.screens.forEach(s => assert(KINDS.includes(s.kind), 'screen ' + s.kind)); assert(!JSON.stringify(r).includes('"terms"'), 'no terminals any more'); });
['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'uni', 'lab', 'ind', 'plant', 'plot-lab', 'plot-factory', 'dealer', 'airport'].forEach(k => assert(I.build(k, {}).npcs.some(n => n.opts.length), k + ' has a clerk with services'));
// NPCs travel along streets, never anywhere else; deterministic
const N = RealWorld.NPC.create(G, L), now = 1.7e12; let moving = 0; for(let n = 0; n < 30; n++) for(let k = 0; k < 60; k++){ const s = N.state({ n, job: 'baker', thrift: 0.5 }, G.house(n * 7), now + k * 2000, NH); assert(isFinite(s.x + s.z)); if(s.moving){ moving++; assert(Math.hypot(s.x, s.z) < L.radius() + 50); } } assert(moving > 50, 'NPCs move');
assert.deepStrictEqual(N.state({ n: 3, job: 'baker', thrift: 0.5 }, G.house(9), now, NH), N.state({ n: 3, job: 'baker', thrift: 0.5 }, G.house(9), now, NH));
const E = RealWorld.Env; assert(E.state(E.DAY * 0.05).night > 0.95 && E.state(E.DAY * 0.6).night < 0.05);
console.log('realworld ok · terrain ' + hMin.toFixed(0) + ' … ' + hMax.toFixed(0) + ' m, steepest ' + maxSlope.toFixed(2) + ' · tris/LOD ' + tris.map(Math.round).join('/') + ' · radius ' + Math.round(L.radius()) + ' m');
/* ---- added with the open-world pass: the map level (LOD 4), instanced props, door data for in-place interiors ---- */
{ const a = C.build(0, 0, 0, 512), m = C.build(0, 0, 4, 512), f = C.build(-1, 0, 2, 512);
  assert(m.mesh.vb.byteLength + m.mesh.ib.byteLength < 40e3, 'a map-level chunk stays tiny: ' + (m.mesh.vb.byteLength + m.mesh.ib.byteLength));
  assert(m.props.length === 0 && f.props.length === 0, 'no props beyond LOD 1');
  assert(a.props.length > 0 && a.props.length % 8 === 0, 'LOD 0 emits instanced props (8 floats each)');
  for(let i = 0; i < a.props.length; i += 8) assert(a.props[i] >= 0 && a.props[i] <= 2 && isFinite(a.props[i + 1]) && a.props[i + 5] > 0, 'prop row ' + i / 8);
  const withDoor = []; for(let cx = -3; cx <= 3; cx++) for(let cz = -3; cz <= 3; cz++) C.build(cx, cz, 0, 512).doors.forEach(d => withDoor.push(d));
  assert(withDoor.length > 20 && withDoor.every(d => isFinite(d.bx) && isFinite(d.bz) && d.rw > 3 && d.rd > 3 && d.bh > 3), 'every door carries its building footprint');
  console.log('realworld map-level + props ok · LOD4 chunk ' + ((m.mesh.vb.byteLength + m.mesh.ib.byteLength) / 1024).toFixed(1) + ' KB, ' + a.props.length / 8 + ' instanced props in the centre chunk'); }
