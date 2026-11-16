/* REALWORLD · props — repeated scenery (trees, street lamps, benches) as INSTANCED meshes.
 * The chunk worker no longer bakes these into every chunk: it only emits one 32-byte instance per prop ([kind, x, y, z, yaw, scale, seed, 0]); the streamer gathers them into one GPU buffer per
 * (kind, level of detail) and draws each with ONE instanced call. Cost per tree = 32 bytes instead of ~1 KB of vertices, so a .glb tree with hundreds of triangles is affordable.
 * A kind has up to two level-of-detail templates (0 = near, 1 = far). Every template is a vertex-colour mesh in the engine's format (see mesh.js):
 *   alpha 255 = ordinary · alpha < 230 = glowing (lamp heads) · alpha 250 = TINTABLE (foliage: the colour comes from the instance, so every tree has its own green).
 * The procedural placeholders below work out of the box; drop a .glb in assets/world/ and list it in assets/world/manifest.json to replace one (see RealWorld.Assets in glb.js). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, M = root.RWMesh, KINDS = ['tree', 'lamp', 'bench'], TINT = 250;
  const T = {};   // 'kind:lod' → mesh
  const build = {
    'tree:0': () => { const mb = new M.MB(256); mb.cyl(0, 0, -0.1, 2.1, 0.17, 5, '#604630'); mb.cone(0, 0, 1.4, 4.6, 2.1, 7, [215, 215, 215], TINT); mb.cone(0, 0, 3.2, 6.4, 1.5, 7, [245, 245, 245], TINT); return mb.finish(); },
    'tree:1': () => { const mb = new M.MB(64); mb.cone(0, 0, 0, 5.5, 1.9, 5, [225, 225, 225], TINT); return mb.finish(); },
    'lamp:0': () => { const mb = new M.MB(64); mb.cyl(0, 0, 0, 4.9, 0.07, 4, '#464a52'); mb.boxAA(-0.35, 4.85, -0.35, 0.35, 5.05, 0.35, '#ffe0a0', '#ffe0a0', M.GLOW); return mb.finish(); },
    'bench:0': () => {   /* seat faces −z (north) like everything else: the backrest is on the +z side */ const mb = new M.MB(128), w = '#7a5a3a', t = '#9a7a52', f = '#33363d'; mb.boxAA(-0.9, 0.42, -0.25, 0.9, 0.48, 0.25, w, t); mb.boxAA(-0.9, 0.62, 0.2, 0.9, 0.95, 0.28, w, t); mb.boxAA(-0.85, 0, -0.22, -0.75, 0.42, 0.22, f); mb.boxAA(0.75, 0, -0.22, 0.85, 0.42, 0.22, f); return mb.finish(); }
  };
  /* what to draw for a kind at a chunk's LOD: tree 0/1, lamp 0, bench 0 (null = nothing) */
  const lodFor = (kind, chunkLod) => kind === 0 ? (chunkLod <= 0 ? 0 : chunkLod === 1 ? 1 : -1) : chunkLod <= 0 ? 0 : (kind === 2 && chunkLod === 1 ? 0 : -1);
  const template = (kind, lod) => { const k = KINDS[kind] + ':' + lod; if(!T[k] && build[k]) T[k] = build[k](); return T[k] || (lod > 0 ? template(kind, 0) : null); };
  /* replace a template with a loaded model (RealWorld.Assets does this) */
  const set = (name, lod, mesh) => { const k = KINDS.indexOf(name); if(k < 0) return false; T[name + ':' + lod] = mesh; RW.Props.rev++; return true; };
  RW.Props = { KINDS, TINT, lodFor, template, set, rev: 0, id: n => KINDS.indexOf(n) };
})(typeof self !== 'undefined' ? self : this);
