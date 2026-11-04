// node tests/phys.test.js  — checks WestPhys against textbook values (NBS/CRC) and the key behaviours of the lab.
const load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys } = load(require('path').join(__dirname, '..')); Phys.init();
let n = 0, bad = 0; const near = (name, v, want, tol) => { n++; if(!(Math.abs(v - want) <= tol)){ bad++; console.log('FAIL', name, v, 'expected', want, '±', tol); } };
const card = (keys, T, P, cat, elec, target) => Phys.card({ keys, T, P: P || 1, cat, elec, target });
let c;
c = card(['CaCO3'], 300, 1);          near('CaCO3 → CaO + CO2: ΔH(298)=178.3 kJ (blocked at room T)', Phys.rxn(Chem.solve(['CaCO3'], ['heat']).reactants, Chem.solve(['CaCO3'], ['heat']).products, 298.15, 1).dH, 178.3, 1.5); console.log(c.ok ? 'unexpected ok' : 'CaCO3 @300 K blocked ✓');
c = card(['CaCO3'], 1300, 1);         near('CaCO3 @1300 K proceeds', c.ok ? 1 : 0, 1, 0);
const hb = Chem.solve(['N', 'H'], ['heat', 'pressure', 'catalyst']); const th = Phys.rxn(hb.reactants, hb.products, 700, 1);
near('Haber ΔG(700 K) ≈ +56 kJ per 2 NH3', th.dG, 56, 6); near('Haber log10 K(700 K) ≈ −4.2', th.lnK / Math.LN10, -4.2, 0.6);
c = card(['N', 'H'], 700, 200, true); const r = Phys.run(c, { N: 2, H: 6 }, { tools: { pressure: 1 } }); near('Haber equilibrium NH3 yield at 700 K, 200 bar (≈ 35–45 %)', r.y * 100, 40, 8);
c = card(['H2O'], 300, 1, false, true); near('water electrolysis cell voltage 1.23 V', c.E, 1.23, 0.02);
c = card(['Na', 'Cl'], 300, 1);       near('NaCl ΔH formation ×2 = −822 kJ', c.dH, -822.3, 3);
c = card(['H', 'O'], 300, 1);         console.log(c.ok ? 'FAIL H2+O2 should be kinetically blocked at room T' : 'H2 + O2 blocked at 300 K ✓', c.ok ? '' : c.why.slice(0, 70)); if(c.ok) bad++; n++;
c = card(['H', 'O'], 900, 1);         near('H2 + O2 runs at 900 K', c.ok ? 1 : 0, 1, 0);
c = card(['AgNO3', 'NaCl'], 300, 1);  const rr = Phys.run(c, { AgNO3: 1, NaCl: 1 }, { tools: {} }); near('AgCl precipitates (Ksp 1.8e-10): dissolved < 1e-4 mol', rr.dissolved.AgCl < 1e-4 ? 1 : 0, 1, 0);
c = card(['HCl', 'NaOH'], 300, 1);    near('strong acid + strong base → pH 7', Phys.run(c, { HCl: 1, NaOH: 1 }, { tools: {} }).pH, 7, 0.1);
c = card(['N', 'O'], 1500, 1);        console.log('N2 + O2 at 1500 K →', c.ok ? c.eq : c.why.slice(0, 60));
console.log(n - bad + '/' + n + ' checks passed'); process.exit(bad ? 1 : 0);
