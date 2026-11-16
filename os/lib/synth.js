/* Synth — WestLab's synthesis engine (pure, deterministic, no DOM / network / Math.random / Date).
 * A STEP = reagents + solvent + catalyst + vessel + heating + atmosphere + stirring + time + workup.
 *   Synth.card(args)   what happens in that step -> an amount-independent "card" (equation, conversion, selectivity, time, hazards, recovery per product)
 *   Synth.run(card, amounts)  how many mol of what comes out for the amounts you load (limiting reagent, yield, workup recovery)
 *   Synth.cacheKey(args) / validate(card)   the key a shared library uses, and the checks a card must pass before anybody trusts it
 * Chemistry is decided by reaction TEMPLATES (os/lib/synth-rx.js) that edit real molecular graphs (SynthCore); this file decides whether the
 * conditions let the template work (temperature window, solvent class, dryness, atmosphere, catalyst material, pressure, time, stirring) and what the workup recovers.
 * Anything not justified by a template is refused with a reason — nothing is invented. Products are screened (restricted()) and every card is atom-balanced. */
const Synth = (function(){
  'use strict';
  const S = SynthCore, VER = 1, R_GAS = 8.314e-3;
  const CAT = typeof SYNTH_CATALOG !== 'undefined' ? SYNTH_CATALOG : [], ELR = typeof SYNTH_ELEMENT_ROLES !== 'undefined' ? SYNTH_ELEMENT_ROLES : {};
  const VESSELS = typeof SYNTH_VESSELS !== 'undefined' ? SYNTH_VESSELS : {}, CATS = typeof SYNTH_CATALYSTS !== 'undefined' ? SYNTH_CATALYSTS : {};
  const ID_OF = { 'p-Toluenesulfonic acid': 'TsOH', 'Sodium ethoxide': 'NaOEt', 'Potassium tert-butoxide': 'KOtBu', 'Pyridine': 'py', 'Triethylamine': 'Et3N', 'Sodium acetate': 'NaOAc', 'Pyridinium chlorochromate': 'PCC' };
  const EQ = { H: { h: 1 }, O: { o: 2 }, NaBH4: { h: 4 }, LiAlH4: { h: 4 }, H2: { h: 1 }, Fe: { h: 1 }, Zn: { h: 1 }, Sn: { h: 1 }, PCC: { o: 1 }, KMnO4: { o: 2.5 }, K2Cr2O7: { o: 3 }, NaOCl: { o: 1 }, MnO2: { o: 1 }, H2O2: { o: 1 }, HNO3: { o: 1 }, O2: { o: 2 } };
  const DIAT = { H: 'H2', O: 'O2', Cl: 'Cl2', Br: 'Br2', I: 'I2', N: 'N2', F: 'F2' };
  const SIMPLE_SALT_KEYS = { 'H2O': 1, 'HCl': 1, 'HBr': 1, 'NaCl': 1, 'NaBr': 1, 'NaI': 1, 'KCl': 1, 'KBr': 1, 'KI': 1, 'CO2': 1, 'SO2': 1, 'NH4Cl': 1, 'NH3': 1 };
  /* ---------------------------------------------------------------- catalogue index */
  const byKey = {}, byCanon = {}, list = [];
  CAT.forEach(r => {
    const m = S.parse(r[1]); if(!m || !S.valid(m)) return; const c = S.canon(m), o = r[3] || {}, tags = new Set((r[2] || '').split(/\s+/).filter(Boolean));
    let solv = null; tags.forEach(t => { if(t.indexOf('solv:') === 0) solv = t.slice(5); });
    const hasC = !!S.comp(m).C, key = o.k || (hasC ? S.encKey(c) : S.hill(m)), id = o.k || ID_OF[r[0]] || key;
    if(byCanon[c] && o.dup) return;
    const e = { key, id, name: r[0], smi: c, tags, solv, tb: o.tb, tm: o.tm, buy: o.buy !== false, free: !!o.free, wear: o.wear || 0, comp: S.comp(m), mol: m };
    byKey[key] = e; if(!byCanon[c]) byCanon[c] = e; list.push(e);
  });
  const catalog = () => list.slice();
  /* ---------------------------------------------------------------- species */
  const spCache = {};
  function mkSp(key, mol, e){
    const comp = S.comp(mol), tags = new Set(e ? e.tags : []);
    return { key, mol, comp, tags, name: e ? e.name : null, id: e ? e.id : key, tb: e && e.tb, tm: e && e.tm, solv: e && e.solv, cat: e, el: null };
  }
  function species(key){
    if(spCache[key] !== undefined) return spCache[key]; let sp = null;
    if(S.isSKey(key)){ const m = S.parse(S.decKey(key)); if(m && S.valid(m)){ const c = S.canon(m); sp = mkSp(S.encKey(c), m, byCanon[c] && byCanon[c].key === S.encKey(c) ? byCanon[c] : null); } }
    else if(byKey[key]) sp = mkSp(key, byKey[key].mol, byKey[key]);
    else if(DIAT[key] || /^[A-Z][a-z]?$/.test(key)){
      const el = key.replace(/2$/, ''), dia = DIAT[el], m = S.parse(dia ? '[' + el + ']' + '[' + el + ']' : '[' + el + ']'); if(m){ m.a.forEach(a => { a.fx = true; a.h = 0; }); sp = { key: DIAT[key] ? key : key, mol: m, comp: dia ? { [el]: 2 } : { [el]: 1 }, tags: new Set(((ELR[el] || '') + '').split(/\s+/).filter(Boolean)), name: null, id: el, el }; if(el === 'H') sp.tags.add('h2'); if(byKey[dia]) sp.tags = new Set([...sp.tags, ...byKey[dia].tags]); }
    }
    spCache[key] = sp; return sp;
  }
  function inorgKey(comp){
    const h = S.hillStr(comp), c = Object.keys(comp);
    if(c.length === 1){ const e = c[0]; return comp[e] === 2 && DIAT[e] ? e : (comp[e] === 1 ? e : h); }
    if(typeof Chem !== 'undefined'){ try{ if(Chem.init) Chem.init(); const sp = Chem.speciesFromComp(comp); if(sp && sp.key) return sp.key; }catch(e){} }
    return h;
  }
  function keyOfMol(m){                                          // inventory key of a (single-component) molecule
    const c = S.canon(m); if(byCanon[c]) return byCanon[c].key; const cm = S.comp(m);
    if(!cm.C && S.components(m).length === 1 && !m.a.some(a => a.ch)) return inorgKey(cm);
    if(!cm.C && m.a.some(a => a.ch)) return inorgKey(cm);
    return S.encKey(c);
  }
  const nameOfKey = key => { const sp = species(key); return sp && sp.name ? sp.name : null; };

  /* ---------------------------------------------------------------- functional-group finders (all return arrays of atom-index records) */
  const G = {};
  const nbrs = (m, i, adj) => (adj || S.adjOf(m))[i];
  const dblO = (m, adj, i) => adj[i].find(([j, o]) => o === 2 && m.a[j].e === 'O' && !m.a[j].ch);
  G.adj = m => S.adjOf(m);
  G.acids = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C' || a.ar) return; const d = dblO(m, adj, i); if(!d) return; adj[i].forEach(([j, o]) => { const b = m.a[j]; if(b.e === 'O' && o === 1 && adj[j].length === 1 && (b.h === 1)) out.push({ c: i, d: d[0], oh: j }); }); }); return out; };
  G.carboxylates = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C') return; const d = dblO(m, adj, i); if(!d) return; adj[i].forEach(([j, o]) => { const b = m.a[j]; if(b.e === 'O' && o === 1 && b.ch === -1 && adj[j].length === 1) out.push({ c: i, d: d[0], o: j }); }); }); return out; };
  G.esters = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C' || a.ar) return; const d = dblO(m, adj, i); if(!d) return; adj[i].forEach(([j, o]) => { const b = m.a[j]; if(b.e === 'O' && o === 1 && adj[j].length === 2 && !b.ch){ const r = adj[j].find(q => q[0] !== i); if(r && m.a[r[0]].e === 'C') out.push({ c: i, d: d[0], o: j, r: r[0] }); } }); }); return out; };
  G.amides = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C' || a.ar) return; const d = dblO(m, adj, i); if(!d) return; adj[i].forEach(([j, o]) => { if(m.a[j].e === 'N' && o === 1 && !m.a[j].ch) out.push({ c: i, d: d[0], n: j }); }); }); return out; };
  G.acylhalides = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C') return; const d = dblO(m, adj, i); if(!d) return; adj[i].forEach(([j, o]) => { if(['Cl', 'Br'].includes(m.a[j].e) && o === 1) out.push({ c: i, d: d[0], x: j }); }); }); return out; };
  G.anhydrides = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'O' || adj[i].length !== 2 || a.ch) return; const [p, q] = adj[i].map(x => x[0]); if(m.a[p].e === 'C' && m.a[q].e === 'C' && dblO(m, adj, p) && dblO(m, adj, q)) out.push({ o: i, c1: p, c2: q }); }); return out; };
  G.carbonyls = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'C' || a.ar) return; const d = dblO(m, adj, i); if(!d) return; const others = adj[i].filter(q => q[0] !== d[0]); if(others.length && others.every(q => m.a[q[0]].e === 'C')) out.push({ c: i, o: d[0], ald: a.h >= 1 || others.length === 1 }); }); return out; };
  G.aldehydes = (m, adj) => G.carbonyls(m, adj).filter(x => x.ald); G.ketones = (m, adj) => G.carbonyls(m, adj).filter(x => !x.ald);
  G.alcohols = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'O' || a.h !== 1 || a.ch || adj[i].length !== 1) return; const [j, o] = adj[i][0]; const b = m.a[j]; if(b.e === 'C' && !b.ar && o === 1 && !dblO(m, adj, j)) out.push({ o: i, c: j, deg: adj[j].filter(q => m.a[q[0]].e === 'C').length, benzylic: adj[j].some(q => m.a[q[0]].ar) }); }); return out; };
  G.phenols = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'O' || a.h !== 1 || adj[i].length !== 1) return; const j = adj[i][0][0]; if(m.a[j].ar && m.a[j].e === 'C') out.push({ o: i, c: j }); }); return out; };
  G.water = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e === 'O' && !adj[i].length && a.h === 2) out.push({ o: i }); }); return out; };
  G.amines = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e !== 'N' || a.ch || a.ar) return; if(adj[i].some(([j, o]) => o !== 1 || m.a[j].e !== 'C' || dblO(m, adj, j) || (m.a[j].e === 'C' && adj[j].some(q => q[1] === 3 && m.a[q[0]].e === 'N')))) return; out.push({ n: i, h: a.h, aryl: adj[i].some(q => m.a[q[0]].ar), k: adj[i].length }); }); return out; };
  G.ammonia = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e === 'N' && !a.ch && !adj[i].length && a.h === 3) out.push({ n: i, h: 3, aryl: false, k: 0 }); }); return out; };
  G.alkenes = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.b.forEach(([i, j, o]) => { if(o === 2 && m.a[i].e === 'C' && m.a[j].e === 'C' && !m.a[i].ar && !m.a[j].ar && !dblO(m, adj, i) && !dblO(m, adj, j)) out.push({ a: i, b: j }); }); return out; };
  G.alkynes = (m) => m.b.filter(b => b[2] === 3 && m.a[b[0]].e === 'C' && m.a[b[1]].e === 'C').map(b => ({ a: b[0], b: b[1] }));
  G.nitriles = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.b.forEach(([i, j, o]) => { if(o !== 3) return; const c = m.a[i].e === 'C' ? i : m.a[j].e === 'C' ? j : -1, n = m.a[i].e === 'N' ? i : m.a[j].e === 'N' ? j : -1; if(c >= 0 && n >= 0 && !m.a[c].ch) out.push({ c, n }); }); return out; };
  G.nitros = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e === 'N' && a.ch === 1){ const o2 = adj[i].filter(q => m.a[q[0]].e === 'O'), c = adj[i].find(q => m.a[q[0]].e === 'C'); if(o2.length === 2 && c) out.push({ n: i, c: c[0], o: o2.map(q => q[0]) }); } }); return out; };
  G.imines = (m, adj) => { const out = []; m.b.forEach(([i, j, o]) => { if(o === 2 && ((m.a[i].e === 'C' && m.a[j].e === 'N') || (m.a[j].e === 'C' && m.a[i].e === 'N'))){ const c = m.a[i].e === 'C' ? i : j, n = c === i ? j : i; if(!m.a[c].ar && !m.a[n].ar) out.push({ c, n }); } }); return out; };
  G.alkylhalides = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(!['Cl', 'Br', 'I'].includes(a.e) || adj[i].length !== 1) return; const j = adj[i][0][0], b = m.a[j]; if(b.e === 'C' && !b.ar && !dblO(m, adj, j) && adj[i][0][1] === 1) out.push({ x: i, c: j, deg: adj[j].filter(q => m.a[q[0]].e === 'C').length, benzylic: adj[j].some(q => m.a[q[0]].ar) }); }); return out; };
  G.arylhalides = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(!['Cl', 'Br', 'I'].includes(a.e) || adj[i].length !== 1) return; const j = adj[i][0][0]; if(m.a[j].ar) out.push({ x: i, c: j }); }); return out; };
  G.boronics = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.a.forEach((a, i) => { if(a.e === 'B' && adj[i].some(q => m.a[q[0]].ar)) out.push({ b: i, c: adj[i].find(q => m.a[q[0]].ar)[0] }); }); return out; };
  G.arCH = (m, adj) => { const out = []; m.a.forEach((a, i) => { if(a.ar && a.e === 'C' && a.h >= 1) out.push(i); }); return out; };
  G.terminalAlkynes = (m, adj) => G.alkynes(m).filter(x => m.a[x.a].h === 1 || m.a[x.b].h === 1).map(x => ({ a: m.a[x.a].h === 1 ? x.a : x.b, b: m.a[x.a].h === 1 ? x.b : x.a }));
  G.dienes = (m, adj) => { adj = adj || S.adjOf(m); const out = []; m.b.forEach(([i, j, o]) => { if(o !== 1 || m.a[i].e !== 'C' || m.a[j].e !== 'C') return; const d1 = adj[i].find(q => q[1] === 2 && m.a[q[0]].e === 'C' && q[0] !== j), d2 = adj[j].find(q => q[1] === 2 && m.a[q[0]].e === 'C' && q[0] !== i); if(d1 && d2 && !m.a[i].ar && !m.a[j].ar) out.push({ a: d1[0], b: i, c: j, d: d2[0] }); }); return out; };
  G.ringDist = (m, adj, i, j) => { const dist = { [i]: 0 }, q = [i]; while(q.length){ const u = q.shift(); if(u === j) return dist[u]; adj[u].forEach(([v, o]) => { if(o === 1.5 && dist[v] === undefined){ dist[v] = dist[u] + 1; q.push(v); } }); } return -1; };
  G.hasEWG = (m, adj, c) => adj[c].some(([j]) => (m.a[j].e === 'C' && dblO(m, adj, j)) || adj[j].some(q => q[1] === 3 && m.a[j].e === 'C' && m.a[q[0]].e === 'N') || (m.a[j].e === 'N' && m.a[j].ch === 1)) || adj[c].some(([j, o]) => o === 1 && m.a[j].e === 'C' && adj[j].some(q => q[1] === 3));
  /* electrophilic aromatic substitution: which ring CH is attacked? score = sum of the directing effect of every substituent (ortho/para vs meta) and sterics */
  const OP = { O: 1, N: 1, S: .4, F: .3, Cl: .3, Br: .3, I: .3 }, META = new Set(['NO2', 'C=O', 'SO3', 'CN', 'NR3']);
  function subKind(m, adj, ring, z){
    const a = m.a[z]; if(a.e === 'N' && a.ch === 1) return { m: 1, w: 1 }; if(a.e === 'S' && adj[z].some(q => m.a[q[0]].e === 'O' && q[1] === 2)) return { m: 1, w: 1 };
    if(a.e === 'C'){ if(dblO(m, adj, z) || adj[z].some(q => q[1] === 3) || adj[z].filter(q => m.a[q[0]].e === 'F').length === 3) return { m: 1, w: .9 }; return { op: 1, w: .35 }; }
    if(a.e === 'N') return { op: 1, w: adj[z].some(q => m.a[q[0]].e === 'C' && dblO(m, adj, q[0])) ? .6 : 1 };
    if(a.e === 'O') return { op: 1, w: 1 }; if(['F', 'Cl', 'Br', 'I'].includes(a.e)) return { op: 1, w: .3, deact: 1 }; return { op: 1, w: .2 };
  }
  G.easRank = (m, adj) => {                                              // CH positions, best first; each {c, score}
    const ch = G.arCH(m, adj); return ch.map(c => {
      let sc = 0; m.a.forEach((a, z) => { if(a.ar) return; const q = adj[z].find(x => m.a[x[0]].ar && x[0] !== z && m.a[x[0]].e === 'C'); if(!q) return; const ringAtom = q[0], k = subKind(m, adj, ringAtom, z), d = G.ringDist(m, adj, ringAtom, c);
        if(d < 0) return; if(k.op){ if(d === 1) sc += k.w * .8; else if(d === 3) sc += k.w * 1.0; else if(d === 2) sc -= k.w * .2; } else if(k.m){ if(d === 2) sc += k.w * .15; else sc -= k.w * .8; } });
      return { c, score: sc };
    }).sort((x, y) => y.score - x.score || x.c - y.c);
  };
  G.ringActivation = (m, adj) => { let s = 0; m.a.forEach((a, z) => { if(a.ar) return; const q = adj[z].find(x => m.a[x[0]].ar); if(!q) return; const k = subKind(m, adj, q[0], z); s += k.op ? (k.deact ? -.3 : k.w) : -k.w; }); return s; };

  /* ---------------------------------------------------------------- estimated physical properties (used when the catalogue has none) */
  function estimate(m){
    const cm = S.comp(m), M = S.massOfComp(cm), ionic = m.a.some(a => a.ch) || m.a.some(a => S.METAL(a.e));
    if(ionic) return { tb: 9999, tm: 520, logP: -3, ionic: true, M };
    const adj = S.adjOf(m); let tb = 18.3 * Math.pow(Math.max(M, 4), .651);
    const nOH = G.alcohols(m, adj).length + G.phenols(m, adj).length, nAc = G.acids(m, adj).length, nAm = G.amines(m, adj).filter(x => x.h).length, nAmd = G.amides(m, adj).length, nCO = G.carbonyls(m, adj).length, nEs = G.esters(m, adj).length;
    tb += (nOH ? 130 + 60 * (nOH - 1) : 0) + (nAc ? 129 + 40 * (nAc - 1) : 0) + nAm * 67 + nAmd * 200 + nCO * 67 + nEs * 12 + (cm.Cl || 0) * 40 + (cm.Br || 0) * 75 + (cm.I || 0) * 105 + G.nitros(m, adj).length * 100 + G.nitriles(m, adj).length * 60;
    const rings = m.a.filter(a => a.ar).length / 6; tb += rings * 30; const hb = nOH + nAc + nAm + nAmd;
    const tm = Math.min(tb - 20, .5 * tb + hb * 12 + rings * 25 + (nAcAmide(nAc, nAmd) ? 40 : 0));
    const polar = nOH * 1.4 + nAc * 1.8 + nAm * 1.3 + nCO * 1 + nEs * .7 + nAmd * 1.6, logP = .5 * (cm.C || 0) + rings * 0 - polar + (cm.Cl || 0) * .6 + (cm.Br || 0) * .9 - G.nitros(m, adj).length * .2 - (cm.O && !polar ? .6 * (cm.O) : 0);
    return { tb: Math.round(tb), tm: Math.round(tm), logP, ionic: false, M };
  }
  const nAcAmide = (a, b) => a + b > 0;
  const propCache = {};
  function props(key){
    if(propCache[key]) return propCache[key]; const sp = species(key); let p;
    if(!sp) p = { tb: 400, tm: 300, logP: 0, M: 100, ionic: false };
    else { const e = sp.mol ? estimate(sp.mol) : { tb: 9999, tm: 600, logP: -2, M: S.massOfComp(sp.comp), ionic: true }; p = Object.assign({}, e, sp.tb ? { tb: sp.tb } : {}, sp.tm ? { tm: sp.tm } : {}); if(sp.tags.has('w')) p.logP = Math.min(p.logP, -.6); p.known = !!sp.tb; }
    return propCache[key] = p;
  }
  const phaseAt = (key, T) => { const p = props(key); return T < p.tm ? 's' : T < p.tb ? 'l' : 'g'; };

  /* ---------------------------------------------------------------- restricted products */
  function restricted(m){
    const cm = S.comp(m), adj = S.adjOf(m), nit = G.nitros(m, adj);
    if(m.b.some(([i, j]) => m.a[i].e === 'O' && m.a[j].e === 'O') && cm.C) return 'organic peroxides are unstable explosives';
    if(nit.length >= 2) return 'polynitro compounds are explosives';
    if(nit.some(n => adj[n.c].some(q => m.a[q[0]].e === 'O'))) return 'nitrate esters are explosives';
    const smi = S.canon(m);
    if(/N=\[N\+\]=\[N-\]|\[N-\]=\[N\+\]=N|N#\[N\+\]/.test(smi) && cm.C) return 'azides and diazonium salts are shock-sensitive';
    if(m.a.some((a, i) => a.e === 'P' && adj[i].some(q => ['F', 'Cl'].includes(m.a[q[0]].e) || (m.a[q[0]].e === 'C' && adj[q[0]].some(r => r[1] === 3)))) && m.a.some((a, i) => a.e === 'P' && adj[i].some(q => q[1] === 2 && m.a[q[0]].e === 'O'))) return 'organophosphorus nerve-agent class';
    if(/ClCC[SN]|ClCCN\(CCCl\)|ClCCSCCCl/.test(smi)) return 'mustard agents are chemical weapons';
    if(/^O=C\(Cl\)Cl$|^ClC\(Cl\)=O$|^ClC\(=O\)Cl$/.test(smi)) return 'phosgene is a chemical weapon';
    // amphetamine / phenethylamine-with-alpha-methyl core and a few other controlled scaffolds
    if(/c1ccccc1CC\(C\)N|c1ccccc1CC\(C\)\[NH|CC\(N\)Cc1ccccc1|CC\(NC\)Cc1ccccc1|CC\(Cc1ccccc1\)N/.test(smi)) return 'this substance class is controlled';
    if(/N\(c1ccccc1\)C\(=O\)CC|C1CCN\(CC1\)CCc1ccccc1/.test(smi)) return 'this substance class is controlled';
    return null;
  }

  /* ---------------------------------------------------------------- the step context */
  const SOLV = { p: 'protic', a: 'aprotic polar', n: 'non-polar', e: 'ether', c: 'chlorinated', ac: 'acidic', x: 'neat' };
  function makeCtx(a){
    const subs = []; (a.keys || []).forEach((k, i) => { const sp = species(k); if(sp) subs.push(Object.assign({ i, kind: sp.mol ? 'mol' : 'x' }, sp)); });
    const solv = a.solv ? species(a.solv) : null, cat = a.cat ? species(a.cat) : null, V = VESSELS[a.vessel] || VESSELS.flask || {};
    const c = { a, subs, T: +a.T || 298, P: +a.P || 1, atm: a.atm || 'air', time: +a.time || 60, stir: a.stir ? 1 : 0, dean: !!a.dean, slow: !!a.slow, V, vessel: a.vessel || 'flask', workup: a.workup || 'none',
      solv: solv ? { key: solv.key, cls: solv.solv || 'p', tb: props(solv.key).tb, name: solv.name, tags: solv.tags, water: solv.key === 'H2O' } : null, cat: cat ? { key: cat.key, id: cat.id, tags: cat.tags, el: cat.el } : null };
    c.uv = !!V.uv; c.inert = c.atm === 'N2' || c.atm === 'Ar' || c.atm === 'vac' || !!V.inert;
    c.has = t => subs.filter(s => s.tags.has(t)); c.hasId = id => subs.filter(s => s.id === id || s.key === id);
    c.organic = subs.filter(s => s.mol && s.comp.C && !s.tags.has('solv:p') || false);
    return c;
  }

  /* ---------------------------------------------------------------- templates register here (synth-rx.js) */
  const TPL = []; const addTemplate = t => { TPL.push(t); };
  const heq = s => (EQ[s.id] || EQ[s.key] || {}).h, oeq = s => (EQ[s.id] || EQ[s.key] || {}).o;

  /* condition defaults + assessment */
  const DEF = { y: .9, T: [273, 600, 290, 400], Ea: 60, tau: 30, solv: 'panecax', cat0: 1, het: 0, dry: 0, inert: 0, Pmin: 0, exo: 0, eq: 1, uv: 0 };
  function assess(plan, c){
    const cd = Object.assign({}, DEF, plan.cond || {}), why = [], warn = [], V = c.V; let eta = cd.y;
    const fail = s => { why.push(s); };
    if(c.T > (V.Tmax || 400)) fail('The ' + (V.name || 'vessel').toLowerCase() + ' cannot reach ' + Math.round(c.T) + ' K.');
    if(c.P > (V.Pmax || 1.5) + 1e-9 && c.P > 1) fail('This vessel is not rated for ' + c.P + ' bar.');
    if(cd.Pmin > 1){ if(!V.sealed) fail('Needs a sealed, pressure-rated vessel (≥ ' + cd.Pmin + ' bar).'); else if(c.P < cd.Pmin * .8) fail('Needs about ' + cd.Pmin + ' bar — you set ' + c.P + ' bar.'); else eta *= Math.min(1, Math.pow(c.P / cd.Pmin, .5)); }
    else if(c.P > 5 && !cd.hiP) warn.push('Pressure does not help this reaction.');
    if(cd.uv && !c.uv && c.T < cd.uvT) fail('Needs UV light — use the photoreactor' + (cd.uvT ? ' (or heat above ' + cd.uvT + ' K)' : '') + '.');
    // solvent
    const sc = c.solv ? c.solv.cls : 'x';
    if(cd.solv.indexOf(sc === 'ac' ? 'a' : sc) < 0 && !(sc === 'ac' && cd.solv.indexOf('c') >= 0)){
      fail(sc === 'x' ? 'This reaction needs a solvent (' + solvWords(cd.solv) + ').' : 'The solvent (' + (c.solv.name || sc) + ') is wrong for this reaction — use ' + solvWords(cd.solv) + '.'); }
    else if(cd.sf && cd.sf[sc] !== undefined) eta *= cd.sf[sc];
    // boiling-off and effective temperature
    let Teff = c.T; if(c.solv && c.T > c.solv.tb - 3){ if(V.reflux || V.sealed){ if(!V.sealed) Teff = Math.min(c.T, c.solv.tb); } else { eta *= .25; warn.push('The solvent boils off in open glassware — use a reflux condenser.'); Teff = c.solv.tb; } }
    // temperature window [Tmin, Tmax, opt lo, opt hi]
    const [Tlo, Thi, Ol, Oh] = cd.T; let fT = 1;
    if(Teff < Tlo){ fT = Teff < Tlo - 25 ? 0 : .15 * (1 - (Tlo - Teff) / 25); if(fT === 0) fail('Too cold: nothing happens below about ' + Tlo + ' K.'); else warn.push('Close to the minimum temperature — slow.'); }
    else if(Teff < Ol) fT = .45 + .55 * (Teff - Tlo) / Math.max(1, Ol - Tlo);
    else if(Teff > Thi){ fT = 0; fail('Too hot: the material decomposes above about ' + Thi + ' K.'); }
    else if(Teff > Oh){ fT = 1 - .5 * (Teff - Oh) / Math.max(1, Thi - Oh); warn.push('Hotter than ideal — more by-products (tar).'); }
    eta *= fT;
    // dryness / air
    const wet = c.subs.some(s => s.tags.has('w') && !(plan.cond && plan.cond.wetOK)) || (c.solv && (c.solv.cls === 'p' || c.solv.cls === 'ac')) || (plan.free || []).some(f => f.k === 'H2O' && !f.workup);
    if(cd.dry){ if(!V.dry) fail('Moisture and air destroy the reagent: use the Schlenk flask (dry, inert).'); else if(wet) fail('A wet or protic reagent / solvent destroys the reagent — use a dry ether or hydrocarbon solvent.'); }
    if(cd.inert && !c.inert){ eta *= .3; warn.push('Air-sensitive: use nitrogen or argon.'); }
    // catalyst
    const cc = c.cat, cm = cd.cat; let fC = cd.cat0, rate = 1;
    if(cm){ if(cc && cm[cc.id] !== undefined){ fC = cm[cc.id]; rate = fC; } else if(cc && cm[cc.key] !== undefined){ fC = cm[cc.key]; rate = fC; } else { if(cc) warn.push((cc.key) + ' does nothing here.'); if(cd.catReq) fail('Needs a catalyst: ' + Object.keys(cm).join(', ') + '.'); } }
    else if(cc && !cd.catOK) warn.push('The catalyst does nothing for this reaction.');
    if(fC <= 0) fC = .02;
    eta *= Math.min(1, fC);
    // stirring
    if(cd.het && !c.stir){ eta *= .6; warn.push('Two phases: stir with the magnetic stirrer for a better yield.'); }
    // equilibrium
    let eqc = cd.eq; if(eqc < 1 && c.dean && cd.ds) eqc = Math.min(.97, eqc + .28); eta *= eqc;
    // time (first order, Arrhenius around the middle of the optimal window)
    const Tref = (Ol + Oh) / 2, tau = cd.tau * Math.exp(cd.Ea / R_GAS * (1 / Math.max(150, Teff) - 1 / Tref)) / Math.max(.05, rate) / (cd.het && !c.stir ? 1.6 : 1), conv = 1 - Math.exp(-c.time / tau);
    eta *= Math.max(.0001, conv); if(conv < .6 && !why.length) warn.push('Not finished — give it more time (about ' + fmtMin(3 * tau) + ' for 95 %).');
    if(cd.exo >= 2 && !c.slow) warn.push('Strongly exothermic — add the reagent dropwise and cool for larger batches.');
    const unused = c.subs.filter(x => !plan.use.some(u => u.i === x.i) && x.i !== plan.red && x.i !== plan.ox); if(unused.length) why.push(unused.map(x => x.name || x.key).join(', ') + (unused.length > 1 ? ' take' : ' takes') + ' no part in this reaction — remove ' + (unused.length > 1 ? 'them' : 'it') + ' or change the conditions.');
    const ok = !why.length && eta >= .015;
    return { ok, why, warn, eta: ok ? Math.min(.99, eta) : 0, conv, tau, t95: 3 * tau, Teff, exo: cd.exo, quench: !!cd.quench };
  }
  const solvWords = s => s.split('').filter(x => x !== 'x').map(x => ({ p: 'a protic solvent (water, alcohol)', a: 'a polar aprotic solvent', n: 'a hydrocarbon solvent', e: 'a dry ether', c: 'a chlorinated solvent' }[x])).filter(Boolean).join(' or ') + (s.indexOf('x') >= 0 ? ' (or neat)' : '');
  const fmtMin = m => m < 1 ? Math.round(m * 60) + ' s' : m < 90 ? Math.round(m) + ' min' : m < 2880 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d';

  /* ---------------------------------------------------------------- workup: what comes out of the flask */
  function recovery(kind, key, role, c, plan){
    const p = props(key), T = 293, ph = phaseAt(key, T), sp = species(key), ionic = p.ionic, org = !!(sp && sp.comp.C);
    const salt = ionic && org, solvW = c.solv && c.solv.water;
    switch(kind){
      case 'none': return org && !ionic ? .4 : 0;
      case 'filter': return ph === 's' && !(sp && sp.tags.has('w') && solvW) ? .9 : (ph === 's' ? .2 : 0);
      case 'crystal': return ph === 's' ? (sp && sp.tags.has('w') && solvW ? .35 : .75) : 0;
      case 'extract': return ionic ? 0 : ph === 'g' ? 0 : p.logP > .3 ? .85 : p.logP > -.5 ? .5 : .1;
      case 'acidify': return ionic ? 0 : ph === 's' && org ? .88 : ph === 'l' && p.logP > .3 ? .7 : 0;
      case 'quench': return ionic ? 0 : ph === 'g' ? 0 : p.logP > -.2 ? .85 : .4;
      case 'saltout': return salt && (sp.comp.C || 0) >= 10 ? .9 : 0;
      case 'distill': { if(ionic) return 0; if(ph === 'g') return .6; const others = (plan.prods || []).filter(q => q !== role).map(q => q.key).filter(Boolean).concat(c.solv ? [c.solv.key] : []); const d = Math.min(99, ...others.map(k => Math.abs(props(k).tb - p.tb))); return ph === 's' ? (p.tb < 700 ? .5 : 0) : d >= 15 ? .8 : .45; }
      case 'evap': { if(ionic && !org) return .0; const solvTb = c.solv ? c.solv.tb : 300; return ph === 's' || p.tb - solvTb >= 40 ? .9 : .1; }
      case 'column': return ionic ? .05 : ph === 'g' ? 0 : .75;
    }
    return 0;
  }
  const TRIVIAL = new Set(['H2O', 'CO2', 'HCl', 'HBr', 'HI', 'SO2', 'NH3', 'H2', 'O2', 'NaCl', 'KCl', 'NaBr', 'KBr', 'NaI', 'KI', 'NH4Cl']);

  /* ---------------------------------------------------------------- matching + card */
  const gcd = (x, y) => { x = Math.round(x * 1e6); y = Math.round(y * 1e6); while(y){ [x, y] = [y, x % y]; } return x / 1e6; };
  function compOfPlan(plan, c, tok){
    const U = {}, add = (cp, n) => { Object.keys(cp).forEach(e => { U[e] = (U[e] || 0) + cp[e] * n; }); };
    plan.use.forEach(u => add(c.subs.find(s => s.i === u.i).comp, u.n)); (plan.free || []).forEach(f => add(species(f.k).comp, f.n)); if(tok){ if(tok.H) add({ H: 2 }, tok.H); if(tok.O) add({ O: 1 }, tok.O); }
    const P = {}; plan.prods.forEach(p => { Object.keys(p.comp).forEach(e => { P[e] = (P[e] || 0) + p.comp[e] * p.n; }); });
    return { U, P };
  }
  function finishPlan(plan, c){
    // product keys / compositions
    for(const p of plan.prods){ if(p.m){ if(!S.valid(p.m)) return { err: 'internal: invalid product valence' }; const comps = S.split(p.m); if(comps.length > 1 && !p.salt){ return { err: 'internal: product fragments' }; } p.key = keyOfMol(p.m); p.comp = S.comp(p.m); p.smi = S.canon(p.m); } else { p.key = p.k; const sp = species(p.k); p.comp = sp ? sp.comp : (typeof Chem !== 'undefined' && Chem.parse ? Chem.parse(p.k) : null); if(!p.comp) return { err: 'internal: unknown co-product ' + p.k }; } }
    // oxidation / reduction tokens inferred from the composition difference
    const { U, P } = compOfPlan(plan, c); const dH = (P.H || 0) - (U.H || 0), dO = (P.O || 0) - (U.O || 0); const rest = {}; Object.keys(P).concat(Object.keys(U)).forEach(e => { if(e !== 'H' && e !== 'O'){ const d = (P[e] || 0) - (U[e] || 0); if(Math.abs(d) > 1e-9) rest[e] = d; } });
    if(Object.keys(rest).length) return { err: 'internal: unbalanced (' + JSON.stringify(rest) + ')' };
    let tok = { H: 0, O: 0 };
    if(Math.abs(dH) > 1e-9 || Math.abs(dO) > 1e-9){ tok = { H: dH / 2, O: dO }; if(tok.H < -1e-9 || tok.O < -1e-9) return { err: 'internal: unbalanced H/O (' + dH + ',' + dO + ')' }; if(tok.H > 1e-9 && plan.red === undefined) return { err: 'internal: reduction without a reductant' }; if(tok.O > 1e-9 && plan.ox === undefined) return { err: 'internal: oxidation without an oxidant' }; }
    plan.tok = tok;
    // spent redox reagent consumption
    const extra = [];
    if(tok.H > 1e-9){ const r = c.subs.find(s => s.i === plan.red); if(!r || !heq(r)) return { err: 'internal: no reductant' }; extra.push({ i: r.i, n: tok.H / heq(r), spent: true }); }
    if(tok.O > 1e-9){ const o = c.subs.find(s => s.i === plan.ox); if(!o || !oeq(o)) return { err: 'internal: no oxidant' }; extra.push({ i: o.i, n: tok.O / oeq(o), spent: true }); }
    plan.use = plan.use.concat(extra);
    // scale to integers where possible
    const ns = plan.use.filter(u => !u.spent).map(u => u.n).concat(plan.prods.map(p => p.n)).concat((plan.free || []).map(f => f.n)); let k = 1; for(const m of [1, 2, 3, 4, 5, 6, 8, 10, 12, 20]){ if(ns.every(n => Math.abs(n * m - Math.round(n * m)) < 1e-6)){ k = m; break; } k = 1; }
    if(k > 1){ plan.use.forEach(u => { u.n *= k; }); plan.prods.forEach(p => { p.n *= k; }); (plan.free || []).forEach(f => { f.n *= k; }); if(plan.tok){ plan.tok.H *= k; plan.tok.O *= k; } }
    plan.k = k; return null;
  }
  const pretty = f => String(f).replace(/\d+/g, d => d.split('').map(x => '₀₁₂₃₄₅₆₇₈₉'[+x]).join(''));
  function labelOf(key){ const sp = species(key); if(!sp) return key; if(sp.name) return sp.name; if(sp.mol){ const c = S.comp(sp.mol), cl = classOfMol(sp.mol); return cl ? S.hillStr(c) + ' (' + cl + ')' : S.hillStr(c); } return pretty(key); }
  function classOfMol(m){
    const adj = S.adjOf(m); const t = [['carboxylic acid', G.acids], ['ester', G.esters], ['amide', G.amides], ['aldehyde', G.aldehydes], ['ketone', G.ketones], ['alcohol', G.alcohols], ['phenol', G.phenols], ['amine', G.amines], ['nitrile', G.nitriles], ['alkene', G.alkenes], ['alkyl halide', G.alkylhalides], ['aryl halide', G.arylhalides], ['nitro compound', G.nitros]];
    for(const [n, f] of t) if(f(m, adj).length) return n; return m.a.some(a => a.ar) ? 'arene' : (m.a.length > 1 ? 'organic' : '');
  }
  function eqText(plan, c){
    const sym = k => { const sp = species(k); return sp && sp.mol && !sp.mol.a.some(a => a.ch) && sp.comp.C ? S.hillStr(sp.comp) : pretty(sp ? (sp.name && S.hillStr(sp.comp) || S.hillStr(sp.comp)) : k); };
    const co = n => (Math.abs(n - 1) < 1e-9 ? '' : (+n.toFixed(3)) + ' ');
    const L = plan.use.filter(u => !u.spent || true).map(u => { const s = c.subs.find(x => x.i === u.i); return co(u.n) + (s.mol && s.comp.C ? S.canon(s.mol).replace(/\[|\]/g, m => m) : pretty(S.hillStr(s.comp))); });
    return L;
  }
  function plainEq(plan, c){
    const fm = (comp, key) => comp.C ? S.hillStr(comp) : pretty(key && !S.isSKey(key) ? key : S.hillStr(comp));
    const co = n => (Math.abs(n - 1) < 1e-9 ? '' : +n.toFixed(2) + ' ');
    const lhs = plan.use.filter(u => !u.spent).map(u => { const s = c.subs.find(x => x.i === u.i); return co(u.n) + fm(s.comp, s.key === 'H' ? 'H2' : s.key); }).concat((plan.free || []).map(x => co(x.n) + pretty(x.k)));
    const rd = plan.red !== undefined ? c.subs.find(s => s.i === plan.red) : null, od = plan.ox !== undefined ? c.subs.find(s => s.i === plan.ox) : null;
    if(plan.tok && plan.tok.H > 1e-9) lhs.push(co(plan.tok.H) + (rd && (rd.id === 'H2' || rd.id === 'H') ? 'H₂' : '[H₂]'));
    if(plan.tok && plan.tok.O > 1e-9) lhs.push(co(plan.tok.O) + '[O]');
    const rhs = plan.prods.map(p => co(p.n) + fm(p.comp, p.m ? '' : p.key));
    return lhs.join(' + ') + ' → ' + rhs.join(' + ');
  }
  function usesOrganic(c){ return c.subs.some(s => s.mol && s.comp.C && !s.tags.has('solv:e') || (s.mol && s.comp.C)); }

  function card(a){
    const c = makeCtx(a), key = cacheKey(a);
    if(!c.subs.length || c.subs.length !== (a.keys || []).length) return { v: 1, ev: VER, ok: false, key, why: 'Add reagents to the flask.' };
    if(c.subs.some(s => !s)) return { v: 1, ev: VER, ok: false, key, why: 'Unknown reagent.' };
    const cands = []; let refused = null;
    for(const t of TPL){
      let plan = null; try{ plan = t.fn(c); }catch(e){ plan = null; if(api.debug) console.error('template ' + t.id + ':', e && e.stack || e); }
      if(!plan) continue; if(plan.refuse){ refused = refused || plan.refuse; continue; }
      plan.tpl = t; plan.prods.forEach(p => { if(p.m) S.norm(p.m); });
      const err = finishPlan(plan, c); if(err){ if(api.debug) console.error('bad plan', t.id, err.err); cands.push({ plan, bad: err.err }); continue; }
      const as = assess(plan, c); cands.push({ plan, as });
    }
    const good = cands.filter(x => !x.bad); const nUsed = x => x.plan.use.filter(u => !u.spent).length; good.sort((x, y) => (y.as.ok - x.as.ok) || (nUsed(y) - nUsed(x)) || (y.as.eta - x.as.eta) || 0);
    if(!good.length){ return { v: 1, ev: VER, ok: false, key, why: refused || 'No reaction is known for these reagents together. Check the reagent roles: an acid and an alcohol, an alkene and a halogen, a carbonyl and a hydride …', refused: !!refused, legacy: !c.subs.some(s => s.mol && s.comp.C) }; }
    const best = good[0], plan = best.plan, as = best.as;
    const out = { v: 1, ev: VER, kind: 'S', ok: as.ok, key, type: plan.tpl.name, fam: plan.tpl.fam, note: plan.note || '', why: as.ok ? '' : as.why.join(' '), warn: as.warn, a: normArgs(a) };
    if(!as.ok) return Object.assign(out, { alt: good.slice(1, 3).filter(x => x.as.ok || x.as.why.length).map(x => x.plan.tpl.name), tpl: plan.tpl.id });
    // restricted products
    for(const p of plan.prods){ if(p.m && p.role !== 'co'){ const r = restricted(p.m); if(r) return Object.assign(out, { ok: false, why: 'Restricted: ' + r + '. The lab will not make it.', restricted: true }); } }
    const prodSp = plan.prods.map(p => ({ key: p.key, comp: p.comp, n: p.n, role: p.role || 'main', f: p.m ? S.hillStr(p.comp) : p.key, smi: p.smi || '', name: p.name || nameOfKey(p.key) }));
    const R = plan.use.map(u => { const s = c.subs.find(x => x.i === u.i); return { key: s.key, n: u.n, f: s.comp.C ? S.hillStr(s.comp) : pretty(S.hillStr(s.comp)), spent: !!u.spent, mol: s.mol ? 1 : 0 }; });
    const rec = {}; plan.prods.forEach(p => { rec[p.key] = +recovery(c.workup, p.key, p, c, { prods: plan.prods }).toFixed(3); });
    // acidify: a carboxylate/phenoxide salt product is converted to its free acid at the workup (card.Pr keeps the reaction's own product so the atoms balance; .iso is what you isolate)
    if(c.workup === 'acidify'){ plan.prods.forEach((p, i) => { if(p.m && p.salt){ const q = acidifyMol(p.m); if(q){ const ik = keyOfMol(q); prodSp[i].iso = { key: ik, smi: S.canon(q), f: S.hillStr(S.comp(q)), name: nameOfKey(ik) }; rec[p.key] = +recovery('acidify', ik, p, c, { prods: plan.prods }).toFixed(3) || .85; } } }); }
    const redo = plan.tok ? plan.tok : { H: 0, O: 0 };
    Object.assign(out, { eq: plainEq(plan, c), R, Pr: prodSp, free: (plan.free || []).map(f => ({ k: f.k, n: f.n })), eta: +as.eta.toFixed(4), conv: +as.conv.toFixed(4), t95: +as.t95.toFixed(2), tau: +as.tau.toFixed(2), Teff: Math.round(as.Teff), rec, exo: as.exo, quench: as.quench, tok: redo, sel: plan.sel || '', minor: plan.minor || [], solvent: c.solv ? c.solv.key : '', tpl: plan.tpl.id });
    if(as.quench && c.workup !== 'quench'){ out.rec = {}; Object.keys(rec).forEach(k => { out.rec[k] = 0; }); out.warn = (out.warn || []).concat('Organometallic / hydride product sits as a metal salt: finish with the acid quench workup, or you recover nothing.'); }
    const v = validate(out); if(!v.ok) return { v: 1, ev: VER, ok: false, key, why: 'Rejected by the engine checks (' + v.why + ').', invalid: true };
    return out;
  }
  function acidifyMol(m){ const q = S.clone(m); const adj = S.adjOf(q); let done = false; const drop = new Set(); q.a.forEach((a, i) => { if(a.e === 'O' && a.ch === -1){ a.ch = 0; a.fx = false; done = true; } if(S.METAL(a.e) && a.ch > 0 && !adj[i].length) drop.add(i); }); if(!done) return null; const r = S.removeAtoms(q, drop); S.norm(r); return S.valid(r) ? r : null; }
  function normArgs(a){ return { keys: (a.keys || []).slice(0, 4), solv: a.solv || '', cat: a.cat || '', T: Math.round(+a.T), P: +a.P, atm: a.atm || 'air', vessel: a.vessel || 'flask', stir: a.stir ? 1 : 0, time: +a.time, dean: a.dean ? 1 : 0, slow: a.slow ? 1 : 0, workup: a.workup || 'none' }; }
  function cacheKey(a){
    const n = normArgs(a), T = Math.round(n.T / 5) * 5;
    return 'p' + VER + '|' + n.keys.slice().sort().join('+') + '|' + n.solv + '|' + n.cat + '|' + T + '|' + n.P + '|' + n.atm + '|' + n.vessel + '|' + n.stir + n.dean + n.slow + '|' + n.time + '|' + n.workup;
  }
  function fnv(s){ let h = 0x811c9dc5; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  const shardOf = key => fnv(key).slice(0, 2);

  /* A card must pass these before anyone trusts it (client loading a shared card, the Action committing one, and card() itself before returning). */
  const Synth_keyOf = m => keyOfMol(m);
  function validate(cd){
    if(!cd || cd.kind !== 'S' || !cd.ok) return { ok: false, why: 'not a successful step card' };
    if(cd.ev !== VER) return { ok: false, why: 'engine version' };
    if(!Array.isArray(cd.R) || !Array.isArray(cd.Pr) || !cd.R.length || !cd.Pr.length || cd.R.length > 6 || cd.Pr.length > 8) return { ok: false, why: 'shape' };
    if(!(cd.eta > 0 && cd.eta <= 1) || !(cd.conv > 0 && cd.conv <= 1)) return { ok: false, why: 'yield out of range' };
    const U = {}, P = {}; let okc = true;
    cd.R.forEach(r => { const sp = species(r.key); if(!sp || !(r.n > 0)) { okc = false; return; } Object.keys(sp.comp).forEach(e => { U[e] = (U[e] || 0) + sp.comp[e] * r.n; }); });
    (cd.free || []).forEach(f => { const sp = species(f.k); if(!sp){ okc = false; return; } Object.keys(sp.comp).forEach(e => { U[e] = (U[e] || 0) + sp.comp[e] * f.n; }); });
    if(cd.tok){ if(cd.tok.H) U.H = (U.H || 0) + 0; }
    cd.Pr.forEach(p => { if(!(p.n > 0) || !p.comp){ okc = false; return; } if(p.smi){ const m = S.parse(p.smi); if(!m || !S.valid(m) || S.canon(m) !== p.smi || S.hillStr(S.comp(m)) !== S.hillStr(p.comp)){ okc = false; return; } if(restricted(m) && p.role !== 'co') okc = false; } Object.keys(p.comp).forEach(e => { P[e] = (P[e] || 0) + p.comp[e] * p.n * (cd.k ? 1 : 1); }); });
    if(!okc) return { ok: false, why: 'invalid species or product structure' };
    // reagent compositions (before spent-token handling) must equal products once the redox tokens are added
    const tk = cd.tok || { H: 0, O: 0 }; const U2 = Object.assign({}, U); // spent redox reagents contribute their own atoms; the tokens stand for the part that changes oxidation state
    const redoxIds = cd.R.filter(r => r.spent).map(r => r.key); let Ux = {}; cd.R.forEach(r => { if(r.spent) return; const sp = species(r.key); Object.keys(sp.comp).forEach(e => { Ux[e] = (Ux[e] || 0) + sp.comp[e] * r.n; }); }); (cd.free || []).forEach(f => { const sp = species(f.k); Object.keys(sp.comp).forEach(e => { Ux[e] = (Ux[e] || 0) + sp.comp[e] * f.n; }); });
    if(tk.H) Ux.H = (Ux.H || 0) + 2 * tk.H; if(tk.O) Ux.O = (Ux.O || 0) + tk.O;
    const els = new Set(Object.keys(Ux).concat(Object.keys(P))); for(const e of els){ if(Math.abs((Ux[e] || 0) - (P[e] || 0)) > 1e-6) return { ok: false, why: 'atoms not balanced (' + e + ')' }; }
    cd.Pr.forEach(p => { if(p.iso){ const m = S.parse(p.iso.smi); if(!m || !S.valid(m) || S.canon(m) !== p.iso.smi || S.hillStr(S.comp(m)) !== p.iso.f || Synth_keyOf(m) !== p.iso.key || restricted(m)) okc = false; } });
    Object.keys(cd.rec || {}).forEach(k => { if(!(cd.rec[k] >= 0 && cd.rec[k] <= 1)) okc = false; });
    return okc ? { ok: true } : { ok: false, why: 'recovery out of range' };
  }

  /* ---------------------------------------------------------------- run: amounts -> moles */
  function run(cd, amounts, o){
    o = o || {}; const A = {}; let ext = Infinity, lim = null;
    cd.R.forEach(r => { const have = Math.max(0, Math.floor(+amounts[r.key] || 0)); A[r.key] = have; const e = have / r.n; if(e < ext){ ext = e; lim = r.key; } });
    if(!(ext > 0) || !isFinite(ext)) return { ok: false, why: 'Load every reagent.' };
    const conv = cd.conv, madeEta = cd.eta, used = {}, back = {}, made = {}, notes = [];
    cd.R.forEach(r => { used[r.key] = (used[r.key] || 0) + r.n * ext * Math.max(conv, .05); });
    const kg = cd.exo >= 2 && !o.slow && ext * 1 > 3 && !cd.a.slow ? 1 : 0; let hazard = null;
    if(cd.exo >= 3 && !cd.a.slow && ext > 2){ hazard = 'runaway'; notes.push('Runaway exotherm: add the reagent dropwise (slow addition) and cool for batches above 2 mol.'); }
    const keep = hazard ? .5 : 1;
    cd.Pr.forEach(p => { const r = cd.rec[p.key] === undefined ? 0 : cd.rec[p.key]; const trivial = TRIVIAL.has(p.key) || (p.comp && !p.comp.C && p.role === 'co'); const coOK = p.role !== 'co' || (!trivial && p.comp && p.comp.C); if(!coOK) return;
      const mol = p.n * ext * madeEta * r * keep, mk = p.iso ? p.iso.key : p.key; if(mol >= 1 - 1e-9) made[mk] = (made[mk] || 0) + Math.floor(mol + 1e-9); else if(mol > 0) notes.push('Only ' + mol.toFixed(2) + ' mol of ' + ((p.iso && p.iso.name) || p.name || p.f) + ' would be recovered — load more reagent or improve the yield.'); });
    // solvent and unreacted-material recovery
    const kind = cd.a.workup, ret = kind === 'distill' || kind === 'column' || kind === 'evap' ? .7 : kind === 'extract' ? .4 : 0;
    cd.R.forEach(r => { if(r.spent) return; const left = r.n * ext * (1 - Math.max(conv, .05)) * ret; if(left >= 1) back[r.key] = Math.floor(left); });
    const solvBack = cd.solvent && (kind === 'distill' || kind === 'evap') ? .6 : 0;
    return { ok: true, ext, limiting: lim, used, made, back, hazard, notes, solvBack, y: madeEta, conv, tLabel: fmtMin(cd.t95) };
  }
  const solventNeed = (cd, amounts) => { if(!cd.solvent || cd.solvent === 'H2O') return 0; let tot = 0; cd.R.forEach(r => { tot += Math.max(0, +amounts[r.key] || 0); }); return Math.max(1, Math.ceil(tot * .25)); };

  /* ---------------------------------------------------------------- route search over shared cards: how to make `target` (key) from things you can buy */
  function route(target, cards, have, depth){
    const byProd = {}; cards.forEach(cd => { if(!cd || !cd.ok) return; cd.Pr.forEach(p => { if(p.role === 'main' || p.role === undefined) (byProd[p.key] = byProd[p.key] || []).push(cd); }); });
    const haveSet = new Set(have), seen = new Set(); depth = depth || 6;
    function go(k, d){
      if(haveSet.has(k)) return []; if(d <= 0 || seen.has(k)) return null; seen.add(k); const opts = (byProd[k] || []).slice().sort((x, y) => y.eta - x.eta);
      for(const cd of opts){ const steps = []; let okk = true; for(const r of cd.R){ if(r.spent && haveSet.has(r.key)) continue; const sub = go(r.key, d - 1); if(sub === null){ okk = false; break; } sub.forEach(s => steps.push(s)); } if(okk){ seen.delete(k); steps.push(cd); return steps; } }
      seen.delete(k); return null;
    }
    return go(target, depth);
  }

  function graphOf(key){ const sp = species(key); if(!sp || !sp.mol) return null; const m = sp.mol, bonds = S.kekule(m); return { a: m.a.map(x => x.e), b: bonds.map(b => [b[0], b[1], b[2] === 1.5 ? 1 : b[2]]), q: m.a.map(x => x.ch) }; }
  const api = { graphOf, VER, species, keyOfMol, nameOfKey, labelOf, catalog, byKey, byCanon, props, phaseAt, estimate, G, S, makeCtx, addTemplate, templates: () => TPL.slice(), assess, card, run, solventNeed, cacheKey, fnv, shardOf, validate, restricted, route, normArgs, inorgKey, fmtMin, pretty, classOfMol, acidifyMol, heq, oeq, EQ, SOLV, debug: false };
  return api;
})();
if(typeof module !== 'undefined' && module.exports) module.exports = Synth;
