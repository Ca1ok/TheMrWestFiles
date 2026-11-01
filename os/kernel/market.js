/* KERNEL · market — the live $WEST stock. The price is a PURE FUNCTION of (time, shared seed, admin ledgers), so every player computes
 * the identical price locally and nothing is ever streamed. Network cost: a 2 KB checkpoint, two tiny Firebase ledgers (admin price
 * adjustments + the admin's volatility setting) and, only when a chart needs it, the static candle files on GitHub Pages.
 * The maths lives in os/lib/market-model.js (shared with the GitHub Action that writes the candle files). */
(window.__OSM = window.__OSM || []).push(function(K){
  const BOOT = {"tickIndex":23834399,"state":{"fairValue":0.9619825839144329,"momentum":-0.0024150875709596192,"vol":0.0012794373876274907,"spike":3.8674736447906337e-07,"price":0.9596596828782512},"dayAgo":{"tickIndex":23488800,"n":0.8843},"adjustments":[{"tickIndex":8662345,"delta":10,"at":1789435986368,"id":"-P1XgZ4loKeucxyjZbjo"},{"tickIndex":8731227,"delta":10,"at":1789453206976,"id":"-P1YiFKQe6U7iTvZTihN"},{"tickIndex":8731327,"delta":-10,"at":1789453231974,"id":"-P1YiLROIOoNi3zOgmgC"},{"tickIndex":8731398,"delta":-10,"at":1789453249528,"id":"-P1YiPiPByT1G7RqvAr4"},{"tickIndex":8731665,"delta":100,"at":1789453316275,"id":"-P1Yif0Tod0Yv_EuaSsC"},{"tickIndex":9312969,"delta":-100,"at":1789598642252,"id":"-P1gO1zoov7FZxQnj3M8"},{"tickIndex":9370373,"delta":100,"at":1789612993423,"id":"-P1hEmgZKJOvFuIM-i_g"},{"tickIndex":10022811,"delta":100,"at":1789776102877,"id":"-P1qxzfWwQAZw22JhQvx"},{"tickIndex":15953122,"delta":-100,"at":1791258678460,"fadeSec":300,"id":"-P3EK_GTNrSPW-MkJ_Ou"},{"tickIndex":16229325,"delta":-100,"at":1791327712110,"id":"-P3IRvBNsQQAgZOeSi3K"},{"tickIndex":21767298,"delta":100,"at":1792712223916,"id":"-P4_yPkcyyalNKbHgwCU"},{"tickIndex":22922700,"delta":100,"at":1793001076417,"fadeSec":300,"id":"-P4rBI02XRgVD4xQZnQw"},{"tickIndex":22922923,"delta":-200,"at":1793001122768,"id":"-P4rBTKFpPNase0Znvy5"},{"tickIndex":23131880,"delta":100,"at":1793053114664,"id":"-P4uHo1MxIXroYUE7cvq"},{"tickIndex":23133178,"delta":-150,"at":1793053289765,"id":"-P4uITlwvsKlfydwv9iQ"}],"lastAdjKey":"-P4uITlwvsKlfydwv9iQ"};          // snapshot shipped with the site: instant first price, no waiting on the network
  const mk = K.market = { ready: !1 };
  let cp = { tickIndex: BOOT.tickIndex, state: Object.assign({}, BOOT.state) };
  let adj = [], adjKeys = new Set(), price = 0, live = [], recent = null, hourly = null, vol = { list: [], sig: '[]', synced: !K.cloud.db };
  const BASE = 'market/';
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
      const res = marketSimulate(cp, target, (i, p) => { live.push(i, p); }, 2000000);
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
  function loop(){ advance(); K.emit('market', price); }
  function arm(){ clearInterval(timer); timer = setInterval(loop, fast > 0 ? 250 : 1000); }
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
  mk.series = async function(range){
    const span = SPANS[range] || SPANS['1H'], now = K.now(), key = range + ':' + Math.floor(now / 5000);
    if(history_cache[key]) return history_cache[key];
    const liveOnly = span <= 1800e3;
    const livePts = []; for(let i = 0; i < live.length; i += 2){ const t = marketTimeForTickIndex(live[i]); livePts.push([t, marketDisplayPrice(live[i + 1], live[i], adj), live[i]]); }
    let pts = [];
    if(!liveOnly){
      const rec = await loadRecent();
      if(span > 604800e3 || !isFinite(span)){ const h = await loadHourly(); if(h && rec){ const recStart = rec.b0 * rec.res; h.c.forEach((c, i) => { if((i + 1) * h.res - 1 < recStart) pts.push(...candlePoints(i, h.res, c)); }); } }
      if(rec) rec.c.forEach((c, i) => { pts.push(...candlePoints(rec.b0 + i, rec.res, c)); });
      const end = rec ? rec.end : -1; pts = pts.concat(livePts.filter(p => p[2] > end));
    } else pts = livePts;
    const from = isFinite(span) ? now - span : -Infinity;
    pts = pts.filter(p => p[0] >= from);
    if(pts.length < 2) pts = livePts.slice(-60);
    history_cache[key] = pts.map(p => [p[0], p[1]]); return history_cache[key];
  };
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
    const l = K.S.lots[i], proceeds = K.round2(l.q * price); K.S.lots.splice(i, 1); K.earn(proceeds, 'Sold $WEST'); K.touch('lots'); K.emit('stock');
    return { ok: true, msg: 'Sold for $' + proceeds.toFixed(2), proceeds, profit: K.round2(proceeds - l.q * l.p) };
  };
  mk.sellAll = function(){ if(!K.S.lots.length) return { ok: false, msg: 'Nothing to sell.' }; let tot = 0, profit = 0; K.S.lots.slice().forEach(l => { const r = mk.sell(l.id); if(r.ok){ tot += r.proceeds; profit += r.profit; } }); return { ok: true, msg: 'Sold everything for $' + tot.toFixed(2), proceeds: K.round2(tot), profit: K.round2(profit) }; };

  /* ---- admin: volatility + price shoves (rules only accept these from the admin account) ---- */
  mk.admin = {
    setVolatility: async level => { if(!K.cloud.isAdmin()) throw new Error('Admin only.'); if(MARKET_VOL_LEVELS[level] === undefined) throw new Error('Bad level.'); await K.cloud.db.ref('marketVolatility').push({ tickIndex: cp.tickIndex, level, at: K.now() }); },
    adjust: async (delta, fadeSec) => { if(!K.cloud.isAdmin()) throw new Error('Admin only.'); const o = { tickIndex: cp.tickIndex, delta, at: K.now() }; if(fadeSec > 0) o.fadeSec = fadeSec; await K.cloud.db.ref('marketAdjustments').push(o); },
    levels: () => Object.keys(MARKET_VOL_LEVELS)
  };
});
