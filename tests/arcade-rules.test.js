// node tests/arcade-rules.test.js — runs the Arcade ledger rules in database.rules.json (players/$uid/arcade) against honest rounds and against cheating attempts.
// The rule strings are JavaScript-compatible expressions, so we evaluate them with a small mock of data / newData / root / now.
const fs = require('fs'), path = require('path'), assert = require('assert'), G = require('../os/lib/arcade-games.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'))).rules;
const LEDGER = R.players.$uid.arcade, VALIDATE = LEDGER['.validate'], WRITE = LEDGER['.write'];
const DAY = 86400000, NOW = 1790000000000 + 3600000, TODAY = NOW - NOW % DAY;
const clone = o => JSON.parse(JSON.stringify(o));
function node(tree, p){ const get = () => p.reduce((v, k) => v == null ? undefined : v[k], tree);
  return { val: () => { const v = get(); return v === undefined ? null : v; }, exists: () => { const v = get(); return v !== undefined && v !== null; }, hasChildren: ks => { const v = get(); return v != null && typeof v === 'object' && ks.every(k => v[k] !== undefined); }, child: c => node(tree, p.concat(c.split('/'))), parent: () => node(tree, p.slice(0, -1)) }; }
const check = (expr, oldT, newT, now, auth) => new Function('data', 'newData', 'root', 'now', 'auth', '$uid', 'return (' + expr + ')')(node(oldT, ['players', 'u', 'arcade']), node(newT, ['players', 'u', 'arcade']), node(oldT, []), now, auth || {}, 'u');
const CFG = { enabled: true, betPct: 0.1, betCap: 25000, minBet: 1, dailyCap: 100000, cooldownMs: 1500, maxMult: 100 };
const base = (o) => ({ players: { u: Object.assign({ cash: 5000, arcade: { d: TODAY, net: 0, open: 0, t: NOW - 60000 } }, o || {}) }, arcadeConfig: clone(CFG) });
function write(oldT, patch, now){ const n = clone(oldT); const u = n.players.u; if(patch.cash !== undefined) u.cash = patch.cash; u.arcade = Object.assign({}, u.arcade, { t: now == null ? NOW : now }, patch.arcade); return n; }
const ok = (o, n, msg) => assert.strictEqual(check(VALIDATE, o, n, NOW), true, msg), bad = (o, n, msg) => assert.strictEqual(check(VALIDATE, o, n, NOW), false, 'should be rejected: ' + msg);

// honest round, using the same functions the kernel uses
{ let t = base(); const mb = G.maxBet(5000, CFG); assert.strictEqual(mb, 500);
  const deal = write(t, { cash: 4500, arcade: { open: 500 } }); ok(t, deal, 'deal at the max bet');
  const win = write(deal, { cash: 4500 + G.settleAmount(500, 1500, 0, CFG), arcade: { open: 0, net: 1000 } }, NOW + 5000); assert.strictEqual(check(VALIDATE, deal, win, NOW + 5000), true, 'honest win settles');
  const lose = write(deal, { cash: 4500, arcade: { open: 0, net: -500 } }, NOW + 5000); assert.strictEqual(check(VALIDATE, deal, lose, NOW + 5000), true, 'honest loss settles');
  const dbl = write(deal, { cash: 4000, arcade: { open: 1000 } }, NOW + 1000); assert.strictEqual(check(VALIDATE, deal, dbl, NOW + 1000), true, 'double down');
  const back = write(deal, { cash: 4500 + 2000, arcade: { open: 0, net: 1000 } }, NOW + 5000); assert.strictEqual(check(VALIDATE, deal, back, NOW + 5000), false, 'net must match the money actually moved (net should be 1500)');
  const fortf = write(deal, { cash: 4500, arcade: { open: 0, net: -500 } }, NOW + 3000); assert.strictEqual(check(VALIDATE, deal, fortf, NOW + 3000), true, 'forfeit an abandoned round'); }

// cheating at the deal
{ const t = base();
  bad(t, write(t, { cash: 5000, arcade: { open: 500 } }), 'stake not taken from the bank');
  bad(t, write(t, { cash: 4000, arcade: { open: 1000 } }), 'bet above 10% of the bank');
  bad(t, write(t, { cash: 4999, arcade: { open: 1 }, }, NOW - 1000) , 'timestamp that is not the server time');
  const cd = base(); cd.players.u.arcade.t = NOW - 500; bad(cd, write(cd, { cash: 4900, arcade: { open: 100 } }), 'inside the cooldown');
  const stale = write(t, { cash: 4900, arcade: { open: 100, d: TODAY - DAY } }); bad(t, stale, 'yesterday’s day stamp');
  const cap = base(); cap.players.u.arcade.net = 100000; bad(cap, write(cap, { cash: 4900, arcade: { open: 100, net: 100000 } }), 'already at the daily cap');
  const off = base(); off.arcadeConfig.enabled = false; bad(off, write(off, { cash: 4900, arcade: { open: 100 } }), 'arcade switched off');
  const hi = base({ cash: 1e9 }); bad(hi, write(hi, { cash: 1e9 - 30000, arcade: { open: 30000 } }), 'above the hard cap');
  const gone = base(); delete gone.arcadeConfig; ok(gone, write(gone, { cash: 4900, arcade: { open: 100 } }), 'default limits apply when the admin never saved a config');
  const tiny = base({ cash: 5 }); ok(tiny, write(tiny, { cash: 4, arcade: { open: 1 } }), 'minimum bet works with a tiny bank'); }

// cheating at the payout
{ const deal = write(base(), { cash: 4500, arcade: { open: 500 } }), at = NOW + 5000, chk = (patch) => check(VALIDATE, deal, write(deal, patch, at), at);
  assert.strictEqual(chk({ cash: 4500 + 500 * 101, arcade: { open: 0, net: 500 * 100 } }), false, 'payout above the max multiplier');
  assert.strictEqual(chk({ cash: 4500 + 2000, arcade: { open: 0, net: 0 } }), false, 'understating net to hide winnings');
  assert.strictEqual(chk({ cash: 4500 + 2000, arcade: { open: 0, net: 1500, d: TODAY - DAY } }), false, 'stale day stamp to dodge the cap');
  assert.strictEqual(chk({ cash: 4500 + 2000, arcade: { open: 500, net: 0 } }), false, 'keeping the stake open while taking money');
  assert.strictEqual(chk({ cash: 4000, arcade: { open: 0, net: -500 } }), false, 'cash lower than the loss it claims');
  const nearCap = clone(deal); nearCap.players.u.arcade.net = 99000; assert.strictEqual(check(VALIDATE, nearCap, write(nearCap, { cash: 4500 + 2500, arcade: { open: 0, net: 101500 } }, at), at), false, 'win that pushes net past the daily cap');
  assert.strictEqual(check(VALIDATE, nearCap, write(nearCap, { cash: 4500 + 1500, arcade: { open: 0, net: 100000 } }, at), at), true, 'win trimmed to exactly the cap is fine');
  const dayRoll = clone(deal); dayRoll.players.u.arcade.d = TODAY - DAY; dayRoll.players.u.arcade.net = 99000;
  assert.strictEqual(check(VALIDATE, dayRoll, write(dayRoll, { cash: 4500 + 700, arcade: { open: 0, net: 200, d: TODAY } }, at), at), true, 'a new day starts from zero'); }

// double-down limits
{ const deal = write(base(), { cash: 4500, arcade: { open: 500 } }), at = NOW + 1000, chk = (patch) => check(VALIDATE, deal, write(deal, patch, at), at);
  assert.strictEqual(chk({ cash: 3500, arcade: { open: 1500 } }), false, 'adding more than the original stake');
  assert.strictEqual(chk({ cash: 4500, arcade: { open: 1000 } }), false, 'adding stake without paying for it'); }

// who may write the ledger, and no deleting it to reset the cap
{ const t = base(), n = write(t, { cash: 4500, arcade: { open: 500 } }), mk = (uid, email, anon) => ({ uid, token: { email, email_verified: true, firebase: { sign_in_provider: anon ? 'anonymous' : 'google.com' } } });
  const w = (auth, newT) => check(WRITE, t, newT, NOW, auth);
  assert.strictEqual(w(mk('u', 'p@x.com'), n), true, 'owner may write'); assert.strictEqual(w(mk('other', 'o@x.com'), n), false, 'another player may not');
  assert.strictEqual(w(mk('u', 'p@x.com', true), n), false, 'anonymous sessions may not'); const del = clone(t); delete del.players.u.arcade; assert.strictEqual(w(mk('u', 'p@x.com'), del), false, 'owner may not delete the ledger');
  assert.strictEqual(w(mk('admin', 'kirattdhaliwal@gmail.com'), del), true, 'admin may'); }
console.log('arcade rules ok');
