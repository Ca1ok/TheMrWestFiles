/* REALWORLD · game — the first-person controller: player, collisions, doors and interiors, people & cars, HUD, input, travel, the render loop.
 * Everything heavy lives elsewhere (chunkgen/worker = geometry, gfx = GPU, streamer = what is loaded, net = other players, interiors = rooms, env = sky).
 * EXTEND HERE: BUILDINGS (a landmark → an interior kind), RealWorld.Interiors.register(kind, fn), RealWorld.config (speeds, view distance, field of view), TRAVEL list in travelItems().
 * RealWorld.start(K) is called once by boot.js the first time the player steps outside; it returns the public API (enter / exit / phone / travel …). */
(function(root){
  const RW = root.RealWorld, G = root.WorldGen, BG = root.BuildGen, T = root.RWTerrain, M = root.RWMesh;
  const cfg = RW.config = Object.assign({ radius: 8, perfRadius: 5, fov: 72, walk: 4.4, run: 8.4, jump: 5.6, grav: 17, eye: 1.65, pr: 0.38, sens: 0.0022, far: 1700, npcRange: 230, carRange: 480, minScale: 0.55 }, RW.config || {});
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
      <div id="rwLoc"></div><div id="rwCross"></div><div id="rwTip"></div><div id="rwPrompt"></div><canvas id="rwMap" width="168" height="168"></canvas><div id="rwLabels"></div>
      <div id="rwHelp"><div><b>W A S D</b> walk</div><div><b>Shift</b> run &nbsp; <b>Space</b> jump</div><div><b>Mouse</b> look (click to capture)</div><div><b>E</b> use / open a door</div><div><b>M</b> travel &nbsp; <b>P</b> phone (WestOS)</div><div><b>Esc</b> release the mouse</div></div><div id="rwTravelMenu"></div><div id="rwPause">Click to look around</div>
      <div id="rwTouch"><div id="rwStick"><i></i></div><button id="rwBtnE">E</button><button id="rwBtnJ">⤒</button><button id="rwBtnR">Run</button></div>
      <div id="rwLoad"><div class="t">Stepping outside…</div><div class="bar"><i></i></div></div><div id="rwFade"></div></div>`;
    screen.insertBefore(rootEl, document.getElementById('menubar'));
    const cv = $('#rwc'), S = { running: false, phone: false, mode: 'world', nh: 64, nd: 1, scale: 1, fps: 60, travelOpen: false, loading: true, t0: 0 };
    let gfx = null, st = null, net = null, raf = 0, last = 0, room = null, roomH = null, exitDoor = null, cooldown = 0, toastT = 0, helpShown = false;
    const P = { x: 700, y: 0, z: 560, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, mv: 0, bob: 0, inside: false };
    const keys = {}, touch = { on: false, mx: 0, mz: 0, run: false, jump: false, look: null, stick: null };
    let env = null, envAt = 0, grade = null, dyn = { plots: null, marks: null, sig: '' }, dynCols = [], dynDoors = [], botList = [], botsAt = 0, npcAt = 0, labelsEl = $('#rwLabels'), labelPool = [];
    let actorBuf = new Float32Array(8 * 256), carBuf = new Float32Array(8 * 128), sunTick = 0, frames = 0, fpsT = 0, adaptT = 0, lookNpc = null, curDoor = null, curTerm = null;
    const toast = m => { try{ OS.toast(m); }catch(e){} };
    const perfLow = () => document.documentElement.classList.contains('perf-low');
    const nh = () => { const w = OS.homes.world && OS.homes.world(); const n = w ? Object.keys(w).length : 0; return Math.max(64, n || 512); };
    const homeRec = id => ((OS.homes.world && OS.homes.world()) || {})[id] || {};
    const me = () => OS.homes.uid && OS.homes.uid();

    /* ---------------- setup / teardown of the GPU side (created on first enter, freed on exit so a closed world costs nothing) ---------------- */
    function gpuUp(){
      if(gfx) return true; gfx = RW.GFX.create(cv, { aa: !perfLow() }); if(!gfx) return false; S.nh = nh(); S.nd = G.districtCount(S.nh); T.setup(S.nd);
      st = RW.Streamer.create(gfx, { nh: S.nh, radius: perfLow() ? cfg.perfRadius : cfg.radius, base: 'os/realworld/' }); gfx.onRestore = () => { st.free(); st = RW.Streamer.create(gfx, { nh: S.nh, radius: cfg.radius }); };
      net = RW.Net.create(K); return true;
    }
    function gpuDown(){ if(!gfx) return; try{ if(net) net.stop(); if(st) st.free(); if(roomH) gfx.free(roomH); if(dyn.plots) gfx.free(dyn.plots); if(dyn.marks) gfx.free(dyn.marks); gfx.destroy(); }catch(e){} gfx = st = net = null; roomH = null; dyn = { plots: null, marks: null, sig: '' }; const c2 = cv.cloneNode(false); cv.replaceWith(c2); }

    /* ---------------- spawn / travel ---------------- */
    const front = g => { const s0 = Math.sin(g.ang), c0 = Math.cos(g.ang), sd = g.side > 0 ? 1 : -1; return [-sd * s0, sd * c0]; };
    function spawnPoint(){
      const sp = OS.prefs && OS.prefs.get && OS.prefs.get('rwPos'); if(sp && isFinite(sp.x) && isFinite(sp.z)) return { x: sp.x, z: sp.z, yaw: sp.yaw || 0 };
      const h = OS.homes.home && OS.homes.home(); if(h && h.g){ const f = front(h.g), d = h.g.dp / 2 + 4; return { x: h.g.x + f[0] * d, z: h.g.y + f[1] * d, yaw: Math.atan2(-f[0], f[1]) }; }
      return { x: G.CORE.x, z: G.CORE.y + 24, yaw: Math.PI };
    }
    const poiFront = id => { const p = G.POIS[id], hx = G.CORE.x - p.x, hz = G.CORE.y - p.y, l = Math.hypot(hx, hz) || 1; return { x: p.x + hx / l * 17, z: p.y + hz / l * 17, yaw: Math.atan2(hx / l * -1, hz / l) }; };
    function travelItems(){
      const items = [], h = OS.homes.home && OS.homes.home(); if(h && h.g){ const f = front(h.g), d = h.g.dp / 2 + 4; items.push({ n: 'Home · ' + h.g.addr, x: h.g.x + f[0] * d, z: h.g.y + f[1] * d, yaw: Math.atan2(-f[0], f[1]) }); }
      items.push({ n: 'Town Square', x: G.CORE.x, z: G.CORE.y + 24, yaw: Math.PI }); Object.keys(BUILDINGS).forEach(id => { const f = poiFront(id); items.push({ n: G.POIS[id].n, x: f.x, z: f.z, yaw: f.yaw }); }); items.push({ n: 'Central Park', x: G.POIS.park.x, z: G.POIS.park.y - 36, yaw: 0 });
      const pl = (OS.homes.plots && OS.homes.plots()) || {}, mine = pl[me()] || {}; ['l', 'f'].forEach(k => { if(mine[k]){ const c = G.plotCell(k, me()); items.push({ n: k === 'l' ? 'My laboratory' : 'My factory', x: c.x, z: c.y + c.h / 2 + 6, yaw: Math.PI }); } });
      for(let k = 0; k < S.nd; k++){ const d = G.district(k); items.push({ n: d.name, x: d.cx, z: d.cy + 18, yaw: 0, sub: 'district' }); } return items;
    }
    async function teleport(x, z, yaw){ if(S.mode === 'interior') await leave(true); fade(true); await sleep(280); P.x = x; P.z = z; P.yaw = yaw || 0; P.vx = P.vz = P.vy = 0; P.y = T.height(x, z); if(st) st.update(P.x, P.z); const t0 = performance.now(); while(!ringReady() && performance.now() - t0 < 4500){ await sleep(60); if(st) st.update(P.x, P.z); st && st.upload(3); } fade(false); }
    function ringReady(){ if(!st) return false; let n = 0, ok = 0; for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ n++; const c = st.chunks.get((Math.floor(P.x / 128) + i) + ',' + (Math.floor(P.z / 128) + j)); if(c && c.cur && c.lod <= 1) ok++; } return ok >= 8; }
    const fade = on => { $('#rwFade').classList.toggle('on', !!on); };

    /* ---------------- doors, plots, markers (things that depend on who owns what) ---------------- */
    function rebuildDyn(){
      const w = (OS.homes.world && OS.homes.world()) || {}, pl = (OS.homes.plots && OS.homes.plots()) || {}, my = me(); let sig = Object.keys(pl).map(u => u + (pl[u].l ? 'l' : '') + (pl[u].f ? 'f' : '')).join() + '|';
      const marks = []; st.chunks.forEach(c => c.doors.forEach(d => { if(d.k !== 'house') return; const r = w[d.id]; if(!r) return; const mine = r.o === my || r.t === my, sale = r.o === 'bank' || (r.a > 0 && r.o !== my); if(mine || sale){ marks.push({ d, mine }); sig += d.id + (mine ? 'm' : 's') + ','; } }));
      if(sig === dyn.sig) return; dyn.sig = sig; if(dyn.plots) gfx.free(dyn.plots); if(dyn.marks) gfx.free(dyn.marks); dyn.plots = dyn.marks = null; dynCols = []; dynDoors = [];
      const mb = new M.MB(2048); let any = false;
      Object.keys(pl).forEach(uid => ['l', 'f'].forEach(k => { if(!pl[uid][k]) return; any = true; const c = G.plotCell(k, uid), w2 = Math.min(c.w, 16), d2 = Math.min(c.h, 13), y = T.height(c.x, c.y) + 0.12, lab = k === 'l', h = lab ? 6 : 8, wall = lab ? '#bfe5e3' : '#dcc3ad', roof = lab ? '#4fb3ae' : '#8f6e5a';
        mb.boxAA(c.x - w2 / 2, y - 1, c.y - d2 / 2, c.x + w2 / 2, y + h, c.y + d2 / 2, wall, roof); mb.boxAA(c.x - 1.1, y, c.y + d2 / 2, c.x + 1.1, y + 2.6, c.y + d2 / 2 + 0.08, '#3b3f48'); mb.boxAA(c.x - 2.5, y + h - 1.6, c.y + d2 / 2, c.x + 2.5, y + h - 0.6, c.y + d2 / 2 + 0.1, lab ? [90, 230, 210] : [255, 170, 80], null, 128);
        if(!lab){ mb.boxAA(c.x + w2 / 2 - 2.5, y + h, c.y - 2, c.x + w2 / 2 - 1.3, y + h + 6, c.y - 0.8, '#8f8f98'); dynCols.push(0, c.x + w2 / 2 - 1.9, c.y - 1.4, 0.9, 0.9, 1, 0, 99); }
        dynCols.push(0, c.x, c.y, w2 / 2 + 0.3, d2 / 2 + 0.3, 1, 0, y + h); dynDoors.push({ k: 'plot', kind: k, uid, x: c.x, z: c.y + d2 / 2 + 1.7, nx: 0, nz: 1, y }); }));
      if(any) dyn.plots = gfx.upload(mb.finish());
      if(marks.length){ const m2 = new M.MB(512); marks.forEach(({ d, mine }) => { const px = -d.nz, pz = d.nx, x = d.x + px * 2.4 + d.nx * 0.8, z = d.z + pz * 2.4 + d.nz * 0.8, y = d.y; m2.boxAA(x - 0.05, y, z - 0.05, x + 0.05, y + 3.6, z + 0.05, '#d8d8d8'); const c2 = mine ? [60, 210, 110] : [255, 210, 70]; m2.boxAA(x - 0.5, y + 2.2, z - 0.04, x + 0.5, y + 3.5, z + 0.04, c2, c2, 128); }); dyn.marks = gfx.upload(m2.finish()); }
    }
    const allDoorsNear = (x, z, r) => st.doorsNear(x, z, r).concat(dynDoors.filter(d => Math.hypot(d.x - x, d.z - z) < r));
    function doorInfo(d){
      const my = me();
      if(d.k === 'poi'){ const b = BUILDINGS[d.id]; return b ? { label: 'Enter ' + (d.name || b.name), auto: true, go: () => enterRoom(b.kind, { name: d.name || b.name }, d) } : null; }
      if(d.k === 'house'){ const r = homeRec(d.id); if(r.o === my || r.t === my) return { label: 'Go inside · ' + d.addr + (r.o === my ? ' (yours)' : ' (rented)'), auto: true, go: () => enterRoom('home', { w: d.w, dp: d.dp, beds: d.beds, type: d.type, name: d.addr }, d) };
        const sale = r.o === 'bank' || r.a > 0, who = r.o === 'bank' ? 'City-owned' : r.on ? 'Owned by ' + r.on : 'Private'; return { label: d.addr + ' · ' + d.type + ' · ' + who + (sale ? ' · for sale — E to view' : ' · locked'), go: () => sale ? OS.open('RealEstate') : toast('This home is private.') }; }
      if(d.k === 'plot'){ const lab = d.kind === 'l'; if(d.uid === my) return { label: 'Enter your ' + (lab ? 'laboratory' : 'factory'), auto: true, go: () => enterRoom(lab ? 'plot-lab' : 'plot-factory', {}, d) }; return { label: 'Private ' + (lab ? 'laboratory' : 'factory'), go: () => toast('Only the owner can go in.') }; }
      return null;
    }

    /* ---------------- interiors ---------------- */
    async function enterRoom(kind, ctx, door){
      if(S.mode === 'interior' || cooldown > 0) return; cooldown = 2; fade(true); await sleep(260);
      try{ room = RW.Interiors.build(kind, ctx); }catch(e){ console.warn('[realworld] interior failed', e); fade(false); return; }
      roomH = gfx.upload(room.mesh); exitDoor = door; S.mode = 'interior'; P.inside = true; P.x = room.spawn.x; P.z = room.spawn.z; P.yaw = 0; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.y = 0; env = RW.Env.INDOOR; curDoor = null;
      const nm = $('#rwLoc'); nm.textContent = room.name; nm.classList.add('show'); fade(false);
    }
    async function leave(instant){ if(S.mode !== 'interior') return; if(!instant){ fade(true); await sleep(260); } gfx.free(roomH); roomH = null; room = null; S.mode = 'world'; P.inside = false; cooldown = 2.2; const d = exitDoor; if(d){ P.x = d.x + d.nx * 1.1; P.z = d.z + d.nz * 1.1; P.yaw = Math.atan2(d.nx, -d.nz); P.y = T.height(P.x, P.z); } P.vx = P.vz = 0; env = null; if(!instant) fade(false); }

    /* ---------------- collisions ---------------- */
    const out = { x: 0, z: 0 };
    function pushOBB(c, i, py){ const top = c[i + 7]; if(top > 0 && py > top - 0.25) return; const r = cfg.pr, co = c[i + 5], si = c[i + 6], dx = out.x - c[i + 1], dz = out.z - c[i + 2];
      if(c[i] === 1){ const d = Math.hypot(dx, dz), R = c[i + 3] + r; if(d < R && d > 1e-6){ out.x += dx / d * (R - d); out.z += dz / d * (R - d); } return; }
      const hx = c[i + 3], hz = c[i + 4], lx = dx * co + dz * si, lz = -dx * si + dz * co, qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez; if(d2 >= r * r) return; let nx, nz, pen;
      if(d2 > 1e-9){ const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; } else { const a = hx - Math.abs(lx), b = hz - Math.abs(lz); if(a < b){ nx = lx < 0 ? -1 : 1; nz = 0; pen = a + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = b + r; } }
      out.x += (nx * co - nz * si) * pen; out.z += (nx * si + nz * co) * pen; }
    function collide(x, z){
      out.x = x; out.z = z; const r = cfg.pr;
      if(S.mode === 'interior'){ for(let pass = 0; pass < 2; pass++) room.cols.forEach(b => { const qx = clamp(out.x, b[0], b[2]), qz = clamp(out.z, b[1], b[3]), dx = out.x - qx, dz = out.z - qz, d2 = dx * dx + dz * dz; if(d2 >= r * r) return; if(d2 > 1e-9){ const d = Math.sqrt(d2); out.x += dx / d * (r - d); out.z += dz / d * (r - d); } else { const l = out.x - b[0], rr = b[2] - out.x, u = out.z - b[1], dn = b[3] - out.z, m = Math.min(l, rr, u, dn); if(m === l) out.x = b[0] - r; else if(m === rr) out.x = b[2] + r; else if(m === u) out.z = b[1] - r; else out.z = b[3] + r; } }); return; }
      for(let pass = 0; pass < 2; pass++){ st.nearCols(out.x, out.z, c => { for(let i = 0; i < c.length; i += 8) pushOBB(c, i, P.y); }); if(dynCols.length) for(let i = 0; i < dynCols.length; i += 8) pushOBB(dynCols, i, P.y); }
    }

    /* ---------------- people & cars ---------------- */
    async function loadBots(){ try{ const m = await (RW.botSource ? RW.botSource() : OS.homes.bots()); botList = Object.keys(m || {}).map(id => { const r = m[id], n = +id.slice(1); return { id, n, b: { n, job: r.j || 'baker', thrift: typeof r.th === 'number' ? r.th : 0.5 }, home: r.h ? G.house(+String(r.h).slice(1)) : null, shirt: pack(hsl(G.h32(n, 19) % 360, 55, 52)), pants: pack(hsl(G.h32(n, 21) % 360, 30, 24)), init: 0, x: 0, z: 0, tx: 0, tz: 0, vx: 0, vz: 0, yaw: 0, ph: 0, mv: 0, vis: false, t: 0 }; }); }catch(e){} }
    function stepNPCs(t, dt){
      if(t - npcAt >= 100){ const now = OS.now(), nd = S.nd; npcAt = t; for(const q of botList){ let s; try{ s = G.npcState(q.b, q.home, now, nd); }catch(e){ continue; } const dtt = Math.max(0.05, (t - q.t) / 1000);
        if(!q.init){ q.init = 1; q.vx = q.vz = 0; } else { q.vx += ((s.x - q.tx) / dtt - q.vx) * 0.6; q.vz += ((s.y - q.tz) / dtt - q.vz) * 0.6; } q.tx = s.x; q.tz = s.y; q.t = t; q.moving = s.moving; q.why = s.to && s.to.why; q.dest = s.to && s.to.label; if(!s.moving){ q.vx = q.vz = 0; } } }
      for(const q of botList){ if(!q.init){ q.vis = false; continue; } const e = Math.min(0.25, (t - q.t) / 1000); q.x = q.tx + q.vx * e; q.z = q.tz + q.vz * e; const sp = Math.hypot(q.vx, q.vz); q.sp = sp; q.vis = !!q.moving; if(sp > 0.4){ q.yaw += wrapA(Math.atan2(q.vx, -q.vz) - q.yaw) * Math.min(1, dt * 8); } q.mv = clamp(sp / 4, 0, 1.3); q.ph += dt * sp * 2.4; }
    }
    function fillActors(){
      let np = 0, nc = 0; const px = P.x, pz = P.z, put = (buf, i, x, y, z, yaw, ph, mv, sh, pa) => { const o = i * 8; buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = yaw; buf[o + 4] = ph; buf[o + 5] = mv; buf[o + 6] = sh; buf[o + 7] = pa; };
      const grow = (buf, n) => (n * 8 + 8 > buf.length) ? (() => { const b = new Float32Array(buf.length * 2); b.set(buf); return b; })() : buf;
      if(S.mode === 'interior'){ room.npcs.forEach(n => { actorBuf = grow(actorBuf, np); put(actorBuf, np++, n.x, 0, n.z, n.yaw, 0, 0, pack(M.rgb(n.shirt)), pack(M.rgb(n.pants))); }); return [np, 0]; }
      lookNpc = null; let best = 0.985; const fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch);
      for(const q of botList){ if(!q.vis) continue; const dx = q.x - px, dz = q.z - pz, d2 = dx * dx + dz * dz, car = q.sp > 8; if(d2 > (car ? cfg.carRange : cfg.npcRange) ** 2) continue; const y = T.height(q.x, q.z) + (car ? 0.1 : 0);
        if(car){ carBuf = grow(carBuf, nc); put(carBuf, nc++, q.x, y, q.z, q.yaw, 0, 0, q.shirt, q.pants); } else { actorBuf = grow(actorBuf, np); put(actorBuf, np++, q.x, y, q.z, q.yaw, q.ph, q.mv, q.shirt, q.pants); }
        if(d2 < 400){ const d = Math.sqrt(d2), dot = (dx * fx + dz * fz + (y + 1.2 - (P.y + cfg.eye)) * fy) / d; if(dot > best){ best = dot; lookNpc = q; } } }
      if(net) net.others.forEach(o => { if(o.inside) return; const dx = o.x - px, dz = o.z - pz; if(dx * dx + dz * dz > cfg.npcRange ** 2) return; const h = G.h32(G.hash(o.uid), 5) % 360; actorBuf = grow(actorBuf, np); put(actorBuf, np++, o.x, T.height(o.x, o.z), o.z, o.yaw, o.ph, o.mv, pack(hsl(h, 70, 50)), pack(hsl(h, 20, 25))); });
      return [np, nc];
    }

    /* ---------------- HUD ---------------- */
    function project(x, y, z){ const m = gfx.vp, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if(cw < 0.3) return null; return [(cx / cw * 0.5 + 0.5) * cv.clientWidth, (1 - (cy / cw * 0.5 + 0.5)) * cv.clientHeight, cw]; }
    function labels(){
      const list = []; if(S.mode === 'world' && net) net.others.forEach(o => { if(o.inside) return; const d = Math.hypot(o.x - P.x, o.z - P.z); if(d < 38) list.push({ x: o.x, y: T.height(o.x, o.z) + 2.05, z: o.z, t: o.n, c: 'pl', d }); });
      if(S.mode === 'world') Object.keys(BUILDINGS).forEach(id => { const p = G.POIS[id], d = Math.hypot(p.x - P.x, p.y - P.z); if(d < 140 && d > 6){ const L = BG.landmark(id); list.push({ x: p.x, y: T.height(p.x, p.y) + (L ? L.h : 12) + 2.5, z: p.y, t: p.n, c: 'poi', d }); } });
      list.sort((a, b) => a.d - b.d); const n = Math.min(list.length, 14); while(labelPool.length < n){ const e = document.createElement('div'); labelsEl.appendChild(e); labelPool.push(e); }
      for(let i = 0; i < labelPool.length; i++){ const e = labelPool[i]; if(i >= n){ e.style.display = 'none'; continue; } const l = list[i], p = project(l.x, l.y, l.z); if(!p){ e.style.display = 'none'; continue; } e.style.display = 'block'; if(e._t !== l.t || e._c !== l.c){ e.textContent = l.t; e.className = 'rw-lab ' + l.c; e._t = l.t; e._c = l.c; } e.style.transform = `translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px) translate(-50%,-100%)`; e.style.opacity = l.c === 'poi' ? clamp(1.3 - l.d / 140, 0.25, 1) : 1; }
    }
    const mm = $('#rwMap').getContext('2d'); let mmAt = 0;
    function minimap(t){
      if(t - mmAt < 160) return; mmAt = t; const W = 168, c = mm; c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(84, 84, 82, 0, TAU); c.clip(); c.fillStyle = 'rgba(20,24,20,.72)'; c.fillRect(0, 0, W, W); const sc = 0.62; c.translate(84, 84); c.rotate(-P.yaw); c.scale(sc, sc);
      if(S.mode === 'world' && st){ c.fillStyle = 'rgba(190,190,200,.55)'; st.nearCols(P.x, P.z, cols => { for(let i = 0; i < cols.length; i += 8){ if(cols[i] === 1) continue; const dx = cols[i + 1] - P.x, dz = cols[i + 2] - P.z; if(dx * dx + dz * dz > 14000) continue; c.save(); c.translate(dx, dz); c.rotate(Math.atan2(cols[i + 6], cols[i + 5])); c.fillRect(-cols[i + 3], -cols[i + 4], cols[i + 3] * 2, cols[i + 4] * 2); c.restore(); } });
        Object.keys(BUILDINGS).forEach(id => { const p = G.POIS[id], dx = p.x - P.x, dz = p.y - P.z; if(dx * dx + dz * dz < 20000){ c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(dx, dz, 5, 0, TAU); c.fill(); } });
        c.fillStyle = '#ff9a4a'; for(const q of botList){ if(!q.vis) continue; const dx = q.x - P.x, dz = q.z - P.z; if(dx * dx + dz * dz < 14000){ c.beginPath(); c.arc(dx, dz, 2.6, 0, TAU); c.fill(); } } c.fillStyle = '#5aa0ff'; if(net) net.others.forEach(o => { const dx = o.x - P.x, dz = o.z - P.z; if(!o.inside && dx * dx + dz * dz < 14000){ c.beginPath(); c.arc(dx, dz, 3.4, 0, TAU); c.fill(); } }); }
      c.restore(); c.save(); c.translate(84, 84); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(84, 84, 82, 0, TAU); c.stroke(); c.fillStyle = '#fff'; c.font = '700 11px system-ui'; c.fillText('N', 80 + Math.sin(P.yaw) * 70 - 0, 88 - Math.cos(P.yaw) * 70);
    }
    function districtName(){ if(S.mode === 'interior') return room.name; let best = null, bd = 175; for(let k = 0; k < S.nd; k++){ const d = G.district(k), dd = Math.hypot(d.cx - P.x, d.cy - P.z); if(dd < bd){ bd = dd; best = d.name; } } if(best) return best; if(Math.hypot(G.CORE.x - P.x, G.CORE.y - P.z) < 190) return 'Downtown'; if(Math.hypot(380 - P.x, 410 - P.z) < 200) return 'University Quarter'; if(Math.hypot(1020 - P.x, 640 - P.z) < 200) return 'Industrial Estate'; return 'Countryside'; }
    function clockText(){ const e = env && S.mode === 'world' ? env : RW.Env.state(OS.now() + (RW.timeShift || 0), null), ph = e.phase, NF = RW.Env.NF, hr = ph >= NF ? 6 + (ph - NF) / (1 - NF) * 16 : (22 + ph / NF * 8) % 24, h = Math.floor(hr), m = Math.floor((hr - h) * 60); return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2); }
    function setPrompt(txt, sub){ const e = $('#rwPrompt'); if(!txt){ e.classList.remove('show'); return; } e.innerHTML = (touch.on ? '' : '<kbd>E</kbd>') + '<span>' + esc(txt) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : ''); e.classList.add('show'); }
    let hudT = 0, hudLoc = '', lastTip = '';
    function hud(t){
      if(t - hudT < 250) return; hudT = t; const loc = districtName(); if(loc !== hudLoc){ hudLoc = loc; const e = $('#rwLoc'); e.textContent = loc; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 3200); }
      $('#rwClock').textContent = clockText(); try{ $('#rwCash').textContent = '$' + Math.round((OS.cash() || 0) / 100).toLocaleString(); }catch(e){}
      const tipEl = $('#rwTip'), tip = lookNpc && S.mode === 'world' ? (G.bot(lookNpc.n).name + ' · ' + lookNpc.b.job + (lookNpc.why ? ' — ' + (G.WHY[lookNpc.why] || '') : '')) : ''; if(tip !== lastTip){ lastTip = tip; tipEl.textContent = tip; tipEl.classList.toggle('show', !!tip); }
    }

    /* ---------------- input ---------------- */
    const uiOpen = () => S.phone || S.travelOpen || S.loading || !!document.querySelector('#windows .win:not(.hidden)');
    const locked = () => document.pointerLockElement === cv;
    const onKey = (e, d) => { if(!S.running || S.phone) return; const k = e.code; if(d && k === 'Escape' && S.travelOpen){ travelMenu(false); return; } if(d && (k === 'KeyM') && !uiOpen()){ travelMenu(true); e.preventDefault(); return; } if(d && k === 'KeyP' && !e.ctrlKey && !e.metaKey){ phone(true); e.preventDefault(); return; }
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
    $('#rwPhone').onclick = () => phone(true); $('#rwTravel').onclick = () => travelMenu(!S.travelOpen);
    $('#rwHelp').onclick = () => $('#rwHelp').classList.remove('show');
    function travelMenu(on){ S.travelOpen = on; const m = $('#rwTravelMenu'); m.classList.toggle('show', on); if(on){ document.exitPointerLock && document.exitPointerLock(); const it = travelItems(); m.innerHTML = '<div class="h">Travel <button class="x">×</button></div>' + it.map((x, i) => `<button data-i="${i}">${esc(x.n)}${x.sub ? '<small>' + x.sub + '</small>' : ''}</button>`).join(''); m.querySelector('.x').onclick = () => travelMenu(false); m.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => { const x = it[+b.dataset.i]; travelMenu(false); teleport(x.x, x.z, x.yaw); }; }); } }

    /* ---------------- interaction ---------------- */
    function interact(){ if(!S.running || uiOpen() || S.mode === 'loading') return; if(curTerm){ OS.open(curTerm.app); return; } if(curDoor && curDoor.info) curDoor.info.go(); }
    function findInteraction(){
      curTerm = null; curDoor = null; const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      if(S.mode === 'interior'){ let bd = 2.1; room.terms.forEach(t2 => { const d = Math.hypot(t2.x - P.x, t2.z - P.z); if(d < bd){ bd = d; curTerm = t2; } }); if(!curTerm){ room.npcs.forEach(n => { const d = Math.hypot(n.x - P.x, n.z - P.z); if(d < 2.3 && !curTerm){ setPrompt(n.name, n.line); } }); } else setPrompt(curTerm.hint, curTerm.label);
        if(!curTerm && !room.npcs.some(n => Math.hypot(n.x - P.x, n.z - P.z) < 2.3)) setPrompt(null);
        if(cooldown <= 0 && P.z > room.d - 0.55 && Math.abs(P.x - room.w / 2) < 1.4) leave(false); return; }
      let bd = 3.2; allDoorsNear(P.x, P.z, 3.4).forEach(d => { const dist = Math.hypot(d.x - P.x, d.z - P.z); if(dist < bd){ const i = doorInfo(d); if(i){ bd = dist; curDoor = { d, info: i, dist }; } } });
      if(curDoor){ setPrompt(curDoor.info.label); const sp = Math.hypot(P.vx, P.vz), face = fx * -curDoor.d.nx + fz * -curDoor.d.nz; if(curDoor.info.auto && cooldown <= 0 && curDoor.dist < 1.5 && sp > 1.5 && face > 0.4) curDoor.info.go(); } else setPrompt(null);
    }

    /* ---------------- per-frame update ---------------- */
    function update(dt, t){
      cooldown = Math.max(0, cooldown - dt); const busy = uiOpen() || S.loading; let ix = 0, iz = 0, run = false;
      if(!busy){ ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); run = !!(keys.ShiftLeft || keys.ShiftRight) || touch.run; if(touch.on){ ix += touch.mx; iz += touch.mz; } const l = Math.hypot(ix, iz); if(l > 1){ ix /= l; iz /= l; } if(keys.ArrowLeft && keys.ShiftLeft){ } }
      if(!busy && (keys.ArrowLeft || keys.ArrowRight) && false) P.yaw += 0;
      const sp = (run ? cfg.run : cfg.walk) * (S.mode === 'interior' ? 0.8 : 1), fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = Math.sin(P.yaw), tvx = (rx * ix - fx * iz) * sp, tvz = (rz * ix - fz * iz) * sp, a = Math.min(1, dt * (Math.hypot(tvx, tvz) > 0.1 ? 11 : 9));
      P.vx += (tvx - P.vx) * a; P.vz += (tvz - P.vz) * a;
      const steps = Math.max(1, Math.ceil(Math.hypot(P.vx, P.vz) * dt / 0.25)), sdt = dt / steps; for(let i = 0; i < steps; i++){ collide(P.x + P.vx * sdt, P.z + P.vz * sdt); P.x = out.x; P.z = out.z; }
      if(S.mode === 'world'){ const b = G.bounds(S.nh), pad = 500; if(P.x < b.x0 - pad || P.x > b.x1 + pad || P.z < b.y0 - pad || P.z > b.y1 + pad){ P.x = clamp(P.x, b.x0 - pad, b.x1 + pad); P.z = clamp(P.z, b.y0 - pad, b.y1 + pad); P.vx = P.vz = 0; } }
      const gy = S.mode === 'interior' ? 0 : T.height(P.x, P.z), onG = P.y <= gy + 0.02; if(onG && P.vy <= 0 && (keys.Space || touch.jump) && !busy){ P.vy = cfg.jump; } touch.jump = false;
      P.vy -= cfg.grav * dt; P.y += P.vy * dt; if(P.y <= gy){ P.y = gy; P.vy = 0; } else if(P.vy <= 0 && P.y < gy + 0.25 && onG){ P.y = gy; }
      const spd = Math.hypot(P.vx, P.vz); P.mv = clamp(spd / cfg.run, 0, 1.2); P.bob += dt * spd * 1.9; if(S.mode === 'world') findInteractionThrottled(t);
      else findInteraction();
      if(net && S.mode === 'world') net.tick({ x: P.x, z: P.z, yaw: P.yaw, mv: spd / cfg.run, inside: false }, dt); else if(net && S.mode === 'interior') net.tick({ x: P.x, z: P.z, yaw: P.yaw, mv: 0, inside: true }, dt);
    }
    let fiAt = 0; const findInteractionThrottled = t => { if(t - fiAt > 60){ fiAt = t; findInteraction(); } };

    /* ---------------- render ---------------- */
    function render(dt, t){
      const dpr = Math.min(window.devicePixelRatio || 1, perfLow() ? 1 : 1.5) * S.scale; gfx.resize(cv.clientWidth, cv.clientHeight, dpr);
      if(S.mode === 'world'){
        if(!env || t - envAt > 250){ envAt = t; grade = K.skin && K.skin(); env = RW.Env.state(OS.now() + (RW.timeShift || 0), grade && grade.three); S.env = env; }
        st.update(P.x, P.z); st.upload(2); st.step(dt);
        if(t - sunTick > 2000){ sunTick = t; const n2 = nh(); if(n2 !== S.nh){ S.nh = n2; S.nd = G.districtCount(n2); T.setup(S.nd); st.setNH(n2); } if(S.nh) rebuildDyn(); }
        if(t - botsAt > 90000){ botsAt = t; loadBots(); } stepNPCs(t, dt);
      }
      const e = env || RW.Env.INDOOR, bob = Math.sin(P.bob * 2.2) * 0.03 * P.mv, cam = { pos: [P.x, P.y + cfg.eye + bob, P.z], yaw: P.yaw, pitch: P.pitch, fov: cfg.fov * Math.PI / 180, near: 0.25, far: cfg.far };
      gfx.begin(cam, e, t / 1000);
      if(S.mode === 'world'){ gfx.sky(e.cloud); gfx.startWorld(); S.drawn = st.draw(P.x, P.z, cfg.far); if(dyn.plots) gfx.draw(dyn.plots, 1, 1); if(dyn.marks) gfx.draw(dyn.marks, 1, 1); }
      else { gfx.startWorld(); gfx.draw(roomH, 1, 1); }
      const [np, nc] = fillActors(); gfx.actors('person', actorBuf, np); if(nc) gfx.actors('car', carBuf, nc);
      const fx = grade && grade.fx; if(fx && S.mode === 'world' && (fx.kind === 'snow' || fx.kind === 'embers')) gfx.particles(fx, cv.height * 0.9);
      labels(); minimap(t); hud(t);
    }
    function loop(t){
      raf = requestAnimationFrame(loop); if(!S.running) return; if(document.hidden || S.phone){ last = t; return; } if(gfx.lost){ last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t; try{ update(dt, t); render(dt, t); }catch(err){ if(!S.err){ S.err = 1; console.error('[realworld]', err); if(K.diag) K.diag.error('realworld.frame', err); } }
      frames++; if(t - fpsT > 1000){ S.fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; adapt(t); }
      if(S.loading){ const ok = ringReady() || t - S.t0 > 14000; $('#rwLoad i').style.width = Math.round(Math.min(1, (st.built || 0) / 12) * 100) + '%'; if(ok){ S.loading = false; $('#rwLoad').classList.add('gone'); $('#rwPause').classList.toggle('show', !touch.on); if(!helpShown){ helpShown = true; $('#rwHelp').classList.add('show'); setTimeout(() => $('#rwHelp').classList.remove('show'), 9000); } } }
    }
    /* dynamic resolution + view distance: hold ~50+ fps on weak GPUs without the player touching a setting */
    function adapt(t){ if(S.loading || t - adaptT < 2500) return; if(S.fps < 40){ adaptT = t; if(S.scale > cfg.minScale + 0.01) S.scale = Math.max(cfg.minScale, S.scale - 0.1); else if(st.radius > 4) st.radius -= 1; } else if(S.fps > 57 && (S.scale < 1 || st.radius < (perfLow() ? cfg.perfRadius : cfg.radius))){ adaptT = t + 4000; if(S.scale < 1) S.scale = Math.min(1, S.scale + 0.05); else st.radius += 1; } }

    /* ---------------- public ---------------- */
    function enter(){
      if(S.running) return true; if(!gpuUp()){ toast('The real world needs WebGL 2, which this browser does not have.'); return false; }
      const sp = spawnPoint(); P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.y = T.height(P.x, P.z); S.mode = 'world'; room = null; S.running = true; S.loading = true; S.phone = false; S.t0 = performance.now(); S.scale = 1; env = null;
      screen.classList.add('rw-on'); screen.classList.remove('rw-phone'); $('#rwLoad').classList.remove('gone'); $('#rwFade').classList.remove('on'); try{ OS.homes.watch(); OS.homes.watchMap(true); }catch(e){} loadBots(); botsAt = performance.now();
      if(net) net.start(P.x, P.z); last = performance.now(); fpsT = last; raf = requestAnimationFrame(loop); setTimeout(() => { if(net && !net.on && S.running) net.start(P.x, P.z); }, 4000); return true;
    }
    function exit(){
      if(!S.running) return; S.running = false; cancelAnimationFrame(raf); document.exitPointerLock && document.exitPointerLock(); try{ OS.prefs.set('rwPos', S.mode === 'world' ? { x: Math.round(P.x), z: Math.round(P.z), yaw: Math.round(P.yaw * 100) / 100 } : null); }catch(e){}
      if(S.mode === 'interior'){ S.mode = 'world'; P.inside = false; } screen.classList.remove('rw-on', 'rw-phone'); S.phone = false; S.travelOpen = false; $('#rwTravelMenu').classList.remove('show'); try{ OS.homes.watchMap(false); }catch(e){} gpuDown();
    }
    function phone(on){ if(!S.running) return; S.phone = on; screen.classList.toggle('rw-phone', on); if(on){ document.exitPointerLock && document.exitPointerLock(); $('#rwPause').classList.remove('show'); } else { last = performance.now(); $('#rwPause').classList.toggle('show', !touch.on); } }
    return { enter, exit, phone, active: () => S.running, inPhone: () => S.phone, teleport, state: () => ({ x: P.x, y: P.y, z: P.z, yaw: P.yaw, mode: S.mode, fps: S.fps, scale: S.scale, radius: st && st.radius, chunks: st && st.chunks.size, calls: gfx && gfx.calls, tris: gfx && Math.round(gfx.tris), built: st && st.built, bots: botList.length, others: net ? net.others.size : 0, loading: S.loading, drawn: S.drawn }), _P: P, _S: S, _enterRoom: enterRoom, _leave: leave, _st: () => st };
  };
})(typeof self !== 'undefined' ? self : this);
