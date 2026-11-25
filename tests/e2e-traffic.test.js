// node tests/e2e-traffic.test.js — NPC traffic (traffic.js) + other players' cars in the real browser. Header comment of the shared harness follows.
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
    /* ---- a brand-new player ---- */
    const A = await newPlayer(browser, 'u1', 'tester@example.com', 'Tester'), pg = A.page;
    await pg.waitForSelector('#onb .card', { timeout: 20000 }); log('✓ onboarding popup appears for a new player');
    await pg.fill('#onb-name', 'Tester'); await pg.click('#onb-next'); await pg.waitForSelector('#onb-claim', { timeout: 10000 });
    await pg.click('#onb-claim'); await pg.waitForSelector('[data-pick]', { timeout: 15000 });
    await pg.screenshot({ path: '/tmp/onb2.png' }); assert.strictEqual(tree.eco.acct.u1.b, 10000000, 'grant of $100,000 arrives'); assert.strictEqual(tree.eco.acct.u1.ob, 1); audit(); log('✓ welcome grant: $100,000 from the pool, ledger intact');
    await pg.click('[data-pick]'); await pg.waitForSelector('#onb-done', { timeout: 15000 });
    const home = tree.world.home.u1; assert.ok(home && home.h, 'a home was set'); const hs = tree.world.own[home.h]; assert.strictEqual(hs.t, 'u1'); assert.ok(tree.eco.acct.u1.sys.city > 0, 'first day of rent paid to the city'); audit(); log('✓ rented', home.h, 'for', hs.rh * 24 / 100, '/day — rent went to the city');
    await pg.click('#onb-done'); await pg.waitForSelector('#onb', { state: 'detached' });
    /* ---- traffic: find the moment when townspeople are driving, stand next to one, check the physical cars exist, are finite, collide and queue ---- */
    assert.ok(await pg.evaluate(async () => OS.realworld.enter()), 'enter world'); await pg.waitForTimeout(3000);
    let found = null; for(let k = 0; k < 40 && !found; k++){ await pg.evaluate(k => { RealWorld.timeShift = k * 120000; }, k); await pg.waitForTimeout(700); found = await pg.evaluate(() => { const b = OS.realworld.api()._bots().find(q => q.isCar && q.vis); return b ? { x: b.x, z: b.z } : null; }); }
    assert.ok(found, 'at some time of day NPCs are driving'); log('  a driver at', Math.round(found.x), Math.round(found.z));
    await pg.evaluate(p => OS.realworld.travelTo(p.x + 6, p.z + 6, 0), found); await pg.waitForTimeout(9000);
    let info = await pg.evaluate(() => { const bs = OS.realworld.api()._bots().filter(q => q.cs); return { n: bs.length, ok: bs.every(q => isFinite(q.cs.s.x) && isFinite(q.cs.s.z) && isFinite(q.cs.s.u)), maxU: Math.max(0, ...bs.map(q => q.cs.s.u)), tr: OS.realworld.api()._traffic() }; });
    log('  physical NPC cars:', JSON.stringify(info)); assert.ok(info.n >= 1 && info.ok, 'NPC cars are simulated with finite state'); assert.ok(info.maxU < 40, 'at sane speeds');
    /* ---- another player driving: inject a remote record the way net.js receives it ---- */
    const sync = await pg.evaluate(() => { const n = OS.realworld.api()._net(), P = OS.realworld.api()._P; n.others.set('ghost', { uid: 'ghost', x: P.x + 20, z: P.z, yaw: Math.PI / 2, tx: P.x + 20, tz: P.z, tyaw: Math.PI / 2, v: 2, c: 3, spd: 12, tpitch: 0, troll: 0, talt: 0, pitch: 0, roll: 0, alt: 0, seen: performance.now(), n: 'Ghost', ph: 0, mv: 0, tmv: 0, cell: 'x' }); return n.others.size; });
    await pg.waitForTimeout(2500); const g = await pg.evaluate(() => { const o = OS.realworld.api()._net().others.get('ghost'), P = OS.realworld.api()._P; return o ? { x: o.x - P.x, spd: o.spd } : null; }); log('  remote car moved to', JSON.stringify(g)); assert.ok(g && g.x > 21, 'a remote car is dead-reckoned along its heading');
    await pg.screenshot({ path: '/tmp/traffic.png', timeout: 120000 });
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors'); audit(); log('\nE2E TRAFFIC OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
