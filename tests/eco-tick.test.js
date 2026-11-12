// node tests/eco-tick.test.js — runs .github/scripts/eco-tick.js (the real Action script) against an in-memory fake of firebase-admin, tick after tick.
const Module = require('module'), path = require('path'), assert = require('assert'), cp = require('child_process');
const E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js');
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 86400000, now0 = Date.now(); let tree = {};
const db0 = {}; S.genesis(db0, now0 - 2 * DAY, ['ogP']); tree = { eco: clone(db0.eco), world: clone(db0.world), market: { listings: { 'u1-a': { u: 'p1', n: 'Pat', f: 'H2O', p: 5, q: 40, t: 1 } } } };
E.acctOf({ eco: tree.eco }, 'x'); // no-op shape check
const acct = tree.eco.acct; acct.p1 = Object.assign(E.newAcct(), { ob: 1 }); acct.p1.b = 10000000; acct.p1.sys.pool = -10000000; acct.p1.cl = acct.p1.si = acct.p1.bp = acct.p1.lop = acct.p1.hop = '';
const get = (p) => p.split('/').filter(Boolean).reduce((x, k) => x == null ? undefined : x[k], tree);
const set = (p, v) => { const k = p.split('/').filter(Boolean); let c = tree; for(let i = 0; i < k.length - 1; i++){ if(c[k[i]] == null || typeof c[k[i]] !== 'object') c[k[i]] = {}; c = c[k[i]]; } if(v === null) delete c[k[k.length - 1]]; else c[k[k.length - 1]] = clone(v); };
let pushN = 0; const fake = { initializeApp(){}, credential: { cert: x => x }, database: () => ({ ref: p => ({ once: async () => ({ val: () => { const v = get(p); return v === undefined ? null : clone(v); } }), update: async u => { Object.keys(u).forEach(k => set(k, u[k])); }, push: () => ({ key: 'k' + (pushN++) }) }) }) };
const orig = Module._load; Module._load = function(req, ...a){ return req === 'firebase-admin' ? fake : orig.call(this, req, ...a); };
process.env.FIREBASE_SERVICE_ACCOUNT = '{}'; process.env.FIREBASE_DATABASE_URL = 'https://x';
const script = path.join(__dirname, '../.github/scripts/eco-tick.js'); const src = require('fs').readFileSync(script, 'utf8').replace(/^#!.*\n/, '');
(async () => {
  for(let i = 0; i < 4; i++){
    let code = null; const realExit = process.exit; process.exit = c => { code = c; throw new Error('__exit'); }; const log = console.log; const out = []; console.log = (...a) => out.push(a.join(' '));
    try{ await new Function('require', '__dirname', 'process', 'console', 'return (async()=>{' + src.replace(/\(async \(\) => \{/, '').replace(/\}\)\(\)\.catch\([\s\S]*$/, '') + '})()')((r) => r.startsWith('.') ? require(path.resolve(path.dirname(script), r)) : require(r), path.dirname(script), process, console); }catch(e){ if(e.message !== '__exit') throw e; }
    process.exit = realExit; console.log = log; assert.ok(code === 0 || code === null, 'tick ' + i + ' exit code ' + code + '\n' + out.join('\n'));
    const A = E.audit({ eco: tree.eco }); assert.ok(A.ok && A.total === E.SUPPLY, 'ledger after tick ' + i + ': ' + JSON.stringify(A.bad)); console.log('tick ' + i + ': ' + (out.find(l => l.startsWith('changes')) || out.join(' | ')).slice(0, 120));
    tree.world.meta.t -= 25 * 60 * 1000; // pretend the previous step happened a while ago
  }
  assert.ok(tree.world.meta.t > 0 && Object.keys(tree.eco.bots).length >= 100); console.log('eco-tick ok');
})().catch(e => { console.error(e); process.exit(1); });
