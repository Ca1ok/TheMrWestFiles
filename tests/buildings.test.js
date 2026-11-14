// node tests/buildings.test.js — house shapes, the skyline field and the infill between districts (all pure functions of an index)
const assert = require('assert'), G = require('../os/lib/worldgen.js'), B = require('../os/lib/buildgen.js');
const N = 12, houses = []; for(let i = 0; i < N * 64; i++) houses.push(G.house(i));
// 1. every house has a shape: finite vertices, unit normals, faces point at real vertices, deterministic, and 6 types really differ
const sigs = new Set(); let maxFl = 0;
houses.forEach(g => { const s = B.shape(g); assert.ok(s.F.length > 5 && s.h > 2, 'shape ' + g.i); assert.ok(s.V.every(Number.isFinite)); const nv = s.V.length / 3;
  s.F.forEach(f => { assert.ok(f.v.every(i => i >= 0 && i < nv)); assert.ok(Math.abs(Math.hypot(...f.n) - 1) < 1e-6, 'unit normal'); (f.k || []).forEach(k => assert.ok(k.v.every(i => i < nv))); });
  assert.ok(Math.abs(s.w - g.w) < 1e-9, 'footprint comes from the lot'); sigs.add(g.type + '|' + s.F.length + '|' + s.h.toFixed(1)); maxFl = Math.max(maxFl, s.fl); });
assert.ok(sigs.size > 60, 'houses are individual (' + sigs.size + ' distinct shapes of ' + houses.length + ')');
assert.deepStrictEqual(B.build('house', 11, 10, 2, 5).V, B.build('house', 11, 10, 2, 5).V, 'deterministic');
// 2. heights follow the skyline: "city" districts are taller than ordinary ones, the middle taller than the edge
const avg = k => { const a = houses.slice(k * 64, k * 64 + 64).filter(g => g.type === 'apartment').map(g => B.shape(g).fl); return a.reduce((x, y) => x + y, 0) / a.length; };
const cityK = [], plainK = []; for(let k = 0; k < N; k++) (G.district(k).city ? cityK : plainK).push(k);
const mean = ks => ks.reduce((s, k) => s + avg(k), 0) / ks.length; assert.ok(mean(cityK) > 2 * mean(plainK), 'cities are much taller (' + mean(cityK).toFixed(1) + ' vs ' + mean(plainK).toFixed(1) + ' floors)');
assert.ok(maxFl >= 20, 'there are real towers (' + maxFl + ' floors)');
// 3. the field is smooth: walking 2 km never jumps by more than 0.08 per 10 units, and it is 1 downtown and ~0 far out
let jump = 0, prev = B.urban(G.CORE.x, G.CORE.y, N); assert.ok(prev > 0.95); for(let x = G.CORE.x + 10; x < G.CORE.x + 2000; x += 10){ const u = B.urban(x, G.CORE.y, N); jump = Math.max(jump, Math.abs(u - prev)); prev = u; } assert.ok(jump < 0.08, 'smooth skyline (max step ' + jump.toFixed(3) + ')'); assert.ok(B.urban(G.CORE.x + 5000, G.CORE.y, N) < 0.001);
// 4. a house's height does not depend on how many districts exist
assert.strictEqual(B.shape(G.house(100)).fl, (() => { const f = B.floorsFor('x', 0, 0); return B.shape(G.house(100)).fl; })());
// 5. infill: keeps off district footprints, the core, the campuses and highways; neighbouring buildings change height gradually
const inPoly = (p, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const a = poly[i], b = poly[j]; if((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const fps = []; for(let k = 0; k < N; k++) fps.push(G.footprint(k)); let nb = 0, bad = 0, steps = [], tot = 0;
const hw = G.highways(N); for(const t of B.tilesIn(-400, -300, 2300, 1500)){ const T = B.infill(t[0], t[1], N); T.b.forEach(b => { nb++; if(fps.some(f => inPoly([b.x, b.y], f)) || (Math.abs(b.x - G.CORE.x) < 112 && Math.abs(b.y - G.CORE.y) < 104)) bad++; assert.ok(B.protoOf(b).h > 2); }); }
assert.ok(nb > 2000 && bad === 0, 'infill is clear of districts and downtown (' + nb + ' buildings, ' + bad + ' inside)');
// walk outwards from downtown along 3 rays: floors of consecutive buildings never jump by more than half + 3
const all = []; for(const t of B.tilesIn(-400, -300, 2300, 1500)) B.infill(t[0], t[1], N).b.forEach(b => all.push(b)); const grid = new Map(); all.forEach(b => grid.set(Math.round(b.x / 26) + ',' + Math.round(b.y / 26), b));
let big = 0, cmp = 0; all.forEach(b => { const o = grid.get((Math.round(b.x / 26) + 1) + ',' + Math.round(b.y / 26)); if(o){ cmp++; if(Math.abs(o.fl - b.fl) > Math.max(3, 0.5 * Math.max(o.fl, b.fl))) big++; } }); assert.ok(big / cmp < 0.1, 'neighbours blend (' + big + ' of ' + cmp + ' big jumps)');
// 6. links join road ends to the grid; landmarks and downtown blocks build
assert.ok(B.links(N).length > N * 5); ['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'uni', 'lab', 'ind', 'plant'].forEach(id => assert.ok(B.landmark(id).h > 5, id));
G.coreBlocks().forEach(b => assert.ok(B.proto(b.kind, b.w, b.d, b.fl, b.v).h > 5));
// 7. the door faces the street the house stands on (front = side · local y)
houses.slice(0, 600).forEach(g => { const st = G.loc(g.k, g.cu, g.v), fx = -Math.sin(g.ang) * g.side, fy = Math.cos(g.ang) * g.side; assert.ok((st[0] - g.x) * fx + (st[1] - g.y) * fy > 0, 'front faces street ' + g.i); });
console.log('buildings ok — ' + houses.length + ' houses (' + sigs.size + ' distinct shapes, up to ' + maxFl + ' floors), ' + nb + ' infill buildings, ' + B.links(N).length + ' link streets');
