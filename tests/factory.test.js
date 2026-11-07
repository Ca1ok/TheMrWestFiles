// node tests/factory.test.js — WestFactory maths (caps, costs, sale chance, production) and the Market rules in database.rules.json.
const assert = require('assert'), fs = require('fs'), path = require('path'), F = require('../os/lib/factory-sim.js');
// caps & costs
assert.deepStrictEqual([1, 2, 3, 4, 5].map(t => F.rateCap(t)), [5, 10, 20, 40, 80]); assert.deepStrictEqual([1, 2, 3, 4, 5].map(t => F.upgradeCost(t)), [1500, 4500, 13500, 40500, null]);
assert.strictEqual(F.slotCost(2), 3000); assert(F.slotCost(3) > F.slotCost(2)); assert.strictEqual(F.slotCost(8), null); assert.strictEqual(F.storage(3), 360); assert.strictEqual(F.batch(2), 50);
// shop range & chance: certain-ish when cheap, falls with price, zero outside the range, saturation hurts
const est = 100, rg = F.shopRange(est); assert.deepStrictEqual(rg, { lo: 60, hi: 150 });
assert.strictEqual(F.shopChance(1.6, 1), 0); for(const r of [0.6, 0.85, 1.0]) for(const sat of [1, 0.3]) assert.strictEqual(F.shopChance(r, sat), 1, 'at or below normal the shop always accepts'); assert(F.shopChance(1.01, 1) < 1 && F.shopChance(1.2, 1) < F.shopChance(1.1, 1));
let prev = 1; for(let r = 1; r <= 1.5001; r += 0.05){ const c = F.shopChance(r, 1); assert(c <= prev + 1e-12, 'chance never rises with price'); prev = c; } assert(Math.abs(F.shopChance(1.5, 1) - 0.08) < 1e-9);
assert(F.shopChance(1.2, 0.3) < F.shopChance(1.2, 1) * 0.31 + 1e-9, 'above normal, saturation scales the chance down');
// production: limited by rate, warehouse space, and cash above the reserve
const price = e => ({ H: 2, O: 4 })[e], comp = { H: 2, O: 1 };                                     // water: 8 × 1.05 = 8.40 per mol
let p = F.planProduction({ comp, price, rate: 5, minutes: 1, cash: 1000, space: 100 }); assert.strictEqual(p.made, 5); assert.strictEqual(p.cost, 42); assert(!p.limited);
p = F.planProduction({ comp, price, rate: 5, minutes: 1, cash: 1000, space: 2 }); assert.strictEqual(p.made, 2);
p = F.planProduction({ comp, price, rate: 5, minutes: 1, cash: 60, space: 100 }); assert(p.limited && Math.abs(p.made - 10 / 8.4) < 1e-9, 'only what cash minus the $50 reserve buys');
p = F.planProduction({ comp, price, rate: 5, minutes: 1, cash: 40, space: 100 }); assert.strictEqual(p.made, 0);
// balance: expected profit per mol at each price (list value ≈ 1.2 × element cost) is positive at sensible prices; high prices cut throughput hard
const elem = 100, value = 120, unit = elem * 1.05;
for(const r of [0.7, 0.85, 1.0, 1.2, 1.4]){ const ch = F.shopChance(r, 1), cycle = ch * 5 + (1 - ch) * 60 /* s per attempt incl. lock */, perMin = 25 / (cycle / ch / 60 * ch + 0) , margin = r * value / unit - 1; console.log('price ×' + r.toFixed(2) + ': chance ' + (ch * 100).toFixed(0) + '%, margin ' + (margin * 100).toFixed(0) + '% per mol, ~' + (25 * ch / (cycle / 60)).toFixed(0) + ' mol/min sell speed (25-mol batches)'); }
assert(F.shopChance(0.85, 1) / 1 > F.shopChance(1.4, 1) * 3, 'asking more is a real gamble');
// market rules
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'))).rules.market, now = 1790000000000;
function node(tree, p){ const get = () => p.reduce((v, k) => v == null ? undefined : v[k], tree); return { isNumber: () => typeof get() === 'number', isString: () => typeof get() === 'string', val: () => { const v = get(); return v === undefined ? null : v; }, exists: () => { const v = get(); return v != null; }, hasChildren: ks => { const v = get(); return v != null && typeof v === 'object' && ks.every(k => v[k] !== undefined); }, child: c => node(tree, p.concat(c.split('/'))), parent: () => node(tree, p.slice(0, -1)) }; }
const ev = (expr, o) => new Function('data', 'newData', 'root', 'now', 'auth', '$id', '$seller', 'return (' + expr + ')')(node(o.old || {}, o.path), node(o.nw || {}, o.path), node(o.old || {}, []), now, o.auth, o.id == null ? null : Object.assign(new String(o.id), { beginsWith: s => String(o.id).startsWith(s) }), o.seller);
const mk = (uid, anon) => ({ uid, token: { email: uid + '@x.com', email_verified: true, firebase: { sign_in_provider: anon ? 'anonymous' : 'google.com' } } });
const listing = { u: 'alice', n: 'Alice', f: 'H2O', p: 10, q: 50, t: now };
const L = R.listings.$id;
const w = (auth, old, nw, id) => ev(L['.write'], { old: { market: { listings: old } }, nw: { market: { listings: nw } }, path: ['market', 'listings', id], auth, id });
assert.strictEqual(w(mk('alice'), {}, { 'alice-l1': listing }, 'alice-l1'), true, 'seller may list'); assert.strictEqual(w(mk('bob'), {}, { 'alice-l1': listing }, 'alice-l1'), false, 'cannot list as someone else');
assert.strictEqual(w(mk('bob'), { 'alice-l1': listing }, { 'alice-l1': Object.assign({}, listing, { p: 0.01 }) }, 'alice-l1'), false, 'others cannot reprice'); assert.strictEqual(w(mk('alice', true), {}, { 'alice-l1': listing }, 'alice-l1'), false, 'anonymous cannot list');
const qw = (auth, oldQ, newQ) => ev(L.q['.write'], { old: { market: { listings: { x: Object.assign({}, listing, { q: oldQ }) } } }, nw: { market: { listings: { x: Object.assign({}, listing, { q: newQ }) } } }, path: ['market', 'listings', 'x', 'q'], auth });
assert.strictEqual(qw(mk('bob'), 50, 45), true, 'buyer may reduce quantity'); assert.strictEqual(qw(mk('bob'), 50, 55), false, 'buyer may not raise it'); assert.strictEqual(qw(mk('bob'), 50, -1), false);
const P = R.proceeds.$seller.$pid, base = { market: { listings: { 'alice-l1': listing } } };
const pv = (rec, auth) => ev(P['.validate'], { old: base, nw: Object.assign({ market: { listings: base.market.listings, proceeds: { alice: { pid1: rec } } } }), path: ['market', 'proceeds', 'alice', 'pid1'], auth, seller: 'alice' });
const pw = (auth, rec, seller, old) => ev(P['.write'], { old: old || {}, nw: rec ? { market: { proceeds: { [seller]: { pid1: rec } } } } : {}, path: ['market', 'proceeds', seller, 'pid1'], auth, seller });
const good = { lid: 'alice-l1', k: 3, amt: 30, b: 'bob', t: now };
assert.strictEqual(pv(good, mk('bob')), true, 'honest payment record'); assert.strictEqual(pv(Object.assign({}, good, { amt: 3000 }), mk('bob')), false, 'cannot claim more than price × quantity');
assert.strictEqual(pw(mk('bob'), good, 'alice'), true, 'buyer may record a payment'); assert.strictEqual(pw(mk('bob'), Object.assign({}, good, { b: 'carol' }), 'alice'), false, 'buyer id must be your own'); assert.strictEqual(pw(mk('alice'), Object.assign({}, good, { b: 'alice' }), 'alice'), false, 'cannot pay yourself');
assert.strictEqual(pw(mk('alice'), null, 'alice', { market: { proceeds: { alice: { pid1: good } } } }), true, 'seller may collect (delete)'); assert.strictEqual(pw(mk('bob'), null, 'alice', { market: { proceeds: { alice: { pid1: good } } } }), false, 'others cannot delete payments');
console.log('factory ok');
