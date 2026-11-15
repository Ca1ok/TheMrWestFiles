/* REALWORLD · interiors — the rooms you can walk into. One small function per kind of building, registered by name:
 *   RealWorld.Interiors.register('bank', room => { room.terminal(...); ... })        ← add a building = add one function (+ a line in game.js BUILDINGS)
 * A Room is built from boxes with a tiny DSL (see class Room). Room space: x 0..w (west→east), z 0..d (north→south), the door is in the middle of the SOUTH wall (z = d).
 * Clerks (r.npc with opts) are how you reach services: stand in front of one, press E, pick an option, and the matching WestOS app opens. Wall screens (r.screen) show live read-only information (RealWorld.Screens). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, { MB, rgb, shade, GLOW } = root.RWMesh, REG = {};
  const F = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };   // which way a thing faces
  class Room {
    constructor(w, d, h, o){ o = o || {}; this.w = w; this.d = d; this.h = h; this.mb = new MB(4096); this.cols = []; this.screens = []; this.npcs = []; this.o = o; this.name = o.name || ''; this.shell(o); }
    shell(o){
      const { w, d, h, mb } = this, wc = o.wall || '#e8dfcc', bc = o.base || '#8a6b4a', dw = 2.4, cx = w / 2;
      if(o.floor2){ for(let i = 0; i < w; i++) for(let j = 0; j < d; j++) mb.quad([i, 0, j], [i + 1, 0, j], [i + 1, 0, j + 1], [i, 0, j + 1], [0, 1, 0], (i + j) & 1 ? o.floor2 : o.floor); } else mb.quad([0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d], [0, 1, 0], o.floor || '#b9a98f');
      mb.quad([0, h, 0], [w, h, 0], [w, h, d], [0, h, d], [0, -1, 0], o.ceil || '#f1ece0');
      const wall = (a, b, n) => { mb.quad(a, b, [b[0], h, b[2]], [a[0], h, a[2]], n, wc); const k = n[0] * 0.01, l = n[2] * 0.01; mb.quad([a[0] + k, 0, a[2] + l], [b[0] + k, 0, b[2] + l], [b[0] + k, 1.0, b[2] + l], [a[0] + k, 1.0, a[2] + l], n, bc); };
      wall([w, 0, 0], [0, 0, 0], [0, 0, 1]); wall([0, 0, 0], [0, 0, d], [1, 0, 0]); wall([w, 0, d], [w, 0, 0], [-1, 0, 0]); wall([cx - dw / 2, 0, d], [0, 0, d], [0, 0, -1]); wall([w, 0, d], [cx + dw / 2, 0, d], [0, 0, -1]);
      mb.quad([cx - dw / 2, 2.5, d], [cx + dw / 2, 2.5, d], [cx + dw / 2, h, d], [cx - dw / 2, h, d], [0, 0, -1], wc);
      mb.quad([cx - 0.5, 2.62, d - 0.02], [cx + 0.5, 2.62, d - 0.02], [cx + 0.5, 3.0, d - 0.02], [cx - 0.5, 3.0, d - 0.02], [0, 0, -1], [60, 220, 120], GLOW);   // EXIT sign
      mb.boxAA(cx - dw / 2 - 0.12, 0, d - 0.14, cx - dw / 2, 2.5, d, '#5a4630'); mb.boxAA(cx + dw / 2, 0, d - 0.14, cx + dw / 2 + 0.12, 2.5, d, '#5a4630');
      for(let x = 2.5; x < w - 1; x += 5) for(let z = 2.5; z < d - 1; z += 5) mb.quad([x - 0.8, h - 0.02, z - 0.3], [x + 0.8, h - 0.02, z - 0.3], [x + 0.8, h - 0.02, z + 0.3], [x - 0.8, h - 0.02, z + 0.3], [0, -1, 0], o.lamp || [255, 236, 200], GLOW);
      this.cols.push([-2, -2, w + 2, 0], [-2, 0, 0, d], [w, 0, w + 2, d], [-2, d, cx - dw / 2, d + 2], [cx + dw / 2, d, w + 2, d + 2], [-2, d + 1.2, w + 2, d + 3]);
    }
    box(x, z, w, d, h, c, top, o){ o = o || {}; const y0 = o.y0 || 0; this.mb.boxAA(x, y0, z, x + w, y0 + h, z + d, c, top || c, o.glow ? GLOW : 255); if(o.solid !== false && !o.y0) this.cols.push([x, z, x + w, z + d]); return this; }
    plant(x, z){ this.mb.cyl(x, z, 0, 0.5, 0.28, 8, '#a9694a'); this.mb.cone(x, z, 0.4, 1.9, 0.6, 7, '#3f8f4a'); this.mb.cone(x, z, 1.1, 2.3, 0.4, 7, '#56a85a'); this.cols.push([x - 0.3, z - 0.3, x + 0.3, z + 0.3]); return this; }
    bench(x, z, w, d, c){ this.box(x, z, w, d, 0.45, c || '#7a5a3a', '#9a7a52'); return this; }
    shelf(x, z, w, d, h, face){ const rows = Math.floor(h / 0.5); this.box(x, z, w, d, h, '#6b4b32'); const cols = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#9b7bff', '#e8e0c8', '#e8803d'];
      for(let r = 0; r < rows; r++) for(let i = 0; i < Math.floor((face === 'n' || face === 's' ? w : d) / 0.45); i++){ const c = cols[(i * 3 + r * 5) % cols.length], hh = 0.28 + ((i * 7 + r) % 3) * 0.05, f = F[face || 's']; const px = f[0] === 0 ? x + 0.2 + i * 0.45 : x + (f[0] > 0 ? w : -0.0) - (f[0] > 0 ? 0 : -0.0), pz = f[1] === 0 ? z + 0.2 + i * 0.45 : z + (f[1] > 0 ? d : 0);
        if(f[0] === 0) this.mb.boxAA(px, 0.2 + r * 0.5, pz + (f[1] > 0 ? 0.02 : -0.2), px + 0.3, 0.2 + r * 0.5 + hh, pz + (f[1] > 0 ? 0.2 : -0.02), c); else this.mb.boxAA(px + (f[0] > 0 ? 0.02 : -0.2), 0.2 + r * 0.5, pz, px + (f[0] > 0 ? 0.2 : -0.02), 0.2 + r * 0.5 + hh, pz + 0.3, c); }
      return this; }
    /* a clerk you can talk to: standing in front of them + E opens a conversation; each option opens a WestOS app (opts: [{label, app}]) */
    npc(x, z, yaw, name, line, shirt, pants, opts){ this.npcs.push({ x, z, yaw, name, line, shirt: shirt || '#3b6fb6', pants: pants || '#2d2f36', opts: opts || [] }); return this; }
    /* a fixed information screen on a wall. (x, z) is the point ON the wall; face = which way the screen looks ('s' = looks south, hangs on the north wall…). kind → RealWorld.Screens painter. Read-only: it never opens an app. */
    screen(kind, x, y, z, w, h, face, o){ const f = F[face], bz = f[1] ? 0.07 : 0, bx = f[0] ? 0.07 : 0, mb = this.mb, hw = w / 2;
      if(f[1]) mb.boxAA(x - hw - 0.08, y - 0.08, z - (f[1] < 0 ? 0.06 : 0), x + hw + 0.08, y + h + 0.08, z + (f[1] > 0 ? 0.06 : 0), '#1c1f26', '#1c1f26'); else mb.boxAA(x - (f[0] < 0 ? 0.06 : 0), y - 0.08, z - hw - 0.08, x + (f[0] > 0 ? 0.06 : 0), y + h + 0.08, z + hw + 0.08, '#1c1f26', '#1c1f26');
      const px = x + f[0] * 0.075, pz = z + f[1] * 0.075; let TL, TR, BR, BL;
      if(face === 's'){ TL = [px - hw, y + h, pz]; TR = [px + hw, y + h, pz]; } else if(face === 'n'){ TL = [px + hw, y + h, pz]; TR = [px - hw, y + h, pz]; } else if(face === 'e'){ TL = [px, y + h, pz + hw]; TR = [px, y + h, pz - hw]; } else { TL = [px, y + h, pz - hw]; TR = [px, y + h, pz + hw]; }
      BR = [TR[0], y, TR[2]]; BL = [TL[0], y, TL[2]]; this.screens.push({ kind, o: o || {}, corners: [TL, TR, BR, BL], x: px, z: pz, w, h, ar: w / h }); return this; }
    finish(){ return { mesh: this.mb.finish(), cols: this.cols, screens: this.screens, npcs: this.npcs, w: this.w, d: this.d, spawn: { x: this.w / 2, z: this.d - 1.8, yaw: 0 }, name: this.name }; }
  }
  const register = (kind, fn) => { REG[kind] = fn; };
  const build = (kind, ctx) => { const fn = REG[kind] || REG.generic; return fn(ctx || {}).finish(); };
  const J = n => ['#e8d5a8', '#c9a86a', '#d98c8c', '#8cc9d9', '#a8d98c'][n % 5];

  const TELL = (app, label) => [{ label, app }];
  register('bank', c => { const r = new Room(22, 16, 4.4, { name: 'Bank', floor: '#e2ded4', floor2: '#aaa59b', wall: '#e8e0c8', base: '#5b3f2a' });
    r.box(3, 4.2, 16, 1.2, 1.1, '#5b3f2a', '#8a6a48'); for(let x = 3.4; x < 19; x += 1.6) r.mb.boxAA(x, 1.1, 4.3, x + 0.06, 2.5, 4.36, '#c9b27a');
    r.npc(6, 2.9, Math.PI, 'Teller Ines', 'Welcome to the bank. Would you like to see your account?', '#244a7a', null, [{ label: 'Open my account', app: 'Bank' }]);
    r.npc(11, 2.9, Math.PI, 'Teller Hugo', 'Loans and bills? I can help with that.', '#244a7a', null, [{ label: 'Loans & bills', app: 'Bank' }]);
    r.npc(16, 2.9, Math.PI, 'Teller Odile', 'Looking to invest instead? The exchange is next door.', '#244a7a', null, [{ label: 'My portfolio', app: 'Stocks' }]);
    r.box(8.5, 0.4, 5, 0.6, 3.4, '#8d95a3', '#aab2c0'); r.mb.boxAA(9.7, 1.4, 1.0, 11.3, 2.9, 1.2, '#c9b27a');
    r.screen('bank', 0.04, 1.6, 9, 3.4, 1.9, 'e'); r.screen('stocks', 21.96, 1.6, 9, 3.4, 1.9, 'w');
    r.bench(9, 11, 4, 0.9); r.bench(9, 13.2, 4, 0.9); r.plant(1.2, 1.2); r.plant(20.8, 1.2); r.plant(1.2, 14.6); r.plant(20.8, 14.6); return r; });
  register('exchange', c => { const r = new Room(28, 20, 5.4, { name: 'Stock Exchange', floor: '#3b4252', wall: '#d9e3dc', base: '#2f4a3c', floor2: '#454d60' });
    for(let i = 0; i < 24; i++){ const hh = 0.6 + ((i * 37) % 9) / 9 * 2.2, up = (i * 7) % 3 !== 0, c2 = up ? [70, 220, 120] : [240, 90, 80]; r.mb.boxAA(2 + i * 1.0, 1.4, 0.1, 2.75 + i * 1.0, 1.4 + hh, 0.3, c2, c2, GLOW); }
    r.screen('stocks', 14, 3.6, 0.06, 6, 1.6, 's'); r.screen('news', 0.04, 1.5, 10, 4.4, 2.5, 'e'); r.screen('stocks', 27.96, 1.5, 10, 4.4, 2.5, 'w');
    for(let row = 0; row < 3; row++) for(let i = 0; i < 4; i++){ const x = 4.5 + i * 6, z = 7.5 + row * 3.6; r.box(x - 0.9, z - 0.35, 1.8, 0.7, 0.78, '#4b5563', '#6b7280'); r.mb.boxAA(x - 0.4, 0.82, z - 0.12, x + 0.4, 1.25, z - 0.06, [90, 230, 150], [90, 230, 150], GLOW); }
    r.npc(14, 5.2, Math.PI, 'Trader Pavel', 'Buy low, sell high. Easier said than done. Want to trade?', '#8a2f2f', null, [{ label: 'Trade $WEST', app: 'Stocks' }]);
    r.npc(22, 14.5, Math.PI / 2, 'Analyst Mina', 'I read the news so you do not have to.', '#3f6a4c', null, [{ label: 'Market news', app: 'News' }]); r.plant(1.2, 18.6); r.plant(26.8, 18.6); return r; });
  register('shop', c => { const r = new Room(20, 16, 4, { name: 'WestShop', floor: '#cdbf9f', wall: '#f3e7c8', base: '#c0803a' });
    for(let i = 0; i < 4; i++) r.shelf(3 + i * 4, 3.5, 2.6, 0.7, 2.2, 's'); for(let i = 0; i < 3; i++) r.shelf(4 + i * 5, 8.2, 3, 0.7, 1.6, 'n');
    r.box(14, 12, 5, 1, 1.1, '#c0803a', '#e0a23a'); r.npc(16.5, 13.3, 0, 'Shopkeeper', 'Elements, tools and bargains. Take a look!', '#e0a23a', null, [{ label: 'Browse the shop', app: 'WestShop' }]);
    r.screen('movers', 10, 1.7, 0.06, 5.4, 1.9, 's'); r.plant(1.2, 1.2); return r; });
  register('arcade', c => { const r = new Room(24, 18, 4.2, { name: 'Arcade', floor: '#1b1530', wall: '#2a2147', base: '#171126', lamp: [200, 120, 255], ceil: '#120d22' });
    const neon = [[255, 80, 200], [80, 220, 255], [255, 220, 80], [120, 255, 140]];
    for(let row = 0; row < 2; row++) for(let i = 0; i < 5; i++){ const x = 3.5 + i * 3.8, z = 5 + row * 6, g = neon[(i + row) % 4]; r.box(x - 0.5, z - 0.4, 1, 0.8, 1.9, '#2e2a46', '#3b3560'); r.mb.boxAA(x - 0.4, 1.1, z + 0.38, x + 0.4, 1.75, z + 0.42, g, g, GLOW); r.mb.boxAA(x - 0.5, 1.9, z - 0.4, x + 0.5, 2.0, z + 0.4, g, g, GLOW); }
    for(let x = 1; x < 23; x += 3) r.mb.quad([x, 0.01, 1.5], [x + 0.2, 0.01, 1.5], [x + 0.2, 0.01, 17], [x, 0.01, 17], [0, 1, 0], neon[(x / 3 | 0) % 4], GLOW);
    r.screen('arcade', 12, 1.8, 0.06, 6, 2.2, 's'); r.box(18, 14.2, 5, 1, 1.1, '#3b3560', '#5b4fa0');
    r.npc(20.5, 15.4, 0, 'Attendant', 'Gambling is only for players with a home. Feeling lucky?', '#b36be0', null, [{ label: 'Slots · Blackjack · Poker · Bus', app: 'Arcade' }, { label: 'Mini-games', app: 'Games' }]); return r; });
  register('agency', c => { const r = new Room(18, 14, 3.8, { name: 'Estate Agency', floor: '#c6b08e', wall: '#f1dfc8', base: '#8f5f3f' });
    for(let i = 0; i < 6; i++) for(let j = 0; j < 4; j++){ const h = 0.2 + ((i * 5 + j * 3) % 5) * 0.12; r.mb.boxAA(6 + i * 0.9, 0.9, 3.4 + j * 0.9, 6.7 + i * 0.9, 0.9 + h, 4.1 + j * 0.9, J(i + j), J(i + j)); } r.box(5.6, 3, 5.8, 4, 0.9, '#6b4b32', '#8a6a48');
    r.screen('listings', 0.04, 1.5, 7, 3.4, 1.9, 'e'); r.screen('listings', 17.96, 1.5, 7, 3.4, 1.9, 'w');
    r.npc(9, 10.3, Math.PI, 'Agent Quinn', 'Looking to buy, rent or sell? I know every house in town.', '#c98a62', null, [{ label: 'Browse properties', app: 'RealEstate' }, { label: 'Show me the map', app: 'WestMap' }]); r.plant(1.2, 1.2); r.plant(16.8, 12.8); return r; });
  register('hall', c => { const r = new Room(26, 20, 6, { name: 'Council Hall', floor: '#cfd3da', floor2: '#aab0bb', wall: '#e4e7ee', base: '#6b7280' });
    for(let i = 0; i < 4; i++){ r.box(3 + i * 6.7, 3, 0.8, 0.8, 6, '#f1f2f6', '#f1f2f6'); } r.box(8, 1, 10, 2.4, 0.5, '#6b4b32', '#8a6a48'); r.box(10, 1.3, 6, 0.9, 1.1, '#8a6a48', '#a98a64');
    r.npc(13, 2.9, Math.PI, 'Mayor Ada', 'Taxes keep the city running. Bills can be paid at the bank.', '#7c8696', null, [{ label: 'Taxes & bills', app: 'Bank' }]);
    r.npc(7, 8, Math.PI / 2, 'Clerk Odo', 'The leaderboard is public record.', '#5d6b8a', null, [{ label: 'Leaderboard', app: 'Leaderboard' }, { label: 'Town news', app: 'News' }]);
    r.screen('board', 0.04, 1.6, 12, 4.6, 2.6, 'e'); r.screen('news', 25.96, 1.6, 12, 4.6, 2.6, 'w'); r.plant(1.2, 18.6); r.plant(24.8, 18.6); return r; });
  register('uni', c => { const r = new Room(22, 16, 4.6, { name: 'University Library', floor: '#8a6a4a', wall: '#d8bda2', base: '#5d4a42' });
    for(let i = 0; i < 5; i++) r.shelf(2 + i * 4, 1.2, 3, 0.8, 3.4, 's'); for(let i = 0; i < 2; i++) for(let j = 0; j < 3; j++) r.box(4 + j * 6, 7 + i * 3.4, 3, 1.1, 0.8, '#6b4b32', '#8a6a48');
    r.screen('news', 0.04, 1.6, 8, 3.4, 1.9, 'e'); r.npc(11, 12.5, Math.PI, 'Librarian', 'Shhh. Notes, files, or the news archive?', '#5d4a42', null, [{ label: 'My files', app: 'Files' }, { label: 'My notes', app: 'Notes' }, { label: 'News archive', app: 'News' }]); return r; });
  const labRoom = (c, name, big, who) => { const r = new Room(big ? 22 : 18, big ? 16 : 14, 4, { name, floor: '#d6ece9', floor2: '#c2dfdc', wall: '#eef7f6', base: '#4fb3ae' }), w = r.w;
    for(let i = 0; i < 3; i++){ r.box(3 + i * 5.2, 3, 4, 1.2, 0.95, '#e4e9ec', '#4b5563'); for(let k = 0; k < 4; k++){ const g = [[255, 120, 120], [120, 220, 255], [255, 230, 120], [140, 255, 160]][k]; r.mb.cyl(3.6 + i * 5.2 + k * 0.9, 3.6, 0.95, 1.35, 0.14, 6, g, g); } }
    r.box(w - 3.6, 8, 2.4, 1.6, 2.4, '#8d95a3', '#aab2c0'); r.screen('lab', 0.04, 1.6, 8, 3.2, 1.8, 'e');
    r.npc(w / 2, 8, Math.PI, who, 'Mix elements, discover compounds, sell the results.', '#bfe5e3', null, [{ label: 'Start experiments', app: 'WestLab' }]); r.plant(1.2, 1.2); return r; };
  register('lab', c => labRoom(c, 'Research Institute', true, 'Dr. Haldane'));
  register('plot-lab', c => labRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Laboratory', false, 'Lab assistant'));
  const factoryRoom = (c, name, who) => { const r = new Room(24, 18, 5.2, { name, floor: '#8c8a86', wall: '#cfc3b8', base: '#5b5148', floor2: '#827f7a' });
    for(let i = 0; i < 2; i++){ r.box(2, 3 + i * 5, 17, 1.0, 0.7, '#3b3f48', '#4a4f5a'); for(let x = 2.5; x < 19; x += 1.2) r.mb.boxAA(x, 0.7, 3.2 + i * 5, x + 0.5, 1.0, 3.8 + i * 5, '#e0a23a'); }
    [[21, 3], [21, 9], [21, 15]].forEach(p => { r.mb.cyl(p[0], p[1], 0, 3.6, 1.2, 10, '#9aa7b5', '#b8c4d0'); r.cols.push([p[0] - 1.2, p[1] - 1.2, p[0] + 1.2, p[1] + 1.2]); });
    r.screen('factory', 12, 2.0, 0.06, 5, 1.8, 's'); r.npc(8, 13, Math.PI, who, 'Everything you make ends up on a truck.', '#c0764a', null, [{ label: 'Run the factory', app: 'WestFactory' }, { label: 'Sell goods', app: 'WestShop' }]); r.plant(1.2, 16.6); return r; };
  register('ind', c => factoryRoom(c, 'Freight Depot', 'Foreman'));
  register('plot-factory', c => factoryRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Factory', 'Shift manager'));
  register('plant', c => { const r = new Room(24, 18, 7, { name: 'Power Plant', floor: '#7d7a76', wall: '#cfc3b8', base: '#4a4540' });
    [6, 12, 18].forEach(x => { r.mb.cyl(x, 8, 0, 4.5, 1.7, 12, '#9aa7b5', '#b8c4d0'); r.cols.push([x - 1.7, 6.3, x + 1.7, 9.7]); r.mb.boxAA(x - 0.3, 4.5, 5, x + 0.3, 6.5, 11, '#5b6470'); });
    r.screen('news', 12, 2.6, 0.06, 5, 2.4, 's'); r.npc(20, 14, Math.PI, 'Engineer', 'Keeping the lights on for WestCountry.', '#8a6a58', null, [{ label: 'Read the news', app: 'News' }]); return r; });
  /* a home, sized from the house: lounge + kitchen at the front, a bedroom per bed at the back. Apps live on your phone (P); the TV on the wall shows the news. */
  register('home', c => { const w = Math.max(9, Math.min(20, Math.round((c.w || 10) * 1.2))), d = Math.max(8, Math.min(18, Math.round((c.dp || 9) * 1.2))), beds = Math.max(1, Math.min(4, c.beds || 1));
    const r = new Room(w, d, c.type === 'mansion' || c.type === 'villa' ? 3.8 : 3, { name: c.name || 'Home', floor: '#b08a62', wall: '#f0e6d2', base: '#c9b79a', lamp: [255, 226, 180] }), z0 = d * 0.42;
    r.cols.push([1, z0, w / 2 - 1.2, z0 + 0.15], [w / 2 + 1.2, z0, w - 1, z0 + 0.15]); r.mb.boxAA(1, 0, z0, w / 2 - 1.2, 3, z0 + 0.15, '#f0e6d2'); r.mb.boxAA(w / 2 + 1.2, 0, z0, w - 1, 3, z0 + 0.15, '#f0e6d2');
    for(let i = 0; i < beds; i++){ const x = 1.2 + i * 2.8; if(x + 2.2 > w - 0.5) break; r.box(x, 0.5, 2.0, 2.4, 0.5, '#e8e2f0', '#9db4d9'); r.box(x, 0.5, 2.0, 0.3, 1.1, '#6b4b32', '#6b4b32'); }
    r.box(w - 2.2, 0.4, 1.6, 0.6, 2.1, '#6b4b32', '#8a6a48'); r.box(w / 2 - 2, z0 + 3, 4, 1.3, 0.8, '#8c5a3a', '#a9694a', { solid: false }); r.box(w / 2 - 2.4, z0 + 4.4, 4.8, 1.1, 0.5, '#4a6fa5', '#5d86c2'); r.box(w / 2 - 1, z0 + 2, 2, 0.8, 0.3, '#6b4b32', '#8a6a48', { solid: false });
    r.screen('tv', w / 2, 0.9, 0.06, Math.min(3.2, w - 3), 1.5, 's'); r.box(1, d - 2.6, 0.8, 2.6, 0.95, '#d9d3c4', '#4b5563'); r.plant(w - 1, d - 1); return r; });
  register('generic', c => { const r = new Room(14, 10, 3.2, { name: c.name || 'Building' }); r.plant(1.2, 1.2); return r; });
  RW.Interiors = { register, build, Room, kinds: () => Object.keys(REG) };
})(typeof self !== 'undefined' ? self : this);
