/* REALWORLD · worker — builds chunk meshes off the main thread (CPU-parallel), so walking never stutters while the city streams in. Protocol:
 *   → { t:'chunk', id, cx, cz, lod, nh }     ← { t:'chunk', id, cx, cz, lod, mesh:{vb,n,ib,ni,minY,maxY}, cols, doors, stats }  (buffers are transferred, not copied) */
importScripts('../lib/worldgen.js', '../lib/buildgen.js', 'terrain.js', 'mesh.js', 'chunkgen.js');
self.onmessage = function(e){
  const m = e.data; if(m.t !== 'chunk') return;
  try{ const r = RWChunk.build(m.cx, m.cz, m.lod, m.nh); self.postMessage({ t: 'chunk', id: m.id, cx: m.cx, cz: m.cz, lod: m.lod, mesh: r.mesh, cols: r.cols, doors: r.doors, stats: r.stats }, [r.mesh.vb, r.mesh.ib.buffer, r.cols.buffer]); }
  catch(err){ self.postMessage({ t: 'error', id: m.id, cx: m.cx, cz: m.cz, lod: m.lod, msg: String(err && err.stack || err) }); }
};
