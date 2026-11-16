/* Synth reaction templates — each one edits real molecular graphs (SynthCore) and states the conditions under which it works.
 * A template is fn(ctx) -> null (does not apply) | {refuse} | plan. plan = { use:[{i,n}], free:[{k,n}], prods:[{m|k, n, role}], cond:{…}, red?, ox?, note, sel, minor }.
 * Hydrogen / oxygen balance of oxidations and reductions is worked out by the engine ([H₂] and [O] equivalents from the reductant / oxidant reagent).
 * cond: y ceiling · T [min,max,opt lo,opt hi] K · Ea kJ/mol · tau min (at the middle of the optimum) · solv letters (p a n e c x) · cat {material: factor} · catReq · cat0 (factor without) ·
 *       dry (needs Schlenk flask) · nowater · inert · het · Pmin · exo 0-3 · eq (equilibrium ceiling) · ds (Dean–Stark helps) · uv/uvT · quench (needs acid quench workup). */
(function(){
  'use strict';
  const S = SynthCore, G = Synth.G, org = s => s.mol && s.comp.C, add = Synth.addTemplate;
  const clone = S.clone;
  const ACIDCAT = { H2SO4: 1, HCl: .8, TsOH: 1, H3PO4: .7 };
  /* ---- helpers ---- */
  function cutOff(m, a, x){                                         // remove bond a–x; returns {main (a's side + any unrelated fragments), leave (x's side) | null if a ring, map: old index -> index in main}
    const q = clone(m); S.unbond(q, a, x); const comps = S.components(q), ca = comps.find(c => c.includes(a)), cx = comps.find(c => c.includes(x));
    if(ca === cx) return { main: q, leave: null, map: i => i };
    const sub = cs => { const idx = [].concat(...cs), set = new Set(idx), mp = {}; const at = idx.map((i, k) => { mp[i] = k; return Object.assign({}, q.a[i]); }); return { m: { a: at, b: q.b.filter(b => set.has(b[0])).map(b => [mp[b[0]], mp[b[1]], b[2]]) }, mp }; };
    const A = sub([ca].concat(comps.filter(c => c !== ca && c !== cx))), X = sub([cx]); S.norm(A.m); S.norm(X.m); return { main: A.m, leave: X.m, map: i => A.mp[i] };
  }
  function removeIdx(m, set){ const mp = {}; let k = 0; m.a.forEach((_, i) => { if(!set.has(i)) mp[i] = k++; }); return { m: S.removeAtoms(m, set), map: i => mp[i] }; }
  function join(a, ia, b, ib, order){ const o = a.a.length, m = S.merge(a, b); S.bond(m, ia, ib + o, order || 1); return m; }
  const saltKey = (cat, X) => Synth.inorgKey({ [cat]: 1, [X]: 1 });
  const cmp = (...ms) => ms.reduce((t, m) => S.addComp(t, S.comp(m)), {});
  const halide = (m, adj) => G.alkylhalides(m, adj), isHalogen = e => ['Cl', 'Br', 'I'].includes(e);
  const mol = k => Synth.species(k).mol;
  const baseOf = s => { const id = s.key; return { NaOH: { M: 'Na', t: 'OH' }, KOH: { M: 'K', t: 'OH' }, Na2CO3: { M: 'Na', t: 'CO3' }, K2CO3: { M: 'K', t: 'CO3' }, NaHCO3: { M: 'Na', t: 'HCO3' } }[id] || null; };
  const coOrg = n => ({ role: 'co', n });
  const P = (m, n, role, extra) => Object.assign({ m, n: n || 1, role: role || 'main' }, extra || {});
  const K = (k, n, role) => ({ k, n: n || 1, role: role || 'co' });
  const WATER = n => K('H2O', n);

  /* ================================================================ 1. acyl substitution family */
  const ELEC = [['acylhalide', 6, G.acylhalides], ['anhydride', 5, G.anhydrides], ['ester', 2, G.esters], ['acid', 1, G.acids]];
  const NUC = [['amine', 5, (m, a) => G.ammonia(m, a).concat(G.amines(m, a).filter(x => x.h && !x.aryl))], ['aniline', 4, (m, a) => G.amines(m, a).filter(x => x.h && x.aryl)], ['alcohol', 3, G.alcohols], ['phenol', 2, G.phenols], ['water', 1, G.water]];
  const nucAtom = x => x.o !== undefined ? x.o : x.n;
  const leaveOf = (kind, x) => kind === 'acylhalide' ? x.x : kind === 'anhydride' ? x.o : kind === 'ester' ? x.o : x.oh, carbC = (kind, x) => kind === 'anhydride' ? x.c1 : x.c;
  const ACYL_COND = {
    'acid|alcohol': { y: .92, eq: .67, ds: 1, T: [320, 470, 340, 420], tau: 90, Ea: 60, cat: ACIDCAT, catReq: 1, cat0: .04, solv: 'xpanec' },
    'acid|amine': { y: .85, eq: .75, ds: 1, T: [400, 560, 440, 520], tau: 240, Ea: 80, cat0: 1, catOK: 1, solv: 'xanec' },
    'acid|aniline': { y: .8, eq: .7, ds: 1, T: [400, 560, 440, 520], tau: 300, Ea: 80, cat0: 1, catOK: 1, solv: 'xanec' },
    'acid|phenol': { y: .2, eq: .3, ds: 1, T: [350, 480, 380, 440], tau: 600, Ea: 70, cat: ACIDCAT, catReq: 1, cat0: .02, solv: 'xanec' },
    'ester|alcohol': { y: .9, eq: .8, T: [290, 440, 310, 360], tau: 60, Ea: 55, cat: { NaOH: 1, KOH: 1, NaOEt: 1, KOtBu: .9, H2SO4: .7, HCl: .5 }, catReq: 1, cat0: .02, solv: 'xpa' },
    'ester|amine': { y: .75, eq: .8, T: [340, 500, 390, 460], tau: 240, Ea: 70, cat0: 1, catOK: 1, solv: 'xpa' },
    'acylhalide|any': { y: .95, T: [250, 390, 270, 320], tau: 6, Ea: 35, cat: { py: 1.05, Et3N: 1.05, NaOH: .95, K2CO3: .95, Na2CO3: .9 }, cat0: .85, exo: 2, solv: 'xanec' },
    'anhydride|amine': { y: .93, T: [265, 420, 285, 350], tau: 10, Ea: 40, cat0: 1, catOK: 1, exo: 2, solv: 'xpanec' },
    'anhydride|aniline': { y: .9, T: [270, 420, 290, 360], tau: 20, Ea: 45, cat0: 1, catOK: 1, exo: 1, solv: 'xpanec' },
    'anhydride|alcohol': { y: .9, T: [290, 430, 330, 390], tau: 45, Ea: 55, cat: { H2SO4: 1, H3PO4: .85, py: .9 }, cat0: .3, solv: 'xanec' },
    'anhydride|phenol': { y: .9, T: [290, 440, 330, 360], tau: 45, Ea: 55, cat: { H2SO4: 1, H3PO4: .9, py: .9 }, cat0: .25, solv: 'xanec' },
    'anhydride|water': { y: .95, T: [270, 420, 290, 360], tau: 25, Ea: 50, cat0: 1, catOK: 1, solv: 'xpa' },
    'acylhalide|water': { y: .97, T: [250, 400, 270, 320], tau: 3, Ea: 30, cat0: 1, catOK: 1, exo: 2, solv: 'xpa' }
  };
  add({ id: 'acyl', name: 'Acyl substitution', fam: 'Condensation', fn: c => {
    let E = null;
    for(const [kind, rank, f] of ELEC){ for(const s of c.subs){ if(!s.mol) continue; const sites = f(s.mol); if(sites.length){ E = { kind, rank, s, sites }; break; } } if(E) break; }
    if(!E) return null;
    let N = null, bestRank = -1;
    for(const s of c.subs){ if(s === E.s) continue; if(!s.mol && s.key !== 'NH3') continue; const m = s.mol; for(const [kind, rank, f] of NUC){ const sites = f(m); if(sites.length){ if(rank > bestRank){ bestRank = rank; N = { kind, rank, s, sites }; } break; } } }
    if(!N) return null;
    if(E.kind === 'ester' && N.kind === 'water') return null; if(E.kind === 'acid' && N.kind === 'water') return null;
    if(E.sites.length > 1 && N.sites.length > 1 && E.kind !== 'anhydride') return { refuse: 'Both reagents have several reactive groups: that makes a polymer, which WestLab does not model.' };
    const ck = E.kind + '|' + N.kind, cd = ACYL_COND[ck] || ACYL_COND[E.kind + '|any']; if(!cd) return null;
    if(E.kind === 'acid' && N.kind === 'amine' && N.s.tags.has('amine-1') === false && c.subs.some(x => x.tags.has('base-strong'))) return null;
    // build: the single-site reagent is used once per site of the multi-site one
    const k = Math.max(E.sites.length, N.sites.length); let prod, leaving = [];
    const nm = N.s.mol, finder = ELEC.find(e => e[0] === E.kind)[2]; let work, useE, useN;
    if(N.sites.length >= E.sites.length){            // acylate every site of the nucleophile molecule with copies of the electrophile
      work = clone(N.s.mol); const eSite = E.sites[0]; const cu = cutOff(E.s.mol, carbC(E.kind, eSite), leaveOf(E.kind, eSite)); const frag = cu.main, aIdx = cu.map(carbC(E.kind, eSite));
      for(const ns of N.sites){ const t = nucAtom(ns); const off = work.a.length; work = S.merge(work, frag); S.bond(work, t, aIdx + off, 1); if(cu.leave) work = S.merge(work, cu.leave); }
      useE = { i: E.s.i, n: N.sites.length }; useN = { i: N.s.i, n: 1 };
    } else {                                           // several electrophile sites on one molecule: one nucleophile molecule per site
      const tn = nucAtom(N.sites[0]); work = clone(E.s.mol); work.a.forEach((a, i) => { a.tg = i; }); const done = new Set();
      for(let g = 0; g < E.sites.length; g++){ const ss = finder(work).filter(q => work.a[carbC(E.kind, q)].tg !== undefined && !done.has(work.a[carbC(E.kind, q)].tg)); if(!ss.length) break; const es = ss[0]; done.add(work.a[carbC(E.kind, es)].tg); const a0 = carbC(E.kind, es), x0 = leaveOf(E.kind, es); const cu = cutOff(work, a0, x0); work = cu.main; const aN = cu.map(a0); const off = work.a.length; work = S.merge(work, nm); S.bond(work, aN, tn + off, 1); if(cu.leave) work = S.merge(work, cu.leave); }
      useE = { i: E.s.i, n: 1 }; useN = { i: N.s.i, n: E.sites.length };
    }
    S.norm(work); const fr = {}; S.split(work).forEach(f => { const kk = S.canon(f); fr[kk] = fr[kk] || { m: f, n: 0, sz: f.a.length }; fr[kk].n++; });
    const kk0 = Object.keys(fr).sort((x, y) => fr[y].n * fr[y].sz - fr[x].n * fr[x].sz);
    const prods = kk0.map((kk, i) => P(fr[kk].m, fr[kk].n, i === 0 ? 'main' : 'co'));
    const use = [useE, useN];
    const sel = N.kind === 'aniline' && N.s.tags.has('phenol') ? 'N-acylation beats O-acylation (the amine is the better nucleophile)' : '';
    return { use, prods, cond: Object.assign({}, cd), note: E.kind === 'acid' && N.kind === 'alcohol' ? 'Fischer esterification: an equilibrium — a Dean–Stark trap or excess alcohol pushes it forward.' : '', sel };
  } });

  /* ================================================================ 2. hydrolysis (ester, amide, nitrile) and saponification */
  add({ id: 'hydrolysis', name: 'Hydrolysis', fam: 'Cleavage', fn: c => {
    const sub = c.subs.find(s => s.mol && (G.esters(s.mol).length || G.amides(s.mol).length)); if(!sub) return null;
    const water = c.subs.find(s => s.key === 'H2O'), naoh = c.subs.find(s => s.key === 'NaOH' || s.key === 'KOH'); if(!water && !naoh) return null;
    const isEster = G.esters(sub.mol).length > 0; let work = clone(sub.mol), n = 0; const M = naoh ? (naoh.key === 'KOH' ? 'K' : 'Na') : null;
    for(let g = 0; g < 6; g++){ const f = isEster ? G.esters(work) : G.amides(work); if(!f.length) break; const e = f[0], x = isEster ? e.o : e.n; const cu = cutOff(work, e.c, x); work = cu.main; const ac = cu.map(e.c); const o2 = S.addAtom(work, 'O', M ? -1 : 0); S.bond(work, ac, o2, 1); if(M){ work.a[o2].fx = true; work.a[o2].h = 0; S.addFixed(work, M, 1, 0); } else S.norm(work); if(cu.leave) work = S.merge(work, cu.leave); n++; if(!cu.leave) break; }
    S.norm(work); const frags = S.split(work); const cnt = {}; frags.forEach(f => { const k = S.canon(f); cnt[k] = cnt[k] || { m: f, n: 0 }; cnt[k].n++; });
    // salt pairs: keep each carboxylate + cation together
    const prods = []; const ions = frags.filter(f => f.a.length === 1 && f.a[0].ch > 0 && S.METAL(f.a[0].e)), rest = frags.filter(f => !ions.includes(f)); const acc = {};
    if(M){ const sal = rest.filter(f => f.a.some(a => a.ch === -1)), oth = rest.filter(f => !sal.includes(f)); const cs = {}; sal.forEach(f => { const m2 = S.merge(f, S.parse('[' + M + '+]')); const k = S.canon(m2); cs[k] = cs[k] || { m: m2, n: 0 }; cs[k].n++; }); Object.keys(cs).forEach(k => prods.push(Object.assign(P(cs[k].m, cs[k].n, 'main'), { salt: true }))); const co = {}; oth.forEach(f => { const k = S.canon(f); co[k] = co[k] || { m: f, n: 0 }; co[k].n++; }); Object.keys(co).forEach(k => prods.push(P(co[k].m, co[k].n, 'co'))); }
    else Object.keys(cnt).forEach((k, i) => prods.push(P(cnt[k].m, cnt[k].n, i === 0 ? 'main' : 'co')));
    if(!prods.length) return null; prods.sort((x, y) => (y.role === 'main') - (x.role === 'main'));
    if(M) return { use: [{ i: sub.i, n: 1 }, { i: naoh.i, n: n }], prods, cond: { y: .95, T: [300, 470, 340, 390], tau: isEster ? 40 : 180, Ea: 60, solv: 'pa', het: 1, cat0: 1, catOK: 1 }, note: 'Saponification: hydroxide cuts every ester; you get the carboxylate salt (soap if the acid is a fatty acid). Acidify to get the free acid.' };
    return { use: [{ i: sub.i, n: 1 }], free: [K('H2O', n)], prods, cond: { y: .9, eq: isEster ? .75 : .9, T: isEster ? [300, 470, 350, 400] : [350, 480, 380, 440], tau: isEster ? 120 : 400, Ea: 65, cat: ACIDCAT, catReq: 1, cat0: .03, solv: 'xpa' }, note: 'Acid-catalysed hydrolysis (the reverse of Fischer esterification).' };
  } });
  add({ id: 'nitrile-hydrolysis', name: 'Nitrile hydrolysis', fam: 'Cleavage', fn: c => {
    const sub = c.subs.find(s => s.mol && G.nitriles(s.mol).length && s.comp.C >= 2); const acid = c.subs.find(s => s.key === 'HCl' || s.key === 'H2SO4'); if(!sub || !acid) return null;
    const nt = G.nitriles(sub.mol)[0], m = clone(sub.mol); S.unbond(m, nt.c, nt.n); const rn = removeIdx(m, new Set([nt.n])); const m2 = rn.m, ci = rn.map(nt.c); const o1 = S.addAtom(m2, 'O', 0), o2 = S.addAtom(m2, 'O', 0); S.bond(m2, ci, o1, 2); S.bond(m2, ci, o2, 1); S.norm(m2);
    const nh = acid.key === 'HCl' ? 'NH4Cl' : 'NH4HSO4';
    return { use: [{ i: sub.i, n: 1 }, { i: acid.i, n: 1 }], free: [K('H2O', 2)], prods: [P(m2), K(nh, 1)], cond: { y: .9, T: [340, 480, 370, 420], tau: 150, Ea: 70, solv: 'pxa', cat0: 1, catOK: 1 }, note: 'R–C≡N + 2 H₂O + HCl → R–COOH + NH₄Cl.' };
  } });

  /* ================================================================ 3. acid–base salts of organic acids */
  add({ id: 'neutralise', name: 'Neutralisation (salt formation)', fam: 'Acid–base', fn: c => {
    const base = c.subs.find(s => baseOf(s)), org1 = c.subs.find(s => s.mol && (G.acids(s.mol).length || G.phenols(s.mol).length)); if(!base || !org1 || c.subs.length !== 2) return null;
    const b = baseOf(base), acs = G.acids(org1.mol); if(!acs.length && b.t !== 'OH') return null; if(c.subs.some(s => s.tags.has('anhydride') || s.tags.has('acylcl'))) return null;
    const m = clone(org1.mol), targets = acs.length ? acs.map(x => x.oh) : G.phenols(m).map(x => x.o); targets.forEach(o => { m.a[o].ch = -1; m.a[o].fx = true; m.a[o].h = 0; }); const mm = m; targets.forEach(() => S.addFixed(mm, b.M, 1, 0)); S.norm(mm);
    const nt = targets.length; const prods = [Object.assign(P(mm, 1), { salt: true })], free = [];
    if(b.t === 'OH') prods.push(WATER(nt)); else if(b.t === 'HCO3'){ prods.push(WATER(nt)); prods.push(K('CO2', nt)); } else { prods.push(WATER(nt / 2)); prods.push(K('CO2', nt / 2)); }
    const nb = b.t === 'CO3' ? nt / 2 : nt; return { use: [{ i: org1.i, n: 1 }, { i: base.i, n: nb }], prods, cond: { y: .98, T: [275, 380, 285, 330], tau: 3, Ea: 20, solv: 'pxa', cat0: 1, catOK: 1 }, note: 'Acid + base → salt + water.' };
  } });
  add({ id: 'acidify', name: 'Acidification of a salt', fam: 'Acid–base', fn: c => {
    const sub = c.subs.find(s => s.mol && s.comp.C && s.mol.a.some(a => a.ch === -1 && a.e === 'O') && s.mol.a.some(a => a.ch === 1 && S.METAL(a.e))), acid = c.subs.find(s => s.key === 'HCl'); if(!sub || !acid || c.subs.length !== 2) return null;
    const q = Synth.acidifyMol(sub.mol); if(!q) return null; const nO = sub.mol.a.filter(a => a.ch === -1 && a.e === 'O').length; const M = sub.mol.a.find(a => a.ch === 1 && S.METAL(a.e)).e;
    return { use: [{ i: sub.i, n: 1 }, { i: acid.i, n: nO }], prods: [P(q, 1), K(saltKey(M, 'Cl'), nO)], cond: { y: .97, T: [275, 380, 285, 330], tau: 3, Ea: 20, solv: 'pxa', cat0: 1, catOK: 1 }, note: 'Strong acid protonates the carboxylate / phenoxide; the free acid usually precipitates.' };
  } });

  /* ================================================================ 4. oxidation */
  add({ id: 'oxidation', name: 'Oxidation', fam: 'Redox', fn: c => {
    const ox = c.subs.find(s => Synth.oeq(s) && s.key !== 'O2' && s.key !== 'H2O2' || (s.key === 'H2O2' && Synth.oeq(s))); if(!ox) return null;
    const sub = c.subs.find(s => s.mol && s !== ox && (G.alcohols(s.mol).length || G.aldehydes(s.mol).length || (G.arCH(s.mol).length && s.mol.a.some((a, i) => a.e === 'C' && !a.ar && a.h === 3 && S.adjOf(s.mol)[i].some(q => s.mol.a[q[0]].ar))) || (G.alkenes(s.mol).length && ox.id === 'KMnO4')));
    if(!sub) return null; const m = clone(sub.mol), strong = ox.tags.has('ox-strong'), mild = ox.tags.has('ox-mild'), allylic = ox.tags.has('ox-allylic'); let kind = '', note = '';
    const als = G.alcohols(m), alds = G.aldehydes(m), alk = G.alkenes(m);
    const acidic = c.cat && ['H2SO4', 'HCl', 'AcOH'].includes(c.cat.id) || (c.solv && c.solv.cls === 'ac');
    if(alk.length && ox.id === 'KMnO4' && !als.length && !alds.length){
      const a = alk[0]; S.bond(m, a.a, a.b, 1); const o1 = S.addAtom(m, 'O', 0), o2 = S.addAtom(m, 'O', 0); S.bond(m, a.a, o1, 1); S.bond(m, a.b, o2, 1); S.norm(m);
      return { use: [{ i: sub.i, n: 1 }], free: [K('H2O', 1)], ox: ox.i, prods: [P(m)], cond: { y: .7, T: [265, 300, 272, 285], tau: 15, Ea: 40, solv: 'pxa', het: 1, cat0: 1, catOK: 1, exo: 1 }, note: 'Cold, dilute, basic KMnO₄ adds two OH groups across a C=C (a diol). Hot or acidic permanganate would cleave it.', sel: 'syn-dihydroxylation' };
    }
    if(als.length){
      const a = als[0]; if(a.deg === 3 || (m.a[a.c].h === 0)) return { refuse: 'Tertiary alcohols resist oxidation (no H on the carbinol carbon).' };
      if(allylic && !(a.benzylic || S.adjOf(m)[a.c].some(q => q[1] === 1 && m.a[q[0]].e === 'C' && S.adjOf(m)[q[0]].some(r => r[1] === 2)))) return null;
      const primary = m.a[a.c].h >= 2 || (m.a[a.c].h === 1 && false);
      if(primary){ if(mild || allylic){ S.bond(m, a.o, a.c, 2); kind = 'aldehyde'; } else { S.bond(m, a.o, a.c, 2); const o2 = S.addAtom(m, 'O', 0); S.bond(m, a.c, o2, 1); kind = 'acid'; } }
      else { S.bond(m, a.o, a.c, 2); kind = 'ketone'; }
      S.norm(m);
      const cond = kind === 'aldehyde' ? { y: .75, T: [270, 340, 285, 310], tau: 30, Ea: 45, solv: 'cnaxp', cat0: 1, catOK: 1, exo: 1 } : { y: .85, T: [285, 420, 330, 380], tau: kind === 'acid' ? 90 : 45, Ea: 55, solv: 'pxaac', cat0: 1, catOK: 1, exo: 2, het: strong ? 1 : 0 };
      if(ox.id === 'PCC') cond.solv = 'cn'; if(ox.id === 'PCC') cond.nowater = 1; if(ox.id === 'K2Cr2O7'){ cond.cat = { H2SO4: 1, HCl: .6 }; cond.catReq = 1; cond.cat0 = .1; }
      if(ox.id === 'NaOCl'){ cond.T = [265, 320, 275, 300]; }
      if(kind === 'aldehyde' && strong) { /* strong oxidant over-oxidises unless distilled out; handled by returning acid */ }
      return { use: [{ i: sub.i, n: 1 }], ox: ox.i, prods: [P(m), WATER(1)], cond, note: kind === 'aldehyde' ? 'A mild oxidant stops at the aldehyde.' : kind === 'acid' ? 'A strong oxidant carries a primary alcohol all the way to the carboxylic acid.' : 'Secondary alcohols oxidise to ketones.' };
    }
    if(alds.length){ const a = alds[0]; const o2 = S.addAtom(m, 'O', 0); S.bond(m, a.c, o2, 1); S.norm(m); return { use: [{ i: sub.i, n: 1 }], ox: ox.i, prods: [P(m)], cond: { y: .85, T: [275, 400, 290, 340], tau: 30, Ea: 45, solv: 'pxa', cat0: 1, catOK: 1, exo: 1 }, note: 'Aldehydes oxidise easily to carboxylic acids.' }; }
    // side-chain oxidation: ArCH3 -> ArCOOH
    if(strong){ const adj = S.adjOf(m); const me = m.a.findIndex((a, i) => a.e === 'C' && !a.ar && a.h === 3 && adj[i].length === 1 && m.a[adj[i][0][0]].ar); if(me >= 0){ S.bond(m, me, S.addAtom(m, 'O', 0), 2); S.bond(m, me, S.addAtom(m, 'O', 0), 1); S.norm(m); return { use: [{ i: sub.i, n: 1 }], ox: ox.i, prods: [P(m), WATER(1)], cond: { y: .8, T: [340, 470, 370, 420], tau: 240, Ea: 70, solv: 'pxa', het: 1, cat0: 1, catOK: 1, exo: 1 }, note: 'Hot permanganate oxidises a benzylic methyl group to COOH.' }; } }
    return null;
  } });

  /* ================================================================ 5. reduction */
  const RED = {
    NaBH4: { grp: ['carbonyl'], cond: { y: .95, T: [260, 330, 270, 300], tau: 10, Ea: 35, solv: 'p', cat0: 1, catOK: 1, exo: 1 }, why: 'NaBH₄ reduces only aldehydes and ketones, in an alcohol or water.' },
    LiAlH4: { grp: ['carbonyl', 'ester', 'acid', 'amide', 'nitrile', 'acylhalide', 'imine'], cond: { y: .9, T: [190, 350, 250, 310], tau: 20, Ea: 40, solv: 'e', dry: 1, quench: 1, cat0: 1, catOK: 1, exo: 3 }, why: '' },
    H2: { grp: ['alkene', 'alkyne', 'nitro', 'carbonyl', 'nitrile', 'imine'], hyd: true },
    H: null,
    Fe: { grp: ['nitro'], cond: { y: .85, T: [320, 420, 350, 390], tau: 90, Ea: 55, solv: 'pxa', cat: { HCl: 1 }, catReq: 1, cat0: .05, het: 1, exo: 1 } },
    Zn: { grp: ['nitro'], cond: { y: .8, T: [300, 420, 330, 380], tau: 90, Ea: 55, solv: 'pxa', cat: { HCl: 1 }, catReq: 1, cat0: .05, het: 1, exo: 1 } },
    Sn: { grp: ['nitro'], cond: { y: .9, T: [310, 420, 340, 380], tau: 80, Ea: 55, solv: 'pxa', cat: { HCl: 1 }, catReq: 1, cat0: .05, het: 1, exo: 1 } }
  };
  const HCAT = { alkene: { Pd: 1, Pt: 1, Ni: .85, Rh: 1, Ru: .9 }, alkyne: { Pd: 1, Pt: 1, Ni: .8, Rh: 1 }, nitro: { Pd: 1, Pt: 1, Ni: .85, Rh: .9 }, carbonyl: { Pt: 1, Ni: .8, Ru: 1, Rh: .9 }, nitrile: { Ni: 1, Pt: .7, Rh: .9, Ru: .8 }, imine: { Pd: 1, Pt: 1, Ni: .9 } };
  add({ id: 'reduction', name: 'Reduction', fam: 'Redox', fn: c => {
    RED.H = RED.H2; const red = c.subs.find(s => RED[s.id] || RED[s.key]); if(!red) return null; const R = RED[red.id] || RED[red.key]; const isH2 = red.id === 'H2' || red.id === 'H' || red.key === 'H';
    const sub = c.subs.find(s => s.mol && s !== red && s.comp.C && s.id !== 'H2' && !s.tags.has('solv:e') || (s.mol && s !== red && s.comp.C)); if(!sub) return null;
    let m = clone(sub.mol), adj = S.adjOf(m), did = []; const co = [];
    const want = R.grp, pick = (g, f) => want.includes(g) ? f(m, adj) : [];
    const nit = pick('nitro', G.nitros), ni = pick('nitrile', G.nitriles), imn = pick('imine', G.imines);
    let H2cat = null;
    if(isH2){ H2cat = c.cat && c.cat.el ? c.cat.id : null; }
    const only = isH2 && H2cat === 'Pd' ? ['alkene', 'alkyne', 'nitro', 'imine'] : null;
    const use = g => want.includes(g) && (!only || only.includes(g));
    // order: remove the groups this reagent reduces
    const waterN = { n: 0 };
    if(use('nitro')) G.nitros(m, adj).slice().reverse().forEach(nt => { nt.o.forEach(o => S.unbond(m, nt.n, o)); m.a[nt.n].ch = 0; m.a[nt.n].fx = false; nt.o.forEach(o => { m.a[o].e = 'X'; }); did.push('nitro'); waterN.n += 2; });
    m.a.forEach((a, i) => { if(a.e === 'X'){ } });
    const dropX = new Set(); m.a.forEach((a, i) => { if(a.e === 'X') dropX.add(i); }); if(dropX.size){ const rr = removeIdx(m, dropX); m = rr.m; }
    adj = S.adjOf(m);
    if(use('alkyne')) G.alkynes(m).forEach(x => { S.bond(m, x.a, x.b, 1); did.push('alkyne'); });
    if(use('alkene')) G.alkenes(m, S.adjOf(m)).forEach(x => { S.bond(m, x.a, x.b, 1); did.push('alkene'); });
    if(use('imine')) G.imines(m).forEach(x => { S.bond(m, x.c, x.n, 1); did.push('imine'); });
    adj = S.adjOf(m);
    if(use('nitrile')) G.nitriles(m, adj).forEach(x => { S.bond(m, x.c, x.n, 1); did.push('nitrile'); });
    if(use('carbonyl')) G.carbonyls(m, adj).forEach(x => { S.bond(m, x.c, x.o, 1); did.push('carbonyl'); });
    // LiAlH4 extras: acid, ester, amide, acyl halide
    if(want.includes('acylhalide')){ const l = G.acylhalides(m); if(l.length){ const x = l[0]; const rr = removeIdx(m, new Set([x.x])); m = rr.m; const cc = rr.map(x.c), oo = rr.map(x.d); S.bond(m, cc, oo, 1); S.norm(m); did.push('acylhalide'); co.push(K('HCl', 1)); } }
    if(want.includes('acid')){ let l = G.acids(m); while(l.length){ const x = l[0]; const rr = removeIdx(m, new Set([x.oh])); m = rr.m; S.bond(m, rr.map(x.c), rr.map(x.d), 1); S.norm(m); did.push('acid'); co.push(K('H2O', 1)); l = G.acids(m); } }
    if(want.includes('ester')){ let l = G.esters(m), g = 0; while(l.length && g++ < 6){ const x = l[0]; const cu = cutOff(m, x.c, x.o); m = cu.main; S.bond(m, cu.map(x.c), cu.map(x.d), 1); S.norm(m); if(cu.leave){ m = S.merge(m, cu.leave); } did.push('ester'); l = G.esters(m); } }
    if(want.includes('amide')){ let l = G.amides(m), g = 0; while(l.length && g++ < 4){ const x = l[0]; const rr = removeIdx(m, new Set([x.d])); m = rr.m; S.norm(m); did.push('amide'); co.push(K('H2O', 1)); l = G.amides(m); } }
    if(waterN.n) co.push(K('H2O', waterN.n));
    S.norm(m); if(!did.length){ if(red.id === 'NaBH4') return { refuse: R.why + ' It leaves esters, acids, amides, nitriles and nitro groups alone.' }; return null; }
    const frags = S.split(m), prods = []; const cnt = {}; frags.forEach(f => { const k = S.canon(f); cnt[k] = cnt[k] || { m: f, n: 0 }; cnt[k].n++; }); Object.keys(cnt).forEach((k, i) => prods.push(P(cnt[k].m, cnt[k].n, i === 0 ? 'main' : 'co')));
    // collapse repeated coproduct water
    const wc = {}; co.forEach(x => { wc[x.k] = (wc[x.k] || 0) + x.n; }); Object.keys(wc).forEach(k => prods.push(K(k, wc[k])));
    let cond;
    if(R.hyd){ const g = did[0], cm = HCAT[g] || HCAT.alkene; cond = { y: .95, T: [273, 450, 290, 340], tau: 40, Ea: 45, solv: 'pae', cat: cm, catReq: 1, cat0: .01, het: 1, exo: 1, Pmin: 0, hiP: 1 };
      if(c.V && !c.V.parr && !c.V.sealed && c.P <= 1.2){ cond.eqPen = 1; }
      if(!(c.V && (c.V.sealed))) { cond.y *= .5; cond.need = 'H₂ under pressure: use the hydrogenator (≈3 bar) for full speed.'; } }
    else cond = Object.assign({}, R.cond);
    if(red.id === 'LiAlH4' && did.includes('nitrile')) cond.T = [250, 360, 290, 340];
    return { use: [{ i: sub.i, n: 1 }], red: red.i, prods, cond, note: R.hyd ? 'Catalytic hydrogenation: H₂ adds across the bond on the metal surface.' : red.id === 'NaBH4' ? 'Mild hydride: aldehydes and ketones only.' : red.id === 'LiAlH4' ? 'Powerful hydride: reduces nearly every carbonyl group. Reacts violently with water.' : 'A metal in acid reduces the nitro group to an amine.', sel: did.filter((x, i) => did.indexOf(x) === i).join(' + ') + ' reduced' };
  } });

  /* ================================================================ 6. additions to C=C */
  add({ id: 'halogen-add', name: 'Halogen addition to an alkene', fam: 'Addition', fn: c => {
    const x2 = c.subs.find(s => s.id === 'Br2' || s.id === 'Cl2' || s.key === 'Br2' || s.key === 'Cl2' || s.key === 'Br' || s.key === 'Cl'), sub = c.subs.find(s => s.mol && s !== x2 && G.alkenes(s.mol).length); if(!x2 || !sub) return null; if(c.subs.length > 2) return null;
    const X = (x2.key[0] === 'B') ? 'Br' : 'Cl', m = clone(sub.mol), a = G.alkenes(m)[0]; S.bond(m, a.a, a.b, 1); const x1 = S.addAtom(m, X, 0), x3 = S.addAtom(m, X, 0); S.bond(m, a.a, x1, 1); S.bond(m, a.b, x3, 1); S.norm(m);
    return { use: [{ i: sub.i, n: 1 }, { i: x2.i, n: 1 }], prods: [P(m)], cond: { y: .93, T: [230, 340, 265, 305], tau: 4, Ea: 25, solv: 'cxn', cat0: 1, catOK: 1, exo: 2, sf: { p: .5 } }, note: 'Halogen adds across the double bond (anti addition). Brominated product forms as the red-brown colour fades.' };
  } });
  add({ id: 'hx-add', name: 'Hydrogen halide addition (Markovnikov)', fam: 'Addition', fn: c => {
    const hx = c.subs.find(s => s.key === 'HCl' || s.key === 'HBr'), sub = c.subs.find(s => s.mol && s !== hx && G.alkenes(s.mol).length && !G.carbonyls(s.mol).length); if(!hx || !sub) return null; if(c.subs.some(s => s !== hx && s !== sub && s.mol && s.comp.C)) return null;
    const X = hx.key === 'HBr' ? 'Br' : 'Cl', m = clone(sub.mol), a = G.alkenes(m)[0]; S.bond(m, a.a, a.b, 1); const hA = m.a[a.a].h, hB = m.a[a.b].h; const onto = hA >= hB ? a.b : a.a; const xi = S.addAtom(m, X, 0); S.bond(m, onto, xi, 1); S.norm(m);
    return { use: [{ i: sub.i, n: 1 }, { i: hx.i, n: 1 }], prods: [P(m)], cond: { y: .9, T: [230, 360, 270, 320], tau: 15, Ea: 35, solv: 'xcnpa', cat0: 1, catOK: 1, exo: 1 }, note: 'H goes to the carbon that already has more H; the halogen to the more substituted carbon (Markovnikov).', sel: 'Markovnikov' };
  } });
  add({ id: 'hydration', name: 'Acid-catalysed hydration of an alkene', fam: 'Addition', fn: c => {
    const w = c.subs.find(s => s.key === 'H2O'), sub = c.subs.find(s => s.mol && s !== w && G.alkenes(s.mol).length && s.comp.C <= 8 && !G.carbonyls(s.mol).length); if(!w || !sub) return null; if(c.subs.length > 2) return null;
    const m = clone(sub.mol), a = G.alkenes(m)[0]; S.bond(m, a.a, a.b, 1); const onto = m.a[a.a].h >= m.a[a.b].h ? a.b : a.a; const o = S.addAtom(m, 'O', 0); S.bond(m, onto, o, 1); S.norm(m);
    const eth = sub.comp.C === 2 && Object.keys(sub.comp).length === 2;
    return { use: [{ i: sub.i, n: 1 }, { i: w.i, n: 1 }], prods: [P(m)], cond: eth ? { y: .1, T: [500, 650, 560, 600], tau: 30, Ea: 90, Pmin: 60, cat: { H3PO4: 1 }, catReq: 1, cat0: .01, solv: 'x', hiP: 1, eq: .8 } : { y: .85, T: [300, 420, 330, 370], tau: 120, Ea: 60, cat: { H2SO4: 1, H3PO4: .8 }, catReq: 1, cat0: .02, solv: 'pxa', eq: .8 }, note: eth ? 'Industrial ethanol: ethene + steam over phosphoric acid at ~570 K and ~70 bar. Only ≈5 % per pass.' : 'Water adds across the double bond (Markovnikov), acid catalysed.', sel: 'Markovnikov' };
  } });

  /* ================================================================ 7. radical halogenation of alkanes / benzylic */
  add({ id: 'radical-halogenation', name: 'Free-radical halogenation', fam: 'Radical', fn: c => {
    const x2 = c.subs.find(s => s.key === 'Br2' || s.key === 'Cl2' || s.key === 'Br' || s.key === 'Cl'), sub = c.subs.find(s => s.mol && s !== x2 && s.comp.C && (s.tags.has('alkane') || (s.mol.a.some(a => a.ar) && s.mol.a.some((a, i) => a.e === 'C' && !a.ar && a.h >= 1 && S.adjOf(s.mol)[i].some(q => s.mol.a[q[0]].ar))) || s.tags.has('arene') && s.comp.C > 6)); if(!x2 || !sub) return null; if(c.subs.length > 2) return null;
    const X = x2.key[0] === 'B' ? 'Br' : 'Cl', m = clone(sub.mol), adj = S.adjOf(m); const W = X === 'Br' ? { 3: 1600, 2: 80, 1: 1 } : { 3: 5, 2: 3.8, 1: 1 };
    const cands = []; m.a.forEach((a, i) => { if(a.e !== 'C' || a.ar || a.h < 1) return; if(adj[i].some(q => q[1] !== 1 || m.a[q[0]].e !== 'C' && m.a[q[0]].e !== 'H')) return; const deg = adj[i].length, benz = adj[i].some(q => m.a[q[0]].ar), cls = Math.min(3, deg + (benz ? 1 : 0)), w = (benz ? (X === 'Br' ? 1800 : 8) : W[Math.max(1, Math.min(3, deg))]) * a.h; cands.push({ i, w }); });
    if(!cands.length) return null; cands.sort((p, q) => q.w - p.w || p.i - q.i); const tgt = cands[0], tot = cands.reduce((s, x) => s + x.w, 0), share = tgt.w / tot; const xi = S.addAtom(m, X, 0); S.bond(m, tgt.i, xi, 1); S.norm(m);
    return { use: [{ i: sub.i, n: 1 }, { i: x2.i, n: 1 }], prods: [P(m), K(X === 'Br' ? 'HBr' : 'HCl', 1)], cond: { y: Math.min(.7, .25 + share * .6), T: [273, 560, 285, 340], tau: 40, Ea: 30, uv: 1, uvT: 520, solv: 'cnx', cat0: 1, catOK: 1, exo: 1 }, note: (X === 'Br' ? 'Bromine radicals are very selective (tertiary ≫ secondary ≫ primary).' : 'Chlorine radicals are unselective: expect a mixture, the best isomer is shown.') + ' Needs light (UV) or high temperature.', sel: 'radical ' + X + ' substitution', minor: ['isomers', 'polyhalogenated products'] };
  } });

  /* ================================================================ 8. alcohol -> halide, dehydration, ether */
  add({ id: 'alcohol-halide', name: 'Alcohol → alkyl halide', fam: 'Substitution', fn: c => {
    const sub = c.subs.find(s => s.mol && G.alcohols(s.mol).length && !G.carbonyls(s.mol).length && !G.acids(s.mol).length), rg = c.subs.find(s => s.key === 'HBr' || s.key === 'HCl' || s.key === 'SOCl2' || s.key === 'PBr3'); if(!sub || !rg) return null; if(c.subs.some(s => s !== sub && s !== rg && s.mol && s.comp.C && !s.tags.has('solv:p'))) return null;
    const m = clone(sub.mol), a = G.alcohols(m)[0]; const X = rg.key === 'HBr' || rg.key === 'PBr3' ? 'Br' : 'Cl'; const adj = S.adjOf(m); S.unbond(m, a.o, a.c); const rr = removeIdx(m, new Set([a.o])); const mm = rr.m, ci = rr.map(a.c); const xi = S.addAtom(mm, X, 0); S.bond(mm, ci, xi, 1); S.norm(mm);
    let use, prods = [P(mm)], cond;
    if(rg.key === 'SOCl2'){ use = [{ i: sub.i, n: 1 }, { i: rg.i, n: 1 }]; prods.push(K('SO2', 1), K('HCl', 1)); cond = { y: .88, T: [260, 400, 290, 350], tau: 20, Ea: 40, solv: 'cnxa', cat0: 1, catOK: 1, nowater: 1, exo: 2 }; }
    else if(rg.key === 'PBr3'){ use = [{ i: sub.i, n: 3 }, { i: rg.i, n: 1 }]; prods = [P(mm, 3), K('H3PO3', 1)]; cond = { y: .85, T: [250, 380, 270, 330], tau: 30, Ea: 40, solv: 'cnxe', cat0: 1, catOK: 1, nowater: 1, exo: 2 }; }
    else { use = [{ i: sub.i, n: 1 }, { i: rg.i, n: 1 }]; prods.push(WATER(1)); const tert = a.deg === 3; cond = { y: .85, T: [270, 420, tert ? 280 : 330, tert ? 310 : 380], tau: tert ? 10 : 120, Ea: 50, cat: X === 'Cl' && !tert ? { ZnCl2: 1 } : { H2SO4: 1 }, catReq: X === 'Cl' && !tert, cat0: X === 'Cl' && !tert ? .02 : 1, catOK: 1, solv: 'pxa', eq: .9 }; }
    return { use, prods, cond, note: rg.key === 'SOCl2' ? 'SOCl₂ turns R–OH into R–Cl; the by-products SO₂ and HCl are gases.' : 'The hydroxyl group is replaced by a halogen.' };
  } });
  add({ id: 'dehydration', name: 'Alcohol dehydration', fam: 'Elimination', fn: c => {
    const sub = c.subs.find(s => s.mol && G.alcohols(s.mol).length && !G.carbonyls(s.mol).length); if(!sub) return null; if(c.subs.length > 1 && c.subs.some(s => s !== sub && s.mol && s.comp.C && !s.tags.has('solv:p'))) return null;
    const m = clone(sub.mol), a = G.alcohols(m)[0], adj = S.adjOf(m); const nb = adj[a.c].filter(q => m.a[q[0]].e === 'C' && !m.a[q[0]].ar && m.a[q[0]].h >= 1).map(q => q[0]); if(!nb.length) return null;
    nb.sort((x, y) => adj[y].length - adj[x].length || x - y); S.unbond(m, a.o, a.c); S.bond(m, a.c, nb[0], 2); const rr = removeIdx(m, new Set([a.o])); S.norm(rr.m);
    const tert = a.deg === 3, sec = a.deg === 2, Tn = tert ? 345 : sec ? 400 : 440;
    return { use: [{ i: sub.i, n: 1 }], prods: [P(rr.m), WATER(1)], cond: { y: .85, T: [Tn - 25, Tn + 90, Tn, Tn + 40], tau: 30, Ea: 80, cat: { H2SO4: 1, H3PO4: .8 }, catReq: 1, cat0: .01, solv: 'x', eq: .95 }, note: 'Acid-catalysed E1/E2 elimination (Zaitsev: the more substituted alkene wins). Tertiary alcohols dehydrate gently, primary ones need ≥ 440 K. The alkene distils out as it forms.', sel: 'Zaitsev' };
  } });
  add({ id: 'ether-dehydration', name: 'Symmetrical ether from a primary alcohol', fam: 'Condensation', fn: c => {
    const sub = c.subs.find(s => s.mol && G.alcohols(s.mol).length === 1 && G.alcohols(s.mol)[0].deg <= 1 && s.comp.C <= 6 && !G.carbonyls(s.mol).length); if(!sub || c.subs.length > 1) return null; if(G.alcohols(sub.mol)[0].benzylic) return null;
    const a = G.alcohols(sub.mol)[0], m = clone(sub.mol), r = clone(sub.mol); const o = m.a.length; const mm = S.merge(m, r); const o2 = a.o + o; S.unbond(mm, o2, a.c + o); const rr = removeIdx(mm, new Set([o2])); S.bond(rr.m, a.o, rr.map(a.c + o), 1); S.norm(rr.m);
    return { use: [{ i: sub.i, n: 2 }], prods: [P(rr.m), WATER(1)], cond: { y: .6, T: [380, 440, 400, 420], tau: 60, Ea: 70, cat: { H2SO4: 1, H3PO4: .6 }, catReq: 1, cat0: .01, solv: 'x', eq: .7 }, note: 'At ≈ 413 K, excess primary alcohol + H₂SO₄ gives the ether; hotter (≥ 440 K) it dehydrates to the alkene instead.' };
  } });
  add({ id: 'williamson', name: 'Williamson ether synthesis', fam: 'Substitution', fn: c => {
    const rx = c.subs.find(s => s.mol && G.alkylhalides(s.mol).length); if(!rx) return null; const alkox = c.subs.find(s => s !== rx && s.tags.has('alkoxide')); const base = c.subs.find(s => s !== rx && baseOf(s) && ['OH'].includes(baseOf(s).t)), alc = c.subs.find(s => s !== rx && s.mol && (G.alcohols(s.mol).length || G.phenols(s.mol).length) && !G.acids(s.mol).length);
    let nucMol, nucIdx, M, uses, cm; const h = G.alkylhalides(rx.mol)[0];
    if(alkox){ const parts = S.split(alkox.mol), an = parts.find(p => p.a.some(a => a.ch === -1)), ct = parts.find(p => p !== an); const oi = an.a.findIndex(a => a.ch === -1 && a.e === 'O'); nucMol = clone(an); nucIdx = oi; M = ct.a[0].e; uses = [{ i: rx.i, n: 1 }, { i: alkox.i, n: 1 }]; cm = true; }
    else if(alc && base){ const t = G.phenols(alc.mol)[0] || G.alcohols(alc.mol)[0]; if(!G.phenols(alc.mol).length && c.solv && c.solv.cls === 'p') { } nucMol = clone(alc.mol); nucIdx = t.o; M = baseOf(base).M; uses = [{ i: rx.i, n: 1 }, { i: alc.i, n: 1 }, { i: base.i, n: 1 }]; }
    else return null;
    if(h.deg === 3) return { refuse: 'Tertiary halides eliminate instead of forming an ether (E2).' };
    const cu = cutOff(rx.mol, h.c, h.x); const frag = cu.main, ai = cu.map(h.c); const off = nucMol.a.length; let prod = S.merge(nucMol, frag); S.bond(prod, nucIdx, ai + off, 1); if(prod.a[nucIdx].ch){ prod.a[nucIdx].ch = 0; prod.a[nucIdx].fx = false; } S.norm(prod);
    const X = rx.mol.a[h.x].e, prods = [P(prod), K(saltKey(M, X), 1)]; if(!alkox) prods.push(WATER(1));
    return { use: uses, prods, cond: { y: .85, T: [280, 420, 320, 370], tau: 90, Ea: 55, solv: alkox ? 'pae' : 'pa', cat0: 1, catOK: 1, nowater: alkox ? 1 : 0 }, note: 'SN2: the alkoxide / phenoxide attacks the alkyl halide. Works best for methyl and primary halides.' };
  } });

  /* ================================================================ 9. SN2 with salts (nitrile, iodide, acetate, ammonia), E2 */
  add({ id: 'sn2', name: 'Nucleophilic substitution (SN2)', fam: 'Substitution', fn: c => {
    const rx = c.subs.find(s => s.mol && G.alkylhalides(s.mol).length && !G.carbonyls(s.mol).length); if(!rx) return null; const h = G.alkylhalides(rx.mol)[0];
    const nu = c.subs.find(s => s !== rx && (s.tags.has('nuc-cn') || s.tags.has('nuc-i') || s.id === 'NaOAc' || s.key === 'NH3')); if(!nu) return null;
    if(c.subs.some(s => s !== rx && s !== nu && s.mol && s.comp.C && !s.tags.has('solv:p'))) return null;
    if(h.deg === 3) return { refuse: 'Tertiary halides do not do SN2 (they eliminate or ionise).' };
    const X = rx.mol.a[h.x].e; const cu = cutOff(rx.mol, h.c, h.x); const frag = cu.main, ai = cu.map(h.c);
    if(nu.key === 'NH3'){ const m = frag; const off = 0; const n = S.addAtom(m, 'N', 0); S.bond(m, ai, n, 1); S.norm(m); S.norm(m); return { use: [{ i: rx.i, n: 1 }, { i: nu.i, n: 2 }], prods: [P(m), K('NH4' + X, 1)], cond: { y: .55, T: [270, 420, 300, 380], tau: 120, Ea: 60, Pmin: 0, solv: 'pa', cat0: 1, catOK: 1, sf: {} }, note: 'Use a large excess of NH₃ or the amine is alkylated again (mixtures).', minor: ['secondary / tertiary amines'] }; }
    const parts = S.split(nu.mol), an = parts.find(p => p.a.some(a => a.ch < 0)), ct = parts.find(p => p !== an); const M = ct.a[0].e; const nucM = clone(an); const ni = nucM.a.findIndex(a => a.ch < 0 && (a.e === 'C' || a.e === 'I' || a.e === 'O'));
    let prod; if(nu.tags.has('nuc-i')){ prod = frag; const xi = S.addAtom(prod, 'I', 0); S.bond(prod, ai, xi, 1); S.norm(prod); }
    else { const off = frag.a.length; prod = S.merge(frag, nucM); S.bond(prod, ai, ni + off, 1); prod.a[ni + off].ch = 0; prod.a[ni + off].fx = false; S.norm(prod); }
    const cd = nu.tags.has('nuc-i') ? { y: .9, T: [270, 360, 290, 330], tau: 60, Ea: 50, solv: 'a', cat0: 1, catOK: 1 } : nu.tags.has('nuc-cn') ? { y: .85, T: [290, 420, 330, 380], tau: 120, Ea: 60, solv: 'ap', cat0: 1, catOK: 1 } : { y: .8, T: [290, 420, 330, 380], tau: 120, Ea: 60, solv: 'ap', cat0: 1, catOK: 1 };
    return { use: [{ i: rx.i, n: 1 }, { i: nu.i, n: 1 }], prods: [P(prod), K(saltKey(M, X), 1)], cond: cd, note: nu.tags.has('nuc-cn') ? 'Cyanide adds one carbon to the chain (R–X → R–C≡N); hydrolyse the nitrile for the acid. Toxic!' : 'SN2: the nucleophile displaces the halide; polar aprotic solvents make it fast.' };
  } });
  add({ id: 'e2', name: 'Dehydrohalogenation (E2)', fam: 'Elimination', fn: c => {
    const rx = c.subs.find(s => s.mol && G.alkylhalides(s.mol).length && !G.carbonyls(s.mol).length), b = c.subs.find(s => s !== rx && (s.tags.has('base-strong') && (baseOf(s) || s.id === 'KOtBu' || s.id === 'NaOEt'))); if(!rx || !b) return null;
    const m = clone(rx.mol), h = G.alkylhalides(m)[0], adj = S.adjOf(m); const nb = adj[h.c].filter(q => m.a[q[0]].e === 'C' && !m.a[q[0]].ar && m.a[q[0]].h >= 1).map(q => q[0]); if(!nb.length) return null; nb.sort((x, y) => adj[y].length - adj[x].length || x - y);
    const X = m.a[h.x].e; S.unbond(m, h.c, h.x); S.bond(m, h.c, nb[0], 2); const rr = removeIdx(m, new Set([h.x])); S.norm(rr.m);
    let M, prods = [P(rr.m)], cm = b.mol && S.split(b.mol).find(p => p.a[0] && p.a[0].ch > 0); M = cm ? cm.a[0].e : 'K';
    if(baseOf(b)) prods.push(K(saltKey(baseOf(b).M, X), 1), WATER(1)); else { const an = S.split(b.mol).find(p => p.a.some(a => a.ch < 0)); const alc = clone(an); alc.a.forEach(a => { if(a.ch < 0){ a.ch = 0; a.fx = false; } }); S.norm(alc); prods.push(K(saltKey(M, X), 1), P(alc, 1, 'co')); }
    return { use: [{ i: rx.i, n: 1 }, { i: b.i, n: 1 }], prods, cond: { y: .8, T: [300, 450, 340, 390], tau: 60, Ea: 60, solv: 'pa', cat0: 1, catOK: 1 }, note: 'A strong, bulky base removes H–X: E2 elimination (Zaitsev alkene).' };
  } });

  /* ================================================================ 10. electrophilic aromatic substitution */
  function eas(c, kind){
    const sub = c.subs.find(s => s.mol && s.mol.a.some(a => a.ar) && G.arCH(s.mol).length && !s.tags.has('solv:n') || (s.mol && s.mol.a.some(a => a.ar) && G.arCH(s.mol).length)); return sub;
  }
  add({ id: 'eas-halogenation', name: 'Aromatic halogenation', fam: 'EAS', fn: c => {
    const x2 = c.subs.find(s => s.key === 'Br2' || s.key === 'Cl2' || s.key === 'Br' || s.key === 'Cl'), sub = c.subs.find(s => s.mol && s !== x2 && G.arCH(s.mol).length && !G.alkenes(s.mol).length); if(!x2 || !sub) return null; if(c.subs.length > 2) return null;
    const m = clone(sub.mol), adj = S.adjOf(m), rk = G.easRank(m, adj), act = G.ringActivation(m, adj); if(!rk.length) return null; if(act < -.7) return { refuse: 'The ring is too electron-poor to halogenate under these conditions.' };
    const X = x2.key[0] === 'B' ? 'Br' : 'Cl', t = rk[0].c, xi = S.addAtom(m, X, 0); S.bond(m, t, xi, 1); S.norm(m);
    const activated = act >= .9;
    return { use: [{ i: sub.i, n: 1 }, { i: x2.i, n: 1 }], prods: [P(m), K(X === 'Br' ? 'HBr' : 'HCl', 1)], cond: { y: activated ? .55 : .85, T: [260, 420, 280, 340], tau: 40, Ea: 50, solv: 'cxan', cat: { FeBr3: 1, FeCl3: 1, AlCl3: .9, Fe: .8 }, cat0: activated ? .7 : .02, catReq: !activated, nowater: 1, exo: 1 }, note: 'A Lewis acid (FeBr₃) polarises X₂ so the ring attacks it. Substituents steer the position (ortho/para or meta).', minor: activated ? ['over-halogenation'] : ['ortho isomer'] };
  } });
  add({ id: 'nitration', name: 'Aromatic nitration', fam: 'EAS', fn: c => {
    const hn = c.subs.find(s => s.key === 'HNO3'), sub = c.subs.find(s => s.mol && s !== hn && G.arCH(s.mol).length && !G.alkenes(s.mol).length); if(!hn || !sub) return null; if(c.subs.length > 2) return null;
    if(G.nitros(sub.mol).length) return { refuse: 'A second nitration would give polynitro compounds — explosives. The lab refuses.' };
    const m = clone(sub.mol), adj = S.adjOf(m), rk = G.easRank(m, adj); if(!rk.length) return null; const act = G.ringActivation(m, adj); if(act < -.7) return { refuse: 'The ring is too deactivated to nitrate cleanly.' };
    const t = rk[0].c, n = S.addFixed(m, 'N', 1, 0), o1 = S.addFixed(m, 'O', -1, 0), o2 = S.addAtom(m, 'O', 0); S.bond(m, t, n, 1); S.bond(m, n, o1, 1); S.bond(m, n, o2, 2); S.norm(m);
    return { use: [{ i: sub.i, n: 1 }, { i: hn.i, n: 1 }], prods: [P(m), WATER(1)], cond: { y: act >= .9 ? .5 : .85, T: [260, 345, 283, 318], tau: 25, Ea: 50, solv: 'xaac', cat: { H2SO4: 1 }, catReq: 1, cat0: act >= .9 ? .5 : .02, exo: 3, het: 1 }, note: 'Mononitration only (HNO₃ + H₂SO₄ ≤ 50 °C). Dinitration is blocked. Strongly exothermic — add dropwise and cool.', minor: ['ortho isomer'] };
  } });
  add({ id: 'sulfonation', name: 'Aromatic sulfonation', fam: 'EAS', fn: c => {
    const sa = c.subs.find(s => s.key === 'H2SO4'), sub = c.subs.find(s => s.mol && s !== sa && G.arCH(s.mol).length && !G.alkenes(s.mol).length && !s.tags.has('solv:p')); if(!sa || !sub) return null; if(c.subs.length > 2) return null;
    const m = clone(sub.mol), adj = S.adjOf(m), rk = G.easRank(m, adj); if(!rk.length) return null; const t = rk[0].c, sx = S.addAtom(m, 'S', 0); S.bond(m, t, sx, 1); const o1 = S.addAtom(m, 'O', 0), o2 = S.addAtom(m, 'O', 0), o3 = S.addAtom(m, 'O', 0); S.bond(m, sx, o1, 2); S.bond(m, sx, o2, 2); S.bond(m, sx, o3, 1); S.norm(m);
    return { use: [{ i: sub.i, n: 1 }, { i: sa.i, n: 1 }], prods: [P(m), WATER(1)], cond: { y: .8, T: [320, 520, 380, 470], tau: 120, Ea: 70, solv: 'x', cat0: 1, catOK: 1, eq: .85 }, note: 'Hot concentrated H₂SO₄ sulfonates the ring (reversible). Aniline heated at ~450 K gives sulfanilic acid (para).' };
  } });
  add({ id: 'friedel-crafts', name: 'Friedel–Crafts reaction', fam: 'EAS', fn: c => {
    const arene = c.subs.find(s => s.mol && G.arCH(s.mol).length && !G.alkenes(s.mol).length && !G.amines(s.mol).some(a => a.aryl)), el = c.subs.find(s => s !== arene && s.mol && (G.acylhalides(s.mol).length || G.anhydrides(s.mol).length || (G.alkylhalides(s.mol).length && !G.carbonyls(s.mol).length))); if(!arene || !el) return null; if(c.subs.length > 2) return null;
    const m = clone(arene.mol), adj = S.adjOf(m), rk = G.easRank(m, adj), act = G.ringActivation(m, adj); if(!rk.length) return null; if(act < -.5) return { refuse: 'Friedel–Crafts fails on deactivated rings (nitro, carbonyl, …).' };
    if(G.amines(arene.mol).length) return { refuse: 'Amines complex the Lewis acid; protect the nitrogen first.' };
    const t = rk[0].c; let acyl = false, prod, co;
    if(G.acylhalides(el.mol).length || G.anhydrides(el.mol).length){ acyl = true; const f = G.acylhalides(el.mol)[0] || G.anhydrides(el.mol)[0]; const a0 = f.c !== undefined ? f.c : f.c1, x0 = f.x !== undefined ? f.x : f.o; const cu = cutOff(el.mol, a0, x0); const off = m.a.length; prod = S.merge(m, cu.main); S.bond(prod, t, cu.map(a0) + off, 1); co = cu.leave; }
    else { const h = G.alkylhalides(el.mol)[0]; const cu = cutOff(el.mol, h.c, h.x); const off = m.a.length; prod = S.merge(m, cu.main); S.bond(prod, t, cu.map(h.c) + off, 1); co = cu.leave; if(h.deg === 1 && el.comp.C >= 3 && !h.benzylic) { /* carbocation rearrangement risk */ } }
    S.norm(prod); const prods = [P(prod)]; if(co){ const k = Synth.keyOfMol(co); prods.push(isHalogenOnly(co) ? K(k, 1) : P(co, 1, 'co')); }
    return { use: [{ i: arene.i, n: 1 }, { i: el.i, n: 1 }], prods, cond: { y: acyl ? .85 : .6, T: [250, 400, 270, 330], tau: 60, Ea: 50, solv: 'cnx', cat: { AlCl3: 1, FeCl3: .7, ZnCl2: .3 }, catReq: 1, cat0: .01, nowater: 1, exo: 2 }, note: acyl ? 'Acylation: the ketone product deactivates the ring, so it stops cleanly after one acylation.' : 'Alkylation: the product is more reactive than the start, and carbocations can rearrange — expect mixtures.', minor: acyl ? [] : ['polyalkylation', 'rearranged isomers'] };
    function isHalogenOnly(mo){ return mo.a.length === 1; }
  } });
  add({ id: 'kolbe-schmitt', name: 'Kolbe–Schmitt carboxylation', fam: 'EAS', fn: c => {
    const ph = c.subs.find(s => s.mol && G.phenols(s.mol).length && G.arCH(s.mol).length && s.comp.C <= 8), co2 = c.subs.find(s => s.key === 'CO2'), b = c.subs.find(s => s.key === 'NaOH' || s.key === 'KOH'); if(!ph || !co2 || !b) return null;
    const m = clone(ph.mol), adj = S.adjOf(m), pc = G.phenols(m)[0].c; const orth = adj[pc].filter(q => m.a[q[0]].ar && m.a[q[0]].h >= 1).map(q => q[0]); if(!orth.length) return null; const M = b.key === 'KOH' ? 'K' : 'Na'; const cc = S.addAtom(m, 'C', 0); S.bond(m, orth[0], cc, 1); S.bond(m, cc, S.addAtom(m, 'O', 0), 2); const o = S.addFixed(m, 'O', -1, 0); S.bond(m, cc, o, 1); S.addFixed(m, M, 1, 0); S.norm(m);
    return { use: [{ i: ph.i, n: 1 }, { i: co2.i, n: 1 }, { i: b.i, n: 1 }], prods: [Object.assign(P(m), { salt: true }), WATER(1)], cond: { y: .8, T: [380, 480, 400, 440], tau: 180, Ea: 70, Pmin: 80, solv: 'x', cat0: 1, catOK: 1, hiP: 1 }, note: 'Phenoxide + CO₂ at ~125 °C and ~100 bar → sodium salicylate (ortho). Acidify for salicylic acid.', sel: 'ortho carboxylation' };
  } });

  /* ================================================================ 11. diazotisation + azo coupling (one pot, cold) */
  add({ id: 'azo', name: 'Diazotisation + azo coupling', fam: 'Dyes', fn: c => {
    const am = c.subs.find(s => s.mol && G.amines(s.mol).some(a => a.aryl && a.h === 2)), nit = c.subs.find(s => s.tags.has('nitrite')), acid = c.subs.find(s => s.key === 'HCl'), part = c.subs.find(s => s !== am && s.mol && (G.phenols(s.mol).length || G.amines(s.mol).some(a => a.aryl && a.h <= 1)) && G.arCH(s.mol).length); if(!am || !nit || !acid || !part) return null;
    const a1 = G.amines(am.mol).find(a => a.aryl && a.h === 2), m1 = clone(am.mol); const c1 = S.adjOf(m1)[a1.n].find(q => m1.a[q[0]].ar)[0]; S.unbond(m1, a1.n, c1); const r1 = removeIdx(m1, new Set([a1.n])); const A = r1.m, ac = r1.map(c1);
    const m2 = clone(part.mol), adj2 = S.adjOf(m2), rk = G.easRank(m2, adj2); if(!rk.length) return null; const pos = rk[0].c; const n1 = S.addAtom(A, 'N', 0), n2 = S.addAtom(A, 'N', 0); S.bond(A, ac, n1, 1); S.bond(A, n1, n2, 2); const off = A.a.length; const prod = S.merge(A, m2); S.bond(prod, n2, pos + off, 1); S.norm(prod);
    return { use: [{ i: am.i, n: 1 }, { i: nit.i, n: 1 }, { i: acid.i, n: 1 }, { i: part.i, n: 1 }], prods: [P(prod), K('NaCl', 1), WATER(2)], cond: { y: .85, T: [255, 285, 268, 278], tau: 20, Ea: 40, solv: 'p', cat0: 1, catOK: 1, exo: 2 }, note: 'Keep it below 5 °C: the diazonium salt decomposes when warm. It couples para to the OH / NR₂ of the partner. The azo compound is a dye.' };
  } });

  /* ================================================================ 12. carbon–carbon bond formation */
  add({ id: 'grignard', name: 'Grignard reaction (one pot)', fam: 'C–C', fn: c => {
    const mg = c.subs.find(s => s.key === 'Mg'), rx = c.subs.find(s => s.mol && (G.alkylhalides(s.mol).length || G.arylhalides(s.mol).length) && !G.carbonyls(s.mol).length && !G.acids(s.mol).length && !G.alcohols(s.mol).length); if(!mg || !rx) return null;
    const el = c.subs.find(s => s !== rx && s !== mg && s.mol && (G.carbonyls(s.mol).length || G.esters(s.mol).length || s.key === 'CO2') && !G.acids(s.mol).length); if(!el) return null;
    const hx = G.alkylhalides(rx.mol)[0] || G.arylhalides(rx.mol)[0]; const X = rx.mol.a[hx.x].e; const cu = cutOff(rx.mol, hx.c, hx.x); const R = cu.main, ri = cu.map(hx.c);
    const attach = (mE, ci) => { const off = R.a.length; const r2 = clone(R); const mm = S.merge(r2, mE); S.bond(mm, ri, ci + off, 1); return mm; };
    let prod, co = [], nR = 1, free = [K('H2O', 1)];
    const mgx = K(Synth.inorgKey({ Mg: 1, O: 1, H: 1, [X]: 1 }), 1);
    if(el.key === 'CO2'){ const m = clone(el.mol); const cc = m.a.findIndex(a => a.e === 'C'); const oo = S.adjOf(m)[cc].map(q => q[0]); S.bond(m, cc, oo[0], 1); const mm = attach(m, cc); S.norm(mm); prod = mm; }
    else if(G.esters(el.mol).length){ const e = G.esters(el.mol)[0]; const cu2 = cutOff(el.mol, e.c, e.o); let m = cu2.main; const ci = cu2.map(e.c), oi = cu2.map(e.d); S.bond(m, ci, oi, 1); const mm = attach(m, ci); const R2 = clone(R); const off2 = R2.a.length; const m3 = S.merge(R2, mm); S.bond(m3, ri, ci + R2.a.length * 0 + off2 * 0 + 0, 1); /* second R: attach again */ const full = S.merge(R2, mm); S.bond(full, ri, ci + R2.a.length, 1); S.norm(full); prod = full; nR = 2; if(cu2.leave) co.push(P(cu2.leave, 1, 'co')); free = [K('H2O', 1 + 0)]; }
    else { const k = G.carbonyls(el.mol)[0]; const m = clone(el.mol); S.bond(m, k.c, k.o, 1); const mm = attach(m, k.c); S.norm(mm); prod = mm; }
    const frs = S.split(prod); if(frs.length > 1) return null;
    const nW = nR + (el.key === 'CO2' ? 0 : 0); const wat = K('H2O', nR); const prods = [P(prod)].concat(co); prods.push(Object.assign({}, mgx, { n: nR }));
    return { use: [{ i: rx.i, n: nR }, { i: mg.i, n: nR }, { i: el.i, n: 1 }], free: [{ k: 'H2O', n: nR, workup: true }], prods, cond: { y: .8, T: [235, 345, 270, 315], tau: 45, Ea: 40, solv: 'e', dry: 1, inert: 1, quench: 1, cat0: 1, catOK: 1, exo: 3, het: 1 }, note: 'R–X + Mg → R–MgX in dry ether, then it adds to the carbonyl; an acid quench liberates the alcohol / acid. Any water or protic solvent destroys the Grignard reagent.' };
  } });
  add({ id: 'aldol', name: 'Aldol (Claisen–Schmidt) condensation', fam: 'C–C', fn: c => {
    const b = c.subs.find(s => s.key === 'NaOH' || s.key === 'KOH'), alde = c.subs.find(s => s.mol && G.aldehydes(s.mol).some(a => c.subs[0] && S.adjOf(s.mol)[a.c].every(q => s.mol.a[q[0]].e !== 'C' || s.mol.a[q[0]].ar || s.mol.a[q[0]].h === 0))); if(!alde) return null;
    const cm = c.cat && (c.cat.id === 'NaOH' || c.cat.id === 'KOH') ? true : !!b; if(!cm) return null;
    const en = c.subs.find(s => s !== alde && s.mol && (G.ketones(s.mol).length || G.aldehydes(s.mol).length) && S.adjOf(s.mol).some((q, i) => s.mol.a[i].e === 'C' && !s.mol.a[i].ar && s.mol.a[i].h >= 1 && q.some(r => G.carbonyls(s.mol).some(k => k.c === r[0])))); if(!en) return null;
    const ald = G.aldehydes(alde.mol)[0], m1 = clone(alde.mol), m2 = clone(en.mol), adj2 = S.adjOf(m2); const ks = G.carbonyls(m2), al = adj2.map((q, i) => ({ q, i })).filter(x => m2.a[x.i].e === 'C' && !m2.a[x.i].ar && m2.a[x.i].h >= 1 && x.q.some(r => ks.some(k => k.c === r[0]))).sort((x, y) => m2.a[y.i].h - m2.a[x.i].h || x.i - y.i); const a2 = al[0].i;
    S.unbond(m1, ald.c, ald.o); const rr = removeIdx(m1, new Set([ald.o])); const mA = rr.m, ci = rr.map(ald.c); const off = mA.a.length; const prod = S.merge(mA, m2); S.bond(prod, ci, a2 + off, 2); S.norm(prod);
    const use = [{ i: alde.i, n: 1 }, { i: en.i, n: 1 }]; return { use, prods: [P(prod), WATER(1)], cond: { y: .8, T: [270, 340, 285, 310], tau: 30, Ea: 45, solv: 'pxa', cat: { NaOH: 1, KOH: 1 }, catReq: !b, cat0: b ? 1 : .01, catOK: 1, het: 1, exo: 1 }, note: 'Base makes the enolate of the ketone; it attacks the aldehyde, and water is lost to give the conjugated enone (Claisen–Schmidt). Repeat with a second aldehyde for the double condensation (dibenzalacetone).' };
  } });
  add({ id: 'claisen', name: 'Claisen condensation', fam: 'C–C', fn: c => {
    const es = c.subs.find(s => s.mol && G.esters(s.mol).length === 1 && S.adjOf(s.mol).some((q, i) => s.mol.a[i].e === 'C' && !s.mol.a[i].ar && s.mol.a[i].h >= 1 && q.some(r => r[0] === G.esters(s.mol)[0].c))); if(!es || c.subs.length !== 1) return null;
    const e = G.esters(es.mol)[0], m = clone(es.mol), adj = S.adjOf(m); const alpha = adj[e.c].map(q => q[0]).find(i => m.a[i].e === 'C' && !m.a[i].ar && m.a[i].h >= 1); const cu = cutOff(es.mol, e.c, e.o); const acyl = cu.main, ai = cu.map(e.c); const off = m.a.length; const prod = S.merge(m, acyl); S.bond(prod, alpha, ai + off, 1); S.norm(prod); const alc = cu.leave;
    return { use: [{ i: es.i, n: 2 }], prods: [P(prod), P(alc, 1, 'co')], cond: { y: .7, T: [270, 370, 300, 340], tau: 120, Ea: 55, solv: 'pe', cat: { NaOEt: 1, KOtBu: .9 }, catReq: 1, cat0: 0, nowater: 1, eq: .8 }, note: 'An ester enolate attacks a second ester; ethoxide leaves. Choose the alkoxide that matches the ester (put it in the catalyst slot) and keep it dry.' };
  } });
  add({ id: 'diels-alder', name: 'Diels–Alder cycloaddition', fam: 'C–C', fn: c => {
    const di = c.subs.find(s => s.mol && G.dienes(s.mol).length), dp = c.subs.find(s => s !== di && s.mol && G.alkenes(s.mol).length && (!G.dienes(s.mol).length || s.tags.has('dienophile'))); if(!di || !dp) return null;
    const d = G.dienes(di.mol)[0], pa = G.alkenes(dp.mol).sort((x, y) => (G.hasEWG(dp.mol, S.adjOf(dp.mol), y.a) || G.hasEWG(dp.mol, S.adjOf(dp.mol), y.b)) - (G.hasEWG(dp.mol, S.adjOf(dp.mol), x.a) || G.hasEWG(dp.mol, S.adjOf(dp.mol), x.b)))[0]; const act = G.hasEWG(dp.mol, S.adjOf(dp.mol), pa.a) || G.hasEWG(dp.mol, S.adjOf(dp.mol), pa.b);
    const m = clone(di.mol), off = m.a.length, pr = S.merge(m, dp.mol); S.bond(pr, d.a, d.b, 1); S.bond(pr, d.b, d.c, 2); S.bond(pr, d.c, d.d, 1); S.bond(pr, d.a, pa.a + off, 1); S.bond(pr, d.d, pa.b + off, 1); S.bond(pr, pa.a + off, pa.b + off, 1); S.norm(pr);
    return { use: [{ i: di.i, n: 1 }, { i: dp.i, n: 1 }], prods: [P(pr)], cond: act ? { y: .9, T: [250, 420, 280, 340], tau: 20, Ea: 35, solv: 'xnacp', cat0: 1, catOK: 1, exo: 2 } : { y: .6, T: [400, 600, 460, 540], tau: 300, Ea: 90, solv: 'xn', cat0: 1, catOK: 1, Pmin: 10, hiP: 1 }, note: 'A [4+2] cycloaddition forms two C–C bonds and a six-membered ring in one step. Electron-poor dienophiles (maleic anhydride, acrylonitrile) react at room temperature.' };
  } });
  const COUPLE_CAT = { Pd: 1, Ni: .35, Cu: .2 };
  add({ id: 'suzuki', name: 'Suzuki coupling', fam: 'C–C', fn: c => {
    const bo = c.subs.find(s => s.mol && G.boronics(s.mol).length), ax = c.subs.find(s => s !== bo && s.mol && G.arylhalides(s.mol).length), b = c.subs.find(s => baseOf(s)); if(!bo || !ax || !b) return null;
    const bb = G.boronics(bo.mol)[0], hh = G.arylhalides(ax.mol)[0]; const cu = cutOff(bo.mol, bb.c, bb.b), cx = cutOff(ax.mol, hh.c, hh.x); const off = cu.main.a.length; const prod = S.merge(cu.main, cx.main); S.bond(prod, cu.map(bb.c), cx.map(hh.c) + off, 1); S.norm(prod);
    const X = ax.mol.a[hh.x].e, bs = baseOf(b), M = bs.M; let prods = [P(prod)], nb = 1, free = [];
    if(bs.t === 'OH'){ prods.push(K('H3BO3', 1), K(saltKey(M, X), 1)); } else if(bs.t === 'CO3'){ prods.push(K('HBO2', 1), K(saltKey(M, X), 1), K(Synth.inorgKey({ [M]: 1, H: 1, C: 1, O: 3 }), 1)); } else return null;
    return { use: [{ i: bo.i, n: 1 }, { i: ax.i, n: 1 }, { i: b.i, n: 1 }], free, prods, cond: { y: .9, T: [290, 420, 330, 380], tau: 90, Ea: 60, solv: 'paen', cat: COUPLE_CAT, catReq: 1, cat0: .0, inert: 1, het: 1 }, note: 'Pd(0)-catalysed cross-coupling of an arylboronic acid with an aryl halide (Nobel 2010). Pd cycles oxidative addition → transmetalation → reductive elimination; base activates the boron.' };
  } });
  add({ id: 'heck', name: 'Heck reaction', fam: 'C–C', fn: c => {
    const ax = c.subs.find(s => s.mol && G.arylhalides(s.mol).length), al = c.subs.find(s => s !== ax && s.mol && G.alkenes(s.mol).length && S.adjOf(s.mol).some((q, i) => s.mol.a[i].e === 'C' && s.mol.a[i].h === 2 && q.some(r => r[1] === 2))), b = c.subs.find(s => s.id === 'NaOAc' || baseOf(s)); if(!ax || !al || !b) return null;
    const hh = G.arylhalides(ax.mol)[0], m = clone(al.mol), adj = S.adjOf(m); const ch2 = m.a.findIndex((a, i) => a.e === 'C' && a.h === 2 && adj[i].some(q => q[1] === 2)); const cu = cutOff(ax.mol, hh.c, hh.x); const off = m.a.length; const prod = S.merge(m, cu.main); S.bond(prod, ch2, cu.map(hh.c) + off, 1); S.norm(prod);
    const X = ax.mol.a[hh.x].e; let prods = [P(prod)]; if(b.id === 'NaOAc') prods.push(K(saltKey('Na', X), 1), K('CH3COOH', 1)); else if(baseOf(b).t === 'OH') prods.push(K(saltKey(baseOf(b).M, X), 1), WATER(1)); else if(baseOf(b).t === 'CO3') prods.push(K(saltKey(baseOf(b).M, X), 1), K(Synth.inorgKey({ [baseOf(b).M]: 1, H: 1, C: 1, O: 3 }), 1)); else return null;
    return { use: [{ i: ax.i, n: 1 }, { i: al.i, n: 1 }, { i: b.i, n: 1 }], prods, cond: { y: .85, T: [330, 460, 360, 410], tau: 120, Ea: 65, solv: 'a', cat: { Pd: 1 }, catReq: 1, cat0: 0, inert: 1 }, note: 'Pd-catalysed coupling of an aryl halide with a terminal alkene → the aryl group lands on the CH₂ end, giving the trans alkene.' };
  } });
  add({ id: 'sonogashira', name: 'Sonogashira coupling', fam: 'C–C', fn: c => {
    const ax = c.subs.find(s => s.mol && G.arylhalides(s.mol).length), al = c.subs.find(s => s !== ax && s.mol && G.terminalAlkynes(s.mol).length), b = c.subs.find(s => s.id === 'Et3N' || baseOf(s)); if(!ax || !al || !b) return null;
    const hh = G.arylhalides(ax.mol)[0], t = G.terminalAlkynes(al.mol)[0], cu = cutOff(ax.mol, hh.c, hh.x); const off = al.mol.a.length; const prod = S.merge(clone(al.mol), cu.main); S.bond(prod, t.a, cu.map(hh.c) + off, 1); S.norm(prod);
    const X = ax.mol.a[hh.x].e; const prods = [P(prod)]; if(b.id === 'Et3N'){ const salt = S.parse('CC[NH+](CC)CC.[' + X + '-]'); if(!salt) return null; Object.assign(salt, {}); prods.push(Object.assign(P(salt, 1, 'co'), { salt: true })); } else if(baseOf(b).t === 'OH') prods.push(K(saltKey(baseOf(b).M, X), 1), WATER(1)); else return null;
    return { use: [{ i: ax.i, n: 1 }, { i: al.i, n: 1 }, { i: b.i, n: 1 }], prods, cond: { y: .85, T: [270, 400, 295, 340], tau: 120, Ea: 55, solv: 'anex', cat: { Pd: 1 }, catReq: 1, cat0: 0, inert: 1 }, note: 'Pd/Cu-catalysed coupling of an aryl halide with a terminal alkyne.' };
  } });
  add({ id: 'ar-carbonylation', name: 'Hydrocarboxylation of a benzylic alcohol (BHC step 3)', fam: 'C–C', fn: c => {
    const al = c.subs.find(s => s.mol && G.alcohols(s.mol).some(a => a.benzylic)), co = c.subs.find(s => s.key === 'CO'); if(!al || !co) return null;
    const a = G.alcohols(al.mol).find(x => x.benzylic), m = clone(al.mol); S.unbond(m, a.o, a.c); const rr = removeIdx(m, new Set([a.o])); const mm = rr.m, ci = rr.map(a.c); const cc = S.addAtom(mm, 'C', 0); S.bond(mm, ci, cc, 1); S.bond(mm, cc, S.addAtom(mm, 'O', 0), 2); S.bond(mm, cc, S.addAtom(mm, 'O', 0), 1); S.norm(mm);
    return { use: [{ i: al.i, n: 1 }, { i: co.i, n: 1 }], prods: [P(mm)], cond: { y: .9, T: [380, 460, 400, 440], tau: 120, Ea: 60, Pmin: 30, cat: { Pd: 1 }, catReq: 1, cat0: 0, solv: 'xpa', hiP: 1 }, note: 'Pd-catalysed carbonylation of a benzylic alcohol with CO (the green ibuprofen process, step 3).' };
  } });

  /* ================================================================ 13. imines, reductive handling, Strecker */
  add({ id: 'imine', name: 'Imine formation', fam: 'Condensation', fn: c => {
    const k = c.subs.find(s => s.mol && G.carbonyls(s.mol).length), am = c.subs.find(s => s !== k && s.mol && G.amines(s.mol).some(a => a.h === 2)); if(!k || !am) return null; if(c.subs.some(s => s.key === 'NaCN')) return null; if(G.esters(k.mol).length || G.acids(k.mol).length) return null;
    const cb = G.carbonyls(k.mol)[0], a = G.amines(am.mol).find(x => x.h === 2), m = clone(k.mol); const rr = removeIdx(m, new Set([cb.o])); const mm = rr.m, ci = rr.map(cb.c); const off = mm.a.length; const prod = S.merge(mm, am.mol); S.bond(prod, ci, a.n + off, 2); S.norm(prod);
    return { use: [{ i: k.i, n: 1 }, { i: am.i, n: 1 }], prods: [P(prod), WATER(1)], cond: { y: .85, eq: .75, ds: 1, T: [280, 420, 310, 370], tau: 60, Ea: 50, solv: 'xpnae', cat: { H2SO4: 1, TsOH: 1, HCl: .8 }, cat0: .4, catOK: 1 }, note: 'Carbonyl + primary amine → imine + water (removing the water pushes it). Reduce the C=N afterwards for a secondary amine (reductive amination).' };
  } });
  add({ id: 'strecker', name: 'Strecker α-aminonitrile synthesis', fam: 'C–C', fn: c => {
    const al = c.subs.find(s => s.mol && G.aldehydes(s.mol).length === 1 && s.comp.C <= 8), am = c.subs.find(s => s.key === 'NH3'), cn = c.subs.find(s => s.key === 'NaCN'), ac = c.subs.find(s => s.key === 'HCl'); if(!al || !am || !cn || !ac) return null;
    const a = G.aldehydes(al.mol)[0], m = clone(al.mol); S.bond(m, a.c, a.o, 1); const rr = removeIdx(m, new Set([a.o])); const mm = rr.m, ci = rr.map(a.c); const n = S.addAtom(mm, 'N', 0); S.bond(mm, ci, n, 1); const cc = S.addAtom(mm, 'C', 0), nn = S.addAtom(mm, 'N', 0); S.bond(mm, ci, cc, 1); S.bond(mm, cc, nn, 3); S.norm(mm);
    return { use: [{ i: al.i, n: 1 }, { i: am.i, n: 1 }, { i: cn.i, n: 1 }, { i: ac.i, n: 1 }], prods: [P(mm), K('NaCl', 1), WATER(1)], cond: { y: .8, T: [270, 340, 285, 310], tau: 90, Ea: 50, solv: 'p', cat0: 1, catOK: 1, exo: 1 }, note: 'Aldehyde + NH₃ + HCN (from NaCN + HCl) → α-aminonitrile. Hydrolyse it (HCl, heat) to get the amino acid. Cyanide is very toxic.' };
  } });
  const cc2 = null;
})();
