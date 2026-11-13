/* GL3D — a small, dependency-free WebGL 1 engine for WestOS (no build step, no CDN, works offline).
 *
 *   const eng = GL3D.create(canvas, { bg:[.04,.02,.12], fog:{ color:[.04,.02,.12], density:.03 }, maxFps:60 });   // null when WebGL is unavailable → keep your 2D fallback
 *   eng.camera.set([0,3,6],[0,0,0]);  eng.lights.dir.dir = [-.4,-1,-.3];  eng.lights.points.push({ pos:[0,2,0], color:[1,.2,.9], range:8 });
 *   const n = new GL3D.Node(GL3D.mesh.box(1,1,1), GL3D.material({ color:[1,.5,.2,1], map:tex, bump:bumpTex, spec:.5 }));   eng.add(n);   n.castShadow = true;
 *   eng.onUpdate = (dt, t) => { n.rot[1] += dt; };   eng.start();   // the loop stops and frees the GPU by itself once the canvas leaves the page
 *
 * Features: Blinn-Phong with 1 directional + 4 point lights, hemisphere ambient, fake environment reflections, derivative bump mapping (when the browser has
 * OES_standard_derivatives), emissive maps, alpha-cut / blended / additive materials, exp² fog, a gradient backdrop, single-pass planar shadows (stencil),
 * point-sprite particles, promise-based tweens (`await eng.tween(400, t => …)`), picking rays, mesh builders (plane, quad, box, roundedBox, cylinder, sphere,
 * torus, lathe), an OBJ parser, and automatic recovery from a lost GL context. All GPU objects are created lazily, so one Mesh/Texture can be shared by several engines.
 * Pure parts (math, mesh builders, OBJ parsing) also run in Node — see tests/gl3d.test.js. Docs: assets/3d/README.md and AGENTS.md §14. */
(function(root){
  'use strict';
  const D2R = Math.PI / 180, TAU = Math.PI * 2;

  /* ============================== vec / mat ============================== */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  };
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  const M = {
    ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(o, a, b){ const t = new Float32Array(16); for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++) t[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; o.set(t); return o; },
    persp(o, fov, asp, n, f){ const t = 1 / Math.tan(fov / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    lookAt(o, e, c, up){ const z = V.norm(V.sub(e, c)); let x = V.cross(up, z); if(V.len(x) < 1e-6) x = [1, 0, 0]; x = V.norm(x); const y = V.cross(z, x);
      o.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, e), -V.dot(y, e), -V.dot(z, e), 1]); return o; },
    /* translate · rotate (Euler, applied Z then X then Y) · scale */
    trs(o, p, r, s){ const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
      o[0] = (cy * cz + sy * sx * sz) * s[0]; o[1] = cx * sz * s[0]; o[2] = (-sy * cz + cy * sx * sz) * s[0]; o[3] = 0;
      o[4] = (-cy * sz + sy * sx * cz) * s[1]; o[5] = cx * cz * s[1]; o[6] = (sy * sz + cy * sx * cz) * s[1]; o[7] = 0;
      o[8] = sy * cx * s[2]; o[9] = -sx * s[2]; o[10] = cy * cx * s[2]; o[11] = 0; o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o; },
    /* inverse-transpose of the upper 3×3 (correct normals under non-uniform scale) */
    nrm3(o, m){ const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      o[0] = e * i - f * h; o[1] = f * g - d * i; o[2] = d * h - e * g; o[3] = c * h - b * i; o[4] = a * i - c * g; o[5] = b * g - a * h; o[6] = b * f - c * e; o[7] = c * d - a * f; o[8] = a * e - b * d; return o; },
    xf4: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3]],
    xf: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
    inv(o, m){ const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if(!d) return null; d = 1 / d;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d; return o; }
  };

  /* ============================== easing ============================== */
  const ease = {
    linear: t => t, inQuad: t => t * t, outQuad: t => t * (2 - t), inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    outCubic: t => 1 - Math.pow(1 - t, 3), inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, inCubic: t => t * t * t,
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1,
    outBounce: t => { const n = 7.5625, d = 2.75; if(t < 1 / d) return n * t * t; if(t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if(t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; }
  };

  /* ============================== meshes ============================== */
  /* A Mesh is plain CPU data (interleaved pos3 nor3 uv2 + indices). The GPU copy is made lazily per engine. */
  function Mesh(vertices, indices){
    this.v = vertices instanceof Float32Array ? vertices : new Float32Array(vertices); this.i = indices; this._gpu = new Map();
    let r = 0, cx = 0, cy = 0, cz = 0; const n = this.v.length / 8, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for(let k = 0; k < n; k++) for(let a = 0; a < 3; a++){ const x = this.v[k * 8 + a]; if(x < mn[a]) mn[a] = x; if(x > mx[a]) mx[a] = x; }
    cx = (mn[0] + mx[0]) / 2; cy = (mn[1] + mx[1]) / 2; cz = (mn[2] + mx[2]) / 2;
    for(let k = 0; k < n; k++) r = Math.max(r, Math.hypot(this.v[k * 8] - cx, this.v[k * 8 + 1] - cy, this.v[k * 8 + 2] - cz));
    this.center = [cx, cy, cz]; this.radius = r; this.min = mn; this.max = mx;
  }
  function MB(){ this.p = []; this.i = []; }
  MB.prototype.v = function(x, y, z, nx, ny, nz, u, v){ this.p.push(x, y, z, nx, ny, nz, u, v); return this.p.length / 8 - 1; };
  MB.prototype.t = function(a, b, c){ this.i.push(a, b, c); };
  MB.prototype.q = function(a, b, c, d){ this.i.push(a, b, c, a, c, d); };
  MB.prototype.build = function(){                                   // fixes triangle winding against the stored normals, so builders can't get it wrong
    const p = this.p, ix = this.i; for(let k = 0; k < ix.length; k += 3){
      const a = ix[k] * 8, b = ix[k + 1] * 8, c = ix[k + 2] * 8, e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]], g = V.cross(e1, e2);
      const nx = p[a + 3] + p[b + 3] + p[c + 3], ny = p[a + 4] + p[b + 4] + p[c + 4], nz = p[a + 5] + p[b + 5] + p[c + 5];
      if(g[0] * nx + g[1] * ny + g[2] * nz < 0){ const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } }
    if(this.p.length / 8 > 65535) throw new Error('GL3D: mesh too large (max 65535 vertices)');
    return new Mesh(new Float32Array(p), new Uint16Array(ix)); };

  const mesh = {
    /* horizontal plane facing +Y; uv.v = 0 at the far (−Z) edge. rep = texture repeats across / along */
    plane(w, d, sx, sz, repU, repV){ sx = sx || 1; sz = sz || 1; repU = repU || 1; repV = repV == null ? repU : repV; const b = new MB();
      for(let j = 0; j <= sz; j++) for(let i = 0; i <= sx; i++) b.v((i / sx - .5) * w, 0, (j / sz - .5) * d, 0, 1, 0, i / sx * repU, j / sz * repV);
      for(let j = 0; j < sz; j++) for(let i = 0; i < sx; i++){ const a = j * (sx + 1) + i; b.q(a, a + sx + 1, a + sx + 2, a + 1); } return b.build(); },
    /* vertical quad in the XY plane facing +Z (cards, labels, sprites). centred */
    quad(w, h, repU, repV){ repU = repU || 1; repV = repV || 1; const b = new MB(), x = w / 2, y = h / 2;
      b.v(-x, -y, 0, 0, 0, 1, 0, repV); b.v(x, -y, 0, 0, 0, 1, repU, repV); b.v(x, y, 0, 0, 0, 1, repU, 0); b.v(-x, y, 0, 0, 0, 1, 0, 0); b.q(0, 1, 2, 3); return b.build(); },
    box(w, h, d){ return mesh.roundedBox(w, h, d, 0, 1); },
    /* r = corner radius, seg = segments per bevel (r = 0 gives a plain cube with hard edges) */
    roundedBox(w, h, d, r, seg){ const b = new MB(), hx = w / 2, hy = h / 2, hz = d / 2; r = Math.min(r || 0, hx, hy, hz); seg = r > 0 ? Math.max(1, seg || 4) : 1;
      const axis = a => { if(!(r > 0)) return [-a, a]; const o = []; for(let k = 0; k <= seg; k++) o.push(-a + r * k / seg); for(let k = 0; k <= seg; k++) o.push(a - r + r * k / seg); return o; };
      const faces = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
      const H = [hx, hy, hz];
      faces.forEach(([n, rr, uu]) => { const ra = rr.findIndex(x => x), ua = uu.findIndex(x => x), A = axis(H[ra]), B = axis(H[ua]), base = b.p.length / 8, cols = A.length;
        for(let j = 0; j < B.length; j++) for(let i = 0; i < A.length; i++){
          const P = [n[0] * H[0], n[1] * H[1], n[2] * H[2]]; P[ra] += rr[ra] * A[i]; P[ua] += uu[ua] * B[j];
          let nx = n[0], ny = n[1], nz = n[2], X = P[0], Y = P[1], Z = P[2];
          if(r > 0){ const ix = clamp(P[0], -hx + r, hx - r), iy = clamp(P[1], -hy + r, hy - r), iz = clamp(P[2], -hz + r, hz - r), q = V.norm([P[0] - ix, P[1] - iy, P[2] - iz]); nx = q[0]; ny = q[1]; nz = q[2]; X = ix + nx * r; Y = iy + ny * r; Z = iz + nz * r; }
          b.v(X, Y, Z, nx, ny, nz, (A[i] / H[ra] * rr[ra] + 1) / 2, 1 - (B[j] / H[ua] * uu[ua] + 1) / 2); }
        for(let j = 0; j < B.length - 1; j++) for(let i = 0; i < cols - 1; i++){ const a = base + j * cols + i; b.q(a, a + 1, a + cols + 1, a + cols); } });
      return b.build(); },
    /* Y-axis cylinder / cone. opt: { top, bottom, h, seg, caps, uRep, capU } — side uv wraps once around (u = 0..uRep) */
    cylinder(rt, rb, h, seg, caps, uRep){ seg = seg || 32; const b = new MB(), hh = h / 2, sl = (rb - rt) / h;
      for(let i = 0; i <= seg; i++){ const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a), n = V.norm([c, sl, s]); b.v(c * rt, hh, s * rt, n[0], n[1], n[2], i / seg * (uRep || 1), 0); b.v(c * rb, -hh, s * rb, n[0], n[1], n[2], i / seg * (uRep || 1), 1); }
      for(let i = 0; i < seg; i++){ const a = i * 2; b.q(a, a + 1, a + 3, a + 2); }
      if(caps !== false){ [[rt, hh, 1], [rb, -hh, -1]].forEach(([r, y, ny]) => { if(!(r > 0)) return; const c0 = b.v(0, y, 0, 0, ny, 0, .5, .5), st = b.p.length / 8; for(let i = 0; i <= seg; i++){ const a = i / seg * TAU; b.v(Math.cos(a) * r, y, Math.sin(a) * r, 0, ny, 0, .5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5); } for(let i = 0; i < seg; i++) b.t(c0, st + i, st + i + 1); }); }
      return b.build(); },
    sphere(r, sw, sh){ sw = sw || 32; sh = sh || 20; const b = new MB(); for(let j = 0; j <= sh; j++){ const t = j / sh * Math.PI, y = Math.cos(t), rr = Math.sin(t); for(let i = 0; i <= sw; i++){ const a = i / sw * TAU, x = Math.cos(a) * rr, z = Math.sin(a) * rr; b.v(x * r, y * r, z * r, x, y, z, i / sw, j / sh); } }
      for(let j = 0; j < sh; j++) for(let i = 0; i < sw; i++){ const a = j * (sw + 1) + i; b.q(a, a + sw + 1, a + sw + 2, a + 1); } return b.build(); },
    torus(R, r, sr, st){ sr = sr || 32; st = st || 14; const b = new MB(); for(let j = 0; j <= st; j++){ const t = j / st * TAU, ct = Math.cos(t), stn = Math.sin(t); for(let i = 0; i <= sr; i++){ const a = i / sr * TAU, ca = Math.cos(a), sa = Math.sin(a); b.v((R + r * ct) * ca, r * stn, (R + r * ct) * sa, ct * ca, stn, ct * sa, i / sr, j / st); } }
      for(let j = 0; j < st; j++) for(let i = 0; i < sr; i++){ const a = j * (sr + 1) + i; b.q(a, a + 1, a + sr + 2, a + sr + 1); } return b.build(); },
    /* revolve a profile [[radius, y], …] (bottom → top, outside surface) around Y — chips, coins, glasses, trophies. opt.hard: sharp edges between profile points */
    lathe(profile, seg, hard, uRep){ seg = seg || 32; const b = new MB(), n = profile.length, segN = [];
      for(let k = 0; k < n - 1; k++){ const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1], l = Math.hypot(dr, dy) || 1; segN.push([dy / l, -dr / l]); }
      const nrm = (k, side) => { if(hard) return segN[clamp(side === 0 ? k - 1 : k, 0, n - 2)]; const a = segN[Math.max(0, k - 1)], c = segN[Math.min(n - 2, k)], x = a[0] + c[0], y = a[1] + c[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
      let acc = 0; const lens = [0]; for(let k = 1; k < n; k++){ acc += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]); lens.push(acc); }
      const rows = []; for(let k = 0; k < n; k++){ const reps = hard && k > 0 && k < n - 1 ? [0, 1] : [0]; reps.forEach(side => { const nn = nrm(k, side), vv = acc ? lens[k] / acc : 0, row = []; for(let i = 0; i <= seg; i++){ const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a); row.push(b.v(c * profile[k][0], profile[k][1], s * profile[k][0], c * nn[0], nn[1], s * nn[0], i / seg * (uRep || 1), 1 - vv)); } rows.push(row); }); }
      for(let k = 0; k < rows.length - 1; k++) for(let i = 0; i < seg; i++) b.q(rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]);
      return b.build(); },
    /* flat disc facing +Y (radius r), planar uv */
    disc(r, seg){ seg = seg || 32; const b = new MB(), c0 = b.v(0, 0, 0, 0, 1, 0, .5, .5); for(let i = 0; i <= seg; i++){ const a = i / seg * TAU; b.v(Math.cos(a) * r, 0, Math.sin(a) * r, 0, 1, 0, .5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5); } for(let i = 0; i < seg; i++) b.t(c0, 1 + i, 2 + i); return b.build(); }
  };

  /* Wavefront OBJ → Mesh (v / vt / vn / f, any polygon is fan-triangulated; missing normals are computed flat-smooth). Y-up, counter-clockwise. */
  function parseOBJ(text, opt){
    opt = opt || {}; const P = [], T = [], N = [], map = new Map(), out = [], idx = []; let hasN = true;
    text.split(/\r?\n/).forEach(line => { const s = line.trim().split(/\s+/), k = s[0];
      if(k === 'v') P.push([+s[1], +s[2], +s[3]]); else if(k === 'vt') T.push([+s[1], 1 - (+s[2] || 0)]); else if(k === 'vn') N.push([+s[1], +s[2], +s[3]]);
      else if(k === 'f'){ const ids = s.slice(1).map(tok => { const part = tok.split('/'), rel = (x, L) => { const n = parseInt(x, 10); return n < 0 ? L + n : n - 1; }, pi = rel(part[0], P.length), ti = part[1] ? rel(part[1], T.length) : -1, ni = part[2] ? rel(part[2], N.length) : -1; if(ni < 0) hasN = false; const key = pi + '/' + ti + '/' + ni; let id = map.get(key);
          if(id == null){ id = out.length / 8; map.set(key, id); const p = P[pi] || [0, 0, 0], n = ni >= 0 ? N[ni] : [0, 0, 0], t = ti >= 0 ? T[ti] : [0, 0]; out.push(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1]); } return id; });
        for(let q = 1; q < ids.length - 1; q++) idx.push(ids[0], ids[q], ids[q + 1]); } });
    if(!hasN){ for(let k = 0; k < out.length; k += 8){ out[k + 3] = out[k + 4] = out[k + 5] = 0; }
      for(let k = 0; k < idx.length; k += 3){ const a = idx[k] * 8, b = idx[k + 1] * 8, c = idx[k + 2] * 8, g = V.cross([out[b] - out[a], out[b + 1] - out[a + 1], out[b + 2] - out[a + 2]], [out[c] - out[a], out[c + 1] - out[a + 1], out[c + 2] - out[a + 2]]); [a, b, c].forEach(o => { out[o + 3] += g[0]; out[o + 4] += g[1]; out[o + 5] += g[2]; }); }
      for(let k = 0; k < out.length; k += 8){ const n = V.norm([out[k + 3], out[k + 4], out[k + 5]]); out[k + 3] = n[0]; out[k + 4] = n[1]; out[k + 5] = n[2]; } }
    if(opt.scale){ for(let k = 0; k < out.length; k += 8){ out[k] *= opt.scale; out[k + 1] *= opt.scale; out[k + 2] *= opt.scale; } }
    if(out.length / 8 > 65535) throw new Error('GL3D: OBJ has more than 65535 vertices');
    return new Mesh(new Float32Array(out), new Uint16Array(idx));
  }

  /* ============================== textures / materials / nodes ============================== */
  /* source: canvas | image | ImageData | { w, h, data: Uint8Array } — keep sizes a power of two if you want repeat + mipmaps (otherwise it clamps) */
  function Texture(source, o){ o = o || {}; this.src = source; this.repeat = o.repeat !== false; this.mip = o.mip !== false; this.nearest = !!o.nearest; this.aniso = o.aniso == null ? 4 : o.aniso; this._gpu = new Map(); this.srgb = false; }
  Texture.prototype.update = function(){ this._gpu.forEach(g => { g.stale = true; }); };           // call after redrawing a canvas texture
  function material(o){ return Object.assign({ color: [1, 1, 1, 1], map: null, bump: null, emap: null, emissive: [0, 0, 0], spec: .25, shine: 32, refl: 0, bumpK: 1, unlit: false, blend: 'none', cull: true, depthWrite: true, alphaCut: 0, uv: [1, 1, 0, 0], fog: true }, o || {}); }
  function Node(m, mat){ this.mesh = m || null; this.mat = mat || null; this.pos = [0, 0, 0]; this.rot = [0, 0, 0]; this.scl = [1, 1, 1]; this.children = []; this.parent = null; this.visible = true; this.castShadow = false; this.billboard = null; this.pickable = false; this.order = 0; this.local = M.ident(); this.world = M.ident(); this.name = ''; this.data = null; }
  Node.prototype.add = function(n){ if(n.parent) n.parent.remove(n); n.parent = this; this.children.push(n); return n; };
  Node.prototype.remove = function(n){ const i = this.children.indexOf(n); if(i >= 0){ this.children.splice(i, 1); n.parent = null; } return n; };
  Node.prototype.at = function(x, y, z){ this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; return this; };
  Node.prototype.rotate = function(x, y, z){ this.rot[0] = x; this.rot[1] = y; this.rot[2] = z; return this; };
  Node.prototype.scaleTo = function(x, y, z){ this.scl[0] = x; this.scl[1] = y == null ? x : y; this.scl[2] = z == null ? x : z; return this; };
  Node.prototype.worldPos = function(){ return [this.world[12], this.world[13], this.world[14]]; };
  Node.prototype.each = function(f){ f(this); this.children.forEach(c => c.each(f)); };
  Node.prototype.dispose = function(){ if(this.parent) this.parent.remove(this); };

  /* ============================== shaders ============================== */
  const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv; uniform mat4 uModel; uniform mat4 uVP; uniform mat3 uNrm; uniform vec4 uUv; varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vD;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = normalize(uNrm * aNor); vUv = aUv * uUv.xy + uUv.zw; gl_Position = uVP * w; vD = gl_Position.w; }`;
  const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMap; uniform sampler2D uBump; uniform sampler2D uEmap; uniform vec4 uColor; uniform vec3 uEmis; uniform float uSpec; uniform float uShine; uniform float uRefl; uniform float uBumpK; uniform float uCut; uniform float uUnlit; uniform float uHasMap; uniform float uHasBump; uniform float uHasEmap; uniform float uFogOn;
uniform vec3 uEye; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uDirD; uniform vec3 uDirC; uniform vec3 uFogC; uniform float uFogD; uniform int uNPL; uniform vec4 uPLp[4]; uniform vec3 uPLc[4]; varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vD;
#ifdef HAS_DERIV
vec3 bumpN(vec3 N, vec3 p, float h){ vec3 dpx = dFdx(p); vec3 dpy = dFdy(p); float dhx = dFdx(h); float dhy = dFdy(h); vec3 r1 = cross(dpy, N); vec3 r2 = cross(N, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2); return normalize(abs(det) * N - g * uBumpK); }
#endif
void main(){
  vec4 base = uColor; if(uHasMap > .5) base *= texture2D(uMap, vUv);
  if(base.a < uCut) discard;
  vec3 col; vec3 emis = uEmis;
  if(uHasEmap > .5) emis += texture2D(uEmap, vUv).rgb;
  if(uUnlit > .5){ col = base.rgb + emis; }
  else {
    vec3 N = normalize(vN); vec3 V = normalize(uEye - vW); if(!gl_FrontFacing) N = -N;
    #ifdef HAS_DERIV
    if(uHasBump > .5) N = bumpN(N, vW, texture2D(uBump, vUv).r);
    #endif
    vec3 L = normalize(-uDirD); float nl = max(dot(N, L), 0.0);
    vec3 amb = mix(uGround, uSky, N.y * .5 + .5);
    vec3 diff = amb + uDirC * nl; vec3 spc = uDirC * pow(max(dot(N, normalize(L + V)), 0.0), uShine) * uSpec * step(.001, nl);
    for(int i = 0; i < 4; i++){ if(i >= uNPL) break; vec3 d = uPLp[i].xyz - vW; float dist = length(d); float att = clamp(1.0 - dist / uPLp[i].w, 0.0, 1.0); att *= att; vec3 Ld = d / max(dist, .0001); float pn = max(dot(N, Ld), 0.0);
      diff += uPLc[i] * pn * att; spc += uPLc[i] * pow(max(dot(N, normalize(Ld + V)), 0.0), uShine) * uSpec * att * step(.001, pn); }
    col = base.rgb * diff + spc + emis;
    if(uRefl > 0.0){ vec3 R = reflect(-V, N); vec3 env = mix(uGround * 1.6, uSky * 1.8, clamp(R.y * .5 + .5, 0.0, 1.0)); env += uDirC * pow(max(dot(R, L), 0.0), 24.0) * 1.4; float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0); col = mix(col, env * (base.rgb * .5 + .5), clamp(uRefl * (.35 + .65 * fr), 0.0, 1.0)); }
  }
  if(uFogOn > .5){ float f = 1.0 - exp(-uFogD * uFogD * vD * vD); col = mix(col, uFogC, clamp(f, 0.0, 1.0)); }
  gl_FragColor = vec4(col, base.a);
}`;
  const SVS = `attribute vec3 aPos; uniform mat4 uModel; uniform mat4 uVP; void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
  const SFS = `precision mediump float; uniform float uA; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, uA); }`;
  const PVS = `attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aSz; uniform mat4 uVP; uniform float uScale; varying vec4 vC; varying float vR; void main(){ vec4 p = uVP * vec4(aPos, 1.0); gl_Position = p; gl_PointSize = max(1.0, aSz.x * uScale / max(p.w, .01)); vC = aCol; vR = aSz.y; }`;
  const PFS = `precision mediump float; uniform float uShape; varying vec4 vC; varying float vR; void main(){ vec2 q = gl_PointCoord - .5; float c = cos(vR), s = sin(vR); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y); float a;
  if(uShape < .5){ float d = length(q) * 2.0; a = pow(clamp(1.0 - d, 0.0, 1.0), 1.6); }
  else if(uShape < 1.5){ a = (abs(q.x) < .28 && abs(q.y) < .46) ? 1.0 : 0.0; }
  else if(uShape < 2.5){ float d = length(q * vec2(1.0, 1.0)) * 2.0; float st = max(1.0 - abs(q.x) * 9.0, 0.0) * max(1.0 - abs(q.y) * 2.2, 0.0) + max(1.0 - abs(q.y) * 9.0, 0.0) * max(1.0 - abs(q.x) * 2.2, 0.0); a = clamp(st + pow(clamp(1.0 - d, 0.0, 1.0), 2.0), 0.0, 1.0); }
  else { float d = length(q * vec2(1.0, 1.0)) * 2.0; a = d < 1.0 ? 1.0 : 0.0; if(d > .8) a *= .6; }
  if(a <= .01) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }`;
  const BVS = `attribute vec2 aPos; varying vec2 vP; void main(){ vP = aPos * .5 + .5; gl_Position = vec4(aPos, 1.0, 1.0); }`;
  const BFS = `precision mediump float; uniform sampler2D uBg; varying vec2 vP; void main(){ gl_FragColor = vec4(texture2D(uBg, vec2(vP.x, 1.0 - vP.y)).rgb, 1.0); }`;

  let _supported = null;
  function supported(){ if(_supported !== null) return _supported; try{ const c = document.createElement('canvas'); _supported = !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }catch(e){ _supported = false; } return _supported; }

  /* ============================== engine ============================== */
  /* ---------- themes ("skins"): every engine re-colours itself from the active WestOS theme ----------
   * OS.skin3d() (set up by os/themes/runtime.js; reached through the app's own `OS`, or its parent frame's) returns { k, bg, fog, sky, ground, dir, point, pk, backdrop, fx } or null.
   * It is read every frame and BLENDED over what the scene set, never written into the scene, so a scene needs no theme code and switching themes is instant.
   * A scene opts out with GL3D.create(canvas, { skin:false }). Transparent overlays are never re-coloured. */
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const bdCache = new Map();
  function skinBackdrop(SK){                                    // gradient (+ stars) painted once per theme, shared by every engine in this window
    if(!SK.backdrop || typeof document === 'undefined') return null; let t = bdCache.get(SK.id); if(t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); if(!g) return null; const gr = g.createLinearGradient(0, 0, 0, 256); SK.backdrop.forEach(st => gr.addColorStop(st[0], st[1])); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    if(SK.stars){ let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for(let i = 0; i < 70; i++){ const y = r() * 150; g.fillStyle = 'rgba(255,255,255,' + (.25 + r() * .55) + ')'; g.fillRect(Math.floor(r() * 256), Math.floor(y), 1 + (r() < .15 ? 1 : 0), 1 + (r() < .15 ? 1 : 0)); } }
    t = new Texture(c, { repeat: false, mip: false }); bdCache.set(SK.id, t); return t;
  }
  function skinNow(o){
    if(o.skin === false || o.transparent) return null;
    try{ const w = root.OS || (root.parent && root.parent !== root && root.parent.OS); return w && w.skin3d ? w.skin3d() : null; }catch(e){ return null; }
  }

  let EID = 0;
  function create(canvas, opt){
    opt = opt || {};
    const attrs = { antialias: opt.antialias !== false, alpha: !!opt.transparent, stencil: true, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: !!opt.preserve };
    let gl = null; try{ gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); }catch(e){}
    if(!gl) return null;
    const id = ++EID, deriv = gl.getExtension('OES_standard_derivatives'), aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const E = { id, gl, canvas, scene: new Node(), time: 0, running: false, destroyed: false, quality: opt.quality || 'high', maxFps: opt.maxFps || 60, dprMax: opt.dprMax || (opt.quality === 'low' ? 1 : 2), onUpdate: null, onResize: null, onLost: null,
      bg: opt.bg || [.05, .04, .1], fog: opt.fog || { color: [.05, .04, .1], density: 0 }, backdrop: null, shadow: { enabled: opt.shadows !== false, y: 0, alpha: .38, eps: .004 },
      camera: { fov: 50 * D2R, near: .1, far: 200, pos: [0, 3, 6], target: [0, 0, 0], up: [0, 1, 0], set(p, t){ this.pos = p.slice(); if(t) this.target = t.slice(); return this; },
        orbit(yaw, pitch, dist, t){ t = t || this.target; this.target = t.slice(); this.pos = [t[0] + dist * Math.cos(pitch) * Math.sin(yaw), t[1] + dist * Math.sin(pitch), t[2] + dist * Math.cos(pitch) * Math.cos(yaw)]; return this; } },
      lights: { sky: [.45, .45, .6], ground: [.18, .15, .2], dir: { dir: [-.35, -1, -.45], color: [.9, .88, .8] }, points: [] },
      view: M.ident(), proj: M.ident(), vp: M.ident(), invVP: M.ident(), w: 1, h: 1, fps: 0, frames: 0 };
    let gen = 1, raf = 0, last = 0, seen = false, born = performance.now(), inView = true, io = null, ro = null, fpsT = 0, fpsN = 0; const tweens = [], systems = [], used = new Set();
    const hdr = deriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV\n' : '';

    /* ---------- programs ---------- */
    let P = {};
    function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ const m = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('GL3D shader: ' + m); } return s; }
    function prog(vs, fs, names, attrs){ const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); (attrs || ['aPos']).forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('GL3D link: ' + gl.getProgramInfoLog(p)); const u = {}; names.forEach(n => { u[n] = gl.getUniformLocation(p, n); }); return { p, u }; }
    function build(){
      P.main = prog(VS, hdr + FS, ['uModel', 'uVP', 'uNrm', 'uUv', 'uMap', 'uBump', 'uEmap', 'uColor', 'uEmis', 'uSpec', 'uShine', 'uRefl', 'uBumpK', 'uCut', 'uUnlit', 'uHasMap', 'uHasBump', 'uHasEmap', 'uFogOn', 'uEye', 'uSky', 'uGround', 'uDirD', 'uDirC', 'uFogC', 'uFogD', 'uNPL', 'uPLp[0]', 'uPLc[0]'], ['aPos', 'aNor', 'aUv']);
      P.shadow = prog(SVS, SFS, ['uModel', 'uVP', 'uA']); P.part = prog(PVS, PFS, ['uVP', 'uScale', 'uShape'], ['aPos', 'aCol', 'aSz']); P.bg = prog(BVS, BFS, ['uBg']);
      for(let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
      P.white = null; P.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      P.white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, P.white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      P.pbuf = gl.createBuffer(); P.gen = gen;
    }
    build();

    /* ---------- gpu resources (lazy, per engine, survive a lost context) ---------- */
    function gm(m){ let g = m._gpu.get(id); if(g && g.gen === gen) return g; const vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW); g = { gen, vb, ib, n: m.i.length }; m._gpu.set(id, g); used.add(m); return g; }
    const pot = n => n > 0 && (n & (n - 1)) === 0;
    function gt(t){ let g = t._gpu.get(id); if(g && g.gen === gen && !g.stale) return g.tex; if(!g || g.gen !== gen){ g = { gen, tex: gl.createTexture() }; t._gpu.set(id, g); used.add(t); } g.stale = false;
      gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); const s = t.src;
      if(s && s.data && s.w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.w, s.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.data); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
      const w = s.w || s.width, h = s.h || s.height, ok = pot(w) && pot(h), wrap = t.repeat && ok ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      if(t.mip && ok && !t.nearest){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.nearest ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.nearest ? gl.NEAREST : gl.LINEAR);
      if(aniso && t.aniso > 1 && t.mip && ok) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(t.aniso, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); return g.tex; }
    E.free = function(o){ const g = o._gpu.get(id); if(!g) return; if(g.vb){ gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); } if(g.tex) gl.deleteTexture(g.tex); o._gpu.delete(id); used.delete(o); };

    /* ---------- sizing ---------- */
    function resize(){ const dpr = Math.min(window.devicePixelRatio || 1, E.dprMax), cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height, w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr)); if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; } E.w = w; E.h = h; if(E.onResize) try{ E.onResize(w, h); }catch(e){} }
    E.resize = resize;

    /* ---------- tweens / waits ---------- */
    E.tween = (ms, fn, ez) => new Promise(res => { tweens.push({ t: 0, d: Math.max(1, ms) / 1000, fn, ez: typeof ez === 'function' ? ez : (ease[ez] || ease.linear), res }); });
    E.wait = ms => E.tween(ms);
    E.ease = ease;

    /* ---------- particles ---------- */
    E.particles = function(o){ o = o || {}; const S = { max: o.max || 300, blend: o.blend || 'add', shape: { glow: 0, square: 1, star: 2, dot: 3 }[o.shape || 'glow'], gravity: o.gravity == null ? -6 : o.gravity, drag: o.drag == null ? .5 : o.drag, p: [], visible: true };
      S.emit = (q) => { if(S.p.length >= S.max) S.p.shift(); S.p.push({ pos: q.pos.slice(), vel: (q.vel || [0, 0, 0]).slice(), col: (q.color || [1, 1, 1, 1]).slice(), size: q.size || .2, life: q.life || 1, age: 0, spin: q.spin || 0, rot: q.rot || 0, grow: q.grow || 0, g: q.gravity == null ? S.gravity : q.gravity }); };
      S.burst = (n, pos, speed, o2) => { o2 = o2 || {}; for(let k = 0; k < n; k++){ const a = Math.random() * TAU, e = (o2.up ? Math.random() * .5 + .35 : Math.random() * 2 - 1) * Math.PI / 2 * (o2.cone || 1), sp = speed * (.4 + Math.random() * .6), cs = o2.colors ? o2.colors[(Math.random() * o2.colors.length) | 0] : (o2.color || [1, 1, 1, 1]);
        S.emit({ pos, vel: [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp * (o2.up ? 1.4 : 1), Math.sin(a) * Math.cos(e) * sp], color: cs, size: (o2.size || .2) * (.6 + Math.random() * .8), life: (o2.life || 1) * (.6 + Math.random() * .7), spin: (Math.random() - .5) * 10, rot: Math.random() * TAU, grow: o2.grow || 0, gravity: o2.gravity }); } };
      S.clear = () => { S.p.length = 0; }; systems.push(S); S.dispose = () => { const i = systems.indexOf(S); if(i >= 0) systems.splice(i, 1); }; return S; };

    /* ---------- picking ---------- */
    E.ray = function(cx, cy){ const r = canvas.getBoundingClientRect(), x = ((cx - r.left) / r.width) * 2 - 1, y = 1 - ((cy - r.top) / r.height) * 2; M.inv(E.invVP, E.vp); if(!E.invVP) return null;
      const a = M.xf4(E.invVP, [x, y, -1, 1]), b = M.xf4(E.invVP, [x, y, 1, 1]); const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], f = [b[0] / b[3], b[1] / b[3], b[2] / b[3]]; return { o, d: V.norm(V.sub(f, o)) }; };
    E.rayPlane = (ray, y) => { if(!ray || Math.abs(ray.d[1]) < 1e-6) return null; const t = (y - ray.o[1]) / ray.d[1]; return t < 0 ? null : [ray.o[0] + ray.d[0] * t, y, ray.o[2] + ray.d[2] * t]; };
    E.pick = function(cx, cy){ const ray = E.ray(cx, cy); if(!ray) return null; let best = null, bt = 1e9; E.scene.each(n => { if(!n.pickable || !n.visible || !n.mesh) return; const c = M.xf(n.world, n.mesh.center), sc = Math.max(Math.hypot(n.world[0], n.world[1], n.world[2]), Math.hypot(n.world[4], n.world[5], n.world[6]), Math.hypot(n.world[8], n.world[9], n.world[10])), r = n.mesh.radius * sc, oc = V.sub(ray.o, c), b = V.dot(oc, ray.d), cc = V.dot(oc, oc) - r * r, disc = b * b - cc; if(disc < 0) return; const t = -b - Math.sqrt(disc); if(t > 0 && t < bt){ bt = t; best = n; } }); return best ? { node: best, dist: bt, ray } : null; };

    /* ---------- scene helpers ---------- */
    E.add = n => E.scene.add(n);
    E.setBackdrop = tex => { E.backdrop = tex; };
    E.snapshot = () => { render(0); return canvas.toDataURL('image/png'); };

    /* ---------- render ---------- */
    const tmp = M.ident(), nm = new Float32Array(9), items = [], vpv = new Float32Array(16), shM = M.ident(), ShadowMat = new Float32Array(16);
    function update(n, parent, camPos, camRight, camUp, camFwd){
      if(n.billboard){ const s = n.scl, p = parent ? M.xf(parent, n.pos) : n.pos; let r = camRight, u = camUp, f = camFwd; if(n.billboard === 'y'){ f = V.norm([camPos[0] - p[0], 0, camPos[2] - p[2]]); r = V.norm(V.cross([0, 1, 0], f)); u = [0, 1, 0]; } else { f = V.norm(V.sub(camPos, p)); r = V.norm(V.cross([0, 1, 0], f)); u = V.cross(f, r); }
        const w = n.world; w[0] = r[0] * s[0]; w[1] = r[1] * s[0]; w[2] = r[2] * s[0]; w[3] = 0; w[4] = u[0] * s[1]; w[5] = u[1] * s[1]; w[6] = u[2] * s[1]; w[7] = 0; w[8] = f[0] * s[2]; w[9] = f[1] * s[2]; w[10] = f[2] * s[2]; w[11] = 0; w[12] = p[0]; w[13] = p[1]; w[14] = p[2]; w[15] = 1; }
      else { M.trs(n.local, n.pos, n.rot, n.scl); if(parent) M.mul(n.world, parent, n.local); else n.world.set(n.local); }
      for(let i = 0; i < n.children.length; i++) update(n.children[i], n.world, camPos, camRight, camUp, camFwd); }
    function collect(n, vis){ vis = vis && n.visible; if(!vis) return; if(n.mesh && n.mat) items.push(n); for(let i = 0; i < n.children.length; i++) collect(n.children[i], vis); }
    function bindMesh(g){ gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24); }
    function tex(unit, t, flag){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t ? gt(t) : P.white); gl.uniform1f(flag, t ? 1 : 0); }
    function drawNode(n, U){ const m = n.mat, g = gm(n.mesh); bindMesh(g);
      gl.uniformMatrix4fv(U.uModel, false, n.world); M.nrm3(nm, n.world); gl.uniformMatrix3fv(U.uNrm, false, nm); gl.uniform4f(U.uUv, m.uv[0], m.uv[1], m.uv[2], m.uv[3]);
      gl.uniform4f(U.uColor, m.color[0], m.color[1], m.color[2], m.color[3] == null ? 1 : m.color[3]); gl.uniform3f(U.uEmis, m.emissive[0], m.emissive[1], m.emissive[2]); gl.uniform1f(U.uSpec, m.spec); gl.uniform1f(U.uShine, m.shine); gl.uniform1f(U.uRefl, m.refl); gl.uniform1f(U.uBumpK, m.bumpK); gl.uniform1f(U.uCut, m.alphaCut); gl.uniform1f(U.uUnlit, m.unlit ? 1 : 0); gl.uniform1f(U.uFogOn, m.fog && E.fog.density > 0 ? 1 : 0);
      tex(0, m.map, U.uHasMap); tex(1, deriv ? m.bump : null, U.uHasBump); tex(2, m.emap, U.uHasEmap);
      if(m.cull){ gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_SHORT, 0); }

    function render(dt){
      if(P.gen !== gen) build();
      const cam = E.camera, asp = E.w / E.h, SK = skinNow(opt);
      let bg = E.bg, fogC = E.fog.color, skyC = E.lights.sky, gndC = E.lights.ground, dirC = E.lights.dir.color, ptC = null, bdT = E.backdrop;
      if(SK){ const k = SK.k; if(SK.bg) bg = mixc(bg, SK.bg, k); if(SK.fog) fogC = mixc(fogC, SK.fog, k); if(SK.sky) skyC = mixc(skyC, SK.sky, k * .7); if(SK.ground) gndC = mixc(gndC, SK.ground, k * .7); if(SK.dir) dirC = mixc(dirC, SK.dir, k * .8); if(SK.dirMul !== 1) dirC = dirC.map(v => v * SK.dirMul); if(SK.point) ptC = SK.point; const t = skinBackdrop(SK); if(t) bdT = t; }
      M.persp(E.proj, cam.fov, asp, cam.near, cam.far); M.lookAt(E.view, cam.pos, cam.target, cam.up); M.mul(E.vp, E.proj, E.view);
      const f = V.norm(V.sub(cam.target, cam.pos)), r = V.norm(V.cross(f, cam.up)), u = V.cross(r, f); update(E.scene, null, cam.pos, r, u, V.mul(f, -1));
      gl.viewport(0, 0, E.w, E.h); gl.clearColor(bg[0], bg[1], bg[2], opt.transparent ? 0 : 1); gl.clearStencil(0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      if(bdT){ gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.useProgram(P.bg.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gt(bdT)); gl.uniform1i(P.bg.u.uBg, 0); gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2); }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      items.length = 0; collect(E.scene, true);
      const opaque = [], blended = [], added = []; items.forEach(n => { const b = n.mat.blend; (b === 'add' ? added : b === 'blend' ? blended : opaque).push(n); });
      const vz = n => { const w = n.world; return cam.pos ? -(V.dot(V.sub([w[12], w[13], w[14]], cam.pos), f)) : 0; };
      blended.sort((a, b) => (a.order - b.order) || (vz(a) - vz(b))); added.sort((a, b) => (a.order - b.order) || (vz(a) - vz(b))); opaque.sort((a, b) => a.order - b.order);
      /* main pass */
      const U = P.main.u; gl.useProgram(P.main.p); gl.uniformMatrix4fv(U.uVP, false, E.vp); gl.uniform3f(U.uEye, cam.pos[0], cam.pos[1], cam.pos[2]);
      const L = E.lights, dd = V.norm(L.dir.dir); gl.uniform3f(U.uSky, skyC[0], skyC[1], skyC[2]); gl.uniform3f(U.uGround, gndC[0], gndC[1], gndC[2]); gl.uniform3f(U.uDirD, dd[0], dd[1], dd[2]); gl.uniform3f(U.uDirC, dirC[0], dirC[1], dirC[2]);
      gl.uniform3f(U.uFogC, fogC[0], fogC[1], fogC[2]); gl.uniform1f(U.uFogD, E.fog.density || 0); gl.uniform1i(U.uMap, 0); gl.uniform1i(U.uBump, 1); gl.uniform1i(U.uEmap, 2);
      const np = Math.min(4, L.points.length), pp = new Float32Array(16), pc = new Float32Array(12); for(let i = 0; i < np; i++){ const q = L.points[i], k = q.intensity == null ? 1 : q.intensity, qc = ptC ? mixc(q.color, ptC, SK.pk) : q.color; pp.set([q.pos[0], q.pos[1], q.pos[2], q.range || 8], i * 4); pc.set([qc[0] * k, qc[1] * k, qc[2] * k], i * 3); }
      gl.uniform1i(U.uNPL, np); gl.uniform4fv(U['uPLp[0]'], pp); gl.uniform3fv(U['uPLc[0]'], pc);
      gl.disable(gl.BLEND); gl.depthMask(true); opaque.forEach(n => drawNode(n, U));
      /* planar shadows */
      if(E.shadow.enabled && E.quality !== 'low'){ const casters = opaque.filter(n => n.castShadow); if(casters.length){ const ld = V.norm(L.dir.dir), y = E.shadow.y; if(ld[1] < -.05){
        ShadowMat.set([1, 0, 0, 0, -ld[0] / ld[1], 0, -ld[2] / ld[1], 0, 0, 0, 1, 0, ld[0] * y / ld[1], y + E.shadow.eps, ld[2] * y / ld[1], 1]);
        gl.useProgram(P.shadow.p); gl.uniformMatrix4fv(P.shadow.u.uVP, false, E.vp); gl.uniform1f(P.shadow.u.uA, E.shadow.alpha); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR); gl.disable(gl.CULL_FACE);
        casters.forEach(n => { const g = gm(n.mesh); bindMesh(g); M.mul(shM, ShadowMat, n.world); gl.uniformMatrix4fv(P.shadow.u.uModel, false, shM); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_SHORT, 0); });
        gl.disable(gl.STENCIL_TEST); gl.depthMask(true); } } }
      /* blended + additive */
      gl.useProgram(P.main.p); gl.enable(gl.BLEND); gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); blended.forEach(n => { gl.depthMask(n.mat.depthWrite); drawNode(n, U); });
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); added.forEach(n => drawNode(n, U));
      /* particles */
      if(systems.length){ const PU = P.part.u; gl.useProgram(P.part.p); gl.uniformMatrix4fv(PU.uVP, false, E.vp); gl.uniform1f(PU.uScale, E.h * .5 * E.proj[5]); gl.disable(gl.CULL_FACE); gl.depthMask(false);
        systems.forEach(S => { if(!S.visible || !S.p.length) return; const inter = new Float32Array(S.p.length * 9);
          S.p.forEach((p, i) => { const k = clamp(p.age / p.life, 0, 1), fade = k < .12 ? k / .12 : 1 - (k - .12) / .88; inter.set([p.pos[0], p.pos[1], p.pos[2], p.col[0], p.col[1], p.col[2], p.col[3] * fade, Math.max(0, p.size + p.grow * p.age), p.rot], i * 9); });
          gl.bindBuffer(gl.ARRAY_BUFFER, P.pbuf); gl.bufferData(gl.ARRAY_BUFFER, inter, gl.DYNAMIC_DRAW); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
          gl.uniform1f(PU.uShape, S.shape); gl.blendFunc(gl.SRC_ALPHA, S.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.POINTS, 0, S.p.length); }); }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    E.render = () => render(0);

    /* ambient theme particles (snow, embers) around what the camera is looking at — sized and spread by camera distance, so they suit any scene scale */
    let fxS = null, fxId = '', fxAcc = 0;
    function skinFx(dt){
      const SK = skinNow(opt), fx = SK && SK.fx;
      if(!fx){ if(fxS){ fxS.dispose(); fxS = null; fxId = ''; } return; }
      if(!fxS || fxId !== SK.id){ if(fxS) fxS.dispose(); fxS = E.particles({ max: 320, blend: fx.blend, shape: fx.shape, gravity: 0, drag: fx.drag }); fxId = SK.id; }
      const c = E.camera, tg = c.target, d = Math.max(.6, Math.hypot(c.pos[0] - tg[0], c.pos[1] - tg[1], c.pos[2] - tg[2])), rnd = Math.random;
      fxAcc += fx.rate * (E.quality === 'low' ? .35 : 1) * dt;
      while(fxAcc >= 1){ fxAcc--; const dir = fx.dir < 0 ? -1 : 1, vy = dir * fx.fall * d, col = fx.colors[(rnd() * fx.colors.length) | 0];
        fxS.emit({ pos: [tg[0] + (rnd() - .5) * 2 * d, dir < 0 ? tg[1] + d * (.2 + rnd() * .8) : tg[1] - d * .5 + rnd() * d * .8, tg[2] + (rnd() - .5) * 2 * d], vel: [(rnd() - .5) * d * .06, vy, (rnd() - .5) * d * .06], gravity: vy * fx.drag, color: col, size: fx.size * d * (.6 + rnd() * .8), life: fx.life * (.7 + rnd() * .6), spin: (rnd() - .5) * 2, rot: rnd() * TAU }); }
    }
    function step(dt){
      E.time += dt; try{ skinFx(dt); }catch(e){}
      for(let i = tweens.length - 1; i >= 0; i--){ const T = tweens[i]; T.t += dt; const k = Math.min(1, T.t / T.d); if(T.fn){ try{ T.fn(T.ez(k), k); }catch(e){ } } if(k >= 1){ tweens.splice(i, 1); T.res(); } }
      for(let s = 0; s < systems.length; s++){ const S = systems[s]; for(let i = S.p.length - 1; i >= 0; i--){ const p = S.p[i]; p.age += dt; if(p.age >= p.life){ S.p.splice(i, 1); continue; } const dr = Math.exp(-S.drag * dt); p.vel[0] *= dr; p.vel[2] *= dr; p.vel[1] = p.vel[1] * dr + p.g * dt; p.pos[0] += p.vel[0] * dt; p.pos[1] += p.vel[1] * dt; p.pos[2] += p.vel[2] * dt; p.rot += p.spin * dt; } }
      if(E.onUpdate) try{ E.onUpdate(dt, E.time); }catch(e){ if(root.OS && root.OS.debug) try{ root.OS.debug.error('GL3D.onUpdate', e); }catch(_){} else console.error(e); }
    }
    function frame(now){
      if(!E.running) return; raf = requestAnimationFrame(frame);
      if(canvas.isConnected) seen = true; else if(seen || now - born > 4000){ E.destroy(); return; }
      if(!canvas.isConnected) return;
      const minDt = 1000 / E.maxFps; if(last && now - last < minDt - 2) return; const dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
      if(document.hidden || !inView){ step(dt); return; }                               // keep game time moving (tweens resolve) but skip the draw
      resize(); step(dt); render(dt); E.frames++; fpsN++; fpsT += dt; if(fpsT >= 1){ E.fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
    }
    E.start = () => { if(E.running || E.destroyed) return E; E.running = true; last = 0; raf = requestAnimationFrame(frame); return E; };
    E.stop = () => { E.running = false; cancelAnimationFrame(raf); return E; };
    E.destroy = () => { if(E.destroyed) return; E.destroyed = true; E.stop(); tweens.splice(0).forEach(T => T.res()); systems.length = 0; if(io) io.disconnect(); if(ro) ro.disconnect(); canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', back);
      try{ used.forEach(o => E.free(o)); gl.deleteProgram(P.main.p); gl.deleteProgram(P.shadow.p); gl.deleteProgram(P.part.p); gl.deleteProgram(P.bg.p); const x = gl.getExtension('WEBGL_lose_context'); if(x) x.loseContext(); }catch(e){} };
    const lost = e => { e.preventDefault(); gen++; if(E.onLost) try{ E.onLost(); }catch(_){} }, back = () => { gen++; };
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', back);
    if(typeof IntersectionObserver !== 'undefined'){ io = new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; }); io.observe(canvas); }
    if(typeof ResizeObserver !== 'undefined'){ ro = new ResizeObserver(() => resize()); ro.observe(canvas); }
    resize();
    /* convenience */
    E.node = (m, mat, x, y, z) => { const n = new Node(m, mat); if(x != null) n.at(x, y, z); E.scene.add(n); return n; };
    E.step = step;                                                                    // advance the simulation by hand (tests, screenshots)
    return E;
  }

  /* ============================== loaders ============================== */
  function loadImage(url){ return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('GL3D: could not load ' + url)); im.src = url; }); }
  function loadTexture(url, o){ return loadImage(url).then(im => new Texture(im, o)); }
  function loadOBJ(url, o){ return fetch(url).then(r => { if(!r.ok) throw new Error('GL3D: could not load ' + url); return r.text(); }).then(t => parseOBJ(t, o)); }

  const GL3D = { create, supported, Mesh, MB, Node, Texture, material, mesh, parseOBJ, loadImage, loadTexture, loadOBJ, V, M, ease, clamp, lerp, D2R, TAU };
  if(typeof module !== 'undefined' && module.exports) module.exports = GL3D; else root.GL3D = GL3D;
})(typeof window !== 'undefined' ? window : globalThis);
