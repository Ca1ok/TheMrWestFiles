/* FactorySim — the pure rules behind WestFactory (no DOM, no wallet, no state of its own; os/kernel/factory.js owns those).
 * Loads in the browser and in Node (tests/factory.test.js).
 *
 * THE LOOP: elements are bought automatically at the WestShop price (+ a small running overhead), a reactor line turns them into a compound you
 * discovered in WestLab at up to its rate cap (mol/min), the product waits in a warehouse, then it is sold either
 *   - to WestShop at YOUR price, which must sit inside a range around the estimated value. The higher you push it, the lower the chance the shop
 *     accepts, and a refusal locks that line's shop sales for one minute; or
 *   - to the player Market, at any price within a sanity range, where other players buy it (the Market takes a small fee).
 * BALANCE: the compound's list value is ~15–25 % above its elements, running costs add ~5 %, so a sensible price earns a modest margin. Pushing the
 * price up earns more per mol but (a) the shop says no more often and every refusal costs a minute of that line's shop sales, and (b) heavy selling
 * saturates the shop's demand, cutting the chance further. Rate caps, warehouse size and extra lines are bought with money, so growth is gradual. */
const FactorySim = (function(){
  'use strict';
  const r2 = n => Math.round(n * 100) / 100, clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const DEFAULTS = {
    baseRate: 5, rateGrowth: 2, maxTier: 5,                    // mol/min cap of a line: 5, 10, 20, 40, 80
    tierCost: 1500, tierCostGrowth: 3,                         // upgrade price: 1,500 → 4,500 → 13,500 → 40,500
    slotsStart: 2, slotsMax: 8, slotCost: 3000, slotGrowth: 2.2, // lines you can run: 2 free, then 3,000 · 6,600 · 14,520 …
    overhead: 0.05,                                            // running cost on top of the element cost
    stepOverhead: 0.015, directPenalty: 0.25,                  // multistep processes: +1.5 % running cost per extra step; building a process product DIRECTLY from the elements (intermediates not discovered) costs +25 %
    storagePerTier: 120,                                       // warehouse size in mol = 120 × tier
    offlineMaxMin: 480,                                        // catch-up while you were away: at most 8 hours
    shopLo: 0.6, shopHi: 1.5,                                  // shop price must be within 0.6× … 1.5× the estimated value
    shopSure: 0.85, shopMaxChance: 0.97, shopMinChance: 0.08,  // shopSure and shopMaxChance are no longer used: ≤ 1× est (normal) is always 100 %; falls linearly to shopMinChance (8 %) at shopHi (1.5×)
    shopBatch: 25,                                             // mol offered per attempt = 25 × tier
    failLockMs: 60000, okLockMs: 5000,                         // a refusal = wait one minute; after a sale a short breather
    marketLo: 0.1, marketHi: 10, marketFee: 0.05, listCap: 2000, // market: price 0.1×…10× est, 5 % fee on sales, ≤2000 mol listed per line
    salvage: 1.0,                                              // flowsheets: surplus by-products (vented water, H₂, Cl₂ …) are sold on automatically at their atom value, netted off the input cost
    readyMarkup: 1.10,                                         // flowsheets: a manufactured intermediate bought ready-made costs its atoms × 1.10 (wholesale premium); commodity compounds cost their atoms
    reserve: 50                                                // the factory never spends the last $50 of your bank unless you change it
  };
  const cfgOf = o => Object.assign({}, DEFAULTS, o || {});

  const rateCap = (tier, c) => { c = cfgOf(c); return c.baseRate * Math.pow(c.rateGrowth, clamp(tier, 1, c.maxTier) - 1); };
  const upgradeCost = (tier, c) => { c = cfgOf(c); return tier >= c.maxTier ? null : Math.round(c.tierCost * Math.pow(c.tierCostGrowth, tier - 1)); };
  const slotCost = (slots, c) => { c = cfgOf(c); return slots >= c.slotsMax ? null : Math.round(c.slotCost * Math.pow(c.slotGrowth, Math.max(0, slots - c.slotsStart)) / 10) * 10; };
  const storage = (tier, c) => cfgOf(c).storagePerTier * clamp(tier, 1, cfgOf(c).maxTier);
  const batch = (tier, c) => cfgOf(c).shopBatch * clamp(tier, 1, cfgOf(c).maxTier);

  function shopRange(est, c){ c = cfgOf(c); return { lo: r2(Math.max(0.01, est * c.shopLo)), hi: r2(Math.max(0.02, est * c.shopHi)) }; }
  /* Chance the shop accepts a batch at `price`. ratio = price ÷ estimated value; sat (0.3–1) is how saturated the shop's demand already is. */
  function shopChance(ratio, sat, c){
    c = cfgOf(c); const hiR = c.shopHi;
    if(ratio > hiR + 1e-9) return 0;                                                  // above the allowed range: never
    if(ratio <= 1 + 1e-9) return 1;                                                   // at or below the NORMAL (estimated) value: the shop always accepts — saturation doesn't apply
    const base = 1 - (ratio - 1) / (hiR - 1) * (1 - c.shopMinChance);                // above normal: falls linearly from 100 % to shopMinChance at the top of the range…
    return clamp(base * clamp(sat == null ? 1 : sat, 0.3, 1), 0, 1);                  // …and a saturated shop demand lowers it further
  }

  /* ---- REAL INDUSTRIAL ROUTES. A product with a route is made step by step, like in industry, instead of by combining raw elements.
   *   need: the compounds (intermediates / feedstocks) you must have DISCOVERED in WestLab to run the real process; without them the line falls back to 'direct' combination of the elements
   *   (costlier: cfg.directPenalty). y = per-step yield (a GAMEPLAY simplification: real plants recycle unreacted gas, so per-pass losses are small). Steps are descriptive; the maths is
   *   cost = element cost × (1 + overhead + stepOverhead·(steps−1)) ÷ Π yield — the atoms balance, so the mol output is unchanged. Reaction conditions: see the WestLab catalogue. */
  const SUBD = '₀₁₂₃₄₅₆₇₈₉', DISP = { N2H8SO4: '(NH₄)₂SO₄' };
  const sub = sp => DISP[sp] || String(sp).replace(/\d+/g, m => m.split('').map(d => SUBD[+d]).join(''));
  const side = o => Object.keys(o).map(k => (o[k] !== 1 ? o[k] + ' ' : '') + sub(k)).join(' + ');
  /* A step = a balanced reaction. in/out are { species: coefficient }; the FIRST key of out is the step's main product; the others are by-products (they can feed other steps = recycle). */
  const S = (inn, out, name, y, rev) => ({ in: inn, out: out, main: Object.keys(out)[0], name, y, eq: side(inn) + (rev ? ' ⇌ ' : ' → ') + side(out) });
  const HABER = S({ N2: 1, H2: 3 }, { NH3: 2 }, 'Haber–Bosch (iron catalyst, ~700 K, 200 bar)', 0.985);
  const OSTWALD = [S({ NH3: 4, O2: 5 }, { NO: 4, H2O: 6 }, 'Ostwald: ammonia oxidation (platinum gauze, ~1100 K)', 0.98), S({ NO: 2, O2: 1 }, { NO2: 2 }, 'Oxidise NO to NO₂ (cooling)', 0.995), S({ NO2: 3, H2O: 1 }, { HNO3: 2, NO: 1 }, 'Absorb NO₂ in water (the NO goes back to the oxidiser)', 0.985)];
  const CONTACT = [S({ S: 2, O2: 3 }, { SO3: 2 }, 'Burn sulfur (WestLab burns it straight to SO₃)', 0.99), S({ SO3: 1, H2O: 1 }, { H2SO4: 1 }, 'Absorb SO₃ (via oleum)', 0.99)];
  const EXTRA = [S({ SO2: 2, O2: 1 }, { SO3: 2 }, 'Contact process (V₂O₅, ~700 K)', 0.985, true)];   // recipes that no auto-route uses but the recipe book keeps
  const SOLVAY = S({ NaCl: 1, NH3: 1, CO2: 1, H2O: 1 }, { NaHCO3: 1, NH4Cl: 1 }, 'Solvay carbonation (cold ammoniacal brine)', 0.99);
  const RECOVER = S({ NH4Cl: 2, CaO: 1 }, { NH3: 2, CaCl2: 1, H2O: 1 }, 'Ammonia recovery: lime frees the NH₃ from NH₄Cl (CaCl₂ is the waste)', 0.995);
  const ROUTES = {
    NH3: { need: [], steps: [HABER] },
    HNO3: { need: ['NH3', 'NO', 'NO2'], steps: [HABER].concat(OSTWALD) },
    H2SO4: { need: ['SO3'], steps: CONTACT },
    NH4NO3: { need: ['NH3', 'NO', 'NO2', 'HNO3'], steps: [HABER].concat(OSTWALD, [S({ NH3: 1, HNO3: 1 }, { NH4NO3: 1 }, 'Neutralise nitric acid with ammonia', 0.995)]) },
    N2H8SO4: { need: ['NH3', 'SO3', 'H2SO4'], steps: [HABER].concat(CONTACT, [S({ NH3: 2, H2SO4: 1 }, { N2H8SO4: 1 }, 'Neutralise sulfuric acid with ammonia', 0.995)]) },
    CH4N2O: { need: ['NH3', 'CO2'], steps: [HABER, S({ NH3: 2, CO2: 1 }, { CH4N2O: 1, H2O: 1 }, 'Bosch–Meiser urea synthesis (via ammonium carbamate)', 0.96)] },
    CH3OH: { need: ['CH4', 'CO'], steps: [S({ CH4: 1, H2O: 1 }, { CO: 1, H2: 3 }, 'Steam reforming (nickel, ~1100 K)', 0.96), S({ CO: 1, H2: 2 }, { CH3OH: 1 }, 'Methanol synthesis (Cu/ZnO, 50–100 bar)', 0.97)] },
    'Ca(OH)2': { need: ['CaCO3', 'CaO'], steps: [S({ CaCO3: 1 }, { CaO: 1, CO2: 1 }, 'Lime kiln (~1200 K)', 0.98), S({ CaO: 1, H2O: 1 }, { 'Ca(OH)2': 1 }, 'Slake the quicklime', 0.99)] },
    NaHCO3: { need: ['NaCl', 'NH3', 'CO2'], steps: [SOLVAY, RECOVER] },
    Na2CO3: { need: ['NaCl', 'NH3', 'CO2', 'NaHCO3'], steps: [SOLVAY, RECOVER, S({ NaHCO3: 2 }, { Na2CO3: 1, H2O: 1, CO2: 1 }, 'Calcine the bicarbonate (the CO₂ goes back to the carbonator)', 0.99)] },
    NaOH: { need: ['NaCl'], steps: [S({ NaCl: 2, H2O: 2 }, { NaOH: 2, H2: 1, Cl2: 1 }, 'Chlor-alkali electrolysis (membrane cell)', 0.97)] },
    C2H5OH: { need: ['C2H4'], steps: [S({ C2H4: 1, H2O: 1 }, { C2H5OH: 1 }, 'Catalytic hydration of ethene (H₃PO₄, ~570 K, 70 bar)', 0.95)] }
  };
  /* How a line for `f` is made right now. found = formulas you have discovered. → { mode: 'plain' | 'process' | 'direct', steps, factor (multiplies the element cost), yield, missing } */
  function process(f, found, c){
    c = cfgOf(c); const r = ROUTES[f]; if(!r) return { mode: 'plain', steps: [], factor: 1 + c.overhead, yield: 1, missing: [] };
    const have = new Set(found || []), missing = r.need.filter(x => !have.has(x)), y = r.steps.reduce((p, st) => p * st.y, 1);
    if(r.steps.length > 1 && missing.length) return { mode: 'direct', steps: [], factor: (1 + c.overhead) * (1 + c.directPenalty), yield: 1, missing, route: r.steps };
    return { mode: 'process', steps: r.steps, factor: (1 + c.overhead + c.stepOverhead * (r.steps.length - 1)) / y, yield: y, missing: [] };
  }

  /* ---- FLOWSHEETS. A line is a small plant: a TREE of reactor nodes. Each reactor is one balanced step; its inputs are bought (an element, or a finished compound at atoms × readyMarkup)
   * or made by an upstream reactor; by-products (NO in the nitric-acid plant, CO₂ in the soda plant) flow back to wherever they are needed, so the recycle cuts the purchases. The solver is
   * demand driven: it sizes every reactor so that exactly `rate` mol/min of the product leaves, iterating until the recycle loops settle.
   * o = { found, opt, rate, atomPrice(sym), compOf(species) → atoms | null, cfg }.  opt[species] = 'buy' (an intermediate bought ready-made instead of made here) or 'make' (a raw compound made here).
   * Everything is computed per 1 mol/min of product, then scaled by `rate` (0 = a paused line still gets its structure and unit cost). */
  const DIA = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I']);
  const elemOf = sp => { const m = /^(H|N|O|F|Cl|Br|I)2$/.exec(sp); if(m) return { sym: m[1], n: 2 }; return /^[A-Z][a-z]?$/.test(sp) ? { sym: sp, n: 1 } : null; };
  const nodeId = (pre, i) => pre + i;
  const makeFormation = (sp, cp, y, id) => {                                       // elements → compound, no catalyst: the fallback and the 'make it from scratch' option
    const inn = {}; let half = false;
    Object.keys(cp).forEach(k => { if(DIA.has(k)){ inn[k + '2'] = cp[k] / 2; if(cp[k] % 2) half = true; } else inn[k] = cp[k]; });
    const m = half ? 2 : 1; Object.keys(inn).forEach(k => inn[k] *= m);
    return Object.assign(S(inn, { [sp]: m }, 'Combine the elements directly (no catalyst, no process)', y), { id, kind: 'formation' });
  };
  function flowsheet(f, o){
    o = o || {}; const c = cfgOf(o.cfg), pr = process(f, o.found, c), r = ROUTES[f], opt = o.opt || {}, scale = o.rate == null ? 1 : Math.max(0, +o.rate || 0);
    const atomPrice = o.atomPrice || (() => 1), compOf = o.compOf || (() => null), have = new Set(o.found || []);
    const mfd = new Set(); Object.keys(ROUTES).forEach(k => ROUTES[k].steps.forEach(st => mfd.add(st.main)));       // manufactured intermediates carry the wholesale premium; commodities (NaCl, CO₂, CaCO₃, water …) cost their atoms
    const mk = sp => mfd.has(sp) ? c.readyMarkup : 1;
    const price = sp => { const e = elemOf(sp); if(e) return e.n * atomPrice(e.sym); const cp = compOf(sp); if(!cp) return Infinity; return Object.keys(cp).reduce((t, k) => t + cp[k] * atomPrice(k), 0) * mk(sp); };
    const formation = (sp, y, id) => { const cp = compOf(sp); return cp ? makeFormation(sp, cp, y, id) : null; };
    let defs = [], toggles = [];
    if(pr.mode === 'process'){
      const mains = new Set(r.steps.map(st => st.main)), raw = [];
      r.steps.forEach(st => Object.keys(st.in).forEach(sp => { if(!mains.has(sp) && !elemOf(sp) && !raw.includes(sp)) raw.push(sp); }));
      r.steps.forEach((st, i) => { const sp = st.main; if(sp !== f && !toggles.some(t => t.sp === sp)) toggles.push({ sp, role: 'made', opt: opt[sp] === 'buy' ? 'buy' : 'make', via: st.name }); });
      raw.forEach(sp => toggles.push({ sp, role: 'raw', opt: opt[sp] === 'make' ? 'make' : 'buy', via: null }));
      defs = r.steps.map((st, i) => Object.assign({}, st, { id: nodeId('s', i), kind: 'real' })).filter(d => d.main === f || opt[d.main] !== 'buy');
      raw.forEach((sp, n) => {                                                     // a raw compound switched to 'make' is built from its elements (a bought one is the default)
        if(opt[sp] !== 'make') return; const fm = formation(sp, 1 / (1 + c.directPenalty), 'g' + n), t = toggles.find(x => x.sp === sp); if(fm){ defs.push(fm); t.via = fm.name; }
      });
      toggles.forEach(t => { t.price = price(t.sp); t.canBuy = isFinite(t.price); });
    } else { const fm = formation(f, pr.mode === 'direct' ? 1 / (1 + c.directPenalty) : 1, 'f0'); if(fm) defs = [fm]; }

    const xi = defs.map(() => 0); let stable = false;
    for(let it = 0; it < 600; it++){                                               // demand-driven sizing; by-products reduce the demand of whoever consumes them
      const net = { [f]: 1 };
      defs.forEach((d, i) => { Object.keys(d.in).forEach(k => { net[k] = (net[k] || 0) + d.in[k] * xi[i]; }); Object.keys(d.out).forEach(k => { if(k !== d.main) net[k] = (net[k] || 0) - d.out[k] * d.y * xi[i]; }); });
      let diff = 0; defs.forEach((d, i) => { const nx = Math.max(0, net[d.main] || 0) / (d.out[d.main] * d.y); diff = Math.max(diff, Math.abs(nx - xi[i])); xi[i] = nx; });
      if(diff < 1e-13){ stable = true; break; }
    }
    const act = defs.map((d, i) => ({ d, x: xi[i] })).filter(a => a.x > 1e-9), R = act.length;
    const dep = {}; act.forEach(a => { dep[a.d.id] = 0; });                         // depth in the tree = longest chain of main products feeding this step
    for(let pass = 0; pass < act.length + 1; pass++) act.forEach(a => Object.keys(a.d.in).forEach(sp => { const pa = act.find(b => b.d.main === sp && b !== a); if(pa && dep[pa.d.id] + 1 > dep[a.d.id] && dep[pa.d.id] < act.length) dep[a.d.id] = dep[pa.d.id] + 1; }));
    const species = new Set([f]); act.forEach(a => { Object.keys(a.d.in).forEach(k => species.add(k)); Object.keys(a.d.out).forEach(k => species.add(k)); });
    const edges = [], feeds = [], surplus = [], EPS = 1e-12; let feedCost = 0;
    species.forEach(sp => {
      const sup = act.filter(a => a.d.out[sp]).map(a => ({ id: a.d.id, amt: a.d.out[sp] * a.d.y * a.x })), con = act.filter(a => a.d.in[sp]).map(a => ({ id: a.d.id, amt: a.d.in[sp] * a.x }));
      if(sp === f) con.push({ id: 'out', amt: 1 });
      const D = con.reduce((t, x) => t + x.amt, 0), Sup = sup.reduce((t, x) => t + x.amt, 0); if(D < EPS && Sup < EPS) return;
      const feed = Math.max(0, D - Sup), den = Math.max(D, Sup), pc = price(sp), tg = toggles.find(t => t.sp === sp);
      con.forEach(cn => {
        if(cn.amt < EPS) return;
        if(feed > EPS && !(sup.length && sp === f)){ const mol = feed * cn.amt / D; feedCost += mol * pc; feeds.push({ id: 'f:' + cn.id + ':' + sp, sp, spl: sub(sp), to: cn.id, mol: mol * scale, price: pc, cost: mol * pc * scale, el: !!elemOf(sp), role: tg ? tg.role : (elemOf(sp) ? 'element' : 'raw'), opt: tg ? tg.opt : null }); }
        sup.forEach(sx => { const m = sx.amt * cn.amt / den; if(m > EPS) edges.push({ from: sx.id, to: cn.id, sp, spl: sub(sp), mol: m * scale, recycle: cn.id !== 'out' && dep[sx.id] >= dep[cn.id], byprod: act.find(a => a.d.id === sx.id).d.main !== sp }); });
      });
      if(Sup - D > 1e-9 && sp !== f) surplus.push({ sp, spl: sub(sp), mol: (Sup - D) * scale, u: Sup - D, from: sup.map(x => x.id) });
    });
    const mult = 1 + c.overhead + c.stepOverhead * Math.max(0, R - 1), credit = surplus.reduce((t, x) => t + x.u * (price(x.sp) / mk(x.sp)) * c.salvage, 0) * (isFinite(price(f)) ? 1 : 0);
    const gross = feedCost, unit = defs.length ? Math.max(gross * 0.05, (gross - credit) * mult) : Infinity;
    const reactors = act.map(a => { const d = a.d, ins = {}, loss = {}; Object.keys(d.in).forEach(k => { ins[k] = d.in[k] * a.x * scale; }); Object.keys(d.out).forEach(k => { loss[k] = d.out[k] * (1 - d.y) * a.x * scale; });
      return { id: d.id, rc: d.kind === 'formation' ? 'F:' + d.main : recipeKey(d), kind: d.kind, eq: d.eq, name: d.name, y: d.y, main: d.main, mainl: sub(d.main), depth: dep[d.id], extent: a.x * scale, out: d.out[d.main] * d.y * a.x * scale, ins, loss, final: d.main === f }; });
    const recycle = edges.filter(e => e.recycle).reduce((t, e) => t + e.mol, 0);
    return { mode: pr.mode, missing: pr.missing, reactors, feeds, edges, surplus, toggles, unit, gross, credit: Math.min(credit, gross * 0.95) * mult, mult, costPerMin: unit * scale, recycle, stable, steps: R };
  }
  /* ---- THE RECIPE BOOK + PLAYER-BUILT FLOWSHEETS (Satisfactory style). The player places Source nodes (buy an element or a discovered compound), Reactor nodes (one recipe each) and wires
   * them; the warehouse is the last node ('o'). graphSheet() solves that graph: demand-driven from the warehouse, by-product wires are used first, an input needs a PRIMARY supply
   * (a Source or a main product) — by-products only top it up — so every recycle loop needs a make-up feed, like a real plant. */
  const recipeKey = st => st.main + '<' + Object.keys(st.in).join('+');
  const RECIPES = {}; Object.keys(ROUTES).forEach(k => ROUTES[k].steps.forEach(st => { const id = recipeKey(st); if(!RECIPES[id]) RECIPES[id] = Object.assign({ id, kind: 'real' }, st); }));
  EXTRA.forEach(st => { const id = recipeKey(st); if(!RECIPES[id]) RECIPES[id] = Object.assign({ id, kind: 'real' }, st); });
  function recipeOf(id, compOf, c){ if(RECIPES[id]) return RECIPES[id]; if(/^F:/.test(id || '')){ const sp = id.slice(2), cp = compOf && compOf(sp); return cp ? makeFormation(sp, cp, 1 / (1 + cfgOf(c).directPenalty), id) : null; } return null; }
  const FREE = new Set(['H2O']);                                                    // water needs no discovery
  /* Every recipe the player can see: real industrial steps (unlocked when their main product and compound inputs are discovered) + 'combine the elements' for each discovered compound. */
  function recipes(found, compOf, c){
    const have = new Set(found || []), known = sp => elemOf(sp) || FREE.has(sp) || have.has(sp), out = [];
    Object.keys(RECIPES).forEach(id => { const r = RECIPES[id], miss = [r.main].concat(Object.keys(r.in)).filter(sp => !known(sp)); out.push({ id, kind: 'real', eq: r.eq, name: r.name, y: r.y, main: r.main, in: r.in, out: r.out, locked: miss.length > 0, missing: miss }); });
    (found || []).forEach(sp => { const cp = compOf && compOf(sp); if(!cp || RECIPES[sp]) return; const fr = recipeOf('F:' + sp, compOf, c); if(fr) out.push({ id: 'F:' + sp, kind: 'formation', eq: fr.eq, name: fr.name, y: fr.y, main: sp, in: fr.in, out: fr.out, locked: false, missing: [] }); });
    return out;
  }
  const priceFn = (c, o) => { const atomPrice = o.atomPrice || (() => 1), compOf = o.compOf || (() => null), mfd = new Set(); Object.keys(ROUTES).forEach(k => ROUTES[k].steps.forEach(st => mfd.add(st.main)));
    const mk = sp => mfd.has(sp) ? c.readyMarkup : 1, atoms = sp => { const e = elemOf(sp); if(e) return e.n * atomPrice(e.sym); const cp = compOf(sp); return cp ? Object.keys(cp).reduce((t, k) => t + cp[k] * atomPrice(k), 0) : Infinity; };
    return { price: sp => atoms(sp) * (elemOf(sp) ? 1 : mk(sp)), atoms }; };
  function graphSheet(g, o){
    o = o || {}; const c = cfgOf(o.cfg), f = o.f, compOf = o.compOf || (() => null), P = priceFn(c, o), scale = Math.max(0, +o.rate || 0), cap = o.cap == null ? 3 * rateCap(1, c) : o.cap, EPS = 1e-12;
    const X = {}, order = [], nodes = (g && g.nodes) || [];
    nodes.forEach(n => {
      if(!n || !n.id || X[n.id]) return;
      if(n.t === 'src'){ if(!n.sp || !(elemOf(n.sp) || compOf(n.sp))) return; X[n.id] = { id: n.id, t: 'src', sp: n.sp, in: {}, out: { [n.sp]: 1 }, main: n.sp, y: 1, name: 'Buy ' + sub(n.sp) }; order.push(X[n.id]); }
      else if(n.t === 'rx'){ const rc = recipeOf(n.rc, compOf, c); if(!rc) return; X[n.id] = { id: n.id, t: 'rx', rc: rc.id, in: rc.in, out: rc.out, main: rc.main, y: rc.y, name: rc.name, eq: rc.eq, kind: rc.kind }; order.push(X[n.id]); }
    });
    const seen = new Set(), W = [];
    ((g && g.wires) || []).forEach(w => { if(!w || !X[w.a] || !X[w.a].out[w.s]) return; if(w.b === 'o' ? w.s !== f : !(X[w.b] && X[w.b].t === 'rx' && X[w.b].in[w.s])) return; const k = w.a + '>' + w.b + ':' + w.s; if(seen.has(k)) return; seen.add(k); W.push({ a: w.a, b: w.b, s: w.s, i: W.length }); });
    const isBy = w => X[w.a].t === 'rx' && w.s !== X[w.a].main, inW = {}; W.forEach(w => { (inW[w.b + '|' + w.s] = inW[w.b + '|' + w.s] || []).push(w); });
    const rx = order.filter(n => n.t === 'rx'), ok = {}; rx.forEach(n => { ok[n.id] = false; });
    for(let ch = true, k = 0; ch && k < 60; k++){ ch = false; rx.forEach(n => { if(ok[n.id]) return; if(Object.keys(n.in).every(s => (inW[n.id + '|' + s] || []).some(w => X[w.a].t === 'src' || ok[w.a]))){ ok[n.id] = true; ch = true; } }); }   // least fixed point: supplied from outside, transitively
    const outOk = (inW['o|' + f] || []).some(w => X[w.a].t === 'src' || ok[w.a]);
    const xi = {}; rx.forEach(n => { xi[n.id] = 0; });
    const pass = () => {
      const rem = {}, dm = {}, fl = W.map(() => 0), short = []; rx.forEach(n => Object.keys(n.out).forEach(s => { rem[n.id + '|' + s] = n.out[s] * n.y * xi[n.id]; })); order.forEach(n => { dm[n.id] = {}; });
      const take = (port, d) => { let r = d; const ws = inW[port] || []; ws.filter(isBy).forEach(w => { const k = w.a + '|' + w.s, t = Math.max(0, Math.min(r, rem[k])); rem[k] -= t; r -= t; fl[w.i] += t; });
        const mw = ws.filter(w => !isBy(w) && (X[w.a].t === 'src' || ok[w.a])); if(r > EPS && mw.length) mw.forEach(w => { const q = r / mw.length; dm[w.a][w.s] = (dm[w.a][w.s] || 0) + q; fl[w.i] += q; }); else if(r > 1e-9) short.push({ port, r }); };
      if(outOk) take('o|' + f, 1); rx.forEach(n => { if(ok[n.id]) Object.keys(n.in).forEach(s => take(n.id + '|' + s, n.in[s] * xi[n.id])); });
      return { dm, fl, short };
    };
    let stable = false;
    for(let it = 0; it < 600; it++){ const r = pass(); let diff = 0; rx.forEach(n => { const nx = ok[n.id] ? Math.min(1e6, (r.dm[n.id][n.main] || 0) / (n.out[n.main] * n.y)) : 0; diff = Math.max(diff, Math.abs(nx - xi[n.id])); xi[n.id] = nx; }); if(diff < 1e-13){ stable = true; break; } }
    const res = pass(), maxXi = rx.reduce((m, n) => Math.max(m, xi[n.id]), 0), maxRate = maxXi > EPS ? cap / maxXi : Infinity, producing = outOk && stable && !res.short.length && res.fl.some((v, i) => W[i].b === 'o' && v > EPS), eff = producing && scale > 0 ? Math.min(scale, maxRate) : 0;
    const issues = []; rx.forEach(n => { if(ok[n.id]) return; const miss = Object.keys(n.in).filter(s => !(inW[n.id + '|' + s] || []).some(w => X[w.a].t === 'src' || ok[w.a])); issues.push({ id: n.id, msg: sub(n.main) + ' reactor has no supply for ' + miss.map(sub).join(', ') + (miss.some(s => (inW[n.id + '|' + s] || []).length) ? ' (a loop needs a make-up source to start)' : '') }); });
    res.short.forEach(sh => { const [b, sp] = sh.port.split('|'); issues.push({ id: b === 'o' ? 'o' : b, msg: (b === 'o' ? 'Warehouse' : sub(X[b].main) + ' reactor') + ' is short of ' + sub(sp) + ' — a by-product can’t cover it; add a Source or a main-product wire' }); });
    if(!outOk) issues.push({ id: 'o', msg: 'Wire ' + sub(f) + ' into the warehouse from a reactor that makes it' }); if(!stable) issues.push({ id: null, msg: 'A loop doesn’t settle — it needs a bigger make-up supply or a lossier route' });
    const feeds = [], leftU = {}; let feedCost = 0;
    order.forEach(n => { if(n.t === 'src'){ const d = res.dm[n.id][n.sp] || 0, pc = P.price(n.sp); feedCost += d * pc; feeds.push({ id: n.id, sp: n.sp, spl: sub(n.sp), mol: d * eff, price: pc, cost: d * pc * eff, el: !!elemOf(n.sp) }); } });
    const surplus = []; let credit = 0;
    rx.forEach(n => { Object.keys(n.out).forEach(s => { const prod = n.out[s] * n.y * xi[n.id], used = W.reduce((t, w) => t + (w.a === n.id && w.s === s ? res.fl[w.i] : 0), 0), left = prod - used; if(left > 1e-9){ credit += left * (P.atoms(s) || 0) * c.salvage; surplus.push({ id: n.id, sp: s, spl: sub(s), mol: left * eff }); } }); });
    const R = rx.filter(n => xi[n.id] > 1e-9).length, mult = 1 + c.overhead + c.stepOverhead * Math.max(0, R - 1), gross = feedCost, unit = producing ? Math.max(gross * 0.05, (gross - credit) * mult) : Infinity;
    const wiresOut = W.map(w => ({ a: w.a, b: w.b, s: w.s, spl: sub(w.s), mol: res.fl[w.i] * eff, by: isBy(w), i: w.i }));
    const nodesOut = order.map(n => { const ins = {}, outs = {}; Object.keys(n.in).forEach(s => { const ws = inW[n.id + '|' + s] || []; ins[s] = { wired: ws.length, supplied: ws.some(w => X[w.a].t === 'src' || ok[w.a]), mol: n.in[s] * (xi[n.id] || 0) * eff }; });
      Object.keys(n.out).forEach(s => { const prod = n.out[s] * (n.t === 'src' ? 1 : n.y) * (n.t === 'src' ? (res.dm[n.id][n.sp] || 0) : xi[n.id]), used = W.reduce((t, w) => t + (w.a === n.id && w.s === s ? res.fl[w.i] : 0), 0); outs[s] = { wired: W.filter(w => w.a === n.id && w.s === s).length, mol: prod * eff, left: Math.max(0, prod - used) * eff }; });
      return { id: n.id, t: n.t, sp: n.sp || null, rc: n.rc || null, main: n.main, mainl: sub(n.main), y: n.y, name: n.name, eq: n.eq || null, kind: n.kind || null, ok: n.t === 'src' ? true : ok[n.id], active: n.t === 'src' ? (res.dm[n.id][n.sp] || 0) > EPS : xi[n.id] > EPS, extent: (xi[n.id] || 0) * eff, load: cap > 0 ? (xi[n.id] || 0) * eff / cap : 0, ins, outs }; });
    return { f, nodes: nodesOut, wires: wiresOut, feeds, surplus, issues, unit, gross, credit: credit * mult, mult, costPerMin: isFinite(unit) ? unit * eff : 0, maxRate, effRate: eff, producing, stable, steps: R, recycle: wiresOut.filter(w => w.by).reduce((t, w) => t + w.mol, 0), outWired: outOk };
  }
  /* A starter graph from the real industrial route (what 'Auto-build' and old saved lines use): flowsheet() output laid out as nodes + wires. */
  function graphFromSheet(sh){
    const nodes = [], wires = [], id = {}, byDepth = {}, W = 270; let n = 1;
    sh.reactors.forEach(r => { const row = byDepth[r.depth] = (byDepth[r.depth] == null ? 0 : byDepth[r.depth] + 1), nid = 'n' + n++; id[r.id] = nid; nodes.push({ id: nid, t: 'rx', rc: r.rc, x: 40 + r.depth * W, y: 250 + row * 230 }); });
    const cnt = {}; sh.feeds.forEach(f => { const cn = nodes.find(q => q.id === id[f.to]), j = cnt[f.to] = (cnt[f.to] == null ? 0 : cnt[f.to] + 1), nid = 'n' + n++; id[f.id] = nid; nodes.push({ id: nid, t: 'src', sp: f.sp, x: cn.x + j * 100, y: 20 + (j % 2) * 110 }); wires.push({ a: nid, b: id[f.to], s: f.sp }); });
    sh.edges.forEach(e => wires.push({ a: id[e.from], b: e.to === 'out' ? 'o' : id[e.to], s: e.sp }));
    return { nodes, wires, next: n };
  }
  const marketRange = (est, c) => { c = cfgOf(c); return { lo: r2(Math.max(0.01, est * c.marketLo)), hi: r2(Math.max(0.02, est * c.marketHi)) }; };

  /* One production step: how much comes out and what it costs. comp = { element: atoms per molecule }, price(sym) = today's shop price per mol of that element. */
  function planProduction(o){
    const c = cfgOf(o.cfg), unit = o.unit != null ? o.unit : Object.keys(o.comp || {}).reduce((s, e) => s + o.comp[e] * o.price(e), 0) * (o.factor != null ? o.factor : 1 + c.overhead);
    const want = Math.max(0, Math.min(o.rate * o.minutes, o.space));
    if(!(unit > 0) || want <= 0) return { made: 0, cost: 0, unit, limited: false };
    const afford = Math.max(0, o.cash - (o.reserve == null ? c.reserve : o.reserve)), made = Math.min(want, afford / unit);
    return { made, cost: r2(made * unit), unit, limited: made < want - 1e-9 };
  }
  /* Per-minute flows for the flow diagram (mol/min of each element, $/min), assuming the line runs at its rate. */
  function flows(line, comp, price, c, factor){
    c = cfgOf(c); const els = {}; let cost = 0; Object.keys(comp).forEach(e => { els[e] = comp[e] * line.rate; cost += comp[e] * line.rate * price(e); });
    return { els, costPerMin: r2(cost * (factor != null ? factor : 1 + c.overhead)) };
  }
  return { DEFAULTS, cfgOf, r2, clamp, rateCap, upgradeCost, slotCost, storage, batch, shopRange, shopChance, marketRange, planProduction, flows, process, flowsheet, graphSheet, graphFromSheet, recipes, recipeOf, RECIPES, elemOf, priceFn, sub, ROUTES };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = FactorySim;
