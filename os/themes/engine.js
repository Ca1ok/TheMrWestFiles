/* WESTTHEMES — the theme engine (pure: no DOM, so the tests can run it in Node).
 *
 * A theme is one small file in os/themes/ that calls WestThemes.register({...}). Nothing else in the site needs to change when you add one
 * (see os/themes/README.md). A theme can be
 *   - MANUAL   — players pick it in Settings → Themes (every theme can be picked by hand, whenever they like), and/or
 *   - SCHEDULED — it switches itself on during a date window (`schedule`), for everybody who left Settings → Themes on "Automatic".
 *
 * What a theme can restyle:
 *   vars   CSS custom properties (the design tokens in tokens.css: --bg --card --label --tint …). Applied to the shell AND every app.
 *   wall   the default wallpaper (any CSS `background` value) — a wallpaper the player picked themselves always wins.
 *   three  a "grade" for every WebGL scene (casino, WestLab, WestFactory, minigames): sky/fog/light colours, a backdrop gradient, ambient particles.
 *   fx     ambient particles over the desktop (2D) and inside the 3D scenes: snow, embers.
 *   (and os/skins.css for anything CSS-only — menu bar, dock, window glow — scoped with html[data-skin="<id>"]).
 */
(function(root){
  const T = { list: [], byId: Object.create(null), cache: new Map() };

  /* ---------- colour helpers ---------- */
  const hex = c => { c = String(c || '').trim(); const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c); if(!m) return null; let h = m[1]; if(h.length === 3) h = h.split('').map(x => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixRGB = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgba = (a, al) => 'rgba(' + a.map(Math.round).join(',') + ',' + al + ')';
  const unit = c => { const a = Array.isArray(c) ? c : hex(c); return a ? (Array.isArray(c) ? c.slice() : a.map(v => v / 255)) : null; };      // '#rrggbb' → [0..1, 0..1, 0..1]; arrays pass through
  T.color = { hex, toHex, mix: mixRGB, rgba, unit };
  /* a custom accent colour → the three tint tokens */
  T.accentVars = c => { const a = hex(c); if(!a) return null; return { '--tint': toHex(a), '--tint2': toHex(mixRGB(a, [255, 255, 255], .3)), '--tint-dim': rgba(a, .18) }; };

  /* ---------- registry ---------- */
  T.register = function(def){
    if(!def || !/^[a-z0-9-]+$/.test(def.id || '')) throw new Error('WestThemes.register: needs a lowercase id');
    if(def.mode !== 'dark' && def.mode !== 'light') throw new Error('WestThemes.register(' + def.id + '): mode must be "dark" or "light"');
    def.name = def.name || def.id; def.vars = def.vars || {}; def.priority = def.priority || 0;
    if(T.byId[def.id]) T.list.splice(T.list.indexOf(T.byId[def.id]), 1);                  // registering the same id again replaces it
    T.byId[def.id] = def; T.list.push(def); T.cache.clear(); return def;
  };

  /* ---------- the calendar ---------- */
  /* schedule:  { from:[month,day], to:[month,day] }            both days included; a window that wraps the new year (Dec → Jan) is fine
   *            { anchor:[month,day], before:N, after:N }       N days either side of a date (Christmas = Dec 25, 7 before, 7 after)
   *   optional  years:[2026]  → only the windows that START in those years (a one-off event); leave it out to repeat every year.
   * Times are the player's LOCAL midnight → midnight, so "Nov 19" begins when it is Nov 19 where they are. */
  T.window = function(s, year){
    if(!s || (s.years && s.years.indexOf(year) < 0)) return null;
    if(s.anchor){ const m = s.anchor[0] - 1, d = s.anchor[1]; return [new Date(year, m, d - (s.before || 0)).getTime(), new Date(year, m, d + (s.after || 0) + 1).getTime()]; }
    if(s.from && s.to){ const a = new Date(year, s.from[0] - 1, s.from[1]), wraps = s.to[0] < s.from[0] || (s.to[0] === s.from[0] && s.to[1] < s.from[1]); return [a.getTime(), new Date(year + (wraps ? 1 : 0), s.to[0] - 1, s.to[1] + 1).getTime()]; }
    return null;
  };
  /* the window of `def` that contains `now`, or null.  Looks at last year's too, so a Dec→Jan window still works on Jan 1. */
  T.activeWindow = function(def, now){
    if(!def.schedule) return null; const t = +now, y = new Date(t).getFullYear();
    for(const yr of [y, y - 1]){ const w = T.window(def.schedule, yr); if(w && t >= w[0] && t < w[1]) return w; } return null;
  };
  /* the scheduled theme for this moment (highest priority wins; a later-registered theme wins a tie) */
  T.scheduled = function(now){ let best = null; T.list.forEach(def => { if(T.activeWindow(def, now) && (!best || def.priority >= best.priority)) best = def; }); return best; };
  /* the next (or current) window of a scheduled theme — for "Starts in 5 days" labels */
  T.nextWindow = function(def, now){
    if(!def.schedule) return null; const t = +now, y = new Date(t).getFullYear();
    for(const yr of [y - 1, y, y + 1, y + 2]){ const w = T.window(def.schedule, yr); if(w && w[1] > t) return w; } return null;
  };

  /* ---------- 3D grade + particles, normalised once ---------- */
  function norm3(th){
    const o = th.three; if(!o) return null; const u = unit;
    return { id: th.id, k: o.k == null ? .6 : o.k, pk: o.pk == null ? .5 : o.pk, bg: u(o.bg), fog: u(o.fog || o.bg), sky: u(o.sky), ground: u(o.ground), dir: u(o.dir), point: u(o.point), dirMul: o.dirMul == null ? 1 : o.dirMul,
      backdrop: o.backdrop ? o.backdrop.map(s => [s[0], s[1]]) : null, stars: o.stars == null ? !!o.backdrop : !!o.stars,
      fx: th.fx ? { kind: th.fx.kind, colors: (th.fx.colors || ['#ffffff']).map(c => { const a = u(c); return [a[0], a[1], a[2], th.fx.alpha == null ? .9 : th.fx.alpha]; }), rate: th.fx.rate || 30, size: th.fx.size || .012, fall: th.fx.fall == null ? .16 : th.fx.fall, dir: th.fx.dir || -1, shape: th.fx.shape || 'glow', blend: th.fx.blend || 'blend', drag: th.fx.drag == null ? .9 : th.fx.drag, life: th.fx.life || 6 } : null };
  }

  /* ---------- resolve: prefs + date → the descriptor everyone applies (or null = the classic look) ----------
   * opts = { skin:'auto'|'default'|<id>, seasonal:bool, accent:'#rrggbb'|null, fx:bool }   */
  T.resolve = function(opts, now){
    opts = opts || {}; const id = opts.skin, known = id && id !== 'auto' && id !== 'default' && T.byId[id]; let th = null, source = 'default';
    if(known){ th = T.byId[id]; source = 'manual'; }                                       // picked by hand
    else if(id !== 'default' && opts.seasonal !== false){ th = T.scheduled(now); if(th) source = 'scheduled'; }   // "Automatic" (also what an unknown / retired id falls back to)
    const acc = T.accentVars(opts.accent), fxOn = opts.fx !== false;
    if(!th && !acc) return null;
    const key = [th ? th.id : '', source, acc ? acc['--tint'] : '', fxOn ? 1 : 0].join('|');
    let d = T.cache.get(key); if(d) return d;
    const vars = Object.assign({}, th ? th.vars : {}, acc || {});
    d = Object.freeze({ key, id: th ? th.id : '', name: th ? th.name : 'Classic', source, accent: acc ? acc['--tint'] : null, mode: th ? th.mode : null, vars: Object.freeze(vars), wall: th && th.wall || null,
      themeColor: th ? (th.vars['--bg'] || null) : null, fx: fxOn && th && th.fx ? Object.freeze(Object.assign({}, th.fx)) : null, three: (function(){ const g = th ? norm3(th) : null; if(g && !fxOn) g.fx = null; return g && Object.freeze(g); })() });
    T.cache.set(key, d); return d;
  };

  if(typeof module !== 'undefined' && module.exports) module.exports = T; else root.WestThemes = T;
})(typeof window !== 'undefined' ? window : globalThis);
