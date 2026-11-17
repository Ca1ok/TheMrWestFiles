/* REALWORLD · streamer — keeps the right chunks loaded, at the right level of detail, with the least work. Two ways to drive it:
 *   WALK  (the game)  S.update(px, pz): chunks within `radius` of the player; nearest ring at LOD 0, then 1, 2, 3 further out (LOD_AT, in chunk-widths). Beyond radius + 1.6 they are freed.
 *   VIEW  (WestMap)   S.updateView({ x, z, eye, reach }): chunks inside the camera's frustum within `reach` metres of its target; the level of detail follows the distance from the EYE
 *                     (LOD 0…4, LOD 4 = the map level), so a whole city is a few hundred tiny meshes. Chunks that leave the view stay cached (LRU) until `cap` is exceeded, so panning back is instant.
 *  - Building is done in a pool of Web Workers (1–3 depending on the CPU); the queue is re-sorted by distance every time a worker is free, so what is nearest always comes first.
 *  - A new level of detail never pops: the old mesh stays and the two cross-fade with an ordered dither (see gfx.js). Chunks fade in the same way.
 *  - GPU uploads are limited per frame (count AND bytes); if workers are unavailable it falls back to building one chunk per frame on the main thread.
 *  - Trees / lamps / benches are not part of the chunk mesh: each chunk carries a small list of instances, and S.drawProps() draws every loaded chunk's props with ONE instanced call per (kind, level of detail).
 * Improving it later: change LOD_AT / radius in config (game.js), or add a level in chunkgen.js (RES, RAISE, SK) and one number to LOD_AT. */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, CH = 128, PALETTE = [0x3d7a45, 0x4a8a4e, 0x5a9a52, 0x2f6b3d, 0x6a9f4a, 0x3a8060, 0x7aa84e];
  function create(gfx, opt){
    const S = { chunks: new Map(), nh: opt.nh || 64, radius: opt.radius || 8, LOD_AT: opt.LOD_AT || [2.6, 4.6, 7.2], cap: opt.cap || 0, pending: 0, built: 0, bytes: 0, frame: 0, propsDirty: true, propTris: 0 };
    const queue = [], ready = [], workers = []; let nextId = 1, fallback = false, base = opt.base || 'os/realworld/';
    const key = (cx, cz) => cx + ',' + cz;
    function startWorkers(){ const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)); try{ for(let i = 0; i < n; i++){ const w = new Worker(base + 'worker.js'); w.busy = 0; w.onmessage = e => { w.busy = 0; const m = e.data; if(m.t === 'chunk') ready.push(m); else if(m.t === 'error'){ console.warn('[realworld] chunk error', m.msg); const c = S.chunks.get(key(m.cx, m.cz)); if(c) c.req = -1; } }; w.onerror = e => { console.warn('[realworld] worker failed', e.message); fallback = true; }; workers.push(w); } }catch(e){ fallback = true; } if(!workers.length) fallback = true; }
    startWorkers();
    /* the level of detail for a distance (chunk-widths); hysteresis only when LOSING detail, so a boundary never flickers */
    const lodFor = (d, cur) => { const A = S.LOD_AT; let l = A.length; for(let i = 0; i < A.length; i++) if(d < A[i]){ l = i; break; } if(cur != null && l > cur && d < A[Math.max(0, l - 1)] + 0.35) l = cur; return l; };
    S.setNH = nh => { if(nh !== S.nh){ S.nh = nh; S.chunks.forEach(c => { c.req = -1; }); } };
    function want(cx, cz, d){
      const k = key(cx, cz); let c = S.chunks.get(k);
      if(!c){ c = { cx, cz, k, lod: -1, cur: null, old: null, fade: 1, cols: null, props: null, doors: [], req: -1, d, x0: cx * CH, z0: cz * CH, seen: S.frame }; S.chunks.set(k, c); }
      c.d = d; c.seen = S.frame; const w = lodFor(d, c.lod < 0 ? null : c.lod);
      if(w !== c.lod && w !== c.req){ c.req = w; const i = queue.findIndex(q => q.k === k); if(i >= 0) queue.splice(i, 1); queue.push({ k, cx, cz, lod: w, nh: S.nh }); }
    }
    function drop(k, c){ if(c.cur) gfx.free(c.cur.h); if(c.old) gfx.free(c.old.h); S.chunks.delete(k); const i = queue.findIndex(q => q.k === k); if(i >= 0) queue.splice(i, 1); S.propsDirty = true; }
    function pump(){
      queue.forEach(q => { const c = S.chunks.get(q.k); q.d = c ? c.d : 99; }); queue.sort((a, b) => a.d - b.d);
      for(const w of workers){ if(w.busy || !queue.length) continue; const q = queue.shift(), c = S.chunks.get(q.k); if(!c || c.req !== q.lod) continue; w.busy = 1; w.postMessage({ t: 'chunk', id: nextId++, cx: q.cx, cz: q.cz, lod: q.lod, nh: q.nh }); }
      if(fallback && queue.length && root.RWChunk){ const q = queue.shift(), c = S.chunks.get(q.k); if(c && c.req === q.lod){ const r = root.RWChunk.build(q.cx, q.cz, q.lod, q.nh); ready.push({ t: 'chunk', cx: q.cx, cz: q.cz, lod: q.lod, mesh: r.mesh, cols: r.cols, doors: r.doors, props: r.props, stats: r.stats }); } }
      S.pending = queue.length + workers.filter(w => w.busy).length;
    }
    /* WALK mode */
    S.update = function(px, pz){
      S.frame++; const pcx = Math.floor(px / CH), pcz = Math.floor(pz / CH), R = S.radius;
      for(let dz = -R; dz <= R; dz++) for(let dx = -R; dx <= R; dx++){ const cx = pcx + dx, cz = pcz + dz, d = Math.hypot((cx + 0.5) * CH - px, (cz + 0.5) * CH - pz) / CH; if(d > R + 0.4) continue; want(cx, cz, d); }
      S.chunks.forEach((c, k) => { if(Math.hypot((c.cx + 0.5) * CH - px, (c.cz + 0.5) * CH - pz) / CH > R + 1.6) drop(k, c); });
      pump();
    };
    /* VIEW mode: call after gfx.begin() (it needs this frame's frustum planes). v = { x, z: the point looked at, eye: [x, y, z], reach: ground metres around it } */
    S.updateView = function(v){
      S.frame++; const R = Math.ceil(v.reach / CH), tcx = Math.floor(v.x / CH), tcz = Math.floor(v.z / CH), box = { minY: -10, maxY: 90 };
      for(let dz = -R; dz <= R; dz++) for(let dx = -R; dx <= R; dx++){ const cx = tcx + dx, cz = tcz + dz, mx = (cx + 0.5) * CH, mz = (cz + 0.5) * CH; if(Math.hypot(mx - v.x, mz - v.z) > v.reach + CH * 0.7) continue;
        if(!gfx.visible(box, cx * CH, cz * CH, (cx + 1) * CH, (cz + 1) * CH, 24)) continue; want(cx, cz, Math.hypot(mx - v.eye[0], 20 - v.eye[1], mz - v.eye[2]) / CH); }
      if(S.cap && S.chunks.size > S.cap){ const old = [...S.chunks.entries()].filter(([, c]) => c.seen < S.frame).sort((a, b) => a[1].seen - b[1].seen); for(let i = 0; i < old.length && S.chunks.size > S.cap; i++) drop(old[i][0], old[i][1]); }
      pump();
    };
    /* upload what the workers finished: at most `n` chunks and about `budget` bytes per frame (always at least one) */
    S.upload = function(n, budget){ let did = 0, bytes = 0; budget = budget || 1.5e6;
      while(ready.length && did < n && (did === 0 || bytes < budget)){ const m = ready.shift(), c = S.chunks.get(key(m.cx, m.cz)); if(!c || c.req !== m.lod) continue; const h = gfx.upload(m.mesh); S.bytes += h.bytes; bytes += h.bytes; S.built++;
        if(c.old){ gfx.free(c.old.h); c.old = null; } if(c.cur) c.old = c.cur; c.cur = { h, lod: m.lod }; c.lod = m.lod; c.fade = 0; c.cols = m.cols; c.props = m.props || null; if(m.lod <= 1) c.doors = m.doors; S.propsDirty = true; did++; } return did; };
    S.step = function(dt){ S.chunks.forEach(c => { if(c.fade < 1){ c.fade = Math.min(1, c.fade + dt / 0.55); if(c.fade >= 1 && c.old){ gfx.free(c.old.h); c.old = null; } } }); };
    S.draw = function(px, pz, far){
      let n = 0; S.chunks.forEach(c => { if(!c.cur) return; const x0 = c.x0, z0 = c.z0; if(far && Math.hypot(x0 + CH / 2 - px, z0 + CH / 2 - pz) > far) return; if(!gfx.visible(c.cur.h, x0, z0, x0 + CH, z0 + CH, 8)) return;
        if(c.fade < 1 && c.old){ gfx.draw(c.old.h, c.fade, 0); gfx.draw(c.cur.h, c.fade, 1); } else gfx.draw(c.cur.h, c.fade, 1); n++; }); return n; };
    /* ---- instanced props ---- */
    const P = () => RW.Props, groups = new Map(); let propRev = -1;
    const vOf = (Pr, kind, seed) => { const n = Pr.nv ? Pr.nv(kind) : 1; return n > 1 ? Math.min(3, Math.floor(seed * n) % n) : 0; };
    function regroup(){
      const Pr = P(); if(!Pr) return; const cnt = new Map();
      S.chunks.forEach(c => { if(!c.cur || !c.props) return; const a = c.props; for(let i = 0; i < a.length; i += 8){ const kind = a[i], tl = Pr.lodFor(kind, c.lod); if(tl < 0) continue; const g = ((kind * 4 + vOf(Pr, kind, a[i + 6])) << 1) | tl; cnt.set(g, (cnt.get(g) || 0) + 1); } });
      groups.forEach((g, id) => { if(!cnt.has(id)) g.n = 0; });
      cnt.forEach((n, id) => { let g = groups.get(id); if(!g){ g = { id, kind: id >> 3, v: (id >> 1) & 3, tl: id & 1, h: null, arr: new Float32Array(0), n: 0, dirty: true }; groups.set(id, g); } if(g.arr.length < n * 8) g.arr = new Float32Array(Math.max(n * 8, g.arr.length * 2)); g.n = 0; g.fill = 0; });
      S.chunks.forEach(c => { if(!c.cur || !c.props) return; const a = c.props; for(let i = 0; i < a.length; i += 8){ const kind = a[i], tl = Pr.lodFor(kind, c.lod); if(tl < 0) continue; const g = groups.get(((kind * 4 + vOf(Pr, kind, a[i + 6])) << 1) | tl), o = g.n * 8, seed = a[i + 6];
        g.arr[o] = a[i + 1]; g.arr[o + 1] = a[i + 2]; g.arr[o + 2] = a[i + 3]; g.arr[o + 3] = a[i + 4]; g.arr[o + 4] = a[i + 5]; g.arr[o + 5] = kind === 0 ? PALETTE[Math.floor(seed * PALETTE.length) % PALETTE.length] : 0xffffff; g.arr[o + 6] = seed; g.arr[o + 7] = 0; g.n++; } });
      groups.forEach(g => { g.dirty = true; }); S.propsDirty = false;
    }
    /* draw every loaded chunk's props (call between startWorld()s with the outdoor lighting on). far0..far1 = the dissolve range in metres. */
    S.drawProps = function(far0, far1){
      const Pr = P(); if(!Pr) return 0; if(propRev !== Pr.rev){ groups.forEach(g => { if(g.h){ gfx.propFree(g.h); g.h = null; } }); propRev = Pr.rev; S.propsDirty = true; } if(S.propsDirty) regroup();
      let n = 0, tris = 0; groups.forEach(g => { if(!g.n) return; if(!g.h){ const t = Pr.template(g.kind, g.tl, g.v); if(!t) return; g.h = gfx.propUpload(t); g.dirty = true; } gfx.props(g.h, g.arr, g.n, g.dirty, far0, far1); g.dirty = false; n += g.n; tris += g.n * g.h.ni / 3; }); S.propTris = tris; return n;
    };
    S.free = function(){ S.chunks.forEach(c => { if(c.cur) gfx.free(c.cur.h); if(c.old) gfx.free(c.old.h); }); S.chunks.clear(); groups.forEach(g => { if(g.h) gfx.propFree(g.h); }); groups.clear(); queue.length = 0; ready.length = 0; workers.forEach(w => w.terminate()); };
    S.ground = (x, z) => RWTerrain.height(x, z);
    S.nearCols = function(x, z, fn){ const pcx = Math.floor(x / CH), pcz = Math.floor(z / CH); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const c = S.chunks.get(key(pcx + i, pcz + j)); if(c && c.cols) fn(c.cols); } };
    S.doorsNear = function(x, z, r){ const out = [], pcx = Math.floor(x / CH), pcz = Math.floor(z / CH); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const c = S.chunks.get(key(pcx + i, pcz + j)); if(c) c.doors.forEach(d => { if(Math.hypot(d.x - x, d.z - z) < r) out.push(d); }); } return out; };
    S.coreReady = function(x, z){ const c = S.chunks.get(key(Math.floor(x / CH), Math.floor(z / CH))); return !!(c && c.cur && c.lod <= 1); };
    /* how much of what the view wants is built (0..1): the map uses it for its loading bar */
    S.progress = function(){ let want = 0, have = 0; S.chunks.forEach(c => { if(c.seen !== S.frame) return; want++; if(c.cur && c.lod === c.req) have++; }); return want ? have / want : 1; };
    return S;
  }
  RW.Streamer = { create, CH };
})(typeof self !== 'undefined' ? self : this);
