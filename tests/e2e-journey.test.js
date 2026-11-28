// node tests/e2e-journey.test.js — a townsperson walks out of the front door to THEIR car, drives, parks at the kerb and walks to the door — in the real browser.
// node tests/e2e.test.js — boots the REAL site in headless Chromium against a fake Firebase whose rules are the real database.rules.json.
// Plays a new player through onboarding, trades, buys/sells houses, takes a loan, then tries to cheat — auditing the ledger after every step.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const H = require('./rules-harness.js'), E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js');
const ROOT = path.join(__dirname, '..'), FAKE = fs.readFileSync(path.join(__dirname, 'e2e/fake-firebase-browser.js'), 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let tree = {}; const seed = () => { const d = {}; S.genesis(d, Date.now(), ['uOG']); tree = { eco: JSON.parse(JSON.stringify(d.eco)), world: JSON.parse(JSON.stringify(d.world)), market: {}, leaderboard: {}, players: {} }; tree.world.req = undefined; };
const getAt = (p) => p.split('/').filter(Boolean).reduce((x, k) => x == null ? undefined : x[k], tree);
const q = (v, q) => { if(v == null || typeof v !== 'object') return v; if(q.orderBy && q.equalTo !== undefined){ const o = {}; Object.keys(v).forEach(k => { if(v[k] && v[k][q.orderBy] === q.equalTo) o[k] = v[k]; }); return o; } if(q.limit){ const ks = Object.keys(v).slice(-q.limit), o = {}; ks.forEach(k => { o[k] = v[k]; }); return o; } return v; };
const audit = () => { const A = E.audit({ eco: tree.eco }); assert.ok(A.ok && A.total === E.SUPPLY, 'LEDGER BROKEN: ' + JSON.stringify({ bad: A.bad, total: A.total, flight: A.flight, sc: A.sentMinusClaimed })); return A; };
const log = (...a) => console.log(...a); let failures = [];
async function newPlayer(browser, uid, email, name){
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), page = await ctx.newPage(), user = uid ? { uid, displayName: name, email, emailVerified: true, isAnonymous: false } : null;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|www\.gstatic\.com)/, r => r.abort());
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: r.request().url().includes('firebase-app-compat') ? FAKE : '' }));
  await page.exposeFunction('__fb', (op, a, b) => { if(op === 'get'){ const v = getAt(a); return v === undefined ? null : q(JSON.parse(JSON.stringify(v)), b || {}); }
    if(op === 'update'){ const now = Date.now(), up = JSON.parse(JSON.stringify(a), (k, v) => v && v['.sv'] === 'timestamp' ? now : v); const res = H.update(tree, up, now, uid ? H.mkAuth(uid, email) : null); if(res.ok){ tree = res.tree; return { ok: true }; } failures.push(uid + ': ' + res.why + ' @ ' + Object.keys(a).slice(0, 3).join(',')); return { ok: false, why: res.why }; } });
  await page.addInitScript(u => { window.__fbUser = u ? Object.assign(u, { getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: {} }) }) : null; }, user);
  page.on('pageerror', e => { failures.push(uid + ' PAGE ERROR: ' + e.message); log('  page error:', e.message); });
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) log('  console.error:', m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); return { page, ctx };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
(async () => {
  await new Promise(r => srv.listen(0, r)); seed(); const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try{
    const A = await newPlayer(browser, 'u1', 'tester@example.com', 'Tester'), pg = A.page;
    await pg.waitForSelector('#onb .card', { timeout: 20000 }); await pg.fill('#onb-name', 'Tester'); await pg.click('#onb-next'); await pg.waitForSelector('#onb-claim', { timeout: 10000 });
    await pg.click('#onb-claim'); await pg.waitForSelector('[data-pick]', { timeout: 15000 }); await pg.click('[data-pick]'); await pg.waitForSelector('#onb-done', { timeout: 15000 }); await pg.click('#onb-done'); await pg.waitForSelector('#onb', { state: 'detached' });
    assert.ok(await pg.evaluate(async () => OS.realworld.enter()), 'enter world'); await pg.waitForTimeout(3000);
    // find the moment somebody is walking out to their car (phase 1)
    let found = null; for(let k = 0; k < 60 && !found; k++){ await pg.evaluate(k => { RealWorld.timeShift = k * 15000; }, k); await pg.waitForTimeout(450); found = await pg.evaluate(() => { const b = OS.realworld.api()._bots().find(q => q.phase === 1 && q.vis); return b ? { n: b.n, x: b.x, z: b.z } : null; }); }
    assert.ok(found, 'somebody is walking to their car at some time'); log('  walker', found.n, 'at', Math.round(found.x), Math.round(found.z));
    await pg.evaluate(p => OS.realworld.travelTo(p.x + 8, p.z + 8, 0), found);
    // follow that citizen: record what exists for them each ~0.4 s
    const trace = []; let last = '', followed = false;
    for(let k = 0; k < 330; k++){ await pg.waitForTimeout(400); const r = await pg.evaluate(n => { const api = OS.realworld.api(), q = api._bots().find(b => b.n === n), V = api._V(), parked = V.list.find(x => x.npc === n);
        return q ? { phase: q.phase, vis: q.vis, car: !!q.isCar, cs: !!q.cs, parked: !!parked, rest: q.rest ? [Math.round(q.rest.x), Math.round(q.rest.z)] : null, x: q.x, z: q.z, gone: false } : null; }, found.n);
      if(!r) continue; const tag = [r.phase, r.vis ? 'seen' : 'hidden', r.car ? 'car' : '', r.cs ? 'phys' : '', r.parked ? 'parkedCar' : ''].join(' ').replace(/\s+/g, ' ').trim(); if(tag !== last){ trace.push(tag); last = tag; if(r.phase === 3 && !followed){ followed = true; await pg.evaluate(p => OS.realworld.travelTo(p.x + 7, p.z + 7, 0), { x: r.x, z: r.z }); } } if(r.phase === 0 && trace.length > 3 && trace.some(t => t.startsWith('3'))) break; }
    log('  journey seen on screen:', JSON.stringify(trace));
    assert.ok(trace.some(t => t.startsWith('1 seen') && t.includes('parkedCar')), 'walking out: the person is drawn and THEIR car stands parked at the kerb');
    assert.ok(trace.some(t => t.startsWith('2') && t.includes('car')), 'then they drive');
    assert.ok(trace.some(t => t.startsWith('3 seen')), 'and walk to the door after parking');
    assert.ok(trace[trace.length - 1].startsWith('0') && trace[trace.length - 1].includes('parkedCar'), 'finally inside, their car parked outside');
    const bad = failures.filter(f => /PAGE ERROR/.test(f)); assert.strictEqual(bad.length, 0, bad.join('\n'));
    console.log('\nE2E JOURNEY OK');
  }catch(e){ console.log('E2E FAILED:', e.message); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close(); process.exit(0);
})();
