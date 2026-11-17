/* REALWORLD · vehicles — where every car and plane stands. PURE (main thread + Node tests). Depends on RWLayout and VehicleData.
 *   showcase('dealer' | 'airport')            the brand-new models on show outside (static, same for everybody)
 *   owned(garage, homeHouse)                  the player's own vehicles: [{ slot, id, style, kind, col, x, z, yaw, hl, hw, where }]
 * Poses: x, z (world metres), yaw (the same convention as people and NPC cars: forward = (sin yaw, -cos yaw)), hl/hw = half length / half width for the collision box.
 * Cars park at the kerb in front of your home (two per house), the rest in the dealership's customer lot; planes stand in the owners' row behind the airport terminal, packed by wingspan.
 * Each entry is a plain object {x, z, yaw, speed:0}; the driving controller in game.js (drive.js physics) moves it and persists the pose in the player's prefs. `canDrive()` is true. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('./layout.js'), require('../../data/vehicle-data.js')); else root.RWVehicles = factory(root.RWLayout, root.VehicleData); })(typeof self !== 'undefined' ? self : this, function(L, VD){
  const yawOf = d => Math.atan2(d[0], -d[1]), neg = d => [-d[0], -d[1]];
  const dims = v => v.kind === 'plane' ? { hl: v.fly.len / 2, hw: Math.min(v.fly.span, 4.5) / 2 } : { hl: v.drive.len / 2, hw: v.drive.wid / 2 };
  const entry = (v, extra) => Object.assign({ id: v.id, style: v.style, kind: v.kind, speed: 0 }, dims(v), extra);
  function showcase(site){
    const S = L.VEH_SITES[site], list = site === 'dealer' ? VD.CARS : VD.PLANES.slice(0, 3), out = [];
    list.forEach((v, i) => { const sp = S.show[i], b = sp && L.bayPoint(site, sp.fwd, sp.lat); if(!b) return; out.push(entry(v, { col: site === 'dealer' ? i : [2, 4, 0][i], x: b.x, z: b.z, yaw: yawOf(site === 'dealer' ? neg(b.f) : b.f), where: site })); });
    return out;
  }
  /* garage = [{ slot, m, col }] (OS.homes.garage()), home = a layout house record (L.house(i).g) or null */
  function owned(garage, home){
    const out = [], cars = garage.filter(g => VD.get(g.m) && VD.get(g.m).kind === 'car'), planes = garage.filter(g => VD.get(g.m) && VD.get(g.m).kind === 'plane');
    let lot = 0; cars.forEach((g, i) => { const v = VD.get(g.m);
      if(home && i < 2){ const k = L.kerbSpot(home, i); out.push(entry(v, { slot: g.slot, col: g.col, x: k.x, z: k.z, yaw: k.yaw, where: 'home' })); return; }
      const sp = L.VEH_SITES.dealer.lot[lot++], b = sp && L.bayPoint('dealer', sp.fwd, sp.lat); if(b) out.push(entry(v, { slot: g.slot, col: g.col, x: b.x, z: b.z, yaw: yawOf(neg(b.f)), where: 'dealer' })); });
    const row = L.VEH_SITES.airport.rows[0]; let cur = row.from;
    planes.forEach(g => { const v = VD.get(g.m), span = v.fly.span; if(cur + span > row.to) return; const b = L.bayPoint('airport', row.fwd, cur + span / 2); cur += span + 1.5; if(b) out.push(entry(v, { slot: g.slot, col: g.col, x: b.x, z: b.z, yaw: yawOf(b.f), where: 'airport', hw: span / 2 })); });
    return out;
  }
  /* colliders in the engine's stride-8 format [0, x, z, halfW, halfD, cos, sin, top]: a box turned by yaw (its length runs along the heading) */
  function colliders(list, groundAt){ const a = []; list.forEach(q => { const y = groundAt ? groundAt(q.x, q.z) : 0, hx = q.kind === 'plane' ? Math.min(q.hw, 1.3) : q.hw, c = Math.cos(q.yaw), s = Math.sin(q.yaw); a.push(0, q.x, q.z, hx + 0.1, q.hl + 0.1, c, s, y + (q.kind === 'plane' ? 2.6 : 1.5)); }); return a; }
  return { showcase, owned, colliders, canDrive: () => true };
});
