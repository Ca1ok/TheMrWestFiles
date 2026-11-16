/* REALWORLD · cells — seamless interiors. A "cell" is a building's inside, built IN PLACE in world coordinates (no separate room world, no fade to black):
 *   Cells.make(kind, ctx, door) → { mesh, cols, npcs, screens, foot, disable }    PURE: builds the Room (interiors.js) and puts it into the real building: turned so its doorway is the building's door,
 *                                                                                  shrunk sideways if the footprint is smaller (never in height), every mesh/collider/clerk/screen moved to world space.
 *   Cells.create(gfx) → manager: ensure(key, kind, ctx, door) · drop(key) · each / sets() / disabled() / inside(x, y, z) / draw(outdoorEnv)
 * LIFECYCLE (the "dynamic interior culling"): game.js asks for a cell only for doors within ~30 m of the player that the player may enter (landmarks, your home, a house you rent, your plots) and drops it beyond ~60 m,
 * so a closed building costs nothing until you walk up to it. A loaded cell replaces the building's SOLID collision box by a HOLLOW shell with a doorway (see phys.js `disabled`), so you simply walk through the
 * door: nothing to click, nothing to load. The outside wall is opaque (you never see inside from the street); inside you see the room (lit with indoor light) and the outside world is hidden by its walls.
 * Colliders are phys.js stride-10 rows. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('./mesh.js')); else (root.RealWorld = root.RealWorld || {}).Cells = factory(root.RWMesh); })(typeof self !== 'undefined' ? self : this, function(M){
  const GL = typeof self !== 'undefined' ? self : globalThis, clone = m => ({ vb: m.vb.slice(0), n: m.n, ib: m.ib.slice ? m.ib.slice(0) : m.ib, ni: m.ni, minY: m.minY, maxY: m.maxY });
  /* horizontal fit: the room is shrunk (never stretched, never in height) to the building's footprint and depth behind the door, and centred on the building; the doorway is slid sideways to the real door.
   * plan(room0, door) → { k, doorX } where room0 was built without a doorX; build the room again with ctx.doorX = doorX, then place() it. */
  function plan(room0, door){
    const nn = [door.nx, door.nz], ex = [door.nz, -door.nx], Fx = door.x - nn[0] * 1.7, Fz = door.z - nn[1] * 1.7, lat = door.bx === undefined ? 0 : (Fx - door.bx) * ex[0] + (Fz - door.bz) * ex[1];
    const k = Math.max(0.6, Math.min(1, ((door.rw || room0.w + 1) - 0.9) / room0.w, ((door.rd || room0.d + 1) - 0.9) / room0.d)); return { k, doorX: room0.w / 2 + lat / k };
  }
  function place(room, door, k){
    const nn = [door.nx, door.nz], ex = [door.nz, -door.nx], dx = room.doorX === undefined ? room.w / 2 : room.doorX; k = k || 1;
    const Fx = door.x - nn[0] * 1.7, Fz = door.z - nn[1] * 1.7, ox = Fx - nn[0] * 0.3 - k * (dx * ex[0] + room.d * nn[0]), oz = Fz - nn[1] * 0.3 - k * (dx * ex[1] + room.d * nn[1]), oy = door.y + 0.08;
    const W = (x, z) => [ox + k * (x * ex[0] + z * nn[0]), oz + k * (x * ex[1] + z * nn[1])];
    const mesh = M.place(clone(room.mesh), { ox, oy, oz, ex, nn, k, ky: 1 });
    const cols = []; (room.cols || []).forEach(c => { const y0 = c.length > 5 ? c[4] : -1.5, y1 = c.length > 5 ? c[5] : room.h + 1, p = W((c[0] + c[2]) / 2, (c[1] + c[3]) / 2); cols.push(0, p[0], p[1], k * (c[2] - c[0]) / 2, k * (c[3] - c[1]) / 2, ex[0], ex[1], oy + y0, oy + y1, 0); });
    const npcs = (room.npcs || []).map(n => { const p = W(n.x, n.z), fx = Math.sin(n.yaw), fz = -Math.cos(n.yaw), wx = fx * ex[0] + fz * nn[0], wz = fx * ex[1] + fz * nn[1]; return Object.assign({}, n, { x: p[0], z: p[1], y: oy + (n.y || 0), yaw: Math.atan2(wx, -wz) }); });
    const screens = (room.screens || []).map(s => { const T = q => { const p = W(q[0], q[2]); return [p[0], oy + q[1], p[1]]; }, p = W(s.x, s.z); return Object.assign({}, s, { corners: s.corners.map(T), x: p[0], z: p[1] }); });
    const c = W(room.w / 2, room.d / 2);
    return { mesh, cols: Float32Array.from(cols), npcs, screens, k, oy, h: room.h, name: room.name, levels: room.levels || 1, lh: room.lh || room.h,
      foot: { x: c[0], z: c[1], hx: k * room.w / 2, hz: k * room.d / 2, co: ex[0], si: ex[1] }, disable: door.bx !== undefined ? { x: door.bx, z: door.bz } : null, door: { x: door.x, z: door.z, nx: door.nx, nz: door.nz } };
  }
  /* build + place in one go (probe the size, then build again with the doorway in the right place) */
  function make(kind, ctx, door){
    const I = GL.RealWorld.Interiors, p = plan(I.build(kind, ctx), door), room = I.build(kind, Object.assign({}, ctx, { doorX: p.doorX })); return place(room, door, p.k);
  }
  const inFoot = (f, x, z, pad) => { const dx = x - f.x, dz = z - f.z, lx = dx * f.co + dz * f.si, lz = -dx * f.si + dz * f.co; return Math.abs(lx) < f.hx + pad && Math.abs(lz) < f.hz + pad; };
  function create(gfx){
    const C = { cells: new Map(), RW: null }; let setsCache = null, disCache = null;
    C.ensure = function(key, kind, ctx, door){
      let c = C.cells.get(key); if(c) return c; try{ c = make(kind, ctx, door); }catch(e){ console.warn('[realworld] interior failed', kind, e); return null; }
      c.key = key; c.h3 = gfx.upload(c.mesh); c.mesh = null; C.cells.set(key, c); setsCache = disCache = null; return c;
    };
    C.drop = function(key){ const c = C.cells.get(key); if(!c) return; gfx.free(c.h3); C.cells.delete(key); setsCache = disCache = null; };
    C.clear = function(){ [...C.cells.keys()].forEach(C.drop); };
    C.each = fn => C.cells.forEach(fn);
    C.sets = () => setsCache || (setsCache = [...C.cells.values()].map(c => ({ a: c.cols, st: 10 })));
    C.disabled = () => disCache || (disCache = [...C.cells.values()].filter(c => c.disable).map(c => c.disable));
    /* the cell the player is standing in (inside its footprint and between its floor and roof) */
    C.inside = function(x, y, z){ for(const c of C.cells.values()) if(y > c.oy - 1.2 && y < c.oy + c.h + 0.5 && inFoot(c.foot, x, z, -0.05)) return c; return null; };
    C.draw = function(){ C.cells.forEach(c => { const f = c.foot, r = Math.hypot(f.hx, f.hz); if(gfx.visible(c.h3, f.x - r, f.z - r, f.x + r, f.z + r, 1)) gfx.draw(c.h3, 1, 1); }); };
    return C;
  }
  return { place, plan, make, create, inFoot };
});
