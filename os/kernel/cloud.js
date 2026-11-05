/* KERNEL · cloud — Firebase auth, saving/loading progress, the mailbox, broadcasts, the leaderboard and the admin tools.
 * Free-tier discipline (Spark plan: 10 GB/month download):
 *   - ONE read of the player's record at sign-in; after that only small, debounced writes of the fields that changed
 *   - no polling, no always-on listeners except two near-empty nodes (your mailbox, the market ledger)
 *   - guests never touch the player data nodes at all (nothing is saved or cached while signed out) */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG;
  const FIELDS = ['cash', 'inv', 'lots', 'props', 'bank', 'mail', 'lab', 'games', 'shop', 'meta'];
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
  let flushTimer = null, mailRef = null, lbAt = 0, lbLast = 0;
  C.init = function(){
    if(typeof firebase === 'undefined'){ C.ready = true; K.emit('auth'); return; }
    try{ firebase.initializeApp(CFG.firebase); C.db = firebase.database(); C.auth = firebase.auth(); }catch(e){ console.warn('[cloud] firebase unavailable', e); C.ready = true; K.emit('auth'); return; }
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
  C.flushNow = function(){
    clearTimeout(flushTimer); flushTimer = null;
    if(!C.signedIn() || !K.loaded || !K.dirty.size || !C.db) return Promise.resolve();
    const out = {}; K.dirty.forEach(f => { if(f === 'prefs') out.prefs = K.prefs; else if(FIELDS.includes(f)) out[f] = clean(K.S[f]); });
    if(K.dirty.has('cash') || K.dirty.has('inv') || K.dirty.has('lots') || K.dirty.has('props')) K.dirty.add('lb');
    out.updatedAt = firebase.database.ServerValue.TIMESTAMP; K.dirty.clear();
    C.writes++; K.emit('sync', 'saving');
    return C.db.ref('players/' + C.user.uid).update(out).then(() => { K.emit('sync', 'saved'); publishBoard(); }).catch(e => { console.warn('[cloud] save failed', e); K.emit('sync', 'error'); Object.keys(out).forEach(f => K.dirty.add(f)); });
  };
  const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x)) ? 0 : x));    // drops undefined, fixes NaN
  K.on('dirty', () => { if(C.signedIn() && K.loaded && !flushTimer) flushTimer = setTimeout(C.flushNow, CFG.syncDebounceMs); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) C.flushNow(); });
  window.addEventListener('pagehide', () => C.flushNow());

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

  /* ---- leaderboard (public, tiny) ---- */
  function publishBoard(force){
    if(!C.signedIn() || !K.S.meta.name) return;
    /* The board shows exactly the "Total balance" on the player's Bank screen (their cash), to the cent, and follows every change. */
    const bal = Math.round(K.S.cash * 100) / 100, now = Date.now();
    if(!force && (now - lbAt < CFG.leaderboardEveryMs || bal === lbLast)) return;
    lbAt = now; lbLast = bal;
    return C.db.ref('leaderboard/' + C.user.uid).set({ name: K.S.meta.name, value: bal, updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
  }
  C.publishBoard = publishBoard;
  C.setName = async function(name){
    const err = K.nameOk(name); if(err) throw new Error(err);
    K.S.meta.name = name.trim(); K.touch('meta'); await C.flushNow(); publishBoard(true);
  };
  C.leaderboard = async function(n){ if(!C.db) return []; const s = await C.db.ref('leaderboard').orderByChild('value').limitToLast(n || 20).once('value'); count(s); const out = []; s.forEach(c => { out.push(Object.assign({ uid: c.key }, c.val())); }); return out.reverse(); };

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
  const need = () => { if(!C.isAdmin()) throw new Error('Admin only.'); };
  A.players = async () => { need(); return C.leaderboard(200); };
  A.read = async uid => { need(); const s = await C.db.ref('players/' + uid).once('value'); count(s); return s.val(); };
  A.setField = async (uid, path, v) => { need(); await C.db.ref('players/' + uid + '/' + path).set(v); };
  A.reset = async uid => { need(); await C.db.ref('players/' + uid).remove(); await C.db.ref('leaderboard/' + uid).remove(); };
  A.rename = async (uid, name) => { need(); const err = K.nameOk(name); if(err) throw new Error(err); await C.db.ref('players/' + uid + '/meta/name').set(name); await C.db.ref('leaderboard/' + uid + '/name').set(name); };
  A.mail = async (uid, subj, body) => { need(); await C.db.ref('mailbox/' + uid).push({ from: 'Mr West', subj: String(subj).slice(0, 120), body: String(body).slice(0, 1000), t: firebase.database.ServerValue.TIMESTAMP }); };
  A.broadcast = async (subj, body) => { need(); await C.db.ref('broadcast').push({ from: 'Mr West', subj: String(subj).slice(0, 120), body: String(body).slice(0, 1000), t: firebase.database.ServerValue.TIMESTAMP }); };
});
