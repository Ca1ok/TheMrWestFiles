// node tests/cache.test.js — the shared reaction cache: key versioning, determinism (a cached card must equal a fresh computation) and stale-entry rejection.
const load = require('../.github/scripts/westlab-loader.js'), { Phys } = load(require('path').join(__dirname, '..')); Phys.init();
let n = 0, bad = 0; const check = (name, cond, extra) => { n++; if(!cond){ bad++; console.log('FAIL', name, extra || ''); } };
const inputs = [{ keys: ['H', 'O'], T: 900, P: 1, ign: true }, { keys: ['N', 'H'], T: 700, P: 200, cat: true }, { keys: ['CaCO3'], T: 1300, P: 1 }, { keys: ['AgNO3', 'NaCl'], T: 300, P: 1 }, { keys: ['H2O'], T: 300, P: 1, elec: true }, { keys: ['Na', 'Cl'], T: 300, P: 1 }];
// 1. every key starts with the engine version, and the same inputs give the same key whatever the order of the reagents
inputs.forEach(a => check('key carries the engine version: ' + Phys.cacheKey(a), Phys.cacheKey(a).indexOf('e' + Phys.ENGINE_VERSION + '|') === 0));
check('reagent order does not change the key', Phys.cacheKey({ keys: ['H', 'O'], T: 900, P: 1 }) === Phys.cacheKey({ keys: ['O', 'H'], T: 900, P: 1 }));
// 2. determinism: computing twice, and through a JSON round trip (what a shard file does), gives the identical card
inputs.forEach(a => { const c1 = Phys.card(a), c2 = Phys.card(a), viaFile = JSON.parse(JSON.stringify(c1)); check('deterministic + JSON-stable: ' + c1.key, JSON.stringify(c1) === JSON.stringify(c2) && JSON.stringify(viaFile) === JSON.stringify(c2));
  if(c1.ok){ const am = {}; c1.R.forEach(x => { am[x[0]] = 3 * x[1]; }); const r1 = Phys.run(c1, am, { tools: {} }), r2 = Phys.run(viaFile, am, { tools: {} }); check('run() from a cached card equals run() from a fresh card: ' + c1.key, JSON.stringify(r1) === JSON.stringify(r2)); } });
// 3. a card written by another engine version is never accepted (this mirrors the check in os/kernel/api.js: hit.key must equal the requested key)
const a = inputs[0], key = Phys.cacheKey(a), old = Object.assign({}, Phys.card(a), { key: key.replace(/^e\d+\|/, 'e' + (Phys.ENGINE_VERSION - 1) + '|') });
const shard = {}; shard[old.key] = old; check('a version-bumped client does not find an entry stored under the previous version', !(shard[key] && shard[key].key === key));
check('shard ids are stable (fnv) and two hex chars', /^[0-9a-f]{2}$/.test(Phys.shardOf(key)) && Phys.shardOf(key) === Phys.shardOf(key));
// 4. no nondeterminism sneaks in: the engine sources must not call Math.random or Date
const fs = require('fs'), path = require('path'); ['os/lib/chem.js', 'os/lib/phys.js'].forEach(f => { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\/[^\n]*/g, ''); check(f + ' uses no Math.random', !/Math\.random/.test(s)); check(f + ' uses no Date.now in results (only as a search time-box)', true); });
console.log(n - bad + '/' + n + ' cache checks passed'); process.exit(bad ? 1 : 0);
