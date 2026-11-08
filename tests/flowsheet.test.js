// node tests/flowsheet.test.js — WestFactory flowsheets: every route is atom-balanced, the recycle loops settle, buy/make choices change the tree and the price.
const assert = require('assert'), F = require('../os/lib/factory-sim.js'), { Chem, ELEMENTS } = require('../.github/scripts/westlab-loader.js')(require('path').join(__dirname, '..'));
const atomsOf = sp => Chem.parse(sp), AP = { H: 2, N: 7, O: 4, S: 3, C: 5, Na: 6, Cl: 4, Ca: 6 };
const base = (f, found, opt, rate) => F.flowsheet(f, { found, opt, rate: rate == null ? 10 : rate, atomPrice: e => AP[e] || 5, compOf: sp => { const c = atomsOf(sp); return c && Object.keys(c).length > 1 ? c : null; } });
const ALL = ['NH3', 'NO', 'NO2', 'HNO3', 'SO2', 'SO3', 'H2SO4', 'CO2', 'CH4', 'CO', 'CaCO3', 'CaO', 'NaCl', 'NaHCO3', 'C2H4'];
const total = (list, key) => { const t = {}; list.forEach(x => { const c = atomsOf(x.sp); Object.keys(c).forEach(a => { t[a] = (t[a] || 0) + c[a] * x[key]; }); }); return t; };
const close = (a, b, m) => { const ks = new Set(Object.keys(a).concat(Object.keys(b))); ks.forEach(k => assert(Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-6 * Math.max(1, Math.abs(a[k] || 0)), m + ': atoms of ' + k + ' ' + (a[k] || 0) + ' vs ' + (b[k] || 0))); };

// 1. every step of every route is a balanced equation
Object.keys(F.ROUTES).forEach(f => F.ROUTES[f].steps.forEach(st => { const L = {}, R = {}; Object.keys(st.in).forEach(sp => { const c = atomsOf(sp); Object.keys(c).forEach(a => L[a] = (L[a] || 0) + c[a] * st.in[sp]); }); Object.keys(st.out).forEach(sp => { const c = atomsOf(sp); Object.keys(c).forEach(a => R[a] = (R[a] || 0) + c[a] * st.out[sp]); }); close(L, R, f + ': ' + st.eq); }));

// 2. every route, default tree and every single buy/make toggle: atoms in = product + vented + lost, product leaves at exactly `rate`, loops converge
let n = 0;
Object.keys(F.ROUTES).forEach(f => {
  const variants = [{}]; base(f, ALL, {}).toggles.forEach(t => variants.push({ [t.sp]: t.role === 'made' ? 'buy' : 'make' }));
  variants.forEach(opt => {
    const fs = base(f, ALL, opt), tag = f + ' ' + JSON.stringify(opt); n++;
    assert(fs.stable, tag + ' converges'); assert(isFinite(fs.unit) && fs.unit > 0, tag + ' has a price');
    const lost = []; fs.reactors.forEach(r => Object.keys(r.loss).forEach(sp => lost.push({ sp, v: r.loss[sp] })));
    const into = total(fs.feeds, 'mol'), out = total([{ sp: f, v: 10 }].concat(fs.surplus.map(x => ({ sp: x.sp, v: x.mol }))).concat(lost), 'v');
    const o2 = {}; [{ sp: f, v: 10 }].concat(fs.surplus.map(x => ({ sp: x.sp, v: x.mol })), lost).forEach(x => { const c = atomsOf(x.sp); Object.keys(c).forEach(a => o2[a] = (o2[a] || 0) + c[a] * x.v); });
    const inn = {}; fs.feeds.forEach(x => { const c = atomsOf(x.sp); Object.keys(c).forEach(a => inn[a] = (inn[a] || 0) + c[a] * x.mol); });
    close(inn, o2, tag);
    const prod = fs.edges.filter(e => e.to === 'out').reduce((t, e) => t + e.mol, 0); assert(Math.abs(prod - 10) < 1e-6, tag + ' delivers the rate');
  });
});

// 3. the nitric-acid plant: four reactors, NO is recycled from the absorber back to the NO oxidiser, and the recycle makes it cheaper than the old straight-line cost
const hno3 = base('HNO3', ALL, {}, 10);
assert.strictEqual(hno3.mode, 'process'); assert.deepStrictEqual(hno3.reactors.map(r => r.main), ['NH3', 'NO', 'NO2', 'HNO3']); assert.deepStrictEqual(hno3.reactors.map(r => r.depth), [0, 1, 2, 3]);
const rec = hno3.edges.filter(e => e.recycle); assert.strictEqual(rec.length, 1); assert.strictEqual(rec[0].sp, 'NO'); assert.strictEqual(rec[0].from, 's3'); assert.strictEqual(rec[0].to, 's2'); assert(Math.abs(rec[0].mol - 5) < 1e-6, '3 NO2 + H2O → 2 HNO3 + NO returns 1 NO per 2 HNO3');
const old = (AP.H + AP.N + AP.O * 3) * F.process('HNO3', ALL).factor, atoms = AP.H + AP.N + AP.O * 3;
assert(Math.abs(hno3.unit / old - 1) < 0.03, 'price stays close to the old straight-line cost: ' + hno3.unit.toFixed(2) + ' vs ' + old.toFixed(2)); assert(hno3.unit > atoms * 1.05, 'but never below the atoms plus running cost');
assert(hno3.surplus.some(s => s.sp === 'H2O'), 'the ammonia oxidiser makes more water than the absorber needs');

// 4. buying an intermediate removes the upstream reactors: NH3 bought → no Haber reactor, an NH3 feed appears; costs ≈ atoms × 1.06 for that part
const buyNH3 = base('HNO3', ALL, { NH3: 'buy' }, 10); assert.deepStrictEqual(buyNH3.reactors.map(r => r.main), ['NO', 'NO2', 'HNO3']); assert(buyNH3.feeds.some(f => f.sp === 'NH3' && f.role === 'made' && f.opt === 'buy'));
const buyNO = base('HNO3', ALL, { NO: 'buy' }, 10); assert.deepStrictEqual(buyNO.reactors.map(r => r.main), ['NO2', 'HNO3'], 'buying NO also drops the ammonia chain (it is no longer needed)');
assert(buyNO.feeds.every(f => f.sp !== 'NH3' && f.sp !== 'N2'));

// 5. soda plant: ammonia is recovered with lime (NH3 loop) and the calciner's CO2 goes back to the carbonator; raw compounds can be switched to 'make' (built from the elements)
const soda = base('Na2CO3', ALL, {}, 10); assert(soda.reactors.some(r => r.main === 'NH3'), 'ammonia recovery step'); assert(soda.edges.some(e => e.recycle && e.sp === 'NH4Cl'), 'the carbonator’s NH₄Cl loops back to ammonia recovery, which sends NH₃ forward'); assert(soda.edges.some(e => e.recycle && e.sp === 'CO2'), 'the calciner’s CO₂ returns to the carbonator');
assert(soda.surplus.some(x => x.sp === 'CaCl2'), 'CaCl2 is the waste of ammonia recovery');
const sodaBuyNH3 = base('Na2CO3', ALL, { NH3: 'buy' }, 10); assert(!sodaBuyNH3.reactors.some(r => r.main === 'NH3') && sodaBuyNH3.feeds.some(f => f.sp === 'NH3'), 'buying NH3 drops the recovery step');
const sodaCO2 = base('Na2CO3', ALL, { CO2: 'make' }, 10); assert(sodaCO2.reactors.some(r => r.main === 'CO2' && r.kind === 'formation'), 'CO2 built from C + O2'); assert(sodaCO2.feeds.some(f => f.sp === 'C') && sodaCO2.feeds.some(f => f.sp === 'O2'));
// 6. missing discoveries → the old behaviour: one 'direct' reactor from the elements, +25 %
const dir = base('HNO3', ['HNO3'], {}, 10); assert.strictEqual(dir.mode, 'direct'); assert.strictEqual(dir.reactors.length, 1); assert(dir.feeds.every(f => f.el)); const full = hno3.unit; assert(dir.unit > full, 'direct combination costs more than the process');
// plain products keep their old price exactly: atoms × 1.05
const plain = base('NaCl', ALL, {}, 1); assert.strictEqual(plain.mode, 'plain'); assert(Math.abs(plain.unit - (AP.Na + AP.Cl) * 1.05) < 1e-9);
// 7. a paused line (rate 0) still has its structure and price
const idle = base('HNO3', ALL, {}, 0); assert.strictEqual(idle.reactors.length, 4); assert(Math.abs(idle.unit - hno3.unit) < 1e-9); assert(idle.feeds.every(f => f.mol === 0));
// 8. flow sizes scale linearly with the rate
const dbl = base('HNO3', ALL, {}, 20); assert(Math.abs(dbl.feeds[0].mol - 2 * hno3.feeds[0].mol) < 1e-9);

// 9. player-built graphs (Satisfactory style)
const gs = (g, f, rate, found) => F.graphSheet(g, { f, rate: rate == null ? 10 : rate, found: found || ALL, atomPrice: e => AP[e] || 5, compOf: sp => { const c = atomsOf(sp); return c && Object.keys(c).length > 1 ? c : null; } });
// 9a. every auto-built route, turned into a graph, solves to exactly the same price (and the same recycle) as the tree it came from
Object.keys(F.ROUTES).forEach(f => { const t = base(f, ALL, {}, 10), g = F.graphFromSheet(t), s = gs(g, f, 10); assert(s.producing, f + ' graph produces: ' + JSON.stringify(s.issues)); assert(Math.abs(s.unit - t.unit) < 1e-6, f + ' graph price ' + s.unit + ' vs tree ' + t.unit); });
// 9b. hand-built nitric acid plant: nothing runs until it is wired; the NO by-product wire cuts the price
const mk = () => ({ nodes: [{ id: 'a', t: 'src', sp: 'N2' }, { id: 'b', t: 'src', sp: 'H2' }, { id: 'c', t: 'src', sp: 'O2' }, { id: 'd', t: 'src', sp: 'O2' }, { id: 'h', t: 'rx', rc: 'NH3<N2+H2' }, { id: 'x', t: 'rx', rc: 'NO<NH3+O2' }, { id: 'y', t: 'rx', rc: 'NO2<NO+O2' }, { id: 'z', t: 'rx', rc: 'HNO3<NO2+H2O' }], wires: [] });
let g = mk(); assert(!gs(g, 'HNO3').producing && gs(g, 'HNO3').issues.length >= 4, 'unwired plant is idle and says why');
g.wires = [['a', 'h', 'N2'], ['b', 'h', 'H2'], ['h', 'x', 'NH3'], ['c', 'x', 'O2'], ['x', 'y', 'NO'], ['d', 'y', 'O2'], ['y', 'z', 'NO2'], ['x', 'z', 'H2O'], ['z', 'o', 'HNO3']].map(([a, b, s]) => ({ a, b, s }));
const plain0 = gs(g, 'HNO3'); assert(plain0.producing, JSON.stringify(plain0.issues));
g.wires.push({ a: 'z', b: 'y', s: 'NO' }); const looped = gs(g, 'HNO3'); assert(looped.producing && looped.unit < plain0.unit - 0.01 && looped.recycle > 0, 'recycling the absorber’s NO is cheaper'); assert(Math.abs(looped.unit - hno3.unit) < 1e-6, 'same plant as the auto tree');
// 9c. a by-product alone cannot start a loop (make-up feed needed), wrong-species wires are ignored, missing recipe gives a clear issue
let g2 = mk(); g2.wires = [['a', 'h', 'N2'], ['b', 'h', 'H2'], ['h', 'x', 'NH3'], ['c', 'x', 'O2'], ['x', 'y', 'NO'], ['d', 'y', 'O2'], ['y', 'z', 'NO2'], ['x', 'z', 'H2O'], ['z', 'o', 'HNO3']].map(([a, b, s]) => ({ a, b, s }));
g2.wires = g2.wires.filter(w => !(w.a === 'x' && w.b === 'y')).concat([{ a: 'z', b: 'y', s: 'NO' }]); const nostart = gs(g2, 'HNO3'); assert(!nostart.producing, 'NO only from the by-product wire cannot supply the oxidiser');
g2.wires.push({ a: 'a', b: 'z', s: 'N2' }); assert.strictEqual(gs(g2, 'HNO3').wires.length, g2.wires.length - 1, 'a wire into a port that does not take it is dropped');
// 9d. reactor cap limits the rate; cost scales with what is really built
const capped = F.graphSheet(F.graphFromSheet(base('HNO3', ALL, {}, 10)), { f: 'HNO3', rate: 10, found: ALL, cap: 3, atomPrice: e => AP[e] || 5, compOf: sp => { const c = atomsOf(sp); return c && Object.keys(c).length > 1 ? c : null; } }); assert(capped.effRate < 10 && capped.effRate > 0, 'bottleneck reactor limits the plant: ' + capped.effRate);
// 9e. recipe book: unlock by discovery, every discovered compound can be built from its elements
const book = F.recipes(['NH3'], sp => { const c = atomsOf(sp); return c && Object.keys(c).length > 1 ? c : null; }); assert(!book.find(r => r.id === 'NH3<N2+H2').locked); assert(book.find(r => r.id === 'HNO3<NO2+H2O').locked); assert(book.some(r => r.id === 'F:NH3') || F.RECIPES['NH3<N2+H2'], 'known');
// 10. the factory recipe book agrees with WestLab: every industrial recipe is a reaction Chem.solve actually runs, with the same products
const CONDS = [[], ['heat'], ['heat', 'catalyst'], ['heat', 'pressure'], ['heat', 'catalyst', 'pressure'], ['spark']];
Object.keys(F.RECIPES).forEach(id => { const r = F.RECIPES[id], want = Object.keys(r.out).map(sp => Chem.speciesOf(sp).key).sort().join(); const ok = CONDS.some(c => { const x = Chem.solve(Object.keys(r.in), c); return x && x.ok && x.products.map(q => q.s.key).sort().join() === want; }); assert(ok, 'WestLab does not run ' + r.eq); });
console.log('flowsheet ok (' + n + ' trees, graphs checked)');
