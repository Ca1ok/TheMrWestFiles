/* KERNEL · ledger — your money and your home, kept honest by the server.
 *
 * Before: the browser owned a "cash" number and saved the whole record, so a stale tab or a bug could overwrite newer data or invent money.
 * Now your cash is an ACCOUNT in the WestEconomy ledger (eco/acct/<uid>, os/lib/economy.js). The browser never writes "cash = X": it writes a new
 * version of the account together with the reason, and database.rules.json refuses the write unless
 *     cash + (what you paid into the market pool / casino / bank / treasury / city) + (sent − claimed) = 0
 * — i.e. money only ever MOVES. Every write carries revision+1, so a stale tab is refused instead of overwriting. Inventory, shares and lab are saved in
 * the SAME atomic update, so money and the things it bought can never get out of step.
 *   earn()/spend()   buy/sell with the market pool; the treasury takes a universal tax (taxBp) on every such flow
 *   inbox            money sent by another player or a bot arrives in your inbox; this module claims it (one claim per update)
 *   bills            taxes and fines issued by the world server; paid automatically when you can afford them
 *   loans / houses   see the functions below — each is ONE atomic update that the rules check against the ledger
 * Guests (not signed in) get a local demo wallet that is never saved. */
(window.__OSM = window.__OSM || []).push(function(K){
  const E = Economy, W = WorldGen, C = K.cloud, DAY = 86400000, HOUR = 3600000, TS = () => firebase.database.ServerValue.TIMESTAMP;
  const clone = o => JSON.parse(JSON.stringify(o));
  const L = K.ledger = { acct: E.newAcct(), base: null, cfg: E.cfgOf(null), epoch: null, og: false, offline: true, guest: true, mine: {}, home: null, homeHouse: null, bills: {}, loans: {}, stats: null, world: null, meta: { n: 0, pi: 10000 }, events: {}, started: false };
  const D = K.diag || { error(){}, warn(){}, info(){} };
  const cents = d => Math.round(d * 100), dollars = c => c / 100;

  /* ---------- guest demo wallet: local only, never saved ---------- */
  L.initGuest = function(){ L.acct = E.newAcct(); L.base = null; L.guest = true; const c = cents(OS_CONFIG.startCash || 0); L.acct.b = c; L.acct.sys.pool = -c; L.acct.ob = 1; };
  L.initGuest();
  const bp = () => L.cfg.taxBp;

  /* ---------- local moves ---------- */
  function move(sys, amt){ const a = L.acct; if(!Number.isInteger(amt) || a.b - amt < 0) return false; a.b -= amt; a.sys[sys] += amt; return true; }
  L.move = move;
  const logTx = (d, why) => { const h = K.S.bank.hist; h.unshift({ t: K.now(), d, n: String(why || '').slice(0, 40) }); if(h.length > 40) h.length = 40; };
  const changed = () => { K.touch('cash', 'bank'); K.emit('cash'); };
  /* earn: the pool (or another system account) pays you `amt` before tax; you keep amt − tax. Returns what you actually received, in dollars. */
  /* how much more the pool may pay this account right now: the lifetime allowance (grant + $100k/day since the account was created) and today's net limit (a tenth for the homeless).
   * The database rules enforce both; clamping here means a legitimate save is never refused. */
  L.poolRoom = function(){
    if(L.guest) return Infinity; const a = L.acct, b = L.base || a, t = K.now(), today = t - t % DAY, same = b.dp === today, c = L.cfg;
    const life = E.allowance(c, a.c0 || b.c0 || t, t) - (-a.sys.pool), pin = Math.max(0, (same ? b.pin : 0) - (a.sys.pool - b.sys.pool)), day = (L.home ? c.poolDaily : Math.floor(c.poolDaily / c.homelessPoolDiv)) - pin;
    return Math.max(0, Math.min(life, day));
  };
  let lastLimitMsg = 0; const limitMsg = (title, body) => { if(Date.now() - lastLimitMsg > 300000){ lastLimitMsg = Date.now(); K.emit('notify', { app: 'Bank', title, body }); } };
  K.earnFrom = function(sys, amt, why){
    let g = cents(amt); if(!(g > 0) || !isFinite(g)) return 0;
    if(sys === 'pool' && !L.guest){ const room = L.poolRoom(); if(room < g){ limitMsg(room <= 0 ? 'Earning limit reached' : 'Earning limit nearly reached', L.home ? 'The WestEconomy limits how much money one account can draw from the market (grant + $' + (L.cfg.earnPerDay / 100).toLocaleString() + ' a day since you joined, and a daily cap). Keep playing — it refills as days pass.' : 'You are homeless, so you can only draw a tenth of the daily limit. Find a home in WestMap.'); g = Math.floor(room); } if(g <= 0) return 0; }
    const maxIn = Math.floor(L.cfg.maxAcct) - L.acct.b; if(g > maxIn * 1.04) g = Math.max(0, Math.floor(maxIn * 1.04)); if(g <= 0){ limitMsg('Wallet full', 'No account may hold more than $50 trillion.'); return 0; }
    const tax = E.taxOnGross(g, bp());
    if(!move(sys, -g)) return 0; move('gov', tax); logTx(dollars(g - tax), why); changed(); return dollars(g - tax);
  };
  K.earn = (amt, why) => K.earnFrom('pool', amt, why);
  /* spend: you pay `amt` (tax included). false if you can't afford it. */
  K.spendTo = function(sys, amt, why){
    const p = cents(amt); if(!(p >= 0) || !isFinite(p)) return false; if(p === 0) return true; if(p > L.acct.b) return false;
    if(sys === 'arcade' && !L.guest && !L.home){ limitMsg('No home, no casino', 'The Arcade only lets in people with an address. Find a home in WestMap first.'); return false; }
    if(sys === 'pool'){ const sp = E.splitInclusive(p, bp()); move('pool', sp.pool); move('gov', sp.gov); } else move(sys, p);
    logTx(-dollars(p), why); changed(); return true;
  };
  K.spend = (amt, why) => K.spendTo('pool', amt, why);
  K.taxOn = amt => dollars(E.taxOnGross(cents(amt), bp()));
  K.taxRate = () => bp() / 10000;
  L.snapshot = () => ({ acct: clone(L.acct), hist: K.S.bank.hist.slice() });
  L.restore = s => { L.acct = clone(s.acct); K.S.bank.hist = s.hist; K.dirty.delete('cash'); K.emit('cash'); };
  L.arcNetToday = () => { const t = K.now(), a = L.base || L.acct; return (a.dp === t - t % DAY ? a.an : 0) / 100; };

  /* ---------- the save stamp (used by cloud.js): the account as the NEXT revision ---------- */
  L.stamp = function(){
    const a = L.acct, b = L.base || E.newAcct(), t = K.now(), today = t - t % DAY, same = b.dp === today, dP = a.sys.pool - b.sys.pool, dA = a.sys.arcade - b.sys.arcade, n = clone(a);
    n.rev = (b.rev || 0) + 1; n.dp = today; n.pin = Math.max(0, (same ? b.pin : 0) - dP); n.an = (same ? b.an : 0) - dA; return n;
  };
  L.confirm = function(node){ L.base = clone(node); const a = L.acct; a.rev = node.rev; a.dp = node.dp; a.pin = node.pin; a.an = node.an; };
  L.pendingMoney = () => { const a = L.acct, b = L.base; if(!b) return 0; return Math.abs(a.b - b.b); };

  /* a save was refused: was it only a revision clash (the world server collected a bill, or another window wrote first)? re-read and merge. */
  L.resync = async function(){
    if(L.guest || !C.db || !C.user) return 'guest';
    let srv; try{ srv = (await C.db.ref('eco/acct/' + C.user.uid).once('value')).val(); }catch(e){ return 'offline'; }
    if(!srv){ if(L.base){ K.emit('notify', { app: 'Settings', title: 'The economy was reset', body: 'Reloading…' }); setTimeout(() => location.reload(), 1500); } return 'gone'; }
    if(L.base && srv.rev === L.base.rev) return 'same';
    const base = L.base || E.newAcct(), cur = L.acct, m = clone(srv); m.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, m.sys);
    m.b += cur.b - base.b; E.SYS.forEach(k => { m.sys[k] += (cur.sys[k] - base.sys[k]); }); m.s += cur.s - base.s; m.r += cur.r - base.r; ['cl', 'si', 'bp', 'lop', 'hop'].forEach(k => { m[k] = cur[k] || m[k] || ''; });
    L.base = clone(srv);
    if(m.b < 0){ L.acct = clone(srv); K.emit('notify', { app: 'Settings', title: 'Your account changed', body: 'A charge was collected while you were playing, so your latest actions were reverted. Reloading to stay in sync…' }); setTimeout(() => location.reload(), 2500); return 'reverted'; }
    L.acct = m; K.emit('cash'); return 'merged';
  };

  /* ---------- start / stop (called by cloud.js) ---------- */
  L.start = async function(uid, remotePlayer){
    const db = C.db; L.guest = false;
    const [epoch, cfg, og] = await Promise.all([db.ref('eco/epoch').once('value'), db.ref('eco/cfg').once('value'), db.ref('eco/og/' + uid).once('value')]);
    L.epoch = epoch.val(); L.cfg = E.cfgOf({ eco: { cfg: cfg.val() || {} } }); L.og = og.exists();
    if(!L.epoch){ L.offline = true; L.guest = true; L.initGuest(); D.warn('ledger', 'eco/epoch is missing — the new economy has not been started (admin: Settings → Economy → Start)'); return { offline: true }; }
    L.offline = false;
    const sa = await db.ref('eco/acct/' + uid).once('value'); let srv = sa.val();
    if(!srv){ const fresh = E.newAcct(); fresh.cl = fresh.si = fresh.bp = fresh.lop = fresh.hop = ''; fresh.rev = 1; const t = K.now(); fresh.dp = t - t % DAY; fresh.c0 = TS(); await db.ref('eco/acct/' + uid).set(fresh); srv = (await db.ref('eco/acct/' + uid).once('value')).val(); }
    srv.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, srv.sys); ['cl', 'si', 'bp', 'lop', 'hop'].forEach(k => { if(typeof srv[k] !== 'string') srv[k] = ''; });
    L.base = clone(srv); L.acct = clone(srv);
    db.ref('eco/cfg').on('value', s => { L.cfg = E.cfgOf({ eco: { cfg: s.val() || {} } }); K.emit('eco'); });
    db.ref('eco/epoch').on('value', s => { const v = s.val(); if(L.epoch && v && v.n !== L.epoch.n){ K.emit('notify', { app: 'Settings', title: 'New economy', body: 'The WestEconomy was reset — reloading…' }); setTimeout(() => location.reload(), 1500); } });
    db.ref('eco/stats').on('value', s => { L.stats = s.val(); K.emit('eco'); });
    listenBills(uid); listenLoans(uid); listenInbox(uid); listenHome(uid); listenBuild(uid);
    L.started = true; return { offline: false, fresh: !sa.exists() };
  };
  L.stop = function(){ if(!C.db) return; ['eco/cfg', 'eco/epoch', 'eco/stats', 'world/meta', 'world/own', 'world/ev'].forEach(p => { try{ C.db.ref(p).off(); }catch(e){} }); if(C.user){ ['eco/bill/', 'eco/loan/', 'eco/inbox/', 'world/home/'].forEach(p => { try{ C.db.ref(p + C.user.uid).off(); }catch(e){} }); try{ C.db.ref('world/own').orderByChild('o').equalTo(C.user.uid).off(); }catch(e){} } L.started = false; L.world = null; L.mine = {}; L.bills = {}; L.loans = {}; L.home = null; L.homeHouse = null; L.initGuest(); };

  /* ---------- atomic operations: save pending state first, then ONE update the rules check against the ledger ---------- */
  let chain = Promise.resolve();
  L.exec = function(fn, undo){ const run = chain.then(() => doExec(fn, undo)); chain = run.catch(() => {}); return run; };
  async function doExec(fn, undo){
    if(L.guest) return { ok: false, msg: L.offline ? 'The new economy has not been started yet — ask the admin.' : 'Sign in to do that.' };
    if(!(await C.flushNow())) return { ok: false, msg: 'Your account is still saving — try again in a moment.' };
    const snap = L.snapshot(), keep = { cl: L.acct.cl, si: L.acct.si, bp: L.acct.bp, lop: L.acct.lop, hop: L.acct.hop }; let extra;
    try{ extra = await fn(); }catch(e){ L.restore(snap); if(undo) undo(); return { ok: false, msg: String(e && e.message || e) }; }
    if(!extra || extra.error){ L.restore(snap); if(undo) undo(); return { ok: false, msg: (extra && extra.error) || 'Not possible right now.' }; }
    K.dirty.add('cash'); const ok = await C.flushNow(extra.paths || {});
    if(!ok){ await L.resync(); L.restore(snap); if(undo) undo(); Object.assign(L.acct, keep); return { ok: false, msg: 'The server refused that (' + (C.lastErr && C.lastErr.code || why) + '). Nothing was changed.' }; }
    return Object.assign({ ok: true }, extra.result || {});
  }
  const fresh = async p => (await C.db.ref(p).once('value')).val();
  const name = () => (K.S.meta.name || '').slice(0, 20);
  const uid = () => C.user.uid;
  const txid = () => 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const need = async () => { if(!name()) return 'Set a display name first (Settings).'; try{ await C.publishBoard(true); }catch(e){} try{ const n = await fresh('leaderboard/' + uid() + '/name'); if(n !== name()) return 'Your name is not registered yet — wait a moment and try again.'; }catch(e){ return 'Could not check your name — try again.'; } return ''; };
  K.mailSys = (subj, body, from) => K.mailAdd({ id: 'eco-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), from: from || 'WestBank', kind: 'info', subj, body, notify: true });
  const sendTo = (to, amt, kind, ref) => { const a = L.acct; if(a.b < amt) return null; const id = txid(); a.b -= amt; a.s += amt; a.si = to + '/' + id; return { path: 'eco/inbox/' + to + '/' + id, val: { f: uid(), a: amt, k: kind, t: TS(), ref: String(ref || '').slice(0, 60) } }; };
  L.send = (to, dollarsAmt, kind, ref) => L.exec(async () => { const amt = cents(dollarsAmt); if(!(amt > 0)) return { error: 'Enter an amount.' }; const s = sendTo(to, amt, kind, ref); if(!s) return { error: 'Not enough cash.' }; logTx(-dollars(amt), 'Payment'); changed(); return { paths: { [s.path]: s.val } }; });
  /* market purchase: the buyer pays `total` dollars; the seller's inbox gets it minus the market fee, the treasury keeps the fee */
  L.sendSale = (to, total, feeRate, listing, apply, undo) => L.exec(async () => {                // listing = { id, n, q }: the quantity left AFTER this purchase is written in the same update, so the price and the stock are checked together
    const cur = await fresh('market/listings/' + listing.id); if(!cur || cur.q < listing.n) return { error: 'Not enough left in that listing.' };
    const t = cents(total), fee = Math.floor(t * feeRate), s = sendTo(to, t - fee, 'market', listing.n); if(!s) return { error: 'Not enough cash.' }; if(!move('gov', fee)){ return { error: 'Not enough cash.' }; }
    s.val.l = listing.id; s.val.n = listing.n; if(apply) apply(); changed(); return { paths: { [s.path]: s.val, ['market/listings/' + listing.id + '/q']: cur.q - listing.n } };
  }, undo);

  /* ---------- inbox: claim money sent to you ---------- */
  let inboxQ = [], claiming = false;
  function listenInbox(u){ C.db.ref('eco/inbox/' + u).on('child_added', s => { const v = s.val(); if(!v) return; inboxQ.push({ id: s.key, a: v.a, k: v.k, ref: v.ref, f: v.f }); pumpInbox(); }, e => D.error('ledger.inbox', e)); }
  async function pumpInbox(){
    if(claiming || !inboxQ.length || L.guest) return; claiming = true;
    try{
      while(inboxQ.length){ const e = inboxQ[0];
        const r = await L.exec(async () => { const a = L.acct; const cur = await fresh('eco/inbox/' + uid() + '/' + e.id); if(!cur) return { error: 'gone' }; a.b += cur.a; a.r += cur.a; a.cl = e.id; return { paths: { ['eco/inbox/' + uid() + '/' + e.id]: null }, result: { got: cur.a, k: cur.k, ref: cur.ref } }; });
        inboxQ.shift(); if(r.ok){ K.emit('inbox', { amount: dollars(r.got), kind: r.k, ref: r.ref }); changed(); } else if(r.msg !== 'gone'){ await new Promise(res => setTimeout(res, 4000)); }
      }
    } finally { claiming = false; }
  }
  K.on('inbox', e => { if(e.kind === 'rent') K.mailSys('Rent received: $' + e.amount.toFixed(2), 'A tenant paid you rent for one of your houses.', 'WestMap'); else if(e.kind === 'house') K.mailSys('House sold: $' + e.amount.toFixed(2), 'Someone bought your house. The money is in your account.', 'WestMap'); });

  /* ---------- bills (taxes, fines) ---------- */
  function listenBills(u){
    const ref = C.db.ref('eco/bill/' + u), sync = s => { L.bills = s.val() || {}; K.emit('bank'); autoPay(); };
    ref.on('value', sync, e => D.error('ledger.bills', e));
  }
  L.billList = () => Object.keys(L.bills).map(id => Object.assign({ id }, L.bills[id])).sort((a, b) => a.due - b.due);
  L.owed = () => L.billList().reduce((s, b) => s + b.a, 0) / 100;
  L.payBill = id => L.exec(async () => { const b = await fresh('eco/bill/' + uid() + '/' + id); if(!b) return { error: 'That bill is gone.' }; if(!move('gov', b.a)) return { error: 'You need $' + dollars(b.a).toFixed(2) + '.' }; L.acct.bp = id; logTx(-dollars(b.a), b.n || 'Bill'); changed(); return { paths: { ['eco/bill/' + uid() + '/' + id]: null }, result: { paid: dollars(b.a), label: b.n } }; });
  let paying = false;
  async function autoPay(){
    if(paying || L.guest || K.sessionLost) return; paying = true;
    try{ for(const b of L.billList()){ if(L.acct.b >= b.a){ const r = await L.payBill(b.id); if(r.ok) K.emit('notify', { app: 'Bank', title: (r.label || 'Bill') + ' paid', body: '$' + r.paid.toFixed(2) + ' went to the treasury.' }); else break; } } } finally { paying = false; }
  }

  /* ---------- loans ---------- */
  function listenLoans(u){ C.db.ref('eco/loan/' + u).on('value', s => { L.loans = s.val() || {}; K.emit('bank'); }, e => D.error('ledger.loans', e)); }
  L.loanList = () => Object.keys(L.loans).sort().map(slot => { const l = L.loans[slot], plan = L.cfg.plans[l.pl] || { name: l.pl }, due = l.t0 + l.dd * DAY; return { slot, principal: l.p / 100, owed: l.o / 100, plan: l.pl, planName: plan.name, days: l.dd, due, late: Date.now() + K.offset > due, t0: l.t0 }; });
  L.plans = () => Object.keys(L.cfg.plans).map(id => ({ id, name: L.cfg.plans[id].name, days: L.cfg.plans[id].days, interest: L.cfg.plans[id].bp / 10000 }));
  L.loanLimit = () => L.cfg.loanMax / 100;
  L.takeLoan = (planId, amt) => L.exec(async () => {
    const plan = L.cfg.plans[planId], p = cents(amt); if(!plan) return { error: 'Unknown plan.' }; if(!(p >= 100000)) return { error: 'The minimum loan is $1,000.' }; if(p > L.cfg.loanMax) return { error: 'The most you can borrow is $' + (L.cfg.loanMax / 100).toLocaleString() + '.' };
    if(!L.acct.ob) return { error: 'Finish onboarding first.' }; if(!L.home) return { error: 'The bank only lends to people with a home. Find somewhere to live first (WestMap).' };
    const loans = (await fresh('eco/loan/' + uid())) || {}, slot = ['l1', 'l2', 'l3'].find(s => !loans[s]); if(!slot) return { error: 'You already have three loans. Repay one first.' };
    if(!move('bank', -p)) return { error: 'Not possible.' }; L.acct.lop = slot; logTx(dollars(p), 'Loan'); changed();
    return { paths: { ['eco/loan/' + uid() + '/' + slot]: { p, o: E.owedFor(p, plan.bp), pl: planId, dd: plan.days, t0: TS() } }, result: { owed: dollars(E.owedFor(p, plan.bp)) } };
  });
  L.repay = (slot, amt) => L.exec(async () => {
    const l = await fresh('eco/loan/' + uid() + '/' + slot); if(!l) return { error: 'That loan is gone.' };
    const x = Math.min(cents(amt), l.o, L.acct.b); if(!(x > 0)) return { error: 'Not enough cash.' }; if(!move('bank', x)) return { error: 'Not enough cash.' }; L.acct.lop = slot; logTx(-dollars(x), 'Loan repayment'); changed();
    return { paths: { ['eco/loan/' + uid() + '/' + slot]: x >= l.o ? null : Object.assign({}, l, { o: l.o - x }) }, result: { paid: dollars(x), left: dollars(l.o - x) } };
  });
  L.debt = () => L.loanList().reduce((s, l) => s + l.owed, 0);

  /* ---------- building licences & house orders ---------- */
  function listenBuild(u){
    C.db.ref('world/lic/' + u).on('value', s => { L.lic = s.val(); K.emit('world'); }, e => D.error('ledger.lic', e));
    C.db.ref('world/build/' + u).on('value', s => { L.orders = s.val() || {}; K.emit('world'); }, e => D.error('ledger.build', e));
  }
  L.lic = null; L.orders = {};
  L.licActive = () => !!(L.lic && K.now() < L.lic.t0 + L.cfg.licDays * DAY); L.licLeftMs = () => L.lic ? L.lic.t0 + L.cfg.licDays * DAY - K.now() : 0;
  L.buildTypes = () => Object.keys(L.cfg.builds).map(id => ({ id, name: L.cfg.builds[id].n, escrow: Math.floor(L.cfg.builds[id].c * (L.meta.pi || 10000) / 10000) / 100 }));
  const needExec = async (fn) => { const err = await need(); if(err) return { ok: false, msg: err }; return L.exec(fn); };
  L.buyLicence = () => needExec(async () => { const fee = L.cfg.licFee; if(!move('city', fee)) return { error: 'The licence costs $' + dollars(fee).toLocaleString() + '.' }; L.acct.hop = 'lic'; logTx(-dollars(fee), 'Building licence'); changed(); return { paths: { ['world/lic/' + uid()]: { t0: TS() } }, result: { fee: dollars(fee) } }; });
  L.build = type => needExec(async () => {
    const b = L.cfg.builds[type]; if(!b) return { error: 'Unknown house type.' }; const lic = await fresh('world/lic/' + uid()); if(!lic || K.now() >= lic.t0 + L.cfg.licDays * DAY) return { error: 'You need a valid building licence from the council first.' };
    const orders = (await fresh('world/build/' + uid())) || {}, slot = ['b1', 'b2', 'b3'].find(x => !orders[x]); if(!slot) return { error: 'Three houses are already being built — wait for the council to finish.' };
    const pi = (await fresh('world/meta/pi')) || 10000, escrow = Math.floor(b.c * pi / 10000); if(!move('city', escrow)) return { error: 'You need a deposit of $' + dollars(escrow).toLocaleString() + ' (the unused part is refunded).' };
    L.acct.hop = 'bld'; L.acct.lop = slot; logTx(-dollars(escrow), 'House deposit'); changed();
    return { paths: { ['world/build/' + uid() + '/' + slot]: { y: type, t: TS(), c: escrow, on: name() } }, result: { escrow: dollars(escrow) } };
  });

  /* ---------- the welcome grant ---------- */
  L.needsOnboarding = () => !L.guest && !L.offline && (!L.acct.ob || !L.home);
  L.grantAmount = () => dollars(L.cfg.startGrant + (L.og ? L.cfg.ogExtra : 0));
  L.claimGrant = () => L.exec(async () => {
    if(L.acct.ob) return { error: 'Already claimed.' }; const g = L.cfg.startGrant + (L.og ? L.cfg.ogExtra : 0);
    if(!move('pool', -g)) return { error: 'Not possible.' }; L.acct.ob = 1; logTx(dollars(g), 'Welcome grant');
    if(L.og && !K.S.meta.ogGift){ K.S.meta.ogGift = 1; K.invAdd('element', 'Au', 10); K.invAdd('element', 'Ag', 10); K.touch('meta'); }       // OG gift: 10 mol gold + 10 mol silver
    changed(); return { result: { amount: dollars(g), og: L.og } };
  });

  /* ---------- houses ---------- */
  function listenHome(u){
    C.db.ref('world/home/' + u).on('value', s => { const v = s.val(); L.home = v && v.h ? v.h : null; K.emit('home'); if(L.home) watchHome(L.home); else { L.homeHouse = null; } }, e => D.error('ledger.home', e));
    C.db.ref('world/own').orderByChild('o').equalTo(u).on('value', s => { L.mine = s.val() || {}; K.emit('props'); K.emit('cash'); }, e => D.error('ledger.mine', e));
    C.db.ref('world/meta').on('value', s => { L.meta = s.val() || L.meta; K.emit('world'); });
  }
  let homeRef = null;
  function watchHome(hid){ if(homeRef) homeRef.off(); homeRef = C.db.ref('world/own/' + hid); homeRef.on('value', s => { L.homeHouse = s.val(); K.emit('home'); }); }
  L.houseAt = hid => { const g = W.house(+String(hid).slice(1)); return Object.assign({}, g); };
  L.myHouses = () => Object.keys(L.mine).map(id => Object.assign({ id }, L.mine[id], { g: W.house(+id.slice(1)) }));
  L.sellValue = v => dollars(E.sellPrice(v, L.cfg.sellBp));
  K.propValue = () => Object.keys(L.mine).reduce((s, id) => s + dollars(E.sellPrice(L.mine[id].v, L.cfg.sellBp)), 0);
  L.rentDay = h => dollars(h.rh * 24);
  L.dutyOf = price => dollars(E.duty(price, L.cfg.dutyBp));
  L.living = () => { const h = L.homeHouse; if(!h || !L.home) return null; return { id: L.home, house: h, owned: h.o === (C.user && C.user.uid), g: W.house(+L.home.slice(1)) }; };
  L.rentLeftMs = () => { const h = L.homeHouse; if(!h || !C.user || h.t !== C.user.uid) return Infinity; return h.ts + h.th * HOUR - K.now(); };

  /* the world, for WestMap: every house (one value listener; the SDK only downloads the changes after the first load) */
  L.watchWorld = function(cb){
    if(L.world) return; L.world = {}; const db = C.db;
    db.ref('world/own').on('value', s => { L.world = s.val() || {}; K.emit('world'); }, e => D.error('ledger.world', e));
    db.ref('world/ev').on('value', s => { L.events = s.val() || {}; K.emit('world'); });
  };
  L.loadBots = async () => ((await C.db.ref('eco/bots').once('value')).val()) || {};

  async function houseOp(hid, fn){
    const err = await need(); if(err) return { ok: false, msg: err };
    return L.exec(async () => { const h = await fresh('world/own/' + hid); if(!h) return { error: 'That house does not exist.' }; return fn(h); });
  }
  const liveHere = hid => ({ ['world/home/' + uid()]: { h: hid } });
  L.buy = (hid, move_in) => houseOp(hid, async h => {
    const me = uid(); if(h.o === me) return { error: 'You already own it.' };
    let price, paths = {};
    if(h.o === 'bank'){ price = h.v; const duty = E.duty(price, L.cfg.dutyBp); if(L.acct.b < price + duty) return { error: 'You need $' + dollars(price + duty).toLocaleString() + ' (price + ' + (L.cfg.dutyBp / 100) + '% stamp duty).' }; move('city', price); move('gov', duty); L.acct.hop = hid; }
    else { if(!(h.a > 0)) return { error: 'That house is not for sale.' }; price = h.a; const duty = E.duty(price, L.cfg.dutyBp); if(L.acct.b < price + duty) return { error: 'You need $' + dollars(price + duty).toLocaleString() + '.' }; const s = sendTo(h.o, price, 'house', hid); move('gov', duty); paths[s.path] = s.val; }
    paths['world/own/' + hid] = Object.assign({}, h, { o: me, on: name(), a: 0 });
    if(move_in || !L.home) Object.assign(paths, liveHere(hid));
    logTx(-dollars(price), 'House ' + hid); changed(); return { paths, result: { price: dollars(price) } };
  });
  L.sellToCity = hid => houseOp(hid, async h => {
    if(h.o !== uid()) return { error: 'That is not your house.' }; if(h.t) return { error: 'A tenant lives there — wait until their rent runs out, or let them leave.' };
    const price = E.sellPrice(h.v, L.cfg.sellBp); move('city', -price); L.acct.hop = hid; logTx(dollars(price), 'Sold house ' + hid); changed();
    const paths = { ['world/own/' + hid]: Object.assign({}, h, { o: 'bank', on: 'City', a: 0, rh: 0, t: '', tn: '', ts: 0, th: 0 }) }; if(L.home === hid) paths['world/home/' + uid()] = null; return { paths, result: { price: dollars(price) } };
  });
  const edit = (hid, patch) => houseOp(hid, async h => { if(h.o !== uid()) return { error: 'That is not your house.' }; return { paths: { ['world/own/' + hid]: Object.assign({}, h, patch(h)) } }; });
  L.setAsk = (hid, d) => edit(hid, () => ({ a: Math.max(0, cents(d)) }));
  L.setRent = (hid, dPerDay) => edit(hid, h => ({ rh: Math.max(0, Math.min(Math.floor(h.v / 2000), Math.round(cents(dPerDay) / 24))) }));
  L.evict = hid => houseOp(hid, async h => { if(h.o !== uid()) return { error: 'That is not your house.' }; if(h.ts + h.th * HOUR >= K.now() || !h.t) return { error: h.t ? 'They have prepaid rent until ' + new Date(h.ts + h.th * HOUR).toLocaleString() + '.' : 'Nobody lives there.' }; const t = h.t; return { paths: { ['world/own/' + hid]: Object.assign({}, h, { t: '', tn: '', ts: 0, th: 0 }) }, result: { tenant: t } }; });
  const payHouse = (h, hid, amt) => { if(h.o === 'bank'){ if(!move('city', amt)) return null; L.acct.hop = hid; return {}; } const s = sendTo(h.o, amt, 'rent', hid); return s ? { [s.path]: s.val } : null; };
  L.rent = (hid, hours) => houseOp(hid, async h => {
    hours = Math.floor(hours); if(!(hours >= 1 && hours <= 720)) return { error: 'Choose 1–720 hours of rent.' }; if(h.t || !(h.rh > 0)) return { error: 'That house is not available to rent.' }; if(h.o === uid()) return { error: 'It is your own house.' };
    const cost = h.rh * hours; if(L.acct.b < cost) return { error: 'You need $' + dollars(cost).toFixed(2) + '.' };
    const pay = payHouse(h, hid, cost); if(!pay) return { error: 'Not enough cash.' }; logTx(-dollars(cost), 'Rent ' + hid); changed();
    const paths = Object.assign({ ['world/own/' + hid]: Object.assign({}, h, { t: uid(), tn: name(), ts: TS(), th: hours }) }, pay, liveHere(hid)); return { paths, result: { cost: dollars(cost) } };
  });
  L.topUp = hours => { const hid = L.home; if(!hid) return Promise.resolve({ ok: false, msg: 'You do not rent a home.' }); return houseOp(hid, async h => {
    hours = Math.floor(hours); if(h.t !== uid()) return { error: 'You are not renting this house.' }; if(!(hours >= 1 && hours <= 720)) return { error: 'Choose 1–720 hours.' }; if(h.th + hours > 720 * 3) return { error: 'That is a lot of prepaid rent.' };
    const cost = h.rh * hours, pay = payHouse(h, hid, cost); if(!pay) return { error: 'You need $' + dollars(cost).toFixed(2) + '.' }; logTx(-dollars(cost), 'Rent ' + hid); changed();
    return { paths: Object.assign({ ['world/own/' + hid]: Object.assign({}, h, { th: h.th + hours }) }, pay), result: { cost: dollars(cost) } }; }); };
  L.leave = () => { const hid = L.home; if(!hid) return Promise.resolve({ ok: false, msg: 'You do not live anywhere.' }); return houseOp(hid, async h => { if(h.t !== uid()) return { error: 'You do not rent this house.' }; return { paths: { ['world/own/' + hid]: Object.assign({}, h, { t: '', tn: '', ts: 0, th: 0 }), ['world/home/' + uid()]: null } }; }); };
  L.setHome = hid => houseOp(hid, async h => { if(h.o !== uid() && h.t !== uid()) return { error: 'You can only live in a house you own or rent.' }; return { paths: liveHere(hid) }; });
  L.moveOut = () => L.exec(async () => ({ paths: { ['world/home/' + uid()]: null } }));
  L.requestHousing = async () => { try{ await C.db.ref('world/req/' + uid()).set({ t: TS() }); return { ok: true, msg: 'Request sent — the city builds more houses when demand is high.' }; }catch(e){ return { ok: false, msg: 'You already asked in the last hour.' }; } };
  L.homeless = () => !L.guest && !L.offline && !!L.acct.ob && !L.home;
  /* keep the roof over your head: top up rent while you are online and it is running low */
  setInterval(async () => {
    if(L.guest || K.sessionLost || document.hidden || !L.home || !K.prefs || K.prefs.autoRent === false) return; const left = L.rentLeftMs(); const h = L.homeHouse;
    if(h && left < 12 * HOUR && h.th < 720 * 3 && L.acct.b >= h.rh * 24 * 2){ const r = await L.topUp(24); if(r.ok) K.emit('notify', { app: 'WestMap', title: 'Rent paid', body: '24 more hours at your home — $' + r.cost.toFixed(2) + '.' }); }
  }, 60000);
  K.on('auth', () => { if(!C.signedIn() && L.started) L.stop(); });
});
