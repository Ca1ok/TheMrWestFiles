/* KERNEL · cloud — Firebase auth, saving/loading progress, the mailbox, broadcasts, the leaderboard and the admin tools.
 * Free-tier discipline (Spark plan: 10 GB/month download):
 *   - ONE read of the player's record at sign-in; after that only small, debounced writes of the fields that changed
 *   - no polling, no always-on listeners except two near-empty nodes (your mailbox, the market ledger)
 *   - guests never touch the player data nodes at all (nothing is saved or cached while signed out) */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG;
  const FIELDS = ['cash', 'inv', 'lots', 'props', 'bank', 'mail', 'lab', 'games', 'shop', 'meta', 'factory'];
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
    if(typeof firebase === 'undefined'){ C.ready = true; K.maint.attach(null); K.emit('auth'); return; }
    try{ firebase.initializeApp(CFG.firebase); C.db = firebase.database(); C.auth = firebase.auth(); }catch(e){ console.warn('[cloud] firebase unavailable', e); C.ready = true; K.maint.attach(null); K.emit('auth'); return; }
    K.maint.attach(C.db);                                                       // maintenance switches (one tiny node, public read)
    C.db.ref('.info/serverTimeOffset').on('value', s => { const v = s.val(); if(typeof v === 'number') K.offset = v; });   // local info, costs no bandwidth
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
      const snap = await C.db.ref('players/' + uid).once('value'); count(snap);
      const remote = snap.val();
      if(remote){ K.adopt(remote); K.emit('loaded', { existing: true }); }
      else { K.adopt(Object.assign({}, K.S)); FIELDS.forEach(f => K.dirty.add(f)); K.emit('loaded', { existing: false }); }   // first sign-in: the guest session becomes the account
      K.loaded = true;
      loadPrefsFromCloud(remote && remote.prefs);
      startMail(); loadBroadcasts(); C.flushNow(); K.emit('ready');
    }catch(e){ console.warn('[cloud] load failed', e); K.emit('notify', { app: 'Settings', title: 'Sync problem', body: 'Couldn’t load your saved progress. Progress will not be saved until this works.' }); }
  };
  /* flushNow resolves to TRUE when everything that was pending is safely on the server (or nothing was pending) and FALSE when it could not be saved.
   * Anything that deletes or moves something on the server because of local money (Market payouts, listings) waits for TRUE before it does. */
  let retryMs = 0, retryT = null, lastWarn = 0;
  C.flushNow = function(){
    clearTimeout(flushTimer); flushTimer = null;
    if(!K.dirty.size) return Promise.resolve(true);
    if(K.sessionLost || !C.signedIn() || !K.loaded || !C.db) return Promise.resolve(false);   // a window that lost the session never writes: its numbers are older than the other window's
    const out = {}; K.dirty.forEach(f => { if(f === 'prefs') out.prefs = K.prefs; else if(f === 'arcade'){ const L = K.S.arcade, t = K.now(), d = t - (t % 86400000); if(L.d !== d){ L.d = d; L.net = 0; } out.arcade = { d: L.d, net: L.net, open: L.open, t: firebase.database.ServerValue.TIMESTAMP }; } else if(FIELDS.includes(f)) out[f] = clean(K.S[f]); });
    if(K.dirty.has('cash') || K.dirty.has('inv') || K.dirty.has('lots') || K.dirty.has('props')) K.dirty.add('lb');
    out.updatedAt = firebase.database.ServerValue.TIMESTAMP; K.dirty.clear();
    C.writes++; K.emit('sync', 'saving');
    return C.db.ref('players/' + C.user.uid).update(out).then(() => { retryMs = 0; K.emit('sync', 'saved'); publishBoard(); return true; }).catch(e => {
      console.warn('[cloud] save failed', e); K.emit('sync', 'error'); Object.keys(out).forEach(f => K.dirty.add(f));
      retryMs = Math.min(30000, (retryMs || 2000) * 2); clearTimeout(retryT); retryT = setTimeout(C.flushNow, retryMs);          // keep trying (4 s, 8 s … 30 s) instead of silently giving up
      if(Date.now() - lastWarn > 60000){ lastWarn = Date.now(); K.emit('notify', { app: 'Settings', title: 'Couldn’t save', body: 'Your latest progress isn’t saved yet — retrying. Keep this window open.' }); }
      return false;
    });
  };
  const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x)) ? 0 : x));    // drops undefined, fixes NaN
  /* Money and items are saved quickly (cashSyncMs); cosmetic things (mail, prefs, meta) ride the slow 20 s batch. */
  const URGENT = new Set(['cash', 'inv', 'lots', 'props', 'factory', 'lab', 'shop', 'bank']); let flushDue = 0;
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
  const PREF_DEFAULT = { theme: 'auto', wall: { light: null, dark: null }, lock: false, banners: true, reduceMotion: false, reduceTransparency: false, layout: null, dock: [], winGeom: {}, iconSize: 'medium', clock24: false, clockSeconds: false, updateSpeed: 'balanced' };
  try{
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if(stored.device !== undefined){ delete stored.device; stored.dock = []; stored.layout = null; stored.lock = false; delete stored.wallBlur; }     // settings from the earlier tablet-style layout: start the desktop fresh
    K.prefs = Object.assign({}, PREF_DEFAULT, stored);
  }catch(e){ K.prefs = Object.assign({}, PREF_DEFAULT); }
  K.prefs.wall = Object.assign({ light: null, dark: null }, K.prefs.wall);
  K.setPref = function(k, v){
    K.prefs[k] = v; try{ localStorage.setItem(PREF_KEY, JSON.stringify(K.prefs)); }catch(e){}
    K.emit('prefs', k); if(C.signedIn() && K.loaded){ K.dirty.add('prefs'); K.emit('dirty'); }
  };
  function loadPrefsFromCloud(p){ if(!p || typeof p !== 'object') return; K.prefs = Object.assign({}, K.prefs, p); K.prefs.wall = Object.assign({ light: null, dark: null }, K.prefs.wall); try{ localStorage.setItem(PREF_KEY, JSON.stringify(K.prefs)); }catch(e){} K.emit('prefs', '*'); }

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
      s.ref.remove().catch(() => {});
    }, () => {});
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
    return { name: S.meta.name || '', value: r2(S.cash), nw: r2(K.netWorth()), re: r2(K.propValue()), stk: r2(K.stockValue ? K.stockValue() : 0), inv: r2(K.inventoryValue()),
      disc: S.lab.found.length, runs: S.lab.runs || 0, props: Object.keys(S.props).length, els: Object.keys(S.inv.e).length,
      fac: r2(S.factory.lines.reduce((s, l) => s + (l.on ? l.rate : 0), 0)), made: Math.floor(S.factory.made || 0) };
  };
  function publishBoard(force){
    if(!C.signedIn() || !K.S.meta.name) return;
    const e = C.boardEntry(), sig = JSON.stringify(e), now = Date.now();
    if(force ? (now - lbAt < 4000 && sig === lbLast) : (now - lbAt < CFG.leaderboardEveryMs || sig === lbLast)) return;
    lbAt = now; lbLast = sig; e.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    return C.db.ref('leaderboard/' + C.user.uid).set(e).catch(() => {});
  }
  C.publishBoard = publishBoard;
  C.setName = async function(name){
    const err = K.nameOk(name); if(err) throw new Error(err);
    K.S.meta.name = name.trim(); K.touch('meta'); await C.flushNow(); publishBoard(true);
  };
  C.leaderboard = async function(n, field){                           // top n by one field (default: bank cash, which the admin tools use)
    if(!C.db) return []; field = field || 'value';
    const s = await C.db.ref('leaderboard').orderByChild(field).limitToLast(n || 20).once('value'); count(s); const out = [];
    s.forEach(c => { const v = c.val(); if(v && typeof v[field] === 'number') out.push(Object.assign({ uid: c.key }, v)); });
    return out.sort((a, b) => b[field] - a[field]);
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
  A.reset = async uid => { need(); await C.db.ref('players/' + uid).remove(); await C.db.ref('leaderboard/' + uid).remove(); };
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
