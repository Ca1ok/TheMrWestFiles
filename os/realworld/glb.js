/* REALWORLD · glb — a small, dependency-free glTF 2.0 binary (.glb) reader + the asset manifest loader.
 *   RealWorld.Glb.parse(arrayBuffer, { height, ground }) → a vertex-colour mesh in the engine's format (or throws a clear Error)
 *   await RealWorld.Assets.load(baseUrl) → reads <baseUrl>manifest.json and replaces the procedural props that have a model. No manifest / no file / a bad file = the procedural prop stays.
 * What is read: every mesh in the default scene (node transforms baked in), triangles with POSITION (+NORMAL, +COLOR_0), indices u8/u16/u32, material baseColorFactor (+ emissiveFactor → glows).
 * What is NOT: textures (the world shader is vertex-colour only: bake colour into the model or use one material per colour), skins, animation, morph targets.
 * Compression: uncompressed .glb works out of the box. EXT_meshopt_compression is decoded when a global MeshoptDecoder exists (load meshopt_decoder.js first) — UNTESTED here. KHR_draco is refused with a message.
 * Units are metres, Y up. A prop's origin should be where it touches the ground, facing −Z (north); yaw 0 = north. `height` (manifest) rescales the model to that many metres tall. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('./mesh.js')); else { const RW = root.RealWorld = root.RealWorld || {}; const o = factory(root.RWMesh, RW); RW.Glb = o.Glb; RW.Assets = o.Assets; } })(typeof self !== 'undefined' ? self : this, function(M, RW){
  const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const srgb = v => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
  const mul = (a, b) => { const o = new Array(16).fill(0); for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++) for(let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
  const trs = n => { if(n.matrix) return n.matrix; const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], x = q[0], y = q[1], z = q[2], w = q[3];
    return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; };
  function parse(buf, opt){
    opt = opt || {}; const dv = new DataView(buf); if(buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a .glb file'); if(dv.getUint32(4, true) !== 2) throw new Error('only glTF 2.0 is supported');
    let json = null, bin = null; for(let o = 12; o + 8 <= buf.byteLength;){ const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true); if(type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o + 8, len))); else if(type === 0x004E4942 && !bin) bin = new Uint8Array(buf, o + 8, len); o += 8 + len + ((4 - len % 4) % 4); }
    if(!json || !bin) throw new Error('.glb has no JSON/BIN chunk'); const used = (json.extensionsRequired || []).concat(json.extensionsUsed || []);
    if(used.includes('KHR_draco_mesh_compression')) throw new Error('Draco-compressed .glb is not supported — export without compression (or with meshopt)');
    const views = json.bufferViews || [];
    const viewBytes = i => { const v = views[i], ext = v.extensions && v.extensions.EXT_meshopt_compression;
      if(ext){ const D = root.MeshoptDecoder; if(!D || !D.decodeGltfBuffer) throw new Error('this .glb uses meshopt compression: load meshopt_decoder.js first'); const out = new Uint8Array(ext.count * ext.byteStride); D.decodeGltfBuffer(out, ext.count, ext.byteStride, new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength), ext.mode, ext.filter); return { a: out, stride: ext.byteStride }; }
      return { a: new Uint8Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0), v.byteLength), stride: v.byteStride || 0 }; };
    const read = idx => { const ac = json.accessors[idx], [T, sz] = CT[ac.componentType], nc = NC[ac.type], vw = viewBytes(ac.bufferView), st = vw.stride || sz * nc, off = ac.byteOffset || 0, out = new Float32Array(ac.count * nc), norm = !!ac.normalized && ac.componentType !== 5126, dvv = new DataView(vw.a.buffer, vw.a.byteOffset, vw.a.byteLength);
      const get = { 5120: (o) => dvv.getInt8(o), 5121: o => dvv.getUint8(o), 5122: o => dvv.getInt16(o, true), 5123: o => dvv.getUint16(o, true), 5125: o => dvv.getUint32(o, true), 5126: o => dvv.getFloat32(o, true) }[ac.componentType], mx = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[ac.componentType];
      for(let i = 0; i < ac.count; i++) for(let c = 0; c < nc; c++){ let v = get(off + i * st + c * sz); if(norm) v = Math.max(-1, v / mx); out[i * nc + c] = v; } return { d: out, nc, count: ac.count }; };
    const scene = json.scenes && json.scenes[json.scene || 0], roots = scene ? scene.nodes : (json.nodes || []).map((n, i) => i), mb = new M.MB(1024), I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; let prims = 0;
    const visit = (ni, parent) => { const n = json.nodes[ni], W = mul(parent, trs(n)); if(n.mesh !== undefined) for(const p of json.meshes[n.mesh].primitives){ if(p.mode !== undefined && p.mode !== 4) continue; prims++;
        const pos = read(p.attributes.POSITION), nrm = p.attributes.NORMAL !== undefined ? read(p.attributes.NORMAL) : null, col = p.attributes.COLOR_0 !== undefined ? read(p.attributes.COLOR_0) : null, mat = p.material !== undefined ? json.materials[p.material] : null, pbr = (mat && mat.pbrMetallicRoughness) || {}, bc = pbr.baseColorFactor || [1, 1, 1, 1], em = mat && mat.emissiveFactor && (mat.emissiveFactor[0] + mat.emissiveFactor[1] + mat.emissiveFactor[2]) > 0.3;
        const idx = p.indices !== undefined ? read(p.indices).d : Array.from({ length: pos.count }, (_, i) => i), base = mb.n;
        for(let i = 0; i < pos.count; i++){ const x = pos.d[i * 3], y = pos.d[i * 3 + 1], z = pos.d[i * 3 + 2], wx = W[0] * x + W[4] * y + W[8] * z + W[12], wy = W[1] * x + W[5] * y + W[9] * z + W[13], wz = W[2] * x + W[6] * y + W[10] * z + W[14];
          let nx = 0, ny = 1, nz = 0; if(nrm){ const a = nrm.d[i * 3], b = nrm.d[i * 3 + 1], c = nrm.d[i * 3 + 2]; nx = W[0] * a + W[4] * b + W[8] * c; ny = W[1] * a + W[5] * b + W[9] * c; nz = W[2] * a + W[6] * b + W[10] * c; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
          const cc = col ? [col.d[i * col.nc], col.d[i * col.nc + 1], col.d[i * col.nc + 2]] : [1, 1, 1];
          mb.v(wx, wy, wz, nx, ny, nz, [srgb(bc[0] * cc[0]), srgb(bc[1] * cc[1]), srgb(bc[2] * cc[2])], em ? M.GLOW : 255); }
        for(let i = 0; i + 2 < idx.length; i += 3){ const a = base + idx[i], b = base + idx[i + 1], c = base + idx[i + 2]; if(W[0] * (W[5] * W[10] - W[6] * W[9]) - W[4] * (W[1] * W[10] - W[2] * W[9]) + W[8] * (W[1] * W[6] - W[2] * W[5]) < 0) mb.tri(a, c, b); else mb.tri(a, b, c); }
        if(!nrm) flat(mb, base, mb.n); } (n.children || []).forEach(c => visit(c, W)); };
    roots.forEach(r => visit(r, I)); if(!prims) throw new Error('.glb has no triangle meshes');
    const m = mb.finish(), f = new Float32Array(m.vb); let k = 1, dy = 0;
    if(opt.height > 0 && m.maxY > m.minY) k = opt.height / (m.maxY - m.minY); if(opt.ground !== false) dy = -m.minY * k;
    if(k !== 1 || dy){ for(let i = 0; i < m.n; i++){ f[i * 5] *= k; f[i * 5 + 1] = f[i * 5 + 1] * k + dy; f[i * 5 + 2] *= k; } m.minY = m.minY * k + dy; m.maxY = m.maxY * k + dy; }
    return m;
  }
  /* models without normals: face normals from the triangles (the primitive's vertices are not shared safely, so it is only approximate) */
  function flat(mb, a, b){ for(let t = 0; t + 2 < mb.ni; t += 3){ const i0 = mb.idx[t], i1 = mb.idx[t + 1], i2 = mb.idx[t + 2]; if(i0 < a || i0 >= b) continue; const f = mb.f, p = i => [f[i * 5], f[i * 5 + 1], f[i * 5 + 2]], A = p(i0), B = p(i1), C = p(i2), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]) || 1; [i0, i1, i2].forEach(i => { mb.i8[i * 20 + 12] = Math.round(n[0] / l * 127); mb.i8[i * 20 + 13] = Math.round(n[1] / l * 127); mb.i8[i * 20 + 14] = Math.round(n[2] / l * 127); }); } }
  const Assets = {
    loaded: {},
    /* manifest.json: { "props": { "tree": { "glb": "props/tree.glb", "lod1": "props/tree_far.glb", "height": 7 }, "lamp": {...}, "bench": {...} } } (paths relative to the manifest) */
    async load(base){
      let man = null; try{ const r = await fetch(base + 'manifest.json', { cache: 'no-cache' }); if(r.ok) man = await r.json(); }catch(e){} if(!man || !man.props) return 0; let n = 0;
      for(const name of Object.keys(man.props)){ const d = man.props[name]; for(const [lod, key] of [[0, 'glb'], [1, 'lod1']]){ if(!d[key]) continue; try{ const r = await fetch(base + d[key]); if(!r.ok) throw new Error('HTTP ' + r.status); const m = parse(await r.arrayBuffer(), { height: d.height, ground: d.ground }); if(RW.Props.set(name, lod, m)){ Assets.loaded[name + ':' + lod] = d[key]; n++; } }catch(e){ console.warn('[realworld] model ' + d[key] + ' not used: ' + e.message); } } }
      return n;
    }
  };
  return { Glb: { parse }, Assets };
});
