/* REALWORLD · net — other players, cheaply. Each player writes ONE tiny record (x, z, heading, move state, name; plus vehicle model / colour / pitch / roll / speed / altitude while driving or flying) to world/rt/<cell>/<uid>,
 * where <cell> is a 256 m square of the map. You listen to the 3×3 cells around you (5×5 while you are in a vehicle, so fast traffic is seen coming), the record is removed when you leave / disconnect.
 * On foot you write at most once a second (4.5 s heartbeat standing still); in a vehicle every 250 ms (1.5 s standing still). Receivers DEAD-RECKON: a car is advanced along its heading at its reported speed
 * between updates and eased onto each new record, so 4 Hz looks like smooth driving. NPCs are NOT networked at all (pure timetable, see WorldGen.npcState).
 * If the database rules do not know the vehicle fields yet (old rules), the first refused write switches this client to LEGACY mode (walking fields, ≥ 1 s apart) so nobody ever disappears; others then see a walking avatar. */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, CELL = 256, cellOf = (x, z) => Math.max(0, Math.min(99, Math.floor((x + 512) / CELL))) + 'x' + Math.max(0, Math.min(99, Math.floor((z + 512) / CELL)));
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function create(K){
    const N = { others: new Map(), on: false, sent: 0, legacy: false };
    let subs = new Map(), myCell = null, lastSent = { x: 0, z: 0, a: 0, m: 0, i: 0, v: 0 }, sentAt = 0, db = null, uid = null, name = '', rad = 1, fails = 0;
    const ref = p => db.ref('world/rt/' + p);
    const stamp = () => root.firebase.database.ServerValue.TIMESTAMP;
    function sub(cell){
      if(subs.has(cell)) return; const r = ref(cell), now = () => performance.now();
      const put = s => { const k = s.key; if(k === uid) return; const v = s.val(); if(!v || typeof v.x !== 'number') return; let o = N.others.get(k); if(!o){ o = { uid: k, x: v.x, z: v.z, yaw: v.a || 0, ph: 0, mv: 0, pitch: 0, roll: 0, alt: 0 }; N.others.set(k, o); }
        o.tx = v.x; o.tz = v.z; o.tyaw = v.a || 0; o.tmv = v.m || 0; o.inside = !!v.i; o.n = v.n || 'Player'; o.seen = now(); o.cell = cell;
        o.v = v.v | 0; o.c = v.c | 0; o.tpitch = v.p || 0; o.troll = v.r || 0; o.spd = v.s || 0; o.talt = v.h || 0; if(!o.v){ o.pitch = o.roll = o.alt = 0; o.spd = 0; } };
      const del = s => { const o = N.others.get(s.key); if(o && o.cell === cell) N.others.delete(s.key); };
      r.on('child_added', put, () => {}); r.on('child_changed', put, () => {}); r.on('child_removed', del, () => {}); subs.set(cell, { r, put, del });
    }
    function unsub(cell){ const s = subs.get(cell); if(!s) return; try{ s.r.off('child_added', s.put); s.r.off('child_changed', s.put); s.r.off('child_removed', s.del); }catch(e){} subs.delete(cell); N.others.forEach((o, k) => { if(o.cell === cell) N.others.delete(k); }); }
    function sync(x, z){ const [cx, cz] = cellOf(x, z).split('x').map(Number), want = new Set(); for(let i = -rad; i <= rad; i++) for(let j = -rad; j <= rad; j++) if(cx + i >= 0 && cz + j >= 0) want.add((cx + i) + 'x' + (cz + j)); want.forEach(sub); [...subs.keys()].forEach(c => { if(!want.has(c)) unsub(c); }); }
    N.start = function(x, z){ if(N.on) return; db = K.cloud.db; const u = K.cloud.user; if(!db || !u || u.isAnonymous || !root.firebase) return; uid = u.uid; name = (K.S.meta.name || '').slice(0, 20); if(!name) return; N.on = true; sync(x, z); };
    N.stop = function(){ if(!N.on) return; N.on = false; [...subs.keys()].forEach(unsub); N.others.clear(); if(myCell){ try{ ref(myCell + '/' + uid).remove(); }catch(e){} myCell = null; } };
    /* call every frame with the local player; writes are throttled here. p.veh = { v: model index + 1, c: colour, p: pitch, r: roll, s: speed m/s, h: altitude m } while driving / flying */
    N.tick = function(p, dt){
      if(!N.on) return; const t = performance.now(), veh = p.veh && !N.legacy ? p.veh : null;
      N.others.forEach((o, k) => { if(t - o.seen > 14000){ N.others.delete(k); return; }
        const age = Math.min(0.8, (t - o.seen) / 1000), vx = o.v ? Math.sin(o.tyaw) * o.spd : 0, vz = o.v ? -Math.cos(o.tyaw) * o.spd : 0, gx = o.tx + vx * age, gz = o.tz + vz * age, f = 1 - Math.exp(-dt * (o.v ? 9 : 6)), dx = gx - o.x, dz = gz - o.z;
        if(dx * dx + dz * dz > (o.v ? 40000 : 900)){ o.x = gx; o.z = gz; } else { o.x += dx * f; o.z += dz * f; }
        let dy = o.tyaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * Math.min(1, f * (o.v ? 1.4 : 1)); o.mv += (o.tmv - o.mv) * f; o.ph += dt * (2 + o.mv * 5) * (o.mv > 0.05 ? 1 : 0);
        if(o.v){ o.pitch += ((o.tpitch || 0) - o.pitch) * f; o.roll += ((o.troll || 0) - o.roll) * f; o.alt += ((o.talt || 0) - o.alt) * f; } });
      const wantRad = veh ? 2 : 1; if(wantRad !== rad){ rad = wantRad; sync(p.x, p.z); }
      const moved = Math.hypot(p.x - lastSent.x, p.z - lastSent.z) > (veh ? 0.4 : 0.6) || Math.abs(p.yaw - lastSent.a) > (veh ? 0.05 : 0.25) || (p.mv > 0.05 ? 1 : 0) !== lastSent.m || (p.inside ? 1 : 0) !== lastSent.i || (veh ? veh.v : 0) !== lastSent.v;
      const gap = veh ? (moved ? 250 : 1500) : (N.legacy && p.veh ? 1000 : (moved ? 1000 : 4500)); if(t - sentAt < gap) return; sentAt = t;
      const cell = cellOf(p.x, p.z), rec = { x: r1(p.x), z: r1(p.z), a: r2(p.yaw), m: p.mv > 0.6 ? 2 : p.mv > 0.05 ? 1 : 0, i: p.inside ? 1 : 0, n: name, t: stamp() };
      if(veh){ rec.v = veh.v | 0; rec.c = veh.c | 0; rec.p = r2(veh.p || 0); rec.r = r2(veh.r || 0); rec.s = r1(veh.s || 0); rec.h = Math.round(veh.h || 0); }
      lastSent = { x: p.x, z: p.z, a: p.yaw, m: p.mv > 0.05 ? 1 : 0, i: p.inside ? 1 : 0, v: veh ? veh.v : 0 }; sync(p.x, p.z);
      const upd = {}; upd['world/rt/' + cell + '/' + uid] = rec; if(myCell && myCell !== cell) upd['world/rt/' + myCell + '/' + uid] = null;
      db.ref().update(upd).then(() => { fails = 0; N.sent++; if(myCell !== cell){ try{ db.ref('world/rt/' + cell + '/' + uid).onDisconnect().remove(); if(myCell) db.ref('world/rt/' + myCell + '/' + uid).onDisconnect().cancel(); }catch(e){} myCell = cell; } })
        .catch(() => { if(++fails >= 2 && !N.legacy){ N.legacy = true; sentAt = performance.now() + 1500; } });   // refused twice: the rules predate vehicle sync → fall back to walking records
    };
    return N;
  }
  RW.Net = { create, cellOf };
})(typeof self !== 'undefined' ? self : this);
