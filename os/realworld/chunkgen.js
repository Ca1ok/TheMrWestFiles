/* REALWORLD · chunkgen — turns one 128 m square of WestCountry into a mesh. PURE (runs in the chunk Web Worker, on the main thread as a fallback, and in Node tests).
 *   RWChunk.build(cx, cz, lod, nh) → { cx, cz, lod, mesh, cols, doors, stats }      nh = number of houses that exist (= number of keys in world/own)
 * Everything comes from the same pure generators as the 2D map: WorldGen (districts, streets, highways, houses, downtown, plots) and BuildGen (building shapes, the infill city
 * between districts), on top of RWTerrain (the hills). So the 3D world and the map can never disagree, and nothing is ever downloaded or stored.
 * LEVELS OF DETAIL (chosen by the streamer from the distance to the player):
 *   0  everything: windows and doors, trees, lamps, lane markings, kerbs         1  buildings without windows, simple trees, kerbs
 *   2  plain boxes + asphalt, no trees                                          3  terrain, highways and tall buildings only
 * Each chunk is ONE mesh (one draw call). A building / road piece / tree belongs to the chunk that contains its centre, so nothing is drawn twice.
 * Colliders (stride 8): [type 0=box 1=circle, x, z, halfW|radius, halfD, cos, sin, top y]. Doors: { k:'house'|'poi', id, x, z, nx, nz, y }. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js'), require('../lib/buildgen.js'), require('./terrain.js'), require('./mesh.js')); else root.RWChunk = factory(root.WorldGen, root.BuildGen, root.RWTerrain, root.RWMesh); })(typeof self !== 'undefined' ? self : this, function(G, BG, T, M){
  const CH = 128, { MB, rgb, shade, mix, GLOW } = M, f01 = G.f01, h32 = G.h32, sm = T.sm;
  const RAISE = [0.07, 0.13, 0.32, 0.8], SK = [2, 4, 7, 12], RES = [32, 16, 8, 4];
  const C = { asphalt: [58, 60, 66], hwy: [70, 72, 78], kerb: [172, 170, 162], mark: [228, 222, 190], plaza: [186, 178, 164], park: [88, 158, 70], pad: [150, 148, 142], water: [76, 150, 190], bark: [96, 70, 48], lamp: [70, 74, 82], lampGlow: [255, 224, 160],
    leaf: [[70, 130, 62], [88, 148, 66], [58, 112, 70], [104, 150, 58], [150, 130, 52]], grass: [98, 150, 76], dry: [136, 150, 84], urban: [152, 152, 148], forest: [58, 106, 54] };
  const SLOT = BG.SLOT;

  /* ---------------- ground ---------------- */
  function forestAmt(x, z, b){ return sm(0.5, 0.7, T.vn(x / 70 + 40, z / 70 + 13)) * (1 - sm(0.04, 0.3, b)); }
  function groundColor(x, z, nd, b){
    const n1 = T.vn(x / 23 + 5, z / 23 + 1), n2 = T.vn(x / 5 + 2, z / 5 + 8); let c = mix(C.grass, C.dry, sm(0.5, 0.85, T.vn(x / 90, z / 90 + 3)));
    const fa = forestAmt(x, z, b); if(fa > 0) c = mix(c, C.forest, fa * 0.8);
    const u = BG.urban(x, z, nd); if(u > 0.2) c = mix(c, C.urban, sm(0.2, 0.7, u) * 0.55);
    return shade(c, 0.9 + 0.17 * n1 + 0.05 * n2);
  }
  function terrain(mb, x0, z0, lod, nd){
    const res = RES[lod], st = CH / res, rows = res + 1, H = new Float32Array(rows * rows), base = mb.n;
    for(let j = 0; j < rows; j++) for(let i = 0; i < rows; i++) H[j * rows + i] = T.height(x0 + i * st, z0 + j * st);
    const hAt = (i, j) => (i >= 0 && j >= 0 && i < rows && j < rows) ? H[j * rows + i] : T.height(x0 + i * st, z0 + j * st);
    for(let j = 0; j < rows; j++) for(let i = 0; i < rows; i++){
      const x = x0 + i * st, z = z0 + j * st, nx = (hAt(i - 1, j) - hAt(i + 1, j)) / (2 * st), nz = (hAt(i, j - 1) - hAt(i, j + 1)) / (2 * st), l = Math.hypot(nx, 1, nz);
      mb.v(x, H[j * rows + i], z, nx / l, 1 / l, nz / l, groundColor(x, z, nd, T.built(x, z)));
    }
    for(let j = 0; j < res; j++) for(let i = 0; i < res; i++){ const a = base + j * rows + i, b = a + 1, c = a + rows, d = c + 1; mb.tri(a, c, b); mb.tri(b, c, d); }
    const sk = SK[lod];   // skirts hide the cracks between neighbouring levels of detail
    for(let i = 0; i < res; i++){ const xa = x0 + i * st, xb = xa + st, ca = groundColor(xa, z0, nd, 0.5), ha = H[i], hb = H[i + 1], hc = H[res * rows + i], hd = H[res * rows + i + 1];
      mb.quad([xa, ha, z0], [xb, hb, z0], [xb, hb - sk, z0], [xa, ha - sk, z0], [0, 0, -1], ca); mb.quad([xa, hc, z0 + CH], [xb, hd, z0 + CH], [xb, hd - sk, z0 + CH], [xa, hc - sk, z0 + CH], [0, 0, 1], ca);
      const za = z0 + i * st, zb = za + st, he = H[i * rows], hf = H[(i + 1) * rows], hg = H[i * rows + res], hh = H[(i + 1) * rows + res];
      mb.quad([x0, he, za], [x0, hf, zb], [x0, hf - sk, zb], [x0, he - sk, za], [-1, 0, 0], ca); mb.quad([x0 + CH, hg, za], [x0 + CH, hh, zb], [x0 + CH, hh - sk, zb], [x0 + CH, hg - sk, za], [1, 0, 0], ca); }
  }

  /* ---------------- roads ---------------- */
  function dense(pts, maxStep){ const d = [[pts[0][0], pts[0][1]]]; for(let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxStep)); for(let s = 1; s <= n; s++) d.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); } return d; }
  function collectRoads(x0, z0, nd, lod){
    const mx = x0 + CH / 2, mz = z0 + CH / 2, out = [], near = (x, z, r) => Math.abs(x - mx) < CH / 2 + r && Math.abs(z - mz) < CH / 2 + r;
    for(let k = 0; k < nd; k++){ const d = G.district(k); if(!near(d.cx, d.cy, 200)) continue; G.roads(k).forEach(r => out.push({ pts: r.pts, w: r.avenue ? 10 : 8, k: 'st', lamps: lod === 0 })); }
    G.highways(nd).forEach(e => { let hit = false; for(let i = 0; i < e.pts.length; i++) if(near(e.pts[i][0], e.pts[i][1], 40)){ hit = true; break; } if(hit) out.push({ pts: e.pts, w: e.express ? 14 : 12, k: 'hw' }); });
    if(lod <= 2){ BG.tilesIn(mx - CH / 2 - 14, mz - CH / 2 - 14, mx + CH / 2 + 14, mz + CH / 2 + 14).forEach(([tx, ty]) => BG.infill(tx, ty, nd).rd.forEach(r => out.push({ pts: [r.a, r.b], w: r.U > 0.4 ? 7 : 6, k: 'loc' })));
      BG.links(nd).forEach(l => { if(near(l.pts[0][0], l.pts[0][1], 110)) out.push({ pts: l.pts, w: 6, k: 'loc' }); }); }
    const C0 = G.CORE; ['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'park'].forEach(id => { const p = G.POIS[id]; if(near((p.x + C0.x) / 2, (p.y + C0.y) / 2, 60)) out.push({ pts: [[C0.x, C0.y], [p.x, p.y]], w: 10, k: 'core', lamps: lod === 0 }); });
    [[-60, -40, 60, -40], [60, -40, 60, 40], [60, 40, -60, 40], [-60, 40, -60, -40]].forEach(s => { if(near(C0.x + (s[0] + s[2]) / 2, C0.y + (s[1] + s[3]) / 2, 70)) out.push({ pts: [[C0.x + s[0], C0.y + s[1]], [C0.x + s[2], C0.y + s[3]]], w: 9, k: 'core', lamps: lod === 0 }); });
    return out;
  }
  function roads(mb, x0, z0, nd, lod, extra){
    const R = RAISE[lod], inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH, list = collectRoads(x0, z0, nd, lod);
    list.forEach(r => {
      if(lod === 3 && r.k !== 'hw') return; const d = dense(r.pts, r.k === 'hw' ? 14 : 10), P = (p, up) => [p[0], T.height(p[0], p[1]) + up, p[1]], col = r.k === 'hw' ? C.hwy : C.asphalt;
      let run = null; const flush = () => { if(!run) return; const a = Math.max(0, run[0] - 1), b = Math.min(d.length - 1, run[1] + 1), seg = d.slice(a, b + 1);
        if(lod <= 1 && r.k !== 'hw') mb.ribbon(seg.map(p => P(p, R - 0.03)), r.w + 4.4, C.kerb); mb.ribbon(seg.map(p => P(p, R)), r.w, col);
        if(lod === 0 && r.w >= 7) for(let i = a; i < b; i++){ const p = d[i], q = d[i + 1]; mb.ribbon([P([p[0] + (q[0] - p[0]) * 0.15, p[1] + (q[1] - p[1]) * 0.15], R + 0.025), P([p[0] + (q[0] - p[0]) * 0.65, p[1] + (q[1] - p[1]) * 0.65], R + 0.025)], 0.18, C.mark); }
        run = null; };
      for(let i = 0; i < d.length - 1; i++){ const mx = (d[i][0] + d[i + 1][0]) / 2, mz = (d[i][1] + d[i + 1][1]) / 2; if(inC(mx, mz)){ if(run) run[1] = i + 1; else run = [i, i + 1]; } else flush(); } flush();
      if(r.lamps && lod === 0){ let acc = 15, side = 1, idx = 0; for(let i = 0; i < d.length - 1; i++){ const p = d[i], q = d[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]); acc += L; if(acc >= 30 && L > 0.01){ acc = 0; const t = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], o = r.w / 2 + 1.9, x = p[0] - t[1] * o * side, z = p[1] + t[0] * o * side; if(inC(x, z)) extra.lamp(x, z, side, t); if(idx % 2 === 1 && inC(x, z)) extra.tree(p[0] + t[1] * (r.w / 2 + 3) * side, p[1] - t[0] * (r.w / 2 + 3) * side, 0.9 + f01(idx, 5) * 0.4, idx); side = -side; idx++; } } }
    });
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
    return { x: X + lx * c0 - ly2 * sd * s0, z: Z + lx * s0 + ly2 * sd * c0, nx, nz, y: base };
  }
  const LMF = { bank: 1, exchange: 1, shop: 1, arcade: 1, agency: 1, hall: 1, uni: 1, lab: 1, ind: 1, plant: 1 };

  /* ---------------- scenery ---------------- */
  function makeExtra(mb, lod, cols, inC){
    return {
      tree(x, z, s, seed){ const y = T.height(x, z), lc = C.leaf[(seed | 0) % C.leaf.length]; s = s || 1;
        if(lod === 0){ mb.cyl(x, z, y - 0.1, y + 2.1 * s, 0.17 * s, 5, C.bark); mb.cone(x, z, y + 1.4 * s, y + 4.6 * s, 2.1 * s, 7, lc); mb.cone(x, z, y + 3.2 * s, y + 6.4 * s, 1.5 * s, 7, shade(lc, 1.12)); }
        else if(lod === 1) mb.cone(x, z, y, y + 5.5 * s, 1.9 * s, 5, lc);
        else return; cols.push(1, x, z, 0.4 * s, 0, 0, 0, y + 5); },
      lamp(x, z, side, t){ if(lod > 0) return; const y = T.height(x, z); mb.cyl(x, z, y, y + 4.9, 0.07, 4, C.lamp); mb.boxAA(x - 0.35, y + 4.85, z - 0.35, x + 0.35, y + 5.05, z + 0.35, C.lampGlow, C.lampGlow, GLOW); }
    };
  }

  function build(cx, cz, lod, nh){
    const nd = G.districtCount(nh); T.setup(nd);
    const x0 = cx * CH, z0 = cz * CH, mx = x0 + CH / 2, mz = z0 + CH / 2, inC = (x, z) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH, near = (x, z, r) => Math.abs(x - mx) < CH / 2 + r && Math.abs(z - mz) < CH / 2 + r;
    const mb = new MB(lod === 0 ? 16384 : 4096), cols = [], doors = [], stats = { houses: 0, blds: 0 }, ex = makeExtra(mb, lod, cols, inC);
    terrain(mb, x0, z0, lod, nd); roads(mb, x0, z0, nd, lod, ex);
    const box = (X, Z, w, d, ang) => cols.push(0, X, Z, w / 2 + 0.3, d / 2 + 0.3, Math.cos(ang), Math.sin(ang), 0);
    // ---- houses of the districts
    for(let k = 0; k < nd; k++){ const dd = G.district(k); if(!near(dd.cx, dd.cy, 210)) continue;
      for(let s = 0; s < G.PER; s++){ const i = k * G.PER + s; if(i >= nh) break; const g = G.house(i); if(!inC(g.x, g.y)) continue; stats.houses++; const base = footBase(g.x, g.y, g.ang, g.w, g.dp); box(g.x, g.y, g.w, g.dp, g.ang); cols[cols.length - 1] = base + g.ht;
        if(lod <= 1){ const S = BG.shape(g); bakeShape(mb, S, g.x, g.y, g.ang, g.side, base, lod); const dr = doorOf(S, g.x, g.y, g.ang, g.side, base); doors.push({ k: 'house', id: g.id, i, x: dr.x, z: dr.z, nx: dr.nx, nz: dr.nz, y: base, addr: g.addr, type: g.type, beds: g.beds, w: g.w, dp: g.dp }); }
        else bakeBox(mb, g.x, g.y, g.w, g.dp, g.ang, base, g.ht, rgb(BG.WALL[h32(i, 3) % BG.WALL.length]), rgb(BG.ROOF[h32(i, 4) % BG.ROOF.length]), lod);
        if(lod <= 1 && g.type !== 'apartment'){ const c0 = Math.cos(g.ang), s0 = Math.sin(g.ang), back = -(g.dp / 2 + 3.2 + f01(i, 6) * 3), lat = (f01(i, 7) - 0.5) * g.w; ex.tree(g.x + c0 * lat + s0 * g.side * back, g.y + s0 * lat - c0 * g.side * back, 0.9 + f01(i, 8) * 0.5, i); }
      }
    }
    // ---- downtown landmarks + blocks
    const hub = G.CORE;
    for(const id in G.POIS){ if(!LMF[id]) continue; const p = G.POIS[id]; if(!inC(p.x, p.y)) continue; const L = BG.landmark(id), ang = Math.atan2(-(hub.x - p.x), (hub.y - p.y)) || 0, base = footBase(p.x, p.y, ang, L.w, L.d); box(p.x, p.y, L.w, L.d, ang); cols[cols.length - 1] = base + L.h;
      if(lod <= 1){ bakeShape(mb, L, p.x, p.y, ang, 1, base, lod); const dr = doorOf(L, p.x, p.y, ang, 1, base); doors.push({ k: 'poi', id, x: dr.x, z: dr.z, nx: dr.nx, nz: dr.nz, y: base, name: p.n }); }
      else bakeBox(mb, p.x, p.y, L.w, L.d, ang, base, L.h, rgb(L.pal.wall), rgb(L.pal.roof), lod); }
    if(near(hub.x, hub.y, 120)){ G.coreBlocks().forEach((c, ci) => { if(!inC(c.x, c.y)) return; const base = footBase(c.x, c.y, 0, c.w, c.d); box(c.x, c.y, c.w, c.d, 0); cols[cols.length - 1] = base + c.h;
        if(lod <= 1) bakeShape(mb, BG.proto(c.kind, c.w, c.d, c.fl, c.v), c.x, c.y, 0, 1, base, lod); else bakeBox(mb, c.x, c.y, c.w, c.d, 0, base, c.h, rgb(BG.WALL[h32(ci, 9) % BG.WALL.length]), rgb(BG.GLASSW[h32(ci, 10) % BG.GLASSW.length]), lod); }); }
    // ---- the city between the districts (BuildGen.infill)
    if(lod <= 2) BG.tilesIn(x0 - 14, z0 - 14, x0 + CH + 14, z0 + CH + 14).forEach(([tx, ty]) => { const t = BG.infill(tx, ty, nd);
      t.b.forEach((b, bi) => { if(!inC(b.x, b.y)) return; stats.blds++; const base = footBase(b.x, b.y, b.a, b.w, b.d); box(b.x, b.y, b.w, b.d, b.a); cols[cols.length - 1] = base + b.fl * 3.1 + 2;
        if(lod <= 1) bakeShape(mb, BG.protoOf(b), b.x, b.y, b.a, 1, base, lod); else bakeBox(mb, b.x, b.y, b.w, b.d, b.a, base, b.fl * 3.1 + 2, rgb(BG.WALL[h32(bi, b.v) % BG.WALL.length]), rgb(BG.ROOF[h32(b.v, 2) % BG.ROOF.length]), lod); });
      if(lod <= 1){ t.tr.forEach((q, qi) => { if(inC(q[0], q[1])) ex.tree(q[0], q[1], q[2], qi + tx); });
        t.gr.forEach((q, qi) => { if(q[3] && inC(q[0], q[1])){ const h = T.height(q[0], q[1]); mb.quad([q[0] - 12, h + 0.06, q[1] - 12], [q[0] + 12, h + 0.06, q[1] - 12], [q[0] + 12, h + 0.06, q[1] + 12], [q[0] - 12, h + 0.06, q[1] + 12], [0, 1, 0], C.park); for(let a = 0; a < 3; a++) ex.tree(q[0] + (f01(qi, a + 1) - 0.5) * 18, q[1] + (f01(qi, a + 11) - 0.5) * 18, 1 + f01(qi, a) * 0.4, qi + a); } }); } });
    // ---- the two campuses (paved lots; the buildings on them are dynamic: one per player who bought a plot)
    [G.ZONES.uni, G.ZONES.ind].forEach(z => { if(lod > 2 || z.x1 < x0 || z.x0 > x0 + CH || z.y1 < z0 || z.y0 > z0 + CH) return; const ax = Math.max(z.x0 - 6, x0), bx = Math.min(z.x1 + 6, x0 + CH), az = Math.max(z.y0 - 6, z0), bz = Math.min(z.y1 + 6, z0 + CH), y = T.height((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2) + 0.1;
      if(bx > ax && bz > az) mb.quad([ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz], [0, 1, 0], C.pad);
      if(lod === 0){ const cw = (z.x1 - z.x0) / z.cols, rh = (z.y1 - z.y0) / z.rows; for(let i = 0; i <= z.cols; i++){ const x = z.x0 + i * cw; if(x >= x0 && x < x0 + CH) mb.quad([x - 0.1, y + 0.02, Math.max(z.y0, z0)], [x + 0.1, y + 0.02, Math.max(z.y0, z0)], [x + 0.1, y + 0.02, Math.min(z.y1, z0 + CH)], [x - 0.1, y + 0.02, Math.min(z.y1, z0 + CH)], [0, 1, 0], C.mark); }
        for(let j = 0; j <= z.rows; j++){ const zz = z.y0 + j * rh; if(zz >= z0 && zz < z0 + CH) mb.quad([Math.max(z.x0, x0), y + 0.02, zz - 0.1], [Math.min(z.x1, x0 + CH), y + 0.02, zz - 0.1], [Math.min(z.x1, x0 + CH), y + 0.02, zz + 0.1], [Math.max(z.x0, x0), y + 0.02, zz + 0.1], [0, 1, 0], C.mark); } } });
    // ---- town square, parks
    if(lod <= 1 && inC(hub.x, hub.y)){ const y = T.height(hub.x, hub.y); mb.cyl(hub.x, hub.y, y + 0.02, y + 0.1, 17, 28, C.plaza); mb.cyl(hub.x, hub.y, y + 0.1, y + 0.95, 4.2, 18, [150, 146, 138], C.plaza); mb.cyl(hub.x, hub.y, y + 0.9, y + 0.96, 3.7, 18, C.water); mb.cyl(hub.x, hub.y, y + 0.9, y + 3.4, 0.35, 6, [190, 186, 176]); cols.push(1, hub.x, hub.y, 4.4, 0, 0, 0, y + 1); }
    const pk = G.POIS.park; if(lod <= 2 && near(pk.x, pk.y, 60)){ const ax = Math.max(pk.x - 48, x0), bx = Math.min(pk.x + 48, x0 + CH), az = Math.max(pk.y - 31, z0), bz = Math.min(pk.y + 31, z0 + CH);
      if(bx > ax && bz > az){ const y = T.height(pk.x, pk.y) + 0.08; mb.quad([ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz], [0, 1, 0], C.park); }
      if(lod <= 1){ for(let q = 0; q < 26; q++){ const x = pk.x - 44 + f01(q, 31) * 88, z = pk.y - 28 + f01(q, 32) * 56; if(inC(x, z) && Math.hypot(x - pk.x, z - pk.y) > 11) ex.tree(x, z, 1 + f01(q, 33) * 0.5, q); }
        if(inC(pk.x, pk.y)){ const y = T.height(pk.x, pk.y); mb.cyl(pk.x, pk.y, y + 0.05, y + 0.12, 9, 20, C.water); cols.push(1, pk.x, pk.y, 8.2, 0, 0, 0, y); } } }
    if(lod <= 2) for(let k = 0; k < nd; k++){ const dd = G.district(k); if(!near(dd.cx, dd.cy, 200)) continue; G.parks(k).forEach((poly, pi) => { const cxp = (poly[0][0] + poly[2][0]) / 2, czp = (poly[0][1] + poly[2][1]) / 2; if(!inC(cxp, czp)) return; const y = T.height(cxp, czp) + 0.07; mb.poly(poly.map(p => [p[0], y, p[1]]), [0, 1, 0], C.park);
      if(lod <= 1) for(let q = 0; q < 7; q++){ const a = f01(k * 7 + pi, q + 40), b = f01(k * 7 + pi, q + 60), p = [poly[0][0] + (poly[1][0] - poly[0][0]) * a + (poly[3][0] - poly[0][0]) * b, poly[0][1] + (poly[1][1] - poly[0][1]) * a + (poly[3][1] - poly[0][1]) * b]; ex.tree(p[0], p[1], 1 + f01(q, k) * 0.5, q + k); } }); }
    // ---- wild trees outside the built-up area
    if(lod <= 1) for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ const x = x0 + i * 16 + f01(cx * 8 + i, cz * 8 + j) * 14, z = z0 + j * 16 + f01(cz * 8 + j, cx * 8 + i + 99) * 14; const b = T.built(x, z); if(b > 0.12) continue; const fa = forestAmt(x, z, b), r = f01(cx * 8 + i + 400, cz * 8 + j); if(r < 0.06 + fa * 0.6) ex.tree(x, z, 0.8 + f01(i, j + cx) * 0.7, i * 8 + j); }
    return { cx, cz, lod, mesh: mb.finish(), cols: new Float32Array(cols), doors, stats };
  }
  return { CH, build, RES };
});
