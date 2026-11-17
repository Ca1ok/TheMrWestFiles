/* REALWORLD · chunkgen — turns one 128 m square of WestCountry into a mesh. PURE (runs in the chunk Web Worker, on the main thread as a fallback, and in Node tests).
 *   RWChunk.build(cx, cz, lod, nh) → { cx, cz, lod, mesh, cols, doors, stats }      nh = number of houses that exist (= number of keys in world/own)
 * WHERE things go comes from layout.js (the street lattice: streets, lots, landmarks, trees, lamps — all inside fixed margins, so nothing can overlap); WHAT buildings look like comes from
 * BuildGen (the same pure shape generator as the 2D map and the house previews); the ground from terrain.js. Nothing is downloaded or stored.
 * LEVELS OF DETAIL (chosen by the streamer from the distance to the player):
 *   0  everything: windows and doors, trees, lamps, lane markings, kerbs         1  buildings without windows, simple trees, kerbs
 *   2  plain boxes + asphalt, no trees                                          3  terrain and tall buildings only            4  (map view) every road + every building as a plain box, parks, no props
 * Each chunk is ONE mesh (one draw call). A building / road piece / tree belongs to the chunk that contains its centre, so nothing is drawn twice.
 * Colliders (stride 8): [type 0=box 1=circle, x, z, halfW|radius, halfD, cos, sin, top y]. Doors: { k:'house'|'poi', id, x, z, nx, nz, y }. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js'), require('../lib/buildgen.js'), require('./terrain.js'), require('./mesh.js'), require('./layout.js')); else root.RWChunk = factory(root.WorldGen, root.BuildGen, root.RWTerrain, root.RWMesh, root.RWLayout); })(typeof self !== 'undefined' ? self : this, function(G, BG, T, M, L){
  const CH = 128, { MB, rgb, shade, mix, GLOW } = M, f01 = G.f01, h32 = G.h32, sm = T.sm;
  const RAISE = [0.07, 0.13, 0.32, 0.8, 0.9], SK = [2, 4, 7, 12, 14], RES = [32, 16, 8, 4, 4];   // LOD 4 = the MAP level: every road and building as a plain shape, flat colours, used only by the map view
  const C = { asphalt: [58, 60, 66], hwy: [70, 72, 78], kerb: [172, 170, 162], mark: [228, 222, 190], plaza: [186, 178, 164], park: [88, 158, 70], pad: [150, 148, 142], water: [76, 150, 190], bark: [96, 70, 48], lamp: [70, 74, 82], lampGlow: [255, 224, 160],
    leaf: [[70, 130, 62], [88, 148, 66], [58, 112, 70], [104, 150, 58], [150, 130, 52]], grass: [98, 150, 76], dry: [136, 150, 84], urban: [152, 152, 148], forest: [58, 106, 54] };
  const SLOT = BG.SLOT;

  /* ---------------- ground ---------------- */
  function forestAmt(x, z, b){ return sm(0.5, 0.7, T.vn(x / 70 + 40, z / 70 + 13)) * (1 - sm(0.04, 0.3, b)); }
  function groundColor(x, z, b){
    const n1 = T.vn(x / 23 + 5, z / 23 + 1), n2 = T.vn(x / 5 + 2, z / 5 + 8); let c = mix(C.grass, C.dry, sm(0.5, 0.85, T.vn(x / 90, z / 90 + 3)));
    const fa = forestAmt(x, z, b); if(fa > 0) c = mix(c, C.forest, fa * 0.8);
    const u = 1 - sm(110, 270, Math.hypot(x, z * 1.35)); if(u > 0.02) c = mix(c, C.urban, u * 0.55);
    return shade(c, 0.9 + 0.17 * n1 + 0.05 * n2);
  }
  function terrain(mb, x0, z0, lod){
    const res = RES[lod], st = CH / res, rows = res + 1, H = new Float32Array(rows * rows), base = mb.n;
    for(let j = 0; j < rows; j++) for(let i = 0; i < rows; i++) H[j * rows + i] = T.height(x0 + i * st, z0 + j * st);
    const hAt = (i, j) => (i >= 0 && j >= 0 && i < rows && j < rows) ? H[j * rows + i] : T.height(x0 + i * st, z0 + j * st);
    for(let j = 0; j < rows; j++) for(let i = 0; i < rows; i++){
      const x = x0 + i * st, z = z0 + j * st, nx = (hAt(i - 1, j) - hAt(i + 1, j)) / (2 * st), nz = (hAt(i, j - 1) - hAt(i, j + 1)) / (2 * st), l = Math.hypot(nx, 1, nz);
      mb.v(x, H[j * rows + i], z, nx / l, 1 / l, nz / l, groundColor(x, z, T.built(x, z)));
    }
    for(let j = 0; j < res; j++) for(let i = 0; i < res; i++){ const a = base + j * rows + i, b = a + 1, c = a + rows, d = c + 1; mb.tri(a, c, b); mb.tri(b, c, d); }
    const sk = SK[lod];   // skirts hide the cracks between neighbouring levels of detail
    for(let i = 0; i < res; i++){ const xa = x0 + i * st, xb = xa + st, ca = groundColor(xa, z0, 0.5), ha = H[i], hb = H[i + 1], hc = H[res * rows + i], hd = H[res * rows + i + 1];
      mb.quad([xa, ha, z0], [xb, hb, z0], [xb, hb - sk, z0], [xa, ha - sk, z0], [0, 0, -1], ca); mb.quad([xa, hc, z0 + CH], [xb, hd, z0 + CH], [xb, hd - sk, z0 + CH], [xa, hc - sk, z0 + CH], [0, 0, 1], ca);
      const za = z0 + i * st, zb = za + st, he = H[i * rows], hf = H[(i + 1) * rows], hg = H[i * rows + res], hh = H[(i + 1) * rows + res];
      mb.quad([x0, he, za], [x0, hf, zb], [x0, hf - sk, zb], [x0, he - sk, za], [-1, 0, 0], ca); mb.quad([x0 + CH, hg, za], [x0 + CH, hh, zb], [x0 + CH, hh - sk, zb], [x0 + CH, hg - sk, za], [1, 0, 0], ca); }
  }

  /* ---------------- roads ---------------- */
  /* a street segment is a straight line of the lattice between two crossings, sampled every ≤8 m and bent by the warp; each piece belongs to the chunk holding its middle */
  function roads(mb, x0, z0, lod){
    const R = RAISE[lod], inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH, segs = L.streetsNear(x0, z0, x0 + CH, z0 + CH);
    segs.forEach(sg => {
      if(lod === 3 && !sg.ave) return; const len = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]), n = Math.max(2, Math.ceil(len / 8)), d = [], W = [];
      for(let q = 0; q <= n; q++){ const u = sg.a[0] + (sg.b[0] - sg.a[0]) * q / n, v = sg.a[1] + (sg.b[1] - sg.a[1]) * q / n, p = L.warp(u, v); d.push([p[0], T.height(p[0], p[1]), p[1]]); }
      const col = sg.ave ? C.hwy : C.asphalt, w = sg.hw * 2 * (lod === 4 ? 1.5 : 1); let run = null;
      const flush = () => { if(!run) return; const a = Math.max(0, run[0] - 1), b = Math.min(n, run[1] + 1), seg = d.slice(a, b + 1).map(p => [p[0], p[1] + R, p[2]]);
        if(lod <= 1) mb.ribbon(d.slice(a, b + 1).map(p => [p[0], p[1] + R * 0.5, p[2]]), w + 2 * L.SIDE, C.kerb); mb.ribbon(seg, w, col);
        if(lod === 0) for(let q = run[0]; q < run[1]; q++){ const s0 = q * len / n, xs = L.hwOf(sg.m + (s0 < len / 2 ? 0 : 1)) + 4.5; if(s0 < xs || s0 + len / n > len - xs) continue; const p = d[q], r = d[q + 1], P = t => [p[0] + (r[0] - p[0]) * t, p[1] + R + 0.03, p[2] + (r[2] - p[2]) * t];
          if(sg.ave){ const dx = r[0] - p[0], dz = r[2] - p[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l * 0.3, nz = dx / l * 0.3; [-1, 1].forEach(sd => mb.ribbon([P(0).map((c, ci) => ci === 0 ? c + nx * sd : ci === 2 ? c + nz * sd : c), P(1).map((c, ci) => ci === 0 ? c + nx * sd : ci === 2 ? c + nz * sd : c)], 0.14, [235, 190, 60])); }
          else mb.ribbon([P(0.15), P(0.65)], 0.16, C.mark); }
        run = null; };
      for(let q = 0; q < n; q++){ const mx = (d[q][0] + d[q + 1][0]) / 2, mz = (d[q][2] + d[q + 1][2]) / 2; if(inC(mx, mz)){ if(run) run[1] = q + 1; else run = [q, q + 1]; } else flush(); } flush();
    });
  }
  /* a patch of ground-hugging pavement/grass between four world points (cells of ~8 m so it follows the hills) */
  function patch(mb, quad, col, raise, cell){
    const A = quad[0], B = quad[1], Cc = quad[2], D = quad[3], nu = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / cell)), nv = Math.max(1, Math.ceil(Math.hypot(D[0] - A[0], D[1] - A[1]) / cell)), g = [];
    for(let j = 0; j <= nv; j++){ const r = []; for(let i = 0; i <= nu; i++){ const s = i / nu, t = j / nv, x = (A[0] * (1 - s) + B[0] * s) * (1 - t) + (D[0] * (1 - s) + Cc[0] * s) * t, z = (A[1] * (1 - s) + B[1] * s) * (1 - t) + (D[1] * (1 - s) + Cc[1] * s) * t; r.push([x, T.height(x, z) + raise, z]); } g.push(r); }
    for(let j = 0; j < nv; j++) for(let i = 0; i < nu; i++) mb.quad(g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i], [0, 1, 0], col);
  }

  /* ---------------- buildings ---------------- */
  const sh = (S) => { if(S._rgb) return S._rgb; S._rgb = SLOT.map(n => rgb(S.pal[n] || '#cccccc')); if(!S._kd){ S._kd = true; S.F.forEach(f => { if(f.k) f.k.forEach(k => { k._kid = true; }); }); } return S._rgb; };
  function bakeShape(mb, S, X, Z, ang, side, base, lod, key){
    const V = S.V, F = S.F, pal = sh(S), c0 = Math.cos(ang), s0 = Math.sin(ang), sd = side > 0 ? 1 : -1, pts = [], hc = [];
    for(let fi = 0; fi < F.length; fi++){ const f = F[fi]; if(lod >= 1 && f._kid) continue; if(lod >= 1 && (f.c === 5 || f.c === 6)) continue; const vi = f.v, n = f.n; pts.length = 0; hc.length = 0;
      const base3 = pal[f.c] || [200, 200, 200], roof = f.c === 1 || f.c === 8, glow = f.c === 3;
      for(let i = 0; i < vi.length; i++){ const lx = V[vi[i] * 3], ly = V[vi[i] * 3 + 1] * sd, lz = V[vi[i] * 3 + 2]; pts.push([X + lx * c0 - ly * s0, base + lz + (f.c === 5 || f.c === 6 ? 0.03 : 0), Z + lx * s0 + ly * c0]); const ao = roof ? 1 : 0.78 + 0.22 * sm(0, 4.5, lz); hc.push(shade(base3, ao)); }
      mb.poly(pts, [n[0] * c0 - n[1] * sd * s0, n[2], n[0] * s0 + n[1] * sd * c0], base3, glow ? GLOW : 255, hc);
    }
    mb.boxR(X, Z, S.w / 2 + 0.25, S.d / 2 + 0.25, ang, base - 1.6, base + 0.04, shade(pal[0], 0.62), shade(pal[0], 0.62));
  }
  function bakeBox(mb, X, Z, w, d, ang, base, h, wall, roof, lod){ if(lod === 3 && h < 25) return; mb.boxR(X, Z, w / 2, d / 2, ang, base - 1.4, base + h, wall, roof); }
  function footBase(X, Z, ang, w, d){ const c = Math.cos(ang), s = Math.sin(ang); let m = T.height(X, Z); for(const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ const x = X + c * w / 2 * a - s * d / 2 * b, z = Z + s * w / 2 * a + c * d / 2 * b; m = Math.max(m, T.height(x, z)); } return m + 0.12; }
  /* the door of a shape: the lowest door-coloured face looking out of the front (local +y) */
  function doorOf(S, X, Z, ang, side, base){
    const c0 = Math.cos(ang), s0 = Math.sin(ang), sd = side > 0 ? 1 : -1, V = S.V; let best = null;
    S.F.forEach(f => { if(f.c !== 4 || Math.abs(f.n[2]) > 0.2 || f.n[1] < 0.7) return; let cx = 0, cy = 0, zmin = 1e9; f.v.forEach(i => { cx += V[i * 3]; cy += V[i * 3 + 1]; zmin = Math.min(zmin, V[i * 3 + 2]); }); cx /= f.v.length; cy /= f.v.length; if(!best || zmin < best.z) best = { x: cx, y: cy, z: zmin }; });
    const lx = best ? best.x : 0, ly = best ? best.y : S.d / 2, ly2 = ly + 1.7, nx = -sd * s0 * 1, nz = sd * c0;   // outward = local +y turned
    return { x: X + lx * c0 - ly2 * sd * s0, z: Z + lx * s0 + ly2 * sd * c0, nx, nz, y: base, lx, ly };
  }
  const LMF = { bank: 1, exchange: 1, shop: 1, arcade: 1, agency: 1, hall: 1, uni: 1, lab: 1, ind: 1, plant: 1 };


  /* ---------------- baked models (Kenney city kits via models.js) ---------------- */
  const MD = () => { const R = (typeof self !== 'undefined' ? self : globalThis).RWModels; return R && R.ready ? R : null; };
  const POOL = { house: 'house', townhouse: 'house', villa: 'house', mansion: 'house', studio: 'house', apartment: 'mid' };
  /* first model of the list whose footprint can hold the landmark's interior (cells.js shrinks a room down to about ×0.55) wins */
  const POI_MODEL = { bank: ['m_j', 'm_k', 'm_n'], exchange: ['t_d', 't_c', 'm_n', 'm_j'], shop: ['m_e', 'm_k', 'm_j'], arcade: ['m_i', 'm_k', 'm_e', 'm_j', 'm_n'], agency: ['m_c', 'm_e', 'm_k', 'm_j'], hall: ['m_m', 'm_n', 'm_j', 'm_l'], uni: ['m_n', 'm_j'], lab: ['i_q', 'i_l'], ind: ['i_q', 'i_l', 'i_s'], plant: ['i_l', 'i_q'] };   // all at ×1; first that holds the room wins
  const POI_ROOM = { bank: [22, 16], exchange: [28, 20], shop: [20, 16], arcade: [24, 18], agency: [18, 14], hall: [26, 20], uni: [22, 16], lab: [22, 16], ind: [24, 18], plant: [24, 18] };
  const roomFits = (pk, id) => { const r = POI_ROOM[id] || [14, 10]; return pk && pk.w >= r[0] * 0.55 + 1 && pk.d >= r[1] * 0.55 + 1 ? pk : null; };
  /* a model's placement: centred on (X, Z), its front (−Z) turned to the outward normal (nx, nz). th turns the model about Y (mesh.addMesh convention); `ang` is the matching collider/box angle;
   * door = the approach point 1.7 m in front of the model's real entrance (same convention as doorOf) */
  function placeModel(pk, X, Z, nx, nz){ const th = Math.atan2(-nx, -nz), c = Math.cos(th), s = Math.sin(th), lz = -pk.d / 2 - 1.7; return { th, ang: -th, nx, nz, door: { x: X + pk.dx * c + lz * s, z: Z - pk.dx * s + lz * c } }; }
  /* an interior needs headroom: a model lower than its room is stretched up (at most x1.5 of its own scale, else the procedural building is used). Room heights mirror interiors.js. */
  const POI_H = { bank: 4.4, exchange: 5.4, shop: 4, arcade: 4.2, agency: 3.8, hall: 6, uni: 7.4, lab: 4, ind: 5.2, plant: 7 };
  const homeH = g => { const big = g.type === 'mansion' || g.type === 'villa', lv = (g.type === 'apartment' || g.type === 'studio') ? 1 : Math.max(1, Math.min(g.type === 'mansion' ? 3 : 2, g.fl || 2)); return lv > 1 ? lv * (big ? 3.2 : 2.9) : (big ? 3.8 : 3); };
  function headroom(pk, need){ if(!pk) return null; return pk.h >= need * 1.03 ? pk : null; }   // models are NEVER stretched: one scale (×1) everywhere keeps doors the same height; too short → procedural building
  const PLINTH = [118, 116, 110];
  function stampModel(mb, pk, X, Z, pl, base, lod){ mb.addMesh(lod === 0 ? pk.m.m0 : pk.m.m1, X, base, Z, pl.th, pk.k, null, pk.ky); mb.boxR(X, Z, pk.w / 2 + 0.25, pk.d / 2 + 0.25, pl.ang, base - 1.6, base + 0.04, PLINTH, PLINTH); }

  /* ---------------- scenery ---------------- */
  /* trees, lamps and benches are INSTANCED (props.js): the worker only records where they stand; kind 0 tree · 1 lamp · 2 bench */
  function makeExtra(lod, cols, props){
    return {
      tree(x, z, s, seed){ if(lod > 1) return; const y = T.height(x, z); s = s || 1; props.push(0, x, y, z, (seed | 0) * 2.399, s, ((Math.abs(seed | 0) * 7919) % 997) / 997, 0); cols.push(1, x, z, 0.4 * s, 0, 0, 0, y + 5); },
      lamp(x, z, yaw){ if(lod > 1) return; props.push(1, x, T.height(x, z), z, yaw || 0, 1, 0, 0); },
      bench(x, z, yaw){ if(lod > 1) return; const y = T.height(x, z); props.push(2, x, y, z, yaw, 1, 0, 0); if(lod === 0) cols.push(0, x, z, 0.95, 0.32, Math.cos(yaw), Math.sin(yaw), y + 0.5); }
    };
  }

  function build(cx, cz, lod, nh){
    L.setup(nh); T.setup(L.radius());
    const x0 = cx * CH, z0 = cz * CH, inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;
    const mb = new MB(lod === 0 ? 16384 : 4096), cols = [], doors = [], props = [], stats = { houses: 0, blds: 0 }, ex = makeExtra(lod, cols, props), fine = lod === 0 ? 8 : 16;
    terrain(mb, x0, z0, lod); roads(mb, x0, z0, lod);
    const box = (X, Z, w, d, ang, top) => cols.push(0, X, Z, w / 2 + 0.3, d / 2 + 0.3, Math.cos(ang), Math.sin(ang), top);
    L.blocksNear(x0, z0, x0 + CH, z0 + CH).forEach(b => {
      // ground covers
      if(lod <= 2 || lod === 4){ b.greens.forEach(q => { const m = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); if(inC(m[0], m[1])) patch(mb, q, C.park, 0.07 * (lod + 1), fine * 1.5); });
        b.paved.forEach(q => { const m = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); if(inC(m[0], m[1])) patch(mb, q, b.role === 'plaza' ? C.plaza : C.pad, 0.06 * (lod + 1), fine * 1.5); }); }
      if(lod <= 1) b.ponds.forEach(p => { if(inC(p.x, p.z)){ const y = T.height(p.x, p.z); mb.cyl(p.x, p.z, y + 0.1, y + 0.16, p.r, 18, C.water); } });
      if(b.fountain && lod <= 1 && inC(b.fountain[0], b.fountain[1])){ const [fx, fz] = b.fountain, y = T.height(fx, fz); mb.cyl(fx, fz, y + 0.06, y + 1.0, 4.2, 18, [150, 146, 138], C.plaza); mb.cyl(fx, fz, y + 0.95, y + 1.02, 3.7, 18, C.water); mb.cyl(fx, fz, y + 0.95, y + 3.4, 0.35, 6, [190, 186, 176]); cols.push(1, fx, fz, 4.5, 0, 0, 0, y + 1); }
      // houses
      b.houses.forEach(h => { if(h.idx >= nh) return; const g = h.g; if(!inC(g.x, g.y)) return; stats.houses++; const base = footBase(g.x, g.y, g.ang, g.w, g.dp), R = lod <= 3 ? MD() : null, sd = g.side > 0 ? 1 : -1;
        const pk = R && headroom(R.pick(R.ofKind(POOL[g.type] || 'house'), g.w, g.dp, g.ht * 1.35, G.h32(h.idx, 21), { maxK: 1, minK: 1 }), homeH(g));
        if(pk){ const pl = placeModel(pk, g.x, g.y, -sd * Math.sin(g.ang), sd * Math.cos(g.ang)); box(g.x, g.y, pk.w, pk.d, pl.ang, base + pk.h);
          if(lod <= 1){ stampModel(mb, pk, g.x, g.y, pl, base, lod); doors.push({ k: 'house', id: g.id, i: h.idx, x: pl.door.x, z: pl.door.z, nx: pl.nx, nz: pl.nz, y: base, addr: g.addr, type: g.type, beds: g.beds, w: g.w, dp: g.dp, bx: g.x, bz: g.y, rw: pk.w, rd: pk.d, fl: g.fl, bh: pk.h, model: pk.m.id }); }
          else bakeBox(mb, g.x, g.y, pk.w, pk.d, pl.ang, base, pk.h, rgb(BG.WALL[G.h32(h.idx, 3) % BG.WALL.length]), rgb(BG.ROOF[G.h32(h.idx, 4) % BG.ROOF.length]), lod); return; }
        box(g.x, g.y, g.w, g.dp, g.ang, base + g.ht);
        if(lod <= 1){ const S = BG.shape(g); bakeShape(mb, S, g.x, g.y, g.ang, g.side, base, lod); const dr = doorOf(S, g.x, g.y, g.ang, g.side, base); doors.push({ k: 'house', id: g.id, i: h.idx, x: dr.x, z: dr.z, nx: dr.nx, nz: dr.nz, y: base, addr: g.addr, type: g.type, beds: g.beds, w: g.w, dp: g.dp, bx: g.x, bz: g.y, rw: S.w, rd: dr.ly + S.d / 2, fl: S.fl, bh: S.h }); }
        else bakeBox(mb, g.x, g.y, g.w, g.dp, g.ang, base, g.ht, rgb(BG.WALL[G.h32(h.idx, 3) % BG.WALL.length]), rgb(BG.ROOF[G.h32(h.idx, 4) % BG.ROOF.length]), lod); });
      // landmarks
      b.pois.forEach(p => { if(!inC(p.x, p.z)) return; const S = BG.landmark(p.id), base = footBase(p.x, p.z, p.ang, S.w, S.d), R = lod <= 3 ? MD() : null;
        let pk = null; if(R) for(const mid of POI_MODEL[p.id] || []){ pk = roomFits(headroom(R.pick([mid], S.w, S.d, 0, 0, { maxK: 1, minK: 1, minCover: 0.3 }), POI_H[p.id] || 4), p.id); if(pk) break; }
        if(pk){ const pl = placeModel(pk, p.x, p.z, -Math.sin(p.ang), Math.cos(p.ang)); box(p.x, p.z, pk.w, pk.d, pl.ang, base + pk.h);
          if(lod <= 1){ stampModel(mb, pk, p.x, p.z, pl, base, lod); doors.push({ k: 'poi', id: p.id, x: pl.door.x, z: pl.door.z, nx: pl.nx, nz: pl.nz, y: base, name: G.POIS[p.id] && G.POIS[p.id].n, bx: p.x, bz: p.z, rw: pk.w, rd: pk.d, fl: S.fl, bh: pk.h, model: pk.m.id }); }
          else bakeBox(mb, p.x, p.z, pk.w, pk.d, pl.ang, base, pk.h, rgb(S.pal.wall), rgb(S.pal.roof), lod); return; }
        box(p.x, p.z, S.w, S.d, p.ang, base + S.h);
        if(lod <= 1){ bakeShape(mb, S, p.x, p.z, p.ang, 1, base, lod); const dr = doorOf(S, p.x, p.z, p.ang, 1, base); doors.push({ k: 'poi', id: p.id, x: dr.x, z: dr.z, nx: dr.nx, nz: dr.nz, y: base, name: G.POIS[p.id] && G.POIS[p.id].n, bx: p.x, bz: p.z, rw: S.w, rd: dr.ly + S.d / 2, fl: S.fl, bh: S.h }); }
        else bakeBox(mb, p.x, p.z, S.w, S.d, p.ang, base, S.h, rgb(S.pal.wall), rgb(S.pal.roof), lod); });
      // downtown infill towers
      b.fillers.forEach((f, fi) => { if(!inC(f.x, f.z)) return; stats.blds++; const base = footBase(f.x, f.z, f.ang, f.w, f.d), hgt = f.fl * 3.1 + 2, R = lod <= 3 ? MD() : null, sd = f.side > 0 ? 1 : -1;
        const pk = R && R.pick(R.ofKind('tower').concat(R.ofKind('mid')), f.w, f.d, 0, G.h32(f.v, 31), { maxK: 1, minK: 1, minCover: 0.45 });
        if(pk){ pk.ky = Math.max(0.7 * pk.k, Math.min(1.7 * pk.k, hgt / pk.m.h)); pk.h = pk.m.h * pk.ky; const pl = placeModel(pk, f.x, f.z, -sd * Math.sin(f.ang), sd * Math.cos(f.ang)); box(f.x, f.z, pk.w, pk.d, pl.ang, base + pk.h);
          if(lod <= 1) stampModel(mb, pk, f.x, f.z, pl, base, lod); else bakeBox(mb, f.x, f.z, pk.w, pk.d, pl.ang, base, pk.h, rgb(BG.WALL[G.h32(f.v, 9) % BG.WALL.length]), rgb(BG.GLASSW[G.h32(f.v, 10) % BG.GLASSW.length]), lod); return; }
        box(f.x, f.z, f.w, f.d, f.ang, base + hgt);
        if(lod <= 1) bakeShape(mb, BG.proto(f.kind, f.w, f.d, f.fl, f.v), f.x, f.z, f.ang, f.side, base, lod); else bakeBox(mb, f.x, f.z, f.w, f.d, f.ang, base, hgt, rgb(BG.WALL[G.h32(f.v, 9) % BG.WALL.length]), rgb(BG.GLASSW[G.h32(f.v, 10) % BG.GLASSW.length]), lod); });
      if(lod === 0) b.plots.forEach(p => { if(inC(p.x, p.z)){ const y = T.height(p.x, p.z); mb.boxR(p.x, p.z, p.w / 2 + 1.5, p.d / 2 + 1.5, p.ang, y - 0.3, y + 0.1, [176, 174, 168], [176, 174, 168]); } });
      b.trees.forEach(t => { if(t[4] >= nh) return; if(inC(t[0], t[1])) ex.tree(t[0], t[1], t[2], t[3]); });
      b.lamps.forEach(l => { if(inC(l[0], l[1])) ex.lamp(l[0], l[1], l[2]); });
      b.benches.forEach(q => { if(inC(q[0], q[1])) ex.bench(q[0], q[1], q[2]); });
    });
    // wild trees outside the built-up area (never inside the city: the plateau and its streets end well before)
    if(lod <= 1) for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ const x = x0 + i * 16 + f01(cx * 8 + i, cz * 8 + j) * 14, z = z0 + j * 16 + f01(cz * 8 + j, cx * 8 + i + 99) * 14; const bl = T.built(x, z); if(bl > 0.12) continue; const fa = forestAmt(x, z, bl), r = f01(cx * 8 + i + 400, cz * 8 + j); if(r < 0.06 + fa * 0.6) ex.tree(x, z, 0.8 + f01(i, j + cx) * 0.7, i * 8 + j); }
    return { cx, cz, lod, mesh: mb.finish(), cols: new Float32Array(cols), doors, props: new Float32Array(props), stats };
  }
  return { CH, build, RES };
});
