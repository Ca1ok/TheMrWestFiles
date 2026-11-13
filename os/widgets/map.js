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
      const cv = el.querySelector('[data-cv]'), L = el.querySelector('[data-l]'), N = el.querySelector('[data-n]');
      let me = null, list = [], byId = {}, bots = {}, botList = [], owners = {}, locs = {}, homesAll = {}, anim = {}, vehicles = [], seenEv = new Set(), firstEv = true;
      let W = 0, Hh = 0, k = 2, cam = { x: G.CORE.x, y: G.CORE.y }, focus = null, focusAt = 0, labelAt = 0, npcPos = [], watching = false, visible = false, dead = false, raf = 0, last = 0, botsAt = 0;
      const nd = () => G.districtCount(list.length || 512), isBot = o => /^b\d+$/.test(o);
      const dark = () => (OS.theme ? OS.theme() : 'dark') !== 'light';
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
      function resize(){ W = el.clientWidth; Hh = el.clientHeight; if(!W || !Hh) return; R.resize(W, Hh); k = clamp(Math.max(W, Hh) / 230, 1.5, 3); }
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

      /* ---- drawing: the shared renderer (os/lib/maprender.js), tilted so the buildings stand up ---- */
      const R = MapRender.create(cv, G), V = R.view; V.p = 0.85;
      const kindOf = hs => hs.o === me ? 'mine' : hs.o === 'bank' ? 'bank' : isBot(hs.o) ? 'bot' : 'player';
      function draw(t){ const now = Date.now(), pn = performance.now(), n = nd();
        const npcs = []; for(const nb of botList){ let st; try{ st = G.npcState(nb.b, nb.home, now, n); }catch(e){ continue; } npcs.push({ id: nb.id, x: st.x, y: st.y, moving: !!st.moving, c: nb.rec.c }); }
        const players = []; for(const uid in anim){ const p = playerXY(uid, pn); if(p) players.push({ id: uid, x: p.x, y: p.y, mine: uid === me, name: nameOf(uid) }); }
        vehicles = vehicles.filter(v => pn - v.t0 < v.dur + 2500); npcPos = npcs.map(o => ({ id: o.id, x: o.x, y: o.y, moving: o.moving }));
        R.draw({ dark: dark(), n, houses: list, plots: H.plots() || {}, npcs, players, vehicles, kind: kindOf, me }, t); }
      /* ---- loop: runs only while the widget is on screen and the tab is visible ---- */
      function frame(t){ raf = 0; if(dead || !visible || document.hidden) return; raf = requestAnimationFrame(frame);
        const gap = document.documentElement.classList.contains('perf-low') ? 66 : 33; if(t - last < gap) return; last = t; if(!W || !Hh){ resize(); if(!W || !Hh) return; }
        const pn = performance.now(); if(!focus || pn - focusAt > 14000){ focusAt = pn; pickFocus(pn); }
        const tg = target(pn), e = 1 - Math.pow(0.001, (gap / 1000) / 2.2); cam.x += (tg.x - cam.x) * e; cam.y += (tg.y - cam.y) * e; V.x = cam.x; V.y = cam.y; V.k = k;
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
