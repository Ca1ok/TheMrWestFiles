/* REALWORLD · layout — the street plan of the 3D city. PURE (worker, main thread, Node tests). It does NOT follow the 2D map (the map will follow this later).
 * IDEA: the city is a lattice of rectangular BLOCKS (SU × SV metres) between STREETS (every 4th street is a wide avenue). Everything is laid out in lattice space (u, v) and then bent into
 * organic curves by ONE smooth, invertible warp(u, v). Because streets are lines of the lattice, they only ever meet at proper crossings; because lots, buildings and trees are placed inside
 * a block with fixed margins from its streets, they can never touch a road or each other (the margins are bigger than the warp can squeeze). No collision tests needed.
 *   block (i, j) spans u in [(i-½)SU, (i+½)SU], v in [(j-½)SV, (j+½)SV].   Street lines: constant v → 'h' lines, constant u → 'v' lines.   Line k sits at (k-½)·S.
 * ROLES: plaza (0,0) · landmarks in the 8 blocks around it · campuses · two plot zones (University Quarter west, Industrial Estate east) · a corridor of plain blocks joining them ·
 * houses: block after block in a growing spiral (8 houses per block, house i is ALWAYS in the same place, so the city only ever grows outward).
 * To change the look of the city: SU/SV/HW, the warp, POI_BLOCK, ZONE_BLOCKS. Everything else follows. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js'), require('./terrain.js')); else root.RWLayout = factory(root.WorldGen, root.RWTerrain); })(typeof self !== 'undefined' ? self : this, function(G, T){
  const SU = 94, SV = 62, SIDE = 5, SET = 6, PER = 8, f01 = G.f01, TAU = Math.PI * 2, K1 = TAU / 410, K2 = TAU / 150, K3 = TAU / 370;
  const WA = 26, wsm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* the street grid bends: a little everywhere (±11 m) and, growing with distance from downtown, in long lazy curves (up to ±55 m over ~1.5 km) — roads keep their length but wander like real ones.
   * The long-wave terms only shear / rotate (they never compress a lot along its street), so houses still can't touch each other. */
  const warp = (u, v) => { const a = WA * wsm(250, 1400, Math.hypot(u, v));
    return [u + 11 * Math.sin(v * K1 + 1.3) + 3 * Math.sin((u * 0.7 + v) * K2 + 0.4) + a * Math.sin(v * TAU / 1550 + 0.7) + a * 0.6 * Math.sin((u * 0.6 + v * 0.8) * TAU / 2300 + 2.2), v + 11 * Math.sin(u * K3 + 2.1) + 3 * Math.sin((u - v * 0.6) * K2 + 4.1) + a * Math.sin(u * TAU / 1700 + 1.9) + a * 0.6 * Math.sin((u * 0.8 - v * 0.6) * TAU / 2100 + 0.4)]; };
  const unwarp = (x, z) => { let u = x, v = z; for(let q = 0; q < 4; q++){ const w = warp(u, v); u -= w[0] - x; v -= w[1] - z; } return [u, v]; };
  const lineU = k => (k - 0.5) * SU, lineV = k => (k - 0.5) * SV, isAve = k => (((k % 4) + 4) % 4) === 0, hwOf = k => isAve(k) ? 7 : 4;
  /* local frame of the warped lattice: world position + the angle of the lattice u-axis (orthogonalised), so houses sit square to their street */
  function frame(u, v){ const p = warp(u, v), a = warp(u + 1.5, v), b = warp(u - 1.5, v), c = warp(u, v + 1.5), d = warp(u, v - 1.5), tu = Math.atan2(a[1] - b[1], a[0] - b[0]), tv = Math.atan2(c[1] - d[1], c[0] - d[0]) - Math.PI / 2, s = Math.sin(tu) + Math.sin(tv), co = Math.cos(tu) + Math.cos(tv); return { x: p[0], z: p[1], ang: Math.atan2(s, co), tu }; }
  /* lattice direction (du, dv) → world direction at a frame */
  const dirOf = (fr, du, dv) => { const c = Math.cos(fr.ang), s = Math.sin(fr.ang); return [c * du - s * dv, s * du + c * dv]; };
  const POI_BLOCK = { agency: [-1, -1], hall: [0, -1], arcade: [1, -1], bank: [-1, 0], exchange: [1, 0], shop: [0, 1], park: [1, 1], uni: [-3, 0], lab: [-3, 1], ind: [3, 0], plant: [3, 1], dealer: [-2, 0], airport: [8, 1] };    // the airport sits east of the Industrial Estate, right beside the runway (apron → taxiway → runway)
  const ZW = [[-7, -2], [-6, -2], [-5, -2], [-7, -1], [-6, -1], [-5, -1], [-7, 0], [-6, 0], [-5, 0], [-7, 1], [-6, 1], [-5, 1]];
  const ZONE_BLOCKS = { l: ZW, f: ZW.map(([i, j]) => [-i, j]) }, ZONE_NAME = { l: 'University Quarter', f: 'Industrial Estate' };
  const K = (i, j) => i + ',' + j;
  const STATIC = new Map();
  for(const id in POI_BLOCK) STATIC.set(K(...POI_BLOCK[id]), { role: id === 'park' ? 'park' : 'poi', id });
  STATIC.set(K(0, 0), { role: 'plaza' }); STATIC.set(K(-1, 1), { role: 'tower' });
  ['l', 'f'].forEach(k => ZONE_BLOCKS[k].forEach(([i, j], n) => STATIC.set(K(i, j), { role: 'zone', kind: k, n })));
  for(let i = -7; i <= 7; i++) if(!STATIC.has(K(i, 0))) STATIC.set(K(i, 0), { role: 'plain' });
  /* ===================================================================================================================================================================================
   * THE CITY GROWS LIKE MELBOURNE. Downtown (the static blocks) sits on the bay shore; from it the city grows along the coastal plain and up the valleys:
   *   · NUCLEI — a handful of suburb centres found on the buildable land (coast and valley mouths first), each with its own size and a head start;
   *   · ARTERIALS — the nuclei are joined to downtown by long, mostly straight corridors of park-block (road on both sides), found by a turn-penalised search so the roads run for kilometres and bend only where
   *     the land makes them;
   *   · A GROWTH FRONT — one multi-source Dijkstra over the buildable lattice cells (slopes and noise cost extra, arterials are cheap): its settling order IS the order blocks appear in, so the city spreads
   *     as ribbons along the arterials and around hills and the sea, in clusters of different sizes, instead of in a circle;
   *   · DENSITY GRADIENT — a block's class comes from how far the front had travelled to reach it: MIDRISE (towers, no private houses) → DENSE (studios, apartments, terraces: 10 lots) → STANDARD (8) → SPACIOUS (6)
   *     → ESTATE (4, large gardens; the only class that may climb the foothills; bayside blocks are spacious-or-better with villas and mansions).
   * Everything is a pure function of the terrain, so house i is always in the same place and the city only ever grows. ============================================================================================================ */
  const RW0 = T.RWY.x0, RW1 = T.RWY.x0 + T.RWY.len, IMIN = -36, IMAX = 40, JMIN = -40, JMAX = 9, NI = IMAX - IMIN + 1, NJ = JMAX - JMIN + 1, cid = (i, j) => (i - IMIN) * NJ + (j - JMIN), inGrid = (i, j) => i >= IMIN && i <= IMAX && j >= JMIN && j <= JMAX;
  const CELL = new Array(NI * NJ);                                    // per lattice cell: terrain verdict { ok: 0 no · 1 estate-only · 2 any, sl: slope, h, shore (m), cx, cz }
  for(let i = IMIN; i <= IMAX; i++) for(let j = JMIN; j <= JMAX; j++){
    const u0 = lineU(i), u1 = lineU(i + 1), v0 = lineV(j), v1 = lineV(j + 1), cp = warp((u0 + u1) / 2, (v0 + v1) / 2); let ok = 2, hmin = 1e9, hmax = -1e9, sh = 0;
    if((u1 > RW0 - 170 && u0 < RW1 + 200 && v1 > -215 && v0 < 215) || T.land(cp[0], cp[1]) < 1) ok = 0;                                           // the runway corridor stays clear; no blocks in the sea
    if(ok) for(const [a, b] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]){ const p = warp(u0 + (u1 - u0) * a, v0 + (v1 - v0) * b), h = T.land(p[0], p[1]); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); if(h < 3.2){ ok = 0; break; } }
    const sl = ok ? (hmax - hmin) / 85 : 9; if(ok){ if(hmax > 135 || sl > 0.2) ok = 0; else if(hmax > 75 || sl > 0.115) ok = 1; }
    CELL[cid(i, j)] = { ok, sl, h: (hmin + hmax) / 2, shore: Math.max(0, T.field(cp[0], cp[1])) * 3500, cx: cp[0], cz: cp[1] };
  }
  const cell = (i, j) => inGrid(i, j) ? CELL[cid(i, j)] : null;
  const passable = (i, j) => { if(STATIC.has(K(i, j))) return true; const c = cell(i, j); return !!c && c.ok > 0; };
  /* tiny binary heap */
  const heap = () => { const a = []; return { push(k, v){ a.push([k, v]); let n = a.length - 1; while(n > 0){ const p = (n - 1) >> 1; if(a[p][0] <= a[n][0]) break; [a[p], a[n]] = [a[n], a[p]]; n = p; } }, pop(){ const t = a[0], l = a.pop(); if(a.length){ a[0] = l; let n = 0; for(;;){ let m = n; const x = 2 * n + 1, y = x + 1; if(x < a.length && a[x][0] < a[m][0]) m = x; if(y < a.length && a[y][0] < a[m][0]) m = y; if(m === n) break; [a[m], a[n]] = [a[n], a[m]]; n = m; } } return t; }, get size(){ return a.length; } }; };
  /* 1 · nuclei: farthest-point sampling over standard-buildable cells, favouring the shore */
  const NUC = [{ i: 0, j: 0, size: 1, off: 0 }];
  { const want = 9; for(let n = 1; n < want; n++){ let best = null; for(let i = IMIN; i <= IMAX; i++) for(let j = JMIN; j <= JMAX; j++){ const c = cell(i, j); if(!c || c.ok !== 2 || STATIC.has(K(i, j))) continue; let dmin = 1e9; for(const q of NUC) dmin = Math.min(dmin, Math.hypot((i - q.i) * SU, (j - q.j) * SV)); if(dmin < 780 || Math.hypot(i * SU, j * SV) > 2700) continue;
        const sc = Math.min(dmin, 1500) + (c.shore < 650 ? 380 : 0) + (c.h < 30 ? 150 : 0) + f01(i + 300, j + 300) * 260 - c.sl * 2500; if(!best || sc > best.sc) best = { i, j, sc }; }
      if(!best) break; NUC.push({ i: best.i, j: best.j, size: 0.5 + f01(best.i + 71, best.j + 5) * 0.4, off: 300 + f01(best.i, best.j + 9) * 380 }); } }
  /* 2 · arterials: nuclei joined to the nearest already-connected one (Prim) by a straight-as-possible corridor of cells */
  const LINK = new Set();
  function corridor(a, b){                                            // Dijkstra over (cell, heading) with a turn penalty → long straight roads
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], N = NI * NJ * 4, dist = new Float64Array(N).fill(1e12), prev = new Int32Array(N).fill(-1), H = heap(), st = (i, j, d) => cid(i, j) * 4 + d;
    for(let d = 0; d < 4; d++){ dist[st(a.i, a.j, d)] = 0; H.push(0, st(a.i, a.j, d)); } let goal = -1;
    while(H.size){ const [c, s] = H.pop(); if(c > dist[s]) continue; const cc = (s / 4) | 0, d = s % 4, i = Math.floor(cc / NJ) + IMIN, j = cc % NJ + JMIN; if(i === b.i && j === b.j){ goal = s; break; }
      for(let nd = 0; nd < 4; nd++){ const ni = i + dirs[nd][0], nj = j + dirs[nd][1]; if(!inGrid(ni, nj) || !passable(ni, nj)) continue; const ce = cell(ni, nj), step = (dirs[nd][0] ? SU : SV) * (1 + (ce && !STATIC.has(K(ni, nj)) ? 4 * ce.sl : 0)) + (nd !== d ? 260 : 0) + (ce && ce.ok === 1 ? 60 : 0), ns = st(ni, nj, nd);
        if(c + step < dist[ns]){ dist[ns] = c + step; prev[ns] = s; H.push(c + step, ns); } } }
    const out = []; for(let s = goal; s >= 0; s = prev[s]){ const cc = (s / 4) | 0; out.push([Math.floor(cc / NJ) + IMIN, cc % NJ + JMIN]); } return out;
  }
  { const done = [0], rest = NUC.map((_, k) => k).slice(1); while(rest.length){ let bp = null; for(const r of rest) for(const d of done){ const dd = Math.hypot((NUC[r].i - NUC[d].i) * SU, (NUC[r].j - NUC[d].j) * SV); if(!bp || dd < bp.dd) bp = { r, d, dd }; } rest.splice(rest.indexOf(bp.r), 1); done.push(bp.r);
      corridor(NUC[bp.d], NUC[bp.r]).forEach(([i, j]) => { if(!STATIC.has(K(i, j))) LINK.add(K(i, j)); }); } }
  /* 3 · the growth front: multi-source Dijkstra; arterials are cheap, hills and noise cost extra; each nucleus has a head start (off) and a size (bigger = the front moves faster) */
  const FRONT = new Map();                                            // key → { i, j, cost (metres of travel, per nucleus size), src }
  { const H = heap(), best = new Map(), put = (i, j, c, src) => { const k = K(i, j), o = best.get(k); if(o === undefined || c < o.c){ best.set(k, { c, src }); H.push(c, [i, j, src]); } };
    STATIC.forEach((v, k) => { const [i, j] = k.split(',').map(Number); put(i, j, 0, 0); }); NUC.forEach((n, q) => { if(q) put(n.i, n.j, n.off, q); });
    while(H.size){ const [c, [i, j, src]] = H.pop(), k = K(i, j), b = best.get(k); if(!b || c > b.c + 1e-6 || b.src !== src) continue; FRONT.set(k, { i, j, c, src });
      for(const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const ni = i + di, nj = j + dj; if(!inGrid(ni, nj) || !passable(ni, nj) || STATIC.has(K(ni, nj))) continue; const ce = cell(ni, nj), arter = LINK.has(K(ni, nj)),
          step = (di ? SU : SV) * (arter ? 0.3 : 1 + 6 * ce.sl + (ce.ok === 1 ? 0.8 : 0) + 0.45 * f01(ni + 500, nj + 500)) / NUC[src].size; put(ni, nj, c + step, src); } } }
  /* 4 · order, classes, capacities */
  const ORDER = [], KINDOF = [], CAP = [], CUM = [], CLS = []; const CLASS = [{ n: 'midrise', per: 0 }, { n: 'dense', per: 5 }, { n: 'standard', per: 4 }, { n: 'spacious', per: 3 }, { n: 'estate', per: 2 }];
  { const arr = []; FRONT.forEach(v => { if(!STATIC.has(K(v.i, v.j))) arr.push(v); }); arr.sort((a, b) => a.c - b.c || a.i - b.i || a.j - b.j); let acc = 0;
    arr.slice(0, 3400).forEach(v => { const key = K(v.i, v.j), n = NUC[v.src], m = (v.c - n.off) * 1, ce = cell(v.i, v.j); let kind = 'res', cls;
      if(LINK.has(key)) kind = 'plain';
      else { cls = m < 170 && v.src === 0 ? 0 : m < 440 ? 1 : m < 950 ? 2 : m < 1700 ? 3 : 4; if(ce.ok === 1) cls = 4; else if(ce.shore < 480 && cls >= 2) cls = 3; if(cls === 0) kind = 'midrise'; }
      ORDER.push([v.i, v.j]); KINDOF.push(kind); CLS.push(cls === undefined ? -1 : cls); const cap = kind === 'res' ? CLASS[cls].per * 2 : 0; CAP.push(cap); acc += cap; CUM.push(acc); }); }
  const ORDER_IDX = new Map(); ORDER.forEach((q, b) => ORDER_IDX.set(K(q[0], q[1]), b));
  let NB = 0, NH = 0, RADIUS = 0;
  function setup(nh){ nh = Math.max(1, nh | 0); if(nh === NH) return; NH = nh; NB = ORDER.length; for(let b = 0; b < ORDER.length; b++) if(CUM[b] >= nh){ NB = b + 1; break; }
    let r = 0; STATIC.forEach((v, k) => { const [i, j] = k.split(',').map(Number); r = Math.max(r, Math.hypot(i * SU, j * SV)); }); for(let b = 0; b < NB; b++) r = Math.max(r, Math.hypot(ORDER[b][0] * SU, ORDER[b][1] * SV)); RADIUS = r + 110; CACHE.clear(); }
  const roleOf = (i, j) => { const s = STATIC.get(K(i, j)); if(s) return s; const b = ORDER_IDX.get(K(i, j)); return b !== undefined && b < NB ? { role: KINDOF[b], b, cls: CLS[b] } : null; };
  const exists = (i, j) => !!roleOf(i, j);
  /* 1 on a block that exists, fading to 0 over ~110 m away from the nearest one (tints the ground, keeps forest out of the city) */
  function builtAt(x, z){ const [u, v] = unwarp(x, z), i0 = Math.floor(u / SU + 0.5), j0 = Math.floor(v / SV + 0.5); let best = 1e9; for(let i = i0 - 1; i <= i0 + 1; i++) for(let j = j0 - 1; j <= j0 + 1; j++){ if(!exists(i, j)) continue; const dx = Math.max(Math.abs(u - i * SU) - SU / 2, 0), dz = Math.max(Math.abs(v - j * SV) - SV / 2, 0); best = Math.min(best, Math.hypot(dx, dz)); } return best >= 1e8 ? 0 : 1 - Math.max(0, Math.min(1, (best - 10) / 110)); }
  /* the part of a block that is not street or pavement: lot area */
  function inner(i, j){ return { uL: lineU(i) + hwOf(i) + SIDE, uR: lineU(i + 1) - hwOf(i + 1) - SIDE, vT: lineV(j) + hwOf(j) + SIDE, vB: lineV(j + 1) - hwOf(j + 1) - SIDE }; }
  /* a street point on the boundary of block (i, j) facing lattice direction (du, dv): { kind:'h'|'v', k, t } */
  const streetPt = (i, j, du, dv, u, v) => du ? { kind: 'v', k: du > 0 ? i + 1 : i, t: v } : { kind: 'h', k: dv > 0 ? j + 1 : j, t: u };
  const CACHE = new Map();
  /* which kinds of home a density class holds (weights); bayside blocks lean to villas and mansions */
  const TYPEW = [null, [['studio', 35], ['apartment', 45], ['townhouse', 20]], [['apartment', 20], ['townhouse', 45], ['house', 35]], [['townhouse', 10], ['house', 55], ['villa', 30], ['mansion', 5]], [['house', 20], ['villa', 45], ['mansion', 35]]], BAYW = [['house', 20], ['villa', 50], ['mansion', 30]];
  function typeOf(idx, cls, bay){ const tw = bay && cls >= 3 ? BAYW : TYPEW[cls]; let tot = 0; tw.forEach(t => { tot += t[1]; }); let r = f01(idx, 777) * tot; for(const t of tw){ r -= t[1]; if(r < 0) return t[0]; } return tw[0][0]; }
  const mkTree = (u, v, s, seed, h) => { const p = warp(u, v); return [p[0], p[1], s, seed, h === undefined ? -1 : h]; };
  function content(i, j){
    const key = K(i, j); let c = CACHE.get(key); if(c) return c; const r = roleOf(i, j); if(!r) return null; const B = inner(i, j), cu = (B.uL + B.uR) / 2, cv = (B.vT + B.vB) / 2;
    c = { i, j, role: r.role, id: r.id, houses: [], pois: [], fillers: [], plots: [], trees: [], lamps: [], benches: [], greens: [], paved: [], ponds: [], B }; const fr0 = frame(cu, cv); c.cx = fr0.x; c.cz = fr0.z;
    const quad = (u0, v0, u1, v1) => [warp(u0, v0), warp(u1, v0), warp(u1, v1), warp(u0, v1)];
    const verge = (skipU) => { for(let u = B.uL + 9, n = 0; u < B.uR - 4; u += 18, n++){ c.trees.push(mkTree(u, B.vT + 1.5, 0.95 + f01(i * 31 + n, j) * 0.4, i * 7 + n)); c.trees.push(mkTree(u + 9, B.vB - 1.5, 0.95 + f01(i + n, j * 17) * 0.4, j * 5 + n)); }
      if(!skipU) for(let v = B.vT + 12, n = 0; v < B.vB - 8; v += 18, n++){ c.trees.push(mkTree(B.uL + 1.5, v, 1, n + i)); c.trees.push(mkTree(B.uR - 1.5, v + 5, 1, n + j)); } };
    const ring = (u0, v0, rad, n, off) => { const c0 = warp(u0, v0); for(let q = 0; q < n; q++){ const a = off + q / n * TAU, p = warp(u0 + Math.cos(a) * rad, v0 + Math.sin(a) * rad * 0.8); c.benches.push([p[0], p[1], Math.atan2(c0[0] - p[0], -(c0[1] - p[1]))]); } };
    /* [x, z, yaw]: yaw turns a model lamp's arm over the street (yaw 0 = north, the same convention as every prop) */
    const face = (u, v, dv) => { const p = warp(u, v), q = warp(u, v + dv); return [p[0], p[1], Math.atan2(q[0] - p[0], -(q[1] - p[1]))]; };
    const lamps = () => { for(let u = B.uL + 14, n = 0; u < B.uR; u += 30, n++){ c.lamps.push(face(u, B.vT - 0.6, -4)); c.lamps.push(face(u + 14, B.vB + 0.6, 4)); } };
    if(r.role === 'res'){
      const n = CLASS[r.cls].per, cap = n * 2, lw = (B.uR - B.uL - 6) / n, mid = (B.vT + B.vB) / 2, base0 = CUM[r.b] - CAP[r.b], bay = (cell(i, j) || {}).shore < 480; c.cls = r.cls; c.className = CLASS[r.cls].n;
      for(let s = 0; s < cap; s++){ const idx = base0 + s, row = s < n ? 0 : 1, k = s % n, g = G.house(idx, typeOf(idx, r.cls, bay)), u = B.uL + 3 + (k + 0.5) * lw, wcap = (g.w = Math.min(g.w, lw - 3.4), g.dp = Math.min(g.dp, (B.vB - B.vT) / 2 - SET - 1.6)), v = row ? B.vB - SET - g.dp / 2 : B.vT + SET + g.dp / 2, fr = frame(u, v), side = row ? 1 : -1;
        const g2 = Object.assign({}, g, { x: fr.x, y: fr.z, ang: fr.tu, side }); c.houses.push({ idx, g: g2, street: streetPt(i, j, 0, side, u, v) });
        // yard tree behind the house, in the lot's own back garden; and a front tree at the pavement (never on it) — the roomier the lots, the more garden
        const back = row ? v - g.dp / 2 - 2.6 - f01(idx, 3) * 2 : v + g.dp / 2 + 2.6 + f01(idx, 3) * 2; if(Math.abs(back - mid) > 3.2 && (r.cls >= 2 || s % 2 === 0)) c.trees.push(mkTree(u + (f01(idx, 4) - 0.5) * (lw - 10), back, 0.9 + f01(idx, 5) * 0.5, idx, idx));
        if(s % 2 === 0 || r.cls >= 3) c.trees.push(mkTree(u + (f01(idx, 6) - 0.5) * 4, row ? B.vB - 1.4 : B.vT + 1.4, 0.9 + f01(idx, 7) * 0.4, idx + 3, idx));
        if(r.cls >= 3) for(const sg of [-1, 1]) c.trees.push(mkTree(u + sg * (g.w / 2 + 3.2 + f01(idx, 8 + sg) * 2.5), v + (f01(idx, 12 + sg) - 0.5) * 3, 1 + f01(idx, 14 + sg) * 0.6, idx + 90 + sg, idx)); }   // roomy lots: garden trees beside the house
      lamps();
    } else if(r.role === 'midrise'){                      // downtown's fringe: towers and apartment blocks along both streets (no private houses)
      const nl = 3, lw = (B.uR - B.uL - 6) / nl, d = 11, w = Math.min(lw - 4, 20); c.cls = 0; c.className = 'midrise';
      for(let s = 0; s < 6; s++){ const row = s < 3 ? 0 : 1, k = s % 3, u = B.uL + 3 + (k + 0.5) * lw, v = row ? B.vB - 6 - d / 2 : B.vT + 6 + d / 2, p = frame(u, v), side = row ? 1 : -1;
        c.fillers.push({ x: p.x, z: p.z, ang: p.ang, side, w, d, fl: 6 + ((f01(i * 5 + s, j * 3 + 1) * 11) | 0), kind: (s + i + j) % 3 === 0 ? 'apartment' : 'office', v: Math.floor(f01(i * 7 + s, j + 13) * 997), street: streetPt(i, j, 0, side, u, v) }); }
      verge(true); lamps();
    } else if(r.role === 'plaza'){ c.paved.push(quad(B.uL + 2, B.vT + 2, B.uR - 2, B.vB - 2)); c.fountain = warp(cu, cv); ring(cu, cv, 11, 8, 0.2); [[-30, -18], [30, -18], [-30, 18], [30, 18]].forEach((o, n) => c.trees.push(mkTree(cu + o[0], cv + o[1], 1.1, n))); verge(true); lamps(); }
    else if(r.role === 'poi' || r.role === 'park'){
      const [bi, bj] = [i, j], du = Math.abs(bi) >= Math.abs(bj) ? -Math.sign(bi) : 0, dv = du ? 0 : -Math.sign(bj), fr = frame(cu, cv), f = dirOf(fr, du, dv);
      if(r.role === 'park'){ c.greens.push(quad(B.uL, B.vT, B.uR, B.vB)); c.park = { x: fr.x, z: fr.z }; c.ponds.push({ x: fr.x, z: fr.z, r: 8 }); ring(cu, cv, 13, 6, 0.5); for(let q = 0; q < 30; q++){ const u = B.uL + 6 + f01(q, 31) * (B.uR - B.uL - 12), v = B.vT + 6 + f01(q, 32) * (B.vB - B.vT - 12); if(Math.hypot(u - cu, (v - cv) * 1.2) > 13) c.trees.push(mkTree(u, v, 1 + f01(q, 33) * 0.5, q)); } c.street = streetPt(i, j, du || 0, dv || 1, cu, cv); }
      else if(VEH_SITES[r.id]){ /* car dealership / private airport: tarmac all over, bays and painted lines laid out in the poi's own (fwd, lat) frame */
        const ang = Math.atan2(-f[0], f[1]); c.pois.push({ id: r.id, x: fr.x, z: fr.z, ang, side: 1, front: f, street: streetPt(i, j, du, dv, cu, cv) }); c.paved.push(quad(B.uL, B.vT, B.uR, B.vB)); c.bay = { id: r.id, cu, cv, du, dv };
        const SI = VEH_SITES[r.id], cs = []; const line = (fwd, lat, l, w, col) => { const p = bayPt(c.bay, fwd, lat); cs.push({ x: p.x, z: p.z, w, l, ang, col }); };
        if(r.id === 'dealer'){ SI.show.concat(SI.lot).forEach(sp => { for(const sg of [-1, 1]) line(sp.fwd, sp.lat + sg * 3.1, 6.2, 0.14, [232, 228, 214]); }); }
        else { line(28, -8.2, 20, 0.22, [236, 196, 52]); line(28, 8.2, 20, 0.22, [236, 196, 52]); line(-26, 0, 40, 0.22, [236, 196, 52]); for(let q = -2; q <= 2; q++) line(17.5, q * 5, 0.8, 3.4, [232, 228, 214]); }
        c.strips = cs; lamps(); }
      else { c.pois.push({ id: r.id, x: fr.x, z: fr.z, ang: Math.atan2(-f[0], f[1]), side: 1, front: f, street: streetPt(i, j, du, dv, cu, cv) });
        for(const sgn of [-1, 1]){ const p = frame(cu + sgn * 24, cv), q = (f01(i + 5, j + 9 + sgn) * 7) | 0, fl = 5 + ((f01(i * 3 + sgn, j + 2) * 9) | 0); c.fillers.push({ x: p.x, z: p.z, ang: p.ang, side: j > 0 ? -1 : 1, w: 13 + f01(i, sgn + 8) * 2, d: 14 + f01(sgn, j + 4) * 2, fl, kind: q % 3 === 0 ? 'apartment' : 'office', v: Math.floor(f01(i + sgn * 7, j + 3) * 997), street: streetPt(i, j, 0, j > 0 ? -1 : 1, cu + sgn * 24, cv) }); } }
      verge(true); lamps();
    } else if(r.role === 'tower'){ const p = frame(cu, cv); c.fillers.push({ x: p.x, z: p.z, ang: p.ang, side: 1, w: 22, d: 20, fl: 16, kind: 'office', v: 411, street: streetPt(i, j, 0, 1, cu, cv) }); verge(true); lamps(); }
    else if(r.role === 'zone'){ c.paved.push(quad(B.uL, B.vT, B.uR, B.vB)); if(r.n < 10){ const cw = (B.uR - B.uL) / 3, rh = (B.vB - B.vT) / 2;
        for(let q = 0; q < 6; q++){ const col = q % 3, row = (q / 3) | 0, u = B.uL + (col + 0.5) * cw, v = B.vT + (row + 0.5) * rh, fr = frame(u, v), side = row ? 1 : -1; c.plots.push({ slot: r.n * 6 + q, kind: r.kind, x: fr.x, z: fr.z, ang: fr.ang, side, w: Math.min(cw - 10, 13), d: Math.min(rh - 9, 11), front: dirOf(fr, 0, side), street: streetPt(i, j, 0, side, u, v) }); } }
      verge(true); lamps(); }
    else if(r.role === 'plain'){ c.greens.push(quad(B.uL, B.vT, B.uR, B.vB)); for(let q = 0; q < 10; q++) c.trees.push(mkTree(B.uL + 8 + f01(i + q, 41) * (B.uR - B.uL - 16), B.vT + 6 + f01(j + q, 43) * (B.vB - B.vT - 12), 0.9 + f01(q, i + 50) * 0.6, q + i)); lamps(); }
    CACHE.set(key, c); if(CACHE.size > 600){ const k0 = CACHE.keys().next().value; CACHE.delete(k0); } return c;
  }
  /* ---- vehicle sites (os/realworld/vehicles.js reads these) ----
   * A site is laid out in the landmark's own frame: fwd = metres out of the front door along the long axis of its block, lat = metres across it (the block is ±40 × ±22 inside its streets).
   * show = the brand-new models on display (the door lane |lat| < 4 stays free), lot = customer parking behind the dealership, rows = the owners' apron behind the terminal (planes are packed along lat between from and to). */
  const VEH_SITES = {
    dealer: { show: [{ fwd: 16, lat: -17 }, { fwd: 16, lat: -10 }, { fwd: 16, lat: 10 }, { fwd: 16, lat: 17 }, { fwd: 29, lat: -14 }, { fwd: 29, lat: 14 }],
      lot: [-18, -9, 0, 9, 18].map(lat => ({ fwd: -22, lat })).concat([-18, -9, 0, 9, 18].map(lat => ({ fwd: -34, lat }))) },
    airport: { show: [{ fwd: 28, lat: -15.5 }, { fwd: 28, lat: 0 }, { fwd: 28, lat: 15 }], rows: [{ fwd: -26, from: -21, to: 21 }] }
  };
  /* world point of a site's (fwd, lat), measured in the block's own lattice so the warp bends it with the street; f = the unit vector out of the front door there */
  function bayPt(bay, fwd, lat){ const u = bay.cu + bay.du * fwd - bay.dv * lat, v = bay.cv + bay.dv * fwd + bay.du * lat, p = warp(u, v), fr = frame(u, v), f = dirOf(fr, bay.du, bay.dv); return { x: p[0], z: p[1], f }; }
  const bayPoint = (id, fwd, lat) => { const bl = POI_BLOCK[id], c = bl && content(bl[0], bl[1]); return c && c.bay ? bayPt(c.bay, fwd, lat) : null; };
  /* a car parked at the kerb in front of a house (house record g from house(i).g): k = 0 | 1, alongside the street, a car's width into the road */
  function kerbSpot(g, k){ const sd = g.side > 0 ? 1 : -1, fx = -sd * Math.sin(g.ang), fz = sd * Math.cos(g.ang), ux = Math.cos(g.ang), uz = Math.sin(g.ang), out = g.dp / 2 + SET + SIDE + 1.5, off = k ? 5.5 : -5.5;
    return { x: g.x + fx * out + ux * off, z: g.y + fz * out + uz * off, yaw: Math.atan2(ux, -uz) }; }
  /* ---- queries ---- */
  const house = idx => { if(!(idx >= 0) || !ORDER.length || idx >= CUM[CUM.length - 1]) return null; let lo = 0, hi = CUM.length - 1; while(lo < hi){ const m = (lo + hi) >> 1; if(CUM[m] > idx) hi = m; else lo = m + 1; }
    const [i, j] = ORDER[lo], keep = NB; NB = Math.max(NB, lo + 1); const c = content(i, j); NB = keep; return c && c.houses[idx - (CUM[lo] - CAP[lo])]; };
  const poi = id => { const bl = POI_BLOCK[id]; if(!bl) return null; const c = content(bl[0], bl[1]); return c.pois[0] || (c.park ? { id, x: c.park.x, z: c.park.z, ang: 0, side: 1, front: [0, 1], street: c.street } : null); };
  const plotLot = (kind, uid) => { const cell = G.plotCell(kind, uid), slot = cell.row * 12 + cell.col, bl = ZONE_BLOCKS[kind][Math.floor(slot / 6)], c = content(bl[0], bl[1]); return c.plots.find(p => p.slot === slot) || null; };
  /* the lattice rectangle (in block indices) that covers a world rectangle, however far the warp has bent the grid there */
  function latRect(x0, z0, x1, z1, pad){ let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for(const [x, z] of [[x0 - pad, z0 - pad], [x1 + pad, z0 - pad], [x0 - pad, z1 + pad], [x1 + pad, z1 + pad], [(x0 + x1) / 2, (z0 + z1) / 2]]){ const [u, v] = unwarp(x, z); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } return { u0: u0 - 14, u1: u1 + 14, v0: v0 - 14, v1: v1 + 14 }; }
  const blocksNear = (x0, z0, x1, z1, pad) => { pad = pad || 22; const out = [], R = latRect(x0, z0, x1, z1, pad), i0 = Math.floor(R.u0 / SU + 0.5) - 1, i1 = Math.ceil(R.u1 / SU + 0.5), j0 = Math.floor(R.v0 / SV + 0.5) - 1, j1 = Math.ceil(R.v1 / SV + 0.5); for(let i = i0; i <= i1; i++) for(let j = j0; j <= j1; j++){ const c = content(i, j); if(c) out.push(c); } return out; };
  /* does the street piece between two crossings exist? */
  const segExists = (kind, k, m) => kind === 'h' ? (exists(m, k - 1) || exists(m, k)) : (exists(k - 1, m) || exists(k, m));
  /* streets (as arrays of lattice segments) that touch a world rectangle */
  function streetsNear(x0, z0, x1, z1){
    const out = [], R = latRect(x0, z0, x1, z1, 22), vk0 = Math.floor(R.v0 / SV + 0.5), vk1 = Math.ceil(R.v1 / SV + 0.5), uk0 = Math.floor(R.u0 / SU + 0.5), uk1 = Math.ceil(R.u1 / SU + 0.5);
    for(let k = vk0; k <= vk1; k++) for(let m = uk0 - 1; m <= uk1; m++) if(segExists('h', k, m)) out.push({ kind: 'h', k, m, a: [lineU(m), lineV(k)], b: [lineU(m + 1), lineV(k)], hw: hwOf(k), ave: isAve(k) });
    for(let k = uk0; k <= uk1; k++) for(let m = vk0 - 1; m <= vk1; m++) if(segExists('v', k, m)) out.push({ kind: 'v', k, m, a: [lineU(k), lineV(m)], b: [lineU(k), lineV(m + 1)], hw: hwOf(k), ave: isAve(k) });
    return out;
  }
  /* ---- routing along the streets (used by the NPCs) ---- */
  const nearIdx = (t, S) => Math.round(t / S + 0.5);
  function nodeOf(P){ if(P.kind === 'h'){ const m = nearIdx(P.t, SU); return [lineU(m), lineV(P.k)]; } const n = nearIdx(P.t, SV); return [lineU(P.k), lineV(n)]; }
  function pathOk(pts){ for(let q = 0; q < pts.length - 1; q++){ const a = pts[q], b = pts[q + 1]; if(a[1] === b[1]){ const k = Math.round(a[1] / SV + 0.5), m0 = Math.min(nearIdx(a[0], SU), nearIdx(b[0], SU)), m1 = Math.max(nearIdx(a[0], SU), nearIdx(b[0], SU)); for(let m = m0; m < m1; m++) if(!segExists('h', k, m)) return false; } else if(a[0] === b[0]){ const k = Math.round(a[0] / SU + 0.5), m0 = Math.min(nearIdx(a[1], SV), nearIdx(b[1], SV)), m1 = Math.max(nearIdx(a[1], SV), nearIdx(b[1], SV)); for(let m = m0; m < m1; m++) if(!segExists('v', k, m)) return false; } } return true; }
  const ptOf = P => P.kind === 'h' ? [P.t, lineV(P.k)] : [lineU(P.k), P.t];
  /* lattice polyline from street point A to street point B */
  function route(A, B){
    const a = ptOf(A), b = ptOf(B), n1 = nodeOf(A), n2 = nodeOf(B), head = [a, n1], tail = [n2, b], opt = [[n1, [n2[0], n1[1]], n2], [n1, [n1[0], n2[1]], n2]];
    let mid = opt.find(pathOk) || opt[0]; return head.concat(mid.slice(1)).concat(tail.slice(0)).filter((p, q, arr) => q === 0 || p[0] !== arr[q - 1][0] || p[1] !== arr[q - 1][1]);
  }
  const bounds = () => ({ x0: -RADIUS, x1: RADIUS, z0: -RADIUS, z1: RADIUS });
  return { builtAt, unwarp, classOf: (i, j) => { const b = ORDER_IDX.get(K(i, j)); return b === undefined ? null : CLASS[CLS[b]] ? CLASS[CLS[b]].n : null; }, NUC, LINK, CLASS, CELL: cell, SU, SV, SIDE, SET, PER, warp, frame, dirOf, lineU, lineV, hwOf, isAve, setup, exists, roleOf, content, house, poi, plotLot, blocksNear, streetsNear, segExists, route, bounds, radius: () => RADIUS, POI_BLOCK, ZONE_BLOCKS, ZONE_NAME, inner, ORDER, VEH_SITES, bayPoint, kerbSpot };
});
