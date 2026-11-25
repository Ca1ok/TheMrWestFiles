/* REALWORLD · crime — the GTA-style crime layer: break into parked cars (lock-picking minigame), a 5-star wanted level, cops that chase you, a police station, a crime report.
 * Two halves in one file:
 *   RealWorld.CrimeLogic  PURE rules (no DOM, no engine) — heat → stars, offences + fines, the lock-pick state machine, cop steering, arrest timer. Tested by tests/crime.test.js.
 *   RealWorld.Crime.create(ctx)  the runtime glue (cops as real drive.js cars, NPC parked cars, HUD, panels). game.js builds it once per start() and calls a handful of hooks.
 * RULES OF THE GAME (keep them if you extend it):
 *   · ONLY parked NPC cars, the dealership's showroom cars and the airport's showroom planes can be stolen. Your own cars/planes, rentals and other players' vehicles cannot.
 *     (CrimeLogic.STEAL_PLANES = false would turn aircraft theft back off: you could still break in, but not fly away.)
 *   · Getting in is only half of it: a stolen vehicle starts DEAD. A second minigame (hotwire: connect the live wire to its matching terminal) must be won before the engine runs.
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
  const STAR_AT = [0, 20, 45, 70, 90, 110], HEAT_MAX = 130, STEAL_PLANES = true;
  /* base fines are in dollars at econ ×1; the runtime multiplies by the economy index (clamped 1..4) like every other price. heat = what a WITNESSED crime adds. */
  const CRIMES = {
    attempt:     { label: 'Attempted break-in (alarm)',    heat: 25, fine: 150 },
    breakin:     { label: 'Vehicle break-in',              heat: 20, fine: 250 },
    theft:       { label: 'Grand theft auto',              heat: 30, fine: 700 },
    theftDealer: { label: 'Grand theft auto (dealership)', heat: 55, fine: 1800 },
    aircraft:    { label: 'Breaking into an aircraft',     heat: 50, fine: 1500 },
    reported:    { label: 'Stolen vehicle reported',       heat: 25, fine: 0 },
    alarm:       { label: 'Alarm set off (failed hotwire)', heat: 20, fine: 150 },
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

  /* ---- the break-in minigame: a needle sweeps a dial; press when it is inside the green arc, N times in a row (a fresh arc each pin, a little faster each time). 4 misses = alarm. ---- */
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
  const difficultyOf = priceCents => clamp(Math.log10(Math.max(1, priceCents / 100) / 10000) / 2, 0.05, 1);      // $14.5k hatch ≈ 0.08 · $32k sedan ≈ 0.25 · $185k GT ≈ 0.63 · $890k+ = 1 (aircraft are forced to ≥ 0.85 by the runtime)
  function lockCreate(diff, seed){
    const R = rng(seed || 7), pins = 2 + (diff > 0.5 ? 1 : 0) + (diff > 0.9 ? 1 : 0), s = { diff, pins, i: 0, pos: R(), dir: 1, speed: 0.5 + 0.55 * diff, width: 0.36 - 0.16 * diff, fails: 0, maxFails: 4, time: 24 - 4 * diff, state: 'run', R, zone: 0, last: '' };
    s.zone = 0.2 + R() * 0.6; return s;
  }
  function lockStep(s, dt){
    if(s.state !== 'run') return s.state; s.time -= dt; if(s.time <= 0){ s.state = 'fail'; s.last = 'timeout'; return s.state; }
    s.pos += s.dir * s.speed * dt; if(s.pos >= 1){ s.pos = 1; s.dir = -1; } else if(s.pos <= 0){ s.pos = 0; s.dir = 1; } return s.state;
  }
  function lockPress(s){
    if(s.state !== 'run') return s.state; const hit = Math.abs(s.pos - s.zone) <= s.width / 2;
    if(hit){ s.i++; s.last = 'hit'; if(s.i >= s.pins){ s.state = 'ok'; return 'ok'; } s.speed *= 1.05; s.zone = 0.15 + s.R() * 0.7; s.time += 2.5; return 'hit'; }
    s.fails++; s.last = 'miss'; if(s.fails >= s.maxFails){ s.state = 'fail'; return 'fail'; } return 'miss';
  }

  /* ---- the hotwire minigame (runs INSIDE the stolen vehicle, after the lock is picked): the dash is torn open and a bundle of coloured wires hangs out. One wire at a time is
   *      "live"; connect it to the terminal of the SAME colour. The terminals are re-shuffled after every correct connection (so you cannot memorise positions). Every wire right = the
   *      engine catches. 3 wrong terminals = short circuit (the alarm goes off, runtime then deals a fresh bundle). Colours also carry a shape so it never relies on colour alone.
   *      Easy cars use 3 wires, pricey ones 4-5; aircraft are forced to difficulty ≥ 0.85 like their locks. ---- */
  const HOT_WIRES = [{ n: 'red', c: '#ff5a4d', g: '●' }, { n: 'yellow', c: '#ffd23f', g: '■' }, { n: 'green', c: '#3ddc84', g: '▲' }, { n: 'blue', c: '#4da3ff', g: '◆' }, { n: 'violet', c: '#c77dff', g: '★' }];
  function hotShuffle(s){                       // a new terminal layout: terms[slot] = wire index; never identical to the previous one
    const prev = s.terms ? s.terms.join() : '';
    for(let tries = 0; tries < 8; tries++){ const a = Array.from({ length: s.wires }, (_, k) => k); for(let k = a.length - 1; k > 0; k--){ const j = (s.R() * (k + 1)) | 0, t = a[k]; a[k] = a[j]; a[j] = t; } s.terms = a; if(a.join() !== prev) break; }
  }
  function hotCreate(diff, seed){
    diff = clamp(diff == null ? 0.3 : diff, 0, 1); const R = rng(seed || 11), wires = clamp(3 + (diff > 0.5 ? 1 : 0) + (diff > 0.9 ? 1 : 0), 3, HOT_WIRES.length);
    const order = Array.from({ length: wires }, (_, k) => k); for(let k = order.length - 1; k > 0; k--){ const j = (R() * (k + 1)) | 0, t = order[k]; order[k] = order[j]; order[j] = t; }
    const s = { diff, wires, order, i: 0, terms: null, strikes: 0, maxStrikes: 3, time: 14 + 3 * wires - 4 * diff, state: 'run', last: '', R };
    hotShuffle(s); return s;
  }
  function hotStep(s, dt){ if(s.state !== 'run') return s.state; s.time -= dt; if(s.time <= 0){ s.state = 'fail'; s.last = 'timeout'; } return s.state; }
  /* slot = which terminal the player picked (0-based, left → right). Returns 'hit' | 'miss' | 'ok' | 'fail' | 'none' (not running / not a terminal). */
  function hotPress(s, slot){
    if(s.state !== 'run' || !(slot >= 0 && slot < s.wires) || slot !== (slot | 0)) return 'none';
    if(s.terms[slot] === s.order[s.i]){ s.i++; s.last = 'hit'; if(s.i >= s.wires){ s.state = 'ok'; return 'ok'; } s.time += 2; hotShuffle(s); return 'hit'; }
    s.strikes++; s.last = 'miss'; if(s.strikes >= s.maxStrikes){ s.state = 'fail'; s.last = 'short'; return 'fail'; } return 'miss';
  }

  /* ---- cop steering: aim at (tx,tz) with the same controls a player has (thr, steer + = right). c.s is a drive.js car state; c keeps its own stuck/reverse timers. ---- */
  function copInputs(c, tx, tz, topFrac, dt, tv, probe){
    const s = c.s, dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz), f0 = Math.sin(s.yaw), f1 = -Math.cos(s.yaw), r0 = Math.cos(s.yaw), r1 = Math.sin(s.yaw), fwd = dx * f0 + dz * f1, lat = dx * r0 + dz * r1;
    if(c.rev > 0){ c.rev -= dt; return { thr: -1, steer: c.revSteer, brake: 0, hand: 0 }; }
    c.stuckT = (Math.abs(s.u) < 1.3 && dist > 9) ? (c.stuckT || 0) + dt : 0;
    if(c.stuckT > 1.4){ c.stuckT = 0; c.rev = 1.2; c.revSteer = lat >= 0 ? -1 : 1; c.unstuck = (c.unstuck || 0) + 1; return { thr: -1, steer: c.revSteer, brake: 0, hand: 0 }; }
    let err = Math.atan2(lat, fwd), avoid = 0;
    if(probe){   // whiskers: look ahead along the heading and ±32°; steer round whatever is blocked (the same solids a player's car hits)
      const Ld = clamp(Math.abs(s.u) * 1.5 + 10, 14, 50), at = a => probe(s.x + Math.sin(s.yaw + a) * Ld, s.z - Math.cos(s.yaw + a) * Ld), b0 = at(0), bR = at(0.56), bL = at(-0.56);
      const blk = b0 || (bR && bL);      // committed turn: once it picks a side it holds it (≥0.8 s) so it does not chatter left/right in front of the wall
      if(blk && !(c.avT > 0)){ c.avDir = !bR && bL ? 1 : bR && !bL ? -1 : (c.avDir || (err >= 0 ? 1 : -1)); c.avT = 1.3; } else if(blk) c.avT = Math.max(c.avT, 0.8);
      if(c.avT > 0){ c.avT -= dt; avoid = 1; err = c.avDir * 0.9; }
      else if(bR){ avoid = 0.5; err = Math.min(err, -0.35); } else if(bL){ avoid = 0.5; err = Math.max(err, 0.35); }
    }
    const steer = clamp(err * 1.7, -1, 1), top = s.D.top * topFrac, tvv = tv || 0;
    // never arrive faster than we can stop: v² = 2·a·(distance − 6 m), plus the target's own speed (so a fleeing car is still chased flat out)
    let vStop = Math.sqrt(2 * s.D.brake * 0.7 * Math.max(0, dist - 6)) + tvv * 1.08 + 2.5, want = Math.min(top, vStop) * (1 - Math.min(0.62, Math.abs(err) * 0.55)); if(avoid) want = Math.min(want, avoid > 0.9 ? 12 : 18);
    if(s.u > want + 1.5) return { thr: 0, steer, brake: 1, hand: 0 };
    return { thr: s.u < want ? 1 : 0, steer, brake: 0, hand: 0 };
  }
  /* arrest: a cop that is CLOSE (ARREST_R), has a clear line to you and that you could actually see (see updateCops) while you are nearly stopped fills the bar in ARREST_T s; anything else
   * drains it twice as fast. `nearest` = distance of the closest ELIGIBLE cop (Infinity if none). Returns true when busted. */
  const ARREST_R = 9, ARREST_T = 3.6, ARREST_V = 3.5;
  function arrestStep(a, nearest, speed, dt){
    if(nearest <= ARREST_R && speed <= ARREST_V) a.t += dt; else a.t = Math.max(0, a.t - dt * 2);
    return a.t >= ARREST_T;
  }
  const Logic = { STAR_AT, HEAT_MAX, STEAL_PLANES, CRIMES, starsOf, newWanted, addHeat, cool, copCount, copTop, copModel, newRec, report, owed, settle, MAX_REC, rng, difficultyOf, lockCreate, lockStep, lockPress, HOT_WIRES, hotCreate, hotStep, hotPress, copInputs, arrestStep, ARREST_R, ARREST_T, ARREST_V };

  /* ======================= RUNTIME ======================= */
  function create(ctx){
    const { OS, P, T, L, G, VD, VH, Dr, V, el, toast } = ctx, $ = s => el.querySelector(s), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const W = newWanted(), A = { t: 0 }; let rec = newRec(), ver = 0, cops = [], npcCars = [], stolen = [], gone = new Map(), mg = null, hw = null, panel = false, bustedUntil = 0, report_ = null, npcAt = 0, copAt = 0, hudAt = 0, saveT = 0, evadeNote = 0, caught = false, lastBust = 0, dispT = null, dispatched = false;
    const GONE_MS = 10 * 60000, econ = () => { try{ return clamp(OS.econ() || 1, 1, 4); }catch(e){ return 1; } }, now = () => Date.now();
    try{ const r = OS.prefs.get('rwCrime'); if(r && Array.isArray(r.o) && r.n) rec = { o: r.o.slice(0, MAX_REC), n: Object.assign(newRec().n, r.n) }; }catch(e){}
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try{ OS.prefs.set('rwCrime', rec); }catch(e){} }, 1500); };
    const bump = () => { ver++; };
    const vkey = q => q.id + '@' + Math.round(q.x) + ',' + Math.round(q.z);
    const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /* ---------- DOM: HUD stars, lock-pick overlay, report panel, busted banner ---------- */
    const hud = document.createElement('div'); hud.id = 'rwWanted'; hud.innerHTML = '<div class="st"></div><div class="lb"></div><div class="bar"><i></i></div><div class="ar"><i></i><span>BUSTING YOU…</span></div>'; el.appendChild(hud);
    const lock = document.createElement('div'); lock.id = 'rwLock'; lock.innerHTML = '<div class="box"><div class="t"></div><canvas width="340" height="340"></canvas><div class="pp"></div><div class="h">Press <kbd>Space</kbd> or click when the needle is in the <b>green</b> · <kbd>Esc</kbd> to walk away</div></div>'; el.appendChild(lock);
    const hot = document.createElement('div'); hot.id = 'rwHot'; hot.innerHTML = '<div class="box"><div class="t"></div><div class="live"><span>LIVE WIRE</span><b class="lw"></b></div><div class="terms"></div><div class="pp"></div><div class="tm"></div><div class="h">Connect the live wire to the terminal of the <b>same colour</b> — press its <kbd>number</kbd> or tap it</div><button class="out" type="button">Climb out · Esc</button></div>'; el.appendChild(hot);
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
    /* a driver who finishes a trip PARKS where they stopped (3 m to the right of their line, i.e. at the kerb) for as long as they stay put; the car is then there to be stolen.
       Idle bots with no trip on record (first load) have their car at their own home's kerb. */
    const parked = new Map();
    function trackBots(){
      const t = now();
      for(const b of ctx.bots()){ if(!b.init && b.init !== undefined) continue;
        if(b.vis && b.sp > 8){ b.lastCar = { x: b.x, z: b.z, yaw: b.yaw }; parked.delete(b.n); }
        else if(!b.vis && b.lastCar){ const c = b.lastCar; b.lastCar = null; parked.set(b.n, { x: c.x + Math.cos(c.yaw) * 3.2, z: c.z + Math.sin(c.yaw) * 3.2, yaw: c.yaw, t }); }
      }
      if(parked.size > 400) for(const [n, v] of parked) if(t - v.t > 20 * 60000) parked.delete(n);
    }
    function refreshNpcCars(){
      const bots = ctx.bots(), out = [], R2 = 170 * 170;
      for(const b of bots){ if(out.length >= 24) break; if(Math.hypot(b.vx || 0, b.vz || 0) > 1 || b.vis || G.h32(b.n, 76) % 3 === 0) continue; if(gone.get('n' + b.n) > now()) continue;
        let x, z, yaw; const pk = parked.get(b.n);
        if(pk && now() - pk.t < 20 * 60000){ x = pk.x; z = pk.z; yaw = pk.yaw; }
        else { if(!b.home) continue; let h; try{ h = L.house(b.home.i != null ? b.home.i : +String(b.home.id).slice(1)); }catch(e){ h = null; } if(!h || !h.g) continue; let k; try{ k = L.kerbSpot(h.g, 0); }catch(e){ continue; } if(!k) continue; x = k.x; z = k.z; yaw = k.yaw; }
        const dx = x - P.x, dz = z - P.z; if(dx * dx + dz * dz > R2) continue; const m = modelFor(b.n), d = m.drive;
        out.push({ id: m.id, style: m.style, kind: 'car', speed: 0, col: G.h32(b.n, 78) % VD.COLORS.length, x, z, yaw, hl: d.len / 2, hw: d.wid / 2, npc: b.n, ownerName: (G.bot(b.n) || {}).name || 'a local' }); }
      const sig = out.map(q => q.npc + '@' + Math.round(q.x)).join(); if(sig !== npcCars._sig){ npcCars = out; npcCars._sig = sig; bump(); }
    }

    /* ---------- hooks for game.js ---------- */
    const keep = q => !((q.kind === 'car' || q.kind === 'plane') && !q.slot && !q.npc && gone.get(vkey(q)) > now());       // hides a showroom car / plane while it is "stolen"
    const extra = () => npcCars.concat(stolen, cops.map(c => c.q));
    function kindOf(q){ if(!q || q.slot || q.cop || q.stolen || q.driven) return null; if(q.kind === 'plane') return 'plane'; if(q.npc != null) return 'npc'; return 'dealer'; }
    function prompt(q){
      const k = kindOf(q); if(!k) return null; const m = VD.get(q.id), nm = m ? m.name : 'vehicle';
      if(k === 'plane') return [m.name + ' · aircraft', 'F: break into the cockpit (crime!)'];
      if(k === 'npc') return [nm + ' · ' + q.ownerName + '’s car', 'Locked — F: break in (crime!)'];
      return [nm + ' · ' + money(m.price / 100), 'E: see it in Assets · F: steal it (crime!)'];
    }
    const busy = () => !!(mg || hw || panel || bustedUntil > performance.now());

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
      const plane = k === 'plane', showroom = k === 'dealer' || plane;       // showroom = the dealership's cars and the airport's planes (restocked after GONE_MS)
      if(plane && !STEAL_PLANES){ crime('aircraft', true); toast('You pop the cockpit open — but you cannot get it started. Get out of here!'); return; }
      crime(plane ? 'aircraft' : 'breakin', seen);
      if(seen){ crime(showroom ? 'theftDealer' : 'theft', true); }
      else { setTimeout(() => ownerReport(q), 70000 + Math.random() * 40000); toast('Clean. Nobody saw you — but keep moving.'); crime0Theft(); }
      const car = Object.assign({}, q, { stolen: true, wired: false, driven: false, from: showroom ? 'dealer' : 'npc', taken: now() }); delete car.npc; car.hot = true; car.owner = q.ownerName || ''; car.rgb = null;
      if(showroom) gone.set(vkey(q), now() + GONE_MS); else gone.set('n' + q.npc, now() + GONE_MS); stolen.push(car); bump(); ctx.rebuild(); const real = V.list.find(x => x === car) || car;
      if(!ctx.startDrive(real)) toast('You cannot get in right now.');     // startDrive opens the hotwire minigame (crime.hotwire) because the stolen vehicle is not wired yet
    }
    function crime0Theft(){ rec.n.thefts++; save(); }   // an unwitnessed theft is still on your private tally, not on the report
    function ownerReport(q){ const hasIt = stolen.some(c => c.hot && c.id === q.id && now() - c.taken < 4 * 60000); if(!hasIt || caught) return; toast('The owner has reported the car stolen!'); crime('reported', true); }

    /* ---------- the hotwire minigame (game.js startDrive calls crime.hotwire(dv) when you get into a stolen vehicle that is not wired yet) ---------- */
    const hotBox = hot.querySelector('.box'), hotDiff = m => { const d = difficultyOf(m.price); return m.kind === 'plane' ? Math.max(0.85, d) : d; };
    const wireTag = i => { const w = HOT_WIRES[i]; return '<i class="w" style="--c:' + w.c + '" title="' + w.n + '">' + w.g + '</i>'; };
    function hotwire(d){
      if(hw || !d || !d.q || !d.q.stolen || d.q.wired || caught) return false; const plane = d.m.kind === 'plane', diff = hotDiff(d.m);
      hw = { d, plane, diff, s: hotCreate(diff, (Math.random() * 1e9) | 0), flash: 0, dirty: true }; if(ctx.locked()) document.exitPointerLock();
      hot.querySelector('.t').textContent = (plane ? 'Cockpit ignition · ' : 'Ignition · ') + d.m.name + ' — hotwire it';
      hot.classList.add('show'); toast(plane ? 'You are in. The master switch is dead — hotwire the ignition.' : 'You are in. The engine is dead — hotwire it.'); hotDraw(); return true;
    }
    function hotDraw(){
      if(!hw) return; const s = hw.s;
      if(hw.dirty){ hw.dirty = false;
        hot.querySelector('.lw').innerHTML = s.i < s.wires ? wireTag(s.order[s.i]) : '';
        hot.querySelector('.terms').innerHTML = s.terms.map((wi, k) => '<button type="button" class="tile" data-slot="' + k + '" style="--c:' + HOT_WIRES[wi].c + '" aria-label="terminal ' + (k + 1) + '"><kbd>' + (k + 1) + '</kbd>' + wireTag(wi) + '</button>').join('');
        hot.querySelector('.pp').innerHTML = s.order.map((wi, j) => '<i class="' + (j < s.i ? 'on' : j === s.i ? 'cur' : '') + '" style="--c:' + HOT_WIRES[wi].c + '"></i>').join('') + '<span class="f">' + '✖'.repeat(s.strikes) + '<em>' + '✖'.repeat(s.maxStrikes - s.strikes) + '</em></span>'; }
      hot.querySelector('.tm').textContent = Math.max(0, s.time).toFixed(1) + ' s';
      hotBox.classList.toggle('miss', hw.flash > 0 && s.last === 'miss'); hotBox.classList.toggle('hit', hw.flash > 0 && s.last === 'hit');
    }
    function hotPressSlot(slot){
      if(!hw) return; const r = hotPress(hw.s, slot); if(r === 'none') return; hw.flash = 0.22; hw.dirty = true;
      if(r === 'ok') return hotDone(); if(r === 'fail') return hotFail(); hotDraw();
    }
    function hotDone(){
      const w = hw; hotClose(); if(!w || ctx.drivingState() !== w.d) return; const d = w.d; d.q.wired = true; d.engine = true; d.t0 = performance.now();
      toast(w.plane ? 'Engine running. Throttle up (W), then pull back at ' + Math.round((d.s.P && d.s.P.vr || 30) * 3.6) + ' km/h.' : 'The engine catches — go!');
    }
    function hotFail(){
      const w = hw; if(!w) return; const slow = w.s.last === 'timeout';
      toast(slow ? 'Too slow — the ignition locks up and the alarm goes off!' : 'Short circuit! Sparks fly and the alarm goes off.'); crime('alarm', true, '');
      w.s = hotCreate(w.diff, (Math.random() * 1e9) | 0); w.flash = 0; w.dirty = true; hotDraw();
    }
    function hotClose(){ hw = null; hot.classList.remove('show'); }
    function hotCancel(){ if(!hw) return; hotClose(); toast('You climb out.'); ctx.leaveCar(); }

    function park(q){ if(q.from && (q.taken || 0) <= lastBust) return; if(!stolen.includes(q)) stolen.push(q); bump(); }
    function impound(q){ const i = stolen.indexOf(q); if(i >= 0) stolen.splice(i, 1); bump(); }

    /* ---------- cops ---------- */
    /* Police response: nothing happens for 10-20 s after you become wanted (dispatch delay). Then cruisers roll out of the police station if you are within STATION_R of it,
       otherwise they start well out of sight (never a clear line to you, never closer than ~190 m). Returns true when a cop was placed. */
    const STATION_R = 520;
    function spawnCop(){
      const stars = W.stars, m = VD.get(copModel(stars)); if(!m) return false; const tx = P.x, tz = P.z;
      const sets = ctx.sets().filter(x => x.a !== copColsArr), dis = ctx.disabled();
      const clear = (x, z) => { const n = Math.ceil(Math.hypot(tx - x, tz - z) / 6); for(let k = 1; k < n; k++){ const px = x + (tx - x) * k / n, pz = z + (tz - z) * k / n, o = ctx.resolve(px, pz, T.height(px, pz), sets, dis, 2.2); if(Math.abs(o.x - px) + Math.abs(o.z - pz) > 0.01) return false; } return true; };
      const place = (x, z) => {
        const yaw = Math.atan2(tx - x, -(tz - z)), s0 = Dr.car(m, { x, z, yaw }), spot = ctx.findFree(x, z, s0.circles, yaw, 0.1); if(!spot || spot.moved > 25 || T.isWater(spot.x, spot.z)) return null;
        return { spot, yaw };
      };
      const add = (spot, yaw) => { const s = Dr.car(m, { x: spot.x, z: spot.z, yaw }); s.y = T.height(spot.x, spot.z); const d = m.drive;
        const q = { id: m.id, style: m.style, kind: 'car', speed: 0, col: 0, rgb: [30, 40, 78], acc: 0, x: s.x, z: s.z, yaw, hl: d.len / 2, hw: d.wid / 2, cop: true };
        cops.push({ s, q, born: performance.now() }); bump(); return true; };
      // 1) station nearby: roll out of the police station
      let st = null; try{ if(L.poi('police')) st = root.RealWorld.Nav.poiPose('police'); }catch(e){}
      if(st && Math.hypot(st.x - tx, st.z - tz) < STATION_R){
        for(let tries = 0; tries < 12; tries++){
          const j = tries === 0 ? 0 : 4 + tries * 1.5, a = Math.random() * Math.PI * 2, r = place(st.x + Math.cos(a) * j, st.z + Math.sin(a) * j);
          if(r) return add(r.spot, r.yaw);
        }
      }
      // 2) far from the station: appear out of sight (behind buildings, or simply far away)
      for(let tries = 0; tries < 40; tries++){
        const a = Math.random() * Math.PI * 2, r = 190 + Math.random() * 120, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; if(T.isWater(x, z)) continue;
        const p = place(x, z); if(!p) continue;
        if(tries < 30 && clear(p.spot.x, p.spot.z) && r < 250) continue;   // visible and close: try again
        return add(p.spot, p.yaw);
      }
      return false;
    }
    const SIREN = [[255, 40, 40], [40, 90, 255]];
    function copWorld(sets){ const dis = ctx.disabled(); return { ground: T.height, lift: ctx.lift, push: (x, z, y, r) => { const o = ctx.resolve(x, z, y, sets, dis, r); return { x: o.x, z: o.z }; } }; }
    let copColsArr = null; const lastSeen = { x: 0, z: 0, t: 0 };
    /* a spot 40-120 m from where you were last seen, on open ground — cops fan out and sweep the neighbourhood instead of freezing */
    function searchPoint(c){
      for(let k = 0; k < 8; k++){ const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 80, x = lastSeen.x + Math.cos(a) * r, z = lastSeen.z + Math.sin(a) * r; if(T.isWater(x, z)) continue; const sp = ctx.findFree(x, z, c.s.circles, c.s.yaw, 0.1); if(sp && sp.moved < 12) return { x: sp.x, z: sp.z }; }
      return { x: lastSeen.x, z: lastSeen.z };
    }
    function updateCops(dt, t){
      const stars = W.stars, want = copCount(stars), px = P.x, pz = P.z, ds = ctx.drivingState(), spd = ctx.speed(), sets = cops.length ? ctx.sets().filter(x => x.a !== copColsArr) : null, world = sets ? copWorld(sets) : null, pCol = ds ? [ds.s] : null;
      if(stars <= 0){ dispT = null; dispatched = false; }
      else if(cops.length < want){
        if(!dispatched && dispT === null){ dispT = t + 10000 + Math.random() * 10000; toast('Police dispatched — they are on their way.'); }   // first response: 10-20 s
        if(dispT !== null && t >= dispT && t - copAt > (cops.length ? 3500 : 0)){ copAt = t; if(spawnCop()){ dispatched = true; } }
      }
      const flash = Math.floor(t / 220) % 2; let nearest = 1e9, seen = false, dis = null, arrestD = 1e9;
      const blocked = (x, z) => { const o = ctx.resolve(x, z, T.height(x, z), sets, dis, 2.0); return Math.abs(o.x - x) + Math.abs(o.z - z) > 0.01; };
      const lineClear = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 6); for(let k = 1; k < n; k++) if(blocked(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false; return true; };
      if(sets) dis = ctx.disabled();
      for(let i = cops.length - 1; i >= 0; i--){ const c = cops[i], s = c.s;
        if(stars <= 0){ c.leave = (c.leave || 0) + dt; }
        // ---- what the cop knows: a cop that can see you (line of sight, rechecked ~2.5×/s) radios your position; the others go to the last place you were seen and then SEARCH the area ----
        const dd = Math.hypot(s.x - px, s.z - pz); let tx = px, tz = pz;
        if(stars > 0 && sets){
          if(t - (c.losAt || 0) > 400){ c.losAt = t; c.clear = dd < 170 && lineClear(s.x, s.z, px, pz); c.los = dd < 36 || c.clear; if(c.los){ lastSeen.x = px; lastSeen.z = pz; lastSeen.t = t; } }
          if(!c.los){
            if(lastSeen.t === 0){ lastSeen.x = px; lastSeen.z = pz; lastSeen.t = t; }
            const gd = c.goal ? Math.hypot(s.x - c.goal.x, s.z - c.goal.z) : 1e9;
            if(!c.goal || gd < 16 || t - c.goalT > 15000){ c.goalT = t; c.goal = lastSeen.t === t || t - lastSeen.t < 9000 && !c.goalSeen ? { x: lastSeen.x, z: lastSeen.z } : searchPoint(c); c.goalSeen = 1; }
            tx = c.goal.x; tz = c.goal.z;
          } else { c.goal = null; c.goalSeen = 0; }
        }
        const inp = stars > 0 ? copInputs(c, tx, tz, copTop(stars) * (c.los ? 1 : 0.62), dt, c.los ? spd : 0, sets ? blocked : null) : { thr: 0.5, steer: Math.sin(t / 900 + i), brake: 0, hand: 0 };
        // the player's own car is solid for cops (a moving circle set); on foot you are simply a target
        c.inp = inp; Dr.stepCar(s, inp, dt, world);
        if(s.hit > 6) c.q.dent = 1; c.q.x = s.x; c.q.z = s.z; c.q.yaw = s.yaw; c.q.y = s.y + 0.1; c.q.pitch = s.pitch; c.q.roll = s.roll;
        const q = c.q, col = SIREN[(flash + i) % 2]; q.acc = col[0] * 65536 + col[1] * 256 + col[2]; q.rgb = [30, 40, 78];
        const d = Math.hypot(s.x - px, s.z - pz), eff = c.los && Math.abs(s.u) < 5 ? d - 12 : d; if(eff < nearest) nearest = eff; if(d < 85) seen = true;
        // arrest eligibility: a real, unobstructed line, the cop has been on the scene a while, and you could SEE it — in front of your view (wide when driving: mirrors), or right next to you
        { const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw), dl = d || 1, dot = ((s.x - px) * fx + (s.z - pz) * fz) / dl, aged = performance.now() - (c.born || 0) > 6000;
          c.visible = !!(c.clear && stars > 0 && (dot > (ds ? -0.2 : 0.3) || d < 5)); if(c.visible && aged && d < arrestD) arrestD = d; }   // a cop that is boxed in but can see you gets out and runs the last 12 m
        if(stars > 0 && (d > 700 || (c.unstuck || 0) > 6)){ cops.splice(i, 1); bump(); continue; }
        if(stars <= 0 && (c.leave > 9 || d > 300)){ cops.splice(i, 1); bump(); } }
      copColsArr = cops.length ? Float32Array.from(root.RWVehicles.colliders(cops.map(c => c.q), T.height)) : null;
      return { nearest, seen, arrestD };
    }

    /* ---------- busted ---------- */
    async function bust(why){
      if(caught) return; caught = true; const speedNote = why || 'Cornered by police.'; const due = owed(rec); let cash = 0; try{ cash = OS.cash() || 0; }catch(e){} const pay = Math.min(due, Math.floor(cash * 100) / 100); let paid = 0;
      if(pay > 0){ try{ const r = OS.homes.payFine(pay, 'Police fines'); if(r && r.ok) paid = pay; }catch(e){} }
      if(paid >= due - 0.005) settle(rec, paid); else { rec.o.forEach(o => { if(o.st === 'open') o.st = 'unpaid'; }); rec.n.paid += paid; }
      rec.n.arrests++; save();
      for(let k = stolen.length - 1; k >= 0; k--) if(stolen[k].hot) stolen.splice(k, 1); lastBust = now();   // the police recover every hot car
      W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; cops.length = 0; lastSeen.t = 0; dispT = null; dispatched = false; bump();
      bus.innerHTML = '<div class="b"><h2>BUSTED</h2><p>' + esc(speedNote) + '</p><p>' + (due > 0 ? (paid >= due - 0.005 ? 'You paid <b>' + money(paid) + '</b> in fines.' : 'You could only pay <b>' + money(paid) + '</b> of <b>' + money(due) + '</b>. The rest is written off as time served.') : 'No fines this time.') + '</p><p class="s">Released outside the police station.</p></div>'; bus.classList.add('show'); bustedUntil = performance.now() + 4200;
      let pose = null; try{ pose = root.RealWorld.Nav.poiPose('police'); }catch(e){} if(pose) await ctx.teleport(pose.x, pose.z, pose.yaw);
      ctx.rebuild(); setTimeout(() => { bus.classList.remove('show'); caught = false; }, 3600);
    }

    /* ---------- the per-frame hook ---------- */
    function update(dt, t){
      if(hw){ if(ctx.drivingState() !== hw.d) hotClose(); else { hotStep(hw.s, dt); if(hw.flash > 0) hw.flash -= dt; if(hw.s.state === 'fail') hotFail(); else hotDraw(); } }
      if(mg){ lockStep(mg.s, dt); if(mg.flash > 0) mg.flash -= dt; if(mg.s.state === 'fail' && mg.s.last === 'timeout'){ finish(false); } else drawLock(); }
      try{ trackBots(); }catch(e){}
      if(t - npcAt > 1100 && !ctx.inside()){ npcAt = t; try{ refreshNpcCars(); }catch(e){} }
      // restock showroom cars / forget old stolen-car heat
      if(gone.size){ const n = now(); let ch = false; gone.forEach((v, k) => { if(v <= n){ gone.delete(k); ch = true; } }); if(ch) bump(); }
      if(!cops.length && W.stars <= 0 && !ctx.driving() && stolen.length === 0){ hud.classList.remove('on'); return; }
      const r = updateCops(Math.min(dt, 0.05), t), inside = ctx.inside();
      if(W.stars > 0){
        const spd = ctx.speed(), seen = r.seen && !inside; if(cool(W, dt, seen || !dispatched)){ toast('You lost them. Wanted level cleared.'); rec.n.evaded++; save(); }
        if(seen && spd > 22 && t - evadeNote > 25000 && W.stars >= 2){ evadeNote = t; crime('evading', false); }
        if(!caught && !inside && arrestStep(A, r.arrestD, spd, dt)){ if(spd > 8) {} bust(); }
        else if(inside) A.t = Math.max(0, A.t - dt);
      } else A.t = 0;
      if(t - hudAt > 120){ hudAt = t; hudDraw(); }
    }
    function hudDraw(){
      const on = W.stars > 0 || (ctx.driving() && ctx.drivingState().q.stolen); hud.classList.toggle('on', on);
      if(!on) return; hud.querySelector('.st').innerHTML = [1, 2, 3, 4, 5].map(i => '<b class="' + (i <= W.stars ? 'a' : '') + '">★</b>').join('');
      const seenNow = cops.some(c => Math.hypot(c.s.x - P.x, c.s.z - P.z) < 85), lb = hud.querySelector('.lb'); lb.textContent = W.stars ? (seenNow ? 'WANTED — POLICE IN PURSUIT' : !dispatched ? 'POLICE DISPATCHED — get away!' : 'SEARCHING… keep hidden') : 'STOLEN VEHICLE'; hud.classList.toggle('hot', W.stars > 0 && seenNow); hud.classList.toggle('srch', W.stars > 0 && !seenNow);
      const need = 12 + 4 * W.stars, f = W.stars && !seenNow ? clamp(W.coolT / need, 0, 1) : 0; hud.querySelector('.bar i').style.width = (f * 100) + '%'; hud.classList.toggle('ar', A.t > 0.05); hud.querySelector('.ar i').style.width = clamp(A.t / ARREST_T, 0, 1) * 100 + '%';
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
      if(a === 'surrender'){ if(!W.stars){ toast('You are not wanted.'); return; } if(owed(rec) > 0 && !pay()) return; W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; cops.length = 0; dispT = null; dispatched = false; bump(); toast('You handed yourself in. The warrant is cleared.'); if(panel) showReport(); return; }
      if(a === 'help'){ panel = true; pan.innerHTML = '<div class="box"><div class="hd"><h2>HOW WANTED LEVELS WORK</h2><button class="x">✕</button></div><ul class="how"><li><b>Break in</b> to a parked car or a showroom car with <kbd>F</kbd> — time the needle in the green.</li><li>Only <b>parked locals’ cars</b>, <b>dealership cars</b> and the <b>airport’s showroom planes</b> can be stolen. Your own cars, planes and rentals are off limits.</li><li>A stolen vehicle starts <b>dead</b>: <b>hotwire</b> it by connecting the live wire to the matching terminal (press its number or tap it). Three wrong terminals set off the alarm.</li><li>Witnesses and the dealership cameras add <b>stars</b>. An alarm always does.</li><li>Police arrive <b>10-20 s</b> after the alarm: from the <b>station</b> if you are near it, otherwise from out of sight. Use the head start to get away. Once they are on you, stay <b>moving</b>. If one is within 9 m and you have stopped, you are <b>busted</b>.</li><li>Break line of sight (or go indoors) and the stars fade. Hand yourself in here to clear it.</li><li>Fines go to the city treasury. <kbd>J</kbd> opens your crime report anywhere.</li></ul></div>'; pan.classList.add('show'); pan.querySelector('.x').onclick = hideReport; }
    }
    const toggleReport = () => { if(mg) return; if(panel) hideReport(); else showReport(); };
    // keys while a panel / minigame is open (captured so the game does not also jump or open dialogs)
    window.addEventListener('keydown', e => { if(!mg && !panel && !hw) return;
      if(hw){ if(e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code) || e.code === 'Tab') return; const c = e.code, dg = /^(Digit|Numpad)([1-9])$/.exec(c); if(dg){ if(!e.repeat) hotPressSlot(+dg[2] - 1); } else if(c === 'Escape') hotCancel(); e.preventDefault(); e.stopImmediatePropagation(); return; }   // while the dash is open every key belongs to the minigame (E / V / H must not leak into the car)
      if(mg && (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter')){ if(!e.repeat) press(); e.preventDefault(); e.stopImmediatePropagation(); } else if(e.code === 'Escape' || (panel && (e.code === 'KeyJ'))){ if(mg) cancelLock(); else hideReport(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    hot.addEventListener('pointerdown', e => { if(!hw) return; const t = e.target.closest('[data-slot]'); if(t){ hotPressSlot(+t.dataset.slot); e.preventDefault(); } else if(e.target.closest('.out')){ hotCancel(); e.preventDefault(); } });
    lock.addEventListener('pointerdown', e => { if(mg && e.target.closest('.box')){ press(); e.preventDefault(); } });
    const view = () => ({ stars: W.stars, owed: owed(rec), arrests: rec.n.arrests, recent: rec.o.slice(0, 5) });
    function resetSession(){ lastSeen.t = 0; dispT = null; dispatched = false; cops.length = 0; W.heat = 0; W.stars = 0; W.coolT = 0; A.t = 0; mg = null; lock.classList.remove('show'); hotClose(); hideReport(); bump(); }
    root.RealWorld = root.RealWorld || {}; root.RealWorld.crimeView = view; root.RealWorld.crimeState = () => ({ lock: mg ? mg.s : null, hot: hw ? hw.s : null, wanted: W, cops: cops.length, copPos: cops.map(c => [Math.round(c.s.x), Math.round(c.s.z)]), copInfo: cops.map(c => [Math.round(c.s.u), c.los ? 1 : 0, Math.round(Math.hypot(c.s.x - P.x, c.s.z - P.z)), c.unstuck || 0, c.avT > 0 ? 1 : 0, c.goal ? Math.round(Math.hypot(c.s.x - c.goal.x, c.s.z - c.goal.z)) : -1]), stolen: stolen.length, npcCars: npcCars.length, rec, caught });   // read-only snapshot for tests / debugging
    return { bodies: () => cops.map(c => ({ s: c.s, hl: c.q.hl, hw: c.q.hw })), update, keep, extra, prompt, kindOf, breakIn, hotwire, toggleReport, act, busy, ver: () => ver, cols: () => copColsArr, park, impound, reset: resetSession, view, wanted: wantedNow, record: () => rec };
  }
  return { Logic, create };
});
