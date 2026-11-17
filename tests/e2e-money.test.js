// node tests/e2e-money.test.js — every balance display must equal OS.cash() (dollars) and Buy must be enabled for affordable cars. (Copied harness from e2e-vehicles.)
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
    await pg.evaluate(() => OS.realworld.enter()); await pg.waitForTimeout(3500);
    const dealer = await pg.evaluate(() => { const p = window.RWLayout.poi('dealer'), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; });
    await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), dealer); await pg.waitForTimeout(6000);
    const r = await pg.evaluate(() => ({ cash: OS.cash(), hud: document.querySelector('#rwCash').textContent, cashAcc: null }));
    const fmt = n => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); assert.strictEqual(Math.round(r.cash * 100), tree.eco.acct.u1.b, 'OS.cash() is the ledger in dollars'); assert.strictEqual(r.hud, fmt(r.cash), 'real-world HUD shows OS.cash(): ' + r.hud); log('✓ real-world HUD = OS.cash() =', r.hud);
    await pg.evaluate(() => OS.realworld.phone(true)); await pg.waitForTimeout(500);
    await pg.evaluate(() => OS.open('RealEstate')); await pg.waitForTimeout(2500);
    const fr = pg.frames().find(f => /RealEstate\.html/.test(f.url()));
    if(fr){ await fr.click('.seg button:has-text("Cars")'); await pg.waitForTimeout(800); const info = await fr.$$eval('.cta', e => e.map(b => b.disabled)); assert.ok(info.slice(0, 4).every(d => d === false), 'cars up to $720k are affordable for $100k+? only the cheap ones: ' + JSON.stringify(info)); log('✓ Buy enabled for affordable cars:', JSON.stringify(info)); }
    else assert.fail('no assets frame');
    await pg.evaluate(() => OS.open('Bank')); await pg.waitForTimeout(2000);
    const bf = pg.frames().find(f => /Bank\.html/.test(f.url())); assert.ok(bf, 'bank frame'); const hero = await bf.$eval('.hero', e => e.textContent); assert.ok(hero.includes(fmt(r.cash)), 'Bank app shows the same cash: ' + hero); log('✓ Bank app shows the same balance');
    log('\nE2E MONEY OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
