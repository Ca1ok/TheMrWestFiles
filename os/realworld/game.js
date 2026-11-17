/* REALWORLD · game — the first-person controller: player, physics, doors and in-place interiors, people & cars, HUD, input, travel, the render loop.
 * Everything heavy lives elsewhere (chunkgen/worker = geometry, gfx = GPU, streamer = what is loaded, phys = collision world, cells = the insides of buildings, props = instanced scenery, net = other players, interiors = rooms, env = sky).
 * EXTEND HERE: BUILDINGS (a landmark → an interior kind), RealWorld.Interiors.register(kind, fn), RealWorld.config (speeds, view distance, field of view), TRAVEL list in travelItems().
 * RealWorld.start(K) is called once by boot.js the first time the player steps outside; it returns the public API (enter / exit / phone / travel …). */
(function(root){
  const RW = root.RealWorld, Phys = RW.Phys, G = root.WorldGen, BG = root.BuildGen, T = root.RWTerrain, M = root.RWMesh, L = root.RWLayout;
  const cfg = RW.config = Object.assign({ radius: 8, perfRadius: 5, fov: 72, walk: 4.4, run: 8.4, jump: 5.6, grav: 17, eye: 1.55, pr: 0.36, sens: 0.0022, far: 1700, npcRange: 230, carRange: 480, minScale: 0.55 }, RW.config || {});
  /* landmark id (WorldGen.POIS) → the interior to build when you walk in. Add a line + RealWorld.Interiors.register('<kind>', …) for a new public building. */
  const BUILDINGS = RW.buildings = { bank: { kind: 'bank', name: 'Bank' }, exchange: { kind: 'exchange', name: 'Stock Exchange' }, shop: { kind: 'shop', name: 'WestShop' }, arcade: { kind: 'arcade', name: 'Arcade' }, agency: { kind: 'agency', name: 'Estate Agency' }, hall: { kind: 'hall', name: 'Council Hall' },
    uni: { kind: 'uni', name: 'University Library' }, lab: { kind: 'lab', name: 'Research Institute' }, ind: { kind: 'ind', name: 'Freight Depot' }, plant: { kind: 'plant', name: 'Power Plant' } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), TAU = Math.PI * 2, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), sleep = ms => new Promise(r => setTimeout(r, ms));
  const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; };
  const pack = c => (Math.round(c[0]) * 65536 + Math.round(c[1]) * 256 + Math.round(c[2]));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  RW.start = function(K){
    const OS = root.OS, $ = s => rootEl.querySelector(s), screen = document.getElementById('screen');
    const rootEl = document.createElement('div'); rootEl.id = 'rw';
    rootEl.innerHTML = `<canvas id="rwc" tabindex="0"></canvas><div id="rwHud">
      <div class="rw-top"><button class="rw-btn" id="rwPhone" title="Open WestOS (P)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg><span>Phone</span></button><button class="rw-btn" id="rwTravel" title="Travel (M)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg><span>Travel</span></button><span class="rw-chip" id="rwClock"></span><span class="rw-chip" id="rwCash"></span></div>
      <div id="rwCompass"><canvas id="rwCompassC" width="560" height="46"></canvas><i></i><div id="rwCompassLbl"></div></div><div id="rwLoc"></div><div id="rwCross"></div><div id="rwTip"></div><div id="rwPrompt"></div><canvas id="rwMap" width="168" height="168"></canvas><div id="rwLabels"></div>
      <div id="rwDlg"></div><div id="rwHelp"><div><b>W A S D</b> walk</div><div><b>Shift</b> run &nbsp; <b>Space</b> jump</div><div><b>Mouse</b> look (click to capture)</div><div><b>E</b> open a door / talk to someone</div><div><b>M</b> map &nbsp; <b>P</b> phone (WestOS)</div><div><b>Esc</b> release the mouse</div></div><div id="rwPause">Click to look around</div>
      <div id="rwTouch"><div id="rwStick"><i></i></div><button id="rwBtnE">E</button><button id="rwBtnJ">⤒</button><button id="rwBtnR">Run</button></div>
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
    const homeRec = id => ((OS.homes.world && OS.homes.world()) || {})[id] || {};
    const me = () => OS.homes.uid && OS.homes.uid();

    /* ---------------- setup / teardown of the GPU side (created on first enter, freed on exit so a closed world costs nothing) ---------------- */
    function gpuUp(){
      if(gfx) return true; gfx = RW.GFX.create(cv, { aa: !perfLow() }); if(!gfx) return false; S.nh = nh(); S.nd = G.districtCount(S.nh); L.setup(S.nh); T.setup(L.radius()); scr = RW.Screens.manager(gfx); npcs = RW.NPC.create(G, L);
      st = RW.Streamer.create(gfx, { nh: S.nh, radius: perfLow() ? cfg.perfRadius : cfg.radius, base: 'os/realworld/' }); gfx.onRestore = () => { st.free(); st = RW.Streamer.create(gfx, { nh: S.nh, radius: cfg.radius }); };
      net = RW.Net.create(K); cells = RW.Cells.create(gfx); if(RW.Assets && !RW.Assets.tried){ RW.Assets.tried = true; RW.Assets.load('assets/world/').catch(() => {}); } return true;
    }
    function gpuDown(){ if(!gfx) return; try{ if(net) net.stop(); if(st) st.free(); if(scr) scr.clear(); if(cells) cells.clear(); if(dyn.plots) gfx.free(dyn.plots); if(dyn.marks) gfx.free(dyn.marks); gfx.destroy(); }catch(e){} gfx = st = net = scr = npcs = cells = null; S.cell = null; S.room = null; S.busy = false; P.inside = false; closeDialog(true); dyn = { plots: null, marks: null, sig: '' }; const c2 = cv.cloneNode(false); cv.replaceWith(c2); }

    /* ---------------- spawn / travel ---------------- */
    const homePose = () => { const h = OS.homes.home && OS.homes.home(); if(!h || !h.g) return null; const p = RW.Nav.housePose(+String(h.id).slice(1)); return p ? Object.assign({ n: 'Home · ' + p.name }, p) : null; };
    function spawnPoint(){
      const sp = OS.prefs && OS.prefs.get && OS.prefs.get('rwPos'); if(sp && isFinite(sp.x) && isFinite(sp.z) && Math.hypot(sp.x, sp.z) < L.radius() + 200) return { x: sp.x, z: sp.z, yaw: sp.yaw || 0 };
      const h = homePose(); if(h) return h; return plazaPose();
    }
    const plazaPose = () => Object.assign({ n: 'Town Square' }, RW.Nav.plazaPose());
    const poiName = id => (G.POIS[id] && G.POIS[id].n) || id;
    async function teleport(x, z, yaw){ fade(true); await sleep(280); if(!st) return; if(S.room){ if(cells) cells.clear(); S.room = null; S.cell = null; P.inside = false; if(scr) scr.set([]); } P.x = x; P.z = z; P.yaw = yaw || 0; P.vx = P.vz = P.vy = 0; P.y = P.cy = T.height(x, z); P.grounded = true; if(st) st.update(P.x, P.z); const t0 = performance.now(); while(!ringReady() && performance.now() - t0 < 4500){ await sleep(60); if(st) st.update(P.x, P.z); st && st.upload(3); } fade(false); }
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
    const collSets = () => { const sets = []; if(!S.room){ st.nearCols(P.x, P.z, c => sets.push({ a: c, st: 8 })); if(dynColsA) sets.push({ a: dynColsA, st: 8 }); } if(S.room){ const cs = cells.sets(); for(let i = 0; i < cs.length; i++) sets.push(cs[i]); } return sets; };

    /* ---------------- people & cars ---------------- */
    async function loadBots(){ try{ const m = await (RW.botSource ? RW.botSource() : OS.homes.bots()); botList = Object.keys(m || {}).map(id => { const r = m[id], n = +id.slice(1); return { id, n, b: { n, job: r.j || 'baker', thrift: typeof r.th === 'number' ? r.th : 0.5 }, home: r.h ? G.house(+String(r.h).slice(1)) : null, shirt: pack(hsl(G.h32(n, 19) % 360, 55, 52)), pants: pack(hsl(G.h32(n, 21) % 360, 30, 24)), init: 0, x: 0, z: 0, tx: 0, tz: 0, vx: 0, vz: 0, yaw: 0, ph: 0, mv: 0, vis: false, t: 0 }; }); }catch(e){} }
    function stepNPCs(t, dt){
      if(t - npcAt >= 100){ const now = OS.now(), nhh = S.nh; npcAt = t; for(const q of botList){ let s; try{ s = npcs.state(q.b, q.home, now, nhh); }catch(e){ continue; } const dtt = Math.max(0.05, (t - q.t) / 1000);
        if(!q.init){ q.init = 1; q.vx = q.vz = 0; q.yaw = s.yaw; } else { q.vx += ((s.x - q.tx) / dtt - q.vx) * 0.6; q.vz += ((s.z - q.tz) / dtt - q.vz) * 0.6; } q.tx = s.x; q.tz = s.z; q.t = t; q.moving = s.moving; q.why = s.why; q.dest = s.dest; if(!s.moving){ q.vx = q.vz = 0; } } }
      for(const q of botList){ if(!q.init){ q.vis = false; continue; } const e = Math.min(0.25, (t - q.t) / 1000); q.x = q.tx + q.vx * e; q.z = q.tz + q.vz * e; const sp = Math.hypot(q.vx, q.vz); q.sp = sp; q.vis = !!q.moving; if(sp > 0.4){ q.yaw += wrapA(Math.atan2(q.vx, -q.vz) - q.yaw) * Math.min(1, dt * 8); } q.mv = clamp(sp / 4, 0, 1.3); q.ph += dt * sp * 2.4; }
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
      for(let i = 0; i < n; i++){ const o = i * 8, v = Math.abs(buf[o + 7] | 0) % nv, dx = buf[o] - px, dz = buf[o + 2] - pz; tmp[0] = buf[o]; tmp[1] = buf[o + 1]; tmp[2] = buf[o + 2]; tmp[3] = buf[o + 3]; tmp[4] = 1; tmp[5] = 0xffffff; tmp[6] = 0; tmp[7] = 0; push8(CARS.bufs[v * 2 + (dx * dx + dz * dz > CAR_NEAR * CAR_NEAR ? 1 : 0)], tmp, 0); }
      CARS.bufs.forEach((b, k) => { if(!b.n) return; const m = cs[k >> 1][(k & 1) ? 'm1' : 'm0']; let h = CARS.h.get(m); if(!h){ h = gfx.propUpload(m); CARS.h.set(m, h); } gfx.props(h, b.a, b.n, true, cfg.carRange * 0.85, cfg.carRange); }); }
    function fillActors(){
      let np = 0, nc = 0; const px = P.x, pz = P.z, put = (buf, i, x, y, z, yaw, ph, mv, sh, pa) => { const o = i * 8; buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = yaw; buf[o + 4] = ph; buf[o + 5] = mv; buf[o + 6] = sh; buf[o + 7] = pa; };
      const grow = (buf, n) => (n * 8 + 8 > buf.length) ? (() => { const b = new Float32Array(buf.length * 2); b.set(buf); return b; })() : buf;
      lookNpc = null; let best = 0.985; const fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch);
      for(const q of botList){ if(!q.vis) continue; const dx = q.x - px, dz = q.z - pz, d2 = dx * dx + dz * dz, car = q.sp > 8; if(d2 > (car ? cfg.carRange : cfg.npcRange) ** 2) continue; const y = T.height(q.x, q.z) + (car ? 0.1 : 0);
        if(car){ carBuf = grow(carBuf, nc); put(carBuf, nc++, q.x, y, q.z, q.yaw, 0, 0, q.shirt, q.pants); } else { actorBuf = grow(actorBuf, np); put(actorBuf, np++, q.x, y, q.z, q.yaw, q.ph, q.mv, q.shirt, q.pants); }
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
    const LM = { bank: 'bank', exchange: 'chart', shop: 'bag', arcade: 'pad', agency: 'key', hall: 'hall', uni: 'cap', lab: 'flask', ind: 'factory', plant: 'bolt', park: 'tree', dealer: 'car', airport: 'plane' };
    const poly = (c, a) => { c.beginPath(); c.moveTo(a[0], a[1]); for(let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); c.closePath(); c.fill(); };
    const line = (c, w, a) => { c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); for(let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); c.stroke(); };
    const GL = {
      house: c => { poly(c, [-6.5, 0.5, 0, -6, 6.5, 0.5]); c.fillRect(-4.6, 0.5, 9.2, 5.6); }, building: c => { c.fillRect(-4.5, -6, 9, 12); },
      bank: c => { poly(c, [-6.5, -2, 0, -6.5, 6.5, -2]); c.fillRect(-5, -1, 2, 6); c.fillRect(-1, -1, 2, 6); c.fillRect(3, -1, 2, 6); c.fillRect(-6.5, 5, 13, 1.6); },
      chart: c => { line(c, 2.2, [-6, 5, -2, 0, 1, 3, 6, -5]); }, bag: c => { poly(c, [-5, -2, 5, -2, 6, 6, -6, 6]); c.lineWidth = 1.7; c.beginPath(); c.arc(0, -2, 3, Math.PI, 0); c.stroke(); },
      pad: c => { c.fillRect(-6, 2, 12, 3.6); line(c, 2, [0, 2, 0, -3.5]); c.beginPath(); c.arc(0, -5, 2.4, 0, TAU); c.fill(); },
      hall: c => { c.beginPath(); c.arc(0, 1, 5.6, Math.PI, 0); c.fill(); c.fillRect(-6.5, 1.6, 13, 1.8); c.fillRect(-5.2, 3.8, 10.4, 2.2); }, cap: c => { poly(c, [0, -5.5, 7, -1.5, 0, 2.5, -7, -1.5]); c.fillRect(-3.6, 1.6, 7.2, 3.8); },
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
      $('#rwPause').classList.toggle('show', S.running && !S.phone && !uiOpen() && !locked() && !touch.on && !S.loading); $('#rwClock').textContent = clockText(); try{ $('#rwCash').textContent = '$' + Math.round((OS.cash() || 0) / 100).toLocaleString(); }catch(e){}
      const tipEl = $('#rwTip'), tip = lookNpc && S.mode === 'world' ? (G.bot(lookNpc.n).name + ' · ' + lookNpc.b.job + (lookNpc.why ? ' — ' + (G.WHY[lookNpc.why] || '') : '')) : ''; if(tip !== lastTip){ lastTip = tip; tipEl.textContent = tip; tipEl.classList.toggle('show', !!tip); }
    }

    /* ---------------- input ---------------- */
    const uiOpen = () => S.phone || S.loading || !!S.dialog || !!document.querySelector('#windows .win:not(.hidden)');
    const locked = () => document.pointerLockElement === cv;
    const onKey = (e, d) => { if(!S.running || S.phone) return; const k = e.code; if(d && k === 'Escape' && S.dialog){ closeDialog(); return; } if(d && (k === 'KeyM') && !uiOpen()){ openMap(); e.preventDefault(); return; } if(d && k === 'KeyP' && !e.ctrlKey && !e.metaKey){ phone(true); e.preventDefault(); return; }
      if(uiOpen()) return; if(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'Enter'].includes(k)){ keys[k] = d; e.preventDefault(); if(d && (k === 'KeyE' || k === 'Enter')) interact(); } };
    window.addEventListener('keydown', e => onKey(e, true)); window.addEventListener('keyup', e => { keys[e.code] = false; onKey(e, false); });
    window.addEventListener('blur', () => { for(const k in keys) keys[k] = false; });
    cv.addEventListener('click', () => { if(!S.running || uiOpen() || touch.on) return; try{ cv.requestPointerLock(); }catch(e){} });
    document.addEventListener('mousemove', e => { if(!S.running || !locked()) return; P.yaw = wrapA(P.yaw + e.movementX * cfg.sens); P.pitch = clamp(P.pitch - e.movementY * cfg.sens, -1.45, 1.45); });
    document.addEventListener('pointerlockchange', () => { $('#rwPause').classList.toggle('show', S.running && !uiOpen() && !locked() && !touch.on && !S.loading); });
    // touch: left = move stick, right = look
    const stick = $('#rwStick'), knob = stick.firstElementChild; touch.on = matchMedia('(pointer: coarse)').matches; rootEl.classList.toggle('touch', touch.on);
    cv.addEventListener('touchstart', e => { for(const c of e.changedTouches){ if(c.clientX < innerWidth * 0.45 && !touch.stick){ touch.stick = { id: c.identifier, x: c.clientX, y: c.clientY }; stick.style.display = 'block'; stick.style.left = c.clientX - 55 + 'px'; stick.style.top = c.clientY - 55 + 'px'; } else if(!touch.look) touch.look = { id: c.identifier, x: c.clientX, y: c.clientY }; } e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', e => { for(const c of e.changedTouches){ if(touch.stick && c.identifier === touch.stick.id){ const dx = clamp((c.clientX - touch.stick.x) / 50, -1, 1), dy = clamp((c.clientY - touch.stick.y) / 50, -1, 1); touch.mx = dx; touch.mz = dy; knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; } else if(touch.look && c.identifier === touch.look.id){ P.yaw = wrapA(P.yaw + (c.clientX - touch.look.x) * 0.005); P.pitch = clamp(P.pitch - (c.clientY - touch.look.y) * 0.005, -1.45, 1.45); touch.look.x = c.clientX; touch.look.y = c.clientY; } } e.preventDefault(); }, { passive: false });
    const tend = e => { for(const c of e.changedTouches){ if(touch.stick && c.identifier === touch.stick.id){ touch.stick = null; touch.mx = touch.mz = 0; stick.style.display = 'none'; knob.style.transform = ''; } if(touch.look && c.identifier === touch.look.id) touch.look = null; } };
    cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
    $('#rwBtnE').addEventListener('touchstart', e => { e.preventDefault(); interact(); }, { passive: false }); $('#rwBtnJ').addEventListener('touchstart', e => { e.preventDefault(); touch.jump = true; }, { passive: false }); $('#rwBtnR').addEventListener('touchstart', e => { e.preventDefault(); touch.run = !touch.run; $('#rwBtnR').classList.toggle('on', touch.run); }, { passive: false });
    $('#rwPhone').onclick = () => phone(true); $('#rwTravel').onclick = () => openMap();
    $('#rwHelp').onclick = () => $('#rwHelp').classList.remove('show');
    /* a conversation: the clerk's line + one button per service (each opens a WestOS app) + Goodbye. The mouse is released while it is open. */
    function openDialog(n){
      S.dialog = n; if(locked()) document.exitPointerLock(); setPrompt(null); const d = $('#rwDlg');
      d.innerHTML = '<div class="n">' + esc(n.name) + '</div><div class="l">' + esc(n.line) + '</div>' + (n.opts || []).map((o, i) => '<button data-i="' + i + '">' + esc(o.label) + '</button>').join('') + '<button class="bye">' + ((n.opts || []).length ? 'Goodbye' : 'Wave goodbye') + '</button>'; d.classList.add('show');
      d.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => { const o = n.opts[+b.dataset.i]; closeDialog(); try{ OS.open(o.app); }catch(e){} }; });
      d.querySelector('.bye').onclick = () => { closeDialog(); if(!touch.on){ try{ cv.requestPointerLock(); }catch(e){} } };
    }
    function closeDialog(){ S.dialog = null; const d = rootEl && rootEl.querySelector('#rwDlg'); if(d) d.classList.remove('show'); }
    /* M / the Map button: WestMap (the same engine, seen from above) — pick a spot, click again, you are there */
    function openMap(){ if(!S.running || S.loading) return; if(locked()) document.exitPointerLock(); closeDialog(true); try{ OS.open('WestMap'); }catch(e){} }

    /* ---------------- interaction ---------------- */
    function interact(){ if(!S.running || S.loading || S.dialog) return; if(uiOpen()) return; if(curNpc){ openDialog(curNpc); return; } if(curDoor && curDoor.exit){ exitRoom(); return; } if(curDoor && curDoor.info){ if(curDoor.info.enter) enterRoom(curDoor.d, curDoor.info.spec); else if(curDoor.info.go) curDoor.info.go(); } }
    function findInteraction(){
      curNpc = null; curDoor = null; const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      if(S.cell){ let bd = 3.4; S.cell.npcs.forEach(n => { if(Math.abs(n.y - P.y) > 2.4) return; const dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz); if(d < bd && (dx * fx + dz * fz) / (d || 1) > 0.25){ bd = d; curNpc = n; } }); if(curNpc) setPrompt('Talk to ' + curNpc.name, curNpc.opts.length ? curNpc.opts.map(o => o.label.split(' · ')[0]).join(' · ') : ''); else if(S.room && Math.hypot(P.x - S.room.door.x, P.z - S.room.door.z) < 4){ curDoor = { exit: true }; setPrompt('Leave'); } else setPrompt(null); return; }
      if(lookNpc && Math.hypot(lookNpc.x - P.x, lookNpc.z - P.z) < 5){ curNpc = { name: G.bot(lookNpc.n).name, line: outLine(lookNpc), opts: [], bot: lookNpc }; }
      let bd = 3.2; allDoorsNear(P.x, P.z, 3.4).forEach(d => { const dist = Math.hypot(d.x - P.x, d.z - P.z); if(dist < bd){ const i = doorInfo(d); if(i){ bd = dist; curDoor = { d, info: i, dist }; } } });
      if(curDoor){ curNpc = null; setPrompt(curDoor.info.label); } else if(curNpc) setPrompt('Talk to ' + curNpc.name); else setPrompt(null);
    }

    /* ---------------- per-frame update ---------------- */
    function update(dt, t){
      cooldown = Math.max(0, cooldown - dt); if(locked() && uiOpen()) document.exitPointerLock(); const busy = uiOpen() || S.loading; let ix = 0, iz = 0, run = false;
      if(!busy){ ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); run = !!(keys.ShiftLeft || keys.ShiftRight) || touch.run; if(touch.on){ ix += touch.mx; iz += touch.mz; } const l = Math.hypot(ix, iz); if(l > 1){ ix /= l; iz /= l; } if(keys.ArrowLeft && keys.ShiftLeft){ } }
      if(!busy && (keys.ArrowLeft || keys.ArrowRight) && false) P.yaw += 0;
      const sp = (run ? cfg.run : cfg.walk) * (S.cell ? 0.8 : 1), fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = Math.sin(P.yaw), tvx = (rx * ix - fx * iz) * sp, tvz = (rz * ix - fz * iz) * sp, a = Math.min(1, dt * (Math.hypot(tvx, tvz) > 0.1 ? 11 : 9));
      P.vx += (tvx - P.vx) * a; P.vz += (tvz - P.vz) * a;
      const jump = (keys.Space || touch.jump) && !busy ? cfg.jump : 0; touch.jump = false;
      Phys.step(P, dt, { sets: collSets(), disabled: cells.disabled(), ground: S.room ? (() => S.room.gy) : T.height, grav: cfg.grav, jump });
      if(!S.room){ const d = Math.hypot(P.x, P.z), mx = L.radius() + 450; if(d > mx){ P.x *= mx / d; P.z *= mx / d; P.vx = P.vz = 0; } }
      if(S.room && !S.busy){ const r = S.room.door; if((P.x - r.x) * r.nx + (P.z - r.z) * r.nz > -1.5) exitRoom(); }
      const dy = P.y - P.cy; P.cy = Math.abs(dy) > 1.2 ? P.y : P.cy + dy * Math.min(1, dt * 16);   // stairs and kerbs glide instead of snapping
      const spd = Math.hypot(P.vx, P.vz); P.mv = clamp(spd / cfg.run, 0, 1.2); P.bob += dt * spd * 1.9; cellsUpdate(); findInteractionThrottled(t);
      if(net) net.tick({ x: P.x, z: P.z, yaw: P.yaw, mv: P.inside ? 0 : spd / cfg.run, inside: P.inside }, dt);
    }
    let fiAt = 0; const findInteractionThrottled = t => { if(t - fiAt > 60){ fiAt = t; findInteraction(); } };

    /* ---------------- render ---------------- */
    function render(dt, t){
      const dpr = Math.min(window.devicePixelRatio || 1, perfLow() ? 1 : 1.5) * S.scale; gfx.resize(cv.clientWidth, cv.clientHeight, dpr);
      if(!env || t - envAt > 250){ envAt = t; grade = K.skin && K.skin(); env = RW.Env.state(OS.now() + (RW.timeShift || 0), grade && grade.three); S.env = env; }
      st.update(S.room ? S.room.sx : P.x, S.room ? S.room.sz : P.z); st.upload(2); st.step(dt);
      if(t - sunTick > 2000){ sunTick = t; const n2 = nh(); if(n2 !== S.nh){ S.nh = n2; S.nd = G.districtCount(n2); L.setup(n2); T.setup(L.radius()); st.setNH(n2); } if(S.nh) rebuildDyn(); }
      if(t - botsAt > 90000){ botsAt = t; loadBots(); } stepNPCs(t, dt);
      const e = env, bob = Math.sin(P.bob * 2.2) * 0.03 * P.mv, cam = { pos: [P.x, P.cy + cfg.eye + bob, P.z], yaw: P.yaw, pitch: P.pitch, fov: cfg.fov * Math.PI / 180, near: 0.25, far: cfg.far };
      gfx.begin(cam, e, t / 1000);
      if(!S.room){ gfx.sky(e.cloud); gfx.startWorld(); S.drawn = st.draw(P.x, P.z, cfg.far); if(dyn.plots) gfx.draw(dyn.plots, 1, 1); if(dyn.marks) gfx.draw(dyn.marks, 1, 1);
        S.props = st.drawProps(perfLow() ? 260 : 430, perfLow() ? 380 : 570); }                      // trees, lamps, benches: one instanced call per kind
      if(cells.cells.size){ gfx.env = RW.Env.INDOOR; gfx.startWorld(); cells.draw(); gfx.env = e; if(S.cell){ scr.tick(P.x, P.z, t); scr.draw(); } }   // insides: only loaded ones, indoor light
      ensureModels(); const [np, nc] = fillActors(); drawPeople(actorBuf, np); if(nc) drawCars(carBuf, nc);
      if(S.cell){ const ni = fillInside(); if(ni){ gfx.env = RW.Env.INDOOR; drawPeople(inBuf, ni); gfx.env = e; } }
      const fx = grade && grade.fx; if(fx && !P.inside && (fx.kind === 'snow' || fx.kind === 'embers')) gfx.particles(fx, cv.height * 0.9);
      labels(); minimap(t); compass(t); hud(t);
    }
    function loop(t){
      raf = requestAnimationFrame(loop); if(!S.running) return; if(document.hidden || S.phone || performance.now() < S.holdUntil){ last = t; return; } if(gfx.lost){ last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t; try{ update(dt, t); render(dt, t); }catch(err){ if(!S.err){ S.err = 1; console.error('[realworld]', err); if(K.diag) K.diag.error('realworld.frame', err); } }
      frames++; if(t - fpsT > 1000){ S.fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; adapt(t); }
      if(S.loading){ const ok = ringReady() || t - S.t0 > 14000; $('#rwLoad i').style.width = Math.round(Math.min(1, (st.built || 0) / 12) * 100) + '%'; if(ok){ S.loading = false; $('#rwLoad').classList.add('gone'); $('#rwPause').classList.toggle('show', !touch.on); if(!helpShown){ helpShown = true; $('#rwHelp').classList.add('show'); setTimeout(() => $('#rwHelp').classList.remove('show'), 9000); } } }
    }
    /* dynamic resolution + view distance: hold ~50+ fps on weak GPUs without the player touching a setting */
    function adapt(t){ if(S.loading || t - adaptT < 2500) return; if(S.fps < 40){ adaptT = t; if(S.scale > cfg.minScale + 0.01) S.scale = Math.max(cfg.minScale, S.scale - 0.1); else if(st.radius > 4) st.radius -= 1; } else if(S.fps > 57 && (S.scale < 1 || st.radius < (perfLow() ? cfg.perfRadius : cfg.radius))){ adaptT = t + 4000; if(S.scale < 1) S.scale = Math.min(1, S.scale + 0.05); else st.radius += 1; } }

    /* ---------------- public ---------------- */
    function enter(){
      if(S.running) return true; if(!gpuUp()){ toast('The real world needs WebGL 2, which this browser does not have.'); return false; }
      const sp = spawnPoint(); P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.y = T.height(P.x, P.z); S.mode = 'world'; S.cell = null; P.inside = false; P.cy = P.y; P.grounded = true; S.running = true; S.loading = true; S.phone = false; S.t0 = performance.now(); S.scale = 1; env = null;
      screen.classList.add('rw-on'); screen.classList.remove('rw-phone'); $('#rwLoad').classList.remove('gone'); $('#rwFade').classList.remove('on'); try{ OS.homes.watch(); OS.homes.watchMap(true); }catch(e){} loadBots(); botsAt = performance.now();
      if(net) net.start(P.x, P.z); last = performance.now(); fpsT = last; raf = requestAnimationFrame(loop); setTimeout(() => { if(net && !net.on && S.running) net.start(P.x, P.z); }, 4000); return true;
    }
    function exit(){
      if(!S.running) return; S.running = false; cancelAnimationFrame(raf); document.exitPointerLock && document.exitPointerLock(); try{ OS.prefs.set('rwPos', { x: Math.round(S.room ? S.room.ret.x : P.x), z: Math.round(S.room ? S.room.ret.z : P.z), yaw: Math.round(P.yaw * 100) / 100 }); }catch(e){}
      screen.classList.remove('rw-on', 'rw-phone'); S.phone = false; try{ OS.homes.watchMap(false); }catch(e){} gpuDown();
    }
    function phone(on){ if(!S.running) return; S.phone = on; screen.classList.toggle('rw-phone', on); if(on){ document.exitPointerLock && document.exitPointerLock(); $('#rwPause').classList.remove('show'); } else { last = performance.now(); $('#rwPause').classList.toggle('show', !touch.on); } }
    /* fast travel from the map: leave the phone, close nothing else, fade, wait for the streets under the player, fade in */
    function travelTo(x, z, yaw){ if(!S.running) return false; if(S.phone) phone(false); return teleport(x, z, yaw); }
    /* WestMap calls this about once a second while it is open: the world stops drawing under it (no second 3-D scene burning the GPU) */
    const hold = on => { S.holdUntil = on === false ? 0 : performance.now() + 2500; };
    return { enter, exit, phone, active: () => S.running, inPhone: () => S.phone, teleport, travelTo, hold, openMap, state: () => ({ x: P.x, y: P.y, z: P.z, yaw: P.yaw, mode: S.mode, fps: S.fps, scale: S.scale, radius: st && st.radius, chunks: st && st.chunks.size, calls: gfx && gfx.calls, tris: gfx && Math.round(gfx.tris), built: st && st.built, bots: botList.length, others: net ? net.others.size : 0, loading: S.loading, drawn: S.drawn, props: S.props, inside: S.cell ? S.cell.name : null, cells: cells ? cells.cells.size : 0, nh: S.nh }), _P: P, _S: S, _st: () => st, _cells: () => cells };
  };
})(typeof self !== 'undefined' ? self : this);
