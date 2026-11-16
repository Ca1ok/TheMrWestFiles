/* SynthCore — molecular graphs for WestLab's synthesis engine. Pure functions, no DOM, no network, deterministic.
 *   parse(smiles)    SMILES -> {a:[{e,ch,ar,fx,h}], b:[[i,j,order]]}   (order 1, 2, 3, 1.5 = aromatic). Stereo marks are ignored (flat chemistry).
 *   canon(mol)       canonical SMILES (same molecule -> same string, whatever the atom order) — the identity of a compound
 *   comp / hill      composition + Hill formula (hydrogens included)      mass(mol)  molar mass
 *   valid(mol)       every atom within its valence (metals are free)      split / merge / clone / edit helpers for reaction templates
 *   kekule(mol)      integer bond orders for drawing aromatic rings       keyOf / molOf  inventory key <-> structure ("S:" + safe-encoded SMILES)
 * Hydrogens are implicit and recomputed from valence after every edit (norm), except on bracket atoms ([nH], [NH4+], [BH4-]) whose H count is fixed (fx). */
const SynthCore = (function(){
  'use strict';
  const ORG = { H: [1], B: [3], C: [4], N: [3, 5], O: [2], F: [1], Si: [4], P: [3, 5], S: [2, 4, 6], Cl: [1], Ge: [4], As: [3, 5], Se: [2, 4, 6], Br: [1], I: [1, 3, 5], Te: [2, 4, 6] };
  const AROM = new Set(['C', 'N', 'O', 'S', 'P', 'Se']), PI = { C: 1, N: 1, P: 1, B: 1 };               // atoms that may be aromatic; atoms that donate one pi bond-slot
  const SUBSET = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I']);
  const GROUP = { C: 'a', Si: 'a', Ge: 'a', B: 'b', N: 'c', P: 'c', As: 'c', O: 'c', S: 'c', Se: 'c', Te: 'c', F: 'c', Cl: 'c', Br: 'c', I: 'c', H: 'c' };
  const METAL = e => !ORG[e];
  const mk = (e, ch, ar, fx, h) => ({ e, ch: ch || 0, ar: !!ar, fx: !!fx, h: h || 0 });

  /* ---------------------------------------------------------------- parse */
  function parseBracket(t){
    const m = /^(\d+)?(Cl|Br|Si|Se|As|Te|Ge|[A-Z][a-z]?|se|as|[cnops])(@{0,2})(H\d*)?((?:\+\d*|-\d*|\++|-+)?)(:\d+)?$/.exec(t); if(!m) return null;
    let e = m[2], ar = false; if(/^[a-z]/.test(e)){ ar = true; e = e[0].toUpperCase() + e.slice(1); }
    let ch = 0; if(m[5]){ const s = m[5]; if(/^[+-]\d+$/.test(s)) ch = (s[0] === '+' ? 1 : -1) * parseInt(s.slice(1), 10); else ch = (s[0] === '+' ? 1 : -1) * s.length; }
    const h = m[4] ? (m[4].length > 1 ? parseInt(m[4].slice(1), 10) : 1) : 0;
    return mk(e, ch, ar, true, h);
  }
  function parse(s){
    if(typeof s !== 'string' || !s || s.length > 400) return null;
    const a = [], b = [], rings = {}, stack = []; let i = 0, prev = -1, pb = 0;
    const link = (p, q, o) => { if(p === q) return false; if(!o) o = (a[p].ar && a[q].ar) ? 1.5 : 1; if(b.some(x => (x[0] === p && x[1] === q) || (x[0] === q && x[1] === p))) return false; b.push([p, q, o]); return true; };
    while(i < s.length){
      const c = s[i];
      if(c === '('){ if(prev < 0) return null; stack.push(prev); i++; continue; }
      if(c === ')'){ if(!stack.length) return null; prev = stack.pop(); i++; continue; }
      if(c === '.'){ prev = -1; pb = 0; i++; continue; }
      if(c === '-'){ pb = 1; i++; continue; } if(c === '='){ pb = 2; i++; continue; } if(c === '#'){ pb = 3; i++; continue; } if(c === ':'){ pb = 1.5; i++; continue; }
      if(c === '/' || c === '\\'){ i++; continue; }
      if(/[0-9%]/.test(c)){
        let k; if(c === '%'){ k = s.slice(i + 1, i + 3); i += 3; } else { k = c; i++; } if(prev < 0) return null;
        if(rings[k] !== undefined){ const r = rings[k]; delete rings[k]; if(!link(r[0], prev, pb || r[1])) return null; pb = 0; } else { rings[k] = [prev, pb]; pb = 0; } continue;
      }
      let at;
      if(c === '['){ const j = s.indexOf(']', i); if(j < 0) return null; at = parseBracket(s.slice(i + 1, j)); i = j + 1; }
      else { const m = /^(Cl|Br|[BCNOPSFI]|[cnops])/.exec(s.slice(i)); if(!m) return null; i += m[0].length; let e = m[0], ar = false; if(/^[a-z]/.test(e)){ ar = true; e = e.toUpperCase(); } at = mk(e, 0, ar, false, 0); }
      if(!at) return null; a.push(at); const idx = a.length - 1;
      if(prev >= 0){ if(!link(prev, idx, pb)) return null; } pb = 0; prev = idx;
    }
    if(Object.keys(rings).length || stack.length) return null;
    const m = { a, b }; norm(m); return m;
  }

  /* ---------------------------------------------------------------- valence / hydrogens */
  function adjOf(m){ const adj = m.a.map(() => []); m.b.forEach(([i, j, o]) => { adj[i].push([j, o]); adj[j].push([i, o]); }); return adj; }
  function valList(e, ch){ const base = ORG[e]; if(!base) return null; const g = GROUP[e]; return base.map(v => g === 'a' ? v - Math.abs(ch) : g === 'b' ? v - ch : v + ch).filter(v => v >= 0); }
  function usedOf(m, adj, i){ const at = m.a[i]; let u = 0, nar = 0; adj[i].forEach(([j, o]) => { if(o === 1.5) nar++; else u += o; }); if(nar) u += nar + (at.ar && PI[at.e] && !at.fx ? 1 : 0); return u; }
  function norm(m){                                                  // recompute implicit hydrogens of every non-bracket atom
    const adj = adjOf(m); m.a.forEach((at, i) => {
      if(at.fx) return; const vl = valList(at.e, at.ch); if(!vl){ at.h = 0; return; }
      const u = usedOf(m, adj, i), v = vl.find(x => x >= u); at.h = v === undefined ? 0 : v - u;
    }); return m;
  }
  function valid(m){
    if(!m || !m.a.length) return false; const adj = adjOf(m);
    for(let i = 0; i < m.a.length; i++){
      const at = m.a[i], vl = valList(at.e, at.ch); if(!vl) continue; const u = usedOf(m, adj, i) + at.h; if(!vl.some(v => v === u) && !(at.fx && vl.some(v => u <= v) && at.e !== 'C')) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- canonical SMILES */
  function ranks(strs){ const u = Array.from(new Set(strs)).sort(), ix = {}; u.forEach((s, i) => { ix[s] = i; }); return strs.map(s => ix[s]); }
  function canonRanks(m, adj){
    const n = m.a.length; let cls = ranks(m.a.map((at, i) => [adj[i].length, at.e, at.ch, at.ar ? 1 : 0, at.h].join('|')));
    const refine = () => { let k = new Set(cls).size; for(;;){ const sig = cls.map((c, i) => String(c).padStart(5, '0') + ':' + adj[i].map(([j, o]) => o + '-' + String(cls[j]).padStart(5, '0')).sort().join(',')); const nx = ranks(sig), k2 = new Set(nx).size; cls = nx; if(k2 === k) break; k = k2; } };
    refine();
    while(new Set(cls).size < n){
      const cnt = {}; cls.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; }); const tie = Math.min(...Object.keys(cnt).filter(c => cnt[c] > 1).map(Number));
      const pick = cls.findIndex(c => c === tie); cls = cls.map(c => c * 2 + 1); cls[pick] -= 1; cls = ranks(cls.map(c => String(c).padStart(8, '0'))); refine();
    }
    return cls;
  }
  function atomTok(at){
    const sym = at.ar ? at.e.toLowerCase() : at.e;
    if(!at.fx && at.ch === 0 && SUBSET.has(at.e)) return sym;
    if(!at.fx && at.ch === 0 && !ORG[at.e]) return '[' + at.e + ']';
    return '[' + sym + (at.h ? 'H' + (at.h > 1 ? at.h : '') : '') + (at.ch ? (at.ch > 0 ? '+' : '-') + (Math.abs(at.ch) > 1 ? Math.abs(at.ch) : '') : '') + ']';
  }
  function canon(m){
    const n = m.a.length; if(!n) return ''; const adj = adjOf(m), rk = canonRanks(m, adj), seen = new Array(n).fill(false), parts = [];
    const order = m.a.map((_, i) => i).sort((x, y) => rk[x] - rk[y]);
    for(const root of order){
      if(seen[root]) continue;
      const idx = new Array(n).fill(-1), kids = {}, closure = [], done = new Set(); let t = 0;
      (function dfs(u, p){
        seen[u] = true; idx[u] = t++; kids[u] = [];
        adj[u].slice().sort((x, y) => rk[x[0]] - rk[y[0]] || x[1] - y[1]).forEach(([v, o]) => {
          const key = Math.min(u, v) + '-' + Math.max(u, v); if(v === p && !done.has('p' + key)){ done.add('p' + key); return; }
          if(done.has(key)) return; done.add(key);
          if(idx[v] >= 0 && seen[v]){ closure.push([v, u, o]); } else { kids[u].push([v, o]); dfs(v, u); }
        });
      })(root, -1);
      // closure: [ancestor, descendant, order]; ring digit opens at the ancestor and closes at the descendant
      const opens = {}, closes = {}; closure.forEach(([x, y, o]) => { (opens[x] = opens[x] || []).push([y, o]); (closes[y] = closes[y] || []).push([x, o]); });
      const digit = {}, free = []; let nextD = 1;
      const bondSym = (u, v, o) => o === 2 ? '=' : o === 3 ? '#' : o === 1 && m.a[u].ar && m.a[v].ar ? '-' : '';
      const write = u => {
        let s = atomTok(m.a[u]);
        (closes[u] || []).slice().sort((p, q) => digit[p[0] + '>' + u] - digit[q[0] + '>' + u]).forEach(([x]) => { const d = digit[x + '>' + u]; s += d > 9 ? '%' + d : d; free.push(d); free.sort((p, q) => p - q); });
        (opens[u] || []).slice().sort((p, q) => rk[p[0]] - rk[q[0]]).forEach(([y, o]) => { const d = free.length ? free.shift() : nextD++; digit[u + '>' + y] = d; s += bondSym(u, y, o) + (d > 9 ? '%' + d : d); });
        const k = kids[u]; k.forEach(([v, o], i) => { const sub = bondSym(u, v, o) + write(v); s += i < k.length - 1 ? '(' + sub + ')' : sub; });
        return s;
      };
      parts.push(write(root));
    }
    return parts.sort((x, y) => x.length - y.length || (x < y ? -1 : x > y ? 1 : 0)).join('.');
  }

  /* ---------------------------------------------------------------- composition, mass */
  function comp(m){ const c = {}; m.a.forEach(at => { c[at.e] = (c[at.e] || 0) + 1; if(at.h) c.H = (c.H || 0) + at.h; }); return c; }
  function hillStr(c){ const els = Object.keys(c).filter(e => c[e] > 0), hasC = !!c.C; els.sort((x, y) => hasC ? ((x === 'C' ? -2 : x === 'H' ? -1 : 0) - (y === 'C' ? -2 : y === 'H' ? -1 : 0)) || (x < y ? -1 : 1) : (x < y ? -1 : 1)); return els.map(e => e + (c[e] > 1 ? c[e] : '')).join(''); }
  const hill = m => hillStr(comp(m));
  function massOfComp(c){ const T = typeof ELEMENTS !== 'undefined' ? ELEMENTS : [], mm = {}; T.forEach(e => { mm[e[1]] = e[3]; }); let s = 0; Object.keys(c).forEach(e => { s += (mm[e] || 0) * c[e]; }); return s; }
  const mass = m => massOfComp(comp(m));
  const addComp = (x, y, k) => { const r = Object.assign({}, x); Object.keys(y).forEach(e => { r[e] = (r[e] || 0) + y[e] * (k === undefined ? 1 : k); if(!r[e]) delete r[e]; }); return r; };
  const charge = m => m.a.reduce((s, at) => s + at.ch, 0);

  /* ---------------------------------------------------------------- editing helpers (templates build products by editing copies) */
  const clone = m => ({ a: m.a.map(x => Object.assign({}, x)), b: m.b.map(x => x.slice()) });
  function addAtom(m, e, ch, ar){ m.a.push(mk(e, ch || 0, ar, false, 0)); return m.a.length - 1; }
  function addFixed(m, e, ch, h){ m.a.push(mk(e, ch || 0, false, true, h || 0)); return m.a.length - 1; }
  const hasBond = (m, i, j) => m.b.findIndex(x => (x[0] === i && x[1] === j) || (x[0] === j && x[1] === i));
  function bond(m, i, j, o){ const k = hasBond(m, i, j); if(k >= 0) m.b[k][2] = o || 1; else m.b.push([i, j, o || 1]); return m; }
  function unbond(m, i, j){ const k = hasBond(m, i, j); if(k >= 0) m.b.splice(k, 1); return m; }
  const orderOf = (m, i, j) => { const k = hasBond(m, i, j); return k < 0 ? 0 : m.b[k][2]; };
  function removeAtoms(m, set){                                       // returns a new molecule without the listed atoms
    const keep = []; const map = {}; m.a.forEach((at, i) => { if(!set.has(i)){ map[i] = keep.length; keep.push(Object.assign({}, at)); } });
    return { a: keep, b: m.b.filter(x => !set.has(x[0]) && !set.has(x[1])).map(x => [map[x[0]], map[x[1]], x[2]]) };
  }
  function components(m){                                             // connected components as arrays of atom indices
    const adj = adjOf(m), seen = new Array(m.a.length).fill(false), out = [];
    m.a.forEach((_, s) => { if(seen[s]) return; const st = [s], comp = []; seen[s] = true; while(st.length){ const u = st.pop(); comp.push(u); adj[u].forEach(([v]) => { if(!seen[v]){ seen[v] = true; st.push(v); } }); } out.push(comp.sort((x, y) => x - y)); });
    return out;
  }
  function split(m){                                                  // one molecule per connected component (fragments of a salt, say)
    return components(m).map(c => { const set = new Set(c), map = {}; const a = c.map((i, k) => { map[i] = k; return Object.assign({}, m.a[i]); }); return { a, b: m.b.filter(x => set.has(x[0])).map(x => [map[x[0]], map[x[1]], x[2]]) }; });
  }
  function merge(x, y){ const o = x.a.length; return { a: x.a.map(q => Object.assign({}, q)).concat(y.a.map(q => Object.assign({}, q))), b: x.b.map(q => q.slice()).concat(y.b.map(q => [q[0] + o, q[1] + o, q[2]])) }; }
  const heavyNbrs = (adj, i) => adj[i].map(q => q[0]);
  const isC = (m, i) => m.a[i].e === 'C';

  /* ---------------------------------------------------------------- kekulé form for drawing */
  function kekule(m){
    const bonds = m.b.map(x => x.slice()), adj = adjOf(m), pi = m.a.map((at, i) => at.ar && PI[at.e] && !at.fx && adj[i].some(q => q[1] === 1.5) && !(at.e === 'N' && adj[i].length + at.h > 2 && adj[i].filter(q => q[1] === 1.5).length === 2 && at.h > 0));
    const edges = bonds.map((b, k) => ({ k, i: b[0], j: b[1] })).filter(e => bonds[e.k][2] === 1.5 && pi[e.i] && pi[e.j]), match = new Array(m.a.length).fill(-1);
    const verts = m.a.map((_, i) => i).filter(i => pi[i]);
    (function go(pos){ if(pos === verts.length) return true; const u = verts[pos]; if(match[u] >= 0) return go(pos + 1);
      for(const e of edges){ const v = e.i === u ? e.j : e.j === u ? e.i : -1; if(v < 0 || match[v] >= 0) continue; match[u] = v; match[v] = u; if(go(pos + 1)) return true; match[u] = -1; match[v] = -1; }
      return false; })(0);
    bonds.forEach(b => { if(b[2] === 1.5) b[2] = (match[b[0]] === b[1]) ? 2 : 1; });
    return bonds;
  }

  /* ---------------------------------------------------------------- inventory keys: "S:" + canonical SMILES with Firebase-unsafe characters escaped */
  const ESC = { '~': '~~', '[': '~l', ']': '~r', '#': '~t', '/': '~s', '.': '~d', '\\': '~b', '$': '~x' };
  const UNESC = { '~': '~', l: '[', r: ']', t: '#', s: '/', d: '.', b: '\\', x: '$' };
  const encKey = smi => 'S:' + smi.replace(/[~\[\]#\/.\\$]/g, c => ESC[c]);
  const decKey = key => key.slice(2).replace(/~(.)/g, (_, c) => UNESC[c] || '');
  const isSKey = k => typeof k === 'string' && k.length > 2 && k.charCodeAt(0) === 83 && k[1] === ':';

  return { parse, canon, comp, hill, hillStr, mass, massOfComp, addComp, charge, valid, norm, adjOf, clone, addAtom, addFixed, bond, unbond, hasBond, orderOf, removeAtoms, components, split, merge, kekule, encKey, decKey, isSKey, METAL, ORG, valList, usedOf, heavyNbrs, isC, mk };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = SynthCore;
