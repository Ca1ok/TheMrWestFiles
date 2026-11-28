// node tests/parking.test.js — NPC cars parked at the kerb never stack: five people in one house, a dozen drivers who all finish their trip at the same door, your own car already parked there.
// Runs the REAL crime.js runtime (RealWorld.Crime.create) against stubs for the DOM / world, and checks every pair of parked cars with an oriented-box test.
const assert = require('assert'), VD = require('../data/vehicle-data.js');
const dummy = () => new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : dummy(), apply: () => dummy(), set: () => true, construct: () => dummy() });
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.document = dummy(); globalThis.performance = globalThis.performance || { now: () => Date.now() };
const Crime = require('../os/realworld/crime.js');
const h32 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
// a street running east–west; a house on the north side whose kerb spots sit alongside it (same recipe as layout.js kerbSpot: two spots, ±5.5 m)
const house = { side: 1, ang: 0, x: 100, y: 0, dp: 10 }, kerb = (g, k) => ({ x: g.x + (k ? 5.5 : -5.5), z: g.y + 12, yaw: Math.PI / 2 });
const L = { house: () => ({ g: house }), kerbSpot: kerb };
const boxOf = q => ({ x: q.x, z: q.z, yaw: q.yaw, hl: q.hl, hw: q.hw });
function hit(a, b){ for(let p = 0; p < 2; p++){ const P = p ? b : a, Q = p ? a : b, pf = [Math.sin(P.yaw), -Math.cos(P.yaw)], pr = [Math.cos(P.yaw), Math.sin(P.yaw)], qf = [Math.sin(Q.yaw), -Math.cos(Q.yaw)], qr = [Math.cos(Q.yaw), Math.sin(Q.yaw)];
  for(let k = 0; k < 2; k++){ const ax = k ? pr : pf, d = Math.abs((Q.x - P.x) * ax[0] + (Q.z - P.z) * ax[1]), rQ = Q.hl * Math.abs(qf[0] * ax[0] + qf[1] * ax[1]) + Q.hw * Math.abs(qr[0] * ax[0] + qr[1] * ax[1]); if(d > (k ? P.hw : P.hl) + rQ) return false; } } return true; }
function world(bots, fixedList){
  const V = { list: fixedList || [] }, P = { x: 100, z: 12 }, ctx = { OS: { prefs: { get: () => null, set(){} }, econ: () => 1 }, P, T: { height: () => 0 }, L, G: { h32, bot: () => ({ name: 'Test' }) }, VD, VH: {}, Dr: null, V, el: document, toast(){},
    bots: () => bots, driving: () => false, drivingState: () => null, uiBusy: () => false, locked: () => false, rebuild(){}, startDrive: () => false, leaveCar(){}, findFree: (x, z) => ({ x, z }), disabled: () => null, resolve: (x, z) => ({ x, z }), sets: () => [], inside: () => false, speed: () => 0 };
  const C = Crime.create(ctx); return { C, V };
}
const parked = C => C.extra().filter(q => q.npc != null);
function assertNoStack(list, label){ for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) assert(!hit(boxOf(list[i]), boxOf(list[j])), label + ': cars ' + i + ' and ' + j + ' overlap at (' + list[i].x.toFixed(1) + ', ' + list[i].z.toFixed(1) + ')'); }
// 1 ── five citizens whose timetable parks them on EXACTLY the same spot (same house / same door)
{ const bots = []; for(let n = 1; n <= 5; n++) bots.push({ n, vx: 0, vz: 0, vis: false, init: true, rest: { x: kerb(house, 0).x, z: kerb(house, 0).z, yaw: Math.PI / 2 } });
  const w = world(bots.filter(b => h32(b.n, 76) % 3 !== 0 || true)); let t = 0; for(let k = 0; k < 4; k++){ t += 1200; w.C.update(0.1, t); } w.V.list = w.C.extra();
  const cars = parked(w.C); assert(cars.length >= 2, 'several of them are parked (' + cars.length + ')'); assertNoStack(cars, 'one house'); console.log('✓ ' + cars.length + ' cars from one house, none overlapping'); }
// 2 ── the kerb is taken by YOUR car: nobody parks inside it
{ const bots = []; for(let n = 10; n <= 16; n++) bots.push({ n, vx: 0, vz: 0, vis: false, init: true, rest: { x: kerb(house, 0).x, z: kerb(house, 0).z, yaw: Math.PI / 2 } }); const d = VD.get('alder').drive;
  const mine = { id: 'alder', kind: 'car', slot: 'v1', x: kerb(house, 0).x, z: kerb(house, 0).z, yaw: Math.PI / 2, hl: d.len / 2, hw: d.wid / 2 };
  const w = world(bots, [mine]); for(let k = 1; k <= 4; k++) w.C.update(0.1, k * 1200); const cars = parked(w.C); assert(cars.length >= 1);
  for(const q of cars) assert(!hit(boxOf(q), boxOf(mine)), 'an NPC car parked inside the player\'s car'); assertNoStack(cars, 'beside player car'); console.log('✓ ' + cars.length + ' NPC cars keep clear of the player\'s own car'); }
// 3 ── a stable layout: the same cars stay exactly where they were between refreshes
{ const bots = []; for(let n = 20; n <= 27; n++) bots.push({ n, vx: 0, vz: 0, vis: false, init: true, rest: { x: kerb(house, 0).x, z: kerb(house, 0).z, yaw: Math.PI / 2 } }); const w = world(bots); w.C.update(0.1, 1200); const a = parked(w.C).map(q => q.npc + ':' + q.x.toFixed(2) + ',' + q.z.toFixed(2));
  w.C.update(0.1, 2600); w.C.update(0.1, 4000); const b = parked(w.C).map(q => q.npc + ':' + q.x.toFixed(2) + ',' + q.z.toFixed(2)); assert.deepStrictEqual(b, a, 'parked cars do not hop between refreshes'); console.log('✓ parked cars stay put between refreshes'); }
console.log('parking.test.js: all passed');
