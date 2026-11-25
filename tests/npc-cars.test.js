/* node tests/npc-cars.test.js — NPC drivers (drive.js followInputs): a real drive.js car chases a timetable point round corners, stops and starts, without drifting off or flipping. Pure. */
const assert = require('assert'), Dr = require('../os/realworld/drive.js'), VD = require('../data/vehicle-data.js');
// a city-block route: east 120 m, south 80 m, west 120 m, with 90° corners, at 12 m/s (the timetable moves a point along it)
const pts = [[0, 0], [120, 0], [120, 80], [0, 80]]; const cum = [0]; for(let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
function at(d){ let i = 1; while(i < pts.length - 1 && cum[i] < d) i++; const a = pts[i - 1], b = pts[i], k = Math.max(0, Math.min(1, (d - cum[i - 1]) / (cum[i] - cum[i - 1]))), l = Math.hypot(b[0] - a[0], b[1] - a[1]); return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, vx: (b[0] - a[0]) / l * 12, vz: (b[1] - a[1]) / l * 12, sp: 12 }; }
for(const m of VD.CARS.slice(0, 4)){
  const s = Dr.car(m, { x: 0, z: 0, yaw: Math.PI / 2 }); s.u = 12; const world = { ground: () => 0, lift: () => 0 }; let maxErr = 0, maxLean = 0, maxPitch = 0, d = 0, steps = 0;
  const L = cum[cum.length - 1];
  for(let t = 0; t < 22 && d < L; t += 1 / 60){ d = Math.min(L, d + 12 / 60); const tg = at(d); Dr.stepCar(s, Dr.followInputs(s, tg), 1 / 60, world); steps++; maxErr = Math.max(maxErr, Math.hypot(s.x - tg.x, s.z - tg.z)); maxLean = Math.max(maxLean, Math.abs(s.roll)); maxPitch = Math.max(maxPitch, Math.abs(s.pitch)); assert(isFinite(s.x) && isFinite(s.yaw), m.id + ' NaN'); assert.strictEqual(s.flip, 0, m.id + ' flipped'); }
  assert(maxErr < 14, m.id + ' strays ' + maxErr.toFixed(1) + ' m'); assert(maxLean > 0.002, m.id + ' leans in corners'); assert(s.u > 3, m.id + ' keeps moving');
  // the timetable stops: the car brakes to a halt (nose dives) instead of sliding on at 12 m/s
  const stop = { x: s.x, z: s.z, vx: 0, vz: 0, sp: 0 }; let dive = 0; for(let i = 0; i < 60 * 12 && Math.abs(s.u) > 0.3; i++){ Dr.stepCar(s, Dr.followInputs(s, stop), 1 / 60, world); dive = Math.max(dive, Math.abs(s.pitch)); } assert(Math.abs(s.u) < 0.5, m.id + ' stops: ' + s.u.toFixed(1)); assert(dive > 0.001, m.id + ' pitches under braking');
  console.log(m.id, 'max error', maxErr.toFixed(1), 'm · lean', maxLean.toFixed(3), 'rad · dive', dive.toFixed(3));
}
console.log('npc-cars.test.js: all passed');
