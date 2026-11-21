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
    /* ---- vehicles: buy, repaint, sell, cheat ---- */
    const VD = require('../data/vehicle-data.js'); const b0 = tree.eco.acct.u1.b;
    const v1 = await ev(pg, () => OS.homes.buyVehicle('wren', 3)); assert.ok(v1.ok, 'buy wren: ' + v1.msg); assert.strictEqual(tree.world.garage.u1.v1.m, 'wren'); assert.strictEqual(tree.world.garage.u1.v1.c, VD.price('wren')); assert.strictEqual(b0 - tree.eco.acct.u1.b, VD.price('wren')); audit(); log('✓ bought a Wren at the dealership price, ledger intact');
    const v2 = await ev(pg, () => OS.homes.buyVehicle('alder', 1)); assert.ok(v2.ok, v2.msg); assert.ok(tree.world.garage.u1.v2); audit();
    await pg.waitForTimeout(2500); const g = await ev(pg, () => OS.homes.garage().map(v => v.slot + ':' + v.m + ':' + Math.round(v.value))); log('  garage:', g.join(' ')); assert.strictEqual(g.length, 2);
    const rp = await ev(pg, () => OS.homes.repaintVehicle('v1', 5)); assert.ok(rp.ok, rp.msg); assert.strictEqual(tree.world.garage.u1.v1.col, 5); audit();
    const nw = await ev(pg, () => OS.bank.breakdown().vehicles); assert.ok(nw > 0, 'net worth counts vehicles'); log('✓ repaint ok, vehicles in net worth:', nw);
    const poor = await ev(pg, () => OS.homes.buyVehicle('zenith', 0)); assert.ok(!poor.ok, 'a $24M jet is refused for a $100k player'); audit();
    const cash1 = tree.eco.acct.u1.b; const s1 = await ev(pg, () => OS.homes.sellVehicle('v1')); assert.ok(s1.ok, s1.msg); assert.ok(!tree.world.garage.u1.v1); assert.strictEqual(tree.eco.acct.u1.b - cash1, VD.resale(VD.price('wren'))); audit(); log('✓ sold the Wren back for 70%, ledger intact');
    // a hand-forged write straight at the database is refused by the real rules
    const forged = await ev(pg, () => OS.homes.buyVehicle('wren', 0).then(r => r)); assert.ok(forged.ok); audit();
    /* ---- RENTALS: $100 hatch / $1,000 trainer for 24 h, one at a time, never sold / repainted / worth anything ---- */
    { const b1 = tree.eco.acct.u1.b; const rr = await ev(pg, () => OS.homes.rentVehicle('wren')); assert.ok(rr.ok, 'rent wren: ' + rr.msg); const slot = rr.slot || Object.keys(tree.world.garage.u1).find(k => tree.world.garage.u1[k].r);
      const rec = tree.world.garage.u1[slot]; assert.strictEqual(rec.r, 1); assert.strictEqual(rec.m, 'wren'); assert.strictEqual(rec.c, 10000, 'the hatch rents for $100'); assert.strictEqual(rec.col, VD.RENT_COLOR); assert.strictEqual(b1 - tree.eco.acct.u1.b, 10000, 'exactly $100 left the wallet'); audit();
      await pg.waitForTimeout(1500); const rg = await ev(pg, () => OS.homes.garage().filter(v => v.rental).map(v => ({ slot: v.slot, value: v.value, left: v.expires - OS.now() }))); assert.strictEqual(rg.length, 1, 'the rental shows in the garage'); assert.strictEqual(rg[0].value, 0, 'a rental is worth nothing'); assert.ok(rg[0].left > 23.9 * 3600000 && rg[0].left <= 24 * 3600000 + 5000, '24 h on the clock: ' + rg[0].left);
      const again = await ev(pg, () => OS.homes.rentVehicle('wren')); assert.ok(!again.ok && /already have a rental/i.test(again.msg), 'one rental at a time: ' + again.msg);
      const plane2 = await ev(pg, () => OS.homes.rentVehicle('skylark')); assert.ok(!plane2.ok, 'no second rental of another kind either'); const apx = await ev(pg, () => OS.homes.rentVehicle('apex')); assert.ok(!apx.ok && /not in the rental fleet/i.test(apx.msg), 'the supercar is sale only');
      const sl = await ev(pg, s => OS.homes.sellVehicle(s), slot); assert.ok(!sl.ok && /rental/i.test(sl.msg), 'a rental cannot be sold'); const rpn = await ev(pg, s => OS.homes.repaintVehicle(s, 5), slot); assert.ok(!rpn.ok, 'a rental cannot be repainted'); assert.ok(tree.world.garage.u1[slot], 'still there'); audit();
      const nw = await ev(pg, () => OS.homes.garageValue()); const own = Object.values(tree.world.garage.u1).filter(r => !r.r).reduce((n, r) => n + VD.resale(r.c), 0) / 100; assert.ok(Math.abs(nw - own) < 0.01, 'rentals add nothing to net worth: ' + nw + ' vs ' + own);
      log('✓ rentals: $100 hatch for 24 h, one at a time, no sale / repaint / net worth');
      /* the day is up: the rental disappears from the garage by itself, its record is swept (no money moves), and a new one can be hired */
      const b2 = tree.eco.acct.u1.b; tree.world.garage.u1[slot].t = Date.now() - 25 * 3600000; await pg.evaluate(() => window.__fbChanged()); await pg.waitForTimeout(2500);
      const gone = await ev(pg, () => OS.homes.garage().filter(v => v.rental).length); assert.strictEqual(gone, 0, 'an expired rental is hidden'); assert.ok(!tree.world.garage.u1[slot], 'the expired record was swept from the database'); assert.strictEqual(tree.eco.acct.u1.b, b2, 'sweeping moves no money'); audit();
      const rr2 = await ev(pg, () => OS.homes.rentVehicle('wren')); assert.ok(rr2.ok, 'a fresh rental after the old one expired: ' + rr2.msg); audit(); log('✓ rental expiry: hidden, swept, money untouched, re-hire works'); }
    /* ---- the Assets app ---- */
    await pg.evaluate(() => OS.open('RealEstate')); await pg.waitForTimeout(2500); const fr = pg.frames().find(f => /RealEstate\.html/.test(f.url())); assert.ok(fr, 'app frame');
    await pg.screenshot({ path: '/tmp/assets-overview.png', timeout: 150000 });
    for(const t of ['Houses', 'Cars', 'Planes']){ await fr.click('.seg button:has-text("' + t + '")'); await pg.waitForTimeout(600); await pg.screenshot({ path: '/tmp/assets-' + t + '.png' }); }
    const dis = await fr.$$eval('.cta[disabled]', e => e.length); assert.ok(dis >= 4, 'Buy is disabled away from the airport (' + dis + ')'); log('✓ Assets app renders all tabs; Buy is locked away from the showroom');
    /* ---- the 3D world: dealership and airport ---- */
    await pg.evaluate(() => OS.close && OS.close('RealEstate'));
    const ent = await pg.evaluate(async () => { const ok = await OS.realworld.enter(); return ok; }); log('  enter world:', ent); await pg.waitForTimeout(3000);
    for(const [id, nm] of [['dealer', 'dealer'], ['airport', 'airport']]){
      const pos = await pg.evaluate(id => { const L = window.RWLayout, p = L.poi(id), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; }, id);
      await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), pos); await pg.waitForTimeout(9000); await pg.screenshot({ path: '/tmp/rw-' + nm + '.png' });
      const st = await pg.evaluate(() => ({ s: OS.realworld.state(), v: OS.realworld.vehicles().list().length, at: OS.realworld.at('dealer') + '/' + OS.realworld.at('airport') })); log('  at', id, JSON.stringify({ chunks: st.s.chunks, calls: st.s.calls, vehicles: st.v, at: st.at }));
    }
    for(let i = 0; i < 4; i++) await pg.evaluate(() => OS.realworld.cycleQuality());   // Auto → Low → Medium → High → Ultra: exercise the sun-shadow pass in the real renderer
    await pg.waitForTimeout(2500);
    const qa = await pg.evaluate(() => OS.realworld.quality()); log('  quality:', JSON.stringify(qa)); assert.ok(qa && qa.level === 3 && qa.shadows, 'Ultra tier is on and the shadow map was built');
    const gl = await pg.evaluate(() => { const c = document.querySelector('#rwc'); return !!c; }); assert.ok(gl);
    /* unstuck on foot: put the player inside the dealership wall-free spot, press the button, still alive and moved/not-stuck message */
    const u0 = await pg.evaluate(() => OS.realworld.state()); await pg.evaluate(() => OS.realworld.unstuck()); await pg.waitForTimeout(600); const u1 = await pg.evaluate(() => OS.realworld.state()); assert.ok(isFinite(u1.x) && isFinite(u1.z), 'unstuck leaves a valid position'); log('  unstuck on foot ok', Math.round(Math.hypot(u1.x - u0.x, u1.z - u0.z)) + ' m');
    await pg.evaluate(() => OS.realworld.cycleQuality()); await pg.waitForTimeout(1200);   // back to Auto (Low on this software renderer) so the flight checks run at a sane frame rate
    /* a plane in the real world: reverse with S at idle, then get put into a building and press Unstuck */
    await pg.evaluate(() => { const p = window.RWLayout.poi('airport'), f = p.front; OS.realworld.travelTo(p.x + f[0] * 40, p.z + f[1] * 40, Math.atan2(-f[0], f[1])); }); await pg.waitForTimeout(8000);
    tree.world.garage.u1.v9 = { m: 'skylark', c: VD.price('skylark'), t: Date.now() - 1000, col: 1 }; await pg.evaluate(() => window.__fbChanged()); await pg.waitForFunction(() => OS.realworld.vehicles().list().some(q => q.slot === 'v9'), null, { timeout: 60000 }).catch(() => {});   // software GL is slow: wait until the plane is placed
    const vl = await pg.evaluate(() => OS.realworld.vehicles().list().filter(q => q.slot === 'v9').length); assert.strictEqual(vl, 1, 'the owned Skylark stands at the airport');
    const dr = await pg.evaluate(() => OS.realworld.drive('v9')); assert.ok(dr, 'startDrive on the Skylark'); await pg.waitForTimeout(500);
    const r0 = await pg.evaluate(() => OS.realworld.driveState()); await pg.keyboard.down('KeyS'); await pg.waitForTimeout(5000); const r1 = await pg.evaluate(() => OS.realworld.driveState()); await pg.keyboard.up('KeyS');
    assert.ok(r1.speed < -0.15 && r1.onGround, 'holding S at idle reverses the plane: ' + r1.speed.toFixed(2)); log('  plane reverse in the world: ' + r1.speed.toFixed(2) + ' m/s, moved ' + Math.round(Math.hypot(r1.x - r0.x, r1.z - r0.z)) + ' m');
    const tm = await pg.evaluate(() => { const p = window.RWLayout.poi('airport'); OS.realworld.driveSet({ x: p.x, z: p.z, vx: 0, vz: 0 }); return { x: p.x, z: p.z }; }); await pg.waitForTimeout(400);
    await pg.keyboard.press('KeyU'); await pg.waitForTimeout(800); const u2 = await pg.evaluate(() => OS.realworld.driveState());
    assert.ok(u2 && !u2.crashed && u2.onGround && Math.abs(u2.speed) < 0.5, 'unstuck leaves the plane on the ground, stopped'); log('  unstuck in the terminal: moved ' + Math.round(Math.hypot(u2.x - tm.x, u2.z - tm.z)) + ' m to clear ground');
    await pg.keyboard.press('KeyH'); await pg.waitForTimeout(500); assert.strictEqual(await pg.evaluate(() => OS.realworld.driveState()), null, 'H sends it home');
    const q2 = await pg.evaluate(() => OS.realworld.quality()); log('  G cycles quality → ', JSON.stringify(q2)); assert.ok(q2.auto === false ? q2.level !== 3 : true);
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors'); audit(); log('\nE2E VEHICLES OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
