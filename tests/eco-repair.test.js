// node tests/eco-repair.test.js — Economy.retire (safe account removal) and Economy.repair (heal an already-broken ledger)
const assert = require('assert'), E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js');
const clone = o => JSON.parse(JSON.stringify(o)), now = Date.now();
function world(){ const db = {}; S.genesis(db, now - 2 * 86400000, []); E.acctOf(db, 'p1'); E.sysMove(db, 'p1', 'pool', -10000000); db.eco.acct.p1.ob = 1; E.acctOf(db, 'p2'); E.sysMove(db, 'p2', 'pool', -10000000);
  E.send(db, 'p1', 'b1', 250000, 'rent', 'h1', now); E.send(db, 'b2', 'p1', 777000, 'wage', 'd', now); E.send(db, 'p2', 'p1', 5000, 'pay', '', now); E.sysMove(db, 'p1', 'gov', 1234); return db; }
// 1. retire keeps every total exact, whatever the account owes/owns, and leaves no trace of it behind
{ const db = world(); assert.ok(E.audit(db).ok); assert.ok(E.retire(db, 'p1')); const A = E.audit(db); assert.ok(A.ok && A.total === E.SUPPLY, 'retire keeps the audit balanced'); assert.ok(!db.eco.acct.p1 && !db.eco.inbox.p1);
  assert.ok(db.eco.inbox.b1, 'money p1 had sent to b1 is still in flight for b1'); E.claimAll(db, 'b1'); assert.ok(E.audit(db).ok, 'and b1 can still claim it'); assert.strictEqual(E.retire(db, 'nobody'), false); }
// 2. the old behaviour (plain delete) really breaks the audit — the bug this fixes
{ const db = world(); delete db.eco.acct.p1; delete db.eco.inbox.p1; assert.ok(!E.audit(db).ok, 'plain delete breaks the ledger'); }
// 3. repair heals every way the ledger was broken, never changes anybody's cash, and is a no-op on a healthy ledger
{ const healthy = world(), before = clone(healthy); const r0 = E.repair(healthy); assert.ok(r0.audit.ok && r0.accounts.length === 0 && r0.flightGap === 0 && r0.supplyGap === 0, 'no-op when balanced'); assert.deepStrictEqual(healthy.eco.acct, before.eco.acct);
  const cases = { 'deleted account + inbox': db => { delete db.eco.acct.p1; delete db.eco.inbox.p1; }, 'deleted account only': db => { delete db.eco.acct.p1; }, 'deleted inbox only': db => { delete db.eco.inbox.b1; },
    'cash edited by hand (+)': db => { db.eco.acct.p2.b += 999999; }, 'cash edited by hand (−)': db => { db.eco.acct.p2.b -= 12345; }, 'sys edited': db => { db.eco.acct.p2.sys.gov += 777; }, 'dead bucket wiped': db => { db.eco.dead = { sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0 }; }, 'inbox entry added from nowhere': db => { db.eco.inbox.p2 = { zz: { f: 'x', a: 4242, k: 'pay', t: 1, ref: '' } }; } };
  Object.keys(cases).forEach(name => { const db = world(); cases[name](db); const cash = {}; Object.keys(db.eco.acct).forEach(id => { cash[id] = db.eco.acct[id].b; }); const broken = !E.audit(db).ok;
    const r = E.repair(db), A = E.audit(db); assert.ok(A.ok && A.total === E.SUPPLY, name + ': balanced after repair ' + JSON.stringify(A.bad)); Object.keys(cash).forEach(id => assert.strictEqual(db.eco.acct[id].b, cash[id], name + ': cash of ' + id + ' untouched'));
    // the world keeps running afterwards: the step() audit must hold for days
    for(let i = 0; i < 48 * 3; i++){ S.step(db, now + i * 30 * 60000, i + 1); assert.ok(E.audit(db).ok, name + ': step ' + i + ' balanced'); }
    console.log((broken ? 'broken → healed: ' : 'still valid: ') + name + ' (flight gap ' + r.flightGap + ', supply gap ' + r.supplyGap + ', accounts fixed ' + r.accounts.length + ')'); });
}
console.log('eco-repair ok');
