/* REALWORLD · nav — pure helpers on top of layout.js, shared by the first-person game and the WestMap app (so they can never disagree):
 *   Nav.districtAt(x, z)       → 'Downtown' | 'University Quarter' | … | 'Countryside'
 *   Nav.placeAt(x, z)          → { name, sub, kind: 'poi'|'house'|'district', id? } the nearest named thing (landmark within 22 m, house within 14 m, else the district)
 *   Nav.safeSpot(x, z)         → { x, z, yaw, name } the nearest point a person can stand on: pushed out of buildings, ponds and the fountain, inside the walkable area; facing away from the building
 *   Nav.housePose(i) / Nav.poiPose(id) / Nav.plazaPose() → { x, z, yaw, name } where you stand when you arrive at a house / landmark / the Town Square, looking at it
 * Needs layout.setup(nh) to have been called. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js'), require('../lib/buildgen.js'), require('./layout.js'), require('./terrain.js')); else (root.RealWorld = root.RealWorld || {}).Nav = factory(root.WorldGen, root.BuildGen, root.RWLayout, root.RWTerrain); })(typeof self !== 'undefined' ? self : this, function(G, BG, L, T){
  function latticeOf(x, z){ let u = x, v = z; for(let q = 0; q < 4; q++){ const w = L.warp(u, v); u -= w[0] - x; v -= w[1] - z; } return [Math.round(u / L.SU), Math.round(v / L.SV)]; }
  function districtAt(x, z){
    if(Math.hypot(x, z) > L.radius() + 80) return 'Countryside'; const [i, j] = latticeOf(x, z), r = L.roleOf(i, j); if(!r) return 'Outskirts';
    if(r.role === 'zone') return L.ZONE_NAME[r.kind]; if(Math.abs(i) <= 1 && Math.abs(j) <= 1) return 'Downtown'; if(r.role === 'poi' && (r.id === 'uni' || r.id === 'lab')) return 'University Quarter'; if(r.role === 'poi' && (r.id === 'ind' || r.id === 'plant')) return 'Industrial Estate';
    return G.district(G.h32(Math.floor((i + 1) / 3) * 31 + 7, Math.floor((j + 1) / 3) * 17 + 3) % 12).name;
  }
  const near = (x, z, r) => L.blocksNear(x - r, z - r, x + r, z + r, 6);
  function placeAt(x, z){
    let best = null, bd = 1e9; const bl = near(x, z, 30);
    bl.forEach(b => { b.pois.forEach(p => { const d = Math.hypot(p.x - x, p.z - z); if(d < 22 && d < bd){ bd = d; best = { name: (G.POIS[p.id] && G.POIS[p.id].n) || p.id, sub: p.id === 'park' ? 'Park' : 'Landmark', kind: 'poi', id: p.id }; } }); });
    if(best) return best; bd = 14; bl.forEach(b => b.houses.forEach(h => { const d = Math.hypot(h.g.x - x, h.g.y - z); if(d < bd){ bd = d; best = { name: h.g.addr, sub: h.g.typeName || h.g.type, kind: 'house', id: 'h' + h.idx }; } }));
    return best || { name: districtAt(x, z), sub: 'District', kind: 'district' };
  }
  /* solids as turned rectangles / circles, from the layout (never from loaded chunks, so it works in a map that has only far chunks) */
  function solids(x, z, nh){
    const out = []; near(x, z, 40).forEach(b => {
      b.houses.forEach(h => { if(h.idx < nh) out.push({ x: h.g.x, z: h.g.y, hx: h.g.w / 2, hz: h.g.dp / 2, a: h.g.ang }); });
      b.pois.forEach(p => { const S = BG.landmark(p.id); out.push({ x: p.x, z: p.z, hx: S.w / 2, hz: S.d / 2, a: p.ang }); });
      b.fillers.forEach(f => out.push({ x: f.x, z: f.z, hx: f.w / 2, hz: f.d / 2, a: f.ang }));
      b.plots.forEach(p => out.push({ x: p.x, z: p.z, hx: p.w / 2, hz: p.d / 2, a: p.ang }));
      b.ponds.forEach(p => out.push({ x: p.x, z: p.z, r: p.r + 0.8 })); if(b.fountain) out.push({ x: b.fountain[0], z: b.fountain[1], r: 5.4 }); });
    return out;
  }
  function safeSpot(x, z, nh){
    nh = nh || 512; const R = L.radius() + 380, d0 = Math.hypot(x, z); if(d0 > R){ x *= R / d0; z *= R / d0; } let px = x, pz = z, fx = 0, fz = 0; const M = 2.2;
    for(let pass = 0; pass < 6; pass++){ let moved = false; for(const s of solids(px, pz, nh)){ const dx = px - s.x, dz = pz - s.z;
        if(s.r){ const d = Math.hypot(dx, dz); if(d < s.r + M - 0.6){ const k = (s.r + M) / (d || 1); px = s.x + (d ? dx * k : s.r + M); pz = s.z + (d ? dz * k : 0); fx = d ? dx / d : 1; fz = d ? dz / d : 0; moved = true; } continue; }
        const co = Math.cos(s.a), si = Math.sin(s.a), lx = dx * co + dz * si, lz = -dx * si + dz * co, ex = s.hx + M, ez = s.hz + M;
        if(Math.abs(lx) < ex - 0.6 && Math.abs(lz) < ez - 0.6){ const a = ex - Math.abs(lx), b = ez - Math.abs(lz); let nx = lx, nz = lz; if(a < b) nx = (lx < 0 ? -1 : 1) * ex; else nz = (lz < 0 ? -1 : 1) * ez; px = s.x + nx * co - nz * si; pz = s.z + nx * si + nz * co; const l = Math.hypot(px - s.x, pz - s.z) || 1; fx = (px - s.x) / l; fz = (pz - s.z) / l; moved = true; } }
      if(!moved) break; }
    const yaw = (fx || fz) ? Math.atan2(fx, -fz) : 0, pl = placeAt(px, pz); return { x: px, z: pz, yaw, name: pl.name, sub: pl.sub, district: districtAt(px, pz) };
  }
  const plazaPose = () => { const c = L.content(0, 0); return { x: c.cx, z: c.cz + 14, yaw: 0, name: 'Town Square' }; };
  const housePose = i => { const p = L.house(i); if(!p) return null; const sd = p.g.side > 0 ? 1 : -1, s0 = Math.sin(p.g.ang), c0 = Math.cos(p.g.ang), f = [-sd * s0, sd * c0], d = p.g.dp / 2 + 5; return { x: p.g.x + f[0] * d, z: p.g.y + f[1] * d, yaw: Math.atan2(-f[0], f[1]), name: p.g.addr }; };
  const poiPose = id => { const p = L.poi(id); if(!p) return plazaPose(); return { x: p.x + p.front[0] * 17, z: p.z + p.front[1] * 17, yaw: Math.atan2(-p.front[0], p.front[1]), name: (G.POIS[id] && G.POIS[id].n) || id }; };
  return { districtAt, placeAt, safeSpot, solids, latticeOf, plazaPose, housePose, poiPose };
});
