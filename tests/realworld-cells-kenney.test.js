/* SAME checks as realworld-cells.test.js, but with the baked Kenney building models registered: every room must fit the MODEL's footprint, the doorway must line up with the model's entrance, stairs must work.  node tests/realworld-cells-kenney.test.js
 * (original description) in-place interiors: every room fits its building, the doorway lines up with the real door, stairs are walkable in the placed world, NPCs/screens end up inside.  node tests/realworld-cells.test.js */
const assert = require('assert'); global.self = global;
const G = require('../os/lib/worldgen.js'), BG = require('../os/lib/buildgen.js'), T = require('../os/realworld/terrain.js'), L = require('../os/realworld/layout.js'), C = require('../os/realworld/chunkgen.js'); global.RWMesh = require('../os/realworld/mesh.js'); global.RealWorld = {};
require('../os/realworld/interiors.js'); const Cells = require('../os/realworld/cells.js'), Phys = require('../os/realworld/phys.js'); RealWorld.Cells = Cells;
const fs = require('fs'), path = require('path'); require('../os/realworld/props.js'); const { Glb } = require('../os/realworld/glb.js'); const R = global.RWModels = require('../os/realworld/models.js');
{ const base = path.join(__dirname, '..', 'assets', 'world'), man = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8')), ld = f => Glb.parse(new Uint8Array(fs.readFileSync(path.join(base, f))).buffer, { ground: false });
  for(const [id, d] of Object.entries(man.buildings)) R.add(id, d, ld(d.glb), ld(d.lod1)); }
let withModel = 0;
const NH = 512; L.setup(NH); T.setup(L.radius());
const inB = (b, x, z, pad) => { const dx = x - b.x, dz = z - b.z, co = Math.cos(b.a), si = Math.sin(b.a), lx = dx * co + dz * si, lz = -dx * si + dz * co; return Math.abs(lx) <= b.hx + pad && Math.abs(lz) <= b.hz + pad; };
let placed = 0, minK = 9, tall = 0;
const kindOf = d => d.k === 'poi' ? d.id : 'home';
for(let cx = -3; cx <= 3; cx++) for(let cz = -3; cz <= 3; cz++){ C.build(cx, cz, 0, NH).doors.forEach(d => {
  const ctx = d.k === 'poi' ? { name: d.name } : { w: d.w, dp: d.dp, beds: d.beds, type: d.type, name: d.addr, fl: d.fl };
  if(d.k === 'house' && d.i % 5) return; const c = Cells.make(kindOf(d), ctx, d); placed++; minK = Math.min(minK, c.k);
  // the room lies inside the building's own footprint (bx, bz, turned like the building), the door is in its south wall, height under the roof
  const S = d.k === 'poi' ? BG.landmark(d.id) : null, g = d.k === 'house' ? L.house(d.i).g : null; let ang = S ? L.poi(d.id).ang : g.ang, fw = S ? S.w : g.w, fd = S ? S.d : g.dp; if(d.model){ withModel++; ang = -Math.atan2(-d.nx, -d.nz); fw = d.rw; fd = d.rd; }
  const f = c.foot, b = { x: d.bx, z: d.bz, a: ang, hx: fw / 2, hz: fd / 2 }; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, e]) => { const px = f.x + f.co * f.hx * a - f.si * f.hz * e, pz = f.z + f.si * f.hx * a + f.co * f.hz * e; assert(inB(b, px, pz, 0.35), 'room corner outside the building ' + (d.id || d.addr) + ' k=' + c.k.toFixed(2)); });
  assert(c.h <= d.bh + 0.01, 'interior taller than the building ' + (d.id || d.addr) + ' ' + c.h.toFixed(1) + ' > ' + d.bh.toFixed(1));
  // the doorway really leads in: breadth-first search over a 0.25 m grid (player radius) from the street into the room reaches deep inside
  { const env = { sets: [{ a: c.cols, st: 10 }], disabled: null }, F = [d.x - d.nx * 1.7, d.z - d.nz * 1.7], ex = [d.nz, -d.nx], at = (u, v) => [F[0] + ex[0] * u - d.nx * v, F[1] + ex[1] * u - d.nz * v], free = (u, v) => { const p = at(u, v), o = Phys.resolve(p[0], p[1], d.y + 0.1, env.sets, null); return Math.hypot(o.x - p[0], o.z - p[1]) < 0.02; };
    const seen = new Set(['0,-4']), q = [[0, -1.0]]; let deep = -1; while(q.length){ const [u, v] = q.shift(); deep = Math.max(deep, v); for(const [du, dv] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]){ const nu = Math.round((u + du) * 4) / 4, nv = Math.round((v + dv) * 4) / 4, k = nu * 4 + ',' + nv * 4; if(seen.has(k) || Math.abs(nu) > 14 || nv > 16 || nv < -3 || !free(nu, nv)) continue; seen.add(k); q.push([nu, nv]); } }
    assert(deep > Math.min(c.foot.hz * 2, 6) - 1.5, 'doorway of ' + (d.id || d.addr) + ' leads only ' + deep.toFixed(2) + ' m inside'); }
  c.npcs.forEach(n => assert(Cells.inFoot(f, n.x, n.z, 0.2), 'clerk outside ' + d.id)); c.screens.forEach(s => assert(Cells.inFoot(f, s.x, s.z, 0.6), 'screen outside ' + d.id));
  if(c.levels > 1) tall++; }); }
assert(placed > 30 && tall > 0, 'checked ' + placed + ' buildings, ' + tall + ' multi-level'); assert(minK >= 0.45);
// walk a real two-storey house from the street, through the door, up the stairs to the bedrooms
{ let hd = null; outer: for(let i = 0; i < NH; i++){ const g = L.house(i).g; if(g.type !== 'house' && g.type !== 'townhouse') continue; for(const [cx, cz] of [[Math.floor(g.x / 128), Math.floor(g.y / 128)]]){ hd = C.build(cx, cz, 0, NH).doors.find(d => d.i === i); } if(hd && hd.fl >= 2) break outer; }
  const d = hd, ctx = { w: d.w, dp: d.dp, beds: d.beds, type: d.type, name: d.addr, fl: d.fl }, c = Cells.make('home', ctx, d), room = { w: 0 }, env = { sets: [{ a: c.cols, st: 10 }], disabled: null, ground: () => d.y, grav: 17, jump: 0 };
  assert(c.levels >= 2, 'a ' + d.type + ' has an upstairs'); const k = c.k, P = { x: d.x, z: d.z, y: d.y, vx: 0, vz: 0, vy: 0, grounded: true };
  const nn = [d.nx, d.nz], rows = []; for(let i = 0; i < c.cols.length; i += 10) if(Math.abs(c.cols[i + 8] - c.cols[i + 7] - 0.12) < 1e-3) rows.push(Array.from(c.cols.slice(i, i + 10))); rows.sort((a, b) => a[8] - b[8]);
  const lo = rows[0], hi = rows[Math.min(rows.length - 1, 14)], Fp = [d.x - d.nx * 1.7, d.z - d.nz * 1.7], ex = [d.nz, -d.nx], latLo = (lo[1] - Fp[0]) * ex[0] + (lo[2] - Fp[1]) * ex[1];
  const wp = [[Fp[0] - nn[0] * 0.9, Fp[1] - nn[1] * 0.9], [Fp[0] - nn[0] * 0.9 + ex[0] * latLo, Fp[1] - nn[1] * 0.9 + ex[1] * latLo], [lo[1], lo[2]], [hi[1], hi[2]], [hi[1] - nn[0] * 1.6, hi[2] - nn[1] * 1.6]]; let top = 0;
  for(const t of wp){ for(let n = 0; n < 900; n++){ const dx = t[0] - P.x, dz = t[1] - P.z, l = Math.hypot(dx, dz); if(l < 0.2) break; P.vx = dx / l * 2.2; P.vz = dz / l * 2.2; Phys.step(P, 1 / 60, env); top = Math.max(top, P.y - d.y); } }
  assert(top > c.lh * 0.9, 'climbed the stairs of ' + d.addr + ': highest ' + top.toFixed(2) + ' m of ' + c.lh.toFixed(2)); assert(Math.abs(P.y - d.y - 0.08 - c.lh) < 0.3, 'standing on the upper floor, y-offset ' + (P.y - d.y).toFixed(2)); }
assert(withModel > 20, 'models were used for ' + withModel + ' doors'); console.log('realworld-cells-kenney ok · ' + withModel + ' of those on Kenney models · ' + placed + ' buildings placed (' + tall + ' multi-level), smallest scale ×' + minK.toFixed(2));
