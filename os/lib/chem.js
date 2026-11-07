/* WestChem — the WestLab reaction engine. Pure functions, no DOM, no network, fully deterministic.
 *
 * What it does (all from first principles, not a lookup table of answers):
 *   parse / hill        formula  <-> composition
 *   balance             integer-balances ANY equation with exact rational arithmetic (null-space of the atom matrix)
 *   ions                splits a compound into cation + anion using oxidation states and a polyatomic-ion table
 *   build / name        constructs a charge-balanced compound from two ions and names it (IUPAC-style)
 *   solve               given reagents + conditions, picks a reaction type (synthesis, decomposition, combustion,
 *                       single / double displacement with solubility rules, acid-base, oxide + water, hydrogenation …),
 *                       works out the products, balances it and reports what equipment it needs
 *   validate / formation  "make anything": checks a formula is chemically sensible and builds it from elements
 * Anything the rules can't justify is refused with a reason — it never invents chemistry.
 * Loads in the browser (after data/periodic-table-data.js, economy-data.js, chem-data.js) and in Node (tests, Actions).
 */
const Chem = (function(){
  'use strict';
  // NB: top-level `const` data tables are global *lexical* bindings, not window properties, so they are read by bare name.
  const D = () => { const d = {
    ELEMENTS: typeof ELEMENTS !== 'undefined' ? ELEMENTS : undefined,
    EXTRA_PRICES: typeof EXTRA_PRICES !== 'undefined' ? EXTRA_PRICES : undefined,
    ELEMENT_PRICES: typeof ELEMENT_PRICES !== 'undefined' ? ELEMENT_PRICES : undefined,
    OXIDATION: typeof OXIDATION !== 'undefined' ? OXIDATION : undefined,
    ELECTRONEG: typeof ELECTRONEG !== 'undefined' ? ELECTRONEG : undefined,
    DIATOMIC: typeof DIATOMIC !== 'undefined' ? DIATOMIC : undefined,
    ACTIVITY: typeof ACTIVITY !== 'undefined' ? ACTIVITY : undefined,
    VIOLENT_WITH_WATER: typeof VIOLENT_WITH_WATER !== 'undefined' ? VIOLENT_WITH_WATER : undefined,
    ION_TABLE: typeof ION_TABLE !== 'undefined' ? ION_TABLE : undefined,
    ROOT_NAMES: typeof ROOT_NAMES !== 'undefined' ? ROOT_NAMES : undefined,
    RECIPES: typeof RECIPES !== 'undefined' ? RECIPES : undefined,
    COMPOUND_LOOKUP: typeof COMPOUND_LOOKUP !== 'undefined' ? COMPOUND_LOOKUP : undefined,
    TOOLS: typeof TOOLS !== 'undefined' ? TOOLS : undefined,
    CRAFT_BASE_BONUS: typeof CRAFT_BASE_BONUS !== 'undefined' ? CRAFT_BASE_BONUS : undefined,
    CRAFT_TIER_BONUS: typeof CRAFT_TIER_BONUS !== 'undefined' ? CRAFT_TIER_BONUS : undefined
  };
    return { ELEMENTS: d.ELEMENTS, PRICES: Object.assign({}, d.EXTRA_PRICES, d.ELEMENT_PRICES), OX: d.OXIDATION, EN: d.ELECTRONEG, DIA: d.DIATOMIC, ACT: d.ACTIVITY, VIOLENT: d.VIOLENT_WITH_WATER,
      IONS: d.ION_TABLE, ROOT: d.ROOT_NAMES, RECIPES: d.RECIPES || [], LOOKUP: d.COMPOUND_LOOKUP || [], TOOLS: d.TOOLS || [], CBB: d.CRAFT_BASE_BONUS, CTB: d.CRAFT_TIER_BONUS }; };
  let I = null, EL = {}, registry = {}, cationList = null, anionList = null;
  const decompCache = {};
  const METAL_CATS = new Set(['alkali-metal', 'alkaline-earth', 'transition-metal', 'post-transition', 'lanthanide', 'actinide']);
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while(b){ [a, b] = [b, a % b]; } return a || 1; };
  const lcm = (a, b) => a / gcd(a, b) * b;

  function init(){
    if(I) return; I = D();
    I.ELEMENTS.forEach(e => { EL[e[1]] = { num: e[0], sym: e[1], name: e[2], mass: e[3], cat: e[4], group: e[6] }; });
    // registry of curated compounds: composition -> canonical formula + name + description (RECIPES first, then the lookup table)
    const split = n => { const m = /^(.*\S)\s+\(([^)]*)\)$/.exec(n || ''); return m && !/^[IVX]+(,[IVX]+)?$/.test(m[2]) ? { name: m[1], common: m[2] } : { name: n }; };
    I.LOOKUP.forEach(c => { const k = compKey(c.comp); if(!registry[k]) registry[k] = { formula: c.formula, name: c.name, desc: c.desc, category: c.category, common: c.common }; });
    I.RECIPES.forEach(r => { const comp = parse(r.formula); if(!comp) return; const k = compKey(comp); const sp = split(r.name); registry[k] = Object.assign({}, registry[k], { formula: r.formula, name: sp.name || (registry[k] && registry[k].name), common: sp.common || (registry[k] && registry[k].common), desc: r.desc || (registry[k] && registry[k].desc) }); });
  }

  // ---------------------------------------------------------------- formulas
  function parse(str){
    init();
    if(typeof str !== 'string') return null;
    const s = str.replace(/[\s]/g, '').replace(/[·.•*]/g, '.').replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 8320));
    if(!s || /[^A-Za-z0-9().]/.test(s)) return null;
    const parts = s.split('.'), total = {};
    for(const part of parts){
      const m = part.match(/^(\d+)(.*)$/); const mult = m ? parseInt(m[1], 10) : 1; const body = m ? m[2] : part;
      const c = parseGroup(body); if(!c) return null;
      Object.keys(c).forEach(k => { total[k] = (total[k] || 0) + c[k] * mult; });
    }
    return Object.keys(total).length ? total : null;
  }
  function parseGroup(s){
    let i = 0;
    function grp(){
      const out = {};
      while(i < s.length && s[i] !== ')'){
        if(s[i] === '('){
          i++; const inner = grp(); if(s[i] !== ')') throw 0; i++;
          const n = num(); Object.keys(inner).forEach(k => { out[k] = (out[k] || 0) + inner[k] * n; });
        } else {
          const m = /^[A-Z][a-z]?/.exec(s.slice(i)); if(!m || !EL[m[0]]) throw 0;
          i += m[0].length; const n = num(); out[m[0]] = (out[m[0]] || 0) + n;
        }
      }
      return out;
    }
    function num(){ const m = /^\d+/.exec(s.slice(i)); if(!m) return 1; i += m[0].length; return parseInt(m[0], 10); }
    try{ const r = grp(); if(i !== s.length) return null; return r; }catch(e){ return null; }
  }
  const compKey = comp => Object.keys(comp).sort().map(k => k + comp[k]).join('');
  const atoms = comp => Object.values(comp).reduce((a, b) => a + b, 0);
  const add = (a, b, k) => { const o = Object.assign({}, a); Object.keys(b).forEach(e => { o[e] = (o[e] || 0) + b[e] * (k || 1); }); return o; };
  function hill(comp){
    const keys = Object.keys(comp), has = comp.C;
    const order = has ? ['C', 'H'].filter(k => comp[k]).concat(keys.filter(k => k !== 'C' && k !== 'H').sort()) : keys.sort();
    return order.map(k => k + (comp[k] > 1 ? comp[k] : '')).join('');
  }
  const isMetal = s => !!EL[s] && METAL_CATS.has(EL[s].cat);
  const isHalogen = s => ['F', 'Cl', 'Br', 'I', 'At'].includes(s);
  const en = s => (I.EN[s] !== undefined ? I.EN[s] : (isMetal(s) ? 1.3 : 2.2));
  const elName = s => EL[s] ? EL[s].name.toLowerCase() : s;
  const massOf = comp => Object.keys(comp).reduce((m, k) => m + EL[k].mass * comp[k], 0);

  // ---------------------------------------------------------------- ions
  function cations(){
    if(cationList) return cationList; init(); cationList = [];
    I.ELEMENTS.forEach(e => { const s = e[1]; if(!isMetal(s)) return; (I.OX[s] || []).filter(x => x > 0).forEach(ch => cationList.push({ f: s, ch, comp: { [s]: 1 }, el: s })); });
    cationList.push({ f: 'NH4', ch: 1, comp: { N: 1, H: 4 }, poly: true, name: 'ammonium' }, { f: 'H', ch: 1, comp: { H: 1 }, el: 'H' });
    return cationList;
  }
  function anions(){
    if(anionList) return anionList; init(); anionList = [];
    ['H', 'F', 'Cl', 'Br', 'I', 'O', 'S', 'Se', 'Te', 'N', 'P', 'As'].forEach(s => { const neg = (I.OX[s] || []).find(x => x < 0); if(neg) anionList.push({ f: s, ch: neg, comp: { [s]: 1 }, el: s }); });
    I.IONS.filter(x => x[1] < 0).forEach(([f, ch, name]) => anionList.push({ f, ch, comp: parse(f), poly: true, name }));
    return anionList;
  }
  const roman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] || String(n);
  function cationName(c){
    if(c.name) return c.name;
    const variable = (I.OX[c.el] || []).filter(x => x > 0).length > 1;
    return elName(c.el) + (variable ? '(' + roman(c.ch) + ')' : '');
  }
  function anionName(a){
    if(a.name) return a.name;
    const r = I.ROOT[a.el]; return (r || elName(a.el).replace(/(ine|en|on|um|ur)$/, '')) + 'ide';
  }
  // counts that make a neutral formula unit
  function neutralCounts(c, a){ const l = lcm(Math.abs(c.ch), Math.abs(a.ch)); return [l / Math.abs(c.ch), l / Math.abs(a.ch)]; }
  function ionFormulaPart(ion, n){ if(n === 1) return ion.f; return (ion.poly && Object.keys(ion.comp).length > 1 ? '(' + ion.f + ')' : ion.f) + n; }
  function build(c, a){
    init(); const [nc, na] = neutralCounts(c, a);
    const comp = add(add({}, c.comp, nc), a.comp, na);
    let formula = ionFormulaPart(c, nc) + ionFormulaPart(a, na);
    if(c.f === 'H' && !a.poly) formula = (nc > 1 ? 'H' + nc : 'H') + a.f + (na > 1 ? na : '');           // HCl, H2S
    if(c.f === 'H' && a.poly) formula = (nc > 1 ? 'H' + nc : 'H') + a.f + (na > 1 ? na : '');           // H2SO4 (na is 1 for acids)
    const reg = registry[compKey(comp)];
    return { comp, formula: reg ? reg.formula : formula, cation: c, anion: a, nc, na };
  }
  // split a composition into cation + anion (null if it isn't a simple ionic/acidic compound)
  function ions(comp){
    init(); const key = compKey(comp); if(key in decompCache) return decompCache[key];
    let found = null; const els = new Set(Object.keys(comp));
    outer: for(const c of cations()){
      if(!Object.keys(c.comp).every(e => els.has(e))) continue;
      for(const a of anions()){
        if(!Object.keys(a.comp).every(e => els.has(e))) continue;
        const [nc0, na0] = neutralCounts(c, a);
        for(let k = 1; k <= 4; k++){
          const t = add(add({}, c.comp, nc0 * k), a.comp, na0 * k);
          if(compKey(t) === key){ found = { cation: c, anion: a, nc: nc0 * k, na: na0 * k }; break outer; }
        }
      }
    }
    return (decompCache[key] = found);
  }
  // ---------------------------------------------------------------- naming
  const PRE = ['', 'mono', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
  const ALK = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
  function organicName(comp){
    const els = Object.keys(comp); if(!els.includes('C') || !els.includes('H')) return null;
    const C = comp.C, H = comp.H, O = comp.O || 0; if(els.some(e => !['C', 'H', 'O'].includes(e)) || C > 10) return null;
    if(!O){ if(H === 2 * C + 2) return ALK[C] + 'ane'; if(H === 2 * C && C > 1) return ALK[C] + 'ene'; if(H === 2 * C - 2 && C > 1) return ALK[C] + 'yne'; if(C === 6 && H === 6) return 'benzene'; }
    if(O === 1 && H === 2 * C + 2) return ALK[C] + 'anol';
    if(O === 2 && H === 2 * C) return ALK[C] + 'anoic acid';
    return null;
  }
  function nameOf(formulaOrComp){
    init(); const comp = typeof formulaOrComp === 'string' ? parse(formulaOrComp) : formulaOrComp; if(!comp) return String(formulaOrComp);
    const reg = registry[compKey(comp)]; if(reg && reg.name) return reg.name;
    const els = Object.keys(comp);
    if(els.length === 1){ const s = els[0], n = comp[s]; return n === 1 ? EL[s].name : EL[s].name + ' (' + s + n + ')'; }
    const org = organicName(comp); if(org) return org[0].toUpperCase() + org.slice(1);
    const ion = ions(comp);
    if(ion){
      const { cation: c, anion: a } = ion, cap = s => s[0].toUpperCase() + s.slice(1);
      if(c.f === 'H'){                                                                  // acids
        if(a.f === 'OH') return 'Water';
        if(!a.poly){ const r = I.ROOT[a.el] || elName(a.el); return cap(a.el === 'H' ? 'hydrogen' : 'hydro' + r + 'ic acid'); }
        if(a.name.endsWith('ate')) return cap(a.name.replace(/ate$/, 'ic acid'));
        if(a.name.endsWith('ite')) return cap(a.name.replace(/ite$/, 'ous acid'));
        return cap('hydrogen ' + a.name);
      }
      return cap(cationName(c) + ' ' + anionName(a));
    }
    const nm = els.filter(e => !isMetal(e));
    if(els.length === 2 && nm.length === 2){                                           // covalent binary: prefixes
      const sorted = els.slice().sort((x, y) => en(x) - en(y)), a = sorted[0], b = sorted[1];
      if(a === 'H') return 'Hydrogen ' + (I.ROOT[b] || elName(b)) + 'ide';
      let p2 = PRE[comp[b]] || '', root = (I.ROOT[b] || elName(b)) + 'ide';
      if(/[ao]$/.test(p2) && /^[aeiou]/.test(root)) p2 = p2.slice(0, -1);
      const p1 = comp[a] > 1 ? (PRE[comp[a]] || '') : '';
      return (p1 ? p1[0].toUpperCase() + p1.slice(1) + elName(a) : EL[a].name) + ' ' + p2 + root;
    }
    return 'Compound ' + hill(comp);
  }
  function describe(formula){
    init(); const comp = parse(formula); if(!comp) return null; const reg = registry[compKey(comp)];
    return { formula: reg ? reg.formula : formula, name: nameOf(comp), desc: reg && reg.desc || '', category: reg && reg.category || classify(comp), mass: massOf(comp), comp };
  }
  function classify(comp){
    const els = Object.keys(comp);
    if(els.length === 1) return 'element';
    const org = organicName(comp); if(org || (comp.C && comp.H && els.every(e => ['C', 'H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I'].includes(e)))) return comp.O ? 'organic' : 'hydrocarbon';
    const ion = ions(comp);
    if(ion){ if(ion.cation.f === 'H') return ion.anion.f === 'OH' ? 'water' : 'acid'; if(ion.anion.f === 'OH') return 'base'; if(ion.anion.f === 'O') return 'oxide'; return 'salt'; }
    if(els.length === 2 && els.includes('O')) return 'oxide';
    return 'compound';
  }
  // ---------------------------------------------------------------- balancing (exact rational arithmetic)
  function balance(reacts, prods){
    const species = reacts.concat(prods), n = species.length;
    const els = [...new Set(species.flatMap(c => Object.keys(c)))];
    let M = els.map(e => species.map((c, i) => [BigInt((c[e] || 0) * (i < reacts.length ? 1 : -1)), 1n]));
    const norm = f => { let [a, b] = f; if(b < 0n){ a = -a; b = -b; } const g = bg(a < 0n ? -a : a, b); return [a / g, b / g]; };
    const bg = (a, b) => { while(b){ [a, b] = [b, a % b]; } return a || 1n; };
    const sub = (x, y) => norm([x[0] * y[1] - y[0] * x[1], x[1] * y[1]]), mul = (x, y) => norm([x[0] * y[0], x[1] * y[1]]), div = (x, y) => norm([x[0] * y[1], x[1] * y[0]]);
    const pivots = []; let row = 0;
    for(let col = 0; col < n && row < M.length; col++){
      let p = -1; for(let r = row; r < M.length; r++) if(M[r][col][0] !== 0n){ p = r; break; }
      if(p < 0) continue;
      [M[row], M[p]] = [M[p], M[row]];
      const pv = M[row][col]; M[row] = M[row].map(x => div(x, pv));
      for(let r = 0; r < M.length; r++){ if(r === row || M[r][col][0] === 0n) continue; const f = M[r][col]; M[r] = M[r].map((x, c) => sub(x, mul(f, M[row][c]))); }
      pivots.push(col); row++;
    }
    const free = []; for(let c = 0; c < n; c++) if(!pivots.includes(c)) free.push(c);
    if(!free.length) return null;
    const sol = new Array(n).fill(null).map(() => [0n, 1n]);
    free.forEach(c => { sol[c] = [1n, 1n]; });
    pivots.forEach((pc, r) => { let v = [0n, 1n]; free.forEach(fc => { v = sub(v, mul(M[r][fc], sol[fc])); }); sol[pc] = v; });
    let L = 1n; sol.forEach(f => { L = L / bg(L, f[1]) * f[1]; });
    const ints = sol.map(f => f[0] * (L / f[1]));
    if(ints.some(v => v <= 0n)) return null;
    let g = ints.reduce((a, b) => bg(a, b)); const out = ints.map(v => Number(v / g));
    return out.some(v => v > 60) ? null : out;
  }
  // ---------------------------------------------------------------- species
  function speciesOf(key){                                    // inventory key -> species used in equations
    init(); const comp = parse(key); if(!comp) return null;
    const els = Object.keys(comp);
    if(els.length === 1 && comp[els[0]] === 1){ const s = els[0], dia = I.DIA.has(s); return { key: s, kind: 'element', el: s, f: s, comp: { [s]: 1 }, apu: 1 }; }   // F, H, O… are FREE ATOMS; the molecules (F2, H2, O2) are compounds below
    const reg = registry[compKey(comp)]; const f = reg ? reg.formula : key;
    return { key: f, kind: 'compound', f, comp, apu: 1 };
  }
  function speciesFromComp(comp){                             // product species from a composition
    init(); const els = Object.keys(comp);
    if(els.length === 1){ const s = els[0], dia = I.DIA.has(s); const n = comp[s]; if(n === 1) return { key: s, kind: 'element', el: s, f: s, comp: { [s]: 1 }, apu: 1 }; }
    const reg = registry[compKey(comp)]; const f = reg ? reg.formula : (ions(comp) ? buildFromIons(comp).formula : hill(comp));
    return { key: f, kind: 'compound', f, comp, apu: 1 };
  }
  function buildFromIons(comp){ const d = ions(comp); return d ? build(d.cation, d.anion) : { formula: hill(comp), comp }; }
  const el2 = s => speciesFromComp({ [s]: I.DIA.has(s) ? 2 : 1 });
  const ion2 = (c, a) => speciesFromComp(build(c, a).comp);
  const findCation = (f, ch) => cations().find(c => c.f === f && (ch === undefined || c.ch === ch));
  const findAnion = f => anions().find(a => a.f === f);
  const lowestCharge = el => { const p = (I.OX[el] || []).filter(x => x > 0); return p.length ? Math.min(...p) : 0; };

  // ---------------------------------------------------------------- solubility (standard introductory rules)
  function soluble(c, a){
    if(c.f === 'H') return true;
    if(['Li', 'Na', 'K', 'Rb', 'Cs', 'NH4'].includes(c.f)) return true;
    if(['NO3', 'ClO3', 'ClO4', 'C2H3O2', 'HCO3', 'H2PO4', 'HSO4', 'NO2', 'MnO4'].includes(a.f)) return true;
    if(['Cl', 'Br', 'I'].includes(a.f)) return !(['Ag', 'Pb'].includes(c.f) || (c.f === 'Hg' && c.ch === 1) || (c.f === 'Cu' && c.ch === 1));
    if(a.f === 'F') return !['Ca', 'Mg', 'Sr', 'Ba', 'Pb'].includes(c.f);
    if(a.f === 'SO4') return !['Ba', 'Sr', 'Pb', 'Ca', 'Ag', 'Hg'].includes(c.f);
    if(a.f === 'OH') return ['Ba', 'Sr'].includes(c.f);
    if(a.f === 'S') return ['Ca', 'Sr', 'Ba'].includes(c.f);
    return false;                                              // carbonate, phosphate, sulfite, chromate… are insoluble with non-alkali cations
  }
  // ---------------------------------------------------------------- reaction rules
  const R = (type, reacts, prods, needs, note) => ({ type, reacts, prods, needs: needs || [], note: note || '' });
  const nonmetals = s => !isMetal(s) && !!EL[s] && EL[s].cat !== 'noble-gas';

  function binaryCandidates(A, B){                              // every plausible binary compound of two elements, most stable first
    let metal = null, non = null;
    if(isMetal(A) && !isMetal(B)){ metal = A; non = B; } else if(isMetal(B) && !isMetal(A)){ metal = B; non = A; }
    const out = [];
    if(metal){
      const an = findAnion(non); if(!an) return out;
      (I.OX[metal] || []).filter(x => x > 0).forEach(ch => { const c = findCation(metal, ch); if(c) out.push(build(c, an)); });
    } else if(!isMetal(A) && !isMetal(B)){
      const [x, y] = en(A) <= en(B) ? [A, B] : [B, A];
      const neg = (I.OX[y] || []).find(v => v < 0); if(neg === undefined) return out;
      const poss = (I.OX[x] || []).filter(v => v > 0);
      if(x === y) return out;
      poss.forEach(ch => { const g = gcd(ch, -neg); out.push({ comp: { [x]: -neg / g, [y]: ch / g }, formula: null }); });
      out.forEach(o => { if(!o.formula) o.formula = buildFromIons(o.comp).formula; });
      const seen = new Set(); return out.filter(o => { const k = compKey(o.comp); if(seen.has(k)) return false; seen.add(k); return true; });
    }
    return out;
  }
  function pickBinary(A, B, amounts){
    const cands = binaryCandidates(A, B); if(!cands.length) return null;
    if(!amounts || !(amounts[A] > 0) || !(amounts[B] > 0)) return cands[0];
    const target = Math.log(amounts[B] / amounts[A]); let best = cands[0], bd = Infinity;
    cands.forEach((c, i) => { const r = Math.log((c.comp[B] || 0) / (c.comp[A] || 1e-9)); const d = Math.abs(r - target) + i * 0.05; if(d < bd){ bd = d; best = c; } });
    return best;
  }
  // Named reactions (data/chem-data.js NAMED_REACTIONS): matched on the exact SET of reagents, X and X2 being the same element in its standard state.
  function namedRule(sp){
    const NR = typeof NAMED_REACTIONS !== 'undefined' ? NAMED_REACTIONS : []; if(!NR.length) return null;
    const norm = s => s.kind === 'element' && I.DIA.has(s.el) ? compKey({ [s.el]: 2 }) : compKey(s.comp), have = sp.map(norm).sort().join('|');
    for(const e of NR){
      const want = e.r.map(f => { const c = parse(f); return c ? (Object.keys(c).length === 1 && c[Object.keys(c)[0]] === 1 && I.DIA.has(Object.keys(c)[0]) ? compKey({ [Object.keys(c)[0]]: 2 }) : compKey(c)) : f; }).sort().join('|');
      if(want !== have) continue;
      if(e.notModelled) return { type: 'Not modelled', note: 'Not modelled: ' + e.why, notModelled: true, reacts: sp, prods: [], needs: [], obs: e.obs || '' };
      const prods = e.p.map(f => { const c = parse(f); return Object.keys(c).length === 1 ? el2(Object.keys(c)[0]) : speciesFromComp(c); });
      const r = R(e.type, sp, prods, e.n || [], e.obs ? '' : ''); r.obs = e.obs || ''; r.id = e.id; if(e.Ea) r.Ea = e.Ea; return r;
    }
    return null;
  }
  function rule(sp, amounts){
    const nr = namedRule(sp); if(nr) return nr;
    const els = sp.filter(s => s.kind === 'element'), cps = sp.filter(s => s.kind === 'compound');
    // ---- one compound: decomposition
    if(sp.length === 1 && cps.length === 1){
      const c = cps[0], comp = c.comp, ion = ions(comp), key = compKey(comp);
      if(key === 'H2O1' || key === 'H2O') return R('Electrolysis of water', [c], [el2('H'), el2('O')], ['spark']);
      if(key === compKey({ H: 2, O: 2 })) return R('Decomposition', [c], [speciesFromComp({ H: 2, O: 1 }), el2('O')], ['catalyst']);
      if(ion){
        const { cation, anion } = ion;
        if(anion.f === 'CO3' && isMetal(cation.el || '')){ const ox = ion2(cation, findAnion('O')); return R('Thermal decomposition', [c], [ox, speciesFromComp({ C: 1, O: 2 })], ['heat']); }
        if(anion.f === 'OH' && isMetal(cation.el || '') && cation.f !== 'H'){ const ox = ion2(cation, findAnion('O')); return R('Thermal decomposition', [c], [ox, speciesFromComp({ H: 2, O: 1 })], ['heat']); }
        if(anion.f === 'ClO3') return R('Thermal decomposition', [c], [ion2(cation, findAnion('Cl')), el2('O')], ['heat']);
        if(anion.f === 'NO3' && ['Na', 'K', 'Li'].includes(cation.f)) return R('Thermal decomposition', [c], [ion2(cation, findAnion('NO2')), el2('O')], ['heat']);
        if(cation.f === 'H' && anion.f === 'CO3') return R('Decomposition', [c], [speciesFromComp({ H: 2, O: 1 }), speciesFromComp({ C: 1, O: 2 })], []);
        if(cation.f === 'H' && anion.f === 'SO3') return R('Decomposition', [c], [speciesFromComp({ H: 2, O: 1 }), speciesFromComp({ S: 1, O: 2 })], []);
        if(cation.f === 'NH4' && anion.f === 'OH') return R('Decomposition', [c], [speciesFromComp({ N: 1, H: 3 }), speciesFromComp({ H: 2, O: 1 })], []);
        if(!anion.poly && isMetal(cation.el || '') && anion.el !== 'H') return R('Electrolysis of the melt', [c], [el2(cation.el), el2(anion.el)], ['spark']);
      }
      return null;
    }
    // ---- combustion: fuel + O2
    const o2 = els.find(s => s.el === 'O');
    if(o2 && cps.length === 1 && cps[0].comp.C && cps[0].comp.H && Object.keys(cps[0].comp).every(e => ['C', 'H', 'O', 'N', 'S'].includes(e))){
      const f = cps[0], prods = [speciesFromComp({ C: 1, O: 2 }), speciesFromComp({ H: 2, O: 1 })];
      if(f.comp.N) prods.push(el2('N')); if(f.comp.S) prods.push(speciesFromComp({ S: 1, O: 2 }));
      return R('Combustion', [f, o2], prods, ['heat']);
    }
    // ---- ammonia + acid -> ammonium salt
    if(cps.length === 2 && els.length === 0){
      const a = cps.find(c => compKey(c.comp) === compKey({ N: 1, H: 3 })), b = cps.find(c => c !== a);
      if(a && b){ const ib = ions(b.comp); if(ib && ib.cation.f === 'H' && ib.na === 1){ return R('Acid–base (ammonia)', [a, b], [ion2(findCation('NH4'), ib.anion)], []); } }
    }
    // ---- hydrogenation
    const h2 = els.find(s => s.el === 'H');
    if(h2 && cps.length === 1 && cps[0].comp.C && cps[0].comp.H && Object.keys(cps[0].comp).every(e => ['C', 'H'].includes(e))){
      const c = cps[0].comp; if(c.H < 2 * c.C + 2) return R('Hydrogenation', [cps[0], h2], [speciesFromComp({ C: c.C, H: c.H + 2 })], ['catalyst', 'heat']);
    }
    // ---- element + element
    if(els.length === 2 && cps.length === 0){
      const [a, b] = [els[0].el, els[1].el];
      if(['N', 'H'].includes(a) && ['N', 'H'].includes(b)) return R('Haber process', [els[0], els[1]], [speciesFromComp({ N: 1, H: 3 })], ['pressure', 'catalyst', 'heat']);
      const cand = pickBinary(a, b, amounts); if(!cand) return null;
      const spontaneous = (isHalogen(a) && (isMetal(b) || b === 'H')) || (isHalogen(b) && (isMetal(a) || a === 'H'));
      const needs = spontaneous ? [] : ['heat'];
      return R(isMetal(a) !== isMetal(b) ? 'Synthesis (ionic)' : 'Synthesis (covalent)', els, [speciesFromComp(cand.comp)], needs);
    }
    // ---- metal + water
    const water = cps.find(c => compKey(c.comp) === compKey({ H: 2, O: 1 }));
    if(water && els.length === 1 && cps.length === 1 && isMetal(els[0].el)){
      const m = els[0].el, ox = lowestCharge(m);
      if(I.VIOLENT.has(m) || m === 'Ca'){ const c = findCation(m, ox); return R('Metal + water', [els[0], water], [ion2(c, findAnion('OH')), el2('H')], []); }
      if(['Mg', 'Zn', 'Fe', 'Al'].includes(m)){ const c = findCation(m, m === 'Fe' ? 2 : ox); return R('Metal + steam', [els[0], water], [ion2(c, findAnion('O')), el2('H')], ['heat']); }
      return null;
    }
    // ---- oxide + water -> acid / base
    if(water && cps.length === 2 && els.length === 0){
      const ox = cps.find(c => c !== water);
      if(ox && ox.comp.O && Object.keys(ox.comp).length === 2){
        const other = Object.keys(ox.comp).find(e => e !== 'O');
        if(isMetal(other)){ const d = ions(ox.comp); if(d && ['Na', 'K', 'Li', 'Ca', 'Ba', 'Sr', 'Rb', 'Cs'].includes(d.cation.f)){ return R('Basic oxide + water', [ox, water], [ion2(d.cation, findAnion('OH'))], []); } return null; }
        for(let k = 1; k <= 3; k++){
          let t = add(ox.comp, { H: 2, O: 1 }, k), g = Object.values(t).reduce(gcd);
          const u = {}; Object.keys(t).forEach(e => { u[e] = t[e] / g; });
          const d = ions(u); if(d && d.cation.f === 'H') return R('Acidic oxide + water', [ox, water], [speciesFromComp(u)], []);
        }
      }
      return null;
    }
    // ---- metal + compound: displacement
    if(els.length === 1 && cps.length === 1){
      const e = els[0], c = cps[0], d = ions(c.comp);
      if(d && isMetal(e.el)){
        if(d.cation.f === 'H'){                                                   // metal + acid -> salt + H2
          const idx = I.ACT.indexOf(e.el); if(idx < 0 || idx >= I.ACT.indexOf('H')) return null;
          const cat = findCation(e.el, e.el === 'Fe' || e.el === 'Cr' || e.el === 'Sn' || e.el === 'Mn' || e.el === 'Co' ? 2 : lowestCharge(e.el));
          return cat ? R('Metal + acid', [e, c], [ion2(cat, d.anion), el2('H')], []) : null;
        }
        if(isMetal(d.cation.el || '')){                                          // metal + salt
          const a = I.ACT.indexOf(e.el), b = I.ACT.indexOf(d.cation.el); if(a < 0 || b < 0 || a >= b) return null;
          const cat = findCation(e.el, e.el === 'Fe' ? 2 : lowestCharge(e.el));
          return cat ? R('Single displacement', [e, c], [ion2(cat, d.anion), el2(d.cation.el)], []) : null;
        }
      }
      if(d && isHalogen(e.el) && !d.anion.poly && isHalogen(d.anion.el)){        // halogen displaces a less reactive halide
        const order = ['F', 'Cl', 'Br', 'I']; if(order.indexOf(e.el) >= order.indexOf(d.anion.el)) return null;
        return R('Halogen displacement', [e, c], [ion2(d.cation, findAnion(e.el)), el2(d.anion.el)], []);
      }
      return null;
    }
    // ---- two compounds: double displacement (includes acid-base and gas-forming reactions)
    if(cps.length === 2 && els.length === 0){
      const d1 = ions(cps[0].comp), d2 = ions(cps[1].comp); if(!d1 || !d2) return null;
      const AD = build(d1.cation, d2.anion), CB = build(d2.cation, d1.anion);
      const prods = []; let driver = null;
      const addProd = (b, c, a) => {                                              // weak electrolytes decompose into their gas
        const k = compKey(b.comp);
        if(c.f === 'H' && a.f === 'CO3') { prods.push(speciesFromComp({ H: 2, O: 1 }), speciesFromComp({ C: 1, O: 2 })); driver = driver || 'gas (CO₂)'; return; }
        if(c.f === 'H' && a.f === 'SO3') { prods.push(speciesFromComp({ H: 2, O: 1 }), speciesFromComp({ S: 1, O: 2 })); driver = driver || 'gas (SO₂)'; return; }
        if(c.f === 'H' && a.f === 'HCO3') { prods.push(speciesFromComp({ H: 2, O: 1 }), speciesFromComp({ C: 1, O: 2 })); driver = driver || 'gas (CO₂)'; return; }
        if(c.f === 'NH4' && a.f === 'OH'){ prods.push(speciesFromComp({ N: 1, H: 3 }), speciesFromComp({ H: 2, O: 1 })); driver = driver || 'gas (NH₃)'; return; }
        if(c.f === 'H' && a.f === 'S'){ prods.push(speciesFromComp({ H: 2, S: 1 })); driver = driver || 'gas (H₂S)'; return; }
        if(c.f === 'H' && a.f === 'OH'){ prods.push(speciesFromComp({ H: 2, O: 1 })); driver = driver || 'water forms'; return; }
        if(c.f === 'H' && a.f === 'O'){ prods.push(speciesFromComp({ H: 2, O: 1 })); driver = driver || 'water forms'; return; }
        if(!soluble(c, a)) driver = driver || 'precipitate (' + b.formula + ')';
        prods.push(speciesFromComp(b.comp));
      };
      addProd(AD, d1.cation, d2.anion); addProd(CB, d2.cation, d1.anion);
      if(!driver) return R('No reaction', cps, [], [], 'All the ions stay dissolved — nothing precipitates, bubbles or forms water.');
      // exchange of identical ions (e.g. same compound twice) is not a reaction
      const same = prods.every(p => cps.some(c => compKey(c.comp) === compKey(p.comp)));
      if(same) return null;
      const uniq = []; prods.forEach(p => { if(!uniq.some(u => u.key === p.key)) uniq.push(p); });
      const rank = p => (p.key === 'H2O' ? 1 : (['CO2', 'SO2', 'NH3', 'H2S'].includes(p.key) ? 2 : 0));
      uniq.sort((x, y) => rank(x) - rank(y));
      return R(/water/.test(driver) ? 'Acid–base neutralisation' : 'Double displacement', cps, uniq, [], 'Driven by ' + driver + '.');
    }
    return null;
  }
  // ---------------------------------------------------------------- public: solve
  function solve(keys, conditions, amounts){
    init(); conditions = new Set(conditions || []);
    const uniq = [...new Set(keys)]; const sp = [];
    for(const k of uniq){ const s = speciesOf(k); if(!s) return { ok: false, reason: 'Unknown substance: ' + k }; sp.push(s); }
    if(!sp.length) return { ok: false, reason: 'Pick at least one substance.' };
    const amt = {}; if(amounts) sp.forEach(s => { if(amounts[s.key] > 0) amt[s.el || s.key] = amounts[s.key]; });
    // 'N2' and 'N' both mean nitrogen in its standard state: give the rules one spelling (the element) when several reagents are mixed, so the same reagents always get the same chemistry.
    const asEl = s => s.kind === 'compound' && Object.keys(s.comp).length === 1 && I.DIA.has(Object.keys(s.comp)[0]) && s.comp[Object.keys(s.comp)[0]] === 2;
    const sp0 = sp.slice(); if(sp.length > 1) sp.forEach((s, i) => { if(asEl(s)){ const e = Object.keys(s.comp)[0]; sp[i] = { key: e, kind: 'element', el: e, f: e, comp: { [e]: 1 }, apu: 1 }; } });
    let r; try{ r = rule(sp, amt); }catch(e){ r = null; }
    // An atom key of a diatomic element (N, H, O, F, Cl, Br, I) names the ELEMENT, whose standard state is X2. Rules may be written with the atom, but a reaction must
    // never be balanced against free atoms (ΔHf(N) = +473 kJ/mol would turn Haber into a −1170 kJ "atomic" reaction and make CH4 + 4 O 'combustion' absurdly exothermic).
    if(r && r.reacts) r.reacts = r.reacts.map(s => s.kind === 'element' && I.DIA.has(s.el) ? el2(s.el) : s);
    if(!r) return { ok: false, reason: sp.length === 1 ? 'This substance is stable on its own — try adding a second reagent, or heat/electrolysis if it decomposes.' : 'These substances don’t react under any conditions the engine knows.' };
    if(r.type === 'No reaction') return { ok: false, reason: r.note, type: r.type };
    if(r.notModelled) return { ok: false, reason: r.note, type: r.type, notModelled: true, obs: r.obs };
    const missing = r.needs.filter(n => !conditions.has(n));
    const coeffs = balance(r.reacts.map(s => s.comp), r.prods.map(s => s.comp));
    if(!coeffs) return { ok: false, reason: 'The engine found products but couldn’t balance the equation.' };
    const reactants = r.reacts.map((s, i) => ({ s, coeff: coeffs[i] })), products = r.prods.map((s, i) => ({ s, coeff: coeffs[r.reacts.length + i] }));
    const eq = fmtEquation(reactants, products);
    return { ok: missing.length === 0, type: r.type, note: r.note, obs: r.obs || '', Ea: r.Ea || 0, id: r.id || '', needs: r.needs, missing, reactants, products, equation: eq, reason: missing.length ? 'Needs ' + missing.map(condLabel).join(' + ') + '.' : '', key: eqKey(reactants, products) };
  }
  const condLabel = c => ({ heat: 'heat', spark: 'electric current', pressure: 'high pressure', catalyst: 'a catalyst', cryo: 'cryogenic cooling', distill: 'distillation', polymer: 'polymerisation' })[c] || c;
  const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const prettyFormula = f => f.replace(/(\d+)/g, (m) => sub(m));
  function fmtEquation(re, pr){
    const side = a => a.map(x => (x.coeff > 1 ? x.coeff + ' ' : '') + prettyFormula(x.s.f)).join(' + ');
    return side(re) + ' → ' + side(pr);
  }
  const eqKey = (re, pr) => re.map(x => x.s.f).sort().join('+') + '>' + pr.map(x => x.s.f).sort().join('+');
  // ---------------------------------------------------------------- public: plan (what a run consumes / produces)
  function plan(sol, inventory, wantBatches){
    if(!sol || !sol.reactants) return null;
    const need = sol.reactants.map(x => ({ key: x.s.key, kind: x.s.kind, perBatch: x.coeff * x.s.apu }));
    let max = Infinity; need.forEach(n => { max = Math.min(max, Math.floor(((inventory[n.key]) || 0) / n.perBatch)); });
    if(!isFinite(max)) max = 0;
    const batches = Math.max(0, Math.min(max, wantBatches == null ? max : wantBatches));
    const consume = {}, produce = {};
    need.forEach(n => { consume[n.key] = n.perBatch * batches; });
    sol.products.forEach(p => { produce[p.s.key] = (produce[p.s.key] || 0) + p.coeff * p.s.apu * batches; });
    return { maxBatches: max, batches, consume, produce, perBatchIn: need, perBatchOut: sol.products.map(p => ({ key: p.s.key, kind: p.s.kind, n: p.coeff * p.s.apu })) };
  }
  // ---------------------------------------------------------------- public: validate + formation ("make anything")
  const ORGANIC_ELS = new Set(['C', 'H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I']);
  function validate(formula){
    init(); const comp = parse(formula);
    if(!comp) return { ok: false, reason: 'That isn’t a valid formula. Use element symbols and numbers, e.g. Ca(OH)2.' };
    const els = Object.keys(comp), total = atoms(comp);
    if(total > 80) return { ok: false, reason: 'Too large — the reactor handles up to 80 atoms per molecule.' };
    if(els.length === 1) return { ok: false, reason: 'That is just an element — buy it in WestShop (or use a diatomic gas like O₂ directly).' };
    const reg = registry[compKey(comp)];
    if(reg) return { ok: true, comp, how: 'known', formula: reg.formula };
    if(ions(comp)) return { ok: true, comp, how: 'ionic', formula: buildFromIons(comp).formula };
    if(els.length === 2 && binaryCandidates(els[0], els[1]).some(c => compKey(c.comp) === compKey(comp))) return { ok: true, comp, how: 'binary', formula: buildFromIons(comp).formula || hill(comp) };
    if(els.every(e => ORGANIC_ELS.has(e)) && comp.C){
      const X = (comp.F || 0) + (comp.Cl || 0) + (comp.Br || 0) + (comp.I || 0), dou2 = 2 * comp.C + 2 + (comp.N || 0) + (comp.P || 0) - comp.H - X;
      if(dou2 >= 0 && dou2 % 2 === 0) return { ok: true, comp, how: 'organic', formula: hill(comp) };
      return { ok: false, reason: 'No stable bonding arrangement: the hydrogen/halogen count doesn’t satisfy carbon’s four bonds.' };
    }
    return { ok: false, reason: 'Those atoms can’t form a charge-balanced compound using their known oxidation states.' };
  }
  function formation(formula){
    const v = validate(formula); if(!v.ok) return v; const sp = speciesFromComp(v.comp);
    const els = Object.keys(v.comp), reacts = els.map(e => el2(e));
    const coeffs = balance(reacts.map(s => s.comp), [sp.comp]); if(!coeffs) return { ok: false, reason: 'Couldn’t balance this formation reaction.' };
    const reactants = reacts.map((s, i) => ({ s, coeff: coeffs[i] })), products = [{ s: sp, coeff: coeffs[coeffs.length - 1] }];
    const needs = []; const tot = atoms(v.comp);
    const spontaneous = els.length === 2 && els.some(isHalogen) && els.some(e => isMetal(e) || e === 'H');
    if(!spontaneous) needs.push('heat');
    if(v.how === 'organic'){ needs.push('catalyst'); if(tot > 20) needs.push('pressure'); }
    if(compKey(v.comp) === compKey({ N: 1, H: 3 })){ needs.splice(0, needs.length, 'pressure', 'catalyst', 'heat'); }
    if(tot > 30 && !needs.includes('pressure')) needs.push('pressure');
    return { ok: true, type: 'Direct synthesis from elements', how: v.how, needs, reactants, products, equation: fmtEquation(reactants, products), key: eqKey(reactants, products), target: sp };
  }

  // ---------------------------------------------------------------- public: form (atom / molecule / metal / noble gas / compound + phase at 298 K)
  function form(key){
    init(); const sp = speciesOf(key); if(!sp) return null; const T = typeof THERMO !== 'undefined' ? THERMO : {}, comp = sp.comp, els = Object.keys(comp), e = els[0];
    const PH = { g: 'gas', l: 'liquid', s: 'solid' }, ph = f => PH[(T[f] || [])[0]] || '';
    if(els.length === 1){ const n = comp[e], cat = (EL[e] || {}).cat || '';
      if(n === 1 && I.DIA.has(e)) return { cls: 'atom', label: 'free atom (radical)', phase: 'gas', dHat: (T[e] || [])[1], warn: 'Free ' + e + ' atoms only exist in plasma or UV light. They have no bond to give back: pairing up into ' + e + '2 releases the full bond energy, with no barrier.' };
      if(n > 1) return { cls: 'molecule', label: n === 2 ? 'diatomic molecule' : n + '-atom molecule', phase: ph(sp.f) };
      const noble = /noble/.test(cat), metal = isMetal(e), semi = /metalloid/.test(cat);
      return { cls: noble ? 'noble' : metal ? 'metal' : semi ? 'metalloid' : 'nonmetal', label: noble ? 'noble gas (monatomic)' : metal ? 'metal (metallic lattice)' : semi ? 'metalloid (network solid)' : 'nonmetal', phase: ph(e) };
    }
    const d = ions(comp), ionic = !!(d && d.cation && (isMetal(d.cation.f) || d.cation.f === 'NH4'));
    return { cls: 'compound', label: ionic ? 'ionic compound (crystal lattice)' : 'covalent compound', phase: ph(sp.f) };
  }
  // ---------------------------------------------------------------- public: values
  function price(sym){ init(); return I.PRICES[sym] || 0; }
  function valueOf(key){                                      // list value of one unit (1 mol) of an inventory item
    init(); const sp = speciesOf(key); if(!sp) return 0;
    if(sp.kind === 'element') return price(sp.el);
    const comp = sp.comp; let base = 0; Object.keys(comp).forEach(e => { base += price(e) * comp[e]; });
    const rec = I.RECIPES.find(r => r.formula === sp.f);
    const tier = rec ? Math.max(0, I.TOOLS.findIndex(t => t.id === rec.tool)) : Math.min(5, Math.floor(atoms(comp) / 8));
    const bonus = (I.CBB || 1.15) + (I.CTB || 0.06) * tier + 0.01 * (Object.keys(comp).length - 1);
    return Math.round(base * bonus * 100) / 100;
  }
  const registryList = () => { init(); return Object.keys(registry).map(k => registry[k]); };
  return { init, parse, hill, compKey, balance, ions, build, nameOf, describe, classify, solve, plan, validate, formation, valueOf, price, speciesOf, form, massOf, atoms, prettyFormula, condLabel, registryList, isMetal, fmtEquation, eqKey, candidates: (a, b) => { init(); return binaryCandidates(a, b); }, get elements(){ init(); return EL; } };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = Chem;
