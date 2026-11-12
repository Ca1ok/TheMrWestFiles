/* DIAG — loud, persistent error logging so a bug report arrives with the evidence.
 *   - Loaded FIRST (before config), so errors thrown while the rest of the OS is still booting are caught too.
 *   - Captures: uncaught errors (with stack + file:line:col), unhandled promise rejections (with stack), failed <script>/<link>/<img> loads,
 *     console.error / console.warn from the desktop AND every app window (Firebase prints permission problems with console.warn),
 *     and any error thrown by a call through the `OS` facade (named, e.g. "OS.leaderboard.list (async)").
 *   - Nothing is swallowed: every entry is also printed with console.error so it shows up in DevTools.
 *   - A ring buffer is kept in memory; warnings/errors are mirrored to localStorage so they survive a reload ("previous session").
 *   - K.diag.text(budget) renders a compact block (≤ the report's 4,000-char limit) that WestReport attaches automatically.
 * Never throws, never logs secrets (facade calls on `auth` log no arguments). */
(function(){
  const KEY = 'westos_diag', MAXBUF = 300, MAXKEEP = 40, SESSION = Math.random().toString(36).slice(2, 8);
  const buf = []; let unseen = 0, persistT = null, K = null; const subs = new Set();
  const co = { error: console.error.bind(console), warn: console.warn.bind(console) };
  let prev = []; try{ prev = (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter(e => e && e.s !== SESSION).slice(-MAXKEEP); }catch(_){}

  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const hhmmss = t => new Date(t).toISOString().slice(11, 19);
  /* "at fn (https://site/os/kernel/cloud.js:12:5)" → "at fn (cloud.js:12:5)"; our own frames are dropped */
  function trimStack(st, n){
    if(!st) return '';
    const lines = String(st).split('\n').map(l => l.trim()).filter(l => l && !/diag\.js/.test(l));
    return lines.slice(0, n || 6).map(l => l.replace(/https?:\/\/[^\s)]*\//g, '').replace(/\?v=[^:)\s]*/g, '')).join('\n');
  }
  function fmtArg(a){
    if(a instanceof Error) return (a.name || 'Error') + ': ' + a.message + (a.stack ? '\n' + trimStack(a.stack, 5) : '');
    if(a && typeof a === 'object'){ try{ return clip(JSON.stringify(a), 400); }catch(_){ return Object.prototype.toString.call(a); } }
    return String(a);
  }
  /* a safe one-line description of a value (never the value itself for long strings/objects) */
  function summarize(v, d){
    d = d || 0;
    if(v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    if(typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…(' + v.length + ')' : v;
    if(typeof v === 'function') return 'fn';
    if(Array.isArray(v)) return 'array[' + v.length + ']';
    if(typeof v === 'object'){ if(d > 0) return 'object'; const o = {}; Object.keys(v).slice(0, 8).forEach(k => { o[k] = summarize(v[k], d + 1); }); return o; }
    return typeof v;
  }

  function persist(){
    if(persistT) return;
    persistT = setTimeout(() => { persistT = null; try{ const keep = buf.filter(e => e.lvl !== 'info').slice(-MAXKEEP).map(e => ({ s: SESSION, t: e.t, lvl: e.lvl, src: e.src, msg: clip(e.msg, 240), stack: trimStack(e.stack, 4), n: e.n })); localStorage.setItem(KEY, JSON.stringify(keep)); }catch(_){} }, 600);
  }
  function record(lvl, src, msg, o){
    try{
      o = o || {}; msg = clip(msg, 500); const t = Date.now(), last = buf[buf.length - 1];
      if(last && last.lvl === lvl && last.src === src && last.msg === msg){ last.n++; last.t = t; }
      else { buf.push({ t, lvl, src, msg, stack: o.stack ? String(o.stack) : '', data: o.data, n: 1 }); if(buf.length > MAXBUF) buf.shift(); }
      if(lvl === 'error') unseen++;
      if(lvl !== 'info'){ persist(); if(!o.quiet) (lvl === 'error' ? co.error : co.warn)('[westos:' + src + ']', msg, o.stack ? '\n' + trimStack(o.stack, 8) : '', o.data !== undefined ? o.data : ''); }
      subs.forEach(f => { try{ f(lvl, src, msg); }catch(_){} });
    }catch(_){}
  }

  const api = {
    SESSION,
    log: (lvl, src, msg, data) => record(lvl === 'error' || lvl === 'warn' ? lvl : 'info', String(src || 'app'), msg, { data, stack: lvl === 'error' ? new Error().stack : '' }),
    info: (src, msg, data) => record('info', String(src || 'app'), msg, { data }),
    warn: (src, msg, data) => record('warn', String(src || 'app'), msg, { data }),
    /* error(src, errOrMessage, data): the loud one. Always keeps the stack. */
    error(src, err, data){
      const e = err instanceof Error ? err : (err && typeof err === 'object' && err.message ? err : null);
      const code = e && e.code ? ' [' + e.code + ']' : '';
      record('error', String(src || 'app'), e ? ((e.name || 'Error') + code + ': ' + e.message) : String(err), { stack: (e && e.stack) || new Error().stack, data });
    },
    summarize, trimStack,
    entries: n => buf.slice(-(n || 60)), previous: () => prev.slice(), unseen: () => unseen, markSeen(){ unseen = 0; subs.forEach(f => { try{ f('seen'); }catch(_){} }); },
    on: f => { subs.add(f); return () => subs.delete(f); },
    errorCount: () => buf.filter(e => e.lvl === 'error').length,
    /* attach the same capture to another window (an app iframe) */
    hook(win, src){
      try{
        win.addEventListener('error', e => { if(e.target && e.target !== win && (e.target.src || e.target.href)) record('error', src, 'failed to load ' + String(e.target.src || e.target.href).split('/').slice(-2).join('/')); else record('error', src, (e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno + ':' + e.colno : ''), { stack: e.error && e.error.stack }); }, true);
        win.addEventListener('unhandledrejection', e => { const r = e.reason; record('error', src, 'promise: ' + (r && r.message ? ((r.name || 'Error') + (r.code ? ' [' + r.code + ']' : '') + ': ' + r.message) : fmtArg(r)), { stack: r && r.stack }); });
        const c = win.console; if(c && !c.__westos){ const e0 = c.error && c.error.bind(c), w0 = c.warn && c.warn.bind(c); c.__westos = 1;
          c.error = function(){ try{ e0 && e0.apply(null, arguments); }catch(_){} record('error', src, [].map.call(arguments, fmtArg).join(' '), { quiet: true, stack: new Error().stack }); };
          c.warn = function(){ try{ w0 && w0.apply(null, arguments); }catch(_){} record('warn', src, [].map.call(arguments, fmtArg).join(' '), { quiet: true }); }; }
      }catch(_){}
    },
    /* Compact, report-ready text. Newest errors first; stacks trimmed to the top frames. */
    text(budget){
      budget = budget || 2400; const out = [], errs = buf.filter(e => e.lvl === 'error').slice(-8).reverse();
      out.push('Script errors this session: ' + buf.filter(e => e.lvl === 'error').length + (errs.length ? '' : ' (none)'));
      errs.forEach(e => out.push('[' + hhmmss(e.t) + ' ' + e.src + (e.n > 1 ? ' ×' + e.n : '') + '] ' + clip(e.msg, 200) + (e.stack ? '\n   ' + trimStack(e.stack, 4).split('\n').join('\n   ') : '') + (e.data !== undefined ? '\n   data: ' + clip(JSON.stringify(e.data), 200) : '')));
      const warns = buf.filter(e => e.lvl === 'warn').slice(-4).reverse(); if(warns.length){ out.push('Warnings:'); warns.forEach(e => out.push('[' + hhmmss(e.t) + ' ' + e.src + '] ' + clip(e.msg, 160))); }
      const crumbs = buf.filter(e => e.lvl === 'info').slice(-10); if(crumbs.length){ out.push('Recent activity (oldest → newest):'); crumbs.forEach(e => out.push(hhmmss(e.t) + ' ' + e.src + ': ' + clip(e.msg, 90))); }
      if(prev.length){ out.push('Errors from the previous session on this device:'); prev.filter(e => e.lvl === 'error').slice(-3).forEach(e => out.push('[' + hhmmss(e.t) + ' ' + e.src + '] ' + clip(e.msg, 140) + (e.stack ? ' ← ' + String(e.stack).split('\n')[0] : ''))); }
      let s = out.join('\n'); if(s.length > budget) s = s.slice(0, budget - 20) + '\n…(trimmed)'; return s;
    }
  };

  /* ---- global capture (desktop window) ---- */
  api.hook(window, 'desktop');
  console.error = function(){ try{ co.error.apply(null, arguments); }catch(_){} record('error', 'console', [].map.call(arguments, fmtArg).join(' '), { quiet: true, stack: new Error().stack }); };
  console.warn = function(){ try{ co.warn.apply(null, arguments); }catch(_){} record('warn', 'console', [].map.call(arguments, fmtArg).join(' '), { quiet: true }); };
  window.addEventListener('offline', () => record('warn', 'net', 'browser went offline')); window.addEventListener('online', () => record('info', 'net', 'browser back online'));

  /* ---- kernel side (K) ---- */
  (window.__OSM = window.__OSM || []).push(function(K0){ K0.diag = api; K = K0; });

  /* api.attach(K): called by boot.js after every kernel module ran. Breadcrumbs for the events that matter in a bug report. */
  api.attach = function(K1){
    K = K1;
    ['auth', 'loaded', 'session', 'maint'].forEach(ev => K.on(ev, d => record('info', 'os', ev + (d !== undefined && typeof d !== 'object' ? ' ' + d : ''))));
    K.on('sync', s => { if(s === 'error') record('warn', 'sync', 'save failed' + (K.cloud && K.cloud.lastErr ? ': ' + K.cloud.lastErr.msg : '')); else if(s === 'saved') record('info', 'sync', 'saved'); });
    K.on('focus', id => { if(id) record('info', 'app', 'focus ' + id); });
  };

  /* shape check of the live state — catches "undefined.length" style bugs before they happen, and says exactly which field is wrong */
  api.probe = function(){
    const issues = []; try{
      const S = K && K.S; if(!S) return ['state missing'];
      const arr = (p, v) => { if(!Array.isArray(v)) issues.push(p + ' is ' + (v === null ? 'null' : typeof v)); }, obj = (p, v) => { if(!v || typeof v !== 'object') issues.push(p + ' is ' + (v === null ? 'null' : typeof v)); };
      if(typeof S.cash !== 'number' || !isFinite(S.cash)) issues.push('cash is not a finite number');
      arr('lots', S.lots); arr('mail', S.mail); obj('bank', S.bank); if(S.bank){ arr('bank.bills', S.bank.bills); arr('bank.hist', S.bank.hist); }
      obj('lab', S.lab); if(S.lab){ arr('lab.found', S.lab.found); obj('lab.tools', S.lab.tools); } obj('inv', S.inv); if(S.inv){ obj('inv.e', S.inv.e); obj('inv.c', S.inv.c); }
      obj('games', S.games); if(S.games){ obj('games.plays', S.games.plays); } obj('factory', S.factory); if(S.factory) arr('factory.lines', S.factory.lines); obj('props', S.props);
      const P = K.prefs || {}; if(P.dock != null) arr('prefs.dock', P.dock); if(P.seenApps != null) arr('prefs.seenApps', P.seenApps); if(P.layout != null) arr('prefs.layout', P.layout);
    }catch(e){ issues.push('probe crashed: ' + e.message); }
    return issues;
  };

  /* api.wrapFacade(OS): every function reachable through the OS facade reports its own failures, by name, with the stack.
   * Transparent: the same value is returned and the same error is re-thrown; promise rejections are logged (and still reach the caller). */
  const SKIP_NS = new Set(['chem', 'phys', 'mol', 'worldModel', 'data', 'prefs', 'cfg', 'debug']), SKIP_FN = new Set(['on', 'now', 'today', 'cash', 'econ']), NOARGS = new Set(['auth', 'admin']);
  api.wrapFacade = function(F){
    const wrapFn = (name, fn, quiet) => function(){
      let r; try{ r = fn.apply(this, arguments); }
      catch(e){ api.error(name, e, quiet ? undefined : { args: [].map.call(arguments, a => summarize(a)) }); throw e; }
      if(r && typeof r.then === 'function') r.then(null, e => { api.error(name + ' (async)', e, quiet ? undefined : { args: [].map.call(arguments, a => summarize(a)) }); });
      return r;
    };
    const walk = (obj, path, depth) => {
      Object.keys(obj).forEach(k => {
        const v = obj[k], name = path + '.' + k; if(v == null) return;
        if(typeof v === 'function'){ if(depth === 0 && SKIP_FN.has(k)) return; try{ obj[k] = wrapFn(name, v, NOARGS.has(path.split('.')[1])); }catch(_){} }
        else if(depth < 2 && typeof v === 'object' && !Array.isArray(v) && !Object.isFrozen(v) && Object.getPrototypeOf(v) === Object.prototype) walk(v, name, depth + 1);
      });
    };
    Object.keys(F).forEach(ns => { const v = F[ns]; if(SKIP_NS.has(ns) || !v || typeof v !== 'object' || Array.isArray(v) || Object.isFrozen(v)) return; try{ walk(v, 'OS.' + ns, 1); }catch(_){} });
  };
  /* what apps may call: OS.debug.error('MyApp', err, {…}) etc. */
  api.facade = { info: api.info, warn: api.warn, error: api.error, text: api.text, entries: api.entries, probe: api.probe, summarize };
})();
