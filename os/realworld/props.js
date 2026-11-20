/* REALWORLD · props — repeated scenery (trees, street lamps, benches) as INSTANCED meshes.
 * The chunk worker no longer bakes these into every chunk: it only emits one 32-byte instance per prop ([kind, x, y, z, yaw, scale, seed, 0]); the streamer gathers them into one GPU buffer per
 * (kind, level of detail) and draws each with ONE instanced call. Cost per tree = 32 bytes instead of ~1 KB of vertices, so a .glb tree with hundreds of triangles is affordable.
 * A kind has up to two level-of-detail templates (0 = near, 1 = far). Every template is a vertex-colour mesh in the engine's format (see mesh.js):
 *   alpha 255 = ordinary · alpha < 230 = glowing (lamp heads) · alpha 250 = TINTABLE (foliage: the colour comes from the instance, so every tree has its own green).
 * The procedural placeholders below work out of the box; drop a .glb in assets/world/ and list it in assets/world/manifest.json to replace one (see RealWorld.Assets in glb.js). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, M = root.RWMesh, KINDS = ['tree', 'lamp', 'bench', 'pine', 'palm', 'bush', 'rock', 'spire', 'flowers', 'hydrant', 'bin', 'mailbox', 'sign', 'busstop', 'boat'], TINT = 250;   // ids 0-2 are the originals; the order is mirrored by KIND in chunkgen.js
  const T = {};   // 'kind:lod' → mesh
  const build = {
    'tree:0': () => { const mb = new M.MB(256); mb.cyl(0, 0, -0.1, 2.1, 0.17, 5, '#604630'); mb.cone(0, 0, 1.4, 4.6, 2.1, 7, [215, 215, 215], TINT); mb.cone(0, 0, 3.2, 6.4, 1.5, 7, [245, 245, 245], TINT); return mb.finish(); },
    'tree:1': () => { const mb = new M.MB(64); mb.cone(0, 0, 0, 5.5, 1.9, 5, [225, 225, 225], TINT); return mb.finish(); },
    'lamp:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 4.9, 0.07, 4, '#464a52'); mb.boxAA(-0.35, 4.85, -0.35, 0.35, 5.05, 0.35, '#ffe0a0', '#ffe0a0', M.GLOW); return mb.finish(); },
    'bench:0': () => {   /* seat faces −z (north) like everything else: the backrest is on the +z side */ const mb = new M.MB(128), w = '#7a5a3a', t = '#9a7a52', f = '#33363d'; mb.boxAA(-0.9, 0.42, -0.25, 0.9, 0.48, 0.25, w, t); mb.boxAA(-0.9, 0.62, 0.2, 0.9, 0.95, 0.28, w, t); mb.boxAA(-0.85, 0, -0.22, -0.75, 0.42, 0.22, f); mb.boxAA(0.75, 0, -0.22, 0.85, 0.42, 0.22, f); return mb.finish(); },

    /* ---- the island's scenery: conifers on the slopes, palms on the beaches, shrubs, rocks, flowers, street furniture, boats ---- */
    'pine:0': () => { const mb = new M.MB(256); mb.cyl(0, 0, -0.1, 1.4, 0.2, 5, '#4f3a28'); mb.cone(0, 0, 0.8, 3.5, 1.95, 7, [205, 205, 205], TINT); mb.cone(0, 0, 2.3, 4.9, 1.5, 7, [225, 225, 225], TINT); mb.cone(0, 0, 3.8, 6.1, 1.1, 7, [240, 240, 240], TINT); mb.cone(0, 0, 4.9, 7.6, 0.7, 6, [255, 255, 255], TINT); return mb.finish(); },
    'pine:1': () => { const mb = new M.MB(64); mb.cone(0, 0, 0.4, 7.6, 1.8, 5, [225, 225, 225], TINT); return mb.finish(); },
    'palm:0': () => { const mb = new M.MB(384), tr = '#8a6a4a', tr2 = '#a07e58';
      mb.cyl(0, 0, -0.1, 2.3, 0.23, 6, tr, tr2); mb.cyl(0.12, 0, 2.3, 4.6, 0.19, 6, tr2, tr); mb.cyl(0.36, 0, 4.6, 6.7, 0.16, 6, tr, tr2);
      const hx = 0.4, hy = 6.7; for(let k = 0; k < 7; k++){ const a = k / 7 * 6.2832 + 0.3, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca, tx = hx + ca * 3.3, tz = sa * 3.3, ty = hy - 1.2, mx = hx + ca * 1.7, mz = sa * 1.7, my = hy + 0.5;
        const P = (x, y, z) => [x, y, z]; mb.quad(P(hx, hy, 0), P(mx + px * 0.45, my, mz + pz * 0.45), P(tx, ty, tz), P(mx - px * 0.45, my, mz - pz * 0.45), [0, 1, 0], [235, 235, 235], TINT); mb.quad(P(hx, hy, 0), P(mx - px * 0.45, my, mz - pz * 0.45), P(tx, ty, tz), P(mx + px * 0.45, my, mz + pz * 0.45), [0, -1, 0], [200, 200, 200], TINT); }
      mb.cyl(hx, 0, hy - 0.35, hy + 0.15, 0.3, 5, '#6b4f33'); return mb.finish(); },
    'palm:1': () => { const mb = new M.MB(64); mb.cyl(0.2, 0, 0, 6.7, 0.2, 4, '#8a6a4a'); mb.cone(0.4, 0, 5.4, 7.4, 3.0, 6, [230, 230, 230], TINT); return mb.finish(); },
    'bush:0': () => { const mb = new M.MB(96); mb.cone(0, 0, -0.05, 1.05, 0.95, 6, [235, 235, 235], TINT); mb.cone(0.55, 0.25, -0.05, 0.8, 0.65, 5, [205, 205, 205], TINT); mb.cone(-0.5, -0.3, -0.05, 0.7, 0.55, 5, [250, 250, 250], TINT); return mb.finish(); },
    'rock:0': () => { const mb = new M.MB(96); mb.cone(0, 0, -0.2, 1.0, 1.25, 5, '#837e76'); mb.cone(0.7, 0.25, -0.2, 0.62, 0.8, 4, '#6e6a64'); mb.cone(-0.55, -0.3, -0.2, 0.5, 0.65, 5, '#938d84'); return mb.finish(); },
    'rock:1': () => { const mb = new M.MB(32); mb.cone(0, 0, -0.2, 1.0, 1.3, 4, '#837e76'); return mb.finish(); },
    'spire:0': () => { const mb = new M.MB(128); mb.cone(0, 0, -0.5, 7.0, 2.6, 5, '#7b766f'); mb.cone(1.1, 0.5, -0.5, 4.2, 1.7, 4, '#6a655f'); mb.cone(-1.0, -0.6, -0.5, 3.1, 1.5, 5, '#8d877e'); return mb.finish(); },
    'spire:1': () => { const mb = new M.MB(32); mb.cone(0, 0, -0.5, 7.0, 2.8, 4, '#7b766f'); return mb.finish(); },
    'flowers:0': () => { const mb = new M.MB(160); const sp = [[0, 0], [0.35, 0.2], [-0.3, 0.3], [0.15, -0.35], [-0.25, -0.2], [0.5, -0.1]]; sp.forEach((p, i) => { const h = 0.34 + (i % 3) * 0.1; mb.cyl(p[0], p[1], 0, h, 0.012, 3, '#4c8a3c'); mb.boxAA(p[0] - 0.07, h, p[1] - 0.07, p[0] + 0.07, h + 0.11, p[1] + 0.07, [255, 255, 255], [255, 255, 255], TINT); mb.cone(p[0], p[1], -0.02, 0.22, 0.2, 4, '#4f8f3d'); }); return mb.finish(); },
    'hydrant:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 0.62, 0.13, 6, '#c0392b', '#d24a3c'); mb.cyl(0, 0, 0.62, 0.74, 0.16, 6, '#a82f24', '#a82f24'); mb.boxAA(-0.2, 0.34, -0.06, 0.2, 0.46, 0.06, '#c0392b'); mb.boxAA(-0.06, 0.34, -0.2, 0.06, 0.46, 0.2, '#c0392b'); return mb.finish(); },
    'bin:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 0.9, 0.3, 8, '#3c5a48', '#3c5a48'); mb.cyl(0, 0, 0.9, 1.0, 0.33, 8, '#2c3e33', '#33463a'); mb.boxAA(-0.31, 0.55, -0.03, 0.31, 0.62, 0.03, '#1f2a24'); return mb.finish(); },
    'mailbox:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 1.05, 0.04, 4, '#5a4630'); mb.boxAA(-0.2, 1.05, -0.3, 0.2, 1.32, 0.3, '#2d5aa0', '#3a6cb8'); mb.boxAA(0.2, 1.2, -0.04, 0.24, 1.38, 0.04, '#d0392b'); return mb.finish(); },
    'sign:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 2.7, 0.045, 4, '#6a6f78'); mb.boxAA(-0.5, 2.3, -0.035, 0.5, 2.75, 0.035, '#1f6f43', '#1f6f43'); mb.boxAA(-0.42, 2.4, -0.04, 0.42, 2.46, 0.04, '#f3f3f3'); mb.boxAA(-0.3, 2.56, -0.04, 0.3, 2.62, 0.04, '#f3f3f3'); return mb.finish(); },
    'busstop:0': () => { const mb = new M.MB(192), f = '#3d4a5c'; mb.boxAA(-1.7, 2.45, -0.85, 1.7, 2.58, 0.85, f, '#566478'); [[-1.55, -0.7], [1.55, -0.7], [-1.55, 0.7], [1.55, 0.7]].forEach(p => mb.boxAA(p[0] - 0.05, 0, p[1] - 0.05, p[0] + 0.05, 2.45, p[1] + 0.05, f));
      mb.boxAA(-1.5, 0.45, 0.72, 1.5, 2.4, 0.78, '#8fb8c8', '#8fb8c8'); mb.boxAA(-1.5, 0.45, -0.72, -1.44, 2.4, 0.72, '#8fb8c8'); mb.boxAA(-1.2, 0.42, 0.25, 1.2, 0.5, 0.65, '#7a5a3a', '#9a7a52'); mb.boxAA(1.85, 0, -0.05, 1.93, 2.4, 0.05, '#464a52'); mb.boxAA(1.55, 2.0, -0.04, 2.25, 2.45, 0.04, '#e0a020'); return mb.finish(); },
    'boat:0': () => { const mb = new M.MB(192), hull = '#eeeef2', stripe = '#2a5d9f';
      mb.boxAA(-1.0, -0.35, -2.4, 1.0, 0.65, 2.2, hull, '#f6f6f8'); mb.boxAA(-1.03, 0.1, -2.4, -1.0, 0.3, 2.2, stripe); mb.boxAA(1.0, 0.1, -2.4, 1.03, 0.3, 2.2, stripe);
      const bt = [[-1.0, 0.65, -2.4], [1.0, 0.65, -2.4], [0, 0.65, -4.1]], bb = [[-1.0, -0.35, -2.4], [1.0, -0.35, -2.4], [0, -0.35, -4.1]];
      mb.poly(bt, [0, 1, 0], '#f6f6f8'); mb.quad(bb[0], bb[2], bt[2], bt[0], [-0.85, 0, -0.5], hull); mb.quad(bb[2], bb[1], bt[1], bt[2], [0.85, 0, -0.5], hull);
      mb.boxAA(-0.75, 0.65, -0.9, 0.75, 1.55, 1.0, '#f4f4f7', '#2f6fb0'); mb.boxAA(-0.7, 0.95, -0.92, 0.7, 1.4, -0.9, '#334a60'); mb.cyl(0, 0.2, 1.55, 2.5, 0.04, 4, '#9aa0aa'); return mb.finish(); },
  };
  /* what to draw for a kind at a chunk's LOD: tree 0/1, lamp 0 (1 too when a loaded model has a far version), bench 0 (null = nothing) */
  const lodFor = (kind, chunkLod) => kind === 0 ? (chunkLod <= 0 ? 0 : chunkLod === 1 ? 1 : -1) : chunkLod <= 0 ? 0 : kind > 2 ? (chunkLod === 1 && build[KINDS[kind] + ':1'] ? 1 : -1) : (kind === 2 && chunkLod === 1 ? 0 : kind === 1 && chunkLod === 1 && T['lamp:1:0'] ? 1 : -1);
  /* variants: a kind can have several loaded models (e.g. two trees); an instance picks one by its seed. T key = 'kind:lod:variant'; the procedural placeholders are variant 0 */
  const NV = {};
  const nv = kind => NV[KINDS[kind]] || 1;
  const template = (kind, lod, v) => { v = v || 0; const k = KINDS[kind] + ':' + lod + ':' + v; if(!T[k] && v === 0 && build[KINDS[kind] + ':' + lod]) T[k] = build[KINDS[kind] + ':' + lod](); return T[k] || (lod > 0 ? template(kind, 0, v) : v > 0 ? template(kind, lod, 0) : null); };
  /* replace a template with a loaded model (RealWorld.Assets does this). variant 0 first: the other variants are extra looks for the same kind */
  const set = (name, lod, mesh, v) => { const k = KINDS.indexOf(name); if(k < 0) return false; v = v || 0; T[name + ':' + lod + ':' + v] = mesh; if(lod === 0) NV[name] = Math.max(NV[name] || 1, v + 1); RW.Props.rev++; return true; };
  const PAL = { 0: [0x3d7a45, 0x4a8a4e, 0x5a9a52, 0x2f6b3d, 0x6a9f4a, 0x3a8060, 0x7aa84e], 3: [0x2f5d3a, 0x355f3e, 0x2b5236, 0x3d6b46, 0x2a4f3a], 4: [0x5fa545, 0x6fb04a, 0x52984a, 0x7ab84f], 5: [0x4a8a4e, 0x5a9a52, 0x3f7d45, 0x6aa04c, 0x58853f], 8: [0xe74c3c, 0xf1c40f, 0xecf0f1, 0x9b59b6, 0xff8fb0, 0xff9f43, 0x4aa3df] };
  const palette = (kind, seed) => { const p = PAL[kind]; return p ? p[Math.floor(seed * p.length) % p.length] : 0xffffff; };     // per-instance foliage colour (kind, seed 0..1)
  RW.Props = { KINDS, TINT, palette, lodFor, template, set, nv, rev: 0, id: n => KINDS.indexOf(n), cars: [], people: [], pivot: null, furn: {} };
})(typeof self !== 'undefined' ? self : this);
