/* REALWORLD · boot — the only part of the real world that loads with WestOS (≈2 KB). It adds the close button (✕, left of "WestOS" in the menu bar) and OS.realworld.
 * The engine (≈110 KB of JS + CSS) is fetched the first time somebody actually steps outside, then cached by the browser; nothing is downloaded for players who stay in WestOS.
 * Read os/realworld/README.md before changing anything. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, FILES = ['terrain', 'mesh', 'chunkgen', 'env', 'gfx', 'interiors', 'net', 'streamer', 'game'].map(f => 'os/realworld/' + f + '.js');
  let api = null, loading = null; const btn = document.getElementById('rwExit'), screen = document.getElementById('screen');
  const add = (tag, attrs) => new Promise((res, rej) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = res; e.onerror = () => rej(new Error('Could not load ' + (attrs.src || attrs.href))); document.head.appendChild(e); });
  function ensure(){
    if(api) return Promise.resolve(api);
    if(!loading) loading = (async () => { if(!document.getElementById('rwCss')) await add('link', { id: 'rwCss', rel: 'stylesheet', href: 'os/realworld/realworld.css' }); await Promise.all(FILES.map(src => add('script', { src, async: false }))); api = window.RealWorld.start(K); return api; })().catch(e => { loading = null; throw e; });
    return loading;
  }
  async function enter(){
    if(api && api.active()){ if(api.inPhone()) api.phone(false); return true; }
    if(!screen || screen.classList.contains('locked')) return false; if(btn) btn.classList.add('busy');
    try{ const a = await ensure(); try{ OS.home(); }catch(e){} return a.enter(); }catch(e){ OS.toast('Could not load the real world. Check your connection and try again.'); if(K.diag) K.diag.error('realworld.load', e); return false; }
    finally{ if(btn) btn.classList.remove('busy'); }
  }
  if(btn) btn.addEventListener('click', enter);
  OS.realworld = { enter, exit: () => { if(api) api.exit(); }, phone: on => { if(api) api.phone(on); }, active: () => !!(api && api.active()), state: () => api && api.state(), api: () => api };
});
