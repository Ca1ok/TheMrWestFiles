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
    await pg.screenshot({ path: '/tmp/onb2.png', timeout: 150000 }); assert.strictEqual(tree.eco.acct.u1.b, 10000000, 'grant of $100,000 arrives'); assert.strictEqual(tree.eco.acct.u1.ob, 1); audit(); log('✓ welcome grant: $100,000 from the pool, ledger intact');
    await pg.click('[data-pick]'); await pg.waitForSelector('#onb-done', { timeout: 15000 });
    const home = tree.world.home.u1; assert.ok(home && home.h, 'a home was set'); const hs = tree.world.own[home.h]; assert.strictEqual(hs.t, 'u1'); assert.ok(tree.eco.acct.u1.sys.city > 0, 'first day of rent paid to the city'); audit(); log('✓ rented', home.h, 'for', hs.rh * 24 / 100, '/day — rent went to the city');
    await pg.click('#onb-done'); await pg.waitForSelector('#onb', { state: 'detached' });

    /* ---- the crime layer: break into a showroom car, get wanted, get chased, get busted, pay the fine ---- */
    await pg.evaluate(async () => { await OS.realworld.enter(); }); await pg.waitForTimeout(2500);
    const near = await pg.evaluate(() => { const L = window.RWLayout, p = L.poi('dealer'), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; }); await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), near); await pg.waitForTimeout(9000);
    const showCar = await pg.evaluate(() => { const l = OS.realworld.vehicles().list().filter(q => q.kind === 'car' && !q.slot); return l[0] ? { x: l[0].x, z: l[0].z, yaw: l[0].yaw, id: l[0].id } : null; }); assert.ok(showCar, 'the showroom has cars'); log('  showroom car:', showCar.id);
    await pg.evaluate(c => OS.realworld.travelTo(c.x + Math.cos(c.yaw) * 3.4, c.z + Math.sin(c.yaw) * 3.4, c.yaw + Math.PI / 2), showCar); await pg.waitForTimeout(6000);
    const cash0 = tree.eco.acct.u1.b, gov0 = tree.eco.acct.u1.sys.gov; let fired = false;
    for(let i = 0; i < 6 && !fired; i++){ await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500); fired = await pg.evaluate(() => document.querySelector('#rwLock').classList.contains('show')); if(!fired) await pg.evaluate(c => OS.realworld.travelTo(c.x + Math.cos(c.yaw) * 3.1, c.z + Math.sin(c.yaw) * 3.1, c.yaw + Math.PI / 2), showCar), await pg.waitForTimeout(3500); }
    assert.ok(fired, 'F next to a showroom car opens the lock-pick minigame'); log('✓ lock-pick minigame opened');
    for(let i = 0; i < 40; i++){ const open = await pg.evaluate(() => { const s = RealWorld.crimeState().lock; if(!s || s.state !== 'run') return false; s.pos = s.zone; return true; }); if(!open) break; await pg.keyboard.press('Space'); await pg.waitForTimeout(120); }
    await pg.waitForTimeout(1500); const ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds, 'cracked the lock and drove off'); const cs = await pg.evaluate(() => RealWorld.crimeState()); assert.ok(cs.wanted.stars >= 3, 'stealing from a dealership is at least 3 stars: ' + cs.wanted.stars); assert.ok(cs.rec.o.some(o => o.k === 'theftDealer'), 'the offence is on the record'); log('✓ stolen — wanted', cs.wanted.stars, 'stars');
    await pg.waitForFunction(() => RealWorld.crimeState().cops > 0, null, { timeout: 30000 }); log('✓ cops spawned:', await pg.evaluate(() => RealWorld.crimeState().cops));
    await pg.evaluate(() => OS.realworld.driveSet({ u: 0, v: 0, r: 0 })); await pg.keyboard.down('Space');   // handbrake: sit still so they can arrest you
    await pg.waitForFunction(() => RealWorld.crimeState().rec.n.arrests >= 1, null, { timeout: 150000 }).catch(() => {}); await pg.keyboard.up('Space');
    const fin = await pg.evaluate(() => RealWorld.crimeState()); log('  after the chase:', JSON.stringify({ arrests: fin.rec.n.arrests, stars: fin.wanted.stars, cops: fin.cops, stolen: fin.stolen })); assert.ok(fin.rec.n.arrests >= 1, 'the cops arrested the player');
    await pg.waitForTimeout(4000); const fin2 = await pg.evaluate(() => RealWorld.crimeState()); assert.ok(fin2.wanted.stars === 0 && fin.stolen === 0, 'wanted cleared and the stolen car impounded'); assert.strictEqual(await pg.evaluate(() => OS.realworld.driveState()), null, 'no longer driving');
    await pg.waitForTimeout(3500); const paid = (tree.eco.acct.u1.sys.gov - gov0) / 100; assert.ok(paid > 0 && paid <= 18 * 100 * 4 * 100, 'the fine went to the treasury: $' + paid); assert.ok(cash0 - tree.eco.acct.u1.b >= paid * 100 - 1, 'and left the wallet'); audit(); log('✓ busted: fine of $' + paid + ' paid to the treasury, ledger intact');
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors'); audit(); log('\nE2E CRIME OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
