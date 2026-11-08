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
console.log('flowsheet ok (' + n + ' trees checked)');
