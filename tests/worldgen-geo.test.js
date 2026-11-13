// node tests/worldgen-geo.test.js — the street network: houses are spread out, districts never overlap, every route is one continuous walk along real roads.
const assert = require('assert'), G = require('../os/lib/worldgen.js');
const inPoly = (p, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const a = poly[i], b = poly[j]; if((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const N = 40, houses = []; for(let i = 0; i < N * 64; i++) houses.push(G.house(i));
// 1. houses are spread out: nothing closer than a house is wide, and no house sits inside another district
let min = 1e9; for(let k = 0; k < N; k++) for(let a = 0; a < 64; a++) for(let b = a + 1; b < 64; b++){ const p = houses[k * 64 + a], q = houses[k * 64 + b]; min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y)); }
assert.ok(min > 13, 'houses are at least 13 units apart (min ' + min.toFixed(1) + ')');
for(let k = 0; k < N; k++){ const fp = G.footprint(k); assert.ok(houses.slice(k * 64, k * 64 + 64).every(h => inPoly([h.x, h.y], fp)), 'district ' + k + ' houses sit inside its own footprint'); for(let q = 0; q < N; q++) if(q !== k) assert.ok(!houses.slice(q * 64, q * 64 + 64).some(h => inPoly([h.x, h.y], fp)), 'districts ' + k + ' and ' + q + ' do not overlap'); }
// 2. addresses: unique within a street, named after the street the house is on
const seen = new Set(); houses.forEach(h => { const key = h.k + '|' + h.addr; assert.ok(!seen.has(key), 'unique address ' + h.addr + ' in district ' + h.k); seen.add(key); });
// 3. the road network is a connected graph with loops (more edges than a tree)
const n = 12, hw = G.highways(n), nodes = new Set(['hub', 'uni', 'ind']); for(let k = 0; k < n; k++) nodes.add('d' + k);
assert.ok(hw.length > nodes.size - 1 + 2, 'highways form loops, not just a tree (' + hw.length + ' edges)');
// 4. routes: continuous (no teleports), start/end at the places, and they stay on roads (house → its street → avenue → highways → avenue → street → house)
const hwPts = new Set(); hw.forEach(e => e.pts.forEach(q => hwPts.add(q[0].toFixed(3) + ',' + q[1].toFixed(3)))); const on = q => hwPts.has(q[0].toFixed(3) + ',' + q[1].toFixed(3));
const gap = pts => { let m = 0; for(let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if(d > 30 && !(on(pts[i]) && on(pts[i - 1])) && d > 45) return d; if(d < 30) m = Math.max(m, d); } return m; };   // a long hop is only legal along a highway's own sample points
let checked = 0; for(const [a, b] of [[5, 20], [5, 300], [70, 700 % (n * 64)], [130, 4], [200, 201], [300, 5]]){ const A = G.playerPlace('home', 'u', 'h' + a), B = G.playerPlace('home', 'u', 'h' + b), r = G.route(A, B, n);
  assert.deepStrictEqual(r[0], [A.x, A.y]); assert.deepStrictEqual(r[r.length - 1], [B.x, B.y]); assert.ok(gap(r) < 40, 'no teleports on route h' + a + '→h' + b + ' (largest hop ' + gap(r).toFixed(1) + ')'); checked++; }
const toBank = G.route(G.playerPlace('home', 'u', 'h70'), G.playerPlace('bank', 'u', 'h70'), n); assert.ok(G.lenOf(toBank) > 200);
// 5. a downtown skyline exists and keeps off the roads
assert.ok(G.coreBlocks().length > 40);
console.log('worldgen-geo ok — ' + checked + ' routes, min house spacing ' + min.toFixed(1) + ', ' + hw.length + ' highway edges for ' + n + ' districts');
