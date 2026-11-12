/* KERNEL · market — the live $WEST stock. The price is a PURE FUNCTION of (time, shared seed, admin ledgers), so every player computes
 * the identical price locally and nothing is ever streamed. Network cost: a 2 KB checkpoint, two tiny Firebase ledgers (admin price
 * adjustments + the admin's volatility setting) and, only when a chart needs it, the static candle files on GitHub Pages.
 * The maths lives in os/lib/market-model.js (shared with the GitHub Action that writes the candle files). */
(window.__OSM = window.__OSM || []).push(function(K){
  const BOOT = {"tickIndex":23834399,"state":{"fairValue":0.9619825839144329,"momentum":-0.0024150875709596192,"vol":0.0012794373876274907,"spike":3.8674736447906337e-07,"price":0.9596596828782512},"dayAgo":{"tickIndex":23488800,"n":0.8843},"adjustments":[{"tickIndex":8662345,"delta":10,"at":1789435986368,"id":"-P1XgZ4loKeucxyjZbjo"},{"tickIndex":8731227,"delta":10,"at":1789453206976,"id":"-P1YiFKQe6U7iTvZTihN"},{"tickIndex":8731327,"delta":-10,"at":1789453231974,"id":"-P1YiLROIOoNi3zOgmgC"},{"tickIndex":8731398,"delta":-10,"at":1789453249528,"id":"-P1YiPiPByT1G7RqvAr4"},{"tickIndex":8731665,"delta":100,"at":1789453316275,"id":"-P1Yif0Tod0Yv_EuaSsC"},{"tickIndex":9312969,"delta":-100,"at":1789598642252,"id":"-P1gO1zoov7FZxQnj3M8"},{"tickIndex":9370373,"delta":100,"at":1789612993423,"id":"-P1hEmgZKJOvFuIM-i_g"},{"tickIndex":10022811,"delta":100,"at":1789776102877,"id":"-P1qxzfWwQAZw22JhQvx"},{"tickIndex":15953122,"delta":-100,"at":1791258678460,"fadeSec":300,"id":"-P3EK_GTNrSPW-MkJ_Ou"},{"tickIndex":16229325,"delta":-100,"at":1791327712110,"id":"-P3IRvBNsQQAgZOeSi3K"},{"tickIndex":21767298,"delta":100,"at":1792712223916,"id":"-P4_yPkcyyalNKbHgwCU"},{"tickIndex":22922700,"delta":100,"at":1793001076417,"fadeSec":300,"id":"-P4rBI02XRgVD4xQZnQw"},{"tickIndex":22922923,"delta":-200,"at":1793001122768,"id":"-P4rBTKFpPNase0Znvy5"},{"tickIndex":23131880,"delta":100,"at":1793053114664,"id":"-P4uHo1MxIXroYUE7cvq"},{"tickIndex":23133178,"delta":-150,"at":1793053289765,"id":"-P4uITlwvsKlfydwv9iQ"}],"lastAdjKey":"-P4uITlwvsKlfydwv9iQ"};          // snapshot shipped with the site: instant first price, no waiting on the network
  const mk = K.market = { ready: !1 };
  let cp = { tickIndex: BOOT.tickIndex, state: Object.assign({}, BOOT.state) };
  let adj = [], adjKeys = new Set(), price = 0, live = [], recent = null, hourly = null, vol = { list: [], sig: '[]', synced: !K.cloud.db };
  const BASE = 'market/', LOCAL_RES = 240, lcandles = [], lcb = marketCandleBuilder(LOCAL_RES, (b, c) => { lcandles.push([b, c]); if(lcandles.length > 30000) lcandles.splice(0, lcandles.length - 30000); });
  const cleanAdj = (id, a) => { if(!a || typeof a.tickIndex !== 'number' || typeof a.delta !== 'number' || !isFinite(a.tickIndex + a.delta) || a.tickIndex < 0 || Math.abs(a.delta) > 1e7) return null; const o = { tickIndex: Math.floor(a.tickIndex), delta: a.delta, at: +a.at || 0, id }; if(a.fadeSec > 0 && a.fadeSec <= 2592000) o.fadeSec = a.fadeSec; return o; };
  function mergeAdj(list){
    let changed = false;
    (list || []).forEach(a => { a = cleanAdj(a.id, a); if(!a) return; const key = a.id || (a.tickIndex + ':' + a.delta + ':' + a.at); if(adjKeys.has(key)) return; adjKeys.add(key); adj.push(a); changed = true; });
    if(changed) adj.sort((x, y) => x.tickIndex - y.tickIndex || x.at - y.at);
    return changed;
  }
  mergeAdj(BOOT.adjustments);
  function repaint(){ price = marketDisplayPrice(cp.state.price, cp.tickIndex, adj); }
  function advance(){
    const target = marketTickIndexForTime(K.now()); let guard = 0;
    while(cp.tickIndex < target && guard++ < 20){
      const res = marketSimulate(cp, target, (i, p) => { live.push(i, p); lcb.push(i, p); }, 2000000);
      cp = { tickIndex: res.tickIndex, state: res.state };
    }
    if(live.length > 16000) live.splice(0, live.length - 16000);
    repaint();
  }
  advance();
  mk.price = () => price; mk.tick = () => cp.tickIndex;
  mk.volLevel = () => marketVolLevelAt(cp.tickIndex);                               // admin-facing only (the shell never shows this to players)
  /* ---- run loop: 1 Hz in the background, 4 Hz only while something (the Stocks app) wants smooth ticks ---- */
  let fast = 0, timer = null, lastEmit = 0;
  /* ---- live market events: the busier pump/dump generator in market-model.js is a pure function of the clock, so every player gets the same event
   * at the same second with no network traffic. You are alerted only when you hold shares (otherwise it would just be noise). ---- */
  const EV_UP = ['A big buyer sweeps the order book', 'Rumour of a major partnership', 'Analysts upgrade the stock', 'A short squeeze rattles the sellers', 'Whispers of a surprise earnings beat'];
  const EV_DOWN = ['A large holder dumps shares', 'Rumour of a delay spooks traders', 'An analyst downgrade hits the tape', 'Profit-taking sweeps the market', 'A surprise sell order lands'];
  let lastEv = (marketEvent2At(cp.tickIndex, 400) || {}).id || '', lastEvAt = 0;
  function watchEvents(){
    const e = marketEvent2At(cp.tickIndex, 160); if(!e || e.id === lastEv) return; lastEv = e.id;
    const size = e.mag * (marketVolAt(cp.tickIndex) || 1), now = Date.now();
    if(!K.loaded || !K.S.lots.length || size < 0.04 || now - lastEvAt < 45000) return; lastEvAt = now;
    const pool = e.dir > 0 ? EV_UP : EV_DOWN;
    K.emit('notify', { app: 'Stocks', title: '$WEST ' + (e.dir > 0 ? 'surges' : 'dips'), body: pool[Math.min(pool.length - 1, Math.floor(e.pick * pool.length))] + ' (' + (e.dir > 0 ? '▲' : '▼') + Math.round(size * 100) + '%)' });
  }
  function loop(){ advance(); watchEvents(); K.emit('market', price); }
  const SPEED = { smooth: [200, 1000], balanced: [250, 1000], saver: [1000, 3000] };
  function arm(){ clearInterval(timer); const sp = SPEED[K.prefs.updateSpeed] || SPEED.balanced; timer = setInterval(loop, fast > 0 ? sp[0] : sp[1]); }
  K.on('prefs', k => { if(k === 'updateSpeed' || k === '*') arm(); });
  mk.wantFast = on => { fast = Math.max(0, fast + (on ? 1 : -1)); arm(); };
  arm();
  document.addEventListener('visibilitychange', () => { if(!document.hidden) loop(); });

  /* ---- ledgers ---- */
  async function fetchCheckpoint(){
    try{
      const res = await fetch(BASE + 'market-data.json', { cache: 'no-cache' }); if(!res.ok) return;
      const dh = res.headers.get('date'); if(dh && !K.cloud.db){ K.offset = Date.parse(dh) - Date.now(); }
      const c = await res.json(); if(c && c.model === MARKET_MODEL_VERSION && mergeAdj(c.adjustments)){ repaint(); K.emit('market', price); }
    }catch(e){}
  }
  function startLedgers(){
    const db = K.cloud.db; if(!db) { mk.ready = true; return; }
    setTimeout(() => { vol.synced = true; mk.ready = true; }, 5000);                 // can't reach the database → fall back to the default setting rather than lock trading forever
    db.ref('marketAdjustments').orderByKey().startAt(BOOT.lastAdjKey || '').on('child_added', s => { if(mergeAdj([Object.assign({ id: s.key }, s.val())])){ repaint(); K.emit('market', price); } }, () => {});
    db.ref('marketVolatility').on('value', s => {
      const v = s.val() || {};
      const list = Object.keys(v).map(id => ({ id, tickIndex: v[id] && v[id].tickIndex, level: v[id] && v[id].level, at: v[id] && v[id].at })).filter(e => typeof e.tickIndex === 'number' && marketVolAt && MARKET_VOL_LEVELS[e.level] !== undefined);
      const sig = JSON.stringify(list); vol.synced = true; mk.ready = true;
      if(sig !== vol.sig){ vol.sig = sig; vol.list = list; marketSetVolSchedule(list); history_cache = {}; repaint(); K.emit('market', price); K.emit('volatility'); }
    }, () => { vol.synced = true; mk.ready = true; });
  }
  mk.start = () => { fetchCheckpoint(); startLedgers(); };
  mk.volLedger = () => vol.list.slice();

  /* ---- history for charts ---- */
  let history_cache = {};
  const candlePoints = (bucket, res, c) => marketCandleTicks(bucket, res).map((t, k) => [marketTimeForTickIndex(t), marketDisplayPrice(c[k], t, adj), t]);
  async function loadRecent(){
    if(recent) return recent;
    try{ const r = await fetch(BASE + 'history/recent.json', { cache: 'no-cache' }); if(r.ok){ const j = await r.json(); if(j && Array.isArray(j.c)) recent = j; } }catch(e){}
    return recent;
  }
  async function loadHourly(){
    if(hourly) return hourly;
    try{ const r = await fetch(BASE + 'history/hourly.json', { cache: 'no-cache' }); if(r.ok){ const j = await r.json(); if(j && Array.isArray(j.c)) hourly = j; } }catch(e){}
    return hourly;
  }
  const SPANS = { '1m': 60e3, '5m': 300e3, '30m': 1800e3, '1H': 3600e3, '6H': 21600e3, '1D': 86400e3, '1W': 604800e3, '1M': 2592000e3, 'ALL': Infinity };
  mk.ranges = Object.keys(SPANS);
  /* The stored candles only hold 4 noise samples per 5 min (hourly for old data) while the fast 'game' layer moves every few seconds, so drawing candle
   * samples directly gave sparse jagged points joined by straight lines (worse the further you zoomed out), glued to the dense live ticks. Instead the chart is
   * RESAMPLED: normalised noise is interpolated from the finest data available (live ticks → 1-min local candles → 5-min candles → hourly candles), and the
   * exact price function (noise × trend × game layer × admin ledger) is evaluated at a fixed number of points, averaging a few sub-samples per point (anti-aliasing). */
  const loaded = {}; let smp = null, smpAt = 0;
  async function ensure(span){ if(span > 1800e3) await loadRecent(); if(span > 47 * 3600e3 || !isFinite(span)) await loadHourly(); }
  const candleSamples = (res, items) => { const r = []; (items || []).forEach(it => { if(!it || !Array.isArray(it[1]) || !(res > 0)) return; const t = marketCandleTicks(it[0], res); for(let k = 0; k < 4; k++){ const v = +it[1][k]; if(isFinite(v) && v > 0 && isFinite(t[k])) r.push([t[k], v]); } }); return r; };
  function samples(){
    const now = K.now(); const sig = cp.tickIndex + ':' + (recent ? 1 : 0) + (hourly ? 1 : 0); if(smp && now - smpAt < 2000 && smp.sig === sig) return smp.m; const layers = [];
    try{ if(hourly) layers.push(candleSamples(hourly.res, hourly.c.map((c, i) => [(hourly.b0 || 0) + i, c]))); }catch(e){}
    try{ if(recent) layers.push(candleSamples(recent.res, recent.c.map((c, i) => [recent.b0 + i, c]))); }catch(e){}
    layers.push(candleSamples(LOCAL_RES, lcandles)); const lv = []; for(let i = 0; i < live.length; i += 2) lv.push([live[i], live[i + 1]]); layers.push(lv);
    let m = []; layers.forEach(Ly => { if(!Ly.length) return; const lo = Ly[0][0], hi = Ly[Ly.length - 1][0]; m = m.filter(x => x[0] < lo || x[0] > hi).concat(Ly); });   // the finest source wins where they overlap
    m.sort((x, y) => x[0] - y[0]); smp = { m, sig }; smpAt = now; return m;
  }
  function noiseAt(m, t){ if(!m.length) return cp.state.price; let lo = 0, hi = m.length - 1; if(t <= m[0][0]) return m[0][1]; if(t >= m[hi][0]) return m[hi][1]; while(hi - lo > 1){ const mid = (lo + hi) >> 1; m[mid][0] <= t ? lo = mid : hi = mid; } const a = m[lo], b = m[hi], f = (t - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * f; }
  function build(range, n){
    const span = SPANS[range] || SPANS['1H'], m = samples(), to = cp.tickIndex; n = Math.max(40, Math.min(480, n || 240));
    let from = isFinite(span) ? to - Math.round(span / MARKET_TICK_MS) : (m.length ? m[0][0] : 0); if(m.length) from = Math.max(from, m[0][0]); if(to - from < 40) from = Math.max(0, to - 40);
    const bt = (to - from) / n, out = [], sub = Math.max(1, Math.min(6, Math.floor(bt)));
    for(let k = 0; k < n; k++){ const a = from + bt * k, b = a + bt; let s = 0, lo = Infinity, hi = -Infinity; for(let j = 0; j < sub; j++){ const tk = Math.round(a + (b - a) * (j + .5) / sub), pr = marketDisplayPrice(noiseAt(m, tk), tk, adj); s += pr; if(pr < lo) lo = pr; if(pr > hi) hi = pr; } out.push([marketTimeForTickIndex(Math.round(a + bt / 2)), s / sub, lo, hi]); }
    out.push([K.now(), price, price, price]); return out;
  }
  const safeBuild = (range, n) => { try{ const o = build(range, n); if(o.length > 2 && o.every(p => p.every(isFinite))) return o; }catch(e){} return build2(range, n); };
  function build2(range, n){ const span = SPANS[range] || SPANS['1H'], pts = [], to = cp.tickIndex, from = isFinite(span) ? Math.max(0, to - Math.round(span / MARKET_TICK_MS)) : Math.max(0, to - 345600 * 2), bt = (to - from) / (n || 120);   // last resort: exact price at evenly spaced ticks from the live buffer's noise
    for(let k = 0; k <= (n || 120); k++){ const tk = Math.round(from + bt * k); pts.push([marketTimeForTickIndex(tk), price, price, price]); } return pts; }
  mk.series = async function(range, n){ const span = SPANS[range] || SPANS['1H']; try{ await ensure(span); }catch(e){} loaded[range] = true; return safeBuild(range, n); };
  mk.seriesFast = (range, n) => loaded[range] ? safeBuild(range, n) : null;       // sync, for the live chart (needs one prior series() call for that range)
  mk.change24 = async function(){
    const pts = await mk.series('1D'); if(pts.length < 2) return { abs: 0, pct: 0 };
    const first = pts[0][1]; return { abs: price - first, pct: first ? (price - first) / first * 100 : 0 };
  };

  /* ---- trading ($WEST shares; lots remember what you paid) ---- */
  const r4 = n => Math.round(n * 10000) / 10000;
  mk.lots = () => K.S.lots.map(l => Object.assign({}, l));
  K.stockValue = () => K.S.lots.reduce((s, l) => s + l.q * price, 0);
  mk.buy = function(q){
    q = r4(q); if(!(q > 0) || !isFinite(q)) return { ok: false, msg: 'Enter a quantity.' };
    if(!mk.ready) return { ok: false, msg: 'Syncing the market — try again in a moment.' };
    const cost = K.round2(q * price); if(cost < 0.01) return { ok: false, msg: 'Too small.' };
    if(!K.spend(cost, 'Bought $WEST')) return { ok: false, msg: 'Not enough cash.' };
    K.S.lots.push({ id: K.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), q, p: price, t: K.now() }); K.touch('lots'); K.emit('stock');
    return { ok: true, msg: 'Bought ' + q + ' $WEST for $' + cost.toFixed(2), cost };
  };
  mk.sell = function(lotId){
    if(!mk.ready) return { ok: false, msg: 'Syncing the market — try again in a moment.' };
    const i = K.S.lots.findIndex(l => l.id === lotId); if(i < 0) return { ok: false, msg: 'No such position.' };
    const l = K.S.lots[i], gross = K.round2(l.q * price); K.S.lots.splice(i, 1); const proceeds = K.earn(gross, 'Sold $WEST'); K.touch('lots'); K.emit('stock');    // what reaches you is net of the treasury's tax
    return { ok: true, msg: 'Sold for $' + proceeds.toFixed(2) + ' after $' + K.round2(gross - proceeds).toFixed(2) + ' tax', proceeds, tax: K.round2(gross - proceeds), profit: K.round2(proceeds - l.q * l.p) };
  };
  mk.sellQty = function(q){
    if(!mk.ready) return { ok: false, msg: 'Syncing the market — try again in a moment.' };
    q = r4(q); const total = K.S.lots.reduce((t, l) => t + l.q, 0); if(!(q > 0) || !isFinite(q)) return { ok: false, msg: 'Enter a quantity.' }; if(!(total > 0)) return { ok: false, msg: 'You have no shares.' };
    if(q > total - 0.00005) q = total; let left = q, proceeds = 0, profit = 0;
    K.S.lots.slice().sort((x, y) => x.t - y.t).forEach(l => { if(left <= 0) return; const take = Math.min(l.q, left); proceeds += take * price; profit += take * (price - l.p); left = r4(left - take); if(take >= l.q - 0.00005) K.S.lots.splice(K.S.lots.indexOf(K.S.lots.find(x => x.id === l.id)), 1); else K.S.lots.find(x => x.id === l.id).q = r4(l.q - take); });
    const gross = K.round2(proceeds); proceeds = gross > 0 ? K.earn(gross, 'Sold $WEST') : 0; profit -= (gross - proceeds); K.touch('lots'); K.emit('stock');
    return { ok: true, msg: 'Sold ' + q + ' $WEST for $' + proceeds.toFixed(2) + ' after tax', proceeds, tax: K.round2(gross - proceeds), profit: K.round2(profit) };
  };
  mk.sellFraction = f => { const total = K.S.lots.reduce((t, l) => t + l.q, 0); return f >= 1 ? mk.sellAll() : mk.sellQty(total * f); };
  mk.buyFraction = function(f){ let q = Math.floor(K.S.cash * f / price * 10000) / 10000; while(q > 0 && K.round2(q * price) > K.S.cash * f + 0.004) q = r4(q - 0.0001); return mk.buy(q); };
  mk.sellAll = function(){ if(!K.S.lots.length) return { ok: false, msg: 'Nothing to sell.' }; let tot = 0, profit = 0; K.S.lots.slice().forEach(l => { const r = mk.sell(l.id); if(r.ok){ tot += r.proceeds; profit += r.profit; } }); return { ok: true, msg: 'Sold everything for $' + tot.toFixed(2), proceeds: K.round2(tot), profit: K.round2(profit) }; };

  /* ---- admin: volatility + price shoves (rules only accept these from the admin account) ---- */
  mk.admin = {
    setVolatility: async level => { if(!K.cloud.isAdmin()) throw new Error('Admin only.'); if(MARKET_VOL_LEVELS[level] === undefined) throw new Error('Bad level.'); await K.cloud.db.ref('marketVolatility').push({ tickIndex: cp.tickIndex, level, at: K.now() }); },
    adjust: async (delta, fadeSec) => { if(!K.cloud.isAdmin()) throw new Error('Admin only.'); const o = { tickIndex: cp.tickIndex, delta, at: K.now() }; if(fadeSec > 0) o.fadeSec = fadeSec; await K.cloud.db.ref('marketAdjustments').push(o); },
    levels: () => Object.keys(MARKET_VOL_LEVELS)
  };
});
