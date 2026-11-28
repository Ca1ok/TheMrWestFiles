/* REALWORLD · npcs — where the townspeople are, in the 3D city. The ROSTER and TIMETABLE (who is where, when, and why) still come from WorldGen.npcPlan, shared with the map and the economy;
 * the ROUTES are computed here along the real streets of layout.js (so nobody drives through a house), as a pure function of the clock: every client sees the same people in the same place.
 *   const N = RealWorld.NPC.create(WorldGen, RWLayout, BuildGen);   N.state(bot, homeHouse, now, nHouses) → { x, z, yaw, ph, moving, why, dest, from, route, f, rest, eta, toX, toZ, plan, planFrom }
 *
 * EVERY CITIZEN OWNS A CAR, and it is always somewhere sensible. A trip from place A to place B (a new one every time the timetable's plan changes) is a JOURNEY in four phases:
 *   ph 0  inside a building (not drawn). The car is parked: at A's kerb until the trip starts, at B's kerb once it is over.
 *   ph 1  WALK: out of A's front door, across the pavement to the car parked at the kerb (the person is drawn; x, z, yaw = the person)
 *   ph 2  DRIVE: along the real streets (x, z, yaw = a point of the street centre line; `f` 0…1 = progress; the game puts a physical car on the lane). `route` is the drive polyline
 *   ph 3  WALK: out of the car, parked at B's kerb, to B's front door
 * `rest` = { x, z, yaw } where the citizen's car stands NOW (null while it is being driven). It is a pure function of the timetable — the car you see parked outside a house is the car of somebody who
 * is in that house, and the car outside the bank belongs to somebody in the bank. Where a car stands is where its owner last parked it (the arrival of the last trip, looked up to a day back), else the
 * kerb in front of the building; two cars never get the same slot on a kerb unless several people go to the same door (the game's parking pass then slides them apart).
 * Walking and driving both need real distances, so the timings are real: ~1.45 m/s on foot (a leg takes at most 20 s: a long walk to the door is a brisk one), ~14 m/s by car (a whole journey always ends inside its 2-minute slot). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {};
  const WALK = 1.45, WALK_MIN = 2.5, WALK_MAX = 20, DRIVE_MIN = 4, DRIVE_MAX = 58, JITTER = 20000, LOOKBACK = 40, STEP = 6.5, SLOTS = 13, SWING = 9, HL = 2.4;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function create(G, L, BG){
    const TC = new Map(), RC = new Map(), PK = new Map(); let addr = null, addrN = -1, poiName = null;
    const plaza = () => ({ kind: 'h', k: 1, t: 0 });
    const names = () => { if(!poiName){ poiName = {}; Object.keys(L.POI_BLOCK).forEach(id => { if(G.POIS[id]) poiName[G.POIS[id].n] = id; }); poiName['Central Park'] = 'park'; } return poiName; };
    const houseOf = (lab, nh) => { if(addrN !== nh){ addr = new Map(); for(let i = 0; i < nh; i++) addr.set(G.house(i).addr, i); addrN = nh; } return addr.get(lab); };
    /* the building a plan means: its street point, where its front door is, and the middle of the building (so a car knows which kerb is "its" side) → { street, door: {x, z, yaw (facing out)} | null, bx, bz } */
    function siteOf(plan, nh){
      const lab = plan && plan.label; if(!lab || lab === 'Town Square') return { street: plaza(), door: null };
      const id = names()[lab];
      if(id){ const p = L.poi(id); if(!p) return { street: plaza(), door: null }; const S = BG && BG.landmark ? BG.landmark(id) : null, fr = p.front || [0, 1], d = (S ? S.d / 2 : 8) + 0.7;
        return { street: p.street, door: { x: p.x + fr[0] * d, z: p.z + fr[1] * d, yaw: Math.atan2(fr[0], -fr[1]) }, bx: p.x, bz: p.z }; }
      const hi = houseOf(lab, nh); if(hi !== undefined){ const h = L.house(hi); if(h && h.g){ const g = h.g, sd = g.side > 0 ? 1 : -1, f0 = -sd * Math.sin(g.ang), f1 = sd * Math.cos(g.ang), d = g.dp / 2 + 0.7;
        return { street: h.street, door: { x: g.x + f0 * d, z: g.y + f1 * d, yaw: Math.atan2(f0, -f1) }, bx: g.x, bz: g.y }; } }
      return { street: plaza(), door: null };
    }
    const placeOf = (plan, nh) => siteOf(plan, nh).street;
    function routeFor(from, to, nh){
      const key = (from && from.label) + '>' + (to && to.label) + '|' + nh; let R = RC.get(key); if(R) return R;
      const lat = L.route(placeOf(from, nh), placeOf(to, nh)), pts = []; for(let i = 0; i < lat.length - 1; i++){ const a = lat[i], b = lat[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8)); for(let q = 0; q < n; q++) pts.push(L.warp(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n)); } pts.push(L.warp(lat[lat.length - 1][0], lat[lat.length - 1][1]));
      const cum = [0]; for(let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); R = { pts, cum, len: cum[cum.length - 1] }; if(RC.size > 3000) RC.clear(); RC.set(key, R); return R;
    }

    /* ---------------- geometry of a kerb ---------------- */
    const laneOff = n => { const T = RW.Traffic; if(T && T.laneOffOf) return T.laneOffOf(n); return 1.6; };
    const hwOf = street => { try{ return L.hwOf(street.k); }catch(e){ return 4; } };
    const slideOf = (n, label) => (G.h32(n, G.hash(label || '') % 100003 + 17) % SLOTS - (SLOTS >> 1)) * STEP;     // 13 places along the kerb, a car length and a bit apart
    function streetXZ(st){ const u = st.kind === 'h' ? st.t : L.lineU(st.k), v = st.kind === 'h' ? L.lineV(st.k) : st.t, w = L.warp(u, v); return w; }
    function streetDir(st){ const u = st.kind === 'h' ? st.t : L.lineU(st.k), v = st.kind === 'h' ? L.lineV(st.k) : st.t, a = L.warp(u, v), b = st.kind === 'h' ? L.warp(u + 3, v) : L.warp(u, v + 3), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    /* a pose parked at kerb distance `lat` to the RIGHT of heading h, `slide` m further along it, at the street-centre point c */
    const parkPose = (c, h, lat, slide) => ({ x: c[0] + (-h[1]) * lat + h[0] * slide, z: c[1] + h[0] * lat + h[1] * slide, yaw: Math.atan2(h[0], -h[1]) });
    /* the car of citizen n when it has never been seen to park: at the kerb in front of the building, the building on the car's right (it stands against the pavement of its own side of the street) */
    function canonical(site, n, label){
      const c = streetXZ(site.street), ax = streetDir(site.street), hw = hwOf(site.street); let sg = 1;
      if(site.bx !== undefined){ const nx = site.bx - c[0], nz = site.bz - c[1]; sg = (nx * -ax[1] + nz * ax[0]) >= 0 ? 1 : -1; }
      return parkPose(c, [ax[0] * sg, ax[1] * sg], hw - 1.5, slideOf(n, label));
    }

    /* ---------------- trips ---------------- */
    const slotOf = now => Math.floor(now / G.SLOT);
    function plans(b, home, s, nh){ const nd = G.districtCount(nh); return [G.npcPlan(b, s - 1, home, nd), G.npcPlan(b, s, home, nd)]; }
    /* the trip that ARRIVES in slot s (previous plan → this plan), cached per citizen & slot. This part is cheap (route + where the car parks at the end); the departure part (where the car was, the
     * walking legs, the timings) is finished by `finish` only for the trip that is running now. */
    function trip(b, home, s, nh){
      const key = b.n + '|' + s + '|' + nh + '|' + (home ? home.i : -1); let T = TC.get(key); if(T) return T;
      const [from, to] = plans(b, home, s, nh), R = routeFor(from, to, nh), sA = siteOf(from, nh), sB = siteOf(to, nh), go = R.len > 3 && from.label !== to.label;
      T = { s, from, to, R, go, t0: s * G.SLOT + (G.h32(b.n, s) % JITTER), siteA: sA, siteB: sB, done: false };
      if(go){
        const pts = R.pts, m = pts.length; let k = m - 2; while(k > 0 && Math.hypot(pts[m - 1][0] - pts[k][0], pts[m - 1][1] - pts[k][1]) < 3) k--;
        let dx = pts[m - 1][0] - pts[k][0], dz = pts[m - 1][1] - pts[k][1]; const dl0 = Math.hypot(dx, dz) || 1; dx /= dl0; dz /= dl0;
        let q = m - 1; while(q > 0 && Math.abs((pts[q][0] - pts[q - 1][0]) * dz - (pts[q][1] - pts[q - 1][1]) * dx) < 0.5) q--; const tailLen = Math.hypot(pts[m - 1][0] - pts[q][0], pts[m - 1][1] - pts[q][1]);
        // ARRIVAL: the car parks at the kerb of the street it arrives on, on its right, facing the way it came, in its own slot along the kerb
        const lat = hwOf(sB.street) - 1.5, slide = clamp(slideOf(b.n, to.label), -Math.max(0, tailLen - 16), 39), b0 = pts[m - 1], d = [dx, dz], rt = [-dz, dx], dl = Math.max(0, lat - laneOff(b.n)), at = x => [b0[0] + dx * x, b0[1] + dz * x];
        T.park = parkPose(b0, d, lat, slide); T.arr = { d, slide, dl, rt, at, lat };
      }
      if(TC.size > 6000) TC.clear(); TC.set(key, T); return T;
    }
    /* the rest of a trip: the drive polyline (from the kerb the car stands at to the kerb it parks at, the last stretch swinging in to the pavement), the two walks and the timings */
    function finish(b, home, T, nh){
      if(T.done || !T.go) return T; T.done = true;
      const rest0 = carAt(b, home, T.s - 1, nh, T.from), A = T.arr, pts = T.R.pts, dxy = A.d, e0 = A.at(A.slide - 0.5 - SWING), E1 = A.at(A.slide - 0.5), E2 = A.at(A.slide + HL + 0.6);
      E1[0] += A.rt[0] * A.dl; E1[1] += A.rt[1] * A.dl; E2[0] += A.rt[0] * A.dl; E2[1] += A.rt[1] * A.dl;
      const keep = []; for(const p of pts){ if((p[0] - e0[0]) * dxy[0] + (p[1] - e0[1]) * dxy[1] < -1) keep.push(p); } keep.push(e0, E1, E2);
      // START: the street-centre point abeam of the parked car
      const lA = hwOf(T.siteA.street) - 1.5, c0 = [rest0.x - Math.cos(rest0.yaw) * lA, rest0.z - Math.sin(rest0.yaw) * lA];
      const f0 = [keep[1][0] - keep[0][0], keep[1][1] - keep[0][1]], fl = Math.hypot(f0[0], f0[1]) || 1; let first = 0; while(first < keep.length - 2 && ((keep[first][0] - c0[0]) * f0[0] + (keep[first][1] - c0[1]) * f0[1]) / fl < 0.5) first++;
      const dp = [c0].concat(keep.slice(first)), cum = [0]; for(let i = 1; i < dp.length; i++) cum.push(cum[i - 1] + Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1]));
      // the walks: front door ↔ the car, stopping at its body on the pavement side, at a real walking pace
      const leg = (door, car) => { if(!door) return null; const ux = door.x - car.x, uz = door.z - car.z, ul = Math.hypot(ux, uz) || 1, px = car.x + ux / ul * 1.5, pz = car.z + uz / ul * 1.5, d = Math.hypot(door.x - px, door.z - pz); return { dx: door.x, dz: door.z, px, pz, d, t: clamp(d / WALK, WALK_MIN, WALK_MAX) * 1000 }; };
      T.rest0 = rest0; T.route = dp; T.dp = { pts: dp, cum, len: cum[cum.length - 1] }; T.wA = leg(T.siteA.door, rest0); T.wB = leg(T.siteB.door, T.park);
      T.tA = T.wA ? T.wA.t : 0; T.tD = clamp(T.R.len / 14, DRIVE_MIN, DRIVE_MAX) * 1000; T.tB = T.wB ? T.wB.t : 0; T.dur = T.tA + T.tD + T.tB; return T;
    }
    /* where citizen n's car stands once every trip up to slot `upto` has been made (cached): the arrival of the last trip, a day back at most, else the kerb outside the plan's building */
    function carAt(b, home, upto, nh, plan){
      const key = b.n + '|' + upto + '|' + nh + '|' + (home ? home.i : -1); let P = PK.get(key); if(P) return P;
      for(let k = upto; k > upto - LOOKBACK && !P; k--){ const T = trip(b, home, k, nh); if(T.go) P = T.park; }
      if(!P){ const pl = plan || plans(b, home, upto, nh)[1]; P = canonical(siteOf(pl, nh), b.n, pl.label); }
      if(PK.size > 8000) PK.clear(); PK.set(key, P); return P;
    }
    function posAlong(R, d){ const pts = R.pts, cum = R.cum; d = clamp(d, 0, R.len); let i = 1; while(i < pts.length - 1 && cum[i] < d) i++; const a = pts[i - 1], c = pts[i], seg = Math.max(0.001, cum[i] - cum[i - 1] || 1), t = clamp((d - (cum[i - 1] || 0)) / seg, 0, 1); return { x: a[0] + (c[0] - a[0]) * t, z: a[1] + (c[1] - a[1]) * t, yaw: Math.atan2(c[0] - a[0], -(c[1] - a[1])) }; }

    /* ---------------- the state of citizen b at time `now` ---------------- */
    function state(b, home, now, nh, lag){
      const s = slotOf(now), T = finish(b, home, trip(b, home, s, nh), nh); let t = now - T.t0;
      const out = { x: 0, z: 0, yaw: 0, ph: 0, moving: false, why: T.to.why, dest: T.to.label, from: T.from.label, route: T.route || T.R.pts, f: 0, rest: null, tArr: 0, eta: 0, toX: 0, toZ: 0, plan: T.to, planFrom: T.from };
      if(!T.go){ const P = carAt(b, home, s, nh, T.to); out.rest = P; const dp = T.R.pts[T.R.pts.length - 1] || [P.x, P.z]; out.x = P.x; out.z = P.z; out.yaw = P.yaw; out.toX = dp[0]; out.toZ = dp[1]; out.route = T.R.pts; return out; }
      out.tArr = T.t0 + T.tA + T.tD; if(lag > 0 && t > T.tA + T.tD){ t -= lag; if(t <= T.tA + T.tD) t = T.tA + T.tD - 1; }   // the car is still arriving: whoever is in it steps out later
      const last = T.dp.pts[T.dp.pts.length - 1]; out.toX = last[0]; out.toZ = last[1]; out.eta = Math.max(0, T.t0 + T.dur - now);
      if(t <= 0){ out.rest = T.rest0; out.x = T.rest0.x; out.z = T.rest0.z; out.yaw = T.rest0.yaw; return out; }
      if(t < T.tA){ const w = T.wA, u = t / T.tA; out.ph = 1; out.moving = true; out.rest = T.rest0; out.x = w.dx + (w.px - w.dx) * u; out.z = w.dz + (w.pz - w.dz) * u; out.yaw = Math.atan2(w.px - w.dx, -(w.pz - w.dz)); return out; }
      if(t < T.tA + T.tD){ const f = (t - T.tA) / T.tD, p = posAlong(T.dp, f * T.dp.len); out.ph = 2; out.moving = true; out.f = f; out.x = p.x; out.z = p.z; out.yaw = p.yaw; return out; }
      if(t < T.dur){ const w = T.wB, u = (t - T.tA - T.tD) / T.tB; out.ph = 3; out.moving = true; out.f = 1; out.rest = T.park; out.x = w.px + (w.dx - w.px) * u; out.z = w.pz + (w.dz - w.pz) * u; out.yaw = Math.atan2(w.dx - w.px, -(w.dz - w.pz)); return out; }
      out.f = 1; out.rest = T.park; out.x = T.park.x; out.z = T.park.z; out.yaw = T.park.yaw; return out;
    }
    return { state, routeFor, placeOf, siteOf, carAt, trip, finish, canonical };
  }
  RW.NPC = { create };
})(typeof self !== 'undefined' ? self : this);
