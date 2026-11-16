/* WestLab Bench — the compact multi-step reactor UI (used by apps/WestLab.html; globals h, Kit, L, pf, money, group, row come from that page).
 * Everything fits one screen: inventory + tray | route strip, flask (reagents, solvent, catalyst), molecule scene, conditions grid | live outcome.
 * Each run is ONE step of a synthesis: the products land in the tray, the main product is dropped straight into a fresh flask, and the route strip remembers the steps. */
const BS = { flask: [], amt: {}, solv: '', cat: '', T: 298, P: 1, atm: 'air', vessel: 'flask', heat: 'none', stir: 0, dean: 0, slow: 0, time: 60, workup: 'none', plan: null, seq: 0, touched: false, q: '', log: [], busy: false, anim: 0, items: [] };
const HEAT_DEFAULT = { none: 298, ice: 273, hot: 350, oil: 400, mantle: 380, flame: 600, dry: 195 };
const TIME_LABEL = m => m < 60 ? m + ' min' : m < 1440 ? (m / 60) + ' h' : (m / 1440) + ' d';
const P_CHOICES = [1, 2, 3, 4, 5, 10, 20, 30, 50, 100, 200, 300, 500];
const benchArgs = () => ({ keys: BS.flask.slice(), solv: BS.solv, cat: BS.cat, T: BS.T, P: BS.P, atm: BS.atm, vessel: BS.vessel, heat: BS.heat, stir: BS.stir, dean: BS.dean, slow: BS.slow, time: BS.time, workup: BS.workup });
const kv = (a, b) => h('div', null, h('small', null, a), h('b', null, b));
const keyShort = k => { const n = L.step.label(k); return n.length > 26 ? n.slice(0, 25) + '…' : n; };

/* molecules drawn inside a rectangle (uses atomDot / bondLine from the page) */
function drawMolIn(c, g, x0, y0, w, hh, a, col){
  if(!g || !g.a || !g.a.length) return; const xs = g.x, ys = g.y, mw = Math.max(.8, Math.max(...xs) - Math.min(...xs)), mh = Math.max(.8, Math.max(...ys) - Math.min(...ys));
  const sc = Math.min(30, (w - 22) / mw, (hh - 22) / mh), cx = x0 + w / 2, cy = y0 + hh / 2, mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2, X = i => cx + (xs[i] - mx) * sc, Y = i => cy + (ys[i] - my) * sc;
  c.globalAlpha = a === undefined ? 1 : a; g.b.forEach(([i, j, o]) => bondLine(c, X(i), Y(i), X(j), Y(j), o, 1, col || '#e8e8e8', Math.max(1.4, sc / 12))); g.a.forEach((el, i) => atomDot(c, X(i), Y(i), el, g.q ? g.q[i] : 0, 1)); c.globalAlpha = 1;
}

function benchTab(root){
  const O = L.step.options(), ownedHeat = id => O.heats.find(x => x.id === id), V = id => O.vessels.find(x => x.id === id);
  const el = { inv: h('div', { class: 'bn-list' }), tray: h('div', { class: 'bn-tray' }), flask: h('div', { class: 'bn-chips' }), ctl: h('div', { class: 'bn-ctl' }), out: h('div', { class: 'bn-out' }), route: h('div', { class: 'bn-route' }), cv: h('canvas'), sel: h('div', { class: 'bn-sel' }), opts: h('div', { class: 'bn-tg' }) };
  const q = h('input', { class: 'field bn-q', placeholder: 'Search inventory', value: BS.q });
  const stage = h('div', { class: 'bn-stage' }, el.cv, h('div', { class: 'bn-hint' }, 'Drag reagents into the flask'));
  const runBtn = h('button', { class: 'btn bn-run', onclick: () => doRun(false) }, 'Run step'), clrBtn = h('button', { class: 'mini', onclick: () => { BS.flask = []; BS.amt = {}; BS.touched = false; BS.plan = null; refresh(); } }, 'Empty flask');
  const flaskCard = h('div', { class: 'card bn-card bn-drop', id: 'bn-flask' }, h('div', { class: 'bn-h' }, h('span', { class: 'cap' }, 'Flask'), el.sel, clrBtn), el.flask);
  const grid = h('div', { class: 'bn' },
    h('div', { class: 'bn-col bn-left' }, h('div', { class: 'card bn-card bn-inv' }, h('div', { class: 'cap' }, 'Inventory'), q, el.inv), h('div', { class: 'card bn-card bn-trayc' }, h('div', { class: 'bn-h' }, h('span', { class: 'cap' }, 'Tray (products)'), h('button', { class: 'mini', onclick: () => { const r = L.collectAll(); Kit.toast(r.msg, 'good'); } }, 'Add all')), el.tray)),
    h('div', { class: 'bn-col bn-mid' }, el.route, flaskCard, stage, h('div', { class: 'card bn-card' }, el.ctl, h('div', { class: 'bn-runrow' }, el.opts, runBtn))),
    h('div', { class: 'bn-col bn-right' }, h('div', { class: 'card bn-card bn-outc' }, h('div', { class: 'cap' }, 'Outcome'), el.out)));
  root.appendChild(grid);

  /* ---------- drag & drop ---------- */
  const dKey = e => { const d = (e.dataTransfer.getData('text/plain') || '').split(':'); return d.slice(1).join(':'); };
  flaskCard.addEventListener('dragover', e => { e.preventDefault(); flaskCard.classList.add('over'); }); flaskCard.addEventListener('dragleave', () => flaskCard.classList.remove('over'));
  flaskCard.addEventListener('drop', e => { e.preventDefault(); flaskCard.classList.remove('over'); const k = dKey(e); if(k) addReagent(k); });
  const drag = (n, tag, key) => { n.draggable = true; n.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', tag + ':' + key); e.dataTransfer.effectAllowed = 'copy'; }); };
  const have = k => { const it = BS.items.find(x => x.key === k); return it ? it.qty : 0; };

  function addReagent(k){
    const it = BS.items.find(x => x.key === k); if(!it || it.qty < 1) return Kit.toast('You have none of that.', 'bad');
    if(BS.flask.includes(k)) { BS.amt[k] = Math.min(it.qty, (BS.amt[k] || 1) + 1); BS.touched = true; return refresh(); }
    if(BS.flask.length >= 4) return Kit.toast('The flask holds up to four reagents (solvent and catalyst have their own slots).', 'bad');
    BS.flask.push(k); BS.amt[k] = 1; BS.touched = false; refresh();
  }
  const removeReagent = k => { BS.flask = BS.flask.filter(x => x !== k); delete BS.amt[k]; BS.touched = false; refresh(); };

  /* ---------- lists ---------- */
  function lists(){
    BS.items = L.step.items(); const s = q.value.trim().toLowerCase(); BS.q = q.value;
    el.inv.innerHTML = ''; const rows = BS.items.filter(i => i.qty > 0 && (!s || (i.name + ' ' + i.f).toLowerCase().includes(s))).sort((a, b) => (b.organic - a.organic) || a.name.localeCompare(b.name));
    if(!rows.length) el.inv.appendChild(h('div', { class: 'sub bn-empty' }, 'Nothing here. Buy reagents in WestShop (the shop now sells solvents, acids, bases, oxidants, hydrides, catalysts and organic feedstocks).'));
    rows.forEach(i => { const n = h('div', { class: 'bn-i' + (BS.flask.includes(i.key) || i.key === BS.solv || i.key === BS.cat ? ' used' : ''), title: i.name + ' — tap to add, or drag into the flask', onclick: () => addReagent(i.key) }, h('span', { class: 'bf', html: pf(i.key) }), h('span', { class: 'bnm' }, i.name), h('b', null, Kit.num(i.qty))); drag(n, 'inv', i.key); el.inv.appendChild(n); });
    el.tray.innerHTML = ''; const tr = L.tray().filter(t => t.units > 0); if(!tr.length) el.tray.appendChild(h('div', { class: 'sub bn-empty' }, 'Empty. Products of a step land here.'));
    tr.forEach(t => { const n = h('div', { class: 'bn-i tr' }, h('span', { class: 'bf', html: pf(t.key) }), h('span', { class: 'bnm' }, t.name), h('b', null, Kit.num(t.moles)), h('button', { class: 'mini', onclick: e => { e.stopPropagation(); L.collect(t.key); } }, '+ inv')); n.addEventListener('click', () => addReagent(t.key)); drag(n, 'tray', t.key); el.tray.appendChild(n); });
    selects();
  }
  function selects(){
    const mkSel = (label, opts, val, on) => { const s = h('select', { class: 'bsel', title: label, onchange: e => on(e.target.value) }, h('option', { value: '' }, label + ': none')); opts.forEach(o => s.appendChild(h('option', { value: o.key }, o.name))); s.value = opts.some(o => o.key === val) ? val : ''; return s; };
    const solvs = BS.items.filter(i => i.solv && i.qty > 0), cats = BS.items.filter(i => i.cat && i.qty > 0 && !BS.flask.includes(i.key));
    if(BS.solv && !solvs.some(i => i.key === BS.solv)) BS.solv = ''; if(BS.cat && !cats.some(i => i.key === BS.cat)) BS.cat = '';
    el.sel.innerHTML = ''; el.sel.append(mkSel('Solvent', solvs, BS.solv, v => { BS.solv = v; refresh(); }), mkSel('Catalyst', cats, BS.cat, v => { BS.cat = v; refresh(); }));
  }
  function flaskChips(){
    el.flask.innerHTML = ''; if(!BS.flask.length){ el.flask.appendChild(h('div', { class: 'bn-ph' }, 'Drop reagents here (up to 4). Pick the solvent and the catalyst material in the boxes above.')); return; }
    BS.flask.forEach(k => { const mx = have(k), n = BS.amt[k] || 1; const sp = BS.plan && BS.plan.kind === 'S' && BS.plan.card.ok ? BS.plan.card.R.find(r => r.key === k) : null;
      const stp = h('span', { class: 'stp' }, h('button', { onclick: () => { BS.amt[k] = Math.max(1, n - 1); BS.touched = true; refreshSoft(); } }, '−'), h('b', null, String(n)), h('button', { onclick: () => { BS.amt[k] = Math.min(Math.max(1, mx), n + 1); BS.touched = true; refreshSoft(); } }, '+'));
      el.flask.appendChild(h('div', { class: 'bn-chip' }, h('span', { class: 'bf', html: pf(k) }), h('span', { class: 'bnm' }, keyShort(k) + (sp ? ' ×' + (+sp.n.toFixed(2)) : '')), stp, h('button', { class: 'x', title: 'Remove', onclick: () => removeReagent(k) }, '×'))); });
  }

  /* ---------- conditions ---------- */
  function ctl(){
    const vs = V(BS.vessel) || V('flask'), hs = ownedHeat(BS.heat) || ownedHeat('none'); const lo = Math.min(hs.T[0], vs.Tmax), hi = Math.min(hs.T[1], vs.Tmax); BS.T = Math.max(lo, Math.min(hi, BS.T));
    const opt = (list, val, on, title) => { const s = h('select', { class: 'bsel', title, onchange: e => on(e.target.value) }); list.forEach(o => { const op = h('option', { value: o.id, disabled: o.owned === false }, (o.owned === false ? '🔒 ' : '') + o.name + (o.owned === false ? ' — needs ' + o.needName : '')); s.appendChild(op); }); s.value = val; return s; };
    const lab = (t, n) => h('label', { class: 'bn-f' }, h('small', null, t), n);
    const sealed = !!vs.sealed, pmax = vs.Pmax || 1, pc = P_CHOICES.filter(p => p <= (sealed ? pmax : 1));
    if(!pc.includes(BS.P)) BS.P = pc.reduce((m, p) => Math.abs(p - BS.P) < Math.abs(m - BS.P) ? p : m, 1);
    const schl = BS.vessel === 'schlenk'; if(!schl) BS.atm = 'air';
    const tr = h('input', { type: 'range', min: lo, max: hi, step: 5, value: BS.T }), tv = h('b', null, Math.round(BS.T) + ' K · ' + Math.round(BS.T - 273.15) + ' °C');
    tr.addEventListener('input', () => { BS.T = +tr.value; tv.textContent = Math.round(BS.T) + ' K · ' + Math.round(BS.T - 273.15) + ' °C'; }); tr.addEventListener('change', () => refreshSoft());
    const timeSel = h('select', { class: 'bsel', title: 'Time', onchange: e => { BS.time = +e.target.value; refreshSoft(); } }); O.times.forEach(t => timeSel.appendChild(h('option', { value: t }, TIME_LABEL(t)))); timeSel.value = BS.time;
    const atmSel = h('select', { class: 'bsel', disabled: !schl, title: 'Needs the Schlenk flask', onchange: e => { BS.atm = e.target.value; refreshSoft(); } }); O.atms.forEach(a => atmSel.appendChild(h('option', { value: a.id }, a.name))); atmSel.value = BS.atm;
    const pSel = h('select', { class: 'bsel', disabled: !sealed, title: sealed ? '' : 'Needs a sealed vessel (autoclave, hydrogenator, catalyst bed)', onchange: e => { BS.P = +e.target.value; refreshSoft(); } }); pc.forEach(p => pSel.appendChild(h('option', { value: p }, p + ' bar'))); pSel.value = BS.P;
    const tog = (txt, on, own, tip, fn) => h('button', { class: 'chip ' + (on ? 'on' : 'off'), title: own ? tip : 'Locked — ' + tip, disabled: !own, onclick: () => { fn(); ctl(); refreshSoft(); } }, txt);
    el.ctl.innerHTML = '';
    el.ctl.append(
      lab('Vessel', opt(O.vessels, BS.vessel, v => { BS.vessel = v; if(BS.T > (V(v).Tmax)) BS.T = V(v).Tmax; ctl(); refreshSoft(); }, 'Vessel')),
      lab('Heating / cooling', opt(O.heats, BS.heat, v => { BS.heat = v; BS.T = HEAT_DEFAULT[v] || 298; ctl(); refreshSoft(); }, 'Heating')),
      lab('Temperature', h('div', { class: 'bn-rng' }, tr, tv)),
      lab('Pressure', pSel), lab('Atmosphere', atmSel), lab('Time', timeSel),
      lab('Workup (how you isolate it)', opt(O.workups, BS.workup, v => { BS.workup = v; refreshSoft(); }, 'Workup')));
    el.opts.innerHTML = ''; el.opts.append(
      tog('Stir bar', BS.stir, O.stir, 'needs the Magnetic Stirrer', () => { BS.stir = BS.stir ? 0 : 1; }),
      tog('Dean–Stark', BS.dean, O.dean, 'needs the Distillation Column', () => { BS.dean = BS.dean ? 0 : 1; }),
      tog('Dropwise', BS.slow, true, 'add the reagent slowly (tames exotherms)', () => { BS.slow = BS.slow ? 0 : 1; }));
  }

  /* ---------- scene ---------- */
  function paintScene(){
    const cv = el.cv, r = devicePixelRatio || 1, w = stage.clientWidth || 600, hh = stage.clientHeight || 120; if(cv.width !== Math.round(w * r) || cv.height !== Math.round(hh * r)){ cv.width = Math.round(w * r); cv.height = Math.round(hh * r); }
    const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, w, hh); const hint = stage.querySelector('.bn-hint'), pl = BS.plan;
    const rk = pl && pl.kind === 'S' && pl.card.ok ? pl.card.R.map(x => x.key) : BS.flask.slice(), pk = pl && pl.kind === 'S' && pl.card.ok ? pl.card.Pr.filter(p => p.role === 'main' || (p.comp && p.comp.C)).slice(0, 3).map(p => p.iso ? p.iso.key : p.key) : [];
    if(pl && pl.kind === 'L' && pl.card.ok){ pk.push(...pl.card.Pr.slice(0, 3).map(x => x[0])); }
    hint.style.display = rk.length ? 'none' : 'grid'; if(!rk.length) return;
    const slots = rk.length + 1 + pk.length, sw = w / slots, u = BS.anim ? Math.min(1, (performance.now() - BS.anim) / 1100) : 1;
    rk.forEach((k, i) => { const g = L.graph(k); drawMolIn(c, g, i * sw, 6, sw, hh - 26, 1 - (BS.anim ? .5 * u : 0)); c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '600 10.5px system-ui'; c.textAlign = 'center'; c.fillText(keyShort(k).slice(0, 20), i * sw + sw / 2, hh - 8); });
    c.fillStyle = 'rgba(255,255,255,.65)'; c.font = '700 22px system-ui'; c.textAlign = 'center'; c.fillText('→', rk.length * sw + sw / 2, hh / 2 + 6);
    if(pl && pl.kind === 'S' && pl.card.ok){ c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '600 10px system-ui'; c.fillText(Math.round(BS.T) + ' K', rk.length * sw + sw / 2, hh / 2 + 22); }
    pk.forEach((k, i) => { const x0 = (rk.length + 1 + i) * sw; drawMolIn(c, L.graph(k), x0, 6, sw, hh - 26, BS.anim ? u : 1); c.fillStyle = 'rgba(160,255,190,.9)'; c.font = '700 10.5px system-ui'; c.textAlign = 'center'; c.fillText(keyShort(k).slice(0, 20), x0 + sw / 2, hh - 8); });
    if(BS.anim && u < 1) requestAnimationFrame(paintScene); else BS.anim = 0;
  }

  /* ---------- outcome ---------- */
  const tag = (t, c) => h('span', { class: 'tag ' + (c || '') }, t);
  function amountsFor(){ const pl = BS.plan; if(!pl) return {}; const am = {}; BS.flask.forEach(k => { am[k] = BS.amt[k] || 1; }); return am; }
  function paintOut(){
    const o = el.out; o.innerHTML = ''; const pl = BS.plan;
    if(!BS.flask.length){ o.appendChild(h('div', { class: 'bn-ph' }, h('b', null, 'How a step works'), h('ol', { class: 'bn-how' }, h('li', null, 'Drag reagents into the flask.'), h('li', null, 'Choose the solvent, the catalyst material, the vessel and how you heat or cool it.'), h('li', null, 'Set temperature, pressure, atmosphere and time.'), h('li', null, 'Choose the workup that isolates your product, then Run.'), h('li', null, 'The product goes to the tray and into a new flask — add the next reagent for step 2.')))); runBtn.disabled = true; return; }
    if(!pl){ o.appendChild(h('div', { class: 'sub' }, 'Thinking…')); runBtn.disabled = true; return; }
    const cd = pl.card;
    if(pl.kind === 'L'){ const am = {}; cd.R.forEach(x => { const fk = BS.flask.find(k => k === x[0] || (CH.speciesOf(k) && (CH.speciesOf(k).key === x[0] || CH.speciesOf(k).f === x[0]))); am[x[0]] = BS.amt[fk] || 1; }); const sim = L.simulate(cd, am, {});
      o.append(h('div', { class: 'bn-eq', html: esc(cd.eq || '') }), h('div', { class: 'bn-chips2' }, tag(cd.type || 'Reaction', 'tint'), tag(pl.src === 'github' ? 'from library' : 'calculated', pl.src === 'github' ? 'good' : '')), sim ? h('div', { class: 'bn-kg' }, kv('Yield', (sim.y * 100).toFixed(sim.y > .9995 ? 0 : 1) + ' %'), kv('Time', sim.tLabel || '—'), kv('Heat', sim.heat ? fmtE(sim.heat) : '—')) : '', cd.warn && cd.warn.length ? warn(cd.warn.map(x => String(x))) : '');
      runBtn.disabled = !sim || !(sim.xi > 0); return; }
    if(!cd.ok){ o.appendChild(h('div', { class: 'bn-bad' }, h('b', null, cd.restricted ? 'Restricted' : 'Not working'), h('div', null, cd.why || 'No reaction.'))); if(cd.alt && cd.alt.length) o.appendChild(h('div', { class: 'sub' }, 'Other reactions your reagents could do: ' + cd.alt.join(', ') + '.')); runBtn.disabled = true; return; }
    const sim = L.step.simulate(cd, amountsFor()); const main = cd.Pr.find(p => p.role === 'main') || cd.Pr[0], pct = Math.round(cd.eta * 100);
    o.append(h('div', { class: 'bn-type' }, h('b', null, cd.type), tag(cd.fam || '', 'tint'), tag(pl.src === 'github' ? 'library' : 'computed', pl.src === 'github' ? 'good' : '')), h('div', { class: 'bn-eq', html: esc(cd.eq).replace(/\[H₂\]|\[O\]/g, m => '<i>' + m + '</i>') }),
      cd.note ? h('div', { class: 'bn-note' }, cd.note) : '',
      h('div', { class: 'bn-bar', title: 'Isolated yield of the main product under these conditions' }, h('i', { style: { width: pct + '%', background: pct > 70 ? 'var(--good)' : pct > 35 ? 'var(--warn)' : 'var(--bad, #e5534b)' } }), h('span', null, 'Yield ≈ ' + pct + ' %')),
      h('div', { class: 'bn-kg' }, kv('Reaches 95 %', Synth_fmt(cd.t95)), kv('Conversion', Math.round(cd.conv * 100) + ' %'), kv('Recovery', Math.round((cd.rec[main.key] || 0) * 100) + ' %')));
    const prods = h('div', { class: 'bn-pr' }); cd.Pr.forEach(p => { const pk = p.iso ? p.iso.key : p.key, got = sim && sim.made[pk]; prods.appendChild(h('div', { class: 'bn-p' + (p.role === 'main' ? ' main' : '') }, h('span', { class: 'bf', html: pf(pk) }), h('span', { class: 'bnm' }, (p.iso && p.iso.name) || p.name || L.step.label(pk)), h('b', null, got ? '+' + got + ' mol' : (p.role === 'main' ? '0' : '—')))); });
    o.appendChild(prods);
    const w = (cd.warn || []).slice(); if(cd.sel) w.unshift('Selectivity: ' + cd.sel); if(cd.minor && cd.minor.length) w.push('Also forms: ' + cd.minor.join(', ') + '.'); if(sim) sim.notes.forEach(n => w.push(n)); if(w.length) o.appendChild(warn(w));
    runBtn.disabled = !sim || !sim.ok || !Object.keys(sim.made).length;
    if(sim && sim.ok && !Object.keys(sim.made).length) o.appendChild(h('div', { class: 'bn-bad' }, 'With this workup / these amounts nothing would reach 1 mol. Load more reagent, raise the yield, or change the workup.'));
  }
  const warn = list => h('div', { class: 'bn-warn' }, ...list.map(t => h('div', null, '• ' + t)));
  const Synth_fmt = m => m < 1 ? Math.round(m * 60) + ' s' : m < 90 ? Math.round(m) + ' min' : m < 2880 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d';

  /* ---------- logic ---------- */
  function autoBalance(){
    const pl = BS.plan; if(!pl || pl.kind !== 'S' || !pl.card.ok) return; const R = pl.card.R;
    for(let k = 6; k >= 1; k--){ const need = R.map(r => Math.ceil(r.n * k - 1e-9)); if(R.every((r, i) => have(r.key) >= need[i])){ R.forEach((r, i) => { BS.amt[r.key] = need[i]; }); return; } }
    R.forEach(r => { BS.amt[r.key] = Math.max(1, Math.ceil(r.n)); });
  }
  let t0 = 0;
  async function refresh(){ lists(); flaskChips(); ctl(); await plan(); }
  function refreshSoft(){ flaskChips(); plan(); }
  function plan(){
    clearTimeout(t0); const my = ++BS.seq; if(!BS.flask.length){ BS.plan = null; paintOut(); paintScene(); return Promise.resolve(); }
    return new Promise(res => { t0 = setTimeout(async () => { let pl; try{ pl = await L.step.plan(benchArgs()); }catch(e){ pl = { kind: 'S', card: { ok: false, why: 'The engine could not evaluate this: ' + (e && e.message || e) }, args: benchArgs() }; } if(my !== BS.seq) return res(); BS.plan = pl; if(!BS.touched && pl.kind === 'S' && pl.card.ok){ autoBalance(); BS.touched = true; flaskChips(); } paintOut(); paintScene(); res(); }, 90); });
  }
  async function doRun(risk){
    if(BS.busy || !BS.plan) return; BS.busy = true; runBtn.disabled = true; const args = benchArgs(), am = amountsFor();
    let r; try{ r = await L.step.run(args, am, { risk }); }catch(e){ r = { ok: false, msg: String(e && e.message || e) }; }
    BS.busy = false;
    if(!r.ok){ if(r.hazard && !risk){ if(await Kit.confirm({ title: 'Unsafe at this scale', msg: r.msg, ok: 'Run anyway', danger: true })) return doRun(true); return paintOut(); } Kit.toast(r.msg || 'Nothing happened.', 'bad'); return paintOut(); }
    const d = r; BS.log.push({ eq: d.equation, args, am, made: d.made.map(m => m.name).join(', '), kind: d.kind });
    result(d); BS.anim = performance.now(); paintScene();
    const main = d.made[0]; BS.flask = []; BS.amt = {}; BS.touched = false; if(main){ BS.flask.push(main.key); BS.amt[main.key] = Math.max(1, Math.min(main.n, 1)); }
    routeStrip(); await refresh();
  }
  function result(r){
    Kit.sheet({ title: r.hazard ? 'Vessel failed' : 'Step complete', build: sb => {
      sb.appendChild(h('div', { class: 'eq', style: { textAlign: 'center' }, html: esc(r.equation) }));
      sb.appendChild(h('div', { class: 'chips', style: { justifyContent: 'center' } }, tag((r.y * 100).toFixed(r.y > .9995 ? 0 : 1) + ' % yield', 'good'), tag('took ' + r.tLabel), tag(r.src === 'github' ? 'from the shared library' : 'calculated here', r.src === 'github' ? 'good' : 'tint')));
      sb.appendChild(group(r.made.map(m => row({ title: m.name, sub: 'moved to the tray — and into a fresh flask for the next step', right: h('b', { class: 'up num' }, '+' + Kit.num(m.n)) }))));
      if(r.notes && r.notes.length) sb.appendChild(h('div', { class: 'warnbox' }, r.notes.join(' ')));
      if(r.newly && r.newly.length) sb.appendChild(h('div', { class: 'card', style: { marginTop: '12px', background: 'var(--tint-dim)' } }, h('b', { style: { color: 'var(--tint)' } }, '✨ New discovery: ' + r.newly.map(n => n.name).join(', ')), h('div', { class: 'sub' }, 'Bonus ' + money(r.bonus, { dp: 2 }) + (r.firstGlobal ? ' — you are the first player in the world to make it, so everyone can now see how.' : ''))));
      sb.appendChild(h('div', { class: 'foot', style: { textAlign: 'center' } }, 'Lab fee paid: ' + money(r.fee, { dp: 2 })));
    } });
  }
  function routeStrip(){
    el.route.innerHTML = ''; if(!BS.log.length){ el.route.style.display = 'none'; return; } el.route.style.display = 'flex';
    el.route.appendChild(h('span', { class: 'cap', style: { margin: 0 } }, 'Route'));
    BS.log.slice(-6).forEach((s, i, a) => { el.route.appendChild(h('button', { class: 'bn-step', title: s.eq + '\nClick to load this step again', onclick: () => loadArgs(s.args, s.am) }, 'S' + (BS.log.length - a.length + i + 1) + ' → ' + (s.made.split(',')[0] || '?').slice(0, 22))); });
    el.route.appendChild(h('button', { class: 'mini', onclick: () => { BS.log = []; routeStrip(); } }, 'Clear'));
  }
  function loadArgs(a, am){ BS.flask = (a.keys || []).filter(k => have(k) > 0 || true).slice(0, 4); BS.amt = Object.assign({}, am || {}); BS.solv = a.solv || ''; BS.cat = a.cat || ''; BS.vessel = a.vessel || 'flask'; BS.heat = a.heat || 'none'; BS.T = a.T || 298; BS.P = a.P || 1; BS.atm = a.atm || 'air'; BS.stir = a.stir ? 1 : 0; BS.dean = a.dean ? 1 : 0; BS.slow = a.slow ? 1 : 0; BS.time = a.time || 60; BS.workup = a.workup || 'none'; BS.touched = true; refresh(); }
  BS.load = loadArgs;
  q.addEventListener('input', lists);
  root._paint = () => { lists(); flaskChips(); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paintScene()) : null; if(ro) ro.observe(stage);
  routeStrip(); lists(); flaskChips(); ctl(); paintOut(); plan();
}

/* ---------- a discovered compound: structure, properties, the recipe that made it, and a route from the shop ---------- */
function showSynth(key, by, rc){
  Kit.sheet({ title: L.step.label(key), tall: true, build: sb => {
    const cv = h('canvas', { style: { width: '100%', height: '230px', borderRadius: '16px', background: 'var(--card2)', display: 'block' } }); sb.append(cv);
    const r = devicePixelRatio || 1, w = 340; setTimeout(() => { const ww = cv.clientWidth || w; cv.width = ww * r; cv.height = 230 * r; const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); drawMolIn(c, L.graph(key), 0, 0, ww, 230, 1, '#5b5148'); }, 30);
    const pr = L.step.props(key); sb.append(h('div', { class: 'bn-kg', style: { marginTop: '10px' } }, kv('Formula', pf(key).replace(/<[^>]+>/g, '')), kv('Molar mass', pr.M ? pr.M.toFixed(1) + ' g/mol' : '—'), kv('Boils (est.)', pr.tb < 5000 ? Math.round(pr.tb) + ' K' : 'decomposes'), kv('Melts (est.)', Math.round(pr.tm) + ' K')));
    if(by) sb.append(h('div', { class: 'sub' }, 'First made by ' + by));
    const box = h('div', { style: { marginTop: '12px' } }); sb.append(box);
    let recipe = null; try{ recipe = rc ? JSON.parse(rc) : null; }catch(e){}
    if(recipe && recipe.length >= 12){ box.append(h('div', { class: 'cap' }, 'Recipe of the first discoverer'), h('div', { class: 'bn-note' }, recipe[0].map(k => L.step.label(k)).join(' + ') + (recipe[1] ? ' in ' + L.step.label(recipe[1]) : '') + (recipe[2] ? ', catalyst ' + L.step.label(recipe[2]) : '') + ' · ' + recipe[3] + ' K · ' + recipe[4] + ' bar · ' + TIME_LABEL(recipe[8]) + ' · workup: ' + recipe[11]), h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => { BS.load({ keys: recipe[0], solv: recipe[1], cat: recipe[2], T: recipe[3], P: recipe[4], atm: recipe[5], vessel: recipe[6], stir: recipe[7], time: recipe[8], dean: recipe[9], slow: recipe[10], workup: recipe[11], heat: recipe[3] > 400 ? 'mantle' : recipe[3] > 300 ? 'hot' : recipe[3] < 280 ? 'ice' : 'none' }, {}); Kit.toast('Recipe loaded — check your equipment and reagents.', 'good'); tab = 'reactor'; draw(); } }, 'Load into the bench')); }
    box.append(h('button', { class: 'btn sm ghost', style: { marginTop: '8px', marginLeft: recipe ? '8px' : '0' }, onclick: async e => { e.target.disabled = true; e.target.textContent = 'Searching the library…'; const st = await L.step.route(key); e.target.remove(); box.appendChild(st ? h('div', null, h('div', { class: 'cap', style: { marginTop: '10px' } }, 'Route from things you can buy (' + st.length + ' step' + (st.length === 1 ? '' : 's') + ')'), group(st.map((s, i) => row({ title: (i + 1) + '. ' + s.type, sub: s.eq, wrap: true, right: h('button', { class: 'mini', onclick: ev => { ev.stopPropagation(); BS.load(s.a, {}); tab = 'reactor'; draw(); } }, 'Load') })))) : h('div', { class: 'sub' }, 'No route in the shared library yet — that makes this one a frontier compound.')); } }, 'Find a route from the shop'));
  } });
}
