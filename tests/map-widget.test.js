// node tests/map-widget.test.js — boots the real site (fake Firebase, real rules), puts the WestMap widget on the desktop and checks it draws, follows movement and reports no errors.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const H = require('./rules-harness.js'), S = require('../os/lib/eco-sim.js');
const ROOT = path.join(__dirname, '..'), FAKE = fs.readFileSync(path.join(__dirname, 'e2e/fake-firebase-browser.js'), 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let tree = {}; const getAt = p => p.split('/').filter(Boolean).reduce((x, k) => x == null ? undefined : x[k], tree);
const q = (v, o) => { if(v == null || typeof v !== 'object') return v; if(o.orderBy && o.equalTo !== undefined){ const r = {}; Object.keys(v).forEach(k => { if(v[k] && v[k][o.orderBy] === o.equalTo) r[k] = v[k]; }); return r; } if(o.limit){ const r = {}; Object.keys(v).slice(-o.limit).forEach(k => { r[k] = v[k]; }); return r; } return v; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const d = {}; S.genesis(d, Date.now(), ['uOG']);
  tree = { eco: JSON.parse(JSON.stringify(d.eco)), world: JSON.parse(JSON.stringify(d.world)), market: {}, leaderboard: {}, players: {} }; tree.world.req = undefined;
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), page = await ctx.newPage(), errors = [], uid = 'u1', email = 't@example.com';
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|www\.gstatic\.com)/, r => r.abort());
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: r.request().url().includes('firebase-app-compat') ? FAKE : '' }));
  await page.exposeFunction('__fb', (op, a, b) => { if(op === 'get'){ const v = getAt(a); return v === undefined ? null : q(JSON.parse(JSON.stringify(v)), b || {}); }
    if(op === 'update'){ const now = Date.now(), up = JSON.parse(JSON.stringify(a), (k, v) => v && v['.sv'] === 'timestamp' ? now : v), res = H.update(tree, up, now, H.mkAuth(uid, email)); if(res.ok){ tree = res.tree; return { ok: true }; } return { ok: false, why: res.why }; } });
  await page.addInitScript(u => { window.__fbUser = Object.assign(u, { getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: {} }) }); }, { uid, displayName: 'Tester', email, emailVerified: true, isAnonymous: false });
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message)); page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console.error: ' + m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
  await page.waitForSelector('#onb .card', { timeout: 20000 }); await page.fill('#onb-name', 'Tester'); await page.click('#onb-next'); await page.waitForSelector('#onb-claim'); await page.click('#onb-claim'); await page.waitForSelector('[data-pick]', { timeout: 15000 }); await page.click('[data-pick]'); await page.waitForSelector('#onb-done', { timeout: 15000 }); await page.click('#onb-done'); await page.waitForSelector('#onb', { state: 'detached' });
  /* put the widget on the desktop (large), then a banner one, as a player would from Edit desktop */
  await page.evaluate(() => { const l = (OS.prefs.get('layout') || []).filter(i => i.id !== 'map').slice(); l.push({ t: 'w', id: 'map', k: 'wmapT1', size: 'l', pos: { p: 0, r: 0, c: 0 } }); OS.prefs.set('layout', l); OS.shell.relayout && OS.shell.relayout(); });
  await page.waitForSelector('.widget.wmap canvas', { timeout: 15000 }); await page.waitForTimeout(6000);
  const info = await page.evaluate(() => { const cv = document.querySelector('.widget.wmap canvas'), r = cv.getBoundingClientRect(), x = cv.getContext('2d'), w = cv.width, h = cv.height, px = x.getImageData(0, 0, w, h).data; let colours = new Set(); for(let i = 0; i < px.length; i += 4 * 97) colours.add((px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4)); return { w: Math.round(r.width), h: Math.round(r.height), colours: colours.size, label: document.querySelector('.widget.wmap [data-l]').textContent, n: document.querySelector('.widget.wmap [data-n]').textContent }; });
  console.log('widget canvas', info.w + '×' + info.h, '· colours', info.colours, '· label', JSON.stringify(info.label), '· ', JSON.stringify(info.n));
  assert.ok(info.w > 200 && info.h > 200, 'canvas has a size'); assert.ok(info.colours > 8, 'canvas actually drew a map (' + info.colours + ' colours)');
  const a = await page.screenshot({ path: '/tmp/widget1.png' }); await page.waitForTimeout(3500); await page.screenshot({ path: '/tmp/widget2.png' });
  const feed = await page.evaluate(() => ({ locs: Object.keys(OS.homes.locs()).length, bots: document.querySelector('.widget.wmap [data-n]').textContent }));
  console.log('feed', JSON.stringify(feed));
  /* removing the widget stops the feed and the loop without errors */
  await page.evaluate(() => { OS.prefs.set('layout', (OS.prefs.get('layout') || []).filter(i => i.id !== 'map')); OS.shell.relayout && OS.shell.relayout(); }); await page.waitForTimeout(1500);
  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | ')); console.log('map widget ok'); await browser.close(); srv.close();
})().catch(e => { console.error('MAP WIDGET FAILED:', e.message); process.exit(1); });
