// node tests/e2e-hotwire.test.js — the REAL site in headless Chromium (fake Firebase, real rules): steal a showroom CAR and a showroom PLANE.
// Break-in (lock-pick) puts you in a DEAD vehicle; a second minigame (hotwire, #rwHot) must be won before the engine runs. Also: wrong terminals, failure → alarm + fresh puzzle,
// Esc climbs out, getting back in asks again, keys cannot leak into a dead car, a wrecked stolen plane is impounded where it fell, wanted level + record, ledger intact.
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
const onboard = async (pg, name) => { await pg.waitForSelector('#onb .card', { timeout: 20000 }); await pg.fill('#onb-name', name); await pg.click('#onb-next'); await pg.waitForSelector('#onb-claim', { timeout: 10000 }); await pg.click('#onb-claim'); await pg.waitForSelector('[data-pick]', { timeout: 15000 }); await pg.click('[data-pick]'); await pg.waitForSelector('#onb-done', { timeout: 15000 }); await pg.click('#onb-done'); await pg.waitForSelector('#onb', { state: 'detached' }); audit(); };
const solveLock = async (pg) => { for(let i = 0; i < 40; i++){ const open = await pg.evaluate(() => { const s = RealWorld.crimeState().lock; if(!s || s.state !== 'run') return false; s.pos = s.zone; return true; }); if(!open) break; await pg.keyboard.press('Space'); await pg.waitForTimeout(120); } await pg.waitForTimeout(1200); };
const hotState = pg => pg.evaluate(() => { const h = RealWorld.crimeState().hot; return h ? { i: h.i, wires: h.wires, strikes: h.strikes, state: h.state, want: h.order[h.i], terms: h.terms.slice() } : null; });
const overlay = pg => pg.evaluate(() => document.querySelector('#rwHot').classList.contains('show'));
async function solveHot(pg){ for(let n = 0; n < 12; n++){ const h = await hotState(pg); if(!h) return; await pg.keyboard.press('Digit' + (h.terms.indexOf(h.want) + 1)); await pg.waitForTimeout(90); } }
const wrongSlot = h => h.terms.findIndex(wi => wi !== h.want);
async function stealNext(pg, kind, site, label){
  const near = await pg.evaluate(s => { const L = window.RWLayout, p = L.poi(s), f = p.front; return { x: p.x + f[0] * 34, z: p.z + f[1] * 34, yaw: Math.atan2(-f[0], f[1]) }; }, site); await pg.evaluate(p => OS.realworld.travelTo(p.x, p.z, p.yaw), near); await pg.waitForTimeout(9000);
  const target = await pg.evaluate(k => { const l = OS.realworld.vehicles().list().filter(q => q.kind === k && !q.slot && !q.stolen); return l[0] ? { x: l[0].x, z: l[0].z, yaw: l[0].yaw, id: l[0].id, n: l.length } : null; }, kind); assert.ok(target, 'the showroom has a ' + kind); log('  ' + label + ':', target.id, '(' + target.n + ' on show)');
  const hop = (d) => pg.evaluate(([c, d]) => OS.realworld.travelTo(c.x + Math.cos(c.yaw) * d, c.z + Math.sin(c.yaw) * d, c.yaw + Math.PI / 2), [target, d]); await hop(3.4); await pg.waitForTimeout(6000);
  let fired = false; for(let i = 0; i < 6 && !fired; i++){ await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500); fired = await pg.evaluate(() => document.querySelector('#rwLock').classList.contains('show')); if(!fired){ await hop(3.1); await pg.waitForTimeout(3500); } }
  assert.ok(fired, 'F next to the ' + kind + ' opens the lock-pick'); return target;
}
(async () => {
  await new Promise(r => srv.listen(0, r)); seed(); const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try{
    const A = await newPlayer(browser, 'u1', 'tester@example.com', 'Tester'); let pg = A.page; await onboard(pg, 'Tester'); log('✓ new player onboarded');

    /* ============ A · a showroom CAR ============ */
    await pg.evaluate(async () => { await OS.realworld.enter(); }); await pg.waitForTimeout(2500);
    await stealNext(pg, 'car', 'dealer', 'showroom car'); await solveLock(pg);
    let ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.kind === 'car' && ds.stolen, 'the lock is picked: you are sitting in the stolen car'); assert.strictEqual(ds.engine, false, 'but the engine is DEAD');
    assert.ok(await overlay(pg), 'the hotwire panel is open'); let h = await hotState(pg); assert.ok(h && h.wires >= 3 && h.i === 0 && h.strikes === 0, 'a fresh hotwire puzzle'); assert.strictEqual(await pg.evaluate(() => document.querySelectorAll('#rwHot .tile').length), h.wires, 'one terminal tile per wire'); log('✓ in the car, engine dead, hotwire open (' + h.wires + ' wires)');
    const p0 = await pg.evaluate(() => { const d = OS.realworld.driveState(); return [d.x, d.z]; }); await pg.keyboard.down('KeyW'); await pg.keyboard.press('KeyE'); await pg.keyboard.press('KeyH'); await pg.waitForTimeout(1500); await pg.keyboard.up('KeyW');
    ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.engine === false, 'E / H / W do not leak through the open panel: still in the dead car'); assert.ok(Math.hypot(ds.x - p0[0], ds.z - p0[1]) < 0.3, 'a dead car does not move');
    await pg.keyboard.press('Digit' + (wrongSlot(h) + 1)); await pg.waitForTimeout(150); let h2 = await hotState(pg); assert.strictEqual(h2.strikes, 1, 'a wrong terminal is a strike'); assert.strictEqual(h2.i, 0, 'and no progress'); log('✓ wrong terminal = strike, keys held');
    await solveHot(pg); ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.engine === true, 'engine runs after the last wire'); assert.ok(!(await overlay(pg)), 'panel closes'); assert.strictEqual(await hotState(pg), null);
    const cs = await pg.evaluate(() => RealWorld.crimeState()); assert.ok(cs.wanted.stars >= 3, 'dealership theft is wanted: ' + cs.wanted.stars); log('✓ hotwired — engine on, wanted ' + cs.wanted.stars + '★');
    const p1 = await pg.evaluate(() => { const d = OS.realworld.driveState(); return [d.x, d.z]; }); await pg.keyboard.down('KeyW'); let moved = true; await pg.waitForFunction(([x, z]) => { const d = OS.realworld.driveState(); return d && Math.hypot(d.x - x, d.z - z) > 1.5; }, p1, { timeout: 90000, polling: 250 }).catch(() => { moved = false; }); await pg.keyboard.up('KeyW');   // the software-GL sim runs slower than real time: wait for the state, not a duration
    assert.ok(moved, 'and the car now drives'); log('✓ the stolen car drives');
    // leave and come back: it is already wired, no second hotwire
    await pg.evaluate(() => { OS.realworld.driveSet({ u: 0, v: 0, r: 0 }); }); await pg.waitForTimeout(600); await pg.evaluate(() => OS.realworld.vehicles().exit()); await pg.waitForTimeout(800); assert.strictEqual(await pg.evaluate(() => OS.realworld.driveState()), null, 'got out');
    await pg.evaluate(() => OS.realworld.vehicles()._drive(OS.realworld.vehicles().list().find(q => q.stolen))); await pg.waitForTimeout(500); ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.engine === true && !(await overlay(pg)), 'a car you already hotwired starts straight away'); log('✓ re-entering a wired car needs no second hotwire');

    /* ============ B · a showroom PLANE (a second player: clean wanted level, and a fresh GL context — software GL cannot re-enter the world in the same page) ============ */
    await A.ctx.close(); const B = await newPlayer(browser, 'u2', 'tester2@example.com', 'Tester2'); pg = B.page; await onboard(pg, 'Tester2'); await pg.evaluate(async () => { await OS.realworld.enter(); }); await pg.waitForTimeout(2500);
        const plane = await stealNext(pg, 'plane', 'airport', 'showroom plane'); await solveLock(pg);
    ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.kind === 'plane' && ds.stolen, 'the cockpit lock is picked: you are in the stolen plane (no "keyed to the owner" block)'); assert.strictEqual(ds.engine, false, 'the plane is dead too'); assert.ok(await overlay(pg), 'hotwire panel open for the plane');
    h = await hotState(pg); assert.ok(h.wires >= 4, 'aircraft are harder: ' + h.wires + ' wires'); let cs2 = await pg.evaluate(() => RealWorld.crimeState()); assert.ok(cs2.wanted.stars >= 3, 'stealing an aircraft is serious: ' + cs2.wanted.stars + '★'); assert.ok(cs2.rec.o.some(o => o.k === 'aircraft') && cs2.rec.o.some(o => o.k === 'theftDealer'), 'aircraft + grand theft on the record');
    const left = await pg.evaluate(k => OS.realworld.vehicles().list().filter(q => q.kind === k && !q.slot && !q.stolen).length, 'plane'); assert.strictEqual(left, plane.n - 1, 'the showroom is one plane short');
    log('✓ in the stolen plane, engine dead, ' + h.wires + ' wires, wanted ' + cs2.wanted.stars + '★');
    // fail on purpose: 3 wrong terminals = short circuit = alarm offence + a fresh puzzle
    const stars0 = cs2.wanted.stars; for(let k = 0; k < 3; k++){ const hh = await hotState(pg); await pg.keyboard.press('Digit' + (wrongSlot(hh) + 1)); await pg.waitForTimeout(150); }
    h2 = await hotState(pg); assert.ok(h2 && h2.state === 'run' && h2.strikes === 0 && h2.i === 0, 'a fresh puzzle after the short circuit'); cs2 = await pg.evaluate(() => RealWorld.crimeState()); assert.ok(cs2.rec.o.some(o => o.k === 'alarm'), 'the failed hotwire set the alarm off (on the record)'); assert.ok(cs2.wanted.stars >= stars0, 'and did not reduce the wanted level'); log('✓ failed hotwire → alarm offence, new puzzle');
    // climb out with Esc; the plane stays where it is, still stolen; E gets in and asks again
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(800); assert.strictEqual(await pg.evaluate(() => OS.realworld.driveState()), null, 'Esc climbs out of the dead plane'); assert.ok(!(await overlay(pg)));
    const st = await pg.evaluate(() => OS.realworld.vehicles().list().find(q => q.stolen && q.kind === 'plane')); assert.ok(st, 'the stolen plane stays parked'); assert.strictEqual(st.wired, false);
    await pg.evaluate(() => OS.realworld.vehicles()._drive(OS.realworld.vehicles().list().find(q => q.stolen && q.kind === 'plane'))); await pg.waitForTimeout(500); assert.ok(await overlay(pg), 'getting back in a not-yet-wired plane opens the hotwire again'); log('✓ Esc climbs out, getting back in re-opens the hotwire');
    await solveHot(pg); ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(ds && ds.engine === true && ds.kind === 'plane', 'plane engine running'); log('✓ plane hotwired');
    await pg.keyboard.down('KeyW'); let thr = true; await pg.waitForFunction(() => { const d = OS.realworld.driveState(); return d && d.throttle > 0.2; }, null, { timeout: 90000, polling: 250 }).catch(() => { thr = false; }); await pg.keyboard.up('KeyW'); ds = await pg.evaluate(() => OS.realworld.driveState()); assert.ok(thr, 'throttle responds once the engine runs: ' + (ds && ds.throttle)); log('✓ the stolen plane takes throttle');
    // wreck it: impounded, you stay where it fell (not teleported to some showroom car)
    const at = await pg.evaluate(() => { const d = OS.realworld.driveState(); return [d.x, d.z]; }); await pg.evaluate(() => OS.realworld.driveSet({ crashed: 'You crashed.' })); await pg.waitForTimeout(1500);
    assert.strictEqual(await pg.evaluate(() => OS.realworld.driveState()), null, 'a wreck ends the drive'); const me = await pg.evaluate(() => { const s = OS.realworld.state(); return [s.x, s.z]; }); assert.ok(Math.hypot(me[0] - at[0], me[1] - at[1]) < 20, 'you stay by the wreck, not warped to a showroom: ' + Math.round(Math.hypot(me[0] - at[0], me[1] - at[1])) + ' m');
    assert.strictEqual((await pg.evaluate(() => RealWorld.crimeState())).stolen, 0, 'the wreck is impounded'); log('✓ crashed stolen plane: impounded, player stays put');
    assert.ok(!failures.some(f => /PAGE ERROR/.test(f)), 'no page errors: ' + failures.join(' | ')); audit(); log('\nE2E HOTWIRE OK');
  }catch(e){ console.error('E2E FAILED:', e.message); console.error(failures.slice(0, 10)); try{ await (await browser.contexts())[0].pages()[0].screenshot({ path: '/tmp/hotwire-fail.png' }); }catch(_){} await browser.close(); srv.close(); process.exit(1); }
  await browser.close(); srv.close();
})();
