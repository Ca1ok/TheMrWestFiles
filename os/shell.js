/* SHELL — everything around the apps: the menu bar, the desktop (icons + widgets, edit mode, drag & drop), the dock, real app
 * windows (title bar with close / minimize / maximize, drag, resize, focus order), notification banners and the optional lock screen.
 * It never touches game state directly — it talks to the kernel through the same facade the apps use. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, WIDGETS = (window.__OSW || []).slice(); delete window.__OSW;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, compact) => { n = +n || 0; if(compact && Math.abs(n) >= 1e6){ const u = ['', 'K', 'M', 'B', 'T', 'Qa']; let i = 0; while(Math.abs(n) >= 1000 && i < 5){ n /= 1000; i++; } return '$' + n.toFixed(n < 10 ? 2 : 1) + u[i]; } return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const reduceMotion = () => document.documentElement.classList.contains('reduce-motion');
  const screen = $('#screen'), pagesEl = $('#pages'), dockEl = $('#dock'), winsEl = $('#windows'), desk = $('#desk');
  const MB = 32, S = { w: 0, h: 0, cols: 4, rows: 6 };
  const APP = id => OS_APPS.find(a => a.id === id);

  /* ================= theme ================= */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = () => { const sk = K.skin && K.skin(); if(sk && sk.mode) return sk.mode; const t = K.prefs.theme; return t === 'light' || t === 'dark' ? t : (mq.matches ? 'dark' : 'light'); };
  /* ---- graphics mode: Auto (switches itself to Performance if windows lag) / Quality / Performance ----
   * Performance = no backdrop blur, light shadows, no wallpaper blur/animations; the heavy effects are also switched off for the length of any drag or resize. */
  const perfLow = () => { const m = K.prefs.perfMode || 'auto'; return m === 'performance' || (m === 'auto' && K.prefs.perfAuto === true); };
  let jank = 0;
  function meter(){                                                   // measures how long frames take while a window is being moved
    const f = []; let last = performance.now(), raf = 0, on = true; const tick = t => { if(!on) return; f.push(t - last); last = t; raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(raf); const a = f.slice(2); if(a.length < 20) return; const avg = a.reduce((x, y) => x + y, 0) / a.length;
      jank = avg > 24 ? jank + 1 : Math.max(0, jank - 1);
      if(jank >= 2 && (K.prefs.perfMode || 'auto') === 'auto' && !K.prefs.perfAuto){ K.setPref('perfAuto', true); toast('Windows were lagging, so WestOS switched to Performance mode. You can change this in Settings → Performance.'); } };
  }
  function applyTheme(){
    const root = document.documentElement; root.dataset.theme = theme(); root.classList.toggle('perf-low', perfLow());
    root.classList.toggle('reduce-motion', !!K.prefs.reduceMotion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)); root.classList.toggle('reduce-transparency', !!K.prefs.reduceTransparency);
    if(K.applySkin) K.applySkin();                                  // theme colours (tokens), meta theme-color, desktop snow / embers
    paintWall(); K.emit('theme', theme());
  }
  mq.addEventListener && mq.addEventListener('change', () => { if(K.prefs.theme === 'auto') applyTheme(); });
  function measure(){ const r = screen.getBoundingClientRect(); S.w = Math.round(r.width); S.h = Math.round(r.height); }
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { measure(); relayoutHome(false); fitWindows(); K.emit('screen', { w: S.w, h: S.h }); }, 60); });

  /* ================= wallpaper ================= */
  let wallLayer = 0, wallKey = '';
  const walls = [$('#wall0'), $('#wall1')];
  async function paintWall(){
    const t = theme(), id = K.prefs.wall && K.prefs.wall[t], sk = K.skin && K.skin(), key = t + ':' + id + ':' + (sk ? sk.key : ''); if(key === wallKey) return; wallKey = key;
    const next = walls[wallLayer ^ 1], cur = walls[wallLayer]; next.className = 'wall'; next.style.backgroundImage = ''; next.style.background = '';
    let url = null; if(id){ try{ url = await OS.gallery.wallpaper(id); }catch(e){} }
    if(key !== wallKey) return;
    if(url) next.style.backgroundImage = 'url("' + url + '")'; else if(sk && sk.wall){ next.classList.add('def-skin'); next.style.background = sk.wall; } else next.classList.add(t === 'dark' ? 'def-dark' : 'def-light');   // a wallpaper the player picked wins; then the theme's own; then the classic default
    requestAnimationFrame(() => { next.classList.add('on'); cur.classList.remove('on'); wallLayer ^= 1; });
  }

  /* ================= menu bar ================= */
  const reportBtn = $('#reportBtn'); reportBtn.addEventListener('click', () => openApp('WestReport', reportBtn));
  { let lastNote = 0, notes = 0;                                   // a logged script error lights the "Report a bug" button (and says so once in a while) — it never fails silently
    if(K.diag) K.diag.on(lvl => { const n = K.diag.unseen(); reportBtn.classList.toggle('has-err', n > 0); reportBtn.title = n > 0 ? n + ' script error' + (n === 1 ? '' : 's') + ' logged — click to report (details are attached automatically)' : 'Report a bug or suggest a feature';
      if(lvl === 'error' && notes < 3 && Date.now() - lastNote > 45000){ lastNote = Date.now(); notes++; toast('Something went wrong and was logged — use “Report a bug” and it is attached automatically'); } }); }
  const editBtn = $('#editBtn'), doneBtn = $('#doneBtn'), mbApp = $('#mbApp'), syncBtn = $('#syncIc'), bellBtn = $('#bell'), cashBtn = $('#mbCash');
  function paintMenuRight(){
    const si = K.cloud.signedIn(); syncBtn.innerHTML = osIcon(si ? 'cloud' : 'cloudOff', 16, 2); syncBtn.title = si ? 'Progress is saved to your account' : 'Not signed in — progress is not saved (click to sign in)';
    const n = OS.mail.unread(); bellBtn.innerHTML = osIcon('bell', 16, 2) + (n ? '<i>' + (n > 99 ? '99+' : n) + '</i>' : ''); bellBtn.title = n ? n + ' unread message' + (n === 1 ? '' : 's') : 'Messages';
    updateBadges();
  }
  let lastCash = null;
  function paintCash(){ const c = OS.cash(); cashBtn.innerHTML = osIcon('dollar', 14, 2.4) + '<span>' + money(c, true).replace('$', '') + '</span>'; cashBtn.title = 'Balance ' + money(c) + ' — open Bank'; if(lastCash != null && c !== lastCash){ cashBtn.classList.remove('bump'); void cashBtn.offsetWidth; cashBtn.classList.add('bump'); } lastCash = c; }
  K.on('auth', paintMenuRight); K.on('mail', paintMenuRight); K.on('cash', paintCash); K.on('loaded', () => { paintMenuRight(); paintCash(); });
  K.on('sync', s => { syncBtn.classList.toggle('busy', s === 'saving' || s === 'slow'); syncBtn.classList.toggle('err', s === 'error');
    const le = K.cloud.lastErr; syncBtn.title = s === 'error' && le ? 'Couldn’t save — ' + le.msg + '. Click to retry; “Report a bug” attaches the details.' : s === 'slow' ? 'Still saving… slow or interrupted connection' : s === 'saving' ? 'Saving…' : (K.cloud.signedIn() ? 'Progress is saved to your account' : 'Not signed in — progress is not saved (click to sign in)'); });
  syncBtn.addEventListener('click', () => { if(!K.cloud.signedIn()) openApp('Settings', syncBtn); else { K.cloud.flushNow(); toast('Saved'); } });
  bellBtn.addEventListener('click', () => openApp('Messages', bellBtn)); cashBtn.addEventListener('click', () => openApp('Bank', cashBtn));
  paintMenuRight(); paintCash();

  /* ================= desktop layout ================= */
  const DEFAULT_DOCK = ['Messages', 'News', 'WestMap', 'Files', 'Settings'];      // what a new player (or Settings → Reset layout) gets; everything else starts on the desktop
  const SIZES = { xs: [1, 1], h: [2, 1], v: [1, 2], s: [2, 2], x3: [3, 2], b: [4, 1], m: [4, 2], l: [4, 4] };
  const SIZE_NAMES = { xs: 'Tiny · 1×1', h: 'Strip · 2×1', v: 'Tall · 1×2', s: 'Small · 2×2', x3: 'Medium · 3×2', b: 'Banner · 4×1', m: 'Wide · 4×2', l: 'Large · 4×4' };
  let layout = [], M = null, editing = false, pageCount = 1, curPage = 0, dragPages = 0;
  const items = new Map();                        // key → { el, it, inst }
  const dockIds = () => { const base = (K.prefs.dock && K.prefs.dock.length ? K.prefs.dock : DEFAULT_DOCK).filter(id => APP(id)); wins.forEach((w, id) => { if(!base.includes(id)) base.push(id); }); return base; };
  const szLabel = z => SIZES[z][0] + '×' + SIZES[z][1];
  const wk = () => 'w' + Math.random().toString(36).slice(2, 8);
  /* The stock desktop (cells are page/row/col on a ~10×5 grid; smaller screens clamp or first-fit via pack()). Apps listed here that are also in the dock are skipped by loadLayout. */
  const DEFAULT_APPS = [['Stocks', 0, 0], ['WestShop', 0, 1], ['WestLab', 0, 2], ['WestFactory', 0, 3], ['Bank', 1, 0], ['RealEstate', 1, 1], ['Photos', 1, 2], ['Notes', 1, 3],
    ['Games', 2, 0], ['Arcade', 2, 1], ['Leaderboard', 2, 2], ['Preview', 2, 3], ['WestReport', 3, 3]];
  const DEFAULT_WIDGETS = [['stocks', 'x3', 3, 0], ['news', 's', 0, 4], ['element', 'h', 2, 4], ['realestate', 'h', 3, 4], ['bank', 'h', 4, 3], ['messages', 'h', 4, 5], ['games', 'xs', 4, 7], ['wanted', 'l', 0, 6]];
  function defaultLayout(){
    const apps = DEFAULT_APPS.filter(([id]) => APP(id)).map(([id, r, c]) => ({ t: 'a', id, k: 'a-' + id, pos: { p: 0, r, c } }));
    const wids = DEFAULT_WIDGETS.filter(([id]) => WIDGETS.find(w => w.id === id)).map(([id, size, r, c]) => ({ t: 'w', id, size, k: wk(), pos: { p: 0, r, c } }));
    return apps.concat(wids);
  }
  /* Apps added after a player saved their dock/desktop are appended once, so new apps (WestReport) show up for existing accounts. */
  const NEW_APPS = ['WestReport', 'Leaderboard', 'Preview', 'Arcade', 'WestFactory', 'WestMap'];
  function addNewApps(){
    const seen = K.prefs.seenApps || []; const fresh = NEW_APPS.filter(id => !seen.includes(id) && APP(id)); if(!fresh.length) return;
    K.setPref('seenApps', seen.concat(fresh)); const dock = K.prefs.dock;
    if(dock && dock.length) K.setPref('dock', dock.concat(fresh.filter(id => !dock.includes(id))));
  }
  function loadLayout(){
    addNewApps();
    let l = K.prefs.layout; const dk = new Set((K.prefs.dock && K.prefs.dock.length ? K.prefs.dock : DEFAULT_DOCK));
    if(!Array.isArray(l) || !l.length) l = defaultLayout();
    l = l.filter(it => it && ((it.t === 'a' && APP(it.id) && !dk.has(it.id)) || (it.t === 'w' && WIDGETS.find(w => w.id === it.id)))).map(it => it.k ? it : Object.assign({}, it, { k: it.t === 'a' ? 'a-' + it.id : wk() }));
    const seen = new Set(); layout = l.filter(it => !seen.has(it.k) && seen.add(it.k));
  }
  const posOf = it => it.pos ? { p: it.pos.p | 0, r: it.pos.r | 0, c: it.pos.c | 0 } : undefined;
  const saveLayout = () => K.setPref('layout', layout.map(it => { const o = it.t === 'a' ? { t: 'a', id: it.id, k: it.k } : { t: 'w', id: it.id, size: it.size, k: it.k }; const p = posOf(it); if(p) o.pos = p; return o; }));
  /* Every item remembers the exact cell it sits in, so nothing slides around when another icon is moved or removed. */
  const pinAll = () => layout.forEach(it => { const rec = items.get(it.k); if(rec && rec.slot) it.pos = { p: rec.slot.p, r: rec.slot.r, c: rec.slot.c }; });

  /* Dock position (Settings → Desktop → Dock): float = the floating dock · low = pushed down flush with the bottom edge · hide = tucked away, slides up when the pointer touches the bottom edge */
  const DOCK_H = { float: 104, low: 80, hide: 30 }, DOCK_KEEP = { float: 92, low: 70, hide: 16 };
  const dockMode = () => ({ low: 'low', hide: 'hide' }[K.prefs.dockMode] || 'float');
  function metrics(){
    const W = S.w, pad = Math.max(14, Math.round(W * 0.02)), availW = W - pad * 2, topY = MB + 16, dockH = DOCK_H[dockMode()], availH = Math.max(240, S.h - topY - dockH);
    const cols = Math.max(4, Math.round(availW / 128)), rows = Math.max(3, Math.round(availH / 118)), cw = availW / cols, rh = availH / rows;
    const mult = { small: 0.82, large: 1.18 }[K.prefs.iconSize] || 1, ic = Math.max(36, Math.round(Math.min(80, cw * 0.58, (rh - 30) * 0.92) * mult));
    return { cols, pad, cw, ic, rh, topY, rows, dockH };
  }
  const dimsOf = it => { const d = it.t === 'a' ? [1, 1] : SIZES[it.size]; return [Math.min(d[0], M.cols), Math.min(d[1], M.rows)]; };
  const cellFree = (g, r, c, w, h) => { if(r < 0 || c < 0 || r + h > M.rows || c + w > M.cols) return false; for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(g[r + y][c + x]) return false; return true; };
  const cellMark = (g, r, c, w, h) => { for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) g[r + y][c + x] = true; };
  const newGrid = () => Array.from({ length: M.rows }, () => new Array(M.cols).fill(false));
  function nearestFree(g, r0, c0, w, h){          // closest free spot to (r0,c0) on one page, or null when the page is full
    let best = null, bd = 1e9; for(let r = 0; r + h <= M.rows; r++) for(let c = 0; c + w <= M.cols; c++){ if(!cellFree(g, r, c, w, h)) continue; const d = (r - r0) * (r - r0) + (c - c0) * (c - c0); if(d < bd){ bd = d; best = { r, c }; } } return best;
  }
  function pack(){                                // pinned items keep their cell (clamped to the screen); the rest first-fit into whatever is left
    const pages = [], G = p => pages[p] || (pages[p] = newGrid()), out = new Array(layout.length);
    layout.forEach((it, i) => {
      if(!it.pos) return; const [w, h] = dimsOf(it), p = Math.max(0, Math.min(40, it.pos.p | 0)), r = Math.max(0, Math.min(it.pos.r | 0, M.rows - h)), c = Math.max(0, Math.min(it.pos.c | 0, M.cols - w)), g = G(p);
      if(cellFree(g, r, c, w, h)){ cellMark(g, r, c, w, h); out[i] = { p, r, c, w, h }; return; }
      const n = nearestFree(g, r, c, w, h); if(n){ cellMark(g, n.r, n.c, w, h); out[i] = { p, r: n.r, c: n.c, w, h }; }
    });
    layout.forEach((it, i) => {
      if(out[i]) return; const [w, h] = dimsOf(it);
      for(let p = 0; p <= 40; p++){ const g = G(p), n = nearestFree(g, 0, 0, w, h); if(n){ cellMark(g, n.r, n.c, w, h); out[i] = { p, r: n.r, c: n.c, w, h }; return; } }
      out[i] = { p: 0, r: 0, c: 0, w, h };
    });
    return out;
  }
  function makeItem(it){
    const el = document.createElement('div'); el.className = 'item'; el.dataset.k = it.k; el.style.setProperty('--jd', (-Math.random() * 0.26).toFixed(2) + 's');
    const rec = { el, it, inst: null };
    if(it.t === 'a'){ const a = APP(it.id); el.innerHTML = '<div class="in"><div class="app desk-app" data-app="' + a.id + '" tabindex="0" role="button" aria-label="Open ' + esc(a.name) + '">' + osAppTile(a, M.ic) + '<span class="lb">' + esc(a.name) + '</span><button class="rmbtn" aria-label="Remove">' + osIcon('minus', 14, 3) + '</button></div></div>'; }
    else { const def = WIDGETS.find(w => w.id === it.id); el.innerHTML = '<div class="in"><div class="widget ' + (def.cls || '') + ' ' + it.size + '" data-w="' + def.id + '"><div class="w"></div><button class="rmbtn" aria-label="Remove">' + osIcon('minus', 14, 3) + '</button><button class="sz" aria-label="Change size">' + szLabel(it.size) + '</button></div></div>'; }
    items.set(it.k, rec); return rec;
  }
  function mountWidget(rec){
    const def = WIDGETS.find(w => w.id === rec.it.id), box = $('.w', rec.el); if(!def || !box) return;
    if(rec.inst && rec.inst.destroy) try{ rec.inst.destroy(); }catch(e){}
    box.className = 'w'; box.innerHTML = ''; rec.inst = null;
    try{ rec.inst = def.mount(box, rec.it.size, wctx) || {}; }catch(e){ console.error('[widget ' + def.id + ']', e); }
  }
  function relayoutHome(animate){
    if(!S.w) return; M = metrics(); S.cols = M.cols; S.rows = M.rows;
    const slots = pack(); pageCount = Math.max(1, ...slots.map(s => s.p + 1), dragPages); if(curPage >= pageCount) curPage = pageCount - 1;
    while(pagesEl.children.length < pageCount){ const p = document.createElement('div'); p.className = 'page'; pagesEl.appendChild(p); }
    while(pagesEl.children.length > pageCount) pagesEl.lastChild.remove();
    const keep = new Set();
    layout.forEach((it, i) => {
      keep.add(it.k); let rec = items.get(it.k); const fresh = !rec; if(!rec) rec = makeItem(it); rec.it = it; const s = slots[i], pg = pagesEl.children[drag && drag.rec === rec ? curPage : s.p]; rec.slot = s;
      if(rec.el.parentNode !== pg) pg.appendChild(rec.el);
      const widget = it.t === 'w', x = M.pad + s.c * M.cw + (widget ? 6 : 0), y = M.topY + s.r * M.rh + (widget ? 4 : 0);
      rec.el.style.width = (widget ? s.w * M.cw - 12 : M.cw) + 'px'; rec.el.style.height = (widget ? s.h * M.rh - 14 : M.rh) + 'px';
      if(widget){ const wd = $('.widget', rec.el); wd.className = 'widget ' + (WIDGETS.find(w => w.id === it.id).cls || '') + ' ' + it.size; const sig = M.cols + 'x' + M.rows + 'x' + Math.round(M.cw / 6) + 'x' + Math.round(M.rh / 6); if(fresh || rec.size !== it.size || rec.cols !== sig){ rec.size = it.size; rec.cols = sig; rec.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; mountWidget(rec); } }
      else { const t = $('.tile', rec.el); if(t && t.style.width !== M.ic + 'px'){ t.outerHTML = osAppTile(APP(it.id), M.ic); } }
      rec.el.classList.toggle('settle', animate && !fresh && !rec.el.classList.contains('dragging'));
      if(!rec.el.classList.contains('dragging')) rec.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      rec.x = x; rec.y = y; rec.page = s.p;
    });
    items.forEach((rec, k) => { if(!keep.has(k)){ if(rec.inst && rec.inst.destroy) try{ rec.inst.destroy(); }catch(e){} rec.el.remove(); items.delete(k); } });
    renderDock(); renderDots(); updateBadges();
    $('#dots').style.bottom = (M.dockH - 8) + 'px';
  }
  function renderDock(){
    const ids = dockIds(), size = Math.max(30, Math.min(56, Math.floor((S.w * 0.94 - 24) / Math.max(1, ids.length) - 6))), sig = ids.join() + '|' + size;
    if(dockEl.dataset.sig !== sig){ dockEl.dataset.sig = sig; dockEl.innerHTML = ids.map(id => '<button class="app" data-app="' + id + '" data-tip="' + esc(APP(id).name) + '" aria-label="' + esc(APP(id).name) + '">' + osAppTile(id, size) + '</button>').join(''); }
    $$('.app', dockEl).forEach(a => a.classList.toggle('open', wins.has(a.dataset.app)));
    updateBadges();
  }
  function renderDots(){ const d = $('#dots'); d.innerHTML = pageCount > 1 ? Array.from({ length: pageCount }, (_, i) => '<i class="' + (i === curPage ? 'on' : '') + '"></i>').join('') : ''; }
  pagesEl.addEventListener('scroll', () => { if(drag) return; const p = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth)); if(p !== curPage){ curPage = p; $$('#dots i').forEach((e, i) => e.classList.toggle('on', i === p)); } }, { passive: true });
  function updateBadges(){
    const counts = { Messages: OS.mail.unread(), Bank: OS.bank.open().length };
    $$('[data-app]').forEach(a => { const n = counts[a.dataset.app] || 0, t = $('.tile', a); let b = $('.badge', a); if(n && t){ if(!b){ b = document.createElement('span'); b.className = 'badge'; t.appendChild(b); } if(b.textContent != n) b.textContent = n > 99 ? '99+' : n; } else if(b) b.remove(); });
  }
  K.on('mail', updateBadges); K.on('bank', updateBadges);
  const wctx = { OS, esc, money, tile: id => osAppTile(id, 20), spark: drawSpark };
  function drawSpark(cv, pts, color){
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if(!w || !h || pts.length < 2) return;
    if(cv.width !== Math.round(w * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    let lo = Infinity, hi = -Infinity; pts.forEach(p => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }); const span = hi - lo || 1, t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    const X = t => (t - t0) / (t1 - t0 || 1) * w, Y = v => h - 3 - (v - lo) / span * (h - 8);
    const c = color.startsWith('var(') ? getComputedStyle(cv).getPropertyValue(color.slice(4, -1)).trim() : color;
    const step = Math.max(1, Math.floor(pts.length / (w / 1.5))); g.beginPath(); pts.forEach((p, i) => { if(i % step && i !== pts.length - 1) return; const x = X(p[0]), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c + '55'); gr.addColorStop(1, c + '00'); try{ g.fillStyle = gr; g.fill(); }catch(e){}
  }
  /* Widgets say which events matter to them (`on`); the 1 Hz market tick no longer repaints widgets that don't show the price. */
  const EVENTS = ['cash', 'mail', 'bank', 'props', 'market', 'lab', 'games', 'inv', 'stock'];
  EVENTS.forEach(evt => K.on(evt, () => { items.forEach(rec => { if(!rec.inst || !rec.inst.update) return; const def = WIDGETS.find(w => w.id === rec.it.id), on = def && def.on; if(on && !on.includes(evt)) return; try{ rec.inst.update(evt); }catch(e){} }); }));

  /* ================= edit mode + dragging ================= */
  function setEditing(on){
    editing = on; desk.classList.toggle('editing', on);
    editBtn.className = 'mbtn' + (on ? ' accent' : ''); editBtn.innerHTML = on ? osIcon('plus', 14, 2.8) + '<span>Add widget or app</span>' : osIcon('edit', 14, 2.2) + '<span>Edit desktop</span>'; doneBtn.style.display = on ? '' : 'none';
  }
  editBtn.addEventListener('click', () => { if(!editing) setEditing(true); else openGallery(); });
  doneBtn.addEventListener('click', () => { setEditing(false); saveLayout(); });
  desk.addEventListener('click', e => {
    const rmBtn = e.target.closest('.rmbtn'); if(rmBtn && editing){ const k = rmBtn.closest('.item').dataset.k; pinAll(); layout = layout.filter(i => i.k !== k); relayoutHome(true); saveLayout(); return; }
    const sz = e.target.closest('.sz'); if(sz && editing){ pinAll(); const it = layout.find(i => i.k === sz.closest('.item').dataset.k), def = WIDGETS.find(w => w.id === it.id), i = def.sizes.indexOf(it.size); it.size = def.sizes[(i + 1) % def.sizes.length]; sz.textContent = szLabel(it.size); relayoutHome(true); saveLayout(); }
  });
  let drag = null;
  const pageRect = () => pagesEl.children[curPage].getBoundingClientRect();
  desk.addEventListener('pointerdown', e => {
    if(e.button > 0) return; const itemEl = e.target.closest('.item'); if(e.target.closest('.rmbtn,.sz')) return;
    const st = { x: e.clientX, y: e.clientY, t: Date.now(), el: itemEl, id: e.pointerId, moved: false, timer: null };
    if(itemEl){ itemEl.classList.add('pressed'); if(editing) beginDrag(st, e); }
    desk._press = st;
  });
  function beginDrag(st, e){
    const rec = items.get(st.el.dataset.k); if(!rec) return; pinAll();
    const r = st.el.getBoundingClientRect(), g = document.createElement('div'); g.className = 'drop-ghost';
    drag = { rec, el: st.el, dx: e.clientX - r.left, dy: e.clientY - r.top, edgeT: 0, edge: 0, id: st.id, ghost: g, target: rec.slot ? { p: rec.slot.p, r: rec.slot.r, c: rec.slot.c } : null };
    st.el.classList.remove('settle', 'pressed'); st.el.classList.add('dragging'); try{ st.el.setPointerCapture(st.id); }catch(_){}
    pagesEl.style.overflowX = 'hidden';
  }
  /* The cell nearest to a point on the current page that the dragged item fits in (other items keep their cells). */
  function dropSpot(rec, x, y){
    const [w, h] = dimsOf(rec.it), g = newGrid(); items.forEach(o => { if(o === rec || !o.slot || o.slot.p !== curPage) return; cellMark(g, Math.min(o.slot.r, M.rows - 1), Math.min(o.slot.c, M.cols - 1), Math.min(o.slot.w, M.cols - o.slot.c), Math.min(o.slot.h, M.rows - o.slot.r)); });
    const r0 = Math.max(0, Math.min(M.rows - h, Math.round((y - M.topY) / M.rh))), c0 = Math.max(0, Math.min(M.cols - w, Math.round((x - M.pad) / M.cw))), n = nearestFree(g, r0, c0, w, h);
    return n ? { p: curPage, r: n.r, c: n.c } : null;
  }
  function paintGhost(){
    if(!drag) return; const t = drag.target, pg = pagesEl.children[curPage]; if(!t || !pg){ drag.ghost.remove(); return; }
    const [w, h] = dimsOf(drag.rec.it), widget = drag.rec.it.t === 'w';
    if(drag.ghost.parentNode !== pg) pg.appendChild(drag.ghost);
    Object.assign(drag.ghost.style, { width: (widget ? w * M.cw - 12 : M.cw) + 'px', height: (widget ? h * M.rh - 14 : M.rh) + 'px', transform: 'translate3d(' + (M.pad + t.c * M.cw + (widget ? 6 : 0)) + 'px,' + (M.topY + t.r * M.rh + (widget ? 4 : 0)) + 'px,0)' });
  }
  window.addEventListener('pointermove', e => {
    const st = desk._press; if(st && (Math.abs(e.clientX - st.x) > 6 || Math.abs(e.clientY - st.y) > 6)){ st.moved = true; if(st.el && !drag) st.el.classList.remove('pressed'); }
    if(!drag) return;
    const pr = pageRect(), x = e.clientX - pr.left - drag.dx, y = e.clientY - pr.top - drag.dy;
    drag.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    const spot = dropSpot(drag.rec, x - (drag.rec.it.t === 'w' ? 6 : 0), y - (drag.rec.it.t === 'w' ? 4 : 0)); if(spot){ drag.target = spot; paintGhost(); }
    const sw = pagesEl.clientWidth, edge = e.clientX - pr.left < 36 ? -1 : e.clientX - pr.left > sw - 36 ? 1 : 0;
    if(edge !== drag.edge){ drag.edge = edge; clearTimeout(drag.edgeT); if(edge) drag.edgeT = setTimeout(() => flipPage(edge), 520); }
  });
  function flipPage(dir){
    if(!drag) return; const np = Math.max(0, Math.min(pageCount, curPage + dir)); if(np === curPage) return;
    dragPages = Math.max(dragPages, np + 1); curPage = np; relayoutHome(false);        // the page just past the last one is offered as a fresh page
    pagesEl.style.overflowX = 'auto'; pagesEl.scrollTo({ left: np * pagesEl.clientWidth, behavior: reduceMotion() ? 'auto' : 'smooth' }); setTimeout(() => { if(drag) pagesEl.style.overflowX = 'hidden'; }, 480);
    drag.edge = 0; drag.target = null; if(drag.ghost.parentNode) drag.ghost.remove();
  }
  function endPress(e){
    const st = desk._press; desk._press = null; if(!st) return; if(st.el) st.el.classList.remove('pressed');
    if(drag){ clearTimeout(drag.edgeT); const el = drag.el, d = drag; drag = null; dragPages = 0; d.ghost.remove(); if(d.target) d.rec.it.pos = d.target; el.classList.remove('dragging'); try{ el.releasePointerCapture(st.id); }catch(_){} pagesEl.style.overflowX = 'auto'; const pn = Math.min(curPage, Math.max(0, (d.target ? d.target.p : curPage))); relayoutHome(true); pagesEl.scrollTo({ left: Math.min(pageCount - 1, pn) * pagesEl.clientWidth }); saveLayout(); return; }
    if(!st.moved && !editing && Date.now() - st.t < 600){
      const a = e.target.closest && e.target.closest('[data-app]'); if(a){ openApp(a.dataset.app, $('.tile', a)); return; }
      const w = e.target.closest && e.target.closest('.widget'); if(w){ const def = WIDGETS.find(x => x.id === w.dataset.w); if(def && def.preview){ OS.preview(def.preview); } else if(def && def.url){ window.open(def.url, '_blank', 'noopener'); } else if(def) openApp(def.app, w); }
    }
  }
  window.addEventListener('pointerup', endPress); window.addEventListener('pointercancel', endPress);
  /* keyboard: Enter / Space opens the focused icon; in edit mode the arrow keys move it one cell at a time */
  desk.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('.item'); if(!el) return; const rec = items.get(el.dataset.k); if(!rec) return;
    if(!editing && (e.key === 'Enter' || e.key === ' ')){ const a = e.target.closest('[data-app]'); if(a){ e.preventDefault(); openApp(a.dataset.app, $('.tile', a)); } return; }
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]; if(!editing || !d || !rec.slot) return; e.preventDefault(); pinAll();
    const [w, h] = dimsOf(rec.it), g = newGrid(); items.forEach(o => { if(o !== rec && o.slot && o.slot.p === rec.slot.p) cellMark(g, o.slot.r, o.slot.c, Math.min(o.slot.w, M.cols - o.slot.c), Math.min(o.slot.h, M.rows - o.slot.r)); });
    const r = rec.slot.r + d[0], c = rec.slot.c + d[1]; if(cellFree(g, r, c, w, h)){ rec.it.pos = { p: rec.slot.p, r, c }; relayoutHome(true); saveLayout(); const again = $('.item[data-k="' + rec.it.k + '"] [data-app]', desk); if(again) again.focus(); }
  });
  dockEl.addEventListener('click', e => { const a = e.target.closest('[data-app]'); if(a) toggleApp(a.dataset.app, $('.tile', a)); });

  /* ================= add-to-desktop panel ================= */
  const sheetWrap = $('#sheetwrap'), sheet = $('#sheet'); let galPreview = [];
  const dflt = w => w.sizes.includes('s') ? 's' : w.sizes[0];
  function openGallery(tab){
    tab = tab || 'w'; const inUse = new Set(layout.filter(i => i.t === 'a').map(i => i.id).concat(dockIds()));
    sheet.innerHTML = '<div class="sh"><h2>Add to desktop</h2><button class="x" aria-label="Close">' + osIcon('x', 15, 2.6) + '</button></div>' +
      '<div class="seg" style="--n:2"><div class="thumb" style="transform:translateX(' + (tab === 'w' ? 0 : 100) + '%)"></div><button data-t="w">Widgets</button><button data-t="a">App shortcuts</button></div><div class="body"></div>';
    const body = $('.body', sheet); galPreview.forEach(p => { try{ p.destroy && p.destroy(); }catch(e){} }); galPreview = [];
    if(tab === 'w'){
      body.innerHTML = '<div class="gal-grid">' + WIDGETS.map(w => '<div class="gal-item" data-wid="' + w.id + '"><div class="gal-prev"></div><div><b>' + esc(w.name) + '</b><br><small>' + esc(w.desc) + '</small></div><div class="sizes">' + w.sizes.map((s, i) => '<button class="btn sm ' + (s === dflt(w) ? '' : 'alt') + '" data-size="' + s + '">' + (SIZE_NAMES[s] || s) + '</button>').join('') + '</div></div>').join('') + '</div>';
      $$('.gal-item', body).forEach(card => {
        const def = WIDGETS.find(w => w.id === card.dataset.wid), prev = $('.gal-prev', card);
        const show = size => { galPreview.forEach(p => { if(p.card === card && p.destroy) try{ p.destroy(); }catch(e){} }); prev.innerHTML = ''; const [cw, ch] = SIZES[size], W = cw * M.cw - 12, H = ch * M.rh - 14, wd = document.createElement('div'); wd.className = 'widget ' + (def.cls || '') + ' ' + size; wd.style.cssText = 'width:' + W + 'px;height:' + H + 'px'; wd.innerHTML = '<div class="w"></div>'; prev.appendChild(wd);
          const k = Math.min((prev.clientWidth - 16) / W, (prev.clientHeight - 12) / H); wd.style.transform = 'translate(' + (-W * k / 2) + 'px,' + (-H * k / 2) + 'px) scale(' + k + ')'; wd.style.left = '50%'; wd.style.top = '50%';
          try{ const inst = def.mount($('.w', wd), size, wctx) || {}; inst.card = card; galPreview.push(inst); }catch(e){} card.dataset.cur = size; };
        show(dflt(def));
        card.addEventListener('click', e => { const b = e.target.closest('[data-size]'); if(!b) return; $$('[data-size]', card).forEach(x => x.classList.toggle('alt', x !== b)); show(b.dataset.size); });
        const add = document.createElement('button'); add.className = 'btn sm'; add.textContent = 'Add'; $('.sizes', card).after(add);
        add.addEventListener('click', () => { addToDesk({ t: 'w', id: def.id, size: card.dataset.cur || dflt(def), k: wk() }); closeSheet(); toast(def.name + ' added'); });
      });
    } else {
      const free = OS_APPS.filter(a => !inUse.has(a.id));
      body.innerHTML = free.length ? '<div class="gal-apps">' + free.map(a => '<div class="app" data-add="' + a.id + '">' + osAppTile(a, 60) + '<span class="lb">' + esc(a.name) + '</span></div>').join('') + '</div>' : '<p style="text-align:center;color:var(--label2);font:500 15px var(--font);padding:40px 0">Every app already has an icon on your desktop or in the dock.<br><small>Remove one from the dock in Settings to add it here.</small></p>';
      $$('[data-add]', body).forEach(el => el.addEventListener('click', () => { addToDesk({ t: 'a', id: el.dataset.add, k: 'a-' + el.dataset.add }); closeSheet(); toast(APP(el.dataset.add).name + ' added'); }));
    }
    $$('.seg button', sheet).forEach(b => b.addEventListener('click', () => openGallery(b.dataset.t))); $('.x', sheet).addEventListener('click', closeSheet);
    sheetWrap.classList.add('open');
  }
  function closeSheet(){ sheetWrap.classList.remove('open'); setTimeout(() => { galPreview.forEach(p => { try{ p.destroy && p.destroy(); }catch(e){} }); galPreview = []; }, 400); }
  $('.scrim', sheetWrap).addEventListener('click', closeSheet);
  function addToDesk(it){ pinAll(); const [w, h] = (it.t === 'a' ? [1, 1] : SIZES[it.size]), g = newGrid(); items.forEach(o => { if(o.slot && o.slot.p === curPage) cellMark(g, o.slot.r, o.slot.c, Math.min(o.slot.w, M.cols - o.slot.c), Math.min(o.slot.h, M.rows - o.slot.r)); }); const n = nearestFree(g, 0, 0, Math.min(w, M.cols), Math.min(h, M.rows)); if(n) it.pos = { p: curPage, r: n.r, c: n.c }; layout.push(it); relayoutHome(true); saveLayout(); }
  let toastT; function toast(msg){ let t = $('.toast', screen); if(!t){ t = document.createElement('div'); t.className = 'toast'; screen.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }

  /* ================= windows ================= */
  const wins = new Map();                         // appId → { el, g:{x,y,w,h,max,prev}, iframe, loaded }
  let zTop = 10, focusId = null, cascade = 0;
  /* ---- bug-report context: recent script errors from the desktop and every app, so a report arrives with the evidence ---- */
  const recent = [];
  /* Errors are captured by os/diag.js (loaded first): stacks, promise rejections, console.error/warn, failed script loads. The desktop window is
     hooked there; each app window is hooked here when its iframe loads, so a report names the app that failed. */
  const hookErrs = (win, src) => { try{ if(K.diag) K.diag.hook(win, src); }catch(_){} };
  const EASE = 'cubic-bezier(.22,.9,.28,1)', MIN_W = 380, MIN_H = 300;
  const DEFAULT_SIZE = { Stocks: [1040, 720], WestLab: [1080, 740], WestShop: [1040, 720], Photos: [1040, 720], Notes: [1000, 720], WestReport: [820, 700], Files: [940, 660], Settings: [860, 660], Messages: [860, 640], Bank: [900, 720], News: [940, 740], RealEstate: [1000, 720], WestMap: [1240, 800], Games: [940, 700], Arcade: [940, 760], WestFactory: [1200, 760], Leaderboard: [1000, 740], Preview: [1000, 740] };
  const small = () => S.w < 700;
  const winArea = () => ({ w: S.w, h: S.h - MB });
  const maxRect = () => ({ x: 0, y: 0, w: S.w, h: S.h - MB - (small() ? 0 : DOCK_KEEP[dockMode()]) });
  const iconRect = id => { const el = $('[data-app="' + id + '"] .tile', dockEl) || $('[data-app="' + id + '"] .tile', desk); if(!el) return { x: S.w / 2 - 26, y: S.h - MB - 70, w: 52, h: 52 }; const r = el.getBoundingClientRect(), s = winsEl.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
  const applyGeom = w => { const g = w.g; w.el.style.width = g.w + 'px'; w.el.style.height = g.h + 'px'; w.el.style.transform = 'translate3d(' + g.x + 'px,' + g.y + 'px,0)'; w.el.classList.toggle('max', !!g.max); };
  const saveGeom = () => { const out = Object.assign({}, K.prefs.winGeom || {}); wins.forEach((w, id) => { out[id] = { x: w.g.x, y: w.g.y, w: w.g.w, h: w.g.h, max: !!w.g.max, prev: w.g.prev || null }; }); K.setPref('winGeom', out); };
  function initialGeom(id){
    const A = winArea(), mr = maxRect(), saved = (K.prefs.winGeom || {})[id];
    if(small()) return { x: 0, y: 0, w: mr.w, h: mr.h, max: true };
    if(saved && saved.w >= MIN_W){ const g = { x: saved.x, y: saved.y, w: Math.min(saved.w, A.w), h: Math.min(saved.h, A.h - 60), max: !!saved.max, prev: saved.prev || null }; if(g.max){ Object.assign(g, { prev: g.prev || { x: 80, y: 40, w: 900, h: 640 } }, mr); } return g; }
    const d = DEFAULT_SIZE[id] || [940, 680], w = Math.min(d[0], A.w - 60), h = Math.min(d[1], A.h - 150), off = (cascade++ % 6) * 28;
    return { x: Math.max(10, Math.round((A.w - w) / 2) + off - 70), y: Math.max(10, Math.min(Math.round((A.h - h) / 2) - 40 + off, A.h - DOCK_H[dockMode()] - h)), w, h, max: false };      // keeps new windows clear of the dock
  }
  const clampGeom = g => { const A = winArea(); g.w = Math.max(MIN_W, Math.min(g.w, A.w)); g.h = Math.max(MIN_H, Math.min(g.h, A.h)); g.x = Math.max(-g.w + 140, Math.min(g.x, A.w - 140)); g.y = Math.max(0, Math.min(g.y, A.h - 38)); return g; };
  function fitWindows(){ wins.forEach(w => { if(small() || w.g.max){ Object.assign(w.g, maxRect(), { max: true }); } else clampGeom(w.g); applyGeom(w); }); }
  function setFocus(id){
    if(id && id !== 'WestReport'){ const i = recent.indexOf(id); if(i > -1) recent.splice(i, 1); recent.unshift(id); recent.length = Math.min(recent.length, 4); }
    if(id === 'WestReport' && K.diag) K.diag.markSeen();
    focusId = id; wins.forEach((w, k) => w.el.classList.toggle('focus', k === id)); const w = wins.get(id); if(w) w.el.style.zIndex = ++zTop;
    mbApp.textContent = id && APP(id) ? APP(id).name : ''; K.emit('focus', id);
  }
  function openApp(id, originEl){
    const app = APP(id); if(!app) return;
    if(wins.has(id)){ const w = wins.get(id); if(w.el.classList.contains('hidden')) restoreWin(id); setFocus(id); return; }
    { const mm = (K.maint.ready() && OS.auth.ready()) ? K.maint.appMsg(id) : ''; if(mm){ maintDialog(app, mm); return; } }
    { const gt = OS.homes && OS.homes.gate ? OS.homes.gate(id) : null; if(gt){ plotDialog(app, gt); return; } }                  // WestFactory needs an industrial plot, WestLab a laboratory in the University Quarter (bought in WestMap)          // maintenance mode: "'X' is in maintenance mode"
    const g = initialGeom(id), el = document.createElement('div'); el.className = 'win';
    const dir = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map(d => '<i class="rz ' + d + '" data-d="' + d + '"></i>').join('');
    el.innerHTML = '<div class="tb"><div class="lights"><button class="lbtn c" aria-label="Close" title="Close"><svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5"/></svg></button><button class="lbtn m" aria-label="Minimize" title="Minimize"><svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 4h5"/></svg></button><button class="lbtn z" aria-label="Maximize" title="Maximize"><svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.2V3M1.8 6.2H5M6.2 1.8V5M6.2 1.8H3"/></svg></button></div><div class="ttl">' + osAppTile(app, 16) + '<span>' + esc(app.name) + '</span></div></div>' +
      '<div class="body"><div class="splash">' + osAppTile(app, 96) + '</div><iframe title="' + esc(app.name) + '" src="apps/' + app.file + '" allow="fullscreen"></iframe></div>' + dir;
    winsEl.appendChild(el); const w = { el, g, iframe: $('iframe', el), loaded: false }; wins.set(id, w); applyGeom(w);
    $('.lbtn.c', el).addEventListener('click', e => { e.stopPropagation(); closeApp(id); });
    $('.lbtn.m', el).addEventListener('click', e => { e.stopPropagation(); minimizeWin(id); });
    $('.lbtn.z', el).addEventListener('click', e => { e.stopPropagation(); toggleMax(id); });
    el.addEventListener('pointerdown', () => { if(focusId !== id) setFocus(id); }, true);
    wireDrag(id, w); wireResize(id, w); wireLights(w);
    w.iframe.addEventListener('load', () => { w.loaded = true; hookErrs(w.iframe.contentWindow, id); $('.splash', el).classList.add('gone'); try{ w.iframe.contentWindow.addEventListener('pointerdown', () => { if(focusId !== id) setFocus(id); }, true); }catch(e){} });
    setTimeout(() => { if(wins.get(id) === w) $('.splash', el).classList.add('gone'); }, 4500);          // never leave the splash up forever
    setFocus(id); renderDock(); history.replaceState(null, '', '#open=' + id);
    if(!reduceMotion()){ const o = originEl ? relRect(originEl) : iconRect(id), sc = 0.12; el.animate([{ opacity: 0, transform: 'translate3d(' + (o.x + o.w / 2 - g.w / 2) + 'px,' + (o.y + o.h / 2 - g.h / 2) + 'px,0) scale(' + sc + ')' }, { opacity: 1, transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(1)' }], { duration: 420, easing: EASE }); }
  }
  const relRect = el => { const r = el.getBoundingClientRect(), s = winsEl.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
  function toggleApp(id, originEl){ const w = wins.get(id); if(!w) return openApp(id, originEl); if(w.el.classList.contains('hidden')){ restoreWin(id); setFocus(id); } else if(focusId === id) minimizeWin(id); else setFocus(id); }
  function closeApp(id){
    const w = wins.get(id); if(!w) return Promise.resolve(); wins.delete(id); if(focusId === id){ const next = [...wins.entries()].filter(([, x]) => !x.el.classList.contains('hidden')).sort((a, b) => (+b[1].el.style.zIndex || 0) - (+a[1].el.style.zIndex || 0))[0]; setFocus(next ? next[0] : null); }
    renderDock(); if(!wins.size) history.replaceState(null, '', location.pathname);
    try{ w.iframe.contentWindow.dispatchEvent(new Event('pagehide')); }catch(e){}                       // lets the app release its live subscriptions (market ticks, listeners)
    const done = () => { w.el.remove(); }; if(reduceMotion()) { done(); return Promise.resolve(); }
    const g = w.g, a = w.el.animate([{ opacity: 1, transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(1)' }, { opacity: 0, transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(.92)' }], { duration: 190, easing: 'ease-in', fill: 'forwards' });
    return new Promise(res => { a.onfinish = () => { done(); res(); }; });
  }
  function minimizeWin(id){
    const w = wins.get(id); if(!w || w.el.classList.contains('hidden')) return; const g = w.g, o = iconRect(id);
    const finish = () => { w.el.classList.add('hidden'); if(focusId === id){ const next = [...wins.entries()].filter(([k, x]) => k !== id && !x.el.classList.contains('hidden')).sort((a, b) => (+b[1].el.style.zIndex || 0) - (+a[1].el.style.zIndex || 0))[0]; setFocus(next ? next[0] : null); } };
    if(reduceMotion()) return finish();
    const a = w.el.animate([{ opacity: 1, transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(1)' }, { opacity: 0.2, transform: 'translate3d(' + (o.x + o.w / 2 - g.w / 2) + 'px,' + (o.y + o.h / 2 - g.h / 2) + 'px,0) scale(.1)' }], { duration: 340, easing: 'cubic-bezier(.5,0,.75,0)' }); a.onfinish = finish;
  }
  function restoreWin(id){
    const w = wins.get(id); if(!w) return; w.el.classList.remove('hidden'); setFocus(id);
    if(!reduceMotion()){ const g = w.g, o = iconRect(id); w.el.animate([{ opacity: 0.2, transform: 'translate3d(' + (o.x + o.w / 2 - g.w / 2) + 'px,' + (o.y + o.h / 2 - g.h / 2) + 'px,0) scale(.1)' }, { opacity: 1, transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(1)' }], { duration: 380, easing: EASE }); }
  }
  function flipTo(w, old){                         // animate a window from its old rect to its new rect with transforms only
    if(reduceMotion()) return; const g = w.g, sx = old.w / g.w, sy = old.h / g.h;
    w.el.animate([{ transformOrigin: '0 0', transform: 'translate3d(' + old.x + 'px,' + old.y + 'px,0) scale(' + sx + ',' + sy + ')' }, { transformOrigin: '0 0', transform: 'translate3d(' + g.x + 'px,' + g.y + 'px,0) scale(1,1)' }], { duration: 260, easing: EASE });
  }
  function toggleMax(id){
    const w = wins.get(id); if(!w || small()) return; const old = { x: w.g.x, y: w.g.y, w: w.g.w, h: w.g.h };
    if(w.g.max){ const p = w.g.prev || { x: 80, y: 40, w: 900, h: 640 }; Object.assign(w.g, p, { max: false }); }
    else { w.g.prev = old; Object.assign(w.g, maxRect(), { max: true }); }
    applyGeom(w); flipTo(w, old); saveGeom();
  }
  /* Window buttons grow as the pointer approaches (like the dock), so they are easy to hit; a coarse pointer (touch) gets big ones permanently. */
  function wireLights(w){
    const tb = $('.tb', w.el), btns = $$('.lbtn', w.el), R = 72, MAXS = 1.85;
    const reset = () => { btns.forEach(b => b.style.setProperty('--s', 1)); w.el.classList.remove('near'); };
    tb.addEventListener('pointermove', e => {
      if(e.pointerType === 'touch' || w.el.classList.contains('dragging')) return; let near = false;
      btns.forEach(b => { const r = b.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)), k = Math.max(0, 1 - d / R); if(k > 0) near = true; b.style.setProperty('--s', (1 + (MAXS - 1) * k * k * (3 - 2 * k)).toFixed(3)); });
      w.el.classList.toggle('near', near);
    });
    tb.addEventListener('pointerleave', reset); tb.addEventListener('pointerdown', () => { if(!w.el.classList.contains('near')) reset(); });
  }
  function wireDrag(id, w){
    const tb = $('.tb', w.el); let d = null;
    tb.addEventListener('dblclick', e => { if(!e.target.closest('.lights')) toggleMax(id); });
    tb.addEventListener('pointerdown', e => { if(e.button > 0 || e.target.closest('.lights') || small()) return; d = { sx: e.clientX, sy: e.clientY, gx: w.g.x, gy: w.g.y, moved: false }; tb.setPointerCapture(e.pointerId); });
    tb.addEventListener('pointermove', e => {
      if(!d) return; const dx = e.clientX - d.sx, dy = e.clientY - d.sy; if(!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if(!d.moved){ d.moved = true; w.el.classList.add('dragging'); screen.classList.add('moving'); d.stop = meter();
        if(w.g.max){ const p = w.g.prev || { w: 900, h: 640 }, fx = (e.clientX - 0) / S.w; w.g.max = false; w.g.w = p.w; w.g.h = p.h; w.g.x = Math.round(e.clientX - p.w * fx); w.g.y = 0; d.gx = w.g.x; d.gy = 0; d.sx = e.clientX; d.sy = e.clientY; w.el.style.width = w.g.w + 'px'; w.el.style.height = w.g.h + 'px'; w.el.classList.remove('max'); } }
      w.g.x = d.gx + (e.clientX - d.sx); w.g.y = d.gy + (e.clientY - d.sy); clampGeom(w.g);
      if(!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; w.el.style.transform = 'translate3d(' + w.g.x + 'px,' + w.g.y + 'px,0)'; });          // one paint per frame, however many pointer events arrive
    });
    const end = e => { if(!d) return; const m = d.moved; if(m){ cancelAnimationFrame(d.raf); w.el.style.transform = 'translate3d(' + w.g.x + 'px,' + w.g.y + 'px,0)'; screen.classList.remove('moving'); d.stop && d.stop(); } d = null; w.el.classList.remove('dragging'); try{ tb.releasePointerCapture(e.pointerId); }catch(_){} if(m){
      if(w.g.y <= 0 && e.clientY <= MB + 4 && !small()){ const old = { x: w.g.x, y: w.g.y, w: w.g.w, h: w.g.h }; w.g.prev = old; Object.assign(w.g, maxRect(), { max: true }); applyGeom(w); flipTo(w, old); }     // fling to the top edge to maximize
      saveGeom(); } };
    tb.addEventListener('pointerup', end); tb.addEventListener('pointercancel', end);
  }
  function wireResize(id, w){
    let r = null;
    $$('.rz', w.el).forEach(h => {
      h.addEventListener('pointerdown', e => { if(small() || w.g.max || e.button > 0) return; e.stopPropagation(); r = { d: h.dataset.d, sx: e.clientX, sy: e.clientY, g: Object.assign({}, w.g) }; w.el.classList.add('resizing'); screen.classList.add('moving'); r.stop = meter(); h.setPointerCapture(e.pointerId); });
      h.addEventListener('pointermove', e => {
        if(!r) return; const dx = e.clientX - r.sx, dy = e.clientY - r.sy, d = r.d, g = w.g, o = r.g, A = winArea();
        let x = o.x, y = o.y, wd = o.w, ht = o.h;
        if(d.includes('e')) wd = Math.max(MIN_W, Math.min(o.w + dx, A.w - o.x)); if(d.includes('s')) ht = Math.max(MIN_H, Math.min(o.h + dy, A.h - o.y));
        if(d.includes('w')){ const nw = Math.max(MIN_W, o.w - dx); x = o.x + (o.w - nw); wd = nw; } if(d.includes('n')){ const nh = Math.max(MIN_H, o.h - dy); y = Math.max(0, o.y + (o.h - nh)); ht = o.h - (y - o.y); }
        Object.assign(g, { x, y, w: wd, h: ht }); if(!r.raf) r.raf = requestAnimationFrame(() => { if(r) r.raf = 0; applyGeom(w); });
      });
      const end = e => { if(!r) return; cancelAnimationFrame(r.raf); applyGeom(w); screen.classList.remove('moving'); r.stop && r.stop(); r = null; w.el.classList.remove('resizing'); try{ h.releasePointerCapture(e.pointerId); }catch(_){} saveGeom(); };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    });
  }
  document.addEventListener('keydown', e => { if(e.key === 'Escape'){ if(sheetWrap.classList.contains('open')) closeSheet(); else if(editing){ setEditing(false); saveLayout(); } } });

  /* ---- market-moving headlines become notifications while you're playing ---- */
  let lastNews = null;
  /* A story now lands every 15 minutes, so only the ones that matter to YOU (you hold that element or own that kind of property) or that are big make a banner. */
  const mattersToMe = a => { const i = a.impact, p = Math.abs(i.pct); if(i.el) return p >= 0.3 || OS.shop.qty('element', i.el) > 0; if(i.sector) return p >= 0.05 || OS.props.list().some(x => x.owned && x.sector === i.sector); return p >= 0.04; };
  function watchNews(){ const a = OS.world.articles(1)[0]; if(!a) return; if(lastNews && a.id !== lastNews && a.impact && mattersToMe(a)){ const p = a.impact.pct * 100; K.emit('notify', { app: 'News', title: 'Market news', body: a.headline + ' (' + (p >= 0 ? '▲' : '▼') + Math.abs(Math.round(p)) + '%)' }); } lastNews = a.id; }
  setInterval(watchNews, 60000); setTimeout(watchNews, 2500);

  /* ================= notifications ================= */
  const bannersEl = $('#banners');
  K.on('notify', n => {
    const w = wins.get(n.app || 'Messages'); if(!K.prefs.banners || (w && focusId === (n.app || 'Messages') && n.app !== 'Settings')) return;
    if(lockOn){ renderLockNotifs(); return; }
    const app = APP(n.app || 'Messages') || APP('Messages'), b = document.createElement('div'); b.className = 'banner';
    b.innerHTML = osAppTile(app, 38) + '<div class="tx"><b>' + esc(n.title) + '</b><span class="t">' + esc(n.body) + '</span></div><span class="nw">now</span>';
    bannersEl.appendChild(b); while(bannersEl.children.length > 3) bannersEl.firstChild.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('in')));
    const kill = () => { b.classList.remove('in'); b.classList.add('out'); setTimeout(() => b.remove(), 380); }; let t = setTimeout(kill, 5600);
    b.addEventListener('click', () => { clearTimeout(t); kill(); openApp(app.id, null); }); b.addEventListener('mouseenter', () => clearTimeout(t)); b.addEventListener('mouseleave', () => { t = setTimeout(kill, 2000); });
    const dock = $('[data-app="' + app.id + '"]', dockEl); if(dock && !reduceMotion()){ const tl = $('.tile', dock); tl.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-18px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }], { duration: 800 }); }
  });

  /* ================= boot screen / lock screen =================
   * index.html ships with this screen already up (class "locked" + a spinner), so a reload never flashes a stock default desktop first.
   * It stays until the account and the maintenance switches are known, then opens by itself — or waits for a click when "lock screen on start" is on. */
  const lock = $('#lock'), bootAt = performance.now(); let lockOn = true; const clickToEnter = K.prefs.lock === true;
  function clockTick(){ const lt = $('#lockTime'); if(lt && lockOn){ const d = new Date(); lt.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''); $('#lockDate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); } }
  setInterval(clockTick, 5000); clockTick();
  function renderLockNotifs(){ const un = OS.mail.list().filter(m => !m.read).slice(0, 3); $('#lockNotifs').innerHTML = un.map(m => '<div class="banner"><span class="tx"><b>' + esc(m.from) + '</b><span class="t">' + esc(m.subj) + '</span></span></div>').join(''); }
  function bootReady(){
    if(lock.dataset.ready) return; lock.dataset.ready = '1'; lock.classList.add('ready'); $('#lockSpin').style.display = 'none';
    if(clickToEnter){ $('#lockHint').style.display = ''; renderLockNotifs(); } else unlock();
  }
  function bootCheck(){ if(lock.dataset.ready || lock.dataset.waiting || !(OS.auth.ready() && K.maint.ready())) return; lock.dataset.waiting = '1'; setTimeout(bootReady, Math.max(0, 650 - (performance.now() - bootAt))); }       // at least a moment on screen, so it never just flickers
  K.on('auth', bootCheck); K.on('maint', bootCheck); setTimeout(bootReady, 12000);                       // never trap anyone behind a slow connection
  setTimeout(() => { if(!lock.dataset.ready) $('#lockMsg').textContent = 'Still connecting…'; }, 6000);
  function unlock(){
    if(!lockOn || !lock.dataset.ready) return; lockOn = false; screen.classList.remove('locked'); const done = () => { lock.style.display = 'none'; afterUnlock(); };
    if(reduceMotion()) return done(); lock.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 420, easing: EASE, fill: 'forwards' }).onfinish = done;
  }
  lock.addEventListener('click', unlock); document.addEventListener('keydown', e => { if(lockOn && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) unlock(); });
  function afterUnlock(){ const m = /#open=(\w+)/.exec(location.hash); if(m && APP(m[1])) openApp(m[1], null); }

  /* ================= maintenance mode + "open in another window" =================
   * Whole site off → a full-screen notice (the admin is exempt and can sign in from it). One app off → a dialog when you try to open it, a cover over it
   * if it is already open, and a wrench on its dock / desktop icon. The kernel refuses the actions behind it too (see kernel/api.js). */
  const maintEl = $('#maint'), sessEl = $('#sessionLost');
  $('#maintIco').innerHTML = osIcon('hammer', 34, 2); $('#sessionIco').innerHTML = osIcon('layers', 32, 2);
  $('#maintRetry').addEventListener('click', () => location.reload());
  $('#maintAdmin').addEventListener('click', async () => { try{ await OS.auth.google(); }catch(e){} });
  $('#sessionBtn').addEventListener('click', () => location.reload());                              // a reload makes THIS window the active one and loads your latest saved progress
  K.on('session', st => { if(st === 'lost') sessEl.style.display = ''; });
  const maintOn = () => K.maint.ready() && OS.auth.ready();
  function plotDialog(app, gt){
    $$('.mdlg', screen).forEach(x => x.remove()); const lab = gt.kind === 'l', d = document.createElement('div'); d.className = 'mdlg';
    d.innerHTML = '<div class="card"><div class="ico">' + osAppTile(app, 56) + '</div><b>' + (lab ? 'You need a laboratory' : 'You need an industrial plot') + '</b><span>' + (lab ? 'WestLab runs from a laboratory in the University Quarter.' : 'WestFactory runs from a plot in the Industrial Estate.') + ' Buy one once in WestMap for ' + money(gt.fee) + '.</span><button data-go>Open WestMap</button><button data-no style="background:transparent;color:inherit;opacity:.7">Not now</button></div>';
    screen.appendChild(d); const close = () => d.remove(); $('[data-go]', d).addEventListener('click', () => { close(); openApp('WestMap'); }); $('[data-no]', d).addEventListener('click', close); d.addEventListener('click', e => { if(e.target === d) close(); });
  }
  function maintDialog(app, msg){
    $$('.mdlg', screen).forEach(x => x.remove());
    const d = document.createElement('div'), note = K.maint.note(); d.className = 'mdlg';
    d.innerHTML = '<div class="card"><div class="ico">' + osAppTile(app, 56) + '</div><b>' + esc(msg) + '</b><span>' + esc(note || 'Please try again later.') + '</span><button>OK</button></div>';
    screen.appendChild(d); const close = () => d.remove(); $('button', d).addEventListener('click', close); d.addEventListener('click', e => { if(e.target === d) close(); });
  }
  function coverWin(w, id){
    const msg = maintOn() ? K.maint.appMsg(id) : '', c = $('.mcover', w.el);
    if(!msg){ if(c) c.remove(); return; }
    const el = c || document.createElement('div'); el.className = 'mcover'; if(!c) $('.body', w.el).appendChild(el);
    el.innerHTML = '<div><div class="ico">' + osIcon('hammer', 32, 2) + '</div><b>' + esc(msg) + '</b>' + (K.maint.note() ? '<span>' + esc(K.maint.note()) + '</span>' : '') + '</div>';
  }
  let badgeQ = false;
  function paintBadges(){ badgeQ = false; const on = maintOn(); $$('[data-app]').forEach(el => el.classList.toggle('in-maint', on && !!K.maint.appMsg(el.dataset.app))); }
  const queueBadges = () => { if(!badgeQ){ badgeQ = true; requestAnimationFrame(paintBadges); } };
  new MutationObserver(queueBadges).observe(screen, { childList: true, subtree: true });             // icons are re-rendered by the layout code; re-mark them after each render
  function paintMaint(){
    const site = maintOn() ? K.maint.siteMsg() : '';
    maintEl.style.display = site ? '' : 'none';
    if(site){ $('#maintTitle').textContent = site; $('#maintNote').textContent = K.maint.note() || 'We’ll be back shortly.'; }
    wins.forEach((w, id) => coverWin(w, id)); queueBadges();
  }
  K.on('maint', paintMaint); K.on('auth', paintMaint); K.on('loaded', paintMaint); paintMaint();

  /* ================= facade additions + boot ================= */
  OS.open = id => { if(APP(id)){ if(editing) setEditing(false); openApp(id, null); } };
  OS.close = id => closeApp(id || focusId);
  OS.home = () => { [...wins.keys()].forEach(minimizeWin); };           // "show desktop"
  OS.focused = () => focusId; OS.openApps = () => [...wins.keys()];
  OS.theme = theme; OS.screen = () => ({ w: S.w, h: S.h, kind: 'desktop', sat: 0, sab: 0 });
  OS.reportContext = () => { const a = OS.auth.user(); return { url: location.href.split('#')[0], app: recent[0] || null, recentApps: recent.slice(), openWindows: Array.from(wins.keys()), screen: S.w + 'x' + S.h + ' @' + (window.devicePixelRatio || 1) + 'x', theme: document.documentElement.dataset.theme || '', browser: navigator.userAgent, lang: navigator.language, signedIn: !!a, online: navigator.onLine, speed: K.prefs.updateSpeed || 'balanced', dock: K.prefs.dockMode || 'float',
    errors: K.diag ? K.diag.entries(60).filter(e => e.lvl === 'error').slice(-12).map(e => ({ t: e.t, src: e.src, msg: e.msg })) : [],
    diag: K.diag ? K.diag.text(2300) : '',                                                           // compact errors-with-stacks + recent activity + previous-session errors (≤ report limit)
    state: K.diag ? K.diag.probe() : [],                                                              // empty = every part of the saved state has the expected shape
    sync: { signedIn: K.cloud.signedIn(), loaded: !!K.loaded, pending: [...K.dirty].filter(f => f !== 'lb'), sessionLost: !!K.sessionLost, connected: K.cloud.connected, lastError: K.cloud.lastErr ? { code: K.cloud.lastErr.code, msg: K.cloud.lastErr.msg, fields: K.cloud.lastErr.fields } : null, rejected: Object.keys(K.cloud.badFields || {}) } }; };
  /* Preview: the photo viewer. Anything that wants to show a picture hands it over here; one Preview window, which switches to whatever was opened last. */
  let previewItem = null;
  OS.preview = item => { previewItem = item; if(wins.has('Preview')){ K.emit('preview'); openApp('Preview', null); } else openApp('Preview', null); };
  OS.previewTake = () => { const p = previewItem; previewItem = null; return p; };
  OS.toast = toast; OS.openPage = url => window.open(url, '_blank', 'noopener'); OS.apps = () => OS_APPS.map(a => ({ id: a.id, name: a.name, g: a.g, glyph: a.glyph }));
  OS.shell = { defaultDock: () => DEFAULT_DOCK.slice(), resetLayout(){ K.setPref('layout', null); K.setPref('dock', []); K.setPref('winGeom', {}); loadLayout(); relayoutHome(true); }, relayout: () => { loadLayout(); relayoutHome(true); } };
  let dockT = null; const dockZone = document.createElement('div'); dockZone.id = 'dockZone'; screen.appendChild(dockZone);
  function applyDockMode(){ const m = dockMode(); screen.dataset.dock = m; dockEl.classList.remove('peek'); if(S.w){ relayoutHome(true); fitWindows(); } }
  const peek = on => { clearTimeout(dockT); if(on) dockEl.classList.add('peek'); else dockT = setTimeout(() => dockEl.classList.remove('peek'), 450); };
  dockZone.addEventListener('pointerenter', () => peek(true)); dockZone.addEventListener('pointerdown', () => peek(true)); dockZone.addEventListener('pointerleave', () => peek(false));       // the strip sits above windows, so it works over a maximized app too
  dockEl.addEventListener('pointerenter', () => peek(true)); dockEl.addEventListener('pointerleave', () => peek(false)); dockEl.addEventListener('focusin', () => peek(true)); dockEl.addEventListener('focusout', () => peek(false));
  dockEl.addEventListener('click', () => { if(dockMode() === 'hide') peek(false); });                                             // after you pick an app the dock tucks away again
  K.on('prefs', k => { if(k === 'dockMode' || k === '*') applyDockMode(); if(k === 'theme' || k === 'skin' || k === 'seasonal' || k === 'accent' || k === 'skinFx' || k === 'reduceMotion' || k === 'reduceTransparency' || k === 'perfMode' || k === 'perfAuto' || k === '*') applyTheme(); if(k === 'wall' || k === '*'){ wallKey = ''; paintWall(); } if(k === 'iconSize' || k === '*'){ dockEl.dataset.sig = ''; items.forEach(r => { r.cols = -1; }); relayoutHome(true); }
    if(k === 'dock' || k === '*'){ dockEl.dataset.sig = ''; loadLayout(); relayoutHome(true); } });
  K.on('loaded', () => { applyTheme(); loadLayout(); relayoutHome(false); });
  setEditing(false); measure(); screen.dataset.dock = dockMode(); applyTheme(); loadLayout(); relayoutHome(false); K.emit('screen', { w: S.w, h: S.h });
  bootCheck();
});
