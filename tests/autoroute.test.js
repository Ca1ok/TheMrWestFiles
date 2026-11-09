// node tests/autoroute.test.js — WestFactory's auto-planner: every molecule WestLab knows gets a staged plant planned from WestLab's own reactions.
const assert = require('assert'), fs = require('fs'), path = require('path'), F = require('../os/lib/factory-sim.js');
const root = path.join(__dirname, '..'), { Chem } = require('../.github/scripts/westlab-loader.js')(root);
const NAMED = new Function(fs.readFileSync(path.join(root, 'data/chem-data.js'), 'utf8').replace(/if\(typeof module[^\n]*\n?/g, '') + ';return NAMED_REACTIONS;')();
const lab = F.labFrom(Chem, NAMED), AP = { H: 2, N: 7, O: 4, S: 3, C: 5, Na: 6, Cl: 4, Ca: 6 };
const compOf = sp => { const q = Chem.speciesOf(sp); return q && q.kind !== 'element' && q.comp && Object.keys(q.comp).length > 1 ? q.comp : null; };
const sheet = (f, rate) => F.flowsheet(f, { lab, found: [f], rate: rate == null ? 10 : rate, atomPrice: e => AP[e] || 5, compOf });
const atoms = sp => Chem.parse(sp), add = (t, sp, k) => { const c = atoms(sp); Object.keys(c).forEach(a => { t[a] = (t[a] || 0) + c[a] * k; }); };
let staged = 0, plain = 0;
Chem.registryList().forEach(r => {
  const f = r.formula; if(!compOf(f) || F.elemOf(f)) return; const sh = sheet(f), g = F.graphFromSheet(sh);
  assert(sh.stable && isFinite(sh.unit) && sh.unit > 0, f + ' prices'); assert(g.nodes.length <= 24 && g.wires.length <= 48, f + ' fits one plant: ' + g.nodes.length + ' nodes');
  const inn = {}, out = {}; sh.feeds.forEach(x => add(inn, x.sp, x.mol)); add(out, f, 10); sh.surplus.forEach(x => add(out, x.sp, x.mol)); sh.reactors.forEach(x => Object.keys(x.loss).forEach(sp => add(out, sp, x.loss[sp])));
  new Set(Object.keys(inn).concat(Object.keys(out))).forEach(a => assert(Math.abs((inn[a] || 0) - (out[a] || 0)) < 1e-6 * Math.max(1, inn[a] || 0), f + ': atoms of ' + a + ' balance'));
  const s2 = F.graphSheet(g, { f, rate: 10, found: [f], lab, atomPrice: e => AP[e] || 5, compOf }); assert(s2.producing, f + ' graph produces: ' + JSON.stringify(s2.issues)); assert(Math.abs(s2.unit - sh.unit) < 1e-6, f + ' graph prices like the tree');
  sh.mode === 'process' ? staged++ : plain++;
  sh.reactors.filter(x => x.kind !== 'formation').forEach(x => { const rc = F.recipeOf(x.rc, compOf, undefined, lab) || F.RECIPES[x.rc]; assert(rc, f + ': recipe ' + x.rc + ' resolves'); const want = Object.keys(rc.out).map(k => Chem.speciesOf(k).key).sort().join(); const ok = Chem.solve(Object.keys(rc.in), ['heat', 'catalyst', 'pressure', 'spark']); assert(ok && ok.ok && ok.products.map(q => q.s.key).sort().join() === want, f + ': WestLab runs ' + x.eq); });
});
assert(staged > 80, 'most compounds get a staged plant (' + staged + ' staged, ' + plain + ' plain)');
const names = f => sheet(f).reactors.map(x => x.main).join('>');                       // spot checks: the staging follows real chemistry
assert.strictEqual(names('HNO3'), 'NH3>NO>NO2>HNO3'); assert.strictEqual(names('H2SO4'), 'SO3>H2SO4'); assert.strictEqual(names('CuSO4'), 'CuO>SO3>H2SO4>CuSO4'); assert.strictEqual(names('NH4Cl'), 'NH3>HCl>NH4Cl'); assert.strictEqual(names('Na2SO4'), 'SO3>H2SO4>Na2SO4'); assert.strictEqual(names('Ca(OH)2'), 'CaO>Ca(OH)2');
// a graph with an auto recipe id survives a round trip (the id is re-derived from WestLab, never stored as data)
const cu = F.graphFromSheet(sheet('CuSO4')); assert(cu.nodes.some(n => n.t === 'rx' && /^CuO<Cu\+O2$/.test(n.rc)));
assert.strictEqual(F.recipeOf('CuSO4<CuO+H2SO4', compOf, undefined, lab).eq.replace(/\s/g, ''), 'CuO+H₂SO₄→CuSO₄+H₂O'); assert.strictEqual(F.recipeOf('CuSO4<Au+Hg', compOf, undefined, lab), null, 'a made-up recipe id is refused');
console.log('autoroute ok (' + staged + ' staged plants, ' + plain + ' built straight from the elements)');
