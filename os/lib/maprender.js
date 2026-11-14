/* LIB · maprender — draws WestCountry like Apple Maps' Explore view, in 2D or tilted 3D, from a `scene` the caller builds each frame. Used by apps/WestMap.html and os/widgets/map.js.
 *   const R = MapRender.create(canvas, WorldGen);   R.view = { x, y, k, b, p }   (world centre, px per world unit, bearing rad, pitch rad)
 *   R.draw(scene, t)   scene = { dark, n, houses:[{id,g,h}], plots, npcs:[{id,x,y,moving,c}], players:[{id,x,y,mine,name}], vehicles, sel, selX, npcSel, shown(e), kind(h), me, nameOf(uid), layers }
 * One projection does both modes (pitch 0 = flat top-down), so there is a single code path; 3D adds extruded buildings, shadows and haze. Textures are procedural (canvas patterns), nothing is downloaded.
 * LOD: every building picks dot / box / baked sprite / mesh from its size on screen, meshes are only built when needed, draw calls are batched, and a governor coarsens everything when frames get slow.
 *   R.lod = { on, sprites, bias, bakeMs, cache, profile } tunes it; cache:true renders the static world (land → buildings) into an offscreen layer once the view holds still, and each frame only blits it and redraws NPCs / players / vehicles / selection / labels (call R.invalidate() when houses, plots or filters change) (on:false = no sprites, no governor bias); R.stats = what the last frame did (tiers, bakes, ms, atlas). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.MapRender = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), CAM = 1700;
  const TH = {      // warm, like the rest of WestOS (see os/tokens.css)
    light: { land: '#f3eee2', hood: '#ece4d2', road: '#fffdf7', edge: '#d9cfb9', hwy: '#f4c984', hwyE: '#c98a3c', exp: '#e8924f', expE: '#b6552c', park: '#d3e3b5', parkE: '#b8cf98', core: '#e6dfd0', coreE: '#d3c9b4', text: '#2a2016', sub: 'rgba(42,32,22,.64)', halo: 'rgba(255,250,240,.9)', roof: '#f6efdf', water: '#b4d5e6', zoneU: '#e3e0ef', zoneI: '#f0decb', plot: '#ddd2bb', uLo: '#efe8d8', uHi: '#d7d0c1' },
    dark: { land: '#17120d', hood: '#1e1812', road: '#4a3e31', edge: '#0e0b08', hwy: '#a07a3a', hwyE: '#4f3a18', exp: '#cf7a3c', expE: '#5c2f17', park: '#2a3d29', parkE: '#213220', core: '#251e16', coreE: '#35291d', text: '#f6efdd', sub: 'rgba(246,239,221,.62)', halo: 'rgba(14,11,8,.88)', roof: '#5c4f41', water: '#2c4a5e', zoneU: '#2a2944', zoneI: '#3a2a1c', plot: '#33281e', uLo: '#1d1711', uHi: '#30281e' }
  };
  const cssTint = (() => { let v = '#e8924f', at = 0; return () => { const n = Date.now(); if(n - at > 2000){ at = n; try{ const c = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim(); if(/^#[0-9a-f]{6}$/i.test(c)) v = c; }catch(e){} } return v; }; })();
  const PC = { bank: ['#4a6fa8', 'B'], exchange: ['#3fae78', 'E'], shop: ['#e0a23a', 'S'], arcade: ['#b36be0', 'A'], agency: ['#d08a5d', 'R'], hall: ['#7d8799', 'C'], park: ['#5aa15c', 'P'], uni: ['#6f7fd0', 'U'], lab: ['#4fb3ae', 'L'], ind: ['#c97b4a', 'F'], plant: ['#8f6e5a', 'W'] };
  const POIH = { bank: 30, exchange: 40, shop: 18, arcade: 22, agency: 20, hall: 28, uni: 24, lab: 22, ind: 16, plant: 26 };
  const KIND = { mine: '#5bd68a', bank: '#b3b9c4', player: '#7fb2f2', bot: '#f2b676' };
  const cacheRGB = new Map();
  function rgb(hex){ let c = cacheRGB.get(hex); if(!c){ const h = hex.replace('#', ''), n = h.length === 3 ? h.split('').map(x => x + x).join('') : h; c = [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; cacheRGB.set(hex, c); } return c; }
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')'; };
  const shade = (hex, f) => { const x = rgb(hex); return 'rgb(' + Math.round(clamp(x[0] * f, 0, 255)) + ',' + Math.round(clamp(x[1] * f, 0, 255)) + ',' + Math.round(clamp(x[2] * f, 0, 255)) + ')'; };

  /* ---- LOD: tiers by size on screen. px = footprint in screen pixels (perspective included), divided by a "bias" that grows when frames are slow or the camera moves.
   *   dot    px < 3.2    one square, batched per colour: a whole country costs a handful of fills
   *   box    px < 4 (6.5 with sprites off)   extruded box; the mesh is never built for it. Also the stand-in while a sprite is still being baked
   *   sprite px < 36     the real shape baked ONCE into an atlas page, then 1 drawImage. Keyed by shape, (house angle + bearing) in 32 steps, pitch in 7, zoom in half-octaves.
   *                      Baked a few ms per frame, biggest first; until then (or if baking is off) the building shows as a box or a neighbouring angle/zoom, so a crowded view appears at once and the detail streams in
   *   mesh   px >= 30    the real shape, face by face; windows and doors only when very close (px > 60) */
  const LOD = { DOT: 3.2, BOX: 6.5, SPRITE: 36, SPMIN: 4, DETAIL: 60, AB: 32, PB: 7, PSTEP: 0.16, MINPITCH: 0.035, PAGE: 1024, MAXPAGES: 3, MAXW: 96, MAXH: 128 };
  const TAU = Math.PI * 2, GOVL = [1, 1.35, 1.8, 2.5];
  const angBucket = a => { const u = a / TAU; return Math.floor((u - Math.floor(u)) * LOD.AB + 0.5) % LOD.AB; }, angOf = b => b * TAU / LOD.AB;
  const pitchBucket = p => clamp(Math.round(p / LOD.PSTEP), 0, LOD.PB), pitchOf = b => b * LOD.PSTEP;
  const scaleBucket = x => Math.round(2 * Math.log2(Math.max(1e-3, x))), scaleOf = b => Math.pow(2, b / 2);
  /* one number per sprite variant (sid < 2^30: house index, or 2^23 + scenery prototype id) */
  const spriteKey = (sid, side, ab, pb, sb, ci, dk) => (((((sid * 2 + side) * 32 + ab) * 8 + pb) * 40 + (sb + 20)) * 8 + ci) * 2 + dk;
  const PIDS = new Map(), protoId = b => { const key = b.k + '|' + Math.round(b.w) + '|' + Math.round(b.d) + '|' + b.fl + '|' + b.v; let id = PIDS.get(key); if(id === undefined){ if(PIDS.size > 200000) PIDS.clear(); id = 8388608 + PIDS.size; PIDS.set(key, id); } return id; };
  /* sprite atlas: shelf-packed pages. When every page is full the one that went longest without a hit is wiped (baking again is cheap). mk(w, h) → { cv, g } so tests can stub the canvas. */
  function makeAtlas(mk, page){
    const PG = page || LOD.PAGE, A = { pages: [], map: new Map(), frame: 0, wipes: 0, D: 1 };
    const place = (pg, w, h) => {
      for(const sh of pg.shelves) if(sh.h >= h && sh.h <= h + 16 && sh.x + w <= PG){ const r = { pg, x: sh.x, y: sh.y }; sh.x += w + 1; return r; }
      const hh = Math.ceil(h / 8) * 8; if(pg.nextY + hh > PG || w > PG) return null;
      const sh = { y: pg.nextY, h: hh, x: w + 1 }; pg.shelves.push(sh); pg.nextY += hh + 1; return { pg, x: 0, y: sh.y }; };
    A.alloc = (w, h) => {
      for(const pg of A.pages){ const r = place(pg, w, h); if(r){ pg.f = A.frame; return r; } }
      let pg;
      if(A.pages.length < LOD.MAXPAGES){ const c = mk(PG, PG); pg = { cv: c.cv, g: c.g, shelves: [], nextY: 0, f: A.frame }; A.pages.push(pg); }
      else { pg = A.pages[0]; for(const q of A.pages) if(q.f < pg.f) pg = q; pg.shelves = []; pg.nextY = 0; pg.f = A.frame; A.wipes++; for(const [key, e] of A.map) if(e.pg === pg) A.map.delete(key); }
      return place(pg, w, h); };
    return A;
  }

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
    const BG = G.BuildGen || null, g0 = cv.getContext('2d'), R = { view: { x: 0, y: 0, k: 1, b: 0, p: 0 }, W: 0, H: 0, npcPos: [], pplPos: [], CAM, lod: { on: true, sprites: true, bias: 1, bakeMs: 3, cache: false, profile: false }, stats: {} };
    R.invalidate = () => { SC.valid = false; };   // the caller says the static layer (houses, plots, filters …) changed
    let g = g0, ATL = null, motionAt = 0, gov = 1, emaMs = 8, pv = { x: 0, y: 0, k: 1, b: 0, p: 0 }, dIdx = new Map(), dIdxA = null, dIdxN = -1, dIdx0 = null, dIdx1 = null, perfLow = false, perfLowAt = -1e9, bakeT = 0, lastT0 = 0, emaDt = 33, govAt = 0, govI = 0, animFlag = false, NULLG = null, SC = { cv: null, g: null, key: '', valid: false, anim: false, hs: null, plots: null, me: null, shown: null };
    let tint = '#e8924f', cs = 1, sn = 0, cp = 1, sp = 0, vk = 1, vx = 0, vy = 0, th = TH.light, dark = false, tex = null, texDark = null, FC = new Map(), scene = null, t = 0, sel2d = true;
    R.resize = (w, h) => { const d = Math.min(2, devicePixelRatio || 1), nw = w || cv.clientWidth, nh = h || cv.clientHeight, pw = Math.round(nw * d), ph = Math.round(nh * d);
      if(pw === cv.width && ph === cv.height && nw === R.W && nh === R.H) return false;   // assigning canvas.width clears it (a white flash until the next frame), so only touch it when the size really changed
      R.W = nw; R.H = nh; cv.width = pw; cv.height = ph; g0.setTransform(d, 0, 0, d, 0, 0); SC.valid = false; return true; };
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

    /* ---- buildings: every house (and the downtown, the scenery between the districts, the landmarks) is a real 3D shape from BuildGen, drawn face by face ---- */
    const mixC = new Map(), shC = new Map(), LX = -0.4, LY = 0.3, LZ = 0.86;
    function mixHex(a, b, t){ const key = a + b + ((t * 50) | 0); let v = mixC.get(key); if(!v){ const x = rgb(a), y = rgb(b), f = i => ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2); v = '#' + f(0) + f(1) + f(2); if(mixC.size > 5000) mixC.clear(); mixC.set(key, v); } return v; }
    function sh(hex, f){ let a = shC.get(hex); if(!a){ if(shC.size > 4000) shC.clear(); a = new Array(48); shC.set(hex, a); } const i = f <= 0 ? 0 : f >= 1.5 ? 47 : (f * 31.9) | 0; return a[i] || (a[i] = shade(hex, i / 31.9)); }
    let PX = new Float32Array(256), PY = new Float32Array(256), QX = new Float32Array(256), QY = new Float32Array(256), QZ = new Float32Array(256), OK = new Uint8Array(256), FI = new Int32Array(128), FK = new Float32Array(128), FS = new Float32Array(128);
    const SLOTS = ['wall', 'roof', 'trim', 'glass', 'door', 'yard', 'water', 'wall2', 'roof2'], slotCol = new Array(9);
    /* draw shape s standing at world (X, Y), turned by `ang`, front on side `side`. o: tint (owner colour), rm/wm (how much of it the roofs/walls take), detail (windows & doors), px (footprint in screen px) */
    function drawShape(s, X, Y, ang, side, o){
      const V = s.V, nv = V.length / 3, F = s.F, pal = s.pal; if(PX.length < nv){ const m = nv + 64; PX = new Float32Array(m); PY = new Float32Array(m); QX = new Float32Array(m); QY = new Float32Array(m); QZ = new Float32Array(m); OK = new Uint8Array(m); }
      if(FI.length < F.length){ const m = F.length + 32; FI = new Int32Array(m); FK = new Float32Array(m); FS = new Float32Array(m); }
      const c0 = Math.cos(ang), s0 = Math.sin(ang), sd = side > 0 ? 1 : -1, fl = sel2d, W2 = R.W / 2, H2 = R.H / 2, Ey = CAM * sp, Ez = CAM * cp, k = vk, dk = dark ? 0.74 : 1;
      for(let i = 0; i < nv; i++){ const lx = V[3 * i], ly = V[3 * i + 1] * sd, lz = fl ? 0 : V[3 * i + 2], wx = X + lx * c0 - ly * s0, wy = Y + lx * s0 + ly * c0, dx = wx - vx, dy = wy - vy, xs = (dx * cs - dy * sn) * k, ys = (dx * sn + dy * cs) * k, zs = lz * k, den = CAM - (ys * sp + zs * cp);
        if(den < CAM * 0.3){ OK[i] = 0; continue; } OK[i] = 1; const p = CAM / den; PX[i] = W2 + xs * p; PY[i] = H2 + (ys * cp - zs * sp) * p; QX[i] = xs; QY[i] = ys; QZ[i] = zs; }
      for(let c = 0; c < 9; c++){ let hx = pal[SLOTS[c]] || '#cccccc'; if(o.tint){ if(c === 1 || c === 8) hx = mixHex(hx, o.tint, o.rm); else if(c === 0 || c === 7) hx = mixHex(hx, o.tint, o.wm); } slotCol[c] = hx; }
      let cnt = 0;
      for(let fi = 0; fi < F.length; fi++){ const f = F[fi], n = f.n, vi = f.v[0]; if(!OK[vi]) continue; const nx = n[0] * c0 - n[1] * sd * s0, ny = n[0] * s0 + n[1] * sd * c0, nz = n[2], nX = nx * cs - ny * sn, nY = nx * sn + ny * cs; let key;
        if(fl){ if(nz < 0.05) continue; key = V[3 * vi + 2] + V[3 * f.v[f.v.length >> 1] + 2]; }
        else { if(nX * (0 - QX[vi]) + nY * (Ey - QY[vi]) + nz * (Ez - QZ[vi]) <= 0) continue; const vj = f.v[f.v.length >> 1], ax = (QX[vi] + QX[vj]) * 0.5, ay = (Ey - (QY[vi] + QY[vj]) * 0.5), az = (Ez - (QZ[vi] + QZ[vj]) * 0.5); key = -(ax * ax + ay * ay + az * az); }
        let j = cnt++; const sv = 0.56 + 0.52 * Math.max(0, nX * LX + nY * LY + nz * LZ); while(j > 0 && FK[j - 1] > key){ FK[j] = FK[j - 1]; FI[j] = FI[j - 1]; FS[j] = FS[j - 1]; j--; } FK[j] = key; FI[j] = fi; FS[j] = sv; }
      const edge = o.px > 16 ? 'rgba(0,0,0,.2)' : null;
      for(let q = 0; q < cnt; q++){ const f = F[FI[q]], sv = FS[q] * dk, vs = f.v; g.beginPath(); g.moveTo(PX[vs[0]], PY[vs[0]]); for(let i = 1; i < vs.length; i++) g.lineTo(PX[vs[i]], PY[vs[i]]); g.closePath(); g.fillStyle = sh(slotCol[f.c], sv); g.fill(); if(edge){ g.lineWidth = 0.6; g.strokeStyle = edge; g.stroke(); }
        if(f.b && !fl && o.px > 9){ g.strokeStyle = 'rgba(0,0,0,.17)'; g.lineWidth = 0.7; g.beginPath(); const a = vs[0], b = vs[1], c2 = vs[2], d = vs[3], nb = Math.min(f.b, 18); for(let t = 1; t < nb; t++){ const u = t / nb; g.moveTo(PX[a] + (PX[d] - PX[a]) * u, PY[a] + (PY[d] - PY[a]) * u); g.lineTo(PX[b] + (PX[c2] - PX[b]) * u, PY[b] + (PY[c2] - PY[b]) * u); } g.stroke(); }
        if(o.detail && f.k && !fl) for(let i = 0; i < f.k.length; i++){ const kd = f.k[i], kv = kd.v; let ok = true; for(let z = 0; z < kv.length; z++) if(!OK[kv[z]]){ ok = false; break; } if(!ok) continue; g.beginPath(); g.moveTo(PX[kv[0]], PY[kv[0]]); for(let z = 1; z < kv.length; z++) g.lineTo(PX[kv[z]], PY[kv[z]]); g.closePath(); g.fillStyle = sh(slotCol[kd.c], kd.c === 3 ? sv + 0.18 : sv); g.fill(); } }
    }
    /* many polylines in a few strokes: segments are bucketed by on-screen width (quarter px), one Path2D per width. Same look as line(), a fraction of the draw calls. */
    function lineBatch(rs, extra, col, mn){ const buckets = new Map(), flatv = sel2d;
      for(const r of rs){ const q = pj(r.pts), step = flatv ? q.length : 5, w = r.w + extra; let i = 0;
        while(i < q.length - 1){ if(!q[i]){ i++; continue; } let j = i, sum = q[i][2], cnt = 1; while(j + 1 < q.length && q[j + 1] && j + 1 - i < step){ j++; sum += q[j][2]; cnt++; }
          if(j > i){ const lw = Math.round(Math.max(mn || 1, w * vk * sum / cnt) * 4) / 4; let b = buckets.get(lw); if(!b) buckets.set(lw, b = new Path2D()); b.moveTo(q[i][0], q[i][1]); for(let z = i + 1; z <= j; z++) b.lineTo(q[z][0], q[z][1]); } i = j > i ? j : i + 1; } }
      g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]); for(const [lw, b] of buckets){ g.lineWidth = lw; g.stroke(b); } }

    /* ---- sprites: shape S standing at the centre of its cell, camera bearing 0 (only house angle + bearing matters: the light is fixed in view space), baked at a bucketed zoom and pitch ---- */
    function bakeSprite(key, S, ang, side, o, sb, pbk){
      const D = ATL.D, kb = scaleOf(sb), kd = kb * D, pp = pitchOf(pbk), cpp = Math.cos(pp), spp = Math.sin(pp), rxy = Math.hypot(S.w, S.d) / 2, f = 1.07;   // f: perspective grows tall things a little
      const hw = Math.ceil(rxy * kd * f + 3), up = Math.ceil((rxy * cpp + S.h * spp) * kd * f + 3), dn = Math.ceil(rxy * cpp * kd * f + 3), w = hw * 2, h = up + dn;
      if(w > (LOD.MAXW + 4) * D || h > (LOD.MAXH + 4) * D) return null;
      const pos = ATL.alloc(w, h); if(!pos) return null;
      const sv = [g, R.W, R.H, vk, vx, vy, cs, sn, cp, sp, sel2d];
      g = pos.pg.g; g.save(); g.setTransform(1, 0, 0, 1, pos.x, pos.y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.clearRect(0, 0, w, h);
      R.W = w; R.H = 2 * up; vk = kd; vx = 0; vy = 0; cs = 1; sn = 0; cp = cpp; sp = spp; sel2d = false;
      try{ drawShape(S, 0, 0, ang, side, o); } finally { g.restore(); g = sv[0]; R.W = sv[1]; R.H = sv[2]; vk = sv[3]; vx = sv[4]; vy = sv[5]; cs = sv[6]; sn = sv[7]; cp = sv[8]; sp = sv[9]; sel2d = sv[10]; }
      const e = { pg: pos.pg, x: pos.x, y: pos.y, w, h, ax: hw, ay: up, kb, sh: S.h }; ATL.map.set(key, e); return e; }
    /* draw a baked sprite so its anchor (the footprint centre) lands on screen point s0; f = perspective scale / baked scale */
    function blit(e, s0, f){ const D = ATL.D, ax = e.ax / D, ay = e.ay / D, dw = e.w / D, dh = e.h / D; if(Math.abs(f - 1) < 0.03){ g.drawImage(e.pg.cv, e.x, e.y, e.w, e.h, Math.round((s0[0] - ax) * D) / D, Math.round((s0[1] - ay) * D) / D, dw, dh); } else g.drawImage(e.pg.cv, e.x, e.y, e.w, e.h, s0[0] - ax * f, s0[1] - ay * f, dw * f, dh * f); }
    /* while the exact variant is still waiting to be baked, a neighbouring angle / zoom / pitch of the same shape is a good stand-in */
    const DN = [0, 1, -1], DS = [0, -1, 1];
    function nearSprite(sid, side, ab, pb, sb, ci){ const m = ATL.map, dk = dark ? 1 : 0;
      for(let i = 0; i < 3; i++){ const a = (ab + DN[i] + LOD.AB) % LOD.AB; for(let j = 0; j < 3; j++){ const e = m.get(spriteKey(sid, side, a, pb, sb + DS[j], ci, dk)); if(e) return e; } }
      for(let i = 1; i < 3; i++){ const p2 = pb + DS[i]; if(p2 < 1 || p2 > LOD.PB) continue; const e = m.get(spriteKey(sid, side, ab, p2, sb, ci, dk)); if(e) return e; }
      return null; }

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
    const drawFrame = (sc, tt) => {
      scene = sc; tint = sc.tint || cssTint(); t = tt || 0; dark = !!sc.dark; th = dark ? TH.dark : TH.light; if(!tex || texDark !== dark){ tex = makeTextures(g, dark); texDark = dark; } prep(); FC = new Map();
      const T0 = performance.now(), LODS = R.lod; const D = Math.max(1, Math.round(cv.width / Math.max(1, R.W) * 100) / 100); if(!ATL || ATL.D !== D){ const fr = ATL ? ATL.frame : 0; ATL = makeAtlas((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { cv: c, g: c.getContext('2d') }; }, D > 1 ? 1536 : LOD.PAGE); ATL.D = D; ATL.frame = fr; } ATL.frame++;   // sprites are baked at device resolution (D = pixel ratio)
      { const u = R.view; if(Math.abs(u.x - pv.x) + Math.abs(u.y - pv.y) > 0.4 / Math.max(0.05, u.k) || Math.abs(u.k / pv.k - 1) > 0.003 || Math.abs(u.b - pv.b) > 0.003 || Math.abs(u.p - pv.p) > 0.003) motionAt = T0; pv = { x: u.x, y: u.y, k: u.k, b: u.b, p: u.p }; }
      if(T0 - perfLowAt > 2000){ perfLowAt = T0; try{ perfLow = document.documentElement.classList.contains('perf-low') || (parent !== self && parent.document.documentElement.classList.contains('perf-low')); }catch(e){ perfLow = false; } }
      const moving = T0 - motionAt < 180, bias = Math.max(0.5, LODS.bias || 1) * (LODS.on === false ? 1 : gov) * (perfLow ? 1.5 : 1);
      let tm = T0; const mark = nm => { if(LODS.profile){ g.getImageData(0, 0, 1, 1); const nw = performance.now(); ST.sec[nm] = (ST.sec[nm] || 0) + nw - tm; tm = nw; } };   // opt-in: R.lod.profile = true times each section (forces a raster flush, so only for measuring)
      const ST = R.stats = { sec: {}, houses: 0, dot: 0, box: 0, sprite: 0, mesh: 0, fallback: 0, scn: 0, scnSprite: 0, scnMesh: 0, bakes: 0, queued: 0, tiles: 0, bias, moving, ms: 0, atlas: null };
      const W = R.W, H = R.H, v = R.view, k = vk, n = sc.n || 8, C = G.CORE, GE = G.GEO, flat = sel2d, items = [];
      /* static-layer cache: same view as last frame → draw the world into SC once (kept while nothing changes); while it is valid the drawing code below runs against a no-op context, so only the cheap bookkeeping is paid */
      animFlag = false; let cacheMode = 0;   // 0 draw straight to the screen, 1 draw into SC, 2 SC is valid (draw nothing)
      if(LODS.cache === true && !LODS.profile){ const u = v, ckey = [u.x, u.y, u.k, u.b, u.p, W, H, D, dark ? 1 : 0, tint, bias, LODS.on, LODS.sprites, sc.infill, sc.n, (sc.houses || []).length].join('|');
        const same = ckey === SC.key && sc.houses === SC.hs && sc.plots === SC.plots && sc.me === SC.me && sc.shown === SC.shown; if(!same){ SC.valid = false; SC.anim = false; } SC.key = ckey; SC.hs = sc.houses; SC.plots = sc.plots; SC.me = sc.me; SC.shown = sc.shown;
        if(same && SC.valid && !SC.anim) cacheMode = 2; else if(same && !SC.anim) cacheMode = 1;
        if(cacheMode === 1){ if(!SC.cv || SC.cv.width !== cv.width || SC.cv.height !== cv.height){ SC.cv = document.createElement('canvas'); SC.cv.width = cv.width; SC.cv.height = cv.height; SC.g = SC.cv.getContext('2d'); } SC.g.setTransform(D, 0, 0, D, 0, 0); g = SC.g; }
        else if(cacheMode === 2){ if(!NULLG){ NULLG = {}; const pr = CanvasRenderingContext2D.prototype; for(const nm of Object.getOwnPropertyNames(pr)){ const d = Object.getOwnPropertyDescriptor(pr, nm); if(d && typeof d.value === 'function') NULLG[nm] = () => {}; } NULLG.measureText = () => ({ width: 40 }); NULLG.createLinearGradient = () => ({ addColorStop(){} }); } g = NULLG; } }
      ST.cache = cacheMode;
      g.clearRect(0, 0, W, H); g.fillStyle = th.land; g.fillRect(0, 0, W, H);
      try{ const so = P(0, 0, 0), o = so ? new DOMMatrix().translate(so[0], so[1]).scale(1, flat ? 1 : cp).rotate(v.b * 180 / Math.PI) : new DOMMatrix(); tex.land.setTransform(o); tex.grass.setTransform(o); tex.hatch.setTransform(o); tex.dots.setTransform(o); tex.water.setTransform(o); }catch(e){}
      g.fillStyle = tex.land; g.fillRect(0, 0, W, H); mark('land');
      const near0 = 0, near = (x, y, r) => { const s = P(x, y, 0); return s && s[0] > -r * k * s[2] - 40 && s[1] > -r * k * s[2] - 40 && s[0] < W + r * k * s[2] + 40 && s[1] < H + r * k * s[2] + 40; };
      /* land use: neighbourhoods, greens, the downtown, the two campuses */
      const vd = [], vdh = []; for(let q = 0; q < n; q++){ const D = G.district(q), a = near(D.cx, D.cy, 170); if(a) vd.push(q); if(a || (!flat && near(D.cx, D.cy, 330))) vdh.push(q); }
      vd.forEach(q => { const fp = G.footprint(q), D = G.district(q), pts = fp.map(a => P(a[0], a[1], 0)); if(pts.some(a => !a)) return; g.beginPath(); pts.forEach((a, i) => i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1])); g.closePath(); const rad = 14 * k * pts[0][2];
        g.fillStyle = mix(th.hood, D.color, dark ? 0.1 : 0.07); g.strokeStyle = g.fillStyle; g.lineWidth = rad * 1.6; g.lineJoin = 'round'; g.fill(); g.stroke(); });
      vd.forEach(q => { G.parks(q).forEach(pk => { poly(pk, th.park, th.parkE, 1.2 * Math.min(2, k), tex.grass, 1); }); });
      { const z = C, s0 = P(z.x, z.y, 0); if(s0) poly([[z.x - 112, z.y - 104], [z.x + 112, z.y - 104], [z.x + 112, z.y + 104], [z.x - 112, z.y + 104]], th.core, th.coreE, 1.4); }
      { const pp = G.POIS.park; poly(rect(pp.x, pp.y, 96, 62, 0), th.park, th.parkE, 1.4, tex.grass, 1); poly(rect(pp.x + 18, pp.y + 6, 30, 18, 0.3), th.water, 'rgba(60,120,170,.4)', 1.2, tex.water, 1); }
      for(const zid of ['uni', 'ind']){ const zz = G.ZONES[zid], r = [[zz.x0 - 8, zz.y0 - 8], [zz.x1 + 8, zz.y0 - 8], [zz.x1 + 8, zz.y1 + 8], [zz.x0 - 8, zz.y1 + 8]]; poly(r, zid === 'uni' ? th.zoneU : th.zoneI, zz.c + '88', 1.2, zid === 'uni' ? tex.dots : tex.hatch, 1); }

      mark('landuse');
      /* the city between the districts: ground, local streets, trees and scenery buildings, generated per 156-unit tile (BuildGen.infill) */
      let tiles = [], poiH = id => { const L = BG && BG.landmark(id); return L ? L.h : (POIH[id] || 18); };
      if(BG && sc.infill !== false){ let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for(const fx of [0, 0.5, 1]) for(const fy of [0, 0.5, 1]){ const q = R.unproject(fx * W, fy * H); if(!q) continue; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
        if(x0 < x1){ const m = 50 + (flat ? 0 : 130 * Math.min(1.6, Math.tan(v.p))); tiles = BG.tilesIn(x0 - 50, y0 - m, x1 + 50, y1 + m).filter(tl => near((tl[0] + 0.5) * BG.TILE, (tl[1] + 0.5) * BG.TILE, BG.TILE * 0.75 + (flat ? 0 : 130))); if(tiles.length > 900) tiles = []; } }
      const gcol = []; for(let i = 0; i <= 20; i++) gcol.push(mixHex(th.uLo, th.uHi, i / 20)); const tdata = tiles.map(t => BG.infill(t[0], t[1], n));
      ST.tiles = tiles.length;
      { const gp = new Array(22).fill(null), half = (BG ? BG.CS : 26) / 2, hq = half + 0.5;   // one Path2D per ground colour (21 urban shades + green): thousands of cells, ~22 fills
        tdata.forEach(T => T.gr.forEach(c => { const q = P(c[0], c[1], 0); if(!q) return; const ci = c[3] ? 21 : Math.min(20, (Math.pow(c[2], 0.6) * 20) | 0), pa = gp[ci] || (gp[ci] = new Path2D());
          if(flat){ const hw = half * k * q[2] + 0.6; pa.rect(q[0] - hw, q[1] - hw, hw * 2, hw * 2); }
          else { const a0 = P(c[0] - hq, c[1] - hq, 0), a1 = P(c[0] + hq, c[1] - hq, 0), a2 = P(c[0] + hq, c[1] + hq, 0), a3 = P(c[0] - hq, c[1] + hq, 0); if(!a0 || !a1 || !a2 || !a3) return; pa.moveTo(a0[0], a0[1]); pa.lineTo(a1[0], a1[1]); pa.lineTo(a2[0], a2[1]); pa.lineTo(a3[0], a3[1]); pa.closePath(); } }));
        for(let ci = 0; ci < 22; ci++) if(gp[ci]){ g.fillStyle = ci === 21 ? th.park : gcol[ci]; g.fill(gp[ci]); } }
      mark('ground');
      /* roads: every casing first, then every fill, so junctions merge like a real map */
      const loc = [], hw = G.highways(n), lw = { loc: 4.2, ave: 6 }; const ringPts = [[C.x - 60, C.y - 40], [C.x + 60, C.y - 40], [C.x + 60, C.y + 40], [C.x - 60, C.y + 40], [C.x - 60, C.y - 40]];
      loc.push({ pts: ringPts, w: 4 }); ['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'park'].forEach(id => { const p = G.POIS[id]; loc.push({ pts: [[C.x, C.y], [p.x, p.y]], w: 4 }); });
      vd.forEach(q => { G.roads(q).forEach(r => loc.push({ pts: r.pts, w: r.avenue ? lw.ave : lw.loc })); });
      if(BG){ tdata.forEach(T => T.rd.forEach(r => loc.push({ pts: r.pts || (r.pts = [r.a, r.b]), w: r.U > 0.4 ? 4.6 : 3.8 }))); BG.links(n).forEach(l => { if(near(l.pts[0][0], l.pts[0][1], 120)) loc.push({ pts: l.pts, w: lw.loc }); }); }
      const hws = hw.map(e => ({ pts: e.pts, w: e.spur ? 4.6 : e.express ? 7 : e.link ? 5 : 6, e }));
      lineBatch(loc, 1.8, th.edge, 2.2); lineBatch(loc, 0, th.road, 1.2);
      vd.forEach(q => G.roadEnds(q).forEach(pair => pair.forEach(e => { const s = P(e[0], e[1], 0); if(!s) return; const rr = 4.2 * k * s[2]; g.beginPath(); g.arc(s[0], s[1], Math.max(2.2, rr * 0.5 + 1.6), 0, 7); g.fillStyle = th.edge; g.fill(); g.beginPath(); g.arc(s[0], s[1], Math.max(1.4, rr * 0.5 + 0.2), 0, 7); g.fillStyle = th.road; g.fill(); })));
      { const hx = hws.filter(r => r.e.express), hn = hws.filter(r => !r.e.express); lineBatch(hn, 1.8, th.hwyE, 2.8); lineBatch(hx, 1.8, th.expE, 2.8); lineBatch(hn, 0, th.hwy, 1.6); lineBatch(hx, 0, th.exp, 1.6); }
      { const s = P(C.x, C.y, 0); if(s){ const rr = Math.max(4, 9 * k * s[2]); g.beginPath(); g.arc(s[0], s[1], rr + 1.5, 0, 7); g.fillStyle = th.edge; g.fill(); g.beginPath(); g.arc(s[0], s[1], rr, 0, 7); g.fillStyle = th.road; g.fill(); g.beginPath(); g.arc(s[0], s[1], rr * 0.45, 0, 7); g.fillStyle = th.park; g.fill(); } }
      mark('roads');
      /* street names along the roads (flat or lightly tilted views, close in) */
      if(k > 2.1 && v.p < 0.9){ vd.forEach(q => { const rs = G.roads(q); const lab = (pa, pb, name) => { const a = P(pa[0], pa[1], 0), b = P(pb[0], pb[1], 0); if(!a || !b) return; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); g.font = '600 10px -apple-system,system-ui,sans-serif'; const tw = g.measureText(name).width; if(L < tw + 18 || !onScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0)) return; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if(ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.rotate(ang); halo(name, 0, 0, 10, th.sub, 600); g.restore(); };
          rs.forEach(r => { if(r.avenue){ lab(r.pts[Math.floor(r.pts.length * 0.2)], r.pts[Math.floor(r.pts.length * 0.4)], G.streetName(q, 4)); } else { const m = r.pts.length, i0 = Math.floor(m * 0.62), i1 = Math.floor(m * 0.82); lab(r.pts[i0], r.pts[i1], G.streetName(q, r.r)); } }); }); }

      mark('streetnames');
      /* things that stand on the map: depth-sorted so 3D overlaps correctly */
      const add = (x, y, fn) => items.push({ d: depth(x, y), fn });
      const cb = G.coreBlocks(); cb.forEach(b => { const S = BG ? BG.proto(b.kind || 'office', b.w, b.d, b.fl || 8, b.v || 1) : null; if(!near(b.x, b.y, 20 + (S ? S.h : b.h))) return; add(b.x, b.y, () => { const px = Math.max(b.w, b.d) * k; if(S && px > 6.5) drawShape(S, b.x, b.y, 0, 1, { px, detail: px > 70, tint: null }); else { const base = dark ? '#5d646e' : mix('#e6e2da', '#cfd3da', b.tone); box(b.x, b.y, b.w, b.d, 0, b.h, base, shade(base, 0.86)); } }); });
      /* houses and scenery pick a level of detail from their size on screen (see the LOD note at the top). No mesh is built unless it is going to be drawn or baked. */
      const hs = sc.houses || [], kindOf = sc.kind || (() => 'bot');
      const spOK = LODS.on !== false && LODS.sprites !== false && !flat && v.p >= LOD.MINPITCH && !!BG, pbk = pitchBucket(v.p), dkb = dark ? 1 : 0, bakeQ = [], dots = [[], [], [], []], dotsOff = [[], [], [], []], CIK = { bot: 0, player: 1, mine: 2, bank: 3 }, DCOL = [KIND.bot, KIND.player, KIND.mine, KIND.bank], roofC = [], wallC = [], edgeC = [], treeDots = [];
      if(dIdxA !== hs || dIdxN !== hs.length || dIdx0 !== hs[0] || dIdx1 !== hs[hs.length - 1]){ dIdx = new Map(); for(const e of hs){ const q = e.g.k != null ? e.g.k : ((e.g.i / 64) | 0); let arr = dIdx.get(q); if(!arr) dIdx.set(q, arr = []); arr.push(e); } dIdxA = hs; dIdxN = hs.length; dIdx0 = hs[0]; dIdx1 = hs[hs.length - 1]; }
      const hMax = gg => BG ? BG.heightOf(gg) : gg.ht * 2 + 12;   // upper bound, no mesh needed
      const spriteFits = (hm, w, d, sb) => { const kb = scaleOf(sb), rxy = Math.hypot(w, d) * 0.5 * 1.07, pp = pitchOf(pbk); return 2 * rxy * kb + 6 <= LOD.MAXW && (rxy * 2 * Math.cos(pp) + hm * 1.07 * Math.sin(pp)) * kb + 6 <= LOD.MAXH; };
      /* damage, owner ring, tenant, for-sale flag, rent dot and fire on top of a house (hh = its height) */
      const extras = (gg, hv, hh) => {
          if(hv.dm > 0){ const c = P(gg.x, gg.y, flat ? 0 : hh); if(c){ g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(c[0] - 4, c[1] - 4, 8, 8 * hv.dm / 100); } }
          const top = P(gg.x, gg.y, flat ? 0 : hh + 2); if(top && k * top[2] > 0.9){ if(hv.o === sc.me){ g.strokeStyle = '#5bd68a'; g.lineWidth = 2; g.beginPath(); g.arc(top[0], top[1], Math.max(5, gg.w * k * top[2] * 0.75), 0, 7); g.stroke(); }
            if(hv.t){ g.fillStyle = '#fff'; g.beginPath(); g.arc(top[0], top[1], Math.max(1.4, 2 * top[2]), 0, 7); g.fill(); }
            if(hv.a > 0 && hv.o !== 'bank'){ g.fillStyle = '#ffd24a'; g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 0.8; const fx = top[0] + 3, fy = top[1] - (flat ? 5 : 9); g.beginPath(); g.moveTo(fx, fy + 8); g.lineTo(fx, fy); g.lineTo(fx + 7, fy + 2.5); g.lineTo(fx, fy + 5); g.stroke(); g.fill(); }
            if(hv.rh > 0 && !hv.t && k > 1.4){ g.fillStyle = '#34c759'; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.arc(top[0] - 4, top[1] - (flat ? 3 : 8), 2.6, 0, 7); g.fill(); g.stroke(); }
            if(hv.f && hv.dm > 0){ const p2 = 0.6 + 0.4 * Math.sin(t / 130 + gg.i); g.fillStyle = 'rgba(255,' + Math.round(90 + 70 * p2) + ',30,.95)'; g.beginPath(); g.moveTo(top[0], top[1] - 14 * (0.8 + 0.3 * p2)); g.lineTo(top[0] + 5, top[1] - 2); g.lineTo(top[0] - 5, top[1] - 2); g.fill(); } }
      };
      const houseBox = (gg, c8, bank, col, hh) => { const roof = roofC[c8] || (roofC[c8] = bank ? mix(th.roof, col, 0.55) : mix(th.roof, col, dark ? 0.55 : 0.78));
        if(flat) box(gg.x, gg.y, gg.w, gg.dp, gg.ang, 1, roof, edgeC[c8] || (edgeC[c8] = shade(col, 0.72))); else box(gg.x, gg.y, gg.w, gg.dp, gg.ang, hh, roof, wallC[c8] || (wallC[c8] = shade(dark ? mix('#6a717b', col, .5) : mix('#e8e2d6', col, .5), dark ? 0.9 : 0.95))); };
      for(const q of vdh){ const arr = dIdx.get(q); if(!arr) continue;
        for(let ei = 0; ei < arr.length; ei++){ const e = arr[ei], gg = e.g, s0 = P(gg.x, gg.y, 0); if(!s0) continue; const hm = hMax(gg); if(!onScreen(s0, 40 + hm * k * 1.2)) continue; ST.houses++;
          const hv = e.h; if(hv.f && hv.dm > 0) animFlag = true; const on = !sc.shown || sc.shown(e), kd = kindOf(hv), bank = hv.o === 'bank', ci = CIK[kd] != null ? CIK[kd] : 0, c8 = ci * 2 + (bank ? 1 : 0), col = KIND[kd] || KIND.bot, px = Math.max(gg.w, gg.dp) * k * s0[2], eff = px / bias, hh0 = hm - 5;
          if(eff < LOD.DOT){ ST.dot++; (on ? dots : dotsOff)[ci].push(s0[0], s0[1]); if(hv.dm > 0 || k * s0[2] > 0.9){ g.globalAlpha = on ? 1 : 0.18; extras(gg, hv, hh0); g.globalAlpha = 1; } continue; }
          if(eff < (spOK ? LOD.SPMIN : LOD.BOX) || !BG){ ST.box++; add(gg.x, gg.y, () => { g.globalAlpha = on ? 1 : 0.18; houseBox(gg, c8, bank, col, hh0); extras(gg, hv, hh0); g.globalAlpha = 1; }); continue; }
          const sb = scaleBucket(k * s0[2]);
          if(spOK && eff < LOD.SPRITE && spriteFits(hm, gg.w, gg.dp, sb)){ ST.sprite++; const side = gg.side > 0 ? 0 : 1, ab = angBucket(gg.ang + v.b), key = spriteKey(gg.i, side, ab, pbk, sb, c8, dkb);
            if(!ATL.map.has(key)) bakeQ.push({ key, px, h: gg, sb, ab, side, col, bank });
            add(gg.x, gg.y, () => { g.globalAlpha = on ? 1 : 0.18; const en = ATL.map.get(key) || nearSprite(gg.i, side, ab, pbk, sb, c8); if(en){ ATL.map.has(key) && (en.pg.f = ATL.frame); blit(en, s0, k * s0[2] / en.kb); extras(gg, hv, en.sh); } else { ST.fallback++; houseBox(gg, c8, bank, col, hh0); extras(gg, hv, hh0); } g.globalAlpha = 1; }); continue; }
          ST.mesh++; const S = BG.shape(gg);
          add(gg.x, gg.y, () => { g.globalAlpha = on ? 1 : 0.18; drawShape(S, gg.x, gg.y, gg.ang, gg.side, { tint: col, rm: bank ? 0.62 : 0.7, wm: 0.2, px, detail: px > LOD.DETAIL }); extras(gg, hv, S.h); g.globalAlpha = 1; }); } }
      /* scenery between the districts: the same tiers, heights following the skyline field, so the city fades smoothly from downtown and the "city" districts down to the suburbs */
      tdata.forEach(T => { T.b.forEach(b => { const s0 = P(b.x, b.y, 0); if(!s0) return; const hm = b.fl * 3.1 + 9; if(!onScreen(s0, 40 + hm * k * 1.2)) return; const px = Math.max(b.w, b.d) * k * s0[2], eff = px / bias; if(eff < 3.4) return; ST.scn++;
          const boxIt = () => { const base = b._bc || (b._bc = mixHex(BG.protoPal(b.k, b.fl, b.v).wall, '#8a8f98', 0.4)); if(flat) box(b.x, b.y, b.w, b.d, b.a, 1, base, shade(base, 0.8)); else box(b.x, b.y, b.w, b.d, b.a, (hm - 5) * 0.85, base, shade(base, 0.82), false); };
          if(eff < (spOK ? LOD.SPMIN : LOD.BOX)){ add(b.x, b.y, boxIt); return; }
          const sb = scaleBucket(k * s0[2]);
          if(spOK && eff < LOD.SPRITE && spriteFits(hm, b.w, b.d, sb)){ ST.scnSprite++; const sid = b._sid || (b._sid = protoId(b)), ab = angBucket(b.a + v.b), key = spriteKey(sid, 0, ab, pbk, sb, 0, dkb);
            if(!ATL.map.has(key)) bakeQ.push({ key, px, b, sb, ab, side: 0, col: null, bank: false });
            add(b.x, b.y, () => { const en = ATL.map.get(key) || nearSprite(sid, 0, ab, pbk, sb, 0); if(en){ ATL.map.has(key) && (en.pg.f = ATL.frame); blit(en, s0, k * s0[2] / en.kb); } else { ST.fallback++; boxIt(); } }); return; }
          ST.scnMesh++; const S = BG.protoOf(b); add(b.x, b.y, () => drawShape(S, b.x, b.y, b.a, 1, { px, detail: px > 70, tint: null })); });
        if(k > 1.2) T.tr.forEach(q => { const s0 = P(q[0], q[1], 0); if(!onScreen(s0, 30)) return; const r0 = Math.max(2, 3.6 * q[2] * k * s0[2]);
          if(r0 < 6){ treeDots.push(s0[0], s0[1] - (flat ? 0 : 6 * q[2] * k * s0[2] * sp), r0); return; }   // small trees: a canopy dot in one batch, no trunk
          add(q[0], q[1], () => { const s0 = P(q[0], q[1], 0), s1 = P(q[0], q[1], flat ? 0 : 6 * q[2]); if(!s0 || !s1) return; const r = Math.max(2, 3.6 * q[2] * k * s1[2]); if(!flat){ g.strokeStyle = dark ? '#3a2d22' : '#7b5b3a'; g.lineWidth = Math.max(1, 1.1 * k); g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); } g.beginPath(); g.arc(s1[0], s1[1], r, 0, 7); g.fillStyle = dark ? '#3f7a52' : '#7fba6a'; g.fill(); }); }); });
      /* before the depth-sorted things: bake queued sprites (biggest first, within a time budget), then the far field (dots, small trees) */
      const farPass = () => {
        if(bakeQ.length){ ST.queued = bakeQ.length; bakeQ.sort((x, y) => y.px - x.px); const tb = performance.now(), lim = (LODS.bakeMs || 3) * (moving ? 1 : 4); bakeT = 0;
          for(let i = 0; i < bakeQ.length; i++){ if(performance.now() - tb > lim) break; const r = bakeQ[i]; if(ATL.map.has(r.key)) continue;
            const S = r.b ? BG.protoOf(r.b) : BG.shape(r.h), ang = angOf(r.ab), kb = scaleOf(r.sb);
            if(bakeSprite(r.key, S, ang, r.side ? -1 : 1, r.col ? { tint: r.col, rm: r.bank ? 0.62 : 0.7, wm: 0.2, px: Math.max(S.w, S.d) * kb * ATL.D, detail: false } : { px: Math.max(S.w, S.d) * kb * ATL.D, detail: false, tint: null }, r.sb, pbk)) ST.bakes++; } bakeT = performance.now() - tb; }
        for(let ci = 0; ci < 4; ci++){ for(let pass = 0; pass < 2; pass++){ const arr = (pass ? dotsOff : dots)[ci]; if(!arr.length) continue; const pa = new Path2D(); for(let i = 0; i < arr.length; i += 2) pa.rect(arr[i] - 2.2, arr[i + 1] - 2.2, 4.4, 4.4); g.globalAlpha = pass ? 0.18 : 1; g.fillStyle = DCOL[ci]; g.fill(pa); } } g.globalAlpha = 1;
        if(treeDots.length){ const pa = new Path2D(); for(let i = 0; i < treeDots.length; i += 3){ pa.moveTo(treeDots[i] + treeDots[i + 2], treeDots[i + 1]); pa.arc(treeDots[i], treeDots[i + 1], treeDots[i + 2], 0, 7); } g.fillStyle = dark ? '#3f7a52' : '#7fba6a'; g.fill(pa); } };
      /* trees in the greens */
      if(k > 1.0) vd.forEach(q => G.parks(q).forEach((pk, pi) => { for(let a = 0; a < 3; a++) for(let b = 0; b < 4; b++){ const u = -9 + a * 9 + ((q * 7 + a * 3 + b) % 5 - 2), vv = (26 + b * 15 + ((q * 3 + b * 5 + a) % 4)) * (pi ? 1 : -1), p = G.loc(q, u, vv); add(p[0], p[1], () => { const s0 = P(p[0], p[1], 0), s1 = P(p[0], p[1], flat ? 0 : 7); if(!s0 || !s1) return; const r = Math.max(2.4, 4.2 * k * s1[2]); if(!flat){ g.strokeStyle = dark ? '#3a2d22' : '#7b5b3a'; g.lineWidth = Math.max(1, 1.2 * k); g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); } g.beginPath(); g.arc(s1[0], s1[1], r, 0, 7); g.fillStyle = dark ? '#3f7a52' : '#7fba6a'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = dark ? '#2b5539' : '#5d9a52'; g.stroke(); }); } }));
      /* downtown buildings, the two campuses */
      for(const id in G.POIS){ if(id === 'hub' || id === 'park') continue; const p = G.POIS[id]; if(!near(p.x, p.y, 40)) continue; const hh = poiH(id), col = PC[id][0], S = BG && BG.landmark(id); add(p.x, p.y, () => { if(S && 24 * k > 6.5) drawShape(S, p.x, p.y, 0, 1, { px: 24 * k, detail: 24 * k > 70, tint: null }); else box(p.x, p.y, 24, 18, 0, hh, mix(th.roof, col, 0.35), mix('#e8e4da', col, 0.3)); }); }
      const plots = sc.plots || {}; for(const uid in plots) for(const kd of ['f', 'l']){ if(!plots[uid][kd]) continue; const c = G.plotCell(kd, uid); if(!near(c.x, c.y, 30)) continue; const mine = uid === sc.me, zc = kd === 'f' ? G.ZONES.ind.c : G.ZONES.uni.c; add(c.x, c.y, () => { box(c.x, c.y, c.w * 0.86, c.h * 0.8, 0, kd === 'f' ? 11 : 8, mine ? '#8fe0ad' : mix(th.roof, zc, 0.55), mine ? '#4fb87a' : mix('#e4dfd5', zc, 0.45)); }); }
      for(let q of vd) G.stations(q).forEach(s => { if(k < 1.1) return; add(s.x, s.y, () => { const c = s.t === 'fire' ? '#e5484d' : s.t === 'police' ? '#3a6fd8' : '#f4f4f4'; box(s.x, s.y, 12, 9, 0, 7, c, shade(c, 0.8)); }); });
      mark('collect'); farPass(); mark('far'); items.sort((a, b) => a.d - b.d); items.forEach(i => i.fn()); mark('items');
      if(cacheMode){ if(cacheMode === 1) SC.valid = ST.bakes === 0 && ST.fallback === 0 && ST.queued === 0 && !animFlag; else if(animFlag) SC.valid = false; SC.anim = animFlag; g = g0; g.drawImage(SC.cv, 0, 0, SC.cv.width, SC.cv.height, 0, 0, W, H); }   // an unfinished layer (sprites still baking) is not kept

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

      mark('dynamic');
      /* labels last, upright, with a halo */
      for(const zid of ['uni', 'ind']){ const zz = G.ZONES[zid]; const s = P((zz.x0 + zz.x1) / 2, zz.y0 - 14, 0); if(s && k < 3.4) halo(zz.n, s[0], s[1], clamp(11 * k * s[2] + 2, 10, 15), th.sub, 700); }
      if(k < 3.4){ const s = P(C.x, C.y - 116, 0); if(s) halo('Downtown', s[0], s[1], clamp(11 * k * s[2] + 2, 10, 16), th.sub, 700); }
      vd.forEach(q => { if(k > 3.0) return; const D = G.district(q), s = P(D.cx, D.cy - 112, 0); if(!s) return; halo(D.name, s[0], s[1], clamp(11 * k * s[2] + 3, 10.5, 18), th.text, 700); if(D.city && k < 1.6){ halo('CITY', s[0], s[1] + 13, 9, D.color, 800); } });
      for(const id in G.POIS){ if(id === 'hub') continue; const p = G.POIS[id], hh = poiH(id); const s = P(p.x, p.y, flat ? 0 : hh + 10); if(!onScreen(s, 40)) continue; const r = clamp(5.5 + k * 3.4, 7, 15);
        if(id === 'park'){ halo(p.n, s[0], s[1] - 18, 11, '#3e7d3a', 700); pin(p.x, p.y, r * 0.85, PC[id][0], id, X && X.t === 'poi' && X.id === id); continue; }
        pin(p.x, p.y, r, PC[id][0], id, X && X.t === 'poi' && X.id === id, flat ? 0 : hh + 10); if(k > 0.9) halo(p.n, s[0], s[1] + r + 9, 10.5, th.text, 600); }
      mark('labels');
      /* haze toward the horizon in 3D */
      if(!flat){ const hz2 = g.createLinearGradient(0, 0, 0, H * 0.42); hz2.addColorStop(0, th.land); hz2.addColorStop(1, th.land.replace('#', '#') + '00'); g.save(); g.globalAlpha = clamp(v.p * 0.9, 0, 0.7); g.fillStyle = hz2; g.fillRect(0, 0, W, H * 0.42); g.restore(); }
      /* governor: discrete LOD levels (x1, 1.35, 1.8, 2.5) driven by the real time between frames (so GPU/raster cost counts too). One step at most every 1.5 s and with a wide hysteresis band, so a steady view never flickers between tiers. */
      const ms = performance.now() - T0 - bakeT, dt = lastT0 ? T0 - lastT0 : 33; lastT0 = T0; if(dt < 400) emaDt = emaDt * 0.93 + dt * 0.07;
      if(!perfLow && T0 - govAt > 1500){ if(emaDt > 56 && govI < 3){ govI++; govAt = T0; } else if(emaDt < 38 && govI > 0){ govI--; govAt = T0; } } gov = GOVL[govI];
      ST.ms = ms; ST.gov = gov; ST.atlas = { pages: ATL.pages.length, entries: ATL.map.size, wipes: ATL.wipes };
    };
    /* a frame that throws half way must not leave `g` pointing at the cache layer or the no-op context (every later frame would then draw nowhere = a blank canvas) */
    R.draw = (sc, tt) => { g = g0; try{ drawFrame(sc, tt); } catch(e){ SC.valid = false; SC.anim = false; throw e; } finally { g = g0; } };
    return R;
  }
  return { create, PC, TH, POIH, KIND, LOD: { LOD, angBucket, angOf, pitchBucket, pitchOf, scaleBucket, scaleOf, spriteKey, makeAtlas, protoId } };
});
