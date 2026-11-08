/* KERNEL · factory — WestFactory's engine: reactor lines, the production loop, selling to WestShop and the player Market.
 *   - A line is a PLAYER-BUILT FLOWSHEET (FactorySim.graphSheet): l.g = { nodes:[{id,t:'src',sp,x,y} | {id,t:'rx',rc,x,y}], wires:[{a,b,s}], next } — Source nodes buy an element or a discovered compound, Reactor nodes
 *     run one recipe, wires carry one species; the warehouse is the virtual node 'o'. Old single-reactor lines are migrated to the equivalent graph (FactorySim.graphFromSheet) on load.
 *     lets the player buy an intermediate ready-made, or make a raw compound in-house; the solver prices and sizes every node from that.
 *   - Everything that moves money or items happens here; the app only asks (setRate, setPrice, sellNow …) and every call is re-validated.
 *   - Production buys the elements at today's WestShop price (+ overhead) and only uses compounds you have DISCOVERED in WestLab.
 *   - It runs while the page is open and catches up when you come back (at most 8 h), in 10-second steps.
 *   - Player Market: listings live in the database under market/listings, a buyer's payment arrives as a record under market/proceeds/<seller> which
 *     the seller's game collects (minus a 5 % fee). database.rules.json bounds every one of those writes.
 *   HONEST LIMIT: wallets are client-side on this site, so the Market is only as tamper-proof as the rest of the economy (see the Arcade notes). */
(window.__OSM = window.__OSM || []).push(function(K){
  const F = FactorySim, C = K.cloud, r2 = K.round2, CFG = Object.assign({}, F.DEFAULTS, (typeof OS_CONFIG !== 'undefined' && OS_CONFIG.factory) || {});
  const FA = K.factory = {}, STEP_MS = 10000, ELS = new Set(ELEMENTS.map(e => e[1]));
  const fmt = n => '$' + (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra), no = (msg, extra) => Object.assign({ ok: false, msg }, extra);
  const S = () => K.S.factory, num = (v, d) => isFinite(+v) ? +v : d;
  const compOf = f => { const sp = Chem.speciesOf(f); return sp && sp.kind !== 'element' && sp.comp ? sp.comp : null; };
  const keyOf = f => { const sp = Chem.speciesOf(f); return sp ? sp.key : null; };
  const nameOf = f => { try{ return Chem.nameOf(f); }catch(e){ return f; } };
  const elPrice = e => K.buyPrice(e);
  const est = f => K.listValue(f);
  const line = id => S().lines.find(l => l.id === id);
  let ticking = false, lastSave = 0, uiSig = ''; const pushAt = new Map();

  const cleanGraph = g => {
    const nodes = [], wires = [], ids = new Set(), clampN = v => F.clamp(Math.round(num(v, 0)), 0, 6000);
    K.toArr(g && g.nodes).slice(0, 24).forEach(n => {
      if(!n || !/^[a-z0-9]{1,8}$/.test(String(n.id)) || n.id === 'o' || ids.has(n.id)) return;
      if(n.t === 'src' && typeof n.sp === 'string' && /^[A-Za-z0-9()]{1,16}$/.test(n.sp)){ ids.add(n.id); nodes.push({ id: n.id, t: 'src', sp: n.sp, x: clampN(n.x), y: clampN(n.y) }); }
      else if(n.t === 'rx' && typeof n.rc === 'string' && /^[A-Za-z0-9()<+:]{1,60}$/.test(n.rc)){ ids.add(n.id); nodes.push({ id: n.id, t: 'rx', rc: n.rc, x: clampN(n.x), y: clampN(n.y) }); }
    });
    K.toArr(g && g.wires).slice(0, 48).forEach(w => { if(w && ids.has(w.a) && (w.b === 'o' || ids.has(w.b)) && typeof w.s === 'string' && /^[A-Za-z0-9()]{1,16}$/.test(w.s)) wires.push({ a: w.a, b: w.b, s: w.s }); });
    return { nodes, wires, next: Math.max(1, Math.floor(num(g && g.next, nodes.length + 1))) };
  };
  const migrate = l => { try{ return cleanGraph(F.graphFromSheet(F.flowsheet(l.f, { found: K.S.lab.found, opt: cleanOpt(l._o), rate: 1, atomPrice: elPrice, compOf, cfg: CFG }))); }catch(e){ return { nodes: [], wires: [], next: 1 }; } };   // old lines become the equivalent graph
  const cleanOpt = o => { const out = {}; if(o && typeof o === 'object') Object.keys(o).slice(0, 16).forEach(k => { if(/^[A-Za-z0-9()]{1,16}$/.test(k) && (o[k] === 'buy' || o[k] === 'make')) out[k] = o[k]; }); return out; };

  /* ---- state hygiene (called after every load / adopt) ---- */
  FA.sanitize = function(){
    const raw = K.S.factory && typeof K.S.factory === 'object' ? K.S.factory : {}, lines = K.toArr(raw.lines).slice(0, CFG.slotsMax);
    const out = { lines: [], slots: F.clamp(Math.floor(num(raw.slots, CFG.slotsStart)), CFG.slotsStart, CFG.slotsMax), reserve: F.clamp(num(raw.reserve, CFG.reserve), 0, 1e9), made: Math.max(0, num(raw.made, 0)), sold: Math.max(0, num(raw.sold, 0)), earned: Math.max(0, r2(num(raw.earned, 0))), lastTick: num(raw.lastTick, 0), nid: Math.max(1, Math.floor(num(raw.nid, 1))), pos: {} };
    lines.forEach(l => {
      if(!l || typeof l.f !== 'string' || !compOf(l.f)) return; const tier = F.clamp(Math.floor(num(l.tier, 1)), 1, CFG.maxTier);
      out.lines.push({ id: String(l.id || ('l' + out.nid++)).replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || ('l' + out.nid++), f: keyOf(l.f), tier, rate: F.clamp(num(l.rate, 0), 0, F.rateCap(tier, CFG)), on: l.on !== false, route: l.route === 'market' ? 'market' : 'shop',
        price: Math.max(0.01, r2(num(l.price, est(l.f)))), auto: l.auto !== false, stock: F.clamp(num(l.stock, 0), 0, F.storage(tier, CFG)), sellAt: num(l.sellAt, 0), listed: Math.max(0, Math.floor(num(l.listed, 0))), note: String(l.note || '').slice(0, 80), g: null, _o: l.opt, _g: l.g });
    });
    out.lines.forEach(l => { l.g = l._g ? cleanGraph(l._g) : migrate(l); delete l._g; delete l._o; });
    if(raw.pos && typeof raw.pos === 'object') Object.keys(raw.pos).filter(k => /^wh:[^:]+$|^hub:|^bank$/.test(k)).slice(0, 40).forEach(k => { const p = raw.pos[k]; if(p && isFinite(+p.x) && isFinite(+p.y)) out.pos[String(k).slice(0, 40)] = { x: Math.round(+p.x), y: Math.round(+p.y) }; });
    K.S.factory = out;
  };

  /* ---- derived numbers for the UI ---- */
  const proc = f => F.process(f, K.S.lab.found, CFG);                       // how this product is made right now (real multistep process, or direct from the elements)
  const autoOf = (f, opt, rate) => F.flowsheet(f, { found: K.S.lab.found, opt, rate, atomPrice: elPrice, compOf, cfg: CFG });   // the real industrial route as a tree (used by 'Auto-build' and the add-line margins)
  const sheetOf = (l, rate) => F.graphSheet(l.g, { f: l.f, found: K.S.lab.found, rate, atomPrice: elPrice, compOf, cfg: CFG, cap: 3 * F.rateCap(l.tier, CFG) });   // the player's graph, solved (rate 0 = structure + unit cost only)
  let memo = null;                                                              // per-tick cache of unit costs (prices don't move inside one tick)
  const sheetFor = l => { if(memo && memo.has(l.id)) return memo.get(l.id); const sh = sheetOf(l, 0); if(memo) memo.set(l.id, sh); return sh; };
  function view(l){
    const pr = proc(l.f), comp = compOf(l.f) || {}, e = est(l.f), rg = F.shopRange(e, CFG), q = l.route === 'shop' ? FA.quote(l.id) : null, run = l.on && l.rate > 0, sh = sheetOf(l, run ? l.rate : 0);
    return { id: l.id, f: l.f, name: nameOf(l.f), tier: l.tier, cap: F.rateCap(l.tier, CFG), rate: l.rate, on: l.on, route: l.route, price: l.price, auto: l.auto, stock: l.stock, storage: F.storage(l.tier, CFG), listed: l.listed,
      comp, est: e, shopRange: rg, marketRange: F.marketRange(e, CFG), upgradeCost: F.upgradeCost(l.tier, CFG), unitCost: isFinite(sh.unit) ? r2(sh.unit) : 0, sheet: sh, g: gOf(l), rateEff: sh.effRate, process: { mode: pr.mode, steps: pr.steps.map(x => ({ eq: x.eq, name: x.name, y: x.y })), yield: pr.yield, missing: pr.missing },
      costPerMin: run ? r2(sh.costPerMin) : 0, chance: q ? q.chance : null, sat: q ? q.sat : null, lockLeft: Math.max(0, Math.ceil((l.sellAt - K.now()) / 1000)), note: l.note, batch: F.batch(l.tier, CFG), full: l.stock >= F.storage(l.tier, CFG) - 1e-6 };
  }
  FA.state = function(){
    const s = S(), lines = s.lines.map(view); let cost = 0, rev = 0, mol = 0;
    lines.forEach(l => {                                                              // long-run flow: a refused price slows SELLING, the warehouse fills and production follows it
      if(!(l.on && l.rate > 0 && l.rateEff > 0)) return; let eff = l.rateEff;
      if(l.route === 'shop' && l.chance != null){ const c = Math.max(0.02, l.chance); eff = Math.min(l.rateEff, l.batch * c / ((c * 5 + (1 - c) * 60) / 60)); }
      cost += l.costPerMin * eff / l.rateEff; mol += eff; rev += eff * l.price * (l.route === 'shop' ? 1 : 1 - CFG.marketFee);
    });
    return { lines, slots: s.slots, maxSlots: CFG.slotsMax, nextSlotCost: F.slotCost(s.slots, CFG), reserve: s.reserve, made: s.made, sold: s.sold, earned: s.earned, pos: Object.assign({}, s.pos), perMin: { mol: r2(mol), cost: r2(cost), rev: r2(rev), net: r2(rev - cost) }, cfg: { fee: CFG.marketFee, failLockMs: CFG.failLockMs, shopLo: CFG.shopLo, shopHi: CFG.shopHi, maxTier: CFG.maxTier }, online: C.signedIn() };
  };
  FA.found = () => K.S.lab.found.filter(f => compOf(f)).map(f => ({ f, name: nameOf(f), est: est(f), comp: compOf(f), unitCost: r2(autoOf(f, {}, 0).unit), process: proc(f).mode }));
  FA.quote = function(id){
    const l = line(id); if(!l) return null; const e = est(l.f), rg = F.shopRange(e, CFG), n = Math.max(1, Math.min(Math.floor(l.stock) || F.batch(l.tier, CFG), F.batch(l.tier, CFG)));
    const quote = K.sellQuote(l.f, n), sat = F.clamp(quote.avg / (0.7 * e || 1), 0.3, 1), price = F.clamp(l.price, rg.lo, rg.hi);
    return { est: e, lo: rg.lo, hi: rg.hi, price, ratio: price / e, sat, chance: F.shopChance(price / e, sat, CFG) };
  };
  FA.chanceAt = (id, price) => { const l = line(id); if(!l) return 0; const e = est(l.f), q = FA.quote(id); return F.shopChance(price / e, q.sat, CFG); };

  /* ---- the loop ---- */
  function produce(l, minutes){
    if(!l.on || !(l.rate > 0)) return;
    const comp = compOf(l.f); if(!comp) return; const sh = sheetFor(l);
    if(!isFinite(sh.unit)){ l.note = (sh.issues.length ? 'Incomplete: ' + sh.issues[0].msg : l.g.nodes.length ? 'Not producing — check the wiring' : 'Build the process: add sources and reactors').slice(0, 80); return; }
    const plan = F.planProduction({ comp, price: elPrice, rate: Math.min(l.rate, sh.maxRate), minutes, unit: sh.unit, cash: K.S.cash, reserve: S().reserve, space: F.storage(l.tier, CFG) - l.stock, cfg: CFG });
    l.note = plan.made <= 0 ? (l.stock >= F.storage(l.tier, CFG) - 1e-6 ? 'Warehouse full' : (plan.unit > 0 ? 'Low on cash' : '')) : (plan.limited ? 'Low on cash' : (sh.maxRate < l.rate - 1e-6 ? 'A reactor is the bottleneck' : ''));
    if(plan.made <= 0) return;
    if(plan.cost > 0 && !K.spend(plan.cost, 'WestFactory: ' + l.f + ' inputs')) return;
    l.stock = Math.min(F.storage(l.tier, CFG), l.stock + plan.made); S().made += plan.made;
  }
  function attemptShop(l, now){
    const n = Math.min(Math.floor(l.stock), F.batch(l.tier, CFG)); if(n < 1 || now < l.sellAt) return null;
    const q = FA.quote(l.id); if(!q) return null;
    if(Math.random() < q.chance){
      const rev = r2(q.price * n); l.stock -= n; S().sold += n; S().earned = r2(S().earned + rev); K.noteSale(l.f, n); K.earn(rev, 'WestFactory: sold ' + n + ' × ' + l.f); l.sellAt = now + CFG.okLockMs; l.note = 'Sold ' + n + ' for ' + fmt(rev);
      return { ok: true, n, rev, price: q.price };
    }
    l.sellAt = now + CFG.failLockMs; l.note = 'WestShop passed — retry in 1 min'; return { ok: false, n, price: q.price, chance: q.chance };
  }
  async function pushMarket(l, force){
    if(!C.signedIn() || !C.db || K.sessionLost) return; const n = Math.floor(l.stock), now = Date.now();
    if(K.maint.sysMsg('market')){ l.note = 'Market is in maintenance mode'; return; }
    if(n < 1 || (!force && (n < 10 && now - (pushAt.get(l.id) || 0) < 60000))) return;
    if(!K.S.meta.name) { l.note = 'Set a display name in Settings to list on the Market'; return; }
    if(l.listed + n > CFG.listCap){ l.note = 'Market listing is full'; return; }
    pushAt.set(l.id, now); const uid = C.user.uid, ref = C.db.ref('market/listings/' + uid + '-' + l.id), take = Math.min(n, CFG.listCap - l.listed);
    try{
      const snap = await ref.once('value');
      if(!snap.exists()) await ref.set({ u: uid, n: String(K.S.meta.name).slice(0, 20), f: l.f, nm: nameOf(l.f).slice(0, 60), p: l.price, q: take, t: firebase.database.ServerValue.TIMESTAMP });
      else { await ref.child('q').transaction(q => (q || 0) + take); await ref.update({ p: l.price, f: l.f, nm: nameOf(l.f).slice(0, 60), n: String(K.S.meta.name).slice(0, 20), t: firebase.database.ServerValue.TIMESTAMP }); }
      l.stock -= take; l.note = 'Listed ' + take + ' on the Market'; K.touch('factory'); await C.flushNow();      // the molecules left the warehouse: save that NOW, or a closed tab would bring them back while they're still listed
    }catch(e){ l.note = 'Market unreachable — will retry'; }
  }
  async function syncListed(l){                                                     // how much of this line is still waiting for a buyer
    if(!C.signedIn() || !C.db) return; try{ const s = await C.db.ref('market/listings/' + C.user.uid + '-' + l.id + '/q').once('value'); l.listed = Math.max(0, Math.floor(s.val() || 0)); }catch(e){}
  }
  FA.step = function(minutes, now){
    const s = S(); let changed = false;
    s.lines.forEach(l => {
      const before = l.stock; produce(l, minutes); if(l.stock !== before) changed = true;
      if(l.route === 'shop' && l.auto) { const r = attemptShop(l, now); if(r) changed = true; }
    });
    return changed;
  };
  FA.tick = async function(){
    if(ticking || !K.loaded || K.sessionLost) return;                          // a locked (older) window must not make or spend money
    if(K.maint.appMsg('WestFactory')) return;                                   // in maintenance the lines stand still; the time is caught up (within the usual cap) when it ends
    ticking = true; memo = new Map();
    try{
      const s = S(), now = K.now(); if(!s.lines.length){ s.lastTick = now; return; }
      let from = s.lastTick > 0 ? s.lastTick : now; if(now - from > CFG.offlineMaxMin * 60000) from = now - CFG.offlineMaxMin * 60000;
      let changed = false, t = from;
      while(now - t >= STEP_MS - 1){ t += STEP_MS; if(FA.step(STEP_MS / 60000, t)) changed = true; }
      s.lastTick = t; if(changed || Date.now() - lastSave > 60000){ K.touch('factory'); lastSave = Date.now(); }
      for(const l of s.lines){ if(l.route === 'market') await pushMarket(l); }
      const sig = JSON.stringify(s.lines.map(l => [l.stock | 0, l.note, l.listed])); if(sig !== uiSig || changed){ uiSig = sig; K.emit('factory'); }
    } finally { ticking = false; memo = null; }
  };
  setInterval(() => { try{ FA.tick(); }catch(e){ console.error(e); } }, STEP_MS);
  K.on('loaded', () => { K.S.factory.lastTick = K.S.factory.lastTick || K.now(); setTimeout(async () => { try{ await FA.tick(); await FA.claim(true); }catch(e){} }, 800); });

  /* ---- actions ---- */
  const touch = () => { K.touch('factory'); K.emit('factory'); };
  FA.addLine = function(f){
    const s = S(), key = keyOf(f); if(!key || !compOf(key)) return no('Unknown compound.');
    if(!K.S.lab.found.some(x => keyOf(x) === key)) return no('Discover it in WestLab first.');
    if(s.lines.length >= s.slots) return no('No free line — buy another slot.');
    if(s.lines.some(l => l.f === key)) return no('You already produce that.');
    const id = 'l' + (s.nid++); s.lines.push({ id, f: key, tier: 1, rate: 1, on: true, route: 'shop', price: r2(est(key) * 0.9), auto: true, stock: 0, sellAt: 0, listed: 0, note: '', g: { nodes: [], wires: [], next: 1 } }); touch(); return ok('Line built for ' + nameOf(key) + '.', { id });
  };
  FA.buySlot = function(){ const s = S(), c = F.slotCost(s.slots, CFG); if(c == null) return no('You already have every slot.'); if(!K.spend(c, 'WestFactory: new line slot')) return no('You need ' + fmt(c) + '.'); s.slots++; touch(); return ok('Slot unlocked for ' + fmt(c) + '.'); };
  FA.upgrade = function(id){ const l = line(id); if(!l) return no('No such line.'); const c = F.upgradeCost(l.tier, CFG); if(c == null) return no('Already at the top tier.'); if(!K.spend(c, 'WestFactory: upgrade ' + l.f)) return no('You need ' + fmt(c) + '.'); l.tier++; touch(); return ok('Upgraded to tier ' + l.tier + ' (max ' + F.rateCap(l.tier, CFG) + ' mol/min).'); };
  FA.setRate = function(id, r){ const l = line(id); if(!l) return no('No such line.'); l.rate = F.clamp(r2(num(r, 0)), 0, F.rateCap(l.tier, CFG)); touch(); return ok('Rate set.'); };
  FA.setOn = function(id, on){ const l = line(id); if(!l) return no('No such line.'); l.on = !!on; touch(); return ok(on ? 'Line running.' : 'Line paused.'); };
  FA.setAuto = function(id, a){ const l = line(id); if(!l) return no('No such line.'); l.auto = !!a; touch(); return ok('Saved.'); };
  /* ---- flowsheet editing: every call is re-validated here; the app only asks ---- */
  function gOf(l){ if(!l.g || typeof l.g !== 'object') l.g = { nodes: [], wires: [], next: 1 }; if(!Array.isArray(l.g.nodes)) l.g.nodes = []; if(!Array.isArray(l.g.wires)) l.g.wires = []; return l.g; }
  const gSp = /^[A-Za-z0-9()]{1,16}$/;
  FA.sources = function(){                                                          // what a Source node can buy: every element, plus the compounds you have discovered (and water)
    const P = F.priceFn(F.cfgOf(CFG), { atomPrice: elPrice, compOf }), found = new Set(K.S.lab.found.map(keyOf).filter(Boolean)), out = [];
    ELEMENTS.forEach(e => { const sym = e[1], sp = ['H', 'N', 'O', 'F', 'Cl', 'Br', 'I'].includes(sym) ? sym + '2' : sym; out.push({ sp, name: e[2] + (sp !== sym ? ' (' + sp.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]) + ')' : ''), price: r2(P.price(sp)), el: true }); });
    K.S.lab.found.filter(f => compOf(f)).concat(found.has('H2O') ? [] : ['H2O']).forEach(f => { out.push({ sp: f, name: nameOf(f), price: r2(P.price(f)), el: false }); });
    return out;
  };
  /* The factory's recipe book is checked against WestLab's own engine: a recipe is usable only if Chem.solve gives exactly its products from its reagents (the conditions it asks for are shown). */
  const LAB_CONDS = [[], ['heat'], ['heat', 'catalyst'], ['heat', 'pressure'], ['heat', 'catalyst', 'pressure'], ['spark']], labMemo = {};
  const labOf = rc => {
    if(labMemo[rc.id]) return labMemo[rc.id]; const want = Object.keys(rc.out).map(keyOf).sort().join(); let res = { ok: false, needs: [] };
    for(const c of LAB_CONDS){ try{ const x = Chem.solve(Object.keys(rc.in), c); if(x && x.ok && x.products.map(q => q.s.key).sort().join() === want){ res = { ok: true, needs: x.needs || [] }; break; } }catch(e){} }
    return (labMemo[rc.id] = res);
  };
  FA.recipes = () => F.recipes(K.S.lab.found, compOf, CFG).map(r => { if(r.kind !== 'real') return Object.assign(r, { needs: [], lab: true }); const lb = labOf(r); return Object.assign(r, { needs: lb.needs, lab: lb.ok, locked: r.locked || !lb.ok, reason: lb.ok ? '' : 'not a reaction WestLab can run' }); });
  FA.gAdd = function(id, kind, ref, x, y){
    const l = line(id); if(!l) return no('No such line.'); const g = gOf(l); if(g.nodes.length >= 24) return no('A plant can have at most 24 nodes.'); ref = String(ref);
    const n = { id: 'n' + (g.next++), t: kind === 'src' ? 'src' : 'rx', x: F.clamp(Math.round(num(x, 40)), 0, 6000), y: F.clamp(Math.round(num(y, 40)), 0, 6000) };
    if(kind === 'src'){ if(!gSp.test(ref)) return no('Unknown source.'); if(!FA.sources().some(s => s.sp === ref)) return no('You can’t buy that yet.'); n.sp = ref; }
    else { const rc = FA.recipes().find(r => r.id === ref); if(!rc) return no('Unknown recipe.'); if(!rc.lab) return no('WestLab can’t run that reaction, so neither can the factory.'); if(rc.locked) return no('Discover ' + rc.missing.map(F.sub).join(', ') + ' in WestLab to unlock this recipe.'); n.rc = ref; }
    g.nodes.push(n); touch(); return ok('Added.', { nid: n.id });
  };
  FA.gMove = function(id, nid, x, y){ const l = line(id), n = l && gOf(l).nodes.find(q => q.id === nid); if(!n) return; n.x = F.clamp(Math.round(num(x, n.x)), 0, 6000); n.y = F.clamp(Math.round(num(y, n.y)), 0, 6000); K.touch('factory'); };
  FA.gDel = function(id, nid){ const l = line(id); if(!l) return no('No such line.'); const g = gOf(l); if(!g.nodes.some(q => q.id === nid)) return no('No such node.'); g.nodes = g.nodes.filter(q => q.id !== nid); g.wires = g.wires.filter(w => w.a !== nid && w.b !== nid); touch(); return ok('Removed.'); };
  FA.gWire = function(id, a, b, sp){
    const l = line(id); if(!l) return no('No such line.'); const g = gOf(l), sh = sheetOf(l, 0); sp = String(sp); if(g.wires.length >= 48) return no('Too many wires (48 max).');
    const A = sh.nodes.find(q => q.id === a); if(!A || !A.outs[sp]) return no('That node doesn’t output ' + F.sub(sp) + '.');
    if(b === 'o'){ if(sp !== l.f) return no('The warehouse only takes ' + F.sub(l.f) + '.'); }
    else { const B = sh.nodes.find(q => q.id === b); if(!B || B.t !== 'rx' || !B.ins[sp]) return no('That reactor doesn’t take ' + F.sub(sp) + '.'); if(a === b) return no('A reactor can’t feed itself directly.'); }
    if(g.wires.some(w => w.a === a && w.b === b && w.s === sp)) return no('Already connected.');
    g.wires.push({ a, b, s: sp }); touch(); return ok('Connected.');
  };
  FA.gUnwire = function(id, a, b, sp){ const l = line(id); if(!l) return no('No such line.'); const g = gOf(l), n = g.wires.length; g.wires = g.wires.filter(w => !(w.a === a && w.b === b && w.s === sp)); if(g.wires.length === n) return no('No such wire.'); touch(); return ok('Wire removed.'); };
  FA.gAuto = function(id){ const l = line(id); if(!l) return no('No such line.'); const sh = autoOf(l.f, {}, 1); if(!sh.reactors.length) return no('No route for that.'); l.g = cleanGraph(F.graphFromSheet(sh)); touch(); return ok((sh.reactors.length > 1 ? 'Built the industrial route, stage by stage — rearrange or edit it.' : 'Built a single reactor — this product has no multi-stage route.') + (sh.unstudied && sh.unstudied.length ? ' Discover ' + sh.unstudied.map(F.sub).join(', ') + ' in WestLab to remove the +25 % unstudied-process cost.' : '')); };
  FA.gClear = function(id){ const l = line(id); if(!l) return no('No such line.'); l.g = { nodes: [], wires: [], next: 1 }; touch(); return ok('Cleared.'); };
  FA.setReserve = function(v){ S().reserve = F.clamp(r2(num(v, 0)), 0, 1e9); touch(); return ok('Cash reserve saved.'); };
  FA.setPos = function(key, x, y){ const p = S().pos; key = String(key).slice(0, 40); if(isFinite(+x) && isFinite(+y)){ p[key] = { x: Math.round(+x), y: Math.round(+y) }; K.touch('factory'); } };
  FA.setRoute = async function(id, route){
    const l = line(id); if(!l) return no('No such line.'); route = route === 'market' ? 'market' : 'shop';
    if(route === 'market' && !C.signedIn()) return no('Sign in to sell on the Market.');
    if(route === 'shop' && l.route === 'market') await FA.withdraw(id, true);
    l.route = route; l.note = ''; if(route === 'market') l.price = F.clamp(l.price, F.marketRange(est(l.f), CFG).lo, F.marketRange(est(l.f), CFG).hi); else l.price = F.clamp(l.price, F.shopRange(est(l.f), CFG).lo, F.shopRange(est(l.f), CFG).hi);
    touch(); return ok(route === 'market' ? 'Selling on the player Market.' : 'Selling to WestShop.');
  };
  FA.setPrice = async function(id, p){
    const l = line(id); if(!l) return no('No such line.'); p = r2(num(p, 0)); const e = est(l.f), rg = l.route === 'shop' ? F.shopRange(e, CFG) : F.marketRange(e, CFG);
    if(!(p >= rg.lo && p <= rg.hi)) return no('Price must be between ' + fmt(rg.lo) + ' and ' + fmt(rg.hi) + ' for ' + (l.route === 'shop' ? 'WestShop.' : 'the Market.'));
    l.price = p; touch();
    if(l.route === 'market' && C.signedIn() && C.db && l.listed > 0){ try{ await C.db.ref('market/listings/' + C.user.uid + '-' + l.id + '/p').set(p); }catch(e){} }
    return ok('Price set to ' + fmt(p) + '.');
  };
  FA.sellNow = function(id){
    const l = line(id); if(!l) return no('No such line.'); if(l.route !== 'shop') return no('This line sells on the Market.');
    const left = l.sellAt - K.now(); if(left > 0) return no('WestShop is not buying from this line for another ' + Math.ceil(left / 1000) + ' s.');
    if(Math.floor(l.stock) < 1) return no('Nothing in the warehouse.');
    const r = attemptShop(l, K.now()); touch(); if(!r) return no('Nothing to sell.');
    return r.ok ? ok('Sold ' + r.n + ' mol for ' + fmt(r.rev) + '.', r) : no('WestShop passed on ' + fmt(r.price) + '. Try again in a minute — or lower your price.', r);
  };
  FA.remove = async function(id){
    const l = line(id); if(!l) return no('No such line.'); if(l.route === 'market') await FA.withdraw(id, true);
    const back = Math.floor(l.stock); if(back > 0) K.invAdd('compound', l.f, back);
    S().lines = S().lines.filter(x => x.id !== id); touch(); return ok('Line removed' + (back > 0 ? ' — ' + back + ' mol moved to your bag.' : '.'));
  };
  FA.collect = function(id){                                                       // move the warehouse into your bag (to sell in WestShop by hand, or keep)
    const l = line(id); if(!l) return no('No such line.'); const n = Math.floor(l.stock); if(n < 1) return no('Nothing to collect.');
    l.stock -= n; K.invAdd('compound', l.f, n); touch(); return ok('Moved ' + n + ' mol to your bag.');
  };

  /* ---- player Market ---- */
  FA.market = {
    async listings(){
      if(!C.signedIn() || !C.db) return [];
      const s = await C.db.ref('market/listings').orderByChild('t').limitToLast(150).once('value'), out = [];
      s.forEach(c => { const v = c.val(); if(v && v.q > 0 && typeof v.f === 'string' && compOf(v.f)) out.push({ id: c.key, seller: v.u, sellerName: String(v.n || 'Player'), f: v.f, name: String(v.nm || nameOf(v.f)), price: +v.p, qty: Math.floor(v.q), t: v.t, est: est(v.f), mine: v.u === C.user.uid }); });
      return out.sort((a, b) => (b.t || 0) - (a.t || 0));
    },
    async buy(id, k){
      if(!C.signedIn() || !C.db) return no('Sign in to use the Market.'); k = Math.floor(k); if(!(k >= 1) || k > 100000) return no('Choose a quantity.');
      const ref = C.db.ref('market/listings/' + id), snap = await ref.once('value'), v = snap.val(); if(!v) return no('That listing is gone.');
      if(v.u === C.user.uid) return no('That’s your own listing.'); if(!compOf(v.f)) return no('Not a valid item.'); if(!(v.p > 0)) return no('Bad listing.');
      const cost = r2(v.p * k); if(K.S.cash < cost) return no('You need ' + fmt(cost) + '.');
      let taken = 0; const res = await ref.child('q').transaction(q => { if(typeof q !== 'number' || q < k) return; taken = k; return q - k; });
      if(!res.committed || !taken) return no('Not enough left — someone else bought it.');
      if(!K.spend(cost, 'Market: bought ' + k + ' × ' + v.f)){ await ref.child('q').transaction(q => (q || 0) + k); return no('You need ' + fmt(cost) + '.'); }
      K.invAdd('compound', keyOf(v.f), k);
      const rec = { lid: id, k, amt: cost, b: C.user.uid, f: String(v.f).slice(0, 40), t: firebase.database.ServerValue.TIMESTAMP };
      for(let i = 0; i < 3; i++){ try{ await C.db.ref('market/proceeds/' + v.u).push(rec); break; }catch(e){ if(i === 2) console.warn('[market] could not record payment', e); await new Promise(r => setTimeout(r, 600)); } }
      await C.flushNow(); return ok('Bought ' + k + ' × ' + nameOf(v.f) + ' for ' + fmt(cost) + '.', { cost });
    }
  };
  FA.withdraw = async function(id, silent){
    const l = line(id); if(!l || !C.signedIn() || !C.db) return no('Nothing to withdraw.');
    const ref = C.db.ref('market/listings/' + C.user.uid + '-' + l.id); let back = 0;
    try{ await ref.child('q').transaction(q => { back = Math.floor(q || 0); return 0; }); await ref.remove(); }catch(e){ return no('Couldn’t reach the Market.'); }
    l.stock = Math.min(F.storage(l.tier, CFG), l.stock + back); l.listed = 0; touch(); await C.flushNow(); return ok('Took ' + back + ' mol back from the Market.');
  };
  let claiming = false; const claimedMem = new Set();
  /* Payments from other players. The order matters, because the old order could LOSE money: it deleted the payment record on the server and only
   * credited your balance locally, to be saved up to 20 s later — close the tab in between and the money was gone for good.
   * Now: credit → save to the server → only then delete the record. A device-local list of claimed record ids stops a crash between "saved" and
   * "deleted" from paying twice. */
  const CLAIM_KEY = () => 'westos_claimed_' + (C.user ? C.user.uid : '');
  const claimedLocal = () => { try{ return new Set(JSON.parse(localStorage.getItem(CLAIM_KEY()) || '[]')); }catch(e){ return new Set(); } };
  const persistClaimed = keys => { try{ localStorage.setItem(CLAIM_KEY(), JSON.stringify([...claimedLocal(), ...keys].slice(-150))); }catch(e){} };
  FA.claim = async function(quiet){
    if(claiming || K.sessionLost || !C.signedIn() || !C.db) return null;
    if(K.maint.sysMsg('market')) return null;
    claiming = true;
    try{
      const path = 'market/proceeds/' + C.user.uid, s = await C.db.ref(path).once('value');
      if(!s.exists()){ for(const l of S().lines) if(l.route === 'market') await syncListed(l); return null; }
      const known = claimedLocal(), del = {}, fresh = []; let total = 0, items = 0;
      s.forEach(c => { del[c.key] = null; if(known.has(c.key) || claimedMem.has(c.key)) return; const v = c.val(); if(v && v.amt > 0){ total += +v.amt; items += +v.k || 0; fresh.push(c.key); } });
      let net = 0;
      if(fresh.length){
        net = r2(total * (1 - CFG.marketFee)); fresh.forEach(k => claimedMem.add(k));        // never credit the same record twice in one session
        if(net > 0){ K.earn(net, 'Market sales'); S().sold += items; S().earned = r2(S().earned + net); touch(); K.emit('factory-sale', { net, items }); }
      }
      const saved = await C.flushNow();                                                     // the money must be on the server before the proof of payment goes
      if(!saved) return fresh.length ? { net, items, fee: r2(total - net) } : null;          // couldn't save: keep the records, try again on the next round
      persistClaimed(Object.keys(del)); await C.db.ref(path).update(del);
      for(const l of S().lines) if(l.route === 'market') await syncListed(l);
      return fresh.length ? { net, items, fee: r2(total - net) } : null;
    }catch(e){ return null; } finally { claiming = false; }
  };
  setInterval(() => { if(K.loaded && !K.sessionLost) FA.claim(true); }, 45000);
});
