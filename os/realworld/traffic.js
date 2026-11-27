/* REALWORLD · traffic — how the townspeople DRIVE, and how every car hits every other car. PURE (browser + Node tests), no dependencies (the cars are drive.js states).
 *
 * WHY: NPC cars used to chase a point that the timetable slid along the street-centre polyline at a constant speed (drive.js followInputs): they appeared at full speed, never queued,
 * never braked for anyone, drove through each other, through you and through parked cars. This module gives every NPC car a real DRIVER:
 *
 *   lane(route, off)     the street polyline turned into a LANE: shifted `off` m to the right of the centre line, corners rounded (quadratic Béziers), with a curvature speed limit per point.
 *   create(route, seed, model)   a driver (autopilot). Every driver is a little different (derived from `seed`): cruise speed, comfort acceleration / braking, following time-gap,
 *                        reaction time, lane position, how much the wheel and the lane position wander, and — for the careless ones — rare moments of inattention.
 *   control(ap, s, dt, t, env)   → drive.js inputs { thr, steer, brake, hand }. Speed comes from the Intelligent Driver Model (IDM): the free-road term gives a natural, gentle
 *                        acceleration from rest; the interaction term brakes behind whatever is ahead. Corners, the end of the route and slower cars all cap the speed
 *                        BEFORE they are reached (braking distance), pedals are low-pass filtered (no instant full throttle), the steering is pure pursuit on a look-ahead point
 *                        of the lane + a small human wobble. Parked cars at the kerb are passed with a sideways shift; a car stuck behind something for a while pulls out round it.
 *   collideCars(bodies)  rigid-body collisions between ANY set of cars (NPC, cops, you, other players): position correction + impulses with yaw torque, so cars shove each other
 *                        and spin, and the one that is hit gets `s.bump` (speed of the impact) for damage / camera shake.
 *   boxes(bodies, out)   the same cars as stride-8 colliders for people on foot (phys.js format).
 *
 * CONVENTIONS (as everywhere in the engine): x east, z south, yaw 0 faces −z, forward = (sin yaw, −cos yaw), right = (cos yaw, sin yaw); a positive lane offset is to the RIGHT of the direction of travel.
 * A "body" is { s, hl, hw, fixed?, id? } where s = a drive.js car state (x, z, yaw, u, v, r, D, circles). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else (root.RealWorld = root.RealWorld || {}).Traffic = root.RWTraffic = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const rng = seed => { let a = (seed | 0) ^ 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /* ---------------------------------------------------------------- lanes ---------------------------------------------------------------- */
  const LC = new WeakMap();
  function lane(route, off){
    let m = LC.get(route); if(!m) LC.set(route, m = new Map()); const key = Math.round(off * 20); let L = m.get(key); if(!L) m.set(key, L = build(route, off)); return L;
  }
  function build(pts, off){
    const P = []; for(const p of pts){ const l = P[P.length - 1]; if(!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.05) P.push([p[0], p[1]]); }
    if(!P.length) P.push([0, 0]); if(P.length < 2) P.push([P[0][0] + 0.1, P[0][1]]);
    const n = P.length, dx = [], dz = []; for(let i = 0; i < n - 1; i++){ const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) || 1; dx.push((P[i + 1][0] - P[i][0]) / l); dz.push((P[i + 1][1] - P[i][1]) / l); }
    // 1) shift every vertex to the right by `off` (mitred so the lane keeps its width round corners)
    const O = []; for(let i = 0; i < n; i++){
      const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i : n - 2, n1x = -dz[a], n1z = dx[a], n2x = -dz[b], n2z = dx[b], den = Math.max(0.35, 1 + n1x * n2x + n1z * n2z);
      let ox = (n1x + n2x) / den * off, oz = (n1z + n2z) / den * off; const ml = Math.hypot(ox, oz), mx = Math.abs(off) * 2.4; if(ml > mx){ ox *= mx / ml; oz *= mx / ml; }
      O.push([P[i][0] + ox, P[i][1] + oz]); }
    // 2) round the corners: a quadratic Bézier from `c` m before the vertex to `c` m after it (c ≤ 45 % of both neighbouring segments, ≤ 9 m)
    const Q = [O[0]]; for(let i = 1; i < n - 1; i++){
      const A = O[i - 1], B = O[i], C = O[i + 1], d1 = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, d2 = Math.hypot(C[0] - B[0], C[1] - B[1]) || 1, u1x = (B[0] - A[0]) / d1, u1z = (B[1] - A[1]) / d1, u2x = (C[0] - B[0]) / d2, u2z = (C[1] - B[1]) / d2;
      const turn = Math.acos(clamp(u1x * u2x + u1z * u2z, -1, 1)); if(turn < 0.1){ Q.push(B); continue; }
      const c = Math.min(d1 * 0.45, d2 * 0.45, 9), p0 = [B[0] - u1x * c, B[1] - u1z * c], p2 = [B[0] + u2x * c, B[1] + u2z * c];
      for(let k = 0; k <= 6; k++){ const t = k / 6, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t; Q.push([w0 * p0[0] + w1 * B[0] + w2 * p2[0], w0 * p0[1] + w1 * B[1] + w2 * p2[1]]); } }
    Q.push(O[n - 1]);
    const m = Q.length, x = new Float32Array(m), z = new Float32Array(m), cum = new Float32Array(m); for(let i = 0; i < m; i++){ x[i] = Q[i][0]; z[i] = Q[i][1]; if(i) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
    const th = new Float32Array(m); for(let i = 0; i < m - 1; i++) th[i] = Math.atan2(x[i + 1] - x[i], -(z[i + 1] - z[i])); th[m - 1] = m > 1 ? th[m - 2] : 0;
    // curvature speed limit: heading change over the next ~8 m → lateral acceleration 2.8 m/s² (a sedan is happy to take a 90° junction at ~5 m/s)
    const vlim = new Float32Array(m); let j = 0; for(let i = 0; i < m; i++){ if(j < i) j = i; while(j < m - 1 && cum[j] - cum[i] < 8) j++; const arc = Math.max(4, cum[j] - cum[i]), kap = Math.abs(wrapA(th[j] - th[i])) / arc; vlim[i] = clamp(Math.sqrt(2.8 / Math.max(kap, 1e-4)), 3.2, 60); }
    return { x, z, cum, th, vlim, n: m, len: cum[m - 1] };
  }
  function at(L, d, out){ d = clamp(d, 0, L.len); let lo = 0, hi = L.n - 1; while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(L.cum[mid] <= d) lo = mid; else hi = mid; } const s = L.cum[hi] - L.cum[lo] || 1, t = clamp((d - L.cum[lo]) / s, 0, 1), o = out || {};
    o.x = L.x[lo] + (L.x[hi] - L.x[lo]) * t; o.z = L.z[lo] + (L.z[hi] - L.z[lo]) * t; const tx = L.x[hi] - L.x[lo], tz = L.z[hi] - L.z[lo], l = Math.hypot(tx, tz) || 1; o.tx = tx / l; o.tz = tz / l; o.i = lo; return o; }
  /* nearest point on the lane to (x, z), looking only at segments i0 … i1 → { i, d (arc length), off (signed lateral distance, + = the point is right of the lane), dist } */
  function project(L, x, z, i0, i1){
    let best = 1e18, bi = i0, bt = 0; i0 = clamp(i0, 0, L.n - 2); i1 = clamp(i1, i0, L.n - 2);
    for(let i = i0; i <= i1; i++){ const ax = L.x[i], az = L.z[i], bx = L.x[i + 1] - ax, bz = L.z[i + 1] - az, l2 = bx * bx + bz * bz || 1, t = clamp(((x - ax) * bx + (z - az) * bz) / l2, 0, 1), px = ax + bx * t - x, pz = az + bz * t - z, d2 = px * px + pz * pz; if(d2 < best){ best = d2; bi = i; bt = t; } }
    const ax = L.x[bi], az = L.z[bi], bx = L.x[bi + 1] - ax, bz = L.z[bi + 1] - az, l = Math.hypot(bx, bz) || 1, qx = ax + bx * bt, qz = az + bz * bt;
    return { i: bi, d: L.cum[bi] + (L.cum[bi + 1] - L.cum[bi]) * bt, off: (x - qx) * (-bz / l) + (z - qz) * (bx / l), dist: Math.sqrt(best) };
  }
  const idxAt = (L, d) => { let lo = 0, hi = L.n - 1; while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(L.cum[mid] <= d) lo = mid; else hi = mid; } return lo; };

  /* ---------------------------------------------------------------- drivers ---------------------------------------------------------------- */
  /* create(route, seed, model): `route` = [[x, z], …] (the street centre line). Everything personal comes from the seed, so a given townsperson always drives the same way. */
  function create(route, seed, model){
    const R = rng(seed * 7919 + 13), D = model.drive, skill = 0.55 + 0.45 * R(), L = lane(route, 1.45 + 0.3 * R());
    return { route, L, D, seed, skill, hl: D.len / 2, hw: D.wid / 2,
      vc: Math.min(8.5 + 6 * R(), D.top * 0.7),                                // cruise speed, 31 – 52 km/h
      a: Math.min(1.5 + 1.2 * R(), D.accel * 0.7),                              // comfortable acceleration
      b: 2.2 + 1.6 * R(),                                                        // comfortable braking
      T: 1.0 + (1 - skill) * 1.1 + 0.3 * R(),                                    // time gap to the car in front (s)
      react: 0.25 + (1 - skill) * 0.6,                                           // reaction time (s): how stale what it sees is
      wl: 0.12 + (1 - skill) * 0.35,                                             // lane wander (m)
      sn: 0.03 + (1 - skill) * 0.09,                                             // steering wobble
      ph: [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28],
      distractEvery: skill < 0.72 ? 45 + 60 * R() : 0, distractAt: 30 + 60 * R(), distract: 0,
      i: 0, d: 0, off: 0, shift: 0, tgtShift: 0, thr: 0, brk: 0, sT: 0, gap: 1e9, lead: 0, stuck: 0, rev: 0, revSteer: 1, blocked: 0, detour: 0, detourT: 0, wait: 0,
      aDes: 0, done: false, lost: false, lat: 0, vWant: 0, lastCross: 0, tm: 0 };
  }
  /* put the driver at a fraction f (0 … 1) of its route; returns the pose (x, z, yaw) for the car state */
  function seed(ap, f){ const d = clamp(f, 0, 1) * ap.L.len, p = at(ap.L, d); ap.d = d; ap.i = p.i; ap.shift = ap.tgtShift = 0; ap.done = false; ap.lost = false; ap.stuck = 0; ap.rev = 0; ap.blocked = 0; ap.detour = 0;
    return { x: p.x, z: p.z, yaw: Math.atan2(p.tx, -p.tz), d }; }

  /* snap a driver onto its lane at the car's current position (a new trip began): returns how far off the lane the car is */
  function attach(ap, x, z){ const pr = project(ap.L, x, z, 0, ap.L.n - 2); ap.i = pr.i; ap.d = pr.d; ap.shift = ap.tgtShift = 0; ap.done = false; return pr.dist; }

  /* the lane a driver with this seed uses (the SAME lane create() gives it: same two random draws) — so a far-away car that is only drawn (no physics yet) already rides on the lane, with the lane's rounded
   * corners, and the physical car that takes over when you get near starts exactly where the drawn one was (no sideways pop, no sudden turn). */
  function laneFor(route, seed){ const R = rng(seed * 7919 + 13); R(); return lane(route, 1.45 + 0.3 * R()); }
  /* where (and which way) a car with this seed is at fraction f (0 … 1) of its route, on its own lane → { x, z, yaw } */
  function pose(route, seed, f, out){ const L = laneFor(route, seed), p = at(L, clamp(f, 0, 1) * L.len, out || {}); p.yaw = Math.atan2(p.tx, -p.tz); return p; }

  /* what is ahead? bodies = other cars { s, hl, hw, fixed } → sets ap.gap (bumper to bumper, m), ap.lead (its speed along our lane), ap.tgtShift (sideways shift to pass parked cars) */
  function sense(ap, s, bodies, t){
    const L = ap.L, f0 = Math.sin(s.yaw), f1 = -Math.cos(s.yaw), i0 = Math.max(0, ap.i - 1), i1 = idxAt(L, ap.d + 48) + 1, shiftNow = ap.shift + ap.lat;
    let gap = 1e9, lead = 0, shiftNeed = 0, blockedBy = null, oncomingLeft = false, behind = 1e9; const r0 = Math.cos(s.yaw), r1 = Math.sin(s.yaw);
    for(const b of bodies){ const o = b.s; if(o === s) continue; const dx = o.x - s.x, dz = o.z - s.z, d2 = dx * dx + dz * dz; if(d2 > 2800) continue; const fwd = dx * f0 + dz * f1; if(fwd < -1 && fwd > -18 && Math.abs(dx * r0 + dz * r1) < 2.8) behind = Math.min(behind, -fwd - ap.hl - b.hl);
      if(fwd < -(ap.hl + b.hl) * 0.8 && d2 > 36) continue;
      const pr = project(L, o.x, o.z, i0, i1); if(pr.dist > 7.5) continue; const sd = pr.d - ap.d; if(sd < -b.hl) continue;
      const th = L.th[pr.i], co = Math.cos(wrapA(o.yaw - th)), si = Math.sin(wrapA(o.yaw - th)), hwE = Math.abs(si) * b.hl + Math.abs(co) * b.hw, hlE = Math.abs(co) * b.hl + Math.abs(si) * b.hw, w = ap.hw + hwE + (ap.detour > 0 ? 0.1 : 0.3);
      const bs = o.u != null ? o.u : 0, vl = Math.max(0, bs * co);
      if(co < -0.6 && pr.off < 0 && pr.d - ap.d < 45) oncomingLeft = true;                                  // somebody is coming down the lane we would pull out into
      if(b.fixed && sd < 28 && Math.abs(pr.off) < w){                                                        // parked / still: pass it if there is room in the lane (measured against the UNSHIFTED lane, so the shift holds while we go by), else treat it as a wall
        const need = pr.off > 0 ? pr.off - w : pr.off + w;
        if(pr.off > 0 && need >= -1.0 || pr.off <= 0 && need <= 0.5){ if(Math.abs(need) > Math.abs(shiftNeed)) shiftNeed = need; continue; } }
      const here = ap.cross || 0, latSelf = sd < 7 ? here : here + (shiftNow - here) * clamp((sd - 7) / 14, 0, 1);   // imminent things are judged against where we ARE, distant ones against where we will be
      if(Math.abs(pr.off - latSelf) > w) continue;                                                           // not in our way
      const gp = sd - ap.hl - hlE;
      if(co < -0.6 && gp > 4) continue;                                                                       // oncoming in the other lane: we pass each other
      if(Math.abs(co) < 0.6 && gp > 3.5){ const right = (o.x - s.x) * Math.cos(s.yaw) + (o.z - s.z) * Math.sin(s.yaw) > 0; if(!right || ap.wait > 4) continue; }   // crossing traffic: give way to the right, otherwise go (and after a long wait go anyway)
      if(gp < gap){ gap = Math.max(0.1, gp); lead = vl; blockedBy = b; } }
    ap.gap = gap; ap.lead = lead; ap.blockedBy = blockedBy; ap.tgtShift = shiftNeed; ap.behind = behind;
    if(ap.detour > 0){ ap.tgtShift = Math.min(ap.tgtShift, -2.5); if(oncomingLeft) ap.detour = 0; }
  }

  /* one control step. s = the car's drive.js state; env = { bodies, tp (the timetable's progress along the lane, m — optional: keeps the car roughly where the shared timetable says), stopAtEnd (default true) }.
   * Returns { thr, steer, brake, hand }. */
  function control(ap, s, dt, t, env){
    const L = ap.L, D = ap.D; ap.tm += dt;
    const pr = project(L, s.x, s.z, Math.max(0, ap.i - 2), idxAt(L, ap.d + 30) + 1); ap.i = pr.i; ap.d = pr.d; ap.cross = pr.off;
    // personal rhythm: lane wander, a tiny speed wobble, rare lapses of attention
    ap.lat = ap.wl * (0.65 * Math.sin(ap.tm * 0.37 + ap.ph[0]) + 0.35 * Math.sin(ap.tm * 0.93 + ap.ph[1]));
    if(ap.distractEvery){ if(ap.distract > 0) ap.distract -= dt; else if(ap.tm > ap.distractAt){ ap.distract = 0.8 + Math.random() * 1.2; ap.distractAt = ap.tm + ap.distractEvery * (0.6 + Math.random() * 0.8); } }
    ap.sT -= dt; if(ap.sT <= 0 && !(ap.distract > 0)){ ap.sT = ap.react; sense(ap, s, env.bodies || [], t); }
    const sr = ap.detour > 0 ? 1.8 : 1.0; ap.shift += clamp(ap.tgtShift - ap.shift, -dt * sr, dt * sr);
    // desired speed: cruise (with a slow wobble), the lane's corner limits and the end of the route, each with enough distance to brake for it; the timetable pulls it back into line
    let v0 = ap.vc * (1 + 0.05 * Math.sin(ap.tm * 0.21 + ap.ph[2])); if(env.tp != null){ v0 *= clamp(1 + (env.tp - ap.d) / 90, 0.6, 1.35); }
    const j1 = idxAt(L, ap.d + 90) + 1; for(let j = ap.i + 1; j <= j1 && j < L.n; j++){ const x = Math.max(0, L.cum[j] - ap.d), vc = Math.sqrt(L.vlim[j] * L.vlim[j] + 2 * ap.b * x); if(vc < v0) v0 = vc; }
    if(ap.detour > 0) v0 = Math.min(v0, 3.8);
    // not lined up with the lane yet (a new route that points another way, a long way off it): turn at walking pace instead of ploughing on at cruise speed
    { const hd = Math.abs(wrapA(s.yaw - L.th[clamp(ap.i, 0, L.n - 1)])); if(hd > 0.7 && ap.d < L.len - 5) v0 = Math.min(v0, Math.max(2.4, 6.2 - hd * 1.3)); if(pr.dist > 3.5) v0 = Math.min(v0, 4 + Math.max(0, 8 - pr.dist) * 0.4); }
    ap.vWant = v0; const v = Math.max(0, s.u);
    let gap = ap.gap, lead = ap.lead; const toEnd = L.len - ap.d - ap.hl - 0.6; if(env.stopAtEnd !== false && toEnd < gap){ gap = Math.max(0.1, toEnd); lead = 0; }
    // IDM: free-road acceleration  a·(1 − (v/v0)⁴)  minus the interaction term  a·(s*/gap)²
    const aFree = v <= v0 ? ap.a * (1 - Math.pow(v / Math.max(v0, 0.5), 4)) : -clamp((v - v0) * 1.6, 0, ap.b * 1.5);
    let aInt = 0; if(gap < 80){ const sStar = 2 + Math.max(0, v * ap.T + v * (v - lead) / (2 * Math.sqrt(ap.a * ap.b))); aInt = -ap.a * Math.pow(sStar / Math.max(gap, 0.3), 2); }
    let aDes = clamp(aFree + aInt, -D.brake * 0.92, ap.a * 1.15); ap.aDes = aDes;
    // blocked for a while by a car that is not moving: pull out round it (if nothing is coming); cars that are stuck without a reason back up and try again
    if(v < 0.4 && gap < 7 && toEnd > 6){ ap.blocked += dt; ap.wait += dt; } else { ap.blocked = Math.max(0, ap.blocked - dt * 2); if(v > 2) ap.wait = 0; }
    if(ap.blocked > 6 && ap.blockedBy && Math.abs(ap.blockedBy.s.u || 0) < 0.6 && !ap.detour && (ap.behind || 1e9) > 12){ ap.detour = 13; ap.blocked = 0; ap.detourT = ap.tm; ap.rev = 3.6; ap.revSteer = 0; }   // back up a little for room, then pull out round it
    if(ap.detour > 0){ ap.detour -= dt; if(ap.detour <= 0) ap.detour = 0; }
    if(Math.abs(s.u) < 0.35 && aDes > 0.35 && gap > 4){ ap.stuck += dt; } else ap.stuck = Math.max(0, ap.stuck - dt);
    if(ap.rev > 0){ ap.rev -= dt; return { thr: -1, steer: ap.revSteer, brake: 0, hand: 0 }; }
    if(s.u < -0.3) return { thr: 0, steer: 0, brake: 1, hand: 0 };                                          // finish backing up before steering forward (steering is inverted while rolling backwards)
    if(ap.stuck > 2.4){ ap.stuck = 0; ap.rev = 1.3; ap.revSteer = pr.off > 0 ? 1 : -1; ap.lostN = (ap.lostN || 0) + 1; if(ap.lostN > 3) ap.lost = true; return { thr: -1, steer: ap.revSteer, brake: 0, hand: 0 }; }
    ap.done = toEnd < 3.4 && Math.abs(s.u) < 0.6 && env.stopAtEnd !== false;
    // pedals
    let thr = 0, brk = 0;
    if(aDes > 0.05){ const avail = D.accel * 1.06 * (1 - Math.min(1, (s.u / (D.top * 1.03)) ** 2)); thr = clamp(aDes / Math.max(avail, 0.5), 0, 1); }
    else if(aDes < -0.45) brk = clamp((-aDes - 0.2) / D.brake, 0, 1);
    const emergency = aDes < -D.brake * 0.6; ap.thr += (thr - ap.thr) * Math.min(1, dt * (thr > ap.thr ? 2.2 : 8)); ap.brk = emergency ? brk : ap.brk + (brk - ap.brk) * Math.min(1, dt * 6);
    // steering: pure pursuit on a point `Ld` ahead on the lane, shifted sideways by the pass-parked-cars shift and the wander, plus a human wobble
    const Ld = clamp(3 + 0.55 * Math.abs(s.u), 4.5, 16), p = at(L, ap.d + Ld), lat = ap.shift + ap.lat, tx = p.x - p.tz * lat, tz = p.z + p.tx * lat, dx = tx - s.x, dz = tz - s.z;
    const fw = dx * Math.sin(s.yaw) - dz * Math.cos(s.yaw), lt = dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw), err = Math.atan2(lt, fw);
    // a (near) U-turn: the target is straight behind, so the sign of the error is a coin toss and the wheel would flip left/right. Commit to ONE direction — towards the lane — until the car has come round.
    if(Math.abs(err) > 2.3 && ap.d + Ld < L.len - 0.5){ if(!ap.uDir) ap.uDir = pr.off >= 0 ? -1 : 1; } else if(Math.abs(err) < 1.5 || ap.d + Ld >= L.len - 0.5) ap.uDir = 0;
    const steer = ap.uDir ? ap.uDir : clamp(err * 1.9 + ap.sn * (0.6 * Math.sin(ap.tm * 0.9 + ap.ph[3]) + 0.4 * Math.sin(ap.tm * 2.3 + ap.ph[0])), -1, 1);
    const hold = ap.done || (v < 0.15 && aDes < 0);
    return { thr: ap.thr < 0.02 ? 0 : ap.thr, steer, brake: hold ? 1 : (ap.brk < 0.02 ? 0 : ap.brk), hand: ap.done ? 1 : 0 };
  }

  /* ---------------------------------------------------------------- car ↔ car collisions ---------------------------------------------------------------- */
  const REST = 0.22;
  const fwdOf = s => [Math.sin(s.yaw), -Math.cos(s.yaw)], rgtOf = s => [Math.cos(s.yaw), Math.sin(s.yaw)];
  function vel(s, rx, rz){                                                                // world velocity of the point at offset (rx, rz) from the car's centre
    const f = fwdOf(s), r = rgtOf(s), a = rx * f[0] + rz * f[1], b = rx * r[0] + rz * r[1], u = s.u || 0, v = s.v || 0, w = s.r || 0;
    return [u * f[0] + v * r[0] + w * (a * r[0] - b * f[0]), u * f[1] + v * r[1] + w * (a * r[1] - b * f[1])];
  }
  function circlesOf(b){ const s = b.s, f = fwdOf(s), c = s.circles || [[0, b.hw]], out = []; for(const k of c) out.push([s.x + f[0] * k[0], s.z + f[1] * k[0], k[1]]); return out; }
  /* resolve every overlapping pair once per call. A body with `fixed` (parked / not simulated here) never moves. Returns the number of contacts. */
  function collideCars(bodies){
    let n = 0; const m = bodies.length;
    for(let i = 0; i < m; i++){ const A = bodies[i], sa = A.s; for(let j = i + 1; j < m; j++){ const B = bodies[j], sb = B.s;
      if(A.fixed && B.fixed) continue; const dx = sa.x - sb.x, dz = sa.z - sb.z, reach = A.hl + B.hl + A.hw + B.hw; if(dx * dx + dz * dz > reach * reach) continue;
      const ca = circlesOf(A), cb = circlesOf(B); let pen = 0, nx = 0, nz = 0, px = 0, pz = 0;
      for(const p of ca) for(const q of cb){ const ex = p[0] - q[0], ez = p[1] - q[1], d = Math.hypot(ex, ez), pe = p[2] + q[2] - d; if(pe > pen){ pen = pe; if(d > 1e-4){ nx = ex / d; nz = ez / d; } else { const l = Math.hypot(dx, dz) || 1; nx = dx / l; nz = dz / l; } px = q[0] + nx * q[2]; pz = q[1] + nz * q[2]; } }
      if(pen <= 0) continue; n++;
      const mA = A.fixed ? 0 : (sa.D ? sa.D.mass : 1500), mB = B.fixed ? 0 : (sb.D ? sb.D.mass : 1500), iA = mA ? 1 / mA : 0, iB = mB ? 1 / mB : 0, wA = iA / (iA + iB || 1), wB = 1 - wA, push = pen + 0.02;
      if(!A.fixed){ sa.x += nx * push * wA; sa.z += nz * push * wA; } if(!B.fixed){ sb.x -= nx * push * wB; sb.z -= nz * push * wB; }
      const rAx = px - sa.x, rAz = pz - sa.z, rBx = px - sb.x, rBz = pz - sb.z, vA = vel(sa, rAx, rAz), vB = vel(sb, rBx, rBz), vn = (vA[0] - vB[0]) * nx + (vA[1] - vB[1]) * nz;
      if(vn >= 0) continue;
      const IA = A.fixed ? 0 : 1 / (sa.I || (mA * 3)), IB = B.fixed ? 0 : 1 / (sb.I || (mB * 3)), cA = rAx * nz - rAz * nx, cB = rBx * nz - rBz * nx, den = iA + iB + cA * cA * IA + cB * cB * IB || 1, imp = -(1 + REST) * vn / den;
      const apply = (s, k, inv, I, c, rx, rz) => { if(!inv) return; const dvx = nx * imp * inv * k, dvz = nz * imp * inv * k, f = fwdOf(s), r = rgtOf(s); s.u += dvx * f[0] + dvz * f[1]; s.v += dvx * r[0] + dvz * r[1]; s.r += imp * c * I * k; s.r = clamp(s.r, -3.5, 3.5); };
      apply(sa, 1, iA, IA, cA, rAx, rAz); apply(sb, -1, iB, IB, cB, rBx, rBz);
      if(!A.fixed) sa.bump = Math.max(sa.bump || 0, -vn); if(!B.fixed) sb.bump = Math.max(sb.bump || 0, -vn);
      if(sa.speed !== undefined) sa.speed = sa.u; if(sb.speed !== undefined) sb.speed = sb.u; } }
    return n;
  }
  /* the bodies as stride-8 colliders [0, x, z, halfWidth, halfLength, cos, sin, top] for people on foot; returns how many were written (out must hold 8 floats per body) */
  function boxes(bodies, out, ground){ let n = 0; for(const b of bodies){ if((n + 1) * 8 > out.length) break; const s = b.s, o = n * 8, y = ground ? ground(s.x, s.z) : 0; out[o] = 0; out[o + 1] = s.x; out[o + 2] = s.z; out[o + 3] = b.hw + 0.05; out[o + 4] = b.hl + 0.05; out[o + 5] = Math.cos(s.yaw); out[o + 6] = Math.sin(s.yaw); out[o + 7] = y + 1.5; n++; } return n; }

  return { lane, laneFor, pose, at, project, create, seed, attach, control, sense, collideCars, boxes, rng };
});
