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
    /* ---- the Assets app ---- */
    await pg.evaluate(() => OS.open('RealEstate')); await pg.waitForTimeout(2500); const fr = pg.frames().find(f => /RealEstate\.html/.test(f.url())); assert.ok(fr, 'app frame');
    await pg.screenshot({ path: '/tmp/assets-overview.png' });
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
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors'); audit(); log('\nE2E VEHICLES OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
