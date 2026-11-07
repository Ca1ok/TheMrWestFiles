/* KERNEL · maint — maintenance mode: the admin can close the whole site, single apps, or single systems (stock trading, the player Market).
 *   - The switches live in ONE tiny Firebase node, `maintenance` (public read, admin-only write — see database.rules.json). It is listened to live,
 *     so flipping a switch reaches everyone who is online within a second or two, and costs next to nothing (a few dozen bytes per change).
 *   - The admin is never locked out: every check below returns "not blocked" for the verified admin account, so you can test and switch things back on.
 *   - Players get a plain message: "'WestFactory' is in maintenance mode" (plus the optional note you typed).
 *   - HONEST LIMIT: like the rest of this client-side economy, this is enforced in the browser (UI + the kernel actions behind the OS facade). It stops
 *     normal play and the normal apps, not someone determined to tamper with their own page; the database rules are what protect shared data. */
(window.__OSM = window.__OSM || []).push(function(K){
  const M = K.maint = {};
  let cfg = { all: false, apps: {}, sys: {}, msg: '', t: 0 }, ready = false;
  const SYS = { trading: 'Stock trading', market: 'Player Market' };          // systems that can be switched off on their own
  M.SYS = SYS;
  M.LOCKED_APPS = ['Settings', 'Bank'];                                      // never offered: Settings is the admin's switchboard, and tax bills must stay payable
  const pick = o => { const r = {}; if(o && typeof o === 'object') Object.keys(o).forEach(k => { if(o[k] === true || o[k] === 1) r[k] = true; }); return r; };
  const norm = v => ({ all: !!(v && v.all === true), apps: pick(v && v.apps), sys: pick(v && v.sys), msg: String((v && v.msg) || '').replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, ' ').trim().slice(0, 160), t: +(v && v.t) || 0 });
  const isAdmin = () => { try{ return K.cloud.isAdmin(); }catch(e){ return false; } };
  const appName = id => { const a = typeof OS_APPS !== 'undefined' && OS_APPS.find(x => x.id === id); return a ? a.name : id; };
  const sig = () => JSON.stringify(cfg);

  M.attach = function(db){
    const done = () => { ready = true; K.emit('maint'); };
    if(!db){ done(); return; }
    let first = true;
    try{
      db.ref('maintenance').on('value', s => { const next = norm(s.val()), changed = sig() !== JSON.stringify(next); cfg = next; if(first || changed){ first = false; done(); } },
        () => { cfg = norm(null); done(); });                                // no permission / offline: behave as if nothing is in maintenance
    }catch(e){ done(); }
    setTimeout(() => { if(!ready) done(); }, 4000);                          // never hold the boot screen for a slow answer
  };
  M.ready = () => ready;
  M.config = () => JSON.parse(JSON.stringify(cfg));
  M.note = () => cfg.msg;
  M.active = () => cfg.all || Object.keys(cfg.apps).length > 0 || Object.keys(cfg.sys).length > 0;
  M.siteMsg = () => (cfg.all && !isAdmin()) ? 'The Mr West Files is in maintenance mode' : '';
  M.appMsg = id => { if(isAdmin()) return ''; if(cfg.all) return 'The Mr West Files is in maintenance mode'; return cfg.apps[id] ? '\'' + appName(id) + '\' is in maintenance mode' : ''; };
  M.sysMsg = key => { if(isAdmin()) return ''; if(cfg.all) return 'The Mr West Files is in maintenance mode'; return cfg.sys[key] ? '\'' + (SYS[key] || key) + '\' is in maintenance mode' : ''; };
});
