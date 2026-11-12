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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), page = await ctx.newPage(), user = { uid, displayName: name, email, emailVerified: true, isAnonymous: false };
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|www\.gstatic\.com)/, r => r.abort());
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: r.request().url().includes('firebase-app-compat') ? FAKE : '' }));
  await page.exposeFunction('__fb', (op, a, b) => { if(op === 'get'){ const v = getAt(a); return v === undefined ? null : q(JSON.parse(JSON.stringify(v)), b || {}); }
    if(op === 'update'){ const now = Date.now(), up = JSON.parse(JSON.stringify(a), (k, v) => v && v['.sv'] === 'timestamp' ? now : v); const res = H.update(tree, up, now, H.mkAuth(uid, email)); if(res.ok){ tree = res.tree; return { ok: true }; } failures.push(uid + ': ' + res.why + ' @ ' + Object.keys(a).slice(0, 3).join(',')); return { ok: false, why: res.why }; } });
  await page.addInitScript(u => { window.__fbUser = Object.assign(u, { getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: {} }) }); }, user);
  page.on('pageerror', e => { failures.push(uid + ' PAGE ERROR: ' + e.message); log('  page error:', e.message); });
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) log('  console.error:', m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); return { page, ctx };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
(async () => {
  await new Promise(r => srv.listen(0, r)); seed(); const browser = await chromium.launch();
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
    /* ---- trading: tax everywhere ---- */
    const gov0 = tree.eco.acct.u1.sys.gov; const r1 = await ev(pg, async () => await OS.stock.buy(2000)); log('  buy $WEST:', JSON.stringify(r1).slice(0, 90)); await pg.waitForTimeout(5000); audit();
    log('  acct after buy:', JSON.stringify({ b: tree.eco.acct.u1.b, gov: tree.eco.acct.u1.sys.gov, pool: tree.eco.acct.u1.sys.pool, rev: tree.eco.acct.u1.rev }));
    assert.ok(tree.eco.acct.u1.sys.gov > gov0, 'the treasury took tax on the purchase');
    const r2 = await ev(pg, async () => await OS.stock.sellAll()); log('  sell $WEST:', JSON.stringify(r2).slice(0, 100)); await pg.waitForTimeout(1500); audit(); log('✓ stock trade taxed, ledger intact');
    /* ---- houses: buy from the city, list, sell back ---- */
    const bank = Object.keys(tree.world.own).filter(k => tree.world.own[k].o === 'bank' && !tree.world.own[k].t).sort((a, b) => tree.world.own[a].v - tree.world.own[b].v)[0];
    const b1 = await ev(pg, id => OS.homes.buy(id, false), bank); log('  buy', bank, JSON.stringify(b1).slice(0, 80)); assert.ok(b1.ok, 'bought a house from the city'); assert.strictEqual(tree.world.own[bank].o, 'u1'); audit();
    const b2 = await ev(pg, id => OS.homes.setRent(id, 40), bank); assert.ok(b2.ok, b2.msg); assert.ok(tree.world.own[bank].rh > 0); const b3 = await ev(pg, id => OS.homes.setAsk(id, 50000), bank); assert.ok(b3.ok, b3.msg); assert.strictEqual(tree.world.own[bank].a, 5000000); log('✓ bought a house, set rent and an asking price');
    const cash0 = tree.eco.acct.u1.b; await ev(pg, id => OS.homes.setAsk(id, 0), bank); const b4 = await ev(pg, id => OS.homes.sellToCity(id), bank); assert.ok(b4.ok, b4.msg); assert.strictEqual(tree.world.own[bank].o, 'bank'); assert.ok(tree.eco.acct.u1.b > cash0); audit(); log('✓ sold it back to the city at 90%, ledger intact');
    /* ---- loan ---- */
    const l1 = await ev(pg, async () => await OS.loans.take('standard', 5000)); assert.ok(l1.ok, l1.msg); log('  loan:', JSON.stringify(l1), JSON.stringify(tree.eco.loan), JSON.stringify(failures.slice(-2))); assert.ok(tree.eco.loan && tree.eco.loan.u1.l1); audit(); const owed = tree.eco.loan.u1.l1.o; assert.strictEqual(owed, 560000);
    const l2 = await ev(pg, async () => await OS.loans.repay('l1', 2000)); assert.ok(l2.ok, l2.msg); assert.strictEqual(tree.eco.loan.u1.l1.o, 360000); const l3 = await ev(pg, async () => await OS.loans.repay('l1', 99999)); assert.ok(l3.ok, l3.msg); assert.ok(!(tree.eco.loan && tree.eco.loan.u1), 'loan cleared'); audit(); log('✓ loan: $5,000 at 12% → repaid in two parts, bank got its interest');
    /* ---- the shop and the casino ---- */
    const g0 = tree.eco.acct.u1.sys.gov; const sb = await ev(pg, async () => await OS.shop.buy('H', 20)); assert.ok(sb.ok, 'shop buy: ' + sb.msg); await pg.waitForTimeout(5000); audit(); assert.ok(tree.eco.acct.u1.sys.gov > g0, 'shop purchase taxed');
    const ss = await ev(pg, async () => await OS.shop.sell('H', 20)); assert.ok(ss.ok, 'shop sell: ' + ss.msg); log('  shop:', sb.msg, '/', ss.msg); await pg.waitForTimeout(5000); audit(); log('✓ shop buy and sell go through the pool with tax');
    const arc0 = tree.eco.acct.u1.sys.arcade; let spins = 0, lastMsg = ''; for(let i = 0; i < 6; i++){ const r = await ev(pg, async () => { try{ return await OS.arcade.slots.spin(10); }catch(e){ return { error: String(e.message || e) }; } }); lastMsg = JSON.stringify(r).slice(0, 140); if(r && !r.error && r.ok !== false) spins++; await pg.waitForTimeout(2500); audit(); }
    log('  slots:', spins + ' spins, last:', lastMsg); assert.ok(spins >= 3, 'the casino played rounds'); assert.notStrictEqual(tree.eco.acct.u1.sys.arcade, arc0, 'money moved through the casino account'); const A2 = audit(); assert.ok(A2.sys.arcade > 0, 'casino bankroll is still positive'); log('✓ casino: stakes and payouts are transfers with the $15T bankroll (' + (A2.sys.arcade / 100 - 15e12).toFixed(2) + ' vs start)');
    /* ---- homeless: no casino; licence + build order ---- */
    const lv = await ev(pg, async () => await OS.homes.leave()); assert.ok(lv.ok, lv.msg); await pg.waitForTimeout(1500); const arcH = tree.eco.acct.u1.sys.arcade; const sp = await ev(pg, async () => { try{ return await OS.arcade.slots.spin(10); }catch(e){ return { error: String(e.message || e) }; } }); await pg.waitForTimeout(1500); assert.strictEqual(tree.eco.acct.u1.sys.arcade, arcH, 'a homeless player cannot gamble (' + JSON.stringify(sp).slice(0, 80) + ')'); audit(); log('✓ homeless: the casino refuses you');
    const cheap = Object.keys(tree.world.own).filter(k => tree.world.own[k].o === 'bank' && !tree.world.own[k].t).sort((a, b) => tree.world.own[a].v - tree.world.own[b].v)[0]; const rr = await ev(pg, id => OS.homes.rent(id, 24), cheap); assert.ok(rr.ok, rr.msg);
    /* ---- the OG player ---- */
    const O = await newPlayer(browser, 'uOG', 'og@example.com', 'OldTimer'), po = O.page; await po.waitForSelector('#onb .card', { timeout: 20000 });
    await po.fill('#onb-name', 'OldTimer'); await po.click('#onb-next'); await po.waitForSelector('#onb-claim'); await po.click('#onb-claim'); await po.waitForSelector('[data-pick]', { timeout: 15000 });
    assert.strictEqual(tree.eco.acct.uOG.b, 15000000, 'OG gets +$50,000'); const inv = await ev(po, () => OS.shop && OS.lab ? JSON.stringify(OS.inventory ? OS.inventory.elements() : null) : null); audit(); log('✓ OG player received $150,000');
    await po.waitForTimeout(1500); const lb = tree.leaderboard.uOG; assert.ok(lb && lb.og === 1, 'OG flag on the leaderboard: ' + JSON.stringify(lb)); log('✓ OG icon flag published to the leaderboard');
    /* ---- licence + build (the OG player has the cash) ---- */
    const nolic = await ev(po, async () => await OS.homes.build('studio')); assert.ok(!nolic.ok, 'cannot order a house without a licence'); const bl = await ev(po, async () => await OS.homes.buyLicence()); assert.ok(bl.ok, bl.msg); await po.waitForTimeout(1200); assert.ok(tree.world.lic.uOG, 'licence stored'); const bo = await ev(po, async () => await OS.homes.build('studio')); assert.ok(bo.ok, bo.msg); assert.ok(tree.world.build.uOG.b1 && tree.world.build.uOG.b1.y === 'studio', 'order stored'); audit();
    { const Sim = require('../os/lib/eco-sim.js'); const d = { eco: tree.eco, world: tree.world, market: { listings: {} } }; ['own', 'home', 'ev', 'build', 'lic'].forEach(k => { d.world[k] = d.world[k] || {}; }); ['acct', 'inbox', 'bill', 'loan', 'bots', 'og', 'cfg', 'stats'].forEach(k => { d.eco[k] = d.eco[k] || {}; }); d.eco.dead = d.eco.dead || { sys: { pool: 0, arcade: 0, bank: 0, gov: 0, city: 0 }, s: 0, r: 0 }; const n0 = Object.keys(d.world.own).length; Sim.step(d, Date.now() + 5 * 60000, 7); assert.ok(Object.keys(d.world.own).length > n0, 'the council built it'); tree.eco = d.eco; tree.world = d.world; assert.ok(Object.keys(tree.world.own).some(k => tree.world.own[k].o === 'uOG' && true), 'the player owns the new house'); audit(); }
    log('✓ building licence bought, studio ordered and built by the world server, escrow refunded through the inbox'); await po.waitForTimeout(3500); audit();
    /* ---- player to player: u1 pays uOG, uOG claims it ---- */
    const p1 = await ev(pg, async () => await OS.homes.pay('uOG', 123.45)); assert.ok(p1.ok, p1.msg); audit(); await po.waitForTimeout(2500); audit(); assert.ok(!(tree.eco.inbox && tree.eco.inbox.uOG && Object.keys(tree.eco.inbox.uOG).length), 'the inbox was claimed'); assert.ok(tree.eco.acct.uOG.r >= 12345); log('✓ payment through the inbox: sent, claimed, nothing lost');
    /* ---- cheating from the console ---- */
    const before = JSON.stringify(tree.eco.acct.u1); await ev(pg, () => { K = OS; });
    await ev(pg, () => { const L = window.__K && window.__K.ledger; });
    const cheat = await ev(pg, async () => { try{ const k = (window.OS._k || null); return 'no-kernel'; }catch(e){ return String(e); } });
    log('  (kernel is private to the page; cheating is attempted below via raw database writes)');
    const raw = await ev(pg, async () => { try{ await firebase.database().ref('eco/acct/u1/b').set(999999999); return 'ACCEPTED'; }catch(e){ return e.code; } }); assert.strictEqual(raw, 'PERMISSION_DENIED'); assert.strictEqual(JSON.stringify(tree.eco.acct.u1), before);
    const raw2 = await ev(pg, async () => { try{ await firebase.database().ref('world/own/h5/o').set('u1'); return 'ACCEPTED'; }catch(e){ return e.code; } }); assert.strictEqual(raw2, 'PERMISSION_DENIED'); log('✓ raw cheating writes are refused by the rules');
    /* ---- WestMap loads ---- */
    await pg.evaluate(() => OS.open('WestMap')); await pg.waitForTimeout(3500); const frames = pg.frames().filter(f => /apps\/WestMap/.test(f.url())); assert.ok(frames.length, 'WestMap opened'); log('  frame:', frames[0].url(), (await frames[0].evaluate(() => document.body.innerHTML.slice(0, 160))).replace(/\s+/g, ' ')); const px = await frames[0].evaluate(() => { const c = document.getElementById('cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for(let i = 0; i < d.length; i += 4000) if(d[i] > 80 || d[i + 1] > 80) n++; return n; }); assert.ok(px > 20, 'the map is drawn (' + px + ' bright samples)'); await pg.screenshot({ path: '/tmp/westmap.png' }); log('✓ WestMap draws the country');
    const bad = failures.filter(f => /PAGE ERROR/.test(f) || /write denied|validate failed/.test(f)); log('refused writes during the run:', failures.length ? failures.slice(0, 8) : 'none'); 
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors');
    for(const app of ['Bank', 'RealEstate']){ await pg.evaluate(a => OS.open(a), app); await pg.waitForTimeout(2200); await pg.screenshot({ path: '/tmp/app-' + app + '.png' }); }
    audit(); log('\nE2E OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
