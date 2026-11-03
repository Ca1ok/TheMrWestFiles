/* WestMol — molecular structure for WestLab. DOM-free (runs in the browser and in the GitHub Action).
 *  build(species)   valence-driven construction of a molecular graph (covalent skeleton, ions, polyatomic ions) for ANY valid formula
 *  fromRecord(rec)  a real structure fetched from PubChem (free web lookup), hydrogens completed by valence
 *  lookup(formula)  PubChem PUG-REST lookup → compact record {name, CID, atoms, bonds, 2-D coordinates}
 *  scene(card,...)  atom-by-atom mapping reactants → products, so bonds can be shown breaking and forming; bond-energy bookkeeping
 * Bond energies are average textbook values (kJ/mol) — the animation's bookkeeping is approximate; the tabulated ΔH remains the reference. */
const Mol = (function(){
  'use strict';
  const VAL = { H: 1, C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, S: 2, P: 3, Si: 4, B: 3, Se: 2, As: 3, Ge: 4, Sn: 4, Te: 2 }, HYPER = { S: 6, P: 5, Cl: 7, Br: 7, I: 7, Se: 6, As: 5, Te: 6 };
  const EN = typeof ELECTRONEG !== 'undefined' ? ELECTRONEG : {}, enOf = e => EN[e] !== undefined ? EN[e] : 2;
  const BE = { 'H-H': [436], 'C-H': [413], 'C-C': [347, 614, 839], 'C-O': [358, 745, 1072], 'C-N': [305, 615, 891], 'H-O': [463], 'H-N': [391], 'O-O': [146, 498], 'N-N': [160, 418, 945], 'N-O': [201, 607], 'C-F': [485], 'C-Cl': [339], 'Br-C': [276], 'C-I': [240], 'F-H': [565], 'Cl-H': [431], 'Br-H': [366], 'H-I': [299], 'F-F': [159], 'Cl-Cl': [243], 'Br-Br': [193], 'I-I': [151], 'C-S': [259, 573], 'H-S': [339], 'O-S': [265, 523], 'S-S': [266], 'H-P': [322], 'O-P': [335, 544], 'H-Si': [318], 'O-Si': [452], 'Si-Si': [222], 'C-Si': [301], 'F-N': [283], 'Cl-N': [200], 'F-O': [190], 'Cl-O': [203, 243], 'B-O': [536], 'B-F': [613], 'B-H': [389], 'O-Br': [201] };
  const bondE = (x, y, o) => { const a = BE[[x, y].sort().join('-')]; return a ? (a[o - 1] || a[a.length - 1] * o / a.length) : 250 * o; };
  const gcd = (a, b) => b ? gcd(b, a % b) : a;

  /* ---------- covalent skeleton from a formula (valence rules; hypervalent S, P, halogens; chains for carbon) ---------- */
  function buildCov(comp){
    const atoms = []; Object.keys(comp).forEach(e => { for(let i = 0; i < comp[e]; i++) atoms.push(e); }); if(atoms.length > 40) return null;
    const hal = ['Cl', 'Br', 'I'].filter(e => comp[e] === 1), hub = (hal.length === 1 && (comp.O || 0) >= 2 && !comp.C && !comp.N && !comp.S && !comp.P) ? hal[0] : null;
    const isTerm = e => e === 'H' || e === 'F' || (!hub && (e === 'Cl' || e === 'Br' || e === 'I'));
    const el = [], cap = [], used = [], B = [], add = e => { el.push(e); cap.push(VAL[e] || 2); used.push(0); return el.length - 1; }, free = i => cap[i] - used[i], ext = i => HYPER[el[i]] && cap[i] < HYPER[el[i]];
    const heavy = atoms.filter(e => !isTerm(e)), terms = atoms.filter(isTerm).sort((a, b) => (a === 'H') - (b === 'H'));
    heavy.sort((x, y) => (x === hub ? -1 : y === hub ? 1 : 0) || (VAL[y] || 2) - (VAL[x] || 2) || enOf(x) - enOf(y));
    if(!heavy.length){ if(terms.length === 2){ const i = add(terms[0]), j = add(terms[1]); B.push([i, j, 1]); return { a: el, b: B }; } return terms.length === 1 ? { a: [terms[0]], b: [] } : null; }
    const hv = heavy.map(add), bond = (i, j, o) => { B.push([i, j, o]); used[i] += o; used[j] += o; }, bump = i => { cap[i] = Math.min(HYPER[el[i]], cap[i] + 2); };
    for(let k = 1; k < hv.length; k++){
      const prev = hv[k - 1], c = hv[k]; let p;
      if(el[c] === 'C' && el[prev] === 'C' && free(prev) >= 2) p = prev;
      else if(free(hv[0]) >= 1 || ext(hv[0])) { p = hv[0]; if(free(p) < 1) bump(p); }
      else { p = hv.slice(0, k).sort((a, b) => free(b) - free(a))[0]; if(free(p) < 1){ if(ext(p)) bump(p); else return null; } }
      bond(p, c, 1);
    }
    terms.forEach(e => { const c = add(e); const cand = hv.filter(i => free(i) >= 1 && !HYPER[el[i]]).sort((a, b) => free(b) - free(a) || a - b)[0] ?? hv.filter(i => free(i) >= 1).sort((a, b) => free(b) - free(a))[0] ?? hv.find(ext); if(cand === undefined) return; if(free(cand) < 1) bump(cand); bond(cand, c, 1); });
    for(let pass = 0; pass < 8; pass++) B.forEach(b => { for(const [i, j] of [[b[0], b[1]], [b[1], b[0]]]) if(free(i) > 0 && free(j) === 0 && ext(j)) bump(j); while(free(b[0]) > 0 && free(b[1]) > 0 && b[2] < 3){ b[2]++; used[b[0]]++; used[b[1]]++; } });
    return { a: el, b: B, approx: el.some((e, i) => free(i) !== 0) };
  }
  /* ---------- ions & ionic compounds ---------- */
  function ionGraph(ion){
    const comp = ion.comp, els = Object.keys(comp), q = ion.ch, anion = ion.sign < 0, n = els.reduce((s, e) => s + comp[e], 0);
    if(n === 1) return { a: [els[0]], b: [], q: [anion ? -q : q], anchor: 0 };
    const cen = els.find(e => e !== 'O' && e !== 'H'), nO = comp.O || 0, nH = comp.H || 0;
    if(cen && nO && anion){ const a = [cen], b = [], qq = [0]; let dbl = nO - nH - q; if(dbl < 0) dbl = 0; for(let i = 0; i < nO; i++){ a.push('O'); const o = a.length - 1; const neg = i < q && i >= dbl ? 0 : 0; b.push([0, o, i < dbl ? 2 : 1]); qq.push(i < dbl ? 0 : -1); } for(let i = 0; i < nH; i++){ const o = a.indexOf('O', 1 + dbl); a.push('H'); qq.push(0); const tgt = (1 + dbl + i < a.length && a[1 + dbl + i] === 'O') ? 1 + dbl + i : o; b.push([tgt, a.length - 1, 1]); qq[tgt] = 0; } let deficit = q - qq.filter(v => v < 0).length * -1; return { a, b, q: qq, anchor: 0 }; }
    if(cen && !anion){ const a = [cen], b = [], qq = [q]; for(let i = 0; i < n - 1; i++){ a.push(els.find(e => e !== cen) || 'H'); qq.push(0); b.push([0, i + 1, 1]); } return { a, b, q: qq, anchor: 0 }; }
    const g = buildCov(comp) || { a: Object.keys(comp).flatMap(e => Array(comp[e]).fill(e)), b: [] }; g.q = g.a.map((e, i) => i === 0 ? (anion ? -q : q) : 0); if(anion && comp.O && comp.H && n === 2) g.q = [-q, 0]; g.anchor = 0; return g;
  }
  function build(sp){
    if(sp.kind === 'element'){ const e = sp.el; return sp.apu === 2 ? { a: [e, e], b: [[0, 1, e === 'N' ? 3 : e === 'O' ? 2 : 1]], q: [0, 0] } : { a: [e], b: [], q: [0], metal: !!Chem.isMetal(e) }; }
    const d = Chem.ions(sp.comp);
    if(d && d.cation && d.anion && (Chem.isMetal(d.cation.f) || d.cation.f === 'NH4')){ const cat = ionGraph(Object.assign({}, d.cation, { sign: 1 })), an = ionGraph(Object.assign({}, d.anion, { sign: -1 })), a = [], b = [], q = [], anchC = [], anchA = [];
      const put = (g, list) => { const o = a.length; g.a.forEach((e, i) => { a.push(e); q.push(g.q ? g.q[i] : 0); }); g.b.forEach(x => b.push([x[0] + o, x[1] + o, x[2]])); list.push(o + (g.anchor || 0)); };
      for(let i = 0; i < d.nc; i++) put(cat, anchC); for(let i = 0; i < d.na; i++) put(an, anchA);
      const links = []; for(let k = 0; k < Math.max(anchC.length, anchA.length); k++) links.push([anchC[k % anchC.length], anchA[k % anchA.length]]);
      if(a.length > 40) return { a: a.slice(0, 0), b: [], q: [], links: [] };
      return { a, b, q, links, ionic: true }; }
    return buildCov(sp.comp) || { a: Object.keys(sp.comp).flatMap(e => Array(sp.comp[e]).fill(e)), b: [], approx: true, q: [] };
  }
  /* ---------- deterministic 2-D layout (springs along bonds, repulsion between atoms) ---------- */
  function layout(g){
    if(g.x) return g; const n = g.a.length, x = [], y = [], E = g.b.map(b => [b[0], b[1], 1, .3]).concat((g.links || []).map(l => [l[0], l[1], 1.9, .12]));
    for(let i = 0; i < n; i++){ const t = i * 2.399963, r = .55 * Math.sqrt(i + 1); x[i] = r * Math.cos(t); y[i] = r * Math.sin(t); }
    for(let it = 0; it < 320; it++){ const cool = 1 - it / 320, fx = Array(n).fill(0), fy = Array(n).fill(0);
      for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){ const dx = x[i] - x[j], dy = y[i] - y[j], d2 = Math.max(.05, dx * dx + dy * dy), d = Math.sqrt(d2), f = .45 / d2; fx[i] += dx / d * f; fy[i] += dy / d * f; fx[j] -= dx / d * f; fy[j] -= dy / d * f; }
      E.forEach(([i, j, rest, k]) => { const dx = x[j] - x[i], dy = y[j] - y[i], d = Math.max(.01, Math.hypot(dx, dy)), f = (d - rest) * k * 2; fx[i] += dx / d * f; fy[i] += dy / d * f; fx[j] -= dx / d * f; fy[j] -= dy / d * f; });
      for(let i = 0; i < n; i++){ x[i] += Math.max(-.25, Math.min(.25, fx[i] * .5 * cool)); y[i] += Math.max(-.25, Math.min(.25, fy[i] * .5 * cool)); } }
    const cx = x.reduce((s, v) => s + v, 0) / (n || 1), cy = y.reduce((s, v) => s + v, 0) / (n || 1); g.x = x.map(v => +(v - cx).toFixed(2)); g.y = y.map(v => +(v - cy).toFixed(2)); return g;
  }
  /* ---------- real structures from PubChem (heavy atoms + bonds + 2-D coords); hydrogens completed from valence ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function jget(u, ms){ const c = typeof AbortController !== 'undefined' ? new AbortController() : null, t = c && setTimeout(() => c.abort(), ms || 9000); try{ const r = await fetch(u, c ? { signal: c.signal } : {}); return r.ok ? await r.json() : null; }catch(e){ return null; }finally{ t && clearTimeout(t); } }
  function fromPubChem(rec){
    const pc = rec && rec.PC_Compounds && rec.PC_Compounds[0]; if(!pc || !pc.atoms || !pc.coords) return null;
    const Z = typeof ELEMENTS !== 'undefined' ? ELEMENTS : [], sym = z => (Z.find(r => r[0] === z) || [])[1], ids = pc.atoms.aid, el = pc.atoms.element.map(sym); if(el.some(e => !e)) return null;
    const idx = {}; ids.forEach((a, i) => idx[a] = i); const co = pc.coords[0], cid = co.aid, cx = co.conformers[0].x, cy = co.conformers[0].y, x = [], y = [];
    cid.forEach((a, k) => { x[idx[a]] = cx[k]; y[idx[a]] = cy[k]; });
    const b = pc.bonds ? pc.bonds.aid1.map((a, k) => [idx[a], idx[pc.bonds.aid2[k]], Math.min(3, pc.bonds.order[k] || 1)]) : [], q = el.map(() => 0); (pc.atoms.charge || []).forEach(c => { q[idx[c.aid]] = c.value; });
    let L = 0; b.forEach(([i, j]) => L += Math.hypot(x[i] - x[j], y[i] - y[j])); L = b.length ? L / b.length : 1.5; const g = { a: el, b, q, x: x.map(v => v / L), y: y.map(v => -v / L), real: true }; return completeH(g);
  }
  function completeH(g){                                                         // PubChem depictions omit hydrogens: add them where valence is unsatisfied
    const n = g.a.length, sum = Array(n).fill(0), nb = Array.from({ length: n }, () => []); g.b.forEach(([i, j, o]) => { sum[i] += o; sum[j] += o; nb[i].push(j); nb[j].push(i); });
    for(let i = 0; i < n; i++){ const e = g.a[i]; if(e === 'H' || !(e in VAL) || Chem.isMetal(e)) continue; let v = VAL[e] + ({ N: 1, P: 1, O: 1, S: 1 }[e] && g.q[i] > 0 ? 1 : 0) - (g.q[i] < 0 && ({ N: 1, O: 1, S: 1 }[e]) ? 1 : 0) + (g.q[i] < 0 && e === 'C' ? -1 : 0); if(HYPER[e] && sum[i] > v) v = sum[i]; const h = Math.max(0, v - sum[i]);
      const ang = nb[i].map(j => Math.atan2(g.y[j] - g.y[i], g.x[j] - g.x[i])).sort((a, b) => a - b), gaps = ang.length ? ang.map((a, k) => ({ s: a, w: ((ang[(k + 1) % ang.length] - a) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI })) : [{ s: 0, w: 2 * Math.PI }];
      for(let k = 0; k < h; k++){ gaps.sort((p, r) => r.w - p.w); const gp = gaps[0], t = gp.s + gp.w / 2; g.a.push('H'); g.q.push(0); g.x.push(+(g.x[i] + Math.cos(t)).toFixed(2)); g.y.push(+(g.y[i] + Math.sin(t)).toFixed(2)); g.b.push([i, g.a.length - 1, 1]); gaps.splice(0, 1, { s: gp.s, w: gp.w / 2 }, { s: t, w: gp.w / 2 }); } }
    return g;
  }
  const countEl = g => g.a.reduce((m, e) => (m[e] = (m[e] || 0) + 1, m), {});
  async function lookup(f, comp){
    const B = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug', hill = Chem.hill(comp);
    let j = await jget(B + '/compound/fastformula/' + encodeURIComponent(hill) + '/cids/JSON?MaxRecords=10'), ids = j && j.IdentifierList && j.IdentifierList.CID;
    if(!ids && j && j.Waiting){ for(let i = 0; i < 5 && !ids; i++){ await sleep(1200); const p = await jget(B + '/compound/listkey/' + j.Waiting.ListKey + '/cids/JSON?MaxRecords=10'); ids = p && p.IdentifierList && p.IdentifierList.CID; } }
    if(!ids || !ids.length) return null;
    for(const cid of ids.slice(0, 3)){                                              // first match whose element counts agree exactly
      const rec = await jget(B + '/compound/cid/' + cid + '/JSON'), g = fromPubChem(rec); if(!g) continue;
      const have = countEl(g), ok = Object.keys(comp).every(e => have[e] === comp[e]) && Object.keys(have).length === Object.keys(comp).length; if(!ok) continue;
      const pr = await jget(B + '/compound/cid/' + cid + '/property/Title/JSON'), title = pr && pr.PropertyTable && pr.PropertyTable.Properties && pr.PropertyTable.Properties[0] && pr.PropertyTable.Properties[0].Title;
      return { f, n: title || '', cid, real: 1, a: g.a, b: g.b, x: g.x, y: g.y, q: g.q };
    }
    return null;
  }
  const fromRecord = r => r && r.a ? { a: r.a, b: r.b, x: r.x, y: r.y, q: r.q || r.a.map(() => 0), real: !!r.real } : null;
  const record = (f, name, g, real, cid) => ({ f, n: name || '', cid: cid || 0, real: real ? 1 : 0, a: g.a, b: g.b, x: g.x, y: g.y, q: g.q || g.a.map(() => 0) });

  /* ---------- reaction scene: map every reactant atom onto a product atom ---------- */
  function scene(card, graphOf, W, H){
    let co = card.R.map(x => x[1]).concat(card.Pr.map(x => x[1])).reduce(gcd), items = [];
    const tally = side => side.reduce((s, x) => s + (graphOf(x[0]).a.length) * x[1] / co, 0); if(tally(card.R) > 60 || tally(card.Pr) > 60) return null;
    const mols = (side, key) => { const out = []; side.forEach(x => { const g = graphOf(x[0]); for(let c = 0; c < x[1] / co; c++) out.push({ g, key: x[0] }); }); return out; };
    const R = mols(card.R), P = mols(card.Pr), nAt = R.reduce((s, m) => s + m.g.a.length, 0), Lb = Math.max(17, Math.min(34, Math.sqrt(W * H * .42 / Math.max(6, nAt * 3)))), bb = m => { const xs = m.g.x, ys = m.g.y; return { w: (Math.max(...xs) - Math.min(...xs)) * Lb + 30, h: (Math.max(...ys) - Math.min(...ys)) * Lb + 30, x0: Math.min(...xs), y0: Math.min(...ys) }; };
    const place = (ms, x0, x1) => { const pos = []; let cx = x0, cy = 0, rowH = 0, rows = [[]]; ms.forEach(m => { const b = bb(m); if(cx + b.w > x1 && rows[rows.length - 1].length){ rows.push([]); cx = x0; } rows[rows.length - 1].push({ m, b, cx }); cx += b.w; }); const hs = rows.map(r => Math.max(...r.map(i => i.b.h))), tot = hs.reduce((s, v) => s + v, 0); let y = (H - tot) / 2;
      rows.forEach((r, ri) => { const rw = r.reduce((s, i) => s + i.b.w, 0); let x = x0 + ((x1 - x0) - rw) / 2; r.forEach(i => { for(let k = 0; k < i.m.g.a.length; k++) pos.push({ el: i.m.g.a[k], x: x + i.b.w / 2 + i.m.g.x[k] * Lb, y: y + hs[ri] / 2 + i.m.g.y[k] * Lb, q: i.m.g.q ? i.m.g.q[k] : 0 }); x += i.b.w; }); y += hs[ri]; }); return pos; };
    const Rp = place(R, 8, W * .46), Pp = place(P, W * .54, W - 8);
    const byEl = (arr, side) => { const m = {}; arr.forEach((a, i) => (m[a.el] = m[a.el] || []).push(i)); Object.keys(m).forEach(e => m[e].sort((i, j) => arr[i].y - arr[j].y || arr[i].x - arr[j].x)); return m; };
    const rm = byEl(Rp), pm = byEl(Pp), map = []; Object.keys(rm).forEach(e => rm[e].forEach((ri, k) => { map[ri] = (pm[e] || [])[k]; })); if(map.some(v => v === undefined)) return null;
    const inv = []; map.forEach((p, r) => inv[p] = r);
    const off = (ms) => { let o = 0; return ms.map(m => { const s = o; o += m.g.a.length; return s; }); }, ro = off(R), po = off(P), bondsR = [], bondsP = [], lR = [], lP = []; let Ebr = 0, Efo = 0;
    R.forEach((m, k) => { m.g.b.forEach(([i, j, o]) => { bondsR.push([i + ro[k], j + ro[k], o]); Ebr += bondE(m.g.a[i], m.g.a[j], o); }); (m.g.links || []).forEach(([i, j]) => lR.push([i + ro[k], j + ro[k]])); });
    P.forEach((m, k) => { m.g.b.forEach(([i, j, o]) => { bondsP.push([inv[i + po[k]], inv[j + po[k]], o]); Efo += bondE(m.g.a[i], m.g.a[j], o); }); (m.g.links || []).forEach(([i, j]) => lP.push([inv[i + po[k]], inv[j + po[k]]])); });
    const atoms = Rp.map((a, r) => ({ el: a.el, x0: a.x, y0: a.y, x1: Pp[map[r]].x, y1: Pp[map[r]].y, q0: a.q, q1: Pp[map[r]].q }));
    return { atoms, bondsR, bondsP, linksR: lR, linksP: lP, Ebr: Math.round(Ebr * co), Efo: Math.round(Efo * co), scale: co, ghost: Pp };
  }
  return { build, layout, fromPubChem, fromRecord, record, lookup, scene, bondE, buildCov, completeH };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = Mol;
