// node tests/discoveries.test.js — the shared lab-cache must only hold what the CURRENT engine produces, and the engine must never balance a reaction against free atoms.
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..'), load = require('../.github/scripts/westlab-loader.js'), { verifyDiscovery } = require('../.github/scripts/lab-verify.js');
const { Phys } = load(ROOT); Phys.init(); let n = 0, bad = 0; const check = (name, cond, extra) => { n++; if(!cond){ bad++; console.log('FAIL', name, extra || ''); } };
// 1. every committed discovery was verified under this engine version and still re-derives (stale entries from an older engine must be dropped by the export Action)
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'lab-cache', 'discoveries.json'), 'utf8'));
Object.keys(reg).forEach(k => { check('discovery stamped with the current engine: ' + k, reg[k].ev === Phys.ENGINE_VERSION, 'ev ' + reg[k].ev + ' vs ' + Phys.ENGINE_VERSION); const eq = verifyDiscovery(Phys, k); check('discovery re-derives today: ' + k, !!eq); check('stored equation is the engine\'s own: ' + k, eq === reg[k].eq, reg[k].eq + ' vs ' + eq); });
const rej = path.join(ROOT, 'lab-cache', 'discoveries-rejected.json'); if(fs.existsSync(rej)){ const r = JSON.parse(fs.readFileSync(rej, 'utf8')); Object.keys(r.keys || {}).forEach(k => check('rejected discovery is not in the registry: ' + k, !reg[k])); }
// 2. the free-atom artefacts that older engines recorded are gone: a bare F means F2, and 'F → F2' is not a reaction
check('lone F (even with a catalyst) is not a reaction', !Phys.card({ keys: ['F'], T: 300, P: 1, cat: true }).ok);
check('F + H2SO4 balances against F2, never free F', (() => { const c = Phys.card({ keys: ['F', 'H2SO4'], T: 300, P: 1, cat: true }); return !c.ok || c.R.every(x => x[0] !== 'F'); })());
// 3. sweep: no card for any diatomic-atom reagent (alone or with a partner) may contain a free atom on either side
const DIA = ['H', 'N', 'O', 'F', 'Cl', 'Br', 'I'], atom = /^(H|N|O|F|Cl|Br|I)$/, partners = ['H2O', 'NaCl', 'H2SO4', 'HCl', 'NaOH', 'CH4', 'CO2', 'NH3', 'Na', 'Fe', 'Cu', 'Zn', 'C', 'S', 'CuO', 'SO2', 'NO', 'H2', 'O2', 'F2'];
let leaks = [], tried = 0;
DIA.forEach(a => [[a]].concat(partners.map(p => [a, p])).forEach(keys => [[300, 1], [700, 1], [1100, 10]].forEach(([T, P]) => [false, true].forEach(cat => { tried++; const c = Phys.card({ keys, T, P, cat }); if(c.ok && c.R.concat(c.Pr).some(x => atom.test(x[0]))) leaks.push(keys.join('+') + ' → ' + c.eq); }))));
check('no free-atom reactants or products in ' + tried + ' cards', leaks.length === 0, leaks.slice(0, 3).join(' | '));
// 4. the Haber/Ostwald chain still works (standard-state handling must not break the real processes)
check('Haber from N + H', Phys.card({ keys: ['N', 'H'], T: 700, P: 200, cat: true }).eq === 'N₂ + 3 H₂ → 2 NH₃');
check('Ostwald step 1', Phys.card({ keys: ['NH3', 'O2'], T: 300, P: 1, cat: true }).eq === '4 NH₃ + 5 O₂ → 4 NO + 6 H₂O');
console.log(n - bad + '/' + n + ' discovery checks passed'); process.exit(bad ? 1 : 0);
