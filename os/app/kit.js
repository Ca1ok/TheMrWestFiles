/* WestOS app kit (runtime). Every app does:  <script src="../os/icons.js"> <script src="../os/app/kit.js">  and then uses `Kit` and `OS`.
 *  - bridges to the shell's `OS` facade (an app opened on its own redirects to the OS, which opens it properly)
 *  - theme + safe-area sync, automatic cleanup of live subscriptions when the app is closed
 *  - page stack (large titles that collapse, push/pop slides), sheets, alerts, toasts, segmented controls */
(function(){
  let OS = null; try{ OS = window.parent !== window ? window.parent.OS : null; }catch(e){}
  if(!OS){
    const id = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
    location.replace((location.pathname.indexOf('/games/') > -1 ? '../../' : '../') + 'index.html#open=' + encodeURIComponent(id.replace(/^Games$/, 'Games')));
    const ghost = new Proxy(function(){}, { get: () => ghost, apply: () => ghost }); OS = ghost; window.OS = ghost; window.Kit = ghost; return;
  }
  window.OS = OS;
  const root = document.documentElement, subs = [];
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function applyEnv(){ root.dataset.theme = OS.theme(); const sc = OS.screen(); root.style.setProperty('--sat', (sc.sat || 0) + 'px'); root.style.setProperty('--sab', (sc.sab || 0) + 'px'); root.classList.toggle('reduce-motion', !!OS.prefs.get('reduceMotion')); root.classList.toggle('reduce-transparency', !!OS.prefs.get('reduceTransparency')); }
  applyEnv();
  const live = (evt, fn) => { const off = OS.on(evt, fn); subs.push(off); return off; };
  live('theme', applyEnv); live('screen', applyEnv); live('prefs', applyEnv);
  window.addEventListener('pagehide', () => subs.splice(0).forEach(f => { try{ f(); }catch(e){} }));

  /* ---------- helpers ---------- */
  function h(tag, attrs){
    const el = document.createElement(tag); attrs = attrs || {};
    Object.keys(attrs).forEach(k => { const v = attrs[k]; if(v == null || v === false) return; if(k === 'class') el.className = v; else if(k === 'html') el.innerHTML = v; else if(k === 'style' && typeof v === 'object') Object.keys(v).forEach(n => n.startsWith('--') ? el.style.setProperty(n, v[n]) : (el.style[n] = v[n])); else if(k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); });
    for(let i = 2; i < arguments.length; i++){ const c = arguments[i]; if(c == null || c === false) continue; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c); }
    return el;
  }
  const money = (n, o) => { n = +n || 0; o = o || {}; if(o.compact && Math.abs(n) >= 1e4){ const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = 0; while(Math.abs(n) >= 1000 && i < 6){ n /= 1000; i++; } return (n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(Math.abs(n) < 100 ? 2 : 1) + u[i]; } const d = o.dp != null ? o.dp : (Math.abs(n) < 1000 && n % 1 ? 2 : (Math.abs(n) < 1000 ? 0 : 2)); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: o.dp != null ? o.dp : (n % 1 ? 2 : 0), maximumFractionDigits: d }); };
  const num = (n, d) => (+n || 0).toLocaleString(undefined, { maximumFractionDigits: d == null ? 0 : d });
  const ago = t => { const s = Math.max(0, (OS.now() - t) / 1000); if(s < 60) return 'just now'; if(s < 3600) return Math.floor(s / 60) + 'm ago'; if(s < 86400) return Math.floor(s / 3600) + 'h ago'; if(s < 604800) return Math.floor(s / 86400) + 'd ago'; return new Date(t).toLocaleDateString(); };
  const icon = (n, s, w) => osIcon(n, s, w), tile = (id, size) => osAppTile(id, size || 30);
  const ico = (glyph, color, size) => h('span', { class: 'ico', style: { background: color || 'var(--tint)', width: (size || 30) + 'px', height: (size || 30) + 'px' }, html: osIcon(glyph, Math.round((size || 30) * 0.58), 2) });

  /* ---------- toasts / alerts / sheets ---------- */
  let toastT; function toast(msg, kind){ let t = $('.ktoast'); if(!t){ t = h('div', { class: 'ktoast' }); document.body.appendChild(t); } t.className = 'ktoast ' + (kind || ''); t.textContent = msg; requestAnimationFrame(() => t.classList.add('in')); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('in'), 2400); }
  function dialog(o){
    return new Promise(res => {
      const scrim = h('div', { class: 'kscrim' }), box = h('div', { class: 'kalert' }), done = v => { scrim.classList.remove('in'); box.classList.remove('in'); setTimeout(() => { scrim.remove(); box.remove(); }, 300); res(v); };
      box.appendChild(h('div', { class: 't', html: '<b>' + esc(o.title) + '</b>' + (o.msg ? '<span>' + esc(o.msg) + '</span>' : '') }));
      const bs = h('div', { class: 'bs' }); if(o.cancel !== false) bs.appendChild(h('button', { onclick: () => done(false) }, o.cancel || 'Cancel'));
      bs.appendChild(h('button', { class: o.destructive ? 'bad' : '', onclick: () => done(true) }, o.ok || 'OK')); box.appendChild(bs);
      scrim.addEventListener('click', () => o.cancel === false || done(false)); document.body.append(scrim, box); requestAnimationFrame(() => { scrim.classList.add('in'); box.classList.add('in'); });
    });
  }
  const confirm = o => dialog(o), alert = o => dialog(Object.assign({ cancel: false }, typeof o === 'string' ? { title: o } : o));
  function sheet(o){
    const scrim = h('div', { class: 'kscrim' }), sh = h('div', { class: 'ksheet' + (o.tall ? ' tall' : '') });
    const sb = h('div', { class: 'sb' }), hd = h('div', { class: 'sh' }, h('h3', null, o.title || ''), h('button', { class: 'nbtn fill', 'aria-label': 'Close', html: osIcon('x', 16, 2.6), onclick: () => api.close() }));
    sh.append(h('div', { class: 'grab' }), hd, sb); document.body.append(scrim, sh);
    const api = { el: sh, body: sb, close(){ scrim.classList.remove('in'); sh.classList.remove('in'); sh.style.transform = ''; setTimeout(() => { scrim.remove(); sh.remove(); o.onClose && o.onClose(); }, 480); } };
    scrim.addEventListener('click', () => api.close());
    let dy = null; const grab = e => { if(e.target.closest('button,input,select,textarea,a')) return; dy = { y: e.clientY, t: performance.now() }; sh.style.transition = 'none'; e.currentTarget.setPointerCapture(e.pointerId); };
    const move = e => { if(!dy) return; const d = Math.max(0, e.clientY - dy.y); sh.style.transform = 'translate(-50%,' + d + 'px)'; }, up = e => { if(!dy) return; const d = Math.max(0, e.clientY - dy.y), v = d / Math.max(1, performance.now() - dy.t); dy = null; sh.style.transition = ''; if(d > 120 || v > 0.6) api.close(); else sh.style.transform = ''; };
    [$('.grab', sh), hd].forEach(el => { el.addEventListener('pointerdown', grab); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); });
    o.build && o.build(sb, api); requestAnimationFrame(() => { scrim.classList.add('in'); sh.classList.add('in'); }); return api;
  }
  function seg(items, value, onChange){
    const el = h('div', { class: 'seg', style: { '--n': items.length } }), th = h('div', { class: 'thumb' }); el.appendChild(th);
    let cur = Math.max(0, items.findIndex(i => (i.id || i) === value));
    const btns = items.map((it, i) => { const b = h('button', { onclick: () => set(i, true) }, it.label || it); el.appendChild(b); return b; });
    function set(i, fire){ cur = i; th.style.transform = 'translateX(' + (i * 100) + '%)'; if(fire && onChange) onChange(items[i].id || items[i]); }
    set(cur, false); el.set = id => set(Math.max(0, items.findIndex(i => (i.id || i) === id)), false); return el;
  }
  function toggle(on, onChange){ const s = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': !!on, onclick: () => { s.classList.toggle('on'); const v = s.classList.contains('on'); s.setAttribute('aria-checked', v); onChange && onChange(v); } }); s.set = v => s.classList.toggle('on', !!v); return s; }

  /* ---------- page stack ---------- */
  function app(opts){
    const host = $('#app') || document.body.appendChild(h('div', { id: 'app' })), stack = [];
    function page(o, isRoot){
      const pg = h('div', { class: 'pg' + (isRoot && !(o.right && o.right.length) && !o.left ? ' plain' : '') }), bar = h('div', { class: 'bar' }), row = h('div', { class: 'row1' }), L = h('div', { class: 'l' }), R = h('div', { class: 'r' }), ttl = h('div', { class: 'ttl' }, o.title || '');
      row.append(L, ttl, R); bar.appendChild(row);
      const sc = h('div', { class: 'sc' }), inner = h('div', { class: 'sc-in' }), big = o.large === false ? null : h('div', { class: 'lt' }, o.title || ''), body = h('div', { class: 'body' });
      if(big) inner.appendChild(big); inner.appendChild(body); sc.appendChild(inner); pg.append(sc, bar);
      if(!isRoot) L.appendChild(h('button', { class: 'nbtn', html: osIcon('chevL', 22, 2.4) + '<span>' + esc(o.backLabel || stack[stack.length - 1].title || 'Back') + '</span>', onclick: () => api.pop() }));
      else if(o.left) setActions(L, o.left);
      function setActions(el, list){ el.innerHTML = ''; (list || []).forEach(a => { const b = h('button', { class: 'nbtn' + (a.fill ? ' fill' : ''), 'aria-label': a.label || a.icon, onclick: a.onClick }); b.innerHTML = a.html || (a.icon ? osIcon(a.icon, a.size || 21, 2.1) : '') + (a.text ? '<span>' + esc(a.text) + '</span>' : ''); if(a.el) { b.replaceWith(a.el); el.appendChild(a.el); } else el.appendChild(b); }); }
      setActions(R, o.right);
      const thr = big ? 26 : 2; sc.addEventListener('scroll', () => bar.classList.toggle('c', sc.scrollTop > thr), { passive: true });
      const P = { el: pg, body, sc, bar, title: o.title, setTitle(t){ ttl.textContent = t; if(big) big.textContent = t; P.title = t; }, setRight(list){ setActions(R, list); }, scrollTop(){ sc.scrollTop = 0; }, onShow: o.onShow, onHide: o.onHide, destroy: o.destroy };
      return P;
    }
    const api = {
      root: null, host,
      get current(){ return stack[stack.length - 1]; },
      mount(o){ const P = page(o, true); host.appendChild(P.el); stack.push(P); api.root = P; o.build && o.build(P.body, P); return P; },
      push(o){
        const prev = stack[stack.length - 1], P = page(o, false); prev.el.classList.add('under'); P.el.classList.add('enter'); host.appendChild(P.el); stack.push(P);
        o.build && o.build(P.body, P); if(prev.onHide) prev.onHide(); setTimeout(() => P.el.classList.remove('enter'), 480); return P;
      },
      pop(){
        if(stack.length < 2) return; const P = stack.pop(), prev = stack[stack.length - 1]; P.el.classList.add('leave'); prev.el.classList.add('under-out'); prev.el.classList.remove('under');
        setTimeout(() => { P.destroy && P.destroy(); P.el.remove(); prev.el.classList.remove('under-out'); if(prev.onShow) prev.onShow(); }, 400);
      },
      popToRoot(){ while(stack.length > 1) api.pop(); }
    };
    if(opts) api.mount(opts); return api;
  }
  /* ---------- little widgets ---------- */
  function cashChip(){
    const b = h('button', { class: 'cashchip', onclick: () => OS.open('Bank') }); let last = OS.cash();
    const paint = () => { const c = OS.cash(); b.innerHTML = osIcon('dollar', 14, 2.4) + '<span>' + money(c, { compact: true }) + '</span>'; if(c !== last){ b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); last = c; } };
    paint(); live('cash', paint); return b;
  }
  function spark(cv, pts, color){
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, hh = cv.clientHeight; if(!w || !hh || pts.length < 2) return;
    if(cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    let lo = Infinity, hi = -Infinity; pts.forEach(p => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }); const span = hi - lo || 1, t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    const X = t => (t - t0) / (t1 - t0 || 1) * w, Y = v => hh - 3 - (v - lo) / span * (hh - 8);
    const c = color && color.startsWith('var(') ? getComputedStyle(cv).getPropertyValue(color.slice(4, -1)).trim() : (color || '#e8924f'); const step = Math.max(1, Math.floor(pts.length / (w / 1.5)));
    g.beginPath(); pts.forEach((p, i) => { if(i % step && i !== pts.length - 1) return; i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])); }); g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.lineTo(w, hh); g.lineTo(0, hh); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, c + '55'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fill();
  }
  function row(o){
    const el = h(o.onClick ? 'button' : 'div', { class: 'row' + (o.glyph || o.left ? ' ic' : '') + (o.cls ? ' ' + o.cls : ''), onclick: o.onClick });
    if(o.glyph) el.appendChild(ico(o.glyph, o.color)); if(o.left) el.appendChild(o.left);
    const tx = h('div', { class: 'tx' }, h('b', null, o.title)); if(o.sub) tx.appendChild(h('small', { class: o.wrap ? 'wrap' : '' }, o.sub)); el.appendChild(tx);
    if(o.right != null || o.chev){ const ac = h('div', { class: 'ac' }); if(o.right != null){ if(typeof o.right === 'object') ac.appendChild(o.right); else ac.append(String(o.right)); } if(o.chev) ac.appendChild(h('span', { class: 'chev', html: osIcon('chevR', 18, 2.4) })); el.appendChild(ac); }
    return el;
  }
  const group = (...rows) => h('div', { class: 'group' }, ...rows.flat().filter(Boolean));
  const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  const raf = f => requestAnimationFrame(f);
  /* load the 3D engine on demand:  await Kit.use3D();  then GL3D / GL3DAssets / Arcade3D exist. Safe to call many times. (Apps in apps/ and apps/games/ both resolve the path.) */
  let p3d = null;
  const use3D = () => p3d || (p3d = (async () => { if(window.GL3D && window.GL3DAssets) return true; const base = location.pathname.indexOf('/games/') > -1 ? '../../os/lib/' : '../os/lib/';
    for(const f of ['gl3d.js', 'gl3d-assets.js', 'arcade-3d.js']){ if(f === 'gl3d-assets.js' && window.GL3DAssets) continue; if(f === 'gl3d.js' && window.GL3D) continue; await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = base + f; sc.onload = res; sc.onerror = () => rej(new Error('Couldn’t load ' + f)); document.head.appendChild(sc); }); } return !!window.GL3D.supported(); })());
  window.Kit = { use3D, row, group, OS, $, $$, h, esc, money, num, ago, icon, tile, ico, toast, confirm, alert, sheet, seg, toggle, app, cashChip, spark, live, debounce, raf };
})();
