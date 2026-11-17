/* REALWORLD · models — the registry of baked BUILDING models (Kenney city kits, see assets/world/manifest.json "buildings" and tools/bake-kenney.py).
 * Filled by RealWorld.Assets.loadBuildings() inside the chunk worker; chunkgen.js asks it for a model that fits a footprint. If nothing is registered (no manifest, files missing, tests,
 * the no-Worker fallback) pick() returns null and chunkgen keeps drawing the procedural buildings, so the world never depends on the models.
 * A model: { id, kind, w, d, h (metres at scale 1), dx (door's lateral offset), m0 (full detail mesh), m1 (lower detail mesh) }. Front = −Z, centred on x/z, standing on y = 0. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.RWModels = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const R = {
    map: {}, order: [], ready: false,
    add(id, meta, m0, m1){ this.map[id] = { id, kind: meta.kind, w: meta.w, d: meta.d, h: meta.h, dx: (meta.door && meta.door.x) || 0, m0, m1: m1 || m0 }; this.order.push(id); this.ready = true; },
    get(id){ return this.map[id] || null; },
    ofKind(kind){ return this.order.filter(i => this.map[i].kind === kind); },
    /* the model of `ids` that covers a W×D footprint best (uniform scale k, never above maxK, never so small that k < minK or it covers < minCover of the footprint).
     * hMax (optional) caps the height. key picks among the near-best candidates so neighbours differ but a given house always gets the same one. Returns null = use the procedural building. */
    pick(ids, W, D, hMax, key, o){
      o = o || {}; const maxK = o.maxK || 1.7, minK = o.minK || 0.5, minCover = o.minCover || 0.5, c = [];
      for(const id of ids){ const m = this.map[id]; if(!m) continue; let k = Math.min(W / m.w, D / m.d, maxK); if(hMax) k = Math.min(k, hMax / m.h); if(k < minK) continue; c.push({ m, k, cover: (m.w * k) * (m.d * k) / (W * D) }); }
      if(!c.length) return null; c.sort((a, b) => b.cover - a.cover || (a.m.id < b.m.id ? -1 : 1)); const top = c.filter(x => x.cover >= c[0].cover * 0.8 && x.cover >= minCover).slice(0, 4); if(!top.length) return null;
      const s = top[Math.abs(key | 0) % top.length]; return { m: s.m, k: s.k, ky: s.k, w: s.m.w * s.k, d: s.m.d * s.k, h: s.m.h * s.k, dx: s.m.dx * s.k };
    }
  };
  return R;
});
