// node tests/thermo-audit.test.js — the thermodynamic table (data/thermo-data.js) against published values, plus a guard against isomer collisions.
// Reference: standard Gibbs energy of formation at 298.15 K, 1 bar, kJ/mol — CRC Handbook of Chemistry and Physics (NBS/NIST tables). Values were entered from the
// CRC tables by the maintainer's assistant WITHOUT live access to the NIST WebBook (offline sandbox): spot-check any line you doubt at webbook.nist.gov before relying on it.
// What it proves: ΔHf°, S° of the compound AND of its elements are mutually consistent (ΔGf = ΔHf − TΔS) to within 4 kJ/mol.
const load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys, THERMO } = load(require('path').join(__dirname, '..')); Phys.init();
let n = 0, bad = 0; const check = (name, cond, extra) => { n++; if(!cond){ bad++; console.log('FAIL', name, extra || ''); } };
const REF={H2O:-237.14,CO2:-394.36,CO:-137.17,NH3:-16.45,NO:86.55,NO2:51.31,N2O4:97.89,SO2:-300.19,SO3:-371.06,HCl:-95.30,CH4:-50.72,C2H6:-32.82,C2H4:68.15,C2H2:209.9,NaCl:-384.14,CaCO3:-1128.8,CaO:-604.03,Fe2O3:-742.2,Al2O3:-1582.3,MgO:-569.43,CuO:-129.7,ZnO:-318.3,H2O2:-120.35,HNO3:-80.71,CH3OH:-166.27,C2H5OH:-174.78,C6H6:124.5,AgCl:-109.79,NaOH:-379.49,KCl:-409.14,H2SO4:-690.0,Fe3O4:-1015.4,SiO2:-856.3,TiO2:-888.8,PbO:-187.9,HF:-273.2,HBr:-53.45,HI:1.70,H2S:-33.56,CH3COOH:-389.9,C6H12O6:-910.4,Na2CO3:-1044.4,NaHCO3:-851.0,MgCO3:-1012.1,CaSO4:-1321.8,BaSO4:-1362.2,Mg3N2:-400.9,AlCl3:-628.8,FeS2:-166.9,NH4Cl:-202.9,KClO3:-296.3,KMnO4:-737.6,Cu2O:-146.0,CuSO4:-661.8,ZnS:-201.3,PbS:-98.7,SnO2:-515.8,Cr2O3:-1058.1,MnO2:-465.1,Na2O:-375.5,CaCl2:-748.1,Ca_OH_2:-898.49};
const DIA = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I']);
for(const f in REF){ const g = f === 'Ca_OH_2' ? 'Ca(OH)2' : f, sp = Chem.speciesOf(g), p = sp && Phys.props(sp); if(!p){ check('thermo data exists for ' + g, false); continue; }
  let Sel = 0; Object.keys(sp.comp).forEach(e => { const el = Chem.speciesOf(DIA.has(e) ? e + '2' : e), pe = Phys.props(el); Sel += sp.comp[e] * pe.S / (DIA.has(e) ? 2 : 1); });   // S° of the elements in their standard states
  const dg = p.H - 298.15 * (p.S - Sel) / 1000; check('ΔGf°(' + g + ') = ' + REF[f] + ' ± 4 kJ/mol', Math.abs(dg - REF[f]) <= 4, 'got ' + dg.toFixed(1)); }
// engine keys species by composition: two listed isomers would overwrite one another (this once replaced ethanol's data with dimethyl ether's)
const seen = {}; Object.keys(THERMO).forEach(f => { const c = Chem.parse(f); if(!c) return; const k = Chem.compKey(c); check('no isomer collision: ' + f + ' vs ' + seen[k], !seen[k]); seen[k] = f; });
console.log(n - bad + '/' + n + ' thermo audit checks passed'); process.exit(bad ? 1 : 0);
