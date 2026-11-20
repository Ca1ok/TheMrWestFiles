/* REALWORLD · terrain — the ground of WestCountry as a PURE function height(x, z) (metres). Nothing is stored or downloaded.
 * WestCountry is a large ISLAND (~4.6 × 3.9 km): a ragged coastline with beaches and bays, a flat downtown plateau with the airfield, lowland plains, a mountain spine across the north and foothill valleys (see "THE LAND" below).
 * Shared by the chunk worker, the main thread (walking) and the Node tests. Map units are metres: map (x, y) = world (x, z). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.RWTerrain = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hh = (x, z) => { let h = (Math.imul(x | 0, 0x9E3779B1) ^ Math.imul((z | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf), a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const nat = (x, z) => 6 * (vn(x / 400 + 3.1, z / 400 + 7.7) - 0.5) + 2.2 * (vn(x / 130 + 11, z / 130 + 5) - 0.5) + 0.35 * (vn(x / 37 + 2, z / 37 + 9) - 0.5);
  /* THE LAND — an island in the sea (sea level SEA = 0 m). All of it is ONE pure function of (x, z), independent of how big the city is:
   *   · land(x, z): a domain-warped ellipse (centre ≈ (100, -650), radii ≈ 2300 × 1950 m) gives a ragged coast with bays and headlands; > 0 = land, 0 = shoreline. Offshore the seabed falls to -60 m.
   *   · beaches rise ~12 m over the first ~200 m inland, then the lowland plain (+12 m) with gentle rolling hills (±12 m).
   *   · DOWNTOWN PLATEAU: x -800 … 1700, z -300 … 300 is flat (12 m) with a 500 m melt-out, so the 13 landmark blocks, the University Quarter / Industrial Estate and the runway (x 800 … 1600) never meet a slope.
   *   · MOUNTAINS: a ridged-multifractal spine winds across the north of the island (distance to a polyline) plus a smaller massif in the south-west and highland noise with ridges radiating from the peaks, up to ~350 m,
   *     with crags on the flanks, snow above ~170 m; foothills melt into the plain and the city's lowlands.
   * height() is the walkable / drivable / flyable surface: the sea is a flat plane at SEA. land() is the raw ground incl. the seabed (colours, depth, "is this water"). */
  const SEA = 0, RWH = 12, FLATH = 12;
  function setup(){}                                                                           // (kept for older callers — the island no longer depends on the city's size)
  const RWY = { gap: 70, len: 800, hw: 20, shoulder: 10, blend: 100, x0: 800 };
  const rwy = () => ({ x0: RWY.x0, x1: RWY.x0 + RWY.len, z: 0, hw: RWY.hw, len: RWY.len });
  const ridge = (x, z) => { let a = 0.5, f = 1, t = 0, nrm = 0; for(let k = 0; k < 4; k++){ const c = Math.cos(0.62 * k), sn = Math.sin(0.62 * k), u = (x * c - z * sn) * f / 820, v = (x * sn + z * c) * f / 820, n = vn(u + 13.7 * k + 2, v + 5.3 * k + 9), r = 1 - Math.abs(2 * n - 1); t += a * Math.pow(r, 2.2); nrm += a; a *= 0.42; f *= 2.05; } return t / nrm; };   // each octave is rotated so the grid never shows
  const SPINE = [[-2050, -520], [-1400, -1250], [-600, -1550], [300, -1750], [1250, -1650], [2000, -1250]];
  function spineDist(x, z){ let best = 1e9; for(let i = 0; i < SPINE.length - 1; i++){ const a = SPINE[i], b = SPINE[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return best; }
  /* > 0 land, 0 shoreline, < 0 sea (in "fraction of the island radius") */
  function field(x, z){
    const wx = x + 470 * (vn(x / 1100 + 3, z / 1100 + 8) - 0.5) * 2 + 150 * (vn(x / 380 + 6, z / 380 + 2) - 0.5) * 2, wz = z + 470 * (vn(x / 1100 + 14, z / 1100 + 1) - 0.5) * 2 + 150 * (vn(x / 380 + 1, z / 380 + 9) - 0.5) * 2;
    const r = Math.hypot(wx - 100, (wz + 650) / 0.85); return (2300 - r) / 2300 + 0.15 * (vn(x / 640 + 9, z / 640 + 4) - 0.5) * 2 + 0.05 * (vn(x / 180 + 2, z / 180 + 6) - 0.5) * 2;
  }
  function landRaw(x, z){
    const L = field(x, z); if(L < 0) return -60 * sm(0, 0.14, -L) * (0.6 + 0.4 * vn(x / 300 + 1, z / 300 + 5)) - 1.2 * sm(0, 0.02, -L);
    const wx = x + 85 * (vn(x / 430 + 5, z / 430 + 9) - 0.5) * 2, wz = z + 85 * (vn(x / 430 + 21, z / 430 + 2) - 0.5) * 2;
    let h = 12 * Math.pow(sm(0, 0.095, L), 1.1);                                                                                                // beach → plain
    const inl = sm(0.07, 0.28, L);
    h += inl * (17 * ((vn(wx / 520 + 7, wz / 520 + 3) - 0.5) * 1.3 + (vn(wx / 210 + 1, wz / 210 + 8) - 0.5) * 0.7) * 1.15 + 3 * (vn(wx / 70 + 4, wz / 70 + 2) - 0.5) * 2);          // rolling lowland hills
    const sd = spineDist(x, z), rg = ridge(wx, wz), spine = 1 - sm(260, 1050, sd), hi = sm(0.5, 0.7, vn(x / 1150 + 31, z / 1150 + 17)), sw = 1 - sm(0, 560, Math.hypot(x + 1250, z - 300));   // spine, noise highlands, SW massif
    const m = Math.max(spine, hi * 0.85, sw * 0.95) * sm(0.14, 0.4, L);
    if(m > 0.002) h += m * (26 + 330 * Math.pow(rg, 1.1)) + m * Math.sqrt(rg) * 7 * (vn(wx / 46 + 3, wz / 46 + 11) - 0.5) * 2 + m * rg * 2.2 * (vn(wx / 16 + 8, wz / 16 + 1) - 0.5) * 2;
    const dx = Math.max(Math.abs(x - 450) - 1250, 0), dz = Math.max(Math.abs(z) - 300, 0), pw = 1 - sm(0, 520, Math.hypot(dx, dz));                // the flat downtown plateau
    if(pw > 0) h += (FLATH + 0.1 * nat(x, z) - h) * pw;
    if(x > RWY.x0 - 170 && x < RWY.x0 + RWY.len + 170 && Math.abs(z) < RWY.hw + RWY.shoulder + RWY.blend){
      const ex = Math.max(RWY.x0 - 60 - x, x - (RWY.x0 + RWY.len + 60), 0), ez = Math.max(Math.abs(z) - (RWY.hw + RWY.shoulder), 0); h = RWH + (h - RWH) * sm(0, RWY.blend, Math.hypot(ex, ez));   // the strip is level
    }
    return h;
  }
  /* THE PIER: a wooden pier runs out from the beach south of downtown (walkable: it is part of the ground, 0.9 m above the sea). Found once by scanning for the shore at x = 300. */
  let PIER = null;
  function pier(){ if(!PIER){ let z = 200; while(landRaw(300, z) > 0.2 && z < 3200) z += 2; PIER = { x0: 295, x1: 305, z0: z - 18, z1: z + 64, cx: 300, shore: z }; } return PIER; }
  const onPier = (x, z) => { const p = pier(); return x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1; };
  const land = (x, z) => { const h = landRaw(x, z); return h < 0.9 && onPier(x, z) ? 0.9 : h; };
  const height = (x, z) => Math.max(land(x, z), SEA);
  const isWater = (x, z) => land(x, z) < SEA + 0.12;
  const depth = (x, z) => Math.max(0, SEA - land(x, z));
  /* steepness = rise over run (0 flat, 1 = 45°) */
  const slope = (x, z) => { const e = 1.5; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); };
  /* LANDMARKS (deterministic, found by scanning the terrain once): the lighthouse on the north-east headland, the radio mast on the highest peak, cabins scattered on the foothills.
   * chunkgen builds them into the chunk that holds their anchor point. */
  let LM = null;
  function landmarks(){
    if(LM) return LM; LM = []; const CX = 100, CZ = -650;
    let best = null; for(let a = -80; a <= 10; a += 1.5){ const r = a * Math.PI / 180; let rr = 600; while(rr < 4200 && landRaw(CX + Math.cos(r) * rr, CZ + Math.sin(r) * rr * 0.85) > 0.5) rr += 8; if(!best || rr > best.rr) best = { rr, r }; }
    { const x = CX + Math.cos(best.r) * (best.rr - 34), z = CZ + Math.sin(best.r) * (best.rr - 34) * 0.85; LM.push({ type: 'lighthouse', x, z, y: land(x, z) }); }
    let peak = null; for(let x = -2300; x <= 2300; x += 40) for(let z = -2200; z <= 200; z += 40){ const h = landRaw(x, z), sc = h - 260 * slope(x, z); if(!peak || sc > peak.sc) peak = { x, z, h, sc }; } LM.push({ type: 'mast', x: peak.x, z: peak.z, y: peak.h });
    let n = 0; for(let k = 0; k < 4000 && n < 9; k++){ const x = -2000 + hh(k, 77) * 4000, z = -1900 + hh(k, 91) * 1900, h = landRaw(x, z); if(h < 26 || h > 80 || slope(x, z) > 0.07) continue; if(LM.some(m => m.type === 'cabin' && Math.hypot(m.x - x, m.z - z) < 90)) continue; LM.push({ type: 'cabin', x, z, y: h, yaw: Math.PI / 4 }); n++; }
    return LM;
  }
  return { setup, height, land, isWater, depth, slope, nat, vn, hh, sm, rwy, RWY, SEA, field, spineDist, ridge, pier, onPier, landmarks };
});
