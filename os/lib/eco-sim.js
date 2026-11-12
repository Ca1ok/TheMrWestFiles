/* LIB · eco-sim — the WestEconomy's "server": bots, housing, taxes, loans, events. Pure functions over a plain `db` object shaped like the Firebase tree
 * ( eco.{acct,inbox,bill,loan,dead,cfg,stats,og,bots,epoch}  world.{own,meta,home,ev,req}  market.listings ), so the GitHub Action runs exactly the code the
 * tests run. EVERY money movement goes through os/lib/economy.js (sysMove / send / claimAll), so the supply can never change: step() ends by auditing,
 * and the Action refuses to write anything back if the audit fails. The Action owns accounts of bots and the system; player accounts are only ever
 * touched to collect an overdue bill/loan (a transaction on that one record), never to "edit" their balance.
 *
 * Time: one step() may cover anything from minutes to hours (GitHub's cron is best-effort). Everything scales with the elapsed time, and the
 * once-a-day jobs catch up (at most 3 days at a time). */
(function(root, factory){ if(typeof module === 'object' && module.exports){ module.exports = factory(require('./economy.js'), require('./worldgen.js')); } else root.EcoSim = factory(root.Economy, root.WorldGen); })(typeof self !== 'undefined' ? self : this, function(E, W){
  const DAY = 86400000, HOUR = 3600000, SYS = E.SYS;
  const INIT_HOUSES = 512, INIT_BOTS = 100, BIRTHS_PER_WEEK = 10;
  const PUBLIC_JOBS = { teacher: 1, nurse: 1, librarian: 1, surveyor: 1 };
  const WAGE = [0, 3500, 6000, 10000, 18000, 32000];                    // cents per day by job tier (35 … 320 dollars)

  function rng(seed){ let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rentHour = (v, cfg) => Math.max(1, Math.floor(v * cfg.rentBpDay / 10000 / 24));
  const isBot = id => /^b\d+$/.test(id);

  /* ---------- genesis: a brand-new economy (also used for the admin "reset") ---------- */
  function genesis(db, now, ogUids){
    const cfg = Object.assign({}, E.DEFAULTS);
    db.eco = { acct: {}, inbox: {}, bill: {}, loan: {}, dead: { sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0 }, cfg, stats: {}, og: {}, bots: {}, epoch: { n: (((db.eco || {}).epoch || {}).n || 0) + 1, t: now } };
    (ogUids || []).forEach(u => { db.eco.og[u] = true; });
    db.world = { own: {}, meta: { n: INIT_HOUSES, nb: 0, pi: 10000, day: Math.floor(now / DAY), wk: Math.floor(now / (7 * DAY)) }, home: {}, ev: {}, req: null };
    for(let i = 0; i < INIT_HOUSES; i++) db.world.own['h' + i] = newHouse(i, 10000, cfg);
    db.market = db.market || {}; db.market.listings = {};
    for(let i = 0; i < INIT_BOTS; i++) spawnBot(db, now, true, 0);
    stats(db, now); return db;
  }
  function newHouse(i, pi, cfg){ const g = W.house(i), v = Math.max(100000, Math.round(g.base * pi / 10000 / 1000) * 1000); return { o: 'bank', on: 'City', v, a: 0, rh: rentHour(v, cfg), t: '', tn: '', ts: 0, th: 0, dm: 0, f: 0 }; }
  function spawnBot(db, now, initial, rand){
    const m = db.world.meta; m.nb = (m.nb || 0) + 1; const c = W.bot(m.nb), id = c.id;
    const age = initial ? Math.floor((rand || Math.random)() * c.lifespanDays * 0.4) : 0;                 // the first 100 start at different ages so they don't all die together
    db.eco.bots[id] = { n: c.name, j: c.job, c: c.color, bio: c.bio, born: now - age * DAY, die: now - age * DAY + c.lifespanDays * DAY, h: '', cash: 0, tier: c.tier, th: c.thrift, ll: c.landlord, ri: c.risk };
    E.acctOf(db, id); E.sysMove(db, id, 'pool', -db.eco.cfg.botGrant); db.eco.acct[id].ob = 1; return id;
  }

  /* ---------- small ledger helpers with tax ---------- */
  const cfgOf = db => E.cfgOf(db);
  function earnFromPool(db, id, gross, cfg){ if(gross <= 0) return 0; const tax = E.taxOnGross(gross, cfg.taxBp); E.sysMove(db, id, 'pool', -gross); E.sysMove(db, id, 'gov', tax); return gross - tax; }
  function spendToPool(db, id, paid, cfg){ const a = E.acctOf(db, id); paid = Math.min(paid, a.b); if(paid <= 0) return 0; const sp = E.splitInclusive(paid, cfg.taxBp); E.sysMove(db, id, 'pool', sp.pool); E.sysMove(db, id, 'gov', sp.gov); return paid; }
  // move money between two system accounts (e.g. gov → city) with the ledger's hidden _sys account, so the audit still balances
  function sysTransfer(db, from, to, amt){ if(!(amt > 0)) return; const a = E.acctOf(db, '_sys'); a.sys[from] -= amt; a.sys[to] += amt; a.rev++; }
  const sysBalance = db => E.audit(db).sys;
  /* a system account pays an account (through its inbox): the hidden _sys account is credited by the system, then sends — so the ledger stays balanced */
  function payFromSys(db, sys, to, amt, kind, ref, now){ if(!(amt > 0)) return null; const a = E.acctOf(db, '_sys'); a.sys[sys] -= amt; a.b += amt; a.rev++; return E.send(db, '_sys', to, amt, kind, ref, now); }
  function ensureCity(db, need){ const bal = sysBalance(db); if(bal.city >= need) return; const short = need - bal.city, gov = Math.max(0, Math.floor(bal.gov * 0.5)), fromGov = Math.min(short, gov); sysTransfer(db, 'gov', 'city', fromGov); sysTransfer(db, 'pool', 'city', short - fromGov); }

  /* ---------- helpers on the house table ---------- */
  function ownedBy(db){ const m = {}; Object.keys(db.world.own).forEach(h => { const o = db.world.own[h].o; (m[o] = m[o] || []).push(h); }); return m; }
  const stdRent = (hs, cfg) => rentHour(hs.v, cfg);
  function giveHouseToBank(db, hid, cfg, keepTenant){
    const h = db.world.own[hid]; h.o = 'bank'; h.on = 'City'; h.a = 0; h.rh = stdRent(h, cfg);
    if(!keepTenant){ if(h.t) tenantLeaves(db, h, hid); }
  }
  function tenantLeaves(db, h, hid){ const t = h.t; h.t = ''; h.tn = ''; h.ts = 0; h.th = 0; if(isBot(t)){ if(db.eco.bots[t] && db.eco.bots[t].h === hid) db.eco.bots[t].h = ''; } else if(db.world.home[t] && db.world.home[t].h === hid) delete db.world.home[t]; return t; }

  /* ---------- rent ---------- */
  function payRent(db, payer, hid, hours, now){
    const h = db.world.own[hid], cost = h.rh * hours, a = E.acctOf(db, payer); if(h.rh <= 0 || a.b < cost) return false;
    if(h.o === 'bank') E.sysMove(db, payer, 'city', cost); else E.send(db, payer, h.o, cost, 'rent', hid, now);
    if(h.t === payer){ h.th += hours; } else { h.t = payer; h.tn = (db.eco.bots[payer] || {}).n || 'Resident'; h.ts = now; h.th = hours; }
    return true;
  }

  /* ---------- the bots ---------- */
  function botStep(db, id, now, rand, cfg, mails, own){
    const rec = db.eco.bots[id], a = db.eco.acct[id]; if(!rec || !a) return;
    E.claimAll(db, id);
    if(now >= rec.die){ killBot(db, id, now, cfg); return; }
    const mine = own[id] || [];
    // where do I live?
    let home = rec.h && db.world.own[rec.h] && (db.world.own[rec.h].o === id || db.world.own[rec.h].t === id) ? rec.h : ''; rec.h = home;
    // keep paying rent a few hours before it runs out
    if(home && db.world.own[home].t === id){ const h = db.world.own[home], left = h.ts + h.th * HOUR - now; if(left < 6 * HOUR) payRent(db, id, home, 24, now); }
    if(!rec.h){ // find a home: rent something that matches my income, else squat nowhere (homeless bots just keep looking)
      const wage = WAGE[rec.tier] || 3500, maxRent = Math.max(1, Math.floor(wage * 0.4 / 24));
      const opts = Object.keys(db.world.own).filter(k => { const h = db.world.own[k]; return h.rh > 0 && !h.t && h.o !== id && h.rh <= maxRent && h.dm < 60; }).sort((x, y) => db.world.own[y].rh - db.world.own[x].rh);
      if(opts.length){ const k = opts[Math.floor(rand() * Math.min(opts.length, 6))]; if(a.b >= db.world.own[k].rh * 72 && payRent(db, id, k, 24, now)) rec.h = k; }
    }
    // buy a house: thrifty bots with savings, landlords more often
    const want = 1 + Math.floor(rec.ll * 6);
    if(mine.length < want && rand() < 0.03 + 0.12 * rec.ll && a.b > 2500000){
      const budget = a.b * (0.55 + 0.3 * rec.ll);
      const opts = Object.keys(db.world.own).filter(k => { const h = db.world.own[k]; return h.o === 'bank' && h.v <= budget / (1 + cfg.dutyBp / 10000) && h.dm < 40; });
      const best = opts.sort((x, y) => (db.world.own[y].rh / db.world.own[y].v) - (db.world.own[x].rh / db.world.own[x].v))[Math.floor(rand() * Math.min(5, opts.length))];
      if(best){ const h = db.world.own[best], duty = E.duty(h.v, cfg.dutyBp);
        if(E.sysMove(db, id, 'city', h.v) && E.sysMove(db, id, 'gov', duty)){ const tenant = h.t; h.o = id; h.on = rec.n; h.a = 0;
          if(!tenant && !rec.h){ rec.h = best; h.rh = 0; } else if(!tenant) h.rh = stdRent(h, cfg); } }
    }
    // buy a house somebody listed for sale (players and bots), if it's a fair price
    if(rand() < 0.03 && a.b > 2000000){ const k = Object.keys(db.world.own).find(x => { const h = db.world.own[x]; return h.o !== 'bank' && h.o !== id && h.a > 0 && h.a <= h.v * 1.2 && h.a * 1.05 <= a.b * 0.8; });
      if(k){ const h = db.world.own[k], ask = h.a, seller = h.o, duty = E.duty(ask, cfg.dutyBp); if(E.send(db, id, seller, ask, 'house', k, now) && E.sysMove(db, id, 'gov', duty)){ h.o = id; h.on = rec.n; h.a = 0; } } }
    // money trouble: list a spare house
    if(a.b < 300000 && mine.length > (rec.h && db.world.own[rec.h] && db.world.own[rec.h].o === id ? 1 : 0)){ const k = mine.find(x => x !== rec.h && !db.world.own[x].t); if(k) db.world.own[k].a = Math.round(db.world.own[k].v * 1.05); }
    // buy something from a player's market listing now and then
    if(rand() < 0.12 && a.b > 400000){ const L = db.market && db.market.listings || {}, ids = Object.keys(L).filter(k => L[k] && L[k].q > 0 && L[k].p > 0 && L[k].u);
      if(ids.length){ const k = ids[Math.floor(rand() * ids.length)], l = L[k], unit = Math.round(l.p * 100), maxQ = Math.min(l.q, Math.max(1, Math.floor(l.q * 0.25)), 3, Math.floor(a.b * 0.05 / unit));
        if(maxQ >= 1 && unit > 0 && unit * maxQ <= a.b * 0.05){ const cost = unit * maxQ, fee = Math.floor(cost * 0.05); if(E.send(db, id, l.u, cost - fee, 'market', k, now)){ E.sysMove(db, id, 'gov', fee); l.q -= maxQ; if(l.q <= 0) l.q = 0; db.market.sold = (db.market.sold || 0) + maxQ; } } } }
    rec.cash = Math.round(a.b / 100);
  }
  function killBot(db, id, now, cfg){
    const rec = db.eco.bots[id], a = db.eco.acct[id]; E.claimAll(db, id);
    Object.keys(db.world.own).forEach(k => { const h = db.world.own[k]; if(h.o === id){ giveHouseToBank(db, k, cfg, true); } else if(h.t === id){ tenantLeaves(db, h, k); } });
    const estate = Math.floor(a.b * 0.1); if(estate > 0) E.sysMove(db, id, 'gov', estate); if(a.b > 0) E.sysMove(db, id, 'pool', a.b);        // 10% estate tax, the rest goes back to the pool
    const d = db.eco.dead; SYS.forEach(k => { d.sys[k] += a.sys[k] || 0; }); d.s += a.s; d.r += a.r; delete db.eco.acct[id]; delete db.eco.bots[id]; delete db.eco.inbox[id]; db.world.meta.died = (db.world.meta.died || 0) + 1;
  }

  /* ---------- daily jobs ---------- */
  function daily(db, now, rand, cfg, mails){
    const own = ownedBy(db), m = db.world.meta;
    // wages & living costs for bots
    let govBal = sysBalance(db).gov;
    Object.keys(db.eco.bots).forEach(id => { const r = db.eco.bots[id], a = db.eco.acct[id]; if(!a) return;
      const wage = WAGE[r.tier] || 3500, src = PUBLIC_JOBS[r.j] && govBal > wage * 4 ? 'gov' : 'pool';       // teachers, nurses… are paid from the treasury while it can afford them
      const tax = E.taxOnGross(wage, cfg.taxBp); E.sysMove(db, id, src, -wage); E.sysMove(db, id, 'gov', tax); if(src === 'gov') govBal -= wage - tax;
      spendToPool(db, id, Math.round(wage * (0.28 + 0.30 * (1 - r.th))), cfg);              // groceries, bills, fun
      // property + wealth tax, taken straight away from bots
      let pt = 0; (own[id] || []).forEach(h => { pt += Math.ceil(db.world.own[h].v * cfg.propTaxBpDay / 10000); });
      if(pt > 0) E.sysMove(db, id, 'gov', Math.min(pt, a.b));
      const wt = E.wealthTax(a.b, cfg); if(wt > 0) E.sysMove(db, id, 'gov', Math.min(wt, a.b));
    });
    // bills & taxes for players (the browser pays them; the bank enforces)
    Object.keys(db.eco.acct).forEach(id => { if(isBot(id) || id === '_sys') return; const a = db.eco.acct[id];
      let pt = 0; (own[id] || []).forEach(h => { pt += Math.ceil(db.world.own[h].v * cfg.propTaxBpDay / 10000); });
      if(pt > 0) addBill(db, id, pt, 'ptax', 'Property tax', now);
      const w = E.wealthTax(a.b, cfg); if(w > 0) addBill(db, id, w, 'wealth', 'Wealth tax', now); });
    // house price index follows demand: scarce vacant houses push prices up, a glut pushes them down
    const houses = Object.keys(db.world.own), vacant = houses.filter(k => db.world.own[k].o === 'bank' && !db.world.own[k].t).length, share = vacant / Math.max(1, houses.length);
    m.pi = Math.round(clamp(m.pi * (1 + clamp((0.5 - share) * 0.05, -0.012, 0.012)), 6000, 30000));
    houses.forEach(k => { const h = db.world.own[k], g = W.house(+k.slice(1)); const v = Math.max(100000, Math.round(g.base * m.pi / 10000 / 1000) * 1000); if(v !== h.v){ h.v = v; if(h.o === 'bank') h.rh = rentHour(v, cfg); } });
    // loans: interest is fixed at signing, so only lateness grows; collect from the account after 3 days late, seize houses after 14
    Object.keys(db.eco.loan).forEach(u => Object.keys(db.eco.loan[u] || {}).forEach(slot => { const l = db.eco.loan[u][slot]; if(!l) return; const late = (now - (l.t0 + l.dd * DAY)) / DAY; if(late <= 0) return;
      l.l = (l.l || 0) + 1; l.o = Math.min(Math.ceil(l.p * (1 + (cfg.plans[l.pl] ? cfg.plans[l.pl].bp : 0) / 10000) * 1.5), Math.ceil(l.o * (1 + cfg.lateBpDay / 10000)));
      const a = db.eco.acct[u]; if(a && late > 3){ const take = Math.min(a.b, l.o); if(take > 0 && E.sysMove(db, u, 'bank', take)){ l.o -= take; } }
      if(l.o > 0 && late > 14) seizeFor(db, u, l.o, cfg, own, v => { l.o = Math.max(0, l.o - v); }, now, mails, 'loan');
      if(l.o <= 0) delete db.eco.loan[u][slot]; if(!Object.keys(db.eco.loan[u] || {}).length) delete db.eco.loan[u]; }));
    // enforce unpaid bills
    Object.keys(db.eco.bill).forEach(u => { Object.keys(db.eco.bill[u] || {}).forEach(bid => { const b = db.eco.bill[u][bid]; const late = (now - b.due) / DAY; if(late <= 0) return;
      b.a = Math.min(b.a0 * 2, Math.ceil(b.a * (1 + cfg.lateBpDay / 10000)));
      const a = db.eco.acct[u]; if(a && late > 3){ const take = Math.min(a.b, b.a); if(take > 0 && E.sysMove(db, u, 'gov', take)){ b.a -= take; } }
      if(b.a > 0 && late > 7) seizeFor(db, u, b.a, cfg, own, v => { b.a = Math.max(0, b.a - v); }, now, mails, 'bill');
      if(b.a <= 0) delete db.eco.bill[u][bid]; });
      if(!Object.keys(db.eco.bill[u] || {}).length) delete db.eco.bill[u]; });
    m.day = Math.floor(now / DAY);
  }
  function addBill(db, uid, amt, kind, label, now){ db.eco.bill[uid] = db.eco.bill[uid] || {}; const id = kind + Math.floor(now / DAY).toString(36); const cur = db.eco.bill[uid][id]; if(cur){ cur.a += amt; cur.a0 += amt; return; } db.eco.bill[uid][id] = { a: amt, a0: amt, k: kind, n: label, t: now, due: now + 3 * DAY }; }
  /* last resort for an unpaid debt: the city takes the player's cheapest houses (valued at the buy-back price) until it's covered; the debt is written down by that value */
  function seizeFor(db, uid, owed, cfg, own, reduce, now, mails, why){
    const hs = (ownedBy(db)[uid] || []).slice().sort((x, y) => db.world.own[x].v - db.world.own[y].v); let left = owed;
    for(const k of hs){ if(left <= 0) break; const h = db.world.own[k], val = E.sellPrice(h.v, cfg.sellBp); giveHouseToBank(db, k, cfg, true); reduce(val); left -= val; if(db.world.home[uid] && db.world.home[uid].h === k && !(db.world.own[k].t === uid)) delete db.world.home[uid];
      mails.push({ uid, subj: 'Property seized', body: 'Your unpaid ' + (why === 'loan' ? 'loan' : 'tax bill') + ' was settled by the city taking ' + (W.house(+k.slice(1)).addr) + ', credited at ' + (val / 100).toFixed(2) + '.' }); }
  }

  /* ---------- evictions, events, building ---------- */
  function tenancies(db, now, last, cfg, mails){
    Object.keys(db.world.own).forEach(k => { const h = db.world.own[k]; if(!h.t) return; const end = h.ts + h.th * HOUR;
      if(!isBot(h.t) && end - 6 * HOUR <= now && end - 6 * HOUR > last && now < end) mails.push({ uid: h.t, subj: 'Rent running out', body: 'Your rent at ' + W.house(+k.slice(1)).addr + ' covers less than six more hours. Top it up in WestMap or you will be evicted.' });
      if(now > end + cfg.graceHours * HOUR){ const t = h.t; tenantLeaves(db, h, k); if(!isBot(t)) mails.push({ uid: t, subj: 'Evicted', body: 'You ran out of rent at ' + W.house(+k.slice(1)).addr + ' and have been evicted. You are homeless until you rent or buy somewhere — open WestMap.' }); } });
    Object.keys(db.world.home).forEach(u => { const hh = db.world.home[u]; const h = hh && db.world.own[hh.h]; if(!h || (h.o !== u && h.t !== u)) delete db.world.home[u]; });
  }
  function events(db, now, dt, rand, cfg, mails){
    const feed = db.world.ev, houses = Object.keys(db.world.own), stations = W.districtCount(houses.length); const push = (o) => { const id = 'e' + now.toString(36) + Math.floor(rand() * 1e4).toString(36); feed[id] = Object.assign({ t: now }, o); };
    const nearest = (type, x, y) => { let best = 1e9; for(let k = 0; k < stations; k++){ const s = W.stations(k).find(q => q.t === type); const d = Math.hypot(s.x - x, s.y - y); if(d < best) best = d; } return best; };
    const pFire = 1 - Math.exp(-0.004 * dt / DAY);                                                           // every house has the same chance, whoever owns it
    houses.forEach(k => { const h = db.world.own[k]; if(h.f && now - h.f > 3 * DAY && !h.dm) h.f = 0; if(rand() >= pFire) return;
      const g = W.house(+k.slice(1)), dist = nearest('fire', g.x, g.y), resp = Math.round((3 + dist * 0.12) * 10) / 10, sev = Math.round(clamp((20 + rand() * 50) * clamp(0.6 + dist / 150, 0.6, 1.5), 5, 95));
      h.f = now; h.dm = Math.max(h.dm || 0, sev);
      push({ k: 'fire', h: k, d: g.district, a: g.addr, dm: sev, resp, who: h.t || h.o });
      const resident = h.t || (h.o !== 'bank' ? h.o : ''), payer = h.o !== 'bank' ? h.o : '';
      if(payer){ const cost = Math.ceil(h.v * sev / 100 * 0.12);
        if(isBot(payer)){ const a = db.eco.acct[payer]; if(a){ const pay = Math.min(a.b, cost); E.sysMove(db, payer, 'gov', pay); h.dm = 0; h.f = 0; } } else { addBill(db, payer, cost, 'fire', 'Fire repair', now); mails.push({ uid: payer, subj: 'Fire at ' + g.addr, body: 'A fire damaged your property (' + sev + '%). Fire crews arrived in ' + resp + ' min. A repair bill of ' + (cost / 100).toFixed(2) + ' was issued; pay it in the Bank app and the house is repaired.' }); }
      } else { h.dm = 0; h.f = 0; }                                                                           // the city repairs its own houses
      if(resident && !isBot(resident) && resident !== payer) mails.push({ uid: resident, subj: 'Fire at your home', body: 'A fire broke out at ' + g.addr + '. Fire crews arrived in ' + resp + ' min.' });
    });
    // repairs: when a fire bill is paid (the bill disappears) the house is repaired
    houses.forEach(k => { const h = db.world.own[k]; if(h.dm > 0 && h.o !== 'bank' && !isBot(h.o)){ const bills = db.eco.bill[h.o] || {}; if(!Object.keys(bills).some(b => bills[b].k === 'fire')){ h.dm = 0; h.f = 0; } } });
    // medical emergencies and break-ins: equal chance for every resident
    const residents = []; houses.forEach(k => { const h = db.world.own[k]; if(h.t) residents.push([h.t, k]); else if(h.o !== 'bank' && h.rh === 0) residents.push([h.o, k]); });
    const pMed = 1 - Math.exp(-0.02 * dt / DAY), pCrime = 1 - Math.exp(-0.01 * dt / DAY);
    residents.forEach(([u, k]) => { const g = W.house(+k.slice(1));
      if(rand() < pMed){ const a = db.eco.acct[u], cost = a ? clamp(Math.floor(a.b * 0.015), 3000, 150000) : 3000, dist = nearest('ambulance', g.x, g.y), resp = Math.round((4 + dist * 0.1) * 10) / 10; push({ k: 'medical', h: k, d: g.district, a: g.addr, resp, who: u });
        if(isBot(u)){ if(a) E.sysMove(db, u, 'gov', Math.min(cost, a.b)); } else { addBill(db, u, cost, 'medical', 'Hospital bill', now); mails.push({ uid: u, subj: 'Ambulance called', body: 'An ambulance reached ' + g.addr + ' in ' + resp + ' min. West General has billed ' + (cost / 100).toFixed(2) + '.' }); } }
      if(rand() < pCrime){ const dist = nearest('police', g.x, g.y), resp = Math.round((3 + dist * 0.1) * 10) / 10, caught = rand() < clamp(0.85 - dist / 400, 0.3, 0.9);
        push({ k: 'police', h: k, d: g.district, a: g.addr, resp, caught, who: u });
        if(caught){ const botIds = Object.keys(db.eco.bots), th = botIds[Math.floor(rand() * botIds.length)], ta = th && db.eco.acct[th]; if(ta){ const fine = Math.min(ta.b, 20000 + Math.floor(rand() * 30000)); if(fine > 0) E.sysMove(db, th, 'gov', fine); } } } });
    const ids = Object.keys(feed).sort(); while(ids.length > 60){ delete feed[ids.shift()]; }
  }
  function build(db, now, rand, cfg){
    const m = db.world.meta, houses = Object.keys(db.world.own), vacant = houses.filter(k => db.world.own[k].o === 'bank' && !db.world.own[k].t).length;
    const req = db.world.req ? Object.keys(db.world.req).length : 0;
    if(vacant >= Math.max(20, Math.floor(houses.length * 0.1)) && req < 3) return 0;
    const k = clamp(Math.ceil(houses.length * 0.05), 8, 64); let cost = 0; const base = m.n;
    for(let i = 0; i < k; i++){ const h = newHouse(base + i, m.pi, cfg); db.world.own['h' + (base + i)] = h; cost += Math.floor(h.v * cfg.buildBp / 10000); }
    // the city pays the builders (the pool); if the city is short, gov tops it up first, then the pool
    ensureCity(db, cost); sysTransfer(db, 'city', 'pool', cost); m.n += k; m.built = (m.built || 0) + k; db.world.req = null; return k;
  }

  /* ---------- houses commissioned by players (building licence + escrow paid to the city by the browser) ----------
   * The city builds the next free plots until one matches the order, charges the house's real value + markup out of the escrow and refunds the rest. */
  function builds(db, now, cfg, mails){
    const reqs = db.world.build; if(!reqs) return 0; let made = 0, m = db.world.meta;
    Object.keys(reqs).forEach(uid => Object.keys(reqs[uid] || {}).forEach(slot => { const r = reqs[uid][slot]; if(!r) return;
      let found = null, cost = 0, base = m.n, scanned = 0; const planned = [];
      for(let i = 0; i < 80 && !found; i++){ const g = W.house(base + i); planned.push(base + i); scanned++; if(g.type === r.y && g.k < 1e9) found = base + i; }
      if(found === null){ payFromSys(db, 'city', uid, r.c, 'refund', slot, now); mails.push({ uid, subj: 'Build order refunded', body: 'The council could not find a plot for your ' + r.y + ' — the full ' + (r.c / 100).toFixed(2) + ' was refunded.' }); delete reqs[uid][slot]; return; }
      planned.forEach(i => { const h = newHouse(i, m.pi, cfg); db.world.own['h' + i] = h; cost += Math.floor(h.v * cfg.buildBp / 10000); });
      const mine = db.world.own['h' + found]; mine.o = uid; mine.on = r.on || 'Resident'; mine.rh = 0;
      const price = Math.min(r.c, Math.ceil(mine.v * cfg.buildMarkupBp / 10000)); m.n = base + scanned; m.built = (m.built || 0) + scanned; made++;
      ensureCity(db, cost + Math.max(0, r.c - price)); sysTransfer(db, 'city', 'pool', cost);                                  // builders (and the plots built along the way) are paid by the city
      if(r.c > price) payFromSys(db, 'city', uid, r.c - price, 'refund', slot, now);
      mails.push({ uid, subj: 'Your new house is ready', body: 'The council finished your ' + r.y + ' at ' + W.house(found).addr + ', ' + W.house(found).district + '. Final price ' + (price / 100).toFixed(2) + (r.c > price ? '; ' + ((r.c - price) / 100).toFixed(2) + ' of your deposit was refunded.' : '.') + ' It is listed in your houses in WestMap.' });
      delete reqs[uid][slot]; }));
    Object.keys(reqs).forEach(u => { if(!Object.keys(reqs[u] || {}).length) delete reqs[u]; });
    return made;
  }

  /* ---------- statistics + the stock market's mood ---------- */
  function stats(db, now){
    const A = E.audit(db), houses = Object.keys(db.world.own), vacant = houses.filter(k => db.world.own[k].o === 'bank' && !db.world.own[k].t).length;
    const bots = Object.keys(db.eco.bots), cash = bots.reduce((s, b) => s + ((db.eco.acct[b] || {}).b || 0), 0), housed = bots.filter(b => db.eco.bots[b].h).length;
    let unpaid = 0, billed = 0; Object.keys(db.eco.bill).forEach(u => Object.keys(db.eco.bill[u]).forEach(b => { unpaid += db.eco.bill[u][b].a; billed += db.eco.bill[u][b].a0; }));
    const avgBot = bots.length ? cash / bots.length / 100 : 0, pi = db.world.meta.pi / 10000;
    const health = 1 + 0.12 * Math.tanh(avgBot / 50000 - 1) + 0.08 * Math.tanh(pi - 0.8) + 0.05 * Math.tanh((housed / Math.max(1, bots.length)) * 2 - 1.6) - 0.1 * Math.tanh(unpaid / Math.max(1, billed || 1));
    const flags = []; Object.keys(db.eco.acct).forEach(id => { const a = db.eco.acct[id]; if(isBot(id) || id === '_sys' || !a.c0) return; const allow = E.allowance(E.cfgOf(db), a.c0, now), used = -(a.sys.pool || 0); if(used > allow * 0.85) flags.push({ u: id, r: Math.round(used / allow * 100) / 100 }); });
    db.eco.stats = { t: now, flags: flags.slice(0, 10), sys: A.sys, held: A.held, flight: A.flight, ok: A.ok, players: Object.keys(db.eco.acct).filter(i => !isBot(i) && i !== '_sys').length, bots: bots.length, housed, houses: houses.length, vacant, pi: db.world.meta.pi, avgBot: Math.round(avgBot), health: Math.round(health * 1000) / 1000, died: db.world.meta.died || 0, built: db.world.meta.built || 0 };
    return db.eco.stats;
  }

  /* ---------- one step of the world ---------- */
  function step(db, now, seed){
    const cfg = cfgOf(db), rand = rng(seed || now), m = db.world.meta, mails = [], last = m.t || now - 10 * 60000, dt = clamp(now - last, 60000, 6 * HOUR); m.t = now;
    for(let i = 0; i < 3 && m.day < Math.floor(now / DAY); i++){ daily(db, Math.min(now, (m.day + 1) * DAY + 1), rand, cfg, mails); if(m.day < Math.floor(now / DAY) - 3) m.day = Math.floor(now / DAY) - 3; }
    const wk = Math.floor(now / (7 * DAY)); if(wk > (m.wk || 0)){ for(let i = 0; i < BIRTHS_PER_WEEK; i++) spawnBot(db, now, false, rand); m.wk = wk; }
    const own = ownedBy(db), ids = Object.keys(db.eco.bots); for(let i = ids.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    ids.forEach(id => botStep(db, id, now, rand, cfg, mails, own));
    tenancies(db, now, last, cfg, mails); events(db, now, dt, rand, cfg, mails); builds(db, now, cfg, mails); build(db, now, rand, cfg);
    Object.keys(db.eco.inbox).forEach(u => { if(!Object.keys(db.eco.inbox[u] || {}).length) delete db.eco.inbox[u]; });
    const s = stats(db, now); return { mails, stats: s };
  }
  return { genesis, step, stats, builds, payFromSys, rng, newHouse, spawnBot, killBot, addBill, INIT_HOUSES, INIT_BOTS, WAGE, isBot, sysTransfer };
});
