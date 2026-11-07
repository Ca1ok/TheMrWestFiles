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
  const marketRange = (est, c) => { c = cfgOf(c); return { lo: r2(Math.max(0.01, est * c.marketLo)), hi: r2(Math.max(0.02, est * c.marketHi)) }; };

  /* One production step: how much comes out and what it costs. comp = { element: atoms per molecule }, price(sym) = today's shop price per mol of that element. */
  function planProduction(o){
    const c = cfgOf(o.cfg), unit = Object.keys(o.comp).reduce((s, e) => s + o.comp[e] * o.price(e), 0) * (1 + c.overhead);
    const want = Math.max(0, Math.min(o.rate * o.minutes, o.space));
    if(!(unit > 0) || want <= 0) return { made: 0, cost: 0, unit, limited: false };
    const afford = Math.max(0, o.cash - (o.reserve == null ? c.reserve : o.reserve)), made = Math.min(want, afford / unit);
    return { made, cost: r2(made * unit), unit, limited: made < want - 1e-9 };
  }
  /* Per-minute flows for the flow diagram (mol/min of each element, $/min), assuming the line runs at its rate. */
  function flows(line, comp, price, c){
    c = cfgOf(c); const els = {}; let cost = 0; Object.keys(comp).forEach(e => { els[e] = comp[e] * line.rate; cost += comp[e] * line.rate * price(e); });
    return { els, costPerMin: r2(cost * (1 + c.overhead)) };
  }
  return { DEFAULTS, cfgOf, r2, clamp, rateCap, upgradeCost, slotCost, storage, batch, shopRange, shopChance, marketRange, planProduction, flows };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = FactorySim;
