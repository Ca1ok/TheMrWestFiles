/* REALWORLD · terrain — the ground of WestCountry as a PURE function height(x, z) (metres). Nothing is stored or downloaded.
 * Gently rolling hills everywhere, but every district, downtown and both campuses sit on a smooth TERRACE (the hill's height at their centre) that melts into the
 * hills over ~170 m, so houses never stand on a slope, and no two terraces ever meet at a cliff (the terraces are blended by weight, never "nearest wins").
 * Shared by the chunk worker, the main thread (walking) and the Node tests. Map units are metres: map (x, y) = world (x, z). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(require('../lib/worldgen.js')); else root.RWTerrain = factory(root.WorldGen); })(typeof self !== 'undefined' ? self : this, function(G){
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hh = (x, z) => { let h = (Math.imul(x | 0, 0x9E3779B1) ^ Math.imul((z | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf), a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const nat = (x, z) => 6 * (vn(x / 400 + 3.1, z / 400 + 7.7) - 0.5) + 2.2 * (vn(x / 130 + 11, z / 130 + 5) - 0.5) + 0.35 * (vn(x / 37 + 2, z / 37 + 9) - 0.5);
  let FEAT = [], FN = -1;
  /* nd = number of districts. Features are fixed per district index, so adding districts only changes the ground near the new one. */
  function setup(nd){
    if(nd === FN) return; FN = nd; FEAT = [];
    const add = (x, z, r0, r1) => FEAT.push({ x, z, r0, r1, r12: r1 * r1, e: nat(x, z) * 0.85 });
    add(G.CORE.x, G.CORE.y, 150, 330); add(G.NODE_UNI ? G.NODE_UNI.x : 380, G.NODE_UNI ? G.NODE_UNI.y : 410, 190, 360); add(1020, 640, 190, 360);
    for(let k = 0; k < nd; k++){ const d = G.district(k); add(d.cx, d.cy, 165, 330); }
  }
  function height(x, z){
    let sw = 0, se = 0;
    for(let i = 0; i < FEAT.length; i++){ const f = FEAT[i], dx = x - f.x, dz = z - f.z, d2 = dx * dx + dz * dz; if(d2 >= f.r12) continue; const w = 1 - sm(f.r0, f.r1, Math.sqrt(d2)); sw += w; se += w * f.e; }
    return sw >= 1 ? se / sw : se + (1 - sw) * nat(x, z);
  }
  /* 0 = open country, 1 = the middle of something built (used to tint the ground and to keep forest out of the city) */
  function built(x, z){ let m = 0; for(let i = 0; i < FEAT.length; i++){ const f = FEAT[i], dx = x - f.x, dz = z - f.z, d2 = dx * dx + dz * dz; if(d2 >= f.r12) continue; const w = 1 - sm(f.r0 * 0.8, f.r1, Math.sqrt(d2)); if(w > m) m = w; } return m; }
  return { setup, height, built, nat, vn, hh, sm };
});
