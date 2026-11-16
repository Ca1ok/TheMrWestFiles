/* REALWORLD · phys — the player controller's collision world. PURE (browser + Node tests), no dependencies.
 *
 * WHY NOT A TRIANGLE BVH (three-mesh-bvh / Rapier)?  Every solid in WestCountry is a turned box or a cylinder (houses, landmarks, furniture, stairs, floor slabs, tree trunks), so the
 * collision shapes are ANALYTIC and a query costs a handful of multiplies. A BVH only pays off for arbitrary triangle soups; here it would add a dependency and a per-mesh build step for
 * nothing. The chunk streamer already is the spatial partition (a query only looks at the 3×3 chunks around the player + the active building cells).
 *
 * A COLLIDER is one row of a Float32Array:
 *   stride 8  (chunk worker output): [type, x, z, hx|r, hz, cos, sin, top]          type 0 = box turned by (cos, sin), 1 = cylinder (radius r)   — solid from the ground up to `top`
 *   stride 10 (building cells)     : [type, x, z, hx|r, hz, cos, sin, y0, y1, 0]    — solid between y0 and y1 (so a floor slab, a stair step or a table has a real height)
 * Box axes: local u = (cos, sin), v = (-sin, cos).
 *
 * THE CONTROLLER (a 0.38 m radius, 1.72 m tall capsule):
 *   · a solid BLOCKS sideways only if it reaches above the feet + STEP (0.55 m) and starts below the head — so kerbs, bench seats and every stair tread (≈0.19 m) are simply walked up,
 *   · the SUPPORT under the feet is the highest top within STEP of them (terrain, a stair, a table you jumped on, an upper floor), so you stand on whatever is there,
 *   · a solid that starts above the head (a floor slab over the stairwell) never blocks, but it bumps your head when you jump,
 *   · walking down keeps you glued to the ground (stairs, slopes) instead of "falling" step by step.
 * `disabled` = list of {x, z}: stride-8 boxes centred there are ignored (a building whose hollow shell has been loaded as a cell replaces its solid collision box). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else (root.RealWorld = root.RealWorld || {}).Phys = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const STEP = 0.55, HEAD = 1.72, RADIUS = 0.38, NEG = -1e9;
  const out = { x: 0, z: 0 };
  const y0Of = (a, i, st) => st === 10 ? a[i + 7] : NEG, y1Of = (a, i, st) => st === 10 ? a[i + 8] : a[i + 7];
  const off = (a, i, dis) => { if(!dis || !dis.length || a[i] !== 0) return false; for(let k = 0; k < dis.length; k++) if(Math.abs(a[i + 1] - dis[k].x) < 0.06 && Math.abs(a[i + 2] - dis[k].z) < 0.06) return true; return false; };
  /* push the point (out.x, out.z) out of one collider (horizontal only) */
  function push(a, i, r){
    const co = a[i + 5], si = a[i + 6], dx = out.x - a[i + 1], dz = out.z - a[i + 2];
    if(a[i] === 1){ const d = Math.hypot(dx, dz), R = a[i + 3] + r; if(d < R && d > 1e-6){ out.x += dx / d * (R - d); out.z += dz / d * (R - d); } return; }
    const hx = a[i + 3], hz = a[i + 4], lx = dx * co + dz * si, lz = -dx * si + dz * co, qx = lx < -hx ? -hx : lx > hx ? hx : lx, qz = lz < -hz ? -hz : lz > hz ? hz : lz, ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if(d2 >= r * r) return; let nx, nz, pen;
    if(d2 > 1e-9){ const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; } else { const A = hx - Math.abs(lx), B = hz - Math.abs(lz); if(A < B){ nx = lx < 0 ? -1 : 1; nz = 0; pen = A + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = B + r; } }
    out.x += (nx * co - nz * si) * pen; out.z += (nx * si + nz * co) * pen;
  }
  /* is the point (x, z) over this collider (inflated by `pad`)? */
  function over(a, i, x, z, pad){
    const dx = x - a[i + 1], dz = z - a[i + 2]; if(a[i] === 1) return Math.hypot(dx, dz) < a[i + 3] + pad;
    const co = a[i + 5], si = a[i + 6], lx = dx * co + dz * si, lz = -dx * si + dz * co; return Math.abs(lx) < a[i + 3] + pad && Math.abs(lz) < a[i + 4] + pad;
  }
  /* sets = [{ a: Float32Array, st: 8|10 }, …] */
  function resolve(x, z, py, sets, dis, r){
    r = r || RADIUS; out.x = x; out.z = z;
    for(let pass = 0; pass < 2; pass++) for(let s = 0; s < sets.length; s++){ const a = sets[s].a, st = sets[s].st;
      for(let i = 0; i < a.length; i += st){ if(y1Of(a, i, st) <= py + STEP || y0Of(a, i, st) >= py + HEAD || off(a, i, dis)) continue; push(a, i, r); } }
    return out;
  }
  /* the highest standable surface under (x, z) that the feet at py can step onto; -Infinity if none */
  function support(x, z, py, sets, dis){
    let best = -Infinity;
    for(let s = 0; s < sets.length; s++){ const a = sets[s].a, st = sets[s].st;
      for(let i = 0; i < a.length; i += st){ const y1 = y1Of(a, i, st); if(y1 > py + STEP + 1e-3 || y1 <= best || off(a, i, dis)) continue; if(y0Of(a, i, st) >= y1 - 0.02 || !over(a, i, x, z, 0.12)) continue; best = y1; } }
    return best;
  }
  /* the lowest underside above the head at (x, z); Infinity if none */
  function ceiling(x, z, py, sets, dis){
    let best = Infinity;
    for(let s = 0; s < sets.length; s++){ const a = sets[s].a, st = sets[s].st; if(st !== 10) continue;
      for(let i = 0; i < a.length; i += st){ const y0 = a[i + 7]; if(y0 < py + HEAD - 0.02 || y0 >= best || !over(a, i, x, z, 0.1)) continue; best = y0; } }
    return best;
  }
  /* one frame of movement. P = { x, y, z, vx, vz, vy, grounded } (velocities set by the caller); env = { sets, disabled, ground(x, z) → terrain/floor height, grav, jump (m/s, 0 = no jump this frame) }. Returns P. */
  function step(P, dt, env){
    const sets = env.sets, dis = env.disabled, sp = Math.hypot(P.vx, P.vz), n = Math.max(1, Math.ceil(sp * dt / 0.25)), sdt = dt / n;
    for(let i = 0; i < n; i++){ const o = resolve(P.x + P.vx * sdt, P.z + P.vz * sdt, P.y, sets, dis); P.x = o.x; P.z = o.z; }
    const gy = Math.max(env.ground(P.x, P.z), support(P.x, P.z, P.y, sets, dis)), onG = P.y <= gy + 0.03;
    if(onG && P.vy <= 0 && env.jump) P.vy = env.jump;
    P.vy -= env.grav * dt; let ny = P.y + P.vy * dt;
    if(P.vy > 0){ const c = ceiling(P.x, P.z, P.y, sets, dis); if(ny + HEAD > c){ ny = c - HEAD; P.vy = 0; } }
    if(ny <= gy){ ny = gy; P.vy = 0; P.grounded = true; }
    else if(P.grounded && P.vy <= 0 && P.y - gy <= STEP + 0.01 && !env.jump){ ny = gy; P.vy = 0; }   // glued to stairs and slopes on the way down
    else P.grounded = false;
    P.y = ny; return P;
  }
  return { STEP, HEAD, RADIUS, resolve, support, ceiling, step, over };
});
