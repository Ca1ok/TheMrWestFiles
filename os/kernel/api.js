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
  const synthBuyable = k => typeof Synth !== 'undefined' && Synth.byKey[k] && Synth.byKey[k].buy && !Synth.byKey[k].free;
  const knownCompound = f => { const v = Chem.validate(f); return v.ok && v.how !== undefined ? v : null; };
  const ownedConds = () => Object.keys(K.S.lab.tools).filter(t => K.S.lab.tools[t] && TOOL_COND[t]).map(t => TOOL_COND[t]);
  const itemRow = (type, key) => ({ type, key, name: type === 'element' ? Chem.elements[key].name : Chem.nameOf(key), qty: K.qty(type, key) });

  /* ---------------- shop ---------------- */
  const shopCompounds = reg => reg.map(c => ({ formula: c.formula, name: c.name || c.formula, desc: c.desc || '', category: c.category || Chem.classify(Chem.parse(c.formula)), price: K.buyPrice(c.formula), mult: World.itemMult(c.formula, K.now()), qty: K.qty('compound', c.formula) }));
  const shop = {
    elements: () => ELEMENTS.map(e => ({ sym: e[1], num: e[0], name: e[2], cat: e[4], price: K.buyPrice(e[1]), base: Chem.price(e[1]), mult: World.itemMult(e[1], K.now()), qty: K.qty('element', e[1]) })),
    compounds: () => { const reg = Chem.registryList().filter(c => c.formula && Chem.parse(c.formula)), have = new Set(reg.map(c => c.formula)); const extra = typeof Synth === 'undefined' ? [] : Synth.catalog().filter(e => e.buy && !e.free && !have.has(e.key) && Chem.speciesOf(e.key)).map(e => ({ formula: e.key, name: e.name, desc: e.tags.has('solv:p') || e.solv ? 'Solvent' : '', category: e.comp.C ? 'Organic (WestLab reagent)' : 'Reagent', price: K.buyPrice(e.key), mult: World.itemMult(e.key, K.now()), qty: K.qty('compound', e.key), label: e.comp.C ? Synth.S.hillStr(e.comp) : e.key })); return shopCompounds(reg).concat(extra); },

    price: key => K.buyPrice(key), sellPrice: key => K.sellPrice(key), quote: (key, n) => K.sellQuote(key, n), qty: (t, k) => K.qty(t, k),
    buy(key, n){
      n = Math.floor(n); if(!(n >= 1) || n > 100000) return no('Choose a quantity between 1 and 100,000.');
      if(K.ledger.guest) return no(K.ledger.guestMsg());      // visitors have no wallet: say so instead of "you need $…"
      const type = ELSYM.has(key) ? 'element' : (synthBuyable(key) || knownCompound(key) ? 'compound' : null); if(!type) return no('Not for sale.');
      const k = type === 'compound' ? Chem.speciesOf(key).key : key, cost = K.round2(K.buyPrice(k) * n);
      if(!K.spend(cost, 'Bought ' + k)) return no('You need ' + fmt(cost) + '.');
      K.invAdd(type, k, n); return ok('Bought ' + n + ' × ' + (type === 'element' ? Chem.elements[k].name : Chem.nameOf(k)) + ' for ' + fmt(cost), { cost });
    },
    sell(key, n){
      const type = K.kindOf(key), k = type === 'compound' ? Chem.speciesOf(key).key : key; n = Math.floor(n);
      if(!(n >= 1) || K.qty(type, k) < n) return no('You don’t own that many.');
      const q = K.sellQuote(k, n); if(!K.invTake(type, k, n)) return no('Couldn’t complete the sale.');
      K.noteSale(k, n); const got = K.earn(q.total, 'Sold ' + k); return ok('Sold ' + n + ' for ' + fmt(got) + (got < q.total - 0.004 ? ' (after ' + fmt(K.round2(q.total - got)) + ' tax)' : ''), { total: got, gross: q.total, tax: K.round2(q.total - got) });
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
  // cache miss → calculate in a Web Worker (the page never freezes); no Worker / any failure / 15 s → the same calculation on the main thread
  let WK = null, WKID = 0; const WKP = new Map();
  function computeCard(a){
    if(typeof Worker === 'undefined' || WK === false) return Promise.resolve(Phys.card(a));
    try{ if(!WK){ WK = new Worker('os/lib/westlab-worker.js'); WK.onmessage = e => { const p = WKP.get(e.data.id); if(p){ WKP.delete(e.data.id); e.data.card ? p.res(e.data.card) : p.rej(); } }; WK.onerror = () => { WK = false; WKP.forEach(p => p.rej()); WKP.clear(); }; } }catch(e){ WK = false; return Promise.resolve(Phys.card(a)); }
    return new Promise((res, rej) => { const id = ++WKID; WKP.set(id, { res, rej }); setTimeout(() => { if(WKP.delete(id)) rej(); }, 15000); WK.postMessage({ id, a }); }).catch(() => Phys.card(a));
  }
  async function getCard(a){                              // 1) this session  2) the verified library on GitHub  3) calculate it here (and offer it to the library)
    const key = Phys.cacheKey(a), hit0 = SEEN.cards.get(key); if(hit0){ SEEN.hits.session++; return hit0; }
    const sh = await shard(Phys.shardOf(key)), hit = sh && sh[key];
    if(hit && hit.ok && hit.key === key && Array.isArray(hit.R) && Array.isArray(hit.Pr)){ const r = { card: hit, src: 'github' }; SEEN.cards.set(key, r); SEEN.hits.github++; return r; }
    const card = await computeCard(a), r = { card, src: 'local' }; SEEN.cards.set(key, r); SEEN.hits.local++;
    if(card.ok && !SEEN.sent.has(key)){ SEEN.sent.add(key); K.cloud.submitReaction(Phys.fnv(key), a); }
    return r;
  }
  /* ---- identify a species: GitHub compound library → free PubChem lookup → constructed from valence rules. Real structures drive the reactor visuals. ---- */
  const IDENT = new Map(), GRAPHS = new Map(), CSHARDS = {};
  async function cshard(id){ if(CSHARDS[id]) return CSHARDS[id]; try{ const r = await fetch('lab-cache/compounds/' + id + '.json', { cache: 'no-cache' }); CSHARDS[id] = r.ok ? await r.json() : {}; }catch(e){ CSHARDS[id] = {}; } return CSHARDS[id]; }
  function graphOf(key){ const sp = Chem.speciesOf(key); if(!sp) return { a: [], b: [], x: [], y: [], q: [] }; if(sp.synth || (typeof Synth !== 'undefined' && sp.comp && sp.comp.C && Synth.byKey[key])){ const gk = 'syn|' + key; if(GRAPHS.has(gk)) return GRAPHS.get(gk); const sg = Synth.graphOf(key); if(sg){ const g = Mol.layout(sg); GRAPHS.set(gk, g); return g; } } if(GRAPHS.has(sp.f + '|' + sp.kind + sp.apu)) return GRAPHS.get(sp.f + '|' + sp.kind + sp.apu); const g = Mol.layout(Mol.build(sp)); GRAPHS.set(sp.f + '|' + sp.kind + sp.apu, g); return g; }
  /* identify(): shared library on GitHub (lab-cache/ff) → this device (IndexedDB) → calculate here (PubChem + MMFF94, on the player's own CPU) → legacy valence-built graph.
     Firebase is never involved. A freshly calculated record is queued for the maintainer's GitHub commit (WestFFSync) when a token is configured on this machine. */
  const FF = typeof WestFF !== 'undefined' ? WestFF : null, FFS = typeof WestFFSync !== 'undefined' ? WestFFSync : null;
  if(FF && FFS) FF.onNew = rec => FFS.enqueue(rec);
  function identify(key){
    const sp = Chem.speciesOf(key); if(!sp) return Promise.resolve(null); if(sp.synth) return Promise.resolve({ f: sp.f, name: Chem.nameOf(key), real: true, src: 'synth', graph: graphOf(key) }); if(sp.kind === 'element') return Promise.resolve({ f: sp.f, name: Chem.elements[sp.el].name, real: true, src: 'element', graph: graphOf(key) });
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

  /* ---------------- WestLab synthesis steps (os/lib/synth*.js): equipment, conditions, workup. Order of lookup is the same as everywhere else:
   *   this session → the verified library on GitHub (lab-cache/synth/<shard>.json) → calculate here → offer the INPUTS to the library (the Action recomputes them; nobody can submit a result). ---------------- */
  const SQ = typeof SYNTH_EQUIP !== 'undefined' ? SYNTH_EQUIP : [], allTools = () => TOOLS.concat(SQ);
  const SYN = { cards: new Map(), shards: {}, sent: new Set(), hits: { github: 0, session: 0, local: 0, rejected: 0 }, index: null, feed: [] };
  const owns = id => id === 'basic' || !!K.S.lab.tools[id];
  const haveN = k => K.qty(K.kindOf(k), k) + (K.S.lab.tray[k] || 0);
  const nmOf = k => { const sp = Chem.speciesOf(k); if(sp && sp.kind === 'element') return Chem.elements[k].name; return (typeof Synth !== 'undefined' && Synth.nameOfKey(k)) || Chem.nameOf(k); };
  const P_SYN = [1, 2, 3, 4, 5, 10, 20, 30, 50, 100, 200, 300, 500];
  function clampStep(a){                                  // whatever the app asks for is limited to what the player's equipment can do (the same checks run again inside run())
    const V = SYNTH_VESSELS, H = SYNTH_HEAT, W = SYNTH_WORKUP, vessel = V[a.vessel] && owns(V[a.vessel].need) ? a.vessel : 'flask', vm = V[vessel];
    const heat = H[a.heat] && owns(H[a.heat].need) ? a.heat : 'none'; let hi = Math.min(H[heat].T[1], vm.Tmax), lo = Math.min(H[heat].T[0], hi);
    const T = Math.min(hi, Math.max(lo, Math.round((+a.T || 298) / 5) * 5)), P0 = Math.min(vm.sealed ? vm.Pmax || 1 : 1, Math.max(1, +a.P || 1)), P = vm.sealed ? P_SYN.filter(p => p <= (vm.Pmax || 1)).reduce((m, p) => Math.abs(p - P0) < Math.abs(m - P0) ? p : m, 1) : 1;
    const atm = vessel === 'schlenk' && ['air', 'N2', 'Ar', 'vac'].includes(a.atm) ? a.atm : 'air', t0 = +a.time || 60, time = SYNTH_TIMES.reduce((m, x) => Math.abs(Math.log(x / t0)) < Math.abs(Math.log(m / t0)) ? x : m, SYNTH_TIMES[0]);
    const keys = []; (a.keys || []).forEach(k => { k = String(k).slice(0, 200); if(k && !keys.includes(k) && keys.length < 4) keys.push(k); });
    return { keys, solv: a.solv ? String(a.solv).slice(0, 200) : '', cat: a.cat ? String(a.cat).slice(0, 200) : '', T, P, atm, vessel, heat, stir: a.stir && owns('stirrer') ? 1 : 0, dean: a.dean && owns('distillation') ? 1 : 0, slow: a.slow ? 1 : 0, time, workup: W[a.workup] && owns(W[a.workup].need) ? a.workup : 'none' };
  }
  async function sshard(id){ if(SYN.shards[id]) return SYN.shards[id]; try{ const r = await fetch('lab-cache/synth/' + id + '.json', { cache: 'no-cache' }); SYN.shards[id] = r.ok ? await r.json() : {}; }catch(e){ SYN.shards[id] = {}; } return SYN.shards[id]; }
  async function getStepCard(a){
    const key = Synth.cacheKey(a), s0 = SYN.cards.get(key); if(s0){ SYN.hits.session++; return s0; }
    const sh = await sshard(Synth.shardOf(key)), hit = sh && sh[key];
    if(hit){ const v = Synth.validate(hit); if(v.ok && hit.key === key){ const r = { card: hit, src: 'github' }; SYN.cards.set(key, r); SYN.hits.github++; return r; } SYN.hits.rejected++; }      // a library card that fails the checks is thrown out and recomputed
    const card = Synth.card(a), r = { card, src: 'local' }; SYN.cards.set(key, r); SYN.hits.local++;
    if(card.ok && !SYN.sent.has(key)){ SYN.sent.add(key); K.cloud.submitStep(Synth.fnv(key), a); }
    return r;
  }
  const legacyArgs = a => ({ keys: a.keys, T: Math.max(75, a.T), P: Math.min(500, Math.max(1, a.P)), cat: !!a.cat, elec: a.vessel === 'cell', ign: a.heat === 'flame' });
  const synthOnly = a => a.keys.some(k => SynthCore.isSKey(k));
  async function stepPlan(a0){
    const a = clampStep(a0), items = a.keys.concat(a.solv ? [a.solv] : []).concat(a.cat ? [a.cat] : []);
    if(!a.keys.length) return { kind: 'S', card: { ok: false, why: 'Drag reagents into the flask.' }, args: a, src: '' };
    const r = await getStepCard(a), c = r.card;
    if(!c.ok && !c.refused && !c.restricted && !c.tpl && !synthOnly(a) && a.keys.every(k => Chem.speciesOf(k))){          // no organic template applies → the original WestPhys engine (inorganic chemistry)
      const lg = await lab.plan(legacyArgs(a)); if(lg.card && lg.card.ok) return { kind: 'L', card: lg.card, src: lg.src, args: a, legacyArgs: lg.args };
      return { kind: 'S', card: Object.assign({}, c, { why: c.tpl ? c.why : (lg.card && lg.card.why) || c.why }), args: a, src: r.src };
    }
    return { kind: 'S', card: c, args: a, src: r.src };
  }
  const kwh = (cd, a) => Math.max(0, (Math.min(cd.Teff || a.T, 1500) - 295) / 100) * (a.time / 60) * .6 + (a.stir ? .02 * a.time / 60 : 0) + (a.vessel === 'schlenk' ? .05 * a.time / 60 : 0);
  const wearLimit = k => { const e = Synth.byKey[k], sp = Chem.speciesOf(k); return (e && e.wear) || (sp && sp.kind === 'element' && SYNTH_CATALYSTS[k] && SYNTH_CATALYSTS[k].wear) || 25; };
  async function stepRun(a0, amounts, o){
    o = o || {}; const a = clampStep(a0); if(!a.keys.length) return no('Drag reagents into the flask.');
    const pl = await stepPlan(a); if(pl.kind === 'L'){ const am = {}; pl.card.R.forEach(x => { const fk = a.keys.find(k => { const q = Chem.speciesOf(k); return k === x[0] || (q && (q.key === x[0] || q.f === x[0])); }); am[x[0]] = Math.max(0, Math.floor((amounts[x[0]] !== undefined ? amounts[x[0]] : amounts[fk]) || 0)); }); const r = await lab.run(pl.legacyArgs, am, o); if(r.ok) r.kind = 'L'; return r; }
    const card = pl.card; if(!card.ok) return no(card.why || 'Nothing happens.');
    const am = {}; for(const r of card.R){ const n = Math.floor(+amounts[r.key] || 0); if(n < 1) return no('Set an amount for ' + nmOf(r.key) + '.'); if(haveN(r.key) < n) return no('You don’t have ' + n + ' mol of ' + nmOf(r.key) + '.'); am[r.key] = n; }
    const sim = Synth.run(card, am); if(!sim.ok) return no(sim.why);
    if(sim.hazard && !o.risk) return no('This run is unsafe at this scale — confirm to run it anyway.', { hazard: sim.hazard });
    const sNeed = Synth.solventNeed(card, am); if(sNeed && haveN(card.solvent) < sNeed) return no('You need ' + sNeed + ' mol of ' + nmOf(card.solvent) + ' as solvent for this batch.');
    const cat = card.a.cat; if(cat && haveN(cat) < 1) return no('You need 1 mol of ' + nmOf(cat) + ' as catalyst.');
    const used = {}; let value = 0; Object.keys(sim.used).forEach(k => { const u = Math.min(am[k] || Infinity, Math.ceil(sim.used[k] - (sim.back[k] || 0) - 1e-9)); if(u > 0){ used[k] = u; value += K.listValue(k) * u; } });
    const made = sim.made, nMade = Object.keys(made).length; if(!nMade) return no(sim.notes[0] || 'Nothing could be recovered with this workup. Try a different workup or more material.');
    const fee = K.round2(value * 0.02 + 0.25 * (1 + tierOf()) + kwh(card, a) * 0.5 + (sim.hazard ? 25 : 0) + (a.vessel === 'schlenk' ? 1 : 0)); if(!K.spend(fee, 'Lab fee')) return no('The lab fee is ' + fmt(fee) + '.');
    const take = (k, n) => { if(!(n > 0)) return; const fromTray = Math.min(n, K.S.lab.tray[k] || 0); if(fromTray){ K.S.lab.tray[k] -= fromTray; if(K.S.lab.tray[k] <= 0) delete K.S.lab.tray[k]; } if(n - fromTray > 0) K.invTake(K.kindOf(k), k, n - fromTray); };
    Object.keys(used).forEach(k => take(k, used[k])); if(sNeed){ take(card.solvent, sNeed); const back = Math.floor(sNeed * (sim.solvBack || 0)); if(back > 0) K.S.lab.tray[card.solvent] = (K.S.lab.tray[card.solvent] || 0) + back; }
    K.S.lab.wear = K.S.lab.wear || {}; if(cat){ K.S.lab.wear[cat] = (K.S.lab.wear[cat] || 0) + 1; if(K.S.lab.wear[cat] >= wearLimit(cat)){ K.S.lab.wear[cat] = 0; take(cat, 1); } }
    const out = []; Object.keys(made).forEach(k => { K.S.lab.tray[k] = (K.S.lab.tray[k] || 0) + made[k]; out.push({ key: k, n: made[k], name: nmOf(k) }); });
    Object.keys(sim.back).forEach(k => { K.S.lab.tray[k] = (K.S.lab.tray[k] || 0) + sim.back[k]; });
    K.S.lab.runs++; let bonus = 0, firstGlobal = false; const newly = [];
    const iso = p => p.iso ? Object.assign({}, p, { key: p.iso.key }) : p, PR = card.Pr.map(iso), mainP = PR.find(p => made[p.key] && p.role === 'main') || PR.find(p => made[p.key]);
    for(const p of PR){ if(!made[p.key] || K.S.lab.found.includes(p.key) || (Chem.speciesOf(p.key) || {}).kind !== 'compound' || /^(H2O|CO2|HCl|HBr|NaCl|KCl)$/.test(p.key)) continue; K.S.lab.found.push(p.key); newly.push(p.key); bonus += Math.max(8, K.round2(Chem.valueOf(p.key) * 0.75)); }
    if(newly.length && mainP){ const id = 's:' + Synth.fnv(mainP.key), rc = JSON.stringify([card.a.keys, card.a.solv, card.a.cat, card.a.T, card.a.P, card.a.atm, card.a.vessel, card.a.stir, card.a.time, card.a.dean, card.a.slow, card.a.workup]); const r = await K.cloud.discover(id, { eq: card.eq, n: mainP.key.slice(0, 240), rc: rc.length <= 300 ? rc : '' }); if(r.first){ firstGlobal = true; bonus += Math.min(100, 25 + 5 * Math.min(15, Object.keys(mainP.comp).filter(e => e !== 'H').reduce((t, e) => t + mainP.comp[e], 0) / 2)); } }
    if(bonus > 0) K.earn(bonus, 'Discovery bonus'); K.touch('lab'); K.emit('lab');
    return ok('Made ' + out.map(m => m.n + ' × ' + m.name).join(', '), { kind: 'S', made: out, fee, bonus, newly: newly.map(k => ({ key: k, name: nmOf(k) })), firstGlobal, equation: card.eq, y: card.eta, hazard: sim.hazard, src: pl.src, tLabel: sim.tLabel, notes: sim.notes, back: sim.back });
  }
  function stepSim(card, amounts){ return card && card.ok ? Synth.run(card, amounts) : null; }
  function stepOptions(){
    const V = SYNTH_VESSELS, H = SYNTH_HEAT, W = SYNTH_WORKUP, lock = id => owns(id), need = id => (allTools().find(t => t.id === id) || { name: id }).name;
    const row = (o, k) => Object.keys(o).map(id => Object.assign({ id, owned: lock(o[id].need), needName: need(o[id].need) }, o[id])), atm = [{ id: 'air', name: 'Air' }, { id: 'N2', name: 'Nitrogen' }, { id: 'Ar', name: 'Argon' }, { id: 'vac', name: 'Vacuum' }];
    return { vessels: row(V), heats: row(H), workups: row(W), atms: atm, times: SYNTH_TIMES, stir: owns('stirrer'), dean: owns('distillation') };
  }
  function stepItems(){                                    // everything you can put in the flask: inventory + tray, with the roles the reaction templates look for
    const out = [], seen = new Set(), add = (k, qty, tray) => { if(seen.has(k)) return; seen.add(k); const sp = Synth.species(k), ck = Chem.speciesOf(k); if(!ck) return; out.push({ key: k, name: nmOf(k), qty: haveN(k), tray: K.S.lab.tray[k] || 0, f: ck.kind === 'element' ? k : (ck.comp && ck.comp.C && sp ? Synth.S.hillStr(ck.comp) : Chem.prettyFormula ? Chem.prettyFormula(k) : k), kind: ck.kind, tags: sp ? Array.from(sp.tags) : [], solv: sp && sp.solv || '', cat: !!(sp && (sp.tags.has('cat') || sp.tags.has('lewis') || sp.tags.has('acid-strong') || sp.tags.has('base-strong') || sp.el && SYNTH_CATALYSTS[sp.el] || sp.tags.has('acid-mid'))), organic: !!(ck.comp && ck.comp.C), synth: !!ck.synth }); };
    Object.keys(K.S.inv.e).forEach(k => add(k)); Object.keys(K.S.inv.c).forEach(k => add(k)); Object.keys(K.S.lab.tray).forEach(k => add(k));
    if(!seen.has('H2O')) out.push({ key: 'H2O', name: 'Water (tap)', qty: 999, tray: 0, f: 'H₂O', kind: 'compound', tags: ['solv:p', 'w'], solv: 'p', cat: false, organic: false, free: true });
    return out;
  }
  async function stepRoute(target){                         // how could I make `target`? search the shared library (cards other players' runs produced) backwards to things that can be bought
    try{ if(!SYN.index){ const r = await fetch('lab-cache/synth/index.json', { cache: 'no-cache' }); SYN.index = r.ok ? await r.json() : {}; } }catch(e){ SYN.index = {}; }
    const cards = [], seenK = new Set(), want = [target]; let guard = 0;
    while(want.length && guard++ < 40){ const p = want.shift(); for(const ck of (SYN.index[p] || []).slice(0, 3)){ if(seenK.has(ck)) continue; seenK.add(ck); const sh = await sshard(Synth.shardOf(ck)), cd = sh && sh[ck]; if(cd && Synth.validate(cd).ok){ cards.push(cd); cd.R.forEach(r => { if(!r.spent && !want.includes(r.key)) want.push(r.key); }); } } }
    const buy = Synth.catalog().filter(e => e.buy).map(e => e.key).concat(Object.keys(Chem.elements));
    const steps = Synth.route(target, cards, buy.concat(Object.keys(K.S.inv.c)), 6); return steps ? steps.map(c => ({ eq: c.eq, type: c.type, a: c.a, key: c.key })) : null;
  }
  const lab = {
    tools: () => allTools().map(t => Object.assign({}, t, { owned: !!K.S.lab.tools[t.id] })),
    buyTool(id){ const t = allTools().find(x => x.id === id); if(!t) return no('Unknown equipment.'); if(K.S.lab.tools[id]) return no('You already own that.'); if(!K.spend(t.cost, 'Bought ' + t.name)) return no('You need ' + fmt(t.cost) + '.'); K.S.lab.tools[id] = 1; K.touch('lab'); K.emit('lab'); return ok('Bought ' + t.name + '.'); },
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
      for(const x of card.Pr){ if(x[4] !== 'compound' || !made[x[0]] || K.S.lab.found.includes(x[0])) continue; K.S.lab.found.push(x[0]); newly.push(x[0]); bonus += Math.max(8, K.round2(Chem.valueOf(x[0]) * 0.75)); }
      if(newly.length){ const id = card.R.map(x => x[3]).sort().join('+') + '>' + card.Pr.map(x => x[3]).sort().join('+'), r = await K.cloud.discover(id, { eq: card.eq, n: newly.join(',') }); if(r.first){ firstGlobal = true; bonus += 100; } }
      if(bonus > 0) K.earn(bonus, 'Discovery bonus'); K.touch('lab'); K.emit('lab');
      return ok('Made ' + (out.map(m => m.n + ' × ' + m.name).join(', ') || 'nothing'), { made: out, fee, bonus, newly: newly.map(k => ({ key: k, name: Chem.nameOf(k) })), firstGlobal, equation: card.eq, y: sim.y, hazard: sim.hazard, src, tLabel: sim.tLabel, heat: sim.heat });
    },
    tray: () => Object.keys(K.S.lab.tray).map(k => { const sp = Chem.speciesOf(k), u = K.S.lab.tray[k], apu = sp.apu || 1; return { key: k, units: u, moles: Math.floor(u / apu), f: sp.f, kind: sp.kind, name: sp.kind === 'element' ? Chem.elements[k].name : Chem.nameOf(k) }; }),
    trayUnits: k => K.S.lab.tray[k] || 0,
    collect(key){ const u = K.S.lab.tray[key]; if(!(u > 0)) return no('Nothing to collect.'); K.invAdd(K.kindOf(key), key, u); delete K.S.lab.tray[key]; K.touch('lab'); K.emit('lab'); return ok('Added to your inventory.'); },
    collectAll(){ Object.keys(K.S.lab.tray).forEach(k => { K.invAdd(K.kindOf(k), k, K.S.lab.tray[k]); delete K.S.lab.tray[k]; }); K.touch('lab'); K.emit('lab'); return ok('Everything added to your inventory.'); },
    graph: key => graphOf(key), identify: key => identify(key), ff: ffTools,
    step: { plan: stepPlan, run: stepRun, simulate: stepSim, options: stepOptions, items: stepItems, route: stepRoute, clamp: clampStep, cacheInfo: () => Object.assign({ cards: SYN.cards.size }, SYN.hits), label: nmOf, owns, props: k => Synth.props(k), watch: cb => K.cloud.watchDiscoveries(cb) },
    found: () => K.S.lab.found.slice(), runs: () => K.S.lab.runs, cacheInfo: () => Object.assign({ cards: SEEN.cards.size }, SEEN.hits),
    async registry(){ try{ const r = await fetch('lab-cache/discoveries.json', { cache: 'no-cache' }); return r.ok ? await r.json() : {}; }catch(e){ return {}; } }
  };

  /* ---------------- homes: WestMap's houses, rent, loans and the economy (os/kernel/ledger.js) ---------------- */
  const LG = K.ledger, WG = WorldGen;
  const R = p => Promise.resolve(p).then(r => r && r.ok ? Object.assign({ ok: true }, r) : { ok: false, msg: (r && r.msg) || 'Not possible right now.' });
  const homes = {
    ready: () => !LG.guest && !LG.offline, offline: () => LG.offline, guest: () => LG.guest, needsOnboarding: () => LG.needsOnboarding(), homeless: () => LG.homeless(),
    grantAmount: () => LG.grantAmount(), isOG: () => LG.og, claimGrant: () => R(LG.claimGrant()),
    home: () => LG.living(), mine: () => LG.myHouses(), meta: () => Object.assign({}, LG.meta), cfg: () => JSON.parse(JSON.stringify(LG.cfg)), stats: () => LG.stats && JSON.parse(JSON.stringify(LG.stats)),
    watch: () => LG.watchWorld(), world: () => LG.world || {}, events: () => LG.events || {}, bots: () => LG.loadBots(), gen: WG, house: id => WG.house(+String(id).slice(1)),
    fresh: async id => (await K.cloud.db.ref('world/own/' + id).once('value')).val(),
    sellValue: v => LG.sellValue(v), duty: p => LG.dutyOf(p), rentDay: h => LG.rentDay(h), rentLeftMs: () => LG.rentLeftMs(), uid: () => K.cloud.user && K.cloud.user.uid,
    buy: (id, live) => R(LG.buy(id, live)), sellToCity: id => R(LG.sellToCity(id)), setAsk: (id, d) => R(LG.setAsk(id, d)), setRent: (id, d) => R(LG.setRent(id, d)), evict: id => R(LG.evict(id)),
    rent: (id, hrs) => R(LG.rent(id, hrs)), topUp: hrs => R(LG.topUp(hrs)), leave: () => R(LG.leave()), setHome: id => R(LG.setHome(id)), moveOut: () => R(LG.moveOut()), requestHousing: () => LG.requestHousing(),
    pay: (to, d) => R(LG.send(to, d, 'pay', '')),
    licence: () => ({ active: LG.licActive(), leftMs: LG.licLeftMs(), fee: LG.cfg.licFee / 100, days: LG.cfg.licDays, markup: LG.cfg.buildMarkupBp / 10000 }), buyLicence: () => R(LG.buyLicence()), build: t => R(LG.build(t)), buildTypes: () => LG.buildTypes(),
    orders: () => Object.keys(LG.orders || {}).sort().map(slot => Object.assign({ slot }, LG.orders[slot])),
    plot: kind => LG.hasPlot(kind), plotFee: kind => LG.plotFee(kind) / 100, buyPlot: kind => R(LG.buyPlot(kind)), gate: id => (C.isAdmin() && K.prefs.adminBypass === true) ? null : LG.gate(id),   // admin-only 'open without buying' switch (Settings → Administrator)
    watchMap: on => LG.watchMap(!!on), plots: () => LG.plots || {}, locs: () => LG.locs || {}, allHomes: () => LG.homes || {},
    /* cars and planes (data/vehicle-data.js): the garage, and the dealership / airport purchases (the app only offers Buy while you stand there in the real world) */
    garage: () => LG.vehicles(), garageValue: () => LG.vehValue(), vehicleCatalogue: () => VehicleData,
    buyVehicle: (model, col) => R(LG.buyVehicle(model, col)), rentVehicle: model => R(LG.rentVehicle(model)), sellVehicle: slot => R(LG.sellVehicle(slot)), repaintVehicle: (slot, col) => R(LG.repaintVehicle(slot, col))
  };
  const loans = { list: () => LG.loanList(), plans: () => LG.plans(), limit: () => LG.loanLimit(), owed: () => LG.debt(), take: (plan, d) => R(LG.takeLoan(plan, d)), repay: (slot, d) => R(LG.repay(slot, d)) };
  /* the old fixed-property API now only reports your houses (kept so older widgets keep working) */
  const props = {
    list: () => LG.myHouses().map(h => ({ id: h.id, name: h.g.addr, sector: 'housing', desc: h.g.typeName + ' · ' + h.g.district, price: LG.sellValue(h.v), owned: true, paid: 0 })),
    history: (id, days, n) => [], sector: s => World.sectorIndex(s, K.now()), sellValue: () => 0, rentDue: () => 0, value: K.propValue
  };

  /* ---------------- bank ---------------- */
  const bank = {
    balance: () => K.S.cash, bills: K.bank.bills, open: K.bank.open, owed: K.bank.owed, preview: K.bank.preview, pay: id => R(K.bank.pay(id)), payAll: () => K.bank.payAll(), rate: K.bank.rate,
    history: () => K.S.bank.hist.slice(), config: () => ({ threshold: K.bank.threshold(), taxRate: K.taxRate(), dutyRate: LG.cfg.dutyBp / 10000, propTaxDay: LG.cfg.propTaxBpDay / 10000, maxRate: 0.02 }), threshold: () => K.bank.threshold(), netWorth: K.netWorth,
    breakdown: () => ({ cash: K.S.cash, inventory: K.inventoryValue(), stock: K.stockValue(), property: K.propValue(), vehicles: K.vehValue ? K.vehValue() : 0 }), debt: () => LG.debt()
  };


  const CSN = K.arcade, CG = CSN.games, frz = o => Object.freeze(o);
  const arcade = { status: CSN.status, config: CSN.config, load: f => CSN.loadConfig(f).then(() => CSN.config()), round: CSN.round, defaults: () => JSON.parse(JSON.stringify(ArcadeGames.DEFAULT_CFG)), cardName: ArcadeGames.cardName, isRed: ArcadeGames.isRed, handName: ArcadeGames.handName,
    slots: frz({ spin: CG.slots.spin, paytable: CG.slots.paytable }), blackjack: frz({ deal: CG.blackjack.deal, hit: CG.blackjack.hit, stand: CG.blackjack.stand, double: CG.blackjack.double, view: CG.blackjack.view }),
    bus: frz({ start: CG.bus.start, pick: CG.bus.pick, cashOut: CG.bus.cashOut, view: CG.bus.view }), poker: frz({ start: CG.poker.start, act: CG.poker.act, next: CG.poker.next, fastForward: CG.poker.fastForward, view: CG.poker.view }) };

  /* ---------------- factory (WestFactory: the kernel runs the lines and the market; the app only asks) ---------------- */
  const FAC = K.factory, factory = { state: FAC.state, found: FAC.found, quote: FAC.quote, chanceAt: FAC.chanceAt, addLine: FAC.addLine, buySlot: FAC.buySlot, upgrade: FAC.upgrade, setRate: FAC.setRate, setOn: FAC.setOn, setAuto: FAC.setAuto, setReserve: FAC.setReserve, setPos: FAC.setPos, sources: FAC.sources, recipes: FAC.recipes, gAdd: FAC.gAdd, gMove: FAC.gMove, gDel: FAC.gDel, gWire: FAC.gWire, gUnwire: FAC.gUnwire, gAuto: FAC.gAuto, gClear: FAC.gClear,
    setRoute: FAC.setRoute, setPrice: FAC.setPrice, sellNow: FAC.sellNow, remove: FAC.remove, collect: FAC.collect, withdraw: FAC.withdraw, claim: FAC.claim, market: { listings: FAC.market.listings, buy: FAC.market.buy } };

  /* ---------------- leaderboard (its own app; the Bank no longer ranks anyone) ---------------- */
  const LBC = new Map();                                              // one query per category, cached for 30 s, so opening and flipping tabs costs almost nothing
  async function lbRaw(){                                           // ONE read of every player's record, cached 30 s; every category and the table are ranked from it
    const hit = LBC.get('raw'); if(hit && Date.now() - hit.at < 30000) return hit.rows;
    try{ await K.cloud.publishBoard(true); }catch(e){}
    const rows = await K.cloud.leaderboardRaw(); LBC.set('raw', { at: Date.now(), rows }); return rows;
  }
  const leaderboard = {
    categories: () => K.cloud.LB.map(c => Object.assign({}, c)),
    mine: () => K.cloud.boardEntry(),
    async list(id, n){
      const cat = K.cloud.LB.find(c => c.id === id) || K.cloud.LB[0]; n = Math.max(5, Math.min(50, n || 25));
      return (await lbRaw()).slice().sort((a, b) => b[cat.field] - a[cat.field]).slice(0, n);
    },
    async all(){ return (await lbRaw()).slice().sort((a, b) => b.nw - a.nw); },   // every player's full record
    refresh: () => LBC.clear()
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
  const games = { award: (id, base) => { base = Math.max(0, Math.min(40, +base || 0)); return K.award(String(id).slice(0, 30), base); }, info: () => { const g = K.gameDay(); return { earned: g.earned, softcap: Math.round(CFG.game.dailySoftcap * K.econ()), plays: Object.assign({}, g.plays), bonus: K.collectionBonus() }; } };
  const files = { record: uid => C.serverRecord(uid), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }) };
  const world = { articles: n => World.latestArticles(K.now(), n || 12), mults: () => World.elementMults(K.now()), sector: s => World.sectorIndex(s, K.now()), impacts: () => World.impactsBefore(K.now(), 6) };
  const need_ = () => { if(!C.isAdmin()) throw new Error('Admin only.'); };
  const admin = {
    ok: C.isAdmin, players: () => C.admin.players(), read: uid => C.admin.read(uid), setField: (u, p, v) => C.admin.setField(u, p, v), reset: u => C.admin.reset(u), rename: (u, n) => C.admin.rename(u, n),
    mail: (u, s, b) => C.admin.mail(u, s, b), broadcast: (s, b) => C.admin.broadcast(s, b),
    ecoStatus: () => C.admin.ecoStatus(), ecoStart: c => C.admin.ecoStart(c), ecoCfg: p => C.admin.ecoCfg(p), ecoAudit: () => C.admin.ecoAudit(),
    maintenanceGet: () => { need_(); return K.maint.config(); }, maintenanceSet: c => { need_(); return C.admin.maintSet(c); },
    arcadeGet: () => { need_(); return CSN.loadConfig(true).then(() => CSN.config()); }, arcadeSet: c => { need_(); return C.admin.arcadeSet(c).then(() => CSN.loadConfig(true)); },
    setVolatility: l => K.market.admin.setVolatility(l), adjustPrice: (d, f) => K.market.admin.adjust(d, f), volatility: () => C.isAdmin() ? K.market.volLevel() : null, volLevels: () => C.isAdmin() ? K.market.admin.levels() : [], volLedger: () => C.isAdmin() ? K.market.volLedger() : [],
    gallery: { upload: (f, p) => K.gallery.upload(f, p), rename: (i, t) => K.gallery.rename(i, t), remove: i => K.gallery.remove(i), usage: () => K.gallery.loadUsage() }
  };
  const gallery = { list: f => K.gallery.list(f), thumb: m => K.gallery.thumb(m), view: (m, p) => K.gallery.view(m, p), full: (m, p) => K.gallery.full(m, p), stats: () => K.gallery.stats(), countView: id => K.gallery.countView(id), countDownload: id => K.gallery.countDownload(id), isCached: k => K.gallery.isCached(k), budgetOk: () => K.gallery.budgetOk(), wallpaper: id => K.gallery.wallpaper(id), errText: e => K.gallery.errText(e), item: id => K.gallery.item(id), canOpen: () => K.gallery.canOpen(), cacheSize: () => K.gallery.cacheSize(), clearCache: () => K.gallery.clearCache() };

  /* ---------------- maintenance mode: the actions behind a switched-off app / system refuse with the maintenance message ----------------
   * (the admin is exempt — see kernel/maint.js). Paying tax is deliberately NOT guarded, so a bill can never be seized because the Bank was "closed". */
  const mguard = (check, obj, names) => names.forEach(n => { const f = obj[n]; if(typeof f !== 'function') return; obj[n] = function(){ const m = check(); return m ? no(m) : f.apply(this, arguments); }; });
  const appG = id => () => K.maint.appMsg(id), sysG = k => () => K.maint.sysMsg(k);
  mguard(appG('WestShop'), shop, ['buy', 'sell']);
  mguard(appG('WestLab'), lab, ['buyTool', 'run', 'collect', 'collectAll']); mguard(appG('WestLab'), lab.step, ['run']);
  mguard(appG('WestMap'), homes, ['buy', 'sellToCity', 'setAsk', 'setRent', 'evict', 'rent', 'topUp', 'leave', 'setHome', 'requestHousing', 'buyLicence', 'build']);
  mguard(appG('RealEstate'), homes, ['buyVehicle', 'rentVehicle', 'sellVehicle', 'repaintVehicle']);
  mguard(appG('Stocks'), stock, ['buy', 'sell', 'sellQty', 'sellFraction', 'buyFraction', 'sellAll']); mguard(sysG('trading'), stock, ['buy', 'sell', 'sellQty', 'sellFraction', 'buyFraction', 'sellAll']);
  mguard(appG('WestFactory'), factory, ['addLine', 'buySlot', 'upgrade', 'setRate', 'setOn', 'setAuto', 'setReserve', 'gAdd', 'gDel', 'gWire', 'gUnwire', 'gAuto', 'gClear', 'setRoute', 'setPrice', 'sellNow', 'remove', 'collect', 'withdraw']);
  mguard(sysG('market'), factory.market, ['buy']); mguard(appG('WestShop'), factory.market, ['buy']);
  { const sr = factory.setRoute; factory.setRoute = function(id, route){ const m = route === 'market' ? K.maint.sysMsg('market') : ''; return m ? no(m) : sr.apply(this, arguments); }; }
  const maintenance = { app: id => K.maint.appMsg(id), sys: k => K.maint.sysMsg(k), site: () => K.maint.siteMsg(), note: () => K.maint.note(), config: () => K.maint.config(), systems: () => Object.assign({}, K.maint.SYS), lockedApps: () => K.maint.LOCKED_APPS.slice(), ready: () => K.maint.ready() };

  K.facade = {
    version: '1.0', cfg: { adminEmail: CFG.adminEmail, tax: CFG.tax },
    on: (e, f) => K.on(e, f), emit: undefined,
    now: K.now, today: K.today, cash: () => K.S.cash,
    prefs: { get: k => K.prefs[k], all: () => JSON.parse(JSON.stringify(K.prefs)), set: (k, v) => K.setPref(k, v) },
    shop, lab, props, homes, loans, bank, mail, auth, stock, games, arcade, factory, files, world, admin, gallery, leaderboard, maintenance, econ: () => K.econ(),
    report: { submit: r => C.report.submit(r), list: () => C.report.list(), setStatus: (i, s) => C.report.setStatus(i, s), remove: i => C.report.remove(i) },
    chem: Chem, phys: Phys, mol: Mol, worldModel: World,
    data: { ELEMENTS, CATEGORY_COLORS, CATEGORY_LABELS, GAS_AT_25C, LIQUID_AT_25C, UNKNOWN_STATE, STATE_COLORS, STATE_LABELS, BLOCK_COLORS, BLOCK_LABELS, COMPOUND_LOOKUP, CATEGORY_LOOKUP_LABELS, POLYATOMIC_IONS, DATABOOK, WANTED_DATA, PROPERTIES, PROPERTY_SECTORS, TOOLS, MELTING_POINTS, BOILING_POINTS, OXIDATION, ELECTRONEG, RECIPES, VEHICLES: VehicleData },
    nameOk: K.nameOk, netWorth: K.netWorth, sync: () => K.cloud.flushNow(), usage: () => ({ bytes: C.bytes, reads: C.reads, writes: C.writes }),
    notify: n => K.emit('notify', n)
  };
});
