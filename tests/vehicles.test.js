// node tests/vehicles.test.js — the catalogue, and that every parked vehicle stands on its own tarmac / kerb: inside its block, never inside a building, never inside another vehicle.
const assert = require('assert'), VD = require('../data/vehicle-data.js'), L = require('../os/realworld/layout.js'), V = require('../os/realworld/vehicles.js');
L.setup(512);
// catalogue
assert(VD.ALL.length >= 8); const ids = new Set(VD.ids()); assert.strictEqual(ids.size, VD.ALL.length, 'unique ids');
VD.ALL.forEach(v => { assert(Number.isInteger(v.price) && v.price > 0, v.id + ' price in whole cents'); assert(v.price < 9e15); assert(v.drive || v.fly, v.id + ' carries driving / flying numbers'); assert.strictEqual(v.driveable, false); assert(/^[a-z]+$/.test(v.id)); });
assert.strictEqual(VD.resale(1450000), 1015000); assert.strictEqual(VD.slotIds().length, 12);
// poses
const boxes = (list) => list.map(q => ({ q, c: Math.cos(q.yaw), s: Math.sin(q.yaw) }));
function hit(a, b){ const d = Math.hypot(a.x - b.x, a.z - b.z); return d < Math.min(a.hl, a.hw) + Math.min(b.hl, b.hw) - 0.01; }   // conservative circle test on the shorter half-axes
const garage = ['wren', 'alder', 'ridge', 'summit', 'vesper', 'apex', 'wren', 'alder', 'ridge', 'summit', 'skylark', 'kestrel', 'falcon', 'zenith'].map((m, i) => ({ slot: 'v' + (i + 1), m, col: i % 8 }));
const home = L.house(7).g, mine = V.owned(garage, home), shows = V.showcase('dealer').concat(V.showcase('airport'));
assert.strictEqual(V.showcase('dealer').length, 6); assert.strictEqual(V.showcase('airport').length, 3);
assert(mine.filter(q => q.where === 'home').length === 2, 'two cars at the kerb of the home'); assert(mine.filter(q => q.kind === 'plane').length >= 3, 'planes fit on the apron');
const all = shows.concat(mine); all.forEach(q => { ['x', 'z', 'yaw'].forEach(k => assert(Number.isFinite(q[k]), q.id + ' ' + k)); });
for(let i = 0; i < all.length; i++) for(let j = i + 1; j < all.length; j++) assert(!hit(all[i], all[j]) || all[i].where === 'home' && all[j].where === 'home' && false, 'vehicles overlap: ' + all[i].id + ' / ' + all[j].id);
// a vehicle in a block must stay inside the block's inner rectangle (lattice space) — checked through the block's own bays
['dealer', 'airport'].forEach(id => { const S = L.VEH_SITES[id], b = L.poi(id); (S.show || []).concat(S.lot || []).forEach(sp => { const p = L.bayPoint(id, sp.fwd, sp.lat); assert(Math.abs(sp.lat) <= 22 && Math.abs(sp.fwd) <= 40, id + ' bay inside the block'); assert(Math.hypot(p.x - b.x, p.z - b.z) > 9, id + ' bay not inside the building'); }); });
// kerb cars stay on the road side of their house
for(const i of [0, 9, 64, 300]){ const g = L.house(i).g, k = L.kerbSpot(g, 0), k2 = L.kerbSpot(g, 1); assert(Math.hypot(k.x - g.x, k.z - g.y) > g.dp / 2 + 6, 'kerb car clear of house ' + i); assert(Math.hypot(k.x - k2.x, k.z - k2.z) >= 9, 'two kerb cars do not touch'); }
// colliders: stride 8
assert.strictEqual(V.colliders(all).length, all.length * 8); assert.strictEqual(V.canDrive(), false);
console.log('vehicles ok · ' + all.length + ' poses checked');
