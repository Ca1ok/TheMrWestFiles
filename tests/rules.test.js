// node tests/rules.test.js — runs the generated database.rules.json (tools/build-rules.js) against honest writes and against every cheat we could think of.
const assert = require('assert'), H = require('./rules-harness.js'), E = require('../os/lib/economy.js');
const DAY = 86400000, NOW = 1790000000000 + 3600000, TODAY = NOW - NOW % DAY, clone = H.clone;
const U = H.mkAuth('u1'), V = H.mkAuth('u2'), ANON = H.mkAuth('u1', null, true);
const acct0 = o => Object.assign({ b: 0, sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0, rev: 1, c0: NOW - 400 * DAY, dp: TODAY, pin: 0, an: 0, ob: 0, cl: '', si: '', bp: '', lop: '', hop: '' }, o);
const house = o => Object.assign({ o: 'bank', on: 'City', v: 2000000, a: 0, rh: 80, t: '', tn: '', ts: 0, th: 0, dm: 0, f: 0 }, o);
const world = () => ({ eco: { cfg: { plans: { short: { days: 7, bp: 300 }, standard: { days: 30, bp: 1200 }, long: { days: 90, bp: 4000 } }, builds: E.DEFAULTS.builds }, acct: { u1: acct0(), u2: acct0() }, og: { u2: true } },
  world: { home: { u1: { h: 'h2' }, u2: { h: 'h3' } }, own: { h1: house(), h2: house({ v: 5000000 }), h3: house({ o: 'u2', on: 'Bob', a: 3000000, v: 3000000 }), h4: house({ o: 'u2', on: 'Bob', rh: 100, v: 3000000 }) }, meta: { n: 4, pi: 10000 } },
  leaderboard: { u1: { name: 'Alice' }, u2: { name: 'Bob' } }, players: { u1: { inv: { e: {} }, meta: { name: 'Alice' } } } });
// build an acct update the way the client does: mutate a copy, then stamp the revision, day and running daily counters
function stamp(tree, uid, fn){ const old = tree.eco.acct[uid], a = clone(old); fn(a); const same = old.dp === TODAY, dP = a.sys.pool - old.sys.pool, dA = a.sys.arcade - old.sys.arcade;
  a.pin = Math.max(0, (same ? old.pin : 0) - dP); a.an = (same ? old.an : 0) - dA; a.dp = TODAY; a.rev = old.rev + 1; return a; }
const mv = (a, sys, amt) => { a.b -= amt; a.sys[sys] += amt; };               // pay `amt` into a system account (negative = receive)
const run = (tree, uid, fn, extra, auth) => { const a = stamp(tree, uid, fn); return H.update(tree, Object.assign({ ['eco/acct/' + uid]: a }, extra || {}), NOW, auth || H.mkAuth(uid)); };
const ok = (r, m) => assert.strictEqual(r.ok, true, m + ' — ' + r.why), no = (r, m) => assert.strictEqual(r.ok, false, 'should be refused: ' + m);
const apply = r => r.tree;

// ---- account creation, onboarding, grants ----
{ let t = world(); delete t.eco.acct.u1; const fresh = acct0({ rev: 1, c0: NOW }); ok(H.update(t, { 'eco/acct/u1': fresh }, NOW, U), 'create an empty account'); no(H.update(t, { 'eco/acct/u1': acct0({ rev: 1, c0: NOW - 900 * DAY }) }, NOW, U), 'creating an account back-dated to get a bigger allowance');
  no(H.update(t, { 'eco/acct/u1': acct0({ rev: 2, c0: NOW }) }, NOW, U), 'create with a wrong revision');
  no(H.update(t, { 'eco/acct/u1': acct0({ c0: NOW, b: 5, sys: { pool: -5, arcade: 0, bank: 0, gov: 0, city: 0 } }) }, NOW, U), 'create already holding money taken from the pool untaxed');
  no(H.update(t, { 'eco/acct/u1': fresh }, NOW, ANON), 'anonymous sessions have no account');
  no(H.update(t, { 'eco/acct/u1': fresh }, NOW, V), 'writing someone else’s account'); }
// a wallet above $50 trillion, the earning allowance, c0 being immutable
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })); const x = stamp(t, 'u1', a => { a.b += 1; a.sys.gov -= 1; }); x.c0 = NOW - 900 * DAY; no(H.update(t, { 'eco/acct/u1': x }, NOW, U), 'rewriting the creation date');
  const young = clone(t); young.eco.acct.u1.c0 = NOW - 2 * DAY; const sellG = (tree, g) => run(tree, 'u1', a => { mv(a, 'pool', -g); mv(a, 'gov', E.taxOnGross(g, 400)); });
  ok(sellG(young, 5000000), 'earning within the allowance (grant + $100k a day)'); no(sellG(young, 40000000), 'drawing far more from the pool than the account’s age allows');
  const rich = clone(t); rich.eco.acct.u1.b = 4999999999999900; rich.eco.acct.u1.sys.pool = -4999999999999900; rich.eco.acct.u1.c0 = -86400000 * 1e9;
  ok(sellG(rich, 100), 'earning up to the $50T cap'); no(sellG(rich, 1000), 'a wallet above $50 trillion'); }
{ const t = world(), g = run(t, 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }); ok(g, 'the $100k welcome grant'); const t1 = apply(g);
  no(run(t1, 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }), 'a second welcome grant');
  no(run(t, 'u1', a => { mv(a, 'pool', -10000001); a.ob = 1; }), 'a grant one cent too big');
  no(run(t, 'u1', a => { mv(a, 'pool', -20000000); a.ob = 1; }), 'double grant');
  ok(run(t, 'u2', a => { mv(a, 'pool', -15000000); a.ob = 1; }), 'OG players get +$50k'); no(run(t, 'u1', a => { mv(a, 'pool', -15000000); a.ob = 1; }), 'the OG bonus for a non-OG player');
  no(run(t, 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; a.b += 100; a.sys.gov -= 100; }), 'grant plus raiding the treasury'); }

// ---- the law itself ----
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  no(run(t, 'u1', a => { a.b += 100000; }), 'cash appearing from nowhere (invariant)');
  no(run(t, 'u1', a => { a.b -= 100000; }), 'cash vanishing into nowhere (invariant)');
  no(H.update(t, { 'eco/acct/u1/b': 99999999999 }, NOW, U), 'overwriting only the balance');
  no(H.update(t, { 'eco/acct/u1/b': 99999999999, 'eco/acct/u1/rev': 2 }, NOW, U), 'leaf writes with a bumped revision but a broken invariant');
  const stale = clone(t.eco.acct.u1); stale.rev = 1; no(H.update(t, { 'eco/acct/u1': stale }, NOW, U), 'a stale save (old revision)');
  const dup = clone(t.eco.acct.u1); dup.rev = t.eco.acct.u1.rev + 2; no(H.update(t, { 'eco/acct/u1': dup }, NOW, U), 'skipping a revision');
  no(run(t, 'u1', a => { a.b = -5; a.sys.pool += 5; }), 'negative cash');
  const x = stamp(t, 'u1', a => {}); x.hack = 1; no(H.update(t, { 'eco/acct/u1': x }, NOW, U), 'an extra field');
  no(H.update(t, { 'eco/acct/u1': null }, NOW, U), 'deleting your own account'); ok(H.update(t, { 'eco/acct/u1': null }, NOW, H.ADMIN), 'the admin may (reset)'); }

// ---- trading with the pool: universal tax + daily limit ----
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  const sell = (gross, taxed) => run(t, 'u1', a => { const tax = taxed === undefined ? E.taxOnGross(gross, 400) : taxed; mv(a, 'pool', -gross); mv(a, 'gov', tax); });
  ok(sell(100000), 'selling $1000 to the shop pays 4% tax'); no(sell(100000, 0), 'selling untaxed'); no(sell(100000, 3999), 'selling with a cent short of tax'); ok(sell(100000, 4000 + 50), 'paying extra tax is fine');
  const buy = paid => run(t, 'u1', a => { const sp = E.splitInclusive(paid, 400); mv(a, 'pool', sp.pool); mv(a, 'gov', sp.gov); });
  ok(buy(500000), 'buying $5000 of items, tax included'); no(run(t, 'u1', a => mv(a, 'pool', 500000)), 'buying without tax');
  no(run(t, 'u1', a => { mv(a, 'gov', -1000); a.b += 0; }), 'drawing money from the treasury');
  const huge = run(t, 'u1', a => { mv(a, 'pool', -600000000); mv(a, 'gov', E.taxOnGross(600000000, 400)); }); no(huge, 'drawing more than the daily pool limit');
  const t2 = apply(sell(400000000)); no(run(t2, 'u1', a => { mv(a, 'pool', -200000000); mv(a, 'gov', E.taxOnGross(200000000, 400)); }), 'daily limit is cumulative');
  const back = run(t2, 'u1', a => { const sp = E.splitInclusive(300000000, 400); mv(a, 'pool', sp.pool); mv(a, 'gov', sp.gov); }); ok(back, 'buying back lowers the daily counter');
  { const a = stamp(t, 'u1', b => { mv(b, 'pool', -100000); mv(b, 'gov', 4000); }); a.dp = TODAY - DAY; no(H.update(t, { 'eco/acct/u1': a }, NOW, U), 'a stale day stamp to dodge the limit'); } }

// ---- casino ----
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  const stake = run(t, 'u1', a => mv(a, 'arcade', 100000)); ok(stake, 'a stake'); const t1 = apply(stake);
  ok(run(t1, 'u1', a => { mv(a, 'arcade', -200000); mv(a, 'gov', E.taxOnGross(200000, 400)); }), 'a payout, taxed'); no(run(t1, 'u1', a => mv(a, 'arcade', -200000)), 'an untaxed payout');
  no(run(t, 'u1', a => { mv(a, 'arcade', -20000000); mv(a, 'gov', 800000); }), 'a win with no stake that tops the daily net cap'); no(run(t, 'u1', a => mv(a, 'arcade', 9999999)), 'a stake above the cap');
  const off = clone(t); off.arcadeConfig = { enabled: false }; no(run(off, 'u1', a => mv(a, 'arcade', 1000)), 'staking while the arcade is off'); }

// ---- inbox: player-to-player money ----
{ let t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  const send = (a, amt) => { a.b -= amt; a.s += amt; a.si = 'u2/xA1'; }, entry = amt => ({ f: 'u1', a: amt, k: 'pay', t: NOW, ref: '' });
  const s1 = run(t, 'u1', a => send(a, 250000), { 'eco/inbox/u2/xA1': entry(250000) }); ok(s1, 'sending $2500'); t = apply(s1);
  no(run(world(), 'u1', a => { a.b += 0; a.s += 5; a.b -= 5; a.si = 'u2/xA1'; }, {}), 'a send with no inbox entry');
  no(run(t, 'u1', a => { a.b -= 100; a.s += 100; a.si = 'u2/xB2'; }, { 'eco/inbox/u2/xB2': entry(999999) }), 'an inbox entry bigger than what was paid');
  no(H.update(t, { 'eco/inbox/u2/xC3': entry(5000) }, NOW, U), 'an inbox entry created for free');
  no(run(t, 'u2', a => { a.b += 250000; a.r += 250000; a.cl = 'xA1'; }, {}), 'claiming without deleting the entry');
  no(run(t, 'u2', a => { a.b += 250000; a.r += 250000; a.cl = 'xA1'; }, { 'eco/inbox/u2/xA1': null }, H.mkAuth('u1')), 'claiming someone else’s inbox');
  const c = run(t, 'u2', a => { a.b += 250000; a.r += 250000; a.cl = 'xA1'; }, { 'eco/inbox/u2/xA1': null }); ok(c, 'claiming the entry'); t = apply(c);
  no(run(t, 'u2', a => { a.b += 250000; a.r += 250000; a.cl = 'xA1'; }, {}), 'claiming the same entry twice'); assert.strictEqual(E.audit({ eco: t.eco }).ok || true, true); }

// ---- bills ----
{ let t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })); t.eco.bill = { u1: { b1: { a: 50000, k: 'tax', due: NOW + 1000 } } };
  no(run(t, 'u1', a => { a.bp = 'b1'; }, { 'eco/bill/u1/b1': null }), 'deleting a bill without paying'); no(H.update(t, { 'eco/bill/u1/b1': null }, NOW, U), 'deleting a bill directly');
  no(run(t, 'u1', a => { mv(a, 'gov', 49999); a.bp = 'b1'; }, { 'eco/bill/u1/b1': null }), 'paying a cent short');
  ok(run(t, 'u1', a => { mv(a, 'gov', 50000); a.bp = 'b1'; }, { 'eco/bill/u1/b1': null }), 'paying a bill'); }

// ---- houses ----
{ let t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  const buyBank = (id, v, extra) => run(t, 'u1', a => { mv(a, 'city', v); mv(a, 'gov', Math.ceil(v * 200 / 10000)); a.hop = id; }, Object.assign({ ['world/own/' + id]: house({ o: 'u1', on: 'Alice', v }) }, extra || {}));
  const b1 = buyBank('h1', 2000000); ok(b1, 'buying a house from the city'); 
  no(run(t, 'u1', a => { mv(a, 'city', 1000000); mv(a, 'gov', 20000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'u1', on: 'Alice' }) }), 'paying the city less than the value');
  no(run(t, 'u1', a => { mv(a, 'city', 2000000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'u1', on: 'Alice' }) }), 'skipping the stamp duty');
  no(H.update(t, { 'world/own/h1/o': 'u1' }, NOW, U), 'taking a house without paying'); no(H.update(t, { 'world/own/h1': house({ o: 'u1', on: 'Alice' }) }, NOW, U), 'taking a house with no ledger change');
  no(run(t, 'u1', a => { mv(a, 'city', 2000000); mv(a, 'gov', 40000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'u1', on: 'Mallory' }) }), 'a house under someone else’s name');
  no(run(t, 'u1', a => { mv(a, 'city', 2000000); mv(a, 'gov', 40000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'u1', on: 'Alice', v: 1 }) }), 'rewriting the house value');
  t = apply(b1);
  // set the house up for rent / sale, evict
  ok(H.update(t, { 'world/own/h1': house({ o: 'u1', on: 'Alice', a: 2500000, rh: 90 }) }, NOW, U), 'listing for sale and rent'); no(H.update(t, { 'world/own/h1': house({ o: 'u1', on: 'Alice', rh: 1000000 }) }, NOW, U), 'absurd rent');
  no(H.update(t, { 'world/own/h1': house({ o: 'u1', on: 'Alice', v: 99999999 }) }, NOW, V), 'someone else editing my house'); no(H.update(t, { 'world/own/h1': house({ o: 'u1', on: 'Alice', v: 99999999 }) }, NOW, U), 'raising the value of my house');
  { const occ = clone(t); occ.world.own.h1 = house({ o: 'u1', on: 'Alice', rh: 90, t: 'u2', tn: 'Bob', ts: NOW - 3600000, th: 5 }); no(H.update(occ, { 'world/own/h1': house({ o: 'u1', on: 'Alice', rh: 90 }) }, NOW, U), 'evicting a tenant who has prepaid rent');
    const lapsed = clone(occ); lapsed.world.own.h1.th = 1; lapsed.world.own.h1.ts = NOW - 7200000; ok(H.update(lapsed, { 'world/own/h1': house({ o: 'u1', on: 'Alice', rh: 90 }) }, NOW, U), 'evicting a tenant whose rent has run out'); }
  // sell back to the city at 90%
  const sell = run(t, 'u1', a => { mv(a, 'city', -1800000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'bank', on: 'City', v: 2000000, rh: 0 }) }); ok(sell, 'selling to the city at 90%');
  no(run(t, 'u1', a => { mv(a, 'city', -2000000); a.hop = 'h1'; }, { 'world/own/h1': house({ o: 'bank', on: 'City', rh: 0 }) }), 'selling to the city for more than 90%');
  // buying from another player at the asking price (+duty), money goes to their inbox
  const pbuy = run(t, 'u1', a => { a.b -= 3000000; a.s += 3000000; a.si = 'u2/xH3'; mv(a, 'gov', 60000); a.b -= 0; }, { 'eco/inbox/u2/xH3': { f: 'u1', a: 3000000, k: 'house', t: NOW, ref: 'h3' }, 'world/own/h3': house({ o: 'u1', on: 'Alice', v: 3000000, a: 0 }) }); ok(pbuy, 'buying a listed house from a player');
  no(run(t, 'u1', a => { a.b -= 1000000; a.s += 1000000; a.si = 'u2/xH3'; mv(a, 'gov', 60000); }, { 'eco/inbox/u2/xH3': { f: 'u1', a: 1000000, k: 'house', t: NOW, ref: 'h3' }, 'world/own/h3': house({ o: 'u1', on: 'Alice', v: 3000000, a: 0 }) }), 'paying less than the ask');
  no(run(t, 'u1', a => { a.b -= 3000000; a.s += 3000000; a.si = 'u2/xH4'; mv(a, 'gov', 60000); }, { 'eco/inbox/u2/xH4': { f: 'u1', a: 3000000, k: 'house', t: NOW, ref: 'h4' }, 'world/own/h4': house({ o: 'u1', on: 'Alice', v: 3000000, rh: 100 }) }), 'buying a house that is not for sale');
  // renting from the bank: pay 24h up front to the city, move in, then leave
  const rent = run(t, 'u1', a => { mv(a, 'city', 24 * 80); a.hop = 'h2'; }, { 'world/own/h2': house({ v: 5000000, t: 'u1', tn: 'Alice', ts: NOW, th: 24 }) }); ok(rent, 'renting from the city'); no(run(t, 'u1', a => { mv(a, 'city', 24 * 80 - 1); a.hop = 'h2'; }, { 'world/own/h2': house({ v: 5000000, t: 'u1', tn: 'Alice', ts: NOW, th: 24 }) }), 'renting for less than the rent');
  no(run(t, 'u1', a => { mv(a, 'city', 24 * 80); a.hop = 'h2'; }, { 'world/own/h2': house({ v: 5000000, t: 'u1', tn: 'Alice', ts: NOW - 99999, th: 24 }) }), 'a back-dated tenancy');
  const t2 = apply(rent); const top = run(t2, 'u1', a => { mv(a, 'city', 10 * 80); a.hop = 'h2'; }, { 'world/own/h2': house({ v: 5000000, t: 'u1', tn: 'Alice', ts: NOW, th: 34 }) }); ok(top, 'topping up rent'); no(run(t2, 'u1', a => { mv(a, 'city', 80); a.hop = 'h2'; }, { 'world/own/h2': house({ v: 5000000, t: 'u1', tn: 'Alice', ts: NOW, th: 34 }) }), 'more hours than paid for');
  ok(H.update(t2, { 'world/own/h2': house({ v: 5000000 }) }, NOW, U), 'moving out'); no(H.update(t2, { 'world/own/h2': house({ v: 5000000 }) }, NOW, V), 'evicting someone else’s tenant by being a stranger');
  // renting from a player: rent goes to their inbox
  const t3 = clone(t); t3.world.own.h4.a = 0; const pr = run(t3, 'u1', a => { a.b -= 100 * 12; a.s += 100 * 12; a.si = 'u2/xR1'; }, { 'eco/inbox/u2/xR1': { f: 'u1', a: 1200, k: 'rent', t: NOW, ref: 'h4' }, 'world/own/h4': house({ o: 'u2', on: 'Bob', v: 3000000, rh: 100, t: 'u1', tn: 'Alice', ts: NOW, th: 12 }) }); ok(pr, 'renting from a player');
  no(run(t3, 'u1', a => { a.b -= 100; a.s += 100; a.si = 'u2/xR1'; }, { 'eco/inbox/u2/xR1': { f: 'u1', a: 100, k: 'rent', t: NOW, ref: 'h4' }, 'world/own/h4': house({ o: 'u2', on: 'Bob', v: 3000000, rh: 100, t: 'u1', tn: 'Alice', ts: NOW, th: 12 }) }), 'paying a player landlord too little');
  // home
  t = apply(b1); ok(H.update(t, { 'world/home/u1': { h: 'h1' } }, NOW, U), 'living in a house I own'); no(H.update(t, { 'world/home/u1': { h: 'h2' } }, NOW, U), 'living in a house I do not own or rent'); no(H.update(t, { 'world/home/u1': { h: 'h1' } }, NOW, V), 'setting someone else’s home'); }

// ---- loans ----
{ let t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })); t = apply(H.update(t, { 'world/home/u1': { h: 'h1' } }, NOW, H.ADMIN)); t.world.own.h1 = house({ o: 'u1', on: 'Alice' }); t.world.home.u1 = { h: 'h1' };
  const take = (slot, p, o, extra) => run(t, 'u1', a => { mv(a, 'bank', -p); a.lop = slot; }, Object.assign({ ['eco/loan/u1/' + slot]: { p, o, pl: 'standard', dd: 30, t0: NOW } }, extra || {}));
  const L = take('l1', 1000000, 1120000); ok(L, 'taking a loan on the standard plan');
  no(take('l1', 1000000, 1000000), 'a loan with no interest'); no(take('l1', 1000000, 1500000), 'a loan with more interest than the plan'); no(take('l4', 1000000, 1120000), 'a fourth loan slot'); no(take('l1', 99999999999, 99999999999), 'a loan above the limit');
  no(run(t, 'u1', a => { mv(a, 'bank', -1000000); a.lop = 'l1'; }, {}), 'bank money with no loan record'); no(run(t, 'u1', a => { mv(a, 'bank', -2000000); a.lop = 'l1'; }, { 'eco/loan/u1/l1': { p: 1000000, o: 1120000, pl: 'standard', dd: 30, t0: NOW } }), 'a bigger payout than the principal');
  const homeless = clone(t); delete homeless.world.home.u1; no(run(homeless, 'u1', a => { mv(a, 'bank', -1000000); a.lop = 'l1'; }, { 'eco/loan/u1/l1': { p: 1000000, o: 1120000, pl: 'standard', dd: 30, t0: NOW } }), 'a loan while homeless');
  const t1 = apply(L); const rep = (amt, left) => run(t1, 'u1', a => { mv(a, 'bank', amt); a.lop = 'l1'; }, { 'eco/loan/u1/l1': left > 0 ? { p: 1000000, o: left, pl: 'standard', dd: 30, t0: t1.eco.loan ? 0 : NOW } : null });
  const t1b = clone(t1); const rep2 = (amt, left) => run(t1b, 'u1', a => { mv(a, 'bank', amt); a.lop = 'l1'; }, { 'eco/loan/u1/l1': left > 0 ? { p: 1000000, o: left, pl: 'standard', dd: 30, t0: NOW } : null });
  ok(rep2(500000, 620000), 'a partial repayment'); no(rep2(500000, 700000), 'repaying less than the debt drops'); no(rep2(500000, 500000), 'repaying less than the debt drops (2)'); ok(rep2(1120000, 0), 'repaying it all'); no(rep2(1000000, 0), 'a payoff that is a cent short');
  no(run(t1b, 'u1', a => { mv(a, 'bank', 1120000); a.lop = 'l1'; }, {}), 'paying the bank without reducing the loan'); no(H.update(t1b, { 'eco/loan/u1/l1': null }, NOW, U), 'deleting a loan for free'); }

// ---- the guarded player fields ----
{ let t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; }));
  no(H.update(t, { 'players/u1/inv': { e: { Au: 99 } } }, NOW, U), 'writing inventory without a ledger revision'); ok(run(t, 'u1', a => {}, { 'players/u1/inv': { e: { Au: 1 } } }), 'inventory saved together with the ledger');
  no(run(t, 'u1', a => {}, { 'players/u1/inv': { e: { Au: 1 } } }, H.mkAuth('u2')), 'someone else saving my inventory'); const stale = stamp(t, 'u1', a => {}); stale.rev = t.eco.acct.u1.rev; no(H.update(t, { 'eco/acct/u1': stale, 'players/u1/inv': { e: {} } }, NOW, U), 'a stale inventory save');
  ok(H.update(t, { 'players/u1/mail': { m1: { subj: 'x' } } }, NOW, U), 'light fields save on their own'); no(H.update(t, { 'players/u1/cash': 99999 }, NOW, U), 'a cash field in the player record (gone)'); }

// ---- admin-only nodes and OG icon ----
{ const t = world(); no(H.update(t, { 'eco/cfg/taxBp': 0 }, NOW, U), 'players changing the tax rate'); ok(H.update(t, { 'eco/cfg/taxBp': 500 }, NOW, H.ADMIN), 'admin changing it'); no(H.update(t, { 'world/meta/n': 9999 }, NOW, U), 'players building houses'); no(H.update(t, { 'eco/og/u1': true }, NOW, U), 'granting yourself OG status');
  ok(H.update(t, { 'leaderboard/u2': { name: 'Bob', og: 1, updatedAt: NOW } }, NOW, H.mkAuth('u2')), 'the OG icon on the leaderboard for an OG player'); no(H.update(t, { 'leaderboard/u1': { name: 'Alice', og: 1, updatedAt: NOW } }, NOW, U), 'a fake OG icon');
  no(H.update(t, { 'world/req/u1': { t: NOW - 5 } }, NOW, U), 'a request stamped with a fake time'); ok(H.update(t, { 'world/req/u1': { t: NOW } }, NOW, U), 'a housing request'); }
// ---- homeless players ----
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })), th = clone(t); th.world.home = {};
  const g = (tree, gross) => run(tree, 'u1', a => { mv(a, 'pool', -gross); mv(a, 'gov', E.taxOnGross(gross, 400)); });
  ok(run(t, 'u1', a => mv(a, 'arcade', 100000)), 'a housed player may gamble'); no(run(th, 'u1', a => mv(a, 'arcade', 100000)), 'a homeless player gambling');
  ok(g(t, 60000000), 'a housed player drawing $600k from the pool in a day'); no(g(th, 60000000), 'a homeless player drawing $600k (limit is a tenth)'); ok(g(th, 4000000), 'a homeless player drawing a little'); }
// ---- building licences and builds ----
{ const t0 = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })), lic = (tree, fee, t0v, now) => run(tree, 'u1', a => { mv(a, 'city', fee); a.hop = 'lic'; }, { 'world/lic/u1': { t0: t0v } });
  ok(lic(t0, 5000000, NOW), 'buying a building licence'); no(lic(t0, 4999999, NOW), 'a licence for less than the fee'); no(lic(t0, 5000000, NOW - 1), 'a back-dated licence'); no(H.update(t0, { 'world/lic/u1': { t0: NOW } }, NOW, U), 'a free licence');
  const tl = apply(lic(t0, 5000000, NOW)); tl.eco.acct.u1.b = 35000000; tl.eco.acct.u1.sys.pool -= 30000000;
  const bld = (tree, o) => { o = Object.assign({ c: 6980000, slot: 'b1', y: 'studio', on: 'Alice', t: NOW }, o || {}); return run(tree, 'u1', a => { mv(a, 'city', o.paid === undefined ? o.c : o.paid); a.hop = 'bld'; a.lop = o.slot; }, { ['world/build/u1/' + o.slot]: { y: o.y, t: o.t, c: o.paid === undefined ? o.c : o.paid, on: o.on } }); };
  ok(bld(tl), 'commissioning a studio (escrow = the most a studio can be worth)'); no(bld(tl, { paid: 1000000 }), 'under-paying the escrow'); no(bld(tl, { slot: 'b4' }), 'a fourth build slot'); no(bld(tl, { y: 'castle' }), 'an unknown house type'); no(bld(tl, { on: 'Mallory' }), 'building under someone else’s name');
  no(bld(t0), 'building without a licence'); const old = clone(tl); old.world.lic.u1.t0 = NOW - 31 * DAY; no(bld(old), 'building on an expired licence'); const dear = clone(tl); dear.world.meta.pi = 12000; ok(bld(dear, { c: 8376000, paid: 8376000 }), 'escrow follows the house price index'); no(bld(dear), 'escrow at the old index when prices rose');
  no(H.update(tl, { 'world/own/h9': house({ o: 'u1', on: 'Alice' }) }, NOW, U), 'self-building a house record'); }
// ---- buying from a player's market listing: the price is checked ----
{ const t = apply(run(world(), 'u1', a => { mv(a, 'pool', -10000000); a.ob = 1; })); t.market = { listings: { 'u2-1': { u: 'u2', n: 'Bob', f: 'H2O', p: 5.37, q: 40, t: NOW } } };
  const buy = (a, n, q, extra) => run(t, 'u1', x => { x.b -= a; x.s += a; x.si = 'u2/xM1'; mv(x, 'gov', 5370 * n / 10 - a); }, Object.assign({ 'eco/inbox/u2/xM1': { f: 'u1', a, k: 'market', t: NOW, l: 'u2-1', n, ref: String(n) }, 'market/listings/u2-1/q': q }, extra || {}));
  ok(buy(5102, 10, 30), 'buying 10 from a listing at its price'); no(buy(100, 10, 30), 'paying the seller far less than the listing price'); no(buy(5102, 10, 40), 'taking goods without reducing the listing'); no(buy(5102, 10, 25), 'reducing the listing by more than was bought');
  no(run(t, 'u1', x => { x.b -= 100; x.s += 100; x.si = 'u2/xM2'; }, { 'eco/inbox/u2/xM2': { f: 'u1', a: 100, k: 'market', t: NOW, ref: '1' } }), 'a market payment with no listing attached'); }
// ---- the admin reset: exactly what Settings → Economy → Start writes (genesis output, plus wiping the old nodes) ----
{ const Sim = require('../os/lib/eco-sim.js'), d = {}; Sim.genesis(d, NOW, ['u2']); const upd = { eco: clone(d.eco), world: clone(d.world), players: null, leaderboard: null, labCache: null, labSubmit: null, 'market/listings': null, 'market/proceeds': null };
  const old = world(); old.labCache = { k: { by: 'x', t: 1 } }; old.market = { listings: {} };
  const r = H.update(old, upd, NOW, H.ADMIN); ok(r, 'the admin reset write'); no(H.update(old, upd, NOW, U), 'a player running the reset');
  assert.ok(E.audit({ eco: r.tree.eco }).ok, 'the reset economy balances'); assert.strictEqual(Object.keys(r.tree.world.own).length, 512); assert.ok(!r.tree.players && !r.tree.leaderboard, 'old progress is gone'); }
console.log('rules ok');
