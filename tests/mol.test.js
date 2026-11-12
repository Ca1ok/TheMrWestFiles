// node tests/mol.test.js — structures built from valence rules + atom mapping for the reactor animation
const load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys, Mol } = load(require('path').join(__dirname, '..')); Phys.init();
let bad = 0; const b = f => { const g = Mol.layout(Mol.build(Chem.speciesOf(f))); return g.b.map(x => [g.a[x[0]], g.a[x[1]]].sort().join('') + x[2]).sort().join(' '); };
const has = (f, re) => { if(!re.test(b(f))){ bad++; console.log('FAIL', f, b(f)); } };
has('H2O', /^HO1 HO1$/); has('CO2', /^CO2 CO2$/); has('CH4', /^(CH1 ?){4}$/); has('C2H4', /CC2/); has('NH3', /^HN1 HN1 HN1$/); has('H2SO4', /OS2 OS2/); has('C2H5OH', /CC1.*CO1.*HO1/);
const c = Phys.card({ keys: ['H', 'O'], T: 900, P: 1 }), s = Mol.scene(c, k => Mol.layout(Mol.build(Chem.speciesOf(k))), 560, 280);
if(!s || Math.abs((s.Ebr - s.Efo) - c.dH) > 60){ bad++; console.log('FAIL bond bookkeeping vs ΔH', s && s.Ebr - s.Efo, c.dH); }
console.log(bad ? bad + ' failed' : 'mol checks passed'); process.exit(bad ? 1 : 0);
