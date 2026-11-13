/* THEMES RUNTIME — plugs the theme engine (engine.js + the theme files) into WestOS.
 *   K.skin()            the active theme descriptor (or null = Classic) — works out "scheduled vs picked by hand" from prefs + today's date
 *   OS.skin()           the same, for apps (Kit applies it to each app's own document)
 *   OS.skin3d()         the WebGL grade for the active theme (gl3d.js reads this every frame, so scenes re-colour live)
 *   OS.skins.list()     every theme for the Settings picker, with its date window if it has one
 *   prefs               skin ('auto' | 'default' | a theme id) · seasonal (bool) · accent ('#rrggbb' | null) · skinFx (bool: snow / embers)
 * Preview tools (no code change needed):   ?skin=christmas   ·   ?skindate=2026-12-24   (e.g.  index.html?skindate=2026-11-20 )
 * It also paints the desktop snow / embers canvas and keeps the page's theme-color meta in step. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, T = window.WestThemes; if(!T) return;
  const q = new URLSearchParams(location.search), FORCE = { skin: q.get('skin'), date: q.get('skindate') };
  const now = () => { if(FORCE.date){ const d = new Date(FORCE.date + 'T12:00:00'); if(!isNaN(d)) return d; } return new Date(); };

  let memo = '', cur = null;
  function refresh(){
    const n = now(), p = K.prefs || {}, o = { skin: FORCE.skin || p.skin, seasonal: p.seasonal, accent: p.accent, fx: p.skinFx };
    const k = [o.skin, o.seasonal, o.accent, o.fx, n.getFullYear() + '-' + n.getMonth() + '-' + n.getDate()].join('|');
    if(k !== memo){ memo = k; cur = T.resolve(o, n); } return cur;
  }
  K.skin = refresh;
  OS.skin = () => refresh();
  OS.skin3d = () => { const s = refresh(); return s ? s.three : null; };

  const fmt = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  OS.skins = {
    list(){
      const n = now(), act = refresh();
      return T.list.map(d => { const w = d.schedule ? (T.activeWindow(d, n) && T.nextWindow(d, n)) || T.nextWindow(d, n) : null, live = !!(d.schedule && T.activeWindow(d, n));
        return { id: d.id, name: d.name, blurb: d.blurb || '', mode: d.mode, swatch: d.swatch || [], scheduled: !!d.schedule, live, active: !!act && act.id === d.id,
          when: w ? (live ? 'On now · until ' + fmt(w[1] - 864e5) : fmt(w[0]) + ' – ' + fmt(w[1] - 864e5)) : '' }; });
    },
    scheduledNow(){ const d = T.scheduled(now()); return d ? { id: d.id, name: d.name } : null; }
  };

  /* ---------- apply to this (the shell's) document ---------- */
  const root = document.documentElement, meta = document.querySelector('meta[name=theme-color]'), metaDefault = meta && meta.getAttribute('content');
  let applied = [];
  function applyMain(){
    const s = refresh(); applied.forEach(k => root.style.removeProperty(k)); applied = [];
    root.dataset.skin = s && s.id || '';
    if(s) Object.keys(s.vars).forEach(k => { root.style.setProperty(k, s.vars[k]); applied.push(k); });
    if(meta) meta.setAttribute('content', s && s.themeColor || metaDefault);
    syncFx(s);
  }
  K.applySkin = applyMain;

  /* ---------- desktop particles: snow, embers (a cheap 2D canvas under the windows) ---------- */
  let cv = null, g = null, raf = 0, last = 0, parts = [], kind = '', fxKey = '', W = 0, H = 0, colors = [];
  const rnd = Math.random;
  function size(){ if(!cv) return; const sc = document.getElementById('screen'), r = sc.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 1.5); W = Math.max(2, r.width); H = Math.max(2, r.height); cv.width = Math.round(W * d); cv.height = Math.round(H * d); g.setTransform(d, 0, 0, d, 0, 0); }
  function spawn(p, fresh){
    if(kind === 'snow'){ const r = 1 + rnd() * 2.8; p.r = r; p.vy = 18 + r * 15; p.ph = rnd() * 6.3; p.a = .45 + rnd() * .5; p.x = rnd() * W; p.y = fresh ? rnd() * H : -6; }
    else { const r = 1 + rnd() * 2.2; p.r = r; p.vy = -(14 + rnd() * 38); p.ph = rnd() * 6.3; p.a = .35 + rnd() * .55; p.x = rnd() * W; p.y = fresh ? rnd() * H : H + 6; p.c = colors[(rnd() * colors.length) | 0]; }
    return p;
  }
  function loop(t){
    raf = requestAnimationFrame(loop); if(document.hidden) return; const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
    g.clearRect(0, 0, W, H);
    if(kind === 'snow'){ g.fillStyle = '#fff'; for(const p of parts){ p.ph += dt; p.x += Math.sin(p.ph * .9) * 14 * dt + 4 * dt; p.y += p.vy * dt; if(p.y > H + 6 || p.x > W + 6) spawn(p, false); g.globalAlpha = p.a; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill(); } }
    else { g.globalCompositeOperation = 'lighter'; for(const p of parts){ p.ph += dt * 2; p.x += Math.sin(p.ph) * 10 * dt; p.y += p.vy * dt; if(p.y < -6) spawn(p, false); const f = .6 + .4 * Math.sin(p.ph * 1.7);
        g.fillStyle = p.c; g.globalAlpha = p.a * .16 * f; g.beginPath(); g.arc(p.x, p.y, p.r * 4, 0, 6.2832); g.fill(); g.globalAlpha = p.a * f; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill(); } g.globalCompositeOperation = 'source-over'; }
    g.globalAlpha = 1;
  }
  function stopFx(){ if(raf) cancelAnimationFrame(raf); raf = 0; last = 0; parts = []; kind = ''; fxKey = ''; if(cv){ cv.style.display = 'none'; if(g) g.clearRect(0, 0, W, H); } }
  function syncFx(s){
    const fx = s && s.fx, off = root.classList.contains('reduce-motion') || (K.prefs && K.prefs.skinFx === false) || !fx;
    if(off){ stopFx(); return; }
    const low = root.classList.contains('perf-low'), key = s.key + '|' + low + '|' + (cv ? 1 : 0);
    if(key === fxKey && raf) return;
    if(!cv){ cv = document.createElement('canvas'); cv.id = 'skinfx'; cv.setAttribute('aria-hidden', 'true'); const wd = document.querySelector('.wall-dim'); wd.parentNode.insertBefore(cv, wd.nextSibling); g = cv.getContext('2d'); window.addEventListener('resize', () => { size(); }); }
    stopFx(); fxKey = key; cv.style.display = 'block'; kind = fx.kind === 'embers' ? 'embers' : 'snow'; colors = fx.colors || ['#fff']; size();
    const n = Math.round((kind === 'snow' ? 95 : 48) * Math.max(.6, Math.min(1.6, (W * H) / (1280 * 720))) * (low ? .35 : 1));
    for(let i = 0; i < n; i++) parts.push(spawn({}, true)); raf = requestAnimationFrame(loop);
  }

  /* ---------- keep time-based themes on time: re-check each minute (a window can open or close while the site is up) ---------- */
  let lastKey = (refresh() || {}).key || '';
  setInterval(() => { const k = (refresh() || {}).key || ''; if(k !== lastKey){ lastKey = k; K.emit('prefs', 'skin'); } }, 60000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden){ const k = (refresh() || {}).key || ''; if(k !== lastKey){ lastKey = k; K.emit('prefs', 'skin'); } } });
});
