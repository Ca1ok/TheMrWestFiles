#!/usr/bin/env node
/* The WestEconomy world server. Runs every ~10 minutes from .github/workflows/eco-tick.yml (GitHub Actions, free) with a Firebase service account
 * (secret FIREBASE_SERVICE_ACCOUNT). It reads the economy + world, runs os/lib/eco-sim.js (bots live, work, rent, buy houses, die; taxes and bills;
 * loans; fires and other events; building new houses), AUDITS that not one cent was created or lost, and only then writes the changes back in ONE
 * atomic update. If the audit fails, or a player changed something it wanted to change while it was thinking, it writes nothing and tries again next run.
 * Locally:  FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node .github/scripts/eco-tick.js [--dry] */
const fs = require('fs'), path = require('path');
const admin = require('firebase-admin');
const E = require('../../os/lib/economy.js'), S = require('../../os/lib/eco-sim.js'), M = require('../../os/lib/market-model.js');
const DRY = process.argv.includes('--dry');
const URL = process.env.FIREBASE_DATABASE_URL || (fs.readFileSync(path.join(__dirname, '../../os/config.js'), 'utf8').match(/databaseURL:\s*"([^"]+)"/) || [])[1];
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const eq = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
// flatten a changed record into database paths (record level for the maps below, so a record is replaced whole)
function diff(prefix, a, b, depth, out){
  a = a == null ? {} : a; b = b == null ? {} : b;
  Object.keys(Object.assign({}, a, b)).forEach(k => { const p = prefix + '/' + k, x = a[k], y = b[k];
    if(eq(x, y)) return;
    if(depth > 1 && x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) diff(p, x, y, depth - 1, out); else out[p] = y === undefined ? null : y; });
}
(async () => {
  if(!process.env.FIREBASE_SERVICE_ACCOUNT){ console.error('FIREBASE_SERVICE_ACCOUNT is not set'); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: URL }); const db = admin.database();
  const get = async p => (await db.ref(p).once('value')).val();
  const epoch = await get('eco/epoch'); if(!epoch){ console.log('The economy has not been started (eco/epoch missing) — nothing to do.'); return process.exit(0); }
  const load = async () => { const [eco, world, listings, adj] = await Promise.all([get('eco'), get('world'), get('market/listings'), get('marketAdjustments')]);
    const d = { eco: eco || {}, world: world || {}, market: { listings: listings || {} } };
    ['acct', 'inbox', 'bill', 'loan', 'bots', 'og', 'cfg', 'stats'].forEach(k => { d.eco[k] = d.eco[k] || {}; }); d.eco.dead = d.eco.dead || { sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0 }; d.eco.dead.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, d.eco.dead.sys);
    ['own', 'home', 'ev', 'build', 'lic'].forEach(k => { d.world[k] = d.world[k] || {}; }); d.world.meta = d.world.meta || { n: 0, nb: 0, pi: 10000 };
    Object.keys(d.eco.acct).forEach(id => { const a = d.eco.acct[id]; a.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, a.sys); });
    return { d, adj: adj ? Object.keys(adj).map(k => Object.assign({ id: k }, adj[k])) : [] }; };
  const { d: db0, adj } = await load(); const before = clone(db0), A0 = E.audit(db0);
  console.log('before: audit', A0.ok ? 'OK' : 'BROKEN', JSON.stringify({ players: A0.players, bots: A0.bots, held: A0.held, flight: A0.flight }));
  if(!A0.ok){ console.error('The ledger is already out of balance — refusing to touch it. bad accounts:', A0.bad.join(',') || '(totals)', 'sent-claimed', A0.sentMinusClaimed, 'flight', A0.flight); process.exit(2); }
  const now = Date.now(), res = S.step(db0, now, Math.floor(now / 1000)), A1 = E.audit(db0);
  if(!A1.ok || A1.total !== E.SUPPLY){ console.error('AUDIT FAILED after the step — nothing written.', JSON.stringify(A1.bad)); process.exit(3); }
  // the stock market follows the economy's health: a small permanent step when it has moved noticeably (at most every 6 hours)
  let adjust = null; const m = db0.world.meta, h = db0.eco.stats.health;
  if(typeof m.mh !== 'number'){ m.mh = h; m.mt = now; } else if(now - (m.mt || 0) > 6 * 3600000 && Math.abs(h - m.mh) >= 0.01){
    const tick = M.marketTickIndexForTime(now), level = M.marketLevelAtTick(tick, adj), delta = Math.round(Math.max(-0.05, Math.min(0.05, (h - m.mh) * 0.5)) * level * 100) / 100;
    if(delta !== 0) adjust = { tickIndex: tick, delta, at: now, id: 'eco' + now.toString(36) }; m.mh = h; m.mt = now; }
  // diff → one multi-path update
  const upd = {};
  diff('eco/acct', before.eco.acct, db0.eco.acct, 1, upd); diff('eco/inbox', before.eco.inbox, db0.eco.inbox, 2, upd); diff('eco/bill', before.eco.bill, db0.eco.bill, 2, upd); diff('eco/loan', before.eco.loan, db0.eco.loan, 2, upd);
  diff('eco/bots', before.eco.bots, db0.eco.bots, 1, upd); diff('eco/dead', before.eco.dead, db0.eco.dead, 1, upd); diff('eco/stats', before.eco.stats, db0.eco.stats, 1, upd);
  diff('world/own', before.world.own, db0.world.own, 1, upd); diff('world/home', before.world.home, db0.world.home, 1, upd); diff('world/ev', before.world.ev, db0.world.ev, 1, upd); diff('world/meta', before.world.meta, db0.world.meta, 1, upd); diff('world/build', before.world.build, db0.world.build, 2, upd);
  diff('market/listings', before.market.listings, db0.market.listings, 2, upd);
  if(db0.world.req && !before.world.req) upd['world/req'] = null; else if(before.world.req && !db0.world.req) upd['world/req'] = null;
  if(adjust){ const { id, ...rest } = adjust; upd['marketAdjustments/' + id] = rest; }
  const perUser = {}; res.mails.forEach(x => { perUser[x.uid] = (perUser[x.uid] || 0) + 1; if(perUser[x.uid] > 3) return; const k = db.ref('mailbox/' + x.uid).push().key; upd['mailbox/' + x.uid + '/' + k] = { from: 'City Hall', subj: String(x.subj).slice(0, 120), body: String(x.body).slice(0, 1000), t: now }; });
  const n = Object.keys(upd).length; console.log('changes:', n, 'paths · mails', res.mails.length, '· stats', JSON.stringify(db0.eco.stats), adjust ? '· stock adjust ' + adjust.delta : '');
  if(DRY){ console.log('--dry: not writing'); return process.exit(0); }
  // did a player touch what we are about to change? (their accounts, houses, loans, bills) → skip this run rather than overwrite them
  const { d: live } = await load(); const touched = [];
  ['eco/acct', 'world/own', 'eco/loan', 'eco/bill', 'world/build'].forEach(root => { const [a, b] = root.split('/'), L = live[a][b], B0 = before[a][b]; Object.keys(upd).filter(k => k.startsWith(root + '/')).forEach(k => { const rel = k.slice(root.length + 1).split('/'); const g = o => rel.reduce((x, y) => x && x[y], o); if(!eq(g(L), g(B0))) touched.push(k); }); });
  if(touched.length){ console.log('Players changed ' + touched.length + ' record(s) during the run (' + touched.slice(0, 5).join(', ') + ') — skipping this run, will retry next time.'); return process.exit(0); }
  if(n) await db.ref().update(upd); console.log('written.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
