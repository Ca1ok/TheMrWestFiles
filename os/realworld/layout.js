/* REALWORLD · layout — the street plan of the 3D city. PURE (worker, main thread, Node tests). It does NOT follow the 2D map (the map will follow this later).
 * IDEA: the city is a lattice of rectangular BLOCKS (SU × SV metres) between STREETS (every 4th street is a wide avenue). Everything is laid out in lattice space (u, v) and then bent into
 * organic curves by ONE smooth, invertible warp(u, v). Because streets are lines of the lattice, they only ever meet at proper crossings; because lots, buildings and trees are placed inside
 * a block with fixed margins from its streets, they can never touch a road or each other (the margins are bigger than the warp can squeeze). No collision tests needed.
 *   block (i, j) spans u in [(i-½)SU, (i+½)SU], v in [(j-½)SV, (j+½)SV].   Street lines: constant v → 'h' lines, constant u → 'v' lines.   Line k sits at (k-½)·S.
 * ROLES: plaza (0,0) · landmarks in the 8 blocks around it · campuses · two plot zones (University Quarter west, Industrial Estate east) · a corridor of plain blocks joining them ·
 * houses: block after block in a growing spiral (8 houses per block, house i is ALWAYS in the same place, so the city only ever grows outward).
 * To change the look of the city: SU/SV/HW, the warp, POI_BLOCK, ZONE_BLOCKS. Everything else follows. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js')); else root.RWLayout = factory(root.WorldGen); })(typeof self !== 'undefined' ? self : this, function(G){
  const SU = 94, SV = 62, SIDE = 3, SET = 6, PER = 8, f01 = G.f01, TAU = Math.PI * 2, K1 = TAU / 410, K2 = TAU / 150, K3 = TAU / 370;
  const warp = (u, v) => [u + 11 * Math.sin(v * K1 + 1.3) + 3 * Math.sin((u * 0.7 + v) * K2 + 0.4), v + 11 * Math.sin(u * K3 + 2.1) + 3 * Math.sin((u - v * 0.6) * K2 + 4.1)];
  const lineU = k => (k - 0.5) * SU, lineV = k => (k - 0.5) * SV, isAve = k => (((k % 4) + 4) % 4) === 0, hwOf = k => isAve(k) ? 7 : 4;
  /* local frame of the warped lattice: world position + the angle of the lattice u-axis (orthogonalised), so houses sit square to their street */
  function frame(u, v){ const p = warp(u, v), a = warp(u + 1.5, v), b = warp(u - 1.5, v), c = warp(u, v + 1.5), d = warp(u, v - 1.5), tu = Math.atan2(a[1] - b[1], a[0] - b[0]), tv = Math.atan2(c[1] - d[1], c[0] - d[0]) - Math.PI / 2, s = Math.sin(tu) + Math.sin(tv), co = Math.cos(tu) + Math.cos(tv); return { x: p[0], z: p[1], ang: Math.atan2(s, co), tu }; }
  /* lattice direction (du, dv) → world direction at a frame */
  const dirOf = (fr, du, dv) => { const c = Math.cos(fr.ang), s = Math.sin(fr.ang); return [c * du - s * dv, s * du + c * dv]; };
  const POI_BLOCK = { agency: [-1, -1], hall: [0, -1], arcade: [1, -1], bank: [-1, 0], exchange: [1, 0], shop: [0, 1], park: [1, 1], uni: [-3, 0], lab: [-3, 1], ind: [3, 0], plant: [3, 1] };
  const ZW = [[-7, -2], [-6, -2], [-5, -2], [-7, -1], [-6, -1], [-5, -1], [-7, 0], [-6, 0], [-5, 0], [-7, 1], [-6, 1], [-5, 1]];
  const ZONE_BLOCKS = { l: ZW, f: ZW.map(([i, j]) => [-i, j]) }, ZONE_NAME = { l: 'University Quarter', f: 'Industrial Estate' };
  const K = (i, j) => i + ',' + j;
  const STATIC = new Map();
  for(const id in POI_BLOCK) STATIC.set(K(...POI_BLOCK[id]), { role: id === 'park' ? 'park' : 'poi', id });
  STATIC.set(K(0, 0), { role: 'plaza' }); STATIC.set(K(-1, 1), { role: 'tower' });
  ['l', 'f'].forEach(k => ZONE_BLOCKS[k].forEach(([i, j], n) => STATIC.set(K(i, j), { role: 'zone', kind: k, n })));
  for(let i = -7; i <= 7; i++) if(!STATIC.has(K(i, 0))) STATIC.set(K(i, 0), { role: 'plain' });
  /* the spiral of residential blocks (independent of how many houses exist) */
  const ORDER = []; { const c = []; for(let i = -40; i <= 40; i++) for(let j = -40; j <= 40; j++) if(!STATIC.has(K(i, j))) c.push([i, j, Math.hypot(i * SU, j * SV) + f01(i + 100, j + 100) * 40]); c.sort((a, b) => a[2] - b[2]); c.slice(0, 3200).forEach(q => ORDER.push([q[0], q[1]])); }
  const ORDER_IDX = new Map(); ORDER.forEach((q, b) => ORDER_IDX.set(K(q[0], q[1]), b));
  let NB = 0, NH = 0, RADIUS = 0;
  function setup(nh){ nh = Math.max(1, nh | 0); if(nh === NH) return; NH = nh; NB = Math.min(ORDER.length, Math.ceil(nh / PER)); let r = 0; STATIC.forEach((v, k) => { const [i, j] = k.split(',').map(Number); r = Math.max(r, Math.hypot(i * SU, j * SV)); }); for(let b = 0; b < NB; b++) r = Math.max(r, Math.hypot(ORDER[b][0] * SU, ORDER[b][1] * SV)); RADIUS = r + 110; CACHE.clear(); }
  const roleOf = (i, j) => { const s = STATIC.get(K(i, j)); if(s) return s; const b = ORDER_IDX.get(K(i, j)); return b !== undefined && b < NB ? { role: 'res', b } : null; };
  const exists = (i, j) => !!roleOf(i, j);
  /* the part of a block that is not street or pavement: lot area */
  function inner(i, j){ return { uL: lineU(i) + hwOf(i) + SIDE, uR: lineU(i + 1) - hwOf(i + 1) - SIDE, vT: lineV(j) + hwOf(j) + SIDE, vB: lineV(j + 1) - hwOf(j + 1) - SIDE }; }
  /* a street point on the boundary of block (i, j) facing lattice direction (du, dv): { kind:'h'|'v', k, t } */
  const streetPt = (i, j, du, dv, u, v) => du ? { kind: 'v', k: du > 0 ? i + 1 : i, t: v } : { kind: 'h', k: dv > 0 ? j + 1 : j, t: u };
  const CACHE = new Map();
  const mkTree = (u, v, s, seed, h) => { const p = warp(u, v); return [p[0], p[1], s, seed, h === undefined ? -1 : h]; };
  function content(i, j){
    const key = K(i, j); let c = CACHE.get(key); if(c) return c; const r = roleOf(i, j); if(!r) return null; const B = inner(i, j), cu = (B.uL + B.uR) / 2, cv = (B.vT + B.vB) / 2;
    c = { i, j, role: r.role, id: r.id, houses: [], pois: [], fillers: [], plots: [], trees: [], lamps: [], benches: [], greens: [], paved: [], ponds: [], B }; const fr0 = frame(cu, cv); c.cx = fr0.x; c.cz = fr0.z;
    const quad = (u0, v0, u1, v1) => [warp(u0, v0), warp(u1, v0), warp(u1, v1), warp(u0, v1)];
    const verge = (skipU) => { for(let u = B.uL + 9, n = 0; u < B.uR - 4; u += 18, n++){ c.trees.push(mkTree(u, B.vT + 1.5, 0.95 + f01(i * 31 + n, j) * 0.4, i * 7 + n)); c.trees.push(mkTree(u + 9, B.vB - 1.5, 0.95 + f01(i + n, j * 17) * 0.4, j * 5 + n)); }
      if(!skipU) for(let v = B.vT + 12, n = 0; v < B.vB - 8; v += 18, n++){ c.trees.push(mkTree(B.uL + 1.5, v, 1, n + i)); c.trees.push(mkTree(B.uR - 1.5, v + 5, 1, n + j)); } };
    const ring = (u0, v0, rad, n, off) => { const c0 = warp(u0, v0); for(let q = 0; q < n; q++){ const a = off + q / n * TAU, p = warp(u0 + Math.cos(a) * rad, v0 + Math.sin(a) * rad * 0.8); c.benches.push([p[0], p[1], Math.atan2(c0[0] - p[0], -(c0[1] - p[1]))]); } };
    const lamps = () => { for(let u = B.uL + 14, n = 0; u < B.uR; u += 30, n++){ c.lamps.push(warp(u, B.vT - 0.6)); c.lamps.push(warp(u + 14, B.vB + 0.6)); } };
    if(r.role === 'res'){
      const nl = 4, lw = (B.uR - B.uL - 6) / nl, mid = (B.vT + B.vB) / 2;
      for(let s = 0; s < PER; s++){ const idx = r.b * PER + s, row = s >> 2, k = s & 3, g = G.house(idx), u = B.uL + 3 + (k + 0.5) * lw, v = row ? B.vB - SET - g.dp / 2 : B.vT + SET + g.dp / 2, fr = frame(u, v), side = row ? 1 : -1;
        const g2 = Object.assign({}, g, { x: fr.x, y: fr.z, ang: fr.tu, side }); c.houses.push({ idx, g: g2, street: streetPt(i, j, 0, side, u, v) });
        // yard tree behind the house, in the lot's own back garden; and a front tree at the pavement (never on it)
        const back = row ? v - g.dp / 2 - 2.6 - f01(idx, 3) * 2 : v + g.dp / 2 + 2.6 + f01(idx, 3) * 2; if(Math.abs(back - mid) > 3.2) c.trees.push(mkTree(u + (f01(idx, 4) - 0.5) * (lw - 10), back, 0.9 + f01(idx, 5) * 0.5, idx, idx));
        if(s % 2 === 0) c.trees.push(mkTree(u + (f01(idx, 6) - 0.5) * 4, row ? B.vB - 1.4 : B.vT + 1.4, 0.9 + f01(idx, 7) * 0.4, idx + 3, idx)); }
      lamps();
    } else if(r.role === 'plaza'){ c.paved.push(quad(B.uL + 2, B.vT + 2, B.uR - 2, B.vB - 2)); c.fountain = warp(cu, cv); ring(cu, cv, 11, 8, 0.2); [[-30, -18], [30, -18], [-30, 18], [30, 18]].forEach((o, n) => c.trees.push(mkTree(cu + o[0], cv + o[1], 1.1, n))); verge(true); lamps(); }
    else if(r.role === 'poi' || r.role === 'park'){
      const [bi, bj] = [i, j], du = Math.abs(bi) >= Math.abs(bj) ? -Math.sign(bi) : 0, dv = du ? 0 : -Math.sign(bj), fr = frame(cu, cv), f = dirOf(fr, du, dv);
      if(r.role === 'park'){ c.greens.push(quad(B.uL, B.vT, B.uR, B.vB)); c.park = { x: fr.x, z: fr.z }; c.ponds.push({ x: fr.x, z: fr.z, r: 8 }); ring(cu, cv, 13, 6, 0.5); for(let q = 0; q < 30; q++){ const u = B.uL + 6 + f01(q, 31) * (B.uR - B.uL - 12), v = B.vT + 6 + f01(q, 32) * (B.vB - B.vT - 12); if(Math.hypot(u - cu, (v - cv) * 1.2) > 13) c.trees.push(mkTree(u, v, 1 + f01(q, 33) * 0.5, q)); } c.street = streetPt(i, j, du || 0, dv || 1, cu, cv); }
      else { c.pois.push({ id: r.id, x: fr.x, z: fr.z, ang: Math.atan2(-f[0], f[1]), side: 1, front: f, street: streetPt(i, j, du, dv, cu, cv) });
        for(const sgn of [-1, 1]){ const p = frame(cu + sgn * 24, cv), q = (f01(i + 5, j + 9 + sgn) * 7) | 0, fl = 5 + ((f01(i * 3 + sgn, j + 2) * 9) | 0); c.fillers.push({ x: p.x, z: p.z, ang: p.ang, side: j > 0 ? -1 : 1, w: 13 + f01(i, sgn + 8) * 2, d: 14 + f01(sgn, j + 4) * 2, fl, kind: q % 3 === 0 ? 'apartment' : 'office', v: Math.floor(f01(i + sgn * 7, j + 3) * 997), street: streetPt(i, j, 0, j > 0 ? -1 : 1, cu + sgn * 24, cv) }); } }
      verge(true); lamps();
    } else if(r.role === 'tower'){ const p = frame(cu, cv); c.fillers.push({ x: p.x, z: p.z, ang: p.ang, side: 1, w: 22, d: 20, fl: 16, kind: 'office', v: 411, street: streetPt(i, j, 0, 1, cu, cv) }); verge(true); lamps(); }
    else if(r.role === 'zone'){ c.paved.push(quad(B.uL, B.vT, B.uR, B.vB)); if(r.n < 10){ const cw = (B.uR - B.uL) / 3, rh = (B.vB - B.vT) / 2;
        for(let q = 0; q < 6; q++){ const col = q % 3, row = (q / 3) | 0, u = B.uL + (col + 0.5) * cw, v = B.vT + (row + 0.5) * rh, fr = frame(u, v), side = row ? 1 : -1; c.plots.push({ slot: r.n * 6 + q, kind: r.kind, x: fr.x, z: fr.z, ang: fr.ang, side, w: Math.min(cw - 8, 14), d: Math.min(rh - 7, 12), front: dirOf(fr, 0, side), street: streetPt(i, j, 0, side, u, v) }); } }
      verge(true); lamps(); }
    else if(r.role === 'plain'){ c.greens.push(quad(B.uL, B.vT, B.uR, B.vB)); for(let q = 0; q < 10; q++) c.trees.push(mkTree(B.uL + 8 + f01(i + q, 41) * (B.uR - B.uL - 16), B.vT + 6 + f01(j + q, 43) * (B.vB - B.vT - 12), 0.9 + f01(q, i + 50) * 0.6, q + i)); lamps(); }
    CACHE.set(key, c); if(CACHE.size > 600){ const k0 = CACHE.keys().next().value; CACHE.delete(k0); } return c;
  }
  /* ---- queries ---- */
  const house = idx => { const b = Math.floor(idx / PER); if(b >= ORDER.length) return null; const [i, j] = ORDER[b], c = content(i, j, true) || (() => { const keep = NB; NB = Math.max(NB, b + 1); const x = content(i, j); NB = keep; return x; })(); return c && c.houses[idx % PER]; };
  const poi = id => { const bl = POI_BLOCK[id]; if(!bl) return null; const c = content(bl[0], bl[1]); return c.pois[0] || (c.park ? { id, x: c.park.x, z: c.park.z, ang: 0, side: 1, front: [0, 1], street: c.street } : null); };
  const plotLot = (kind, uid) => { const cell = G.plotCell(kind, uid), slot = cell.row * 12 + cell.col, bl = ZONE_BLOCKS[kind][Math.floor(slot / 6)], c = content(bl[0], bl[1]); return c.plots.find(p => p.slot === slot) || null; };
  const blocksNear = (x0, z0, x1, z1, pad) => { pad = pad || 22; const out = [], i0 = Math.floor((x0 - pad) / SU + 0.5) - 1, i1 = Math.ceil((x1 + pad) / SU + 0.5), j0 = Math.floor((z0 - pad) / SV + 0.5) - 1, j1 = Math.ceil((z1 + pad) / SV + 0.5); for(let i = i0; i <= i1; i++) for(let j = j0; j <= j1; j++){ const c = content(i, j); if(c) out.push(c); } return out; };
  /* does the street piece between two crossings exist? */
  const segExists = (kind, k, m) => kind === 'h' ? (exists(m, k - 1) || exists(m, k)) : (exists(k - 1, m) || exists(k, m));
  /* streets (as arrays of lattice segments) that touch a world rectangle */
  function streetsNear(x0, z0, x1, z1){
    const out = [], pad = 22, vk0 = Math.floor((z0 - pad) / SV + 0.5), vk1 = Math.ceil((z1 + pad) / SV + 0.5), uk0 = Math.floor((x0 - pad) / SU + 0.5), uk1 = Math.ceil((x1 + pad) / SU + 0.5);
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
  return { SU, SV, SIDE, SET, PER, warp, frame, dirOf, lineU, lineV, hwOf, isAve, setup, exists, roleOf, content, house, poi, plotLot, blocksNear, streetsNear, segExists, route, bounds, radius: () => RADIUS, POI_BLOCK, ZONE_BLOCKS, ZONE_NAME, inner, ORDER };
});
