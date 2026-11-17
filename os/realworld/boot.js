/* REALWORLD · boot — the only part of the real world that loads with WestOS (≈2 KB). It wires the WestOS menu (click the brand → "Touch grass") and OS.realworld.
 * The engine (≈110 KB of JS + CSS) is fetched the first time somebody actually steps outside, then cached by the browser; nothing is downloaded for players who stay in WestOS.
 * Read os/realworld/README.md before changing anything. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, FILES = ['terrain', 'mesh', 'layout', 'vehicles', 'nav', 'chunkgen', 'env', 'gfx', 'screens', 'interiors', 'cells', 'props', 'glb', 'phys', 'npcs', 'net', 'streamer', 'game'].map(f => 'os/realworld/' + f + '.js');
  let api = null, loading = null; const btn = document.getElementById('rwGo'), brand = document.getElementById('rwBrand'), menu = document.getElementById('rwMenu'), screen = document.getElementById('screen');
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
  /* fast travel (WestMap): in the world → fade and move; on the desktop → step outside right there */
  async function travelTo(x, z, yaw){
    if(api && api.active()) return api.travelTo(x, z, yaw);
    try{ OS.prefs.set('rwPos', { x: Math.round(x), z: Math.round(z), yaw: Math.round((yaw || 0) * 100) / 100 }); }catch(e){} return enter();
  }
  /* WestOS menu: click the brand → dropdown. In WestOS: "Touch grass". In the real world (incl. the phone view): "Back outside" + "Back to WestOS". Exactly one brand icon shows: the WestOS icon on the desktop, the outdoors icon whenever the real world is open. */
  const txt = document.getElementById('rwGoTxt'), sub = document.getElementById('rwGoSub'), home = document.getElementById('rwHome');
  const out = () => !!(api && api.active());
  function refresh(){ const o = out() || screen.classList.contains('rw-on'); if(brand) brand.classList.toggle('out', o); if(txt) txt.textContent = o ? 'Back outside' : 'Touch grass'; if(sub) sub.textContent = o ? 'Return to the street' : 'Step outside into WestCountry'; if(home) home.hidden = !o; }
  function place(){ const sr = screen.getBoundingClientRect(), br = brand.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(br.left - sr.left, sr.width - menu.offsetWidth - 8)) + 'px'; menu.style.top = (br.bottom - sr.top + 6) + 'px'; }
  function toggle(on){ if(!menu || !brand) return; on = on === undefined ? menu.hidden : on; if(on){ refresh(); menu.hidden = false; place(); } else menu.hidden = true; brand.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  if(brand && menu){ if(menu.parentNode !== screen) screen.appendChild(menu); brand.addEventListener('click', e => { e.stopPropagation(); toggle(); }); document.addEventListener('click', e => { if(!menu.hidden && !menu.contains(e.target)) toggle(false); }); document.addEventListener('keydown', e => { if(e.key === 'Escape' && !menu.hidden){ toggle(false); brand.focus(); } }); window.addEventListener('resize', () => { if(!menu.hidden) place(); }); }
  if(btn) btn.addEventListener('click', async () => { toggle(false); if(!out() && brand) brand.classList.add('out'); const ok = await enter(); refresh(); if(!ok && !out() && brand) brand.classList.remove('out'); });
  if(home) home.addEventListener('click', () => { toggle(false); if(api) api.exit(); refresh(); });
  try{ new MutationObserver(refresh).observe(screen, { attributes: true, attributeFilter: ['class'] }); }catch(e){}
  refresh();
  OS.realworld = { at: id => !!(api && api.active() && api.vehicles && api.vehicles.at(id)), vehicles: () => api && api.vehicles, travelTo, hold: on => { if(api && api.active()) api.hold(on); }, openMap: () => { if(api && api.active()) api.openMap(); else OS.open('WestMap'); }, enter, exit: () => { if(api) api.exit(); refresh(); }, phone: on => { if(api) api.phone(on); }, active: () => !!(api && api.active()), state: () => api && api.state(), api: () => api };
});
