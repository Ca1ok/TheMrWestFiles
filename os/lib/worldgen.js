/* LIB · worldgen — the shape of WestCountry. Everything here is a PURE function of an index, so nothing about geometry is ever stored or downloaded:
 *   house i  → district floor(i/64), slot i%64, type, base value, address, x/y on the map
 *   district k → name, prestige, centre on a golden-angle spiral (so the country can grow forever, a new district every 64 houses)
 *   bot n    → name, job, traits, bio, lifespan
 * What IS stored in Firebase is only what changes: who owns a house, its value, its rent, damage… (world/own/<id>). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.WorldGen = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const PER = 64, GA = 2.399963229728653;
  const h32 = (a, b) => { let x = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297A2D39) >>> 0; x ^= x >>> 15; return x >>> 0; };
  const f01 = (a, b) => h32(a, b) / 4294967296;
  const pick = (arr, a, b) => arr[h32(a, b) % arr.length];

  const DISTRICTS = [
    ['Harbour Quay', 1.25, '#3f7fbf'], ['Old Town', 1.0, '#b58a4a'], ['Maple Heights', 1.4, '#3fae78'], ['Riverside', 1.1, '#52b5b0'], ['Foundry Row', 0.75, '#a0583f'], ['Sunset Beach', 1.6, '#e8803d'],
    ['Pinewood', 0.9, '#5d8f4a'], ['Crown Hill', 1.9, '#9b7bff'], ['Market Square', 1.05, '#d9a441'], ['Stonebridge', 0.85, '#7c8696'], ['Lakeside', 1.35, '#4aa0d6'], ['Westgate', 0.95, '#c96a4a'],
    ['Cedar Park', 1.15, '#4f9d69'], ['Ironworks', 0.7, '#8a6a58'], ['Silver Bay', 1.5, '#8fb3d9'], ['Oakridge', 1.2, '#7a8f3f'], ['Kingsway', 1.7, '#c9a227'], ['Fernhollow', 0.95, '#69a37a'], ['Gullwing Point', 1.3, '#58a6c2'], ['Tanner’s Mill', 0.8, '#a67b5b']
  ];
  const STREETS = ['Maple Rd', 'Oak St', 'Harbour Way', 'Kiln Lane', 'Bridge St', 'Elm Ct', 'Foundry Rd', 'Orchard Ave', 'Beacon St', 'Willow Dr', 'Quarry Rd', 'Mill Lane', 'Copper St', 'Ash Grove', 'Station Rd', 'Cliff Walk', 'Hazel Way', 'Birch Ct', 'Anchor Lane', 'Lantern St', 'Rowan Rd', 'Tide St', 'Granite Ave', 'Fennel Close'];
  const TYPES = [   // key, label, weight, beds, value range (cents), colour
    { k: 'studio', n: 'Studio', w: 30, beds: 0, lo: 1500000, hi: 3500000, c: '#8fb3d9' },
    { k: 'apartment', n: 'Apartment', w: 28, beds: 2, lo: 4000000, hi: 9000000, c: '#52b5b0' },
    { k: 'townhouse', n: 'Townhouse', w: 18, beds: 3, lo: 10000000, hi: 20000000, c: '#3fae78' },
    { k: 'house', n: 'House', w: 14, beds: 4, lo: 22000000, hi: 45000000, c: '#d9a441' },
    { k: 'villa', n: 'Villa', w: 7, beds: 5, lo: 60000000, hi: 150000000, c: '#e8803d' },
    { k: 'mansion', n: 'Mansion', w: 3, beds: 8, lo: 200000000, hi: 600000000, c: '#9b7bff' }
  ];
  const TW = TYPES.reduce((s, t) => s + t.w, 0);
  const SEED = 7741;

  /* ================= the map (pure functions of an index; nothing here is stored) =================
   * CORE (700,520): downtown (bank, exchange, shop, arcade, estate agency, council hall, park) with the University Quarter to the west and the Industrial Estate to the east.
   * DISTRICTS spiral out from the core (district k, 64 houses each). Inside a district 4 winding streets run along an orientation, 16 houses per street, one avenue down the middle.
   * HIGHWAYS link the core to every district (a tree: each district joins the nearest earlier one) and every "city" district (prestige ≥ 1.5, where the expensive houses are) also gets an express highway straight to the core.
   * Only the OWNERSHIP of houses/plots (world/own, world/plot) and where players are (world/loc) are stored. House ids, types, values and addresses did not change when this layout was introduced. */
  const CORE = { x: 700, y: 520 }, K0 = 9, CITY_PRESTIGE = 1.5, SPD = 0.85;
  const POIS = {      // id → place on the map (apps that have a place: see APP_PLACE)
    hub: { x: 700, y: 520, n: 'Town Square', k: 'hub' }, bank: { x: 664, y: 488, n: 'Bank', k: 'bank' }, exchange: { x: 736, y: 488, n: 'Stock Exchange', k: 'exchange' },
    shop: { x: 664, y: 552, n: 'WestShop', k: 'shop' }, arcade: { x: 736, y: 552, n: 'Arcade', k: 'arcade' }, agency: { x: 700, y: 466, n: 'Estate Agency', k: 'agency' },
    hall: { x: 700, y: 580, n: 'Council Hall', k: 'hall' }, park: { x: 700, y: 640, n: 'Central Park', k: 'park' },
    uni: { x: 372, y: 398, n: 'University Library', k: 'uni' }, lab: { x: 432, y: 440, n: 'Research Institute', k: 'lab' },
    ind: { x: 1006, y: 648, n: 'Freight Depot', k: 'ind' }, plant: { x: 1096, y: 604, n: 'Power Plant', k: 'plant' }
  };
  const APP_PLACE = { Arcade: 'arcade', Bank: 'bank', WestShop: 'shop', Stocks: 'exchange', RealEstate: 'agency', WestLab: 'lab', WestFactory: 'factory' };   // every other app (and the bare desktop) = at home
  const PLACE_NAMES = { home: 'Home', arcade: 'the Arcade', bank: 'the Bank', shop: 'WestShop', exchange: 'the Stock Exchange', agency: 'the Estate Agency', lab: 'their Laboratory', factory: 'their Factory', hall: 'Council Hall', park: 'Central Park' };
  // plots: the University Quarter (labs, west) and the Industrial Estate (factories, east), a fixed grid; your cell comes from your uid so it never moves
  const ZONES = { uni: { x0: 224, y0: 340, x1: 536, y1: 480, cols: 12, rows: 5, n: 'University Quarter', c: '#6f7fd0', kind: 'l', ids: 'lab' }, ind: { x0: 868, y0: 570, x1: 1180, y1: 700, cols: 12, rows: 5, n: 'Industrial Estate', c: '#c0764a', kind: 'f', ids: 'factory' } };
  const plotCell = (kind, uid) => { const z = kind === 'l' ? ZONES.uni : ZONES.ind, c = h32(hash(uid), kind === 'l' ? 901 : 902) % (z.cols * z.rows), col = c % z.cols, row = Math.floor(c / z.cols), cw = (z.x1 - z.x0) / z.cols, rh = (z.y1 - z.y0) / z.rows; return { x: z.x0 + (col + 0.5) * cw, y: z.y0 + (row + 0.5) * rh, w: cw * 0.7, h: rh * 0.62, col, row }; };
  const hash = str => { let x = 2166136261; str = String(str); for(let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619) >>> 0; return x >>> 0; };

  /* ---- districts: a grid of connected streets (not isolated clumps) ----
   * Each district is an AVENUE (the spine, u = -GU..GU) crossed by 4 CROSS STREETS (u = ±S/2, ±3S/2, v = -W..W). Houses sit on the two sides of each cross street, four lots to an arm,
   * set well apart (about 3× the room per house of the old layout), with a green in the middle blocks. Both avenue ends are gates onto the highway mesh (every district links to its two nearest
   * older neighbours, so there are loops, not a tree). All of it is a pure function of the district index; the streets bend gently (a warp) so nothing is a ruler-straight grid. */
  const S = 52, W = 96, GU = 112, SET = 9, ARM = [20, 42, 64, 86], SCALE = 250;
  function district(k){
    const d = DISTRICTS[k % DISTRICTS.length], rep = Math.floor(k / DISTRICTS.length), r = SCALE * Math.sqrt(k + K0), a = k * GA;
    return { k, name: rep ? d[0] + ' ' + (rep + 1) : d[0], prestige: d[1], color: d[2], city: d[1] >= CITY_PRESTIGE, theta: f01(k, 50) * Math.PI, cx: Math.round(CORE.x + r * Math.cos(a)), cy: Math.round(CORE.y + r * Math.sin(a) * SPD) };
  }
  const DC = new Map(); const dist = k => { let d = DC.get(k); if(!d){ d = district(k); d.c = Math.cos(d.theta); d.s = Math.sin(d.theta); d.ph = [f01(k, 51) * 6.28, f01(k, 52) * 6.28, f01(k, 53) * 6.28, f01(k, 54) * 6.28]; if(DC.size > 400) DC.clear(); DC.set(k, d); } return d; };
  /* district-local (u along the avenue, v across) → world; a slow sine warp bends every street the same way, so junctions stay exact */
  function loc(k, u, v){ const d = dist(k), a = u + 5 * Math.sin(v * 0.035 + d.ph[0]) + 2 * Math.sin(v * 0.09 + d.ph[1]), b = v + 5 * Math.sin(u * 0.03 + d.ph[2]) + 2 * Math.sin(u * 0.085 + d.ph[3]); return [d.cx + a * d.c - b * d.s, d.cy + a * d.s + b * d.c]; }
  const UC = c => (c - 1.5) * S;                               // u of cross street c (0..3)
  const sampleU = (k, u0, u1, step) => { const out = [], n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / (step || 12))); for(let i = 0; i <= n; i++) out.push(loc(k, u0 + (u1 - u0) * i / n, 0)); return out; };
  const sampleV = (k, c, v0, v1, step) => { const out = [], n = Math.max(1, Math.ceil(Math.abs(v1 - v0) / (step || 12))); for(let i = 0; i <= n; i++) out.push(loc(k, UC(c), v0 + (v1 - v0) * i / n)); return out; };
  const roads = k => [0, 1, 2, 3].map(c => ({ r: c, avenue: false, pts: sampleV(k, c, -W, W, 8) })).concat([{ r: 4, avenue: true, pts: sampleU(k, -GU, GU, 8) }]);
  const roadEnds = k => [0, 1, 2, 3].map(c => [loc(k, UC(c), -W), loc(k, UC(c), W)]);        // cul-de-sac bulbs
  const parks = k => [-1, 1].map(sg => [[-15, 26 * sg], [15, 26 * sg], [15, 88 * sg], [-15, 88 * sg]].map(q => loc(k, q[0], q[1])));
  const footprint = k => [[-GU - 14, -W - 16], [GU + 14, -W - 16], [GU + 14, W + 16], [-GU - 14, W + 16]].map(q => loc(k, q[0], q[1]));
  const streetName = (k, c) => STREETS[(h32(k, 60) + c * 5) % STREETS.length];
  function stations(k){ return [{ t: 'fire', ...pt(loc(k, -S, 11)), d: k }, { t: 'police', ...pt(loc(k, 0, -11)), d: k }, { t: 'ambulance', ...pt(loc(k, S, 11)), d: k }]; }
  const pt = p => ({ x: p[0], y: p[1] });
  const BH = { studio: 5, apartment: 13, townhouse: 8, house: 7, villa: 9, mansion: 12 }, BW = { studio: 8, apartment: 13, townhouse: 10, house: 11, villa: 13, mansion: 15 }, BD = { studio: 8, apartment: 11, townhouse: 9, house: 10, villa: 12, mansion: 15 };
  function house(i){
    const k = Math.floor(i / PER), s = i % PER, d = district(k), c = s >> 4, j = s & 15, roll = h32(i, SEED) % TW;
    let acc = 0, ty = TYPES[0]; for(const t of TYPES){ acc += t.w; if(roll < acc){ ty = t; break; } }
    const base = Math.round((ty.lo + (ty.hi - ty.lo) * f01(i, SEED + 1)) * d.prestige / 1000) * 1000;      // whole $10 steps (in cents)
    const q = j >> 1, side = (j & 1) ? 1 : -1, arm = (q >> 2) ? 1 : -1, idx = q & 3, v = arm * (ARM[idx] + (f01(i, 4) - 0.5) * 7), u = UC(c) + side * (SET + (f01(i, 3) - 0.5) * 3 + (BW[ty.k] > 13 ? 4 : 0));
    const p = loc(k, u, v), p2 = loc(k, u, v + 2), p0 = loc(k, u, v - 2);
    return { i, id: 'h' + i, k, district: d.name, type: ty.k, typeName: ty.n, beds: ty.beds, c: ty.c, base, road: c, city: d.city,
      x: p[0], y: p[1], ang: Math.atan2(p2[1] - p0[1], p2[0] - p0[0]) + (side > 0 ? 0 : 0), side, w: BW[ty.k], dp: BD[ty.k], ht: BH[ty.k] * (0.85 + f01(i, 8) * 0.4), cu: UC(c), v, arm,
      addr: (2 * q + (side > 0 ? 2 : 1)) + ' ' + streetName(k, c) };
  }
  /* downtown: decorative blocks between the radial streets (buildings, so 3D has a skyline) */
  let CB = null;
  function coreBlocks(){ if(CB) return CB; CB = []; const segs = []; Object.keys(POIS).forEach(id => { if(id === 'hub' || !POIS[id]) return; if(['bank', 'exchange', 'shop', 'arcade', 'agency', 'hall', 'park'].includes(id)) segs.push([CORE.x, CORE.y, POIS[id].x, POIS[id].y]); });
    [[-60, -40, 60, -40], [60, -40, 60, 40], [60, 40, -60, 40], [-60, 40, -60, -40]].forEach(s => segs.push([CORE.x + s[0], CORE.y + s[1], CORE.x + s[2], CORE.y + s[3]]));
    const dseg = (px, py, s) => { const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / L2)); return Math.hypot(px - s[0] - dx * t, py - s[1] - dy * t); };
    for(let gx = -5; gx <= 5; gx++) for(let gy = -4; gy <= 4; gy++){ const x = CORE.x + gx * 20 + (f01(gx + 9, gy + 13) - 0.5) * 4, y = CORE.y + gy * 22 + (f01(gx + 3, gy + 77) - 0.5) * 4; if(Math.abs(x - CORE.x) > 104 || Math.abs(y - CORE.y) > 98) continue;
      if(segs.some(s => dseg(x, y, s) < 11) || Object.keys(POIS).some(id => id !== 'hub' && Math.hypot(POIS[id].x - x, POIS[id].y - y) < 18)) continue; const r = f01(gx + 20, gy + 31), near = 1 - Math.hypot(x - CORE.x, y - CORE.y) / 140;
      const u = Math.exp(-(((x - CORE.x) ** 2 + (y - CORE.y) ** 2) / (330 * 330))), r2 = f01(gx + 59, gy + 3), fl = Math.max(3, Math.round((3 + 26 * Math.pow(u, 1.3) * (0.45 + 0.55 * r)) * (0.85 + 0.3 * r2)));   // the skyline: the same field as BuildGen.urban, so downtown towers fade into the districts' mid-rise
      CB.push({ x, y, w: 11 + f01(gx, gy + 5) * 5, d: 11 + f01(gx + 7, gy) * 5, fl, kind: r > 0.18 || u < 0.5 ? (r2 < 0.78 ? 'office' : 'apartment') : 'shop', v: Math.floor(f01(gx + 11, gy + 17) * 997), h: fl * 3.1 + 2, tone: f01(gx + 41, gy + 9) }); } return CB; }

  const districtCount = n => Math.max(1, Math.ceil(n / PER));
  const bounds = n => { let x0 = ZONES.uni.x0 - 40, y0 = ZONES.uni.y0 - 60, x1 = ZONES.ind.x1 + 40, y1 = ZONES.ind.y1 + 40; for(let k = 0; k < districtCount(n); k++){ const d = district(k); x0 = Math.min(x0, d.cx - 150); y0 = Math.min(y0, d.cy - 140); x1 = Math.max(x1, d.cx + 150); y1 = Math.max(y1, d.cy + 140); } return { x0, y0, x1, y1 }; };

  /* ---------- highways & routing ---------- */
  const NODE = id => id === 'hub' ? { x: CORE.x, y: CORE.y } : id === 'uni' ? { x: 380, y: 410 } : id === 'ind' ? { x: 1020, y: 640 } : (d => ({ x: d.cx, y: d.cy }))(district(+String(id).slice(1)));
  const nid = k => 'd' + k;
  /* gate of a district nearest to a point: either end of its avenue → { x, y, u } */
  function gate(k, to){ const a = loc(k, -GU, 0), b = loc(k, GU, 0), ea = Math.hypot(a[0] - to.x, a[1] - to.y) <= Math.hypot(b[0] - to.x, b[1] - to.y); const p = ea ? a : b; return { x: p[0], y: p[1], u: ea ? -GU : GU }; }
  function curve(a, b, wob, seed){ const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, off = (f01(seed, 61) - 0.5) * 2 * Math.min(80, L * 0.22) * wob, c1 = { x: mx - dy / L * off + dx * 0.08, y: my + dx / L * off + dy * 0.08 }, pts = [];
    for(let i = 0; i <= 24; i++){ const u = i / 24, v = 1 - u; pts.push([v * v * a.x + 2 * v * u * c1.x + u * u * b.x + 2.5 * Math.sin(u * 9 + seed), v * v * a.y + 2 * v * u * c1.y + u * u * b.y + 2.5 * Math.cos(u * 8 + seed)]); } pts[0] = [a.x, a.y]; pts[24] = [b.x, b.y]; return pts; }
  /* the two nearest OLDER districts (so an edge never changes when the country grows) */
  function parentsOf(k){ const d = district(k), c = []; for(let q = 0; q < k; q++){ const e = district(q); c.push([Math.hypot(d.cx - e.cx, d.cy - e.cy), nid(q)]); } c.sort((a, b) => a[0] - b[0]); const hd = Math.hypot(d.cx - CORE.x, d.cy - CORE.y) * 1.25, out = [];
    if(!c.length || hd < c[0][0]) out.push('hub'); else out.push(c[0][1]); if(c[1] && c[1][0] < c[0][0] * 1.45 + 30) out.push(c[1][1]); else if(k > 0 && k < 3 && !out.includes('hub')) out.push('hub'); return out; }
  const HWY_CACHE = new Map();
  const HW_N = new Map();
  function highways(n){ let c = HW_N.get(n); if(!c){ c = highwaysRaw(n); if(HW_N.size > 40) HW_N.clear(); HW_N.set(n, c); } return c; }
  function highwaysRaw(n){
    const out = [{ a: 'hub', b: 'uni', express: false, spur: true, pts: curve(NODE('hub'), NODE('uni'), 0.6, 1) }, { a: 'hub', b: 'ind', express: false, spur: true, pts: curve(NODE('hub'), NODE('ind'), 0.6, 2) }];
    for(let k = 0; k < n; k++){ const key = 'h' + k, cc = HWY_CACHE.get(key); if(cc){ out.push.apply(out, cc); continue; } const es = [], d = district(k);
      parentsOf(k).forEach((par, pi) => { const pn = NODE(par), g = gate(k, pn), pg = par === 'hub' ? pn : gate(+par.slice(1), g); es.push({ a: par, b: nid(k), express: false, link: pi > 0, ua: par === 'hub' ? null : pg.u, ub: g.u, pts: curve(pg, g, 1, 100 + k + pi * 37) }); });
      if(d.city && !parentsOf(k).includes('hub')){ const g2 = gate(k, NODE('hub')); es.push({ a: 'hub', b: nid(k), express: true, ua: null, ub: g2.u, pts: curve(NODE('hub'), g2, 1.4, 300 + k) }); }
      HWY_CACHE.set(key, es); out.push.apply(out, es); }
    return out;
  }
  const lenOf = pts => { let L = 0; for(let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  /* where something is: { x, y, node, hs } → the node of the road network it joins (hs = the house, so a walker leaves by its own street) */
  const placeOf = (x, y, node, hs) => ({ x, y, node, hs: hs || null });
  function nodeOfHouse(g){ return nid(g.k); }
  /* shortest path by hops (express roads included) over the highway graph → chain of edges */
  const NP_CACHE = new Map();
  function nodeChain(a, b, n){ const key = a + '>' + b + '>' + n, c = NP_CACHE.get(key); if(c) return c; let chain = [];
    if(a !== b){ const hw = highways(n), adj = {}; hw.forEach((e, i) => { (adj[e.a] = adj[e.a] || []).push([e.b, i, 1]); (adj[e.b] = adj[e.b] || []).push([e.a, i, -1]); });
      const prev = { [a]: null }, q = [a]; while(q.length){ const u = q.shift(); if(u === b) break; (adj[u] || []).forEach(([v, i, dir]) => { if(!(v in prev)){ prev[v] = [u, i, dir]; q.push(v); } }); }
      if(b in prev){ for(let c2 = b; prev[c2]; c2 = prev[c2][0]) chain.push({ e: hw[prev[c2][1]], dir: prev[c2][2] }); chain.reverse(); } }
    if(NP_CACHE.size > 3000) NP_CACHE.clear(); NP_CACHE.set(key, chain); return chain; }
  const push = (pts, seg) => { seg.forEach(p => { const l = pts[pts.length - 1]; if(!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.05) pts.push(p); }); };
  /* walk a house's own street to the avenue (and back): foot of the lot → along the cross street → the junction */
  const toAvenue = g => sampleV(g.k, g.road, g.v, 0, 8);
  function route(A, B, n){ const pts = [[A.x, A.y]], chain = nodeChain(A.node, B.node, n); let cur = null;      // cur = { k, u } where the walker is on a district avenue
    if(A.hs){ push(pts, toAvenue(A.hs)); cur = { k: A.hs.k, u: A.hs.cu }; }
    if(!chain.length){
      if(A.hs && B.hs && A.hs.k === B.hs.k){ const a = A.hs, b = B.hs; pts.length = 1; if(a.road === b.road){ push(pts, sampleV(a.k, a.road, a.v, b.v, 8)); } else { push(pts, toAvenue(a)); push(pts, sampleU(a.k, a.cu, b.cu, 10)); push(pts, sampleV(b.k, b.road, 0, b.v, 8).slice(0)); } }
      else if(B.hs && cur){ push(pts, sampleU(cur.k, cur.u, B.hs.cu, 10)); push(pts, sampleV(B.hs.k, B.hs.road, 0, B.hs.v, 8)); }
      pts.push([B.x, B.y]); return pts; }
    chain.forEach(({ e, dir }) => { const from = dir === 1 ? e.a : e.b, ufrom = dir === 1 ? e.ua : e.ub, uto = dir === 1 ? e.ub : e.ua, to = dir === 1 ? e.b : e.a;
      if(cur && ufrom != null && cur.k === +String(from).slice(1)) push(pts, sampleU(cur.k, cur.u, ufrom, 10)); push(pts, dir === 1 ? e.pts : e.pts.slice().reverse()); cur = uto != null ? { k: +String(to).slice(1), u: uto } : null; });
    if(B.hs && cur && cur.k === B.hs.k){ push(pts, sampleU(cur.k, cur.u, B.hs.cu, 10)); push(pts, sampleV(B.hs.k, B.hs.road, 0, B.hs.v, 8)); }
    pts.push([B.x, B.y]); return pts; }

  function posAlong(pts, f){ const tot = lenOf(pts); if(f <= 0 || tot === 0) return { x: pts[0][0], y: pts[0][1], a: 0 }; if(f >= 1) return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], a: 0 }; let d = f * tot; for(let i = 1; i < pts.length; i++){ const sl = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if(d <= sl){ const u = sl ? d / sl : 0; return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) }; } d -= sl; } return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], a: 0 }; }

  /* ---------- where things are ---------- */
  const poiPlace = id => { const p = POIS[id], nodeOf = { uni: 'uni', lab: 'uni', ind: 'ind', plant: 'ind' }; return placeOf(p.x, p.y, nodeOf[id] || 'hub'); };
  const jitterOf = (uid, r) => { const a = h32(hash(uid), 77) / 4294967296 * 6.28; return [Math.cos(a) * r, Math.sin(a) * r]; };
  /* a player's spot for a `place` (home | arcade | bank | …): needs their home house id (or null) */
  function playerPlace(place, uid, homeId){
    if(place === 'lab' || place === 'factory'){ const c = plotCell(place === 'lab' ? 'l' : 'f', uid); return placeOf(c.x, c.y, place === 'lab' ? 'uni' : 'ind'); }
    if(place === 'home' || !POIS[place]){ if(homeId){ const g = house(+String(homeId).slice(1)); return placeOf(g.x, g.y, nodeOfHouse(g), g); } const j = jitterOf(uid, 14); return placeOf(POIS.hub.x + j[0], POIS.hub.y + j[1], 'hub'); }
    const p = poiPlace(place), j = jitterOf(uid, 9); return placeOf(p.x + j[0], p.y + j[1], p.node);
  }

  /* ---------- the NPCs (bots): a pure timetable, so every browser sees the same dots without anything being stored ---------- */
  const SLOT = 120000, DAYSLOTS = 30, NIGHT = 7, TRIP = 0.8;                 // a world "day" is 30 slots of 2 real minutes; the first 7 are night (everyone is home)
  const WORK = { baker: 'shop', barista: 'shop', shopkeeper: 'shop', chef: 'shop', courier: 'agency', chemist: 'lab', 'lab tech': 'lab', teacher: 'uni', librarian: 'uni', nurse: 'hall', welder: 'ind', mechanic: 'ind', electrician: 'plant', architect: 'agency', trader: 'exchange',
    developer: 'exchange', gardener: 'park', fisher: 'park', landlord: 'agency', investor: 'exchange', artist: 'arcade', pilot: 'hall', surveyor: 'agency', inventor: 'lab' };
  const WHY = { home: 'going home', work: 'heading to work', shop: 'shopping', bank: 'visiting the bank', arcade: 'for a game at the arcade', exchange: 'checking the markets', agency: 'looking at property', park: 'a stroll in the park', visit: 'visiting a neighbour' };
  /* bot n at slot s → where it wants to be: { why, x, y, node, label } */
  function npcPlan(b, s, home, n){
    const hp = home ? placeOf(home.x, home.y, nodeOfHouse(home), home) : placeOf(POIS.hub.x + 20, POIS.hub.y + 20, 'hub'), hl = home ? home.addr : 'Town Square';
    const phase = ((s % DAYSLOTS) + DAYSLOTS) % DAYSLOTS, r = f01(b.n, s * 7 + 3), wk = WORK[b.job] || 'shop', at = (id, why) => Object.assign(poiPlace(id), { why, label: POIS[id].n });
    if(phase < NIGHT) return Object.assign({}, hp, { why: 'home', label: hl });
    if(r < 0.34) return at(wk, 'work'); if(r < 0.44) return at('shop', 'shop'); if(r < 0.50) return at('bank', 'bank'); if(r < 0.50 + 0.10 * (1 - b.thrift) + 0.02) return at('arcade', 'arcade');
    if(r < 0.66 + (b.job === 'trader' || b.job === 'investor' ? 0.08 : 0)) return at('exchange', 'exchange'); if(r < 0.72) return at('agency', 'agency'); if(r < 0.80) return at('park', 'park');
    if(r < 0.88){ const hi = Math.floor(home ? home.i / PER : 0) * PER + (h32(b.n, s) % PER), g = house(hi); return Object.assign(placeOf(g.x, g.y, nodeOfHouse(g), g), { why: 'visit', label: g.addr }); }
    return Object.assign({}, hp, { why: 'home', label: hl });
  }
  const TRIPS = new Map();
  function npcTrip(b, home, s, n){ const key = b.n + '|' + s + '|' + n + '|' + (home ? home.i : -1), c = TRIPS.get(key); if(c) return c;
    const from = npcPlan(b, s - 1, home, n), to = npcPlan(b, s, home, n), t0 = s * SLOT + (h32(b.n, s) % 25000), rt = route(from, to, n), L = lenOf(rt), dur = Math.max(4000, Math.min(L / 14 * 1000, TRIP * SLOT - 25000));
    const trip = { from, to, t0, dur, rt, L }; if(TRIPS.size > 6000) TRIPS.clear(); TRIPS.set(key, trip); return trip; }
  /* the dot at time `now`: { x, y, moving, from, to, eta (ms), next: [plan…], route } */
  function npcState(b, home, now, n){
    const s = Math.floor(now / SLOT), T = npcTrip(b, home, s, n), f = (now - T.t0) / T.dur, moving = T.L > 3 && f > 0 && f < 1, p = T.L > 3 ? posAlong(T.rt, f) : { x: T.to.x, y: T.to.y, a: 0 };
    return { x: p.x, y: p.y, a: p.a, moving, from: T.from, to: T.to, eta: moving ? Math.max(0, T.t0 + T.dur - now) : 0, route: T.rt, f, next: [npcPlan(b, s + 1, home, n), npcPlan(b, s + 2, home, n)] };
  }

  /* ---- bots: a unique little character per index ---- */
  const FIRST = ['Ada', 'Bruno', 'Cleo', 'Dmitri', 'Esme', 'Farid', 'Greta', 'Hiro', 'Ines', 'Jonas', 'Kavya', 'Leon', 'Mina', 'Nico', 'Odile', 'Pavel', 'Quinn', 'Rosa', 'Sven', 'Tala', 'Umar', 'Vera', 'Wren', 'Xavi', 'Yara', 'Zane', 'Amara', 'Boris', 'Chiara', 'Dev', 'Elif', 'Felix', 'Gwen', 'Hugo', 'Isla', 'Joss', 'Kira', 'Lars', 'Maeve', 'Noor'];
  const LAST = ['Okafor', 'Lindqvist', 'Marlow', 'Castellan', 'Petrov', 'Nakamura', 'Brightwell', 'Duarte', 'Haldane', 'Iyer', 'Kowalski', 'Leclerc', 'Moreau', 'Novak', 'Osei', 'Pryce', 'Quill', 'Rowntree', 'Sato', 'Thorne', 'Underhill', 'Varga', 'Whitlock', 'Yilmaz', 'Zielinski', 'Ashby', 'Bexley', 'Corrigan', 'Dunmore', 'Everett'];
  const JOBS = [   // name, income tier (1 = low), thrift tendency, landlord tendency
    ['baker', 1, 0.7, 0.1], ['barista', 1, 0.5, 0.0], ['courier', 1, 0.5, 0.0], ['chemist', 3, 0.6, 0.2], ['lab tech', 2, 0.6, 0.1], ['teacher', 2, 0.7, 0.2], ['nurse', 2, 0.6, 0.1], ['welder', 2, 0.5, 0.1],
    ['architect', 4, 0.5, 0.5], ['trader', 4, 0.2, 0.4], ['shopkeeper', 2, 0.7, 0.3], ['fisher', 1, 0.6, 0.1], ['electrician', 3, 0.6, 0.2], ['developer', 4, 0.5, 0.3], ['gardener', 1, 0.7, 0.0], ['mechanic', 2, 0.5, 0.1],
    ['landlord', 3, 0.8, 0.95], ['investor', 5, 0.4, 0.8], ['artist', 1, 0.3, 0.0], ['pilot', 4, 0.4, 0.2], ['librarian', 1, 0.8, 0.0], ['chef', 2, 0.4, 0.1], ['surveyor', 3, 0.6, 0.4], ['inventor', 3, 0.3, 0.1]
  ];
  const HOBBY = ['collects rare minerals', 'runs a tiny chemistry blog', 'never misses a market open', 'is saving for a bigger place', 'hates paying rent', 'swears by index funds', 'plays the arcade on Fridays', 'bakes for the whole street', 'repairs old radios', 'photographs the harbour at dawn', 'keeps bees on the roof', 'is always “one more reaction” from a discovery'];
  function bot(n){
    const j = JOBS[h32(n, 11) % JOBS.length], life = 40 + (h32(n, 12) % 61);       // lives 40–100 real days
    return { n, id: 'b' + n, name: FIRST[h32(n, 13) % FIRST.length] + ' ' + LAST[h32(n, 14) % LAST.length], job: j[0], tier: j[1], thrift: Math.min(0.95, j[2] + (f01(n, 15) - 0.5) * 0.3), landlord: Math.min(1, Math.max(0, j[3] + (f01(n, 16) - 0.5) * 0.3)),
      risk: f01(n, 17), social: f01(n, 18), lifespanDays: life, color: 'hsl(' + (h32(n, 19) % 360) + ',55%,55%)', hobby: HOBBY[h32(n, 20) % HOBBY.length],
      bio: 'A ' + j[0] + ' who ' + HOBBY[h32(n, 20) % HOBBY.length] + '.' };
  }
  return { PER, DISTRICTS, TYPES, h32, f01, hash, district, stations, house, districtCount, bounds, bot, JOBS, CORE, POIS, ZONES, APP_PLACE, PLACE_NAMES, WHY, SLOT, plotCell, roads, roadEnds, parks, footprint, streetName, coreBlocks, loc, GEO: { S, W, GU, SET, ARM }, highways, route, posAlong, lenOf, playerPlace, poiPlace, npcPlan, npcState };
});
