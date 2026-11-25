/* REALWORLD · fx — explosions, crash smoke, sparks, burning wrecks. PURE (no DOM, no GL): main thread + Node tests (tests/fx.test.js).
 *   const fx = RealWorld.FX.create({ seed });
 *   fx.explode(x, y, z, { power, vx, vy, vz, water })      plane crash: flash + fireball + sparks + debris + dark smoke column + dust ring (water: spray + steam instead)
 *   fx.impact(x, y, z, nx, nz, power)                      a car hitting a wall: sparks + a puff of dust (nx, nz = the wall's normal, pointing at the car)
 *   fx.setEmitter(id, { x, y, z, kind, k, ttl, get })      a continuous source: kind 'smoke' (k 0..1 = white wisps → thick black), 'fire' (flames), 'wreck' (burning wreck, dies down over its last 12 s)
 *                                                          `get()` may return {x, y, z} each step (an emitter that follows a moving car); ttl in seconds (default: forever). fx.removeEmitter(id).
 *   fx.step(dt, ground, cam)                               ground(x, z) → height; cam = [x, y, z] (emitters further than 350 m from it do not spawn: they cost nothing out of sight)
 *   fx.fill(alphaBuf, addBuf) → { na, nd }                 8 floats per particle (x y z size  r g b a): `alpha` = smoke / dust / debris (normal blend), `add` = fire / sparks / flash (additive blend)
 *   fx.flash, fx.shake                                     0..1 decaying values for a white screen flash and for the camera shake of the last big bang
 * Budget: MAX 1400 particles in typed arrays, nothing allocated per frame. The renderer is gfx.js `G.fx` (one point sprite per particle, two draw calls). */
(function(root, factory){ const api = factory(); if(typeof module === 'object' && module.exports) module.exports = api; else (root.RealWorld = root.RealWorld || {}).FX = api; })(typeof self !== 'undefined' ? self : this, function(){
  const MAX = 1400, FIRE = 0, SMOKE = 1, SPARK = 2, DEBRIS = 3, FLASH = 4, DUST = 5, SPRAY = 6;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, TAU = Math.PI * 2;
  function rng(seed){ let a = (seed >>> 0) || 0x9e3779b9; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function create(opt){
    opt = opt || {}; const rnd = rng(opt.seed != null ? opt.seed : (Math.random() * 4294967296) >>> 0), wind = opt.wind || [1.4, 0.6];
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX),
      age = new Float32Array(MAX), life = new Float32Array(MAX), s0 = new Float32Array(MAX), s1 = new Float32Array(MAX), sd = new Float32Array(MAX), ty = new Uint8Array(MAX);
    const F = { n: 0, flash: 0, shake: 0, emitters: new Map() };
    const R = (a, b) => a + (b - a) * rnd();
    function spawn(type, x, y, z, ax, ay, az, lf, a0, a1, seed){
      let i = F.n < MAX ? F.n++ : Math.floor(rnd() * MAX);                          // full: overwrite a random one (the cloud is dense by then, nobody notices)
      px[i] = x; py[i] = y; pz[i] = z; vx[i] = ax; vy[i] = ay; vz[i] = az; age[i] = 0; life[i] = lf; s0[i] = a0; s1[i] = a1; sd[i] = seed == null ? rnd() : seed; ty[i] = type; return i;
    }
    /* a random direction on the sphere, biased upwards by `up` (0 = uniform) */
    function dir(up){ const a = rnd() * TAU, c = R(-1, 1), s = Math.sqrt(1 - c * c); return [Math.cos(a) * s, clamp(c + up, -1, 1.4), Math.sin(a) * s]; }
    function explode(x, y, z, o){
      o = o || {}; const p = clamp(o.power != null ? o.power : 1, 0.3, 2.5), ivx = (o.vx || 0) * 0.35, ivy = clamp((o.vy || 0) * 0.2, -4, 6), ivz = (o.vz || 0) * 0.35;
      F.flash = Math.max(F.flash, o.water ? 0.25 : 1); F.shake = Math.max(F.shake, o.water ? 0.5 : 1);
      if(o.water){                                                                    // ditching in the sea: a column of spray, steam, a little fire
        for(let i = 0; i < 70 * p; i++){ const a = rnd() * TAU, h = R(5, 20) * p, r = R(0, 6) * p; spawn(SPRAY, x, y, z, Math.cos(a) * r * 0.5 + ivx * 0.4, h, Math.sin(a) * r * 0.5 + ivz * 0.4, R(1.2, 2.6), R(0.8, 1.6), R(2, 4.5)); }
        for(let i = 0; i < 24; i++) spawn(SMOKE, x + R(-2, 2), y + 0.5, z + R(-2, 2), R(-2, 2), R(1, 4), R(-2, 2), R(3, 6), 2, R(8, 14) * p, 0.05);
        for(let i = 0; i < 8; i++){ const d = dir(0.6); spawn(FIRE, x, y + 0.6, z, d[0] * 4, Math.abs(d[1]) * 5, d[2] * 4, R(0.5, 1.1), 1.5, 3.5 * p); }
        return;
      }
      spawn(FLASH, x, y + 1.5, z, 0, 0, 0, 0.22, 10 * p, 26 * p, 0);
      for(let i = 0; i < 52 * p; i++){ const d = dir(0.15), sp = R(3, 15) * p; spawn(FIRE, x + R(-1.2, 1.2), y + R(0.3, 1.8), z + R(-1.2, 1.2), d[0] * sp + ivx, d[1] * sp * 0.8 + ivy, d[2] * sp + ivz, R(0.7, 1.7), R(2, 4) * p, R(6, 11) * p); }
      for(let i = 0; i < 16; i++) spawn(FIRE, x + R(-1.5, 1.5), y + 0.5, z + R(-1.5, 1.5), R(-2, 2), R(7, 14), R(-2, 2), R(1, 2.2), R(2, 3.5) * p, R(5, 9) * p);   // the rising fireball core
      for(let i = 0; i < 56 * p; i++){ const d = dir(0.5), sp = R(10, 36) * p; spawn(SPARK, x, y + 1, z, d[0] * sp + ivx, Math.abs(d[1]) * sp + 2, d[2] * sp + ivz, R(0.7, 2.1), R(0.3, 0.6), 0.1); }
      for(let i = 0; i < 28 * p; i++){ const d = dir(0.55), sp = R(7, 26) * p; spawn(DEBRIS, x, y + 1, z, d[0] * sp + ivx, Math.abs(d[1]) * sp + 3, d[2] * sp + ivz, R(2.8, 5), R(0.3, 0.85), 0.3); }
      for(let i = 0; i < 44; i++){ const d = dir(0.3), sp = R(1.5, 9) * p; spawn(SMOKE, x + R(-2, 2), y + R(0.5, 3), z + R(-2, 2), d[0] * sp + ivx * 0.4, Math.abs(d[1]) * sp * 0.8 + 2, d[2] * sp + ivz * 0.4, R(4.5, 9), R(2.5, 4.5) * p, R(11, 22) * p, R(0.75, 1)); }
      for(let i = 0; i < 26; i++){ const a = i / 26 * TAU + R(-0.1, 0.1), sp = R(9, 17) * p; spawn(DUST, x, y + 0.3, z, Math.cos(a) * sp, R(0.2, 1.4), Math.sin(a) * sp, R(1.4, 2.6), 1.8, R(8, 13) * p); }   // the ground shock ring
    }
    function impact(x, y, z, nx, nz, power){
      const p = clamp(power != null ? power : 1, 0.2, 2), n = Math.round(10 + 22 * p);
      for(let i = 0; i < n; i++){ const sp = R(4, 14) * p, sx = R(-0.7, 0.7); spawn(SPARK, x, y, z, nx * sp + (-nz) * sx * sp * 0.6, R(0.5, 5) * p, nz * sp + nx * sx * sp * 0.6, R(0.35, 0.9), R(0.14, 0.3), 0.06); }
      for(let i = 0; i < 4 + 8 * p; i++) spawn(DUST, x + R(-0.4, 0.4), y, z + R(-0.4, 0.4), nx * R(0.5, 3) + R(-1, 1), R(0.3, 1.8), nz * R(0.5, 3) + R(-1, 1), R(0.9, 1.8), 0.5, R(2, 4.2));
      if(p > 0.7) for(let i = 0; i < 4; i++) spawn(DEBRIS, x, y, z, nx * R(2, 7) + R(-1.5, 1.5), R(2, 6), nz * R(2, 7) + R(-1.5, 1.5), R(1.2, 2.4), R(0.07, 0.16), 0.1);   // bits of bumper / glass
      F.shake = Math.max(F.shake, clamp(p * 0.3, 0, 0.6));
    }
    function setEmitter(id, e){ let cur = F.emitters.get(id); if(!cur){ cur = { x: 0, y: 0, z: 0, kind: 'smoke', k: 0.5, ttl: Infinity, acc: 0, acc2: 0, t: 0, get: null }; F.emitters.set(id, cur); } Object.assign(cur, e); if(e.ttl != null) cur.t = 0; return cur; }
    function removeEmitter(id){ F.emitters.delete(id); }
    function emit(e, dt){
      e.acc += dt; e.acc2 += dt; const k = e.kind === 'wreck' ? clamp((e.ttl - e.t) / 12, 0.15, 1) : clamp(e.k, 0, 1);
      if(e.kind === 'smoke'){
        const rate = 7 + 34 * k, st = 1 / rate, dark = clamp((k - 0.18) * 1.7, 0, 1);
        while(e.acc > st){ e.acc -= st; spawn(SMOKE, e.x + R(-0.35, 0.35), e.y + R(0, 0.2), e.z + R(-0.35, 0.35), R(-0.5, 0.5), 1.6 + 2.2 * k + R(0, 0.8), R(-0.5, 0.5), 1.9 + 2.6 * k + R(0, 1), R(0.35, 0.6), 2.2 + 3.2 * k, dark * R(0.8, 1)); }
        if(k > 0.82){ const fs = 1 / 14; while(e.acc2 > fs){ e.acc2 -= fs; spawn(FIRE, e.x + R(-0.3, 0.3), e.y + R(0, 0.2), e.z + R(-0.3, 0.3), R(-0.4, 0.4), R(1.5, 3), R(-0.4, 0.4), R(0.3, 0.6), 0.35, 0.9); } }   // nearly destroyed engine: flames lick through the smoke
        if(k > 0.55 && rnd() < dt * 3) spawn(SPARK, e.x, e.y, e.z, R(-2, 2), R(1, 4), R(-2, 2), R(0.3, 0.7), 0.15, 0.05);
      } else if(e.kind === 'fire'){
        const st = 1 / (6 + 22 * k); while(e.acc > st){ e.acc -= st; spawn(FIRE, e.x + R(-0.4, 0.4), e.y, e.z + R(-0.4, 0.4), R(-0.5, 0.5), R(2, 4.5), R(-0.5, 0.5), R(0.4, 0.9), R(0.6, 1.1), R(1.4, 2.4)); }
      } else if(e.kind === 'wreck'){
        const st = 1 / (10 + 18 * k); while(e.acc > st){ e.acc -= st; spawn(SMOKE, e.x + R(-2, 2), e.y + R(0.5, 1.5), e.z + R(-2, 2), R(-0.6, 0.6), 3 + 2.5 * k + R(0, 1.5), R(-0.6, 0.6), R(5, 8.5), R(1.2, 2), R(6, 11) + 4 * k, R(0.7, 1)); }
        const fs = 1 / (4 + 14 * k); while(e.acc2 > fs){ e.acc2 -= fs; spawn(FIRE, e.x + R(-2.2, 2.2), e.y + R(0.1, 0.8), e.z + R(-2.2, 2.2), R(-0.5, 0.5), R(2.5, 5.5) * (0.5 + 0.5 * k), R(-0.5, 0.5), R(0.5, 1.2), R(1.1, 1.9) * (0.5 + 0.5 * k), R(2.4, 3.8)); }
        if(k > 0.5 && rnd() < dt * 4) spawn(SPARK, e.x + R(-1.5, 1.5), e.y + 1, e.z + R(-1.5, 1.5), R(-3, 3), R(4, 9), R(-3, 3), R(0.8, 1.6), 0.2, 0.05);
      }
    }
    function step(dt, ground, cam){
      dt = clamp(dt, 0, 0.1); F.flash = Math.max(0, F.flash - dt * 3.2); F.shake = Math.max(0, F.shake - dt * 1.1);
      F.emitters.forEach((e, id) => {
        if(e.get){ const g = e.get(); if(g){ e.x = g.x; e.y = g.y; e.z = g.z; } }
        e.t += dt; if(e.t >= e.ttl){ F.emitters.delete(id); return; }
        if(cam){ const dx = e.x - cam[0], dz = e.z - cam[2]; if(dx * dx + dz * dz > 350 * 350){ e.acc = e.acc2 = 0; return; } }
        emit(e, dt);
      });
      for(let i = 0; i < F.n;){
        age[i] += dt; if(age[i] >= life[i]){ const l = --F.n; if(i !== l){ px[i] = px[l]; py[i] = py[l]; pz[i] = pz[l]; vx[i] = vx[l]; vy[i] = vy[l]; vz[i] = vz[l]; age[i] = age[l]; life[i] = life[l]; s0[i] = s0[l]; s1[i] = s1[l]; sd[i] = sd[l]; ty[i] = ty[l]; } continue; }
        const t = ty[i];
        if(t === FIRE){ vy[i] += 3.2 * dt; const k = Math.exp(-1.4 * dt); vx[i] *= k; vz[i] *= k; vy[i] *= Math.exp(-0.6 * dt); }
        else if(t === SMOKE){ vy[i] += 1.2 * dt; vx[i] += (wind[0] - vx[i]) * 0.35 * dt; vz[i] += (wind[1] - vz[i]) * 0.35 * dt; vy[i] *= Math.exp(-0.45 * dt); }
        else if(t === DUST){ const k = Math.exp(-2.2 * dt); vx[i] *= k; vz[i] *= k; vy[i] += 0.5 * dt; }
        else if(t === SPRAY){ vy[i] -= 9 * dt; const k = Math.exp(-0.5 * dt); vx[i] *= k; vz[i] *= k; }
        else {                                                                         // SPARK / DEBRIS: ballistic, bounce on the ground; debris trails a little smoke
          vy[i] -= (t === SPARK ? 7.5 : 9.8) * dt; const k = Math.exp(-(t === SPARK ? 0.35 : 0.12) * dt); vx[i] *= k; vz[i] *= k;
          if(t === DEBRIS && sd[i] > 0 && rnd() < dt * 9 && age[i] < life[i] * 0.7) spawn(SMOKE, px[i], py[i], pz[i], R(-0.3, 0.3), R(0.2, 1), R(-0.3, 0.3), R(1.2, 2.2), 0.4, R(1.4, 2.4), 0.9);
        }
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        if(t === SPARK || t === DEBRIS || t === DUST){ const gh = (ground ? ground(px[i], pz[i]) : 0) + 0.05; if(py[i] < gh){ py[i] = gh; if(vy[i] < 0){ vy[i] *= t === DEBRIS ? -0.3 : -0.4; vx[i] *= 0.65; vz[i] *= 0.65; if(t === DEBRIS && Math.abs(vy[i]) < 0.6){ vy[i] = 0; vx[i] *= 0.8; vz[i] *= 0.8; } } } }
        else if(t === FIRE || t === SMOKE || t === SPRAY){ const gh = (ground ? ground(px[i], pz[i]) : 0) + 0.1; if(py[i] < gh && vy[i] < 0){ py[i] = gh; vy[i] *= -0.2; } }
        i++;
      }
      return F;
    }
    /* colour / alpha / size of every particle for this frame → two flat Float32Arrays (grown by the caller if too small: they need MAX × 8 floats) */
    const out = { na: 0, nd: 0 };
    function fill(A, D){
      let na = 0, nd = 0;
      for(let i = 0; i < F.n; i++){
        const t = age[i] / life[i], ty_ = ty[i]; let r, g, b, a, size = lerp(s0[i], s1[i], Math.pow(t, ty_ === FIRE ? 0.55 : 0.7)), add = false;
        if(ty_ === FIRE){ add = true; if(t < 0.22){ const u = t / 0.22; r = 1; g = lerp(0.95, 0.6, u); b = lerp(0.6, 0.15, u); } else if(t < 0.65){ const u = (t - 0.22) / 0.43; r = lerp(1, 0.75, u); g = lerp(0.6, 0.2, u); b = lerp(0.15, 0.04, u); } else { const u = (t - 0.65) / 0.35; r = lerp(0.75, 0.25, u); g = lerp(0.2, 0.05, u); b = lerp(0.04, 0.02, u); } a = Math.pow(1 - t, 1.1) * 0.85; }
        else if(ty_ === FLASH){ add = true; r = 1; g = 0.9; b = 0.7; a = Math.pow(1 - t, 2); }
        else if(ty_ === SPARK){ add = true; r = 1; g = lerp(0.9, 0.45, t); b = lerp(0.55, 0.12, t); a = 1 - t * t; size = Math.max(size, 0.08); }
        else if(ty_ === SMOKE){ const dk = sd[i], gv = lerp(0.62, 0.1, dk) + 0.2 * t; r = gv * 1.02; g = gv; b = gv * 0.98; a = Math.min(1, t * 9) * Math.pow(1 - t, 1.4) * lerp(0.4, 0.62, dk); }
        else if(ty_ === DEBRIS){ r = 0.13; g = 0.125; b = 0.12; a = t > 0.85 ? (1 - t) / 0.15 : 1; }
        else if(ty_ === DUST){ r = 0.58; g = 0.5; b = 0.4; a = Math.pow(1 - t, 1.5) * 0.42; }
        else { r = 0.86; g = 0.93; b = 1; a = Math.pow(1 - t, 1.2) * 0.55; }                // SPRAY
        const B = add ? D : A, o = (add ? nd++ : na++) * 8;
        B[o] = px[i]; B[o + 1] = py[i]; B[o + 2] = pz[i]; B[o + 3] = size; B[o + 4] = r; B[o + 5] = g; B[o + 6] = b; B[o + 7] = a;
      }
      out.na = na; out.nd = nd; return out;
    }
    F.explode = explode; F.impact = impact; F.setEmitter = setEmitter; F.removeEmitter = removeEmitter; F.step = step; F.fill = fill; F.MAX = MAX;
    F.clear = () => { F.n = 0; F.emitters.clear(); F.flash = F.shake = 0; };
    F.count = () => F.n; F.emitterCount = () => F.emitters.size; F.has = id => F.emitters.has(id);
    return F;
  }
  return { create, MAX };
});
