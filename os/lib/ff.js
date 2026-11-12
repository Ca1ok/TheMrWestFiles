/* WestFF — the WestLab structure pipeline. Runs entirely on the player's own computer (no server, no Firebase, no quantum chemistry).
 *
 *  PHASE 1  PubChem ingestion      resolve(name | CID | formula)  →  { cid, name, iupac, formula, mw, charge, smiles (isomeric), smc (connectivity) }
 *  PHASE 2  empirical force field  build(meta)  →  3-D conformers (torsion-driven conformer search) → MMFF94 minimisation (OpenChemLib, a port of the
 *                                  published MMFF94 parameter set; energies agree with RDKit's MMFF94 to < 0.01 kcal/mol on rigid molecules) →
 *                                  total potential energy, Gasteiger–Marsili partial charges, bond-type list, interatomic distance matrix.
 *  PHASE 3  persistence            lookup(hill) = shared library on GitHub (lab-cache/ff/<shard>.json) → this device (IndexedDB) → compute here.
 *                                  New records are handed to WestFFSync (os/lib/ff-sync.js), which batches them into ONE commit per shard when a maintainer
 *                                  token is configured. The Python twin tools/westlab_pipeline.py writes exactly the same schema (RDKit ETKDG + MMFF94/UFF).
 *
 * Record (schema v1; lengths in Å, energy in kcal/mol):
 *  { v, cid, hill, n, iupac, smi, smc, mw, chg, tier:'ff'|'embed'|'atom', ff:'MMFF94'|'UFF'|null, E, conv, nconf,
 *    a:[element], b:[[i,j,t]]  (t = 1 | 2 | 3 | 1.5 aromatic),  q:[Gasteiger charge], qm, fc?:[[atom,formal charge]], qp?:[MMFF94 charge],
 *    xyz:[[x,y,z]], D:[condensed upper-triangle distances in 0.01 Å, −1 = not computed],  dev (largest heavy-bond miss vs the empirical expectation, Å), warn?:1,
 *    ion?:1, fr?:[fragment index per atom], eng, src, t }
 * Honest limits: MMFF94 energy is a conformational-strain number — only comparable between conformers of the SAME molecule, never between different
 * molecules, and it is not a heat of formation (the tabulated thermodynamics in phys.js stay the reference for reactions). Atoms MMFF94 has no types for
 * (most metals, noble gases, H2/HCl…) get tier 'embed' (empirical bond-length geometry, no energy). Ionic compounds are minimised ion by ion; distances
 * between different ions are not computed (a lattice is not a molecule).
 */
const WestFF = (function(){
  'use strict';
  const OCL_VER = '9.25.2', CDN = 'https://cdn.jsdelivr.net/npm/openchemlib@' + OCL_VER + '/dist/', PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
  const SYM = 'X H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn'.split(' ');
  const cfg = { base: 'lab-cache/ff/', nconf: 0, maxAtoms: 72, seed: 42 };   // nconf 0 = automatic: 24 conformers for ≤ 24 atoms, 12 up to 48, else 6
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function fnv(s){ let h = 0x811c9dc5; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  const shardOf = hill => fnv(hill).slice(0, 2);
  function hillOf(els){
    const c = {}; els.forEach(e => c[e] = (c[e] || 0) + 1); const k = Object.keys(c), order = c.C ? ['C', 'H'].filter(x => c[x]).concat(k.filter(x => x !== 'C' && x !== 'H').sort()) : k.sort();
    return order.map(x => x + (c[x] > 1 ? c[x] : '')).join('');
  }

  /* ============================== OpenChemLib (loaded once, on demand) ============================== */
  let OCLp = null;
  function use(O){ OCLp = Promise.resolve(O); }                           // lets Node tests inject the library
  function engine(){
    if(!OCLp) OCLp = (async () => { const m = await import(CDN + 'openchemlib.js'), O = m.default || m; await O.Resources.registerFromUrl(CDN + 'resources.json'); return O; })();
    return OCLp;
  }

  /* ============================== PHASE 1 — PubChem ============================== */
  let lastCall = 0;
  async function jget(u, tries){                                           // ≤ 4 requests/second (PubChem allows 5); backs off when the server is busy
    for(let k = 0; k < (tries || 3); k++){
      const wait = Math.max(0, lastCall + 260 - Date.now()); lastCall = Date.now() + wait; if(wait) await sleep(wait);
      const c = typeof AbortController !== 'undefined' ? new AbortController() : null, t = c && setTimeout(() => c.abort(), 12000);
      try{ const r = await fetch(u, c ? { signal: c.signal } : {}); if(r.status === 404) return null; if(r.status === 503 || r.status === 429){ await sleep(1200 * (k + 1)); continue; } return r.ok ? await r.json() : null; }
      catch(e){ await sleep(500); } finally{ t && clearTimeout(t); }
    }
    return null;
  }
  const PROPS_NEW = 'Title,IUPACName,MolecularFormula,MolecularWeight,Charge,SMILES,ConnectivitySMILES', PROPS_OLD = 'Title,IUPACName,MolecularFormula,MolecularWeight,Charge,IsomericSMILES,CanonicalSMILES';
  const norm = p => ({ cid: +p.CID, name: p.Title || '', iupac: p.IUPACName || '', formula: p.MolecularFormula || '', mw: +p.MolecularWeight || 0, charge: +p.Charge || 0,
    smiles: p.SMILES || p.IsomericSMILES || p.ConnectivitySMILES || p.CanonicalSMILES || '', smc: p.ConnectivitySMILES || p.CanonicalSMILES || p.SMILES || p.IsomericSMILES || '' });
  async function props(cids){                                              // one batched call for up to 10 CIDs; PubChem renamed the SMILES fields in 2023 — both spellings are tried
    for(const names of [PROPS_NEW, PROPS_OLD]){ const j = await jget(PUG + '/compound/cid/' + cids.join(',') + '/property/' + names + '/JSON'), p = j && j.PropertyTable && j.PropertyTable.Properties; if(p && p.length) return p.map(norm); }
    return [];
  }
  async function cidsOf(url){
    let j = await jget(url), ids = j && j.IdentifierList && j.IdentifierList.CID;
    if(!ids && j && j.Waiting){ for(let i = 0; i < 6 && !ids; i++){ await sleep(1200); const p = await jget(PUG + '/compound/listkey/' + j.Waiting.ListKey + '/cids/JSON?MaxRecords=10'); ids = p && p.IdentifierList && p.IdentifierList.CID; } }
    return ids || [];
  }
  /* input: 'Caffeine' | 2519 | '2519' | 'C8H10N4O2' | { cid } | { name } | { hill } */
  async function resolve(input){
    let x = input; if(typeof x === 'number' || (typeof x === 'string' && /^\d+$/.test(x.trim()))) x = { cid: +x };
    if(typeof x === 'string'){ const s = x.trim(); x = /^([A-Z][a-z]?\d*)+$/.test(s) && /\d|^[A-Z][a-z]?$/.test(s) ? { hill: s } : { name: s }; }
    let ids = [], hill = x.hill || '';
    if(x.cid) ids = [x.cid];
    else if(x.name) ids = (await cidsOf(PUG + '/compound/name/' + encodeURIComponent(x.name) + '/cids/JSON')).slice(0, 1);
    else if(hill) ids = await cidsOf(PUG + '/compound/fastformula/' + encodeURIComponent(hill) + '/cids/JSON?MaxRecords=10');
    if(!ids.length) return null;
    const ps = await props(ids.slice(0, 10)); if(!ps.length) return null;
    const ok = ps.filter(p => p.smiles && (!hill || (p.formula === hill && p.charge === 0))).sort((a, b) => a.cid - b.cid);   // lowest CID = the best-known isomer
    return ok.length ? Object.assign(ok[0], { src: 'pubchem' }) : null;
  }

  /* ============================== PHASE 2 — force field ============================== */
  /* Gasteiger–Marsili partial equalisation of orbital electronegativity (12 damped iterations, same parameter set and iteration scheme as RDKit). */
  const GP = { H: [7.17, 6.24, -0.56], C3: [7.98, 9.18, 1.88], C2: [8.79, 9.32, 1.51], C1: [10.39, 9.45, 0.73], N3: [11.54, 10.82, 1.36], N2: [12.87, 11.15, 0.85], N1: [15.68, 11.70, -0.27], O3: [14.18, 12.92, 1.39], O2: [17.07, 13.79, 0.47],
    F: [14.66, 13.85, 2.31], Cl: [11.00, 9.69, 1.35], Br: [10.08, 8.47, 1.16], I: [9.90, 7.96, 0.96], S3: [10.14, 9.13, 1.38], S2: [10.88, 9.49, 1.33], P3: [8.90, 8.24, 0.96] };
  function gasteiger(a, b, formal){
    const n = a.length, nb = Array.from({ length: n }, () => []), dbl = Array(n).fill(0), tri = Array(n).fill(0), aro = Array(n).fill(false);
    b.forEach(([i, j, t]) => { nb[i].push(j); nb[j].push(i); [i, j].forEach(k => { if(t === 1.5) aro[k] = true; else if(t === 2) dbl[k]++; else if(t === 3) tri[k]++; }); });
    const multi = i => aro[i] || dbl[i] > 0 || tri[i] > 0, conjNb = i => nb[i].some(j => multi(j) && a[j] !== 'S' && a[j] !== 'P');   // lone-pair donors conjugate with C/N π systems, not with hypervalent S/P
    const par = a.map((e, i) => {
      if(e === 'H') return GP.H; if(GP[e]) return GP[e];
      if(e === 'C') return (tri[i] || (dbl[i] > 1 && nb[i].length <= 2)) ? GP.C1 : (multi(i) ? GP.C2 : GP.C3);
      if(e === 'N') return (tri[i] || (dbl[i] > 1 && nb[i].length <= 2)) ? GP.N1 : (multi(i) || conjNb(i)) ? GP.N2 : GP.N3;
      if(e === 'O') return (multi(i) || conjNb(i)) ? GP.O2 : GP.O3;
      if(e === 'S') return (aro[i] || (dbl[i] && nb[i].length === 1)) ? GP.S2 : GP.S3;
      if(e === 'P') return GP.P3; return null;
    });
    const q = formal.slice();
    for(let i = 0; i < n; i++){                                            // a formal charge shared by equivalent atoms across a π system (carboxylate, nitro…) is split evenly first — as RDKit does
      if(!formal[i] || q[i] !== formal[i]) continue; const grp = [i];
      nb[i].forEach(k => nb[k].forEach(m => { if(m !== i && a[m] === a[i] && !grp.includes(m) && multi(k) && a[k] !== 'S' && a[k] !== 'P') grp.push(m); }));
      if(grp.length > 1){ const tot = grp.reduce((s, m) => s + formal[m], 0); grp.forEach(m => { q[m] = tot / grp.length; }); }
    }
    const ion = par.map((p, i) => p ? (a[i] === 'H' ? 20.02 : p[0] + p[1] + p[2]) : 1); let damp = .5;
    for(let it = 0; it < 12; it++){
      const chi = par.map((p, i) => p ? p[0] + p[1] * q[i] + p[2] * q[i] * q[i] : 0), dq = Array(n).fill(0);
      b.forEach(([i, j]) => { if(!par[i] || !par[j]) return; const d = chi[j] - chi[i]; if(d > 0){ const t = d / ion[i]; dq[i] += t; dq[j] -= t; } else if(d < 0){ const t = -d / ion[j]; dq[j] += t; dq[i] -= t; } });
      for(let i = 0; i < n; i++) q[i] += damp * dq[i]; damp *= .5;
    }
    return { q: q.map(v => +v.toFixed(4)), partial: par.some(p => !p) };
  }

  const tick = () => new Promise(r => setTimeout(r, 0));
  function jitter(m, s){ for(let i = 0; i < m.getAllAtoms(); i++){ m.setAtomX(i, m.getAtomX(i) + (Math.random() - .5) * s); m.setAtomY(i, m.getAtomY(i) + (Math.random() - .5) * s); m.setAtomZ(i, m.getAtomZ(i) + (Math.random() - .5) * s); } }
  function minimise(O, m){                                                 // → { E, conv } or null when MMFF94 has no atom types for this molecule
    let E = NaN, rc = 1;
    for(let k = 0; k < 4 && rc !== 0; k++){
      if(k) jitter(m, .05 * k);                                            // linear molecules (CO2, HCN…) can stall exactly on the symmetric ridge
      let ff; try{ ff = new O.ForceFieldMMFF94(m, 'MMFF94'); }catch(e){ return null; }
      rc = ff.minimise({ maxIts: 6000 }); E = ff.getTotalEnergy();
    }
    return isFinite(E) ? { E, conv: rc === 0 ? 1 : 0 } : null;
  }
  function grab(O, m){                                                     // copy a minimised OpenChemLib molecule into plain arrays
    m.ensureHelperArrays(O.Molecule.cHelperRings);
    const n = m.getAllAtoms(), a = [], q = [], xyz = [], b = [];
    for(let i = 0; i < n; i++){ a.push(SYM[m.getAtomicNo(i)] || 'X'); q.push(m.getAtomCharge(i)); xyz.push([m.getAtomX(i), m.getAtomY(i), m.getAtomZ(i)]); }
    for(let k = 0; k < m.getAllBonds(); k++) b.push([m.getBondAtom(0, k), m.getBondAtom(1, k), m.isAromaticBond(k) ? 1.5 : Math.max(1, Math.min(3, m.getBondOrder(k)))]);
    return { a, q, xyz, b };
  }
  /* Basin hopping on top of the conformer ensemble: twist one rotatable bond at random, re-minimise with MMFF94, keep it only if the energy drops.
     This finds intramolecular hydrogen-bonded minima that a clash-free torsion search never visits (glycine, amino alcohols…). */
  async function hop(O, m, E0, ms){
    const n = m.getAllAtoms(), nb = Array.from({ length: n }, () => []), rot = [], t0 = Date.now();
    for(let k = 0; k < m.getAllBonds(); k++){ const i = m.getBondAtom(0, k), j = m.getBondAtom(1, k); nb[i].push(j); nb[j].push(i); }
    const sideOf = (i, j) => { const seen = new Set([j]), st = [j]; while(st.length){ const x = st.pop(); for(const y of nb[x]){ if(x === j && y === i) continue; if(y === i) return null; if(!seen.has(y)){ seen.add(y); st.push(y); } } } return [...seen]; };
    for(let k = 0; k < m.getAllBonds(); k++){
      if(m.isAromaticBond(k) || m.getBondOrder(k) !== 1) continue; let i = m.getBondAtom(0, k), j = m.getBondAtom(1, k); if(nb[i].length < 2 || nb[j].length < 2) continue;
      let sd = sideOf(i, j); if(!sd) continue; const alt = sideOf(j, i); if(alt && alt.length < sd.length){ [i, j] = [j, i]; sd = alt; }
      if(sd.filter(x => m.getAtomicNo(x) === 1).length >= 3 && sd.length <= 4) continue;       // spinning a CH3 / NH3+ changes nothing
      rot.push([i, j, sd]);
    }
    if(!rot.length) return { m, E: E0 };
    let best = m, bE = E0; const steps = Math.min(40, 12 + 4 * rot.length);
    for(let s = 0; s < steps && Date.now() - t0 < ms; s++){
      const c = best.getCompactCopy(), [i, j, sd] = rot[Math.floor(Math.random() * rot.length)], ang = (1 + Math.random() * 4) * Math.PI / 3;
      const ax = [c.getAtomX(j) - c.getAtomX(i), c.getAtomY(j) - c.getAtomY(i), c.getAtomZ(j) - c.getAtomZ(i)], L = Math.hypot(...ax) || 1, u = ax.map(v => v / L), cs = Math.cos(ang), sn = Math.sin(ang);
      sd.forEach(x => { const p = [c.getAtomX(x) - c.getAtomX(j), c.getAtomY(x) - c.getAtomY(j), c.getAtomZ(x) - c.getAtomZ(j)], d = u[0] * p[0] + u[1] * p[1] + u[2] * p[2], cr = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
        const r = [0, 1, 2].map(k => p[k] * cs + cr[k] * sn + u[k] * d * (1 - cs)); c.setAtomX(x, c.getAtomX(j) + r[0]); c.setAtomY(x, c.getAtomY(j) + r[1]); c.setAtomZ(x, c.getAtomZ(j) + r[2]); });
      const r = minimise(O, c); if(r && r.conv && r.E < bE - 1e-4){ best = c; bE = r.E; } if(s % 4 === 3) await tick();
    }
    return { m: best, E: bE };
  }
  /* Sanity net for the force field: MMFF94 is parametrised for organic chemistry. For small inorganic molecules it falls back on generic rules and can be badly wrong
     (it puts CO2 at C–O 1.41 Å instead of 1.16, N2 at 1.46 Å instead of 1.10). Every heavy-atom bond is therefore checked against an empirical expectation —
     Pyykkö single/double/triple covalent radii with the Schomaker–Stevenson electronegativity shortening — and a geometry that misses by more than TOL is replaced
     by the conformer generator's own crystallographic (COD) bond lengths, with the energy withheld. */
  const PYK = { C: [.75, .67, .60], N: [.71, .60, .54], O: [.63, .57, .53], F: [.64, .59, .53], P: [1.11, 1.02, .94], S: [1.03, .94, .95], Cl: [.99, .95, .93], Br: [1.14, 1.09, 1.10], I: [1.33, 1.29, 1.29], Si: [1.16, 1.07, 1.00], B: [.85, .78, .73], Se: [1.16, 1.07, 1.07], As: [1.19, 1.14, 1.06] };
  const PEN = { H: 2.20, C: 2.55, N: 3.04, O: 3.44, F: 3.98, P: 2.19, S: 2.58, Cl: 3.16, Br: 2.96, I: 2.66, Si: 1.90, B: 2.04, Se: 2.55, As: 2.18 };
  const XH = { H: .74, B: 1.19, C: 1.09, N: 1.01, O: .96, F: .92, Si: 1.48, P: 1.42, S: 1.34, Cl: 1.27, Se: 1.46, Br: 1.41, I: 1.61 }, TOL = .14;
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  function bondDev(g){
    let w = 0; const rad = (X, k) => X[Math.min(k, X.length) - 1];
    g.b.forEach(([i, j, t]) => { const A = PYK[g.a[i]], B = PYK[g.a[j]]; if(!A || !B) return; if(t === 1 && 'NOF'.includes(g.a[i]) && 'NOF'.includes(g.a[j]) && g.a[i] === g.a[j]) return;   // O–O and N–N single bonds are famously long (peroxides, hydrazines)
      let ex = t === 1.5 ? (rad(A, 1) + rad(A, 2) + rad(B, 1) + rad(B, 2)) / 2 : rad(A, t) + rad(B, t); ex -= .09 * Math.abs(PEN[g.a[i]] - PEN[g.a[j]]); w = Math.max(w, Math.abs(dist(g.xyz[i], g.xyz[j]) - ex)); });
    return w;
  }
  function fixH(g){                                                        // the generator's raw hydrogens sit ~0.1 Å too close: put every terminal H at the textbook X–H length
    const deg = g.a.map(() => []); g.b.forEach(([i, j]) => { deg[i].push(j); deg[j].push(i); });
    g.a.forEach((e, h) => { if(e !== 'H' || deg[h].length !== 1) return; const x = deg[h][0], L = XH[g.a[x]]; if(!L) return; const d = dist(g.xyz[h], g.xyz[x]) || 1; g.xyz[h] = g.xyz[x].map((v, k) => v + (g.xyz[h][k] - v) * L / d); });
    return g;
  }
  async function fragment(O, smi, o){
    const probe = O.Molecule.fromSmiles(smi); probe.addImplicitHydrogens();
    if(probe.getAllAtoms() === 1){ const g = grab(O, probe); g.xyz = [[0, 0, 0]]; return Object.assign(g, { E: 0, conv: 1, tier: 'atom', nconf: 1 }); }
    const m = O.Molecule.fromSmiles(smi), cg = new O.ConformerGenerator(o.seed);
    if(!cg.initializeConformers(m, { strategy: O.ConformerGenerator.STRATEGY_LIKELY_RANDOM, maxTorsionSets: 4000, use60degreeSteps: probe.getAllAtoms() <= 24 })) return null;   // small flexible molecules: scan every rotor in 60° steps instead of the torsion database
    const nAt = probe.getAllAtoms(), want = Math.max(1, Math.min(o.nconf || (nAt <= 24 ? 24 : nAt <= 48 ? 12 : 6), cg.getPotentialConformerCount())), tries = [];
    let raw = null; for(let k = 0; k < want; k++){ const c = cg.getNextConformerAsMolecule(null); if(!c) break; if(!raw) raw = c.getCompactCopy(); const r = minimise(O, c); tries.push({ c, r }); if(!r) break; await tick(); }   // no MMFF types → keep the single embedded geometry
    if(!tries.length) return null;
    const good = tries.filter(t => t.r).sort((x, y) => (y.r.conv - x.r.conv) || (x.r.E - y.r.E))[0];
    const fallback = () => { const g = fixH(grab(O, raw)); return Object.assign(g, { E: null, conv: 0, tier: 'embed', nconf: 1, dev: bondDev(g) }); };
    if(good){
      let fin = { m: good.c, E: good.r.E }; if(good.r.conv && nAt <= 48 && o.hop !== false) fin = await hop(O, good.c, good.r.E, 4000);
      const g = Object.assign(grab(O, fin.m), { E: fin.E, conv: good.r.conv, tier: 'ff', nconf: tries.length }); g.dev = bondDev(g);
      if(g.dev > TOL){ const alt = fallback(); if(alt.dev < g.dev) return alt; g.warn = 1; }       // MMFF94 geometry misses the empirical bond lengths and the generator is no better: keep it, flagged
      return g;
    }
    return fallback();
  }
  /* meta = a PubChem record from resolve(); returns a schema-v1 record or null. */
  async function build(meta, opt){
    const o = Object.assign({}, cfg, opt), O = await engine(), parts = String(meta.smiles || meta.smc).split('.').filter(Boolean); if(!parts.length) return null;
    const fr = []; for(const s of parts){ let g; try{ g = await fragment(O, s, o); }catch(e){ g = null; } if(!g) return null; fr.push(g); }
    let off = 0, x0 = 0; const a = [], q = [], xyz = [], b = [], fi = [], rank = { atom: 0, ff: 2, embed: 1 }; let E = 0, conv = 1, tier = 'ff', nconf = 0, anyE = false, dev = 0, warn = 0;
    fr.forEach((g, k) => {
      const cx = g.xyz.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / g.xyz.length), r = Math.max(0, ...g.xyz.map(p => dist(p, cx)));
      const shift = fr.length > 1 ? (k ? x0 + r + 3 : 0) : 0; if(fr.length > 1) x0 = shift + r;
      g.xyz.forEach(p => xyz.push([p[0] - cx[0] + shift, p[1] - cx[1], p[2] - cx[2]])); g.a.forEach(e => { a.push(e); fi.push(k); }); g.q.forEach(v => q.push(v)); g.b.forEach(t => b.push([t[0] + off, t[1] + off, t[2]]));
      off += g.a.length; if(g.tier === 'ff'){ E += g.E; anyE = true; } else if(g.tier === 'embed'){ tier = 'embed'; E = null; } conv = conv && g.conv; nconf = Math.max(nconf, g.nconf); dev = Math.max(dev, g.dev || 0); if(g.warn) warn = 1;
    });
    if(a.length > o.maxAtoms || xyz.some(p => p.some(v => !isFinite(v)))) return null;
    const hill = hillOf(a); if(meta.formula && meta.formula !== hill) return null;                // the structure must reproduce PubChem's own formula
    if(tier !== 'embed') tier = anyE ? 'ff' : 'atom'; if(E === null || !anyE) E = tier === 'atom' ? 0 : null;
    if(b.some(([i, j]) => { const d = dist(xyz[i], xyz[j]); return fi[i] === fi[j] && (d < .6 || d > 3.2); })) return null;   // sanity: no collapsed or exploded bonds
    const gs = gasteiger(a, b, q), D = []; for(let i = 0; i < a.length; i++) for(let j = i + 1; j < a.length; j++) D.push(fi[i] === fi[j] ? Math.round(dist(xyz[i], xyz[j]) * 100) : -1);
    const rec = { v: 1, cid: meta.cid || 0, hill, n: meta.name || '', iupac: meta.iupac || '', smi: meta.smiles || '', smc: meta.smc || '', mw: +meta.mw || 0, chg: q.reduce((s, v) => s + v, 0), tier, ff: tier === 'ff' ? 'MMFF94' : null,
      E: E === null ? null : +E.toFixed(3), conv: conv ? 1 : 0, nconf, a, b: b.map(t => [t[0], t[1], t[2]]), q: gs.q, qm: 'Gasteiger', xyz: xyz.map(p => p.map(v => +v.toFixed(3))), D, eng: 'openchemlib@' + OCL_VER, src: 'browser', t: Date.now() };
    const fc = q.map((v, i) => v ? [i, v] : null).filter(Boolean); if(fc.length) rec.fc = fc; if(fr.length > 1){ rec.ion = 1; rec.fr = fi; } if(gs.partial) rec.qpart = 1; rec.dev = +dev.toFixed(3); if(warn) rec.warn = 1; return rec;
  }
  /* the whole pipeline for one input (Phases 1 + 2) */
  async function pipeline(input, opt){ const meta = await resolve(input); return meta ? build(meta, opt) : null; }

  /* ============================== reading a record ============================== */
  const bondType = t => t === 1.5 ? 'aromatic' : t === 2 ? 'double' : t === 3 ? 'triple' : 'single';
  function matrix(rec){                                                    // Å, full symmetric; null where the pair was not computed (different ions)
    const n = rec.a.length, M = Array.from({ length: n }, () => Array(n).fill(0)); let k = 0;
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){ const v = rec.D[k++]; M[i][j] = M[j][i] = v < 0 ? null : v / 100; } return M;
  }
  const toXYZ = rec => rec.a.length + '\n' + (rec.n || rec.hill) + ' · ' + (rec.ff ? rec.ff + ' ' + rec.E + ' kcal/mol' : 'no force field') + '\n' + rec.a.map((e, i) => e + ' ' + rec.xyz[i].map(v => v.toFixed(4)).join(' ')).join('\n');
  function toGraph(rec){                                                   // 2-D drawing graph for the reactor, projected from the minimised 3-D geometry (principal plane, bond ≈ 1 unit)
    const n = rec.a.length, P = rec.xyz, c = [0, 1, 2].map(k => P.reduce((s, p) => s + p[k], 0) / n), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    P.forEach(p => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; for(let i = 0; i < 3; i++) for(let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
    const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], A = C.map(r => r.slice());                                 // Jacobi eigen-decomposition of the 3×3 covariance
    for(let sweep = 0; sweep < 30; sweep++){ let p = 0, r = 1, m = Math.abs(A[0][1]); if(Math.abs(A[0][2]) > m){ p = 0; r = 2; m = Math.abs(A[0][2]); } if(Math.abs(A[1][2]) > m){ p = 1; r = 2; m = Math.abs(A[1][2]); } if(m < 1e-12) break;
      const th = .5 * Math.atan2(2 * A[p][r], A[r][r] - A[p][p]), cs = Math.cos(th), sn = Math.sin(th);
      for(let k = 0; k < 3; k++){ const kp = A[k][p], kr = A[k][r]; A[k][p] = cs * kp - sn * kr; A[k][r] = sn * kp + cs * kr; } for(let k = 0; k < 3; k++){ const pk = A[p][k], rk = A[r][k]; A[p][k] = cs * pk - sn * rk; A[r][k] = sn * pk + cs * rk; }
      for(let k = 0; k < 3; k++){ const kp = V[k][p], kr = V[k][r]; V[k][p] = cs * kp - sn * kr; V[k][r] = sn * kp + cs * kr; } }
    const ax = [0, 1, 2].sort((i, j) => A[j][j] - A[i][i]).slice(0, 2).map(k => [V[0][k], V[1][k], V[2][k]]);
    let L = 0; rec.b.forEach(([i, j]) => L += dist(P[i], P[j])); L = rec.b.length ? L / rec.b.length : 1.5;
    const x = P.map(p => +(((p[0] - c[0]) * ax[0][0] + (p[1] - c[1]) * ax[0][1] + (p[2] - c[2]) * ax[0][2]) / L).toFixed(2)), y = P.map(p => +(((p[0] - c[0]) * ax[1][0] + (p[1] - c[1]) * ax[1][1] + (p[2] - c[2]) * ax[1][2]) / L).toFixed(2));
    const g = { a: rec.a.slice(), b: rec.b.map(t => [t[0], t[1], Math.min(3, Math.round(t[2] === 1.5 ? 1 : t[2]))]), q: rec.a.map(() => 0), x, y, real: true, ff: true };
    (rec.fc || []).forEach(([i, c]) => { g.q[i] = c; });
    if(rec.ion){                                                         // dashed ionic links between the ions (display only — distances between ions are not computed)
      const anchor = {}, net = {}; rec.fr.forEach((f, i) => { if(anchor[f] === undefined) anchor[f] = i; net[f] = (net[f] || 0) + rec.q[i]; });
      const ks = Object.keys(anchor), cat = ks.filter(k => net[k] > .5), an = ks.filter(k => net[k] < -.5); g.links = [];
      if(cat.length && an.length) for(let k = 0; k < Math.max(cat.length, an.length); k++) g.links.push([anchor[cat[k % cat.length]], anchor[an[k % an.length]]]);
    }
    return g;
  }

  /* ============================== PHASE 3 — library lookup (shared GitHub cache → this device → compute here) ============================== */
  const SH = {}, FLIGHT = new Map(), ST = { library: 0, device: 0, computed: 0, failed: 0 };
  async function shard(id){ if(SH[id]) return SH[id]; try{ const r = await fetch(cfg.base + id + '.json', { cache: 'no-cache' }); SH[id] = r.ok ? await r.json() : {}; }catch(e){ SH[id] = {}; } return SH[id]; }
  const valid = r => r && r.v === 1 && Array.isArray(r.a) && Array.isArray(r.xyz) && r.xyz.length === r.a.length && Array.isArray(r.D);
  const pick = ent => { const k = Object.keys(ent || {}).map(Number).sort((a, b) => a - b); for(const c of k) if(valid(ent[c])) return ent[c]; return null; };
  const Local = (function(){
    const mem = new Map(); let dbp = null;
    const open = () => dbp || (dbp = new Promise(res => { if(typeof indexedDB === 'undefined') return res(null); try{ const r = indexedDB.open('westlab-ff', 1); r.onupgradeneeded = () => r.result.createObjectStore('rec'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }catch(e){ res(null); } }));
    return {
      async get(k){ if(mem.has(k)) return mem.get(k); const d = await open(); if(!d) return null; return new Promise(res => { const q = d.transaction('rec').objectStore('rec').get(k); q.onsuccess = () => { if(q.result) mem.set(k, q.result); res(q.result || null); }; q.onerror = () => res(null); }); },
      async put(k, v){ mem.set(k, v); const d = await open(); if(!d) return; return new Promise(res => { const t = d.transaction('rec', 'readwrite'); t.objectStore('rec').put(v, k); t.oncomplete = t.onerror = () => res(); }); },
      async all(){ const d = await open(); if(!d) return [...mem.values()]; return new Promise(res => { const q = d.transaction('rec').objectStore('rec').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); }
    };
  })();
  let chain = Promise.resolve();                                           // one calculation at a time keeps the page responsive
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const api = { onNew: null };
  /* hill: Hill formula of the compound (e.g. 'C8H10N4O2'). o.compute === false → only look, never calculate. → { rec, src:'library'|'device'|'computed' } or null */
  function lookup(hill, o){
    o = o || {}; const key = hill + (o.compute === false ? '|ro' : ''); if(FLIGHT.has(key)) return FLIGHT.get(key);
    const p = (async () => {
      const lib = pick((await shard(shardOf(hill)))[hill]); if(lib){ ST.library++; return { rec: lib, src: 'library' }; }
      const dev = await Local.get(hill); if(valid(dev)){ ST.device++; return { rec: dev, src: 'device' }; }
      if(o.compute === false) return null;
      const rec = await serial(() => pipeline({ hill }, o)); if(!rec){ ST.failed++; return null; }
      ST.computed++; await Local.put(hill, rec); if(api.onNew) try{ api.onNew(rec); }catch(e){} return { rec, src: 'computed' };
    })();
    FLIGHT.set(key, p); p.then(r => { if(!r) FLIGHT.delete(key); }); return p;
  }
  Object.assign(api, { cfg, use, engine, resolve, build, pipeline, lookup, gasteiger, matrix, bondType, toXYZ, toGraph, shardOf, fnv, hillOf, stats: () => Object.assign({}, ST), local: Local, valid, SYM, version: OCL_VER });
  return api;
})();
if(typeof module !== 'undefined' && module.exports) module.exports = WestFF;
