/* LIB · buildgen — the buildings of WestCountry. Like worldgen, everything here is a PURE function (nothing is stored or downloaded):
 *   urban(x, y, n)     the skyline field 0..1: tall in downtown and in the middle of every "city" district, fading smoothly outwards, so heights blend like a real metropolis
 *   shape(g)           the actual 3D shape of house g (WorldGen.house(i)): walls, roofs, chimneys, porches, towers … in local metres, front = +y, z up
 *   proto(kind,w,d,fl,v)   the same builders for scenery (infill, downtown blocks, landmarks)
 *   infill(tx, ty, n)  one 156-unit tile of scenery BETWEEN the districts (buildings, local streets, trees, ground) so the districts grow into one city
 *   links(n)           short streets joining every district's road ends to the infill street grid
 * A shape is { w, d, h, V:[x,y,z,…], F:[{v:[vertex idx], c:slot, n:[nx,ny,nz], b:bands, k:[detail faces]}], pal:{wall,roof,trim,glass,door,yard,water} }.
 * Slots c: 0 wall · 1 roof · 2 trim · 3 glass · 4 door · 5 yard · 6 water. Used by os/lib/maprender.js (the map) and os/lib/house3d.js (the 3D preview). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js')); else root.BuildGen = factory(root.WorldGen); })(typeof self !== 'undefined' ? self : this, function(G){
  const { h32, f01, CORE } = G, FH = 3.1, SLOT = ['wall', 'roof', 'trim', 'glass', 'door', 'yard', 'water', 'wall2', 'roof2'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), HEX = h => h;

  /* ================= the skyline field ================= */
  const CORE_R = 330, SIG = 215;
  const DST = new Map();
  const dst = k => { let d = DST.get(k); if(!d){ const q = G.district(k); d = { k, cx: q.cx, cy: q.cy, city: q.city, prestige: q.prestige, peak: q.city ? 0.55 + (q.prestige - 1.5) * 0.9 : 0.09 + Math.max(0, q.prestige - 0.7) * 0.22 }; if(DST.size > 600) DST.clear(); DST.set(k, d); } return d; };
  const uCore = (x, y) => Math.exp(-((x - CORE.x) * (x - CORE.x) + (y - CORE.y) * (y - CORE.y)) / (CORE_R * CORE_R));
  const hill = (x, y, d) => d.peak * Math.exp(-((x - d.cx) * (x - d.cx) + (y - d.cy) * (y - d.cy)) / (SIG * SIG));
  /* intensity at a point given the first n districts: a union (1 − Π(1 − uᵢ)) of the downtown hill and one hill per district, so it is smooth, never above 1 and blends neighbours */
  function urban(x, y, n){ let m = 1 - uCore(x, y); for(let k = 0; k < n; k++){ const d = dst(k); if(Math.abs(x - d.cx) > 560 || Math.abs(y - d.cy) > 560) continue; m *= 1 - hill(x, y, d); } return 1 - m; }
  /* a house only knows its own district hill (so its height never depends on how many districts exist yet) */
  const uHouse = g => { const d = dst(g.k); return 1 - (1 - uCore(g.x, g.y)) * (1 - hill(g.x, g.y, d)); };
  const FL = { studio: [1, 13], apartment: [3, 26], townhouse: [2, 9], house: [2, 4], villa: [2, 4], mansion: [3, 6], shop: [1, 3], office: [6, 28] };
  const floorsFor = (kind, U, r) => { const t = FL[kind] || FL.house; return Math.max(1, Math.round((t[0] + t[1] * Math.pow(clamp(U, 0, 1), 1.3)) * (0.82 + 0.36 * r))); };

  /* ================= palettes ================= */
  const WALL = ['#efe6d6', '#e9d8bd', '#d8a27a', '#bccaa8', '#cbd8e5', '#f3f0e9', '#cfc2b0', '#e9c89a', '#aab6c4', '#d9c4a8'];
  const ROOF = ['#b5563b', '#6d717a', '#7b4a36', '#4f6b5a', '#8a8f98', '#9c3f33', '#5d4a42', '#3f4a5a'];
  const GLASSW = ['#86adc8', '#7aa0bd', '#a3bccb', '#8fb9b0', '#b4a78c', '#c0c6cc'];
  const DOORS = ['#7b3f2e', '#2f4a6b', '#44613f', '#8a6a2f'];
  function palette(kind, fl, R){ const tall = kind === 'office' || fl >= 8; return { wall: tall ? GLASSW[(R(1) * GLASSW.length) | 0] : WALL[(R(2) * WALL.length) | 0], roof: ROOF[(R(3) * ROOF.length) | 0], trim: tall ? '#d9dde1' : '#faf6ee', glass: tall ? '#2b4660' : '#3a5b73', door: DOORS[(R(4) * 4) | 0], yard: '#8fbf7a', water: '#5bb4d8', wall2: WALL[(R(7) * WALL.length) | 0], roof2: ROOF[(R(8) * ROOF.length) | 0] }; }

  /* ================= mesh primitives (local coords: x along the street, y toward the street = front, z up) ================= */
  const newMesh = () => ({ V: [], F: [] });
  const vtx = (m, p) => { m.V.push(p[0], p[1], p[2]); return m.V.length / 3 - 1; };
  function face(m, pts, c, n, ref){
    const f = { v: pts.map(p => vtx(m, p)), c, n: n || null, b: 0, k: null };
    if(!f.n){ let nx = 0, ny = 0, nz = 0; for(let i = 0; i < pts.length; i++){ const a = pts[i], b = pts[(i + 1) % pts.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L; if(ref){ let cx = 0, cy = 0, cz = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; cz += p[2]; }); cx /= pts.length; cy /= pts.length; cz /= pts.length; if(nx * (cx - ref[0]) + ny * (cy - ref[1]) + nz * (cz - ref[2]) < 0){ nx = -nx; ny = -ny; nz = -nz; } } else if(nz < 0){ nx = -nx; ny = -ny; nz = -nz; } f.n = [nx, ny, nz]; }
    m.F.push(f); return f;
  }
  /* windows & doors on a wall (bottom edge (x0,y0)→(x1,y1), outward normal (nx,ny)) become child faces of the wall, drawn only when the viewer is close */
  function glaze(m, f, x0, y0, x1, y1, z0, z1, nx, ny, o){
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, e = 0.04, fl = o.fl || 1, kids = f.k = f.k || [];
    const q = (t0, t1, za, zb, c) => { const a = t0 * L, b = t1 * L; kids.push(face(m, [[x0 + ux * a + nx * e, y0 + uy * a + ny * e, za], [x0 + ux * b + nx * e, y0 + uy * b + ny * e, za], [x0 + ux * b + nx * e, y0 + uy * b + ny * e, zb], [x0 + ux * a + nx * e, y0 + uy * a + ny * e, zb]], c, [nx, ny, 0])); };
    const dT = o.door != null ? o.door : -1, dw = 1.5 / L;
    if(o.win === 'strip'){ for(let i = 0; i < fl; i++){ const za = z0 + i * FH + (i ? 0.7 : 2.6), zb = z0 + (i + 1) * FH - 0.55; if(zb > za + 0.3) q(0.04, 0.96, za, zb, 3); } }
    else if(o.win === 'grid'){ const cols = Math.max(1, Math.round(L / 3.5)), ww = Math.min(1.5, L / cols * 0.5) / L; for(let i = 0; i < fl; i++) for(let j = 0; j < cols; j++){ const t = (j + 0.5) / cols; if(i === 0 && dT >= 0 && Math.abs(t - dT) * L < 1.7) continue; const za = z0 + i * FH + 0.95; q(t - ww / 2, t + ww / 2, za, za + 1.45, 3); } }
    if(dT >= 0) q(dT - dw / 2, dT + dw / 2, z0, z0 + 2.3, 4);
  }
  /* a vertical wall with an explicit normal */
  function wall(m, x0, y0, x1, y1, z0, z1, c, nx, ny, o){ const f = face(m, [[x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]], c, [nx, ny, 0]); if(o){ if(o.bands) f.b = o.bands; if(o.win || o.door != null) glaze(m, f, x0, y0, x1, y1, z0, z1, nx, ny, o); } return f; }
  /* a closed box: four walls (+ a top unless o.top === null). o: c (wall slot), top (slot), win, fl, door (front, 0..1), bands, sides (bit mask F1 B2 L4 R8) */
  function box(m, x0, y0, z0, x1, y1, z1, o){
    o = o || {}; const c = o.c == null ? 0 : o.c, sd = o.sides == null ? 15 : o.sides, fl = o.fl || Math.max(1, Math.round((z1 - z0) / FH)), w = { win: o.win, fl, bands: o.bands, door: o.door };
    if(sd & 1) wall(m, x1, y1, x0, y1, z0, z1, c, 0, 1, { win: o.win, fl, bands: o.bands, door: o.door != null ? 1 - o.door : null });
    if(sd & 2) wall(m, x0, y0, x1, y0, z0, z1, c, 0, -1, { win: o.win, fl, bands: o.bands });
    if(sd & 4) wall(m, x0, y1, x0, y0, z0, z1, c, -1, 0, { win: o.win, fl, bands: o.bands });
    if(sd & 8) wall(m, x1, y0, x1, y1, z0, z1, c, 1, 0, { win: o.win, fl, bands: o.bands });
    if(o.top !== null) face(m, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], o.top == null ? 2 : o.top, [0, 0, 1]);
  }
  /* gable roof over the rectangle at height z; the ridge runs along 'x' or 'y'; slopes overhang by oh */
  function gable(m, x0, y0, x1, y1, z, rise, axis, cw, oh){
    oh = oh == null ? 0.45 : oh; const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    if(axis === 'x'){ const hd = (y1 - y0) / 2, sl = rise / hd, dz = oh * sl, ref = [xm, ym, z - 3];
      face(m, [[x0 - oh, y1 + oh, z - dz], [x1 + oh, y1 + oh, z - dz], [x1 + oh, ym, z + rise], [x0 - oh, ym, z + rise]], 1, null, ref); face(m, [[x0 - oh, y0 - oh, z - dz], [x1 + oh, y0 - oh, z - dz], [x1 + oh, ym, z + rise], [x0 - oh, ym, z + rise]], 1, null, ref);
      face(m, [[x0, y0, z], [x0, y1, z], [x0, ym, z + rise]], cw, [-1, 0, 0]); face(m, [[x1, y0, z], [x1, y1, z], [x1, ym, z + rise]], cw, [1, 0, 0]); }
    else { const hw = (x1 - x0) / 2, sl = rise / hw, dz = oh * sl, ref = [xm, ym, z - 3];
      face(m, [[x1 + oh, y0 - oh, z - dz], [x1 + oh, y1 + oh, z - dz], [xm, y1 + oh, z + rise], [xm, y0 - oh, z + rise]], 1, null, ref); face(m, [[x0 - oh, y0 - oh, z - dz], [x0 - oh, y1 + oh, z - dz], [xm, y1 + oh, z + rise], [xm, y0 - oh, z + rise]], 1, null, ref);
      face(m, [[x0, y1, z], [x1, y1, z], [xm, y1, z + rise]], cw, [0, 1, 0]); face(m, [[x0, y0, z], [x1, y0, z], [xm, y0, z + rise]], cw, [0, -1, 0]); }
  }
  /* hip roof (a pyramid when the plan is nearly square) */
  function hip(m, x0, y0, x1, y1, z, rise, oh){
    oh = oh == null ? 0.45 : oh; const w = x1 - x0, d = y1 - y0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, ref = [xm, ym, z - 3], ins = Math.min(w, d) / 2, rx = Math.max(0, (w - d) / 2), ry = Math.max(0, (d - w) / 2), zt = z + rise;
    const A = [x0 - oh, y0 - oh, z - oh * rise / ins], B = [x1 + oh, y0 - oh, z - oh * rise / ins], C = [x1 + oh, y1 + oh, z - oh * rise / ins], D = [x0 - oh, y1 + oh, z - oh * rise / ins];
    const r0 = [xm - rx, ym - ry, zt], r1 = [xm + rx, ym - ry, zt], r2 = [xm + rx, ym + ry, zt], r3 = [xm - rx, ym + ry, zt];
    face(m, [A, B, r1, r0], 1, null, ref); face(m, [B, C, r2, r1], 1, null, ref); face(m, [C, D, r3, r2], 1, null, ref); face(m, [D, A, r0, r3], 1, null, ref);
  }
  /* mansard: steep lower slopes, flat top */
  function mansard(m, x0, y0, x1, y1, z, rise){
    const i = Math.min(x1 - x0, y1 - y0) * 0.2, oh = 0.3, ref = [(x0 + x1) / 2, (y0 + y1) / 2, z - 3], zt = z + rise, a = [x0 - oh, y0 - oh, z], b = [x1 + oh, y0 - oh, z], c = [x1 + oh, y1 + oh, z], d = [x0 - oh, y1 + oh, z], a2 = [x0 + i, y0 + i, zt], b2 = [x1 - i, y0 + i, zt], c2 = [x1 - i, y1 - i, zt], d2 = [x0 + i, y1 - i, zt];
    face(m, [a, b, b2, a2], 1, null, ref); face(m, [b, c, c2, b2], 1, null, ref); face(m, [c, d, d2, c2], 1, null, ref); face(m, [d, a, a2, d2], 1, null, ref); face(m, [a2, b2, c2, d2], 1, [0, 0, 1], null);
  }
  /* flat roof with a parapet and a plant room */
  function flatTop(m, x0, y0, x1, y1, z, o){
    o = o || {}; const p = 0.45; box(m, x0, y0, z, x1, y0 + p, z + 0.6, { c: 2, top: 2 }); box(m, x0, y1 - p, z, x1, y1, z + 0.6, { c: 2, top: 2 }); box(m, x0, y0 + p, z, x0 + p, y1 - p, z + 0.6, { c: 2, top: 2 }); box(m, x1 - p, y0 + p, z, x1, y1 - p, z + 0.6, { c: 2, top: 2 });
    const w = x1 - x0, d = y1 - y0; if(o.plant !== false && w > 7 && d > 7){ const pw = w * 0.34, pd = d * 0.3, px = x0 + w * (0.2 + (o.px || 0) * 0.5), py = y0 + d * (0.2 + (o.py || 0) * 0.45); box(m, px, py, z, px + pw, py + pd, z + 1.9, { c: 2, top: 2 }); }
    face(m, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], 1, [0, 0, 1]);
  }
  const chimney = (m, x, y, z0, z1) => { box(m, x - 0.6, y - 0.6, z0, x + 0.6, y + 0.6, z1, { c: 2, top: 2 }); box(m, x - 0.8, y - 0.8, z1, x + 0.8, y + 0.8, z1 + 0.35, { c: 2, top: 2 }); };
  const spire = (m, x, y, z0, h) => { const r = 0.28, hh = z0 + h; box(m, x - r, y - r, z0, x + r, y + r, hh, { c: 2, top: 2 }); };
  const finish = (m, w, d, pal) => { let top = 0; for(let i = 2; i < m.V.length; i += 3) if(m.V[i] > top) top = m.V[i]; return { w, d, h: top, V: m.V, F: m.F, pal }; };

  /* ================= the builders: one per kind of building ================= */
  const BUILD = {};
  const roofRise = (w, d, k) => Math.max(1.6, Math.min(w, d) * (k || 0.36));
  const porch = (m, x, y, z, w) => { box(m, x - w / 2, y, 0, x + w / 2, y + 1.9, 0.35, { c: 2, top: 2 }); box(m, x - w / 2, y + 0.1, 2.75, x + w / 2, y + 1.9, 3.0, { c: 2, top: 2 }); box(m, x - w / 2, y + 1.5, 0.35, x - w / 2 + 0.28, y + 1.78, 2.75, { c: 2, top: 2 }); box(m, x + w / 2 - 0.28, y + 1.5, 0.35, x + w / 2, y + 1.78, 2.75, { c: 2, top: 2 }); };
  const balconies = (m, hw, hd, fl, cols, R) => { for(let i = 1; i < fl; i++) for(let j = 0; j < cols; j++){ const x = -hw + (j + 0.5) * (2 * hw / cols); box(m, x - 1.5, hd, i * FH - 0.05, x + 1.5, hd + 1.1, i * FH + 0.2, { c: 2, top: 2 }); } };

  BUILD.cottage = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH, ax = R(5) < 0.5 ? 'x' : 'y', rise = roofRise(w, d, 0.42);
    box(m, -hw, -hd, 0, hw, hd, H, { win: 'grid', fl, door: 0.5, top: null }); gable(m, -hw, -hd, hw, hd, H, rise, ax, 0);
    if(R(6) < 0.8) chimney(m, ax === 'x' ? hw * 0.5 : 0, ax === 'x' ? 0 : -hd * 0.45, H - 0.5, H + rise + 0.7); if(R(9) < 0.6) porch(m, 0, hd, 0, 2.8); };

  BUILD.house = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH, v = (R(6) * 4) | 0, rise = roofRise(w, d, 0.34);
    if(v === 0){ box(m, -hw, -hd, 0, hw, hd, H, { win: 'grid', fl, door: 0.5, top: null }); gable(m, -hw, -hd, hw, hd, H, rise, 'x', 0); chimney(m, hw * 0.55, 0, H - 0.5, H + rise + 0.7); porch(m, 0, hd, 0, 3.4); }
    else if(v === 1){ const ax = -hw + w * 0.56; box(m, -hw, -hd, 0, hw, hd * 0.2, H, { win: 'grid', fl, door: 0.8, top: null }); gable(m, -hw, -hd, hw, hd * 0.2, H, rise, 'x', 0);
      box(m, -hw, -hd * 0.1, 0, ax, hd, H, { win: 'grid', fl, top: null }); gable(m, -hw, -hd * 0.1, ax, hd, H, roofRise(ax + hw, d, 0.34), 'y', 0); chimney(m, hw * 0.6, -hd * 0.1, H - 0.5, H + rise + 0.7); porch(m, -hw + w * 0.8, hd * 0.2, 0, 3); }
    else if(v === 2){ const gx = hw * 0.3; box(m, -hw, -hd, 0, gx, hd, H, { win: 'grid', fl, door: 0.4, top: null }); hip(m, -hw, -hd, gx, hd, H, rise);
      box(m, gx, -hd * 0.8, 0, hw, hd * 0.7, FH, { win: null, fl: 1, top: 2 }); box(m, gx + 0.7, hd * 0.7 - 0.05, 0, hw - 0.7, hd * 0.7 + 0.05, 2.4, { c: 4, top: null, sides: 1 }); chimney(m, -hw * 0.5, 0, H - 0.5, H + rise + 0.6); }
    else { box(m, -hw, -hd, 0, hw, hd, FH, { win: 'strip', fl: 1, door: 0.25, top: 2 }); if(fl > 1){ const u0 = -hw * 0.5, u1 = hw, v0 = -hd * 0.9, v1 = hd * 0.55; box(m, u0 - 0.5, v0 - 0.5, FH, u1 + 0.5, v1 + 0.5, FH + 0.3, { c: 2, top: 2 }); box(m, u0, v0, FH + 0.3, u1, v1, H, { win: 'grid', fl: fl - 1, top: 2, c: 0 }); } } };

  BUILD.townhouse = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, n = fl >= 6 ? 1 : 2, uw = w / n;
    for(let i = 0; i < n; i++){ const x0 = -hw + i * uw, x1 = x0 + uw, xm = (x0 + x1) / 2, fi = fl + (i && R(10) < 0.5 ? 1 : 0), H = fi * FH, cw = i ? 7 : 0, cr = i ? 8 : 1;
      box(m, x0, -hd, 0, x1, hd, H, { c: cw, win: 'grid', fl: fi, door: 0.5, top: null, bands: fi > 4 ? fi : 0 });
      if(fl >= 4){ if(R(11) < 0.5) mansard(m, x0, -hd, x1, hd, H, FH * 0.9); else flatTop(m, x0, -hd, x1, hd, H, { plant: false }); } else gable(m, x0, -hd, x1, hd, H, roofRise(uw, d, 0.62), 'y', cw, 0.35);
      for(let s = 0; s < 3; s++) box(m, xm - 1.1, hd + s * 0.4, 0, xm + 1.1, hd + (s + 1) * 0.4, 0.3 + (2 - s) * 0.18, { c: 2, top: 2 }); if(R(12 + i) < 0.7) chimney(m, i ? x1 - 0.9 : x0 + 0.9, 0, H, H + 2.2); } };

  BUILD.walkup = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH;
    box(m, -hw, -hd, 0, hw, hd, H, { win: 'grid', fl, door: 0.5, top: null }); hip(m, -hw, -hd, hw, hd, H, roofRise(w, d, 0.22)); balconies(m, hw * 0.8, hd, fl, 2, R); chimney(m, hw * 0.4, -hd * 0.2, H - 0.5, H + 1.6); };
  BUILD.block = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH;
    box(m, -hw, -hd, 0, hw, hd, H, { win: 'grid', fl, door: 0.5, top: null, bands: Math.min(fl, 12) }); flatTop(m, -hw, -hd, hw, hd, H, { px: R(5), py: R(6) }); if(R(7) < 0.6) balconies(m, hw * 0.8, hd, Math.min(fl, 8), 3, R);
    box(m, -1.6, hd, 2.7, 1.6, hd + 1.6, 2.95, { c: 4, top: 4 }); };
  BUILD.shop = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH + 0.8;
    box(m, -hw, -hd, 0, hw, hd, H, { win: 'grid', fl, door: 0.5, top: null }); flatTop(m, -hw, -hd, hw, hd, H, { px: R(5), py: R(6) }); box(m, -hw + 0.6, hd, 2.5, hw - 0.6, hd + 1.7, 2.8, { c: 4, top: 4 }); box(m, -hw, hd, H - 0.2, hw, hd + 0.3, H + 1.3, { c: 2, top: 2 }); };

  /* towers: podium, shaft, setbacks, crown + antenna; floors up to ~40 */
  function tower(c){ const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, pod = fl >= 14 ? 2 : 1, hp = pod * FH + 1.2;
    box(m, -hw, -hd, 0, hw, hd, hp, { c: 2, win: 'strip', fl: pod, door: 0.5, top: 2 });
    const s1 = 0.84, hs = (fl >= 18 ? Math.round(fl * 0.68) : fl), zA = hs * FH + 1.2;
    box(m, -hw * s1, -hd * s1 - 0.3, hp, hw * s1, hd * s1 - 0.3, zA, { c: 0, win: 'strip', fl: hs - pod, top: null, bands: Math.min(hs - pod, 14) });
    if(fl >= 18){ const s2 = 0.56, zB = fl * FH + 1.2; flatTop(m, -hw * s1, -hd * s1 - 0.3, hw * s1, hd * s1 - 0.3, zA, { plant: false });
      box(m, -hw * s2, -hd * s2 - 0.3, zA, hw * s2, hd * s2 - 0.3, zB, { c: 0, win: 'strip', fl: fl - hs, top: null, bands: Math.min(fl - hs, 10) }); flatTop(m, -hw * s2, -hd * s2 - 0.3, hw * s2, hd * s2 - 0.3, zB, { plant: fl < 26 });
      if(fl >= 24) spire(m, 0, -0.3, zB, 3 + fl * 0.16); }
    else { flatTop(m, -hw * s1, -hd * s1 - 0.3, hw * s1, hd * s1 - 0.3, zA, { px: R(5), py: R(6) }); if(fl >= 12 && R(8) < 0.7) spire(m, hw * 0.3, -0.3, zA, 3 + fl * 0.12); } }
  BUILD.tower = tower; BUILD.office = tower;

  BUILD.villa = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH, rise = roofRise(w * 0.6, d, 0.3), H2 = Math.max(1, fl - 1) * FH;
    box(m, -hw * 0.9, -hd * 0.7, 0, hw * 0.3, hd * 0.6, H, { win: 'grid', fl, door: 0.55, top: null }); hip(m, -hw * 0.9, -hd * 0.7, hw * 0.3, hd * 0.6, H, rise, 0.7);
    box(m, hw * 0.3, -hd * 0.2, 0, hw, hd * 0.9, H2, { win: 'grid', fl: Math.max(1, fl - 1), top: null }); hip(m, hw * 0.3, -hd * 0.2, hw, hd * 0.9, H2, rise * 0.7, 0.6);
    const px = -hw * 0.3; box(m, px - 1.7, hd * 0.6, 0, px + 1.7, hd * 0.6 + 2.2, 0.3, { c: 2, top: 2 }); box(m, px - 1.7, hd * 0.6 + 0.2, 2.9, px + 1.7, hd * 0.6 + 2.2, 3.15, { c: 2, top: 2 }); box(m, px - 1.6, hd * 0.6 + 1.7, 0.3, px - 1.3, hd * 0.6 + 2.0, 2.9, { c: 2, top: 2 }); box(m, px + 1.3, hd * 0.6 + 1.7, 0.3, px + 1.6, hd * 0.6 + 2.0, 2.9, { c: 2, top: 2 });
    chimney(m, -hw * 0.5, -hd * 0.2, H, H + rise + 0.5); if(R(9) < 0.65) face(c.m, [[-hw * 0.7, -hd - 1.2, 0.06], [hw * 0.2, -hd - 1.2, 0.06], [hw * 0.2, -hd - 4.8, 0.06], [-hw * 0.7, -hd - 4.8, 0.06]], 6, [0, 0, 1]); };

  BUILD.mansion = c => { const { m, w, d, fl, R } = c, hw = w / 2, hd = d / 2, H = fl * FH, Hw = Math.max(2, fl - 1) * FH, mid = hw * 0.4, rise = roofRise(w * 0.8, d * 0.8, 0.34);
    box(m, -mid, -hd * 0.8, 0, mid, hd * 0.8, H, { win: 'grid', fl, door: 0.5, top: null, c: 0 }); if(R(5) < 0.55) mansard(m, -mid, -hd * 0.8, mid, hd * 0.8, H, rise); else hip(m, -mid, -hd * 0.8, mid, hd * 0.8, H, rise, 0.6);
    for(const sg of [-1, 1]){ const x0 = sg < 0 ? -hw : mid, x1 = sg < 0 ? -mid : hw; box(m, x0, -hd * 0.6, 0, x1, hd * 0.6, Hw, { win: 'grid', fl: Math.max(2, fl - 1), top: null }); hip(m, x0, -hd * 0.6, x1, hd * 0.6, Hw, rise * 0.75, 0.55); chimney(m, sg * hw * 0.75, 0, Hw - 0.5, Hw + rise * 0.6 + 1); }
    for(let i = 0; i < 4; i++){ const x = -mid * 0.75 + i * mid * 0.5; box(m, x - 0.35, hd * 0.8, 0, x + 0.35, hd * 0.8 + 1.8, FH * 1.6, { c: 2, top: 2 }); } box(m, -mid * 0.9, hd * 0.8, FH * 1.6, mid * 0.9, hd * 0.8 + 2, FH * 1.6 + 0.45, { c: 2, top: 2 }); gable(m, -mid * 0.9, hd * 0.8, mid * 0.9, hd * 0.8 + 2, FH * 1.6 + 0.45, 1.5, 'x', 2, 0.2);
    for(let s = 0; s < 3; s++) box(m, -mid * 0.95, hd * 0.8 + 1.8 + s * 0.45, 0, mid * 0.95, hd * 0.8 + 2.25 + s * 0.45, 0.45 - s * 0.15, { c: 2, top: 2 }); box(m, -1.1, -1.1, H + rise, 1.1, 1.1, H + rise + 1.6, { c: 2, top: 2 }); };

  const BNAME = (kind, fl) => kind === 'studio' ? (fl <= 2 ? 'cottage' : fl <= 7 ? 'block' : 'tower') : kind === 'apartment' ? (fl <= 3 ? 'walkup' : fl <= 8 ? 'block' : 'tower') : kind === 'office' ? 'tower' : kind;
  /* kind + footprint + floors + a variant number → a shape (scenery uses this too; cache by the caller) */
  function build(kind, w, d, fl, seed, pal){ const m = newMesh(), R = j => f01(seed, 300 + j), p = palette(kind, fl, R); if(kind === 'office'){ p.wall = GLASSW[(R(1) * GLASSW.length) | 0]; } if(pal) Object.assign(p, pal); (BUILD[BNAME(kind, fl)] || BUILD.house)({ m, w, d, fl, R, pal: p, kind }); const s = finish(m, w, d, p); s.kind = kind; s.fl = fl; return s; }
  const PC = new Map(), PK = new Map();
  /* a full cache drops its oldest quarter. (A plain clear() made every mesh rebuild at once, every frame, as soon as a country had more houses than the cap.) */
  const evict = (m, cap) => { if(m.size <= cap) return; let n = Math.ceil(cap / 4); for(const k of m.keys()){ m.delete(k); if(--n <= 0) break; } };
  function proto(kind, w, d, fl, v){ const key = kind + '|' + Math.round(w) + '|' + Math.round(d) + '|' + fl + '|' + v; let s = PC.get(key); if(!s){ s = build(kind, Math.round(w), Math.round(d), fl, v * 7919 + fl, null); evict(PC, 1500); PC.set(key, s); } return s; }
  /* house i's own shape (cached; the cache is only an optimisation) */
  const HC = new Map();
  function shape(g){ let s = HC.get(g.i); if(!s){ const U = uHouse(g), cap = { house: 5, villa: 5, mansion: 8 }[g.type] || 60, fl = Math.min(cap, floorsFor(g.type, U, f01(g.i, 9)));
      s = build(g.type, g.w, g.dp, fl, g.i + 77, null); s.U = U; s.i = g.i; evict(HC, 1500); HC.set(g.i, s); } return s; }
  /* an UPPER BOUND on house g's height without building its mesh: floors x floor height + roof/spire headroom (measured worst overshoot 8.8, see tests/maprender-lod.test.js). For culling, LOD choice and hit-testing. */
  const HT = new Map();
  function heightOf(g){ let h = HT.get(g.i); if(h === undefined){ const U = uHouse(g), cap = { house: 5, villa: 5, mansion: 8 }[g.type] || 60; h = Math.min(cap, floorsFor(g.type, U, f01(g.i, 9))) * FH + 9; if(HT.size > 40000) HT.clear(); HT.set(g.i, h); } return h; }
  /* the palette a scenery building (kind, fl, v) gets, without building it: the same recipe as build()/proto() */
  function protoPal(kind, fl, v){ const R = j => f01(v * 7919 + fl, 300 + j), p = palette(kind, fl, R); if(kind === 'office') p.wall = GLASSW[(R(1) * GLASSW.length) | 0]; return p; }

  /* ================= landmarks: the downtown buildings and the two campuses ================= */
  const LM = {
    bank:     { w: 24, d: 18, wall: '#d9dfe9', roof: '#6c85b8', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 10, { win: 'grid', fl: 3, door: 0.5, top: null }); box(m, -11.4, -8.4, 10, 11.4, 8.4, 10.7, { c: 2, top: 2 }); for(let i = 0; i < 6; i++){ const x = -8.5 + i * 3.4; box(m, x - 0.5, 8, 0, x + 0.5, 9.6, 10, { c: 2, top: 2 }); } box(m, -10, 8, 10, 10, 10, 10.7, { c: 2, top: 2 }); gable(m, -10, 8, 10, 10, 10.7, 2.6, 'x', 2, 0.2); flatTop(m, -11, -8, 11, 8, 10.7, { plant: false }); hip(m, -4, -4, 4, 4, 10.7, 6, 0.4); } },
    exchange: { w: 24, d: 18, wall: '#9fd2b4', roof: '#3fae78', fn: c => { c.fl = 20; c.w = 20; c.d = 15; tower(c); } },
    shop:     { w: 24, d: 18, wall: '#f0d9a8', roof: '#e0a23a', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 8.4, { win: 'grid', fl: 2, door: 0.5, top: null }); flatTop(m, -11, -8, 11, 8, 8.4, {}); for(let i = 0; i < 5; i++) box(m, -10 + i * 4.2, 8, 2.6, -6.4 + i * 4.2, 10, 3.1, { c: i % 2 ? 2 : 4, top: i % 2 ? 2 : 4 }); } },
    arcade:   { w: 24, d: 18, wall: '#d2b3ee', roof: '#b36be0', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 9, { win: 'strip', fl: 2, door: 0.5, top: null }); flatTop(m, -11, -8, 11, 8, 9, {}); box(m, -7, 7.2, 5.2, 7, 8.4, 8.8, { c: 4, top: 4 }); box(m, -2, -2, 9.6, 2, 2, 15, { c: 4, top: 4 }); } },
    agency:   { w: 24, d: 18, wall: '#ecd0b8', roof: '#c98a62', fn: c => { const { m } = c; box(m, -10, -7, 0, 10, 7, 9, { win: 'grid', fl: 3, door: 0.5, top: null }); gable(m, -10, -7, 10, 7, 9, 5.2, 'x', 0, 0.8); chimney(m, 6, 0, 9, 15); box(m, -1.2, 7, 2.6, 1.2, 9, 3.0, { c: 4, top: 4 }); } },
    hall:     { w: 24, d: 18, wall: '#d8dce4', roof: '#7c8696', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 11, { win: 'grid', fl: 3, door: 0.5, top: null }); hip(m, -11, -8, 11, 8, 11, 4, 0.6); box(m, -3, 2, 11, 3, 8, 22, { win: 'grid', fl: 3, top: null, c: 0 }); hip(m, -3, 2, 3, 8, 22, 6, 0.5); for(let i = 0; i < 4; i++) box(m, -4.5 + i * 3, 8, 0, -3.9 + i * 3, 9.5, 11, { c: 2, top: 2 }); } },
    uni:      { w: 24, d: 18, wall: '#c98c70', roof: '#5d4a42', fn: c => { const { m } = c; box(m, -11, -7, 0, 11, 7, 9, { win: 'grid', fl: 3, door: 0.5, top: null }); gable(m, -11, -7, 11, 7, 9, 5, 'x', 0, 0.6); box(m, -9, 6, 0, -3, 9, 9, { win: 'grid', fl: 3, top: null }); gable(m, -9, 6, -3, 9, 9, 4, 'y', 0, 0.4); box(m, 6, -3, 9, 9, 0, 22, { win: 'grid', fl: 4, top: null }); hip(m, 6, -3, 9, 0, 22, 5, 0.3); } },
    lab:      { w: 24, d: 18, wall: '#bfe5e3', roof: '#4fb3ae', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 8, { win: 'strip', fl: 2, door: 0.5, top: null }); flatTop(m, -11, -8, 11, 8, 8, {}); box(m, 4, -8, 8, 11, -2, 13, { c: 0, win: 'strip', fl: 1, top: 2 }); chimney(m, -6, -4, 8, 17); chimney(m, -3, -4, 8, 15); } },
    ind:      { w: 24, d: 18, wall: '#dcc3ad', roof: '#8f6e5a', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 6.5, { win: 'grid', fl: 1, door: 0.3, top: null }); gable(m, -11, -8, 11, 8, 6.5, 3.4, 'x', 0, 0.5); chimney(m, 8, -4, 6.5, 22); box(m, 6.4, -4.6, 6.5, 9.6, -3.4, 6.7, { c: 2, top: 2 }); } },
    plant:    { w: 24, d: 18, wall: '#cfc3b8', roof: '#8a6a58', fn: c => { const { m } = c; box(m, -11, -8, 0, 11, 8, 12, { win: 'strip', fl: 3, door: 0.3, top: null }); flatTop(m, -11, -8, 11, 8, 12, {}); for(const x of [-6, 4]){ box(m, x - 3, -3, 12, x + 3, 3, 15, { c: 2, top: 2 }); box(m, x - 2, -2, 15, x + 2, 2, 24, { c: 2, top: 2 }); } chimney(m, 9, 5, 12, 30); } }
  };
  const LC = new Map();
  function landmark(id){ let s = LC.get(id); if(!s){ const L = LM[id]; if(!L) return null; const m = newMesh(), pal = Object.assign(palette('house', 3, j => f01(id.length * 31 + id.charCodeAt(0), 40 + j)), { wall: L.wall, roof: L.roof, trim: '#f4f1ea', wall2: L.wall, roof2: L.roof }), c = { m, w: L.w, d: L.d, fl: 3, R: j => 0.5, pal, kind: id }; L.fn(c); s = finish(m, L.w, L.d, pal); s.kind = 'landmark'; s.id = id; LC.set(id, s); } return s; }

  /* ================= infill: the city between the districts ================= */
  const CS = 26, BS = 52, TS = 6, GE = G.GEO, FP = { house: [10, 9], studio: [8, 8], townhouse: [10, 9], apartment: [13, 11], shop: [15, 12], office: [15, 13] };
  const warp = (x, y) => [x + 5 * Math.sin(y * 0.021 + 1.3) + 2 * Math.sin(y * 0.057), y + 5 * Math.sin(x * 0.019 + 0.4) + 2 * Math.sin(x * 0.061)];
  const nodeAt = (bx, by) => warp(bx * BS, by * BS);
  const segDist = (px, py, s) => { const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1, t = clamp(((px - s[0]) * dx + (py - s[1]) * dy) / L2, 0, 1); return Math.hypot(px - s[0] - dx * t, py - s[1] - dy * t); };
  function segIndex(){ const B = new Map(); return { add(s){ const x0 = Math.floor(Math.min(s[0], s[2]) / 100), x1 = Math.floor(Math.max(s[0], s[2]) / 100), y0 = Math.floor(Math.min(s[1], s[3]) / 100), y1 = Math.floor(Math.max(s[1], s[3]) / 100); for(let a = x0; a <= x1; a++) for(let b = y0; b <= y1; b++){ const key = a + ',' + b; let l = B.get(key); if(!l) B.set(key, l = []); l.push(s); } },
    dist(x, y){ let best = 1e9; const a = Math.floor(x / 100), b = Math.floor(y / 100); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const l = B.get((a + i) + ',' + (b + j)); if(l) for(const s of l){ const d = segDist(x, y, s); if(d < best) best = d; } } return best; } }; }
  const OCC = new Map();
  /* what is already taken: district footprints, downtown, the two campuses, the park, and the highways (everything the scenery must keep clear of) */
  function occ(n){ let o = OCC.get(n); if(o) return o; const D = []; for(let k = 0; k < n; k++){ const q = G.district(k); D.push({ cx: q.cx, cy: q.cy, c: Math.cos(q.theta), s: Math.sin(q.theta) }); }
    const hw = segIndex(); G.highways(n).forEach(e => { for(let i = 1; i < e.pts.length; i++) hw.add([e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1]]); });
    const PK = G.POIS.park, Zs = [G.ZONES.uni, G.ZONES.ind];
    o = { D, hw, lk: segIndex(), links: null,
      inD(x, y, m){ for(let i = 0; i < D.length; i++){ const d = D[i], dx = x - d.cx, dy = y - d.cy; if(dx * dx + dy * dy > 50000) continue; const u = dx * d.c + dy * d.s, v = -dx * d.s + dy * d.c; if(Math.abs(u) < GE.GU + 14 + m && Math.abs(v) < GE.W + 16 + m) return true; } return false; },
      inZ(x, y, m){ if(Math.abs(x - CORE.x) < 112 + m && Math.abs(y - CORE.y) < 104 + m) return true; if(Math.abs(x - PK.x) < 48 + m && Math.abs(y - PK.y) < 31 + m) return true; for(const z of Zs) if(x > z.x0 - 8 - m && x < z.x1 + 8 + m && y > z.y0 - 8 - m && y < z.y1 + 8 + m) return true; return false; } };
    if(OCC.size > 12) OCC.clear(); OCC.set(n, o); return o; }
  /* every road end of every district (cul-de-sacs and both avenue gates) is joined to the nearest street of the infill grid */
  function links(n){ const o = occ(n); if(o.links) return o.links; const out = [];
    for(let k = 0; k < n; k++){ const ends = []; G.roadEnds(k).forEach(p => p.forEach(e => ends.push(e))); ends.push(G.loc(k, -GE.GU, 0), G.loc(k, GE.GU, 0));
      ends.forEach(e => { const bx = Math.round(e[0] / BS), by = Math.round(e[1] / BS); let best = null, bd = 95; for(let i = -2; i <= 2; i++) for(let j = -2; j <= 2; j++){ const N = nodeAt(bx + i, by + j), d = Math.hypot(N[0] - e[0], N[1] - e[1]); if(d < bd && !o.inD(N[0], N[1], 8) && !o.inZ(N[0], N[1], 4) && o.hw.dist(N[0], N[1]) > 9 && urban(N[0], N[1], n) > 0.035){ bd = d; best = N; } }
        if(best) out.push({ k, pts: [e, best] }); }); }
    out.forEach(l => o.lk.add([l.pts[0][0], l.pts[0][1], l.pts[1][0], l.pts[1][1]])); o.links = out; return out; }
  const pickKind = (U, r) => U < 0.08 ? (r < 0.72 ? 'house' : 'studio') : U < 0.18 ? (r < 0.34 ? 'house' : r < 0.66 ? 'townhouse' : r < 0.88 ? 'apartment' : 'studio') : U < 0.35 ? (r < 0.12 ? 'house' : r < 0.42 ? 'townhouse' : r < 0.82 ? 'apartment' : r < 0.93 ? 'shop' : 'studio') : U < 0.6 ? (r < 0.5 ? 'apartment' : r < 0.72 ? 'office' : r < 0.84 ? 'townhouse' : r < 0.94 ? 'shop' : 'studio') : (r < 0.52 ? 'office' : r < 0.86 ? 'apartment' : r < 0.94 ? 'shop' : 'studio');
  const TILES = new Map();
  function genTile(tx, ty, n){
    const o = occ(n); links(n); const B = [], RD = [], TR = [], GR = [], U0 = 0.022;
    for(let cx = tx * TS; cx < tx * TS + TS; cx++) for(let cy = ty * TS; cy < ty * TS + TS; cy++){
      const hh = h32(cx + 5000, cy + 5000), p = warp((cx + 0.5) * CS, (cy + 0.5) * CS), x = p[0], y = p[1]; const U = urban(x, y, n); if(U < U0) continue;
      if(o.inD(x, y, 18) || o.inZ(x, y, 14) || o.hw.dist(x, y) < 15 || o.lk.dist(x, y) < 10) continue;
      const r1 = f01(hh, 1), dens = clamp(0.28 + 0.8 * Math.sqrt(U), 0, 0.96);
      if(r1 > dens){ if(U > 0.12 && f01(hh, 2) < 0.45) GR.push([x, y, U, 1]); else { GR.push([x, y, U, 0]); if(U < 0.3){ const nt = 1 + (h32(hh, 3) % 3); for(let q = 0; q < nt; q++) TR.push([x + (f01(hh, 10 + q) - 0.5) * 18, y + (f01(hh, 20 + q) - 0.5) * 18, 0.8 + f01(hh, 30 + q) * 0.6]); } } continue; }
      GR.push([x, y, U, 0]);
      const kind = pickKind(U, f01(hh, 4)), fp = FP[kind], sc = 0.9 + 0.2 * f01(hh, 5), w = Math.min(17, Math.round(fp[0] * sc)), d = Math.min(16, Math.round(fp[1] * sc)), cap = kind === 'house' ? 4 : 60, capU = 3 + 30 * Math.pow(U, 1.3), fl = kind === 'house' ? Math.min(cap, floorsFor(kind, U, f01(hh, 6))) : clamp(floorsFor(kind, U, f01(hh, 6)), Math.round(0.6 * capU), Math.max(2, Math.round(capU)));
      const lx = cx & 1, ly = cy & 1, horiz = f01(hh, 7) < 0.5, fx = horiz ? (lx ? 1 : -1) : 0, fy = horiz ? 0 : (ly ? 1 : -1), a = Math.atan2(-fx, fy);
      B.push({ x: x + (f01(hh, 8) - 0.5) * 2.5, y: y + (f01(hh, 9) - 0.5) * 2.5, a, k: kind, w, d, fl, v: hh % 997, U, s: null });
    }
    for(let bx = tx * 3; bx < tx * 3 + 3; bx++) for(let by = ty * 3; by < ty * 3 + 3; by++){ const A = nodeAt(bx, by); for(const [dx, dy] of [[1, 0], [0, 1]]){ const Bn = nodeAt(bx + dx, by + dy), mx = (A[0] + Bn[0]) / 2, my = (A[1] + Bn[1]) / 2, U = urban(mx, my, n); if(U < 0.04) continue;
      if(o.inD(A[0], A[1], 12) || o.inD(Bn[0], Bn[1], 12) || o.inD(mx, my, 12) || o.inZ(mx, my, 6) || o.inZ(A[0], A[1], 3) || o.inZ(Bn[0], Bn[1], 3) || o.hw.dist(mx, my) < 8) continue; RD.push({ a: A, b: Bn, U }); } }
    return { b: B, rd: RD, tr: TR, gr: GR };
  }
  function infill(tx, ty, n){ const key = n + '|' + tx + '|' + ty; let t = TILES.get(key); if(t){ TILES.delete(key); TILES.set(key, t); return t; } t = genTile(tx, ty, n); if(TILES.size > 1600) TILES.delete(TILES.keys().next().value); TILES.set(key, t); return t; }
  const TILE = CS * TS;
  /* the tile range that covers a world rectangle */
  const tilesIn = (x0, y0, x1, y1) => { const out = []; for(let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) for(let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) out.push([tx, ty]); return out; };
  const protoOf = b => b.s || (b.s = proto(b.k, b.w, b.d, b.fl, b.v));

  const api = { FH, SLOT, CS, BS, TS, TILE, urban, uHouse, floorsFor, shape, heightOf, protoPal, proto, build, landmark, LM, infill, links, occ, tilesIn, protoOf, nodeAt, warp, tower, palette, box, newMesh, face, gable, hip, finish, WALL, ROOF, GLASSW, CORE_R, SIG, dst, hill };
  G.BuildGen = api; return api;
});
