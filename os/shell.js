/* SHELL — everything you see around the apps: the device frame, wallpaper, lock screen, home screen (pages, icons, widgets, edit mode),
 * the dock, app windows with their zoom animations, the swipe-up gesture, and notification banners.
 * It never touches game state directly — it talks to the kernel through the same facade the apps use. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade, WIDGETS = (window.__OSW || []).slice(); delete window.__OSW;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, compact) => { n = +n || 0; if(compact && Math.abs(n) >= 1e6){ const u = ['', 'K', 'M', 'B', 'T', 'Qa']; let i = 0; while(Math.abs(n) >= 1000 && i < 5){ n /= 1000; i++; } return '$' + n.toFixed(n < 10 ? 2 : 1) + u[i]; } return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const rm = () => document.documentElement.classList.contains('rm');
  const device = $('#device'), screen = $('#screen'), home = $('#home'), pagesEl = $('#pages'), dockEl = $('#dock'), winsEl = $('#windows'), statusEl = $('#status'), homebar = $('#homebar');
  const S = { w: 0, h: 0, kind: 'ipad', cols: 4, rows: 6 };
  const APP = id => OS_APPS.find(a => a.id === id);

  /* ================= theme + device ================= */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = () => { const t = K.prefs.theme; return t === 'light' || t === 'dark' ? t : (mq.matches ? 'dark' : 'light'); };
  function applyTheme(){
    const root = document.documentElement; root.dataset.theme = theme();
    root.classList.toggle('rm', !!K.prefs.reduceMotion); root.classList.toggle('rt', !!K.prefs.reduceTransparency);
    updateInk(); paintWall(); K.emit('theme', theme());
  }
  mq.addEventListener && mq.addEventListener('change', () => { if(K.prefs.theme === 'auto') applyTheme(); });

  function layoutDevice(){
    const vw = window.innerWidth, vh = window.innerHeight, pref = K.prefs.device, coarse = window.matchMedia('(pointer:coarse)').matches;
    let kind, w, h, r = 0, bz = 0, native = false;
    const margin = 30, aw = vw - margin * 2, ah = vh - margin * 2;
    if(pref === 'auto' && (coarse || Math.min(vw, vh) < 560)){ native = true; kind = Math.min(vw, vh) < 600 ? 'phone' : 'ipad'; w = vw; h = vh; }
    else if(pref === 'iphone' || (pref === 'auto' && false)){ kind = 'phone'; h = Math.min(ah, aw * 19.5 / 9); w = h * 9 / 19.5; r = Math.round(w * 0.14); bz = 11; }
    else { kind = 'ipad'; const land = vw >= vh; const ar = land ? 4 / 3 : 3 / 4; w = Math.min(aw, ah * ar); h = w / ar; r = 26; bz = 13; }
    device.style.setProperty('--dw', Math.round(w) + 'px'); device.style.setProperty('--dh', Math.round(h) + 'px'); device.style.setProperty('--dr', r + 'px'); device.style.setProperty('--bz', bz + 'px');
    device.classList.toggle('native', native); device.classList.toggle('phone', kind === 'phone' && !native);
    screen.style.setProperty('--sat', native ? 'max(34px, env(safe-area-inset-top))' : kind === 'phone' ? '54px' : '30px');
    screen.style.setProperty('--sab', native ? 'max(20px, env(safe-area-inset-bottom))' : '20px');
    S.w = Math.round(w); S.h = Math.round(h); S.kind = kind; S.sat = Math.round(statusEl.getBoundingClientRect().height) || 34;
    relayoutHome(false); K.emit('screen', { w: S.w, h: S.h, kind });
  }
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(layoutDevice, 60); });

  /* ================= wallpaper ================= */
  let wallLayer = 0, wallKey = '';
  const walls = [$('#wall0'), $('#wall1')];
  async function paintWall(){
    const t = theme(), id = K.prefs.wall && K.prefs.wall[t], key = t + ':' + id; if(key === wallKey) return; wallKey = key;
    const next = walls[wallLayer ^ 1], cur = walls[wallLayer]; next.className = 'wall'; next.style.backgroundImage = '';
    let url = null; if(id){ try{ url = await OS.gallery.wallpaper(id); }catch(e){} }
    if(key !== wallKey) return;
    if(url) next.style.backgroundImage = 'url("' + url + '")'; else next.classList.add(t === 'dark' ? 'def-dark' : 'def-light');
    requestAnimationFrame(() => { next.classList.add('on'); cur.classList.remove('on'); wallLayer ^= 1; });
  }

  /* ================= status bar ================= */
  function tick(){ const d = new Date(); $('#clk').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''); const lt = $('#lockTime'); if(lt){ lt.textContent = $('#clk').textContent; $('#lockDate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); } }
  tick(); setInterval(tick, 5000);
  K.on('sync', s => { const el = $('#syncIc'); el.className = 'sync' + (s === 'saving' ? ' busy' : s === 'error' ? ' err' : ''); });
  let appOpen = null, lockOn = false;
  function updateInk(){ const ink = !lockOn && (!!appOpen || theme() === 'light'); statusEl.classList.toggle('ink', ink); homebar.classList.toggle('ink', ink || !!appOpen); }
  function syncIcon(){ const si = K.cloud.signedIn(); $('#syncIc').innerHTML = osIcon(si ? 'cloud' : 'cloudOff', 15, 2); $('#syncIc').title = si ? 'Progress is saved' : 'Not signed in — progress is not saved'; }
  K.on('auth', syncIcon); syncIcon();

  /* ================= home layout ================= */
  const DEFAULT_DOCK = ['Messages', 'Stocks', 'News', 'Settings'];
  const SIZES = { s: [2, 2], m: [4, 2], l: [4, 4] };
  let layout = [], M = null, editing = false, pageCount = 1, curPage = 0;
  const items = new Map();                        // key → { el, def, w:widgetInstance }
  const dock = () => (K.prefs.dock && K.prefs.dock.length ? K.prefs.dock : DEFAULT_DOCK).filter(id => APP(id)).slice(0, 5);
  const wk = () => 'w' + Math.random().toString(36).slice(2, 8);
  function defaultLayout(){
    const dk = new Set(DEFAULT_DOCK);
    return [{ t: 'w', id: 'wanted', size: 'm', k: wk() }, { t: 'w', id: 'stocks', size: 's', k: wk() }, { t: 'w', id: 'bank', size: 's', k: wk() }]
      .concat(OS_APPS.filter(a => !dk.has(a.id)).map(a => ({ t: 'a', id: a.id, k: 'a-' + a.id })));
  }
  function loadLayout(){
    let l = K.prefs.layout; const dk = new Set(dock());
    if(!Array.isArray(l) || !l.length) l = defaultLayout();
    l = l.filter(it => it && ((it.t === 'a' && APP(it.id) && !dk.has(it.id)) || (it.t === 'w' && WIDGETS.find(w => w.id === it.id)))).map(it => it.k ? it : Object.assign({}, it, { k: it.t === 'a' ? 'a-' + it.id : wk() }));
    const seen = new Set(); layout = l.filter(it => !seen.has(it.k) && seen.add(it.k));
  }
  const saveLayout = () => K.setPref('layout', layout.map(it => it.t === 'a' ? { t: 'a', id: it.id, k: it.k } : { t: 'w', id: it.id, size: it.size, k: it.k }));

  function metrics(){
    const W = S.w, H = S.h, cols = W < 520 ? 4 : W < 860 ? 5 : 6, pad = Math.max(18, Math.min(60, W * 0.06));
    const cw = (W - pad * 2) / cols, ic = Math.round(Math.min(64, cw * 0.66)), rh = ic + 28 + Math.round(Math.min(14, cw * 0.1));
    const sat = S.sat || 34, topY = sat + 50;
    const dockH = Math.round(ic + 28 + 14) + 22, bottom = dockH + 28;
    const rows = Math.max(2, Math.floor((H - topY - bottom) / rh));
    return { cols, pad, cw, ic, rh, topY, rows, dockH };
  }
  // first-fit packing of items (apps 1×1, widgets s/m/l) onto pages of cols×rows
  function pack(){
    const pages = [], place = (it) => {
      const [w0, h] = it.t === 'a' ? [1, 1] : SIZES[it.size], w = Math.min(w0, M.cols);
      for(let p = 0; ; p++){
        if(!pages[p]) pages[p] = Array.from({ length: M.rows }, () => new Array(M.cols).fill(false));
        const g = pages[p];
        for(let r = 0; r + h <= M.rows; r++) for(let c = 0; c + w <= M.cols; c++){
          let free = true; for(let y = 0; y < h && free; y++) for(let x = 0; x < w; x++) if(g[r + y][c + x]){ free = false; break; }
          if(free){ for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) g[r + y][c + x] = true; return { p, r, c, w, h }; }
        }
        if(p > 40) return { p: 0, r: 0, c: 0, w, h };
      }
    };
    return layout.map(place);
  }
  function makeItem(it){
    const el = document.createElement('div'); el.className = 'item'; el.dataset.k = it.k; el.style.setProperty('--jd', (-Math.random() * 0.26).toFixed(2) + 's');
    const rec = { el, it, inst: null };
    if(it.t === 'a'){
      const a = APP(it.id); el.innerHTML = '<div class="in"><div class="app" data-app="' + a.id + '">' + osAppTile(a, M.ic) + '<span class="lb">' + esc(a.name) + '</span><button class="rm" aria-label="Remove">' + osIcon('minus', 14, 3) + '</button></div></div>';
    } else {
      const def = WIDGETS.find(w => w.id === it.id);
      el.innerHTML = '<div class="in"><div class="widget ' + (def.cls || '') + ' ' + it.size + '" data-w="' + def.id + '"><div class="w"></div><button class="rm" aria-label="Remove">' + osIcon('minus', 14, 3) + '</button><button class="sz">' + it.size.toUpperCase() + '</button></div></div>';
    }
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
    const slots = pack(); pageCount = Math.max(1, ...slots.map(s => s.p + 1));
    while(pagesEl.children.length < pageCount){ const p = document.createElement('div'); p.className = 'page'; pagesEl.appendChild(p); }
    while(pagesEl.children.length > pageCount) pagesEl.lastChild.remove();
    const keep = new Set();
    layout.forEach((it, i) => {
      keep.add(it.k); let rec = items.get(it.k); const fresh = !rec; if(!rec) rec = makeItem(it); rec.it = it; const s = slots[i], pg = pagesEl.children[s.p];
      if(rec.el.parentNode !== pg) pg.appendChild(rec.el);
      const widget = it.t === 'w', x = M.pad + s.c * M.cw + (widget ? 6 : 0), y = M.topY + s.r * M.rh + (widget ? 4 : 0);
      rec.el.style.width = (widget ? s.w * M.cw - 12 : M.cw) + 'px'; rec.el.style.height = (widget ? s.h * M.rh - 14 : M.rh) + 'px';
      if(widget){ const wd = $('.widget', rec.el); wd.className = 'widget ' + (WIDGETS.find(w => w.id === it.id).cls || '') + ' ' + it.size; if(fresh || rec.size !== it.size || rec.cols !== M.cols){ rec.size = it.size; rec.cols = M.cols; rec.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; mountWidget(rec); } }
      else { const t = $('.tile', rec.el); if(t && t.style.width !== M.ic + 'px'){ t.outerHTML = osAppTile(APP(it.id), M.ic); } }
      rec.el.classList.toggle('settle', animate && !fresh && !rec.el.classList.contains('dragging'));
      if(!rec.el.classList.contains('dragging')) rec.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      rec.x = x; rec.y = y; rec.page = s.p;
    });
    items.forEach((rec, k) => { if(!keep.has(k)){ if(rec.inst && rec.inst.destroy) try{ rec.inst.destroy(); }catch(e){} rec.el.remove(); items.delete(k); } });
    renderDock(); renderDots(); updateBadges();
    $('#dots').style.bottom = (M.dockH + 12) + 'px';
  }
  function renderDock(){
    const ids = dock(); dockEl.style.setProperty('--dg', Math.round(M.ic * 0.3) + 'px'); dockEl.style.setProperty('--dp', Math.round(M.ic * 0.2) + 'px');
    const sig = ids.join() + M.ic; if(dockEl.dataset.sig === sig) return; dockEl.dataset.sig = sig;
    dockEl.innerHTML = ids.map(id => '<div class="app" data-app="' + id + '">' + osAppTile(id, M.ic) + '</div>').join('');
  }
  function renderDots(){ const d = $('#dots'); d.innerHTML = pageCount > 1 ? Array.from({ length: pageCount }, (_, i) => '<i class="' + (i === curPage ? 'on' : '') + '"></i>').join('') : ''; }
  pagesEl.addEventListener('scroll', () => { const p = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth)); if(p !== curPage){ curPage = p; $$('#dots i').forEach((e, i) => e.classList.toggle('on', i === p)); } }, { passive: true });
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
    const col = getComputedStyle(cv).getPropertyValue('color'); const c = color.startsWith('var(') ? getComputedStyle(cv).getPropertyValue(color.slice(4, -1)) : color;
    const step = Math.max(1, Math.floor(pts.length / (w / 1.5))); g.beginPath(); pts.forEach((p, i) => { if(i % step && i !== pts.length - 1) return; const x = X(p[0]), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c + '55'); gr.addColorStop(1, c + '00'); try{ g.fillStyle = gr; g.fill(); }catch(e){}
  }
  // live widgets: each widget's update() runs when something it shows changes
  ['cash', 'mail', 'bank', 'props', 'market', 'lab', 'games', 'inv', 'stock'].forEach(evt => K.on(evt, () => { items.forEach(rec => { if(rec.inst && rec.inst.update) try{ rec.inst.update(); }catch(e){} }); }));

  /* ================= edit mode + dragging ================= */
  const editBtn = $('#editBtn'), doneBtn = $('#doneBtn');
  function setEditing(on){
    editing = on; home.classList.toggle('editing', on);
    editBtn.innerHTML = on ? osIcon('plus', 16, 2.6) + '<span>Widget</span>' : osIcon('edit', 15, 2.2) + '<span>Edit</span>'; doneBtn.style.display = on ? '' : 'none';
    pagesEl.style.scrollSnapType = 'x mandatory';
  }
  editBtn.addEventListener('click', () => { if(!editing) setEditing(true); else openGallery(); });
  doneBtn.addEventListener('click', () => { setEditing(false); saveLayout(); });
  home.addEventListener('click', e => {
    const rmBtn = e.target.closest('.rm'); if(rmBtn && editing){ const k = rmBtn.closest('.item').dataset.k; layout = layout.filter(i => i.k !== k); relayoutHome(true); saveLayout(); return; }
    const sz = e.target.closest('.sz'); if(sz && editing){ const it = layout.find(i => i.k === sz.closest('.item').dataset.k), def = WIDGETS.find(w => w.id === it.id), i = def.sizes.indexOf(it.size); it.size = def.sizes[(i + 1) % def.sizes.length]; relayoutHome(true); saveLayout(); }
  });
  let drag = null;
  function pageRect(){ return pagesEl.children[curPage].getBoundingClientRect(); }
  home.addEventListener('pointerdown', e => {
    if(e.button > 0 || e.target.closest('.topbar') || e.target.closest('.dock')) return;
    const itemEl = e.target.closest('.item'); if(e.target.closest('.rm,.sz')) return;
    const st = { x: e.clientX, y: e.clientY, t: Date.now(), el: itemEl, id: e.pointerId, moved: false, timer: null };
    if(itemEl){ itemEl.classList.add('pressed'); if(editing) beginDrag(st, e); else st.timer = setTimeout(() => { if(!st.moved){ itemEl.classList.remove('pressed'); setEditing(true); beginDrag(st, e); } }, 480); }
    else if(!editing) st.timer = setTimeout(() => { if(!st.moved) setEditing(true); }, 520);
    home._press = st;
  });
  function beginDrag(st, e){
    const rec = items.get(st.el.dataset.k); if(!rec) return;
    const r = st.el.getBoundingClientRect(), pr = pageRect();
    drag = { rec, el: st.el, dx: e.clientX - r.left, dy: e.clientY - r.top, last: 0, edgeT: 0, edge: 0, id: st.id, pr };
    st.el.classList.remove('settle', 'pressed'); st.el.classList.add('dragging'); try{ st.el.setPointerCapture(st.id); }catch(_){}
    pagesEl.style.overflowX = 'hidden';
  }
  window.addEventListener('pointermove', e => {
    const st = home._press; if(st && (Math.abs(e.clientX - st.x) > 7 || Math.abs(e.clientY - st.y) > 7)){ st.moved = true; clearTimeout(st.timer); if(st.el && !drag) st.el.classList.remove('pressed'); }
    if(!drag) return;
    const pr = pageRect(), x = e.clientX - pr.left - drag.dx, y = e.clientY - pr.top - drag.dy;
    drag.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    const now = performance.now(), cx = e.clientX - pr.left, cy = e.clientY - pr.top;
    if(now - drag.last > 140){
      const target = [...items.values()].find(o => o !== drag.rec && o.page === curPage && cx > o.x && cx < o.x + parseFloat(o.el.style.width) && cy > o.y && cy < o.y + parseFloat(o.el.style.height));
      if(target){ const from = layout.findIndex(i => i.k === drag.rec.it.k), to = layout.findIndex(i => i.k === target.it.k); if(from > -1 && to > -1 && from !== to){ const [m] = layout.splice(from, 1); layout.splice(to, 0, m); drag.last = now; relayoutHome(true); } }
    }
    const sw = pagesEl.clientWidth, edge = e.clientX - pr.left < 28 ? -1 : e.clientX - pr.left > sw - 28 ? 1 : 0;
    if(edge !== drag.edge){ drag.edge = edge; clearTimeout(drag.edgeT); if(edge){ drag.edgeT = setTimeout(() => flipPage(edge), 520); } }
  });
  function flipPage(dir){
    const np = Math.max(0, Math.min(pageCount - 1, curPage + dir)); if(np === curPage || !drag) return;
    // move the dragged item to the first slot of the neighbouring page (or the end of the last) and follow it
    const idxs = layout.map((it, i) => ({ i, p: items.get(it.k).page })), onNew = idxs.filter(o => o.p === np), from = layout.findIndex(i => i.k === drag.rec.it.k);
    const [m] = layout.splice(from, 1); const at = onNew.length ? (dir > 0 ? onNew[0].i - (from < onNew[0].i ? 1 : 0) : onNew[onNew.length - 1].i + (from < onNew[onNew.length - 1].i ? 0 : 1)) : layout.length; layout.splice(Math.max(0, at), 0, m);
    pagesEl.style.overflowX = 'auto'; pagesEl.scrollTo({ left: np * pagesEl.clientWidth, behavior: rm() ? 'auto' : 'smooth' }); curPage = np; setTimeout(() => { pagesEl.style.overflowX = 'hidden'; }, 420);
    relayoutHome(true); drag.edge = 0;
  }
  function endPress(e){
    const st = home._press; home._press = null; if(!st) return; clearTimeout(st.timer); if(st.el) st.el.classList.remove('pressed');
    if(drag){ clearTimeout(drag.edgeT); const el = drag.el; drag = null; el.classList.remove('dragging'); try{ el.releasePointerCapture(st.id); }catch(_){} pagesEl.style.overflowX = 'auto'; relayoutHome(true); saveLayout(); return; }
    if(!st.moved && Date.now() - st.t < 480 && !editing){
      const a = e.target.closest && e.target.closest('[data-app]'); if(a){ openApp(a.dataset.app, $('.tile', a)); return; }
      const w = e.target.closest && e.target.closest('.widget'); if(w){ const def = WIDGETS.find(x => x.id === w.dataset.w); if(def) openApp(def.app, w); }
    }
    if(!st.moved && !st.el && editing) { /* tap on empty space in edit mode does nothing */ }
  }
  window.addEventListener('pointerup', endPress); window.addEventListener('pointercancel', endPress);
  // the dock isn't draggable, but it opens apps (and in edit mode it should too)
  dockEl.addEventListener('click', e => { const a = e.target.closest('[data-app]'); if(a && !editing) openApp(a.dataset.app, $('.tile', a)); });

  /* ================= widget / app gallery sheet ================= */
  const sheetWrap = $('#sheetwrap'), sheet = $('#sheet'); let galPreview = [];
  function openGallery(tab){
    tab = tab || 'w'; const inUse = new Set(layout.filter(i => i.t === 'a').map(i => i.id).concat(dock()));
    sheet.innerHTML = '<div class="grab"></div><div class="sh"><h2>Add to Home Screen</h2><button class="x" aria-label="Close">' + osIcon('x', 15, 2.6) + '</button></div>' +
      '<div class="seg" style="--n:2"><div class="thumb" style="transform:translateX(' + (tab === 'w' ? 0 : 100) + '%)"></div><button data-t="w">Widgets</button><button data-t="a">Apps</button></div><div class="body"></div>';
    const body = $('.body', sheet); galPreview.forEach(p => { try{ p.destroy && p.destroy(); }catch(e){} }); galPreview = [];
    if(tab === 'w'){
      body.innerHTML = '<div class="gal-grid">' + WIDGETS.map(w => '<div class="gal-item" data-wid="' + w.id + '"><div class="gal-prev"></div><div><b>' + esc(w.name) + '</b><br><small>' + esc(w.desc) + '</small></div><div class="sizes">' + w.sizes.map((s, i) => '<button class="btn sm ' + (i ? 'alt' : '') + '" data-size="' + s + '">' + ({ s: 'Small', m: 'Wide', l: 'Large' })[s] + '</button>').join('') + '</div></div>').join('') + '</div>';
      $$('.gal-item', body).forEach(card => {
        const def = WIDGETS.find(w => w.id === card.dataset.wid), prev = $('.gal-prev', card);
        const show = size => { galPreview.forEach(p => { if(p.card === card && p.destroy) try{ p.destroy(); }catch(e){} }); prev.innerHTML = ''; const [cw, ch] = SIZES[size], W = cw * M.cw - 12, H = ch * M.rh - 14, wd = document.createElement('div'); wd.className = 'widget ' + (def.cls || '') + ' ' + size; wd.style.cssText = 'width:' + W + 'px;height:' + H + 'px'; wd.innerHTML = '<div class="w"></div>'; prev.appendChild(wd);
          const k = Math.min((prev.clientWidth - 16) / W, (prev.clientHeight - 12) / H); wd.style.transform = 'scale(' + k + ') translate(-50%,-50%)'; wd.style.transformOrigin = '0 0'; wd.style.left = '50%'; wd.style.top = '50%'; wd.style.marginLeft = '0';
          wd.style.transform = 'translate(' + (-W * k / 2) + 'px,' + (-H * k / 2) + 'px) scale(' + k + ')'; wd.style.left = '50%'; wd.style.top = '50%';
          try{ const inst = def.mount($('.w', wd), size, wctx) || {}; inst.card = card; galPreview.push(inst); }catch(e){} card.dataset.cur = size; };
        show(def.sizes[0]);
        card.addEventListener('click', e => { const b = e.target.closest('[data-size]'); if(!b) return; $$('[data-size]', card).forEach(x => x.classList.toggle('alt', x !== b)); show(b.dataset.size); });
        const add = document.createElement('button'); add.className = 'btn sm'; add.textContent = 'Add'; add.style.marginTop = '2px'; $('.sizes', card).after(add);
        add.addEventListener('click', () => { addToHome({ t: 'w', id: def.id, size: card.dataset.cur || def.sizes[0], k: wk() }); closeSheet(); toast(def.name + ' added'); });
      });
    } else {
      const free = OS_APPS.filter(a => !inUse.has(a.id));
      body.innerHTML = free.length ? '<div class="gal-apps">' + free.map(a => '<div class="app" data-add="' + a.id + '">' + osAppTile(a, 60) + '<span class="lb">' + esc(a.name) + '</span></div>').join('') + '</div>' : '<p style="text-align:center;color:var(--label2);font:500 15px var(--font);padding:40px 0">Every app is already on your Home Screen.</p>';
      $$('[data-add]', body).forEach(el => el.addEventListener('click', () => { addToHome({ t: 'a', id: el.dataset.add, k: 'a-' + el.dataset.add }); closeSheet(); toast(APP(el.dataset.add).name + ' added'); }));
    }
    $$('.seg button', sheet).forEach(b => b.addEventListener('click', () => openGallery(b.dataset.t))); $('.x', sheet).addEventListener('click', closeSheet);
    sheetWrap.classList.add('open');
  }
  function closeSheet(){ sheetWrap.classList.remove('open'); setTimeout(() => { galPreview.forEach(p => { try{ p.destroy && p.destroy(); }catch(e){} }); galPreview = []; }, 400); }
  $('.scrim', sheetWrap).addEventListener('click', closeSheet);
  function addToHome(it){
    // insert at the start of the page you're looking at, so the new thing appears right where you are
    const first = layout.findIndex(i => items.get(i.k) && items.get(i.k).page === curPage); layout.splice(first < 0 ? layout.length : first, 0, it); relayoutHome(true); saveLayout();
  }
  let toastT; function toast(msg){ let t = $('.toast', screen); if(!t){ t = document.createElement('div'); t.className = 'toast'; screen.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }

  /* ================= app windows ================= */
  const EASE_OPEN = 'cubic-bezier(.32,.72,0,1)';
  function rectIn(el){ const r = el.getBoundingClientRect(), s = screen.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; }
  function frame(o){                              // keyframe that makes the full-size window look like the icon at rect o
    const sc = Math.max(o.w / S.w, o.h / S.h), wu = o.w / sc, hu = o.h / sc, left = (S.w - wu) / 2, top = (S.h - hu) / 2, rad = Math.min(o.w, o.h) * 0.224 / sc;
    return { transform: 'translate(' + (o.x - left * sc) + 'px,' + (o.y - top * sc) + 'px) scale(' + sc + ')', clipPath: 'inset(' + top + 'px ' + left + 'px ' + top + 'px ' + left + 'px round ' + rad + 'px)' };
  }
  const FULL = { transform: 'translate(0px,0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 0px)' };
  function iconRect(id){ const el = $('[data-app="' + id + '"] .tile', home) || $('[data-app="' + id + '"]', home); if(el){ const r = rectIn(el); if(r.x > -5 && r.x < S.w + 5) return r; } return { x: S.w / 2 - 30, y: S.h - 120, w: 60, h: 60 }; }
  function openApp(id, originEl){
    const app = APP(id); if(!app) return;
    if(appOpen){ if(appOpen.id === id) return; return closeApp(true).then(() => openApp(id, null)); }
    const o = originEl ? rectIn(originEl) : iconRect(id), win = document.createElement('div'); win.className = 'win';
    const dark = theme() === 'dark';
    win.innerHTML = '<div class="splash" style="background:linear-gradient(160deg,' + app.g[0] + ',' + app.g[1] + ')">' + osIcon(app.glyph, 96, 1.5) + '</div><iframe title="' + esc(app.name) + '" src="apps/' + app.file + '" allow="fullscreen"></iframe>';
    winsEl.appendChild(win); const fr = $('iframe', win), splash = $('.splash', win);
    appOpen = { id, win, loaded: false, anim: null, origin: o }; updateInk(); home.classList.add('under'); history.replaceState(null, '', '#open=' + id);
    fr.addEventListener('load', () => { appOpen && appOpen.win === win && (appOpen.loaded = true, maybeReveal()); });
    const a = rm() ? null : win.animate([Object.assign({}, frame(o), { opacity: 0.6 }), Object.assign({}, FULL, { opacity: 1 })], { duration: 460, easing: EASE_OPEN, fill: 'both' });
    appOpen.anim = a; let done = !a; if(a) a.onfinish = () => { done = true; a.cancel(); win.style.transform = ''; win.style.clipPath = ''; win.style.opacity = ''; maybeReveal(); };
    function maybeReveal(){ if(appOpen && appOpen.win === win && appOpen.loaded && done) splash.classList.add('gone'); }
    setTimeout(() => { if(appOpen && appOpen.win === win){ done = true; appOpen.loaded = true; maybeReveal(); } }, 4500);   // never leave the splash up forever
    win.addEventListener('pointerdown', () => {});
  }
  function closeApp(quick, fromState){
    if(!appOpen) return Promise.resolve(); const cur = appOpen; appOpen = null; const { win, id } = cur; history.replaceState(null, '', location.pathname); updateInk();
    home.classList.remove('under');
    const end = () => { win.remove(); };
    if(rm() || quick === 'instant'){ end(); return Promise.resolve(); }
    const o = iconRect(id), start = fromState || FULL;
    if(cur.anim) try{ cur.anim.cancel(); }catch(e){}
    const a = win.animate([Object.assign({}, start, { opacity: 1 }), Object.assign({}, frame(o), { opacity: 0.25 })], { duration: quick === true ? 300 : 420, easing: EASE_OPEN, fill: 'forwards' });
    return new Promise(res => { a.onfinish = () => { end(); res(); }; });
  }
  // swipe up on the home indicator to go home — the app follows your finger
  let sw = null;
  homebar.addEventListener('pointerdown', e => { if(!appOpen) return; sw = { y: e.clientY, x: e.clientX, t: performance.now(), dy: 0, id: e.pointerId }; homebar.setPointerCapture(e.pointerId); if(appOpen.anim) try{ appOpen.anim.cancel(); }catch(_){} $('.splash', appOpen.win).classList.add('gone'); });
  homebar.addEventListener('pointermove', e => {
    if(!sw || !appOpen) return; sw.dy = Math.max(0, sw.y - e.clientY); const p = Math.min(1, sw.dy / (S.h * 0.5)), s = 1 - p * 0.45, dx = (e.clientX - sw.x) * 0.3;
    appOpen.win.style.transformOrigin = '50% 100%'; appOpen.win.style.transform = 'translate(' + dx + 'px,' + (-sw.dy * 0.35) + 'px) scale(' + s + ')'; appOpen.win.style.clipPath = 'inset(0 round ' + (p * 38) + 'px)'; home.style.opacity = String(0.35 + p * 0.65); home.style.transform = 'scale(' + (0.9 + p * 0.1) + ')';
  });
  const swEnd = e => {
    if(!sw || !appOpen) { sw = null; return; } const v = sw.dy / Math.max(1, performance.now() - sw.t), dy = sw.dy; sw = null; const w = appOpen.win; home.style.opacity = home.style.transform = '';
    if(dy > 80 || v > 0.55){ const st = { transform: w.style.transform, clipPath: w.style.clipPath }; w.style.transformOrigin = '0 0'; const cs = getComputedStyle(w); const m = new DOMMatrix(cs.transform); w.style.transform = ''; w.style.clipPath = ''; w.style.transformOrigin = '0 0'; closeApp(true, { transform: m.toString().replace('matrix', 'matrix'), clipPath: st.clipPath || FULL.clipPath }); }
    else { w.animate([{ transform: w.style.transform, clipPath: w.style.clipPath }, FULL], { duration: 320, easing: EASE_OPEN }); w.style.transform = w.style.clipPath = ''; w.style.transformOrigin = '0 0'; }
  };
  homebar.addEventListener('pointerup', swEnd); homebar.addEventListener('pointercancel', swEnd);
  homebar.addEventListener('click', () => { if(appOpen && !sw) closeApp(); else if(editing) { setEditing(false); saveLayout(); } });
  document.addEventListener('keydown', e => { if(e.key === 'Escape'){ if(sheetWrap.classList.contains('open')) closeSheet(); else if(appOpen) closeApp(); else if(editing){ setEditing(false); saveLayout(); } } });

  /* ================= notifications ================= */
  const bannersEl = $('#banners');
  K.on('notify', n => {
    if(!K.prefs.banners || (appOpen && appOpen.id === (n.app || 'Messages') && n.app !== 'Settings')) return;
    if(lockOn){ renderLockNotifs(); return; }
    const app = APP(n.app || 'Messages') || APP('Messages'), b = document.createElement('div'); b.className = 'banner';
    b.innerHTML = osAppTile(app, 38) + '<div class="tx"><b>' + esc(n.title) + '</b><span class="t">' + esc(n.body) + '</span></div><span class="nw">now</span>';
    bannersEl.appendChild(b); while(bannersEl.children.length > 3) bannersEl.firstChild.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('in')));
    const kill = () => { b.classList.remove('in'); b.classList.add('out'); setTimeout(() => b.remove(), 380); }; let t = setTimeout(kill, 5200);
    b.addEventListener('click', () => { clearTimeout(t); kill(); openApp(app.id, null); });
    let sy = null; b.addEventListener('pointerdown', e => { sy = e.clientY; clearTimeout(t); }); b.addEventListener('pointermove', e => { if(sy != null && sy - e.clientY > 14) { sy = null; kill(); } }); b.addEventListener('pointerleave', () => { if(sy != null){ sy = null; t = setTimeout(kill, 2000); } });
  });

  /* ---- market-moving headlines become notifications while you're playing ---- */
  let lastNews = null;
  function watchNews(){ const a = OS.world.articles(1)[0]; if(!a) return; if(lastNews && a.id !== lastNews && a.impact){ const p = a.impact.pct * 100; K.emit('notify', { app: 'News', title: 'Market news', body: a.headline + ' (' + (p >= 0 ? '▲' : '▼') + Math.abs(Math.round(p)) + '%)' }); } lastNews = a.id; }
  setInterval(watchNews, 60000); setTimeout(watchNews, 2500);

  /* ================= lock screen ================= */
  const lock = $('#lock'); var lockDrag = null;
  function renderLockNotifs(){
    const un = OS.mail.list().filter(m => !m.read).slice(0, 3), box = $('#lockNotifs'); box.innerHTML = un.map(m => '<div class="banner"><span class="tx"><b>' + esc(m.from) + '</b><span class="t">' + esc(m.subj) + '</span></span></div>').join('');
  }
  function showLock(){ lockOn = true; updateInk(); screen.classList.add('locked'); lock.style.display = ''; lock.style.transform = ''; lock.style.opacity = ''; tick(); renderLockNotifs(); readyGate(); }
  function readyGate(){ const hint = $('#lockHint'), spin = $('#lockSpin'); const go = () => { hint.style.display = ''; spin.style.display = 'none'; lock.dataset.ready = '1'; }; if(OS.auth.ready()) go(); else { hint.style.display = 'none'; spin.style.display = ''; const off = K.on('auth', () => { off(); go(); }); setTimeout(() => { if(!lock.dataset.ready){ go(); } }, 4000); } }
  function unlock(){
    if(!lockOn || !lock.dataset.ready) return; lockOn = false; updateInk(); screen.classList.remove('locked'); const done = () => { lock.style.display = 'none'; afterUnlock(); };
    if(rm()) return done();
    lock.animate([{ transform: lock.style.transform || 'none', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0.4 }], { duration: 520, easing: EASE_OPEN, fill: 'forwards' }).onfinish = done;
    home.animate([{ transform: 'scale(.94)', opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: EASE_OPEN });
  }
  lock.addEventListener('pointerdown', e => { lockDrag = { y: e.clientY, t: performance.now() }; lock.setPointerCapture(e.pointerId); });
  lock.addEventListener('pointermove', e => { if(!lockDrag) return; const dy = Math.max(0, lockDrag.y - e.clientY); lock.style.transform = 'translateY(' + (-dy) + 'px)'; lock.style.opacity = String(1 - Math.min(0.6, dy / S.h)); });
  const lockUp = e => { if(!lockDrag) return; const dy = Math.max(0, lockDrag.y - e.clientY), v = dy / Math.max(1, performance.now() - lockDrag.t); lockDrag = null; if(dy > 90 || v > 0.5 || (dy < 6)) unlock(); else { lock.style.transform = ''; lock.style.opacity = ''; } };
  lock.addEventListener('pointerup', lockUp); lock.addEventListener('pointercancel', lockUp);
  document.addEventListener('keydown', e => { if(lockOn && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) unlock(); });
  function afterUnlock(){ const m = /#open=(\w+)/.exec(location.hash); if(m && APP(m[1])) openApp(m[1], null); }

  /* ================= facade additions + boot ================= */
  OS.open = (id) => { if(APP(id)) { if(editing) setEditing(false); openApp(id, null); } };
  OS.home = () => closeApp();
  OS.theme = theme; OS.screen = () => ({ w: S.w, h: S.h, kind: S.kind, sat: S.sat || 34, sab: 28 });
  OS.toast = toast; OS.apps = () => OS_APPS.map(a => ({ id: a.id, name: a.name, g: a.g, glyph: a.glyph }));
  OS.shell = { resetLayout(){ K.setPref('layout', null); loadLayout(); relayoutHome(true); }, apply: () => { applyTheme(); layoutDevice(); loadLayout(); relayoutHome(true); renderDock(); }, relayout: () => { loadLayout(); relayoutHome(true); } };
  K.on('prefs', k => { if(k === 'theme' || k === 'reduceMotion' || k === 'reduceTransparency' || k === '*') applyTheme(); if(k === 'wall' || k === '*'){ wallKey = ''; paintWall(); } if(k === 'device' || k === '*') layoutDevice(); if(k === 'dock' || k === '*'){ dockEl.dataset.sig = ''; loadLayout(); relayoutHome(true); } if(k === 'layout' && !editing && !drag) { /* set by the shell itself */ } });
  K.on('loaded', () => { applyTheme(); loadLayout(); relayoutHome(false); });
  home.querySelector('#editBtn').innerHTML = osIcon('edit', 15, 2.2) + '<span>Edit</span>'; doneBtn.textContent = 'Done'; doneBtn.style.display = 'none';
  applyTheme(); layoutDevice(); loadLayout(); relayoutHome(false);
  device.classList.add('boot');
  if(K.prefs.lock !== false) showLock(); else { lock.style.display = 'none'; setTimeout(afterUnlock, 60); }
});
