/* LIB · house3d — an interactive 3D preview of one house (or any BuildGen shape): drag to orbit, wheel / pinch to zoom, it turns slowly by itself.
 *   const V = House3D.create(canvas, shape, { dark, tint });   V.set({ forSale, rented, mine, damage, fire });   V.shape(newShape);   V.destroy();
 * Plain Canvas2D (no WebGL needed): faces are culled by their normals and painted far → near. Used by apps/WestMap.html and apps/RealEstate.html. */
(function(root){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), SLOTS = ['wall', 'roof', 'trim', 'glass', 'door', 'yard', 'water', 'wall2', 'roof2'];
  const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const mixc = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + [0, 1, 2].map(i => ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2)).join(''); };
  const lit = (h, f) => { const x = hex(h); return 'rgb(' + x.map(v => Math.round(clamp(v * f, 0, 255))).join(',') + ')'; };
  const SUN = (() => { const v = [0.45, 0.55, 0.7], L = Math.hypot(...v); return v.map(a => a / L); })();

  function box(F, x0, y0, z0, x1, y1, z1, c){ const q = (p, n) => F.push({ p, n, c }); q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]); q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]); q([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]); q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]); q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]); }
  function tree(F, x, y, s, seed){ const r = 2.2 * s, h = 5.2 * s, T = '#6b4b32', g = ['#5fa05a', '#6fb064', '#4f9150'][seed % 3]; box(F, x - 0.25 * s, y - 0.25 * s, 0, x + 0.25 * s, y + 0.25 * s, 2 * s, T);
    const top = [x, y, h + r * 0.6], ring = [[x - r, y - r, 2 * s], [x + r, y - r, 2 * s], [x + r, y + r, 2 * s], [x - r, y + r, 2 * s]];
    for(let i = 0; i < 4; i++){ const a = ring[i], b = ring[(i + 1) % 4], mx = (a[0] + b[0]) / 2 - x, my = (a[1] + b[1]) / 2 - y, L = Math.hypot(mx, my) || 1; F.push({ p: [a, b, top], n: [mx / L * 0.8, my / L * 0.8, 0.6], c: g }); } }

  function create(cv, shape, opt){
    opt = opt || {}; const g = cv.getContext('2d'); let st = {}, S = shape, scene = [], yaw = 0.7, pitch = 0.5, dist = 70, zoom = 1, auto = true, raf = 0, dead = false, W = 0, H = 0, t0 = performance.now(), drag = null, pts = new Map(), pd = 0;
    const dark = () => opt.dark != null ? (typeof opt.dark === 'function' ? opt.dark() : opt.dark) : false;
    function rebuild(){ const F = []; scene = F; if(!S) return; const w = S.w, d = S.d, sd = Math.max(w, d);
      /* lot: lawn, pavement, road, path to the door, trees, sale sign */
      const L = sd * 1.25 + 4; F.push({ p: [[-L, -L, 0], [L, -L, 0], [L, L, 0], [-L, L, 0]], n: [0, 0, 1], c: '#86b873', flat: 1 });
      const fy = d / 2; F.push({ p: [[-L, fy + 2.2, 0.02], [L, fy + 2.2, 0.02], [L, fy + 4.2, 0.02], [-L, fy + 4.2, 0.02]], n: [0, 0, 1], c: '#cfc8ba', flat: 1 }); F.push({ p: [[-L, fy + 4.2, 0.03], [L, fy + 4.2, 0.03], [L, fy + 12, 0.03], [-L, fy + 12, 0.03]], n: [0, 0, 1], c: '#4a4d55', flat: 1 }); for(let x = -L + 2; x < L - 3; x += 7) F.push({ p: [[x, fy + 7.8, 0.04], [x + 3.4, fy + 7.8, 0.04], [x + 3.4, fy + 8.4, 0.04], [x, fy + 8.4, 0.04]], n: [0, 0, 1], c: '#e9e3c9', flat: 1 });
      F.push({ p: [[-0.9, fy, 0.03], [0.9, fy, 0.03], [0.9, fy + 2.2, 0.03], [-0.9, fy + 2.2, 0.03]], n: [0, 0, 1], c: '#d7cfbe', flat: 1 });
      const seed = (S.i || 3) | 0; [[-L * 0.78, -L * 0.55, 1.1], [L * 0.8, -L * 0.2, 1.3], [-L * 0.75, L * 0.35, 0.9], [L * 0.72, L * 0.62, 1]].forEach((q, i) => { if(S.h < 40 || i < 2) tree(F, q[0], q[1], q[2], seed + i); });
      if(st.forSale){ const x = w / 2 + 1.8, y = fy + 1.4; box(F, x - 0.12, y - 0.12, 0, x + 0.12, y + 0.12, 3.4, '#6b4b32'); box(F, x - 1.4, y - 0.08, 2.0, x + 1.4, y + 0.08, 3.4, '#ffd24a'); }
      if(st.mine){ const x = -w / 2 - 1.6, y = fy + 1.4; box(F, x - 0.1, y - 0.1, 0, x + 0.1, y + 0.1, 4.2, '#d8d8d8'); box(F, x + 0.1, y - 0.05, 3.0, x + 1.7, y + 0.05, 4.1, '#34c759'); }
      if(st.water){ } }
    function resize(){ const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); W = Math.max(60, r.width); H = Math.max(60, r.height); cv.width = Math.round(W * d); cv.height = Math.round(H * d); g.setTransform(d, 0, 0, d, 0, 0); }
    function frame(now){
      if(dead || !cv.isConnected){ dead = true; return; } raf = requestAnimationFrame(frame); if(document.hidden) return; if(!W) resize(); if(auto) yaw += 0.0035;
      const dk = dark(), sz = S ? Math.max(S.w, S.d, S.h * 0.8) : 20, D = (sz * 1.55 + 15) / zoom, tz = S ? Math.min(S.h * 0.42, 22) : 3, cp = Math.cos(pitch), sp = Math.sin(pitch);
      const eye = [Math.sin(yaw) * cp * D, -Math.cos(yaw) * cp * D, tz + sp * D]; let fx = -eye[0], fy = -eye[1], fz = tz - eye[2]; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let rx = fy, ry = -fx, rz = 0; const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl; const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx, FOC = Math.min(W, H) * 1.05;
      g.clearRect(0, 0, W, H); const sky = g.createLinearGradient(0, 0, 0, H); if(dk){ sky.addColorStop(0, '#1b2434'); sky.addColorStop(1, '#3a4658'); } else { sky.addColorStop(0, '#9cc7ec'); sky.addColorStop(1, '#e8f1f7'); } g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const proj = p => { const vx = p[0] - eye[0], vy = p[1] - eye[1], vz = p[2] - eye[2], zc = vx * fx + vy * fy + vz * fz; if(zc < 1) return null; return [W / 2 + FOC * (vx * rx + vy * ry + vz * rz) / zc, H * 0.52 - FOC * (vx * ux + vy * uy + vz * uz) / zc, zc]; };
      const pal = S ? S.pal : {}, tint = st.tint, dim = dk ? 0.72 : 1, ambient = dk ? 0.42 : 0.55;
      const colOf = c => { if(typeof c === 'string') return c; let h = pal[SLOTS[c]] || '#ccc'; if(tint && (c === 1 || c === 8)) h = mixc(h, tint, 0.28); return h; };
      const faces = []; const addF = (f, parent) => { const n = f.n || [0, 0, 1], p0 = f.p || null; faces.push(f); };
      const list = [];
      scene.forEach(f => { if(f.flat) list.push({ P: f.p.map(q => proj(q)), c: f.c, n: f.n, k: -1e9 + 0, flat: 1 }); else { const cx = (f.p[0][0] + f.p[2][0]) / 2, cy = (f.p[0][1] + f.p[2][1]) / 2, cz = (f.p[0][2] + f.p[2][2]) / 2; if(n3(f.n, eye, [cx, cy, cz]) <= 0) return; list.push({ P: f.p.map(q => proj(q)), c: f.c, n: f.n, k: -dsq(eye, [cx, cy, cz]) }); } });
      if(S){ const V = S.V; S.F.forEach(f => { const vi = f.v, a = vi[0] * 3, b = vi[vi.length >> 1] * 3, c = [(V[a] + V[b]) / 2, (V[a + 1] + V[b + 1]) / 2, (V[a + 2] + V[b + 2]) / 2]; if(n3(f.n, eye, c) <= 0) return; const e = { P: vi.map(i => proj([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]])), c: f.c, n: f.n, k: -dsq(eye, c), kids: f.k, b: f.b }; list.push(e); });
        if(st.fire || st.damage > 0){ } }
      list.sort((a, b) => a.k - b.k);
      const shadow = S ? proj([0, 0, 0]) : null; if(shadow){ g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(shadow[0] + 6, shadow[1] + 4, Math.max(S.w, S.d) * 0.62 * FOC / shadow[2], Math.max(S.w, S.d) * 0.36 * FOC / shadow[2], 0, 0, 7); g.fill(); }
      const paint = (e, kid) => { if(e.P.some(p => !p)) return; const n = e.n, f = ambient + (1 - ambient) * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]); g.beginPath(); e.P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = lit(colOf(e.c), (e.flat ? 1 : f + (kid && e.c === 3 ? 0.15 : 0)) * dim); g.fill(); if(!e.flat && !kid){ g.lineWidth = 0.6; g.strokeStyle = 'rgba(0,0,0,.22)'; g.stroke(); } };
      list.forEach(e => { paint(e, false); if(e.b && e.P[0] && !e.flat){ } if(e.kids) e.kids.forEach(k => { const V = S.V; paint({ P: k.v.map(i => proj([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]])), c: k.c, n: k.n }, true); }); });
      if(st.fire || st.damage > 0){ const top = proj([0, 0, S.h + 2]); if(top){ const p = 0.6 + 0.4 * Math.sin(now / 130); g.fillStyle = 'rgba(255,' + Math.round(90 + 70 * p) + ',30,.9)'; const r = 1.6 * FOC / top[2]; g.beginPath(); g.moveTo(top[0], top[1] - r * 3 * (0.8 + 0.3 * p)); g.lineTo(top[0] + r, top[1]); g.lineTo(top[0] - r, top[1]); g.fill(); } }
    }
    const n3 = (n, e, c) => n[0] * (e[0] - c[0]) + n[1] * (e[1] - c[1]) + n[2] * (e[2] - c[2]), dsq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
    const down = e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); auto = false; clearTimeout(down.t); if(pts.size === 2){ const a = [...pts.values()]; pd = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); } cv.style.cursor = 'grabbing'; };
    const move = e => { if(!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId); if(pts.size === 2){ pts.set(e.pointerId, [e.clientX, e.clientY]); const a = [...pts.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if(pd) zoom = clamp(zoom * d / pd, 0.5, 3); pd = d; return; } yaw -= (e.clientX - p[0]) * 0.008; pitch = clamp(pitch + (e.clientY - p[1]) * 0.006, 0.08, 1.35); pts.set(e.pointerId, [e.clientX, e.clientY]); };
    const up = e => { pts.delete(e.pointerId); pd = 0; cv.style.cursor = 'grab'; if(!pts.size){ clearTimeout(down.t); down.t = setTimeout(() => { auto = true; }, 3500); } };
    const wheel = e => { e.preventDefault(); zoom = clamp(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 3); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { W = 0; }) : null; if(ro) ro.observe(cv);
    rebuild(); raf = requestAnimationFrame(frame);
    return { set(s){ st = Object.assign({}, st, s); if(s && s.tint !== undefined) opt.tint = s.tint; rebuild(); }, shape(s){ S = s; rebuild(); }, orbit(y){ yaw = y; auto = false; }, destroy(){ dead = true; cancelAnimationFrame(raf); if(ro) ro.disconnect(); } };
  }
  root.House3D = { create };
})(typeof self !== 'undefined' ? self : this);
