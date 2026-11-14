/* REALWORLD · net — other players, cheaply. Each player writes ONE tiny record (x, z, heading, move state, name) to world/rt/<cell>/<uid>, where <cell> is a 256 m square of the map.
 * You only listen to the 3×3 cells around you (child events, so a move sends ~60 bytes), you write at most once a second (4.5 s heartbeat when standing still) and only while you are outside
 * walking, and the record is removed when you leave / disconnect. Positions are interpolated, so 1 Hz updates look smooth. NPCs are NOT networked at all (pure timetable, see WorldGen.npcState). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, CELL = 256, cellOf = (x, z) => Math.max(0, Math.min(99, Math.floor((x + 512) / CELL))) + 'x' + Math.max(0, Math.min(99, Math.floor((z + 512) / CELL)));
  function create(K){
    const N = { others: new Map(), on: false, sent: 0 };
    let subs = new Map(), myCell = null, lastSent = { x: 0, z: 0, a: 0, m: 0, i: 0 }, sentAt = 0, db = null, uid = null, name = '';
    const ref = p => db.ref('world/rt/' + p);
    const stamp = () => root.firebase.database.ServerValue.TIMESTAMP;
    function sub(cell){
      if(subs.has(cell)) return; const r = ref(cell), now = () => performance.now();
      const put = s => { const k = s.key; if(k === uid) return; const v = s.val(); if(!v || typeof v.x !== 'number') return; let o = N.others.get(k); if(!o){ o = { uid: k, x: v.x, z: v.z, yaw: v.a || 0, ph: 0, mv: 0 }; N.others.set(k, o); } o.tx = v.x; o.tz = v.z; o.tyaw = v.a || 0; o.tmv = v.m || 0; o.inside = !!v.i; o.n = v.n || 'Player'; o.seen = now(); o.cell = cell; };
      const del = s => { const o = N.others.get(s.key); if(o && o.cell === cell) N.others.delete(s.key); };
      r.on('child_added', put, () => {}); r.on('child_changed', put, () => {}); r.on('child_removed', del, () => {}); subs.set(cell, { r, put, del });
    }
    function unsub(cell){ const s = subs.get(cell); if(!s) return; try{ s.r.off('child_added', s.put); s.r.off('child_changed', s.put); s.r.off('child_removed', s.del); }catch(e){} subs.delete(cell); N.others.forEach((o, k) => { if(o.cell === cell) N.others.delete(k); }); }
    function sync(x, z){ const [cx, cz] = cellOf(x, z).split('x').map(Number), want = new Set(); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++) if(cx + i >= 0 && cz + j >= 0) want.add((cx + i) + 'x' + (cz + j)); want.forEach(sub); [...subs.keys()].forEach(c => { if(!want.has(c)) unsub(c); }); }
    N.start = function(x, z){ if(N.on) return; db = K.cloud.db; const u = K.cloud.user; if(!db || !u || u.isAnonymous || !root.firebase) return; uid = u.uid; name = (K.S.meta.name || '').slice(0, 20); if(!name) return; N.on = true; sync(x, z); };
    N.stop = function(){ if(!N.on) return; N.on = false; [...subs.keys()].forEach(unsub); N.others.clear(); if(myCell){ try{ ref(myCell + '/' + uid).remove(); }catch(e){} myCell = null; } };
    /* call every frame with the local player; writes are throttled here */
    N.tick = function(p, dt){
      if(!N.on) return; const t = performance.now();
      N.others.forEach((o, k) => { if(t - o.seen > 14000){ N.others.delete(k); return; } const f = 1 - Math.exp(-dt * 6), dx = o.tx - o.x, dz = o.tz - o.z; if(dx * dx + dz * dz > 900){ o.x = o.tx; o.z = o.tz; } else { o.x += dx * f; o.z += dz * f; } let dy = o.tyaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * f; o.mv += (o.tmv - o.mv) * f; o.ph += dt * (2 + o.mv * 5) * (o.mv > 0.05 ? 1 : 0); });
      const moved = Math.hypot(p.x - lastSent.x, p.z - lastSent.z) > 0.6 || Math.abs(p.yaw - lastSent.a) > 0.25 || (p.mv > 0.05 ? 1 : 0) !== lastSent.m || (p.inside ? 1 : 0) !== lastSent.i;
      if(t - sentAt < (moved ? 1000 : 4500) || (!moved && t - sentAt < 4500)) return; sentAt = t;
      const cell = cellOf(p.x, p.z), rec = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, a: Math.round(p.yaw * 100) / 100, m: p.mv > 0.6 ? 2 : p.mv > 0.05 ? 1 : 0, i: p.inside ? 1 : 0, n: name, t: stamp() };
      lastSent = { x: p.x, z: p.z, a: p.yaw, m: p.mv > 0.05 ? 1 : 0, i: p.inside ? 1 : 0 }; sync(p.x, p.z);
      const upd = {}; upd['world/rt/' + cell + '/' + uid] = rec; if(myCell && myCell !== cell) upd['world/rt/' + myCell + '/' + uid] = null;
      db.ref().update(upd).then(() => { if(myCell !== cell){ try{ db.ref('world/rt/' + cell + '/' + uid).onDisconnect().remove(); if(myCell) db.ref('world/rt/' + myCell + '/' + uid).onDisconnect().cancel(); }catch(e){} myCell = cell; } }).catch(() => {});
    };
    return N;
  }
  RW.Net = { create, cellOf };
})(typeof self !== 'undefined' ? self : this);
