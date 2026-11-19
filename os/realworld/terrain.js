/* REALWORLD · terrain — the ground of WestCountry as a PURE function height(x, z) (metres). Nothing is stored or downloaded.
 * A flat-ish city plateau, then real country around it: rolling hills, winding mountain ranges, valleys and lowland plains (see "THE LAND" below).
 * Shared by the chunk worker, the main thread (walking) and the Node tests. Map units are metres: map (x, y) = world (x, z). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.RWTerrain = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hh = (x, z) => { let h = (Math.imul(x | 0, 0x9E3779B1) ^ Math.imul((z | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf), a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const nat = (x, z) => 6 * (vn(x / 400 + 3.1, z / 400 + 7.7) - 0.5) + 2.2 * (vn(x / 130 + 11, z / 130 + 5) - 0.5) + 0.35 * (vn(x / 37 + 2, z / 37 + 9) - 0.5);
  /* THE LAND. The city (radius CR) sits on one gently rolling plateau, so streets and houses never meet a slope. Beyond it the land becomes real country, all one pure function of (x, z):
   *   · a very large-scale "landform" noise splits the country into HIGHLANDS and LOWLANDS (plains, wide valleys), so a few kilometres out you cross from open meadows into mountain ranges;
   *   · rolling hills (±22 m) take over from ~60 m outside the city; mountains (ridged multifractal, domain-warped so the ranges wind and branch instead of looking like noise) rise from
   *     ~160 m out to ~800 m, up to roughly 250 m, with small crags on the flanks; lowlands sink into gentle valleys (-12 m);
   *   · the airfield is protected: no hills or mountains within ~150-600 m of the runway and its approach, so it is always flown into over open ground.
   * Walkable, drivable and flyable: nothing here is a wall; the very steepest faces are cliffs (slope ≳ 1.2) which game.js stops walkers from climbing. */
  let CR = -1;
  function setup(radius){ CR = radius; }
  /* THE RUNWAY: east of the city, along the x axis, flat as a table (the ground is levelled over the strip and ~100 m beyond it). Painted by chunkgen, flown from by drive.js. */
  const RWY = { gap: 70, len: 800, hw: 20, shoulder: 10, blend: 100 };
  const rwy = () => CR < 0 ? null : { x0: CR + RWY.gap, x1: CR + RWY.gap + RWY.len, z: 0, hw: RWY.hw, len: RWY.len };
  const ridge = (x, z) => { let a = 0.5, f = 1, t = 0, nrm = 0; for(let k = 0; k < 4; k++){ const c = Math.cos(0.62 * k), sn = Math.sin(0.62 * k), u = (x * c - z * sn) * f / 820, v = (x * sn + z * c) * f / 820, n = vn(u + 13.7 * k + 2, v + 5.3 * k + 9), r = 1 - Math.abs(2 * n - 1); t += a * Math.pow(r, 2.2); nrm += a; a *= 0.42; f *= 2.05; } return t / nrm; };   // each octave is rotated so the grid never shows
  /* what the country adds on top of the plateau: hills + mountains + valleys (metres), already masked by distance from the city and the airfield */
  function wild(x, z, d){
    const wx = x + 85 * (vn(x / 430 + 5, z / 430 + 9) - 0.5) * 2, wz = z + 85 * (vn(x / 430 + 21, z / 430 + 2) - 0.5) * 2;                     // domain warp: ranges wind and bend
    const land = vn(x / 1700 + 31, z / 1700 + 17), hm = sm(0.36, 0.60, land);                                                                       // 0 lowlands … 1 highlands
    const mH = sm(CR + 60, CR + 420, d), mM = sm(CR + 160, CR + 820, d); let air = 1;
    if(CR >= 0){ const r = rwy(), ax = Math.max(r.x0 - 500 - x, x - (r.x1 + 900), 0); air = sm(150, 600, Math.hypot(ax, z)); }                           // keep the approach open
    const hills = 22 * ((vn(wx / 330 + 7, wz / 330 + 3) - 0.5) * 1.4 + (vn(wx / 140 + 1, wz / 140 + 8) - 0.5) * 0.6) * (1 - 0.35 * hm);
    const rg = ridge(wx, wz), mnt = hm * (28 + 235 * Math.pow(rg, 1.1)) + hm * Math.sqrt(rg) * 7 * (vn(wx / 46 + 3, wz / 46 + 11) - 0.5) * 2 + hm * rg * 2.2 * (vn(wx / 16 + 8, wz / 16 + 1) - 0.5) * 2;                   // ridged ranges + crags
    const vall = -(1 - hm) * 12 * sm(CR + 150, CR + 650, d) * vn(x / 620 + 2, z / 620 + 6);
    return (hills * mH + mnt * mM + vall) * air;
  }
  function height(x, z){
    const d = Math.hypot(x, z), b = sm(CR, CR + 300, d), n = nat(x, z); let h = n * 0.1;
    if(b > 0) h += (n * 0.9 + (CR >= 0 ? wild(x, z, d) : 0)) * b;
    if(CR >= 0 && x > CR + RWY.gap - 170 && x < CR + RWY.gap + RWY.len + 170 && Math.abs(z) < RWY.hw + RWY.shoulder + RWY.blend){
      const ex = Math.max(CR + RWY.gap - 60 - x, x - (CR + RWY.gap + RWY.len + 60), 0), ez = Math.max(Math.abs(z) - (RWY.hw + RWY.shoulder), 0); h *= sm(0, RWY.blend, Math.hypot(ex, ez));   // 0 on the runway, the land again 100 m away
    }
    return h;
  }
  /* steepness = rise over run (0 flat, 1 = 45°) */
  const slope = (x, z) => { const e = 1.5; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); };
  /* 0 = open country, 1 = the middle of the city (tints the ground, keeps forest out) */
  function built(x, z){ return 1 - sm(CR * 0.9, CR + 220, Math.hypot(x, z)); }
  return { setup, height, slope, built, nat, vn, hh, sm, rwy, RWY };
});
