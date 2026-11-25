/* REALWORLD · game — the first-person controller: player, physics, doors and in-place interiors, people & cars, HUD, input, travel, the render loop.
 * Everything heavy lives elsewhere (chunkgen/worker = geometry, gfx = GPU, streamer = what is loaded, phys = collision world, cells = the insides of buildings, props = instanced scenery, net = other players, interiors = rooms, env = sky).
 * EXTEND HERE: BUILDINGS (a landmark → an interior kind), RealWorld.Interiors.register(kind, fn), RealWorld.config (speeds, view distance, field of view), TRAVEL list in travelItems().
 * RealWorld.start(K) is called once by boot.js the first time the player steps outside; it returns the public API (enter / exit / phone / travel …). */
(function(root){
  const RW = root.RealWorld, Phys = RW.Phys, G = root.WorldGen, BG = root.BuildGen, T = root.RWTerrain, M = root.RWMesh, L = root.RWLayout;
  const cfg = RW.config = Object.assign({ radius: 28, perfRadius: 10, startRadius: 12, perfStart: 5, fov: 72, walk: 4.4, run: 8.4, jump: 5.6, grav: 17, eye: 1.55, pr: 0.36, sens: 0.0022, far: 4400, npcRange: 230, carRange: 480, minScale: 0.55 }, RW.config || {});
  /* landmark id (WorldGen.POIS) → the interior to build when you walk in. Add a line + RealWorld.Interiors.register('<kind>', …) for a new public building. */
  const BUILDINGS = RW.buildings = { bank: { kind: 'bank', name: 'Bank' }, exchange: { kind: 'exchange', name: 'Stock Exchange' }, shop: { kind: 'shop', name: 'WestShop' }, arcade: { kind: 'arcade', name: 'Arcade' }, agency: { kind: 'agency', name: 'Estate Agency' }, hall: { kind: 'hall', name: 'Council Hall' },
    dealer: { kind: 'dealer', name: 'Car Dealership' }, airport: { kind: 'airport', name: 'Private Airport' }, uni: { kind: 'uni', name: 'University Library' }, lab: { kind: 'lab', name: 'Research Institute' }, ind: { kind: 'ind', name: 'Freight Depot' }, plant: { kind: 'plant', name: 'Power Plant' }, police: { kind: 'police', name: 'Police Station' } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), TAU = Math.PI * 2, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), sleep = ms => new Promise(r => setTimeout(r, ms));
  const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; };
  const pack = c => (Math.round(c[0]) * 65536 + Math.round(c[1]) * 256 + Math.round(c[2]));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  RW.start = function(K){
    const OS = root.OS, $ = s => rootEl.querySelector(s), screen = document.getElementById('screen');
    const rootEl = document.createElement('div'); rootEl.id = 'rw';
    rootEl.innerHTML = `<canvas id="rwc" tabindex="0"></canvas><div id="rwHud">
      <div class="rw-top"><button class="rw-btn" id="rwPhone" title="Open WestOS (P)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg><span>Phone</span></button><button class="rw-btn" id="rwTravel" title="Travel (M)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg><span>Travel</span></button><button class="rw-btn" id="rwUnstuck" title="Stuck? Move to the nearest clear ground (U)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="2"/></svg><span>Unstuck</span></button><button class="rw-btn" id="rwGfx" title="Graphics settings (G: next preset)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg><span>Auto</span></button><span class="rw-chip" id="rwClock"></span><span class="rw-chip" id="rwCash"></span></div>
      <div id="rwCompass"><canvas id="rwCompassC" width="560" height="46"></canvas><i></i><div id="rwCompassLbl"></div></div><div id="rwLoc"></div><div id="rwCross"></div><div id="rwTip"></div><div id="rwPrompt"></div><div id="rwDash"></div><canvas id="rwMap" width="168" height="168"></canvas><div id="rwLabels"></div>
      <div id="rwDlg"></div><div id="rwHelp"><div><b>W A S D</b> walk</div><div><b>Shift</b> run &nbsp; <b>Space</b> jump</div><div><b>Mouse</b> look (click to capture)</div><div><b>E</b> open a door / talk to someone</div><div><b>U</b> stuck? move to clear ground</div><div><b>G</b> graphics preset &nbsp; (top bar: all graphics settings)</div><div><b>M</b> map &nbsp; <b>P</b> phone (WestOS)</div><div><b>Esc</b> release the mouse</div></div><div id="rwPause">Click to look around</div>
      <div id="rwTouch"><div id="rwStick"><i></i></div><button id="rwBtnE">E</button><button id="rwBtnJ">⤒</button><button id="rwBtnR">Run</button><div id="rwDrv"><button id="rwTG">Gas</button><button id="rwTB">Brake</button><button id="rwTH">Hand</button><button id="rwTV">View</button><button id="rwTT">Taxi</button></div></div>
      <div id="rwLoad"><div class="t">Stepping outside…</div><div class="bar"><i></i></div></div><div id="rwFade"></div></div>`;
    screen.insertBefore(rootEl, document.getElementById('menubar'));
    const cv = $('#rwc'), S = { running: false, phone: false, mode: 'world', nh: 64, nd: 1, scale: 1, fps: 60, holdUntil: 0, loading: true, t0: 0 };
    let gfx = null, st = null, net = null, scr = null, npcs = null, dlg = null, raf = 0, last = 0, cells = null, cooldown = 0, toastT = 0, helpShown = false;
    const P = { x: 700, y: 0, z: 560, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, mv: 0, bob: 0, inside: false, grounded: true, cy: 0 };
    const keys = {}, touch = { on: false, mx: 0, mz: 0, run: false, jump: false, look: null, stick: null };
    let env = null, envAt = 0, grade = null, dyn = { plots: null, marks: null, sig: '' }, dynCols = [], dynColsA = null, dynDoors = [], botList = [], botsAt = 0, npcAt = 0, labelsEl = $('#rwLabels'), labelPool = [];
    let inBuf = new Float32Array(8 * 16), actorBuf = new Float32Array(8 * 256), carBuf = new Float32Array(8 * 128), sunTick = 0, frames = 0, fpsT = 0, adaptT = 0, lookNpc = null, curDoor = null, curNpc = null;
    const toast = m => { try{ OS.toast(m); }catch(e){} };
    const perfLow = () => document.documentElement.classList.contains('perf-low');
    const nh = () => { const w = OS.homes.world && OS.homes.world(); const n = w ? Object.keys(w).length : 0; return Math.max(64, n || 512); };
    /* ---------------- vehicles (vehicles.js): showroom models + your own cars and planes, drawn instanced, solid, and ready to be driven later ---------------- */
    const V = { list: [], sig: '', cols: null, look: null }, VD = root.VehicleData, VH = root.RWVehicles;
    function rebuildVehicles(){
      if(!VH || !VD || dv) return; let garage = []; try{ garage = OS.homes.garage ? OS.homes.garage() : []; }catch(e){}
      const h = OS.homes.home && OS.homes.home(), hg = h && h.id ? (L.house(+String(h.id).slice(1)) || {}).g : null, sig = garage.map(g => g.slot + g.m + g.col).join() + '|' + (hg ? h.id : '') + '|' + S.nh + '|' + crime.ver(); if(sig === V.sig) return; V.sig = sig;
      V.list = VH.showcase('dealer').concat(VH.showcase('airport'), VH.owned(garage, hg || null)); applyParking(garage); V.list = V.list.filter(crime.keep).concat(crime.extra()); V.cols = V.list.length ? Float32Array.from(VH.colliders(V.list, T.height)) : null; V.bufs = null;
    }
    const vehBufs = {};
    function fillVehicles(){
      const out = {}, px = P.x, pz = P.z, hexOf = i => VD.colorHex(i);
      for(const q of V.list){ if(dv && dv.wreck && dv.q === q) continue; const dx = q.x - px, dz = q.z - pz; if(dx * dx + dz * dz > cfg.npcRange ** 2) continue; const b = vehBufs[q.style] || (vehBufs[q.style] = new Float32Array(8 * 16)); let o = out[q.style]; if(!o) o = out[q.style] = { buf: b, n: 0 };
        if(o.n * 8 + 8 > o.buf.length){ const nb = new Float32Array(o.buf.length * 2); nb.set(o.buf); o.buf = vehBufs[q.style] = nb; } const rgb = q.rgb || M.rgb(hexOf(q.col)), i = o.n++ * 8, f = o.buf; f[i] = q.x; f[i + 1] = q.y != null ? q.y : T.height(q.x, q.z) + (q.kind === 'plane' ? 0.05 : 0.1); f[i + 2] = q.z; f[i + 3] = q.yaw; f[i + 4] = q.pitch || 0; f[i + 5] = q.roll || 0; f[i + 6] = pack(rgb); f[i + 7] = (q.acc != null ? q.acc : pack(rgb.map(c => c * 0.5))) + (q.driven && dv && dv.q === q && !dv.car && dv.s.throttle > 0.03 ? 0.5 : 0); }   // +0.5 on the accent colour = "engine running": the actor shader spins the propeller blades
      return out;
    }
    /* ---------------- driving (drive.js): E on your own car or plane gets you in, E again gets you out ----------------
     * One control scheme for every device: KEYBOARD (WASD / arrows), MOUSE (cursor offset from the screen centre = steering wheel / stick; with the pointer captured, movement works like a stick that
     * springs back; left / right button = gas / brake or throttle up / down; wheel = throttle) and TOUCH (the left stick + big on-screen buttons). The physics is os/realworld/drive.js (pure, tested). */
    const Dr = RW.Drive, mouse = { px: 0, py: 0, sx: 0, sy: 0, l: false, rb: false, at: 0, in: false }, tb = {};
    /* the crime layer (crime.js): lock-picking, wanted level, cops, crime report. If the module failed to load the world still works (no-op stub). */
    const NOCRIME = { update(){}, keep: () => true, extra: () => [], prompt: () => null, breakIn(){}, toggleReport(){}, act(){}, busy: () => false, ver: () => 0, cols: () => null, park(){}, impound(){}, reset(){}, hotwire: () => false };
    const crime = RW.Crime ? RW.Crime.create({ OS, P, T, L, G, VD, VH, Dr, V, el: rootEl, toast, bots: () => botList, driving: () => !!dv, drivingState: () => dv, uiBusy: () => uiOpen(), locked: () => locked(),
      rebuild: () => { V.sig = ''; rebuildVehicles(); }, startDrive: q => startDrive(q), leaveCar: () => { if(dv) endDrive(); }, findFree: (x, z, c, y, o) => findFree(x, z, c, y, o), disabled: () => cells.disabled(), resolve: (x, z, y, sets, dis, r) => Phys.resolve(x, z, y, sets, dis, r), sets: () => collSets(), lift: (x, z) => kerbLift(x, z),
      inside: () => !!(S.room || S.cell), speed: () => dv ? Math.hypot(dv.s.u || 0, dv.s.v || 0) : Math.hypot(P.vx, P.vz), teleport: (x, z, y) => teleport(x, z, y), atStation: () => !!(S.room && S.room.door && S.room.door.id === 'police'), place: () => '' }) : NOCRIME;
    let dv = null, dashAt = 0, dashHtml = '';
    /* ---- crash effects (fx.js): plane = explosion + burning wreck; car = damage → smoke (white wisps → black smoke → flames), weaker engine, a pull to one side, sparks on impact ---- */
    let fx = null, fxA = null, fxD = null, flashEl = null, flashO = 0, wreckN = 0; const dmgMap = new Map();
    const WRECK_S = 4;                                                                       // seconds the camera watches the fireball before the plane is towed back
    const dmgKey = q => q.slot ? parkKey(q) : null, dmgOf = q => { const k = dmgKey(q); return k ? (dmgMap.get(k) || 0) : (q.dmg || 0); };
    function dmgSet(q, v){ const k = dmgKey(q); if(k){ if(v > 0) dmgMap.set(k, v); else dmgMap.delete(k); } q.dmg = v; }
    const bonnet = (s, len) => ({ x: s.x + Math.sin(s.yaw) * len * 0.3, y: s.y + 0.95, z: s.z - Math.cos(s.yaw) * len * 0.3 });
    const emId = q => 'veh:' + (dmgKey(q) || (q._fxid = q._fxid || ('n' + (++wreckN))));
    function carHit(d, hit){
      const s = d.s, before = d.dmg, sev = clamp((hit - 2.5) / 16, 0, 0.6); if(!d.pull) d.pull = Math.random() < 0.5 ? -1 : 1;
      fx.impact(s.x - s.nx * d.m.drive.wid * 0.5, s.y + 0.6, s.z - s.nz * d.m.drive.wid * 0.5, s.nx, s.nz, clamp(hit / 14, 0.2, 1.6));
      d.dmg = Math.min(1, before + sev); dmgSet(d.q, d.dmg);
      if(before < 0.5 && d.dmg >= 0.5) toast('Smoke is pouring from the engine.'); else if(before < 1 && d.dmg >= 1) toast('The engine is dead. E to get out, H to send it home.');
    }
    function carSmoke(d){                                                                       // follows the bonnet while you drive; the plume is sized by the damage
      if(!fx || d.dmg < 0.2) return; const q = d.q, len = d.m.drive.len;
      fx.setEmitter(emId(q), { kind: 'smoke', k: d.dmg, ttl: Infinity, get: () => (dv && dv.q === q) ? bonnet(dv.s, len) : null, x: d.s.x, y: d.s.y + 1, z: d.s.z });
    }
    function startWreck(d){
      const s = d.s, m = d.m, water = T.isWater(s.x, s.z), ias = Math.hypot(s.vx, s.vy, s.vz), size = clamp(m.fly.len / 9, 0.8, 1.6), p = clamp((0.6 + ias / 60) * size, 0.5, 2.2), gy = T.height(s.x, s.z);
      d.wreck = { t: 0, why: s.crashed || 'You crashed.' }; d.shake = 1;
      fx.explode(s.x, water ? 0 : Math.max(s.y, gy) + 0.3, s.z, { power: p, vx: s.vx, vy: s.vy, vz: s.vz, water });
      if(!water) fx.setEmitter('wreck:' + (wreckN++), { kind: 'wreck', x: s.x, y: gy, z: s.z, ttl: 50 });
      if(!flashEl){ flashEl = document.createElement('div'); flashEl.id = 'rwFlash'; rootEl.appendChild(flashEl); }
    }
    const crashMsg = (d, why) => why + (d.q.stolen ? ' The police impounded the wreck.' : ' Your ' + d.m.name + ' was towed back to its parking spot.');
    const parkKey = q => q.slot + ':' + (q.t || 0);
    const parkedAll = () => { try{ return OS.prefs.get('rwVeh') || {}; }catch(e){ return {}; } };
    /* where you left a vehicle is remembered per garage record (slot + purchase time) in your own prefs — nothing goes to the shared database */
    function setParked(q, on){ if(!q.slot) return; try{ const pk = Object.assign({}, parkedAll()), k = parkKey(q); if(on) pk[k] = [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10, Math.round(q.yaw * 100) / 100]; else delete pk[k]; const ks = Object.keys(pk); if(ks.length > 40) delete pk[ks[0]]; OS.prefs.set('rwVeh', pk); }catch(e){} }
    function applyParking(garage){
      const pk = parkedAll(), live = {}; let stale = false;
      V.list.forEach(q => { if(!q.slot) return; const g = garage.find(x => x.slot === q.slot); q.t = g ? g.t : 0; q.rentEnd = g && g.expires ? g.expires : 0; live[parkKey(q)] = 1; const r = pk[parkKey(q)];
        if(Array.isArray(r) && r.length === 3 && r.every(isFinite) && Math.hypot(r[0], r[1]) < L.radius() + 2200){ q.x = r[0]; q.z = r[1]; q.yaw = r[2]; } });
      if(garage.length) for(const k in pk) if(!live[k]) stale = true;         // a sold vehicle's spot (never pruned while the garage has not loaded yet)
      if(stale){ try{ const keep = {}; for(const k in pk) if(live[k]) keep[k] = pk[k]; OS.prefs.set('rwVeh', keep); }catch(e){} }
    }
    const lerpA = (a, b, k) => wrapA(a + wrapA(b - a) * k);
    function startDrive(q){
      if(dv || !S.running || S.phone || S.cell || S.room || S.busy || S.loading || !Dr) return false; const m = VD.get(q.id); if(!m || !m.driveable) return false;
      const car = m.kind === 'car', s = car ? Dr.car(m, { x: q.x, z: q.z, yaw: q.yaw }) : Dr.plane(m, { x: q.x, z: q.z, yaw: q.yaw }); s.y = T.height(q.x, q.z);
      let view = 'chase', inv = false; try{ view = OS.prefs.get('rwView') === 'cockpit' ? 'cockpit' : 'chase'; inv = OS.prefs.get('rwInv') === true; }catch(e){}
      dv = { q, m, s, kind: m.kind, car, view, inv, cYaw: q.yaw, cPitch: 0, thr: 0, pitchIn: 0, rollIn: 0, t0: performance.now(), shake: 0, edgeAt: 0, hold: false, wreck: null, dmg: dmgOf(q), pull: 0, hitAt: 0, engine: !(q.stolen && !q.wired), cam: { pos: [q.x, s.y + 3, q.z], yaw: q.yaw, pitch: -0.1, roll: 0, fov: cfg.fov * Math.PI / 180, near: 0.25, far: cfg.far } };
      q.driven = true; if(fx && car){ fx.removeEmitter(emId(q)); carSmoke(dv); } const rest = V.list.filter(x => x !== q); V.cols = rest.length ? Float32Array.from(VH.colliders(rest, T.height)) : null;
      S.drive = dv.kind; P.vx = P.vz = P.vy = 0; mouse.in = false; mouse.sx = mouse.sy = 0; mouse.l = mouse.rb = false; closeDialog(true); setPrompt(null); curNpc = curDoor = null; V.look = null;
      rootEl.classList.add('driving', 'drv-' + dv.kind); $('#rwBtnE').textContent = 'Exit';
      $('#rwTG').textContent = car ? 'Gas' : 'Thr ▲'; $('#rwTB').textContent = car ? 'Brake' : 'Thr ▼'; $('#rwTH').textContent = car ? 'Hand' : 'Brake';
      if(!dv.engine){ if(crime.hotwire(dv)) return true; dv.engine = true; }      // a stolen vehicle starts DEAD: the hotwire minigame (crime.js) runs first; no crime layer = just drive
      toast(car ? 'Driving the ' + m.name + '.' : 'Flying the ' + m.name + '. Full throttle, then pull back at ' + Math.round(s.P.vr * 3.6) + ' km/h.'); return true;
    }
    /* mode: undefined = get out and park where you stand · 'home' = send it back to its parking spot · 'crash' = it was wrecked, towed back */
    function endDrive(mode, msg){
      if(!dv) return; const d = dv, q = d.q, s = d.s;
      if(fx && d.car){ fx.removeEmitter(emId(q)); if(mode === 'home'){ dmgSet(q, 0); } else if(d.dmg >= 0.2 && mode !== 'crash'){ const b = bonnet(s, d.m.drive.len); fx.setEmitter(emId(q), { kind: 'smoke', k: d.dmg, ttl: 25 + 70 * d.dmg, x: b.x, y: T.height(b.x, b.z) + 0.95, z: b.z, get: null }); } }   // a wrecked car you leave keeps smoking where it stands
      dv = null; S.drive = null; rootEl.classList.remove('driving', 'drv-car', 'drv-plane'); $('#rwBtnE').textContent = 'E'; tb.gas = tb.brake = tb.hand = false; mouse.l = mouse.rb = false;
      q.driven = false; q.pitch = q.roll = 0; q.y = null;
      if(q.stolen){ if(mode === 'crash'){ crime.impound(q); mode = 'wreck'; } else { q.x = s.x; q.z = s.z; q.yaw = s.yaw; crime.park(q); if(mode === 'home') mode = undefined; } }   // a stolen car stays where you leave it (session only), never goes to your garage
      if(mode === 'home' || mode === 'crash'){
        setParked(q, false); V.sig = ''; rebuildVehicles(); const nq = V.list.find(x => x.slot === q.slot && x.t === q.t) || q, rx = Math.cos(nq.yaw), rz = Math.sin(nq.yaw), off = (nq.hw || 1) + 1.6;
        teleport(nq.x + rx * off, nq.z + rz * off, nq.yaw); if(msg) toast(msg); return;
      }
      q.x = s.x; q.z = s.z; q.yaw = s.yaw; if(mode !== 'wreck') setParked(q, true); V.sig = ''; rebuildVehicles();
      const rx = Math.cos(s.yaw), rz = Math.sin(s.yaw), off = -((d.car ? d.m.drive.wid / 2 : 2.2) + 1.1);       // step out on the left
      let px = s.x + rx * off, pz = s.z + rz * off, h = T.height(px, pz); try{ const o = Phys.resolve(px, pz, h, collSets(), cells.disabled(), cfg.pr); px = o.x; pz = o.z; h = T.height(px, pz); }catch(e){}
      P.x = px; P.z = pz; P.yaw = s.yaw; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.y = P.cy = h; P.grounded = true; if(msg) toast(msg);
    }
    function exitDrive(){
      if(!dv) return; const s = dv.s;
      if(dv.wreck){ endDrive('crash', crashMsg(dv, dv.wreck.why)); return; }
      if(dv.car ? Math.abs(s.u) > 3 : (!s.onGround || s.speed > 5)){ toast(dv.car ? 'Slow down to get out.' : s.onGround ? 'Stop the plane first (Space = brakes).' : 'You cannot get out while flying!'); return; }
      endDrive();
    }
    /* THE OPEN SEA: one huge flat plane just under the sea level of the chunks (which only cover ~1.3 km around you), so water runs to the horizon instead of ending where chunks stop. */
    let ocean = null;
    /* open sea far from the player needs no chunk: the ocean plane already covers a seabed deeper than 10 m (9 samples per chunk, cached by the streamer) */
    function farSea(cx, cz){ const x0 = cx * 128, z0 = cz * 128; for(let i = 0; i <= 2; i++) for(let j = 0; j <= 2; j++) if(T.land(x0 + i * 64, z0 + j * 64) > -10) return false; return true; }
    function makeOcean(){ const mb = new M.MB(16 * 16 * 4 + 8), c = [16, 70, 126], n = 16, w = 1000, o = -n * w / 2; for(let a = 0; a < n; a++) for(let b = 0; b < n; b++){ const x0 = o + a * w, z0 = o + b * w, k = mb.n; mb.v(x0, -0.4, z0, 0, 1, 0, c, 253); mb.v(x0 + w, -0.4, z0, 0, 1, 0, c, 253); mb.v(x0 + w, -0.4, z0 + w, 0, 1, 0, c, 253); mb.v(x0, -0.4, z0 + w, 0, 1, 0, c, 253); mb.tri(k, k + 2, k + 1); mb.tri(k, k + 3, k + 2); } return gfx.upload(mb.finish()); }   // 16 × 16 tiles of 1 km: huge triangles lose depth precision
    /* UNSTUCK (key U / the Unstuck button): finds the nearest spot where you — or your car / plane — overlap nothing and puts you there, level and at a standstill (same heading).
     * Searches rings out to 90 m; nothing free → a vehicle goes back to its parking spot, a walker to home / the town square. Works on foot, in a car and on the ground in a plane. */
    let unstuckAt = 0;
    function findFree(x, z, circles, yaw, yOff){
      const sets = collSets(), dis = cells.disabled(), fx = Math.sin(yaw), fz = -Math.cos(yaw);
      const ok = (px, pz) => { const y = T.height(px, pz) + yOff; for(const c of circles){ const cx = px + fx * c[0], cz = pz + fz * c[0], o = Phys.resolve(cx, cz, y, sets, dis, c[1]); if(Math.abs(o.x - cx) + Math.abs(o.z - cz) > 0.02) return false; } return true; };
      if(ok(x, z)) return { x, z, moved: 0 };
      for(let r = 2.5; r <= 90; r += 2.5){ const n = Math.max(12, Math.round(r * 1.6)); for(let i = 0; i < n; i++){ const a = i / n * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if(ok(px, pz)) return { x: px, z: pz, moved: r }; } }
      return null;
    }
    function unstuck(){
      const now = performance.now(); if(!S.running || S.loading || S.phone || S.busy || now - unstuckAt < 1500) return; unstuckAt = now;
      if(dv){
        const d = dv, s = d.s, q = d.q; if(d.hold || d.wreck) return;
        if(!d.car && !s.onGround){ toast('You cannot be stuck in the air — press H to send the plane home.'); return; }
        const spot = findFree(s.x, s.z, s.circles, s.yaw, 0.4);
        if(!spot){ endDrive('home', 'No clear space nearby — your ' + d.m.name + ' went back to its parking spot.'); return; }
        s.x = spot.x; s.z = spot.z; s.y = T.height(s.x, s.z); s.vx = s.vz = s.vy = 0; s.hit = 0; s.crashed = null;
        if(d.car){ s.u = s.v = s.r = 0; s.speed = 0; s.pitch = s.roll = 0; }
        else { const b = Dr.basis(s.yaw, 0, 0); s.B.f = b.f; s.B.r = b.r; s.B.u = b.u; s.pitch = s.roll = 0; s.onGround = true; s.throttle = 0; d.thr = 0; s.stalled = false; s.speed = 0; }
        q.x = s.x; q.z = s.z; q.yaw = s.yaw; q.y = s.y; d.cYaw = s.yaw; P.x = s.x; P.z = s.z;
        toast(spot.moved ? 'Freed — moved ' + Math.round(spot.moved) + ' m to clear ground.' : 'Not stuck — levelled and stopped.'); return;
      }
      if(S.room || P.inside){ toast('Use the door (E) to get back outside.'); return; }
      const spot = findFree(P.x, P.z, [[0, cfg.pr]], P.yaw, 0);
      if(!spot){ const h = homePose() || plazaPose(); toast('No clear space nearby — taking you ' + (/^Home/.test(h.n || '') ? 'home.' : 'to the town square.')); teleport(h.x, h.z, h.yaw); return; }
      P.x = spot.x; P.z = spot.z; P.vx = P.vz = P.vy = 0; P.y = P.cy = T.height(P.x, P.z); P.grounded = true; toast(spot.moved ? 'Freed — moved ' + Math.round(spot.moved) + ' m to clear ground.' : 'You are not stuck.');
    }
    /* taxi: put the plane at the start of the runway (fades out while the ground streams in) */
    async function taxiToRunway(){
      const d = dv, s = d.s, R = T.rwy(); if(!R || d.hold) return; if(!s.onGround || s.speed > 4){ toast('Land and stop first.'); return; }
      d.hold = true; fade(true); await sleep(280); if(dv !== d) return;
      s.x = R.x0 + 30; s.z = R.z; s.vx = s.vz = s.vy = 0; s.throttle = 0; d.thr = 0; const b = Dr.basis(Math.PI / 2, 0, 0); s.B.f = b.f; s.B.r = b.r; s.B.u = b.u; s.yaw = Math.PI / 2; s.pitch = s.roll = 0; s.y = T.height(s.x, s.z); s.onGround = true; d.cYaw = s.yaw; P.x = s.x; P.z = s.z;
      if(st) st.update(P.x, P.z); const t0 = performance.now(); while(!ringReady() && performance.now() - t0 < 4500){ await sleep(60); if(st){ st.update(P.x, P.z); st.upload(3); } }
      d.hold = false; fade(false); toast('On the runway, facing east.');
    }
    function driveKey(k, e){
      if(k === 'KeyV'){ dv.view = dv.view === 'chase' ? 'cockpit' : 'chase'; try{ OS.prefs.set('rwView', dv.view); }catch(x){} e.preventDefault(); return true; }
      if(k === 'KeyI' && !dv.car){ dv.inv = !dv.inv; try{ OS.prefs.set('rwInv', dv.inv); }catch(x){} toast(dv.inv ? 'Pitch inverted: push up = nose up.' : 'Pitch: pull back = nose up.'); e.preventDefault(); return true; }
      if(k === 'KeyT' && !dv.car){ taxiToRunway(); e.preventDefault(); return true; }
      if(k === 'KeyH'){ endDrive('home', 'Your ' + dv.m.name + ' is back at its parking spot.'); e.preventDefault(); return true; }
      return false;
    }
    const dz = v => Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9, ramp = (cur, tgt, dt, up, dn) => cur + clamp(tgt - cur, -dt * (Math.abs(tgt) < Math.abs(cur) ? dn : up), dt * (Math.abs(tgt) < Math.abs(cur) ? dn : up));
    /* keyboard + mouse + touch → one set of controls */
    function readDrive(dt, busy){
      const d = dv, k = busy ? {} : keys, tc = touch.on && !busy, key = (a, b) => (k[a] || k[b]) ? 1 : 0, lk = locked();
      if(lk && performance.now() - mouse.at > 160){ const f = Math.exp(-dt * 1.6); mouse.sx *= f; mouse.sy *= f; }
      const mx = busy ? 0 : dz(lk ? mouse.sx : (mouse.in ? mouse.px : 0)), my = busy ? 0 : dz(lk ? mouse.sy : (mouse.in ? mouse.py : 0)), sx = tc ? touch.mx : 0, sy = tc ? touch.mz : 0;
      const gas = !busy && (k.KeyW || k.ArrowUp && d.car || tb.gas || mouse.l || sy < -0.35), back = !busy && (k.KeyS || k.ArrowDown && d.car || tb.brake || mouse.rb || sy > 0.35 && d.car);
      const kRoll = key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft'), roll = kRoll || (Math.abs(sx) > 0.05 ? sx : mx);
      if(d.car) return { thr: (gas ? 1 : 0) - (back ? 1 : 0), steer: clamp(roll, -1, 1), brake: 0, hand: (!busy && (k.Space || k.ShiftLeft || tb.hand)) ? 1 : 0 };
      d.thr = clamp(d.thr + ((gas ? 1 : 0) - (back ? 1 : 0)) * dt * 0.45, 0, 1);
      const kPitch = key('ArrowDown', 'ArrowUp') ? (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0) : 0, raw = kPitch || (tc && Math.abs(sy) > 0.05 ? sy : my), pT = clamp(d.inv ? -raw : raw, -1, 1);
      d.pitchIn = kPitch ? ramp(d.pitchIn, pT * 0.75, dt, 1.3, 5) : pT;        // keys give up to 75 % of the stick, slowly: a held key cannot zoom the plane into a stall
      d.rollIn = kRoll ? ramp(d.rollIn, kRoll, dt, 3, 6) : clamp(roll, -1, 1);
      return { thr: d.thr, pitch: d.pitchIn, roll: d.rollIn, yaw: 0, brake: (!busy && (k.Space || tb.hand)) ? 1 : 0, rev: (back && d.thr <= 0.02 && d.s.onGround) ? 1 : 0, assist: true };   // S / Brake held with the throttle at idle on the ground = reverse (the plane backs up slowly)
    }
    function driveCamera(dt){
      const d = dv, s = d.s, c = d.cam, car = d.car, sp = Math.abs(s.speed), m = d.m, len = car ? m.drive.len : m.fly.len;
      c.fov = (cfg.fov + clamp(sp / (car ? 60 : 110), 0, 1) * (car ? 12 : 8)) * Math.PI / 180; d.shake = Math.max(0, d.shake - dt * 2.5); const sh = d.shake * 0.15;
      if(d.wreck){                                                                                 // the plane is gone: a slow orbit round the fireball, shaking with the blast
        const w = d.wreck, ang = s.yaw + Math.PI * 0.8 + w.t * 0.2, r = 26 + w.t * 3.5, gx = s.x + Math.sin(ang) * r, gz = s.z - Math.cos(ang) * r, js = (fx ? fx.shake : 0) * 0.5, gy = T.height(gx, gz);
        const px = gx + (Math.random() - 0.5) * js, py = Math.max(gy + 2.2, s.y + 7 - w.t) + (Math.random() - 0.5) * js, pz = gz, tx = s.x, ty = s.y + 3.5 + w.t * 1.2, tz = s.z, dx = tx - px, dy = ty - py, dzz = tz - pz;
        c.pos = [px, py, pz]; c.yaw = Math.atan2(dx, -dzz); c.pitch = Math.atan2(dy, Math.hypot(dx, dzz)); c.roll += (0 - c.roll) * (1 - Math.exp(-dt * 4)); c.fov = cfg.fov * Math.PI / 180; return;
      }
      if(d.view === 'cockpit'){
        let ex, ey, ez; if(car){ const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw); ex = s.x + sy * 0.25 + cy * -0.32; ez = s.z - cy * 0.25 + sy * -0.32; ey = s.y + 1.22; c.yaw = s.yaw; c.pitch = s.pitch * 0.6; c.roll = clamp(s.roll, -0.8, 0.8) * 0.4; }
        else { const B = s.B, up = 0.55 + m.fly.hgt * 0.62 + 0.55, fw = len * 0.14; ex = s.x + B.f[0] * fw + B.u[0] * up; ey = s.y + B.f[1] * fw + B.u[1] * up; ez = s.z + B.f[2] * fw + B.u[2] * up; c.yaw = s.yaw; c.pitch = s.pitch; c.roll = s.roll; }
        c.pos = [ex + (Math.random() - 0.5) * sh, ey + (Math.random() - 0.5) * sh, ez]; return;
      }
      d.cYaw = lerpA(d.cYaw, s.yaw, 1 - Math.exp(-dt * (car ? 4.5 : 3.2))); d.cPitch += ((car ? 0 : s.pitch * 0.7) - d.cPitch) * (1 - Math.exp(-dt * 3));
      const dist = car ? 5.4 + len * 0.45 + clamp(sp * 0.03, 0, 3) : 10 + len * 1.1 + clamp(sp * 0.04, 0, 7), cy = Math.cos(d.cYaw), sy = Math.sin(d.cYaw), cp = Math.cos(d.cPitch), spch = Math.sin(d.cPitch);
      const tx = s.x, ty = s.y + (car ? 1.2 : 1.6), tz = s.z, h = car ? 1.7 + dist * 0.05 : 2.4 + dist * 0.12;
      let px = tx - sy * cp * dist, py = ty - spch * dist + h, pz = tz + cy * cp * dist; py = Math.max(py, T.height(px, pz) + 0.8);
      const dx = tx - px, dy = ty - py, dzz = tz - pz; c.pos = [px + (Math.random() - 0.5) * sh, py + (Math.random() - 0.5) * sh, pz]; c.yaw = Math.atan2(dx, -dzz); c.pitch = Math.atan2(dy, Math.hypot(dx, dzz)); c.roll += ((car ? 0 : s.roll * 0.3) - c.roll) * (1 - Math.exp(-dt * 4));
    }
    const kmh = v => Math.round(Math.abs(v) * 3.6);
    function driveHint(d){
      const s = d.s, tc = touch.on, now = performance.now() - d.t0;
      if(d.wreck) return 'E or Esc — skip';
      if(d.engine === false) return 'Engine dead — hotwire it · Esc to climb out';
      if(d.car) return tc ? 'Stick steers · Gas / Brake · Exit' : 'W gas · S brake / reverse · A D steer · Space handbrake · V view · E get out · H back home · U unstuck';
      if(s.onGround) return tc ? 'Thr ▲ to full, then pull the stick down at ' + kmh(s.P.vr) + ' km/h · Brake at idle = reverse · Taxi = runway · Stuck? tap Unstuck' : 'W throttle up · hold S at idle to reverse · A D steer · pull back (↓) at ' + kmh(s.P.vr) + ' km/h · Space brakes · T runway · U unstuck · V view · E exit';
      return tc ? 'Stick: pitch + bank · Thr ▲▼ · land on the runway' : 'Mouse or ↑↓ pitch · A D bank · W S throttle · Space brakes · I invert · V view · H hangar';
    }
    function dash(t){
      if(t - dashAt < 100) return; dashAt = t; const d = dv, s = d.s; let h;
      if(d.wreck) h = '<div class="warn">CRASHED</div>';
      else if(d.car) h = (d.dmg >= 0.2 ? '<div class="warn">ENGINE ' + Math.round((1 - d.dmg) * 100) + '%</div>' : '') + '<div class="spd"><b>' + kmh(s.u) + '</b><small>km/h' + (s.u < -0.5 ? ' · R' : '') + '</small></div>';
      else { const warn = s.stallWarn ? '<div class="warn">STALL</div>' : (!s.onGround && s.alt < 70 && s.vy < -7 ? '<div class="warn">PULL UP</div>' : (s.onGround && s.speed > s.P.vr * 0.98 ? '<div class="ok">ROTATE</div>' : ''));
        h = warn + '<div class="row"><span>SPEED<b>' + kmh(s.ias) + '</b>' + (s.onGround && s.speed < -0.3 ? '<small>REVERSE</small>' : '') + '</span><span>ALT<b>' + Math.round(s.alt) + '</b></span><span>V/S<b>' + (s.vy >= 0 ? '+' : '') + s.vy.toFixed(1) + '</b></span></div><div class="thr"><i style="width:' + Math.round(d.thr * 100) + '%"></i><em>THROTTLE ' + Math.round(d.thr * 100) + '%</em></div>'; }
      h += '<div class="hint">' + esc(driveHint(d)) + '</div>'; if(h !== dashHtml){ dashHtml = h; $('#rwDash').innerHTML = h; }
    }
    function driveUpdate(dt, t, busy){
      const d = dv, s = d.s, q = d.q, inp = readDrive(dt, busy);
      if(d.car && d.dmg > 0.35){ if(inp.thr > 0 && d.dmg > 0.5) inp.thr *= Math.max(0, 1 - (d.dmg - 0.5) * 2); inp.steer = (inp.steer || 0) + d.pull * (d.dmg - 0.35) * 0.35; }   // a damaged car loses power and pulls to one side
      if(!d.hold && !d.wreck && d.engine !== false){
        const sets = collSets(), dis = cells.disabled(), world = { ground: T.height, lift: kerbLift, push: (x, z, y, r) => { const o = Phys.resolve(x, z, y, sets, dis, r); return { x: o.x, z: o.z }; } };
        const sx0 = s.x, sz0 = s.z;
        if(d.car) Dr.stepCar(s, inp, dt, world); else Dr.stepPlane(s, inp, dt, world);
        if(T.isWater(s.x, s.z)){                                                              // the sea: a car stops at the waterline; a plane that touches down on it ditches
          if(d.car){ s.x = sx0; s.z = sz0; s.u *= -0.15; s.v = 0; s.r = 0; if(t - d.edgeAt > 3000){ d.edgeAt = t; toast('The sea — turn around.'); } }
          else if(s.onGround && !s.crashed) s.crashed = 'You ditched in the sea.'; }
        if(s.hit > 4) d.shake = Math.max(d.shake, Math.min(1, s.hit / 14));
        const lim = d.car ? 9000 : 5200, r = Math.hypot(s.x, s.z);          // the invisible edge of the world (planes: well out to sea; cars are stopped by the shoreline instead)
        if(r > lim){ const nx = s.x / r, nz = s.z / r; s.x = nx * lim; s.z = nz * lim; if(d.car){ s.u *= 0.2; s.v *= 0.2; } else { const vo = s.vx * nx + s.vz * nz; if(vo > 0){ s.vx -= vo * nx; s.vz -= vo * nz; } }
          if(t - d.edgeAt > 4000){ d.edgeAt = t; toast('That is the edge of the map — turn around.'); } }
      }
      if(fx && d.car && !d.wreck){ if(s.hit > 2.5 && t - d.hitAt > 120){ d.hitAt = t; carHit(d, s.hit); carSmoke(d); } }
      q.x = s.x; q.z = s.z; q.yaw = s.yaw; q.y = s.y + (d.car ? 0.1 : 0.05); q.pitch = s.pitch; q.roll = s.roll;
      P.x = s.x; P.z = s.z; P.y = P.cy = s.y; P.vx = P.vz = P.vy = 0; P.inside = false; P.mv = 0; curNpc = curDoor = null; V.look = null;
      if(q.rentEnd && OS.now() >= q.rentEnd){ endDrive('home', 'Your rental ' + d.m.name + ' has been returned to the dealer — the day is up.'); return; }       // a 24 h rental ends even while you are at the wheel
      if(s.crashed && !d.car && fx && !d.wreck) startWreck(d);
      if(d.wreck){ d.wreck.t += dt; if(d.wreck.t > WRECK_S){ endDrive('crash', crashMsg(d, d.wreck.why)); return; } }
      else if(s.crashed){ endDrive('crash', crashMsg(d, s.crashed)); return; }
      driveCamera(dt); P.yaw = d.cam.yaw; P.pitch = 0;
      if(net) net.tick({ x: P.x, z: P.z, yaw: s.yaw, mv: clamp(Math.abs(s.speed) / cfg.run, 0, 1.2), inside: false }, dt);
      dash(t);
    }
    const homeRec = id => ((OS.homes.world && OS.homes.world()) || {})[id] || {};
    const me = () => OS.homes.uid && OS.homes.uid();

    /* ---------------- setup / teardown of the GPU side (created on first enter, freed on exit so a closed world costs nothing) ---------------- */
    function gpuUp(){
      if(gfx) return true; gfx = RW.GFX.create(cv, { aa: (() => { let s = null; try{ s = GP.read(OS.prefs.get('rwGfx'), OS.prefs.get('rwQuality')); }catch(e){} return !perfLow() && (!s || s.p !== 'custom' || !!s.o.aa); })() }); if(!gfx) return false; S.nh = nh(); S.nd = G.districtCount(S.nh); L.setup(S.nh); T.setup(L.radius()); scr = RW.Screens.manager(gfx); npcs = RW.NPC.create(G, L);
      st = RW.Streamer.create(gfx, { nh: S.nh, radius: perfLow() ? cfg.perfStart : cfg.startRadius, base: 'os/realworld/', skip: farSea }); initQuality(); gfx.onRestore = () => { st.free(); st = RW.Streamer.create(gfx, { nh: S.nh, radius: perfLow() ? cfg.perfStart : cfg.startRadius, skip: farSea }); initQuality(); };
      net = RW.Net.create(K); cells = RW.Cells.create(gfx); if(RW.FX){ fx = RW.FX.create(); fxA = new Float32Array(RW.FX.MAX * 8); fxD = new Float32Array(RW.FX.MAX * 8); } if(RW.Assets && !RW.Assets.tried){ RW.Assets.tried = true; RW.Assets.load('assets/world/').catch(() => {}); } return true;
    }
    function gpuDown(){ if(!gfx) return; try{ if(net) net.stop(); if(st) st.free(); if(scr) scr.clear(); if(cells) cells.clear(); if(dyn.plots) gfx.free(dyn.plots); if(dyn.marks) gfx.free(dyn.marks); ocean = null; gfx.destroy(); }catch(e){} if(fx) fx.clear(); if(flashEl){ flashEl.remove(); flashEl = null; flashO = 0; } fx = fxA = fxD = null; dmgMap.clear(); gfx = st = net = scr = npcs = cells = null; S.cell = null; S.room = null; S.busy = false; P.inside = false; closeDialog(true); dyn = { plots: null, marks: null, sig: '' }; const c2 = cv.cloneNode(false); cv.replaceWith(c2); }

    /* ---------------- spawn / travel ---------------- */
    const homePose = () => { const h = OS.homes.home && OS.homes.home(); if(!h || !h.g) return null; const p = RW.Nav.housePose(+String(h.id).slice(1)); return p ? Object.assign({ n: 'Home · ' + p.name }, p) : null; };
    function spawnPoint(){
      const sp = OS.prefs && OS.prefs.get && OS.prefs.get('rwPos'); if(sp && isFinite(sp.x) && isFinite(sp.z) && Math.hypot(sp.x, sp.z) < L.radius() + 200) return { x: sp.x, z: sp.z, yaw: sp.yaw || 0 };
      const h = homePose(); if(h) return h; return plazaPose();
    }
    const plazaPose = () => Object.assign({ n: 'Town Square' }, RW.Nav.plazaPose());
    const poiName = id => (G.POIS[id] && G.POIS[id].n) || id;
    async function teleport(x, z, yaw){ if(dv) endDrive(); fade(true); await sleep(280); if(!st) return; if(S.room){ if(cells) cells.clear(); S.room = null; S.cell = null; P.inside = false; if(scr) scr.set([]); } P.x = x; P.z = z; P.yaw = yaw || 0; P.vx = P.vz = P.vy = 0; P.y = P.cy = T.height(x, z); P.grounded = true; if(st) st.update(P.x, P.z); const t0 = performance.now(); while(!ringReady() && performance.now() - t0 < 4500){ await sleep(60); if(st) st.update(P.x, P.z); st && st.upload(3); } fade(false); }
    function ringReady(){ if(!st) return false; let n = 0, ok = 0; for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ n++; const c = st.chunks.get((Math.floor(P.x / 128) + i) + ',' + (Math.floor(P.z / 128) + j)); if(c && c.cur && c.lod <= 1) ok++; } return ok >= 8; }
    const fade = on => { $('#rwFade').classList.toggle('on', !!on); };

    /* ---------------- doors, plots, markers (things that depend on who owns what) ---------------- */
    function rebuildDyn(){
      const w = (OS.homes.world && OS.homes.world()) || {}, pl = (OS.homes.plots && OS.homes.plots()) || {}, my = me(); let sig = Object.keys(pl).map(u => u + (pl[u].l ? 'l' : '') + (pl[u].f ? 'f' : '')).join() + '|';
      const marks = []; st.chunks.forEach(c => c.doors.forEach(d => { if(d.k !== 'house') return; const r = w[d.id]; if(!r) return; const mine = r.o === my || r.t === my, sale = r.o === 'bank' || (r.a > 0 && r.o !== my); if(mine || sale){ marks.push({ d, mine }); sig += d.id + (mine ? 'm' : 's') + ','; } }));
      if(sig === dyn.sig) return; dyn.sig = sig; if(dyn.plots) gfx.free(dyn.plots); if(dyn.marks) gfx.free(dyn.marks); dyn.plots = dyn.marks = null; dynCols = []; dynColsA = null; dynDoors = [];
      const mb = new M.MB(2048); let any = false;
      Object.keys(pl).forEach(uid => ['l', 'f'].forEach(k => { if(!pl[uid][k]) return; const c = L.plotLot(k, uid); if(!c) return; any = true; const y = T.height(c.x, c.z) + 0.12, lab = k === 'l', h = lab ? 6 : 8, wall = lab ? '#bfe5e3' : '#dcc3ad', roof = lab ? '#4fb3ae' : '#8f6e5a', f = c.front, rx = -f[1], rz = f[0];
        mb.boxR(c.x, c.z, c.w / 2, c.d / 2, c.ang, y - 1, y + h, wall, roof); const dx = c.x + f[0] * (c.d / 2), dz = c.z + f[1] * (c.d / 2); mb.boxR(dx + f[0] * 0.04, dz + f[1] * 0.04, 1.1, 0.06, Math.atan2(f[1], f[0]) + Math.PI / 2, y, y + 2.6, '#3b3f48', '#3b3f48'); mb.boxR(dx + f[0] * 0.06, dz + f[1] * 0.06, 2.5, 0.06, Math.atan2(f[1], f[0]) + Math.PI / 2, y + h - 1.6, y + h - 0.6, lab ? [90, 230, 210] : [255, 170, 80], lab ? [90, 230, 210] : [255, 170, 80], 128);
        dynCols.push(0, c.x, c.z, c.w / 2 + 0.3, c.d / 2 + 0.3, Math.cos(c.ang), Math.sin(c.ang), y + h); dynDoors.push({ k: 'plot', kind: k, uid, x: c.x + f[0] * (c.d / 2 + 1.7), z: c.z + f[1] * (c.d / 2 + 1.7), nx: f[0], nz: f[1], y, bx: c.x, bz: c.z, rw: c.w, rd: c.d, bh: h }); }));
      dynColsA = dynCols.length ? Float32Array.from(dynCols) : null;
      if(any) dyn.plots = gfx.upload(mb.finish());
      if(marks.length){ const m2 = new M.MB(512); marks.forEach(({ d, mine }) => { const px = -d.nz, pz = d.nx, x = d.x + px * 2.4 + d.nx * 0.8, z = d.z + pz * 2.4 + d.nz * 0.8, y = d.y; m2.boxAA(x - 0.05, y, z - 0.05, x + 0.05, y + 3.6, z + 0.05, '#d8d8d8'); const c2 = mine ? [60, 210, 110] : [255, 210, 70]; m2.boxAA(x - 0.5, y + 2.2, z - 0.04, x + 0.5, y + 3.5, z + 0.04, c2, c2, 128); }); dyn.marks = gfx.upload(m2.finish()); }
    }
    const allDoorsNear = (x, z, r) => st.doorsNear(x, z, r).concat(dynDoors.filter(d => Math.hypot(d.x - x, d.z - z) < r));
    /* may the player walk into this door? → { key, kind, ctx } (landmarks: always; homes: yours or rented; plots: your own) */
    function cellSpec(d){
      const my = me();
      if(d.k === 'poi'){ const b = BUILDINGS[d.id]; return b ? { key: 'p:' + d.id, kind: b.kind, ctx: { name: d.name || b.name } } : null; }
      if(d.k === 'house'){ const r = homeRec(d.id); return (r.o === my || r.t === my) ? { key: 'h:' + d.id, kind: 'home', ctx: { w: d.w, dp: d.dp, beds: d.beds, type: d.type, name: d.addr, fl: d.fl }, own: r.o === my } : null; }
      if(d.k === 'plot' && d.uid === my){ const lab = d.kind === 'l'; return { key: 'x:' + d.kind, kind: lab ? 'plot-lab' : 'plot-factory', ctx: {}, name: lab ? 'laboratory' : 'factory' }; }
      return null;
    }
    function doorInfo(d){
      const sp = cellSpec(d); if(sp) return { label: d.k === 'poi' ? (d.name || (BUILDINGS[d.id] || {}).name) + ' · press E' : d.k === 'house' ? d.addr + (sp.own ? ' (yours)' : ' (rented)') + ' · press E' : 'Your ' + sp.name + ' · press E', enter: true, spec: sp };
      if(d.k === 'house'){ const r = homeRec(d.id), sale = r.o === 'bank' || r.a > 0, who = r.o === 'bank' ? 'City-owned' : r.on ? 'Owned by ' + r.on : 'Private'; return { label: d.addr + ' · ' + d.type + ' · ' + who + (sale ? ' · for sale — E to view' : ' · locked'), go: () => sale ? OS.open('RealEstate') : toast('This home is private.') }; }
      if(d.k === 'plot'){ const lab = d.kind === 'l'; return { label: 'Private ' + (lab ? 'laboratory' : 'factory'), go: () => toast('Only the owner can go in.') }; }
      return null;
    }

    /* ---------------- interiors: seamless cells (see cells.js) ---------------- */
    /* build the inside of every enterable building within ~32 m (one per tick, so a frame never stalls), drop the ones you left (> 62 m). A closed building far away costs nothing. */
    /* INTERIORS ARE SEPARATE ROOMS: E at a door → quick fade → the room (built by interiors.js for that building kind/house type) stands in an empty pocket far from the city (RX,RZ), so it can never clip the outside.
     * Leave by walking out of the doorway or pressing E near it → fade → back on the street at the door. The street keeps streaming around the door meanwhile. */
    const RX = 30000, RZ = 30000;
    function cellsUpdate(){
      const c = S.room ? S.room.cell : null; if(c === S.cell) return; S.cell = c; P.inside = !!c; closeDialog(true); scr.set(c ? c.screens : []);
      if(c){ const nm = $('#rwLoc'); nm.textContent = c.name; nm.classList.add('show'); clearTimeout(nm._t); nm._t = setTimeout(() => nm.classList.remove('show'), 2600); } hudLoc = '';
    }
    async function enterRoom(d, sp){
      if(S.busy || S.room || !cells) return; S.busy = true; fade(true); await sleep(280); if(!cells){ S.busy = false; return; }
      cells.clear(); const gy = 0, door = { x: RX, z: RZ, nx: 0, nz: 1, y: gy }, c = cells.ensure('in:' + sp.key, sp.kind, sp.ctx, door);
      if(!c){ toast('Could not open this building.'); fade(false); S.busy = false; return; }
      S.room = { cell: c, door, gy, ret: { x: d.x, z: d.z, nx: d.nx, nz: d.nz, y: d.y }, sx: P.x, sz: P.z }; P.x = RX; P.z = RZ - 3.2; P.y = P.cy = gy + 0.1; P.vx = P.vz = P.vy = 0; P.yaw = 0; P.pitch = 0; P.grounded = true; cellsUpdate();
      await sleep(120); fade(false); S.busy = false;
    }
    async function exitRoom(){
      if(S.busy || !S.room) return; S.busy = true; fade(true); await sleep(280); const r = S.room.ret; if(cells) cells.clear(); S.room = null; S.cell = null; P.inside = false; if(scr) scr.set([]);
      P.x = r.x; P.z = r.z; P.vx = P.vz = P.vy = 0; P.y = P.cy = T.height(P.x, P.z); P.yaw = Math.atan2(r.nx, -r.nz); P.pitch = 0; P.grounded = true; hudLoc = ''; if(st) st.update(P.x, P.z);
      await sleep(120); fade(false); S.busy = false;
    }

    /* ---------------- collisions: see phys.js (boxes with a height, stairs, floors, ceilings) ---------------- */
    /* KERBS for the car physics: pavement sits 11.5 cm above the asphalt (see chunkgen). A spatial hash of the streets near the player (rebuilt when they move 150 m) answers "how high is the kerb at (x, z)" — 0 on the road and at junctions, 0.115 on the pavement strip beside it. */
    const KB = { cx: 1e9, cz: 1e9, g: new Map() }, KC = 24;
    function kerbBuild(cx, cz){
      KB.cx = cx; KB.cz = cz; KB.g.clear(); let segs = []; try{ segs = L.streetsNear(cx - 300, cz - 300, cx + 300, cz + 300); }catch(e){}
      for(const sg of segs){ const len = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]), n = Math.max(2, Math.ceil(len / 10)); let pp = null;
        for(let q = 0; q <= n; q++){ const u = sg.a[0] + (sg.b[0] - sg.a[0]) * q / n, v = sg.a[1] + (sg.b[1] - sg.a[1]) * q / n, w = L.warp(u, v), p = [w[0], w[1], q * len / n];
          if(pp){ const pc = { x0: pp[0], z0: pp[1], x1: p[0], z1: p[1], hw: sg.hw, edge: pp[2] < 9 || p[2] > len - 9, pad: sg.hw + L.SIDE }, mnx = Math.min(pc.x0, pc.x1) - pc.pad, mxx = Math.max(pc.x0, pc.x1) + pc.pad, mnz = Math.min(pc.z0, pc.z1) - pc.pad, mxz = Math.max(pc.z0, pc.z1) + pc.pad;
            for(let gx = Math.floor(mnx / KC); gx <= Math.floor(mxx / KC); gx++) for(let gz = Math.floor(mnz / KC); gz <= Math.floor(mxz / KC); gz++){ const key = gx + ',' + gz; let a = KB.g.get(key); if(!a) KB.g.set(key, a = []); a.push(pc); } }
          pp = p; } }
    }
    function kerbLift(x, z){
      if(S.room || Math.abs(x - KB.cx) > 150 || Math.abs(z - KB.cz) > 150) kerbBuild(x, z); const a = KB.g.get(Math.floor(x / KC) + ',' + Math.floor(z / KC)); if(!a) return 0; let kerb = 0;
      for(const c of a){ const dx = c.x1 - c.x0, dz = c.z1 - c.z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - c.x0) * dx + (z - c.z0) * dz) / l2)), d = Math.hypot(x - (c.x0 + dx * t), z - (c.z0 + dz * t)); if(d < c.hw) return 0; if(d < c.pad && !c.edge) kerb = 0.115; }
      return kerb;
    }
    const collSets = () => { const sets = []; if(!S.room){ st.nearCols(P.x, P.z, c => sets.push({ a: c, st: 8 })); if(dynColsA) sets.push({ a: dynColsA, st: 8 }); if(V.cols) sets.push({ a: V.cols, st: 8 }); const cc = crime.cols(); if(cc) sets.push({ a: cc, st: 8 }); } if(S.room){ const cs = cells.sets(); for(let i = 0; i < cs.length; i++) sets.push(cs[i]); } return sets; };

    /* ---------------- people & cars ---------------- */
    async function loadBots(){ try{ const m = await (RW.botSource ? RW.botSource() : OS.homes.bots()); botList = Object.keys(m || {}).map(id => { const r = m[id], n = +id.slice(1); return { id, n, b: { n, job: r.j || 'baker', thrift: typeof r.th === 'number' ? r.th : 0.5 }, home: r.h ? G.house(+String(r.h).slice(1)) : null, shirt: pack(hsl(G.h32(n, 19) % 360, 55, 52)), pants: pack(hsl(G.h32(n, 21) % 360, 30, 24)), init: 0, x: 0, z: 0, tx: 0, tz: 0, vx: 0, vz: 0, yaw: 0, ph: 0, mv: 0, vis: false, t: 0 }; }); }catch(e){} }
    function stepNPCs(t, dt){
      if(t - npcAt >= 100){ const now = OS.now(), nhh = S.nh; npcAt = t; for(const q of botList){ let s; try{ s = npcs.state(q.b, q.home, now, nhh); }catch(e){ continue; } const dtt = Math.max(0.05, (t - q.t) / 1000);
        if(!q.init){ q.init = 1; q.vx = q.vz = 0; q.yaw = s.yaw; } else { q.vx += ((s.x - q.tx) / dtt - q.vx) * 0.6; q.vz += ((s.z - q.tz) / dtt - q.vz) * 0.6; } q.tx = s.x; q.tz = s.z; q.t = t; q.moving = s.moving; q.why = s.why; q.dest = s.dest; if(!s.moving){ q.vx = q.vz = 0; } } }
      for(const q of botList){ if(!q.init){ q.vis = false; continue; } const e = Math.min(0.25, (t - q.t) / 1000); q.x = q.tx + q.vx * e; q.z = q.tz + q.vz * e; const sp = Math.hypot(q.vx, q.vz); q.sp = sp; q.vis = !!q.moving; if(sp > 0.4){ q.yaw += wrapA(Math.atan2(q.vx, -q.vz) - q.yaw) * Math.min(1, dt * 8); } q.mv = clamp(sp / 4, 0, 1.3); q.ph += dt * sp * 2.4; q.isCar = q.vis && (q.isCar ? sp > 5 : sp > 8); }
      npcCars(dt);
    }
    /* ---- NPC drivers: every car within NCP_R m of you is a real drive.js car (the same tyre / suspension model as yours and the cops') steered at its timetable position, so it brakes, dives, leans
     * and bumps over kerbs like yours does. The TIMETABLE stays the truth (same place for every client): the physical car only chases it, and snaps back if it ever falls > 30 m behind.
     * Beyond NCP_R it is the old kinematic car (nobody can tell at that distance). Not solid: NPC cars still pass through parked cars and you (the street plan keeps them on roads). ---- */
    const NCP_R = 140, NCP_MAX = 40;
    function npcCars(dt){
      if(!Dr || !VD || S.room){ for(const q of botList) q.cs = null; return; } let n = 0; const world = { ground: T.height, lift: kerbLift }, pool = VD.CARS;
      for(const q of botList){
        if(!q.isCar || q.sp < 2 || n >= NCP_MAX || (q.x - P.x) ** 2 + (q.z - P.z) ** 2 > NCP_R * NCP_R){ q.cs = null; continue; } n++;
        let c = q.cs; const yaw = Math.atan2(q.vx, -q.vz);
        if(!c || Math.hypot(c.s.x - q.x, c.s.z - q.z) > 30 || c.s.u < -1){ const m = pool[G.h32(q.n, 31) % Math.min(pool.length, 4)], s = Dr.car(m, { x: q.x, z: q.z, yaw }); s.y = T.height(q.x, q.z); s.u = q.sp; c = q.cs = { s, get x(){ return s.x; }, get z(){ return s.z; }, get y(){ return s.y; }, get yaw(){ return s.yaw; }, get pitch(){ return s.pitch; }, get roll(){ return s.roll; } }; }
        Dr.stepCar(c.s, Dr.followInputs(c.s, { x: q.x, z: q.z, vx: q.vx, vz: q.vz, sp: q.sp }), dt, world);
      }
    }
    const outLine = q => { const w = G.WHY[q.why] || 'out and about'; return ['Hello! I am ' + w + '.', 'Lovely day in WestCountry, isn\u2019t it?', q.dest ? 'I am heading to ' + q.dest + '.' : 'Just passing through.'][G.h32(q.n, Math.floor(OS.now() / 30000)) % 3]; };
    /* Kenney people + cars (assets/world/manifest.json, loaded by glb.js). People: each character model is its own instanced actor kind ('person0'…), picked per person by their colour seed so a
     * person always looks the same; the walk cycle is the same vertex shader (limb pivots come from the manifest). Cars: each model is an instanced prop (near mesh within CAR_NEAR m, the
     * lighter one beyond). Without models both fall back to the procedural 'person' / 'car'. */
    const PL = { names: [], bufs: [], rev: -1 }, CARS = { h: new Map(), bufs: [], rev: -1 }, CAR_NEAR = 90;
    function ensureModels(){ const Pr = RW.Props; if(!Pr || PL.rev === Pr.rev) return; PL.rev = Pr.rev;
      PL.names = Pr.people.map((p, i) => { gfx.setActorModel('person' + i, p.m, Pr.pivot); return 'person' + i; }); PL.bufs = PL.names.map(() => ({ a: new Float32Array(8 * 64), n: 0 }));
      CARS.h.forEach(h => gfx.propFree(h)); CARS.h = new Map(); CARS.bufs = Pr.cars.flatMap(() => [{ a: new Float32Array(8 * 32), n: 0 }, { a: new Float32Array(8 * 32), n: 0 }]); }
    const push8 = (b, src, o) => { if(b.n * 8 + 8 > b.a.length){ const na = new Float32Array(b.a.length * 2); na.set(b.a); b.a = na; } b.a.set(src.subarray(o, o + 8), b.n++ * 8); };
    function drawPeople(buf, n){ const nv = PL.names.length; if(!nv){ gfx.actors('person', buf, n); return; } PL.bufs.forEach(b => { b.n = 0; });
      for(let i = 0; i < n; i++) push8(PL.bufs[Math.abs(buf[i * 8 + 6] | 0) % nv], buf, i * 8); PL.bufs.forEach((b, v) => { if(b.n) gfx.actors(PL.names[v], b.a, b.n); }); }
    function drawCars(buf, n){ const cs = RW.Props.cars, nv = cs.length; if(!nv){ gfx.actors('car', buf, n); return; } CARS.bufs.forEach(b => { b.n = 0; }); const px = P.x, pz = P.z, tmp = new Float32Array(8);
      for(let i = 0; i < n; i++){ const o = i * 8, v = Math.abs(buf[o + 7] | 0) % nv, dx = buf[o] - px, dz = buf[o + 2] - pz; tmp[0] = buf[o]; tmp[1] = buf[o + 1]; tmp[2] = buf[o + 2]; tmp[3] = buf[o + 3]; tmp[4] = 1; tmp[5] = 0xffffff; tmp[6] = buf[o + 4]; tmp[7] = buf[o + 5]; push8(CARS.bufs[v * 2 + (dx * dx + dz * dz > CAR_NEAR * CAR_NEAR ? 1 : 0)], tmp, 0); }
      CARS.bufs.forEach((b, k) => { if(!b.n) return; const m = cs[k >> 1][(k & 1) ? 'm1' : 'm0']; let h = CARS.h.get(m); if(!h){ h = gfx.propUpload(m); CARS.h.set(m, h); } gfx.props(h, b.a, b.n, true, cfg.carRange * 0.85, cfg.carRange, true); }); }
    function fillActors(){
      let np = 0, nc = 0; const px = P.x, pz = P.z, put = (buf, i, x, y, z, yaw, ph, mv, sh, pa) => { const o = i * 8; buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = yaw; buf[o + 4] = ph; buf[o + 5] = mv; buf[o + 6] = sh; buf[o + 7] = pa; };
      const grow = (buf, n) => (n * 8 + 8 > buf.length) ? (() => { const b = new Float32Array(buf.length * 2); b.set(buf); return b; })() : buf;
      lookNpc = null; let best = 0.985; const fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch);
      for(const q of botList){ if(!q.vis) continue; const dx = q.x - px, dz = q.z - pz, d2 = dx * dx + dz * dz, car = q.isCar; if(d2 > (car ? cfg.carRange : cfg.npcRange) ** 2) continue; const y = T.height(q.x, q.z) + (car ? 0.1 : 0);
        if(car){ carBuf = grow(carBuf, nc); const c = q.cs; if(c) put(carBuf, nc++, c.x, c.y + 0.1, c.z, c.yaw, c.pitch, c.roll, q.shirt, q.pants); else put(carBuf, nc++, q.x, y, q.z, q.yaw, 0, 0, q.shirt, q.pants); } else { actorBuf = grow(actorBuf, np); put(actorBuf, np++, q.x, y, q.z, q.yaw, q.ph, q.mv, q.shirt, q.pants); }
        if(d2 < 400){ const d = Math.sqrt(d2), dot = (dx * fx + dz * fz + (y + 1.2 - (P.y + cfg.eye)) * fy) / d; if(dot > best){ best = dot; lookNpc = q; } } }
      if(net) net.others.forEach(o => { if(o.inside) return; const dx = o.x - px, dz = o.z - pz; if(dx * dx + dz * dz > cfg.npcRange ** 2) return; const h = G.h32(G.hash(o.uid), 5) % 360; actorBuf = grow(actorBuf, np); put(actorBuf, np++, o.x, T.height(o.x, o.z), o.z, o.yaw, o.ph, o.mv, pack(hsl(h, 70, 50)), pack(hsl(h, 20, 25))); });
      return [np, nc];
    }
    /* the clerks of the cell you are standing in (drawn with indoor lighting) */
    function fillInside(){ let n = 0; if(S.cell) S.cell.npcs.forEach(q => { if(n * 8 + 8 > inBuf.length){ const b = new Float32Array(inBuf.length * 2); b.set(inBuf); inBuf = b; } const o = n++ * 8; inBuf[o] = q.x; inBuf[o + 1] = q.y; inBuf[o + 2] = q.z; inBuf[o + 3] = q.yaw; inBuf[o + 4] = 0; inBuf[o + 5] = 0; inBuf[o + 6] = pack(M.rgb(q.shirt)); inBuf[o + 7] = pack(M.rgb(q.pants)); }); return n; }

    /* ---------------- HUD ---------------- */
    function project(x, y, z){ const m = gfx.vp, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if(cw < 0.3) return null; return [(cx / cw * 0.5 + 0.5) * cv.clientWidth, (1 - (cy / cw * 0.5 + 0.5)) * cv.clientHeight, cw]; }
    function labels(){
      const list = []; if(S.mode === 'world' && net) net.others.forEach(o => { if(o.inside) return; const d = Math.hypot(o.x - P.x, o.z - P.z); if(d < 38) list.push({ x: o.x, y: T.height(o.x, o.z) + 2.05, z: o.z, t: o.n, c: 'pl', d }); });
      if(S.mode === 'world') Object.keys(BUILDINGS).forEach(id => { const p = L.poi(id); if(!p) return; const d = Math.hypot(p.x - P.x, p.z - P.z); if(d < 140 && d > 6){ const S2 = BG.landmark(id); list.push({ x: p.x, y: T.height(p.x, p.z) + (S2 ? S2.h : 12) + 2.5, z: p.z, t: poiName(id), c: 'poi', d }); } });
      list.sort((a, b) => a.d - b.d); const n = Math.min(list.length, 14); while(labelPool.length < n){ const e = document.createElement('div'); labelsEl.appendChild(e); labelPool.push(e); }
      for(let i = 0; i < labelPool.length; i++){ const e = labelPool[i]; if(i >= n){ e.style.display = 'none'; continue; } const l = list[i], p = project(l.x, l.y, l.z); if(!p){ e.style.display = 'none'; continue; } e.style.display = 'block'; if(e._t !== l.t || e._c !== l.c){ e.textContent = l.t; e.className = 'rw-lab ' + l.c; e._t = l.t; e._c = l.c; } e.style.transform = `translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px) translate(-50%,-100%)`; e.style.opacity = l.c === 'poi' ? clamp(1.3 - l.d / 140, 0.25, 1) : 1; }
    }
    /* COMPASS (top centre). The heading scrolls under the fixed marker (0° = north = −Z, 90° = east). On the strip, placed by bearing: LANDMARKS (dark badge, gold glyph) and everything YOU OWN
     * (solid badge): your home / houses, laboratory + factory plots, cars, planes. The marker closest to the centre is named under the strip with its distance. Redrawn only when the heading,
     * your position or the list of markers changes. EXTEND: LM (landmark id → glyph), CPAL (colours), GL (glyph drawings, a 12×12 box around 0,0), compassItems() (what is listed). */
    const cc = $('#rwCompassC'), cx2 = cc.getContext('2d'), cLbl = $('#rwCompassLbl');
    let compassYaw = 1e9, compassIn = null, cPx = 1e9, cPz = 1e9, cItemsAt = -1e9, cRev = 0, cSeen = -1, cSig = '', cItems = [], cLblTxt = '';
    const DIRS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const CSPAN = 150, CPAL = { poi: '#ffd24a', house: '#5bd68a', flask: '#4fd6c8', factory: '#ff9a4a', car: '#7ec8ff', plane: '#b9a4ff' };
    const LM = { bank: 'bank', exchange: 'chart', shop: 'bag', arcade: 'pad', agency: 'key', hall: 'hall', uni: 'cap', lab: 'flask', ind: 'factory', plant: 'bolt', park: 'tree', dealer: 'car', airport: 'plane', police: 'shield' };
    const poly = (c, a) => { c.beginPath(); c.moveTo(a[0], a[1]); for(let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); c.closePath(); c.fill(); };
    const line = (c, w, a) => { c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); for(let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); c.stroke(); };
    const GL = {
      house: c => { poly(c, [-6.5, 0.5, 0, -6, 6.5, 0.5]); c.fillRect(-4.6, 0.5, 9.2, 5.6); }, building: c => { c.fillRect(-4.5, -6, 9, 12); },
      bank: c => { poly(c, [-6.5, -2, 0, -6.5, 6.5, -2]); c.fillRect(-5, -1, 2, 6); c.fillRect(-1, -1, 2, 6); c.fillRect(3, -1, 2, 6); c.fillRect(-6.5, 5, 13, 1.6); },
      chart: c => { line(c, 2.2, [-6, 5, -2, 0, 1, 3, 6, -5]); }, bag: c => { poly(c, [-5, -2, 5, -2, 6, 6, -6, 6]); c.lineWidth = 1.7; c.beginPath(); c.arc(0, -2, 3, Math.PI, 0); c.stroke(); },
      pad: c => { c.fillRect(-6, 2, 12, 3.6); line(c, 2, [0, 2, 0, -3.5]); c.beginPath(); c.arc(0, -5, 2.4, 0, TAU); c.fill(); },
      shield: c => { c.beginPath(); c.moveTo(-5, -5); c.lineTo(5, -5); c.lineTo(5, 1); c.quadraticCurveTo(5, 5, 0, 7); c.quadraticCurveTo(-5, 5, -5, 1); c.closePath(); c.fill(); }, hall: c => { c.beginPath(); c.arc(0, 1, 5.6, Math.PI, 0); c.fill(); c.fillRect(-6.5, 1.6, 13, 1.8); c.fillRect(-5.2, 3.8, 10.4, 2.2); }, cap: c => { poly(c, [0, -5.5, 7, -1.5, 0, 2.5, -7, -1.5]); c.fillRect(-3.6, 1.6, 7.2, 3.8); },
      flask: c => { poly(c, [-1.9, -6.5, 1.9, -6.5, 1.9, -1.5, 6.2, 5.8, -6.2, 5.8, -1.9, -1.5]); }, factory: c => { poly(c, [-6.5, 1, -6.5, -3, -2.2, 1, -2.2, -3, 2.2, 1, 2.2, -3, 6.5, 1]); c.fillRect(-6.5, 1, 13, 5); c.fillRect(3.6, -6.5, 2.3, 5); },
      bolt: c => { poly(c, [1.6, -7, -4.6, 1, -0.6, 1, -1.6, 7, 4.6, -1.6, 0.6, -1.6]); }, tree: c => { c.beginPath(); c.arc(0, -2, 4.8, 0, TAU); c.fill(); c.fillRect(-0.9, 1, 1.8, 5.6); },
      key: c => { c.beginPath(); c.arc(-2.6, -2.6, 3.2, 0, TAU); c.lineWidth = 2; c.stroke(); line(c, 2, [-0.2, -0.2, 6, 6]); line(c, 1.8, [3.6, 3.6, 5.4, 1.9]); },
      car: c => { poly(c, [-6.6, 2.4, -6.6, -0.8, -4, -1, -2.6, -4.6, 2.6, -4.6, 4, -1, 6.6, -0.8, 6.6, 2.4]); c.beginPath(); c.arc(-3.6, 3.2, 2, 0, TAU); c.arc(3.6, 3.2, 2, 0, TAU); c.fill(); },
      plane: c => { poly(c, [0, -7.2, 1.5, -2.2, 7.2, 2, 7.2, 3.6, 1.4, 1.8, 1, 5, 3, 6.4, 3, 7.4, 0, 6.6, -3, 7.4, -3, 6.4, -1, 5, -1.4, 1.8, -7.2, 3.6, -7.2, 2, -1.5, -2.2]); },
      star: c => { const a = []; for(let i = 0; i < 10; i++){ const r = i % 2 ? 2.7 : 6.6, t = -Math.PI / 2 + i * Math.PI / 5; a.push(Math.cos(t) * r, Math.sin(t) * r); } poly(c, a); }
    };
    const dirName = hd => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(hd / 45) % 8];
    const distText = d => d < 100 ? Math.round(d) + ' m' : d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km';
    /* the list of markers (rebuilt about once a second: positions only change when you buy / sell / move house). Never throws: a missing piece just leaves its markers out. */
    function compassItems(){
      const out = [], my = me(), H = OS.homes; let homeRec2 = null, homeG = null;
      try{ Object.keys(LM).forEach(id => { const p = L.poi(id); if(p) out.push({ k: 'poi', g: LM[id], x: p.x, z: p.z, name: poiName(id), own: false }); }); const pc = L.content(0, 0); if(pc) out.push({ k: 'poi', g: 'star', x: pc.cx, z: pc.cz, name: 'Town Square', own: false }); }catch(e){}
      if(my){
        const house = (id, label, home) => { try{ const h = L.house(+String(id).slice(1)); if(!h || !h.g) return null; let ad = ''; try{ const w = G.house(+String(id).slice(1)); ad = w && w.addr ? ' · ' + w.addr : ''; }catch(e){} out.push({ k: 'house', g: 'house', x: h.g.x, z: h.g.y, name: label + ad, own: true, home }); return h.g; }catch(e){ return null; } };
        try{ homeRec2 = H.home && H.home(); if(homeRec2) homeG = house(homeRec2.id, homeRec2.owned ? 'Your home' : 'Rented home', true); }catch(e){}
        try{ (H.mine && H.mine() || []).forEach(h => { if(!homeRec2 || h.id !== homeRec2.id) house(h.id, 'Your house', false); }); }catch(e){}
        try{ const mine = ((H.plots && H.plots()) || {})[my] || {}; ['l', 'f'].forEach(k => { if(!mine[k]) return; const c = L.plotLot(k, my); if(c) out.push({ k: 'plot' + k, g: k === 'l' ? 'flask' : 'factory', x: c.x, z: c.z, name: k === 'l' ? 'Your laboratory' : 'Your factory', own: true }); }); }catch(e){}
        try{ vehicleItems(out, homeG); }catch(e){}
      }
      const sig = out.map(i => i.k + i.name + i.n + ':' + Math.round(i.x) + ',' + Math.round(i.z)).join('|'); if(sig !== cSig){ cSig = sig; cRev++; } cItems = out;
    }
    /* cars + planes: where they stand (vehicles.js: kerb at home, the dealer's lot, the airport row) when this city has those sites; otherwise cars count as parked at your home and planes at the airport (if there is one). Close ones merge into one marker with a count. */
    function vehicleItems(out, homeG){
      const H = OS.homes, gar = (H.garage && H.garage()) || []; if(!gar.length) return; const VDc = H.vehicleCatalogue && H.vehicleCatalogue(), nm = id => { const m = VDc && VDc.get && VDc.get(id); return m ? m.name : 'vehicle'; };
      let list = null; try{ if(root.RWVehicles) list = root.RWVehicles.owned(gar, homeG); }catch(e){ list = null; }
      if(!list || !list.length){ const ap = L.poi('airport'); list = []; gar.forEach(g => { const pl = g.model && g.model.kind === 'plane'; if(pl && ap) list.push({ id: g.m, kind: 'plane', x: ap.x, z: ap.z, where: 'airport' }); else if(!pl && homeG) list.push({ id: g.m, kind: 'car', x: homeG.x, z: homeG.y, where: 'home' }); }); }
      const cl = []; list.forEach(v => { const kind = v.kind === 'plane' ? 'plane' : 'car'; let c = cl.find(q => q.kind === kind && Math.hypot(q.x - v.x, q.z - v.z) < 40); if(c){ c.n++; c.sx += v.x; c.sz += v.z; } else cl.push({ kind, id: v.id, where: v.where, x: v.x, z: v.z, sx: v.x, sz: v.z, n: 1 }); });
      cl.forEach(c => { const w = c.where === 'home' ? ' · at home' : c.where === 'airport' ? ' · at the airport' : c.where === 'dealer' ? ' · at the dealership' : ''; out.push({ k: c.kind, g: c.kind, x: c.sx / c.n, z: c.sz / c.n, n: c.n, own: true, name: c.n > 1 ? 'Your ' + (c.kind === 'plane' ? 'planes' : 'cars') + ' ×' + c.n + w : 'Your ' + nm(c.id) + w }); });
    }
    function compass(t){
      const w = cc.clientWidth, h = cc.clientHeight; if(!w || !h) return; const dpr = Math.min(2, window.devicePixelRatio || 1), pw = Math.round(w * dpr), ph = Math.round(h * dpr), inside = !!S.cell, yaw = P.yaw;
      if(t - cItemsAt > 1000){ cItemsAt = t; compassItems(); }
      const resized = cc.width !== pw || cc.height !== ph;
      if(!resized && Math.abs(yaw - compassYaw) < 0.0015 && compassIn === inside && cSeen === cRev && Math.hypot(P.x - cPx, P.z - cPz) < 0.35) return;
      if(resized){ cc.width = pw; cc.height = ph; } compassYaw = yaw; compassIn = inside; cSeen = cRev; cPx = P.x; cPz = P.z;
      const c = cx2, ppd = w / CSPAN, hd = ((yaw * 180 / Math.PI) % 360 + 360) % 360, mid = w / 2; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineCap = c.lineJoin = 'round';
      /* the tape: ticks every 5°, numbers every 15°, letters at the eight directions */
      c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 3;
      for(let a = Math.floor((hd - CSPAN / 2) / 5) * 5; a <= hd + CSPAN / 2 + 5; a += 5){
        const x = mid + (a - hd) * ppd, d = ((a % 360) + 360) % 360, name = DIRS[d];
        if(name){ const main = name.length === 1; c.fillStyle = d === 0 ? '#ff6a5a' : '#fff'; c.font = (main ? '800 16px' : '700 12px') + ' system-ui,sans-serif'; c.fillText(name, x, h - 15); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(x - 1, h - 7, 2, 6); }
        else if(d % 15 === 0){ c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '600 10px system-ui,sans-serif'; c.fillText(String(d), x, h - 15); c.fillRect(x - 0.75, h - 7, 1.5, 5); }
        else { c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 0.5, h - 5, 1, 3); }
      }
      c.shadowBlur = 0;
      /* the markers (not inside a building: the street positions mean nothing there) */
      let focus = null, fx = 1e9;
      if(!inside){
        const cand = []; for(const it of cItems){ const dx = it.x - P.x, dz = it.z - P.z, dist = Math.hypot(dx, dz); if(dist < 5) continue; const rel = ((Math.atan2(dx, -dz) * 180 / Math.PI - hd + 540) % 360) - 180; if(Math.abs(rel) > CSPAN / 2 + 8) continue; cand.push({ it, dist, sx: mid + rel * ppd }); }
        cand.sort((a, b) => (b.it.own - a.it.own) || (a.dist - b.dist)); const placed = [], GAP = 23, cy = 11;
        for(const q of cand){ const free = x => !placed.some(p => Math.abs(p.sx - x) < GAP); if(free(q.sx)){ placed.push(q); continue; } if(!q.it.own) continue; for(const k of [1, -1, 2, -2]){ const x = q.sx + k * GAP; if(x > 14 && x < w - 14 && free(x)){ q.sx = x; placed.push(q); break; } } }   // yours step aside for each other; landmarks just yield
        placed.sort((a, b) => (a.it.own - b.it.own) || (b.dist - a.dist));            // yours are drawn last, on top
        for(const q of placed){ const ax = Math.abs(q.sx - mid); if(ax < fx && ax < 13){ fx = ax; focus = q; } }
        for(const q of placed){ const it = q.it, col = it.own ? (CPAL[it.g] || CPAL.poi) : CPAL.poi, on = q === focus, r = (it.own ? 10 : 9) * (on ? 1.14 : 1); c.save(); c.translate(q.sx, cy); c.globalAlpha = it.own ? 1 : clamp(1.15 - q.dist / 700, 0.62, 1);
          c.beginPath(); c.arc(0, 0, r, 0, TAU); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 4; c.fillStyle = it.own ? col : 'rgba(22,17,12,.82)'; c.fill(); c.shadowBlur = 0; c.lineWidth = it.own ? 1.6 : 1.4; c.strokeStyle = on ? '#fff' : it.own ? 'rgba(255,255,255,.85)' : col; c.stroke();
          c.scale(r / 9.5 * 0.82, r / 9.5 * 0.82); c.fillStyle = c.strokeStyle = it.own ? '#14100c' : col; (GL[it.g] || GL.building)(c); c.restore();
          if(it.n > 1){ c.save(); c.font = '800 10px system-ui,sans-serif'; c.fillStyle = '#14100c'; c.beginPath(); c.arc(q.sx + 8, cy + 8, 5.6, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.fillStyle = '#14100c'; c.fillText(String(it.n), q.sx + 8, cy + 8.5); c.restore(); } }
      }
      /* caption under the strip: your heading, and the marker you are facing */
      const txt = dirName(hd) + ' ' + Math.round(hd) + '°' + (focus ? '|' + focus.it.name + ' · ' + distText(focus.dist) + '|' + (focus.it.own ? (CPAL[focus.it.g] || CPAL.poi) : CPAL.poi) : '');
      if(txt !== cLblTxt){ cLblTxt = txt; const pt = txt.split('|'); cLbl.innerHTML = '<span class="d">' + esc(pt[0]) + '</span>' + (pt[1] ? '<span class="t" style="color:' + pt[2] + '">' + esc(pt[1]) + '</span>' : ''); }
    }
    const mm = $('#rwMap').getContext('2d'); let mmAt = 0;
    function minimap(t){
      if(t - mmAt < 160) return; mmAt = t; const W = 168, c = mm; c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(84, 84, 82, 0, TAU); c.clip(); c.fillStyle = 'rgba(20,24,20,.72)'; c.fillRect(0, 0, W, W); const sc = 0.62; c.translate(84, 84); c.rotate(-P.yaw); c.scale(sc, sc);
      if(S.mode === 'world' && st){ c.fillStyle = 'rgba(190,190,200,.55)'; st.nearCols(P.x, P.z, cols => { for(let i = 0; i < cols.length; i += 8){ if(cols[i] === 1) continue; const dx = cols[i + 1] - P.x, dz = cols[i + 2] - P.z; if(dx * dx + dz * dz > 14000) continue; c.save(); c.translate(dx, dz); c.rotate(Math.atan2(cols[i + 6], cols[i + 5])); c.fillRect(-cols[i + 3], -cols[i + 4], cols[i + 3] * 2, cols[i + 4] * 2); c.restore(); } });
        Object.keys(BUILDINGS).forEach(id => { const p = L.poi(id); if(!p) return; const dx = p.x - P.x, dz = p.z - P.z; if(dx * dx + dz * dz < 20000){ c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(dx, dz, 5, 0, TAU); c.fill(); } });
        c.fillStyle = '#ff9a4a'; for(const q of botList){ if(!q.vis) continue; const dx = q.x - P.x, dz = q.z - P.z; if(dx * dx + dz * dz < 14000){ c.beginPath(); c.arc(dx, dz, 2.6, 0, TAU); c.fill(); } } c.fillStyle = '#5aa0ff'; if(net) net.others.forEach(o => { const dx = o.x - P.x, dz = o.z - P.z; if(!o.inside && dx * dx + dz * dz < 14000){ c.beginPath(); c.arc(dx, dz, 3.4, 0, TAU); c.fill(); } }); }
      c.restore(); c.save(); c.translate(84, 84); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(84, 84, 82, 0, TAU); c.stroke(); c.fillStyle = '#fff'; c.font = '700 11px system-ui'; c.fillText('N', 80 + Math.sin(P.yaw) * 70 - 0, 88 - Math.cos(P.yaw) * 70);
    }
    const districtName = () => S.cell ? S.cell.name : RW.Nav.districtAt(P.x, P.z);
    function clockText(){ const e = env ? env : RW.Env.state(OS.now() + (RW.timeShift || 0), null), ph = e.phase, NF = RW.Env.NF, hr = ph >= NF ? 6 + (ph - NF) / (1 - NF) * 16 : (22 + ph / NF * 8) % 24, h = Math.floor(hr), m = Math.floor((hr - h) * 60); return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2); }
    function setPrompt(txt, sub){ const e = $('#rwPrompt'); if(!txt){ e.classList.remove('show'); return; } e.innerHTML = (touch.on ? '' : '<kbd>E</kbd>') + '<span>' + esc(txt) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : ''); e.classList.add('show'); }
    let hudT = 0, hudLoc = '', lastTip = '';
    function hud(t){
      if(t - hudT < 250) return; hudT = t; const loc = districtName(); if(loc !== hudLoc){ hudLoc = loc; const e = $('#rwLoc'); e.textContent = loc; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 3200); }
      $('#rwPause').classList.toggle('show', S.running && !dv && !S.phone && !uiOpen() && !locked() && !touch.on && !S.loading); $('#rwClock').textContent = clockText(); try{ $('#rwCash').textContent = '$' + (OS.cash() || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }catch(e){}
      const tipEl = $('#rwTip'), tip = lookNpc && S.mode === 'world' ? (G.bot(lookNpc.n).name + ' · ' + lookNpc.b.job + (lookNpc.why ? ' — ' + (G.WHY[lookNpc.why] || '') : '')) : ''; if(tip !== lastTip){ lastTip = tip; tipEl.textContent = tip; tipEl.classList.toggle('show', !!tip); }
    }

    /* ---------------- input ---------------- */
    const uiOpen = () => S.phone || S.loading || !!S.dialog || crime.busy() || !!document.querySelector('#windows .win:not(.hidden)');
    const locked = () => document.pointerLockElement === cv;
    const onKey = (e, d) => { if(!S.running || S.phone) return; const k = e.code; if(d && k === 'Escape' && S.dialog){ closeDialog(); return; } if(d && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !S.dialog && (k === 'KeyJ' || k === 'KeyF') && !uiOpen()){ if(k === 'KeyJ'){ crime.toggleReport(); e.preventDefault(); return; } if(!dv && !S.room){ crime.breakIn(); e.preventDefault(); return; } } if(d && (k === 'KeyM') && !uiOpen()){ openMap(); e.preventDefault(); return; } if(d && k === 'KeyP' && !e.ctrlKey && !e.metaKey){ phone(true); e.preventDefault(); return; }
      if(uiOpen()) return; if(d && k === 'KeyU' && !e.ctrlKey && !e.metaKey){ unstuck(); e.preventDefault(); return; } if(d && k === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.repeat){ cycleQuality(); e.preventDefault(); return; } if(dv && d && driveKey(k, e)) return; if(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'Enter'].includes(k)){ keys[k] = d; e.preventDefault(); if(d && (k === 'KeyE' || k === 'Enter')) interact(); } };
    window.addEventListener('keydown', e => onKey(e, true)); window.addEventListener('keyup', e => { keys[e.code] = false; onKey(e, false); });
    window.addEventListener('blur', () => { for(const k in keys) keys[k] = false; });
    cv.addEventListener('click', () => { if(!S.running || uiOpen() || touch.on) return; try{ cv.requestPointerLock(); }catch(e){} });
    document.addEventListener('mousemove', e => { if(!S.running || !locked()) return; if(dv){ mouse.sx = clamp(mouse.sx + e.movementX / 170, -1, 1); mouse.sy = clamp(mouse.sy + e.movementY / 170, -1, 1); mouse.at = performance.now(); return; } P.yaw = wrapA(P.yaw + e.movementX * cfg.sens); P.pitch = clamp(P.pitch - e.movementY * cfg.sens, -1.45, 1.45); });
    document.addEventListener('pointerlockchange', () => { $('#rwPause').classList.toggle('show', S.running && !dv && !uiOpen() && !locked() && !touch.on && !S.loading); });
    // driving: cursor = stick / wheel, buttons = gas / brake, wheel = throttle, on-screen buttons for touch
    cv.addEventListener('mousedown', e => { if(!dv) return; if(e.button === 0) mouse.l = true; else if(e.button === 2) mouse.rb = true; });
    window.addEventListener('mouseup', e => { if(e.button === 0) mouse.l = false; else if(e.button === 2) mouse.rb = false; });
    cv.addEventListener('contextmenu', e => { if(dv) e.preventDefault(); });
    cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mouse.px = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.py = ((e.clientY - r.top) / r.height) * 2 - 1; mouse.in = true; });
    cv.addEventListener('mouseleave', () => { mouse.in = false; });
    cv.addEventListener('wheel', e => { if(!dv) return; e.preventDefault(); if(!dv.car) dv.thr = clamp(dv.thr - e.deltaY * 0.0007, 0, 1); }, { passive: false });
    window.addEventListener('blur', () => { mouse.l = mouse.rb = false; tb.gas = tb.brake = tb.hand = false; });
    [['#rwTG', 'gas'], ['#rwTB', 'brake'], ['#rwTH', 'hand']].forEach(([sel, key]) => { const b = $(sel), on = e => { e.preventDefault(); tb[key] = true; b.classList.add('on'); }, off = () => { tb[key] = false; b.classList.remove('on'); }; b.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, off)); });
    $('#rwTV').addEventListener('pointerdown', e => { e.preventDefault(); if(dv) driveKey('KeyV', e); }); $('#rwTT').addEventListener('pointerdown', e => { e.preventDefault(); if(dv) driveKey('KeyT', e); });
    // touch: left = move stick, right = look
    const stick = $('#rwStick'), knob = stick.firstElementChild; touch.on = matchMedia('(pointer: coarse)').matches; rootEl.classList.toggle('touch', touch.on);
    cv.addEventListener('touchstart', e => { for(const c of e.changedTouches){ if(c.clientX < innerWidth * 0.45 && !touch.stick){ touch.stick = { id: c.identifier, x: c.clientX, y: c.clientY }; stick.style.display = 'block'; stick.style.left = c.clientX - 55 + 'px'; stick.style.top = c.clientY - 55 + 'px'; } else if(!touch.look) touch.look = { id: c.identifier, x: c.clientX, y: c.clientY }; } e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', e => { for(const c of e.changedTouches){ if(touch.stick && c.identifier === touch.stick.id){ const dx = clamp((c.clientX - touch.stick.x) / 50, -1, 1), dy = clamp((c.clientY - touch.stick.y) / 50, -1, 1); touch.mx = dx; touch.mz = dy; knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; } else if(touch.look && c.identifier === touch.look.id){ P.yaw = wrapA(P.yaw + (c.clientX - touch.look.x) * 0.005); P.pitch = clamp(P.pitch - (c.clientY - touch.look.y) * 0.005, -1.45, 1.45); touch.look.x = c.clientX; touch.look.y = c.clientY; } } e.preventDefault(); }, { passive: false });
    const tend = e => { for(const c of e.changedTouches){ if(touch.stick && c.identifier === touch.stick.id){ touch.stick = null; touch.mx = touch.mz = 0; stick.style.display = 'none'; knob.style.transform = ''; } if(touch.look && c.identifier === touch.look.id) touch.look = null; } };
    cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
    $('#rwBtnE').addEventListener('touchstart', e => { e.preventDefault(); interact(); }, { passive: false }); $('#rwBtnJ').addEventListener('touchstart', e => { e.preventDefault(); touch.jump = true; }, { passive: false }); $('#rwBtnR').addEventListener('touchstart', e => { e.preventDefault(); touch.run = !touch.run; $('#rwBtnR').classList.toggle('on', touch.run); }, { passive: false });
    $('#rwGfx').onclick = () => openGfx();
    $('#rwUnstuck').onclick = () => { unstuck(); try{ cv.focus(); }catch(e){} };
    $('#rwPhone').onclick = () => phone(true); $('#rwTravel').onclick = () => openMap();
    $('#rwHelp').onclick = () => $('#rwHelp').classList.remove('show');
    /* a conversation: the clerk's line + one button per service (each opens a WestOS app) + Goodbye. The mouse is released while it is open. */
    function openDialog(n){
      S.dialog = n; if(locked()) document.exitPointerLock(); setPrompt(null); const d = $('#rwDlg');
      d.innerHTML = '<div class="n">' + esc(n.name) + '</div><div class="l">' + esc(n.line) + '</div>' + (n.opts || []).map((o, i) => '<button data-i="' + i + '">' + esc(o.label) + '</button>').join('') + '<button class="bye">' + ((n.opts || []).length ? 'Goodbye' : 'Wave goodbye') + '</button>'; d.classList.add('show');
      d.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => { const o = n.opts[+b.dataset.i]; closeDialog(); if(o.act){ try{ crime.act(o.act); }catch(e){ toast('Not available right now.'); } return; } try{ if(o.tab) sessionStorage.setItem('assets_tab', o.tab); OS.open(o.app); }catch(e){} }; });
      d.querySelector('.bye').onclick = () => { closeDialog(); if(!touch.on){ try{ cv.requestPointerLock(); }catch(e){} } };
    }
    function closeDialog(){ S.dialog = null; const d = rootEl && rootEl.querySelector('#rwDlg'); if(d) d.classList.remove('show'); }
    /* M / the Map button: WestMap (the same engine, seen from above) — pick a spot, click again, you are there */
    function openMap(){ if(!S.running || S.loading) return; if(locked()) document.exitPointerLock(); closeDialog(true); try{ OS.open('WestMap'); }catch(e){} }

    /* ---------------- interaction ---------------- */
    function interact(){ if(!S.running || S.loading || S.dialog) return; if(dv){ exitDrive(); return; } if(uiOpen()) return; if(curNpc){ openDialog(curNpc); return; } if(curDoor && curDoor.exit){ exitRoom(); return; }
      if(!curDoor && V.look){ const q = V.look; if(q.slot || q.stolen){ if(!startDrive(q)) toast('You cannot get in right now.'); } else if(q.npc != null){ toast('Locked. Press F to break in — it is a crime.'); } else if(q.cop){ /* nothing to see */ } else { try{ sessionStorage.setItem('assets_tab', q.kind === 'plane' ? 'planes' : 'cars'); OS.open('RealEstate'); }catch(e){} } return; }
      if(curDoor && curDoor.info){ if(curDoor.info.enter) enterRoom(curDoor.d, curDoor.info.spec); else if(curDoor.info.go) curDoor.info.go(); } }
    function findInteraction(){
      curNpc = null; curDoor = null; const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      if(S.cell){ let bd = 3.4; S.cell.npcs.forEach(n => { if(Math.abs(n.y - P.y) > 2.4) return; const dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz); if(d < bd && (dx * fx + dz * fz) / (d || 1) > 0.25){ bd = d; curNpc = n; } }); if(curNpc) setPrompt('Talk to ' + curNpc.name, curNpc.opts.length ? curNpc.opts.map(o => o.label.split(' · ')[0]).join(' · ') : ''); else if(S.room && Math.hypot(P.x - S.room.door.x, P.z - S.room.door.z) < 4){ curDoor = { exit: true }; setPrompt('Leave'); } else setPrompt(null); return; }
      if(lookNpc && Math.hypot(lookNpc.x - P.x, lookNpc.z - P.z) < 5){ curNpc = { name: G.bot(lookNpc.n).name, line: outLine(lookNpc), opts: [], bot: lookNpc }; }
      let bd = 3.2; allDoorsNear(P.x, P.z, 3.4).forEach(d => { const dist = Math.hypot(d.x - P.x, d.z - P.z); if(dist < bd){ const i = doorInfo(d); if(i){ bd = dist; curDoor = { d, info: i, dist }; } } });
      V.look = null; if(!curDoor && !curNpc && !S.cell){ let vd = 4.2; for(const q of V.list){ if(q.cop) continue; const d = Math.hypot(q.x - P.x, q.z - P.z); if(d < vd){ vd = d; V.look = q; } } }
      if(V.look && !curDoor && !curNpc){ const m = VD.get(V.look.id), cp = crime.prompt(V.look); if(cp){ setPrompt(cp[0], cp[1]); return; } if(V.look.stolen){ setPrompt('Stolen ' + m.name, V.look.wired ? 'E: get in and ' + (m.kind === 'plane' ? 'fly' : 'drive') : 'E: get in · hotwire it'); return; } setPrompt(V.look.slot ? 'Your ' + m.name : m.name + ' · ' + (m.price / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }), V.look.slot ? (m.kind === 'plane' ? 'Get in and fly' : 'Get in and drive') : 'E: see it in Assets'); return; }
      if(curDoor){ curNpc = null; setPrompt(curDoor.info.label); } else if(curNpc) setPrompt('Talk to ' + curNpc.name); else setPrompt(null);
    }

    /* ---------------- per-frame update ---------------- */
    function update(dt, t){
      crime.update(dt, t);
      cooldown = Math.max(0, cooldown - dt); if(locked() && uiOpen()) document.exitPointerLock(); const busy = uiOpen() || S.loading; let ix = 0, iz = 0, run = false;
      if(dv){ driveUpdate(dt, t, busy); return; }
      if(!busy){ ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); run = !!(keys.ShiftLeft || keys.ShiftRight) || touch.run; if(touch.on){ ix += touch.mx; iz += touch.mz; } const l = Math.hypot(ix, iz); if(l > 1){ ix /= l; iz /= l; } if(keys.ArrowLeft && keys.ShiftLeft){ } }
      if(!busy && (keys.ArrowLeft || keys.ArrowRight) && false) P.yaw += 0;
      const sp = (run ? cfg.run : cfg.walk) * (S.cell ? 0.8 : 1), fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = Math.sin(P.yaw), tvx = (rx * ix - fx * iz) * sp, tvz = (rz * ix - fz * iz) * sp, a = Math.min(1, dt * (Math.hypot(tvx, tvz) > 0.1 ? 11 : 9));
      P.vx += (tvx - P.vx) * a; P.vz += (tvz - P.vz) * a;
      if(!S.room && !S.cell){                                                                  // hills: climbing slows you down, and sheer faces (slope > ~50°) cannot be climbed at all
        const gx = (T.height(P.x + 1.2, P.z) - T.height(P.x - 1.2, P.z)) / 2.4, gz = (T.height(P.x, P.z + 1.2) - T.height(P.x, P.z - 1.2)) / 2.4, gl = Math.hypot(gx, gz), sp2 = Math.hypot(P.vx, P.vz);
        if(gl > 0.3 && sp2 > 0.1){ const up = (P.vx * gx + P.vz * gz) / (gl * sp2); if(up > 0){ const k = 1 - 0.55 * Math.min(1, (gl - 0.3) / 0.7) * up; P.vx *= k; P.vz *= k; if(gl > 1.2){ const cut = (P.vx * gx + P.vz * gz) / gl; P.vx -= gx / gl * cut; P.vz -= gz / gl * cut; } } } }
      const jump = (keys.Space || touch.jump) && !busy ? cfg.jump : 0; touch.jump = false;
      const px0 = P.x, pz0 = P.z;
      Phys.step(P, dt, { sets: collSets(), disabled: cells.disabled(), ground: S.room ? (() => S.room.gy) : T.height, grav: cfg.grav, jump });
      if(!S.room){ if(T.isWater(P.x, P.z)){ if(!T.isWater(px0, pz0)){ P.x = px0; P.z = pz0; } else { /* teleported / spawned into the sea: walk to the nearest shore */ for(let r = 6; r < 400; r += 6){ let hit = false; for(let a = 0; a < 24 && !hit; a++){ const x = P.x + Math.cos(a / 24 * TAU) * r, z = P.z + Math.sin(a / 24 * TAU) * r; if(!T.isWater(x, z)){ P.x = x; P.z = z; hit = true; } } if(hit) break; } } P.vx = P.vz = 0; } }
      if(S.room && !S.busy){ const r = S.room.door; if((P.x - r.x) * r.nx + (P.z - r.z) * r.nz > -1.5) exitRoom(); }
      const dy = P.y - P.cy; P.cy = Math.abs(dy) > 1.2 ? P.y : P.cy + dy * Math.min(1, dt * 16);   // stairs and kerbs glide instead of snapping
      const spd = Math.hypot(P.vx, P.vz); P.mv = clamp(spd / cfg.run, 0, 1.2); P.bob += dt * spd * 1.9; cellsUpdate(); findInteractionThrottled(t);
      if(net) net.tick({ x: P.x, z: P.z, yaw: P.yaw, mv: P.inside ? 0 : spd / cfg.run, inside: P.inside }, dt);
    }
    let fiAt = 0; const findInteractionThrottled = t => { if(t - fiAt > 60){ fiAt = t; findInteraction(); } };

    /* ---------------- graphics quality ----------------
     * Tiers: 0 Low (original look, 1x pixels) · 1 Medium (1.5x pixels) · 2 High (filmic colour, glossy paint, haze glow, up to 2x pixels, longer prop range) · 3 Ultra (+ real sun shadows, more chunks).
     * "Auto" (default) starts from what the GPU / device looks like and then moves itself up or down with the measured frame rate (see adapt()); the G key / Graphics button picks a tier by hand and is remembered. */
    const GP = RW.GfxPrefs, QN = ['Low', 'Medium', 'High', 'Ultra'], Q = { level: 1, ceil: 2, auto: true, t: 0, good: 0, p: 'auto', custom: GP.clean(null, GP.PRESETS.high), o: GP.PRESETS.medium, shadowFail: false };
    const gpuName = () => { try{ const x = gfx.gl.getExtension('WEBGL_debug_renderer_info'); return x ? String(gfx.gl.getParameter(x.UNMASKED_RENDERER_WEBGL) || '') : ''; }catch(e){ return ''; } };
    function autoStart(){
      if(perfLow()) return { level: 0, ceil: 1 }; const r = gpuName();
      if(/SwiftShader|llvmpipe|Software|Basic Render|Mesa Offscreen/i.test(r)) return { level: 0, ceil: 0 };
      const strong = /RTX|GTX ?(9|1\d)|Radeon (RX|Pro|VII)|\bRX ?\d|Apple M\d|Apple GPU|Arc\b|Quadro|Titan|Adreno \(?(6[5-9]|7|8)|Mali-G(7[1-9]|[89])/i.test(r), cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
      return strong && cores >= 4 && mem >= 4 ? { level: 2, ceil: 3 } : { level: 1, ceil: 2 };
    }
    /* The numbers in force live in Q.o (see gfxprefs.js). Presets/Auto fill it from a table; "custom" from the player's own values. applyGfx() pushes them into the engine. */
    const gfxLabel = () => Q.p === 'auto' ? 'Auto' : Q.p === 'custom' ? 'Custom' : QN[GP.TIERS.indexOf(Q.p)];
    function applyGfx(why){
      const o = Q.o; let want = o.shadows ? 2 : o.refl ? 1 : 0, got = want;
      try{ got = gfx.setQuality(want, { size: o.shadowSize }); }catch(e){ if(K.diag) K.diag.error('realworld.quality', e); }
      Q.shadowFail = want >= 2 && got < 2; if(Q.shadowFail){ Q.o = o = Object.assign({}, o, { shadows: 0 }); if(Q.p === 'auto') Q.ceil = Math.min(Q.ceil, 2); }
      cfg.fov = o.fov; cfg.npcRange = o.npc; cfg.carRange = o.car;
      if(st){ st.maxRadius = Q.p === 'auto' && perfLow() ? Math.min(o.view, cfg.perfRadius) : o.view; if(st.radius > st.maxRadius || !o.adaptive) st.radius = st.maxRadius; }
      if(!o.adaptive) S.scale = 1;
      if(why) toast('Graphics: ' + gfxLabel() + (Q.p === 'auto' ? ' (' + QN[Q.level] + ')' : '') + (why === true ? '' : ' — ' + why)); return got;
    }
    function setLevel(n, why){ Q.level = Math.max(0, Math.min(3, n | 0)); S.q = Q.level; Q.o = GP.resolve({ p: 'auto' }, Q.level); return applyGfx(why); }
    /* read the saved choice (pref rwGfx, or the old rwQuality) and put it in force */
    function loadGfx(why){
      let p = null, old = null; try{ p = OS.prefs.get('rwGfx'); old = OS.prefs.get('rwQuality'); }catch(e){}
      const sel = GP.read(p, old); Q.p = sel.p; Q.custom = sel.o; Q.auto = sel.p === 'auto';
      if(Q.auto){ const a = autoStart(); Q.ceil = a.ceil; Q.good = 0; Q.t = performance.now(); setLevel(a.level, why); }
      else { Q.level = Q.p === 'custom' ? 2 : GP.TIERS.indexOf(Q.p); S.q = Q.level; Q.o = GP.resolve(sel); applyGfx(why); }
      S.scale = 1; syncGfxBtn();
    }
    const initQuality = () => loadGfx(false);
    function syncGfxBtn(){ const b = $('#rwGfx'); if(b){ b.querySelector('span').textContent = gfxLabel(); b.title = 'Graphics: ' + gfxLabel() + ' — click for all graphics settings, G to switch preset'; } }
    /* G: next preset (Auto → Low → Medium → High → Ultra → Custom) */
    function cycleQuality(){ const cur = GP.ORDER.indexOf(Q.p), nx = GP.ORDER[(cur + 1) % GP.ORDER.length];
      try{ OS.prefs.set('rwGfx', { p: nx, o: Q.custom }); }catch(e){} loadGfx(true); }
    /* the top-bar Graphics button: the full settings, in a WestOS window (Settings → Real World graphics) */
    function openGfx(){ if(!S.running || S.loading) return; if(locked()) document.exitPointerLock(); closeDialog(true); try{ sessionStorage.setItem('westos.settingsPage', 'graphics'); }catch(e){} try{ OS.open('Settings'); }catch(e){} }
    if(OS.on) OS.on('prefs', k => { if((k !== 'rwGfx' && k !== '*') || !gfx || !st) return; const p = OS.prefs.get('rwGfx'); if(JSON.stringify(p) === JSON.stringify({ p: Q.p, o: Q.custom })) return; loadGfx(false); });
    /* ---------------- render ---------------- */
    const propRange = () => [Math.round(Q.o.props * 0.72), Q.o.props];
    function render(dt, t){
      const dpr = Math.min(window.devicePixelRatio || 1, Q.o.dpr) * S.scale; gfx.resize(cv.clientWidth, cv.clientHeight, dpr);
      if(!env || t - envAt > 250){ envAt = t; grade = K.skin && K.skin(); env = RW.Env.state(OS.now() + (RW.timeShift || 0), grade && grade.three); S.env = env; }
      st.update(S.room ? S.room.sx : P.x, S.room ? S.room.sz : P.z); st.upload(2); st.step(dt);
      if(t - sunTick > 2000){ sunTick = t; const n2 = nh(); if(n2 !== S.nh){ S.nh = n2; S.nd = G.districtCount(n2); L.setup(n2); T.setup(L.radius()); st.setNH(n2); } if(S.nh){ rebuildDyn(); rebuildVehicles(); } }
      if(t - botsAt > 90000){ botsAt = t; loadBots(); } stepNPCs(t, dt);
      const e = env, bob = Math.sin(P.bob * 2.2) * 0.03 * P.mv, cam = dv ? dv.cam : { pos: [P.x, P.cy + cfg.eye + bob, P.z], yaw: P.yaw, pitch: P.pitch, fov: cfg.fov * Math.PI / 180, near: 0.25, far: cfg.far };
      gfx.begin(cam, e, t / 1000);
      ensureModels(); const [np, nc] = fillActors(), vb = VD ? fillVehicles() : null, drawActorsAll = () => { drawPeople(actorBuf, np); if(nc) drawCars(carBuf, nc); if(vb) for(const k in vb) gfx.actors(k, vb[k].buf, vb[k].n, 0.9); };
      if(gfx.shadowOn && !S.room && !S.cell){                       // ULTRA: sun shadows — the same buffers drawn once from the sun into a depth map
        const R = dv ? 110 : 80, f = gfx.V.f, fx = cam.pos[0] + f[0] * R * 0.45, fz = cam.pos[2] + f[2] * R * 0.45;
        if(gfx.beginShadow([fx, T.height(fx, fz) + 1, fz], R)){ gfx.startWorld(); st.draw(P.x, P.z, cfg.far); if(dyn.plots) gfx.draw(dyn.plots, 1, 1); st.drawProps(...propRange()); drawActorsAll(); gfx.endShadow(); } }
      if(!S.room){ gfx.sky(e.cloud); gfx.startWorld(); if(!ocean) ocean = makeOcean(); gfx.draw(ocean, 1, 1); S.drawn = st.draw(P.x, P.z, cfg.far); if(dyn.plots) gfx.draw(dyn.plots, 1, 1); if(dyn.marks) gfx.draw(dyn.marks, 1, 1);
        S.props = st.drawProps(...propRange()); }                      // trees, lamps, benches: one instanced call per kind
      if(cells.cells.size){ gfx.env = RW.Env.INDOOR; gfx.startWorld(); cells.draw(); gfx.env = e; if(S.cell){ scr.tick(P.x, P.z, t); scr.draw(); } }   // insides: only loaded ones, indoor light
      drawActorsAll();
      if(fx){ fx.step(dt, T.height, cam.pos);
        if(fx.count() && !S.room){ const r = fx.fill(fxA, fxD), sc = cv.height / (2 * Math.tan(cam.fov / 2)); gfx.fx(fxA, r.na, false, sc, 1 - 0.65 * (e.night || 0)); gfx.fx(fxD, r.nd, true, sc, 1); }
        if(flashEl){ const o = Math.round(Math.min(0.85, fx.flash * 0.85) * 100) / 100; if(o !== flashO){ flashO = o; flashEl.style.opacity = o; } } }
      if(S.cell){ const ni = fillInside(); if(ni){ gfx.env = RW.Env.INDOOR; drawPeople(inBuf, ni); gfx.env = e; } }
      const sky = grade && grade.fx; if(sky && !P.inside && (sky.kind === 'snow' || sky.kind === 'embers')) gfx.particles(sky, cv.height * 0.9);
      labels(); minimap(t); compass(t); hud(t);
    }
    function loop(t){
      raf = requestAnimationFrame(loop); if(!S.running) return; if(document.hidden || S.phone || performance.now() < S.holdUntil){ last = t; return; } if(gfx.lost){ last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t; try{ update(dt, t); render(dt, t); }catch(err){ if(!S.err){ S.err = 1; console.error('[realworld]', err); if(K.diag) K.diag.error('realworld.frame', err); } }
      frames++; if(t - fpsT > 1000){ S.fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; adapt(t); }
      if(S.loading){ const ok = ringReady() || t - S.t0 > 14000; $('#rwLoad i').style.width = Math.round(Math.min(1, (st.built || 0) / 12) * 100) + '%'; if(ok){ S.loading = false; $('#rwLoad').classList.add('gone'); $('#rwPause').classList.toggle('show', !touch.on); if(!helpShown){ helpShown = true; $('#rwHelp').classList.add('show'); setTimeout(() => $('#rwHelp').classList.remove('show'), 9000); } } }
    }
    /* dynamic resolution + view distance: hold ~50+ fps on weak GPUs without the player touching a setting */
    function adapt(t){ if(S.loading) return;
      if(Q.auto){                                                                       // AUTO tier: drop a tier when even the lowest resolution scale cannot hold ~40 fps; climb when it has run flat out for ~12 s
        if(S.fps < 38 && S.scale <= cfg.minScale + 0.01 && Q.level > 0 && t - Q.t > 6000){ Q.t = t; Q.good = 0; Q.ceil = Q.level - 1; setLevel(Q.level - 1, 'auto-adjusted to keep it smooth'); S.scale = 1; syncGfxBtn(); }
        else if(S.fps >= 58 && S.scale >= 1 && st.radius >= (st.maxRadius || cfg.radius)){ if(t - Q.t > 1000){ Q.good++; Q.t0 = Q.t0 || t; } if(Q.good >= 12 && Q.level < Q.ceil && t - Q.t > 15000){ Q.t = t; Q.good = 0; setLevel(Q.level + 1, 'auto-raised: your device can handle it'); syncGfxBtn(); } }
        else if(S.fps < 50) Q.good = 0; }
      if(!Q.o.adaptive){ if(S.scale !== 1) S.scale = 1; return; }
      if(t - adaptT < 2500) return; if(S.fps < 40){ adaptT = t; if(S.scale > cfg.minScale + 0.01) S.scale = Math.max(cfg.minScale, S.scale - 0.1); else if(st.radius > 4) st.radius -= 1; } else if(S.fps > 57 && (S.scale < 1 || st.radius < (st.maxRadius || (perfLow() ? cfg.perfRadius : cfg.radius)))){ adaptT = t + 4000; if(S.scale < 1) S.scale = Math.min(1, S.scale + 0.05); else st.radius += 1; } }

    /* ---------------- public ---------------- */
    function enter(){
      if(S.running) return true; if(!gpuUp()){ toast('The real world needs WebGL 2, which this browser does not have.'); return false; }
      const sp = spawnPoint(); P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.y = T.height(P.x, P.z); S.mode = 'world'; S.cell = null; P.inside = false; P.cy = P.y; P.grounded = true; S.running = true; S.loading = true; S.phone = false; S.t0 = performance.now(); S.scale = 1; env = null;
      screen.classList.add('rw-on'); screen.classList.remove('rw-phone'); $('#rwLoad').classList.remove('gone'); $('#rwFade').classList.remove('on'); try{ OS.homes.watch(); OS.homes.watchMap(true); }catch(e){} loadBots(); botsAt = performance.now();
      if(net) net.start(P.x, P.z); last = performance.now(); fpsT = last; raf = requestAnimationFrame(loop); setTimeout(() => { if(net && !net.on && S.running) net.start(P.x, P.z); }, 4000); return true;
    }
    function exit(){
      if(!S.running) return; if(dv) endDrive(); crime.reset(); S.running = false; cancelAnimationFrame(raf); document.exitPointerLock && document.exitPointerLock(); try{ OS.prefs.set('rwPos', { x: Math.round(S.room ? S.room.ret.x : P.x), z: Math.round(S.room ? S.room.ret.z : P.z), yaw: Math.round(P.yaw * 100) / 100 }); }catch(e){}
      screen.classList.remove('rw-on', 'rw-phone'); S.phone = false; try{ OS.homes.watchMap(false); }catch(e){} gpuDown();
    }
    function phone(on){ if(!S.running) return; S.phone = on; screen.classList.toggle('rw-phone', on); if(on){ document.exitPointerLock && document.exitPointerLock(); $('#rwPause').classList.remove('show'); } else { last = performance.now(); $('#rwPause').classList.toggle('show', !touch.on); } }
    /* fast travel from the map: leave the phone, close nothing else, fade, wait for the streets under the player, fade in */
    function travelTo(x, z, yaw){ if(!S.running) return false; if(S.phone) phone(false); return teleport(x, z, yaw); }
    /* WestMap calls this about once a second while it is open: the world stops drawing under it (no second 3-D scene burning the GPU) */
    const hold = on => { S.holdUntil = on === false ? 0 : performance.now() + 2500; };
    /* vehicles: public read-only view + the door to the driving controller (startDrive / endDrive) */
    const vehicles = { list: () => V.list.slice(), mine: () => V.list.filter(q => q.slot), canDrive: () => VH.canDrive(), enter: slot => { const q = V.list.find(x => x.slot === slot); return !!(q && VH.canDrive() && startDrive(q)); }, exit: () => { if(dv) endDrive(); return !dv; }, _drive: q => startDrive(q),   /* _drive = test hook (tests/e2e-drive.test.js drives the showcase plane, which nobody can afford with the $100k grant) */ driving: () => dv ? { kind: dv.kind, id: dv.m.id, slot: dv.q.slot, engine: dv.engine !== false, speed: dv.s.speed, x: dv.s.x, z: dv.s.z, yaw: dv.s.yaw, alt: dv.s.alt || 0, onGround: dv.kind === 'car' ? true : dv.s.onGround } : null,
      at: id => { const p = L.poi(id); return !!(S.running && p && Math.hypot(p.x - P.x, p.z - P.z) < 48); } };
    return { enter, exit, phone, vehicles, active: () => S.running, inPhone: () => S.phone, teleport, travelTo, hold, openMap, drive: slot => { const q = V.list.find(x => x.slot === slot); return q ? startDrive(q) : false; }, driveState: () => dv ? { kind: dv.kind, id: dv.m.id, engine: dv.engine !== false, stolen: !!dv.q.stolen, x: dv.s.x, z: dv.s.z, y: dv.s.y, speed: dv.s.speed, onGround: dv.s.onGround, crashed: dv.s.crashed, throttle: dv.s.throttle, yaw: dv.s.yaw, wreck: !!dv.wreck, dmg: dv.dmg || 0 } : null, driveSet: o => { if(dv) Object.assign(dv.s, o); }, unstuck, cycleQuality, quality: () => ({ level: Q.level, auto: Q.auto, shadows: !!(gfx && gfx.shadowOn), tier: QN[Q.level] }), state: () => ({ x: P.x, y: P.y, z: P.z, yaw: P.yaw, mode: S.mode, fps: S.fps, scale: S.scale, radius: st && st.radius, chunks: st && st.chunks.size, calls: gfx && gfx.calls, tris: gfx && Math.round(gfx.tris), built: st && st.built, bots: botList.length, others: net ? net.others.size : 0, loading: S.loading, drawn: S.drawn, props: S.props, inside: S.cell ? S.cell.name : null, cells: cells ? cells.cells.size : 0, nh: S.nh }), _P: P, _S: S, _fx: () => fx, _bots: () => botList, _dv: () => dv, _st: () => st, _cells: () => cells };
  };
})(typeof self !== 'undefined' ? self : this);
