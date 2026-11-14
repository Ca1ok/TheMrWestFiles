/* LIB · economy — the rules of the WestEconomy, shared by the browser kernel, the GitHub Action (.github/scripts/eco-tick.js) and the tests.
 *
 * THE ONE LAW: money is never created or destroyed, only moved. All amounts are INTEGER CENTS (1 dollar = 100), so rounding can never mint a cent.
 * Total supply is fixed at SUPPLY (= $100 trillion) and sits, at genesis, in five SYSTEM accounts (SEED). Every other account (player or bot) holds
 *   b                  its cash (cents)
 *   sys.{pool,arcade,bank,gov,city}   the net amount it has paid INTO that system account (negative = it has received money from it)
 *   s / r              cumulative amount it has sent to / claimed from other accounts through the inbox (money in flight sits in the inbox)
 * and ALWAYS satisfies   b + Σ sys + s − r = 0   (see invariant()). The Firebase rules refuse any write that breaks it, so a buggy or stale client
 * cannot create or lose a cent. A system account's balance is DERIVED:  SEED[x] + Σ over all accounts of sys.x  (audit()), so the hot "pool" never
 * has to be written by anyone — no contention, and nothing to overwrite. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.Economy = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const SYS = ['pool', 'arcade', 'bank', 'gov', 'city'];
  const SUPPLY = 1e16;                                                  // $100,000,000,000,000 in cents
  const SEED = { pool: 8.3e15, arcade: 2.5e13, bank: 2e14, gov: 1.475e15, city: 0 };   // $83T market reserve · $250B casino bankroll · $2T lending capital · $14.75T treasury (pays public jobs) · city starts empty. Sums to exactly SUPPLY; every seed stays below 2^53 so the audit's derived balances stay exact
  const MAXACCT = 9e15;                                                 // a single balance must stay a safe integer (JS/Firebase numbers are exact to 9.007e15)
  const PLAYER_CAP = 5e15;                                              // no player or bot may hold more than $50 trillion (the wealth tax keeps real balances far below this)
  const DEFAULTS = {
    taxBp: 400,               // 4% universal tax on every flow between a player and the market pool / casino (gov takes it)
    startGrant: 10000000,     // $100,000 welcome grant (paid by the pool)
    ogExtra: 5000000,         // +$50,000 for OG players
    botGrant: 10000000,       // every bot is born with $100,000 from the pool
    dutyBp: 200,              // 2% stamp duty on every house sale (gov)
    sellBp: 9000,             // the city buys a house back at 90% of its value
    buildBp: 7500,            // a new house costs 75% of its market value to build (paid to the city)
    rentBpDay: 10,            // rent = 0.10% of value per day
    propTaxBpDay: 3,          // property tax = 0.03% of value per day
    wealthFree: 25000000,     // cash above $250,000 is taxed daily, in marginal brackets (see wealthTax): [multiple of wealthFree, daily rate in basis points]
    wealthBrackets: [[1, 50], [10, 150], [100, 400], [1000, 800], [10000, 1500], [100000, 2500], [1000000, 4000]],
    maxAcct: 5e15,            // a single player's cash is capped at $50T
    earnPerDay: 10000000,     // THE BROWSER-EDIT LIMIT: net money a player may ever draw from the market pool is capped at (grant + $100,000 × days since the account was created)
    earnSlack: 100000,        // + $1,000 of slack
    licFee: 5000000,          // a building licence from the council costs $50,000 and lasts licDays
    licDays: 30,
    plotFee: 25000000,        // an industrial plot (needed to open WestFactory) costs $250,000, bought once, paid to the city (world/plot/<uid>/f)
    labFee: 15000000,         // a laboratory in the University Quarter (needed to open WestLab) costs $150,000, bought once (world/plot/<uid>/l)
    builds: { studio: { n: 'Studio', c: 6980000 }, apartment: { n: 'Apartment', c: 17960000 }, townhouse: { n: 'Townhouse', c: 39900000 }, house: { n: 'House', c: 89800000 }, villa: { n: 'Villa', c: 299000000 } },   // escrow per type = the most that type can ever be worth (+5%); the exact price is charged when it is built and the rest refunded
    buildMarkupBp: 10500,     // a player-built house costs 105% of its value (so building and selling it straight to the city (90%) never profits)
    marketFeeBp: 500,         // 5% fee on player-to-player market sales (to the treasury)
    homelessPoolDiv: 10,      // homeless players may draw only 1/10 of the daily pool limit and cannot gamble or borrow
    loanMax: 50000000,        // $500,000 per loan, 3 loan slots
    plans: { short: { name: 'Quick cash', days: 7, bp: 300 }, standard: { name: 'Standard', days: 30, bp: 1200 }, long: { name: 'Long haul', days: 90, bp: 4000 } },   // total interest over the whole term
    lateBpDay: 200,           // overdue loans / bills grow 2% a day
    poolDaily: 500000000,     // at most $5,000,000 a day can flow from the market pool to one player
    arcStake: 2500000, arcWin: 250000000, arcDaily: 10000000, arcOn: 1,   // casino: max stake per write, max payout per write, max daily net win (cents)
    graceHours: 24,           // rent is overdue this long before eviction
    maxHouseVacancy: 0.12     // the city builds when fewer than this share of houses… (see eco-sim)
  };
  const cfgOf = db => { const c = Object.assign({}, DEFAULTS, (db && db.eco && db.eco.cfg) || {}); c.plans = Object.assign({}, DEFAULTS.plans, ((db && db.eco && db.eco.cfg) || {}).plans || {}); return c; };

  const newAcct = () => ({ b: 0, sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0, rev: 0, c0: 0, dp: 0, pin: 0, an: 0, ob: 0, cl: '', si: '', bp: '', lop: '', hop: '' });
  const sysSum = a => SYS.reduce((t, k) => t + ((a.sys && a.sys[k]) || 0), 0);
  const invariant = a => (a.b || 0) + sysSum(a) + (a.s || 0) - (a.r || 0);        // must be exactly 0
  const isInt = n => typeof n === 'number' && isFinite(n) && Math.floor(n) === n;

  /* tax helpers: both return integers and satisfy  gov × 10000 ≥ taxBp × pool-flow  (what the database rule checks) */
  const taxOnGross = (gross, bp) => Math.ceil(gross * bp / 10000);                 // you EARN gross from the pool → you keep gross − tax, the tax goes to gov
  const splitInclusive = (paid, bp) => { const gov = Math.ceil(paid * bp / (10000 + bp)); return { gov, pool: paid - gov }; };   // you PAY `paid` (tax included) → pool gets paid − gov
  const duty = (v, bp) => Math.ceil(v * bp / 10000);
  const sellPrice = (v, bp) => Math.floor(v * bp / 10000);
  const owedFor = (p, bp) => p + Math.floor(p * bp / 10000);
  /* wealth tax for one day on `cash` cents: marginal brackets above wealthFree. A balance of $100T would lose 40% of every cent above $250 billion each day. */
  function wealthTax(cash, cfg){
    const free = cfg.wealthFree, br = cfg.wealthBrackets; let tax = 0;
    for(let i = 0; i < br.length; i++){ const lo = free * br[i][0], hi = i + 1 < br.length ? free * br[i + 1][0] : Infinity; if(cash <= lo) break; tax += (Math.min(cash, hi) - lo) * br[i][1] / 10000; }
    return Math.floor(tax);
  }
  /* how much more the pool may pay this account, ever (the rules enforce this; the client clamps to it so a legitimate save is never refused) */
  const allowance = (cfg, c0, now) => cfg.startGrant + cfg.ogExtra + cfg.earnSlack + cfg.earnPerDay * Math.max(0, now - c0) / 86400000;
  const toCents = d => Math.round(d * 100), toDollars = c => c / 100;

  /* audit: add everything up. `db` = { eco:{acct, inbox, dead}, ... }. Returns the derived system balances and whether supply is intact. */
  function audit(db){
    const acct = (db.eco && db.eco.acct) || {}, dead = (db.eco && db.eco.dead) || {}, inbox = (db.eco && db.eco.inbox) || {};
    const used = {}; SYS.forEach(k => { used[k] = (dead.sys && dead.sys[k]) || 0; });
    let held = 0, bad = []; let players = 0, bots = 0;
    Object.keys(acct).forEach(id => { const a = acct[id]; if(!a) return; SYS.forEach(k => { used[k] += (a.sys && a.sys[k]) || 0; }); held += a.b || 0; if(invariant(a) !== 0) bad.push(id); if(id.charAt(0) === 'b' && /^b\d+$/.test(id)) bots++; else players++; });
    let flight = 0; Object.keys(inbox).forEach(u => Object.keys(inbox[u] || {}).forEach(t => { flight += (inbox[u][t] && inbox[u][t].a) || 0; }));
    const sys = {}; let sysTotal = 0; SYS.forEach(k => { sys[k] = SEED[k] + used[k]; sysTotal += sys[k]; });
    // money in flight is counted in the sender's s and the receiver's r once claimed: (Σ s − Σ r) must equal what still sits in inboxes
    let S = (dead.s || 0), R = (dead.r || 0); Object.keys(acct).forEach(id => { S += acct[id].s || 0; R += acct[id].r || 0; });
    // the grand total is ~1e16, past the point where doubles stay exact, so add it up as BigInt
    const big = SYS.reduce((t, k) => t + BigInt(sys[k]), 0n) + BigInt(held) + BigInt(flight), total = Number(big), ok = bad.length === 0 && S - R === flight && big === BigInt(SUPPLY);
    return { sys, held, flight, total, ok, bad, players, bots, sentMinusClaimed: S - R };
  }

  /* ---------- the ledger operations (pure, on a plain `db` object; used by the Action, the tests and as the reference for the client) ---------- */
  const acctOf = (db, id) => { db.eco = db.eco || {}; db.eco.acct = db.eco.acct || {}; return db.eco.acct[id] || (db.eco.acct[id] = newAcct()); };
  /* an account pays `amt` cents INTO a system account (amt < 0 = the system pays the account). false if it can't afford it. */
  function sysMove(db, id, sys, amt){ const a = acctOf(db, id); if(!isInt(amt) || SYS.indexOf(sys) < 0) return false; if(a.b - amt < 0) return false; a.b -= amt; a.sys[sys] = (a.sys[sys] || 0) + amt; a.rev = (a.rev || 0) + 1; return true; }
  /* send money to another account through its inbox (it must claim it) */
  let TX = 0;
  function send(db, from, to, amt, kind, ref, now){ const a = acctOf(db, from); if(!isInt(amt) || amt <= 0 || a.b < amt) return null; a.b -= amt; a.s += amt; a.rev = (a.rev || 0) + 1; db.eco.inbox = db.eco.inbox || {}; const box = db.eco.inbox[to] = db.eco.inbox[to] || {}; const id = 'x' + (now || 0).toString(36) + (TX++).toString(36) + from.slice(0, 4); box[id] = { f: from, a: amt, k: kind || 'pay', t: now || 0, ref: ref || '' }; return id; }
  function claimAll(db, id){ const box = db.eco && db.eco.inbox && db.eco.inbox[id]; if(!box) return 0; const a = acctOf(db, id); let n = 0; Object.keys(box).forEach(k => { const e = box[k]; a.b += e.a; a.r += e.a; n += e.a; delete box[k]; }); if(n) a.rev = (a.rev || 0) + 1; if(!Object.keys(box).length) delete db.eco.inbox[id]; return n; }

  /* retire an account for good (admin "reset player", a bot's death): claim whatever is waiting in its inbox, pay its cash back into the pool, then fold its
   * counters into the `dead` bucket and delete it. Just deleting eco/acct/<id> or eco/inbox/<id> would destroy its s/r/sys numbers (and money in flight) and
   * break the audit — this keeps every total exact. Pure: works on a plain db object; the caller writes the result. */
  function retire(db, id){
    const a = db.eco && db.eco.acct && db.eco.acct[id]; if(!a) return false;
    a.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, a.sys); a.b = a.b || 0; a.s = a.s || 0; a.r = a.r || 0;
    claimAll(db, id);
    if(a.b > 0){ a.sys.pool += a.b; a.b = 0; }
    const d = db.eco.dead = db.eco.dead || { sys: {}, s: 0, r: 0 }; d.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, d.sys);
    SYS.forEach(k => { d.sys[k] += a.sys[k] || 0; }); d.s = (d.s || 0) + a.s; d.r = (d.r || 0) + a.r;
    delete db.eco.acct[id]; if(db.eco.inbox) delete db.eco.inbox[id];
    return true;
  }

  /* repair: bring a ledger that is ALREADY out of balance (by an old admin reset that deleted accounts/inboxes, a hand edit in the console, …) back to exact balance
   * without touching anybody's cash. Three steps, each only when needed, and the leak always ends up in (or is taken from) the market pool:
   *   1. an account whose b + Σsys + s − r ≠ 0 gets its sys.pool corrected by the difference (its cash b is never changed);
   *   2. Σs − Σr must equal what sits in inboxes: the difference is booked into the dead bucket's s/r;
   *   3. total money must equal SUPPLY: the remaining gap is booked into dead.sys.pool.
   * Returns what it changed and the audit afterwards. */
  function repair(db){
    db.eco = db.eco || {}; const acct = db.eco.acct = db.eco.acct || {}; db.eco.inbox = db.eco.inbox || {};
    const dead = db.eco.dead = db.eco.dead || { sys: {}, s: 0, r: 0 }; dead.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, dead.sys); dead.s = dead.s || 0; dead.r = dead.r || 0;
    const log = { accounts: [], flightGap: 0, supplyGap: 0 };
    Object.keys(acct).forEach(id => { const a = acct[id]; if(!a) return; a.sys = Object.assign({ pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, a.sys); a.b = a.b || 0; a.s = a.s || 0; a.r = a.r || 0;
      const inv = invariant(a); if(inv !== 0){ a.sys.pool -= inv; a.rev = (a.rev || 0) + 1; log.accounts.push({ id, off: inv }); } });
    let S = BigInt(dead.s), R = BigInt(dead.r), flight = 0n; Object.keys(acct).forEach(id => { S += BigInt(acct[id].s || 0); R += BigInt(acct[id].r || 0); });
    Object.keys(db.eco.inbox).forEach(u => Object.keys(db.eco.inbox[u] || {}).forEach(t => { flight += BigInt((db.eco.inbox[u][t] && db.eco.inbox[u][t].a) || 0); }));
    const g = S - R - flight; if(g > 0n) dead.r += Number(g); else if(g < 0n) dead.s += Number(-g); log.flightGap = Number(g);
    const A = audit(db), gap = SYS.reduce((t, k) => t + BigInt(A.sys[k]), 0n) + BigInt(A.held) + BigInt(A.flight) - BigInt(SUPPLY);
    if(gap !== 0n) dead.sys.pool -= Number(gap); log.supplyGap = Number(gap);
    log.audit = audit(db); return log;
  }

  return { SYS, SUPPLY, SEED, MAXACCT, PLAYER_CAP, wealthTax, allowance, DEFAULTS, cfgOf, newAcct, sysSum, invariant, isInt, taxOnGross, splitInclusive, duty, sellPrice, owedFor, toCents, toDollars, audit, acctOf, sysMove, send, claimAll, retire, repair };
});
