/* .glb reader + instanced prop templates.  node tests/realworld-glb.test.js */
const assert = require('assert'); global.self = global; global.RWMesh = require('../os/realworld/mesh.js'); global.RealWorld = {}; require('../os/realworld/props.js');
const { Glb } = require('../os/realworld/glb.js');
/* build a real .glb in memory: a unit cube (24 verts, indices u16, normals) under a parent node (translate y+1, scale 2) with a red material, plus a green emissive triangle */
function makeGlb(){
  const P = [], N = [], I = []; const faces = [[[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]], [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]], [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]], [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]];
  faces.forEach(([n, vs], f) => { vs.forEach(v => { P.push(...v.map(c => c * 0.5)); N.push(...n); }); const b = f * 4; I.push(b, b + 1, b + 2, b, b + 2, b + 3); });
  const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0], pos = new Float32Array(P.concat(tri)), nrm = new Float32Array(N.concat([0, 0, 1, 0, 0, 1, 0, 0, 1])), idx = new Uint16Array(I.concat([24, 25, 26]));
  const parts = [pos.buffer, nrm.buffer, idx.buffer].map(b => new Uint8Array(b)), lens = parts.map(p => p.length), offs = [0, lens[0], lens[0] + lens[1]]; let total = lens[0] + lens[1] + lens[2]; const pad = (4 - total % 4) % 4; total += pad;
  const bin = new Uint8Array(total); parts.forEach((p, i) => bin.set(p, offs[i]));
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 2] }], nodes: [{ translation: [0, 1, 0], scale: [2, 2, 2], children: [1] }, { mesh: 0 }, { mesh: 1 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }, { primitives: [{ attributes: { POSITION: 3 }, material: 1 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] }, emissiveFactor: [0, 1, 0] }],
    buffers: [{ byteLength: total }], bufferViews: [{ buffer: 0, byteOffset: offs[0], byteLength: lens[0] }, { buffer: 0, byteOffset: offs[1], byteLength: lens[1] }, { buffer: 0, byteOffset: offs[2], byteLength: lens[2] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: 'VEC3' }, { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }, { bufferView: 0, byteOffset: 288, componentType: 5126, count: 3, type: 'VEC3' }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const out = Buffer.alloc(12 + 8 + js.length + 8 + bin.length); out.writeUInt32LE(0x46546C67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4E4F534A, 16); js.copy(out, 20); const o = 20 + js.length; out.writeUInt32LE(bin.length, o); out.writeUInt32LE(0x004E4942, o + 4); Buffer.from(bin).copy(out, o + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}
const g = makeGlb(), m = Glb.parse(g, {});
assert.strictEqual(m.n, 27); assert.strictEqual(m.ni, 39); assert(Math.abs(m.minY) < 1e-5 && Math.abs(m.maxY - 2) < 1e-5, 'cube scaled ×2 sits on the ground: ' + m.minY + '..' + m.maxY);
const u8 = new Uint8Array(m.vb); assert(u8[16] > 250 && u8[17] === 0 && u8[18] === 0 && u8[19] === 255, 'red material → vertex colour'); assert(u8[24 * 20 + 16 + 1] > 250 && u8[24 * 20 + 19] === 128, 'emissive → glow flag');
const h = Glb.parse(g, { height: 6 }); assert(Math.abs(h.maxY - 6) < 1e-4, 'rescaled to 6 m'); for(let i = 0; i < m.ni; i++) assert(m.ib[i] < m.n);
assert.throws(() => Glb.parse(new ArrayBuffer(40)), /not a .glb/);
const bad = Buffer.from(Buffer.from(g)); const s = JSON.stringify({ extensionsRequired: ['KHR_draco_mesh_compression'] }); assert(s.length > 0);
// instanced props: every kind has near/far templates or a sane fallback; LOD mapping
const P = RealWorld.Props; P.KINDS.forEach((k, i) => { const t = P.template(i, 0); assert(t && t.n > 0 && t.ni > 0, k + ' template'); assert(P.template(i, 1), k + ' far template (or fallback)'); });
assert.strictEqual(P.lodFor(0, 0), 0); assert.strictEqual(P.lodFor(0, 1), 1); assert.strictEqual(P.lodFor(0, 2), -1); assert.strictEqual(P.lodFor(1, 1), -1); assert.strictEqual(P.lodFor(2, 1), 0);
const tree = P.template(0, 0); assert(tree.ni / 3 < 200, 'a placeholder tree is tiny: ' + tree.ni / 3 + ' tris'); const r0 = P.rev; P.set('tree', 0, m); assert(P.rev === r0 + 1 && P.template(0, 0) === m, 'a loaded model replaces the placeholder');
console.log('realworld-glb ok · cube 27 verts / 13 tris parsed, placeholder tree ' + 'ok');
