// node tests/money-flows.test.js — guards the closed ledger from the OUTSIDE: (1) static scan: no code outside the ledger modules may write a balance, (2) the server-side
// auto-rent really conserves money and prevents offline evictions, (3) payouts stay in the intended band. Run after ANY change to money code.
const assert = require('assert'), fs = require('fs'), path = require('path'), E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js'), GS = require('../os/lib/game-scoring.js');
const ROOT = path.join(__dirname, '..'), HOUR = 3600000, DAY = 86400000;
// 1 ── static: only these files may touch balances / system counters
const ALLOWED = new Set(['os/kernel/ledger.js', 'os/lib/economy.js', 'os/lib/eco-sim.js', 'os/kernel/cloud.js']);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['node_modules', 'tests', 'lab-cache', '.github', 'tools', '.git'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const bad = [];
walk(ROOT).filter(f => /\.(js|html)$/.test(f)).forEach(f => { const rel = path.relative(ROOT, f); if(ALLOWED.has(rel)) return; const src = fs.readFileSync(f, 'utf8');
  [/\bacct\.b\s*[-+]?=[^=]/, /\bS\.cash\s*[-+]?=[^=]/, /\.sys\.(pool|arcade|bank|gov|city)\s*[-+]?=[^=]/, /K\.S\.cash\s*[-+]?=[^=]/].forEach(re => { if(re.test(src)) bad.push(rel + ' matches ' + re); }); });
assert.deepStrictEqual(bad, [], 'money written outside the ledger modules: ' + bad.join('; '));
// 2 ── server-side auto-rent
const T0 = 1790000000000 - (1790000000000 % DAY); const db = {}; S.genesis(db, T0, []); const cfg = E.cfgOf(db);
const grant = id => { E.acctOf(db, id); E.sysMove(db, id, 'pool', -E.DEFAULTS.startGrant); db.eco.acct[id].ob = 1; db.eco.acct[id].c0 = T0; };
['pT', 'pL'].forEach(grant);
const bankHouse = Object.keys(db.world.own).filter(k => db.world.own[k].o === 'bank' && !db.world.own[k].t && db.world.own[k].v < 3000000).sort((a, b) => db.world.own[a].v - db.world.own[b].v);
const h1 = bankHouse[0], h2 = bankHouse[1];
// pT rents h1 (city) for 2 h; pL owns h2 (bought from the city) and pT would rent it later
const rentIn = (id, hid, hrs) => { const h = db.world.own[hid]; const cost = h.rh * hrs; assert.ok(E.sysMove(db, id, h.o === 'bank' ? 'city' : 'gov', cost)); h.t = id; h.tn = id; h.ts = T0; h.th = hrs; db.world.home[id] = { h: hid }; };
rentIn('pT', h1, 2);
let a = E.audit(db); assert.ok(a.ok, 'audit before'); const cashBefore = db.eco.acct.pT.b;
let t = T0; for(let i = 0; i < 6 * 24 * 3; i++){ t += 10 * 60000; S.step(db, t, i + 1); a = E.audit(db); assert.ok(a.ok && a.total === E.SUPPLY, 'audit at step ' + i + ' ' + JSON.stringify(a.bad)); }
assert.strictEqual(db.world.own[h1].t, 'pT', 'tenant still lives there after 3 days (rent was auto-paid)'); assert.ok(db.world.home.pT, 'still has a home');
assert.ok(db.eco.acct.pT.b < cashBefore, 'rent was actually charged');
// broke tenant is still evicted (auto-rent never overdrafts)
const pB = 'pB'; E.acctOf(db, pB); db.eco.acct[pB].ob = 1; db.eco.acct[pB].c0 = T0;   // a player with exactly $0 (never received a grant)
assert.strictEqual(E.invariant(db.eco.acct[pB]), 0); Object.assign(db.world.own[h2], { t: pB, tn: pB, ts: t, th: 1 }); db.world.home[pB] = { h: h2 };
for(let i = 0; i < 6 * 30; i++){ t += 10 * 60000; S.step(db, t, 9000 + i); assert.ok(E.audit(db).ok, 'audit (broke tenant) ' + i); }
assert.ok(!db.world.own[h2].t || db.world.own[h2].t !== pB, 'a tenant with no cash is evicted after the grace period');
// 3 ── payout band: a par run must beat a day of rent in the cheapest house by a wide margin, but never approach the daily pool limit
const par = GS.baseFor('reaction', 700, 120); assert.ok(par > 7 && par < 9.5, 'par base ≈ 8, got ' + par);
console.log('money-flows ok — par base', par, '· auto-rent audited over 3 days');
