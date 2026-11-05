/* KERNEL · api — turns the private kernel into the narrow facade (window.OS) that apps use.
 * Apps can READ state and call *actions* (buy, sell, run a reaction, pay a bill …). Every action re-validates on this side, so an app
 * (or a console) can't hand in a fabricated result — for example the lab recomputes the chemistry itself, it never accepts "products".
 * There is deliberately no addMoney(). The only sources of money are the game's own rules. */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG, ok = (msg, extra) => Object.assign({ ok: true, msg }, extra), no = (msg, extra) => Object.assign({ ok: false, msg }, extra);
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

  /* ---------------- lab (WestPhys: real thermodynamics, equilibrium and kinetics; WestChem decides what can happen) ---------------- */
  const P_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500], SEEN = { cards: new Map(), shards: {}, sent: new Set(), hits: { github: 0, session: 0, local: 0 } };
  const bench = () => Phys.limits(K.S.lab.tools);
  function clampArgs(a){                                  // whatever the app asks for is limited to what the player's equipment can actually do
    const b = bench(), P0 = +a.P || 1, P = P_STEPS.filter(p => p <= b.Pmax).reduce((m, p) => Math.abs(p - P0) < Math.abs(m - P0) ? p : m, 1);
    const T = Math.min(Math.floor(b.Tmax / 25) * 25, Math.max(Math.ceil(b.Tmin / 25) * 25, Math.round((+a.T || 300) / 25) * 25));
    return { keys: a.target ? [] : (a.keys || []).map(String).slice(0, 4), target: a.target ? String(a.target).trim().slice(0, 60) : '', T, P, cat: !!a.cat && b.cat, elec: !!a.elec && b.elec, ign: !!a.ign };
  }
  async function shard(id){ if(SEEN.shards[id]) return SEEN.shards[id]; try{ const r = await fetch('lab-cache/reactions/' + id + '.json', { cache: 'no-cache' }); SEEN.shards[id] = r.ok ? await r.json() : {}; }catch(e){ SEEN.shards[id] = {}; } return SEEN.shards[id]; }
  async function getCard(a){                              // 1) this session  2) the verified library on GitHub  3) calculate it here (and offer it to the library)
    const key = Phys.cacheKey(a), hit0 = SEEN.cards.get(key); if(hit0){ SEEN.hits.session++; return hit0; }
    const sh = await shard(Phys.shardOf(key)), hit = sh && sh[key];
    if(hit && hit.ok && hit.key === key && Array.isArray(hit.R) && Array.isArray(hit.Pr)){ const r = { card: hit, src: 'github' }; SEEN.cards.set(key, r); SEEN.hits.github++; return r; }
    const card = Phys.card(a), r = { card, src: 'local' }; SEEN.cards.set(key, r); SEEN.hits.local++;
    if(card.ok && !SEEN.sent.has(key)){ SEEN.sent.add(key); K.cloud.submitReaction(Phys.fnv(key), a); }
    return r;
  }
  /* ---- identify a species: GitHub compound library → free PubChem lookup → constructed from valence rules. Real structures drive the reactor visuals. ---- */
  const IDENT = new Map(), GRAPHS = new Map(), CSHARDS = {};
  async function cshard(id){ if(CSHARDS[id]) return CSHARDS[id]; try{ const r = await fetch('lab-cache/compounds/' + id + '.json', { cache: 'no-cache' }); CSHARDS[id] = r.ok ? await r.json() : {}; }catch(e){ CSHARDS[id] = {}; } return CSHARDS[id]; }
  function graphOf(key){ const sp = Chem.speciesOf(key); if(!sp) return { a: [], b: [], x: [], y: [], q: [] }; if(GRAPHS.has(sp.f + '|' + sp.kind + sp.apu)) return GRAPHS.get(sp.f + '|' + sp.kind + sp.apu); const g = Mol.layout(Mol.build(sp)); GRAPHS.set(sp.f + '|' + sp.kind + sp.apu, g); return g; }
  /* identify(): shared library on GitHub (lab-cache/ff) → this device (IndexedDB) → calculate here (PubChem + MMFF94, on the player's own CPU) → legacy valence-built graph.
     Firebase is never involved. A freshly calculated record is queued for the maintainer's GitHub commit (WestFFSync) when a token is configured on this machine. */
  const FF = typeof WestFF !== 'undefined' ? WestFF : null, FFS = typeof WestFFSync !== 'undefined' ? WestFFSync : null;
  if(FF && FFS) FF.onNew = rec => FFS.enqueue(rec);
  function identify(key){
    const sp = Chem.speciesOf(key); if(!sp) return Promise.resolve(null); if(sp.kind === 'element') return Promise.resolve({ f: sp.f, name: Chem.elements[sp.el].name, real: true, src: 'element', graph: graphOf(key) });
    if(IDENT.has(sp.f)) return IDENT.get(sp.f);
    const p = (async () => {
      let ff = null; if(FF){ try{ ff = await FF.lookup(Chem.hill(sp.comp)); }catch(e){} }
      if(ff && ff.rec){ const g = FF.toGraph(ff.rec); GRAPHS.set(sp.f + '|' + sp.kind + sp.apu, g); SEEN.hits[ff.src === 'library' ? 'github' : ff.src === 'device' ? 'session' : 'local']++;
        return { f: sp.f, name: Chem.nameOf(sp.f), pubchemName: ff.rec.n, real: true, cid: ff.rec.cid || 0, src: ff.src, graph: g, ff: ff.rec }; }
      const sh = await cshard(Phys.fnv(sp.f).slice(0, 2)), rec = sh[sp.f], g = rec && rec.a ? Mol.fromRecord(rec) : null; if(g) GRAPHS.set(sp.f + '|' + sp.kind + sp.apu, g);
      return { f: sp.f, name: (rec && rec.n) || Chem.nameOf(sp.f), real: !!(rec && rec.real), cid: (rec && rec.cid) || 0, src: rec ? 'github' : 'constructed', graph: g || graphOf(key) }; })();
    IDENT.set(sp.f, p); return p;
  }
  const ffTools = {
    available: () => !!FF, stats: () => FF ? FF.stats() : {},
    sync: FFS ? { status: () => FFS.status(), setCfg: c => FFS.setCfg(c), clear: () => FFS.clearCfg(), flush: () => FFS.flush(), onChange: f => FFS.onChange(f) } : null,
    /* maintainer: calculate every registry compound on THIS computer (PubChem + MMFF94) and queue the results for one batched GitHub commit */
    async buildRegistry(progress){
      const list = Chem.registryList().map(r => Chem.speciesOf(r.formula)).filter(s => s && s.kind === 'compound'); let done = 0, bad = 0;
      for(const sp of list){ const r = await FF.lookup(Chem.hill(sp.comp)).catch(() => null); if(!r) bad++; else if(FFS && r.src !== 'library') FFS.enqueue(r.rec); done++; progress && progress(done, list.length, bad); }
      if(FFS) FFS.flush(); return { done, bad };
    },
    async pushLocal(){ if(!FF || !FFS) return 0; const all = await FF.local.all(); all.filter(r => FF.valid(r)).forEach(r => FFS.enqueue(r)); await FFS.flush(); return all.length; }
  };
  const tierOf = () => Math.min(6, Object.keys(K.S.lab.tools).filter(t => K.S.lab.tools[t] && t !== 'basic').length);
  const lab = {
    tools: () => TOOLS.map(t => Object.assign({}, t, { owned: !!K.S.lab.tools[t.id] })),
    buyTool(id){ const t = TOOLS.find(x => x.id === id); if(!t) return no('Unknown equipment.'); if(K.S.lab.tools[id]) return no('You already own that.'); if(!K.spend(t.cost, 'Bought ' + t.name)) return no('You need ' + fmt(t.cost) + '.'); K.S.lab.tools[id] = 1; K.touch('lab'); K.emit('lab'); return ok('Bought ' + t.name + '.'); },
    bench, describe: f => Chem.describe(f), validate: f => Chem.validate(f), owned: () => Object.assign({}, K.S.lab.tools),
    async plan(a){ a = clampArgs(a); const r = await getCard(a); return { card: r.card, src: r.src, args: a }; },
    simulate(card, amounts, o){ return card && card.ok ? Phys.run(card, amounts, { removal: !!(o && o.removal) && bench().removal, tools: K.S.lab.tools, volume: o && o.volume }) : null; },
    async run(a, amounts, o){
      o = o || {}; a = clampArgs(a); const { card, src } = await getCard(a); if(!card.ok) return no(card.why);
      const am = {}; for(const x of card.R){ const n = Math.floor(+amounts[x[0]] || 0); if(n < 1) return no('Set an amount for ' + x[3] + '.'); if(K.qty(x[4] === 'element' ? 'element' : 'compound', x[0]) + (K.S.lab.tray[x[0]] || 0) < n * x[2]) return no('You don’t have ' + n + ' mol of ' + x[3] + '.'); am[x[0]] = n; }
      const sim = Phys.run(card, am, { removal: !!o.removal && bench().removal, tools: K.S.lab.tools }); if(!(sim.xi > 0)) return no('Nothing reacts under these conditions.');
      if(sim.hazard && !o.risk) return no('This run is unsafe for your vessel — confirm to run it anyway.', { hazard: sim.hazard });
      const keep = sim.hazard ? 0.5 : 1, used = {}, made = {}; let value = 0;
      card.R.forEach(x => { const u = Math.round(x[1] * sim.xi) * x[2]; if(u > 0){ used[x[0]] = u; value += K.listValue(x[0]) * u; } });
      card.Pr.forEach(x => { const dis = (sim.dissolved && sim.dissolved[x[0]]) || 0, u = Math.floor((x[1] * sim.xi - dis) * keep + 1e-9) * x[2]; if(u > 0) made[x[0]] = u; });
      const tiny = card.Pr.filter(x => (x[1] * sim.xi - ((sim.dissolved && sim.dissolved[x[0]]) || 0)) * keep < 1 - 1e-9);   // every product must come out at 1 mol or more
      if(tiny.length) return no('This run would make less than 1 mol of ' + tiny.map(x => x[3]).join(', ') + '. Load more reagent or improve the yield.');
      const fee = K.round2(value * 0.02 + 0.25 * (1 + tierOf()) + (sim.kWh || 0) * 0.5 + (sim.hazard ? 25 : 0)); if(!K.spend(fee, 'Lab fee')) return no('The lab fee is ' + fmt(fee) + '.');
      Object.keys(used).forEach(k => { const fromTray = Math.min(used[k], K.S.lab.tray[k] || 0); if(fromTray){ K.S.lab.tray[k] -= fromTray; if(K.S.lab.tray[k] <= 0) delete K.S.lab.tray[k]; } if(used[k] - fromTray > 0) K.invTake(K.kindOf(k), k, used[k] - fromTray); });
      const out = []; Object.keys(made).forEach(k => { const t = K.kindOf(k); K.S.lab.tray[k] = (K.S.lab.tray[k] || 0) + made[k]; out.push({ key: k, n: made[k] / (Chem.speciesOf(k).apu || 1), name: t === 'element' ? Chem.elements[k].name : Chem.nameOf(k) }); });
      K.S.lab.runs++; let bonus = 0, firstGlobal = false; const newly = [];
      for(const x of card.Pr){ if(x[4] !== 'compound' || !made[x[0]] || K.S.lab.found.includes(x[0])) continue; K.S.lab.found.push(x[0]); newly.push(x[0]); bonus += Math.max(5, K.round2(Chem.valueOf(x[0]) * 0.5)); }
      if(newly.length){ const id = card.R.map(x => x[3]).sort().join('+') + '>' + card.Pr.map(x => x[3]).sort().join('+'), r = await K.cloud.discover(id, { eq: card.eq, n: newly.join(',') }); if(r.first){ firstGlobal = true; bonus += 100; } }
      if(bonus > 0) K.earn(bonus, 'Discovery bonus'); K.touch('lab'); K.emit('lab');
      return ok('Made ' + (out.map(m => m.n + ' × ' + m.name).join(', ') || 'nothing'), { made: out, fee, bonus, newly: newly.map(k => ({ key: k, name: Chem.nameOf(k) })), firstGlobal, equation: card.eq, y: sim.y, hazard: sim.hazard, src, tLabel: sim.tLabel, heat: sim.heat });
    },
    tray: () => Object.keys(K.S.lab.tray).map(k => { const sp = Chem.speciesOf(k), u = K.S.lab.tray[k], apu = sp.apu || 1; return { key: k, units: u, moles: Math.floor(u / apu), f: sp.f, kind: sp.kind, name: sp.kind === 'element' ? Chem.elements[k].name : Chem.nameOf(k) }; }),
    trayUnits: k => K.S.lab.tray[k] || 0,
    collect(key){ const u = K.S.lab.tray[key]; if(!(u > 0)) return no('Nothing to collect.'); K.invAdd(K.kindOf(key), key, u); delete K.S.lab.tray[key]; K.touch('lab'); K.emit('lab'); return ok('Added to your inventory.'); },
    collectAll(){ Object.keys(K.S.lab.tray).forEach(k => { K.invAdd(K.kindOf(k), k, K.S.lab.tray[k]); delete K.S.lab.tray[k]; }); K.touch('lab'); K.emit('lab'); return ok('Everything added to your inventory.'); },
    graph: key => graphOf(key), identify: key => identify(key), ff: ffTools,
    found: () => K.S.lab.found.slice(), runs: () => K.S.lab.runs, cacheInfo: () => Object.assign({ cards: SEEN.cards.size }, SEEN.hits),
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
  const stock = { price: K.market.price, series: K.market.series, seriesFast: K.market.seriesFast, sellQty: K.market.sellQty, sellFraction: K.market.sellFraction, buyFraction: K.market.buyFraction, seriesFast: K.market.seriesFast, sellQty: K.market.sellQty, sellFraction: K.market.sellFraction, buyFraction: K.market.buyFraction, ranges: K.market.ranges, change24: K.market.change24, lots: K.market.lots, buy: K.market.buy, sell: K.market.sell, sellAll: K.market.sellAll, value: K.stockValue, ready: () => K.market.ready, wantFast: K.market.wantFast };
  const games = { award: (id, base) => { base = Math.max(0, Math.min(40, +base || 0)); return K.award(String(id).slice(0, 30), base); }, info: () => { const g = K.gameDay(); return { earned: g.earned, softcap: CFG.game.dailySoftcap, plays: Object.assign({}, g.plays), bonus: K.collectionBonus() }; } };
  const files = { record: uid => C.serverRecord(uid), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }) };
  const world = { articles: n => World.latestArticles(K.now(), n || 12), mults: () => World.elementMults(K.now()), sector: s => World.sectorIndex(s, K.now()), impacts: () => World.impactsBefore(K.now(), 6) };
  const admin = {
    ok: C.isAdmin, players: () => C.admin.players(), read: uid => C.admin.read(uid), setField: (u, p, v) => C.admin.setField(u, p, v), reset: u => C.admin.reset(u), rename: (u, n) => C.admin.rename(u, n),
    mail: (u, s, b) => C.admin.mail(u, s, b), broadcast: (s, b) => C.admin.broadcast(s, b),
    setVolatility: l => K.market.admin.setVolatility(l), adjustPrice: (d, f) => K.market.admin.adjust(d, f), volatility: () => C.isAdmin() ? K.market.volLevel() : null, volLevels: () => C.isAdmin() ? K.market.admin.levels() : [], volLedger: () => C.isAdmin() ? K.market.volLedger() : [],
    gallery: { upload: (f, p) => K.gallery.upload(f, p), rename: (i, t) => K.gallery.rename(i, t), remove: i => K.gallery.remove(i), usage: () => K.gallery.loadUsage() }
  };
  const gallery = { list: f => K.gallery.list(f), thumb: m => K.gallery.thumb(m), view: (m, p) => K.gallery.view(m, p), full: (m, p) => K.gallery.full(m, p), stats: () => K.gallery.stats(), countView: id => K.gallery.countView(id), countDownload: id => K.gallery.countDownload(id), isCached: k => K.gallery.isCached(k), budgetOk: () => K.gallery.budgetOk(), wallpaper: id => K.gallery.wallpaper(id), errText: e => K.gallery.errText(e), item: id => K.gallery.item(id), canOpen: () => K.gallery.canOpen(), cacheSize: () => K.gallery.cacheSize(), clearCache: () => K.gallery.clearCache() };

  K.facade = {
    version: '1.0', cfg: { adminEmail: CFG.adminEmail, tax: CFG.tax },
    on: (e, f) => K.on(e, f), emit: undefined,
    now: K.now, today: K.today, cash: () => K.S.cash,
    prefs: { get: k => K.prefs[k], all: () => JSON.parse(JSON.stringify(K.prefs)), set: (k, v) => K.setPref(k, v) },
    shop, lab, props, bank, mail, auth, stock, games, files, world, admin, gallery,
    chem: Chem, phys: Phys, mol: Mol, worldModel: World,
    data: { ELEMENTS, CATEGORY_COLORS, CATEGORY_LABELS, GAS_AT_25C, LIQUID_AT_25C, UNKNOWN_STATE, STATE_COLORS, STATE_LABELS, BLOCK_COLORS, BLOCK_LABELS, COMPOUND_LOOKUP, CATEGORY_LOOKUP_LABELS, POLYATOMIC_IONS, DATABOOK, WANTED_DATA, PROPERTIES, PROPERTY_SECTORS, TOOLS, MELTING_POINTS, BOILING_POINTS, OXIDATION, ELECTRONEG, RECIPES },
    nameOk: K.nameOk, netWorth: K.netWorth, sync: () => K.cloud.flushNow(), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }),
    notify: n => K.emit('notify', n)
  };
});
