/* REALWORLD · npcs — where the townspeople are, in the 3D city. The ROSTER and TIMETABLE (who is where, when, and why) still come from WorldGen.npcPlan, shared with the map and the economy;
 * the ROUTES are computed here along the real streets of layout.js (so nobody drives through a house), as a pure function of the clock: every client sees the same people in the same place.
 *   const N = RealWorld.NPC.create(WorldGen, RWLayout);   N.state(bot, homeHouse, now, nHouses) → { x, z, yaw, moving, why, dest }
 * Idle NPCs (at home, at work…) are inside buildings and are not drawn; moving ones travel the streets (cars when fast). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {};
  function create(G, L){
    const TC = new Map(), RC = new Map(); let addr = null, addrN = -1, poiName = null;
    const plaza = () => ({ kind: 'h', k: 1, t: 0 });
    function placeOf(plan, nh){
      if(!poiName){ poiName = {}; Object.keys(L.POI_BLOCK).forEach(id => { if(G.POIS[id]) poiName[G.POIS[id].n] = id; }); poiName['Central Park'] = 'park'; }
      const lab = plan && plan.label; if(!lab || lab === 'Town Square') return plaza(); const id = poiName[lab]; if(id){ const p = L.poi(id); return p ? p.street : plaza(); }
      if(addrN !== nh){ addr = new Map(); for(let i = 0; i < nh; i++) addr.set(G.house(i).addr, i); addrN = nh; } const hi = addr.get(lab); if(hi !== undefined){ const h = L.house(hi); if(h) return h.street; } return plaza();
    }
    function routeFor(from, to, nh){
      const key = (from && from.label) + '>' + (to && to.label) + '|' + nh; let R = RC.get(key); if(R) return R;
      const lat = L.route(placeOf(from, nh), placeOf(to, nh)), pts = []; for(let i = 0; i < lat.length - 1; i++){ const a = lat[i], b = lat[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8)); for(let q = 0; q < n; q++) pts.push(L.warp(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n)); } pts.push(L.warp(lat[lat.length - 1][0], lat[lat.length - 1][1]));
      const cum = [0]; for(let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); R = { pts, cum, len: cum[cum.length - 1] }; if(RC.size > 3000) RC.clear(); RC.set(key, R); return R;
    }
    function state(b, home, now, nh){
      const SLOT = G.SLOT, s = Math.floor(now / SLOT), nd = G.districtCount(nh), key = b.n + '|' + s + '|' + nh; let T = TC.get(key);
      if(!T){ const from = G.npcPlan(b, s - 1, home, nd), to = G.npcPlan(b, s, home, nd), R = routeFor(from, to, nh); T = { from, to, R, t0: s * SLOT + (G.h32(b.n, s) % 25000), dur: Math.max(4000, Math.min(R.len / 14 * 1000, 71000)) }; if(TC.size > 5000) TC.clear(); TC.set(key, T); }
      const f = (now - T.t0) / T.dur, R = T.R, moving = R.len > 3 && f > 0 && f < 1, d = Math.max(0, Math.min(1, f)) * R.len; let i = 1; while(i < R.pts.length - 1 && R.cum[i] < d) i++;
      const a = R.pts[i - 1] || R.pts[0], c = R.pts[i] || a, seg = Math.max(0.001, R.cum[i] - R.cum[i - 1] || 1), t = Math.max(0, Math.min(1, (d - (R.cum[i - 1] || 0)) / seg)), x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
      return { x, z, yaw: Math.atan2(c[0] - a[0], -(c[1] - a[1])), moving, why: T.to.why, dest: T.to.label, from: T.from.label };
    }
    return { state, routeFor, placeOf };
  }
  RW.NPC = { create };
})(typeof self !== 'undefined' ? self : this);
