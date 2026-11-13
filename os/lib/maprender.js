/* LIB · maprender — draws WestCountry like Apple Maps' Explore view, in 2D or tilted 3D, from a `scene` the caller builds each frame. Used by apps/WestMap.html and os/widgets/map.js.
 *   const R = MapRender.create(canvas, WorldGen);   R.view = { x, y, k, b, p }   (world centre, px per world unit, bearing rad, pitch rad)
 *   R.draw(scene, t)   scene = { dark, n, houses:[{id,g,h}], plots, npcs:[{id,x,y,moving,c}], players:[{id,x,y,mine,name}], vehicles, sel, selX, npcSel, shown(e), kind(h), me, nameOf(uid), layers }
 * One projection does both modes (pitch 0 = flat top-down), so there is a single code path; 3D adds extruded buildings, shadows and haze. Textures are procedural (canvas patterns), nothing is downloaded. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.MapRender = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), CAM = 1700;
  const TH = {      // warm, like the rest of WestOS (see os/tokens.css)
    light: { land: '#f3eee2', hood: '#ece4d2', road: '#fffdf7', edge: '#d9cfb9', hwy: '#f4c984', hwyE: '#c98a3c', exp: '#e8924f', expE: '#b6552c', park: '#d3e3b5', parkE: '#b8cf98', core: '#e6dfd0', coreE: '#d3c9b4', text: '#2a2016', sub: 'rgba(42,32,22,.64)', halo: 'rgba(255,250,240,.9)', roof: '#f6efdf', water: '#b4d5e6', zoneU: '#e3e0ef', zoneI: '#f0decb', plot: '#ddd2bb' },
    dark: { land: '#17120d', hood: '#1e1812', road: '#4a3e31', edge: '#0e0b08', hwy: '#a07a3a', hwyE: '#4f3a18', exp: '#cf7a3c', expE: '#5c2f17', park: '#2a3d29', parkE: '#213220', core: '#251e16', coreE: '#35291d', text: '#f6efdd', sub: 'rgba(246,239,221,.62)', halo: 'rgba(14,11,8,.88)', roof: '#5c4f41', water: '#2c4a5e', zoneU: '#2a2944', zoneI: '#3a2a1c', plot: '#33281e' }
  };
  const cssTint = (() => { let v = '#e8924f', at = 0; return () => { const n = Date.now(); if(n - at > 2000){ at = n; try{ const c = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim(); if(/^#[0-9a-f]{6}$/i.test(c)) v = c; }catch(e){} } return v; }; })();
  const PC = { bank: ['#4a6fa8', 'B'], exchange: ['#3fae78', 'E'], shop: ['#e0a23a', 'S'], arcade: ['#b36be0', 'A'], agency: ['#d08a5d', 'R'], hall: ['#7d8799', 'C'], park: ['#5aa15c', 'P'], uni: ['#6f7fd0', 'U'], lab: ['#4fb3ae', 'L'], ind: ['#c97b4a', 'F'], plant: ['#8f6e5a', 'W'] };
  const POIH = { bank: 30, exchange: 40, shop: 18, arcade: 22, agency: 20, hall: 28, uni: 24, lab: 22, ind: 16, plant: 26 };
  const KIND = { mine: '#5bd68a', bank: '#b3b9c4', player: '#7fb2f2', bot: '#f2b676' };
  const cacheRGB = new Map();
  function rgb(hex){ let c = cacheRGB.get(hex); if(!c){ const h = hex.replace('#', ''), n = h.length === 3 ? h.split('').map(x => x + x).join('') : h; c = [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; cacheRGB.set(hex, c); } return c; }
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')'; };
  const shade = (hex, f) => { const x = rgb(hex); return 'rgb(' + Math.round(clamp(x[0] * f, 0, 255)) + ',' + Math.round(clamp(x[1] * f, 0, 255)) + ',' + Math.round(clamp(x[2] * f, 0, 255)) + ')'; };

  /* ---- procedural textures (tiles → repeating patterns) ---- */
  function tile(sz, fn){ const c = document.createElement('canvas'); c.width = c.height = sz; fn(c.getContext('2d'), sz); return c; }
  const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  function makeTextures(g, dark){
    const T = {};
    T.land = g.createPattern(tile(160, (c, s) => { for(let i = 0; i < 900; i++){ c.fillStyle = (rnd() < .5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (0.018 + rnd() * 0.03) + ')'; c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5); } }), 'repeat');
    T.grass = g.createPattern(tile(96, (c, s) => { for(let i = 0; i < 420; i++){ const a = rnd(); c.strokeStyle = dark ? 'rgba(120,200,140,' + (0.05 + a * 0.08) + ')' : (a < .5 ? 'rgba(80,140,70,' : 'rgba(255,255,255,') + (0.10 + a * 0.12) + ')'; c.lineWidth = 1; const x = rnd() * s, y = rnd() * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - .5) * 3, y - 2 - rnd() * 3); c.stroke(); } }), 'repeat');
    T.water = g.createPattern(tile(64, (c, s) => { c.strokeStyle = dark ? 'rgba(160,210,255,.18)' : 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; for(let i = 0; i < 8; i++){ const x = rnd() * s, y = rnd() * s; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 3, x + 12, y); c.stroke(); } }), 'repeat');
    T.hatch = g.createPattern(tile(14, (c, s) => { c.strokeStyle = dark ? 'rgba(255,200,150,.12)' : 'rgba(150,90,50,.16)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, s); c.lineTo(s, 0); c.moveTo(-3, 3); c.lineTo(3, -3); c.moveTo(s - 3, s + 3); c.lineTo(s + 3, s - 3); c.stroke(); }), 'repeat');
    T.dots = g.createPattern(tile(12, (c, s) => { c.fillStyle = dark ? 'rgba(170,180,255,.18)' : 'rgba(90,100,200,.20)'; c.beginPath(); c.arc(s / 2, s / 2, 1.3, 0, 7); c.fill(); }), 'repeat');
    return T;
  }

  function create(cv, G){
    const g = cv.getContext('2d'), R = { view: { x: 0, y: 0, k: 1, b: 0, p: 0 }, W: 0, H: 0, npcPos: [], pplPos: [], CAM };
    let tint = '#e8924f', cs = 1, sn = 0, cp = 1, sp = 0, vk = 1, vx = 0, vy = 0, th = TH.light, dark = false, tex = null, texDark = null, FC = new Map(), scene = null, t = 0, sel2d = true;
    R.resize = (w, h) => { const d = Math.min(2, devicePixelRatio || 1); R.W = w || cv.clientWidth; R.H = h || cv.clientHeight; cv.width = Math.round(R.W * d); cv.height = Math.round(R.H * d); g.setTransform(d, 0, 0, d, 0, 0); };
    const prep = () => { const v = R.view; cs = Math.cos(v.b); sn = Math.sin(v.b); cp = Math.cos(v.p); sp = Math.sin(v.p); vk = v.k; vx = v.x; vy = v.y; sel2d = v.p < 0.035; };
    /* world (x, y, height z) → [screen x, screen y, perspective scale] or null when behind the camera */
    function P(x, y, z){ const dx = x - vx, dy = y - vy, X = (dx * cs - dy * sn) * vk, Y = (dx * sn + dy * cs) * vk, Z = (z || 0) * vk, Zp = Y * sp + Z * cp, den = CAM - Zp; if(den < CAM * 0.3) return null; const p = CAM / den; return [R.W / 2 + X * p, R.H / 2 + (Y * cp - Z * sp) * p, p]; }
    R.project = P; prep();
    R.unproject = (px, py) => { prep(); const xs = px - R.W / 2, ys = py - R.H / 2, p = 1 + ys * Math.tan(R.view.p) / CAM; if(p < 0.15) return null; const X = xs / p / vk, Y = ys / (p * cp) / vk; return [vx + X * cs + Y * sn, vy - X * sn + Y * cs]; };
    R.fit = b => { const v = R.view; v.b = 0; v.p = 0; v.k = Math.min(R.W / (b.x1 - b.x0), R.H / (b.y1 - b.y0)) * 0.95; v.x = (b.x0 + b.x1) / 2; v.y = (b.y0 + b.y1) / 2; };
    const depth = (x, y) => (x - vx) * sn + (y - vy) * cs;
    const onScreen = (s, m) => s && s[0] > -m && s[1] > -m && s[0] < R.W + m && s[1] < R.H + m;
    const pj = pts => { let a = FC.get(pts); if(!a){ a = pts.map(q => P(q[0], q[1], 0)); FC.set(pts, a); } return a; };

    /* ---- primitives ---- */
    function line(pts, w, col, mn, dash){ const q = pj(pts); g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash(dash || []); const step = sel2d ? q.length : 5; let i = 0;
      while(i < q.length - 1){ if(!q[i]){ i++; continue; } g.beginPath(); g.moveTo(q[i][0], q[i][1]); let j = i, sum = q[i][2], cnt = 1; while(j + 1 < q.length && q[j + 1] && j + 1 - i < step){ j++; g.lineTo(q[j][0], q[j][1]); sum += q[j][2]; cnt++; } if(j > i){ g.lineWidth = Math.max(mn || 1, w * vk * sum / cnt); g.stroke(); } i = j > i ? j : i + 1; }
      g.setLineDash([]); }
    function poly(pts, fill, stroke, lw, pat, alpha){ const q = pts.map(a => P(a[0], a[1], 0)); if(q.some(a => !a)) return; g.beginPath(); q.forEach((a, i) => i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1])); g.closePath(); if(fill){ g.fillStyle = fill; g.fill(); } if(pat){ g.globalAlpha = alpha == null ? 1 : alpha; g.fillStyle = pat; g.fill(); g.globalAlpha = 1; } if(stroke){ g.lineWidth = lw || 1; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); } }
    const rect = (x, y, w, d, a, pad) => { const c = Math.cos(a), s = Math.sin(a), hw = w / 2 + (pad || 0), hd = d / 2 + (pad || 0); return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(o => [x + o[0] * c - o[1] * s, y + o[0] * s + o[1] * c]); };
    function halo(txt, x, y, size, col, wt){ g.font = (wt || 600) + ' ' + size + 'px -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3.2; g.strokeStyle = th.halo; g.strokeText(txt, x, y); g.fillStyle = col || th.text; g.fillText(txt, x, y); g.textBaseline = 'alphabetic'; }
    /* an extruded box: ground shadow, visible walls (back to front), roof. Flat when the camera looks straight down. */
    function box(x, y, w, d, a, h, roof, wall, shadow){
      const base = rect(x, y, w, d, a); if(sel2d || h < 0.5){ const q = base.map(o => P(o[0], o[1], 0)); if(q.some(o => !o)) return; g.beginPath(); q.forEach((o, i) => i ? g.lineTo(o[0], o[1]) : g.moveTo(o[0], o[1])); g.closePath(); g.fillStyle = roof; g.fill(); g.lineWidth = 1; g.strokeStyle = wall; g.stroke(); return; }
      if(shadow !== false){ const sh = rect(x + h * 0.45, y + h * 0.35, w, d, a), q = sh.map(o => P(o[0], o[1], 0)); if(!q.some(o => !o)){ g.beginPath(); q.forEach((o, i) => i ? g.lineTo(o[0], o[1]) : g.moveTo(o[0], o[1])); g.closePath(); g.fillStyle = dark ? 'rgba(0,0,0,.28)' : 'rgba(40,36,28,.16)'; g.fill(); } }
      const b = base.map(o => P(o[0], o[1], 0)), t2 = base.map(o => P(o[0], o[1], h)); if(b.some(o => !o) || t2.some(o => !o)) return;
      const faces = []; for(let i = 0; i < 4; i++){ const j = (i + 1) % 4, mx = (base[i][0] + base[j][0]) / 2, my = (base[i][1] + base[j][1]) / 2, nx = mx - x, ny = my - y, L = Math.hypot(nx, ny) || 1;
        const dx = mx - vx, dy = my - vy, Xf = (dx * cs - dy * sn) * vk, Yf = (dx * sn + dy * cs) * vk, nX = (nx * cs - ny * sn) / L, nY = (nx * sn + ny * cs) / L, vis = nX * (0 - Xf) + nY * (CAM * sp - Yf);
        if(vis > 0) faces.push({ i, j, d: depth(mx, my), f: 0.72 + 0.2 * (-nX * 0.6 - nY * 0.4) }); }
      faces.sort((p, q) => p.d - q.d); faces.forEach(f => { g.beginPath(); g.moveTo(b[f.i][0], b[f.i][1]); g.lineTo(b[f.j][0], b[f.j][1]); g.lineTo(t2[f.j][0], t2[f.j][1]); g.lineTo(t2[f.i][0], t2[f.i][1]); g.closePath(); g.fillStyle = shade(wall, clamp(f.f, 0.55, 1.05)); g.fill(); });
      g.beginPath(); t2.forEach((o, i) => i ? g.lineTo(o[0], o[1]) : g.moveTo(o[0], o[1])); g.closePath(); g.fillStyle = roof; g.fill(); g.lineWidth = 0.8; g.strokeStyle = 'rgba(0,0,0,.12)'; g.stroke(); }
    function glyph(id, cx, cy, s){ g.save(); g.translate(cx, cy); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.2, s * 0.16); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      if(id === 'bank' || id === 'hall'){ g.moveTo(-s, -s * .3); g.lineTo(0, -s * .95); g.lineTo(s, -s * .3); g.closePath(); g.fill(); for(const x of [-.62, 0, .62]) g.fillRect(x * s - s * .12, -s * .1, s * .24, s * .8); g.fillRect(-s, s * .8, s * 2, s * .18); }
      else if(id === 'exchange'){ g.moveTo(-s, s * .6); g.lineTo(-s * .3, -s * .05); g.lineTo(s * .2, s * .35); g.lineTo(s, -s * .65); g.stroke(); g.beginPath(); g.moveTo(s * .45, -s * .7); g.lineTo(s, -s * .65); g.lineTo(s * .92, -s * .15); g.stroke(); }
      else if(id === 'shop'){ g.rect(-s * .75, -s * .25, s * 1.5, s * 1.1); g.fill(); g.beginPath(); g.arc(0, -s * .25, s * .42, Math.PI, 0); g.stroke(); }
      else if(id === 'arcade'){ g.rect(-s, -s * .45, s * 2, s * .95); g.fill(); g.fillStyle = PC.arcade[0]; g.fillRect(-s * .62, -s * .12, s * .5, s * .16); g.fillRect(-s * .45, -s * .3, s * .16, s * .5); g.beginPath(); g.arc(s * .4, -s * .05, s * .13, 0, 7); g.arc(s * .7, s * .12, s * .13, 0, 7); g.fill(); }
      else if(id === 'agency'){ g.moveTo(-s, 0); g.lineTo(0, -s * .9); g.lineTo(s, 0); g.closePath(); g.fill(); g.fillRect(-s * .68, 0, s * 1.36, s * .85); }
      else if(id === 'park'){ g.arc(0, -s * .2, s * .7, 0, 7); g.fill(); g.fillRect(-s * .12, s * .3, s * .24, s * .6); }
      else if(id === 'uni'){ g.moveTo(-s, -s * .2); g.lineTo(0, -s * .75); g.lineTo(s, -s * .2); g.lineTo(0, s * .3); g.closePath(); g.fill(); g.fillRect(-s * .55, s * .1, s * 1.1, s * .5); }
      else if(id === 'lab'){ g.moveTo(-s * .25, -s * .8); g.lineTo(s * .25, -s * .8); g.lineTo(s * .25, -s * .15); g.lineTo(s * .8, s * .75); g.lineTo(-s * .8, s * .75); g.lineTo(-s * .25, -s * .15); g.closePath(); g.fill(); }
      else if(id === 'ind'){ g.moveTo(-s, s * .8); g.lineTo(-s, -s * .1); g.lineTo(-s * .35, -s * .5); g.lineTo(-s * .35, -s * .1); g.lineTo(s * .3, -s * .5); g.lineTo(s * .3, -s * .1); g.lineTo(s, -s * .1); g.lineTo(s, s * .8); g.closePath(); g.fill(); g.fillRect(s * .55, -s * .85, s * .25, s * .7); }
      else { g.moveTo(s * .2, -s); g.lineTo(-s * .55, s * .15); g.lineTo(-s * .05, s * .15); g.lineTo(-s * .2, s); g.lineTo(s * .55, -s * .2); g.lineTo(s * .05, -s * .2); g.closePath(); g.fill(); }
      g.restore(); }
    function pin(x, y, r, col, id, sel, z){ const s = P(x, y, z || 0); if(!s) return; if(z){ const s0 = P(x, y, 0); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s[0], s[1]); g.stroke(); }
      g.beginPath(); g.arc(s[0], s[1] + 1.5, r + 1, 0, 7); g.fillStyle = 'rgba(0,0,0,.18)'; g.fill(); g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = sel ? 3 : 1.6; g.strokeStyle = sel ? tint : '#fff'; g.stroke(); glyph(id, s[0], s[1], r * 0.5); }

    /* ---- the frame ---- */
    R.draw = (sc, tt) => {
      scene = sc; tint = sc.tint || cssTint(); t = tt || 0; dark = !!sc.dark; th = dark ? TH.dark : TH.light; if(!tex || texDark !== dark){ tex = makeTextures(g, dark); texDark = dark; } prep(); FC = new Map();
      const W = R.W, H = R.H, v = R.view, k = vk, n = sc.n || 8, C = G.CORE, GE = G.GEO, flat = sel2d, items = [];
      g.clearRect(0, 0, W, H); g.fillStyle = th.land; g.fillRect(0, 0, W, H);
      try{ const o = flat ? new DOMMatrix().translate(-vx * k + W / 2, -vy * k + H / 2) : new DOMMatrix(); tex.land.setTransform(o); tex.grass.setTransform(o); tex.hatch.setTransform(o); tex.dots.setTransform(o); tex.water.setTransform(o); }catch(e){}
      g.fillStyle = tex.land; g.fillRect(0, 0, W, H);
      const near = (x, y, r) => { const s = P(x, y, 0); return s && s[0] > -r * k * s[2] - 40 && s[1] > -r * k * s[2] - 40 && s[0] < W + r * k * s[2] + 40 && s[1] < H + r * k * s[2] + 40; };
      /* land use: neighbourhoods, greens, the downtown, the two campuses */
      const vd = []; for(let q = 0; q < n; q++){ const D = G.district(q); if(near(D.cx, D.cy, 170)) vd.push(q); }
      vd.forEach(q => { const fp = G.footprint(q), D = G.district(q), pts = fp.map(a => P(a[0], a[1], 0)); if(pts.some(a => !a)) return; g.beginPath(); pts.forEach((a, i) => i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1])); g.closePath(); const rad = 14 * k * pts[0][2];
        g.fillStyle = mix(th.hood, D.color, dark ? 0.1 : 0.07); g.strokeStyle = g.fillStyle; g.lineWidth = rad * 1.6; g.lineJoin = 'round'; g.fill(); g.stroke(); });
      vd.forEach(q => { G.parks(q).forEach(pk => { poly(pk, th.park, th.parkE, 1.2 * Math.min(2, k), tex.grass, 1); }); });
      { const z = C, s0 = P(z.x, z.y, 0); if(s0) poly([[z.x - 112, z.y - 104], [z.x + 112, z.y - 104], [z.x + 112, z.y + 104], [z.x - 112, z.y + 104]], th.core, th.coreE, 1.4); }
      { const pp = G.POIS.park; poly(rect(pp.x, pp.y, 96, 62, 0), th.park, th.parkE, 1.4, tex.grass, 1); poly(rect(pp.x + 18, pp.y + 6, 30, 18, 0.3), th.water, 'rgba(60,120,170,.4)', 1.2, tex.water, 1); }
      for(const zid of ['uni', 'ind']){ const zz = G.ZONES[zid], r = [[zz.x0 - 8, zz.y0 - 8], [zz.x1 + 8, zz.y0 - 8], [zz.x1 + 8, zz.y1 + 8], [zz.x0 - 8, zz.y1 + 8]]; poly(r, zid === 'uni' ? th.zoneU : th.zoneI, zz.c + '88', 1.2, zid === 'uni' ? tex.dots : tex.hatch, 1); }

      /* roads: every casing first, then every fill, so junctions merge like a real map */
      const loc = [], hw = G.highways(n), lw = { loc: 4.2, ave: 6 }; const ringPts = [[C.x - 60, C.y - 40], [C.x + 60, C.y - 40], [C.x + 60, C.y + 40], [C.x - 60, C.y + 40], [C.x - 60, C.y - 40]];
      loc.push({ pts: ringPts, w: 4 }); ['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'park'].forEach(id => { const p = G.POIS[id]; loc.push({ pts: [[C.x, C.y], [p.x, p.y]], w: 4 }); });
      vd.forEach(q => { G.roads(q).forEach(r => loc.push({ pts: r.pts, w: r.avenue ? lw.ave : lw.loc })); });
      const hws = hw.map(e => ({ pts: e.pts, w: e.spur ? 4.6 : e.express ? 7 : e.link ? 5 : 6, e }));
      loc.forEach(r => line(r.pts, r.w + 1.8, th.edge, 2.2)); loc.forEach(r => line(r.pts, r.w, th.road, 1.2));
      vd.forEach(q => G.roadEnds(q).forEach(pair => pair.forEach(e => { const s = P(e[0], e[1], 0); if(!s) return; const rr = 4.2 * k * s[2]; g.beginPath(); g.arc(s[0], s[1], Math.max(2.2, rr * 0.5 + 1.6), 0, 7); g.fillStyle = th.edge; g.fill(); g.beginPath(); g.arc(s[0], s[1], Math.max(1.4, rr * 0.5 + 0.2), 0, 7); g.fillStyle = th.road; g.fill(); })));
      hws.forEach(r => line(r.pts, r.w + 1.8, r.e.express ? th.expE : th.hwyE, 2.8)); hws.forEach(r => line(r.pts, r.w, r.e.express ? th.exp : th.hwy, 1.6));
      { const s = P(C.x, C.y, 0); if(s){ const rr = Math.max(4, 9 * k * s[2]); g.beginPath(); g.arc(s[0], s[1], rr + 1.5, 0, 7); g.fillStyle = th.edge; g.fill(); g.beginPath(); g.arc(s[0], s[1], rr, 0, 7); g.fillStyle = th.road; g.fill(); g.beginPath(); g.arc(s[0], s[1], rr * 0.45, 0, 7); g.fillStyle = th.park; g.fill(); } }
      /* street names along the roads (flat or lightly tilted views, close in) */
      if(k > 2.1 && v.p < 0.9){ vd.forEach(q => { const rs = G.roads(q); const lab = (pa, pb, name) => { const a = P(pa[0], pa[1], 0), b = P(pb[0], pb[1], 0); if(!a || !b) return; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); g.font = '600 10px -apple-system,system-ui,sans-serif'; const tw = g.measureText(name).width; if(L < tw + 18 || !onScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0)) return; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if(ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.rotate(ang); halo(name, 0, 0, 10, th.sub, 600); g.restore(); };
          rs.forEach(r => { if(r.avenue){ lab(r.pts[Math.floor(r.pts.length * 0.2)], r.pts[Math.floor(r.pts.length * 0.4)], G.streetName(q, 4)); } else { const m = r.pts.length, i0 = Math.floor(m * 0.62), i1 = Math.floor(m * 0.82); lab(r.pts[i0], r.pts[i1], G.streetName(q, r.r)); } }); }); }

      /* things that stand on the map: depth-sorted so 3D overlaps correctly */
      const add = (x, y, fn) => items.push({ d: depth(x, y), fn });
      const cb = G.coreBlocks(); cb.forEach(b => { if(!near(b.x, b.y, 20)) return; add(b.x, b.y, () => { const base = dark ? '#5d646e' : mix('#e6e2da', '#cfd3da', b.tone); box(b.x, b.y, b.w, b.d, 0, b.h, base, shade(base, 0.86)); }); });
      const hs = sc.houses || []; const hz = Math.max(3.4, 0), kindOf = sc.kind || (() => 'bot');
      hs.forEach(e => { const gg = e.g, s = P(gg.x, gg.y, 0); if(!onScreen(s, 40)) return; const hv = e.h, on = !sc.shown || sc.shown(e), col = KIND[kindOf(hv)] || KIND.bot;
        add(gg.x, gg.y, () => { g.globalAlpha = on ? 1 : 0.18; const roof = hv.o === 'bank' ? mix(th.roof, col, 0.55) : mix(th.roof, col, dark ? 0.55 : 0.78), wall = shade(dark ? mix('#6a717b', col, .5) : mix('#e8e2d6', col, .5), dark ? 0.9 : 0.95), hh = gg.ht * (hv.v > 6e7 ? 1.25 : 1);
          if(flat){ const sz = Math.max(3.2, 0), ww = Math.max(gg.w * k, 4), dd = Math.max(gg.dp * k, 4); if(gg.w * k < 4){ const c = P(gg.x, gg.y, 0); g.fillStyle = col; g.fillRect(c[0] - 2.2, c[1] - 2.2, 4.4, 4.4); } else box(gg.x, gg.y, gg.w, gg.dp, gg.ang, 1, roof, shade(col, 0.72)); }
          else box(gg.x, gg.y, gg.w, gg.dp, gg.ang, hh, roof, wall);
          if(hv.dm > 0){ const c = P(gg.x, gg.y, flat ? 0 : hh); if(c){ g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(c[0] - 4, c[1] - 4, 8, 8 * hv.dm / 100); } }
          const top = P(gg.x, gg.y, flat ? 0 : hh + 2); if(top && k * top[2] > 0.9){ if(hv.o === sc.me){ g.strokeStyle = '#5bd68a'; g.lineWidth = 2; g.beginPath(); g.arc(top[0], top[1], Math.max(5, gg.w * k * top[2] * 0.75), 0, 7); g.stroke(); }
            if(hv.t){ g.fillStyle = '#fff'; g.beginPath(); g.arc(top[0], top[1], Math.max(1.4, 2 * top[2]), 0, 7); g.fill(); }
            if(hv.a > 0 && hv.o !== 'bank'){ g.fillStyle = '#ffd24a'; g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 0.8; const fx = top[0] + 3, fy = top[1] - (flat ? 5 : 9); g.beginPath(); g.moveTo(fx, fy + 8); g.lineTo(fx, fy); g.lineTo(fx + 7, fy + 2.5); g.lineTo(fx, fy + 5); g.stroke(); g.fill(); }
            if(hv.rh > 0 && !hv.t && k > 1.4){ g.fillStyle = '#34c759'; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.arc(top[0] - 4, top[1] - (flat ? 3 : 8), 2.6, 0, 7); g.fill(); g.stroke(); }
            if(hv.f && hv.dm > 0){ const p2 = 0.6 + 0.4 * Math.sin(t / 130 + gg.i); g.fillStyle = 'rgba(255,' + Math.round(90 + 70 * p2) + ',30,.95)'; g.beginPath(); g.moveTo(top[0], top[1] - 14 * (0.8 + 0.3 * p2)); g.lineTo(top[0] + 5, top[1] - 2); g.lineTo(top[0] - 5, top[1] - 2); g.fill(); } }
          g.globalAlpha = 1; }); });
      /* trees in the greens */
      if(k > 1.0) vd.forEach(q => G.parks(q).forEach((pk, pi) => { for(let a = 0; a < 3; a++) for(let b = 0; b < 4; b++){ const u = -9 + a * 9 + ((q * 7 + a * 3 + b) % 5 - 2), vv = (26 + b * 15 + ((q * 3 + b * 5 + a) % 4)) * (pi ? 1 : -1), p = G.loc(q, u, vv); add(p[0], p[1], () => { const s0 = P(p[0], p[1], 0), s1 = P(p[0], p[1], flat ? 0 : 7); if(!s0 || !s1) return; const r = Math.max(2.4, 4.2 * k * s1[2]); if(!flat){ g.strokeStyle = dark ? '#3a2d22' : '#7b5b3a'; g.lineWidth = Math.max(1, 1.2 * k); g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); } g.beginPath(); g.arc(s1[0], s1[1], r, 0, 7); g.fillStyle = dark ? '#3f7a52' : '#7fba6a'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = dark ? '#2b5539' : '#5d9a52'; g.stroke(); }); } }));
      /* downtown buildings, the two campuses */
      for(const id in G.POIS){ if(id === 'hub' || id === 'park') continue; const p = G.POIS[id]; if(!near(p.x, p.y, 40)) continue; const hh = POIH[id] || 18, col = PC[id][0]; add(p.x, p.y, () => { box(p.x, p.y, 24, 18, 0, hh, mix(th.roof, col, 0.35), mix('#e8e4da', col, 0.3)); }); }
      const plots = sc.plots || {}; for(const uid in plots) for(const kd of ['f', 'l']){ if(!plots[uid][kd]) continue; const c = G.plotCell(kd, uid); if(!near(c.x, c.y, 30)) continue; const mine = uid === sc.me, zc = kd === 'f' ? G.ZONES.ind.c : G.ZONES.uni.c; add(c.x, c.y, () => { box(c.x, c.y, c.w * 0.86, c.h * 0.8, 0, kd === 'f' ? 11 : 8, mine ? '#8fe0ad' : mix(th.roof, zc, 0.55), mine ? '#4fb87a' : mix('#e4dfd5', zc, 0.45)); }); }
      for(let q of vd) G.stations(q).forEach(s => { if(k < 1.1) return; add(s.x, s.y, () => { const c = s.t === 'fire' ? '#e5484d' : s.t === 'police' ? '#3a6fd8' : '#f4f4f4'; box(s.x, s.y, 12, 9, 0, 7, c, shade(c, 0.8)); }); });
      items.sort((a, b) => a.d - b.d); items.forEach(i => i.fn());

      /* selection under the dynamic things */
      const ring = (x, y, r, col, lw) => { const s = P(x, y, 0); if(!s) return; g.strokeStyle = col; g.lineWidth = lw || 2.4; g.beginPath(); g.ellipse(s[0], s[1], r * s[2], r * s[2] * (flat ? 1 : Math.max(0.35, cp)), 0, 0, 7); g.stroke(); };
      if(sc.sel){ const e = (sc.houses || []).find(x => x.id === sc.sel); if(e){ const pu = 1 + 0.1 * Math.sin(t / 220); ring(e.g.x, e.g.y, Math.max(11, e.g.w * k * 0.9) * pu, tint, 3); } }
      const X = sc.selX; if(X && X.t === 'poi'){ const p = G.POIS[X.id]; ring(p.x, p.y, 22, tint, 3); } if(X && X.t === 'plot'){ const c = G.plotCell(X.kd, X.id); ring(c.x, c.y, 16, tint, 3); }
      /* emergency vehicles */
      const pn = performance.now(); (sc.vehicles || []).forEach(vh => { const p = Math.min(1, (pn - vh.t0) / vh.dur), x = vh.from.x + (vh.to.x - vh.from.x) * p, y = vh.from.y + (vh.to.y - vh.from.y) * p, s = P(x, y, 2); if(!s) return; const fl = Math.floor(pn / 160) % 2; g.fillStyle = vh.t === 'fire' ? '#ff453a' : vh.t === 'police' ? (fl ? tint : '#ff453a') : '#fff'; g.beginPath(); g.arc(s[0], s[1], Math.max(4, 5 * Math.min(k, 2) * s[2]), 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke(); if(p >= 1){ g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(s[0], s[1], 9 + (pn - vh.t0 - vh.dur) / 90, 0, 7); g.stroke(); } });
      /* NPCs: one dot each; the chosen one shows its route and destination */
      R.npcPos = []; const nr = clamp(2.2 + k * 0.9, 3.2, 7);
      if(sc.npcSel){ const ns = sc.npcSel; if(ns.route) line(ns.route, 4, tint + '55', 3); if(ns.rest) line(ns.rest, 3.6, tint, 2.6, [8, 6]); if(ns.to){ ring(ns.to.x, ns.to.y, 10 + Math.sin(t / 200), tint, 2.2); const s = P(ns.to.x, ns.to.y, 0); if(s) halo(ns.to.label || '', s[0], s[1] - 18, 11, tint, 700); } }
      (sc.npcs || []).forEach(o => { R.npcPos.push({ id: o.id, x: o.x, y: o.y }); const s = P(o.x, o.y, flat ? 0 : 1.5); if(!onScreen(s, 12)) return; const r = nr * Math.min(1.3, 0.8 + s[2] * 0.3); if(!flat){ g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(s[0], s[1] + r * 0.8, r * 0.9, r * 0.4, 0, 0, 7); g.fill(); }
        g.fillStyle = o.c || '#f2a65a'; g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.fill(); g.lineWidth = o.moving ? 1.8 : 1.1; g.strokeStyle = o.moving ? '#fff' : 'rgba(0,0,0,.45)'; g.stroke();
        if(X && X.t === 'npc' && X.id === o.id){ g.strokeStyle = tint; g.lineWidth = 2.4; g.beginPath(); g.arc(s[0], s[1], r + 4 + Math.sin(t / 180), 0, 7); g.stroke(); if(o.name) halo(o.name, s[0], s[1] - r - 10, 11.5, th.text, 700); } });
      /* players, wherever their front window puts them: Apple-style blue/green pin dot with a name chip */
      R.pplPos = []; (sc.players || []).forEach(o => { R.pplPos.push({ id: o.id, x: o.x, y: o.y }); const s = P(o.x, o.y, flat ? 0 : 3); if(!onScreen(s, 30)) return; const r = clamp(5 + k * 0.9, 6, 10);
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(s[0], s[1] + r * 0.9, r, r * 0.45, 0, 0, 7); g.fill(); if(o.mine){ g.fillStyle = tint + '30'; g.beginPath(); g.arc(s[0], s[1], r + 7 + 3 * Math.sin(t / 260), 0, 7); g.fill(); }
        g.beginPath(); g.arc(s[0], s[1], r + 2.2, 0, 7); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.fillStyle = o.mine ? tint : '#3aa6b9'; g.fill();
        if(!o.mine || k > 0.9){ const nm = o.name || 'A player'; g.font = '700 11px -apple-system,system-ui,sans-serif'; const tw = g.measureText(nm).width + 12; g.fillStyle = dark ? 'rgba(29,23,17,.94)' : 'rgba(255,250,240,.96)'; g.beginPath(); if(g.roundRect) g.roundRect(s[0] - tw / 2, s[1] - r - 25, tw, 18, 9); else g.rect(s[0] - tw / 2, s[1] - r - 25, tw, 18); g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.12)'; g.stroke(); g.fillStyle = th.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm, s[0], s[1] - r - 16); g.textBaseline = 'alphabetic'; }
        if(X && X.t === 'player' && X.id === o.id){ g.strokeStyle = tint; g.lineWidth = 2.4; g.beginPath(); g.arc(s[0], s[1], r + 8 + Math.sin(t / 180), 0, 7); g.stroke(); } });

      /* labels last, upright, with a halo */
      for(const zid of ['uni', 'ind']){ const zz = G.ZONES[zid]; const s = P((zz.x0 + zz.x1) / 2, zz.y0 - 14, 0); if(s && k < 3.4) halo(zz.n, s[0], s[1], clamp(11 * k * s[2] + 2, 10, 15), th.sub, 700); }
      if(k < 3.4){ const s = P(C.x, C.y - 116, 0); if(s) halo('Downtown', s[0], s[1], clamp(11 * k * s[2] + 2, 10, 16), th.sub, 700); }
      vd.forEach(q => { if(k > 3.0) return; const D = G.district(q), s = P(D.cx, D.cy - 112, 0); if(!s) return; halo(D.name, s[0], s[1], clamp(11 * k * s[2] + 3, 10.5, 18), th.text, 700); if(D.city && k < 1.6){ halo('CITY', s[0], s[1] + 13, 9, D.color, 800); } });
      for(const id in G.POIS){ if(id === 'hub') continue; const p = G.POIS[id], hh = POIH[id] || 0; const s = P(p.x, p.y, flat ? 0 : hh + 10); if(!onScreen(s, 40)) continue; const r = clamp(5.5 + k * 3.4, 7, 15);
        if(id === 'park'){ halo(p.n, s[0], s[1] - 18, 11, '#3e7d3a', 700); pin(p.x, p.y, r * 0.85, PC[id][0], id, X && X.t === 'poi' && X.id === id); continue; }
        pin(p.x, p.y, r, PC[id][0], id, X && X.t === 'poi' && X.id === id, flat ? 0 : hh + 10); if(k > 0.9) halo(p.n, s[0], s[1] + r + 9, 10.5, th.text, 600); }
      /* haze toward the horizon in 3D */
      if(!flat){ const hz2 = g.createLinearGradient(0, 0, 0, H * 0.42); hz2.addColorStop(0, th.land); hz2.addColorStop(1, th.land.replace('#', '#') + '00'); g.save(); g.globalAlpha = clamp(v.p * 0.9, 0, 0.7); g.fillStyle = hz2; g.fillRect(0, 0, W, H * 0.42); g.restore(); }
    };
    return R;
  }
  return { create, PC, TH, POIH, KIND };
});
