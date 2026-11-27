/* REALWORLD · interiors — the rooms you can walk into. One small function per kind of building, registered by name:
 *   RealWorld.Interiors.register('bank', room => { room.window('n', 6, 2.4, 1.6); room.put('kitchenFridge', 'e', 4); ... })      ← add a building = add one function (+ a line in game.js BUILDINGS)
 * Room space: x 0..w (west→east), z 0..d (north→south), y 0..h (up), the door is in the SOUTH wall (z = d). Rooms are built at their own size and then PLACED INSIDE the real building by cells.js.
 *
 * LOOK (v2): nothing is a flat-coloured box any more.
 *   · BAKED LIGHT — every floor tile, wall panel and ceiling tile gets its colour per VERTEX from lightAt(): the ceiling lamps, windows and table / floor lamps you place are point lights, plus ambient occlusion near walls
 *     and the floor, so rooms have pools of light and soft corners (the shader only has vertex colours; this is how a 20-byte vertex fakes a lit room).
 *   · SURFACES — plank / tile / carpet / marble floors with per-plank variation, wall panels with a wainscot, baseboards, chair rail and crown moulding, window openings with frames, mullions, sills, glass and curtains,
 *     a door frame with a lintel, recessed ceiling lights.
 *   · FURNITURE — ~100 Kenney Furniture Kit pieces (CC0, baked by tools/bake-kenney.py into assets/world/kenney/furn_*.glb): Room.m(name, x, z, yaw) places one, Room.put(name, wall, along) stands it against a wall facing into the room.
 *     Models face −z at yaw 0. Yaw to face south = π, east = −π/2, west = +π/2.
 * Several levels: r.at(y) sets the current floor height, r.slab(y, hole) builds a floor with a stairwell, r.stairs(...) a real staircase (colliders are 3-D: [x0, z0, x1, z1, y0, y1]; a 4-number collider is full height).
 * Clerks (r.npc with opts) are how you reach services: stand in front of one, press E, pick an option, and the matching WestOS app opens ({ app, link? }). Wall screens (r.screen) show live read-only information (RealWorld.Screens). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, { MB, rgb, shade, GLOW } = root.RWMesh, REG = {}; let CUR = {};
  const F = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };   // which way a thing faces
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k], mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const PI = Math.PI, tintTo = T => [Math.min(1.6, T[0] / 0.9), Math.min(1.6, T[1] / 0.55), Math.min(1.6, T[2] / 0.5)];   // the kit's sofas / chairs / rugs are one salmon pink: this multiplier turns them into any colour (target r,g,b 0..1)
  class Room {
    constructor(w, d, h, o){ o = o || {}; this.w = w; this.d = d; this.h = h; this.y = 0; this.mb = new MB(8192); this.cols = []; this.screens = []; this.npcs = []; this.o = o; this.name = o.name || ''; this.levels = o.levels || 1; this.lh = o.lh || h;
      this.lights = []; this.open = { n: [], s: [], e: [], w: [] }; this.floors = []; this.amb = o.amb === undefined ? 0.66 : o.amb; this.fab = [0.42, 0.5, 0.6]; this.rugC = [0.8, 0.74, 0.64]; this.shelled = false; this.doorX = w / 2; }
    at(y){ this.y = y; return this; }
    /* ---------------- light ---------------- */
    light(x, y, z, k, r){ this.lights.push([x, y, z, k, r || 4]); return this; }
    /* brightness multiplier at a point: ambient + every point light (inverse-square-ish) with ambient occlusion near the walls */
    lightAt(x, y, z){ let L = this.amb; for(const l of this.lights){ const dx = x - l[0], dy = y - l[1], dz = z - l[2]; L += l[3] / (1 + (dx * dx + dy * dy + dz * dz) / (l[4] * l[4])); }
      const e = Math.min(x, this.w - x, z, this.d - z), ao = 0.84 + 0.16 * Math.min(1, e / 1.1); return clamp(L * ao, 0.5, 1.14); }
    /* ---------------- shell ---------------- */
    shell(o){
      const { w, d, h } = this, lvl = this.levels, lh = this.lh;
      this.pal = { wall: rgb(o.wall || '#e8dfcc'), wain: rgb(o.wain || o.base || '#8a6b4a'), base: rgb(o.base || '#5a4630'), trim: rgb(o.trim || '#f4efe6'), floor: rgb(o.floor || '#b08a62'), floor2: rgb(o.floor2 || o.floor || '#a37f58'), ceil: rgb(o.ceil || '#f1ece0'), lamp: o.lamp || [255, 240, 214], fk: o.fk || 'wood', wainH: o.wainH === undefined ? 1.0 : o.wainH, lampStyle: o.lampStyle || 'panel' };
      const dw = 2.4, cx = this.doorX = Math.max(1.3, Math.min(w - 1.3, CUR.doorX === undefined ? w / 2 : CUR.doorX)); this.dw = dw;
      this.open.s.push({ s0: w - (cx + dw / 2), s1: w - (cx - dw / 2), y0: 0, y1: 2.5, door: true });
      const gx = Math.max(2, Math.round(w / 4.4)), gz = Math.max(2, Math.round(d / 4.4));
      for(let k = 0; k < lvl; k++) for(let i = 0; i < gx; i++) for(let j = 0; j < gz; j++){ const x = (i + 0.5) * w / gx, z = (j + 0.5) * d / gz, y = (k + 1) * lh - 0.1; this.lampFix.push({ x, y, z }); this.light(x, y - 0.3, z, o.lampK || 0.30, 4.6); }
      const gp = 0.95, tk = 0.35; this.cols.push([-tk, -tk, w + tk, 0], [-tk, 0, 0, d], [w, 0, w + tk, d], [-tk, d, cx - gp, d + tk], [cx + gp, d, w + tk, d + tk]);   // thin walls (they must fit inside the building's own walls), a doorway
      this.fab = o.fab || this.fab; this.rugC = o.rug || this.rugC; this.shelled = true; return this; }
    get lampFix(){ return this._lf || (this._lf = []); }
    /* wall maths: s runs along the wall (n: west→east, e: north→south, s: east→west, w: south→north); `t` = world coordinate along it */
    S(wall, t){ return wall === 'n' ? t : wall === 'e' ? t : wall === 's' ? this.w - t : this.d - t; }
    pt(wall, s, t){ t = t || 0; const { w, d } = this; return wall === 'n' ? [s, t] : wall === 'e' ? [w - t, s] : wall === 's' ? [w - s, d - t] : [t, d - s]; }   // point on the wall plane (t = distance into the room)
    len(wall){ return wall === 'n' || wall === 's' ? this.w : this.d; }
    /* a box standing on a wall: s0..s1 along it, y0..y1, t0..t1 out from the wall plane */
    wbox(wall, s0, s1, y0, y1, t0, t1, c, ct, a){ const A = this.pt(wall, s0, t0), B = this.pt(wall, s1, t1); this.mb.boxAA(Math.min(A[0], B[0]), y0 + this.y, Math.min(A[1], B[1]), Math.max(A[0], B[0]), y1 + this.y, Math.max(A[1], B[1]), c, ct || c, a); }
    wquad(wall, s0, s1, y0, y1, t, c, a){ const A = this.pt(wall, s0, t), B = this.pt(wall, s1, t), n = wall === 'n' ? [0, 0, 1] : wall === 's' ? [0, 0, -1] : wall === 'w' ? [1, 0, 0] : [-1, 0, 0]; this.mb.quad([A[0], y0 + this.y, A[1]], [B[0], y0 + this.y, B[1]], [B[0], y1 + this.y, B[1]], [A[0], y1 + this.y, A[1]], n, c, a); }
    /* ---------------- windows, art ---------------- */
    window(wall, along, ww, hh, y0, o){ o = o || {}; y0 = y0 === undefined ? 0.95 : y0; const s = this.S(wall, along), s0 = s - ww / 2, s1 = s + ww / 2, y1 = y0 + hh, yb = y0 + this.y, P = this.pal || {}, fr = rgb(o.frame || '#f2ede4'), mb = this.mb;
      this.open[wall].push({ s0, s1, y0: yb, y1: yb + hh, lvl: this.y });
      const fw = 0.07, tt = 0.14;   // frame
      this.wbox(wall, s0 - fw, s1 + fw, y0 - fw, y0, 0, tt, fr); this.wbox(wall, s0 - fw, s1 + fw, y1, y1 + fw, 0, tt, fr); this.wbox(wall, s0 - fw, s0, y0, y1, 0, tt, fr); this.wbox(wall, s1, s1 + fw, y0, y1, 0, tt, fr);
      const nx = Math.max(1, Math.round(ww / 1.1)); for(let i = 1; i < nx; i++){ const sm = s0 + ww * i / nx; this.wbox(wall, sm - 0.025, sm + 0.025, y0, y1, 0.04, 0.1, fr); } if(hh > 1.3) this.wbox(wall, s0, s1, (y0 + y1) / 2 - 0.025, (y0 + y1) / 2 + 0.025, 0.04, 0.1, fr);
      this.wbox(wall, s0 - 0.14, s1 + 0.14, y0 - 0.1, y0 - fw, 0, tt + 0.1, fr);   // sill
      this.wquad(wall, s0, s1, y0, y1, -0.05, o.glass || [150, 190, 228], GLOW);                                                          // the daylight in the glass
      const c = this.pt(wall, s, 0.6); this.light(c[0], yb + hh / 2, c[1], o.light === undefined ? 0.55 : o.light, 4.2);
      if(o.curtain){ const cc = rgb(o.curtain), top = y1 + 0.28; [[s0 - 0.5, s0 + 0.2], [s1 - 0.2, s1 + 0.5]].forEach(([a, b]) => { const n = 4; for(let i = 0; i < n; i++){ const sa = a + (b - a) * i / n, sb = a + (b - a) * (i + 1) / n, f = 0.86 + 0.14 * (i % 2); this.wbox(wall, sa, sb, y0 - 0.45, top, 0.1, 0.17 + 0.03 * (i % 2), mul(cc, f)); } }); this.wbox(wall, s0 - 0.55, s1 + 0.55, top, top + 0.04, 0.05, 0.2, [60, 50, 44]); }
      return this; }
    /* a framed picture: abstract colour fields from a seed (so every picture differs); `frame` colour; faces into the room */
    art(wall, along, y, ww, hh, seed, frame){ const s = this.S(wall, along), s0 = s - ww / 2, s1 = s + ww / 2, fr = rgb(frame || '#3a2c20'), f = 0.045;
      this.wbox(wall, s0 - f, s1 + f, y - f, y + hh + f, 0, 0.05, fr); const pal = [[196, 82, 70], [232, 190, 90], [70, 120, 160], [60, 140, 110], [236, 228, 210], [40, 50, 70], [150, 90, 140], [220, 140, 80]], cols = 3 + (seed % 2), rows = 2 + ((seed >> 1) % 2);
      for(let i = 0; i < cols; i++) for(let j = 0; j < rows; j++){ const c = pal[Math.floor(hash(seed * 7 + i, seed * 13 + j) * pal.length)]; this.wquad(wall, s0 + ww * i / cols, s0 + ww * (i + 1) / cols, y + hh * j / rows, y + hh * (j + 1) / rows, 0.052, mul(c, 0.78 + 0.3 * hash(i + seed, j))); } return this; }
    /* ---------------- furniture ---------------- */
    /* a baked Furniture Kit model, centred on (x, z): front faces −z at yaw 0. opts: k scale, dy lift, tint, nocol, light:[k] (a lamp). Returns { w, d, h } or false when the model is not loaded. */
    model(name, x, z, yaw, o){ const Fm = RW.Props && RW.Props.furn && RW.Props.furn[name]; if(!Fm) return false; o = o || {}; const k = o.k || 1, y = this.y + (o.dy || 0), ky = o.ky || k; let tint = o.tint || null; if(!tint){ if(/^rug/.test(name)) tint = tintTo(this.rugC); else if(/^(loungeSofa|loungeChair|loungeDesign|benchCushion)/.test(name)) tint = tintTo(this.fab); } this.mb.addMesh(Fm.m, x, y, z, yaw || 0, k, tint, ky);
      const sw = Math.abs(Math.sin(yaw || 0)) > 0.7, ww = (sw ? Fm.d : Fm.w) * k, dd = (sw ? Fm.w : Fm.d) * k;
      if(!o.nocol && Fm.h * ky > 0.15 && !o.dy) this.cols.push([x - ww / 2, z - dd / 2, x + ww / 2, z + dd / 2, y, y + Fm.h * ky]);
      if(/lamp/i.test(name) && o.light !== false) this.light(x, y + Fm.h * ky * 0.85, z, 0.34, 3.2);
      return { w: Fm.w * k, d: Fm.d * k, h: Fm.h * ky }; }
    m(name, x, z, yaw, o){ return this.model(name, x, z, yaw, o); }
    size(name, k){ const Fm = RW.Props && RW.Props.furn && RW.Props.furn[name]; return Fm ? { w: Fm.w * (k || 1), d: Fm.d * (k || 1), h: Fm.h * (k || 1) } : { w: 0.8, d: 0.8, h: 0.8 }; }
    /* stand a piece against a wall, facing into the room. along = world x (n / s walls) or z (e / w walls) of its centre */
    put(name, wall, along, o){ o = o || {}; const z = this.size(name, o.k), gap = o.gap === undefined ? 0.03 : o.gap, W = this.w, D = this.d;
      const q = wall === 'n' ? [along, gap + z.d / 2, PI] : wall === 's' ? [along, D - gap - z.d / 2, 0] : wall === 'w' ? [gap + z.d / 2, along, -PI / 2] : [W - gap - z.d / 2, along, PI / 2]; return this.model(name, q[0], q[1], q[2], o); }
    /* a row of the same piece along a wall: n pieces from `from` stepping `step` */
    row(name, wall, from, n, step, o){ for(let i = 0; i < n; i++) this.put(name, wall, from + i * step, o); return this; }
    plant(x, z, big){ if(this.model(big ? 'plant' : 'plant', x, z, 0, { k: big ? 1.1 : 0.9 })) return this; const y = this.y; this.mb.cyl(x, z, y, y + 0.5, 0.28, 8, '#a9694a'); this.mb.cone(x, z, y + 0.4, y + 1.9, 0.6, 7, '#3f8f4a'); this.mb.cone(x, z, y + 1.1, y + 2.3, 0.4, 7, '#56a85a'); this.cols.push([x - 0.3, z - 0.3, x + 0.3, z + 0.3, y, y + 1.2]); return this; }
    /* a plain solid box (counters, planters, tills — anything without a model) */
    box(x, z, w, d, h, c, top, o){ o = o || {}; const y0 = (o.y0 || 0) + this.y; this.mb.boxAA(x, y0, z, x + w, y0 + h, z + d, c, top || c, o.glow ? GLOW : 255); if(o.solid !== false) this.cols.push([x, z, x + w, z + d, y0, y0 + h]); return this; }
    /* a counter: carcase + overhanging top + toe-kick + (optional) panels; along x (or z when `vert`) */
    counter(x, z, w, d, h, o){ o = o || {}; const c = o.c || '#5b3f2a', top = o.top || '#d9d3c4', y0 = this.y, mb = this.mb, vert = !!o.vert;
      this.cols.push([x, z, x + w, z + d, y0, y0 + h]); mb.boxAA(x + 0.03, y0, z + 0.03, x + w - 0.03, y0 + 0.1, z + d - 0.03, '#1c1713'); mb.boxAA(x, y0 + 0.1, z, x + w, y0 + h - 0.06, z + d, c);
      mb.boxAA(x - 0.04, y0 + h - 0.06, z - 0.04, x + w + 0.04, y0 + h, z + d + 0.04, top);
      const n = Math.max(1, Math.round((vert ? d : w) / 0.9)); for(let i = 0; i < n; i++){ const a = (vert ? d : w) * i / n; if(vert){ const fx = o.face === 'w' ? x : x + w; mb.boxAA(fx - 0.01 + (o.face === 'w' ? -0.01 : 0), y0 + 0.16, z + a + 0.06, fx + 0.02, y0 + h - 0.12, z + a + (vert ? d : w) / n - 0.06, mul(rgb(c), 1.12)); } else { const fz = o.face === 'n' ? z : z + d; mb.boxAA(x + a + 0.06, y0 + 0.16, fz - 0.015 + (o.face === 'n' ? -0.01 : 0), x + a + w / n - 0.06, y0 + h - 0.12, fz + 0.02, mul(rgb(c), 1.12)); } }
      return this; }
    bench(x, z, w, d, c){ this.box(x, z, w, d, 0.45, c || '#7a5a3a', '#9a7a52'); return this; }
    /* shelving packed with goods (shops) or books (libraries): coloured spines / boxes of varied height */
    shelf(x, z, w, d, h, face, o){ o = o || {}; const rows = Math.floor(h / 0.45), cols = o.cols || ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#9b7bff', '#e8e0c8', '#e8803d', '#2f7f8f'], f = F[face || 's'], y0 = this.y, mb = this.mb; this.box(x, z, w, d, h, o.frame || '#6b4b32');
      for(let r = 0; r < rows; r++){ mb.boxAA(x + 0.02, y0 + 0.16 + r * 0.45, z + 0.02, x + w - 0.02, y0 + 0.19 + r * 0.45, z + d - 0.02, '#4a3624'); const n = Math.floor((f[0] === 0 ? w : d) / 0.34);
        for(let i = 0; i < n; i++){ const c = cols[(i * 3 + r * 5 + (x * 7 | 0)) % cols.length], hh = 0.24 + ((i * 7 + r) % 3) * 0.05, a = 0.06 + i * ((f[0] === 0 ? w : d) - 0.12) / n, sz = 0.26;
          if(f[0] === 0){ const zz = f[1] > 0 ? z + d - 0.2 : z + 0.02; mb.boxAA(x + a, y0 + 0.19 + r * 0.45, zz, x + a + sz, y0 + 0.19 + r * 0.45 + hh, zz + 0.18, c); } else { const xx = f[0] > 0 ? x + w - 0.2 : x + 0.02; mb.boxAA(xx, y0 + 0.19 + r * 0.45, z + a, xx + 0.18, y0 + 0.19 + r * 0.45 + hh, z + a + sz, c); } } }
      return this; }
    /* a clerk you can talk to */
    npc(x, z, yaw, name, line, shirt, pants, opts){ this.npcs.push({ x, z, y: this.y, yaw, name, line, shirt: shirt || '#3b6fb6', pants: pants || '#2d2f36', opts: opts || [] }); return this; }
    screen(kind, x, y, z, w, h, face, o){ y += this.y; const f = F[face], bz = f[1] ? 0.07 : 0, bx = f[0] ? 0.07 : 0, mb = this.mb, hw = w / 2;
      if(f[1]) mb.boxAA(x - hw - 0.08, y - 0.08, z - (f[1] < 0 ? 0.06 : 0), x + hw + 0.08, y + h + 0.08, z + (f[1] > 0 ? 0.06 : 0), '#1c1f26', '#1c1f26'); else mb.boxAA(x - (f[0] < 0 ? 0.06 : 0), y - 0.08, z - hw - 0.08, x + (f[0] > 0 ? 0.06 : 0), y + h + 0.08, z + hw + 0.08, '#1c1f26', '#1c1f26');
      const px = x + f[0] * 0.075, pz = z + f[1] * 0.075; let TL, TR, BR, BL;
      if(face === 's'){ TL = [px - hw, y + h, pz]; TR = [px + hw, y + h, pz]; } else if(face === 'n'){ TL = [px + hw, y + h, pz]; TR = [px - hw, y + h, pz]; } else if(face === 'e'){ TL = [px, y + h, pz + hw]; TR = [px, y + h, pz - hw]; } else { TL = [px, y + h, pz - hw]; TR = [px, y + h, pz + hw]; }
      BR = [TR[0], y, TR[2]]; BL = [TL[0], y, TL[2]]; this.screens.push({ kind, o: o || {}, corners: [TL, TR, BR, BL], x: px, z: pz, w, h, ar: w / h }); this.light(px + f[0] * 0.6, y + h / 2, pz + f[1] * 0.6, 0.18, 2.6); return this; }
    /* a floor at height y covering the room except `hole` {x, z, w, d} (the stairwell) — drawn at finish() so it is lit by every lamp placed on the way */
    slab(y, hole){ const { w, d, mb } = this, t = 0.25, top = this.pal.floor, hl = hole || { x: -9, z: -9, w: 0, d: 0 }; this.floors.push({ y, hole: hl });
      const piece = (x0, z0, x1, z1) => { if(x1 - x0 < 0.02 || z1 - z0 < 0.02) return; mb.boxAA(x0, y - t, z0, x1, y - 0.001, z1, '#d8cfbd', '#d8cfbd'); this.cols.push([x0, z0, x1, z1, y - t, y]); };
      piece(0, 0, w, hl.z); piece(0, hl.z + hl.d, w, d); piece(0, hl.z, hl.x, hl.z + hl.d); piece(hl.x + hl.w, hl.z, w, hl.z + hl.d); return this; }
    stairs(x, z0, wd, rise){ const n = Math.max(2, Math.ceil(rise / 0.19)), tr = 0.28, rs = rise / n, mb = this.mb, y = this.y;
      for(let i = 0; i < n; i++){ const za = z0 - (i + 1) * tr, zb = z0 - i * tr, top = y + (i + 1) * rs; mb.boxAA(x, top - 0.12, za, x + wd, top, zb, '#8a6a48', '#b08a62'); mb.boxAA(x, top - rs, zb - 0.04, x + wd, top - 0.1, zb, '#6b4b32'); this.cols.push([x, za, x + wd, zb, y + (i + 1) * rs - 0.12, y + (i + 1) * rs]); }
      mb.boxAA(x - 0.07, y, z0 - n * tr, x, y + rise + 0.95, z0 - n * tr + 0.07, '#5a4630'); mb.boxAA(x - 0.07, y, z0 - 0.07, x, y + 1, z0, '#5a4630');
      const rl = (a) => { const hx = a ? x + wd : x - 0.05; for(let i = 0; i < n; i += 2){ const top = y + (i + 1) * rs; mb.boxAA(hx, top, z0 - (i + 1) * tr, hx + 0.05, top + 0.9, z0 - (i + 1) * tr + 0.05, '#5a4630'); } mb.quad([hx + 0.02, y + 0.9, z0], [hx + 0.02, y + rise + 0.9, z0 - n * tr], [hx + 0.02, y + rise + 0.96, z0 - n * tr], [hx + 0.02, y + 0.96, z0], [a ? -1 : 1, 0, 0], '#4a3a2a'); }; rl(0); rl(1);
      return { x, z: z0 - n * tr, w: wd, d: n * tr }; }
    /* ---------------- the surfaces, built last so every light placed on the way counts ---------------- */
    build(){
      const { w, d, h, mb, pal: P } = this, lh = this.lh, lv = this.levels, L = (x, y, z) => this.lightAt(x, y, z), vc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
      // floors (ground + slabs)
      const floors = [{ y: 0, hole: null }].concat(this.floors);
      for(const f of floors){ const hl = f.hole, y = f.y + 0.002, inHole = (x, z) => hl && x > hl.x && x < hl.x + hl.w && z > hl.z && z < hl.z + hl.d;
        const cell = (x0, z0, sx, sz, i, j) => { const cx = x0 + sx / 2, cz = z0 + sz / 2; if(inHole(cx, cz)) return; const kind = P.fk, c4 = (c, k) => [[x0, z0], [x0 + sx, z0], [x0 + sx, z0 + sz], [x0, z0 + sz]].map(p => vc(c, k * L(p[0], f.y + 1.2, p[1])));
          if(kind === 'wood'){ const np = Math.max(1, Math.round(sz / 0.2)); for(let p = 0; p < np; p++){ const za = z0 + sz * p / np, zb = z0 + sz * (p + 1) / np, seg = Math.floor((x0 + (p % 2) * 1.0) / 2), k = 0.88 + 0.2 * hash(Math.floor(za * 5) + seg * 31, Math.floor(f.y) + 7), c = mixc(P.floor, P.floor2, hash(seg, Math.floor(za * 5)) * 0.7);
              mb.poly([[x0, y, za], [x0 + sx, y, za], [x0 + sx, y, zb], [x0, y, zb]], [0, 1, 0], c, undefined, [[x0, za], [x0 + sx, za], [x0 + sx, zb], [x0, zb]].map((p2, qi) => vc(c, k * (qi < 2 ? 0.9 : 1.0) * L(p2[0], f.y + 1.2, p2[1])))); } }
          else if(kind === 'checker' || kind === 'tile'){ const big = kind === 'checker' ? 1 : 0.5, ti = Math.floor(x0 / big), tj = Math.floor(z0 / big), c = ((ti + tj) & 1) ? P.floor : P.floor2, k = 0.97 + 0.06 * hash(ti, tj + 99);
              mb.quad([x0, y - 0.014, z0], [x0 + sx, y - 0.014, z0], [x0 + sx, y - 0.014, z0 + sz], [x0, y - 0.014, z0 + sz], [0, 1, 0], vc(P.floor, 0.3));
              const g = 0.012, pc = c4(c, k); mb.poly([[x0 + g, y, z0 + g], [x0 + sx - g, y, z0 + g], [x0 + sx - g, y, z0 + sz - g], [x0 + g, y, z0 + sz - g]], [0, 1, 0], c, undefined, pc); }
          else { const k = 0.96 + 0.08 * hash(i, j + Math.floor(f.y)); mb.poly([[x0, y, z0], [x0 + sx, y, z0], [x0 + sx, y, z0 + sz], [x0, y, z0 + sz]], [0, 1, 0], P.floor, undefined, c4(P.floor, k)); } };
        const nx = Math.ceil(w), nz = Math.ceil(d); for(let i = 0; i < nx; i++) for(let j = 0; j < nz; j++){ const x0 = i * w / nx, z0 = j * d / nz, sx = w / nx, sz = d / nz, near = hl && x0 < hl.x + hl.w + 0.01 && x0 + sx > hl.x - 0.01 && z0 < hl.z + hl.d + 0.01 && z0 + sz > hl.z - 0.01;
          if(near){ for(let a = 0; a < 2; a++) for(let b = 0; b < 2; b++) cell(x0 + a * sx / 2, z0 + b * sz / 2, sx / 2, sz / 2, i * 2 + a, j * 2 + b); } else cell(x0, z0, sx, sz, i, j); } }
      // ceilings (one per level) + recessed lights
      for(let k = 0; k < lv; k++){ const y = (k + 1) * lh, nx = Math.ceil(w), nz = Math.ceil(d); for(let i = 0; i < nx; i++) for(let j = 0; j < nz; j++){ const x0 = i * w / nx, z0 = j * d / nz, x1 = (i + 1) * w / nx, z1 = (j + 1) * d / nz;
        if(k < lv - 1 && this.floors[k] && this.floors[k].hole){ const hl = this.floors[k].hole; if((x0 + x1) / 2 > hl.x && (x0 + x1) / 2 < hl.x + hl.w && (z0 + z1) / 2 > hl.z && (z0 + z1) / 2 < hl.z + hl.d) continue; }
        mb.poly([[x0, y - 0.002 - (k < lv - 1 ? 0.25 : 0), z0], [x1, y - 0.002 - (k < lv - 1 ? 0.25 : 0), z0], [x1, y - 0.002 - (k < lv - 1 ? 0.25 : 0), z1], [x0, y - 0.002 - (k < lv - 1 ? 0.25 : 0), z1]], [0, -1, 0], P.ceil, undefined, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(p => vc(P.ceil, Math.max(0.86, 1.02 * L(p[0], y - 0.6, p[1]))))); } }
      for(const f of this.lampFix){ const y = f.y - (f.y < h - 0.2 ? 0.0 : 0.0), lampC = P.lamp; if(P.lampStyle === 'round'){ mb.cyl(f.x, f.z, y - 0.07, y - 0.02, 0.2, 10, '#d8d2c6', '#d8d2c6'); mb.quad([f.x - 0.15, y - 0.075, f.z - 0.15], [f.x + 0.15, y - 0.075, f.z - 0.15], [f.x + 0.15, y - 0.075, f.z + 0.15], [f.x - 0.15, y - 0.075, f.z + 0.15], [0, -1, 0], lampC, GLOW); }
        else { mb.boxAA(f.x - 0.78, y - 0.05, f.z - 0.28, f.x + 0.78, y - 0.0, f.z + 0.28, '#cfcac0', '#cfcac0'); mb.quad([f.x - 0.7, y - 0.052, f.z - 0.2], [f.x + 0.7, y - 0.052, f.z - 0.2], [f.x + 0.7, y - 0.052, f.z + 0.2], [f.x - 0.7, y - 0.052, f.z + 0.2], [0, -1, 0], lampC, GLOW); } }
      // walls: panels with per-vertex light, a wainscot, trim, openings
      const names = ['n', 's', 'e', 'w'], wh = P.wainH;
      for(const wl of names){ const len = this.len(wl), ops = this.open[wl], brk = new Set([0, len]); ops.forEach(o => { brk.add(clamp(o.s0, 0, len)); brk.add(clamp(o.s1, 0, len)); }); const bs = [...brk].sort((a, b) => a - b);
        const nrm = wl === 'n' ? [0, 0, 1] : wl === 's' ? [0, 0, -1] : wl === 'w' ? [1, 0, 0] : [-1, 0, 0];
        const panel = (sa, sb, ya, yb) => { const colsN = Math.max(1, Math.ceil((sb - sa) / 1.0)); const rowsY = [ya]; for(const b of [0.95, wh, 2.2]) for(let q = 0; q < lv; q++){ const yy = b + q * lh; if(yy > ya + 0.05 && yy < yb - 0.05 && !rowsY.includes(yy)) rowsY.push(yy); } rowsY.push(yb); rowsY.sort((a, b) => a - b);
          for(let i = 0; i < colsN; i++){ const s0 = sa + (sb - sa) * i / colsN, s1 = sa + (sb - sa) * (i + 1) / colsN; for(let j = 0; j < rowsY.length - 1; j++){ const y0 = rowsY[j], y1 = rowsY[j + 1], ym = (y0 + y1) / 2, lvlY = ym % lh, base = lvlY < wh ? P.wain : P.wall;
              const A = this.pt(wl, s0, 0), B = this.pt(wl, s1, 0), V = (s, y) => { const p = this.pt(wl, s, 0.35), ao = 0.84 + 0.16 * clamp((y % lh) / 0.9, 0, 1); return vc(base, ao * L(p[0], y, p[1])); };
              mb.poly([[A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]]], nrm, base, undefined, [V(s0, y0), V(s1, y0), V(s1, y1), V(s0, y1)]); } } };
        for(let q = 0; q < bs.length - 1; q++){ const sa = bs[q], sb = bs[q + 1], mid = (sa + sb) / 2, inn = ops.filter(o => mid > o.s0 && mid < o.s1); if(!inn.length){ panel(sa, sb, 0, h); continue; }
          const lo = Math.min(...inn.map(o => o.y0)), hi = Math.max(...inn.map(o => o.y1)); if(lo > 0.01) panel(sa, sb, 0, lo); if(hi < h - 0.01) panel(sa, sb, hi, h); }
        // trim on every level: baseboard, chair rail, crown moulding (skipping the doorway)
        for(let k = 0; k < lv; k++){ const y = k * lh; for(let q = 0; q < bs.length - 1; q++){ const sa = bs[q], sb = bs[q + 1], mid = (sa + sb) / 2, door = ops.some(o => o.door && mid > o.s0 && mid < o.s1); if(!door) this.wbox(wl, sa, sb, y, y + 0.13, 0, 0.035, P.base, P.base);
            const ow = ops.filter(o => mid > o.s0 && mid < o.s1 && !o.door && o.y0 < y + wh + 0.1 && o.y1 > y + wh); if(!ow.length && wh > 0.3) this.wbox(wl, sa, sb, y + wh, y + wh + 0.05, 0, 0.05, P.trim, P.trim);
            const top = ops.some(o => mid > o.s0 && mid < o.s1 && o.y1 > y + lh - 0.2); if(!top) this.wbox(wl, sa, sb, y + lh - 0.11, y + lh, 0, 0.07, P.trim, P.trim); } } }
      // the doorway: jambs + lintel + EXIT sign
      const cx = this.doorX, dw = this.dw; mb.boxAA(cx - dw / 2 - 0.12, 0, d - 0.14, cx - dw / 2, 2.5, d, '#5a4630'); mb.boxAA(cx + dw / 2, 0, d - 0.14, cx + dw / 2 + 0.12, 2.5, d, '#5a4630'); mb.boxAA(cx - dw / 2 - 0.12, 2.5, d - 0.14, cx + dw / 2 + 0.12, 2.62, d, '#5a4630');
      mb.quad([cx - 0.5, 2.7, d - 0.02], [cx + 0.5, 2.7, d - 0.02], [cx + 0.5, 3.05, d - 0.02], [cx - 0.5, 3.05, d - 0.02], [0, 0, -1], [60, 220, 120], GLOW);
      return this; }
    finish(){ if(!this.shelled) this.shell({}); this.build(); return { mesh: this.mb.finish(), cols: this.cols, doorX: this.doorX, h: this.h, levels: this.levels, lh: this.o.lh || this.h, screens: this.screens, npcs: this.npcs, w: this.w, d: this.d, spawn: { x: this.w / 2, z: this.d - 1.8, yaw: 0 }, name: this.name }; }
  }
  const register = (kind, fn) => { REG[kind] = fn; };
  const build = (kind, ctx) => { const fn = REG[kind] || REG.generic; CUR = { doorX: (ctx || {}).doorX }; try{ return fn(ctx || {}).finish(); } finally { CUR = {}; } };

  /* ---------------- small set-dressing helpers shared by the rooms ---------------- */
  /* n windows spread along one wall (world coordinate along it), skipping the doorway */
  const windows = (r, wall, n, ww, hh, y0, o) => { const len = r.len(wall), m = 1.6 + ww / 2, span = len - 2 * m; for(let i = 0; i < n; i++){ const t = n === 1 ? len / 2 : m + span * i / (n - 1); if(wall === 's' && Math.abs(t - r.doorX) < r.dw / 2 + ww / 2 + 0.4) continue; r.window(wall, t, ww, hh, y0, o); } return r; };
  const column = (r, x, z, h, c) => { const y = r.y, mb = r.mb; mb.boxAA(x - 0.45, y, z - 0.45, x + 0.45, y + 0.25, z + 0.45, '#cfc8ba'); mb.cyl(x, z, y + 0.25, y + h - 0.3, 0.34, 14, c || '#ece6da', c || '#ece6da'); mb.boxAA(x - 0.45, y + h - 0.3, z - 0.45, x + 0.45, y + h, z + 0.45, '#cfc8ba'); r.cols.push([x - 0.45, z - 0.45, x + 0.45, z + 0.45, y, y + h]); };
  const stanchion = (r, x, z) => { r.mb.cyl(x, z, r.y, r.y + 0.9, 0.035, 6, '#c9a64a', '#c9a64a'); r.mb.cyl(x, z, r.y, r.y + 0.04, 0.16, 10, '#b8932f', '#b8932f'); r.mb.cyl(x, z, r.y + 0.9, r.y + 0.95, 0.07, 8, '#c9a64a', '#c9a64a'); };
  const rope = (r, x0, z0, x1, z1) => { const n = 6; for(let i = 0; i < n; i++){ const t0 = i / n, t1 = (i + 1) / n, sag = Math.sin(Math.PI * (t0 + t1) / 2) * 0.1, ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1, y = r.y + 0.84 - sag; r.mb.boxAA(Math.min(ax, bx) - 0.02, y - 0.02, Math.min(az, bz) - 0.02, Math.max(ax, bx) + 0.02, y + 0.02, Math.max(az, bz) + 0.02, '#8f1d2c'); } };
  const chandelier = (r, x, z, y, k) => { const mb = r.mb; mb.boxAA(x - 0.02, y, z - 0.02, x + 0.02, y + 0.7, z + 0.02, '#8a7335'); mb.cyl(x, z, y - 0.08, y, 0.42 * (k || 1), 12, '#c9a64a', '#c9a64a'); for(let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2, px = x + Math.cos(a) * 0.38 * (k || 1), pz = z + Math.sin(a) * 0.38 * (k || 1); mb.cyl(px, pz, y - 0.3, y - 0.08, 0.03, 5, '#c9a64a', '#c9a64a'); mb.cyl(px, pz, y - 0.42, y - 0.3, 0.07, 6, [255, 236, 190], [255, 236, 190]); }
    mb.quad([x - 0.3, y - 0.095, z - 0.3], [x + 0.3, y - 0.095, z - 0.3], [x + 0.3, y - 0.095, z + 0.3], [x - 0.3, y - 0.095, z + 0.3], [0, -1, 0], [255, 232, 180], GLOW); r.light(x, y - 0.5, z, 0.42, 5.2); };
  const partition = (r, x0, z0, x1, z1, c, h) => { h = h || r.lh; r.mb.boxAA(x0, r.y, z0, x1, r.y + h, z1, c || r.pal.wall, c || r.pal.wall); r.cols.push([x0, z0, x1, z1, r.y, r.y + h]); };
  const J = n => ['#e8d5a8', '#c9a86a', '#d98c8c', '#8cc9d9', '#a8d98c'][n % 5];
  const NEON = [[255, 80, 200], [80, 220, 255], [255, 220, 80], [120, 255, 140]];

  register('bank', c => { const r = new Room(22, 16, 4.6, { name: 'Bank', fk: 'checker', floor: '#ece6d9', floor2: '#b9b2a2', wall: '#efe6d2', wain: '#4a3322', base: '#3b2a1c', trim: '#f6f0e2', wainH: 1.1, lampStyle: 'round', lamp: [255, 232, 190], lampK: 0.26, amb: 0.6 });
    r.shell({ wall: '#efe6d2', wain: '#4a3322', base: '#3b2a1c', fk: 'checker', floor: '#ece6d9', floor2: '#b9b2a2', lampStyle: 'round', lamp: [255, 232, 190], lampK: 0.26, wainH: 1.1, fab: [0.42, 0.13, 0.16], rug: [0.5, 0.15, 0.17] });
    windows(r, 'w', 2, 2.0, 1.9, 1.1, { curtain: '#7a1f2b' }); windows(r, 'e', 2, 2.0, 1.9, 1.1, { curtain: '#7a1f2b' }); windows(r, 's', 2, 2.2, 1.9, 1.1, { curtain: '#7a1f2b' });
    r.counter(3, 4.2, 16, 1.2, 1.1, { c: '#4a3322', top: '#d7cfbc', face: 's' }); for(let x = 3.4; x < 19; x += 1.6){ r.mb.boxAA(x, 1.1, 4.3, x + 0.05, 2.35, 4.35, '#c9a64a'); } r.mb.boxAA(3, 2.35, 4.28, 19, 2.4, 4.38, '#c9a64a');
    [6, 11, 16].forEach(x => { r.m('computerScreen', x, 4.8, 0, { dy: 1.1, nocol: true }); r.m('computerKeyboard', x, 5.05, 0, { dy: 1.1, nocol: true }); r.m('chairDesk', x + 1.3, 2.6, PI * 0.9); });
    // the back wall: safe-deposit boxes and the vault door
    r.box(1, 0.2, 10, 0.5, 2.6, '#5c6573', '#7f8896'); for(let i = 0; i < 20; i++) for(let j = 0; j < 6; j++) r.mb.boxAA(1.15 + i * 0.49, 0.35 + j * 0.4, 0.69, 1.55 + i * 0.49 - 0.06, 0.65 + j * 0.4, 0.74, (i + j) % 2 ? '#b8bcc6' : '#a4a9b4');
    r.mb.boxAA(14.2, 0, 0.2, 18.8, 3.1, 0.8, '#59606d', '#59606d'); r.mb.boxAA(14.6, 0.2, 0.8, 18.4, 2.9, 0.95, '#868e9c', '#868e9c'); r.mb.cyl(16.5, 0.9, 1.5, 1.52, 0.7, 16, '#b5bcc9', '#b5bcc9'); r.mb.boxAA(16.42, 0.97, 1.0, 16.58, 2.1, 1.1, '#3a3f4a'); r.mb.boxAA(15.9, 1.46, 1.0, 17.1, 1.62, 1.1, '#3a3f4a'); r.cols.push([14.2, 0.2, 18.8, 0.95, 0, 3.1]);
    r.npc(6, 3.1, PI, 'Teller Ines', 'Welcome to the bank. Would you like to see your account?', '#244a7a', null, [{ label: 'Open my account', app: 'Bank' }]);
    r.npc(11, 3.1, PI, 'Teller Hugo', 'Loans and bills? I can help with that.', '#244a7a', null, [{ label: 'Loans & bills', app: 'Bank' }]);
    r.npc(16, 3.1, PI, 'Teller Odile', 'Looking to invest instead? The exchange is next door.', '#244a7a', null, [{ label: 'My portfolio', app: 'Stocks' }]);
    r.screen('bank', 0.04, 1.6, 9, 3.4, 1.9, 'e'); r.screen('stocks', 21.96, 1.6, 9, 3.4, 1.9, 'w');
    // the lobby: queue rope, seating, ATMs, columns, rug, chandeliers
    [[5, 7.2], [8.5, 7.2], [12, 7.2], [15.5, 7.2]].forEach(p => stanchion(r, p[0], p[1])); for(let i = 0; i < 3; i++) rope(r, [5, 8.5, 12][i], 7.2, [8.5, 12, 15.5][i], 7.2);
    r.m('rugRectangle', 11, 10.8, 0, { k: 2.4, ky: 1, nocol: true }); r.m('benchCushion', 8, 11.5, PI, { k: 1.6 }); r.m('benchCushion', 14, 11.5, PI, { k: 1.6 }); r.m('sideTable', 11, 13.2, 0, { k: 0.8 });
    [[2.2, 13.2], [19.8, 13.2]].forEach(p => { r.box(p[0] - 0.4, p[1] - 0.3, 0.8, 0.6, 1.6, '#2b3340', '#3a4558'); r.mb.boxAA(p[0] - 0.3, 1.1, p[1] + 0.3 - 0.02, p[0] + 0.3, 1.5, p[1] + 0.3 + 0.01, [90, 200, 170], [90, 200, 170], GLOW); });
    [[4.5, 8], [17.5, 8], [4.5, 13.5], [17.5, 13.5]].forEach(p => column(r, p[0], p[1], 4.6, '#ece6da')); r.plant(1.2, 1.2); r.plant(20.8, 1.2); r.plant(1.3, 14.6); r.plant(20.7, 14.6);
    chandelier(r, 7, 9.5, 4.6, 1.2); chandelier(r, 15, 9.5, 4.6, 1.2); r.art('n', 12.2, 2.4, 1.6, 1.0, 3, '#c9a64a'); return r; });
  register('exchange', c => { const r = new Room(28, 20, 5.4, { name: 'Stock Exchange' }); r.shell({ fk: 'tile', floor: '#3b4252', floor2: '#454d60', wall: '#d9e3dc', wain: '#2f4a3c', base: '#26382d', wainH: 1.0, lamp: [210, 240, 255], lampK: 0.3, amb: 0.56 });
    windows(r, 'w', 3, 2.4, 2.2, 1.2); windows(r, 'e', 3, 2.4, 2.2, 1.2);
    for(let i = 0; i < 24; i++){ const hh = 0.6 + ((i * 37) % 9) / 9 * 2.2, up = (i * 7) % 3 !== 0, c2 = up ? [70, 220, 120] : [240, 90, 80]; r.mb.boxAA(2 + i * 1.0, 1.4, 0.1, 2.75 + i * 1.0, 1.4 + hh, 0.3, c2, c2, GLOW); }
    r.mb.boxAA(1.2, 0.9, 0.06, 26.8, 1.35, 0.4, '#1d2330'); r.light(14, 2.4, 1.6, 0.5, 8);
    r.screen('stocks', 14, 3.6, 0.06, 6, 1.6, 's'); r.screen('news', 0.04, 1.5, 10, 4.4, 2.5, 'e'); r.screen('stocks', 27.96, 1.5, 10, 4.4, 2.5, 'w');
    for(let row = 0; row < 3; row++) for(let i = 0; i < 4; i++){ const x = 4.5 + i * 6, z = 7.5 + row * 3.6; r.box(x - 1.0, z - 0.4, 2.0, 0.8, 0.76, '#4b5563', '#cfd4dc'); r.m('computerScreen', x - 0.5, z - 0.1, PI, { dy: 0.76, nocol: true }); r.m('computerScreen', x + 0.5, z - 0.1, PI, { dy: 0.76, nocol: true }); r.m('chairDesk', x, z + 0.95, 0, { k: 1 }); }
    r.npc(14, 5.2, PI, 'Trader Pavel', 'Buy low, sell high. Easier said than done. Want to trade?', '#8a2f2f', null, [{ label: 'Trade $WEST', app: 'Stocks' }]);
    r.npc(22, 14.5, PI / 2, 'Analyst Mina', 'I read the news so you do not have to.', '#3f6a4c', null, [{ label: 'Market news', app: 'News' }]); r.plant(1.2, 18.6); r.plant(26.8, 18.6); r.m('rugRectangle', 14, 16.5, 0, { k: 3.2, nocol: true }); r.row('benchCushion', 's', 8, 3, 6, { k: 1.4 }); return r; });
  register('shop', c => { const r = new Room(20, 16, 4, { name: 'WestShop' }); r.shell({ fk: 'tile', floor: '#d6ccb4', floor2: '#c4b99d', wall: '#f3e7c8', wain: '#c0803a', base: '#8a5a26', wainH: 1.1, lamp: [255, 244, 224], lampK: 0.32 });
    windows(r, 's', 2, 2.6, 1.8, 1.1); windows(r, 'w', 2, 2.0, 1.6, 1.3); windows(r, 'e', 2, 2.0, 1.6, 1.3);
    for(let i = 0; i < 4; i++) r.shelf(3 + i * 4, 3.5, 2.6, 0.7, 2.2, 's'); for(let i = 0; i < 3; i++) r.shelf(4 + i * 5, 8.2, 3, 0.7, 1.6, 'n'); for(let i = 0; i < 3; i++) r.shelf(4 + i * 5, 9.0, 3, 0.7, 1.6, 's', { cols: ['#e8e0c8', '#d9534f', '#5cb85c', '#f0ad4e'] });
    r.counter(14, 12, 5, 1, 1.1, { c: '#a86a2c', top: '#e8d9b8', face: 'n' }); r.m('computerScreen', 16.4, 12.5, PI, { dy: 1.1, nocol: true }); r.m('kitchenCoffeeMachine', 18.3, 12.5, PI, { dy: 1.1, nocol: true }); r.m('cardboardBoxClosed', 13, 13.5, 0.2, { k: 1.2 });
    r.npc(16.5, 13.3, 0, 'Shopkeeper', 'Elements, tools and bargains. Take a look!', '#e0a23a', null, [{ label: 'Browse the shop', app: 'WestShop' }]);
    r.screen('movers', 10, 1.7, 0.06, 5.4, 1.9, 's'); r.plant(1.2, 1.2); r.plant(18.8, 1.2); r.m('rugDoormat', r.doorX, 15.2, 0, { k: 1.4, nocol: true }); r.m('kitchenFridgeLarge', 1.4, 7, PI / 2, { k: 1.1 }); r.m('kitchenFridgeLarge', 1.4, 8.3, PI / 2, { k: 1.1 }); return r; });
  register('arcade', c => { const r = new Room(24, 18, 4.2, { name: 'Arcade' }); r.shell({ fk: 'carpet', floor: '#1d1736', wall: '#2a2147', wain: '#171126', base: '#120d22', ceil: '#120d22', wainH: 1.1, lamp: [200, 130, 255], lampK: 0.26, amb: 0.5, trim: '#2f2552' });
    for(let row = 0; row < 2; row++) for(let i = 0; i < 5; i++){ const x = 3.5 + i * 3.8, z = 5 + row * 6, g = NEON[(i + row) % 4]; if(r.m((i + row) % 3 === 2 ? 'claw' : 'arcade', x, z, PI)) r.mb.boxAA(x - 0.5, 2.05, z - 0.4, x + 0.5, 2.1, z + 0.4, g, g, GLOW); r.light(x, 1.6, z + 0.8, 0.22, 2.6); }
    for(let x = 1; x < 23; x += 3) r.mb.quad([x, 0.012, 1.5], [x + 0.2, 0.012, 1.5], [x + 0.2, 0.012, 17], [x, 0.012, 17], [0, 1, 0], NEON[(x / 3 | 0) % 4], GLOW);
    for(let i = 0; i < 6; i++){ const g = NEON[i % 4]; r.mb.boxAA(0.04, 2.6, 2 + i * 2.8, 0.1, 2.75, 3.4 + i * 2.8, g, g, GLOW); r.mb.boxAA(23.9, 2.6, 2 + i * 2.8, 23.96, 2.75, 3.4 + i * 2.8, NEON[(i + 2) % 4], NEON[(i + 2) % 4], GLOW); r.light(0.8, 2.6, 2.7 + i * 2.8, 0.2, 2.8); r.light(23.2, 2.6, 2.7 + i * 2.8, 0.2, 2.8); }
    r.screen('arcade', 12, 1.8, 0.06, 6, 2.2, 's'); r.counter(18, 14.2, 5, 1, 1.1, { c: '#3b3560', top: '#6a5fb8', face: 'n' }); r.row('stoolBar', 'e', 10, 3, 1.4, { k: 1.1 });
    r.npc(20.5, 15.4, 0, 'Attendant', 'Gambling is only for players with a home. Feeling lucky?', '#b36be0', null, [{ label: 'Slots · Blackjack · Poker · Bus', app: 'Arcade' }, { label: 'Mini-games', app: 'Games' }]); return r; });
  register('agency', c => { const r = new Room(18, 14, 3.8, { name: 'Estate Agency' }); r.shell({ fk: 'wood', floor: '#c6a77e', floor2: '#b99a70', wall: '#f1dfc8', wain: '#8f5f3f', base: '#6e472c', wainH: 1.0, lamp: [255, 238, 214], lampStyle: 'round' });
    windows(r, 's', 2, 2.4, 1.8, 1.0, { curtain: '#b05a3c' }); windows(r, 'n', 2, 2.0, 1.5, 1.4); r.screen('listings', 0.04, 1.5, 7, 3.4, 1.9, 'e'); r.screen('listings', 17.96, 1.5, 7, 3.4, 1.9, 'w');
    // a scale model of the town on a table
    r.box(5.4, 3, 6.2, 4.4, 0.8, '#6b4b32', '#3d6b3f'); for(let i = 0; i < 7; i++) for(let j = 0; j < 5; j++){ const hh = 0.18 + ((i * 5 + j * 3) % 5) * 0.11; r.mb.boxAA(5.7 + i * 0.85, 0.8, 3.3 + j * 0.8, 6.3 + i * 0.85, 0.8 + hh, 3.85 + j * 0.8, J(i + j), J(i + j)); }
    r.m('desk', 4, 11.3, PI, { k: 1.2 }); r.m('computerScreen', 4, 11.1, PI, { dy: 0.9, nocol: true }); r.m('chairDesk', 4, 12.3, 0); r.m('loungeChair', 2, 8, -PI / 2); r.m('loungeChair', 2, 6.2, -PI / 2); r.m('tableCoffee', 3.6, 7.1, PI / 2, { k: 0.8 }); r.m('rugRectangle', 3.6, 7.1, PI / 2, { k: 1.4, nocol: true });
    r.row('bookcaseOpen', 'e', 3, 3, 0.9); r.art('n', 9, 2.2, 1.5, 1.0, 5); r.npc(9, 10.3, PI, 'Agent Quinn', 'Looking to buy, rent or sell? I know every house in town.', '#c98a62', null, [{ label: 'Homes for sale', app: 'WestMap', link: { filter: 'sale' } }, { label: 'My assets', app: 'RealEstate' }, { label: 'Show me the map', app: 'WestMap', link: { me: true } }]);
    r.m('desk', 9, 11.3, PI, { k: 1.4 }); r.m('computerScreen', 8.4, 11.1, PI, { dy: 0.9, nocol: true }); r.plant(1.2, 1.2); r.plant(16.8, 1.2); r.plant(16.8, 12.8); return r; });
  /* car dealership + private airport: a clerk sells through the Assets app (tab opens on cars / planes), a wall screen lists the catalogue. Buying itself is gated on standing here (OS.realworld.at). */
  const showroomCar = (r, i, x, z, yaw) => { const C = RW.Props && RW.Props.cars && RW.Props.cars[i % (RW.Props.cars.length || 1)]; if(!C || !C.m0) return false; r.mb.addMesh(C.m0, x, r.y + 0.14, z, yaw, 1, null, 1); r.cols.push([x - 1, z - 2, x + 1, z + 2, r.y, r.y + 1.5]); return true; };
  register('dealer', c => { const r = new Room(24, 18, 4.8, { name: 'Car Dealership' }); r.shell({ fk: 'tile', floor: '#dcd9d2', floor2: '#cbc7be', wall: '#f3efe6', wain: '#a63c36', base: '#7f2a26', wainH: 0.9, lamp: [255, 248, 236], lampK: 0.34, lampStyle: 'panel' });
    windows(r, 's', 2, 3.4, 2.4, 0.5); windows(r, 'w', 2, 2.6, 2.0, 1.0); windows(r, 'e', 2, 2.6, 2.0, 1.0);
    r.box(3, 3, 6.5, 3.2, 0.14, '#2b2c30', '#3a3b40'); r.box(14.5, 3, 6.5, 3.2, 0.14, '#2b2c30', '#3a3b40'); showroomCar(r, 0, 6.25, 4.6, PI * 0.9); showroomCar(r, 4, 17.75, 4.6, -PI * 0.9); [[6.25, 4.6], [17.75, 4.6]].forEach(p => r.light(p[0], 3.4, p[1], 0.5, 3.6));
    r.counter(8, 12.2, 8, 1.1, 1.1, { c: '#5e5a52', top: '#d9d3c4', face: 'n' }); r.m('computerScreen', 10, 12.6, PI, { dy: 1.1, nocol: true }); r.m('computerScreen', 14, 12.6, PI, { dy: 1.1, nocol: true });
    r.screen('cars', 0.04, 1.4, 8.5, 5.6, 2.4, 'e'); r.screen('cars', 23.96, 1.4, 8.5, 5.6, 2.4, 'w'); r.m('loungeDesignSofa', 3, 13.6, PI / 2 * -1 + PI, { k: 1 }); r.m('tableCoffeeGlass', 5.2, 14, 0); r.m('rugRound', 5, 14, 0, { k: 1.2, nocol: true });
    r.npc(12, 11.0, PI, 'Sales Rex', 'Looking for wheels? Every car here is yours to drive the moment you buy it.', '#d9534f', null, [{ label: 'Browse & buy cars', app: 'RealEstate', tab: 'cars' }, { label: 'My vehicles', app: 'RealEstate', tab: 'garage' }]); r.plant(1.4, 1.4); r.plant(22.6, 1.4); r.m('kitchenCoffeeMachine', 22.4, 12.9, PI, { dy: 0.9, nocol: true }); r.m('sideTable', 22, 13.2, PI); return r; });
  register('airport', c => { const r = new Room(24, 18, 6.4, { name: 'Private Airport' }); r.shell({ fk: 'tile', floor: '#d3dbe6', floor2: '#bfc9d8', wall: '#e8eef5', wain: '#3b7fb0', base: '#2c6089', wainH: 1.0, lamp: [235, 245, 255], lampK: 0.3 });
    windows(r, 'w', 2, 3.2, 3.2, 1.2); windows(r, 'e', 2, 3.2, 3.2, 1.2); windows(r, 's', 2, 3.0, 3.0, 1.2);
    r.counter(7, 11.6, 10, 1.2, 1.1, { c: '#46586b', top: '#dde4ec', face: 'n' }); r.m('computerScreen', 9, 12, PI, { dy: 1.1, nocol: true }); r.m('computerScreen', 15, 12, PI, { dy: 1.1, nocol: true }); r.row('benchCushion', 'n', 5, 3, 3.2, { k: 1.6 }); r.row('benchCushion', 'n', 17, 1, 3, { k: 1.6 });
    for(let i = 0; i < 5; i++) r.m(i % 2 ? 'cardboardBoxClosed' : 'cardboardBoxOpen', 4 + i * 1.1, 8.5 + (i % 2) * 0.5, i * 0.7, { k: 1.4 }); r.m('rugRectangle', 12, 7, 0, { k: 3.4, nocol: true });
    r.screen('planes', 0.04, 1.6, 8.5, 5.6, 2.4, 'e'); r.screen('planes', 23.96, 1.6, 8.5, 5.6, 2.4, 'w'); r.screen('planes', 12, 3.3, 0.06, 5, 1.7, 's');
    r.npc(12, 10.4, PI, 'Captain Vale', 'Runway is east of the city. Mind the crosswind, and never skip the pre-flight check.', '#4aa3d9', null, [{ label: 'Browse & buy planes', app: 'RealEstate', tab: 'planes' }, { label: 'My vehicles', app: 'RealEstate', tab: 'garage' }]); r.plant(1.4, 1.4); r.plant(22.6, 1.4); r.plant(1.4, 16.4); r.plant(22.6, 16.4); return r; });
  register('hall', c => { const r = new Room(26, 20, 6, { name: 'Council Hall' }); r.shell({ fk: 'checker', floor: '#d8d2c4', floor2: '#9e988a', wall: '#e4e7ee', wain: '#5b4a3a', base: '#3f3226', wainH: 1.3, lamp: [255, 240, 218], lampStyle: 'round', lampK: 0.3 });
    windows(r, 'w', 3, 2.0, 2.6, 1.5, { curtain: '#2f3f6b' }); windows(r, 'e', 3, 2.0, 2.6, 1.5, { curtain: '#2f3f6b' }); for(let i = 0; i < 4; i++) column(r, 3 + i * 6.7, 3, 6, '#f1f2f6');
    r.counter(8, 1, 10, 2.4, 0.5, { c: '#5b4a3a', top: '#8a6a48' }); r.counter(10, 1.3, 6, 0.9, 1.1, { c: '#4a3a2c', top: '#8a6a48', face: 's' }); r.m('chairDesk', 13, 2.9, 0, { k: 1.1 });
    for(let i = 0; i < 4; i++){ r.m('table', 7 + i * 4, 9, 0, { k: 1.1 }); r.m('chair', 6.4 + i * 4, 10.1, PI, { k: 1.1 }); r.m('chair', 7.6 + i * 4, 10.1, PI, { k: 1.1 }); r.m('chair', 6.4 + i * 4, 7.9, 0, { k: 1.1 }); r.m('chair', 7.6 + i * 4, 7.9, 0, { k: 1.1 }); }
    r.npc(13, 2.9, PI, 'Mayor Ada', 'Taxes keep the city running. Bills can be paid at the bank.', '#7c8696', null, [{ label: 'Taxes & bills', app: 'Bank' }]);
    r.npc(7, 13.5, PI / 2, 'Clerk Odo', 'The leaderboard is public record.', '#5d6b8a', null, [{ label: 'Leaderboard', app: 'Leaderboard' }, { label: 'Town news', app: 'News' }]);
    r.screen('board', 0.04, 1.6, 12, 4.6, 2.6, 'e'); r.screen('news', 25.96, 1.6, 12, 4.6, 2.6, 'w'); r.m('rugRectangle', 13, 15, 0, { k: 3.6, nocol: true }); r.plant(1.2, 18.6); r.plant(24.8, 18.6); chandelier(r, 13, 10, 6, 1.6); chandelier(r, 13, 16, 6, 1.2); r.art('n', 20, 2.6, 1.6, 1.1, 8, '#c9a64a'); r.art('n', 6, 2.6, 1.6, 1.1, 9, '#c9a64a'); return r; });
  /* Police station: the front desk (crime report, pay fines, hand yourself in), the wanted board, the cells. Clerk options with `act` call RealWorld.Crime (crime.js), not an app. */
  register('police', c => { const r = new Room(24, 18, 4.2, { name: 'Police Station' }); r.shell({ fk: 'tile', floor: '#c9ccd4', floor2: '#b2b6c2', wall: '#dfe4ee', wain: '#1f3a6b', base: '#162a4f', wainH: 1.2, lamp: [236, 244, 255], lampK: 0.32 });
    windows(r, 's', 2, 2.2, 1.6, 1.3); windows(r, 'e', 2, 2.0, 1.6, 1.4); r.counter(7, 5, 10, 1.4, 1.1, { c: '#27406f', top: '#cfd6e4', face: 's' }); r.m('computerScreen', 9, 5.5, 0, { dy: 1.1, nocol: true }); r.m('computerScreen', 14.5, 5.5, 0, { dy: 1.1, nocol: true }); r.m('chairDesk', 12, 3.4, 0);
    r.m('desk', 5, 14.5, PI, { k: 1.2 }); r.m('computerScreen', 5, 14.3, PI, { dy: 0.8, nocol: true }); r.m('chairDesk', 5, 15.6, 0); r.m('desk', 19, 14.5, PI, { k: 1.2 }); r.m('computerScreen', 19, 14.3, PI, { dy: 0.8, nocol: true }); r.m('chairDesk', 19, 15.6, 0);
    r.npc(12, 3.6, PI, 'Sgt. Okafor', 'Station desk. Report a crime, settle what you owe, or hand yourself in.', '#1f3a6b', '#1b2538', [{ label: 'Crime report (my record)', act: 'report' }, { label: 'Pay outstanding fines', act: 'pay' }, { label: 'Hand myself in (clear wanted level)', act: 'surrender' }]);
    r.npc(20.5, 9, -PI / 2, 'Officer Lind', 'Steal a car and we will find you. Lose us and the stars fade. Stay clean.', '#274a8a', '#1b2538', [{ label: 'How wanted levels work', act: 'help' }]);
    r.screen('crime', 0.04, 1.4, 9, 4.6, 2.8, 'e'); r.screen('crime', 23.96, 1.4, 9, 4.6, 2.8, 'w');
    // the cells: bars, a bench and a bunk in each
    for(let i = 0; i < 2; i++){ const z0 = 1.2 + i * 2.0; for(let k = 0; k < 7; k++) r.mb.boxAA(1.3 + k * 0.7, 0, z0 + 1.9, 1.38 + k * 0.7, 2.7, z0 + 1.98, '#6c7587'); r.mb.boxAA(1.2, 2.55, z0 + 1.88, 6.2, 2.7, z0 + 2.0, '#6c7587'); r.cols.push([1.2, z0 + 1.88, 6.2, z0 + 2.0, 0, 2.7]); r.box(1.2, z0 + 0.1, 1.9, 0.6, 0.45, '#7b8190', '#9097a6'); }
    r.mb.boxAA(0.1, 0, 1.2, 0.18, 2.7, 5.2, '#8a92a3'); r.box(6.2, 1.2, 0.12, 4.0, 2.7, '#6c7587'); r.row('lampWall', 'n', 3, 1, 1, { nocol: true, dy: 2 });
    r.m('coatRackStanding', 22.6, 16.6, 0); r.m('bookcaseClosedWide', 12, 17.3, 0, { k: 1 }); r.m('trashcan', 2.3, 16.7, 0); r.plant(1.2, 16.6); r.plant(22.8, 16.6); return r; });
  register('uni', c => { const r = new Room(22, 16, 7.4, { name: 'University Library', levels: 2, lh: 3.7 }); r.shell({ fk: 'wood', floor: '#8a6a4a', floor2: '#7d5f42', wall: '#d8bda2', wain: '#4b382b', base: '#35271d', wainH: 1.2, lamp: [255, 232, 190], lampStyle: 'round', lampK: 0.28, amb: 0.55, levels: 2, lh: 3.7 });
    windows(r, 'w', 2, 1.6, 2.4, 1.0, { curtain: '#5c2c2c' }); windows(r, 'e', 2, 1.6, 2.4, 1.0, { curtain: '#5c2c2c' });
    for(let i = 0; i < 5; i++){ r.m('bookcaseClosedWide', 2.2 + i * 4, 1.1, PI, { k: 1.3, ky: 1.9 }); r.m('bookcaseClosedWide', 3.8 + i * 4, 1.1, PI, { k: 1.3, ky: 1.9 }); }
    for(let i = 0; i < 2; i++) for(let j = 0; j < 3; j++){ const x = 4.5 + j * 6, z = 7 + i * 3.6; r.m('table', x, z, 0, { k: 1.4 }); r.m('chair', x - 0.6, z + 0.8, PI, { k: 1.1 }); r.m('chair', x + 0.6, z + 0.8, PI, { k: 1.1 }); r.m('chair', x - 0.6, z - 0.8, 0, { k: 1.1 }); r.m('chair', x + 0.6, z - 0.8, 0, { k: 1.1 }); r.m('lampSquareTable', x, z, 0, { dy: 0.9, nocol: true }); }
    r.screen('news', 0.04, 1.6, 8, 3.4, 1.9, 'e'); r.counter(8.5, 12.6, 5, 0.9, 1.1, { c: '#5d4a42', top: '#c9b79a', face: 'n' }); r.npc(11, 13.7, 0, 'Librarian', 'Shhh. Notes, files, or the news archive? The reading gallery is upstairs.', '#5d4a42', null, [{ label: 'My files', app: 'Files' }, { label: 'My notes', app: 'Notes' }, { label: 'News archive', app: 'News' }]);
    const hole = r.stairs(20.2, 14.6, 1.3, 3.7); r.slab(3.7, hole); r.at(3.7);   // the reading gallery
    windows(r, 'w', 2, 1.6, 2.2, 1.0, { curtain: '#5c2c2c' }); windows(r, 'e', 2, 1.6, 2.2, 1.0, { curtain: '#5c2c2c' });
    for(let i = 0; i < 5; i++) r.m('bookcaseClosedWide', 2.4 + i * 4, 1.1, PI, { k: 1.3, ky: 1.7 }); for(let j = 0; j < 3; j++){ r.m('desk', 4.5 + j * 5.2, 8, 0, { k: 1.2 }); r.m('chairDesk', 4.5 + j * 5.2, 9.1, PI); r.m('computerScreen', 4.5 + j * 5.2, 7.8, 0, { dy: 0.77, nocol: true }); } r.m('loungeChairRelax', 3, 12.5, PI / 2); r.m('sideTable', 3.9, 13.6, 0); r.plant(1.2, 14.6); r.plant(18, 14.6); r.at(0); r.plant(1.2, 14.6); return r; });
  const labRoom = (c, name, big, who) => { const r = new Room(big ? 22 : 18, big ? 16 : 14, 4, { name }), w = r.w; r.shell({ fk: 'tile', floor: '#dcefec', floor2: '#c6e2df', wall: '#eef7f6', wain: '#4fb3ae', base: '#2f8a86', wainH: 1.1, lamp: [240, 255, 252], lampK: 0.34 });
    windows(r, 'w', 2, 2.0, 1.4, 1.4); windows(r, 'e', 2, 2.0, 1.4, 1.4); windows(r, 's', 1, 2.2, 1.4, 1.4);
    for(let i = 0; i < 3; i++){ r.counter(3 + i * 5.2, 3, 4, 1.2, 0.95, { c: '#e4e9ec', top: '#2c3440', face: 's' }); for(let k = 0; k < 4; k++){ const g = [[255, 120, 120], [120, 220, 255], [255, 230, 120], [140, 255, 160]][k]; r.mb.cyl(3.6 + i * 5.2 + k * 0.9, 3.6, 0.95, 1.4, 0.15, 8, g, g); r.mb.cyl(3.6 + i * 5.2 + k * 0.9, 3.6, 1.4, 1.52, 0.06, 6, '#9aa6b2', '#9aa6b2'); } r.m('stoolBar', 3.8 + i * 5.2, 4.7, 0, { k: 1.1 }); r.m('stoolBar', 5.2 + i * 5.2, 4.7, 0, { k: 1.1 }); }
    r.box(w - 3.6, 8, 2.4, 1.6, 2.4, '#8d95a3', '#aab2c0'); r.mb.boxAA(w - 3.4, 1.4, 7.97, w - 1.4, 2.2, 8.0, [70, 200, 190], [70, 200, 190], GLOW); r.screen('lab', 0.04, 1.6, 8, 3.2, 1.8, 'e');
    r.m('kitchenSink', 1.0, 11, PI / 2, { k: 1.1 }); r.m('kitchenCabinet', 1.0, 11.95, PI / 2, { k: 1.1 }); r.m('washerDryerStacked', 1.0, 12.9, PI / 2, { k: 1.1 }); r.m('desk', w - 3, 12, PI, { k: 1.2 }); r.m('computerScreen', w - 3, 11.8, PI, { dy: 0.77, nocol: true }); r.m('chairDesk', w - 3, 13.1, 0);
    r.npc(w / 2, 8, PI, who, 'Mix elements, discover compounds, sell the results.', '#bfe5e3', null, [{ label: 'Start experiments', app: 'WestLab' }]); r.plant(1.2, 1.2); return r; };
  register('lab', c => labRoom(c, 'Research Institute', true, 'Dr. Haldane'));
  register('plot-lab', c => labRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Laboratory', false, 'Lab assistant'));
  const factoryRoom = (c, name, who) => { const r = new Room(24, 18, 5.2, { name }); r.shell({ fk: 'concrete', floor: '#8c8a86', floor2: '#827f7a', wall: '#cfc3b8', wain: '#5b5148', base: '#3f3830', wainH: 1.2, lamp: [255, 246, 224], lampK: 0.34, amb: 0.5 });
    windows(r, 'w', 3, 2.4, 1.2, 2.4); windows(r, 'e', 3, 2.4, 1.2, 2.4);
    for(let i = 0; i < 2; i++){ r.box(2, 3 + i * 5, 17, 1.0, 0.7, '#3b3f48', '#4a4f5a'); for(let x = 2.5; x < 19; x += 1.2) r.mb.boxAA(x, 0.7, 3.2 + i * 5, x + 0.5, 1.0, 3.8 + i * 5, '#e0a23a'); r.mb.boxAA(2, 0.01, 2.6 + i * 5, 19, 0.02, 2.75 + i * 5, '#e8c53a'); r.mb.boxAA(2, 0.01, 4.1 + i * 5, 19, 0.02, 4.25 + i * 5, '#e8c53a'); }
    [[21, 3], [21, 9], [21, 15]].forEach(p => { r.mb.cyl(p[0], p[1], 0, 3.6, 1.2, 12, '#9aa7b5', '#b8c4d0'); r.mb.cyl(p[0], p[1], 3.6, 3.7, 1.28, 12, '#6b7683', '#6b7683'); r.cols.push([p[0] - 1.2, p[1] - 1.2, p[0] + 1.2, p[1] + 1.2]); });
    for(let i = 0; i < 6; i++) r.m(i % 2 ? 'cardboardBoxClosed' : 'cardboardBoxOpen', 2 + (i % 3) * 1.2, 15.6 + Math.floor(i / 3) * 1.0, i * 0.5, { k: 1.5 }); r.mb.boxAA(0.2, 3.4, 1, 0.5, 3.6, 17, '#6b7683'); r.mb.boxAA(0.2, 4.0, 1, 0.5, 4.15, 17, '#6b7683');
    r.screen('factory', 12, 2.0, 0.06, 5, 1.8, 's'); r.npc(8, 13, PI, who, 'Everything you make ends up on a truck.', '#c0764a', null, [{ label: 'Run the factory', app: 'WestFactory' }, { label: 'Sell goods', app: 'WestShop' }]); r.plant(1.2, 16.6); return r; };
  register('ind', c => factoryRoom(c, 'Freight Depot', 'Foreman'));
  register('plot-factory', c => factoryRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Factory', 'Shift manager'));
  register('plant', c => { const r = new Room(24, 18, 7, { name: 'Power Plant' }); r.shell({ fk: 'concrete', floor: '#7d7a76', floor2: '#716e6a', wall: '#cfc3b8', wain: '#4a4540', base: '#2f2b27', wainH: 1.4, lamp: [255, 246, 226], lampK: 0.3, amb: 0.48 }); windows(r, 'w', 3, 2.0, 2.4, 2.8); windows(r, 'e', 3, 2.0, 2.4, 2.8);
    [6, 12, 18].forEach(x => { r.mb.cyl(x, 8, 0, 4.5, 1.7, 14, '#9aa7b5', '#b8c4d0'); r.mb.cyl(x, 8, 4.5, 4.7, 1.8, 14, '#6b7683', '#6b7683'); r.cols.push([x - 1.7, 6.3, x + 1.7, 9.7]); r.mb.boxAA(x - 0.3, 4.5, 5, x + 0.3, 6.5, 11, '#5b6470'); }); r.mb.boxAA(3, 5.2, 0.4, 21, 5.35, 0.9, '#5b6470'); r.mb.boxAA(3, 0, 0.4, 3.3, 5.35, 0.9, '#5b6470'); r.mb.boxAA(20.7, 0, 0.4, 21, 5.35, 0.9, '#5b6470');
    r.screen('news', 12, 2.6, 0.06, 5, 2.4, 's'); r.npc(20, 14, PI, 'Engineer', 'Keeping the lights on for WestCountry.', '#8a6a58', null, [{ label: 'Read the news', app: 'News' }]); return r; });

  /* ---------------- homes ---------------- */
  /* a home, sized from the house: lounge + kitchen + dining at the front, bedrooms + a bathroom at the back (flats / one storey), or living space below and bedrooms + bathroom upstairs (houses).
   * The layout is mirrored so the kitchen is always on the side away from the door. Apps live on your phone (P); the TV on the wall shows the news. */
  const FABRICS = [[0.42, 0.5, 0.62], [0.36, 0.5, 0.4], [0.55, 0.42, 0.32], [0.3, 0.33, 0.38], [0.6, 0.55, 0.45], [0.35, 0.45, 0.55]], WALLS = ['#efe6d4', '#e4ebdc', '#ece1ec', '#dfe9ef', '#f1e1d3', '#e8e4d6'], FLOORS = [['#b88a5c', '#a67b50'], ['#c9a87a', '#b79568'], ['#9c6f48', '#8b6140'], ['#bfa27c', '#ad9069']];
  register('home', c => { const w = Math.max(7, Math.min(20, Math.round((c.w || 10) - 1))), d = Math.max(7, Math.min(18, Math.round((c.dp || 9) - 1))), beds = Math.max(1, Math.min(4, c.beds || 1)), big = c.type === 'mansion' || c.type === 'villa';
    const lv = (c.type === 'apartment' || c.type === 'studio') ? 1 : Math.max(1, Math.min(c.type === 'mansion' ? 3 : 2, c.fl || 2)), lh = big ? 3.2 : 2.9, seed = Math.floor((c.w || 10) * 7 + (c.dp || 9) * 13 + beds), wallC = WALLS[seed % WALLS.length], fl = FLOORS[(seed >> 2) % FLOORS.length], fabC = FABRICS[(seed >> 1) % FABRICS.length];
    const r = new Room(w, d, lv > 1 ? lv * lh : (big ? 3.8 : 3), { name: c.name || 'Home', levels: lv, lh });
    r.shell({ fk: 'wood', floor: fl[0], floor2: fl[1], wall: wallC, wain: wallC, base: '#fbf7ee', trim: '#fbf7ee', wainH: 0, lamp: [255, 226, 180], lampStyle: 'round', lampK: 0.26, amb: 0.68, fab: fabC, rug: [fabC[0] * 0.5 + 0.4, fabC[1] * 0.5 + 0.38, fabC[2] * 0.5 + 0.34] });
    const mir = r.doorX > w / 2, X = x => mir ? w - x : x, Yw = yaw => mir ? -yaw : yaw, MW = wl => mir ? (wl === 'e' ? 'w' : wl === 'w' ? 'e' : wl) : wl;
    const P = (name, x, z, yaw, o) => r.m(name, X(x), z, Yw(yaw), o), PU = (name, wl, along, o) => r.put(name, MW(wl), (wl === 'n' || wl === 's') ? X(along) : along, o);
    const z0 = lv === 1 ? Math.max(3.4, Math.round(d * 0.45)) : 0, zf = lv === 1 ? z0 : 1.0, fd = d - zf;
    const bedroom = (x, z, kind, k) => { if(kind === 0){ PU('bed', 'n', x + 1.0, { k: 1 }); PU('cabinetBedDrawerTable', 'n', x - 0.15); PU('cabinetBedDrawerTable', 'n', x + 2.15); r.m('lampSquareTable', X(x - 0.15), 0.3, 0, { dy: 0.53, nocol: true }); r.m('lampSquareTable', X(x + 2.15), 0.3, 0, { dy: 0.53, nocol: true }); }
      else if(kind === 1){ PU('bedSingle', 'n', x + 0.6); PU('cabinetBedDrawer', 'n', x + 1.6); r.m('bear', X(x + 0.6), 1.2, 0, { dy: 0.5, nocol: true, k: 0.6 }); }
      else { PU('desk', 'n', x + 1.0); P('chairDesk', x + 1.0, 1.3, PI); r.m('computerScreen', X(x + 1.0), 0.4, 0, { dy: 0.77, nocol: true }); r.m('laptop', X(x + 0.5), 0.5, 0, { dy: 0.77, nocol: true, k: 0.7 }); PU('bookcaseClosed', 'n', x + 2.2); }
      P('rugRectangle', x + 1.0, 3.0, 0, { k: kind === 0 ? 1.0 : 0.8, nocol: true }); };
    const bathroom = (x0, zA, zB, wr, level) => {      // a boxed-in bathroom in the corner: x0 = its inner (partition) edge, it spans toward wall wr ('e' | 'w'); designed for the east corner and mirrored for the west
      const sgn = wr === 'e' ? 1 : -1, BW = 2.8, wallX = wr === 'e' ? w : 0, px = wr === 'e' ? w - BW : BW, u = v => wr === 'e' ? w - BW + v : BW - v, uy = yaw => wr === 'e' ? yaw : -yaw, zd = zB;
      const yy = yaw => wr === 'e' ? yaw : -yaw, lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
      partition(r, wr === 'e' ? px - 0.1 : px, 0, wr === 'e' ? px : px + 0.1, zd, wallC); partition(r, lo(u(0), u(1.0)), zd - 0.1, hi(u(0), u(1.0)), zd, wallC); partition(r, lo(u(1.9), wallX), zd - 0.1, hi(u(1.9), wallX), zd, wallC); r.mb.boxAA(lo(u(1.0), u(1.9)), r.y + 2.1, zd - 0.1, hi(u(1.0), u(1.9)), r.y + r.lh, zd, wallC);   // partition + front wall with a doorway
      r.m('bathtub', u(1.55), 0.62, 0, { k: 1 }); r.m('toilet', u(BW - 0.55), 1.7, yy(PI / 2), { k: 1 }); r.m('bathroomSink', u(0.4), 1.75, yy(-PI / 2), { k: 1 }); r.m('bathroomMirror', u(0.12), 1.75, yy(-PI / 2), { dy: 1.2, nocol: true });
      r.m('rugDoormat', u(1.4), zd - 0.55, 0, { k: 0.9, nocol: true }); r.light(u(1.4), r.y + 2.3, 1.2, 0.5, 3); };
    if(lv === 1){   // a flat or a one-storey home: lounge + kitchen at the front, bedrooms + a bathroom behind a partition
      partition(r, 0, z0, w / 2 - 1.2, z0 + 0.15, wallC); partition(r, w / 2 + 1.2, z0, w, z0 + 0.15, wallC); r.mb.boxAA(w / 2 - 1.2, 2.4, z0, w / 2 + 1.2, r.lh, z0 + 0.15, wallC);   // the divider with a doorway
      for(let i = 0; i < beds; i++){ const x = 1.1 + i * 3.1; if(x + 2.6 > w - (w >= 9 ? 3.0 : 0.4)) break; bedroom(x, 0, i === 0 ? 0 : i === 1 ? 1 : 2); }
      windows(r, 'n', Math.max(1, Math.min(beds, 3)), 1.5, 1.3, 1.0, { curtain: '#d9cdb8' }); if(w >= 9) bathroom(0, 0, 2.7, mir ? 'w' : 'e');
    }
    // ---- the living space (ground floor of a house, the front of a flat) ----
    const zc = (zf + d) / 2;
    PU('cabinetTelevisionDoors', 'w', zc, { k: 1 }); r.screen('tv', mir ? w - 0.04 : 0.04, 0.95, zc, Math.min(2.0, fd - 1.4), 1.1, mir ? 'w' : 'e'); r.m('speakerSmall', X(0.3), zc - 1.3, Yw(-PI / 2), {}); r.m('speakerSmall', X(0.3), zc + 1.3, Yw(-PI / 2), {});
    P('rugRectangle', 3.0, zc, PI / 2, { k: 1.15, nocol: true }); P('tableCoffee', 2.6, zc, PI / 2, { k: 0.95 }); P('loungeSofaLong', 4.3, zc, PI / 2, { k: 1.0 }); P('loungeChair', 2.7, Math.max(zf + 1.0, zc - 2.3), -PI * 0.75); P('lampRoundFloor', 4.0, zc - 2.2, 0); P('lampSquareFloor', 4.0, Math.min(d - 1.3, zc + 2.2), 0);
    if(lv === 1) PU('bookcaseClosedWide', 'w', zf + 1.2, { k: 1 }); r.plant(X(0.7), d - 0.7); r.m('rugDoormat', r.doorX, d - 0.7, 0, { k: 1.0, nocol: true }); r.m('coatRackStanding', X(1.2), d - 0.5, 0); r.art('w', Math.min(d - 1.4, zc + 2.4), 1.35, 0.9, 0.7, seed + 1); r.art('w', Math.max(zf + 1.4, zc - 2.4), 1.35, 0.9, 0.7, seed + 2, '#caa24a');
    windows(r, 'w', 2, 1.6, 1.4, 1.1, { curtain: '#cdbba3' }); if(w >= 9) windows(r, 's', 2, 1.5, 1.4, 1.1, { curtain: '#cdbba3' }); windows(r, 'e', Math.max(1, Math.floor(fd / 4)), 1.5, 1.4, 1.1, { curtain: '#cdbba3' });
    // kitchen run along the east (far) wall, an island / breakfast bar and a dining table
    const kn = clamp(Math.floor((fd - 2.2) / 0.86), 3, 6), kz = zf + 0.5; const KS = [['kitchenFridgeLarge', 1.04], ['kitchenCabinetDrawer', 0.86], ['kitchenStoveElectric', 0.86], ['kitchenCabinet', 0.86], ['kitchenSink', 0.86], ['kitchenCabinetDrawer', 0.86]]; let zz = kz;
    for(let i = 0; i < kn; i++){ const it = KS[i % KS.length], k = it[1]; PU(it[0], 'e', zz + k / 2, { k: 1.0 }); if(it[0] === 'kitchenStoveElectric') r.m('hoodModern', X(w - 0.3), zz + k / 2, Yw(PI / 2), { dy: 1.6, nocol: true }); if(it[0] === 'kitchenSink') r.m('kitchenBlender', X(w - 0.5), zz + k / 2, 0, { dy: 0.9, nocol: true }); if(it[0] === 'kitchenCabinet') r.m('kitchenCoffeeMachine', X(w - 0.5), zz + k / 2, Yw(PI / 2), { dy: 0.9, nocol: true }); zz += k; if(i >= 1 && i % 2 === 1) r.m('kitchenCabinetUpperDouble', X(w - 0.25), zz - 0.43, Yw(PI / 2), { dy: 1.45, nocol: true }); }
    if(w >= 9){ const dx = w - 3.3; P('tableRound', dx, Math.min(d - 2.0, zc + 0.6), 0, { k: 1.0 }); [[-0.9, 0], [0.9, 0], [0, -1.0], [0, 1.0]].forEach((o, i) => P('chairModernCushion', dx + o[0], Math.min(d - 2.0, zc + 0.6) + o[1], [PI / 2, -PI / 2, PI, 0][i] * 1)); r.m('lampRoundTable', X(dx), Math.min(d - 2.0, zc + 0.6), 0, { dy: 0.73, nocol: true, k: 0.9 }); }
    r.plant(X(w - 0.7), d - 0.7);
    if(lv > 1){   // a house: a real staircase on the side away from the door, the bedrooms + bathroom upstairs
      const west = r.doorX > w / 2, sx = west ? 1.2 : w - 2.3; let hole = null;
      for(let k = 0; k < lv - 1; k++){ r.at(k * lh); hole = r.stairs(sx, d - 1.0, 1.1, lh); r.slab((k + 1) * lh, hole); }
      r.at(0);
      for(let k = 1; k < lv; k++){ r.at(k * lh); const per = Math.ceil(beds / (lv - 1)), lo = west ? 1.0 : 3.4, hi = west ? w - 3.4 : w - 0.4; windows(r, 'n', 2, 1.5, 1.3, 1.0, { curtain: '#d9cdb8' }); windows(r, 'e', 1, 1.5, 1.3, 1.0, { curtain: '#d9cdb8' }); windows(r, 'w', 1, 1.5, 1.3, 1.0, { curtain: '#d9cdb8' });
        for(let i = 0; i < per; i++){ const x = lo + i * 3.1; if(x + 2.6 > hi) break; const kind = (k === 1 && i === 0) ? 0 : i % 3 === 1 ? 1 : 2; if(mir){ const xm = w - x - 2.0; bedroomRaw(r, xm, kind, 0); } else bedroomRaw(r, x, kind, 0); }
        if(w >= 9) bathroom(0, 0, 2.7, west ? 'e' : 'w', k); r.m('loungeChairRelax', west ? w - 1.0 : 1.2, d - 2.5, west ? PI * 0.75 : -PI * 0.75); r.m('rugRound', west ? w / 2 + 1 : w / 2 - 1, d - 3, 0, { k: 1.0, nocol: true }); r.m('lampRoundFloor', west ? w - 0.5 : 0.5, d - 0.6, 0); }
      r.at(0); }
    return r; });
  /* an upstairs bedroom placed with absolute x (no mirroring): same pieces as the ground-floor ones */
  function bedroomRaw(r, x, kind){ if(kind === 0){ r.put('bed', 'n', x + 1.0); r.put('cabinetBedDrawerTable', 'n', x - 0.15); r.put('cabinetBedDrawerTable', 'n', x + 2.15); r.m('lampSquareTable', x - 0.15, 0.3, 0, { dy: 0.53, nocol: true }); r.m('lampSquareTable', x + 2.15, 0.3, 0, { dy: 0.53, nocol: true }); r.put('bookcaseClosedDoors', 'n', x + 3.4); }
    else if(kind === 1){ r.put('bedSingle', 'n', x + 0.6); r.put('cabinetBedDrawer', 'n', x + 1.6); r.m('bear', x + 0.6, 1.2, 0, { dy: 0.5, nocol: true, k: 0.6 }); }
    else { r.put('desk', 'n', x + 1.0); r.m('chairDesk', x + 1.0, 1.4, PI); r.m('computerScreen', x + 1.0, 0.4, 0, { dy: 0.77, nocol: true }); r.put('bookcaseClosed', 'n', x + 2.2); }
    r.m('rugRectangle', x + 1.0, 3.0, 0, { k: 0.9, nocol: true }); }
  register('generic', c => { const r = new Room(14, 10, 3.2, { name: c.name || 'Building' }); r.shell({ fk: 'wood', floor: '#b08a62', floor2: '#a37f58', wall: '#efe6d4', wain: '#efe6d4', base: '#fbf7ee', wainH: 0, lampStyle: 'round', lamp: [255, 232, 196] }); windows(r, 'n', 2, 1.6, 1.3, 1.0); r.m('loungeSofa', 3.5, 8.5, 0); r.m('tableCoffee', 3.5, 6.8, 0); r.plant(1.2, 1.2); r.plant(12.8, 1.2); return r; });
  RW.Interiors = { register, build, Room, kinds: () => Object.keys(REG) };
})(typeof self !== 'undefined' ? self : this);
