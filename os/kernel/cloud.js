/* KERNEL · cloud — Firebase auth, saving/loading progress, the mailbox, broadcasts, the leaderboard and the admin tools.
 * Free-tier discipline (Spark plan: 10 GB/month download):
 *   - ONE read of the player's record at sign-in; after that only small, debounced writes of the fields that changed
 *   - no polling, no always-on listeners except two near-empty nodes (your mailbox, the market ledger)
 *   - guests never touch the player data nodes at all (nothing is saved or cached while signed out) */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG;
  const FIELDS = ['inv', 'lots', 'bank', 'mail', 'lab', 'games', 'shop', 'meta', 'factory'];      // money is not here any more: it lives in the ledger account (os/kernel/ledger.js)
  const GUARDED = ['inv', 'lots', 'bank', 'lab', 'games', 'factory'];                           // saved only together with a ledger revision (database.rules.json), so a stale save is refused whole
  const C = K.cloud = { db: null, auth: null, user: null, ready: false, bytes: 0, reads: 0, writes: 0 };
  C.signedIn = () => !!C.user && !C.user.isAnonymous;
  C.isAdmin = () => C.signedIn() && C.user.email === CFG.adminEmail && C.user.emailVerified !== false;
  const count = s => { try{ C.bytes += JSON.stringify(s.val()).length; C.reads++; }catch(e){} };

  /* ---- name filter ---- */
  const LEET = typeof LEET_MAP !== 'undefined' ? LEET_MAP : {}, BLOCK = typeof BLOCKED_TERMS !== 'undefined' ? BLOCKED_TERMS : [];
  K.nameOk = function(raw){
    const n = String(raw || '').trim();
    if(n.length < 2 || n.length > 20 || !/^[\p{L}\p{N} _.\-]+$/u.test(n)) return 'Names are 2–20 characters: letters, numbers, spaces, _ . -';
    const norm = n.toLowerCase().split('').map(c => LEET[c] || c).join('').replace(/[^a-z]/g, '');
    if(BLOCK.some(t => norm.includes(t.replace(/[^a-z]/g, '')))) return 'That name isn’t allowed.';
    return '';
  };

  /* ---- init ---- */
  let flushTimer = null, mailRef = null, lbAt = 0, lbLast = '';
  C.init = function(){
    if(typeof firebase === 'undefined'){ D.error('cloud.init', 'Firebase SDK did not load (blocked network / ad-blocker?) — sign-in and saving are unavailable'); C.ready = true; K.maint.attach(null); K.emit('auth'); return; }
    try{ firebase.initializeApp(CFG.firebase); C.db = firebase.database(); C.auth = firebase.auth(); }catch(e){ D.error('cloud.init', e); C.ready = true; K.maint.attach(null); K.emit('auth'); return; }
    K.maint.attach(C.db);                                                       // maintenance switches (one tiny node, public read)
    C.db.ref('.info/serverTimeOffset').on('value', s => { const v = s.val(); if(typeof v === 'number') K.offset = v; });   // local info, costs no bandwidth
    C.db.ref('.info/connected').on('value', s => { const v = !!s.val(); if(C.connected !== v) D.info('net', 'database connected=' + v); C.connected = v; });   // local info, costs no bandwidth
    C.auth.onAuthStateChanged(async u => {
      const was = C.user; C.user = u;
      if(u && !u.isAnonymous){ await C.load(); }
      else if(was && !was.isAnonymous){ K.reset(); K.loaded = false; stopMail(); }       // signed out → progress is gone from memory (nothing was cached)
      C.ready = true; K.emit('auth');
    });
  };
  C.ensureReadAccess = async function(){                                  // the media archive needs *a* session; an anonymous one is enough (never used for progress)
    if(!C.auth) return false; if(C.user) return true;
    try{ await C.auth.signInAnonymously(); return true; }catch(e){ return false; }
  };

  /* ---- load / save ---- */
  C.load = async function(){
    const uid = C.user.uid;
    claimTab();                                                                  // this window now owns the account; an older one saves and locks itself
    if(C.otherTabAtStart){ C.otherTabAtStart = false; await new Promise(r => setTimeout(r, 1200)); }   // …and we give it a moment to finish saving before we read
    try{
      const st = await K.ledger.start(uid);                                       // the account, the economy's epoch/config, bills, loans, inbox
      const snap = await C.db.ref('players/' + uid).once('value'); count(snap);
      let remote = snap.val();
      if(remote && !st.offline && (!remote.meta || remote.meta.ep !== K.ledger.epoch.n)){ const keep = remote.meta && remote.meta.name, prefs = remote.prefs; remote = keep || prefs ? { meta: { name: keep || '' }, prefs } : null; }   // progress from before the last economy reset is gone; the name and settings stay
      if(remote){ K.adopt(remote); K.emit('loaded', { existing: true }); }
      else { K.adopt(Object.assign({}, K.S)); FIELDS.forEach(f => K.dirty.add(f)); K.emit('loaded', { existing: false }); }   // first sign-in: the guest session becomes the account
      if(!st.offline && K.S.meta.ep !== K.ledger.epoch.n){ K.S.meta.ep = K.ledger.epoch.n; K.dirty.add('meta'); }
      if(st.offline) K.emit('notify', { app: 'Settings', title: 'Economy not started', body: 'The new WestEconomy has not been started yet, so nothing is saved right now. The admin can start it in Settings → Economy.' });
      K.loaded = true;
      loadPrefsFromCloud(remote && remote.prefs);
      startMail(); loadBroadcasts(); C.flushNow(); K.emit('ready');
    }catch(e){ D.error('cloud.load', e, { code: e && e.code, uid: C.user && C.user.uid ? String(C.user.uid).slice(0, 6) + '…' : null }); K.emit('notify', { app: 'WestReport', title: 'Sync problem', body: 'Couldn’t load your saved progress' + (e && e.code ? ' (' + e.code + ')' : '') + '. Progress will not be saved until this works — please send a bug report.' }); }
  };
  /* flushNow resolves to TRUE when everything that was pending is safely on the server (or nothing was pending) and FALSE when it could not be saved.
   * Anything that deletes or moves something on the server because of local money (Market payouts, listings) waits for TRUE before it does.
   * Failure handling (all of it loud — see os/diag.js — and visible in a bug report via C.lastErr / C.badFields):
   *   - the save is ONE atomic update, so a single field the server rejects used to block every other field forever ("still saving").
   *     On a rejection we now re-send field by field (cash+arcade together, because the arcade rule checks the cash movement), so everything the
   *     server accepts is saved, and only the rejected field(s) stay pending — named in the error, retried slowly instead of hammered.
   *   - the SDK throws SYNCHRONOUSLY for undefined/NaN values; that is caught here (it used to leave "saving…" on and drop the dirty flags).
   *   - an error while publishing the leaderboard record is no longer mistaken for a failed save. */
  const D = K.diag || { error(){}, warn(){}, info(){}, summarize: x => x };
  let retryMs = 0, retryT = null, lastWarn = 0, lastSkip = 0; C.lastErr = null; C.badFields = {}; C.connected = null;
  const sizesOf = o => { const r = {}; Object.keys(o).forEach(k => { try{ r[k] = JSON.stringify(o[k]).length; }catch(_){ r[k] = -1; } }); return r; };
  let inflight = Promise.resolve(true);
  C.flushNow = function(extra){ const p = inflight.then(() => doFlush(extra)); inflight = p.catch(() => false); return p; };       // saves never overlap: each one is built on the revision the previous one produced
  function doFlush(extra){
    clearTimeout(flushTimer); flushTimer = null; const Lg = K.ledger;
    if(!K.dirty.size && !extra) return Promise.resolve(true);
    if(K.sessionLost || !C.signedIn() || !K.loaded || !C.db || Lg.offline){
      if(C.signedIn() && Date.now() - lastSkip > 30000){ lastSkip = Date.now(); D.warn('cloud.flush', 'save skipped — ' + (K.sessionLost ? 'another window owns the account' : Lg.offline ? 'the new economy has not been started' : !K.loaded ? 'your saved progress never finished loading' : 'no database connection') + ' · pending: ' + [...K.dirty].join(',')); }
      return Promise.resolve(false);                                                  // a window that lost the session never writes: its numbers are older than the other window's
    }
    let out = {}, paths = {}, node = null; const u = C.user.uid;
    try{
      K.dirty.forEach(f => { if(f === 'prefs') out.prefs = clean(K.prefs); else if(FIELDS.includes(f)) out[f] = clean(K.S[f]); });
      const keys = Object.keys(out); Object.keys(out).forEach(f => { paths['players/' + u + '/' + f] = out[f]; });
      if(K.dirty.has('cash') || K.dirty.has('acct') || keys.some(f => GUARDED.includes(f)) || extra){ node = Lg.stamp(); paths['eco/acct/' + u] = node; }
      paths['players/' + u + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP; if(extra) Object.assign(paths, extra);
    }catch(e){ D.error('cloud.flush.build', e, { dirty: [...K.dirty], probe: D.probe ? D.probe() : null }); return Promise.resolve(false); }     // nothing was cleared: it stays pending
    if(K.dirty.has('cash') || K.dirty.has('inv') || K.dirty.has('lots') || extra) K.dirty.add('lb');
    const fields = Object.keys(out).concat(node ? ['acct'] : []); K.dirty.clear();
    C.writes++; K.emit('sync', 'saving'); return send(paths, fields, node);
  }
  function send(paths, fields, node){
    let p; const wd = setTimeout(() => { D.warn('cloud.save', 'save still pending after 15 s · online=' + navigator.onLine + ' · connected=' + C.connected + ' · fields: ' + fields.join(',')); K.emit('sync', 'slow'); }, 15000);
    try{ p = C.db.ref().update(paths); }catch(e){ clearTimeout(wd); return failed(e, paths, fields, node); }   // the SDK throws synchronously for undefined / NaN
    return p.then(() => { clearTimeout(wd); if(node) K.ledger.confirm(node); saved(); return true; }, e => { clearTimeout(wd); return failed(e, paths, fields, node); });
  }
  function saved(){ retryMs = 0; C.lastErr = null; C.badFields = {}; K.emit('sync', 'saved'); try{ publishBoard(); }catch(e){ D.error('cloud.publishBoard', e); } }
  async function failed(e, paths, fields, node){
    const code = (e && e.code) || '', msg = (e && e.message) || String(e);
    D.error('cloud.save', e, { code, fields, bytes: sizesOf(paths), online: navigator.onLine, connected: C.connected });
    if(node && /permission|denied/i.test(code + ' ' + msg)){                                  // a revision clash (the world server charged you a bill, or another window wrote first) is merged, not fatal
      const why = await K.ledger.resync(); if(why === 'merged'){ fields.forEach(f => K.dirty.add(f === 'acct' ? 'cash' : f)); retryMs = 0; clearTimeout(retryT); retryT = setTimeout(C.flushNow, 400); return false; } }
    if(!node && fields.length > 1 && /permission|denied|validation|invalid/i.test(code + ' ' + msg)) return isolateLight(paths, fields);
    return giveUp(fields, code, msg);
  }
  function giveUp(fields, code, msg){
    fields.forEach(f => K.dirty.add(f === 'acct' ? 'cash' : f)); C.lastErr = { t: Date.now(), code, msg: String(msg).slice(0, 160), fields: fields.slice() }; K.emit('sync', 'error');
    retryMs = Math.min(30000, (retryMs || 2000) * 2); clearTimeout(retryT); retryT = setTimeout(C.flushNow, retryMs);          // keep trying (4 s, 8 s … 30 s) instead of silently giving up
    if(Date.now() - lastWarn > 60000){ lastWarn = Date.now(); K.emit('notify', { app: 'Settings', title: 'Couldn’t save', body: 'Your latest progress isn’t saved yet — retrying. Keep this window open. If this keeps happening, use “Report a bug” (the details are attached automatically).' }); }
    return Promise.resolve(false);
  }
  async function isolateLight(paths, fields){                                          // only for the light fields (mail, prefs, meta…): one refused field must not block the others
    const bad = {}; let ok = 0;
    for(const f of fields){ const k = Object.keys(paths).find(x => x.endsWith('/' + f)); if(!k) continue; try{ await C.db.ref(k).set(paths[k]); ok++; }catch(e){ bad[f] = { code: (e && e.code) || '', msg: String((e && e.message) || e).slice(0, 120) }; D.error('cloud.save.field', e, { fields: [f], code: bad[f].code }); } }
    const badF = Object.keys(bad); if(!badF.length){ saved(); return true; }
    C.badFields = bad; badF.forEach(f => K.dirty.add(f)); C.lastErr = { t: Date.now(), code: bad[badF[0]].code, msg: 'server rejected ' + badF.join(', '), fields: badF }; K.emit('sync', 'error');
    retryMs = Math.min(120000, Math.max(15000, (retryMs || 7500) * 2)); clearTimeout(retryT); retryT = setTimeout(C.flushNow, retryMs);
    if(Date.now() - lastWarn > 120000){ lastWarn = Date.now(); K.emit('notify', { app: 'WestReport', title: 'Part of your progress isn’t saving', body: 'The server refused: ' + badF.join(', ') + '. Everything else is saved. Please send a bug report — the details are attached automatically.' }); }
    return false;
  }
  const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x)) ? 0 : x));    // drops undefined, fixes NaN
  /* Money and items are saved quickly (cashSyncMs); cosmetic things (mail, prefs, meta) ride the slow 20 s batch. */
  const URGENT = new Set(['cash', 'acct', 'inv', 'lots', 'factory', 'lab', 'shop', 'bank']); let flushDue = 0;
  K.on('dirty', () => {
    if(!C.signedIn() || !K.loaded || K.sessionLost) return;
    const urgent = [...K.dirty].some(f => URGENT.has(f)), delay = urgent ? (CFG.cashSyncMs || 3000) : CFG.syncDebounceMs, due = Date.now() + delay;
    if(flushTimer && flushDue <= due) return;                                  // an earlier (or equal) save is already queued
    clearTimeout(flushTimer); flushDue = due; flushTimer = setTimeout(C.flushNow, delay);
  });
  document.addEventListener('visibilitychange', () => { if(document.hidden) C.flushNow(); });
  window.addEventListener('pagehide', () => C.flushNow()); window.addEventListener('beforeunload', () => C.flushNow());

  /* ---- ONE active window per browser ----
   * Each open copy of the site keeps its own copy of your money and saves the whole balance, so with two windows the one that saves last wins and
   * the other's earnings vanish ("my money randomly changed"). The newest window takes over; any older one saves what it has, then locks itself. */
  const TAB_KEY = 'westos_active', TAB_ID = Math.random().toString(36).slice(2); let beat = null;
  const readTab = () => { try{ return JSON.parse(localStorage.getItem(TAB_KEY) || 'null'); }catch(e){ return null; } };
  const claimTab = () => { try{ localStorage.setItem(TAB_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() })); }catch(e){} };
  { const o = readTab(); C.otherTabAtStart = !!(o && o.id !== TAB_ID && Date.now() - o.t < 6000); }
  claimTab();
  function lostSession(){
    if(K.sessionLost || !C.signedIn()) return;                                 // guests have nothing saved, so nothing to protect
    C.flushNow(); K.sessionLost = true; clearInterval(beat); clearTimeout(flushTimer); K.emit('session', 'lost');
  }
  function checkTab(){ const cur = readTab(); if(cur && cur.id !== TAB_ID) lostSession(); else if(!K.sessionLost) claimTab(); }
  beat = setInterval(checkTab, 2500);
  window.addEventListener('storage', e => { if(e.key === TAB_KEY) checkTab(); });      // re-reads the stored value instead of trusting the event, so two tabs opened together don't both lock
  C.claimWindow = claimTab;

  /* ---- UI preferences (not progress, so they are kept in localStorage for everyone; signed-in users also sync them) ---- */
  const PREF_KEY = 'westos_ui';
  const PREF_DEFAULT = { dockMode: 'float', theme: 'auto', skin: 'auto', seasonal: true, accent: '', skinFx: true, wall: { light: null, dark: null }, lock: false, banners: true, reduceMotion: false, reduceTransparency: false, layout: null, dock: [], winGeom: {}, iconSize: 'medium', clock24: false, clockSeconds: false, updateSpeed: 'balanced' };
  /* Firebase turns arrays into objects (and drops empty ones), so anything read back must be coerced into the shape the shell expects — otherwise
     `prefs.dock.length` / `seenApps.includes` throw ("Cannot read properties of undefined (reading 'length')"). */
  const asArr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const normPrefs = P => {
    P.dock = asArr(P.dock).filter(x => typeof x === 'string'); P.seenApps = asArr(P.seenApps).filter(x => typeof x === 'string');
    if(P.layout != null){ const l = asArr(P.layout).filter(x => x && typeof x === 'object'); P.layout = l.length ? l : null; }
    if(!P.winGeom || typeof P.winGeom !== 'object' || Array.isArray(P.winGeom)) P.winGeom = {};
    P.wall = Object.assign({ light: null, dark: null }, (P.wall && typeof P.wall === 'object') ? P.wall : {});
    if(!['float', 'low', 'hide'].includes(P.dockMode)) P.dockMode = 'float';
    return P;
  };
  try{
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if(stored.device !== undefined){ delete stored.device; stored.dock = []; stored.layout = null; stored.lock = false; delete stored.wallBlur; }     // settings from the earlier tablet-style layout: start the desktop fresh
    K.prefs = Object.assign({}, PREF_DEFAULT, stored);
  }catch(e){ K.prefs = Object.assign({}, PREF_DEFAULT); }
  normPrefs(K.prefs);
  K.setPref = function(k, v){
    K.prefs[k] = v; try{ localStorage.setItem(PREF_KEY, JSON.stringify(K.prefs)); }catch(e){}
    K.emit('prefs', k); if(C.signedIn() && K.loaded){ K.dirty.add('prefs'); K.emit('dirty'); }
  };
  function loadPrefsFromCloud(p){ if(!p || typeof p !== 'object') return; K.prefs = normPrefs(Object.assign({}, K.prefs, p)); try{ localStorage.setItem(PREF_KEY, JSON.stringify(K.prefs)); }catch(e){} K.emit('prefs', '*'); }

  /* ---- auth actions ---- */
  C.signInGoogle = async () => { const p = new firebase.auth.GoogleAuthProvider(); const r = await C.auth.signInWithPopup(p); return r.user; };
  C.signInEmail = async (email, pw, create) => { const r = create ? await C.auth.createUserWithEmailAndPassword(email, pw) : await C.auth.signInWithEmailAndPassword(email, pw); return r.user; };
  C.signOut = async () => { await C.flushNow(); await C.auth.signOut(); };
  C.resetPassword = email => C.auth.sendPasswordResetEmail(email);

  /* ---- mailbox (admin → player) + broadcasts (admin → everyone) ---- */
  function startMail(){
    if(mailRef) return; mailRef = C.db.ref('mailbox/' + C.user.uid);
    mailRef.on('child_added', s => {
      const m = s.val(); count(s); if(!m) return;
      K.mailAdd({ id: 'srv-' + s.key, from: String(m.from || 'Mr West').slice(0, 30), subj: String(m.subj || '').slice(0, 120), body: String(m.body || '').slice(0, 1000), kind: 'admin' });
      s.ref.remove().catch(e => D.warn('cloud.mailbox', 'could not delete a delivered message: ' + (e && e.code || e)));
    }, e => D.error('cloud.mailbox', e));
  }
  function stopMail(){ if(mailRef){ mailRef.off(); mailRef = null; } }
  async function loadBroadcasts(){
    try{
      const snap = await C.db.ref('broadcast').orderByKey().limitToLast(5).once('value'); count(snap); const v = snap.val() || {}; let last = K.S.meta.lastBroadcast || 0;
      Object.keys(v).sort().forEach(k => { const b = v[k]; if(b && b.t > last){ K.mailAdd({ id: 'bc-' + k, from: String(b.from || 'Mr West').slice(0, 30), subj: String(b.subj || '').slice(0, 120), body: String(b.body || '').slice(0, 1000), kind: 'admin' }); last = Math.max(last, b.t); } });
      if(last !== K.S.meta.lastBroadcast){ K.S.meta.lastBroadcast = last; K.touch('meta'); }
    }catch(e){}
  }

  /* ---- leaderboard (public, tiny) ----
   * One small record per player (~170 bytes): name + the numbers every ranking is built from. It is rewritten only when a number changed, at most every
   * CFG.leaderboardEveryMs (and right after a save), and a ranking is ONE query of at most 50 rows per category (cached 30 s by the Leaderboard app). */
  const LB = C.LB = [
    { id: 'nw',    field: 'nw',    name: 'Net worth',   unit: 'money', glyph: 'star',   color: '#d9a441', desc: 'Everything you own, added up' },
    { id: 'cash',  field: 'value', name: 'Bank',        unit: 'money', glyph: 'bank',   color: '#4a6fa8', desc: 'Cash in your bank account' },
    { id: 're',    field: 're',    name: 'Real estate', unit: 'money', glyph: 'home',   color: '#c98a62', desc: 'Value of the property you own' },
    { id: 'stk',   field: 'stk',   name: 'Stocks',      unit: 'money', glyph: 'stocks', color: '#3fae78', desc: 'Your $WEST shares at today’s price' },
    { id: 'inv',   field: 'inv',   name: 'Inventory',   unit: 'money', glyph: 'shop',   color: '#e8b64f', desc: 'Elements and compounds you hold' },
    { id: 'disc',  field: 'disc',  name: 'Discoveries', unit: 'count', glyph: 'flask',  color: '#52b5b0', desc: 'Compounds discovered in WestLab' },
    { id: 'runs',  field: 'runs',  name: 'Reactions',   unit: 'count', glyph: 'bolt',   color: '#e8803d', desc: 'Reactions run in WestLab' },
    { id: 'props', field: 'props', name: 'Properties',  unit: 'count', glyph: 'key',    color: '#a08a6a', desc: 'Properties you own' },
    { id: 'fac',   field: 'fac',   name: 'Factory',     unit: 'rate',  glyph: 'factory', color: '#c96a4a', desc: 'Molecules your factory makes per minute' },
    { id: 'made',  field: 'made',  name: 'Produced',    unit: 'count', glyph: 'flask',  color: '#5a8fd6', desc: 'Molecules your factory has made in total' },
    { id: 'els',   field: 'els',   name: 'Elements',    unit: 'count', glyph: 'grid',   color: '#9b7bff', desc: 'Different elements collected' }
  ];
  C.boardEntry = function(){                                         // the live numbers for THIS player (also used by the app to show "you" without waiting on the server)
    const S = K.S, r2 = K.round2;
    return { name: S.meta.name || '', value: r2(K.ledger.acct.b / 100), nw: r2(K.netWorth()), re: r2(K.propValue()), stk: r2(K.stockValue ? K.stockValue() : 0), inv: r2(K.inventoryValue()),
      disc: S.lab.found.length, runs: S.lab.runs || 0, props: Object.keys(K.ledger.mine || {}).length, els: Object.keys(S.inv.e).length,
      fac: r2(((S.factory && S.factory.lines) || []).reduce((s, l) => s + (l && l.on ? (+l.rate || 0) : 0), 0)), made: Math.floor((S.factory && S.factory.made) || 0), ...(K.ledger.og ? { og: 1 } : {}) };
  };
  function publishBoard(force){
    if(!C.signedIn() || !K.S.meta.name) return;
    let e, sig; try{ e = C.boardEntry(); Object.keys(e).forEach(k => { if(typeof e[k] === 'number' && !isFinite(e[k])) e[k] = 0; }); sig = JSON.stringify(e); }
    catch(err){ D.error('cloud.boardEntry', err, { probe: D.probe ? D.probe() : null }); return; }                // never lets a broken leaderboard record look like a failed save
    const now = Date.now();
    if(force ? (now - lbAt < 4000 && sig === lbLast) : (now - lbAt < CFG.leaderboardEveryMs || sig === lbLast)) return;
    lbAt = now; lbLast = sig; e.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    try{ return C.db.ref('leaderboard/' + C.user.uid).set(e).catch(err => { lbLast = ''; D.error('cloud.publishBoard', err, { code: err && err.code, entry: D.summarize ? D.summarize(e) : undefined }); }); }
    catch(err){ lbLast = ''; D.error('cloud.publishBoard', err, { entry: D.summarize ? D.summarize(e) : undefined }); }
  }
  C.publishBoard = publishBoard;
  C.setName = async function(name){
    const err = K.nameOk(name); if(err) throw new Error(err);
    K.S.meta.name = name.trim(); K.touch('meta'); await C.flushNow(); publishBoard(true);
  };
  /* Every player's record in ONE read (no per-field index, so nobody is skipped). Records saved by older versions may lack newer stats
   * (fac, made, els, ...), so every missing/invalid number counts as 0 instead of dropping that player from the board. */
  C.leaderboardRaw = async function(){
    if(!C.db) return [];
    const s = await C.db.ref('leaderboard').limitToLast(1000).once('value'); count(s); const out = [];
    s.forEach(c => {
      const v = c.val(); if(!v || typeof v !== 'object' || typeof v.name !== 'string' || !v.name) return;
      const r = Object.assign({ uid: c.key }, v);
      LB.forEach(cat => { const x = +r[cat.field]; r[cat.field] = isFinite(x) ? x : 0; });
      out.push(r);
    });
    return out;
  };
  C.leaderboard = async function(n, field){                           // top n by one field (default: bank cash, which the admin tools use)
    field = field || 'value'; const rows = await C.leaderboardRaw();
    rows.forEach(r => { const x = +r[field]; r[field] = isFinite(x) ? x : 0; });
    return rows.sort((a, b) => b[field] - a[field]).slice(0, n || 20);
  };

  /* ---- Files app: a read-only view of exactly what the server stores for you ---- */
  C.serverRecord = async function(uid){
    if(!C.signedIn()) return null; const id = uid && C.isAdmin() ? uid : C.user.uid;
    const s = await C.db.ref('players/' + id).once('value'); count(s); return s.val();
  };

  /* ---- WestLab discovery registry (create-only: the first discoverer is recorded, nothing can be overwritten) ---- */
  C.discover = async function(id, info){
    if(!C.db || !C.signedIn()) return { first: false };
    try{
      const ref = C.db.ref('labCache/' + id.replace(/[.#$\[\]\/]/g, '_'));
      const r = await ref.transaction(cur => cur === null ? Object.assign({ by: K.S.meta.name || 'anonymous', t: firebase.database.ServerValue.TIMESTAMP }, info) : undefined);
      return { first: !!r.committed };
    }catch(e){ return { first: false }; }
  };


  /* ---- WestLab reaction library: clients only submit the INPUTS of a reaction they just calculated (reagents, T, P, equipment).
   *      A GitHub Action recomputes every submission with the same engine and commits the verified result to lab-cache/reactions/. Create-only. ---- */
  C.submitReaction = function(id, a){
    if(!C.db || !C.signedIn()) return;
    const rec = { r: (a.keys || []).slice(0, 4).map(String), g: a.target ? String(a.target).slice(0, 60) : '', T: Math.round(a.T), P: +a.P || 1, c: a.cat ? 1 : 0, e: a.elec ? 1 : 0, i: a.ign ? 1 : 0, t: firebase.database.ServerValue.TIMESTAMP };
    C.db.ref('labSubmit/' + id).transaction(cur => cur === null ? rec : undefined).catch(() => {});
  };

  /* ---- admin (every call is also enforced by database.rules.json — hiding buttons is not the security) ---- */
  const A = C.admin = {};
  /* ---- WestReport: bug reports (anyone signed in can file one; only the admin can read, triage and export them) ---- */
  const AREAS = 60, clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, n);
  C.report = {
    async submit(r){
      if(!C.signedIn()) throw new Error('Sign in to send a report.'); if(!C.db) throw new Error('Offline — try again in a moment.');
      const kind = r.kind === 'feature' ? 'feature' : 'bug';
      const o = { kind, uid: C.user.uid, name: clip(K.S.meta.name || (C.user.email || '').split('@')[0] || 'Player', 30), title: clip(r.title, 100), area: clip(r.area, AREAS), sev: ['low', 'medium', 'high', 'critical'].includes(r.sev) ? r.sev : 'medium', desc: clip(r.desc, 2000), status: kind === 'feature' ? 'pending' : 'open', t: firebase.database.ServerValue.TIMESTAMP };
      if(o.title.length < 3 || o.desc.length < 10) throw new Error(kind === 'feature' ? 'Add a short title and describe the feature.' : 'Add a short title and describe what went wrong.');
      const st = clip(r.steps, 1500), ex = clip(r.expected, 1000), cx = clip(r.ctx, 4000); if(st) o.steps = st; if(ex) o.expected = ex; if(cx) o.ctx = cx;
      await C.db.ref('reports').push(o);
    },
    async list(){ if(!C.isAdmin()) throw new Error('Admin only.'); const s = await C.db.ref('reports').orderByChild('t').limitToLast(300).once('value'); count(s); const out = []; s.forEach(c => { out.push(Object.assign({ id: c.key }, c.val())); }); return out.reverse(); },
    async setStatus(id, st){ if(!C.isAdmin()) throw new Error('Admin only.'); if(!['open', 'fixed', 'wontfix', 'pending', 'approved', 'rejected', 'done'].includes(st)) return; await C.db.ref('reports/' + id + '/status').set(st); },
    async remove(id){ if(!C.isAdmin()) throw new Error('Admin only.'); await C.db.ref('reports/' + id).remove(); }
  };
  const need = () => { if(!C.isAdmin()) throw new Error('Admin only.'); };
  A.players = async () => { need(); return C.leaderboard(200); };
  A.read = async uid => { need(); const s = await C.db.ref('players/' + uid).once('value'); count(s); return s.val(); };
  A.setField = async (uid, path, v) => { need(); await C.db.ref('players/' + uid + '/' + path).set(v); };
  A.reset = async uid => { need();
    /* the account is RETIRED, never just deleted: deleting eco/acct/<uid> or eco/inbox/<uid> destroys its s/r/sys counters and any money in flight and breaks the ledger audit
     * (the world server then refuses to run). Economy.retire() claims the inbox, pays the cash back into the pool and folds the counters into eco/dead — all in ONE update. */
    const db = C.db, [as, is, ds] = await Promise.all(['eco/acct/' + uid, 'eco/inbox/' + uid, 'eco/dead'].map(p => db.ref(p).once('value')));
    const upd = { ['players/' + uid]: null, ['leaderboard/' + uid]: null, ['eco/acct/' + uid]: null, ['eco/inbox/' + uid]: null, ['eco/bill/' + uid]: null, ['eco/loan/' + uid]: null,
      ['world/home/' + uid]: null, ['world/plot/' + uid]: null, ['world/lic/' + uid]: null, ['world/build/' + uid]: null, ['world/loc/' + uid]: null };
    if(as.val()){ const tmp = { eco: { acct: { [uid]: as.val() }, inbox: is.val() ? { [uid]: is.val() } : {}, dead: ds.val() || { sys: {}, s: 0, r: 0 } } }; Economy.retire(tmp, uid);
      upd['eco/dead/sys'] = tmp.eco.dead.sys; upd['eco/dead/s'] = tmp.eco.dead.s; upd['eco/dead/r'] = tmp.eco.dead.r; }
    else if(is.val()){ throw new Error('That player has money waiting in an inbox but no account — fix the ledger first (the world server repairs it on its next run).'); }
    await db.ref().update(upd);
    const hs = (await db.ref('world/own').orderByChild('o').equalTo(uid).once('value')).val() || {}; for(const id of Object.keys(hs)){ await db.ref('world/own/' + id).update({ o: 'bank', on: 'City', a: 0, rh: 0, t: '', tn: '', ts: 0, th: 0 }); } };       // their money returns to the pool, their houses to the city

  /* ---------- the WestEconomy: start / reset, settings, audit (see os/lib/economy.js, os/lib/eco-sim.js) ---------- */
  A.ecoStatus = async () => { need(); const [st, cfg, ep] = await Promise.all(['eco/stats', 'eco/cfg', 'eco/epoch'].map(p => C.db.ref(p).once('value'))); return { stats: st.val(), cfg: Economy.cfgOf({ eco: { cfg: cfg.val() || {} } }), epoch: ep.val() }; };
  A.ecoStart = async confirm => {
    need(); if(confirm !== 'RESET') throw new Error('Type RESET to confirm.'); const now = Date.now(), og = {};
    for(const p of ['players', 'leaderboard']){ try{ const s = await C.db.ref(p).once('value'); Object.keys(s.val() || {}).forEach(u => { og[u] = true; }); }catch(e){} }       // everyone who already played is an OG player
    const prev = (await C.db.ref('eco/epoch').once('value')).val(), db = { eco: { epoch: prev } }; EcoSim.genesis(db, now, Object.keys(og));
    const upd = { eco: JSON.parse(JSON.stringify(db.eco)), world: JSON.parse(JSON.stringify(db.world)), players: null, leaderboard: null, labCache: null, labSubmit: null, 'market/listings': null, 'market/proceeds': null };
    await C.db.ref().update(upd); return { houses: Object.keys(db.world.own).length, bots: Object.keys(db.eco.bots).length, og: Object.keys(og).length, epoch: db.eco.epoch.n };
  };
  A.ecoCfg = async patch => { need(); const lim = { taxBp: [0, 3000], dutyBp: [0, 2000], propTaxBpDay: [0, 100], rentBpDay: [1, 100], wealthFree: [0, 1e13], loanMax: [100000, 1e10], startGrant: [0, 1e9], ogExtra: [0, 1e9], poolDaily: [1e5, 1e11], lateBpDay: [0, 2000], graceHours: [1, 720], sellBp: [5000, 10000], buildBp: [1000, 20000], earnPerDay: [100000, 1e11], earnSlack: [0, 1e9], licFee: [0, 1e10], licDays: [1, 365], plotFee: [0, 1e11], labFee: [0, 1e11], maxAcct: [1e9, 5e15], marketFeeBp: [0, 5000], buildMarkupBp: [10000, 30000], homelessPoolDiv: [1, 1000] }, cur = (await C.db.ref('eco/cfg').once('value')).val() || {};
    Object.keys(patch || {}).forEach(k => { if(!lim[k]) return; const v = Math.round(+patch[k]); if(isFinite(v) && v >= lim[k][0] && v <= lim[k][1]) cur[k] = v; }); await C.db.ref('eco/cfg').set(cur); return cur; };
  A.ecoAudit = async () => { need(); const s = await C.db.ref('eco').once('value'); return Economy.audit({ eco: s.val() || {} }); };
  A.rename = async (uid, name) => { need(); const err = K.nameOk(name); if(err) throw new Error(err); await C.db.ref('players/' + uid + '/meta/name').set(name); await C.db.ref('leaderboard/' + uid + '/name').set(name); };
  A.mail = async (uid, subj, body) => { need(); await C.db.ref('mailbox/' + uid).push({ from: 'Mr West', subj: String(subj).slice(0, 120), body: String(body).slice(0, 1000), t: firebase.database.ServerValue.TIMESTAMP }); };
  A.arcadeSet = async c => { need(); const n = (v, lo, hi, d) => { v = +v; return isFinite(v) && v >= lo && v <= hi ? v : d; }, g = c.games || {};
    await C.db.ref('arcadeConfig').set({ enabled: c.enabled !== false, games: { slots: g.slots !== false, bus: g.bus !== false, poker: g.poker !== false, blackjack: g.blackjack !== false }, betPct: n(c.betPct, 0.001, 1, 0.1), betCap: Math.round(n(c.betCap, 1, 1e9, 25000)), minBet: Math.round(n(c.minBet, 1, 1e6, 1)), dailyCap: Math.round(n(c.dailyCap, 0, 1e12, 100000)), cooldownMs: Math.round(n(c.cooldownMs, 0, 600000, 1500)), maxMult: n(c.maxMult, 1, 1000, 100) }); };
  A.maintSet = async c => { need(); c = c || {};
    const apps = {}, sys = {}; (Array.isArray(c.apps) ? c.apps : []).forEach(id => { if(/^[A-Za-z0-9]{1,24}$/.test(String(id))) apps[String(id)] = true; }); (Array.isArray(c.sys) ? c.sys : []).forEach(k => { if(/^[a-z]{1,16}$/.test(String(k))) sys[String(k)] = true; });
    const o = { all: !!c.all, msg: clip(c.msg, 160), t: firebase.database.ServerValue.TIMESTAMP }; if(Object.keys(apps).length) o.apps = apps; if(Object.keys(sys).length) o.sys = sys;
    await C.db.ref('maintenance').set(o); };
  A.broadcast = async (subj, body) => { need(); await C.db.ref('broadcast').push({ from: 'Mr West', subj: String(subj).slice(0, 120), body: String(body).slice(0, 1000), t: firebase.database.ServerValue.TIMESTAMP }); };
});
