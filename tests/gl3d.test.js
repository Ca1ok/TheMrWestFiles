// node tests/gl3d.test.js — the pure parts of the 3D engine: matrices, mesh builders (winding vs normals), OBJ parser, tween easing
const G = require('../os/lib/gl3d.js'); let fails = 0; const ok = (c, m) => { if(!c){ fails++; console.error('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-4);
// matrices
const I = G.M.ident(), t = G.M.trs(G.M.ident(), [1, 2, 3], [0, 0, 0], [2, 2, 2]); const p = G.M.xf(t, [1, 1, 1]); ok(near(p[0], 3) && near(p[1], 4) && near(p[2], 5), 'trs translate+scale');
const r = G.M.trs(G.M.ident(), [0, 0, 0], [-Math.PI / 2, 0, 0], [1, 1, 1]), up = G.M.xf(r, [0, 0, 1]); ok(near(up[1], 1) && near(up[2], 0), 'Rx(-90°) turns +Z (a card front) to +Y (up)');
const m = G.M.trs(G.M.ident(), [3, -1, 2], [.3, .8, -.4], [1, 2, 3]), inv = G.M.inv(G.M.ident(), m), back = G.M.xf(inv, G.M.xf(m, [.5, .6, .7])); ok(near(back[0], .5) && near(back[1], .6) && near(back[2], .7), 'inverse round-trips');
const la = G.M.lookAt(G.M.ident(), [0, 0, 5], [0, 0, 0], [0, 1, 0]), o = G.M.xf(la, [0, 0, 0]); ok(near(o[2], -5), 'lookAt puts the target 5 in front');
// builders: every triangle's geometric normal agrees with the stored vertex normals, no oversize, bounds sane
const meshes = { plane: G.mesh.plane(2, 2, 3, 3), quad: G.mesh.quad(1, 2), box: G.mesh.box(1, 2, 3), rbox: G.mesh.roundedBox(1, 1, 1, .2, 4), cyl: G.mesh.cylinder(1, 1, 2, 24), cone: G.mesh.cylinder(0, 1, 2, 24), sph: G.mesh.sphere(1, 24, 16), torus: G.mesh.torus(1, .3, 24, 10), lathe: G.mesh.lathe([[0, 0], [1, 0], [1, .2], [0, .2]], 16, true), disc: G.mesh.disc(1, 16) };
Object.keys(meshes).forEach(k => { const me = meshes[k], v = me.v, ix = me.i; ok(v.length % 8 === 0 && ix.length % 3 === 0, k + ' layout'); let bad = 0;
  for(let q = 0; q < ix.length; q += 3){ const a = ix[q] * 8, b = ix[q + 1] * 8, c = ix[q + 2] * 8, g = G.V.cross([v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]]); if(G.V.len(g) < 1e-9) continue; if(g[0] * (v[a + 3] + v[b + 3] + v[c + 3]) + g[1] * (v[a + 4] + v[b + 4] + v[c + 4]) + g[2] * (v[a + 5] + v[b + 5] + v[c + 5]) < 0) bad++; }
  ok(bad === 0, k + ' has ' + bad + ' inside-out triangles'); ok(me.radius > 0, k + ' radius'); for(let q = 0; q < v.length; q += 8) ok(near(Math.hypot(v[q + 3], v[q + 4], v[q + 5]), 1, 1e-3) || k === 'lathe', k + ' unit normals'); });
ok(near(meshes.box.max[0] - meshes.box.min[0], 1) && near(meshes.box.max[2] - meshes.box.min[2], 3), 'box size');
// OBJ: quad with negative indices + missing normals → 2 triangles with computed +Z normals
const obj = G.parseOBJ('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf 1/1 2/2 3/3 4/4\n'); ok(obj.i.length === 6 && obj.v.length / 8 === 4, 'obj quad → 2 tris'); ok(near(obj.v[5], 1), 'obj computed normal +Z');
const obj2 = G.parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf -3//-1 -2//-1 -1//-1\n'); ok(obj2.i.length === 3, 'obj negative indices');
// easing endpoints
Object.keys(G.ease).forEach(k => { ok(near(G.ease[k](0), 0, 1e-6) && near(G.ease[k](1), 1, 1e-6), 'ease ' + k + ' endpoints'); });
if(fails){ console.error(fails + ' failed'); process.exit(1); } console.log('gl3d: all passed');
