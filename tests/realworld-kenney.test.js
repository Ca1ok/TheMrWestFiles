/* the baked Kenney models in the realworld: parse every baked .glb, register the buildings, build real chunks and check the doors, colliders and level-of-detail still hold.
 * Run: node tests/realworld-kenney.test.js */
const assert = require('assert'), fs = require('fs'), path = require('path');
global.self = global; global.RWMesh = require('../os/realworld/mesh.js'); global.RealWorld = {}; require('../os/realworld/props.js'); const { Glb } = require('../os/realworld/glb.js');
const R = global.RWModels = require('../os/realworld/models.js'), RWChunk = require('../os/realworld/chunkgen.js');
const base = path.join(__dirname, '..', 'assets', 'world'), man = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const load = f => Glb.parse(new Uint8Array(fs.readFileSync(path.join(base, f))).buffer, { ground: false });

// 1 · without models the procedural world still builds (fallback)
const lm = require('../os/realworld/layout.js'); lm.setup(300);
let fb = RWChunk.build(0, 0, 0, 300); assert(fb.doors.every(d => !d.model), 'no registry → procedural buildings'); assert(!R.ready);

// 2 · every baked file parses, stays under budget and keeps its colours
let files = 0, tris0 = 0, tris1 = 0;
for(const [id, d] of Object.entries(man.buildings)){ const m0 = load(d.glb), m1 = load(d.lod1); files += 2; assert(m0.ni / 3 === d.tris[0] && m1.ni / 3 === d.tris[1], id + ' tris match manifest'); assert(m1.ni < m0.ni, id + ' lod1 is lighter'); assert(d.tris[0] < 2600, id + ' under 2600 tris'); R.add(id, d, m0, m1); tris0 += d.tris[0]; tris1 += d.tris[1];
  const u8 = new Uint8Array(m0.vb); let lit = 0; for(let i = 0; i < m0.n; i++) lit += u8[i * 20 + 16] + u8[i * 20 + 17] + u8[i * 20 + 18]; assert(lit / m0.n / 3 > 40, id + ' has colour'); }
for(const k of ['tree', 'lamp', 'bench']) for(const v of man.props[k].variants){ const m = load(v.glb); assert(m.ni > 0 && Math.abs(m.minY) < 0.01, k + ' stands on the ground'); files++; assert(load(v.lod1).ni <= m.ni); }
for(const [id, d] of Object.entries(man.cars)){ const m = load(d.glb); assert(m.maxY > 1 && m.maxY < 3.2, id + ' car height'); files++; }
for(const [id, d] of Object.entries(man.people)){ const m = load(d.glb); const u8 = new Uint8Array(m.vb), parts = new Set(); for(let i = 0; i < m.n; i++) parts.add(u8[i * 20 + 19]); assert([...parts].sort().join() === '200,201,202,203,204', id + ' has the 5 body parts'); files++; }
assert(R.ready && R.ofKind('house').length === 21);

// 3 · real chunks with models: doors line up with the model, colliders match, LOD costs fall
function walk(fn){ for(let cx = -3; cx <= 3; cx++) for(let cz = -3; cz <= 3; cz++) fn(cx, cz); }
let used = new Set(), nd = 0, poi = new Set(); const t = [0, 0, 0, 0];
walk((cx, cz) => { for(let lod = 0; lod <= 3; lod++){ const r = RWChunk.build(cx, cz, lod, 300); t[lod] += r.mesh.ni / 3;
  if(lod === 0) r.doors.forEach(d => { nd++; if(d.model) used.add(d.model); if(d.k === 'poi') poi.add(d.id + ':' + d.model);
    // the approach point must be free (outside every collider of this chunk) and the interior must have a sane size
    assert(d.rw > 3 && d.rd > 3 && d.bh > 2, 'door entry sizes ' + JSON.stringify(d));
    const c = r.cols; if(d.model) for(let i = 0; i < c.length; i += 8) if(c[i] === 0){ const dx = d.x - c[i + 1], dz = d.z - c[i + 2], lx = dx * c[i + 5] + dz * c[i + 6], lz = -dx * c[i + 6] + dz * c[i + 5]; assert(!(Math.abs(lx) < c[i + 3] - 0.05 && Math.abs(lz) < c[i + 4] - 0.05 && c[i + 7] > d.y + 1), 'door point of ' + (d.id) + ' is inside a collider'); } }); } });
assert(nd > 20 && used.size >= 6, 'models are used: ' + used.size + ' ids over ' + nd + ' doors');
assert(t[1] < t[0] && t[2] < t[1] && t[3] < t[2], 'LOD triangle counts fall: ' + t.map(Math.round).join('/'));

// 4 · interior furniture: with models loaded the Room hook stamps them (more triangles, same colliders kept); without, the procedural pieces stay
global.RealWorld.Interiors = null; require('../os/realworld/interiors.js'); const RI = global.RealWorld.Interiors;
const ctxs = [['home', { type: 'house', w: 11, dp: 10, beds: 2, fl: 2, doorX: 3 }], ['home', { type: 'studio', w: 9, dp: 9, beds: 1, fl: 1, doorX: 3 }], ['arcade', { doorX: 12 }]];
const before = ctxs.map(([k, c]) => RI.build(k, c)); RealWorld.Props.furn = {}; for(const [id, d] of Object.entries(man.furniture)) RealWorld.Props.furn[id] = { m: load(d.glb), w: d.w, d: d.d, h: d.h };
const after = ctxs.map(([k, c]) => RI.build(k, c)); let fur = 0;
after.forEach((a, i) => { const b = before[i]; assert(a.mesh.n > 0 && a.cols.length >= b.cols.length - 12, ctxs[i][0] + ' colliders kept'); fur += a.mesh.ni - b.mesh.ni; assert(a.mesh.minY > -0.01, 'furniture stays on the floor'); });
console.log('interiors with furniture models: ' + after.map((a, i) => a.mesh.ni / 3 - before[i].mesh.ni / 3).join(' / ') + ' extra tris (home house / studio / arcade)');
console.log(`realworld-kenney ok · ${files} baked files parse · buildings ${tris0} → ${tris1} tris (lod1) · chunks ${t.map(Math.round).join('/')} tris per LOD · ${used.size} models used on ${nd} doors, landmarks ${[...poi].join(' ')}`);
