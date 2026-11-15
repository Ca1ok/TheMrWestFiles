/* REALWORLD · terrain — the ground of WestCountry as a PURE function height(x, z) (metres). Nothing is stored or downloaded.
 * Gently rolling hills everywhere, but every district, downtown and both campuses sit on a smooth TERRACE (the hill's height at their centre) that melts into the
 * hills over ~170 m, so houses never stand on a slope, and no two terraces ever meet at a cliff (the terraces are blended by weight, never "nearest wins").
 * Shared by the chunk worker, the main thread (walking) and the Node tests. Map units are metres: map (x, y) = world (x, z). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.RWTerrain = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hh = (x, z) => { let h = (Math.imul(x | 0, 0x9E3779B1) ^ Math.imul((z | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf), a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const nat = (x, z) => 6 * (vn(x / 400 + 3.1, z / 400 + 7.7) - 0.5) + 2.2 * (vn(x / 130 + 11, z / 130 + 5) - 0.5) + 0.35 * (vn(x / 37 + 2, z / 37 + 9) - 0.5);
  /* The whole city sits on one gently rolling plateau (radius = layout.radius()), so streets and houses never meet a slope; outside it the hills grow to full height over 300 m. */
  let CR = -1;
  function setup(radius){ CR = radius; }
  function height(x, z){ const d = Math.hypot(x, z), w = 1 - sm(CR, CR + 300, d), n = nat(x, z); return n * (1 - w) + n * 0.1 * w; }
  /* 0 = open country, 1 = the middle of the city (tints the ground, keeps forest out) */
  function built(x, z){ return 1 - sm(CR * 0.9, CR + 220, Math.hypot(x, z)); }
  return { setup, height, built, nat, vn, hh, sm };
});
