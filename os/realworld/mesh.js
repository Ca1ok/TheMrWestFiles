/* REALWORLD · mesh — a tiny interleaved vertex-colour mesh builder. Shared by the chunk worker, the interiors, the Node tests and the main thread.
 * Vertex = 20 bytes: position f32×3 · normal i8×3 (+pad) · colour u8×4. Colour alpha 255 = ordinary surface; alpha < 250 flags a GLOWING surface (windows at night, lamps, screens, neon).
 * Winding is fixed up from the normal you give, so callers never have to think about triangle order. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.RWMesh = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const HEX = new Map();
  const rgb = h => { if(typeof h !== 'string') return h; let r = HEX.get(h); if(!r){ let s = h.replace('#', ''); if(s.length === 3) s = s.replace(/./g, '$&$&'); r = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; HEX.set(h, r); } return r; };
  const shade = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const GLOW = 128;
  class MB {
    constructor(cap){ this.cap = cap || 2048; this.n = 0; this.ni = 0; this.buf = new ArrayBuffer(this.cap * 20); this._v(); this.idx = new Uint32Array(this.cap * 2); this.minY = 1e9; this.maxY = -1e9; }
    _v(){ this.f = new Float32Array(this.buf); this.i8 = new Int8Array(this.buf); this.u8 = new Uint8Array(this.buf); }
    _grow(){ const nb = new ArrayBuffer(this.cap * 2 * 20); new Uint8Array(nb).set(this.u8); this.buf = nb; this.cap *= 2; this._v(); const ni = new Uint32Array(this.cap * 2); ni.set(this.idx); this.idx = ni; }
    v(x, y, z, nx, ny, nz, c, a){
      if(this.n >= this.cap) this._grow(); const i = this.n++, o = i * 5, b = i * 20;
      this.f[o] = x; this.f[o + 1] = y; this.f[o + 2] = z; this.i8[b + 12] = Math.round(nx * 127); this.i8[b + 13] = Math.round(ny * 127); this.i8[b + 14] = Math.round(nz * 127);
      this.u8[b + 16] = c[0] > 255 ? 255 : c[0] < 0 ? 0 : c[0]; this.u8[b + 17] = c[1] > 255 ? 255 : c[1] < 0 ? 0 : c[1]; this.u8[b + 18] = c[2] > 255 ? 255 : c[2] < 0 ? 0 : c[2]; this.u8[b + 19] = a === undefined ? 255 : a;
      if(y < this.minY) this.minY = y; if(y > this.maxY) this.maxY = y; return i;
    }
    tri(a, b, c){ if(this.ni + 3 > this.idx.length){ const ni = new Uint32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni; } this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
    /* four points (any order, any side) + the normal the face should have */
    quad(p0, p1, p2, p3, n, c, a){
      c = rgb(c); const g0 = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]), g1 = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]), g2 = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      const A = this.v(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, a), B = this.v(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, a), C = this.v(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, a), D = this.v(p3[0], p3[1], p3[2], n[0], n[1], n[2], c, a);
      if(g0 * n[0] + g1 * n[1] + g2 * n[2] >= 0){ this.tri(A, B, C); this.tri(A, C, D); } else { this.tri(A, C, B); this.tri(A, D, C); }
    }
    /* a convex polygon, optional per-vertex colours (cols[i]) */
    poly(pts, n, c, a, cols){
      const k = pts.length; if(k < 3) return; const p0 = pts[0]; let flip = false;
      for(let i = 1; i < k - 1; i++){ const p1 = pts[i], p2 = pts[i + 1], g0 = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]), g1 = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]), g2 = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]), L = Math.abs(g0) + Math.abs(g1) + Math.abs(g2); if(L > 1e-9){ flip = g0 * n[0] + g1 * n[1] + g2 * n[2] < 0; break; } }
      const base = this.n; c = rgb(c); for(let i = 0; i < k; i++){ const p = pts[i]; this.v(p[0], p[1], p[2], n[0], n[1], n[2], cols ? cols[i] : c, a); }
      for(let i = 1; i < k - 1; i++){ if(flip) this.tri(base, base + i + 1, base + i); else this.tri(base, base + i, base + i + 1); }
    }
    boxAA(x0, y0, z0, x1, y1, z1, cs, ct, a){
      cs = rgb(cs); ct = rgb(ct || cs);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], cs, a); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], cs, a);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], cs, a); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], cs, a);
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], ct, a);
    }
    /* box turned by `yaw` about the vertical axis: centre (cx, cz), half extents hw (along the turned x) × hd, from y0 to y1 */
    boxR(cx, cz, hw, hd, yaw, y0, y1, cs, ct, a){
      cs = rgb(cs); ct = rgb(ct || cs); const c = Math.cos(yaw), s = Math.sin(yaw), ux = c, uz = s, vx = -s, vz = c;
      const P = (a1, b1, y) => [cx + ux * hw * a1 + vx * hd * b1, y, cz + uz * hw * a1 + vz * hd * b1];
      const f = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for(let i = 0; i < 4; i++){ const A = f[i], B = f[(i + 1) % 4], mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, nx = ux * mx + vx * mz, nz = uz * mx + vz * mz; this.quad(P(A[0], A[1], y0), P(B[0], B[1], y0), P(B[0], B[1], y1), P(A[0], A[1], y1), [nx, 0, nz], cs, a); }
      this.quad(P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1), [0, 1, 0], ct, a);
    }
    cyl(x, z, y0, y1, r, segs, cs, ct, a){
      cs = rgb(cs); ct = rgb(ct || cs); const top = [];
      for(let i = 0; i < segs; i++){ const a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), am = (a0 + a1) / 2;
        this.quad([x + c0 * r, y0, z + s0 * r], [x + c1 * r, y0, z + s1 * r], [x + c1 * r, y1, z + s1 * r], [x + c0 * r, y1, z + s0 * r], [Math.cos(am), 0, Math.sin(am)], cs, a); top.push([x + c0 * r, y1, z + s0 * r]); }
      this.poly(top, [0, 1, 0], ct, a);
    }
    cone(x, z, y0, y1, r, segs, c, a){
      c = rgb(c); const h = y1 - y0, L = Math.hypot(h, r) || 1;
      for(let i = 0; i < segs; i++){ const a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832, am = (a0 + a1) / 2, nx = Math.cos(am) * h / L, nz = Math.sin(am) * h / L, ny = r / L;
        const A = this.v(x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r, Math.cos(a0) * h / L, ny, Math.sin(a0) * h / L, c, a), B = this.v(x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r, Math.cos(a1) * h / L, ny, Math.sin(a1) * h / L, c, a), T = this.v(x, y1, z, nx, ny, nz, c, a);
        this.tri(A, T, B); }
    }
    /* a flat strip following 3D points (x, y, z), `w` metres wide, facing up */
    ribbon(pts, w, c, a){
      const n = pts.length; if(n < 2) return; c = rgb(c); const L = [], R = [];
      for(let i = 0; i < n; i++){ const p = pts[i], q = pts[Math.max(0, i - 1)], r = pts[Math.min(n - 1, i + 1)]; let dx = r[0] - q[0], dz = r[2] - q[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; L.push([p[0] - dz * w / 2, p[1], p[2] + dx * w / 2]); R.push([p[0] + dz * w / 2, p[1], p[2] - dx * w / 2]); }
      for(let i = 0; i < n - 1; i++) this.quad(L[i], R[i], R[i + 1], L[i + 1], [0, 1, 0], c, a);
    }
    /* stamp a finished template mesh (see finish()) into this builder: scaled, turned by yaw about Y, moved to (x, y, z). tint = optional [r,g,b] 0..1 multiplier. Used by interiors for .glb furniture. */
    addMesh(t, x, y, z, yaw, k, tint){
      const f = new Float32Array(t.vb), i8 = new Int8Array(t.vb), u8 = new Uint8Array(t.vb), c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), base = this.n; k = k || 1;
      for(let i = 0; i < t.n; i++){ const px = f[i * 5] * k, py = f[i * 5 + 1] * k, pz = f[i * 5 + 2] * k, nx = i8[i * 20 + 12] / 127, ny = i8[i * 20 + 13] / 127, nz = i8[i * 20 + 14] / 127, b = i * 20;
        this.v(x + px * c + pz * s, y + py, z - px * s + pz * c, nx * c + nz * s, ny, -nx * s + nz * c, [u8[b + 16] * (tint ? tint[0] : 1), u8[b + 17] * (tint ? tint[1] : 1), u8[b + 18] * (tint ? tint[2] : 1)], u8[b + 19]); }
      while(this.ni + t.ni > this.idx.length){ const ni = new Uint32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni; }
      for(let i = 0; i < t.ni; i++) this.idx[this.ni++] = base + t.ib[i];
      return this;
    }
    finish(){ const vb = this.buf.slice(0, this.n * 20), ib = this.n < 65536 ? new Uint16Array(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni); return { vb, n: this.n, ib, ni: this.ni, minY: this.n ? this.minY : 0, maxY: this.n ? this.maxY : 0 }; }
  }
  /* place a finished mesh into the world: local (x, y, z) → origin + k·(x·ex + z·nn) horizontally, origin + ky·y vertically (ky defaults to k). ex = [a, b] is where local +x points in the world (x, z), nn = [c, d] where local +z points (they must be a proper rotation: ex = [nn.z, -nn.x]). Normals are turned, not scaled. */
  function place(m, T){
    const f = new Float32Array(m.vb), i8 = new Int8Array(m.vb), k = T.k || 1, ky = T.ky === undefined ? k : T.ky, a = T.ex[0], b = T.ex[1], c = T.nn[0], d = T.nn[1]; let lo = 1e9, hi = -1e9;
    for(let i = 0; i < m.n; i++){ const x = f[i * 5], y = f[i * 5 + 1], z = f[i * 5 + 2]; f[i * 5] = T.ox + k * (x * a + z * c); f[i * 5 + 1] = T.oy + ky * y; f[i * 5 + 2] = T.oz + k * (x * b + z * d); const wy = f[i * 5 + 1]; if(wy < lo) lo = wy; if(wy > hi) hi = wy;
      const nx = i8[i * 20 + 12] / 127, nz = i8[i * 20 + 14] / 127; i8[i * 20 + 12] = Math.round((nx * a + nz * c) * 127); i8[i * 20 + 14] = Math.round((nx * b + nz * d) * 127); }
    m.minY = m.n ? lo : 0; m.maxY = m.n ? hi : 0; return m;
  }
  return { MB, rgb, shade, mix, GLOW, place };
});
