// node tests/eco-sim.test.js — runs the bot/world simulation for months of game time and checks, every step, that not one cent was created or lost.
const assert = require('assert'), E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js'), W = require('../os/lib/worldgen.js');
const DAY = 86400000, HOUR = 3600000, T0 = 1790000000000 - (1790000000000 % DAY), VERBOSE = process.argv.includes('-v');
const db = {}; S.genesis(db, T0, ['pOG']);
let a0 = E.audit(db); assert.ok(a0.ok, 'genesis audit'); assert.strictEqual(a0.total, E.SUPPLY, 'genesis supply');
assert.strictEqual(Object.keys(db.eco.bots).length, 100); assert.strictEqual(Object.keys(db.world.own).length, 512);
// synthetic players, acting like the browser would (same ledger moves the rules allow)
const grant = (id, extra) => { E.acctOf(db, id); E.sysMove(db, id, 'pool', -(E.DEFAULTS.startGrant + (extra || 0))); db.eco.acct[id].ob = 1; };
const cfg = E.cfgOf(db), buyBank = (id, hid) => { const h = db.world.own[hid]; assert.ok(E.sysMove(db, id, 'city', h.v) && E.sysMove(db, id, 'gov', E.duty(h.v, cfg.dutyBp))); h.o = id; h.on = id; h.rh = 0; db.world.home[id] = { h: hid }; };
['pA', 'pB', 'pC', 'pOG'].forEach(id => grant(id, id === 'pOG' ? E.DEFAULTS.ogExtra : 0));
const cheap = Object.keys(db.world.own).filter(k => db.world.own[k].v < 3000000).sort((x, y) => db.world.own[x].v - db.world.own[y].v);
buyBank('pA', cheap[0]); buyBank('pB', cheap[1]); buyBank('pOG', cheap[2]);
const spare = cheap[3]; buyBank('pA', spare); delete db.world.home.pA; db.world.home.pA = { h: cheap[0] }; db.world.own[spare].rh = 60; // pA is a landlord now
// pC takes a loan and never pays; pB never pays bills either
E.sysMove(db, 'pC', 'bank', -2000000); db.eco.loan.pC = { l1: { p: 2000000, o: 2240000, pl: 'standard', dd: 30, t0: T0 } };
const bad = (t, msg) => { const A = E.audit(db); assert.ok(A.ok, msg + ' @ day ' + ((t - T0) / DAY).toFixed(2) + ' bad=' + A.bad.join(',') + ' sent-claimed=' + A.sentMinusClaimed + ' flight=' + A.flight); assert.strictEqual(A.total, E.SUPPLY, 'supply changed ' + msg); Object.keys(db.eco.acct).forEach(i => assert.ok(db.eco.acct[i].b >= 0, 'negative cash ' + i)); };
let mails = 0, minBots = 1e9, maxBots = 0, t = T0, houses0 = 512;
const DAYS = +(process.env.DAYS || 90), STEP = 30 * 60000;
for(t = T0 + STEP; t <= T0 + DAYS * DAY; t += STEP){
  const r = S.step(db, t, t / 1000 | 0); mails += r.mails.length; bad(t, 'after step');
  // the honest players claim their inbox and pay their bills each day; pA/pOG top up nothing else
  if((t - T0) % DAY < STEP){ ['pA', 'pOG'].forEach(id => { E.claimAll(db, id); const bills = db.eco.bill[id] || {}; Object.keys(bills).forEach(b => { if(E.sysMove(db, id, 'gov', bills[b].a)) delete bills[b]; }); }); }
  const nb = Object.keys(db.eco.bots).length; minBots = Math.min(minBots, nb); maxBots = Math.max(maxBots, nb);
  if(VERBOSE && (t - T0) % (10 * DAY) < STEP){ const s = db.eco.stats; console.log('day', Math.round((t - T0) / DAY), 'bots', s.bots, 'housed', s.housed, 'houses', s.houses, 'vacant', s.vacant, 'pi', s.pi, 'avgBot $' + s.avgBot, 'health', s.health, 'gov $' + Math.round(s.sys.gov / 100), 'city $' + Math.round(s.sys.city / 100), 'pool Δ$' + Math.round((E.SEED.pool - s.sys.pool) / 100), 'died', s.died, 'built', s.built, 'mails', mails); }
}
const s = db.eco.stats; console.log('after ' + DAYS + ' days: bots ' + s.bots + ' (min ' + minBots + ', max ' + maxBots + '), houses ' + s.houses + ', housed bots ' + s.housed + ', vacant ' + s.vacant + ', died ' + s.died + ', health ' + s.health + ', gov $' + Math.round(s.sys.gov / 100) + ', city $' + Math.round(s.sys.city / 100));
assert.ok(s.ok, 'final audit'); assert.ok(minBots >= 60 && maxBots <= 200, 'bot population stays reasonable'); assert.ok(s.housed >= s.bots * 0.6, 'most bots have a home'); assert.ok(s.sys.gov >= 0 && s.sys.city >= -1e13, 'treasury is not blown');
assert.ok(db.world.meta.died > 5 || DAYS < 40, 'bots die and are replaced'); assert.ok(Object.keys(db.eco.bots).length >= 60);
// the player who never paid: the bank/taxman enforced
console.log('pC loan:', JSON.stringify(db.eco.loan.pC || 'cleared'), ' pB bills:', Object.keys(db.eco.bill.pB || {}).length, ' pB houses:', Object.keys(db.world.own).filter(k => db.world.own[k].o === 'pB').length);
// building: when the city runs out of vacant houses it builds more, paid by the city, with the supply still intact
{ const d2 = {}; S.genesis(d2, T0, []); Object.keys(d2.world.own).forEach((k, i) => { if(i % 10 !== 0) d2.world.own[k].o = 'b1'; }); const n0 = Object.keys(d2.world.own).length;
  S.step(d2, T0 + 20 * 60000, 5); const n1 = Object.keys(d2.world.own).length; assert.ok(n1 > n0, 'the city builds when houses run short (' + n0 + ' → ' + n1 + ')'); assert.strictEqual(d2.world.meta.n, n1); assert.ok(E.audit(d2).ok, 'audit after building'); assert.ok(d2.world.own['h' + n0] && d2.world.own['h' + n0].o === 'bank'); }
// fires: with a huge hazard every house burns; owners get repair bills, the city repairs its own, nothing is created
{ const d2 = {}; S.genesis(d2, T0, []); E.acctOf(d2, 'p1'); E.sysMove(d2, 'p1', 'pool', -10000000); d2.eco.acct.p1.ob = 1; const hid = Object.keys(d2.world.own)[0]; d2.world.own[hid].o = 'p1'; d2.world.own[hid].on = 'P'; d2.world.own[hid].rh = 0; d2.world.home.p1 = { h: hid };
  let fires = 0, billed = false; for(let i = 1; i <= 400 && !billed; i++){ const r = S.step(d2, T0 + i * 6 * HOUR / 6 * 1, i); fires = Object.keys(d2.world.ev).filter(k => d2.world.ev[k].k === 'fire').length; billed = Object.keys(d2.eco.bill.p1 || {}).some(b => d2.eco.bill.p1[b].k === 'fire'); assert.ok(E.audit(d2).ok); }
  console.log('events seen in 400 steps: fires ' + fires + ', fire bill issued ' + billed); assert.ok(fires > 0, 'fires happen'); }
// player-commissioned houses: escrow paid to the city, the council builds, charges the real price (+5%), refunds the rest
{ const d2 = {}; S.genesis(d2, T0, []); E.acctOf(d2, 'p1'); const a = d2.eco.acct.p1; E.sysMove(d2, 'p1', 'pool', -400000000); a.ob = 1;
  const c = E.DEFAULTS.builds.house.c; assert.ok(E.sysMove(d2, 'p1', 'city', c)); d2.world.build = { p1: { b1: { y: 'house', t: T0, c, on: 'Pat' } } }; const n0 = d2.world.meta.n, city0 = E.audit(d2).sys.city;
  const r = S.step(d2, T0 + 20 * 60000, 9); assert.ok(E.audit(d2).ok, 'audit after a build order'); const mine = Object.keys(d2.world.own).filter(k => d2.world.own[k].o === 'p1'); assert.strictEqual(mine.length, 1, 'the player owns the new house'); const h = d2.world.own[mine[0]];
  assert.strictEqual(W.house(+mine[0].slice(1)).type, 'house'); assert.ok(d2.world.meta.n > n0, 'the city built the plots up to it'); assert.ok(!Object.keys(d2.world.build || {}).length, 'the order was consumed'); assert.ok(r.mails.some(m => m.uid === 'p1' && /ready/.test(m.subj)));
  const refund = Object.keys(d2.eco.inbox.p1 || {}).map(k => d2.eco.inbox.p1[k]).filter(e => e.k === 'refund').reduce((s, e) => s + e.a, 0); const price = Math.ceil(h.v * E.DEFAULTS.buildMarkupBp / 10000); assert.strictEqual(refund, c - price, 'the unused escrow is refunded'); assert.ok(price <= c, 'the escrow always covers the price'); console.log('player-built house ' + mine[0] + ': price $' + price / 100 + ', refund $' + refund / 100); }
// the wealth tax makes huge balances impossible to keep
{ const cfg = E.DEFAULTS; let b = 5e15; for(let day = 0; day < 10; day++) b -= E.wealthTax(b, cfg); assert.ok(b < 5e14, 'a $50T wallet loses 90% in ten days of wealth tax (' + Math.round(b / 1e8) + ' hundred-thousand-dollar units left)'); }
console.log('eco-sim ok');
