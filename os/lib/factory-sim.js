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
  const S = (eq, name, y) => ({ eq, name, y });
  const HABER = S('N₂ + 3 H₂ → 2 NH₃', 'Haber–Bosch (iron catalyst, ~700 K, 200 bar)', 0.985);
  const OSTWALD = [S('4 NH₃ + 5 O₂ → 4 NO + 6 H₂O', 'Ostwald: ammonia oxidation (platinum gauze, ~1100 K)', 0.98), S('2 NO + O₂ → 2 NO₂', 'Oxidise NO to NO₂ (cooling)', 0.995), S('3 NO₂ + H₂O → 2 HNO₃ + NO', 'Absorb NO₂ in water (NO is recycled)', 0.985)];
  const CONTACT = [S('S + O₂ → SO₂', 'Burn sulfur', 0.995), S('2 SO₂ + O₂ ⇌ 2 SO₃', 'Contact process (V₂O₅, ~700 K)', 0.985), S('SO₃ + H₂O → H₂SO₄', 'Absorb SO₃ (via oleum)', 0.99)];
  const ROUTES = {
    NH3: { need: [], steps: [HABER] },
    HNO3: { need: ['NH3', 'NO', 'NO2'], steps: [HABER].concat(OSTWALD) },
    H2SO4: { need: ['SO2', 'SO3'], steps: CONTACT },
    NH4NO3: { need: ['NH3', 'NO', 'NO2', 'HNO3'], steps: [HABER].concat(OSTWALD, [S('NH₃ + HNO₃ → NH₄NO₃', 'Neutralise nitric acid with ammonia', 0.995)]) },
    N2H8SO4: { need: ['NH3', 'SO2', 'SO3', 'H2SO4'], steps: [HABER].concat(CONTACT, [S('2 NH₃ + H₂SO₄ → (NH₄)₂SO₄', 'Neutralise sulfuric acid with ammonia', 0.995)]) },
    CH4N2O: { need: ['NH3', 'CO2'], steps: [HABER, S('2 NH₃ + CO₂ → CH₄N₂O + H₂O', 'Bosch–Meiser urea synthesis (via ammonium carbamate)', 0.96)] },
    CH3OH: { need: ['CH4', 'CO'], steps: [S('CH₄ + H₂O → CO + 3 H₂', 'Steam reforming (nickel, ~1100 K)', 0.96), S('CO + 2 H₂ → CH₃OH', 'Methanol synthesis (Cu/ZnO, 50–100 bar)', 0.97)] },
    'Ca(OH)2': { need: ['CaCO3', 'CaO'], steps: [S('CaCO₃ → CaO + CO₂', 'Lime kiln (~1200 K)', 0.98), S('CaO + H₂O → Ca(OH)₂', 'Slake the quicklime', 0.99)] },
    NaHCO3: { need: ['NaCl', 'NH3', 'CO2'], steps: [S('NaCl + NH₃ + CO₂ + H₂O → NaHCO₃ + NH₄Cl', 'Solvay carbonation (cold ammoniacal brine; NH₃ recycled)', 0.96)] },
    Na2CO3: { need: ['NaCl', 'NH3', 'CO2', 'NaHCO3'], steps: [S('NaCl + NH₃ + CO₂ + H₂O → NaHCO₃ + NH₄Cl', 'Solvay carbonation (cold ammoniacal brine; NH₃ recycled)', 0.96), S('2 NaHCO₃ → Na₂CO₃ + H₂O + CO₂', 'Calcine the bicarbonate (CO₂ recycled)', 0.98)] },
    NaOH: { need: ['NaCl'], steps: [S('2 NaCl + 2 H₂O → 2 NaOH + H₂ + Cl₂', 'Chlor-alkali electrolysis (membrane cell)', 0.97)] },
    C2H5OH: { need: ['C2H4'], steps: [S('C₂H₄ + H₂O → C₂H₅OH', 'Catalytic hydration of ethene (H₃PO₄, ~570 K, 70 bar)', 0.95)] }
  };
  /* How a line for `f` is made right now. found = formulas you have discovered. → { mode: 'plain' | 'process' | 'direct', steps, factor (multiplies the element cost), yield, missing } */
  function process(f, found, c){
    c = cfgOf(c); const r = ROUTES[f]; if(!r) return { mode: 'plain', steps: [], factor: 1 + c.overhead, yield: 1, missing: [] };
    const have = new Set(found || []), missing = r.need.filter(x => !have.has(x)), y = r.steps.reduce((p, st) => p * st.y, 1);
    if(r.steps.length > 1 && missing.length) return { mode: 'direct', steps: [], factor: (1 + c.overhead) * (1 + c.directPenalty), yield: 1, missing, route: r.steps };
    return { mode: 'process', steps: r.steps, factor: (1 + c.overhead + c.stepOverhead * (r.steps.length - 1)) / y, yield: y, missing: [] };
  }
  const marketRange = (est, c) => { c = cfgOf(c); return { lo: r2(Math.max(0.01, est * c.marketLo)), hi: r2(Math.max(0.02, est * c.marketHi)) }; };

  /* One production step: how much comes out and what it costs. comp = { element: atoms per molecule }, price(sym) = today's shop price per mol of that element. */
  function planProduction(o){
    const c = cfgOf(o.cfg), unit = Object.keys(o.comp).reduce((s, e) => s + o.comp[e] * o.price(e), 0) * (o.factor != null ? o.factor : 1 + c.overhead);
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
  return { DEFAULTS, cfgOf, r2, clamp, rateCap, upgradeCost, slotCost, storage, batch, shopRange, shopChance, marketRange, planProduction, flows, process, ROUTES };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = FactorySim;
