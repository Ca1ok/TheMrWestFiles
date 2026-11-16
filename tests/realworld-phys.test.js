/* the player controller's collision world: walls, stairs, upper floors, ceilings, step-up, glue-down.  node tests/realworld-phys.test.js */
const assert = require('assert'); const Phys = require('../os/realworld/phys.js');
const box = (x0, z0, x1, z1, y0, y1) => [0, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 1, 0, y0, y1, 0];
const set10 = rows => ({ a: Float32Array.from(rows.flat()), st: 10 }), set8 = rows => ({ a: Float32Array.from(rows.flat()), st: 8 });
const mk = (x, z, y) => ({ x, z, y: y || 0, vx: 0, vz: 0, vy: 0, grounded: true });
const run = (P, env, vx, vz, sec, jumpAt) => { const dt = 1 / 60; for(let t = 0; t < sec; t += dt){ P.vx = vx; P.vz = vz; env.jump = jumpAt !== undefined && t >= jumpAt && t < jumpAt + dt ? 5.6 : 0; Phys.step(P, dt, env); } return P; };
const env = (sets, extra) => Object.assign({ sets, disabled: null, ground: () => 0, grav: 17, jump: 0 }, extra || {});

// 1. a wall stops you, a gap lets you through (a doorway)
{ const wall = set10([box(-10, 5, -1, 5.4, -1, 4), box(1, 5, 10, 5.4, -1, 4)]), P = run(mk(-4, 0), env([wall]), 0, 4, 3); assert(P.z < 4.7, 'wall blocks, z=' + P.z);
  const Q = run(mk(0, 0), env([wall]), 0, 4, 3); assert(Q.z > 8, 'doorway passable, z=' + Q.z); }
// 2. stairs: 15 treads of 0.193 rise / 0.28 run climbed by just walking; ends on the upper floor
const rise = 2.9, N = 15, tr = 0.28, rows = []; for(let i = 0; i < N; i++) rows.push(box(2, 8 - (i + 1) * tr, 3.1, 8 - i * tr, -0.2, (i + 1) * rise / N));
// upper slab at y=2.9 with a hole over the flight (x 2..3.1, z 3.8..8); slab pieces: everything else in a 10 × 10 room
const slab = [box(0, 0, 10, 3.8, 2.65, 2.9), box(0, 3.8, 2, 8.2, 2.65, 2.9), box(3.1, 3.8, 10, 8.2, 2.65, 2.9), box(0, 8.2, 10, 10, 2.65, 2.9)], floor0 = box(0, 0, 10, 10, -0.3, 0);
const stairs = set10(rows.concat(slab, [floor0]));
{ const P = run(mk(2.55, 8.6), env([stairs]), 0, -1.6, 3.4); assert(Math.abs(P.y - 2.9) < 0.02, 'reached the upper floor, y=' + P.y); assert(P.z < 3.8, 'ended on the slab, z=' + P.z); }
// walking down glues to the steps (never airborne for long)
{ const P = mk(2.55, 3.0, 2.9), e = env([stairs]); let air = 0; for(let t = 0; t < 7; t += 1 / 60){ P.vx = 0; P.vz = 1.6; Phys.step(P, 1 / 60, e); if(!P.grounded) air++; } assert(P.y < 0.05, 'came back down, y=' + P.y); assert(air < 25, 'glued to the stairs on the way down, airborne frames=' + air); }
// 3. under the slab you walk freely (it starts above your head) and a jump bumps it
{ const P = run(mk(6, 6), env([stairs]), 0, 0, 0.5); assert(P.y === 0); run(P, env([stairs]), 0, 0, 1, 0); assert(P.y <= 0.01, 'back on the ground'); const Q = mk(6, 6), e = env([stairs]); let hi = 0; for(let t = 0; t < 1; t += 1 / 60){ e.jump = t < 1 / 60 ? 9 : 0; Phys.step(Q, 1 / 60, e); hi = Math.max(hi, Q.y); } assert(hi + Phys.HEAD <= 2.65 + 1e-6, 'head bumps the slab, apex ' + hi);
  const W = run(mk(6, 6), env([stairs]), 3, 0, 1.5); assert(W.x > 8, 'free walking under the slab'); }
// 4. from above you fall through the hole to the ground floor, but stand on the slab elsewhere
{ const P = mk(2.5, 6, 2.9), e = env([stairs]); P.grounded = true; run(P, e, 0, 0, 1.5); assert(P.y < 2.0 && P.y > 0.9, 'dropped through the stairwell hole onto a tread, y=' + P.y);
  const Q = mk(6, 2, 2.9); run(Q, e, 0, 0, 1); assert(Math.abs(Q.y - 2.9) < 1e-6, 'stands on the slab'); }
// 5. street level: a kerb (0.3 m) is stepped over, a 0.45 m bench seat can be stood on after a jump; a 3 m wall can't; terrain slope followed
{ const e = env([set8([[0, 0, 4, 0.5, 5, 1, 0, 0.3]])]); const P = run(mk(0, 0), e, 0, 0, 0.1); P.x = -3; P.z = 4; P.y = 0; run(P, e, 3, 0, 2); assert(P.x > 3, 'kerb walked over'); assert(Math.abs(P.y) < 1e-6);
  const e2 = env([set8([[0, 0, 4, 0.5, 5, 1, 0, 3]])]); const Q = mk(-3, 4); run(Q, e2, 3, 0, 2); assert(Q.x < -0.5, 'a wall 3 m high blocks, x=' + Q.x);
  const e3 = env([], { ground: (x, z) => 0.1 * x }); const R = mk(0, 0, 0); run(R, e3, 3, 0, 2); assert(Math.abs(R.y - 0.1 * R.x) < 0.02, 'follows the terrain (up)'); run(R, e3, -3, 0, 2); assert(Math.abs(R.y - 0.1 * R.x) < 0.03, 'follows the terrain (down)'); assert(R.grounded); }
// 6. a hollow shell replaces the solid box: with `disabled` the solid is ignored, the shell collides
{ const solid = set8([[0, 0, 0, 5, 5, 1, 0, 20]]), shell = set10([box(-5, -5, -1, -4.6, -1, 20), box(1, -5, 5, -4.6, -1, 20), box(-5, -5, -4.6, 5, -1, 20), box(-5, 4.6, 5, 5, -1, 20)]); const e = env([solid, shell], { disabled: [{ x: 0, z: 0 }] });
  const P = mk(0, -8); run(P, e, 0, 3, 1.5); assert(P.z > -4, 'walked in through the gap, z=' + P.z); run(P, e, 0, 3, 3); assert(P.z < 4.7, 'back wall holds, z=' + P.z);
  const Q = mk(3, -8); run(Q, e, 0, 3, 3); assert(Q.z < -4.9, 'shell wall blocks outside the gap, z=' + Q.z);
  const f = env([solid, shell]); const S = mk(0, -8); run(S, f, 0, 3, 3); assert(S.z < -5.2, 'without `disabled` the solid box wins'); }
// 7. speed: a worst-case query (900 colliders) stays far below a frame budget
{ const rows2 = []; for(let i = 0; i < 900; i++) rows2.push([0, i * 3 % 300, i * 7 % 300, 1.5, 1.5, 1, 0, 8]); const s = set8(rows2), P = mk(150, 150), e = env([s]), t0 = process.hrtime.bigint(); for(let i = 0; i < 2000; i++){ P.vx = 2; P.vz = 1; Phys.step(P, 1 / 60, e); } const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 2000; assert(ms < 0.5, 'step ' + ms.toFixed(3) + ' ms'); console.log('realworld-phys ok · worst-case step ' + ms.toFixed(3) + ' ms with 900 colliders'); }
