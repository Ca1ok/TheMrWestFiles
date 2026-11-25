/* node tests/traffic.test.js — NPC drivers (os/realworld/traffic.js) on the REAL drive.js car physics: natural acceleration, corners, queueing, passing parked cars, personal driving styles, car-to-car collisions. Pure. */
const assert = require('assert'), Dr = require('../os/realworld/drive.js'), TR = require('../os/realworld/traffic.js'), VD = require('../data/vehicle-data.js');
const world = { ground: () => 0, lift: () => 0 }, DT = 1 / 60, cars = VD.CARS.slice(0, 4);
const circ = (s, m) => { const f = [Math.sin(s.yaw), -Math.cos(s.yaw)], L = m.drive.len; return [-0.32, 0, 0.32].map(o => [s.x + f[0] * L * o, s.z + f[1] * L * o, m.drive.wid * 0.5]); };
const clearance = (a, ma, b, mb) => { let m = 1e9; for(const p of circ(a, ma)) for(const q of circ(b, mb)) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1]) - p[2] - q[2]); return m; };
const mk = (route, seedN, model, f0, u0) => { const ap = TR.create(route, seedN, model), p = TR.seed(ap, f0 || 0), s = Dr.car(model, { x: p.x, z: p.z, yaw: p.yaw }); s.u = u0 || 0; return { ap, s, hl: model.drive.len / 2, hw: model.drive.wid / 2 }; };
const L180 = [[0, 0], [400, 0]];                                                       // 400 m straight, heading east
const BLOCK = [[0, 0], [120, 0], [120, 80], [0, 80]];                                   // two 90° turns

// 1 ── natural acceleration: from rest it eases up (no instant full throttle), never jerks, never speeds, and cruises
for(const m of cars){
  const c = mk(L180, 5, m), env = { bodies: [], stopAtEnd: false }; let umax = 0, amax = 0, tHalf = 0, uPrev = 0; const lat = [];
  for(let t = 0; t < 40; t += DT){ const inp = TR.control(c.ap, c.s, DT, t, env); Dr.stepCar(c.s, inp, DT, world); const a = (c.s.u - uPrev) / DT; uPrev = c.s.u; if(t > 0.2) amax = Math.max(amax, a); umax = Math.max(umax, c.s.u); if(!tHalf && c.s.u > c.ap.vc * 0.5) tHalf = t; lat.push(c.s.z); }
  assert(amax < 3.1, m.id + ' accelerates gently (peak ' + amax.toFixed(2) + ' m/s²)'); assert(tHalf > 1.8, m.id + ' takes a few seconds to reach half speed (' + tHalf.toFixed(1) + ' s)'); assert(umax < c.ap.vc * 1.12 + 0.5, m.id + ' respects its own cruise speed ' + umax.toFixed(1) + ' / ' + c.ap.vc.toFixed(1)); assert(c.s.u > c.ap.vc * 0.8, m.id + ' reaches cruise speed');
  const zs = lat.slice(1200); assert(zs.every(z => z > 0.7 && z < 2.4), m.id + ' keeps in its lane on the right of the centre line (z ' + Math.min(...zs).toFixed(2) + '…' + Math.max(...zs).toFixed(2) + ')');
}

// 2 ── corners: slows down for 90° turns (not 12 m/s through a junction), stays on the lane, leans, finishes and STOPS at the end of the route
for(const m of cars){
  const c = mk(BLOCK, 9, m, 0.02, 0), env = { bodies: [] }; let vCorner = 99, maxOff = 0, lean = 0, done = false;
  for(let t = 0; t < 120 && !done; t += DT){ const inp = TR.control(c.ap, c.s, DT, t, env); Dr.stepCar(c.s, inp, DT, world); const pr = TR.project(c.ap.L, c.s.x, c.s.z, 0, c.ap.L.n - 2); maxOff = Math.max(maxOff, pr.dist); lean = Math.max(lean, Math.abs(c.s.roll));
    if(Math.hypot(c.s.x - 120, c.s.z - 0) < 14 || Math.hypot(c.s.x - 120, c.s.z - 80) < 14) vCorner = Math.min(vCorner, c.s.u); if(c.ap.done) done = true; }
  assert(done, m.id + ' reaches the end of its route and stops'); assert(vCorner < 8, m.id + ' slows for the junctions (' + vCorner.toFixed(1) + ' m/s)'); assert(maxOff < 2.0, m.id + ' tracks its lane (max error ' + maxOff.toFixed(2) + ' m)'); assert(c.s.flip === 0, m.id + ' does not roll over'); assert(Math.abs(c.s.u) < 0.7, m.id + ' is stationary at the end');
}

// 3 ── queueing: a stopped car in the lane (not parked, in the way): the follower brakes to a stop behind it, no collision; then pulls out and passes when nothing is coming
{
  const m = cars[1], c = mk(L180, 11, m, 0.02, 8), blocker = Dr.car(m, { x: 200, z: 1.5, yaw: Math.PI / 2 }); const bb = { s: blocker, hl: m.drive.len / 2, hw: m.drive.wid / 2 }, env = { bodies: [bb], stopAtEnd: false };
  let minGap = 1e9, stoppedBehind = false, passed = false; for(let t = 0; t < 60; t += DT){ Dr.stepCar(c.s, TR.control(c.ap, c.s, DT, t, env), DT, world); const gap = clearance(c.s, m, blocker, m); minGap = Math.min(minGap, gap); if(c.s.x < 199 && Math.abs(c.s.u) < 0.3 && t > 10) stoppedBehind = true; if(c.s.x > 215) passed = true; }
  assert(minGap > 0.1, 'the follower never touches the car in front (min gap ' + minGap.toFixed(2) + ' m)'); assert(stoppedBehind, 'it waits behind the blocker'); assert(passed, 'after a few seconds it pulls out round the blocker');
}
// … and a moving lead car: follows at a sensible gap at the lead's speed
{
  const LONG = [[0, 0], [3000, 0]], m = cars[0], lead = mk(LONG, 21, m, 0.01, 6), foll = mk(LONG, 22, cars[1], 0.003, 6); lead.ap.vc = 6.5; foll.ap.vc = 13; let gapMin = 1e9, gapEnd = 0;
  for(let t = 0; t < 60; t += DT){ Dr.stepCar(lead.s, TR.control(lead.ap, lead.s, DT, t, { bodies: [], stopAtEnd: false }), DT, world); Dr.stepCar(foll.s, TR.control(foll.ap, foll.s, DT, t, { bodies: [{ s: lead.s, hl: lead.hl, hw: lead.hw }], stopAtEnd: false }), DT, world); const g = clearance(lead.s, m, foll.s, cars[1]); gapMin = Math.min(gapMin, g); gapEnd = g; }
  assert(gapMin > 0.8, 'follower keeps off the lead car (min bumper gap ' + gapMin.toFixed(2) + ' m)'); assert(Math.abs(foll.s.u - lead.s.u) < 1.5 && gapEnd > 3 && gapEnd < 40, 'follower settles at the lead car\u2019s speed with a gap (' + gapEnd.toFixed(1) + ' m, ' + foll.s.u.toFixed(1) + ' vs ' + lead.s.u.toFixed(1) + ' m/s)');
}

// 4 ── parked cars at the kerb (3.2 m right of the centre line): passed with a sideways shift, no stop, no contact
{
  const m = cars[1], c = mk(L180, 3, m, 0.02, 9), park = [{ x: 150, z: 3.2 }, { x: 175, z: 3.2 }, { x: 260, z: 3.3 }].map(p => ({ s: Dr.car(cars[0], { x: p.x, z: p.z, yaw: Math.PI / 2 }), hl: cars[0].drive.len / 2, hw: cars[0].drive.wid / 2, fixed: true }));
  let minSep = 1e9, vMin = 99; for(let t = 0; t < 40; t += DT){ Dr.stepCar(c.s, TR.control(c.ap, c.s, DT, t, { bodies: park, stopAtEnd: false }), DT, world); for(const p of park){ if(Math.abs(c.s.x - p.s.x) < 6) minSep = Math.min(minSep, clearance(c.s, m, p.s, cars[0])); if(Math.abs(c.s.x - p.s.x) < 30 && c.s.x > 120) vMin = Math.min(vMin, c.s.u); } }
  assert(minSep > 0.05, 'passes parked cars without touching them (side clearance ' + minSep.toFixed(2) + ' m)'); assert(vMin > 4, 'and without stopping (min speed ' + vMin.toFixed(1) + ' m/s)'); assert(c.s.x > 300, 'keeps going');
}

// 5 ── personal styles: different seeds drive differently, none leaves its lane
{
  const spread = []; for(let k = 0; k < 6; k++){ const c = mk(L180, 100 + k * 37, cars[1], 0.02, 10), z = []; for(let t = 0; t < 30; t += DT){ Dr.stepCar(c.s, TR.control(c.ap, c.s, DT, t, { bodies: [], stopAtEnd: false }), DT, world); if(t > 8) z.push(c.s.z); } const mean = z.reduce((a, b) => a + b, 0) / z.length, sd = Math.sqrt(z.reduce((a, b) => a + (b - mean) ** 2, 0) / z.length); spread.push({ sd, mean, vc: c.ap.vc, skill: c.ap.skill }); assert(Math.min(...z) > 0.4 && Math.max(...z) < 2.9, 'seed ' + k + ' stays in its lane'); }
  assert(new Set(spread.map(s => s.vc.toFixed(1))).size >= 5, 'every driver has their own cruise speed'); assert(Math.max(...spread.map(s => s.sd)) > 0.08, 'some drivers wander in the lane (sd up to ' + Math.max(...spread.map(s => s.sd)).toFixed(2) + ' m)'); assert(Math.max(...spread.map(s => s.mean)) - Math.min(...spread.map(s => s.mean)) > 0.05, 'lane positions differ');
}

// 6 ── a whole street of traffic in both directions + a junction: nobody gets stuck for good, and the cars that do touch bounce apart
{
  const A = [[0, 0], [300, 0]], B = [[300, 0], [0, 0]], X = [[150, -150], [150, 150]], list = []; let k = 0;
  const add = (route, f, u) => { const c = mk(route, 500 + k++, cars[k % 4], f, u); list.push(c); }; for(let i = 0; i < 5; i++){ add(A, 0.03 + i * 0.15, 7); add(B, 0.03 + i * 0.15, 7); } for(let i = 0; i < 3; i++) add(X, 0.05 + i * 0.12, 6);
  let contacts = 0, worstOverlap = 0; const bodies = list.map(c => ({ s: c.s, hl: c.hl, hw: c.hw }));
  for(let t = 0; t < 90; t += DT){ for(const c of list) Dr.stepCar(c.s, TR.control(c.ap, c.s, DT, t, { bodies, stopAtEnd: true }), DT, world); contacts += TR.collideCars(bodies); }
  const moved = list.filter(c => c.ap.done || c.s.u > 1 || c.ap.d > c.ap.L.len * 0.5).length; assert(moved >= list.length - 2, 'traffic flows: ' + moved + ' of ' + list.length + ' cars made progress / arrived'); console.log('  traffic: ' + moved + '/' + list.length + ' cars through, ' + contacts + ' contact frames');
  for(const a of bodies) for(const b of bodies){ if(a === b) continue; const d = Math.hypot(a.s.x - b.s.x, a.s.z - b.s.z); if(d < 1.2) worstOverlap++; } assert(worstOverlap === 0, 'no two cars end up inside each other');
}

// 7 ── collisions: head-on, rear-end, glancing; fixed bodies; momentum and yaw
{
  const m = cars[1]; const A = Dr.car(m, { x: -4, z: 0, yaw: Math.PI / 2 }), B = Dr.car(m, { x: 4, z: 0, yaw: -Math.PI / 2 }); A.u = 10; B.u = 10;
  const bs = [{ s: A, hl: 2.25, hw: 0.9 }, { s: B, hl: 2.25, hw: 0.9 }]; let n = 0; for(let i = 0; i < 30; i++){ n += TR.collideCars(bs); Dr.stepCar(A, { thr: 0, steer: 0, brake: 0, hand: 0 }, 1 / 60, world); Dr.stepCar(B, { thr: 0, steer: 0, brake: 0, hand: 0 }, 1 / 60, world); }
  assert(n > 0, 'head-on cars touch'); assert(A.u < 3 && B.u < 3, 'a head-on crash scrubs most of the speed (' + A.u.toFixed(1) + ', ' + B.u.toFixed(1) + ')'); assert(Math.hypot(A.x - B.x, A.z - B.z) > 3.2, 'and they are pushed apart'); assert((A.bump || 0) > 8, 'the impact speed is reported (bump ' + (A.bump || 0).toFixed(1) + ')');
  // a heavy truck-ish car hits a light one from behind: the light one is flung forward, the heavy one slows less
  const H = Dr.car(VD.CARS[2], { x: -6, z: 0, yaw: Math.PI / 2 }), Lt = Dr.car(VD.CARS[0], { x: 0, z: 0, yaw: Math.PI / 2 }); H.u = 14; Lt.u = 0; const b2 = [{ s: H, hl: 2.7, hw: 1 }, { s: Lt, hl: 1.85, hw: 0.85 }]; for(let i = 0; i < 40; i++){ TR.collideCars(b2); Dr.stepCar(H, { thr: 0, steer: 0, brake: 0, hand: 0 }, 1 / 60, world); Dr.stepCar(Lt, { thr: 0, steer: 0, brake: 0, hand: 0 }, 1 / 60, world); }
  assert(Lt.u > 6, 'the light car is shunted forward (' + Lt.u.toFixed(1) + ')'); assert(H.u > 0 && H.u < 14 && H.u < Lt.u + 6, 'the heavy car loses some speed (' + H.u.toFixed(1) + ')'); assert(Lt.x > H.x, 'no pass-through');
  // glancing blow: yaw changes
  const G1 = Dr.car(m, { x: 0, z: 0, yaw: Math.PI / 2 }), G2 = Dr.car(m, { x: 3.8, z: 1.5, yaw: -Math.PI / 2 }); G1.u = 8; G2.u = 8; const b3 = [{ s: G1, hl: 2.25, hw: 0.9 }, { s: G2, hl: 2.25, hw: 0.9 }]; for(let i = 0; i < 20; i++){ TR.collideCars(b3); G1.x += G1.u / 60; G2.x -= G2.u / 60; }
  assert(Math.abs(G1.r) + Math.abs(G2.r) > 0.05, 'an off-centre hit spins the cars (yaw rates ' + G1.r.toFixed(2) + ', ' + G2.r.toFixed(2) + ')');
  // a fixed (parked / remote) body never moves
  const F = { s: Dr.car(m, { x: 5, z: 0, yaw: Math.PI / 2 }), hl: 2.25, hw: 0.9, fixed: true }, M = Dr.car(m, { x: 0.5, z: 0, yaw: Math.PI / 2 }); M.u = 9; const fx0 = F.s.x; for(let i = 0; i < 10; i++){ TR.collideCars([{ s: M, hl: 2.25, hw: 0.9 }, F]); M.x += M.u / 60; }
  assert(F.s.x === fx0, 'a fixed body does not move'); assert(M.u < 3, 'but it stops what hits it (' + M.u.toFixed(1) + ')');
}

// 8 ── colliders for people on foot
{ const out = new Float32Array(16), n = TR.boxes([{ s: { x: 10, z: 20, yaw: 0.5 }, hl: 2.2, hw: 0.9 }], out, () => 3); assert(n === 1 && out[1] === 10 && out[2] === 20 && Math.abs(out[3] - 0.95) < 1e-6 && Math.abs(out[4] - 2.25) < 1e-6 && Math.abs(out[7] - 4.5) < 1e-6, 'box format'); }
console.log('traffic.test.js: all passed');
