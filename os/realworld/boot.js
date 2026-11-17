/* REALWORLD · boot — the only part of the real world that loads with WestOS (≈2 KB). It adds the close button (✕, left of "WestOS" in the menu bar) and OS.realworld.
 * The engine (≈110 KB of JS + CSS) is fetched the first time somebody actually steps outside, then cached by the browser; nothing is downloaded for players who stay in WestOS.
 * Read os/realworld/README.md before changing anything. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, FILES = ['terrain', 'mesh', 'layout', 'vehicles', 'nav', 'chunkgen', 'env', 'gfx', 'screens', 'interiors', 'cells', 'props', 'glb', 'phys', 'npcs', 'net', 'streamer', 'game'].map(f => 'os/realworld/' + f + '.js?v=20261117a');
  let api = null, loading = null; const btn = document.getElementById('rwExit'), screen = document.getElementById('screen');
  const add = (tag, attrs) => new Promise((res, rej) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = res; e.onerror = () => rej(new Error('Could not load ' + (attrs.src || attrs.href))); document.head.appendChild(e); });
  function ensure(){
    if(api) return Promise.resolve(api);
    if(!loading) loading = (async () => { if(!document.getElementById('rwCss')) await add('link', { id: 'rwCss', rel: 'stylesheet', href: 'os/realworld/realworld.css?v=20261117a' }); await Promise.all(FILES.map(src => add('script', { src, async: false }))); api = window.RealWorld.start(K); return api; })().catch(e => { loading = null; throw e; });
    return loading;
  }
  async function enter(){
    if(api && api.active()){ if(api.inPhone()) api.phone(false); return true; }
    if(!screen || screen.classList.contains('locked')) return false; if(btn) btn.classList.add('busy');
    try{ const a = await ensure(); try{ OS.home(); }catch(e){} return a.enter(); }catch(e){ OS.toast('Could not load the real world. Check your connection and try again.'); if(K.diag) K.diag.error('realworld.load', e); return false; }
    finally{ if(btn) btn.classList.remove('busy'); }
  }
  /* fast travel (WestMap): in the world → fade and move; on the desktop → step outside right there */
  async function travelTo(x, z, yaw){
    if(api && api.active()) return api.travelTo(x, z, yaw);
    try{ OS.prefs.set('rwPos', { x: Math.round(x), z: Math.round(z), yaw: Math.round((yaw || 0) * 100) / 100 }); }catch(e){} return enter();
  }
  if(btn) btn.addEventListener('click', enter);
  OS.realworld = { at: id => !!(api && api.active() && api.vehicles && api.vehicles.at(id)), vehicles: () => api && api.vehicles, travelTo, hold: on => { if(api && api.active()) api.hold(on); }, openMap: () => { if(api && api.active()) api.openMap(); else OS.open('WestMap'); }, enter, exit: () => { if(api) api.exit(); }, phone: on => { if(api) api.phone(on); }, active: () => !!(api && api.active()), state: () => api && api.state(), api: () => api };
});
