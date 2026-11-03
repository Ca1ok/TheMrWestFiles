/* WestPhys — the physics layer of WestLab. Pure functions, no DOM, no network, deterministic (so the browser and the GitHub Action get identical answers).
 *
 * WestChem (chem.js) decides WHAT can happen (reaction type, products, balanced equation). WestPhys decides WHETHER it happens and HOW:
 *   thermodynamics  ΔH(T), ΔS(T), ΔG(T) by Hess's law with heat capacities and phase changes (melting / boiling, boiling shifted by pressure via Clausius–Clapeyron)
 *   equilibrium     K = exp(−ΔG/RT); the real equilibrium extent for the amounts you actually load (ideal gases: a = xP; pure solids/liquids: a = 1) → limiting reagent, % yield, Le Chatelier
 *   kinetics        Evans–Polanyi activation energy + Eyring rate  k = (k_B·T/h)·e^(ΔS‡/R)·e^(−Ea/RT); a catalyst lowers Ea; reaction time from the relaxation to equilibrium
 *   thermal/safety  adiabatic temperature rise, ideal-gas pressure in a sealed vessel, vessel limits
 *   electrochem     electrolysis cell voltage E = ΔG/(nF) and electrical work
 *   solution        Ksp precipitation yield, strong/weak acid–base pH (idealised: activity coefficients = 1)
 * Data: tabulated NBS/CRC values (data/thermo-data.js). Species that aren't tabulated are ESTIMATED (group-contribution / electronegativity fits calibrated on the
 * tabulated set, typical error ±60 kJ/mol organics, ±20 % inorganics) and every result is labelled "tabulated" or "estimated" — it never pretends.
 */
const Phys = (function(){
  'use strict';
  const R = 8.314462618, FARADAY = 96485.332, KB = 1.380649e-23, HP = 6.62607015e-34, T0 = 298.15, LN10 = Math.LN10;
  let VIOLENT = new Set(), up = false, DB = {}, KS = {}, memo = {}, MP = {}, BP = {}, EN = {}, PKAS = {}, STRONG = [], OXS = {};
  function init(){
    if(up) return; Chem.init(); up = true;
    // top-level `const` tables are global lexical bindings, so they are read by bare name (guarded, like chem.js does)
    const T = typeof THERMO !== 'undefined' ? THERMO : {}, K = typeof KSP !== 'undefined' ? KSP : {};
    MP = typeof MELTING_POINTS !== 'undefined' ? MELTING_POINTS : {}; BP = typeof BOILING_POINTS !== 'undefined' ? BOILING_POINTS : {}; EN = typeof ELECTRONEG !== 'undefined' ? ELECTRONEG : {};
    PKAS = typeof PKA !== 'undefined' ? PKA : {}; STRONG = typeof STRONG_ACIDS !== 'undefined' ? STRONG_ACIDS : []; OXS = typeof OXIDATION !== 'undefined' ? OXIDATION : {}; VIOLENT = typeof VIOLENT_WITH_WATER !== 'undefined' ? VIOLENT_WITH_WATER : new Set();
    Object.keys(T).forEach(f => { const c = Chem.parse(f); if(c) DB[Chem.compKey(c)] = T[f]; });
    Object.keys(K).forEach(f => { const c = Chem.parse(f); if(c) KS[Chem.compKey(c)] = K[f]; });
  }
  const ck = Chem.compKey, nAt = c => Chem.atoms(c), lnM = c => Object.keys(c).reduce((s, e) => s + c[e] * Math.log(Chem.elements[e].mass), 0);
  const enOf = s => EN[s] !== undefined ? EN[s] : (Chem.isMetal(s) ? 1.5 : 2.2);
  const KOPP = { C: 7.5, H: 9.6, B: 11.3, Si: 15.9, O: 16.8, F: 20.9, P: 22.6, S: 22.6 };
  const HVAP = { H2O: 40.65, NH3: 23.35, CH3OH: 35.3, C2H5OH: 38.6, C6H6: 30.7, Br2: 30.9, Hg: 59.1, HNO3: 39.1, H2O2: 51.6, C8H18: 41.5, C6H14: 28.9, C5H12: 25.8, CH3COOH: 23.7, CCl4: 30.0, CS2: 26.7, H2SO4: 50.0, HCl: 16.2, Cl2: 20.4, O2: 6.8, N2: 5.6, H2: 0.9, CH4: 8.2, C2H6: 14.7, C3H8: 19.0, C4H10: 22.4, CO2: 0, SO2: 24.9, NO2: 38.0, Na: 97.4, K: 79.1, Mg: 128, Ca: 150, Zn: 115, Fe: 340, Cu: 300, Al: 294, Pb: 177, Ag: 250, Sn: 296 }, HFUS = { H2O: 6.01, NH3: 5.66, CH3OH: 3.2, C2H5OH: 5.0, C6H6: 9.9, Br2: 10.6, Hg: 2.3, Na: 2.6, K: 2.3, Mg: 8.5, Ca: 8.5, Zn: 7.3, Fe: 13.8, Cu: 13.3, Al: 10.7, Pb: 4.8, Ag: 11.3, Sn: 7.0, NaCl: 28.2, MgO: 77, Al2O3: 109, CaO: 80, SiO2: 9.6, I2: 15.5, S: 1.7, P: 0.66, C: 100 };
  const gasCp = n => n === 1 ? 20.8 : n === 2 ? 29.1 : Math.min(250, 33.3 + 6.5 * (n - 3));

  /* ------------------------------------------------------------ species properties (tabulated, or estimated) */
  function estimate(comp){
    const els = Object.keys(comp), n = nAt(comp), M = Chem.massOf(comp); let Hg = null, err = 0, ionic = false;
    if(comp.C && els.every(e => 'CHON'.indexOf(e) >= 0)){                                          // organics: functional-group-aware fit
      const C = comp.C, H = comp.H || 0, O = comp.O || 0, N = comp.N || 0, dou = Math.max(0, (2 * C + 2 + N - H) / 2), co = Math.min(O, dou);
      Hg = -36.49 * C + 3.56 * H - 209.18 * (O - co) - 124.04 * co + 74.5 * (dou - co) - 4.33 * N; err = 60;
    } else {
      let cat = null, an = null, Q = 0, enC = 0, grp = 3;
      const d = Chem.ions(comp);
      if(d){ cat = d.cation; an = d.anion; Q = cat.ch * d.nc; enC = Object.keys(cat.comp).reduce((s, e) => s + enOf(e) * cat.comp[e], 0) / nAt(cat.comp); grp = an.poly ? 2 : an.f === 'O' ? 0 : ['F', 'Cl', 'Br', 'I'].includes(an.f) ? 1 : 3; ionic = true; }
      else if(els.length === 2){                                                                   // covalent binary: treat the less electronegative atom as the 'cation'
        const [a, b] = enOf(els[0]) <= enOf(els[1]) ? els : [els[1], els[0]];
        const nb = (OXS[b] || []).find(v => v < 0); if(nb === undefined) return null;
        Q = comp[b] * -nb; enC = enOf(a); grp = b === 'O' ? 0 : ['F', 'Cl', 'Br', 'I'].includes(b) ? 1 : 3;
      } else return null;
      const C = [-457.8, -677.2, -719.6, -107.8, 160.6, 261.6, 148.4, 25.2], o = [0, 0, 0, 0]; o[grp] = 1;
      const f = o.concat(o.map(v => v * enC)); Hg = f.reduce((s, v, i) => s + v * C[i] * Q, 0); err = Math.max(40, Math.abs(Hg) * 0.2);
      if(Hg > 0 && ionic) Hg = -Math.abs(Hg) * 0.1;
    }
    if(!isFinite(Hg)) return null;
    // entropy, phase and heat capacity of the estimate
    const molecular = !ionic && !(Chem.isMetal(els[0]) && els.length === 1);
    const Tb = ionic ? 2000 : Math.min(700, 70 + 3 * M), Tm = ionic ? 1300 : Math.max(120, 0.6 * Tb);
    if(molecular){
      const Sg = 55.217 + 8.24 * n + 35.942 * Math.log(M); let ph = Tb < T0 ? 'g' : (Tm < T0 ? 'l' : 's'), H = Hg, S = Sg;
      if(ph !== 'g'){ const hv = 0.088 * Tb; H -= hv; S -= hv * 1000 / Tb; if(ph === 's'){ const hf = (10 + 8 * (n - 1)) * Tm / 1000; H -= hf; S -= hf * 1000 / Tm; } }
      return { ph, H, S, Cp: ph === 'g' ? gasCp(n) : els.reduce((s, e) => s + comp[e] * (KOPP[e] || 26) * 1.15, 0), est: true, err, Tm, Tb };
    }
    return { ph: 's', H: Hg, S: 23.462 + 0.934 * n + 5.592 * lnM(comp), Cp: els.reduce((s, e) => s + comp[e] * (KOPP[e] || 26), 0), est: true, err, Tm, Tb };
  }
  const pick = (d, sp) => { let v = d[sp.f]; if(v === undefined && sp.kind === 'element') v = d[sp.el]; return v === undefined ? null : v + 273.15; };
  function props(sp){
    init(); const key = ck(sp.comp); if(key in memo) return memo[key];
    const t = DB[key]; let o = t ? { ph: t[0], H: t[1], S: t[2], Cp: t[3], est: false, err: 0 } : estimate(sp.comp);
    if(!o){ memo[key] = null; return null; }
    const n = nAt(sp.comp); let Tm = o.Tm || pick(MP, sp), Tb = o.Tb || pick(BP, sp);
    if(sp.f === 'CO2'){ Tm = Tb = 194.7; }                                                    // sublimes at 1 atm
    if(Tm == null) Tm = o.ph === 'g' ? 100 : o.ph === 'l' ? 250 : 1300;
    if(Tb == null) Tb = o.ph === 'g' ? 200 : o.ph === 'l' ? 380 : 2100;
    if(o.ph === 's') Tm = Math.max(Tm, T0 + 1); if(o.ph === 'l'){ Tm = Math.min(Tm, T0 - 1); Tb = Math.max(Tb, T0 + 1); } if(o.ph === 'g') Tb = Math.min(Tb, T0 - 1);
    Tb = Math.max(Tb, Tm); const metal = sp.kind === 'element' && Chem.isMetal(sp.el);
    const hf = sp.f === 'CO2' ? 25.2 : (HFUS[sp.f] != null ? HFUS[sp.f] : (metal ? 10 : Math.min(60, 10 + 8 * (n - 1))) * Tm / 1000), hv = sp.f === 'CO2' ? 0 : (HVAP[sp.f] != null ? HVAP[sp.f] : (metal ? 95 : 88) * Tb / 1000);
    const cp = { }; cp[o.ph] = o.Cp;
    if(o.ph === 's'){ cp.l = o.Cp * 1.15; cp.g = gasCp(n); } else if(o.ph === 'l'){ cp.s = o.Cp * .9; cp.g = gasCp(n); } else { cp.l = o.Cp * 2.2; cp.s = o.Cp * 2.0; }
    return (memo[key] = Object.assign(o, { f: sp.f, comp: sp.comp, B: [Tm, Tb], dh: [hf, hv], cp }));
  }
  const tbP = (p, P) => { if(!(P > 1.0001)) return p.B[1]; const x = 1 / p.B[1] - R * Math.log(P) / (p.dh[1] * 1000 || 1e9); return x > 1e-5 ? Math.min(1 / x, 1.6 * p.B[1]) : 1.6 * p.B[1]; };   // capped near the critical point (Tc ≈ 1.6·Tb)
  function phaseAt(p, T, P){ const tb = tbP(p, P || 1); return T < p.B[0] ? 's' : (T < tb ? 'l' : 'g'); }
  // enthalpy of formation (kJ/mol) and entropy (J/mol/K) at T, P — integrates Cp across the phase changes
  function HS(p, T, P){
    const order = ['s', 'l', 'g'], B = [p.B[0], tbP(p, P || 1)]; let H = p.H, S = p.S, t = T0, i = order.indexOf(p.ph);
    const seg = (i, a, b) => { const c = p.cp[order[i]]; H += c * (b - a) / 1000; S += c * Math.log(b / a); }, tr = (j, sg) => { const h = p.dh[j]; H += sg * h; S += sg * h * 1000 / B[j]; };
    if(T >= T0){ while(i < 2 && B[i] <= T){ const b = Math.max(B[i], t); seg(i, t, b); t = b; tr(i, 1); i++; } seg(i, t, T); }
    else { while(i > 0 && B[i - 1] > T){ const b = Math.min(B[i - 1], t); seg(i, t, b); t = b; tr(i - 1, -1); i--; } seg(i, t, T); }
    return { H, S };
  }
  /* ------------------------------------------------------------ reaction thermodynamics */
  function rxn(re, pr, T, P){
    let dH = 0, dS = 0, est = false, e2 = 0, miss = [];
    [[re, -1], [pr, 1]].forEach(([side, sg]) => side.forEach(x => { const p = props(x.s); if(!p){ miss.push(x.s.f); return; } const h = HS(p, T, P); dH += sg * x.coeff * h.H; dS += sg * x.coeff * h.S; if(p.est){ est = true; e2 += Math.pow(x.coeff * p.err, 2); } }));
    const dG = dH - T * dS / 1000; return { dH, dS, dG, lnK: -dG * 1000 / (R * T), est, err: Math.sqrt(e2), miss };
  }
  /* ------------------------------------------------------------ equilibrium for the amounts actually loaded */
  function equilibrium(sps, n0, T, P, lnK, removal){
    // sps: [{p, nu}] with nu<0 reactants, >0 products;  n0: moles of each at the start (products 0)
    const xm = Math.min.apply(null, sps.map((s, i) => s.nu < 0 ? n0[i] / -s.nu : Infinity)); if(!(xm > 0)) return { xi: 0, xmax: 0, y: 0 };
    const gas = sps.map(s => phaseAt(s.p, T, P) === 'g'); let lk = lnK;
    if(removal) lk += 6.9 * sps.filter((s, i) => s.nu > 0 && (gas[i] || phaseAt(s.p, T, P) === 'l')).length;
    const f = xi => { const n = sps.map((s, i) => Math.max(1e-14, n0[i] + s.nu * xi)); let nG = 0; n.forEach((v, i) => { if(gas[i]) nG += v; }); let q = 0; sps.forEach((s, i) => { if(gas[i]) q += s.nu * Math.log(n[i] / nG * P); }); return q - lk; };
    let xi; if(f(xm) <= 0) xi = xm; else if(f(0) >= 0) xi = 0; else { let lo = 0, hi = xm; for(let k = 0; k < 90; k++){ const mid = (lo + hi) / 2; if(f(mid) < 0) lo = mid; else hi = mid; } xi = (lo + hi) / 2; }
    if(xi > xm * 0.9995) xi = xm; if(xi < xm * 1e-6) xi = 0;
    return { xi, xmax: xm, y: xi / xm };
  }
  /* ------------------------------------------------------------ kinetics */
  const BOND = { H2: 436, N2: 945, O2: 498, F2: 159, Cl2: 193 + 50, Br2: 193, I2: 151 };
  const clsOf = t => /displacement|neutrali|Acid|Basic oxide|Acidic oxide|Metal \+/.test(t) ? 'ion' : /Decomp|Electrolysis|Thermal/.test(t) ? 'dec' : /Combustion/.test(t) ? 'ox' : 'syn';
  function activation(sol, th, cat, T){
    const cls = clsOf(sol.type), nuR = sol.reactants.reduce((s, x) => s + x.coeff, 0), dHper = th.dH / nuR; let Ea;
    if(cls === 'ion') Ea = /water|steam/.test(sol.type) ? 45 : 15;
    else if(cls === 'dec') Ea = Math.max(40, dHper + 30);
    else { const D = Math.max.apply(null, sol.reactants.map(x => BOND[x.s.f] || 0).concat([180])), hasO2 = sol.reactants.some(x => x.s.f === 'O2');
      Ea = Math.max(hasO2 ? 100 : (sol.reactants.some(x => x.s.f !== 'H2' && x.s.kind === 'element' && Chem.isMetal(x.s.el)) ? 15 : 60), 0.35 * D + 0.3 * Math.min(dHper, 0)); }
    if(cat) Ea = Math.max(0.3 * Ea, Ea - 200); return { Ea, cls };
  }
  function rateConst(Ea, T, nMol, hetero){ return (KB * T / HP) * Math.exp(-30 * (Math.min(3, nMol) - 1) / R) * Math.exp(-Ea * 1000 / (R * T)) * (hetero ? 1e-3 : 1); }
  const fmtTime = s => !isFinite(s) ? 'never' : s < 1e-3 ? (s * 1e6).toPrecision(2) + ' µs' : s < 1 ? (s * 1e3).toPrecision(2) + ' ms' : s < 90 ? s.toPrecision(2) + ' s' : s < 5400 ? (s / 60).toPrecision(2) + ' min' : s < 172800 ? (s / 3600).toPrecision(2) + ' h' : s < 3.2e7 ? (s / 86400).toPrecision(2) + ' days' : (s / 3.15e7).toPrecision(2) + ' years';

  /* ------------------------------------------------------------ the cacheable "card": everything that depends on WHICH reaction, T, P and equipment (not on amounts) */
  const ALL = ['heat', 'spark', 'pressure', 'catalyst', 'cryo', 'distill', 'polymer'];
  const normKey = k => { const s = Chem.speciesOf(k); return s ? s.key : k; };
  function cacheKey(a){ const body = a.target ? '>' + a.target : (a.keys || []).map(normKey).sort().join('+'); return body + '|' + Math.round(a.T) + '|' + (+a.P || 1) + '|' + (a.cat ? 1 : 0) + (a.elec ? 1 : 0); }
  function fnv(s){ let h = 0x811c9dc5; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  const shardOf = key => fnv(key).slice(0, 2);
  const r3 = x => Math.round(x * 1000) / 1000;
  function electrons(sol){ let n = 0; sol.reactants.forEach(x => { if(x.s.kind !== 'compound') return; const d = Chem.ions(x.s.comp); if(d) n += x.coeff * d.cation.ch * d.nc; }); return n || 2; }
  function card(a){
    init(); const T = Math.round(a.T || 298), P = +a.P || 1, key = cacheKey(a), bad = why => ({ v: 1, ok: false, why, key });
    let sol = a.target ? Chem.formation(a.target) : Chem.solve(a.keys || [], ALL);
    if(!a.target && sol && sol.reactants && /^Synthesis/.test(sol.type) && sol.reactants.length === 2 && sol.reactants.every(x => x.s.kind === 'element')){   // two elements: the most stable binary compound at THIS T wins (min ΔG per atom)
      const es = sol.reactants.map(x => x.s.el), cs = Chem.candidates(es[0], es[1]).map(c => ({ c, f: Chem.formation(c.formula) })).filter(x => x.f && x.f.reactants && x.f.products).map(x => { const t = rxn(x.f.reactants, x.f.products, T, P), at = Chem.atoms(x.f.products[0].s.comp) * x.f.products[0].coeff; return { f: x.f, g: t.dG / at, tab: !t.est, ok: !t.miss.length }; }).filter(x => x.ok);
      const pool = cs.some(x => x.tab) ? cs.filter(x => x.tab) : cs; if(pool.length) sol = Object.assign({}, pool.sort((x, y) => x.g - y.g)[0].f, { type: sol.type });
    }
    if(!sol || !sol.reactants) return bad((sol && sol.reason) || 'Nothing to react.'); if(sol.type === 'No reaction' || sol.ok === false && !sol.reactants.length) return bad(sol.reason);
    const th = rxn(sol.reactants, sol.products, T, P);
    if(th.miss.length) return bad('No thermochemical data (and no safe estimate) for ' + th.miss.join(', ') + ' — WestLab won’t guess.');
    const nu = sol.reactants.map(x => ({ p: props(x.s), nu: -x.coeff })).concat(sol.products.map(x => ({ p: props(x.s), nu: x.coeff })));
    const eq0 = equilibrium(nu, sol.reactants.map(x => x.coeff).concat(sol.products.map(() => 0)), T, P, th.lnK, false);
    const ne = electrons(sol), driven = !!a.elec && ne > 0 && th.dG > 0, ac = activation(sol, th, !!a.cat, T);
    const hetero = sol.reactants.some(x => phaseAt(props(x.s), T, P) !== 'g') && ac.cls !== 'ion', kf = rateConst(ac.Ea, T, sol.reactants.length, hetero);
    const xeq = driven ? 1 : eq0.y, t95 = driven ? 0 : 3 * Math.max(xeq, 1e-6) / kf;
    const out = { v: 1, ok: true, key, type: sol.type, note: sol.note || '', T, P, cat: a.cat ? 1 : 0, elec: driven ? 1 : 0, cls: ac.cls, eq: sol.equation,
      R: sol.reactants.map(x => [x.s.key, x.coeff, x.s.apu, x.s.f, x.s.kind]), Pr: sol.products.map(x => [x.s.key, x.coeff, x.s.apu, x.s.f, x.s.kind]),
      dH: r3(th.dH), dS: r3(th.dS), dG: r3(th.dG), lnK: r3(th.lnK), Ea: r3(ac.Ea), lnkf: r3(Math.log(kf)), xeq: r3(xeq), t95: +t95.toPrecision(3), est: th.est ? 1 : 0, err: Math.round(th.err), ne, E: driven ? r3(th.dG * 1000 / (ne * FARADAY)) : 0, hetero: hetero ? 1 : 0 };
    if(!driven && xeq < 0.05 && !(th.est && th.dG < th.err * 0.5)){                                  // thermodynamically blocked: explain, and say what would fix it
      let hint = ''; const dHs = th.dH, dSs = th.dS; if(dHs > 0 && dSs > 0){ const Tx = dHs * 1000 / dSs; if(Tx < 5000) hint = ' It becomes favourable above ≈ ' + Math.round(Tx) + ' K (ΔH and ΔS both positive).'; } else if(dHs < 0 && dSs < 0){ const Tx = dHs * 1000 / dSs; hint = ' It becomes favourable below ≈ ' + Math.round(Tx) + ' K (cool it).'; }
      if(ne && sol.type !== 'Direct synthesis from elements') hint += ' An electrolysis rig can force it with ≈ ' + r3(th.dG * 1000 / (ne * FARADAY)) + ' V.';
      out.ok = false; out.why = 'Thermodynamically blocked at ' + T + ' K: ΔG = ' + (+th.dG.toFixed(1)) + ' kJ per reaction, K = ' + (th.lnK / LN10).toFixed(1).replace(/^(-?\d)/, '10^$1') + '. At equilibrium only ' + (xeq * 100).toFixed(2) + ' % would form.' + hint; return out;
    }
    if(!driven && t95 > 1e5){ out.ok = false; out.why = 'Kinetically blocked at ' + T + ' K: Ea ≈ ' + Math.round(ac.Ea) + ' kJ/mol, so it would take ' + fmtTime(t95) + ' to get anywhere. Heat it' + (a.cat ? '' : ' or add a catalyst') + '.'; return out; }
    return out;
  }
  /* ------------------------------------------------------------ a run: amounts → equilibrium, yield, curve, heat, hazards, solution chemistry */
  const VOL_L = 25, SEAL_RATING = 500, GLASS_T = 1100, CRUCIBLE_T = 2100;
  function run(c, amounts, o){
    init(); o = o || {}; const nu = c.R.map(x => ({ p: props(Chem.speciesOf(x[0])), nu: -x[1] })).concat(c.Pr.map(x => ({ p: props(Chem.speciesOf(x[0])), nu: x[1] })));
    const n0 = c.R.map(x => Math.max(0, +amounts[x[0]] || 0)).concat(c.Pr.map(() => 0)), T = c.T, P = c.P;
    let eq = c.elec ? (() => { const xm = Math.min.apply(null, c.R.map((x, i) => n0[i] / x[1])); return { xi: xm, xmax: xm, y: xm > 0 ? 1 : 0 }; })() : equilibrium(nu, n0, T, P, c.lnK, !!o.removal);
    let xi = eq.xi; const lim = c.R.reduce((b, x, i) => (n0[i] / x[1] < b.r ? { i, r: n0[i] / x[1] } : b), { i: 0, r: Infinity }).i;
    const out = { xi, xmax: eq.xmax, y: eq.y, limiting: c.R[lim] ? c.R[lim][3] : null, excess: c.R.map((x, i) => ({ f: x[3], left: n0[i] - x[1] * xi })), notes: [] };
    // precipitation: a product with a known Ksp only forms beyond its solubility (idealised, pure water)
    const V = o.volume || 1;
    if(c.cls === 'ion' && T < 374){ c.Pr.forEach((x, j) => { const s = Chem.speciesOf(x[0]), K = KS[ck(s.comp)], d = K && Chem.ions(s.comp); if(!d) return; const nu1 = d.nc, nu2 = d.na, sol = Math.pow(K / (Math.pow(nu1, nu1) * Math.pow(nu2, nu2)), 1 / (nu1 + nu2)), made = x[1] * xi, dis = Math.min(made, sol * V); out.notes.push(s.f + ': Ksp = ' + K.toExponential(1) + ' → ' + (sol * V < made ? (dis).toExponential(1) + ' mol stays dissolved, the rest precipitates' : 'fully dissolved at this volume')); out.dissolved = out.dissolved || {}; out.dissolved[x[0]] = dis; }); }
    out.pH = c.cls === 'ion' ? phOf(c, n0, xi, V) : null;
    // kinetics: relaxation toward equilibrium, first order in the limiting reagent
    const kf = Math.exp(c.lnkf), xeq = Math.max(out.y, 1e-6), kt = kf / xeq, t95 = c.elec ? 3600 : 3 / kt; out.t95 = t95; out.tLabel = c.elec ? 'electrolysis' : fmtTime(t95);
    out.curve = []; for(let i = 0; i <= 48; i++){ const t = t95 * 1.6 * i / 48; out.curve.push(c.elec ? Math.min(1, t / (t95 * 1.0)) : 1 - Math.exp(-kt * t)); }
    // heat, adiabatic temperature rise, vessel limits
    const q = -c.dH * xi, nF = nu.map((s, i) => Math.max(0, n0[i] + s.nu * xi)); let CpTot = 0, gasN = 0; nF.forEach((v, i) => { const p = nu[i].p; CpTot += v * (p.cp[phaseAt(p, T, P)] || p.Cp); if(phaseAt(p, T, P) === 'g') gasN += v; });
    const mass = 0.15 + (c.cls === 'ion' && T < 374 ? 4.184 * V : 0), Hp = Tx => nF.reduce((s, v, i) => s + v * HS(nu[i].p, Tx, P).H, 0) + mass * Tx, H0 = Hp(T) + q;      // kJ; solve  H_products(Tf) + thermal mass·Tf = H_products(T) + q
    let lo = Math.min(T, 50), hi = 9000; for(let k = 0; k < 60; k++){ const m = (lo + hi) / 2; if(Hp(m) < H0) lo = m; else hi = m; } const Tf = (lo + hi) / 2;
    out.heat = q; out.dTad = Tf - T; out.Tpeak = q > 0 ? Tf : T; if(c.cls === 'ion' && /water/.test(c.type) && c.R.some(x => Chem.speciesOf(x[0]).kind === 'element' && VIOLENT.has(Chem.speciesOf(x[0]).el)) && xi > 0) out.violent = true;
    const sealed = P > 1.0001, owned = o.tools || {}; out.sealed = sealed; out.Pfinal = sealed ? gasN * 0.083145 * out.Tpeak / VOL_L : 1; out.hazard = null;
    const Tlim = owned.burner ? CRUCIBLE_T : GLASS_T;
    if(sealed && out.Pfinal > (owned.pressure ? SEAL_RATING : 5)) out.hazard = 'burst'; else if(out.Tpeak > Tlim || out.violent) out.hazard = 'thermal';
    if(c.elec){ out.work = c.dG * xi; out.kWh = Math.max(0, out.work) / 3600; }
    return out;
  }
  function phOf(c, n0, xi, V){
    let eqA = 0, eqB = 0, weakA = null, weakB = false; c.R.forEach((x, i) => { const s = Chem.speciesOf(x[0]), d = Chem.ions(s.comp); if(!d) return; const left = n0[i] - x[1] * xi;
      if(d.cation.f === 'H' && d.anion.f !== 'OH'){ eqA += left * d.nc; if(!STRONG.includes(s.f)) weakA = PKAS[s.f] != null ? PKAS[s.f] : 5; }
      else if(d.anion.f === 'OH'){ eqB += left * d.na; if(!['Na', 'K', 'Li', 'Rb', 'Cs', 'Ca', 'Ba', 'Sr'].includes(d.cation.f)) weakB = true; }
      else if(d.cation.f === 'NH3' ) weakB = true; });
    if(c.R.some(x => x[0] === 'NH3')) weakB = true; if(!(eqA || eqB) && !c.Pr.some(x => x[0] === 'H2O')) return null;
    const e = (eqA - eqB) / V; if(Math.abs(e) > 1e-6) return +(e > 0 ? -Math.log10(e) : 14 + Math.log10(-e)).toFixed(2);
    return weakA != null ? +(7 + 0.5 * (weakA + Math.log10(Math.max(1e-6, xi / V)))).toFixed(2) : (weakB ? +(7 - 0.5 * (14 - 9.25 + Math.log10(Math.max(1e-6, xi / V)))).toFixed(2) : 7);
  }
  // what the player's bench can do (derived from owned equipment)
  function limits(owned){ return { Tmin: owned.cryo ? 75 : 275, Tmax: owned.burner ? 1500 : 375, Pmax: owned.pressure ? 500 : 1, cat: !!owned.catalysis, elec: !!owned.electrolysis, removal: !!owned.distillation }; }
  return { init, props, HS, rxn, card, run, equilibrium, limits, cacheKey, shardOf, fnv, fmtTime, phaseAt, R, FARADAY };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = Phys;
