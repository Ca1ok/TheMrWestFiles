/* REALWORLD · crime — the GTA-style crime layer: break into parked cars (lock-picking minigame), a 5-star wanted level, cops that chase you, a police station, a crime report.
 * Two halves in one file:
 *   RealWorld.CrimeLogic  PURE rules (no DOM, no engine) — heat → stars, offences + fines, the lock-pick state machine, cop steering, arrest timer. Tested by tests/crime.test.js.
 *   RealWorld.Crime.create(ctx)  the runtime glue (cops as real drive.js cars, NPC parked cars, HUD, panels). game.js builds it once per start() and calls a handful of hooks.
 * RULES OF THE GAME (keep them if you extend it):
 *   · ONLY parked NPC cars and the dealership's showroom cars can be stolen. Your own cars, rentals and other players' cars cannot. Aircraft can be broken into (crime!) but never flown away
 *     (CrimeLogic.STEAL_PLANES = false — flip it to allow it).
 *   · Money stays closed: a fine is a normal ledger payment to the treasury (OS.homes.payFine → K.spendTo('gov')). Nothing is ever created by crime — a stolen car is a joyride, it is never sold.
 *   · Everything is local and cheap: the record is ≤30 short entries in the player's own prefs (one small write per change, no new listeners). Wanted level / cops live in memory only.
 *   · Cops are drive.js cars (same physics, same colliders) so chases look and feel like driving; they only exist while stars > 0 and never more than 6. */
(function(root, factory){
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  else { const RW = root.RealWorld = root.RealWorld || {}; RW.CrimeLogic = api.Logic; RW.Crime = api; }
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ======================= PURE LOGIC ======================= */
  const STAR_AT = [0, 20, 45, 70, 90, 110], HEAT_MAX = 130, STEAL_PLANES = false;
  /* base fines are in dollars at econ ×1; the runtime multiplies by the economy index (clamped 1..4) like every other price. heat = what a WITNESSED crime adds. */
  const CRIMES = {
    attempt:     { label: 'Attempted break-in (alarm)',    heat: 25, fine: 150 },
    breakin:     { label: 'Vehicle break-in',              heat: 20, fine: 250 },
    theft:       { label: 'Grand theft auto',              heat: 30, fine: 700 },
    theftDealer: { label: 'Grand theft auto (dealership)', heat: 55, fine: 1800 },
    aircraft:    { label: 'Breaking into an aircraft',     heat: 50, fine: 1500 },
    reported:    { label: 'Stolen vehicle reported',       heat: 25, fine: 0 },
    evading:     { label: 'Evading police',                heat: 0,  fine: 350 },
    resisting:   { label: 'Fleeing arrest',                heat: 0,  fine: 500 }
  };
  const starsOf = heat => { let s = 0; for(let i = 1; i < STAR_AT.length; i++) if(heat >= STAR_AT[i]) s = i; return s; };
  const newWanted = () => ({ heat: 0, stars: 0, peak: 0, coolT: 0 });
  function addHeat(w, n){ w.heat = clamp(w.heat + n, 0, HEAT_MAX); w.stars = starsOf(w.heat); w.peak = Math.max(w.peak, w.stars); w.coolT = 0; return w.stars; }
  /* losing the cops: while a cop can see you nothing fades; once out of sight each star takes (12 + 4×stars) s to drop. Returns true when the wanted level just reached 0. */
  function cool(w, dt, seen){
    if(!w.stars) return false; if(seen){ w.coolT = 0; return false; } w.coolT += dt;
    if(w.coolT >= 12 + 4 * w.stars){ w.coolT = 0; w.heat = Math.max(0, STAR_AT[w.stars] - 1); w.stars = starsOf(w.heat); if(!w.stars){ w.heat = 0; return true; } }
    return false;
  }
  const copCount = stars => [0, 1, 2, 3, 4, 6][clamp(stars | 0, 0, 5)];
  const copTop = stars => [0, 0.55, 0.65, 0.78, 0.9, 1][clamp(stars | 0, 0, 5)];            // fraction of the cruiser's top speed
  const copModel = stars => stars >= 5 ? 'apex' : stars >= 3 ? 'vesper' : 'alder';          // 1-2★ sedans, 3-4★ GTs, 5★ the fastest car in the catalogue

  /* ---- the crime record ---- */
  const newRec = () => ({ o: [], n: { arrests: 0, thefts: 0, breakins: 0, paid: 0, evaded: 0 } });
  const MAX_REC = 30;
  function report(rec, kind, info){          // → the new offence; fine is already scaled (info.econ)
    const c = CRIMES[kind]; if(!c) return null; info = info || {};
    const o = { t: info.t || 0, k: kind, label: c.label, fine: Math.round(c.fine * clamp(info.econ || 1, 1, 4)), st: 'open', x: Math.round(info.x || 0), z: Math.round(info.z || 0), w: info.where || '' };
    rec.o.unshift(o); if(rec.o.length > MAX_REC) rec.o.length = MAX_REC; if(kind === 'theft' || kind === 'theftDealer') rec.n.thefts++; if(kind === 'breakin' || kind === 'attempt' || kind === 'aircraft') rec.n.breakins++; return o;
  }
  const owed = rec => rec.o.reduce((a, o) => a + (o.st === 'open' ? o.fine : 0), 0);
  function settle(rec, paid){ rec.o.forEach(o => { if(o.st === 'open') o.st = 'paid'; }); rec.n.paid += paid || 0; }

  /* ---- the break-in minigame: a needle sweeps a dial; press when it is inside the green arc, N times in a row (a fresh arc each pin, a little faster each time). 3 misses = alarm. ---- */
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
  const difficultyOf = priceCents => clamp(Math.log10(Math.max(1, priceCents / 100) / 10000) / 2, 0.05, 1);      // $14.5k hatch ≈ 0.08 · $32k sedan ≈ 0.25 · $185k GT ≈ 0.63 · $890k+ = 1 (aircraft are forced to ≥ 0.85 by the runtime)
  function lockCreate(diff, seed){
    const R = rng(seed || 7), pins = 3 + (diff > 0.55 ? 1 : 0) + (diff > 0.9 ? 1 : 0), s = { diff, pins, i: 0, pos: R(), dir: 1, speed: 0.75 + 0.9 * diff, width: 0.2 - 0.11 * diff, fails: 0, maxFails: 3, time: 16 - 3 * diff, state: 'run', R, zone: 0, last: '' };
    s.zone = 0.2 + R() * 0.6; return s;
  }
  function lockStep(s, dt){
    if(s.state !== 'run') return s.state; s.time -= dt; if(s.time <= 0){ s.state = 'fail'; s.last = 'timeout'; return s.state; }
    s.pos += s.dir * s.speed * dt; if(s.pos >= 1){ s.pos = 1; s.dir = -1; } else if(s.pos <= 0){ s.pos = 0; s.dir = 1; } return s.state;
  }
  function lockPress(s){
    if(s.state !== 'run') return s.state; const hit = Math.abs(s.pos - s.zone) <= s.width / 2;
    if(hit){ s.i++; s.last = 'hit'; if(s.i >= s.pins){ s.state = 'ok'; return 'ok'; } s.speed *= 1.1; s.zone = 0.15 + s.R() * 0.7; s.time += 1.2; return 'hit'; }
    s.fails++; s.last = 'miss'; if(s.fails >= s.maxFails){ s.state = 'fail'; return 'fail'; } return 'miss';
  }

  /* ---- cop steering: aim at (tx,tz) with the same controls a player has (thr, steer + = right). c.s is a drive.js car state; c keeps its own stuck/reverse timers. ---- */
  function copInputs(c, tx, tz, topFrac, dt, tv){
    const s = c.s, dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz), f0 = Math.sin(s.yaw), f1 = -Math.cos(s.yaw), r0 = Math.cos(s.yaw), r1 = Math.sin(s.yaw), fwd = dx * f0 + dz * f1, lat = dx * r0 + dz * r1;
    if(c.rev > 0){ c.rev -= dt; return { thr: -1, steer: c.revSteer, brake: 0, hand: 0 }; }
    c.stuckT = (Math.abs(s.u) < 1.3 && dist > 9) ? (c.stuckT || 0) + dt : 0;
    if(c.stuckT > 1.4){ c.stuckT = 0; c.rev = 1.2; c.revSteer = lat >= 0 ? -1 : 1; c.unstuck = (c.unstuck || 0) + 1; return { thr: -1, steer: c.revSteer, brake: 0, hand: 0 }; }
    const err = Math.atan2(lat, fwd), steer = clamp(err * 1.7, -1, 1), top = s.D.top * topFrac, tvv = tv || 0;
    // never arrive faster than we can stop: v² = 2·a·(distance − 6 m), plus the target's own speed (so a fleeing car is still chased flat out)
    const vStop = Math.sqrt(2 * s.D.brake * 0.7 * Math.max(0, dist - 6)) + tvv * 1.08 + 2.5, want = Math.min(top, vStop) * (1 - Math.min(0.62, Math.abs(err) * 0.55));
    if(s.u > want + 1.5) return { thr: 0, steer, brake: 1, hand: 0 };
    return { thr: s.u < want ? 1 : 0, steer, brake: 0, hand: 0 };
  }
  /* arrest: a cop within 14 m while you are (nearly) stopped fills the bar in ~1.6 s; moving away drains it. Returns true when busted. */
  function arrestStep(a, nearest, speed, dt){
    if(nearest <= 9 && speed <= 8) a.t += dt; else a.t = Math.max(0, a.t - dt * 1.5);
    return a.t >= 1.6;
  }
  const Logic = { STAR_AT, HEAT_MAX, STEAL_PLANES, CRIMES, starsOf, newWanted, addHeat, cool, copCount, copTop, copModel, newRec, report, owed, settle, MAX_REC, rng, difficultyOf, lockCreate, lockStep, lockPress, copInputs, arrestStep };

  /* ======================= RUNTIME ======================= */
  function create(ctx){
    const { OS, P, T, L, G, VD, VH, Dr, V, el, toast } = ctx, $ = s => el.querySelector(s), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const W = newWanted(), A = { t: 0 }; let rec = newRec(), ver = 0, cops = [], npcCars = [], stolen = [], gone = new Map(), mg = null, panel = false, bustedUntil = 0, report_ = null, npcAt = 0, copAt = 0, hudAt = 0, saveT = 0, evadeNote = 0, caught = false, lastBust = 0;
    const GONE_MS = 10 * 60000, econ = () => { try{ return clamp(OS.econ() || 1, 1, 4); }catch(e){ return 1; } }, now = () => Date.now();
    try{ const r = OS.prefs.get('rwCrime'); if(r && Array.isArray(r.o) && r.n) rec = { o: r.o.slice(0, MAX_REC), n: Object.assign(newRec().n, r.n) }; }catch(e){}
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try{ OS.prefs.set('rwCrime', rec); }catch(e){} }, 1500); };
    const bump = () => { ver++; };
    const vkey = q => q.id + '@' + Math.round(q.x) + ',' + Math.round(q.z);
    const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /* ---------- DOM: HUD stars, lock-pick overlay, report panel, busted banner ---------- */
    const hud = document.createElement('div'); hud.id = 'rwWanted'; hud.innerHTML = '<div class="st"></div><div class="lb"></div><div class="bar"><i></i></div><div class="ar"><i></i><span>BUSTING YOU…</span></div>'; el.appendChild(hud);
    const lock = document.createElement('div'); lock.id = 'rwLock'; lock.innerHTML = '<div class="box"><div class="t"></div><canvas width="340" height="340"></canvas><div class="pp"></div><div class="h">Press <kbd>Space</kbd> or click when the needle is in the <b>green</b> · <kbd>Esc</kbd> to walk away</div></div>'; el.appendChild(lock);
    const pan = document.createElement('div'); pan.id = 'rwCrime'; el.appendChild(pan);
    const bus = document.createElement('div'); bus.id = 'rwBusted'; el.appendChild(bus);
    const cv = lock.querySelector('canvas'), cx = cv.getContext('2d');

    /* ---------- records / heat ---------- */
    function crime(kind, heatToo, where){
      const o = report(rec, kind, { t: now(), x: P.x, z: P.z, econ: econ(), where: where || (ctx.place ? ctx.place() : '') }); save(); const before = W.stars;
      if(heatToo !== false) addHeat(W, CRIMES[kind].heat);
      if(W.stars > before){ toast('Wanted level ' + '★'.repeat(W.stars) + ' — ' + (CRIMES[kind].label)); } return o;
    }
    const wantedNow = () => W.stars > 0;

    /* ---------- NPC parked cars: a car at the kerb outside each home whose owner is indoors (pure function of the bot list, rebuilt ~1/s near the player) ---------- */
    const WEIGHTS = [5, 5, 3, 2, 1, 0.3];
    function modelFor(n){ const tot = WEIGHTS.reduce((a, b) => a + b, 0); let r = (G.h32(n, 77) % 1000) / 1000 * tot; for(let i = 0; i < VD.CARS.length; i++){ r -= WEIGHTS[i] || 0.2; if(r <= 0) return VD.CARS[i]; } return VD.CARS[0]; }
    function refreshNpcCars(){
      const bots = ctx.bots(), out = [], R2 = 170 * 170;
      for(const b of bots){ if(out.length >= 24) break; if(Math.hypot(b.vx || 0, b.vz || 0) > 1 || !b.home || G.h32(b.n, 76) % 3 === 0) continue; if(gone.get('n' + b.n) > now()) continue;
        let h; try{ h = L.house(b.home.i != null ? b.home.i : +String(b.home.id).slice(1)); }catch(e){ h = null; } if(!h || !h.g) continue; let k; try{ k = L.kerbSpot(h.g, 0); }catch(e){ continue; } if(!k) continue;
        const dx = k.x - P.x, dz = k.z - P.z; if(dx * dx + dz * dz > R2) continue; const m = modelFor(b.n), d = m.drive;
        out.push({ id: m.id, style: m.style, kind: 'car', speed: 0, col: G.h32(b.n, 78) % VD.COLORS.length, x: k.x, z: k.z, yaw: k.yaw, hl: d.len / 2, hw: d.wid / 2, npc: b.n, ownerName: (G.bot(b.n) || {}).name || 'a local' }); }
      const sig = out.map(q => q.npc).join(); if(sig !== npcCars._sig){ npcCars = out; npcCars._sig = sig; bump(); }
    }

    /* ---------- hooks for game.js ---------- */
    const keep = q => !(q.kind === 'car' && !q.slot && !q.npc && gone.get(vkey(q)) > now());       // hides a showroom car while it is "stolen"
    const extra = () => npcCars.concat(stolen, cops.map(c => c.q));
    function kindOf(q){ if(!q || q.slot || q.cop || q.stolen || q.driven) return null; if(q.kind === 'plane') return 'plane'; if(q.npc != null) return 'npc'; return 'dealer'; }
    function prompt(q){
      const k = kindOf(q); if(!k) return null; const m = VD.get(q.id), nm = m ? m.name : 'vehicle';
      if(k === 'plane') return [m.name + ' · aircraft', 'F: break into the cockpit (crime!)'];
      if(k === 'npc') return [nm + ' · ' + q.ownerName + '’s car', 'Locked — F: break in (crime!)'];
      return [nm + ' · ' + money(m.price / 100), 'E: see it in Assets · F: steal it (crime!)'];
    }
    const busy = () => !!(mg || panel || bustedUntil > performance.now());

    function witnessed(){ for(const b of ctx.bots()){ if(!b.vis) continue; if(Math.hypot(b.x - P.x, b.z - P.z) < 38) return true; } return false; }

    function breakIn(){
      if(mg || ctx.driving() || ctx.uiBusy() || caught) return; const q = V.look, k = kindOf(q); if(!k) return; const m = VD.get(q.id); if(!m) return;
      if(Math.hypot(q.x - P.x, q.z - P.z) > 4.6) return; if(ctx.locked()) document.exitPointerLock();
      mg = { q, k, m, s: lockCreate(k === 'plane' ? Math.max(0.85, difficultyOf(m.price)) : difficultyOf(m.price), (Math.random() * 1e9) | 0), seen: k === 'dealer' || k === 'plane' || witnessed(), flash: 0, t0: performance.now() };
      lock.classList.add('show'); lock.querySelector('.t').textContent = (k === 'npc' ? q.ownerName + '’s ' : '') + m.name + ' — ' + (k === 'plane' ? 'cockpit lock' : 'door lock') + ' · security ' + '●'.repeat(1 + Math.round(mg.s.diff * 4)) + '○'.repeat(4 - Math.round(mg.s.diff * 4));
      if(mg.seen) toast(k === 'npc' ? 'Someone is watching…' : 'Security cameras are on you!'); drawLock();
    }
    function drawLock(){
      if(!mg) return; const s = mg.s, c = cx, R = 130, X = 170, Y = 170; c.clearRect(0, 0, 340, 340);
      const ang = f => -Math.PI * 0.85 + f * Math.PI * 1.7;
      c.lineWidth = 22; c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(X, Y, R, ang(0), ang(1)); c.stroke();
      c.strokeStyle = '#3ddc84'; c.beginPath(); c.arc(X, Y, R, ang(clamp(s.zone - s.width / 2, 0, 1)), ang(clamp(s.zone + s.width / 2, 0, 1))); c.stroke();
      const a = ang(s.pos), fl = mg.flash > 0; c.lineWidth = 5; c.strokeStyle = fl ? (s.last === 'miss' ? '#ff5a4d' : '#3ddc84') : '#fff'; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * (R + 14), Y + Math.sin(a) * (R + 14)); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(X, Y, 9, 0, 7); c.fill();
      c.fillStyle = '#9fb0c8'; c.font = '700 15px system-ui'; c.textAlign = 'center'; c.fillText(Math.max(0, s.time).toFixed(1) + ' s', X, Y + 46);
      lock.querySelector('.pp').innerHTML = Array.from({ length: s.pins }, (_, i) => '<i class="' + (i < s.i ? 'on' : '') + '"></i>').join('') + '<span class="f">' + '✖'.repeat(s.fails) + '<em>' + '✖'.repeat(s.maxFails - s.fails) + '</em></span>';
    }
    function press(){
      if(!mg) return; const r = lockPress(mg.s); mg.flash = 0.18; if(r === 'ok') return finish(true); if(r === 'fail') return finish(false); drawLock();
    }
    function cancelLock(){ if(!mg) return; mg = null; lock.classList.remove('show'); toast('You walk away from the car.'); }
    function finish(ok){
      const g = mg; mg = null; lock.classList.remove('show'); if(!g) return; const { q, k, m, seen } = g;
      if(!ok){ toast('ALARM! The lock jammed and the alarm is blaring.'); crime('attempt', true, ''); return; }
      if(k === 'plane'){ crime('aircraft', true); toast(STEAL_PLANES ? 'You are in.' : 'You pop the cockpit open — but its ignition is keyed to the owner. This aircraft cannot be flown away. Get out of here!'); if(!STEAL_PLANES) return; }
      crime('breakin', seen); const dealer = k === 'dealer';
      if(seen){ crime(dealer ? 'theftDealer' : 'theft', true); }
      else { setTimeout(() => ownerReport(q), 70000 + Math.random() * 40000); toast('Clean. Nobody saw you — but keep moving.'); crime0Theft(); }
      const car = Object.assign({}, q, { stolen: true, driven: false, from: dealer ? 'dealer' : 'npc', taken: now() }); delete car.npc; car.hot = true; car.owner = q.ownerName || ''; car.rgb = null;
      if(dealer) gone.set(vkey(q), now() + GONE_MS); else gone.set('n' + q.npc, now() + GONE_MS); stolen.push(car); bump(); ctx.rebuild(); const real = V.list.find(x => x === car) || car;
      if(!ctx.startDrive(real)) toast('You cannot get in right now.');
    }
    function crime0Theft(){ rec.n.thefts++; save(); }   // an unwitnessed theft is still on your private tally, not on the report
    function ownerReport(q){ const hasIt = stolen.some(c => c.hot && c.id === q.id && now() - c.taken < 4 * 60000); if(!hasIt || caught) return; toast('The owner has reported the car stolen!'); crime('reported', true); }

    function park(q){ if(q.from && (q.taken || 0) <= lastBust) return; if(!stolen.includes(q)) stolen.push(q); bump(); }
    function impound(q){ const i = stolen.indexOf(q); if(i >= 0) stolen.splice(i, 1); bump(); }

    /* ---------- cops ---------- */
    function spawnCop(){
      const stars = W.stars, m = VD.get(copModel(stars)); if(!m) return; const side = ctx.drivingState(); const tx = P.x, tz = P.z;
      const sets = ctx.sets().filter(x => x.a !== copColsArr), dis = ctx.disabled(), y0 = T.height(tx, tz);
      // cops have no pathfinding: only start where the straight line to you is open (no building in between)
      const clear = (x, z) => { const n = Math.ceil(Math.hypot(tx - x, tz - z) / 6); for(let k = 1; k < n; k++){ const px = x + (tx - x) * k / n, pz = z + (tz - z) * k / n, o = ctx.resolve(px, pz, T.height(px, pz), sets, dis, 2.2); if(Math.abs(o.x - px) + Math.abs(o.z - pz) > 0.01) return false; } return true; };
      for(let tries = 0; tries < 30; tries++){
        const a = Math.random() * Math.PI * 2, r = (tries < 12 ? 80 : 140) + Math.random() * 70, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; if(T.isWater(x, z)) continue; const yaw = Math.atan2(tx - x, -(tz - z));
        const s0 = Dr.car(m, { x, z, yaw }), spot = ctx.findFree(x, z, s0.circles, yaw, 0.1); if(!spot || spot.moved > 25 || T.isWater(spot.x, spot.z)) continue; if(tries < 29 && !clear(spot.x, spot.z)) continue;
        const s = Dr.car(m, { x: spot.x, z: spot.z, yaw }); s.y = T.height(spot.x, spot.z); const d = m.drive;
        const q = { id: m.id, style: m.style, kind: 'car', speed: 0, col: 0, rgb: [30, 40, 78], acc: 0, x: s.x, z: s.z, yaw, hl: d.len / 2, hw: d.wid / 2, cop: true };
        cops.push({ s, q, born: performance.now() }); bump(); return; }
    }
    const SIREN = [[255, 40, 40], [40, 90, 255]];
    function copWorld(sets){ const dis = ctx.disabled(); return { ground: T.height, push: (x, z, y, r) => { const o = ctx.resolve(x, z, y, sets, dis, r); return { x: o.x, z: o.z }; } }; }
    let copColsArr = null;
    function updateCops(dt, t){
      const stars = W.stars, want = copCount(stars), px = P.x, pz = P.z, ds = ctx.drivingState(), spd = ctx.speed(), sets = cops.length ? ctx.sets().filter(x => x.a !== copColsArr) : null, world = sets ? copWorld(sets) : null, pCol = ds ? [ds.s] : null;
      if(stars > 0 && cops.length < want && t - copAt > 900){ copAt = t; spawnCop(); }
      const flash = Math.floor(t / 220) % 2; let nearest = 1e9, seen = false;
      for(let i = cops.length - 1; i >= 0; i--){ const c = cops[i], s = c.s;
        if(stars <= 0){ c.leave = (c.leave || 0) + dt; }
        const inp = stars > 0 ? copInputs(c, px, pz, copTop(stars), dt, spd) : { thr: 0.5, steer: Math.sin(t / 900 + i), brake: 0, hand: 0 };
        // the player's own car is solid for cops (a moving circle set); on foot you are simply a target
        c.inp = inp; Dr.stepCar(s, inp, dt, world);
        if(s.hit > 6) c.q.dent = 1; c.q.x = s.x; c.q.z = s.z; c.q.yaw = s.yaw; c.q.y = s.y + 0.1; c.q.pitch = s.pitch; c.q.roll = s.roll;
        const q = c.q, col = SIREN[(flash + i) % 2]; q.acc = col[0] * 65536 + col[1] * 256 + col[2]; q.rgb = [30, 40, 78];
        const d = Math.hypot(s.x - px, s.z - pz); if(d < nearest) nearest = d; if(d < 85) seen = true;
        if(stars > 0 && (d > 420 || (c.unstuck || 0) > 2)){ cops.splice(i, 1); bump(); continue; }
        if(stars <= 0 && (c.leave > 9 || d > 300)){ cops.splice(i, 1); bump(); } }
      copColsArr = cops.length ? Float32Array.from(root.RWVehicles.colliders(cops.map(c => c.q), T.height)) : null;
      return { nearest, seen };
    }

    /* ---------- busted ---------- */
    async function bust(why){
      if(caught) return; caught = true; const speedNote = why || 'Cornered by police.'; const due = owed(rec); let cash = 0; try{ cash = OS.cash() || 0; }catch(e){} const pay = Math.min(due, Math.floor(cash * 100) / 100); let paid = 0;
      if(pay > 0){ try{ const r = OS.homes.payFine(pay, 'Police fines'); if(r && r.ok) paid = pay; }catch(e){} }
      if(paid >= due - 0.005) settle(rec, paid); else { rec.o.forEach(o => { if(o.st === 'open') o.st = 'unpaid'; }); rec.n.paid += paid; }
      rec.n.arrests++; save();
      for(let k = stolen.length - 1; k >= 0; k--) if(stolen[k].hot) stolen.splice(k, 1); lastBust = now();   // the police recover every hot car
      W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; cops.length = 0; bump();
      bus.innerHTML = '<div class="b"><h2>BUSTED</h2><p>' + esc(speedNote) + '</p><p>' + (due > 0 ? (paid >= due - 0.005 ? 'You paid <b>' + money(paid) + '</b> in fines.' : 'You could only pay <b>' + money(paid) + '</b> of <b>' + money(due) + '</b>. The rest is written off as time served.') : 'No fines this time.') + '</p><p class="s">Released outside the police station.</p></div>'; bus.classList.add('show'); bustedUntil = performance.now() + 4200;
      let pose = null; try{ pose = root.RealWorld.Nav.poiPose('police'); }catch(e){} if(pose) await ctx.teleport(pose.x, pose.z, pose.yaw);
      ctx.rebuild(); setTimeout(() => { bus.classList.remove('show'); caught = false; }, 3600);
    }

    /* ---------- the per-frame hook ---------- */
    function update(dt, t){
      if(mg){ lockStep(mg.s, dt); if(mg.flash > 0) mg.flash -= dt; if(mg.s.state === 'fail' && mg.s.last === 'timeout'){ finish(false); } else drawLock(); }
      if(t - npcAt > 1100 && !ctx.inside()){ npcAt = t; try{ refreshNpcCars(); }catch(e){} }
      // restock showroom cars / forget old stolen-car heat
      if(gone.size){ const n = now(); let ch = false; gone.forEach((v, k) => { if(v <= n){ gone.delete(k); ch = true; } }); if(ch) bump(); }
      if(!cops.length && W.stars <= 0 && !ctx.driving() && stolen.length === 0){ hud.classList.remove('on'); return; }
      const r = updateCops(Math.min(dt, 0.05), t), inside = ctx.inside();
      if(W.stars > 0){
        const spd = ctx.speed(), seen = r.seen && !inside; if(cool(W, dt, seen)){ toast('You lost them. Wanted level cleared.'); rec.n.evaded++; save(); }
        if(seen && spd > 22 && t - evadeNote > 25000 && W.stars >= 2){ evadeNote = t; crime('evading', false); }
        if(!caught && !inside && arrestStep(A, r.nearest, spd, dt)){ if(spd > 8) {} bust(); }
        else if(inside) A.t = Math.max(0, A.t - dt);
      } else A.t = 0;
      if(t - hudAt > 120){ hudAt = t; hudDraw(); }
    }
    function hudDraw(){
      const on = W.stars > 0 || (ctx.driving() && ctx.drivingState().q.stolen); hud.classList.toggle('on', on);
      if(!on) return; hud.querySelector('.st').innerHTML = [1, 2, 3, 4, 5].map(i => '<b class="' + (i <= W.stars ? 'a' : '') + '">★</b>').join('');
      const seenNow = cops.some(c => Math.hypot(c.s.x - P.x, c.s.z - P.z) < 85), lb = hud.querySelector('.lb'); lb.textContent = W.stars ? (seenNow ? 'WANTED — POLICE IN PURSUIT' : 'SEARCHING… keep hidden') : 'STOLEN VEHICLE'; hud.classList.toggle('hot', W.stars > 0 && seenNow); hud.classList.toggle('srch', W.stars > 0 && !seenNow);
      const need = 12 + 4 * W.stars, f = W.stars && !seenNow ? clamp(W.coolT / need, 0, 1) : 0; hud.querySelector('.bar i').style.width = (f * 100) + '%'; hud.classList.toggle('ar', A.t > 0.05); hud.querySelector('.ar i').style.width = clamp(A.t / 1.6, 0, 1) * 100 + '%';
    }

    /* ---------- crime report panel + station actions ---------- */
    const atStation = () => { try{ const p = L.poi('police'); return !!p && ctx.inside() && ctx.cellId && String(ctx.cellId()).includes('police'); }catch(e){ return false; } };
    function showReport(){
      panel = true; if(ctx.locked()) document.exitPointerLock(); const o = owed(rec), at = ctx.atStation();
      const rows = rec.o.slice(0, 14).map(x => '<tr><td>' + new Date(x.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</td><td>' + esc(x.label) + '</td><td class="m">' + (x.fine ? money(x.fine) : '—') + '</td><td class="s ' + x.st + '">' + (x.st === 'open' ? 'OWED' : x.st === 'paid' ? 'PAID' : 'WRITTEN OFF') + '</td></tr>').join('');
      pan.innerHTML = '<div class="box"><div class="hd"><h2>POLICE · CRIME REPORT</h2><button class="x">✕</button></div><div class="sum"><div><small>Wanted level</small><b class="' + (W.stars ? 'red' : 'ok') + '">' + (W.stars ? '★'.repeat(W.stars) : 'None') + '</b></div><div><small>Fines owed</small><b>' + money(o) + '</b></div><div><small>Arrests</small><b>' + rec.n.arrests + '</b></div><div><small>Thefts</small><b>' + rec.n.thefts + '</b></div><div><small>Escaped</small><b>' + rec.n.evaded + '</b></div></div>'
        + (rows ? '<table><tr><th>Time</th><th>Offence</th><th>Fine</th><th>Status</th></tr>' + rows + '</table>' : '<p class="clean">Clean record. Steal a car and this page fills up quickly.</p>')
        + '<div class="act">' + (at ? '<button data-a="pay"' + (o > 0 ? '' : ' disabled') + '>Pay fines (' + money(o) + ')</button><button data-a="surrender"' + (W.stars ? '' : ' disabled') + '>Hand myself in</button>' : '<span class="hint">Pay fines and hand yourself in at the Police Station.</span>') + '</div></div>';
      pan.classList.add('show'); pan.querySelector('.x').onclick = hideReport; pan.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { act(b.dataset.a); }; });
    }
    function hideReport(){ panel = false; pan.classList.remove('show'); }
    function pay(){ const o = owed(rec); if(o <= 0){ toast('You owe nothing.'); return true; } let cash = 0; try{ cash = OS.cash() || 0; }catch(e){} if(cash < o){ toast('You need ' + money(o) + ' to clear your fines — you have ' + money(cash) + '.'); return false; }
      let r = null; try{ r = OS.homes.payFine(o, 'Police fines'); }catch(e){} if(r && r.ok){ settle(rec, o); save(); toast('Fines paid: ' + money(o) + '. Record clear.'); return true; } toast('Payment failed.'); return false; }
    function act(a){
      if(a === 'report'){ showReport(); return; }
      if(a === 'pay'){ pay(); if(panel) showReport(); return; }
      if(a === 'surrender'){ if(!W.stars){ toast('You are not wanted.'); return; } if(owed(rec) > 0 && !pay()) return; W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; cops.length = 0; bump(); toast('You handed yourself in. The warrant is cleared.'); if(panel) showReport(); return; }
      if(a === 'help'){ panel = true; pan.innerHTML = '<div class="box"><div class="hd"><h2>HOW WANTED LEVELS WORK</h2><button class="x">✕</button></div><ul class="how"><li><b>Break in</b> to a parked car or a showroom car with <kbd>F</kbd> — time the needle in the green.</li><li>Only <b>parked locals’ cars</b> and <b>dealership cars</b> can be stolen. Your own cars, rentals and aircraft are off limits.</li><li>Witnesses and the dealership cameras add <b>stars</b>. An alarm always does.</li><li>Cops chase in cars: stay <b>moving</b>. If one is within 9 m and you have stopped, you are <b>busted</b>.</li><li>Break line of sight (or go indoors) and the stars fade. Hand yourself in here to clear it.</li><li>Fines go to the city treasury. <kbd>J</kbd> opens your crime report anywhere.</li></ul></div>'; pan.classList.add('show'); pan.querySelector('.x').onclick = hideReport; }
    }
    const toggleReport = () => { if(mg) return; if(panel) hideReport(); else showReport(); };
    // keys while a panel / minigame is open (captured so the game does not also jump or open dialogs)
    window.addEventListener('keydown', e => { if(!mg && !panel) return; if(mg && (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter')){ if(!e.repeat) press(); e.preventDefault(); e.stopImmediatePropagation(); } else if(e.code === 'Escape' || (panel && (e.code === 'KeyJ'))){ if(mg) cancelLock(); else hideReport(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    lock.addEventListener('pointerdown', e => { if(mg && e.target.closest('.box')){ press(); e.preventDefault(); } });
    const view = () => ({ stars: W.stars, owed: owed(rec), arrests: rec.n.arrests, recent: rec.o.slice(0, 5) });
    function resetSession(){ cops.length = 0; W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; mg = null; lock.classList.remove('show'); hideReport(); bump(); }
    root.RealWorld = root.RealWorld || {}; root.RealWorld.crimeView = view; root.RealWorld.crimeState = () => ({ lock: mg ? mg.s : null, wanted: W, cops: cops.length, copPos: cops.map(c => [Math.round(c.s.x), Math.round(c.s.z)]), stolen: stolen.length, npcCars: npcCars.length, rec, caught });   // read-only snapshot for tests / debugging
    return { update, keep, extra, prompt, kindOf, breakIn, toggleReport, act, busy, ver: () => ver, cols: () => copColsArr, park, impound, reset: resetSession, view, wanted: wantedNow, record: () => rec };
  }
  return { Logic, create };
});
