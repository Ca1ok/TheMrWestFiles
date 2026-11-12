// Widget: WestMap close-up. Zoomed in enough that you can watch people and NPCs walk their routes (click opens WestMap).
// Camera follows you if you are on the map, otherwise the busiest cluster of moving NPCs, otherwise Downtown.
// Player dots need the live map feed, so it is switched on only while at least one of these widgets is on screen.
(function(){
  let users = 0;
  function acquire(OS){ if(users++ === 0){ try{ OS.homes.watch(); OS.homes.watchMap(true); }catch(e){} } }
  function release(OS){ if(--users <= 0){ users = 0; const open = (OS.openApps && OS.openApps() || []).some(a => (a && a.id || a) === 'WestMap'); if(!open){ try{ OS.homes.watchMap(false); }catch(e){} } } }
  function css(){ if(document.getElementById('wmap-css')) return; const s = document.createElement('style'); s.id = 'wmap-css';
    s.textContent = '.widget.wmap .w{padding:0}.wmap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}'
      + '.wmap .wm-pill{position:absolute;left:10px;bottom:9px;display:flex;gap:7px;align-items:center;max-width:calc(100% - 20px);background:rgba(15,18,22,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;border-radius:999px;padding:4px 10px 4px 5px;font:700 11.5px/1 var(--font);pointer-events:none}'
      + '.wmap .wm-pill .tile{width:18px!important;height:18px!important;border-radius:5px;filter:none}.wmap .wm-pill span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wmap .wm-pill i{font-style:normal;opacity:.75;font-weight:600;white-space:nowrap}'
      + '.widget.b .wmap .wm-pill,.widget.h .wmap .wm-pill{display:none}'; document.head.appendChild(s); }

  (window.__OSW = window.__OSW || []).push({ id: 'map', name: 'WestMap', app: 'WestMap', cls: 'wmap', desc: 'A close-up live map: watch people and NPCs move around town.', sizes: ['h', 'v', 's', 'x3', 'b', 'm', 'l'], on: [],
    mount(el, size, c){
      css(); const OS = c.OS, H = OS.homes, G = H.gen, DAY = 86400000, MIN = 60000, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      el.classList.add('wmap'); el.innerHTML = '<canvas data-cv></canvas><div class="wm-pill">' + c.tile('WestMap') + '<span data-l>WestMap</span><i data-n></i></div>';
      const cv = el.querySelector('[data-cv]'), g = cv.getContext('2d'), L = el.querySelector('[data-l]'), N = el.querySelector('[data-n]');
      let me = null, list = [], byId = {}, bots = {}, botList = [], owners = {}, locs = {}, homesAll = {}, anim = {}, vehicles = [], seenEv = new Set(), firstEv = true;
      let W = 0, Hh = 0, k = 2, cam = { x: G.CORE.x, y: G.CORE.y }, focus = null, focusAt = 0, labelAt = 0, npcPos = [], watching = false, visible = false, dead = false, raf = 0, last = 0, botsAt = 0;
      const ROADS = {}, roadsOf = q => ROADS[q] || (ROADS[q] = G.roads(q)), nd = () => G.districtCount(list.length || 512), isBot = o => /^b\d+$/.test(o), COL = { mine: '#3fd07a', bank: '#8a93a6', player: '#5aa0f0', bot: '#e8a04f' };
      const dark = () => (OS.theme ? OS.theme() : 'dark') !== 'light', kind = hs => hs.o === me ? 'mine' : hs.o === 'bank' ? 'bank' : isBot(hs.o) ? 'bot' : 'player';
      const nameOf = uid => uid === me ? 'You' : (locs[uid] && locs[uid].n) || owners[uid] || 'A player';

      /* ---- data (same sources and maths as the WestMap app) ---- */
      function rebuild(){ const world = H.world(), ids = Object.keys(world); owners = {};
        list = ids.map(id => { let e = byId[id]; if(!e) e = byId[id] = { id, g: H.house(id) }; e.h = world[id]; if(e.h && e.h.o && !isBot(e.h.o) && e.h.o !== 'bank' && e.h.on) owners[e.h.o] = e.h.on; return e; }).filter(e => e.h); }
      function mapData(){ locs = H.locs() || {}; homesAll = H.allHomes() || {}; const now = Date.now(), n = nd();
        Object.keys(locs).forEach(uid => { const l = locs[uid]; if(!l || !l.p || now - l.t > 12 * MIN){ delete anim[uid]; return; }
          const hid = homesAll[uid] && homesAll[uid].h, to = G.playerPlace(l.p, uid, hid), a = anim[uid];
          if(!a) anim[uid] = { place: l.p, hid, cur: to, to, rt: null, t0: 0, dur: 1 };
          else if(a.place !== l.p || a.hid !== hid){ const rt = G.route(a.cur, to, n), len = G.lenOf(rt); anim[uid] = { place: l.p, hid, cur: a.cur, from: a.cur, to, rt: len > 3 ? rt : null, t0: performance.now(), dur: clamp(len / 70 * 1000, 2500, 8000) }; } });
        Object.keys(anim).forEach(uid => { if(!locs[uid] || now - locs[uid].t > 12 * MIN) delete anim[uid]; }); }
      function playerXY(uid, now){ const a = anim[uid]; if(!a) return null;
        if(a.rt){ const f = (now - a.t0) / a.dur; if(f >= 1){ a.rt = null; a.cur = a.to; } else { const p = G.posAlong(a.rt, f); a.cur = { x: p.x, y: p.y, node: a.to.node }; return { x: p.x, y: p.y, moving: true }; } }
        return { x: a.to.x, y: a.to.y, moving: false }; }
      async function loadBots(){ if(!H.ready()) return; botsAt = Date.now(); try{ bots = await H.bots() || {}; botList = Object.keys(bots).map(id => { const r = bots[id]; return { id, rec: r, b: { n: +id.slice(1), job: r.j || 'baker', thrift: typeof r.th === 'number' ? r.th : 0.5 }, home: r.h ? G.house(+String(r.h).slice(1)) : null }; }); }catch(e){} }
      function events(){ const ev = H.events() || {}; Object.keys(ev).forEach(key => { if(seenEv.has(key)) return; seenEv.add(key); const e = ev[key]; if(!firstEv && Date.now() - e.t < 15 * 60000) launch(e); }); firstEv = false; }
      function launch(ev){ const type = ev.k === 'fire' ? 'fire' : ev.k === 'police' ? 'police' : 'ambulance', e = byId[ev.h]; if(!e) return; let best = null, bd = 1e12;
        for(let q = 0; q < nd(); q++){ const s = G.stations(q).find(z => z.t === type); if(!s) continue; const d2 = (s.x - e.g.x) ** 2 + (s.y - e.g.y) ** 2; if(d2 < bd){ bd = d2; best = s; } }
        if(best) vehicles.push({ t: type, from: best, to: e.g, t0: performance.now(), dur: 5000 + Math.min(4000, Math.sqrt(bd) * 18) }); }

      /* ---- sizing, camera ---- */
      function resize(){ const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); W = el.clientWidth || r.width; Hh = el.clientHeight || r.height; if(!W || !Hh) return; cv.width = Math.round(W * d); cv.height = Math.round(Hh * d); g.setTransform(d, 0, 0, d, 0, 0); k = clamp(Math.max(W, Hh) / 200, 1.8, 3.4); }
      const ro = new ResizeObserver(resize); ro.observe(el);
      function pickFocus(pn){
        if(anim[me]){ focus = { t: 'me' }; return; }
        let best = null, bc = 0; const mv = npcPos.filter(p => p.moving);
        for(const a of mv){ let n = 0; for(const b of npcPos) if((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 4900) n++; if(n > bc){ bc = n; best = a; } }
        const pp = Object.keys(anim).filter(u => u !== me).map(u => playerXY(u, pn)).filter(p => p && p.moving)[0];
        focus = pp ? { t: 'xy', x: pp.x, y: pp.y, uid: true } : best ? { t: 'npc', id: best.id } : { t: 'xy', x: G.CORE.x, y: G.CORE.y }; }
      function target(pn){ if(!focus) return cam;
        if(focus.t === 'me'){ const p = playerXY(me, pn); if(p) return p; }
        if(focus.t === 'npc'){ const a = npcPos.find(p => p.id === focus.id); if(a){ let sx = 0, sy = 0, n = 0; for(const b of npcPos) if((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 4900){ sx += b.x; sy += b.y; n++; } return { x: sx / n, y: sy / n }; } }
        return focus.x != null ? focus : cam; }
      function where(){ const C = G.CORE; if(Math.abs(cam.x - C.x) < 112 && Math.abs(cam.y - C.y) < 104) return 'Downtown'; for(const zid of ['uni', 'ind']){ const z = G.ZONES[zid]; if(cam.x > z.x0 - 8 && cam.x < z.x1 + 8 && cam.y > z.y0 - 8 && cam.y < z.y1 + 8) return z.n; }
        let bn = null, bd = 1e12; for(let q = 0; q < nd(); q++){ const D = G.district(q), d2 = (D.cx - cam.x) ** 2 + (D.cy - cam.y) ** 2; if(d2 < bd){ bd = d2; bn = D.name; } } return bn || 'WestMap'; }

      /* ---- drawing (a trimmed copy of the app's renderer, fixed zoom) ---- */
      const sx = x => (x - cam.x) * k + W / 2, sy = y => (y - cam.y) * k + Hh / 2;
      function poly(pts, w, col, dash){ g.beginPath(); for(let i = 0; i < pts.length; i++){ const x = sx(pts[i][0]), y = sy(pts[i][1]); if(i) g.lineTo(x, y); else g.moveTo(x, y); } g.lineWidth = w; g.strokeStyle = col; g.setLineDash(dash || []); g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); g.setLineDash([]); }
      function rr(x, y, w, h, r){ g.beginPath(); if(g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
      function draw(t){
        const d = dark(), pn = performance.now(), now = Date.now(), n = nd(), C = G.CORE, vx0 = cam.x - W / 2 / k, vx1 = cam.x + W / 2 / k, vy0 = cam.y - Hh / 2 / k, vy1 = cam.y + Hh / 2 / k, vis = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
        const roadC = d ? '#2d343c' : '#9aa1a8', casing = d ? '#171b20' : '#7a8087', txt = d ? '#e9dfcf' : '#2a2118';
        const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, d ? '#121b15' : '#d3e4c8'); bg.addColorStop(1, d ? '#0c120e' : '#bfd6b3'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
        if(vis(C.x, C.y, 130)){ g.fillStyle = d ? '#1d232a' : '#c5cbd0'; rr(sx(C.x - 112), sy(C.y - 104), 224 * k, 208 * k, 14 * k); g.fill(); g.strokeStyle = d ? '#3a434d' : '#9aa1a8'; g.lineWidth = 1; g.stroke(); }
        for(const zid of ['uni', 'ind']){ const z = G.ZONES[zid]; if(!vis((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, 200)) continue; g.fillStyle = z.c + (d ? '26' : '30'); rr(sx(z.x0 - 8), sy(z.y0 - 8), (z.x1 - z.x0 + 16) * k, (z.y1 - z.y0 + 16) * k, 10 * k); g.fill(); g.strokeStyle = z.c + '99'; g.lineWidth = 1.2; g.stroke(); }
        for(let q = 0; q < n; q++){ const D = G.district(q); if(!vis(D.cx, D.cy, 80)) continue; g.beginPath(); g.arc(sx(D.cx), sy(D.cy), 76 * k, 0, 7); g.fillStyle = D.color + (D.city ? (d ? '40' : '4d') : (d ? '1e' : '2e')); g.fill(); g.lineWidth = D.city ? 1.6 : 1; g.strokeStyle = D.color + (D.city ? 'aa' : '55'); g.stroke(); }
        const hw = G.highways(n), hk = clamp(k, 0.55, 2.4); hw.forEach(e => poly(e.pts, (e.spur ? 3.6 : e.express ? 7.4 : 6) * hk + 2.4, casing));
        hw.forEach(e => { const w = (e.spur ? 3.6 : e.express ? 7.4 : 6) * hk; poly(e.pts, w, e.express ? (d ? '#6e5530' : '#c9a463') : roadC); if(!e.spur) poly(e.pts, Math.max(1, w * 0.14), d ? '#e9dfcf' : '#fff', [w * 1.6, w * 1.6]); });
        ['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'park'].forEach(id => { const p = G.POIS[id]; if(p) poly([[C.x, C.y], [p.x, p.y]], 3.2 * clamp(k, 0.6, 2), roadC); }); poly([[C.x - 60, C.y - 40], [C.x + 60, C.y - 40], [C.x + 60, C.y + 40], [C.x - 60, C.y + 40], [C.x - 60, C.y - 40]], 2.4 * clamp(k, 0.6, 2), roadC);
        for(let q = 0; q < n; q++){ const D = G.district(q); if(!vis(D.cx, D.cy, 90)) continue; roadsOf(q).forEach(r => { const w = (r.avenue ? 3.4 : 2.6) * clamp(k, 0.5, 3); poly(r.pts, w + 1.6, casing); poly(r.pts, w, roadC); if(k > 2.4) poly(r.pts, Math.max(.8, w * .12), d ? '#c8bda8' : '#fff', [w * 1.4, w * 1.8]); }); }
        for(const id in G.POIS){ if(id === 'hub') continue; const p = G.POIS[id]; if(!vis(p.x, p.y, 20)) continue; const x = sx(p.x), y = sy(p.y), s = 16 * clamp(k, 0.75, 2.2); g.fillStyle = POI_COL[id] || '#7c8696'; rr(x - s / 2, y - s / 2, s, s, s * .24); g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke(); g.fillStyle = '#fff'; g.font = '800 ' + Math.round(s * .6) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(POI_LET[id] || '', x, y + 1); g.textBaseline = 'alphabetic';
          g.fillStyle = txt; g.font = '700 ' + clamp(9.5 * k, 9, 12) + 'px system-ui'; g.fillText(p.n, x, y + s / 2 + 11); }
        const size = Math.max(3.2, 7 * k);
        for(const e of list){ if(!vis(e.g.x, e.g.y, 8)) continue; const x = sx(e.g.x), y = sy(e.g.y), hs = e.h, s = size * (hs.v > 6e7 ? 1.25 : hs.v > 1.5e7 ? 1.1 : 1); g.save(); g.translate(x, y); g.rotate(e.g.ang || 0); g.fillStyle = COL[kind(hs)]; g.fillRect(-s / 2, -s / 2, s, s); if(hs.dm > 0){ g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(-s / 2, -s / 2, s, s * hs.dm / 100); } if(hs.o === me){ g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.strokeRect(-s / 2, -s / 2, s, s); } g.restore();
          if(hs.t){ g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, Math.max(1.2, s * .17), 0, 7); g.fill(); }
          if(hs.f && hs.dm > 0){ const p = 0.6 + 0.4 * Math.sin(t / 130 + e.g.i); g.fillStyle = 'rgba(255,' + Math.round(90 + 70 * p) + ',30,.95)'; g.beginPath(); g.moveTo(x, y - s * (.9 + .3 * p)); g.lineTo(x + s * .42, y + s * .1); g.lineTo(x - s * .42, y + s * .1); g.fill(); } }
        for(let q = 0; q < n; q++){ G.stations(q).forEach(s => { if(!vis(s.x, s.y, 12)) return; const x = sx(s.x), y = sy(s.y), r = Math.max(5, 7 * Math.min(k, 2.2)); g.fillStyle = s.t === 'fire' ? '#e5484d' : s.t === 'police' ? '#3a6fd8' : '#f4f4f4'; rr(x - r, y - r, r * 2, r * 2, r * .35); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke(); }); }
        vehicles = vehicles.filter(v => pn - v.t0 < v.dur + 2500);
        vehicles.forEach(v => { const p = Math.min(1, (pn - v.t0) / v.dur), x = sx(v.from.x + (v.to.x - v.from.x) * p), y = sy(v.from.y + (v.to.y - v.from.y) * p), flash = Math.floor(pn / 160) % 2; g.fillStyle = v.t === 'fire' ? '#ff4d4d' : v.t === 'police' ? (flash ? '#4d8dff' : '#ff4d4d') : '#fff'; g.beginPath(); g.arc(x, y, Math.max(3.5, 4.5 * Math.min(k, 2)), 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke(); });
        /* the NPCs */
        npcPos = []; const nr = clamp(2 + k * 0.9, 3, 6.5);
        for(const nb of botList){ let st; try{ st = G.npcState(nb.b, nb.home, now, n); }catch(e){ continue; } npcPos.push({ id: nb.id, x: st.x, y: st.y, moving: !!st.moving }); if(!vis(st.x, st.y, 10)) continue; const x = sx(st.x), y = sy(st.y);
          g.fillStyle = nb.rec.c || '#e8a04f'; g.beginPath(); g.arc(x, y, nr, 0, 7); g.fill(); g.lineWidth = st.moving ? 1.6 : 1; g.strokeStyle = st.moving ? '#fff' : 'rgba(0,0,0,.55)'; g.stroke(); }
        /* the players */
        for(const uid in anim){ const p = playerXY(uid, pn); if(!p || !vis(p.x, p.y, 30)) continue; const x = sx(p.x), y = sy(p.y), mine = uid === me, r = clamp(4.6 + k * 0.9, 5.5, 9);
          g.fillStyle = mine ? '#3fd07a' : '#5aa0f0'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
          if(mine){ g.strokeStyle = 'rgba(63,208,122,.55)'; g.beginPath(); g.arc(x, y, r + 4 + 2 * Math.sin(t / 260), 0, 7); g.stroke(); }
          const nm = nameOf(uid); g.font = '800 11px system-ui'; g.textAlign = 'center'; const tw = g.measureText(nm).width + 10; g.fillStyle = 'rgba(15,18,22,.78)'; rr(x - tw / 2, y - r - 19, tw, 16, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(nm, x, y - r - 7); }
      }
      const POI_COL = { bank: '#4a6fa8', exchange: '#3fae78', shop: '#d9a441', arcade: '#b36be0', agency: '#c98a62', hall: '#7c8696', park: '#5d8f4a', uni: '#6f7fd0', lab: '#52b5b0', ind: '#c0764a', plant: '#8a6a58' };
      const POI_LET = { bank: 'B', exchange: 'E', shop: 'S', arcade: 'A', agency: 'R', hall: 'C', park: 'P', uni: 'U', lab: 'L', ind: 'F', plant: 'W' };

      /* ---- loop: runs only while the widget is on screen and the tab is visible ---- */
      function frame(t){ raf = 0; if(dead || !visible || document.hidden) return; raf = requestAnimationFrame(frame);
        const gap = document.documentElement.classList.contains('perf-low') ? 66 : 33; if(t - last < gap) return; last = t; if(!W || !Hh){ resize(); if(!W || !Hh) return; }
        const pn = performance.now(); if(!focus || pn - focusAt > 14000){ focusAt = pn; pickFocus(pn); }
        const tg = target(pn), e = 1 - Math.pow(0.001, (gap / 1000) / 2.2); cam.x += (tg.x - cam.x) * e; cam.y += (tg.y - cam.y) * e;
        draw(t); if(pn - labelAt > 1500){ labelAt = pn; L.textContent = H.ready() ? where() : 'Sign in to see people'; const mv = npcPos.filter(p => p.moving).length + Object.keys(anim).filter(u => { const p = playerXY(u, pn); return p && p.moving; }).length; N.textContent = H.ready() && (botList.length || Object.keys(anim).length) ? mv + ' moving' : ''; } }
      function go(){ if(!raf && visible && !dead && !document.hidden) raf = requestAnimationFrame(frame); }
      const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if(visible){ if(!watching){ watching = true; acquire(OS); } if(Date.now() - botsAt > 60000) loadBots(); go(); } else if(watching){ watching = false; release(OS); } }); io.observe(el);
      document.addEventListener('visibilitychange', go);
      const tick = setInterval(() => { if(!visible) return; try{ H.watchMap(true); }catch(e){} mapData(); if(Date.now() - botsAt > 180000) loadBots(); }, 30000);   // the app switches the feed off when it closes; this switches it back on
      function refresh(){ me = H.uid(); rebuild(); mapData(); events(); }
      refresh(); loadBots(); resize();
      const offs = [OS.on('mapdata', () => mapData()), OS.on('world', () => { rebuild(); events(); }), OS.on('auth', () => { refresh(); loadBots(); })];   // the shell only forwards money events to widgets
      return { update(){},
        destroy(){ dead = true; offs.forEach(f => { try{ f(); }catch(e){} }); clearInterval(tick); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', go); cancelAnimationFrame(raf); if(watching){ watching = false; release(OS); } } };
    } });
})();
