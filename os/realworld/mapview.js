/* REALWORLD · mapview — WestMap's renderer. It is NOT a second map: it draws the SAME city as the game, with the SAME engine files (layout.js → chunkgen.js → worker.js → streamer.js → gfx.js),
 * from an orbiting perspective camera. So a building, a road, a park or a tree edited in chunkgen.js / BuildGen / layout.js / props.js shows up in the first-person world AND on the map, with nothing to keep in sync.
 *
 * HOW IT STAYS FAST WITH THE WHOLE CITY ON SCREEN (the same tricks as the game, driven by the camera instead of the player):
 *   · only chunks inside the camera's frustum are requested (S.updateView), the rest stay cached (LRU) so panning back is instant;
 *   · the level of detail follows the distance from the EYE: LOD 0–1 close up, LOD 2–3 mid, LOD 4 (the "map level": every road + building as a plain shape, ~4 KB a chunk) for the far view;
 *   · trees/lamps/benches are instanced and fade out with distance; people, pins, labels and routes are a 2D overlay (cheap at any zoom).
 *
 * API (a drop-in for the old os/lib/maprender.js that WestMap.html was written against):
 *   const R = RealWorld.MapView.create(canvas, WorldGen);   R.view = { x, y: world x / z of the point looked at, k: pixels per metre there, b: bearing (map turned clockwise by b), p: tilt from straight-down, radians }
 *   R.resize() → changed?   R.fit({x0,y0,x1,y1})   R.project(x, y, z) → [sx, sy, scale] | null   R.unproject(px, py) → [x, y] | null   R.pick(px, py) → { x, y, h } on the terrain | null
 *   R.draw(scene, t)   R.setCount(nHouses)   R.stats   R.npcPos / R.pplPos (what was drawn, for hit-testing)   R.destroy() */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, FOV = 40 * Math.PI / 180, TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COL = { mine: '#5bd68a', bank: '#b3b9c4', player: '#7fb2f2', bot: '#f2b676' };
  /* the sky of the game, but never black: at night the map is a dusk you can still read (windows still glow) */
  function mapEnv(e){
    const n = e.night, lift = (a, b) => a.map((v, i) => v + (b[i] - v) * n * 0.85);
    return Object.assign({}, e, { sunCol: lift(e.sunCol, [0.7, 0.74, 0.95]), sky: lift(e.sky, [0.38, 0.44, 0.62]), ground: lift(e.ground, [0.2, 0.2, 0.26]), fog: lift(e.fog, [0.36, 0.44, 0.62]), zenith: lift(e.zenith, [0.12, 0.2, 0.42]), horizon: lift(e.horizon, [0.4, 0.5, 0.7]), fogD: Math.min(e.fogD, 0.00022), night: Math.min(n, 0.4) });
  }
  function create(cv, G){
    const gfx = RW.GFX.create(cv, { aa: true }); if(!gfx) return null; const L = root.RWLayout, T = root.RWTerrain, m4 = RW.GFX.m4;
    const ov = document.createElement('canvas'); ov.style.cssText = 'position:absolute;pointer-events:none;left:0;top:0'; cv.parentNode.insertBefore(ov, cv.nextSibling); const ctx = ov.getContext('2d');
    const R = { view: { x: 0, y: 0, k: 0.5, b: 0, p: 0.9 }, stats: {}, npcPos: [], pplPos: [], loading: 0 }, V = R.view; let nh = 512; L.setup(nh); T.setup(L.radius());
    const st = RW.Streamer.create(gfx, { nh, radius: 1, LOD_AT: [2.2, 4.2, 7, 12], cap: 480, base: root.RW_BASE || '../os/realworld/' });
    let W = 1, H = 1, cam = null, vp = null, key = '', lastT = 0, hy = 0;
    /* ---- the camera: an orbit around (V.x, ground, V.y), D metres away so that 1 metre at the target is V.k pixels ---- */
    function refresh(){
      const k = [V.x, V.y, V.k, V.b, V.p, cv.clientWidth, cv.clientHeight].join(); if(k === key && cam) return; key = k; W = cv.clientWidth || 1; H = cv.clientHeight || 1;
      const tf = Math.tan(FOV / 2), D = H / (2 * V.k * tf), pitch = V.p - Math.PI / 2 + 0.0008, yaw = -V.b, cp = Math.cos(pitch), f = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp], r = [Math.cos(yaw), 0, Math.sin(yaw)];
      hy = T.height(V.x, V.y); const eye = [V.x - f[0] * D, hy - f[1] * D, V.y - f[2] * D], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      cam = { pos: eye, yaw, pitch, fov: FOV, near: Math.max(1.5, D * 0.03), far: clamp(D * 3 + 3500, 4000, 26000), D, f, r, u, tf };
      vp = m4.mul(m4.perspective(FOV, W / H, cam.near, cam.far), m4.view(eye, yaw, pitch).m);
    }
    R.resize = function(){ const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.5), W0 = ov.width, H0 = ov.height; gfx.resize(w, h, dpr); ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); ov.style.left = cv.offsetLeft + 'px'; ov.style.top = cv.offsetTop + 'px'; ov.style.width = w + 'px'; ov.style.height = h + 'px'; key = ''; return W0 !== ov.width || H0 !== ov.height; };
    R.fit = function(b){ const w = cv.clientWidth || 800, h = cv.clientHeight || 600; V.x = (b.x0 + b.x1) / 2; V.y = (b.y0 + b.y1) / 2; V.k = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)) * 0.78; V.b = 0; V.p = 0.9; key = ''; };
    R.project = function(x, y, z){ refresh(); const wy = T.height(x, y) + (z || 0), cx = vp[0] * x + vp[4] * wy + vp[8] * y + vp[12], cy = vp[1] * x + vp[5] * wy + vp[9] * y + vp[13], cw = vp[3] * x + vp[7] * wy + vp[11] * y + vp[15]; if(cw < cam.near) return null; return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H, cam.D / cw]; };
    const ray = (px, py) => { refresh(); const nx = px / W * 2 - 1, ny = 1 - py / H * 2, a = W / H, d = [cam.f[0] + cam.r[0] * nx * cam.tf * a + cam.u[0] * ny * cam.tf, cam.f[1] + cam.r[1] * nx * cam.tf * a + cam.u[1] * ny * cam.tf, cam.f[2] + cam.r[2] * nx * cam.tf * a + cam.u[2] * ny * cam.tf], l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; };
    /* panning uses the plane through the target (stable under the cursor); picking uses the real terrain */
    R.unproject = function(px, py){ const d = ray(px, py); if(d[1] > -0.02) return null; const t = (hy - cam.pos[1]) / d[1]; return [cam.pos[0] + d[0] * t, cam.pos[2] + d[2] * t]; };
    R.pick = function(px, py){ const d = ray(px, py), e = cam.pos, tmax = cam.D * 6 + 2500; let t = 0, step = Math.max(2, cam.D * 0.01), prev = 0;
      for(; t < tmax; t += step){ const x = e[0] + d[0] * t, z = e[2] + d[2] * t; if(e[1] + d[1] * t <= T.height(x, z)){ let a = prev, b = t; for(let i = 0; i < 14; i++){ const m = (a + b) / 2; if(e[1] + d[1] * m <= T.height(e[0] + d[0] * m, e[2] + d[2] * m)) b = m; else a = m; } const x1 = e[0] + d[0] * b, z1 = e[2] + d[2] * b; return { x: x1, y: z1, h: T.height(x1, z1) }; } prev = t; step = Math.min(step * 1.02, cam.D * 0.05 + 4); }
      return null; };
    R.setCount = function(n){ if(n === nh) return false; nh = n; L.setup(n); T.setup(L.radius()); st.setNH(n); key = ''; return true; };
    /* ---- 2D overlay: pins, labels, people ---- */
    const text = (s, x, y, size, col, align) => { ctx.font = '700 ' + size + 'px system-ui,sans-serif'; ctx.textAlign = align || 'center'; ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(8,12,20,.78)'; ctx.strokeText(s, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y); };
    const disc = (x, y, r, fill, stroke) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); if(stroke){ ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke(); } };
    function overlay(S, t){
      const dpr = ov.width / (cv.clientWidth || 1); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); const k = V.k, vis = s => s && s[0] > -30 && s[0] < W + 30 && s[1] > -30 && s[1] < H + 30;
      if(k < 0.5 && S.districts) S.districts.forEach(d => { const s = R.project(d.cx, d.cy, 0); if(vis(s)) text(d.name.toUpperCase(), s[0], s[1], clamp(10 + k * 12, 10, 15), 'rgba(255,255,255,.82)'); });
      (S.plots || (S.plots = {})); if(k > 0.4) for(const uid in S.plots) for(const kd of ['f', 'l']){ if(!S.plots[uid][kd]) continue; const c = S.plotCell(kd, uid), s = R.project(c.x, c.y, 8); if(vis(s)){ const w = Math.max(6, c.w * k * s[2] * 0.5); ctx.fillStyle = kd === 'l' ? 'rgba(82,181,176,.9)' : 'rgba(192,118,74,.9)'; ctx.fillRect(s[0] - w / 2, s[1] - w / 2, w, w); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(s[0] - w / 2, s[1] - w / 2, w, w); } }
      if(k > 0.45){ const r = clamp(k * 2.4, 2, 5.5); for(const e of S.houses){ if(!S.shown(e)) continue; const hs = e.h, kd = S.kind(hs), sale = hs.o === 'bank' || hs.a > 0, mine = kd === 'mine'; if(k > 2.6 && !mine && !sale && !S.filtering) continue; const s = R.project(e.g.x, e.g.y, S.hOf(e.g)); if(!vis(s)) continue;
          if(mine){ disc(s[0], s[1] - 7, 6.5, COL.mine, '#fff'); } else if(sale){ disc(s[0], s[1] - 6, 4.2, '#ffd24a', 'rgba(0,0,0,.45)'); } else disc(s[0], s[1], r, COL[kd] || '#bbb', 'rgba(0,0,0,.35)'); } }
      const boxes = []; if(S.pois) S.pois.forEach(p => { const s = R.project(p.x, p.y, p.h); if(!vis(s) || k < 0.12) return; const r = clamp(k * 9, 9, 14); disc(s[0], s[1], r, p.c, '#fff'); ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(r * 1.05) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.l, s[0], s[1] + 0.5); ctx.textBaseline = 'alphabetic'; if(k > 0.12){ const w = p.n.length * 6.4 + 10, bx = s[0] - w / 2, by = s[1] - r - 18; if(!boxes.some(b => bx < b[0] + b[2] && bx + w > b[0] && by < b[1] + b[3] && by + 14 > b[1])){ boxes.push([bx, by, w, 14]); text(p.n, s[0], s[1] - r - 5, 11.5); } } });   // labels never overlap: the first (most important) one wins
      if(S.npcSel && S.npcSel.route){ const rt = S.npcSel.route; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,170,60,.45)'; ctx.setLineDash([6, 5]); ctx.beginPath(); let a = false; for(const p of rt){ const s = R.project(p[0], p[1], 0.6); if(!s) continue; if(!a){ ctx.moveTo(s[0], s[1]); a = true; } else ctx.lineTo(s[0], s[1]); } ctx.stroke(); ctx.setLineDash([]); if(S.npcSel.rest){ ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3.5; ctx.beginPath(); a = false; for(const p of S.npcSel.rest){ const s = R.project(p[0], p[1], 0.6); if(!s) continue; if(!a){ ctx.moveTo(s[0], s[1]); a = true; } else ctx.lineTo(s[0], s[1]); } ctx.stroke(); } }
      const pos = [], ppl = []; S.npcs.forEach(n => { const s = R.project(n.x, n.y, 1.8); if(!s) return; pos.push(n); if(!vis(s) || k < 0.3) return; disc(s[0], s[1], clamp(k * 1.8, 2.2, 4.4) + (n.moving ? 0.6 : 0), n.c || '#f2a65a', 'rgba(0,0,0,.5)'); }); R.npcPos = pos;
      S.players.forEach(p => { const s = R.project(p.x, p.y, 3); if(!s) return; ppl.push(p); if(!vis(s)) return; disc(s[0], s[1], p.mine ? 7 : 5.5, p.mine ? '#5bd68a' : '#5aa0f0', '#fff'); if(k > 0.9 || p.mine) text(p.name, s[0], s[1] - 11, 11); }); R.pplPos = ppl;
      const pn = performance.now(); (S.vehicles || []).forEach(v => { const f = clamp((pn - v.t0) / v.dur, 0, 1), s = R.project(v.from.x + (v.to.x - v.from.x) * f, v.from.y + (v.to.y - v.from.y) * f, 2); if(!vis(s)) return; disc(s[0], s[1], 6, v.t === 'fire' ? '#ff5a3c' : v.t === 'police' ? '#4a7bff' : '#ffffff', '#222'); if(k > 0.5) text(v.label, s[0], s[1] - 10, 11); });
      const ring = (x, y, z, col) => { const s = R.project(x, y, z); if(!vis(s)) return; const a = 0.5 + 0.5 * Math.sin(t / 220); ctx.beginPath(); ctx.arc(s[0], s[1], 13 + a * 3, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); };
      if(S.sel && S.byId[S.sel]) ring(S.byId[S.sel].g.x, S.byId[S.sel].g.y, S.hOf(S.byId[S.sel].g) * 0.5, '#ffffff');
      if(S.selX){ const x = S.selX; let p = null; if(x.t === 'poi') p = S.pois.find(q => q.id === x.id); else if(x.t === 'npc') p = pos.find(q => q.id === x.id); else if(x.t === 'player') p = ppl.find(q => q.id === x.id); else if(x.t === 'plot'){ const c = S.plotCell(x.kd, x.id); p = { x: c.x, y: c.y, h: 8 }; } if(p) ring(p.x, p.y, p.h || 2, '#ffd24a'); }
      if(S.pin){ const g = S.pin, s = R.project(g.x, g.y, 0); if(vis(s)){ const a = 0.5 + 0.5 * Math.sin(t / 260), col = g.armed ? '#ffd24a' : '#ff5a5f'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 12 + a * 5, 5 + a * 2, 0, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.bezierCurveTo(s[0] - 3, s[1] - 14, s[0] - 14, s[1] - 24, s[0] - 14, s[1] - 38); ctx.arc(s[0], s[1] - 38, 14, Math.PI, 0); ctx.bezierCurveTo(s[0] + 14, s[1] - 24, s[0] + 3, s[1] - 14, s[0], s[1]); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); disc(s[0], s[1] - 38, 5, '#fff');
          const w = Math.max(150, ctx.measureText(g.name || '').width + 28), bx = clamp(s[0] - w / 2, 8, W - w - 8), by = Math.max(8, s[1] - 100); ctx.fillStyle = 'rgba(14,18,28,.92)'; ctx.beginPath(); ctx.roundRect(bx, by, w, 46, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.stroke(); text(g.name || 'Here', bx + w / 2, by + 19, 13); text(g.armed ? 'Click the pin again to travel' : 'Click again to confirm', bx + w / 2, by + 37, 11.5, '#ffd24a'); } }
      if(R.loading < 0.985){ ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, 3); ctx.fillStyle = '#4cc2ff'; ctx.fillRect(0, 0, W * R.loading, 3); }
    }
    /* ---- the frame ---- */
    R.draw = function(S, t){
      const t0 = performance.now(); refresh(); const dt = clamp((t - lastT) / 1000 || 0.016, 0.001, 0.1); lastT = t; if(gfx.lost) return;
      const e = mapEnv(root.RealWorld.Env.state(Date.now(), null)); gfx.begin(cam, e, t / 1000); gfx.sky(1); gfx.startWorld();
      st.updateView({ x: V.x, z: V.y, eye: cam.pos, reach: Math.min(cam.D * 2.4 + 250, L.radius() + 700) }); st.upload(3, 2.2e6); st.step(dt); const drawn = st.draw(V.x, V.y, 0);
      const props = st.drawProps(cam.D * 1.4 + 250, cam.D * 1.9 + 420); R.loading = st.progress();
      overlay(S, t);
      R.stats = { ms: performance.now() - t0, chunks: st.chunks.size, drawn, calls: gfx.calls, tris: Math.round(gfx.tris), props, pending: st.pending, built: st.built, mb: +(st.bytes / 1e6).toFixed(1), dist: Math.round(cam.D) };
    };
    R.destroy = function(){ try{ st.free(); gfx.destroy(); ov.remove(); }catch(e){} };
    R._st = st; R._gfx = gfx; R.resize(); return R;
  }
  RW.MapView = { create, COL };
})(typeof self !== 'undefined' ? self : this);
