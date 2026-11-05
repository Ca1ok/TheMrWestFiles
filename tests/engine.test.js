// node tests/engine.test.js — the "basic chemistry must work" suite: elements, spark ignition, open-vessel gas escape, and the Gibbs-search fallback.
const load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys, ELEMENTS } = load(require('path').join(__dirname, '..')); Phys.init();
let n = 0, bad = 0; const check = (name, cond, extra) => { n++; if(!cond){ bad++; console.log('FAIL', name, extra || ''); } };
const card = (keys, T, o) => Phys.card(Object.assign({ keys, T: T || 300, P: 1 }, o));
// every element has thermodynamic data (tabulated or estimated), so nothing is blocked just for being exotic
const missing = ELEMENTS.filter(e => { const sp = Chem.speciesOf(e[1]); return !sp || !Phys.props(sp); }).map(e => e[1]); check('all 118 elements have thermo data', missing.length === 0, missing.join(' '));
check('Rn is a gas, Th a solid at 298 K', Phys.props(Chem.speciesOf('Rn')).ph === 'g' && Phys.props(Chem.speciesOf('Th')).ph === 's');
// basic reactions work with a spark at room temperature
for(const [k, eq] of [[['H', 'O'], '2 H₂ + O₂ → 2 H₂O'], [['Na', 'Cl'], '2 Na + Cl₂ → 2 NaCl'], [['Mg', 'O'], '2 Mg + O₂ → 2 MgO'], [['C', 'O'], 'C + O₂ → CO₂'], [['CH4', 'O'], 'CH₄ + 2 O₂ → CO₂ + 2 H₂O'], [['Fe', 'S'], null]]){
  const c = card(k, 300, { ign: true }); check(k.join('+') + ' works at 300 K with a spark', c.ok && (!eq || c.eq === eq), c.ok ? c.eq : c.why);
}
check('H2 + O2 does NOT go at 300 K without a spark', !card(['H', 'O'], 300, { ign: false }).ok);
check('N2 + H2 is not ignitable (strong N≡N bond)', !card(['N', 'H'], 300, { ign: true }).ok);
check('Haber works hot, squeezed and catalysed', card(['N', 'H'], 700, { P: 200, cat: true }).ok);
// open vessel: gases escape → baking soda + vinegar fizzes at room temperature; limestone calcines near 1000 K in air
const v = card(['NaHCO3', 'CH3COOH'], 300); check('baking soda + vinegar at 300 K', v.ok && /CO₂/.test(v.eq), v.ok ? v.eq : v.why);
check('CaCO3 stays put at 600 K, calcines at 1100 K (open)', !card(['CaCO3'], 600).ok && card(['CaCO3'], 1100, { ign: true }).ok);
// fallback search
for(const [k, T, ign, eq] of [[['CO2', 'NaOH'], 300, false, /Na₂CO₃|NaHCO₃/], [['CO2', 'CaO'], 300, false, /CaCO₃/], [['MgO', 'H2O'], 300, false, /Mg\(OH\)₂/], [['CO', 'H2O'], 300, false, /H₂ \+ CO₂|CO₂ \+ H₂/], [['NO2', 'H2O'], 300, false, /HNO₃/], [['C', 'H2O'], 1000, true, /H₂ \+ CO|CO \+ H₂/], [['Fe2O3', 'C'], 1000, true, /Fe/], [['CuO', 'H'], 300, true, /Cu \+ H₂O/], [['C2H4', 'HCl'], 300, false, /C₂H₅Cl/], [['CH4', 'Cl'], 300, true, /CH₃Cl/]]){
  const c = card(k, T, { ign }); check(k.join('+') + ' (fallback)', c.ok && eq.test(c.eq), c.ok ? c.eq : c.why);
}
check('Cu + HCl does not react', !card(['Cu', 'HCl'], 300, { ign: true }).ok); check('Cu + ZnSO4 does not react', !card(['Cu', 'ZnSO4'], 300, { ign: true }).ok);
check('NH4NO3 is stable at 300 K without an ignition source', !card(['NH4NO3'], 300, { ign: false }).ok);
console.log(n - bad + '/' + n + ' engine checks passed'); process.exit(bad ? 1 : 0);
