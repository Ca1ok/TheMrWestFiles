/* REALWORLD · interiors — the rooms you can walk into. One small function per kind of building, registered by name:
 *   RealWorld.Interiors.register('bank', room => { room.terminal(...); ... })        ← add a building = add one function (+ a line in game.js BUILDINGS)
 * A Room is built from boxes with a tiny DSL (see class Room). Room space: x 0..w (west→east), z 0..d (north→south), the door is in the middle of the SOUTH wall (z = d).
 * Terminals are the interactive things: standing at one and pressing E opens the matching WestOS app. */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {}, { MB, rgb, shade, GLOW } = root.RWMesh, REG = {};
  const F = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };   // which way a thing faces
  class Room {
    constructor(w, d, h, o){ o = o || {}; this.w = w; this.d = d; this.h = h; this.mb = new MB(4096); this.cols = []; this.terms = []; this.npcs = []; this.o = o; this.name = o.name || ''; this.shell(o); }
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
    /* an interactive desk/machine: the screen faces `face`; E near it opens `app` */
    terminal(x, z, face, label, app, o){ o = o || {}; const f = F[face], sw = o.w || 1.1, sd = 0.7, glow = o.glow || [90, 180, 255], vert = f[0] !== 0, bw = vert ? sd : sw, bd = vert ? sw : sd;
      this.box(x - bw / 2, z - bd / 2, bw, bd, 0.78, o.body || '#4b5563', '#6b7280'); const sx = x - f[0] * 0.12, sz = z - f[1] * 0.12, tw = vert ? 0.06 : 0.7, td = vert ? 0.7 : 0.06;
      this.mb.boxAA(sx - tw / 2, 0.82, sz - td / 2, sx + tw / 2, 1.32, sz + td / 2, glow, glow, GLOW);
      this.terms.push({ x: x + f[0] * 0.2, z: z + f[1] * 0.2, label, app, face, hint: o.hint || ('Use ' + label) }); return this; }
    npc(x, z, yaw, name, line, shirt, pants){ this.npcs.push({ x, z, yaw, name, line, shirt: shirt || '#3b6fb6', pants: pants || '#2d2f36' }); return this; }
    sign(x, y, z, w, h, c, face){ const f = F[face || 's']; if(f[0] === 0) this.mb.boxAA(x - w / 2, y, z - 0.04, x + w / 2, y + h, z + 0.04, c, c, GLOW); else this.mb.boxAA(x - 0.04, y, z - w / 2, x + 0.04, y + h, z + w / 2, c, c, GLOW); return this; }
    finish(){ return { mesh: this.mb.finish(), cols: this.cols, terms: this.terms, npcs: this.npcs, w: this.w, d: this.d, spawn: { x: this.w / 2, z: this.d - 1.8, yaw: 0 }, name: this.name }; }
  }
  const register = (kind, fn) => { REG[kind] = fn; };
  const build = (kind, ctx) => { const fn = REG[kind] || REG.generic; return fn(ctx || {}).finish(); };
  const J = n => ['#e8d5a8', '#c9a86a', '#d98c8c', '#8cc9d9', '#a8d98c'][n % 5];

  register('bank', c => { const r = new Room(22, 16, 4.4, { name: 'Bank', floor: '#e2ded4', floor2: '#aaa59b', wall: '#e8e0c8', base: '#5b3f2a' });
    r.box(3, 4.2, 16, 1.2, 1.1, '#5b3f2a', '#8a6a48'); for(let x = 3.4; x < 19; x += 1.6) r.mb.boxAA(x, 1.1, 4.3, x + 0.06, 2.5, 4.36, '#c9b27a');
    [6, 11, 16].forEach((x, i) => r.npc(x, 2.9, Math.PI, ['Teller Ines', 'Teller Hugo', 'Teller Odile'][i], 'Welcome to the bank. Use the terminal for deposits, loans and bills.', '#244a7a'));
    r.terminal(4, 8.5, 'e', 'ATM', 'Bank', { glow: [120, 230, 160] }); r.terminal(4, 11, 'e', 'ATM', 'Bank', { glow: [120, 230, 160] }); r.terminal(17.5, 9.5, 'w', 'Loans & bills desk', 'Bank');
    r.box(8.5, 0.4, 5, 0.6, 3.4, '#8d95a3', '#aab2c0'); r.mb.boxAA(9.7, 1.4, 1.0, 11.3, 2.9, 1.2, '#c9b27a');   // the vault door
    r.bench(9, 11, 4, 0.9); r.bench(9, 13.2, 4, 0.9); r.plant(1.2, 1.2); r.plant(20.8, 1.2); r.plant(1.2, 14.6); r.plant(20.8, 14.6); return r; });
  register('exchange', c => { const r = new Room(28, 20, 5.4, { name: 'Stock Exchange', floor: '#3b4252', wall: '#d9e3dc', base: '#2f4a3c', floor2: '#454d60' });
    for(let i = 0; i < 24; i++){ const hh = 0.6 + ((i * 37) % 9) / 9 * 2.2, up = (i * 7) % 3 !== 0, c2 = up ? [70, 220, 120] : [240, 90, 80]; r.mb.boxAA(2 + i * 1.0, 1.4, 0.1, 2.75 + i * 1.0, 1.4 + hh, 0.3, c2, c2, GLOW); }
    r.sign(14, 4.0, 0.15, 24, 0.5, [255, 200, 70], 's');
    for(let row = 0; row < 3; row++) for(let i = 0; i < 4; i++){ const x = 4.5 + i * 6, z = 5.5 + row * 4; if(row === 2 && i % 2 === 0) r.terminal(x, z, 'n', 'Trading desk', 'Stocks', { w: 1.8, glow: [90, 230, 150] }); else r.box(x - 0.9, z - 0.35, 1.8, 0.7, 0.78, '#4b5563', '#6b7280'); }
    r.npc(6, 7.5, 0, 'Trader Pavel', 'Buy low, sell high. Easier said than done.', '#8a2f2f'); r.npc(18, 11.5, Math.PI / 2, 'Trader Mina', 'The $WEST is moving again!', '#3f6a4c'); r.plant(1.2, 18.6); r.plant(26.8, 18.6); return r; });
  register('shop', c => { const r = new Room(20, 16, 4, { name: 'WestShop', floor: '#cdbf9f', wall: '#f3e7c8', base: '#c0803a' });
    for(let i = 0; i < 4; i++) r.shelf(3 + i * 4, 3.5, 2.6, 0.7, 2.2, 's'); for(let i = 0; i < 3; i++) r.shelf(4 + i * 5, 8.2, 3, 0.7, 1.6, 'n');
    r.box(14, 12, 5, 1, 1.1, '#c0803a', '#e0a23a'); r.npc(16.5, 13.3, 0, 'Shopkeeper', 'Elements, tools and bargains. Take a look!', '#e0a23a');
    r.terminal(1.6, 11.5, 'e', 'WestShop catalogue', 'WestShop', { glow: [255, 210, 110] }); r.terminal(15, 11.4, 's', 'Checkout', 'WestShop', { glow: [255, 210, 110], w: 0.9 }); r.plant(1.2, 1.2); return r; });
  register('arcade', c => { const r = new Room(24, 18, 4.2, { name: 'Arcade', floor: '#1b1530', wall: '#2a2147', base: '#171126', lamp: [200, 120, 255], ceil: '#120d22' });
    const neon = [[255, 80, 200], [80, 220, 255], [255, 220, 80], [120, 255, 140]], labels = ['Slots', 'Blackjack', 'Poker', 'Bus Ride'];
    for(let row = 0; row < 2; row++) for(let i = 0; i < 5; i++){ const x = 3.5 + i * 3.8, z = 4 + row * 6, g = neon[(i + row) % 4]; r.box(x - 0.5, z - 0.4, 1, 0.8, 1.9, '#2e2a46', '#3b3560'); r.mb.boxAA(x - 0.4, 1.1, z + 0.38, x + 0.4, 1.75, z + 0.42, g, g, GLOW); r.mb.boxAA(x - 0.5, 1.9, z - 0.4, x + 0.5, 2.0, z + 0.4, g, g, GLOW);
      r.terms.push({ x, z: z + 1.1, label: labels[(i + row) % 4] + ' machine', app: 'Arcade', face: 's', hint: 'Play ' + labels[(i + row) % 4] }); }
    for(let x = 1; x < 23; x += 3) r.mb.quad([x, 0.01, 1], [x + 0.2, 0.01, 1], [x + 0.2, 0.01, 17], [x, 0.01, 17], [0, 1, 0], neon[(x / 3 | 0) % 4], GLOW);
    r.box(18, 14.2, 5, 1, 1.1, '#3b3560', '#5b4fa0'); r.npc(20.5, 15.4, 0, 'Attendant', 'Gambling is only for players with a home. Good luck!', '#b36be0'); r.terminal(1.6, 14, 'e', 'Games terminal', 'Games', { glow: [120, 255, 140] }); return r; });
  register('agency', c => { const r = new Room(18, 14, 3.8, { name: 'Estate Agency', floor: '#c6b08e', wall: '#f1dfc8', base: '#8f5f3f' });
    for(let i = 0; i < 6; i++) for(let j = 0; j < 4; j++){ const h = 0.2 + ((i * 5 + j * 3) % 5) * 0.12; r.mb.boxAA(6 + i * 0.9, 0.9, 3.4 + j * 0.9, 6.7 + i * 0.9, 0.9 + h, 4.1 + j * 0.9, J(i + j), J(i + j)); } r.box(5.6, 3, 5.8, 4, 0.9, '#6b4b32', '#8a6a48');
    r.sign(9, 1.6, 0.15, 3.6, 1.6, [90, 160, 255], 's'); r.terminal(3, 9, 'e', 'Property listings', 'RealEstate'); r.terminal(14.5, 9, 'w', 'Property listings', 'RealEstate'); r.terminal(9, 10.5, 'n', 'WestMap', 'WestMap', { glow: [120, 230, 160] });
    r.npc(9, 12.3, 0, 'Agent Quinn', 'Looking to buy, rent or sell? The terminals know every house.', '#c98a62'); r.plant(1.2, 1.2); r.plant(16.8, 12.8); return r; });
  register('hall', c => { const r = new Room(26, 20, 6, { name: 'Council Hall', floor: '#cfd3da', floor2: '#aab0bb', wall: '#e4e7ee', base: '#6b7280' });
    for(let i = 0; i < 4; i++){ r.box(3 + i * 6.7, 3, 0.8, 0.8, 6, '#f1f2f6', '#f1f2f6'); } r.box(8, 1, 10, 2.4, 0.5, '#6b4b32', '#8a6a48'); r.box(10, 1.3, 6, 0.9, 1.1, '#8a6a48', '#a98a64');
    r.npc(13, 2.9, Math.PI, 'Mayor Ada', 'Taxes keep the city running. Bills can be paid at the Bank terminal.', '#7c8696');
    r.terminal(4, 10, 'e', 'Tax & bills', 'Bank'); r.terminal(22, 10, 'w', 'Leaderboard', 'Leaderboard', { glow: [255, 215, 90] }); r.terminal(13, 13, 'n', 'News board', 'News'); r.plant(1.2, 18.6); r.plant(24.8, 18.6); return r; });
  register('uni', c => { const r = new Room(22, 16, 4.6, { name: 'University Library', floor: '#8a6a4a', wall: '#d8bda2', base: '#5d4a42' });
    for(let i = 0; i < 5; i++) r.shelf(2 + i * 4, 1.2, 3, 0.8, 3.4, 's'); for(let i = 0; i < 2; i++) for(let j = 0; j < 3; j++) r.box(4 + j * 6, 7 + i * 3.4, 3, 1.1, 0.8, '#6b4b32', '#8a6a48');
    r.terminal(1.6, 13, 'e', 'Library files', 'Files'); r.terminal(20.4, 13, 'w', 'Notes', 'Notes', { glow: [255, 230, 140] }); r.terminal(11, 4.2, 's', 'News archive', 'News'); r.npc(11, 12, Math.PI, 'Librarian', 'Shhh. Studying chemistry?', '#5d4a42'); return r; });
  const labRoom = (c, name, big) => { const r = new Room(big ? 22 : 18, big ? 16 : 14, 4, { name, floor: '#d6ece9', floor2: '#c2dfdc', wall: '#eef7f6', base: '#4fb3ae' }), w = r.w;
    for(let i = 0; i < 3; i++){ r.box(3 + i * 5.2, 3, 4, 1.2, 0.95, '#e4e9ec', '#4b5563'); for(let k = 0; k < 4; k++){ const g = [[255, 120, 120], [120, 220, 255], [255, 230, 120], [140, 255, 160]][k]; r.mb.cyl(3.6 + i * 5.2 + k * 0.9, 3.6, 0.95, 1.35, 0.14, 6, g, g); } }
    r.box(w - 3.6, 8, 2.4, 1.6, 2.4, '#8d95a3', '#aab2c0'); r.terminal(3.5, 8, 'e', 'WestLab', 'WestLab', { glow: [120, 255, 230] }); r.terminal(w / 2, 6.2, 'n', 'WestLab', 'WestLab', { glow: [120, 255, 230] }); r.plant(1.2, 1.2); return r; };
  register('lab', c => labRoom(c, 'Research Institute', true).npc(14, 9, Math.PI, 'Dr. Haldane', 'Mix elements, discover compounds, sell the results.', '#bfe5e3'));
  register('plot-lab', c => labRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Laboratory', false));
  const factoryRoom = (c, name) => { const r = new Room(24, 18, 5.2, { name, floor: '#8c8a86', wall: '#cfc3b8', base: '#5b5148', floor2: '#827f7a' });
    for(let i = 0; i < 2; i++){ r.box(2, 3 + i * 5, 17, 1.0, 0.7, '#3b3f48', '#4a4f5a'); for(let x = 2.5; x < 19; x += 1.2) r.mb.boxAA(x, 0.7, 3.2 + i * 5, x + 0.5, 1.0, 3.8 + i * 5, '#e0a23a'); }
    [[21, 3], [21, 9], [21, 15]].forEach((p, i) => { r.mb.cyl(p[0], p[1], 0, 3.6, 1.2, 10, '#9aa7b5', '#b8c4d0'); r.cols.push([p[0] - 1.2, p[1] - 1.2, p[0] + 1.2, p[1] + 1.2]); });
    r.terminal(4, 13, 'n', 'WestFactory', 'WestFactory', { glow: [255, 170, 80] }); r.terminal(10, 13, 'n', 'Market', 'WestShop', { glow: [255, 210, 110] }); r.plant(1.2, 16.6); return r; };
  register('ind', c => factoryRoom(c, 'Freight Depot').npc(14, 13.5, Math.PI, 'Foreman', 'Everything you make ends up on a truck.', '#c0764a'));
  register('plot-factory', c => factoryRoom(c, (c.owner ? c.owner + '’s ' : 'Your ') + 'Factory'));
  register('plant', c => { const r = new Room(24, 18, 7, { name: 'Power Plant', floor: '#7d7a76', wall: '#cfc3b8', base: '#4a4540' });
    [6, 12, 18].forEach(x => { r.mb.cyl(x, 8, 0, 4.5, 1.7, 12, '#9aa7b5', '#b8c4d0'); r.cols.push([x - 1.7, 6.3, x + 1.7, 9.7]); r.mb.boxAA(x - 0.3, 4.5, 5, x + 0.3, 6.5, 11, '#5b6470'); });
    r.terminal(3, 14, 'n', 'Utility notices', 'News', { glow: [255, 200, 90] }); r.npc(20, 14, Math.PI, 'Engineer', 'Keeping the lights on for WestCountry.', '#8a6a58'); return r; });
  /* a home, sized from the house: lounge + kitchen at the front, a bedroom per bed at the back */
  register('home', c => { const w = Math.max(9, Math.min(20, Math.round((c.w || 10) * 1.2))), d = Math.max(8, Math.min(18, Math.round((c.dp || 9) * 1.2))), beds = Math.max(1, Math.min(4, c.beds || 1));
    const r = new Room(w, d, c.type === 'mansion' || c.type === 'villa' ? 3.8 : 3, { name: c.name || 'Home', floor: '#b08a62', wall: '#f0e6d2', base: '#c9b79a', lamp: [255, 226, 180] }), z0 = d * 0.42;
    r.cols.push([1, z0, w / 2 - 1.2, z0 + 0.15], [w / 2 + 1.2, z0, w - 1, z0 + 0.15]); r.mb.boxAA(1, 0, z0, w / 2 - 1.2, 3, z0 + 0.15, '#f0e6d2'); r.mb.boxAA(w / 2 + 1.2, 0, z0, w - 1, 3, z0 + 0.15, '#f0e6d2');
    for(let i = 0; i < beds; i++){ const x = 1.2 + i * 2.8; if(x + 2.2 > w - 0.5) break; r.box(x, 0.5, 2.0, 2.4, 0.5, '#e8e2f0', '#9db4d9'); r.box(x, 0.5, 2.0, 0.3, 1.1, '#6b4b32', '#6b4b32'); }
    r.box(w - 2.2, 0.4, 1.6, 0.6, 2.1, '#6b4b32', '#8a6a48');
    r.box(w / 2 - 2, z0 + 3, 4, 1.3, 0.8, '#8c5a3a', '#a9694a', { solid: false }); r.box(w / 2 - 2.4, z0 + 4.4, 4.8, 1.1, 0.5, '#4a6fa5', '#5d86c2'); r.box(w / 2 - 1, z0 + 2, 2, 0.8, 0.3, '#6b4b32', '#8a6a48', { solid: false });
    r.terminal(w / 2, d - 1.2 > z0 + 6.5 ? z0 + 6.4 : z0 + 6.2, 'n', 'TV · News', 'News', { w: 1.5, glow: [120, 170, 255], body: '#2b2f3a' });
    r.box(1, d - 2.6, 0.8, 2.6, 0.95, '#d9d3c4', '#4b5563'); r.box(1.2, d - 2.4 - 3.4 > z0 + 1 ? d - 2.6 - 1 : d - 2.6, 0.2, 0.2, 0.2, '#d9d3c4', '#d9d3c4', { solid: false });
    r.terminal(w - 1.6, z0 + 1.6, 'w', 'Computer · Files', 'Files', { glow: [140, 200, 255] }); r.terminal(w - 1.6, z0 + 3.4, 'w', 'Phone · Messages', 'Messages', { w: 0.6, glow: [120, 255, 160] }); r.terminal(w - 1.6, z0 + 5, 'w', 'Notes', 'Notes', { w: 0.7, glow: [255, 230, 140] });
    r.plant(w - 1, d - 1); return r; });
  register('generic', c => { const r = new Room(14, 10, 3.2, { name: c.name || 'Building' }); r.plant(1.2, 1.2); return r; });
  RW.Interiors = { register, build, Room, kinds: () => Object.keys(REG) };
})(typeof self !== 'undefined' ? self : this);
