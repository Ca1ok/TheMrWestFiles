/* KERNEL · api — turns the private kernel into the narrow facade (window.OS) that apps use.
 * Apps can READ state and call *actions* (buy, sell, run a reaction, pay a bill …). Every action re-validates on this side, so an app
 * (or a console) can't hand in a fabricated result — for example the lab recomputes the chemistry itself, it never accepts "products".
 * There is deliberately no addMoney(). The only sources of money are the game's own rules. */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG, ok = (msg, extra) => Object.assign({ ok: true, msg }, extra), no = msg => ({ ok: false, msg });
  const fmt = n => '$' + (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const COND_TOOL = { heat: 'burner', spark: 'electrolysis', pressure: 'pressure', catalyst: 'catalysis', distill: 'distillation', polymer: 'polymer', cryo: 'cryo' };
  const TOOL_COND = Object.keys(COND_TOOL).reduce((o, c) => (o[COND_TOOL[c]] = c, o), {});
  const ELSYM = new Set(ELEMENTS.map(e => e[1]));
  const knownCompound = f => { const v = Chem.validate(f); return v.ok && v.how !== undefined ? v : null; };
  const ownedConds = () => Object.keys(K.S.lab.tools).filter(t => K.S.lab.tools[t] && TOOL_COND[t]).map(t => TOOL_COND[t]);
  const itemRow = (type, key) => ({ type, key, name: type === 'element' ? Chem.elements[key].name : Chem.nameOf(key), qty: K.qty(type, key) });

  /* ---------------- shop ---------------- */
  const shop = {
    elements: () => ELEMENTS.map(e => ({ sym: e[1], num: e[0], name: e[2], cat: e[4], price: K.buyPrice(e[1]), base: Chem.price(e[1]), mult: World.itemMult(e[1], K.now()), qty: K.qty('element', e[1]) })),
    compounds: () => Chem.registryList().filter(c => c.formula && Chem.parse(c.formula)).map(c => ({ formula: c.formula, name: c.name || c.formula, desc: c.desc || '', category: c.category || Chem.classify(Chem.parse(c.formula)), price: K.buyPrice(c.formula), mult: World.itemMult(c.formula, K.now()), qty: K.qty('compound', c.formula) })),
    price: key => K.buyPrice(key), sellPrice: key => K.sellPrice(key), quote: (key, n) => K.sellQuote(key, n), qty: (t, k) => K.qty(t, k),
    buy(key, n){
      n = Math.floor(n); if(!(n >= 1) || n > 100000) return no('Choose a quantity between 1 and 100,000.');
      const type = ELSYM.has(key) ? 'element' : (knownCompound(key) ? 'compound' : null); if(!type) return no('Not for sale.');
      const k = type === 'compound' ? Chem.speciesOf(key).key : key, cost = K.round2(K.buyPrice(k) * n);
      if(!K.spend(cost, 'Bought ' + k)) return no('You need ' + fmt(cost) + '.');
      K.invAdd(type, k, n); return ok('Bought ' + n + ' × ' + (type === 'element' ? Chem.elements[k].name : Chem.nameOf(k)) + ' for ' + fmt(cost), { cost });
    },
    sell(key, n){
      const type = K.kindOf(key), k = type === 'compound' ? Chem.speciesOf(key).key : key; n = Math.floor(n);
      if(!(n >= 1) || K.qty(type, k) < n) return no('You don’t own that many.');
      const q = K.sellQuote(k, n); if(!K.invTake(type, k, n)) return no('Couldn’t complete the sale.');
      K.noteSale(k, n); K.earn(q.total, 'Sold ' + k); return ok('Sold ' + n + ' for ' + fmt(q.total), { total: q.total });
    },
    inventory(){ const out = []; ['element', 'compound'].forEach(t => { const b = t === 'element' ? K.S.inv.e : K.S.inv.c; Object.keys(b).forEach(k => out.push(Object.assign(itemRow(t, k), { sell: K.sellPrice(k), value: K.listValue(k) }))); }); return out.sort((a, b) => b.qty * b.value - a.qty * a.value); },
    value: () => K.inventoryValue(), movers: () => World.elementMults(K.now())
  };

  /* ---------------- lab ---------------- */
  const labFee = (sol, plan) => { let v = 0; Object.keys(plan.consume).forEach(k => { v += K.listValue(k) * plan.consume[k]; }); const tier = Math.max(0, ...sol.needs.map(n => TOOLS.findIndex(t => t.id === COND_TOOL[n]))); return K.round2(v * 0.02 + 0.25 * plan.batches * Math.max(1, tier)); };
  function describeRun(sol, plan){
    return { ok: sol.ok, type: sol.type, equation: sol.equation, needs: sol.needs, missing: sol.missing || [], reason: sol.reason, note: sol.note || '', key: sol.key,
      products: sol.products.map(p => ({ key: p.s.key, kind: p.s.kind, formula: p.s.f, name: p.s.kind === 'element' ? Chem.elements[p.s.el].name : Chem.nameOf(p.s.key), coeff: p.coeff, known: K.S.lab.found.includes(p.s.key) || p.s.kind === 'element' })),
      reactants: sol.reactants.map(r => ({ key: r.s.key, formula: r.s.f, coeff: r.coeff, have: K.qty(r.s.kind, r.s.key) })),
      maxBatches: plan.maxBatches, perBatchIn: plan.perBatchIn, perBatchOut: plan.perBatchOut, feePer: labFee(sol, { consume: Object.fromEntries(plan.perBatchIn.map(x => [x.key, x.perBatch])), batches: 1 }) };
  }
  const resolve = (keys, target) => target ? Chem.formation(target) : Chem.solve(keys, ownedConds());
  const lab = {
    tools: () => TOOLS.map(t => Object.assign({}, t, { owned: !!K.S.lab.tools[t.id] })),
    buyTool(id){ const t = TOOLS.find(x => x.id === id); if(!t) return no('Unknown equipment.'); if(K.S.lab.tools[id]) return no('You already own that.'); if(!K.spend(t.cost, 'Bought ' + t.name)) return no('You need ' + fmt(t.cost) + '.'); K.S.lab.tools[id] = 1; K.touch('lab'); K.emit('lab'); return ok('Bought ' + t.name + '.'); },
    conditions: ownedConds,
    describe: f => Chem.describe(f),
    validate: f => Chem.validate(f),
    preview(keys, target){
      const sol = target ? Chem.formation(target) : Chem.solve(keys, ownedConds());
      if(!sol || !sol.reactants){ return { ok: false, reason: (sol && sol.reason) || 'Choose some reagents.' }; }
      if(target){ const miss = sol.needs.filter(n => !ownedConds().includes(n)); sol.missing = miss; sol.ok = miss.length === 0; sol.reason = miss.length ? 'Needs ' + miss.map(Chem.condLabel).join(' + ') + '.' : ''; }
      return describeRun(sol, Chem.plan(sol, K.invFlat(), 0));
    },
    async run(keys, target, batches){
      const sol = resolve(keys, target); if(!sol || !sol.reactants) return no((sol && sol.reason) || 'Nothing to run.');
      if(target){ const miss = sol.needs.filter(n => !ownedConds().includes(n)); if(miss.length) return no('Needs ' + miss.map(Chem.condLabel).join(' + ') + '.'); } else if(!sol.ok) return no(sol.reason);
      const plan = Chem.plan(sol, K.invFlat(), Math.floor(batches)); if(plan.batches < 1) return no('You don’t have enough reagents for even one batch.');
      const fee = labFee(sol, plan); if(!K.spend(fee, 'Lab fee')) return no('The lab fee is ' + fmt(fee) + '.');
      Object.keys(plan.consume).forEach(k => { const t = K.kindOf(k); K.invTake(t, k, plan.consume[k]); });
      const made = [];
      Object.keys(plan.produce).forEach(k => { const t = K.kindOf(k); K.invAdd(t, k, plan.produce[k]); made.push({ key: k, n: plan.produce[k], name: t === 'element' ? Chem.elements[k].name : Chem.nameOf(k) }); });
      K.S.lab.runs++; let bonus = 0, firstGlobal = false; const newly = [];
      for(const p of sol.products){
        if(p.s.kind !== 'compound' || K.S.lab.found.includes(p.s.key)) continue;
        K.S.lab.found.push(p.s.key); newly.push(p.s.key); bonus += Math.max(5, K.round2(Chem.valueOf(p.s.key) * 0.5));
      }
      if(newly.length){ const r = await K.cloud.discover(sol.key, { eq: sol.equation, n: newly.join(',') }); if(r.first){ firstGlobal = true; bonus += 100; } }
      if(bonus > 0) K.earn(bonus, 'Discovery bonus');
      K.touch('lab'); K.emit('lab');
      return ok('Made ' + made.map(m => m.n + ' × ' + m.name).join(', '), { made, fee, bonus, newly: newly.map(k => ({ key: k, name: Chem.nameOf(k) })), firstGlobal, equation: sol.equation });
    },
    found: () => K.S.lab.found.slice(), runs: () => K.S.lab.runs,
    async registry(){ try{ const r = await fetch('lab-cache/discoveries.json', { cache: 'no-cache' }); return r.ok ? await r.json() : {}; }catch(e){ return {}; } }
  };

  /* ---------------- real estate ---------------- */
  const props = {
    list: () => PROPERTIES.map(p => ({ id: p.id, name: p.name, sector: p.sector, desc: p.desc, base: p.base, rate: p.rent, price: K.propPrice(p.id), owned: !!K.S.props[p.id], paid: K.S.props[p.id] ? K.S.props[p.id].paid : 0 })),
    sellValue: id => Math.round(K.propPrice(id) * 0.95),
    history: (id, days, n) => World.propertyHistory(PROPERTIES.find(p => p.id === id), K.now(), days, n),
    sector: s => World.sectorIndex(s, K.now()),
    buy(id){ const p = PROPERTIES.find(x => x.id === id); if(!p) return no('Unknown property.'); if(K.S.props[id]) return no('You already own this.'); const price = K.propPrice(id); if(!K.spend(price, 'Bought ' + p.name)) return no('You need ' + fmt(price) + '.'); K.S.props[id] = { paid: price, t: K.now(), rentT: K.now() }; K.touch('props'); K.emit('props'); K.cloud.flushNow(); return ok('You bought ' + p.name + ' for ' + fmt(price) + '.'); },
    sell(id){ const o = K.S.props[id]; if(!o) return no('You don’t own that.'); const p = PROPERTIES.find(x => x.id === id), got = props.sellValue(id), rent = propRent(id); delete K.S.props[id]; K.earn(got + rent, 'Sold ' + p.name); K.touch('props'); K.emit('props'); K.cloud.flushNow(); return ok('Sold ' + p.name + ' for ' + fmt(got) + (rent ? ' (+' + fmt(rent) + ' rent)' : ''), { got, profit: got - o.paid }); },
    rentDue: K.rentDue,
    collectRent(){ const due = K.rentDue(); if(due < 0.01) return no('No rent to collect yet.'); Object.keys(K.S.props).forEach(id => { K.S.props[id].rentT = K.now(); }); K.earn(due, 'Rent'); K.touch('props'); K.emit('props'); return ok('Collected ' + fmt(due) + ' in rent.', { amount: due }); },
    value: K.propValue
  };
  function propRent(id){ const p = PROPERTIES.find(x => x.id === id), o = K.S.props[id]; if(!p || !o) return 0; const d = Math.min(7, Math.max(0, (K.now() - (o.rentT || o.t)) / 86400000)); return K.round2(K.propPrice(id) * p.rent * d); }

  /* ---------------- bank ---------------- */
  const bank = {
    balance: () => K.S.cash, bills: K.bank.bills, open: K.bank.open, owed: K.bank.owed, preview: K.bank.preview, pay: K.bank.pay, payAll: K.bank.payAll, rate: K.bank.rate,
    history: () => K.S.bank.hist.slice(), config: () => Object.assign({}, CFG.tax), netWorth: K.netWorth,
    breakdown: () => ({ cash: K.S.cash, inventory: K.inventoryValue(), stock: K.stockValue(), property: K.propValue() }),
    ranking: n => K.cloud.leaderboard(n)
  };

  /* ---------------- mail ---------------- */
  const mail = {
    list: () => K.S.mail.map(m => Object.assign({}, m)), unread: () => K.S.mail.filter(m => !m.read).length,
    read(id){ const m = K.S.mail.find(x => x.id === id); if(m && !m.read){ m.read = true; K.touch('mail'); K.emit('mail'); } },
    readAll(){ let c = false; K.S.mail.forEach(m => { if(!m.read){ m.read = true; c = true; } }); if(c){ K.touch('mail'); K.emit('mail'); } },
    remove(id){ const i = K.S.mail.findIndex(x => x.id === id); if(i >= 0){ K.S.mail.splice(i, 1); K.touch('mail'); K.emit('mail'); } }
  };

  /* ---------------- account ---------------- */
  const C = K.cloud;
  const auth = {
    ready: () => C.ready, signedIn: C.signedIn, isAdmin: C.isAdmin, user: () => C.user && !C.user.isAnonymous ? { uid: C.user.uid, email: C.user.email, name: K.S.meta.name, photo: C.user.photoURL } : null,
    google: () => C.signInGoogle(), email: (e, p, create) => C.signInEmail(e, p, create), signOut: () => C.signOut(), reset: e => C.resetPassword(e),
    setName: n => C.setName(n), name: () => K.S.meta.name, available: () => !!C.auth, sync: () => ({ signedIn: C.signedIn(), loaded: K.loaded, dirty: K.dirty.size })
  };

  /* ---------------- stock + games + files + world ---------------- */
  const stock = { price: K.market.price, series: K.market.series, ranges: K.market.ranges, change24: K.market.change24, lots: K.market.lots, buy: K.market.buy, sell: K.market.sell, sellAll: K.market.sellAll, value: K.stockValue, ready: () => K.market.ready, wantFast: K.market.wantFast };
  const games = { award: (id, base) => { base = Math.max(0, Math.min(40, +base || 0)); return K.award(String(id).slice(0, 30), base); }, info: () => { const g = K.gameDay(); return { earned: g.earned, softcap: CFG.game.dailySoftcap, plays: Object.assign({}, g.plays), bonus: K.collectionBonus() }; } };
  const files = { record: uid => C.serverRecord(uid), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }) };
  const world = { articles: n => World.latestArticles(K.now(), n || 12), mults: () => World.elementMults(K.now()), sector: s => World.sectorIndex(s, K.now()), impacts: () => World.impactsBefore(K.now(), 6) };
  const admin = {
    ok: C.isAdmin, players: () => C.admin.players(), read: uid => C.admin.read(uid), setField: (u, p, v) => C.admin.setField(u, p, v), reset: u => C.admin.reset(u), rename: (u, n) => C.admin.rename(u, n),
    mail: (u, s, b) => C.admin.mail(u, s, b), broadcast: (s, b) => C.admin.broadcast(s, b),
    setVolatility: l => K.market.admin.setVolatility(l), adjustPrice: (d, f) => K.market.admin.adjust(d, f), volatility: () => C.isAdmin() ? K.market.volLevel() : null, volLevels: () => C.isAdmin() ? K.market.admin.levels() : [], volLedger: () => C.isAdmin() ? K.market.volLedger() : [],
    gallery: { upload: (f, p) => K.gallery.upload(f, p), rename: (i, t) => K.gallery.rename(i, t), remove: i => K.gallery.remove(i), usage: () => K.gallery.loadUsage() }
  };
  const gallery = { list: f => K.gallery.list(f), thumb: m => K.gallery.thumb(m), view: (m, p) => K.gallery.view(m, p), full: (m, p) => K.gallery.full(m, p), stats: () => K.gallery.stats(), countView: id => K.gallery.countView(id), countDownload: id => K.gallery.countDownload(id), isCached: k => K.gallery.isCached(k), budgetOk: () => K.gallery.budgetOk(), wallpaper: id => K.gallery.wallpaper(id), errText: e => K.gallery.errText(e), item: id => K.gallery.item(id) };

  K.facade = {
    version: '1.0', cfg: { adminEmail: CFG.adminEmail, tax: CFG.tax },
    on: (e, f) => K.on(e, f), emit: undefined,
    now: K.now, today: K.today, cash: () => K.S.cash,
    prefs: { get: k => K.prefs[k], all: () => JSON.parse(JSON.stringify(K.prefs)), set: (k, v) => K.setPref(k, v) },
    shop, lab, props, bank, mail, auth, stock, games, files, world, admin, gallery,
    chem: Chem, worldModel: World,
    data: { ELEMENTS, CATEGORY_COLORS, CATEGORY_LABELS, GAS_AT_25C, LIQUID_AT_25C, UNKNOWN_STATE, STATE_COLORS, STATE_LABELS, BLOCK_COLORS, BLOCK_LABELS, COMPOUND_LOOKUP, CATEGORY_LOOKUP_LABELS, POLYATOMIC_IONS, DATABOOK, WANTED_DATA, PROPERTIES, PROPERTY_SECTORS, TOOLS, MELTING_POINTS, BOILING_POINTS, OXIDATION, ELECTRONEG, RECIPES },
    nameOk: K.nameOk, netWorth: K.netWorth, sync: () => K.cloud.flushNow(), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }),
    notify: n => K.emit('notify', n)
  };
});
