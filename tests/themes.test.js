// node tests/themes.test.js — the theme engine: date windows (GTA VI Nov 19–26, Christmas Dec 18–Jan 1), manual vs automatic, accent override, 3D grade shape
const T = require('../os/themes/engine.js'); global.WestThemes = T;
['christmas', 'gta6', 'manual'].forEach(f => { const src = require('fs').readFileSync(__dirname + '/../os/themes/' + f + '.js', 'utf8'); new Function(src)(); });
let fails = 0; const ok = (c, m) => { if(!c){ fails++; console.error('FAIL', m); } };
const at = (y, m, d, h) => new Date(y, m - 1, d, h || 12), id = (o, d) => { const r = T.resolve(o, d); return r ? r.id : null; }, auto = { skin: 'auto' };

// GTA VI: Nov 19 00:00 → Nov 26 23:59 (2026 only)
ok(id(auto, at(2026, 11, 18, 23)) === null, 'GTA: not on Nov 18');
ok(id(auto, new Date(2026, 10, 19, 0, 0, 0)) === 'gta6', 'GTA: on at Nov 19 00:00');
ok(id(auto, at(2026, 11, 22)) === 'gta6', 'GTA: mid-window');
ok(id(auto, new Date(2026, 10, 26, 23, 59, 59)) === 'gta6', 'GTA: still on at Nov 26 23:59');
ok(id(auto, new Date(2026, 10, 27, 0, 0, 0)) === null, 'GTA: off at Nov 27 00:00');
ok(id(auto, at(2027, 11, 22)) === null, 'GTA: one-off, does not repeat in 2027');
// Christmas: 7 days before (Dec 18) to 7 days after (Jan 1), every year, across the new year
ok(id(auto, at(2026, 12, 17, 23)) === null, 'XMAS: off Dec 17');
ok(id(auto, new Date(2026, 11, 18, 0, 0, 0)) === 'christmas', 'XMAS: on Dec 18 00:00');
ok(id(auto, at(2026, 12, 25)) === 'christmas', 'XMAS: Christmas day');
ok(id(auto, at(2026, 12, 31)) === 'christmas', 'XMAS: Dec 31');
ok(id(auto, new Date(2027, 0, 1, 23, 59, 59)) === 'christmas', 'XMAS: still on Jan 1 23:59');
ok(id(auto, new Date(2027, 0, 2, 0, 0, 0)) === null, 'XMAS: off Jan 2');
ok(id(auto, at(2027, 12, 20)) === 'christmas', 'XMAS: repeats next year');
ok(id(auto, at(2026, 7, 4)) === null, 'nothing on a normal day');
// manual beats the calendar; "default" = classic; unknown/retired ids fall back to automatic; seasonal switch
ok(id({ skin: 'forest' }, at(2026, 12, 25)) === 'forest', 'manual wins over the calendar');
ok(id({ skin: 'christmas' }, at(2026, 7, 4)) === 'christmas', 'a seasonal theme can be picked by hand any time');
ok(id({ skin: 'default' }, at(2026, 12, 25)) === null, 'Classic stays classic');
ok(id({ skin: 'gone-theme' }, at(2026, 12, 25)) === 'christmas', 'retired id → automatic');
ok(id({ skin: 'auto', seasonal: false }, at(2026, 12, 25)) === null, 'seasonal off → Classic');
ok(id({ skin: 'forest', seasonal: false }, at(2026, 12, 25)) === 'forest', 'seasonal off does not block a manual pick');
ok(id({}, at(2026, 12, 25)) === 'christmas', 'no pref = automatic');
// priority when windows overlap
T.register({ id: 'tmp-a', mode: 'dark', schedule: { from: [12, 20], to: [12, 22] }, priority: 99, vars: {} });
ok(id(auto, at(2026, 12, 21)) === 'tmp-a', 'higher priority wins an overlap'); ok(id(auto, at(2026, 12, 23)) === 'christmas', 'back to Christmas after');
// accent override
const a = T.resolve({ skin: 'default', accent: '#336699' }, at(2026, 7, 4)); ok(a && a.vars['--tint'] === '#336699' && a.id === '' && a.mode === null, 'accent alone → vars only, no forced mode');
const b = T.resolve({ skin: 'christmas', accent: '#336699' }, at(2026, 7, 4)); ok(b.vars['--tint'] === '#336699' && b.vars['--bg'] === '#0a1511', 'accent over a theme keeps the theme');
ok(T.resolve({ skin: 'christmas', accent: 'nope' }, at(2026, 7, 4)).vars['--tint'] === '#e5383b', 'bad accent ignored');
ok(T.resolve({ skin: 'christmas' }, at(2026, 7, 4)) === T.resolve({ skin: 'christmas' }, at(2026, 8, 4)), 'descriptors are cached (stable identity for 3D)');
// shape of every theme
const REQ = ['--bg', '--bg2', '--card', '--card2', '--card3', '--fill', '--fill2', '--sep', '--label', '--label2', '--label3', '--tint', '--tint2', '--tint-dim', '--material'];
T.list.filter(t => !/^tmp-/.test(t.id)).forEach(t => {
  ok(REQ.every(k => t.vars[k]), t.id + ' defines every core token'); ok(t.swatch && t.swatch.length === 3, t.id + ' has a swatch'); ok(/^[a-z0-9-]+$/.test(t.id), t.id + ' id');
  const d = T.resolve({ skin: t.id }, at(2026, 7, 4)); ok(d.mode === t.mode && d.three && d.three.bg.length === 3 && d.three.k > 0 && d.three.k <= 1, t.id + ' has a usable 3D grade');
  if(t.fx){ ok(d.three.fx && d.three.fx.colors[0].length === 4 && d.fx, t.id + ' fx normalised'); ok(T.resolve({ skin: t.id, fx: false }, at(2026, 7, 4)).three.fx === null, t.id + ' fx can be switched off'); }
});
// list labels
ok(T.nextWindow(T.byId.christmas, at(2026, 11, 14))[0] === new Date(2026, 11, 18).getTime(), 'next Christmas window starts Dec 18');
ok(T.nextWindow(T.byId.gta6, at(2026, 11, 14))[0] === new Date(2026, 10, 19).getTime(), 'next GTA window starts Nov 19');
ok(T.nextWindow(T.byId.gta6, at(2026, 11, 28)) === null, 'GTA has no next window after 2026');
// the 3D engine reads the theme (engine only needs the pure parts here)
global.OS = { skin3d: () => T.resolve({ skin: 'gta6' }, at(2026, 7, 4)).three }; const G = require('../os/lib/gl3d.js'); ok(typeof G.create === 'function', 'gl3d still loads with a theme provider present');
if(fails){ console.error(fails + ' failed'); process.exit(1); } console.log('themes: all passed');
