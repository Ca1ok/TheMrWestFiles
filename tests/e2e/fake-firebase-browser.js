/* A fake Firebase compat SDK for browser tests. The database lives in Node (tests/e2e.test.js) and every write is judged by the REAL database.rules.json through
 * tests/rules-harness.js; this file only forwards calls through window.__fb and re-fires listeners when something changed. */
(function(){
  if(window.firebase) return;
  const norm = p => String(p || '').split('/').filter(Boolean).join('/'), TS = { '.sv': 'timestamp' }, listeners = []; let keyN = 0, busy = false;
  const bridge = (...a) => window.__fb(...a);
  const snap = (path, val) => ({ key: norm(path).split('/').pop() || null, val: () => val === undefined ? null : JSON.parse(JSON.stringify(val)), exists: () => val !== undefined && val !== null, forEach(fn){ if(val && typeof val === 'object') Object.keys(val).forEach(k => fn(snap(path + '/' + k, val[k]))); }, child: c => snap(path + '/' + c, val == null ? undefined : String(c).split('/').reduce((x, k) => x == null ? undefined : x[k], val)), hasChild: c => !!(val && val[c] !== undefined) });
  async function refresh(){
    if(busy) return; busy = true;
    try{ for(const l of listeners.slice()){
      const v = await bridge('get', l.path, l.q), j = JSON.stringify(v === undefined ? null : v);
      if(l.type === 'value'){ if(j !== l.j){ l.j = j; try{ l.cb(snap(l.path, v)); }catch(e){ console.error('listener', e); } } }
      else if(l.type === 'child_added'){ const seen = l.seen || (l.seen = new Set()); if(v && typeof v === 'object') for(const k of Object.keys(v)){ if(!seen.has(k)){ seen.add(k); try{ l.cb(snap(l.path + '/' + k, v[k])); }catch(e){ console.error('listener', e); } } } }
    } } finally { busy = false; }
  }
  window.__fbChanged = () => refresh();
  setInterval(refresh, 700);
  async function write(updates){ const r = await bridge('update', updates); if(!r.ok){ const e = new Error('PERMISSION_DENIED: ' + r.why); e.code = 'PERMISSION_DENIED'; throw e; } refresh(); }
  class Ref {
    constructor(path, q){ this.path = norm(path); this.q = q || {}; this.key = this.path.split('/').pop() || null; }
    child(c){ return new Ref(this.path + '/' + norm(c)); }
    once(){ return bridge('get', this.path, this.q).then(v => snap(this.path, v)); }
    on(type, cb){ const l = { path: this.path, q: this.q, type, cb, j: undefined, seen: null }; listeners.push(l); setTimeout(refresh, 0); return cb; }
    off(){ for(let i = listeners.length - 1; i >= 0; i--) if(listeners[i].path === this.path) listeners.splice(i, 1); }
    set(v){ return write({ [this.path]: v }); }
    remove(){ return write({ [this.path]: null }); }
    update(o){ const u = {}; Object.keys(o).forEach(k => { u[this.path ? this.path + '/' + norm(k) : norm(k)] = o[k]; }); return write(u); }
    push(v){ const r = this.child('k' + Date.now().toString(36) + (keyN++).toString(36)); if(v !== undefined){ const p = r.set(v); r.then = (a, b) => p.then(a, b); r.catch = f => p.catch(f); } return r; }
    transaction(fn){ return bridge('get', this.path, {}).then(cur => { const nv = fn(cur === undefined ? null : cur); if(nv === undefined) return { committed: false, snapshot: snap(this.path, cur) }; return write({ [this.path]: nv }).then(() => ({ committed: true, snapshot: snap(this.path, nv) })); }); }
    orderByChild(c){ return new Ref(this.path, Object.assign({}, this.q, { orderBy: c })); } equalTo(v){ return new Ref(this.path, Object.assign({}, this.q, { equalTo: v })); } limitToLast(n){ return new Ref(this.path, Object.assign({}, this.q, { limit: n })); } limitToFirst(n){ return this.limitToLast(n); } orderByKey(){ return this; } startAt(){ return this; }
    onDisconnect(){ return { set(){}, remove(){}, cancel(){} }; }
  }
  const db = { ref: p => { p = norm(p); if(p === '.info/serverTimeOffset') return { on: (t, cb) => { setTimeout(() => cb(snap(p, 0)), 0); }, off(){} }; if(p === '.info/connected') return { on: (t, cb) => { setTimeout(() => cb(snap(p, true)), 0); }, off(){} }; return new Ref(p); }, goOffline(){}, goOnline(){} };
  const users = []; const auth = { currentUser: null, onAuthStateChanged(cb){ setTimeout(() => { auth.currentUser = window.__fbUser || null; cb(auth.currentUser); }, 30); }, signInAnonymously: async () => ({}), signInWithPopup: async () => ({ user: window.__fbUser }), signInWithEmailAndPassword: async () => ({ user: window.__fbUser }), signOut: async () => {} };
  const fb = { initializeApp(){}, database: Object.assign(() => db, { ServerValue: { TIMESTAMP: TS } }), auth: Object.assign(() => auth, { GoogleAuthProvider: function(){} }), apps: [{}] };
  window.firebase = fb;
})();
