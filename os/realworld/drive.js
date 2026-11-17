/* REALWORLD · drive — vehicle physics for cars and planes. PURE (browser + Node tests), no dependencies. Numbers come from data/vehicle-data.js (`drive` / `fly` / `top`).
 *
 * CONVENTIONS (the same as people and NPC cars everywhere in the engine): world x east, z south, y up; yaw 0 faces −z, forward = (sin yaw, −cos yaw), right = (cos yaw, sin yaw), so a POSITIVE yaw
 * turns to the RIGHT. Pitch > 0 = nose up. Roll > 0 = right wing / right side down.
 *
 * world = { ground(x, z) → terrain height, push(x, z, y, r) → { x, z } the circle (x, z, radius r, feet at height y) moved out of whatever solid it overlaps (RealWorld.Phys.resolve) }.
 *
 * CAR  (stepCar): a planar rigid body with a "bicycle" tyre model. Velocity lives in the car's own frame (u forward, v sideways, r yaw rate). Each axle makes a sideways force that rises with
 *   slip and SATURATES at grip·g (tanh), so a car understeers when you turn too hard, slides when you pull the handbrake (rear grip ×0.3) and cannot turn tighter than its tyres allow.
 *   Engine: a = accel·(1 − (u/top)²). Brakes are limited by grip too. Reverse is slow. Steering lock shrinks with speed (it can never ask for more than the tyres give).
 * PLANE (stepPlane): a point mass with a real orientation (rotation matrix, no gimbal lock), thrust, lift/drag from the wing (CL(α) with a stall), weight, air density falling with altitude, a
 *   ground mode (wheels: rolling friction, brakes, nose-wheel steering, rotation only with airspeed) and crash rules (hard landing, wing strike, hitting a building).
 *   The stick commands an ANGLE OF ATTACK (what a real pilot's elevator does): centred = trimmed, pulled = more lift until the wing stalls at low speed. Roll and the horizontal part of lift turn
 *   the plane; the nose weathervanes along the flight path; with `assist` (default) a released stick levels the wings.
 * Everything runs at a fixed 1/120 s step inside stepX (callers pass the frame time). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else (root.RealWorld = root.RealWorld || {}).Drive = root.RWDrive = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const G = 9.81, RHO0 = 1.225, DT = 1 / 120, TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, sgn = v => v < 0 ? -1 : 1, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------------------------------------------------------------- shared: collision circles ---------------------------------------------------------------- */
  /* move the body out of the world; returns the correction (dx, dz) it took (0 when free). `circles` = [[forwardOffset, radius], …] along the heading */
  function collide(s, world, circles, yFeet){
    if(!world || !world.push) return 0;
    const f0x = Math.sin(s.yaw), f0z = -Math.cos(s.yaw); let tx = 0, tz = 0;
    for(let pass = 0; pass < 2; pass++) for(let i = 0; i < circles.length; i++){
      const o = circles[i][0], r = circles[i][1], cx = s.x + tx + f0x * o, cz = s.z + tz + f0z * o, p = world.push(cx, cz, yFeet, r), dx = p.x - cx, dz = p.z - cz;
      if(dx * dx + dz * dz > 1e-10){ tx += dx; tz += dz; }
    }
    const d = Math.hypot(tx, tz); if(d < 1e-6) return 0;
    s.x += tx; s.z += tz; s.nx = tx / d; s.nz = tz / d; return d;
  }

  /* ---------------------------------------------------------------- CAR ---------------------------------------------------------------- */
  function car(model, pose){
    const D = model.drive, L = D.len, W = L * 0.62;
    return { kind: 'car', model, D, W, a: W * 0.5, b: W * 0.5, I: D.mass * (L * L + D.wid * D.wid) / 12 * 1.15, x: pose.x, z: pose.z, yaw: pose.yaw || 0, y: 0, pitch: 0, roll: 0,
      u: 0, v: 0, r: 0, steer: 0, speed: 0, ax: 0, ay: 0, hit: 0, nx: 0, nz: 0, slide: 0, rpm: 0, circles: [[-L * 0.32, D.wid * 0.5], [0, D.wid * 0.5], [L * 0.32, D.wid * 0.5]] };
  }
  /* inp = { thr: −1..1 (+ gas, − brake then reverse), steer: −1..1 (+ right), brake: 0..1, hand: 0|1 } */
  function stepCar(s, inp, frame, world){
    let left = Math.min(frame, 0.1); s.hit = 0;
    while(left > 1e-6){ const dt = Math.min(DT, left); left -= dt; carTick(s, inp, dt, world); }
    return s;
  }
  function carTick(s, inp, dt, world){
    const D = s.D, m = D.mass, mu = D.grip * 0.95 * G, thr = clamp(inp.thr || 0, -1, 1), brk = clamp(inp.brake || 0, 0, 1), hand = inp.hand ? 1 : 0;
    const f0 = Math.sin(s.yaw), f1 = -Math.cos(s.yaw), r0 = Math.cos(s.yaw), r1 = Math.sin(s.yaw);
    // steering lock: never more than the tyres can hold at this speed, and a lazy wheel at speed
    const au = Math.abs(s.u), dMax = Math.min(0.62 * D.turn ** 0.5, 1.25 * mu * s.W / Math.max(au * au, 4));
    s.steer += (clamp(inp.steer || 0, -1, 1) - s.steer) * Math.min(1, dt * 9); const del = s.steer * dMax, cd = Math.cos(del), sd = Math.sin(del);
    // longitudinal: engine (power falls off towards top speed), brake, handbrake, rolling resistance
    let ax = 0, braking = 0;
    if(thr > 0.01){ if(s.u < -0.6) braking = Math.max(braking, thr); else ax += D.accel * 1.06 * thr * (1 - Math.min(1, (s.u / (D.top * 1.03)) ** 2)); }
    else if(thr < -0.01){ if(s.u > 0.6) braking = Math.max(braking, -thr); else ax -= 0.4 * D.accel * -thr * (1 - Math.min(1, (s.u / -9) ** 2)); }
    braking = Math.max(braking, brk);
    let decel = 0; if(braking > 0 || hand){ decel = Math.min(D.brake * braking + (hand ? 0.22 * D.brake : 0), mu * 1.05); }
    decel += 0.2 + 0.0009 * s.u * s.u * 0.1;                       // engine braking + rolling + a little air drag
    // lateral: front and rear axle forces (bicycle model)
    const vf = s.v + s.a * s.r, vr = s.v - s.b * s.r, N = m * G * 0.5;
    const vlongF = s.u * cd + vf * sd, vlatF = -s.u * sd + vf * cd, den = f => Math.max(Math.abs(f), 2.2);
    const driveFrac = clamp(Math.abs(ax) / (D.accel + 1e-6), 0, 1), gripF = Math.sqrt(1 - 0.35 * driveFrac * driveFrac) * (1 - 0.25 * braking), gripR = (hand ? 0.3 : 1) * Math.sqrt(1 - 0.35 * driveFrac * driveFrac) * (1 - 0.12 * braking);
    const FyF = -mu * N * gripF * Math.tanh(3.2 * vlatF / den(vlongF)), FyR = -mu * N * gripR * Math.tanh(3.2 * vr / den(s.u));
    // body-frame forces: engine acts along the body, tyre side forces along each wheel's own lateral axis (front one is turned by `del`)
    const Fx = m * ax - FyF * sd, Fyb = FyF * cd + FyR;
    let du = Fx / m + s.v * s.r, dv = Fyb / m - s.u * s.r; const dr = (s.a * FyF * cd - s.b * FyR) / s.I;
    // braking / resistance never push through zero speed
    if(decel > 0){ const dd = decel * dt, dir = Math.abs(s.u) > 1e-3 ? sgn(s.u) : (ax !== 0 ? sgn(ax) : 1); if(Math.abs(s.u) <= dd && ax * dir <= 0.01){ s.u = 0; du = 0; } else du -= dir * decel; }
    s.ax += (du - s.ax) * Math.min(1, dt * 12); s.ay += (dv + s.u * s.r - s.ay) * Math.min(1, dt * 12);
    s.u += du * dt; s.v += dv * dt; s.r += dr * dt; s.r *= 1 - Math.min(0.5, 0.35 * dt);   // a little yaw damping
    if(Math.abs(s.u) < 0.02 && !thr && Math.abs(s.v) < 0.05){ s.u = 0; s.v = 0; s.r *= 0.9; }
    s.yaw = wrapA(s.yaw + s.r * dt); const c0 = Math.sin(s.yaw), c1 = -Math.cos(s.yaw), d0 = Math.cos(s.yaw), d1 = Math.sin(s.yaw);
    s.x += (s.u * c0 + s.v * d0) * dt; s.z += (s.u * c1 + s.v * d1) * dt;
    // the world pushes back: bumpers are inelastic, the car loses its speed into the wall and scrubs yaw
    const g0 = world ? world.ground : null; s.y = g0 ? g0(s.x, s.z) : 0;
    const dd = collide(s, world, s.circles, s.y);
    if(dd > 0){ let wx = s.u * c0 + s.v * d0, wz = s.u * c1 + s.v * d1; const vn = wx * s.nx + wz * s.nz;
      if(vn < 0){ wx -= 1.15 * vn * s.nx; wz -= 1.15 * vn * s.nz; s.hit = Math.max(s.hit, -vn); s.u = wx * c0 + wz * c1; s.v = wx * d0 + wz * d1; s.r *= 0.7; } }
    s.speed = s.u; s.slide = Math.min(1, Math.abs(s.v) / 6);
    // ride attitude: follow the ground under the wheels + lean into corners and dive under braking
    if(g0){ const L2 = s.D.len * 0.45, W2 = s.D.wid * 0.45, hF = g0(s.x + c0 * L2, s.z + c1 * L2), hB = g0(s.x - c0 * L2, s.z - c1 * L2), hR = g0(s.x + d0 * W2, s.z + d1 * W2), hL = g0(s.x - d0 * W2, s.z - d1 * W2);
      const tp = Math.atan2(hF - hB, 2 * L2) - clamp(s.ax / G, -1, 1) * 0.035, tr = Math.atan2(hR - hL, 2 * W2) + clamp(s.ay / G, -1.2, 1.2) * 0.05; s.pitch += (tp - s.pitch) * Math.min(1, dt * 8); s.roll += (tr - s.roll) * Math.min(1, dt * 8); }
  }

  /* ---------------------------------------------------------------- PLANE ---------------------------------------------------------------- */
  const CLMAX = 1.6, AS = 0.28, CL0 = 0.18, CLA = (CLMAX - CL0) / AS, KIND = 0.045;             // stall angle of attack 0.28 rad (16°)
  function planeParams(model){
    const F = model.fly, vmax = model.top / 3.6, Vs = F.stall, m = F.mass, S = 2 * m * G / (RHO0 * Vs * Vs * CLMAX);
    const vr = F.vr, dTo = F.runway * 0.45, aMean = vr * vr / (2 * dTo), Tstat = m * (aMean + 0.35) / 0.85;
    const Tv = (V) => Tstat * Math.max(0, 1 - V / (1.35 * vmax)), qv = 0.5 * RHO0 * vmax * vmax, clv = 2 * m * G / (RHO0 * vmax * vmax * S);
    const CD0 = Math.max(0.012, Tv(vmax) / (qv * S) - KIND * clv * clv);
    // trim: the angle of attack of level flight at cruise speed
    const clc = 2 * m * G / (RHO0 * F.cruise * F.cruise * S), aTrim = clamp((clc - CL0) / CLA, -0.05, 0.2);
    return { S, Tstat, vmax, Vs, vr, CD0, aTrim, m, ceiling: F.ceiling, cruise: F.cruise, I: m, qmax: 0.9 + 12 / Math.sqrt(m / 500) * 0.06, pmax: 1.5 };
  }
  const CL = a => { if(a >= -AS && a <= AS) return CL0 + CLA * a; const edge = a > 0 ? CLMAX : CL0 - CLA * AS; const over = Math.abs(a) - AS; return a > 0 ? CLMAX * (1 - 0.55 * sm(0, 0.14, over)) : edge * (1 - 0.55 * sm(0, 0.14, over)); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function basis(yaw, pitch, roll){
    const f = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)], r0 = [Math.cos(yaw), 0, Math.sin(yaw)], u0 = cross(r0, f), cr = Math.cos(roll), sr = Math.sin(roll);
    return { f, r: [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr], u: [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr] };
  }
  function euler(B){
    const yaw = Math.atan2(B.f[0], -B.f[2]), pitch = Math.asin(clamp(B.f[1], -1, 1)), r0 = [Math.cos(yaw), 0, Math.sin(yaw)], u0 = cross(r0, B.f);
    return { yaw, pitch, roll: Math.atan2(-dot(B.r, u0), dot(B.r, r0)) };
  }
  function rotate(v, k, ang){ const c = Math.cos(ang), s = Math.sin(ang), kv = dot(k, v), kx = cross(k, v); return [v[0] * c + kx[0] * s + k[0] * kv * (1 - c), v[1] * c + kx[1] * s + k[1] * kv * (1 - c), v[2] * c + kx[2] * s + k[2] * kv * (1 - c)]; }

  function plane(model, pose){
    const F = model.fly, P = planeParams(model), B = basis(pose.yaw || 0, 0, 0);
    return { kind: 'plane', model, F, P, B, x: pose.x, z: pose.z, y: pose.y == null ? 0 : pose.y, vx: 0, vy: 0, vz: 0, yaw: pose.yaw || 0, pitch: 0, roll: 0, throttle: 0, onGround: true, speed: 0, ias: 0, alt: 0, vs: 0, aoa: 0,
      stalled: false, stallWarn: 0, crashed: null, hit: 0, nx: 0, nz: 0, gdot: 0, gamma: 0, touch: 0, g: 1, circles: [[-F.len * 0.34, 1.1], [0, 1.3], [F.len * 0.34, 1.1]] };
  }
  /* inp = { thr: 0..1 (throttle lever), pitch: −1..1 (+ nose up), roll: −1..1 (+ right wing down), yaw: −1..1 (+ right), brake: 0..1, assist: bool } */
  function stepPlane(s, inp, frame, world){
    let left = Math.min(frame, 0.1); s.hit = 0;
    while(left > 1e-6 && !s.crashed){ const dt = Math.min(DT, left); left -= dt; planeTick(s, inp, dt, world); }
    return s;
  }
  function planeTick(s, inp, dt, world){
    const P = s.P, B = s.B, F = s.F, g0 = world ? world.ground : () => 0, gnd = g0(s.x, s.z);
    s.throttle += clamp(clamp(inp.thr == null ? 0 : inp.thr, 0, 1) - s.throttle, -dt * 0.9, dt * 0.9);
    const rho = RHO0 * Math.exp(-s.y / 8500), rr = rho / RHO0, vel = [s.vx, s.vy, s.vz], V = Math.hypot(s.vx, s.vy, s.vz), Vh = V > 0.5 ? [s.vx / V, s.vy / V, s.vz / V] : B.f;
    // flow angles: α (nose above the airflow, + = more lift), β (airflow from the right)
    const vf = dot(vel, B.f), vu = dot(vel, B.u), vr = dot(vel, B.r), alpha = V > 3 ? Math.atan2(-vu, Math.max(vf, 0.5)) : 0, beta = V > 3 ? Math.atan2(vr, Math.max(vf, 0.5)) : 0;
    const q = 0.5 * rho * V * V, auth = clamp(V / (0.85 * P.Vs), 0, 1) ** 1.5 * (0.35 + 0.65 * Math.min(1, rr * 2));
    // stall: too slow with the stick back (or past the critical angle) → the wing lets go and the nose drops until speed is back
    const pull = clamp(inp.pitch || 0, -1, 1), contact = s.onGround;
    if(!contact){ if(!s.stalled && (V < 1.04 * P.Vs && pull > 0.5 || alpha > AS * 1.15)) s.stalled = true; else if(s.stalled && V > 1.15 * P.Vs && alpha < AS * 0.8) s.stalled = false; } else s.stalled = false;
    s.stallWarn = !contact && (s.stalled || V < 1.2 * P.Vs && pull > 0.3 || alpha > AS * 0.97) ? 1 : 0;
    // ---- forces ----
    const cl = CL(alpha) * (s.stalled ? 0.4 : 1), cd = P.CD0 + KIND * cl * cl + (Math.abs(alpha) > AS ? 0.9 * Math.sin(alpha) ** 2 : 0) + (contact ? 0.004 : 0);
    const lift = q * P.S * cl, drag = q * P.S * cd, side = -q * P.S * 0.9 * beta * 0.6;
    const fade = clamp((P.ceiling - s.y) / 600, 0, 1), thrust = P.Tstat * s.throttle * Math.max(0, 1 - V / (1.35 * P.vmax)) * Math.pow(Math.max(rr, 0.05), 0.75) * fade;
    let L = nrm(cross(B.r, Vh)); if(V < 3) L = B.u;
    let ax = (B.f[0] * thrust + L[0] * lift - Vh[0] * drag + B.r[0] * side) / P.m, ay = (B.f[1] * thrust + L[1] * lift - Vh[1] * drag + B.r[1] * side) / P.m - G, az = (B.f[2] * thrust + L[2] * lift - Vh[2] * drag + B.r[2] * side) / P.m;
    // ---- attitude ----
    let qr, pr, yr;                                                    // body rates: about right axis (pitch up +), forward axis (right wing down +), up axis (+ = nose LEFT)
    const gam = V > 5 ? Math.asin(clamp(s.vy / V, -1, 1)) : 0; s.gdot += ((gam - s.gamma) / dt - s.gdot) * Math.min(1, dt * 20); s.gamma = gam;
    // stick centred = hold 1 g (level flight at any speed the wing can carry; below stall speed it simply cannot, and sinks). Pull = more angle of attack up to just under the stall, push = less.
    const a1g = inp.assist === false ? P.aTrim : clamp((P.m * G / Math.max(0.55, B.u[1]) / Math.max(q * P.S, 1) - CL0) / CLA, -0.02, AS * 0.9);   // more lift while banked, so a turn does not lose height
    const lowSpeed = contact ? 0 : clamp((1.22 * P.Vs - V) / (0.22 * P.Vs), 0, 1) * 0.09 * (1 - clamp((pull - 0.6) / 0.3, 0, 1));                  // speed protection: the nose eases down by itself as the speed runs out
    const aT = s.stalled ? -0.12 : (pull >= 0 ? a1g + pull * (AS * 0.93 - a1g) - lowSpeed : a1g + pull * (a1g + 0.14) - lowSpeed);
    qr = clamp((aT - alpha) * 4.5 + s.gdot, -P.qmax * 1.6, P.qmax * 1.6) * auth + (s.stalled ? -0.5 * (1 - auth) : 0);
    const rollIn = clamp(inp.roll || 0, -1, 1); pr = rollIn * P.pmax * auth;
    if(Math.abs(rollIn) < 0.04 && inp.assist !== false) pr += -clamp(s.roll, -1.3, 1.3) * 0.9 * auth;                 // wings-level assist
    yr = -beta * 2.2 * auth - clamp(inp.yaw || 0, -1, 1) * 0.45 * auth;
    if(s.stalled) pr += Math.sin(s.t0 = (s.t0 || 0) + dt * 5) * 0.5;
    // ---- ground mode ----
    if(contact){
      const E = euler(B), sp = vf, ang = Math.min(1, V / 8);
      // wheels: no sideways slip, nose-wheel steering, rolling friction and brakes
      const brk = clamp(inp.brake || 0, 0, 1), roll = 0.03 * G + brk * 0.55 * G * (1 - clamp((lift) / (P.m * G), 0, 1)), sdir = sp >= 0 ? 1 : -1;
      const steer = clamp(inp.yaw || 0, -1, 1) + clamp(inp.roll || 0, -1, 1) * 0.8;
      let yawRate = clamp(steer, -1, 1) * (0.5 - 0.3 * sm(10, 45, Math.abs(sp))) * Math.min(1, Math.abs(sp) / 6) * sdir;
      let nx = E.yaw + yawRate * dt, th = E.pitch;
      const rotOK = V > 0.65 * P.vr, th0 = th, target = rotOK ? clamp(pull, -1, 1) * 0.25 : 0;
      th += clamp(target - th, -0.5 * dt - Math.abs(pull) * 0.35 * dt * (rotOK ? 1 : 0), 0.35 * dt * auth * 2.5);
      th = clamp(th, 0, 0.3); if(!rotOK) th = Math.max(0, th - 0.4 * dt);
      const nb = basis(nx, th, 0); B.f = nb.f; B.r = nb.r; B.u = nb.u;
      // velocity follows the nose on the ground (wheels hold the line), thrust − rolling friction − brakes along it
      const fwd = [nb.f[0], 0, nb.f[2]], fl = Math.hypot(fwd[0], fwd[2]) || 1; fwd[0] /= fl; fwd[2] /= fl;
      const spH = s.vx * fwd[0] + s.vz * fwd[2];                  // speed along the (horizontal) heading, not along the tilted nose
      let a = (thrust * Math.cos(th) - drag) / P.m - roll; let sp2 = Math.max(0, spH + a * dt); if(spH > 0 && sp2 < 0.05 && s.throttle < 0.02 && brk > 0) sp2 = 0;
      if(spH <= 0.02 && thrust < P.m * 0.2) sp2 = Math.max(0, sp2 - 0.4 * dt);
      s.vx = fwd[0] * sp2; s.vz = fwd[2] * sp2; s.vy = 0;
      // lift-off: the wing holds the weight and the nose is up
      if(lift * Math.cos(th) > P.m * G * 1.01 && th > 0.02 && sp2 > 0.9 * P.vr * 0.8){ s.onGround = false; s.vy = Math.max(s.vy, 0.5); s.touch = 0; }
      s.x += s.vx * dt; s.z += s.vz * dt; s.y = g0(s.x, s.z); if(!s.onGround) s.y += 0.05;
      const E2 = euler(B); s.yaw = E2.yaw; s.pitch = E2.pitch; s.roll = 0;
    } else {
      // rotation vector in the world = roll about the forward axis + pitch about the right axis + yaw about the up axis (yr > 0 turns the nose LEFT)
      const wr = [B.f[0] * pr + B.r[0] * qr + B.u[0] * yr, B.f[1] * pr + B.r[1] * qr + B.u[1] * yr, B.f[2] * pr + B.r[2] * qr + B.u[2] * yr], wlen = Math.hypot(wr[0], wr[1], wr[2]);
      if(wlen > 1e-9){ const k = [wr[0] / wlen, wr[1] / wlen, wr[2] / wlen], ang = wlen * dt; B.f = rotate(B.f, k, ang); B.r = rotate(B.r, k, ang); B.u = rotate(B.u, k, ang); }
      B.f = nrm(B.f); let r2 = B.r, d = dot(r2, B.f); r2 = nrm([r2[0] - d * B.f[0], r2[1] - d * B.f[1], r2[2] - d * B.f[2]]); B.r = r2; B.u = cross(B.r, B.f);
      s.vx += ax * dt; s.vy += ay * dt; s.vz += az * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const E = euler(B); s.yaw = E.yaw; s.pitch = E.pitch; s.roll = E.roll;
      // touchdown
      const gh = g0(s.x, s.z), clear = s.y - gh - 0.0;
      if(clear <= 0.0 && s.vy <= 0.2){
        const sink = -s.vy, hv = Math.hypot(s.vx, s.vz);
        if(sink > 8 + 0 || (Math.abs(s.roll) > 0.45 && hv > 12) || (s.pitch < -0.25 && hv > 12) || (hv > 18 && s.pitch > 0.45)){ s.crashed = sink > 8 ? 'You hit the ground too hard.' : 'You came in at a bad angle.'; s.y = gh; return; }
        s.onGround = true; s.touch = sink; s.y = gh; s.vy = 0; s.roll = 0; const hs = Math.hypot(s.vx, s.vz), nb = basis(s.yaw, clamp(s.pitch, 0, 0.3), 0); B.f = nb.f; B.r = nb.r; B.u = nb.u;
        const fw = Math.hypot(nb.f[0], nb.f[2]) || 1; s.vx = nb.f[0] / fw * hs; s.vz = nb.f[2] / fw * hs;
      }
    }
    // ---- the world: buildings and parked vehicles (feet at the plane's height) ----
    s.alt = s.y - g0(s.x, s.z); const dd = collide(s, world, s.circles, s.y + 0.4);
    if(dd > 0){ const hv = Math.hypot(s.vx, s.vz), vn = s.vx * s.nx + s.vz * s.nz;
      if(vn < 0){ s.hit = Math.max(s.hit, -vn); if(-vn > 9 || (!s.onGround && hv > 14)){ s.crashed = 'You hit a building.'; return; } s.vx -= 1.2 * vn * s.nx; s.vz -= 1.2 * vn * s.nz; } }
    s.ias = Math.hypot(s.vx, s.vy, s.vz); s.speed = s.onGround ? Math.max(0, s.vx * B.f[0] + s.vz * B.f[2]) : s.ias; s.vs = s.vy; s.aoa = alpha; s.g += (((lift * 1 + thrust * Math.sin(alpha)) / (P.m * G)) - s.g) * Math.min(1, dt * 6);
  }

  return { car, stepCar, plane, stepPlane, planeParams, basis, euler, CL, AS, G, DT, clamp, wrapA };
});
