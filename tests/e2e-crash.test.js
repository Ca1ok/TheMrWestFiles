// node tests/e2e-crash.test.js — a REAL browser: crash a plane (explosion, burning wreck, tow back) and smash a car into a building (damage, smoke, engine loss). Harness copied from e2e-drive.test.js.
// (harness) node tests/e2e.test.js — boots the REAL site in headless Chromium against a fake Firebase whose rules are the real database.rules.json.
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
    const kb = pg.keyboard, drv = () => pg.evaluate(() => OS.realworld.vehicles().driving()), fxs = () => pg.evaluate(() => { const f = OS.realworld.api()._fx(); return f ? { n: f.count(), em: f.emitterCount(), flash: f.flash } : null; });
    assert.ok(await ev(pg, () => OS.realworld.enter()), 'enter world'); await pg.waitForTimeout(3000);
    /* ---- plane: dive into the ground ---- */
    const ap = await pg.evaluate(() => { const p = window.RWLayout.poi('airport'), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; }); await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), ap); await pg.waitForTimeout(9000);
    assert.ok(await pg.evaluate(() => { const V = OS.realworld.vehicles(), q = V.list().find(x => x.id === 'skylark'); return !!(q && V._drive(q)); }), 'get into the Skylark'); let d = await drv(); assert.strictEqual(d.kind, 'plane');
    assert.deepStrictEqual(await fxs(), { n: 0, em: 0, flash: 0 }, 'no effects before a crash');
    await pg.evaluate(() => { const dv = OS.realworld.api()._dv(), s = dv.s; s.onGround = false; s.y = s.y + 60; s.vy = -35; s.vx = 20; });
    let w = null; for(let i = 0; i < 120 && !(w && w.wreck); i++){ await pg.waitForTimeout(250); w = await pg.evaluate(() => OS.realworld.driveState()); } assert.ok(w && w.wreck, 'the crash starts the wreck sequence (plane still "driven", camera on the fireball)');
    const f1 = await fxs(); assert.ok(f1.n > 150 && f1.em >= 1, 'explosion particles + a burning-wreck emitter: ' + JSON.stringify(f1)); log('✓ plane crash: explosion with', f1.n, 'particles and a wreck fire');
    await pg.waitForTimeout(700); await pg.screenshot({ path: '/tmp/crash-plane-explosion.png' }); await pg.waitForTimeout(1500); await pg.screenshot({ path: '/tmp/crash-plane-smoke.png' });
    const t0 = Date.now(); while(await drv()){ if(Date.now() - t0 > 60000) throw new Error('plane never towed back'); await pg.waitForTimeout(300); }
    const f2 = await fxs(); assert.ok(f2.em >= 1, 'the wreck keeps burning after the tow: ' + JSON.stringify(f2)); log('✓ plane towed back, wreck still burning at the crash site');
    /* ---- car: into the dealership wall ---- */
    const r1 = await ev(pg, () => OS.homes.buyVehicle('alder', 0)); assert.ok(r1.ok, 'buy alder: ' + r1.msg); await pg.waitForTimeout(7000);
    const car = await pg.evaluate(() => { const q = OS.realworld.vehicles().mine()[0]; return { slot: q.slot, x: q.x, z: q.z }; });
    const dl = await pg.evaluate(() => { const p = window.RWLayout.poi('dealer'), f = p.front; return { x: p.x + f[0] * 26, z: p.z + f[1] * 26, yaw: Math.atan2(-f[0], f[1]) }; });
    await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), car); await pg.waitForTimeout(9000); await pg.evaluate(slot => OS.realworld.vehicles().enter(slot), car.slot); d = await drv(); assert.ok(d && d.kind === 'car');
    let dmg = 0, hits = 0; for(let run = 0; run < 6 && dmg < 0.5; run++){
      await pg.evaluate(p => { const dv = OS.realworld.api()._dv(), s = dv.s; s.x = p.x; s.z = p.z; s.yaw = p.yaw; s.u = 22; s.v = 0; s.r = 0; dv.hitAt = 0; }, dl); await kb.down('KeyW');
      for(let i = 0; i < 40; i++){ await pg.waitForTimeout(250); const st = await pg.evaluate(() => OS.realworld.driveState()); if(!st) break; dmg = st.dmg; if(i === 12 && run === 0) await pg.screenshot({ path: '/tmp/crash-car-hit.png' }); if(dmg >= 0.5 || (Math.abs(st.speed) < 0.5 && i > 8)) break; } await kb.up('KeyW'); hits++; }
    assert.ok(dmg > 0.05, 'a wall hit damages the car: ' + dmg); log('✓ car hit the building:', hits, 'run(s), damage', dmg.toFixed(2));
    const f3 = await fxs(); assert.ok(f3.n > 0, 'sparks / smoke after the hit'); await pg.waitForTimeout(2500); await pg.screenshot({ path: '/tmp/crash-car-smoke.png' });
    const f4 = await fxs(); if(dmg >= 0.2) assert.ok(f4.em >= 1, 'a smoke emitter rides on the damaged car: ' + JSON.stringify(f4));
    await kb.press('KeyH'); await pg.waitForTimeout(1500); const f5 = await fxs(); assert.ok(!(await drv()), 'H ends the drive'); log('  emitters after H (car repaired, only the plane wreck left):', f5.em);
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors: ' + failures.join('|')); audit(); log('\nE2E CRASH OK');
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
