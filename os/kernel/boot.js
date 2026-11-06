/* BOOT — runs the kernel modules and the shell privately (nothing global is left behind except the narrow `OS` facade), then loads
 * Firebase *after* the first paint so the desktop is on screen immediately even on a slow connection. */
(function(){
  const K = { Chem, World };
  (window.__OSM || []).forEach(m => m(K)); delete window.__OSM;
  ['shop', 'lab', 'props', 'bank', 'mail', 'auth', 'stock', 'games', 'arcade', 'files', 'world', 'admin', 'gallery', 'leaderboard', 'prefs'].forEach(k => { if(K.facade[k] && k !== 'admin') Object.freeze(K.facade[k]); });   // the API objects can't be swapped out from the console
  Object.freeze(K.facade.admin.gallery); Object.freeze(K.facade.admin);
  window.OS = Object.freeze(K.facade);
  const SDK = ['https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js', 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js'];
  const load = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
  (async () => {
    const results = []; for(const s of SDK) results.push(await load(s));          // sequential: app → database → auth (compat SDK needs this order)
    if(!results.every(Boolean)) window.firebase = undefined;
    K.cloud.init(); K.market.start();
  })();
})();
