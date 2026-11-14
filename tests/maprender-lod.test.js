// node tests/maprender-lod.test.js — the pure parts of the WestMap level-of-detail system (bucketing, sprite keys, atlas) and BuildGen's mesh-free queries
const assert = require('assert'), G = require('../os/lib/worldgen.js'), B = require('../os/lib/buildgen.js'), { LOD: L } = require('../os/lib/maprender.js');
// 1. angle buckets wrap, are stable under whole turns and round to the nearest step
const T = Math.PI * 2; assert.strictEqual(L.angBucket(0), 0); assert.strictEqual(L.angBucket(T), 0); assert.strictEqual(L.angBucket(-T / 64), 0); assert.strictEqual(L.angBucket(-T / 32), 31); assert.strictEqual(L.angBucket(T * 3 + T / 32), 1);
for(let a = -20; a < 20; a += 0.37){ const b = L.angBucket(a); assert.ok(b >= 0 && b < 32); let d = Math.abs(((L.angOf(b) - a) % T + T * 1.5) % T - T / 2); assert.ok(d <= T / 64 + 1e-9, 'within half a step'); }
// 2. pitch / zoom buckets
assert.strictEqual(L.pitchBucket(0.02), 1); assert.strictEqual(L.pitchBucket(5), 7); assert.ok(Math.abs(L.pitchOf(L.pitchBucket(0.95)) - 0.95) <= 0.08 + 1e-9);
for(const k of [0.2, 0.7, 1.3, 4, 9]) assert.ok(Math.abs(Math.log2(L.scaleOf(L.scaleBucket(k)) / k)) <= 0.25 + 1e-9, 'zoom within a quarter octave');
// 3. sprite keys are unique per variant and exact integers
const seen = new Set(); for(const sid of [0, 1, 4194303, 8388608 + 77]) for(const side of [0, 1]) for(const ab of [0, 31]) for(const pb of [1, 7]) for(const sb of [-8, 9]) for(const ci of [0, 7]) for(const dk of [0, 1]){ const k = L.spriteKey(sid, side, ab, pb, sb, ci, dk); assert.ok(Number.isSafeInteger(k)); assert.ok(!seen.has(k), 'unique'); seen.add(k); }
// 4. atlas: shelf packing never overlaps, stays inside the page, and wipes the stalest page when full
const mk = () => ({ cv: {}, g: {} }), A = L.makeAtlas(mk), boxes = []; let wiped = false;
for(let i = 0; i < 6000; i++){ A.frame = i; const w = 12 + (i * 7) % 60, h = 14 + (i * 13) % 100, r = A.alloc(w, h); assert.ok(r, 'alloc'); assert.ok(r.x >= 0 && r.y >= 0 && r.x + w <= 1024 && r.y + h <= 1024, 'inside page');
  A.map.set(i, { pg: r.pg, x: r.x, y: r.y, w, h }); if(A.wipes && !wiped){ wiped = true; assert.ok(A.pages.length === 3); } }
assert.ok(A.pages.length <= 3 && A.wipes > 0, 'pages are capped and recycled (' + A.wipes + ' wipes)');
const live = [...A.map.values()]; for(let i = 0; i < live.length; i += 7) for(let j = i + 1; j < Math.min(live.length, i + 200); j++){ const a = live[i], b = live[j]; if(a.pg !== b.pg) continue; assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'live sprites never overlap'); }
// 5. heightOf is a true upper bound of the mesh and never needs it; protoPal matches what proto() builds
let worst = 0, slack = 0; for(let i = 0; i < 64 * 40; i++){ const g = G.house(i), est = B.heightOf(g), real = B.shape(g).h; assert.ok(est >= real, 'bound holds for house ' + i); slack = Math.max(slack, est - real); worst = Math.max(worst, real); }
for(const [kind, w, d, fl, v] of [['house', 11, 10, 2, 5], ['apartment', 14, 12, 9, 321], ['office', 16, 14, 20, 77], ['studio', 12, 11, 4, 900]]) assert.deepStrictEqual(B.protoPal(kind, fl, v), B.proto(kind, w, d, fl, v).pal, 'protoPal ' + kind);
// 6. the shape cache survives more houses than its cap: partial eviction, results stay deterministic
const first = B.shape(G.house(5)).h; for(let i = 0; i < 3500; i++) B.shape(G.house(i)); assert.strictEqual(B.shape(G.house(5)).h, first);
console.log('maprender-lod ok — atlas wipes ' + A.wipes + ', height bound slack ≤ ' + slack.toFixed(1) + ', tallest ' + worst.toFixed(0));
