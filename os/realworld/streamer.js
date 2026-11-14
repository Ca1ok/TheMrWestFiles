/* REALWORLD · streamer — keeps the right chunks loaded around the player, at the right level of detail, with the least work.
 *  - Chunks within `radius` (in chunks) are wanted; the nearest ring is built at LOD 0, then 1, 2, 3 further out (LOD_AT, in chunk-widths). Beyond radius + 1.5 they are freed.
 *  - Building is done in a pool of Web Workers (1–3 depending on the CPU); the queue is re-sorted by distance every time a worker is free, so what is under your feet always comes first.
 *  - A new level of detail never pops: the old mesh stays and the two cross-fade with an ordered dither (see gfx.js). Chunks fade in the same way.
 *  - GPU uploads are limited per frame; if workers are unavailable it falls back to building one chunk per frame on the main thread.
 * Improving it later: change LOD_AT / radius in config (game.js), or add a level in chunkgen.js (RES, RAISE, SK) and one number to LOD_AT. */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, CH = 128;
  function create(gfx, opt){
    const S = { chunks: new Map(), nh: opt.nh || 64, radius: opt.radius || 8, LOD_AT: opt.LOD_AT || [2.6, 4.6, 7.2], pending: 0, built: 0, bytes: 0 };
    const queue = [], ready = [], workers = []; let nextId = 1, fallback = false, base = opt.base || 'os/realworld/';
    const key = (cx, cz) => cx + ',' + cz;
    function startWorkers(){ const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)); try{ for(let i = 0; i < n; i++){ const w = new Worker(base + 'worker.js'); w.busy = 0; w.onmessage = e => { w.busy = 0; const m = e.data; if(m.t === 'chunk') ready.push(m); else if(m.t === 'error'){ console.warn('[realworld] chunk error', m.msg); const c = S.chunks.get(key(m.cx, m.cz)); if(c) c.req = -1; } }; w.onerror = e => { console.warn('[realworld] worker failed', e.message); fallback = true; }; workers.push(w); } }catch(e){ fallback = true; } if(!workers.length) fallback = true; }
    startWorkers();
    const lodFor = (d, cur) => { const A = S.LOD_AT, h = cur == null ? 0 : 0.35; let l = d < A[0] ? 0 : d < A[1] ? 1 : d < A[2] ? 2 : 3; if(cur != null && l > cur && d < A[Math.max(0, l - 1)] + h) l = cur; return l; };   // hysteresis only when LOSING detail
    S.setNH = nh => { if(nh !== S.nh){ S.nh = nh; S.chunks.forEach(c => { c.req = -1; }); } };
    S.update = function(px, pz){
      const pcx = Math.floor(px / CH), pcz = Math.floor(pz / CH), R = S.radius;
      for(let dz = -R; dz <= R; dz++) for(let dx = -R; dx <= R; dx++){ const cx = pcx + dx, cz = pcz + dz, ccx = (cx + 0.5) * CH, ccz = (cz + 0.5) * CH, d = Math.hypot(ccx - px, ccz - pz) / CH; if(d > R + 0.4) continue; const k = key(cx, cz); let c = S.chunks.get(k);
        if(!c){ c = { cx, cz, k, lod: -1, cur: null, old: null, fade: 1, cols: null, doors: [], req: -1, d, x0: cx * CH, z0: cz * CH }; S.chunks.set(k, c); } c.d = d; const want = lodFor(d, c.lod < 0 ? null : c.lod);
        if(want !== c.lod && want !== c.req){ c.req = want; const i = queue.findIndex(q => q.k === k); if(i >= 0) queue.splice(i, 1); queue.push({ k, cx, cz, lod: want, nh: S.nh }); } }
      S.chunks.forEach((c, k) => { if(Math.hypot((c.cx + 0.5) * CH - px, (c.cz + 0.5) * CH - pz) / CH > R + 1.6){ if(c.cur) gfx.free(c.cur.h); if(c.old) gfx.free(c.old.h); S.chunks.delete(k); const i = queue.findIndex(q => q.k === k); if(i >= 0) queue.splice(i, 1); } });
      queue.forEach(q => { const c = S.chunks.get(q.k); q.d = c ? c.d : 99; }); queue.sort((a, b) => a.d - b.d);
      for(const w of workers){ if(w.busy || !queue.length) continue; const q = queue.shift(), c = S.chunks.get(q.k); if(!c || c.req !== q.lod) continue; w.busy = 1; w.postMessage({ t: 'chunk', id: nextId++, cx: q.cx, cz: q.cz, lod: q.lod, nh: q.nh }); }
      if(fallback && queue.length && root.RWChunk){ const q = queue.shift(), c = S.chunks.get(q.k); if(c && c.req === q.lod){ const r = root.RWChunk.build(q.cx, q.cz, q.lod, q.nh); ready.push({ t: 'chunk', cx: q.cx, cz: q.cz, lod: q.lod, mesh: r.mesh, cols: r.cols, doors: r.doors, stats: r.stats }); } }
      S.pending = queue.length + workers.filter(w => w.busy).length;
    };
    /* upload what the workers finished (max `n` per frame) */
    S.upload = function(n){ let did = 0; while(ready.length && did < n){ const m = ready.shift(), c = S.chunks.get(key(m.cx, m.cz)); if(!c || c.req !== m.lod) continue; const h = gfx.upload(m.mesh); S.bytes += h.bytes; S.built++; if(c.old){ gfx.free(c.old.h); c.old = null; } if(c.cur) c.old = c.cur; c.cur = { h, lod: m.lod }; c.lod = m.lod; c.fade = 0; c.cols = m.cols; if(m.lod <= 1) c.doors = m.doors; did++; } return did; };
    S.step = function(dt){ S.chunks.forEach(c => { if(c.fade < 1){ c.fade = Math.min(1, c.fade + dt / 0.55); if(c.fade >= 1 && c.old){ gfx.free(c.old.h); c.old = null; } } }); };
    S.draw = function(px, pz, far){
      let n = 0; S.chunks.forEach(c => { if(!c.cur) return; const x0 = c.x0, z0 = c.z0; if(Math.hypot(x0 + CH / 2 - px, z0 + CH / 2 - pz) > far) return; if(!gfx.visible(c.cur.h, x0, z0, x0 + CH, z0 + CH, 8)) return;
        if(c.fade < 1 && c.old){ gfx.draw(c.old.h, c.fade, 0); gfx.draw(c.cur.h, c.fade, 1); } else gfx.draw(c.cur.h, c.fade, 1); n++; }); return n; };
    S.free = function(){ S.chunks.forEach(c => { if(c.cur) gfx.free(c.cur.h); if(c.old) gfx.free(c.old.h); }); S.chunks.clear(); queue.length = 0; ready.length = 0; workers.forEach(w => w.terminate()); };
    S.ground = (x, z) => RWTerrain.height(x, z);
    S.nearCols = function(x, z, fn){ const pcx = Math.floor(x / CH), pcz = Math.floor(z / CH); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const c = S.chunks.get(key(pcx + i, pcz + j)); if(c && c.cols) fn(c.cols); } };
    S.doorsNear = function(x, z, r){ const out = [], pcx = Math.floor(x / CH), pcz = Math.floor(z / CH); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const c = S.chunks.get(key(pcx + i, pcz + j)); if(c) c.doors.forEach(d => { if(Math.hypot(d.x - x, d.z - z) < r) out.push(d); }); } return out; };
    S.coreReady = function(x, z){ const c = S.chunks.get(key(Math.floor(x / CH), Math.floor(z / CH))); return !!(c && c.cur && c.lod <= 1); };
    return S;
  }
  RW.Streamer = { create, CH };
})(typeof self !== 'undefined' ? self : this);
