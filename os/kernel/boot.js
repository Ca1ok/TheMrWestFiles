/* BOOT — runs the kernel modules and the shell privately (nothing global is left behind except the narrow `OS` facade), then loads
 * Firebase *after* the first paint so the desktop is on screen immediately even on a slow connection. */
(function(){
  const K = { Chem, World };
  K.maint = { attach(){ }, ready: () => true, config: () => ({ all: false, apps: {}, sys: {}, msg: '', t: 0 }), note: () => '', active: () => false, siteMsg: () => '', appMsg: () => '', sysMsg: () => '', SYS: {}, LOCKED_APPS: ['Settings', 'Bank'] };   // placeholder: maint.js replaces it; if that file is missing there is simply no maintenance, never a frozen boot delete window.__OSM;
  (window.__OSM || []).forEach((m, i) => { try{ m(K); }catch(e){ if(K.diag) K.diag.error('boot.module#' + i, e); else console.error('[boot] module failed', e); } });   // one broken module must not stop the rest
  if(K.diag){ try{ K.diag.attach(K); K.facade.debug = Object.freeze(Object.assign({}, K.diag.facade)); K.diag.wrapFacade(K.facade); }catch(e){ console.error('[boot] diagnostics failed to attach', e); } }   // every OS.* call now reports its own failures by name (transparent: same result, same throw)
  ['shop', 'lab', 'props', 'homes', 'loans', 'bank', 'mail', 'auth', 'stock', 'games', 'gameBoards', 'arcade', 'factory', 'files', 'world', 'admin', 'gallery', 'leaderboard', 'prefs', 'maintenance'].forEach(k => { if(K.facade[k] && k !== 'admin') Object.freeze(K.facade[k]); });   // the API objects can't be swapped out from the console
  Object.freeze(K.facade.factory.market); Object.freeze(K.facade.admin.gallery); Object.freeze(K.facade.admin);
  window.OS = Object.freeze(K.facade);
  const SDK = ['https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js', 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js'];
  const load = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
  (async () => {
    const results = []; for(const s of SDK) results.push(await load(s));          // sequential: app → database → auth (compat SDK needs this order)
    if(!results.every(Boolean)) window.firebase = undefined;
    K.cloud.init(); K.market.start();
  })();
})();
