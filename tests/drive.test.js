/* node tests/drive.test.js — the vehicle physics (os/realworld/drive.js): every car and plane in the catalogue must behave. Pure, no browser. */
const assert = require('assert'), D = require('../os/realworld/drive.js'), VD = require('../data/vehicle-data.js');
const flat = { ground: () => 0, push: (x, z) => ({ x, z }) }, F = 1 / 60, ok = m => console.log('  ✓ ' + m);

/* ---------------- cars ---------------- */
for(const c of VD.CARS){
  const s = D.car(c, { x: 0, z: 0, yaw: 0 }); let t100 = null, t = 0;
  for(; t < 60; t += F){ D.stepCar(s, { thr: 1, steer: 0 }, F, flat); if(t100 == null && s.u >= 100 / 3.6) t100 = t; }
  assert(t100 && t100 < c.zero100 * 1.25 && t100 > c.zero100 * 0.7, c.id + ' 0-100 in ' + t100 + ' (catalogue ' + c.zero100 + ')');
  assert(s.u > c.drive.top * 0.96 && s.u <= c.drive.top * 1.06, c.id + ' reaches its top speed: ' + (s.u * 3.6).toFixed(0) + ' km/h');
  assert(Math.abs(s.x) < 0.5 && Math.abs(s.v) < 0.1, c.id + ' drives straight with no steering');
  let tb = 0; while(s.u > 0.05 && tb < 30){ D.stepCar(s, { thr: 0, brake: 1 }, F, flat); tb += F; } assert(tb < 9 && s.u >= 0, c.id + ' stops from top speed in ' + tb.toFixed(1) + ' s');
  const turn = D.car(c, { x: 0, z: 0, yaw: 0 }); turn.u = 60 / 3.6; for(let i = 0; i < 180; i++) D.stepCar(turn, { thr: 0.3, steer: 1 }, F, flat);
  const lat = Math.abs(turn.u * turn.r) / 9.81; assert(lat > 0.5 && lat < 1.9, c.id + ' corners at ' + lat.toFixed(2) + ' g (tyres saturate, no teleporting round corners)'); assert(turn.r > 0, 'positive steer turns right (yaw grows)');
  { const fast = D.car(c, { x: 0, z: 0, yaw: 0 }), bd = D.car(c, { x: 0, z: 0, yaw: 0 }); fast.u = 110 / 3.6; let fl = false, lean = 0; for(let i = 0; i < 300; i++){ D.stepCar(fast, { thr: 0.3, steer: 1 }, F, flat); if(fast.flip) fl = true; }
    assert(fl, c.id + ' rolls over when thrown into a corner at 110 km/h on full lock'); for(let i = 0; i < 400; i++) D.stepCar(fast, { thr: 0, steer: 0 }, F, flat); assert(!fast.flip && Math.abs(fast.roll) < 0.01, c.id + ' is righted again after the tumble');
    bd.u = 55 / 3.6; for(let i = 0; i < 240; i++){ D.stepCar(bd, { thr: 0, steer: 1 }, F, flat); lean = Math.max(lean, Math.abs(bd.roll)); } assert(!bd.flip && lean > 0.03 && lean < 0.5, c.id + ' leans (' + lean.toFixed(2) + ' rad) but stays up in a hard 55 km/h turn'); }
  const rev = D.car(c, { x: 0, z: 0, yaw: 0 }); for(let i = 0; i < 360; i++) D.stepCar(rev, { thr: -1 }, F, flat); assert(rev.u < -4 && rev.u > -12, c.id + ' reverses (slowly): ' + rev.u.toFixed(1));
}
ok('all 6 cars: 0-100, top speed, straight line, braking, cornering grip, reverse');
{ const c = VD.get('alder'), s = D.car(c, { x: 0, z: 0, yaw: 0 }); s.u = 25;
  const wall = { ground: () => 0, push: (x, z) => z < -30 ? { x, z: -30 } : { x, z } };       // a wall: nothing may go beyond z = -30
  let hit = 0; for(let i = 0; i < 240; i++){ D.stepCar(s, { thr: 0, steer: 0 }, F, wall); hit = Math.max(hit, s.hit); } assert(s.z >= -30 - 2.4 && hit > 8 && Math.abs(s.u) < 6, 'wall stops the car (hit ' + hit.toFixed(1) + ' m/s)'); ok('collision: the car is stopped by a wall and reports the impact speed');
  const hb = D.car(c, { x: 0, z: 0, yaw: 0 }); hb.u = 22; for(let i = 0; i < 40; i++) D.stepCar(hb, { thr: 0, steer: 1, hand: 1 }, F, flat);
  const nb = D.car(c, { x: 0, z: 0, yaw: 0 }); nb.u = 22; for(let i = 0; i < 40; i++) D.stepCar(nb, { thr: 0, steer: 1, hand: 0 }, F, flat); assert(Math.abs(hb.v) > Math.abs(nb.v) * 1.5, 'handbrake lets the rear slide (v ' + hb.v.toFixed(1) + ' vs ' + nb.v.toFixed(1) + ')'); ok('handbrake makes the tail slide'); }
{ const hill = { ground: (x, z) => -z * 0.1, push: (x, z) => ({ x, z }) }, s = D.car(VD.get('wren'), { x: 0, z: 0, yaw: 0 }); for(let i = 0; i < 60; i++) D.stepCar(s, { thr: 0, steer: 0 }, F, hill); assert(Math.abs(s.pitch - Math.atan(0.1)) < 0.03, 'the body follows the slope: ' + s.pitch.toFixed(3)); ok('the car pitches with the ground'); }

/* ---------------- planes ---------------- */
const rw = (id, yaw) => D.plane(VD.get(id), { x: 0, z: 0, yaw: yaw == null ? Math.PI / 2 : yaw });
const takeoff = id => { const s = rw(id), P = s.P; let t = 0, lift = null;
  for(; t < 80 && !s.crashed; t += F){ const pitch = s.onGround ? (s.ias > P.vr ? 1 : 0) : D.clamp(0.25 + ((s.alt < 150 ? 0.10 : 0.12) - s.gamma) * 6, -1, 1); D.stepPlane(s, { thr: 1, pitch }, F, flat); if(lift == null && !s.onGround) lift = { t, x: s.x, v: s.ias }; }
  return { s, lift }; };
for(const p of VD.PLANES){
  const m = VD.get(p.id), { s, lift } = takeoff(p.id), design = m.fly.runway * 0.45;
  assert(lift, p.id + ' takes off'); assert(lift.x > design * 0.7 && lift.x < design * 1.6, p.id + ' rolls ' + lift.x.toFixed(0) + ' m (design ' + design.toFixed(0) + ' m)'); assert(lift.v > m.fly.stall && lift.v < m.fly.vr * 1.3, p.id + ' leaves the ground at ' + lift.v.toFixed(1) + ' m/s');
  assert(!s.crashed && s.alt > 150, p.id + ' climbs away (alt ' + s.alt.toFixed(0) + ' m after 80 s)');
  // it never leaves the ground below stall speed
  const slow = rw(p.id), P = slow.P; for(let i = 0; i < 60 * 40; i++){ D.stepPlane(slow, { thr: 0.25, pitch: 1 }, F, flat); } assert(slow.onGround, p.id + ' stays on the ground at idle-ish thrust');
}
ok('all 4 planes: take-off run near the design distance, rotate, climb; no lift-off without speed');
{ const m = VD.get('skylark'), s = rw('skylark', 0); s.onGround = false; s.y = 500; s.vz = -m.fly.cruise; s.B = D.basis(0, 0, 0); let lo = 1e9, hi = -1e9;
  for(let t = 0; t < 120; t += F){ D.stepPlane(s, { thr: 0.75, pitch: 0, roll: 0 }, F, flat); lo = Math.min(lo, s.y); hi = Math.max(hi, s.y); } assert(!s.crashed && lo > 380 && hi < 620, 'hands-off cruise is stable (alt ' + lo.toFixed(0) + '-' + hi.toFixed(0) + ')'); ok('trimmed hands-off flight is stable for 2 minutes'); }
{ const m = VD.get('skylark'), s = rw('skylark', 0); s.onGround = false; s.y = 1500; s.vz = -30; s.B = D.basis(0, 0.2, 0); let stalled = false, t = 0;
  for(; t < 20; t += F){ D.stepPlane(s, { thr: 0, pitch: 1, roll: 0 }, F, flat); if(s.stalled) stalled = true; } assert(stalled, 'pulling back with no power at 30 m/s stalls'); let rec = false;
  for(t = 0; t < 30; t += F){ D.stepPlane(s, { thr: 1, pitch: -0.6, roll: 0 }, F, flat); if(!s.stalled && s.ias > 1.15 * s.P.Vs){ rec = true; break; } } assert(rec && !s.crashed, 'nose down + power recovers from the stall'); ok('stall → nose drops → recovery with nose down + power'); }
{ const m = VD.get('skylark'), s = rw('skylark', 0); s.onGround = false; s.y = 800; s.vz = -m.fly.cruise; s.B = D.basis(0, 0, 0); const y0 = s.yaw; for(let t = 0; t < 6; t += F) D.stepPlane(s, { thr: 0.8, pitch: s.roll > 0.3 ? 0.3 : 0, roll: s.roll < 0.7 ? 1 : 0 }, F, flat);
  assert(s.roll > 0.4 && Math.abs(D.wrapA(s.yaw - y0)) > 0.35 && D.wrapA(s.yaw - y0) > 0, 'rolling right banks right and the plane turns right (yaw ' + (s.yaw * 57.3).toFixed(0) + '°, roll ' + (s.roll * 57.3).toFixed(0) + '°)'); ok('bank → coordinated turn in the right direction'); }
{ const m = VD.get('skylark'), s = rw('skylark', 0); s.onGround = false; s.y = 120; s.vz = -36; s.B = D.basis(0, -0.03, 0); s.vy = -1;   // a simple approach: hold ~2.5 m/s sink, flare at 4 m
  for(let t = 0; t < 90 && !s.crashed && !s.onGround; t += F){ const flare = s.alt < 5; D.stepPlane(s, { thr: flare ? 0 : 0.12, pitch: flare ? D.clamp((-0.7 - s.vy) * 0.5, -0.5, 0.5) : D.clamp((-2.5 - s.vy) * 0.12, -0.4, 0.5) }, F, flat); }
  assert(!s.crashed && s.onGround, 'a gentle landing works (' + (s.crashed || 'touchdown at ' + s.touch.toFixed(1) + ' m/s sink') + ')'); assert(s.touch < 3.5, 'soft touchdown');
  for(let t = 0; t < 40; t += F) D.stepPlane(s, { thr: 0, pitch: 0, brake: 1 }, F, flat); assert(s.speed < 1, 'brakes stop it on the runway (' + s.speed.toFixed(1) + ' m/s)'); ok('gentle landing, rollout and braking'); }
{ const s = rw('skylark', 0); s.onGround = false; s.y = 50; s.vz = -30; s.vy = -14; s.B = D.basis(0, -0.3, 0); for(let t = 0; t < 4 && !s.crashed; t += F) D.stepPlane(s, { thr: 0, pitch: 0 }, F, flat); assert(s.crashed, 'a nose-dive into the ground is a crash: ' + s.crashed); ok('hard landing crashes'); }
{ const wall = { ground: () => 0, push: (x, z, y) => (y < 20 && x > 100) ? { x: 100, z } : { x, z } }, s = rw('skylark'); s.onGround = false; s.y = 5; s.vx = 40; s.B = D.basis(Math.PI / 2, 0, 0); for(let t = 0; t < 6 && !s.crashed; t += F) D.stepPlane(s, { thr: 1, pitch: 0 }, F, wall); assert(s.crashed, 'flying into a building crashes: ' + s.crashed);
  const hi = rw('skylark'); hi.onGround = false; hi.y = 60; hi.vx = 40; hi.B = D.basis(Math.PI / 2, 0, 0); for(let t = 0; t < 6 && !hi.crashed; t += F) D.stepPlane(hi, { thr: 1, pitch: 0.3 }, F, wall); assert(!hi.crashed, 'flying over it is fine'); ok('buildings: hit one = crash, fly over = fine'); }
{ const s = rw('skylark'); for(let i = 0; i < 60 * 5; i++) D.stepPlane(s, { thr: 0.5, yaw: 1 }, F, flat); assert(Math.abs(D.wrapA(s.yaw - Math.PI / 2)) > 0.15, 'nose-wheel steering turns the plane on the ground'); ok('taxiing: steering works'); }
/* REVERSE: every plane can back up on the ground (throttle at idle + rev), slowly, steering swaps sides, brakes stop it, and it still takes off afterwards */
for(const id of ['skylark', 'kestrel', 'falcon', 'zenith']){ const s = rw(id), x0 = s.x, z0 = s.z, hx = Math.sin(s.yaw), hz = -Math.cos(s.yaw); for(let i = 0; i < 60 * 6; i++) D.stepPlane(s, { thr: 0, rev: 1 }, F, flat);
  assert(-((s.x - x0) * hx + (s.z - z0) * hz) > 8, id + ' backs up along its own tail: ' + (-((s.x - x0) * hx + (s.z - z0) * hz))); assert(s.speed < -1 && s.speed > -4.2, id + ' reverse speed is slow and signed: ' + s.speed.toFixed(2)); assert(s.onGround && !s.crashed, id + ' stays on the ground');
  for(let i = 0; i < 60 * 4; i++) D.stepPlane(s, { thr: 0, rev: 0, brake: 1 }, F, flat); assert(Math.abs(s.speed) < 0.05, id + ' brakes to a stop after reversing');
  const y0 = s.yaw; for(let i = 0; i < 60 * 2; i++) D.stepPlane(s, { thr: 0, rev: 1, yaw: 1 }, F, flat); assert(Math.abs(D.wrapA(s.yaw - y0)) > 0.02, id + ' steers while reversing');
  const t = rw(id); let off = false; for(let i = 0; i < 60 * 120 && !off; i++){ D.stepPlane(t, { thr: 1, pitch: t.speed > t.P.vr ? 0.5 : 0, assist: true }, F, flat); off = !t.onGround; } assert(off, id + ' still takes off'); }
{ const s = rw('skylark'); s.vx = 0; s.vz = -12; for(let i = 0; i < 60 * 3; i++) D.stepPlane(s, { thr: 0, rev: 1 }, F, flat); assert(s.speed < 12 - 4, 'reverse thrust slows a rolling plane'); ok('reverse: all four planes back up, steer, stop and still fly'); }
// ── kerbs: driving over a 11.5 cm kerb at speed bounces and rocks the body; a heavier car is softer; sliding sideways into a kerb can trip and roll it
{ const kerbW = { ground: () => 0, lift: (x, z) => (z < -40 && z > -45 ? 0.115 : 0), push: (x, z) => ({ x, z }) };
  for(const id of ['wren', 'ridge']){ const s = D.car(VD.get(id), { x: 0, z: 0, yaw: 0 }); s.u = 15; let hy = 0, pi = 0; for(let i = 0; i < 360; i++){ D.stepCar(s, { thr: 0.2, steer: 0 }, 1 / 60, kerbW); hy = Math.max(hy, s.hy); pi = Math.max(pi, Math.abs(s.pitch)); }
    assert(hy > 0.02 && pi > 0.01, id + ' is kicked by a kerb (hop ' + hy.toFixed(3) + ' m, pitch ' + pi.toFixed(3) + ')'); assert(Math.abs(s.hy) < 0.02 && !s.flip, id + ' settles after the kerb'); }
  const sl = D.car(VD.get('wren'), { x: -1.2, z: 0, yaw: 0 }); sl.u = 16; sl.v = 8; let rolled = false; const sideK = { ground: () => 0, lift: (x, z) => (x > -0.1 ? 0.115 : 0), push: (x, z) => ({ x, z }) }; for(let i = 0; i < 240; i++){ D.stepCar(sl, { thr: 0, steer: 0, hand: 1 }, 1 / 60, sideK); if(sl.flip) rolled = true; } assert(rolled, 'a car sliding sideways at 40 km/h into a kerb trips and rolls'); }
console.log('\nDRIVE OK');
