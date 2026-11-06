/* KERNEL · state — the one source of truth for the player's game state, plus the wallet, inventory, mail and pricing rules.
 * Nothing here is reachable from the console: the shell hands apps a narrow facade (os/kernel/api.js), never this object.
 * Not signed in  => state lives in memory only (it is never written to localStorage or the cloud).
 * Signed in      => cloud.js loads/saves it. */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG;
  const round2 = n => Math.round(n * 100) / 100;
  K.round2 = round2;
  K.toArr = v => Array.isArray(v) ? v.filter(x => x != null) : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);

  /* ---- event bus ---- */
  const handlers = {};
  K.on = (e, f) => { (handlers[e] = handlers[e] || new Set()).add(f); return () => handlers[e].delete(f); };
  K.emit = (e, d) => { if(handlers[e]) handlers[e].forEach(f => { try{ f(d); }catch(err){ console.error('[os:' + e + ']', err); } }); };

  /* ---- clock: the device clock corrected by the server's (so changing your PC clock can't skip a tax deadline) ---- */
  K.offset = 0;
  K.now = () => Date.now() + K.offset;
  K.today = () => new Date(K.now()).toISOString().slice(0, 10);

  /* ---- state ---- */
  K.defaults = () => ({
    v: 3, cash: CFG.startCash, inv: { e: {}, c: {} }, lots: [], props: {},
    bank: { last: '', bills: [], hist: [] }, mail: [],
    lab: { found: [], tools: { basic: 1 }, runs: 0, tray: {} }, games: { day: '', plays: {}, earned: 0 },
    shop: { demand: {} }, meta: { created: Date.now(), name: '', lastBroadcast: 0 }, arcade: { d: 0, net: 0, open: 0, t: 0 }
  });
  K.S = K.defaults();
  K.dirty = new Set();
  K.touch = (...fields) => { fields.forEach(f => K.dirty.add(f)); K.emit('dirty'); };
  K.loaded = false;                      // true once the cloud copy has been read (so we never overwrite it with defaults)

  // make a record from the cloud (or anywhere) safe to use: right shape, finite numbers, arrays as arrays
  K.adopt = function(raw){
    const d = K.defaults(), r = Object.assign({}, (raw && typeof raw === 'object') ? raw : {});
    // one-time migration from the previous (pre-WestOS) save format: elements/compounds → inv, qty/buyPrice lots → q/p, tools[], disc.c
    if(!r.inv && (r.elements || r.compounds)) r.inv = { e: r.elements || {}, c: r.compounds || {} };
    if(r.lots) r.lots = K.toArr(r.lots).map(l => (l && l.q == null && l.qty != null) ? { id: String(l.id), q: +l.qty, p: +l.buyPrice, t: K.now() } : l);
    if(!r.lab && (Array.isArray(r.tools) || (r.disc && r.disc.c))){ r.lab = { tools: { basic: 1 }, found: K.toArr(r.disc && r.disc.c), runs: 0 }; K.toArr(r.tools).forEach(t => { if(typeof t === 'string') r.lab.tools[t] = 1; }); delete r.tools; }
    const S = Object.assign(d, r);
    S.cash = (typeof S.cash === 'number' && isFinite(S.cash) && S.cash >= 0) ? round2(S.cash) : CFG.startCash;
    S.inv = { e: Object.assign({}, S.inv && S.inv.e), c: Object.assign({}, S.inv && S.inv.c) };
    ['e', 'c'].forEach(t => Object.keys(S.inv[t]).forEach(k => { const n = Math.floor(S.inv[t][k]); if(!(n > 0)) delete S.inv[t][k]; else S.inv[t][k] = n; }));
    S.lots = K.toArr(S.lots).filter(l => l && l.q > 0 && l.p > 0);
    S.props = (S.props && typeof S.props === 'object') ? S.props : {};
    S.bank = Object.assign({ last: '', bills: [], hist: [] }, S.bank); S.bank.bills = K.toArr(S.bank.bills); S.bank.hist = K.toArr(S.bank.hist);
    S.mail = K.toArr(S.mail);
    S.lab = Object.assign({ found: [], tools: { basic: 1 }, runs: 0 }, S.lab); S.lab.found = K.toArr(S.lab.found); S.lab.tools = Object.assign({ basic: 1 }, S.lab.tools);
    { const tr = {}, src = (S.lab.tray && typeof S.lab.tray === 'object') ? S.lab.tray : {}; Object.keys(src).forEach(k => { const v = Math.floor(+src[k]); if(v > 0 && v < 1e6 && Chem.speciesOf(k)) tr[k] = v; }); S.lab.tray = tr; }   // WestLab output tray: products waiting to be collected into the inventory
    S.games = Object.assign({ day: '', plays: {}, earned: 0 }, S.games);
    S.shop = Object.assign({ demand: {} }, S.shop); S.shop.demand = S.shop.demand || {};
    S.meta = Object.assign({ created: Date.now(), name: '', lastBroadcast: 0 }, S.meta);
    { const c = Object.assign({ d: 0, net: 0, open: 0, t: 0 }, (S.arcade && typeof S.arcade === 'object') ? S.arcade : {}); S.arcade = { d: +c.d || 0, net: isFinite(+c.net) ? round2(+c.net) : 0, open: +c.open > 0 ? round2(+c.open) : 0, t: +c.t || 0 }; }   // arcade ledger: today's net winnings + any stake still at risk
    delete S.prefs;
    K.S = S; K.emit('cash'); K.emit('inv'); K.emit('mail'); K.emit('bank'); K.emit('props'); K.emit('stock'); K.emit('arcade');
  };
  K.reset = () => { K.S = K.defaults(); K.dirty.clear(); ['cash', 'inv', 'mail', 'bank', 'props', 'stock'].forEach(e => K.emit(e)); };

  /* ---- wallet ---- */
  function logTx(d, why){ const h = K.S.bank.hist; h.unshift({ t: K.now(), d, n: String(why || '').slice(0, 40) }); if(h.length > 40) h.length = 40; }
  K.earn = (amt, why) => { amt = round2(amt); if(!(amt > 0) || !isFinite(amt)) return 0; K.S.cash = round2(K.S.cash + amt); logTx(amt, why); K.touch('cash', 'bank'); K.emit('cash'); return amt; };
  K.spend = (amt, why) => { amt = round2(amt); if(!(amt >= 0) || amt > K.S.cash + 1e-9) return false; if(amt === 0) return true; K.S.cash = round2(K.S.cash - amt); logTx(-amt, why); K.touch('cash', 'bank'); K.emit('cash'); return true; };

  /* ---- inventory (elements by symbol, compounds by formula; integer units = moles) ---- */
  const bucket = t => t === 'compound' ? K.S.inv.c : K.S.inv.e;
  K.qty = (t, k) => bucket(t)[k] || 0;
  K.invAdd = (t, k, n) => { n = Math.floor(n); if(!(n > 0)) return 0; const b = bucket(t); b[k] = (b[k] || 0) + n; K.touch('inv'); K.emit('inv'); return n; };
  K.invTake = (t, k, n) => { n = Math.floor(n); const b = bucket(t); if(!(n > 0) || (b[k] || 0) < n) return false; b[k] -= n; if(b[k] <= 0) delete b[k]; K.touch('inv'); K.emit('inv'); return true; };
  K.invFlat = () => Object.assign({}, K.S.inv.e, K.S.inv.c);          // { key: qty } — what Chem.plan() needs

  /* ---- mail ---- */
  K.mailAdd = function(m){
    const id = m.id || ('m' + K.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36));
    if(K.S.mail.some(x => x.id === id)) return null;
    const msg = { id, from: m.from || 'System', subj: m.subj || '', body: m.body || '', t: K.now(), read: false, kind: m.kind || 'info' };
    if(m.act) msg.act = m.act;
    K.S.mail.unshift(msg); if(K.S.mail.length > 60) K.S.mail.length = 60;
    K.touch('mail'); K.emit('mail');
    if(m.notify !== false) K.emit('notify', { app: m.app || 'Messages', title: msg.from, body: msg.subj, mailId: id });
    return id;
  };

  /* ---- prices: list value × news multiplier; the shop buys back at SELL_RATE with a demand curve (flooding one item sags it) ---- */
  const BUY = typeof BUY_RATE !== 'undefined' ? BUY_RATE : 1, SELL = typeof SELL_RATE !== 'undefined' ? SELL_RATE : 0.7;
  const S_ = typeof SELL_DEMAND_S !== 'undefined' ? SELL_DEMAND_S : 250, FLOOR = typeof SELL_FLOOR !== 'undefined' ? SELL_FLOOR : 0.35, HALF = typeof SELL_DEMAND_HALF_LIFE_H !== 'undefined' ? SELL_DEMAND_HALF_LIFE_H : 6;
  const dFs = (x, S) => { const XF = S * (1 / FLOOR - 1); return x < XF ? S * Math.log(1 + x / S) : S * Math.log(1 + XF / S) + FLOOR * (x - XF); };
  const econNow = () => World.econ(K.now());                                      // the economy index: prices, rents, payouts and the demand scale all ride it
  K.econ = econNow;
  const kindOf = key => (Chem.speciesOf(key) || {}).kind === 'element' ? 'element' : 'compound';
  K.kindOf = kindOf;
  K.listValue = key => Chem.valueOf(key) * World.valueMult(key, K.now());             // what one unit is "worth" right now
  K.buyPrice = key => round2(Math.max(0.01, K.listValue(key) * BUY));
  function demandNow(key){ const d = K.S.shop.demand[key]; return d ? d[0] * Math.pow(0.5, (K.now() - d[1]) / (HALF * 3600000)) : 0; }
  K.sellQuote = function(key, n){                                                   // total revenue for selling n units, and the average price
    const v = K.listValue(key), x0 = demandNow(key), S = S_ * econNow(); n = Math.max(0, Math.floor(n));      // the demand scale grows with prices, so selling one pricey item doesn't "flood" the shop
    const rev = v > 0 ? SELL * (dFs(x0 + n * v, S) - dFs(x0, S)) : 0;
    return { total: round2(rev), avg: n ? round2(rev / n) : round2(SELL * v * (1 / (1 + x0 / S))), v };
  };
  K.sellPrice = key => K.sellQuote(key, 1).avg;
  K.noteSale = function(key, n){ const v = K.listValue(key), x0 = demandNow(key); K.S.shop.demand[key] = [x0 + n * v, K.now()]; Object.keys(K.S.shop.demand).forEach(k => { if(demandNow(k) < 1) delete K.S.shop.demand[k]; }); K.touch('shop'); };
  K.inventoryValue = () => { let v = 0; ['e', 'c'].forEach(t => Object.keys(K.S.inv[t]).forEach(k => { v += K.listValue(k) * K.S.inv[t][k]; })); return v * SELL; };

  /* ---- properties ---- */
  const PROP = id => PROPERTIES.find(p => p.id === id);
  K.propPrice = id => { const p = PROP(id); return p ? World.propertyPrice(p, K.now()) : 0; };
  K.propValue = () => Object.keys(K.S.props).reduce((s, id) => s + K.propPrice(id) * 0.95, 0);
  K.rentDue = function(){
    const now = K.now(); let tot = 0;
    Object.keys(K.S.props).forEach(id => { const p = PROP(id), o = K.S.props[id]; if(!p) return; const days = Math.min(7, Math.max(0, (now - (o.rentT || o.t)) / 86400000)); tot += K.propPrice(id) * p.rent * days; });
    return round2(tot);
  };

  /* ---- minigames: payouts shrink per game per day and soften after a daily total ---- */
  K.gameDay = () => { const d = K.today(); if(K.S.games.day !== d) K.S.games = { day: d, plays: {}, earned: 0 }; return K.S.games; };
  K.collectionBonus = () => 1 + Math.min(0.5, 0.004 * Object.keys(K.S.inv.e).length + 0.004 * K.S.lab.found.length);
  const CHEAP = ['H', 'C', 'N', 'O', 'Na', 'Mg', 'Al', 'Si', 'S', 'Cl', 'K', 'Ca', 'Fe', 'Zn', 'Cu'];
  K.award = function(gameId, base){
    const g = K.gameDay(), plays = (g.plays[gameId] || 0) + 1; g.plays[gameId] = plays;
    const ec = econNow(), dim = Math.max(0.15, 1 - (plays - 1) * 0.12), soft = g.earned >= CFG.game.dailySoftcap * ec ? 0.25 : 1, bonus = K.collectionBonus();
    const amount = K.earn(base * dim * soft * bonus * ec, 'Game: ' + gameId); g.earned = round2(g.earned + amount);
    let drop = null;
    if(Math.random() < CFG.game.dropChance * (soft < 1 ? 0.5 : 1)){ const sym = CHEAP[Math.floor(Math.random() * CHEAP.length)], n = 1 + Math.floor(Math.random() * 3); K.invAdd('element', sym, n); drop = { sym, n }; }
    K.touch('games'); K.emit('games'); return { amount, bonus, drop, earnedToday: g.earned, softcap: Math.round(CFG.game.dailySoftcap * ec) };
  };

  /* ---- net worth ---- */
  K.netWorth = () => round2(K.S.cash + K.inventoryValue() + (K.stockValue ? K.stockValue() : 0) + K.propValue());
});
