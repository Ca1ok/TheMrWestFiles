/* REALWORLD · worker — builds chunk meshes off the main thread (CPU-parallel), so walking never stutters while the city streams in. Protocol:
 *   → { t:'chunk', id, cx, cz, lod, nh }     ← { t:'chunk', id, cx, cz, lod, mesh:{vb,n,ib,ni,minY,maxY}, cols, doors, stats }  (buffers are transferred, not copied)
 * Before the first chunk it loads the baked building models (assets/world/manifest.json → RWModels, see glb.js loadBuildings). Requests that arrive meanwhile wait; if the models do not
 * load within 10 s (offline, missing files) the worker starts anyway and the buildings stay procedural. */
importScripts('../lib/worldgen.js', '../lib/buildgen.js', 'terrain.js', 'mesh.js', 'layout.js', 'models.js', 'chunkgen.js', 'glb.js');
let ready = false; const waiting = [];
function go(m){
  try{ const r = RWChunk.build(m.cx, m.cz, m.lod, m.nh); self.postMessage({ t: 'chunk', id: m.id, cx: m.cx, cz: m.cz, lod: m.lod, mesh: r.mesh, cols: r.cols, doors: r.doors, props: r.props, stats: r.stats }, [r.mesh.vb, r.mesh.ib.buffer, r.cols.buffer, r.props.buffer]); }
  catch(err){ self.postMessage({ t: 'error', id: m.id, cx: m.cx, cz: m.cz, lod: m.lod, msg: String(err && err.stack || err) }); }
}
self.onmessage = function(e){ const m = e.data; if(m.t !== 'chunk') return; if(ready) go(m); else waiting.push(m); };
Promise.race([RealWorld.Assets.loadBuildings('../../assets/world/'), new Promise(r => setTimeout(r, 10000))]).catch(() => {}).then(() => { ready = true; waiting.splice(0).forEach(go); });
