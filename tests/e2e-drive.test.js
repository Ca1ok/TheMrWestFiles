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
    /* ---- drive: a car (bought), then a plane (the airport showcase one) ---- */
    const r1 = await ev(pg, () => OS.homes.buyVehicle('alder', 0)); assert.ok(r1.ok, 'buy alder: ' + r1.msg); await pg.waitForTimeout(2500);
    assert.ok(await pg.evaluate(async () => OS.realworld.enter()), 'enter world'); await pg.waitForTimeout(3000);
    const mine = await ev(pg, () => OS.realworld.vehicles().mine().map(q => ({ slot: q.slot, x: q.x, z: q.z, yaw: q.yaw }))); assert.strictEqual(mine.length, 1); const car = mine[0];
    await pg.evaluate(p => OS.realworld.travelTo(p.x + 3.5, p.z, 0), car); await pg.waitForTimeout(9000);
    assert.ok(await pg.evaluate(slot => OS.realworld.vehicles().enter(slot), car.slot), 'get into the car'); let d = await pg.evaluate(() => OS.realworld.vehicles().driving()); assert.ok(d && d.kind === 'car', 'driving a car'); log('✓ got into the Alder with E-enter');
    const kb = pg.keyboard, drv = () => pg.evaluate(() => OS.realworld.vehicles().driving()), until = async (fn, ms, what) => { const t0 = Date.now(); for(;;){ const d = await drv(); if(d && fn(d)) return d; if(Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what + ' ' + JSON.stringify(d)); await pg.waitForTimeout(250); } };   // software rendering is slow: the sim runs slower than real time, so wait for a state instead of a duration
    await kb.down('KeyW'); d = await until(d => d.speed > 6, 90000, 'the car to accelerate'); log('  W accelerates the car:', d.speed.toFixed(1), 'm/s'); await pg.screenshot({ path: '/tmp/drive-car-chase.png' });
    const y0 = d.yaw, dAng = a => Math.atan2(Math.sin(a - y0), Math.cos(a - y0)); await kb.down('KeyD'); d = await until(d => dAng(d.yaw) > 0.15, 60000, 'D to steer right'); await kb.up('KeyD'); log('  D steers right:', (dAng(d.yaw) * 57.3).toFixed(0), '°');
    await kb.press('KeyV'); await pg.waitForTimeout(600); await pg.screenshot({ path: '/tmp/drive-car-cockpit.png' }); await kb.press('KeyV');
    const vp = pg.viewportSize(); await pg.mouse.move(vp.width * 0.1, vp.height / 2); await pg.mouse.move(vp.width * 0.12, vp.height / 2); const y1 = (await drv()).yaw; d = await until(d => Math.atan2(Math.sin(d.yaw - y1), Math.cos(d.yaw - y1)) < -0.15, 60000, 'the cursor on the left to steer left'); await pg.mouse.move(vp.width / 2, vp.height / 2); log('  cursor left of centre steers left ✓');
    await kb.up('KeyW'); await kb.down('KeyS'); d = await until(d => Math.abs(d.speed) < 1.5, 90000, 'S to brake the car'); await kb.up('KeyS'); log('  S brakes the car to a stop');
    const parkAt = { x: d.x, z: d.z }; await kb.press('KeyE'); await pg.waitForTimeout(500); assert.strictEqual(await drv(), null, 'E gets you out'); const pp = await pg.evaluate(() => ({ x: OS.realworld.api()._P.x, z: OS.realworld.api()._P.z })); assert.ok(Math.hypot(pp.x - parkAt.x, pp.z - parkAt.z) > 1.2 && Math.hypot(pp.x - parkAt.x, pp.z - parkAt.z) < 6, 'you stand beside the car');
    const parked = await pg.evaluate(() => { const q = OS.realworld.vehicles().mine()[0]; return { x: q.x, z: q.z, pref: OS.prefs.get('rwVeh') }; }); assert.ok(Math.hypot(parked.x - parkAt.x, parked.z - parkAt.z) < 0.5 && Object.keys(parked.pref || {}).length === 1, 'the car stays where you left it, remembered in prefs'); log('✓ drove, steered (keys + mouse), braked, got out, the car stayed parked');
    /* plane: showcase Skylark on the apron, taxi to the runway, take off */
    const ap = await pg.evaluate(() => { const p = window.RWLayout.poi('airport'), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; }); await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), ap); await pg.waitForTimeout(9000);
    const started = await pg.evaluate(() => { const V = OS.realworld.vehicles(), q = V.list().find(x => x.id === 'skylark'); return !!(q && V._drive(q)); }); assert.ok(started, 'get into the Skylark'); d = await drv(); assert.strictEqual(d.kind, 'plane');
    await kb.press('KeyT'); await pg.waitForTimeout(11000); d = await drv(); const rwy = await pg.evaluate(() => window.RWTerrain ? window.RWTerrain.rwy() : null); log('  taxied to', d.x.toFixed(0), d.z.toFixed(0), 'runway', rwy && rwy.x0.toFixed(0)); assert.ok(d.x > 800 && Math.abs(d.z) < 2 && d.onGround, 'T puts the plane at the start of the runway'); await pg.screenshot({ path: '/tmp/drive-plane-runway.png' });
    await kb.down('KeyW'); let lifted = false, pulled = false; const t0 = Date.now(); while(!lifted && Date.now() - t0 < 240000){ await pg.waitForTimeout(300); d = await drv(); if(!d) throw new Error('lost the plane (crashed?)'); if(!pulled && d.speed > 27){ await kb.down('ArrowDown'); pulled = true; } if(!d.onGround && d.alt > 2) lifted = true; }
    log('  take-off: speed', d.speed.toFixed(1), 'm/s, altitude', d.alt.toFixed(1), 'm, x', d.x.toFixed(0)); assert.ok(lifted, 'the plane takes off from the runway'); d = await until(d => d.alt > 25, 120000, 'the plane to climb'); await kb.up('ArrowDown'); await pg.screenshot({ path: '/tmp/drive-plane-chase.png' });
    await kb.down('KeyD'); await pg.waitForTimeout(3000); await kb.up('KeyD'); await kb.press('KeyV'); await pg.waitForTimeout(800); await pg.screenshot({ path: '/tmp/drive-plane-cockpit.png' }); d = await drv(); log('  in the air:', d.alt.toFixed(0), 'm'); assert.ok(d.alt > 5 && !d.onGround, 'still flying');
    await kb.up('KeyW'); await kb.press('KeyH'); await pg.waitForTimeout(8000); assert.strictEqual(await drv(), null, 'H sends the plane home and ends the flight'); log('✓ taxi, take-off, banking, cockpit view, and back to the hangar');
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors'); audit(); log('\nE2E DRIVE OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
