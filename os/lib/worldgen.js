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

  function district(k){
    const d = DISTRICTS[k % DISTRICTS.length], rep = Math.floor(k / DISTRICTS.length), r = 200 * Math.sqrt(k + K0), a = k * GA;
    return { k, name: rep ? d[0] + ' ' + (rep + 1) : d[0], prestige: d[1], color: d[2], city: d[1] >= CITY_PRESTIGE, theta: f01(k, 50) * Math.PI, cx: Math.round(CORE.x + r * Math.cos(a)), cy: Math.round(CORE.y + r * Math.sin(a) * SPD) };
  }
  /* one local street: t in [-1,1] along it → {x,y} plus its unit tangent. r = 0..3 are the housing streets, r = 4 is the avenue through the middle. */
  function streetPt(k, r, t){
    const d = district(k), c = Math.cos(d.theta), sn = Math.sin(d.theta), off = r === 4 ? 0 : (r - 1.5) * 28, fr = 0.9 + f01(k, 52) * 0.7, ph = f01(k, 51) * 6.28, wob = u => 4.5 * Math.sin(fr * Math.PI * u + ph + 0.35 * (r === 4 ? 1.5 : r)) + 1.2 * Math.sin(2.4 * Math.PI * u + f01(k, 53) * 6.28);
    const at = u => { const al = u * 56, lat = off + wob(u); return [d.cx + al * c - lat * sn, d.cy + al * sn + lat * c]; };
    const p = at(t), q = at(Math.min(1, t + 0.02)), q0 = at(Math.max(-1, t - 0.02)); let tx = q[0] - q0[0], ty = q[1] - q0[1]; const L = Math.hypot(tx, ty) || 1; return { x: p[0], y: p[1], tx: tx / L, ty: ty / L };
  }
  const streetLine = (k, r, n) => { const out = []; n = n || 16; for(let i = 0; i <= n; i++){ const p = streetPt(k, r, -1 + 2 * i / n); out.push([p.x, p.y]); } return out; };
  const roads = k => [0, 1, 2, 3, 4].map(r => ({ r, avenue: r === 4, pts: streetLine(k, r) }));
  function stations(k){ const d = district(k); return [{ t: 'fire', x: d.cx + 66, y: d.cy - 42, d: k }, { t: 'police', x: d.cx + 66, y: d.cy, d: k }, { t: 'ambulance', x: d.cx + 66, y: d.cy + 42, d: k }]; }
  function house(i){
    const k = Math.floor(i / PER), s = i % PER, d = district(k), road = s >> 4, j = s & 15, roll = h32(i, SEED) % TW;
    let acc = 0, ty = TYPES[0]; for(const t of TYPES){ acc += t.w; if(roll < acc){ ty = t; break; } }
    const base = Math.round((ty.lo + (ty.hi - ty.lo) * f01(i, SEED + 1)) * d.prestige / 1000) * 1000;      // whole $10 steps (in cents)
    const q = j >> 1, side = (j & 1) ? 1 : -1, t = ((q + 0.5) / 8) * 2 - 1, p = streetPt(k, road, t), set = 8 + (f01(i, 3) - 0.5) * 2.4, jit = (f01(i, 4) - 0.5) * 2;
    return { i, id: 'h' + i, k, district: d.name, type: ty.k, typeName: ty.n, beds: ty.beds, c: ty.c, base, road, city: d.city,
      x: p.x - p.ty * side * set + p.tx * jit, y: p.y + p.tx * side * set + p.ty * jit, ang: Math.atan2(p.ty, p.tx),
      addr: (1 + (h32(i, 5) % 98)) + ' ' + pick(STREETS, i, 6) };
  }
  const districtCount = n => Math.max(1, Math.ceil(n / PER));
  const bounds = n => { let x0 = ZONES.uni.x0 - 40, y0 = ZONES.uni.y0 - 60, x1 = ZONES.ind.x1 + 40, y1 = ZONES.ind.y1 + 40; for(let k = 0; k < districtCount(n); k++){ const d = district(k); x0 = Math.min(x0, d.cx - 90); y0 = Math.min(y0, d.cy - 90); x1 = Math.max(x1, d.cx + 110); y1 = Math.max(y1, d.cy + 90); } return { x0, y0, x1, y1 }; };

  /* ---------- highways & routing ---------- */
  const NODE = id => id === 'hub' ? { x: CORE.x, y: CORE.y } : id === 'uni' ? { x: 380, y: 410 } : id === 'ind' ? { x: 1020, y: 640 } : (d => ({ x: d.cx, y: d.cy }))(district(+String(id).slice(1)));
  const nid = k => 'd' + k;
  /* gate of a district nearest to a point: either end of its avenue */
  function gate(k, to){ const a = streetPt(k, 4, -1), b = streetPt(k, 4, 1); return (Math.hypot(a.x - to.x, a.y - to.y) <= Math.hypot(b.x - to.x, b.y - to.y)) ? a : b; }
  function curve(a, b, wob, seed){ const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, off = (f01(seed, 61) - 0.5) * 2 * Math.min(80, L * 0.22) * wob, c1 = { x: mx - dy / L * off + dx * 0.08, y: my + dx / L * off + dy * 0.08 }, pts = [];
    for(let i = 0; i <= 24; i++){ const u = i / 24, v = 1 - u; pts.push([v * v * a.x + 2 * v * u * c1.x + u * u * b.x + 2.5 * Math.sin(u * 9 + seed), v * v * a.y + 2 * v * u * c1.y + u * u * b.y + 2.5 * Math.cos(u * 8 + seed)]); } pts[0] = [a.x, a.y]; pts[24] = [b.x, b.y]; return pts; }
  function parentOf(k){ const d = district(k); let best = 'hub', bd = Math.hypot(d.cx - CORE.x, d.cy - CORE.y) * 1.25; for(let q = 0; q < k; q++){ const e = district(q), dd = Math.hypot(d.cx - e.cx, d.cy - e.cy); if(dd < bd){ bd = dd; best = nid(q); } } return best; }
  const HWY_CACHE = new Map();
  /* every highway: { a, b, express, pts } — the core's two spurs (to the University Quarter and the Industrial Estate), a tree of districts, plus an express road to each city district */
  const HW_N = new Map();
  function highways(n){ let c = HW_N.get(n); if(!c){ c = highwaysRaw(n); if(HW_N.size > 40) HW_N.clear(); HW_N.set(n, c); } return c; }
  function highwaysRaw(n){
    const out = [{ a: 'hub', b: 'uni', express: false, spur: true, pts: curve(NODE('hub'), NODE('uni'), 0.6, 1) }, { a: 'hub', b: 'ind', express: false, spur: true, pts: curve(NODE('hub'), NODE('ind'), 0.6, 2) }];
    for(let k = 0; k < n; k++){ const key = 'h' + k, c = HWY_CACHE.get(key); if(c){ out.push.apply(out, c); continue; } const es = [], d = district(k), par = parentOf(k), pn = NODE(par), g = gate(k, pn), pg = par === 'hub' ? pn : gate(+par.slice(1), g);
      es.push({ a: par, b: nid(k), express: false, pts: curve(pg, g, 1, 100 + k) });
      if(d.city && par !== 'hub'){ const g2 = gate(k, NODE('hub')); es.push({ a: 'hub', b: nid(k), express: true, pts: curve(NODE('hub'), g2, 1.4, 300 + k) }); }
      HWY_CACHE.set(key, es); out.push.apply(out, es); }
    return out;
  }
  const lenOf = pts => { let L = 0; for(let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  /* where something is: { x, y, node } → the node of the road network it joins */
  const placeOf = (x, y, node) => ({ x, y, node });
  function nodeOfHouse(g){ return nid(g.k); }
  /* shortest path (by hops, express roads included) over the highway graph → polyline of [x,y] from A to B (no stored data: recomputed from n) */
  const NP_CACHE = new Map();
  function nodePath(a, b, n){ const key = a + '>' + b + '>' + n, c = NP_CACHE.get(key); if(c) return c; const pts = [];
    if(a !== b){ const hw = highways(n), adj = {}; hw.forEach((e, i) => { (adj[e.a] = adj[e.a] || []).push([e.b, i, 1]); (adj[e.b] = adj[e.b] || []).push([e.a, i, -1]); });
      const prev = { [a]: null }, q = [a]; while(q.length){ const u = q.shift(); if(u === b) break; (adj[u] || []).forEach(([v, i, dir]) => { if(!(v in prev)){ prev[v] = [u, i, dir]; q.push(v); } }); }
      if(b in prev){ const chain = []; for(let c2 = b; prev[c2]; c2 = prev[c2][0]) chain.push(prev[c2]); chain.reverse(); chain.forEach(([u, i, dir]) => { const e = hw[i], seg = dir === 1 ? e.pts : e.pts.slice().reverse(); seg.forEach(p => pts.push(p)); }); } }
    if(NP_CACHE.size > 3000) NP_CACHE.clear(); NP_CACHE.set(key, pts); return pts; }
  function route(A, B, n){ const pts = [[A.x, A.y]]; nodePath(A.node, B.node, n).forEach(p => pts.push(p)); pts.push([B.x, B.y]); return pts; }
  function posAlong(pts, f){ const tot = lenOf(pts); if(f <= 0 || tot === 0) return { x: pts[0][0], y: pts[0][1], a: 0 }; if(f >= 1) return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], a: 0 }; let d = f * tot; for(let i = 1; i < pts.length; i++){ const sl = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if(d <= sl){ const u = sl ? d / sl : 0; return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) }; } d -= sl; } return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], a: 0 }; }

  /* ---------- where things are ---------- */
  const poiPlace = id => { const p = POIS[id], nodeOf = { uni: 'uni', lab: 'uni', ind: 'ind', plant: 'ind' }; return placeOf(p.x, p.y, nodeOf[id] || 'hub'); };
  const jitterOf = (uid, r) => { const a = h32(hash(uid), 77) / 4294967296 * 6.28; return [Math.cos(a) * r, Math.sin(a) * r]; };
  /* a player's spot for a `place` (home | arcade | bank | …): needs their home house id (or null) */
  function playerPlace(place, uid, homeId){
    if(place === 'lab' || place === 'factory'){ const c = plotCell(place === 'lab' ? 'l' : 'f', uid); return placeOf(c.x, c.y, place === 'lab' ? 'uni' : 'ind'); }
    if(place === 'home' || !POIS[place]){ if(homeId){ const g = house(+String(homeId).slice(1)); return placeOf(g.x, g.y, nodeOfHouse(g)); } const j = jitterOf(uid, 14); return placeOf(POIS.hub.x + j[0], POIS.hub.y + j[1], 'hub'); }
    const p = poiPlace(place), j = jitterOf(uid, 9); return placeOf(p.x + j[0], p.y + j[1], p.node);
  }

  /* ---------- the NPCs (bots): a pure timetable, so every browser sees the same dots without anything being stored ---------- */
  const SLOT = 120000, DAYSLOTS = 30, NIGHT = 7, TRIP = 0.8;                 // a world "day" is 30 slots of 2 real minutes; the first 7 are night (everyone is home)
  const WORK = { baker: 'shop', barista: 'shop', shopkeeper: 'shop', chef: 'shop', courier: 'agency', chemist: 'lab', 'lab tech': 'lab', teacher: 'uni', librarian: 'uni', nurse: 'hall', welder: 'ind', mechanic: 'ind', electrician: 'plant', architect: 'agency', trader: 'exchange',
    developer: 'exchange', gardener: 'park', fisher: 'park', landlord: 'agency', investor: 'exchange', artist: 'arcade', pilot: 'hall', surveyor: 'agency', inventor: 'lab' };
  const WHY = { home: 'going home', work: 'heading to work', shop: 'shopping', bank: 'visiting the bank', arcade: 'for a game at the arcade', exchange: 'checking the markets', agency: 'looking at property', park: 'a stroll in the park', visit: 'visiting a neighbour' };
  /* bot n at slot s → where it wants to be: { why, x, y, node, label } */
  function npcPlan(b, s, home, n){
    const hp = home ? placeOf(home.x, home.y, nodeOfHouse(home)) : placeOf(POIS.hub.x + 20, POIS.hub.y + 20, 'hub'), hl = home ? home.addr : 'Town Square';
    const phase = ((s % DAYSLOTS) + DAYSLOTS) % DAYSLOTS, r = f01(b.n, s * 7 + 3), wk = WORK[b.job] || 'shop', at = (id, why) => Object.assign(poiPlace(id), { why, label: POIS[id].n });
    if(phase < NIGHT) return Object.assign({}, hp, { why: 'home', label: hl });
    if(r < 0.34) return at(wk, 'work'); if(r < 0.44) return at('shop', 'shop'); if(r < 0.50) return at('bank', 'bank'); if(r < 0.50 + 0.10 * (1 - b.thrift) + 0.02) return at('arcade', 'arcade');
    if(r < 0.66 + (b.job === 'trader' || b.job === 'investor' ? 0.08 : 0)) return at('exchange', 'exchange'); if(r < 0.72) return at('agency', 'agency'); if(r < 0.80) return at('park', 'park');
    if(r < 0.88){ const hi = Math.floor(home ? home.i / PER : 0) * PER + (h32(b.n, s) % PER), g = house(hi); return Object.assign(placeOf(g.x, g.y, nodeOfHouse(g)), { why: 'visit', label: g.addr }); }
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
  return { PER, DISTRICTS, TYPES, h32, f01, hash, district, stations, house, districtCount, bounds, bot, JOBS, CORE, POIS, ZONES, APP_PLACE, PLACE_NAMES, WHY, SLOT, plotCell, roads, streetPt, highways, route, posAlong, lenOf, playerPlace, poiPlace, npcPlan, npcState };
});
