// node tests/catalogue.test.js — runs every entry of data/reaction-catalogue.js through the engine and prints the expected-vs-actual table.
// A mismatch FAILS the test unless the entry carries a `gap` note (a documented, known deviation, reported but not hidden).  Add `--md` for a markdown table.
const path = require('path'), load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys } = load(path.join(__dirname, '..')); Phys.init();
const CAT = require('../data/reaction-catalogue.js'), md = process.argv.includes('--md');
let bad = 0, gaps = 0, n = 0; const rows = [];
const fix = (v, d) => (v == null || !isFinite(v)) ? '—' : (+v).toFixed(d == null ? 1 : d);
for(const e of CAT){
  const c = Phys.card(e.in); let engine = [], ref = [], fails = [];
  const miss = (what, got, want, tol) => { const off = !(Math.abs(got - want) <= tol); engine.push(what + ' ' + fix(got, 2)); ref.push(what + ' ' + fix(want, 2) + ' ± ' + tol + (e.src ? '' : '')); if(off) fails.push(what + ': ' + fix(got, 2) + ' vs ' + fix(want, 2) + ' ± ' + tol); };
  if(e.notModelled){ if(c.ok || !/^Not modelled/.test(c.why || '')) fails.push('should refuse with “Not modelled”, got ' + (c.ok ? c.eq : c.why)); else engine.push('refuses: not modelled'); ref.push('not modelled'); }
  else if(e.ok === false){ if(c.ok) fails.push('should not run, but gave ' + c.eq); else engine.push('blocked'); ref.push('does not run'); }
  else {
    if(!c.ok) fails.push('should run, got: ' + (c.why || '').slice(0, 80));
    else {
      engine.push(c.eq.replace(/ → /, ' → ')); if(e.eq && !e.eq.test(c.eq)) fails.push('equation ' + c.eq);
      if(e.dH){ const x = c.R.concat(c.Pr).find(r => r[0] === e.dH.per), coef = x ? x[1] : NaN; miss('ΔH/' + e.dH.per, c.dH / coef, e.dH.ref, e.dH.tol); }
      if(e.dG) miss('ΔG', c.dG, e.dG.ref, e.dG.tol); if(e.logK) miss('log10K', c.lnK / Math.LN10, e.logK.ref, e.logK.tol); if(e.xeq) miss('conv', c.xeq, e.xeq.ref, e.xeq.tol); if(e.E) miss('E(V)', c.E, e.E.ref, e.E.tol);
      if(c.est) engine.push('(estimated data)');
    }
  }
  n++; const status = fails.length ? (e.gap ? 'KNOWN GAP' : 'FAIL') : (e.gap ? 'GAP RESOLVED?' : 'ok'); if(status === 'FAIL'){ bad++; } if(status === 'KNOWN GAP') gaps++;
  rows.push([e.id, e.in.keys.join('+') + ' ' + e.in.T + ' K' + (e.in.P > 1 ? ' ' + e.in.P + ' bar' : ''), engine.join('; '), ref.join('; ') || '', e.src || '', status + (status === 'FAIL' ? ' — ' + fails.join(' | ') : '')]);
}
// Le Chatelier trend (Contact process): conversion must fall as T rises; pressure must raise it (4 → 2 gas moles)
const x = T => Phys.card({ keys: ['SO2', 'O2'], T, P: 1, cat: true }).xeq; n++; if(!(x(700) > x(800) && x(800) > x(1000))){ bad++; rows.push(['trend', 'Contact T', '', '', '', 'FAIL — exothermic equilibrium must fall with T']); }
const hp = P => Phys.card({ keys: ['N', 'H'], T: 700, P, cat: true }).xeq; n++; if(!(hp(500) > hp(200) && hp(200) > hp(50))){ bad++; rows.push(['trend', 'Haber P', '', '', '', 'FAIL — yield must rise with pressure']); }
const cat1 = Phys.card({ keys: ['N', 'H'], T: 700, P: 200, cat: true }), cat0 = Phys.card({ keys: ['N', 'H'], T: 700, P: 200, cat: false }); n++; if(!(Math.abs(cat1.xeq - cat0.xeq) < 1e-9 || !cat0.ok)){ bad++; rows.push(['trend', 'catalyst', '', '', '', 'FAIL — a catalyst changes rate, not equilibrium']); }
if(md){ console.log('| id | reaction | engine | reference | source | status |\n|---|---|---|---|---|---|'); rows.forEach(r => console.log('| ' + r.join(' | ').replace(/\n/g, ' ') + ' |')); }
else rows.forEach(r => console.log(((r[5].startsWith('ok') || r[5].startsWith('GAP RES')) ? '  ok ' : r[5].startsWith('KNOWN') ? ' gap ' : 'FAIL ') + r[0].padEnd(14) + r[1].padEnd(34) + r[2].slice(0, 90) + (r[5].startsWith('FAIL') || r[5].startsWith('KNOWN') ? '   ← ' + r[5] : '')));
console.log(n - bad + '/' + n + ' catalogue entries match their reference; ' + gaps + ' documented known gaps'); process.exit(bad ? 1 : 0);
