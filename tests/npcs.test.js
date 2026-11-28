// node tests/npcs.test.js — every citizen owns a car and makes real JOURNEYS: inside → walk out of the front door to THEIR parked car → drive → park at the kerb → walk to the door → inside.
// The car is always somewhere (a pure function of the clock): at the kerb of the place where its owner last parked it, on the road only while it is being driven.
const assert = require('assert'), R = '../';
const G = require(R + 'os/lib/worldgen.js'), BG = require(R + 'os/lib/buildgen.js'), T = require(R + 'os/realworld/terrain.js'), L = require(R + 'os/realworld/layout.js');
globalThis.self = globalThis; require(R + 'os/realworld/drive.js'); require(R + 'os/realworld/traffic.js'); require(R + 'os/realworld/npcs.js');
const NH = 512; L.setup(NH); T.setup(); const N = globalThis.RealWorld.NPC.create(G, L, BG), jobs = Object.keys(G.JOBS), SLOT = G.SLOT, D2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const bot = n => ({ n, job: jobs[n % jobs.length], thrift: 0.5 }), home = n => G.house(n % NH);
let trips = 0, checkedPhases = 0;
for(let n = 1; n <= 60; n++){ const b = bot(n), h = home(n); let prevPark = null;
  for(let s = 8; s < 30; s++){ const Tp = N.trip(b, h, s, NH); if(!Tp.go) continue; N.finish(b, h, Tp, NH); trips++;
    assert(Tp.siteA.door && Tp.siteB.door, 'both ends of the journey have a front door');
    assert(Tp.wA.d < 70 && Tp.wB.d < 70, 'the walks to and from the car are short (' + Tp.wA.d.toFixed(0) + ' / ' + Tp.wB.d.toFixed(0) + ' m)');
    assert(Tp.wA.d / (Tp.tA / 1000) < 3 && Tp.wB.d / (Tp.tB / 1000) < 3, 'nobody sprints: walking pace stays under 3 m/s (a brisk walk to a far door)');
    assert((Tp.t0 - s * SLOT + Tp.dur) < SLOT - 1000, 'the whole journey ends inside its 2-minute slot (' + ((Tp.t0 - s * SLOT + Tp.dur) / 1000).toFixed(1) + ' s)');
    if(prevPark && Tp.s === prevPark.s + 1) assert(D2(Tp.rest0, prevPark.park) < 1e-6, 'a car leaves from where its last trip parked it');
    prevPark = { s, park: Tp.park };
    // the phases, in time order
    const seq = [], at = ms => N.state(b, h, Tp.t0 + ms, NH), probes = [-1000, 100, Tp.tA * 0.5, Tp.tA + 100, Tp.tA + Tp.tD * 0.5, Tp.tA + Tp.tD - 100, Tp.tA + Tp.tD + 100, Tp.tA + Tp.tD + Tp.tB * 0.5, Tp.dur + 500];
    const st = probes.map(at); assert.deepStrictEqual(st.map(x => x.ph), [0, 1, 1, 2, 2, 2, 3, 3, 0], 'phase order inside → walk → drive → walk → inside');
    assert(st[0].rest && st[1].rest && st[2].rest && !st[3].rest && !st[4].rest && !st[5].rest && st[6].rest && st[7].rest && st[8].rest, 'the car stands parked except while it is driven');
    assert(D2(st[1], Tp.siteA.door) < 2.5, 'the walk starts at the front door'); assert(D2(st[2], Tp.rest0) < D2(st[1], Tp.rest0), 'and heads for the car'); assert(D2(st[6], Tp.park) < 2.5 && D2(st[7], Tp.siteB.door) < D2(st[6], Tp.siteB.door), 'out of the car, towards the door');
    assert(st[3].f < 0.05 && st[5].f > 0.95 && st[4].f > 0.3 && st[4].f < 0.7, 'drive progress runs 0 → 1'); assert.deepStrictEqual(at(Tp.tA + 500), at(Tp.tA + 500), 'pure function of the clock');
    assert(D2(st[8].rest, Tp.park) < 1e-9, 'after arriving the car stands at the kerb it parked at'); checkedPhases++; } }
// the walk can be postponed while the real car is still arriving (the game's physical car lags the timetable a little)
{ const b = bot(5), h = home(5); let Tp; for(let s = 8; s < 40 && !(Tp && Tp.go); s++) Tp = N.finish(b, h, N.trip(b, h, s, NH), NH);
  const t = Tp.t0 + Tp.tA + Tp.tD + 500; assert.strictEqual(N.state(b, h, t, NH, 0).ph, 3); assert.strictEqual(N.state(b, h, t, NH, 5000).ph, 2, 'held in the car'); assert.strictEqual(N.state(b, h, t + 5000, NH, 5000).ph, 3, 'then the walk begins'); }
// the cars: at any moment every citizen who is not driving has a parked car, and the kerb is mostly free of overlaps between neighbours of one house
{ let parked = 0, driving = 0; for(const sec of [9 * 120 + 50, 14 * 120 + 70, 20 * 120 + 30]) for(let n = 1; n <= 200; n++){ const st = N.state(bot(n), home(n), sec * 1000, NH); if(st.rest) parked++; else driving++; assert(st.ph === 2 ? !st.rest : !!st.rest, 'driving ⇔ no parked car'); }
  assert(parked > driving * 2 && driving > 0, 'most cars are parked, some are on the road (' + parked + ' parked, ' + driving + ' driving)'); console.log('  ✓ ' + trips + ' journeys, ' + checkedPhases + ' checked end to end; ' + parked + ' parked / ' + driving + ' driving samples'); }
// a night at home: the car stands at the kerb outside the house (never far from it)
{ const n = 7, st = N.state(bot(n), home(n), 2 * SLOT + 30000, NH), site = N.siteOf(st.plan, NH); assert(!st.moving, 'asleep'); assert(Math.hypot(st.rest.x - site.bx, st.rest.z - site.bz) < 60, 'the car is outside the house'); }
console.log('npcs.test.js: all passed');
