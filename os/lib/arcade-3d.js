/* Arcade3D — the 3D look of the Arcade app, built on GL3D + GL3DAssets. PURELY VISUAL: it never touches money, odds or random numbers.
 * The kernel (os/kernel/arcade.js) still decides every spin and every card; these scenes only play back what it already decided.
 *
 *   const s = Arcade3D.slots(host)              → null when WebGL is off / the player switched 3D off (keep the DOM reels then)
 *     s.start()                                  reels begin to spin, lever is pulled
 *     await s.stop([r0, r1, r2])                 stops them one after another on those symbols (0 cherry … 5 seven)
 *     s.celebrate(mult) / s.lose()               coin shower, flashing bulbs / a dim, sad flicker
 *   const t = Arcade3D.table(host, 'blackjack' | 'bus' | 'poker')
 *     t.show({ dealer:[12,-1], player:[3,40] })  cards are dealt / flipped / cleared to match (code 0..51 face up, -1 face down)
 *     t.chips('bet', 25) · t.payout('bet', true) · t.labels('bus', [...], activeIndex) · t.celebrate(n) · t.lose()
 *   const b = Arcade3D.hero(host)               ambient banner for the Arcade home screen
 * Every controller has .eng (the GL3D engine) and .destroy(). The loops stop by themselves when the host leaves the page. */
(function(root){
  'use strict';
  const GL = root.GL3D, A = root.GL3DAssets; if(!GL || !A) return;
  const Mo = A.model, T = A.tex, TAU = GL.TAU, mat = GL.material, D2R = GL.D2R, V = GL.V;
  const prefs = () => { try{ const O = root.OS; if(!O || !O.prefs) return {}; const m = O.prefs.get('perfMode') || 'auto'; return { low: m === 'performance' || (m === 'auto' && O.prefs.get('perfAuto') === true), calm: !!O.prefs.get('reduceMotion'), off: O.prefs.get('arcade3d') === false }; }catch(e){ return {}; } };
  const enabled = () => GL.supported() && !prefs().off;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
  const col = (c, a) => A.rgb(c, a);

  function make(host, aspect, o){
    const p = prefs(), cv = document.createElement('canvas'); cv.className = 'a3d'; cv.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:' + aspect + ';max-height:' + (o.maxH || 380) + 'px;border-radius:14px;touch-action:manipulation;background:#0a0620';
    host.appendChild(cv);
    const eng = GL.create(cv, Object.assign({ quality: p.low ? 'low' : 'high', maxFps: p.low ? 30 : 60, antialias: !p.low }, o));
    if(!eng){ cv.remove(); return null; }
    eng.calm = !!p.calm; eng.canvasEl = cv; eng.onLost = () => { cv.style.display = 'none'; try{ host.dispatchEvent(new Event('a3d-lost')); }catch(e){} };
    return eng;
  }
  /* keeps `worldW` world units visible across the canvas whatever its shape: moves the camera along a fixed viewing direction */
  function fitWidth(eng, worldW, dir, target, minD){ const apply = () => { const asp = eng.w / eng.h, d = Math.max(minD || 4, (worldW / 2) / (Math.tan(eng.camera.fov / 2) * asp)); eng.camera.pos = [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d]; eng.camBase = eng.camera.pos.slice(); eng.camera.target = target.slice(); }; eng.onResize = apply; apply(); }
  function neon(eng, o){ o = o || {}; const L = eng.lights; L.sky = o.sky || [.42, .38, .62]; L.ground = o.ground || [.16, .12, .2]; L.dir.dir = o.dir || [-.4, -1, -.5]; L.dir.color = o.dirColor || [.95, .9, .82];
    L.points = [{ pos: [-3.2, 2.6, 2.4], color: [1, .24, .95], range: 9, intensity: .9 }, { pos: [3.2, 2.6, 2.4], color: [.15, .9, 1], range: 9, intensity: .9 }, { pos: [0, 4, 1], color: [1, .85, .55], range: 9, intensity: .5 }]; }
  const gold = [[1, .85, .3, 1], [1, .7, .15, 1], [1, .95, .6, 1]];
  function coinShower(ps, pos, n, spread){ ps.burst(n, pos, spread || 4.2, { up: true, cone: 1.1, colors: gold, size: .16, life: 1.5, gravity: -9 }); }

  /* ========================================================= SLOTS ========================================================= */
  const CELL = TAU / A.REEL_CELLS;
  const cellAngle = c => Math.PI / 2 - (c + .5) * CELL;                           // pivot rotation that brings reel-strip cell c to the front
  function drumMesh(R, L){ const m = GL.mesh.cylinder(R, R, L, 56, false, 1); for(let k = 0; k < m.v.length; k += 8){ const u = m.v[k + 6], v = m.v[k + 7]; m.v[k + 6] = v; m.v[k + 7] = u; } return m; }   // u runs along the axis, v around it
  function slots(host, o){
    if(!enabled()) return null; o = o || {};
    const eng = make(host, o.aspect || '2/1', { bg: [.04, .02, .1], fog: { color: [.05, .03, .12], density: .04 }, maxH: o.maxH || 400 }); if(!eng) return null;
    eng.setBackdrop(T.backdrop()); neon(eng, { dir: [-.3, -.8, -.7] }); const cam = eng.camera; cam.fov = 36 * D2R; eng.shadow.y = -1.52; eng.shadow.alpha = .45;
    fitWidth(eng, 8.6, V.norm([0, .1, 1]), [0, .75, 0], 7.5);
    const carpet = T.carpet(), floor = new GL.Node(GL.mesh.plane(40, 40, 1, 1, 14, 14), mat({ map: carpet.map, spec: .04, bumpK: 0 })); floor.pos[1] = -1.52; eng.add(floor);
    const red = (w, h, d, r, x, y, z) => { const n = new GL.Node(GL.mesh.roundedBox(w, h, d, r, 3), mat({ color: [.5, .05, .3, 1], map: T.metal('#d8d8e4').map, bump: T.metal('#d8d8e4').bump, bumpK: .003, spec: 1, shine: 70, refl: .3, uv: [2, 2, 0, 0] })); n.at(x, y, z); eng.add(n); return n; };
    red(4.7, 4.3, 2.2, .16, 0, .55, -.55).castShadow = true;
    const dark = mat({ color: [.04, .03, .07, 1], spec: .5, shine: 40, refl: .1 }), chrome = mat({ color: [.85, .86, .92, 1], map: T.metal().map, bump: T.metal().bump, bumpK: .002, spec: 1, shine: 90, refl: .5 });
    const bar = (w, h, d, x, y, z, m) => { const n = new GL.Node(GL.mesh.roundedBox(w, h, d, .06, 2), m || chrome); n.at(x, y, z); eng.add(n); return n; };
    const back = new GL.Node(GL.mesh.plane(4, 1.6, 1, 1), mat({ color: [.02, .015, .04, 1], unlit: true })); back.rot[0] = Math.PI / 2; back.at(0, .55, -.95); eng.add(back);
    /* reel window */
    const R = .86, LEN = .92, XS = [-.98, 0, .98], YC = .55, reels = [], strip = T.reelStrip(), dm = drumMesh(R, LEN);
    XS.forEach(x => { const pv = new GL.Node(); pv.at(x, YC, 0); const dr = new GL.Node(dm, mat({ map: strip, spec: .5, shine: 50, refl: .1, bumpK: 0 })); dr.rot[2] = Math.PI / 2; pv.add(dr); eng.add(pv); reels.push({ pv, ang: cellAngle(5), vel: 0, mode: 'idle', target: 0 }); pv.rot[0] = cellAngle(5); });
    bar(4.0, .96, .4, 0, YC + .64 + .48, .98); bar(4.0, .96, .4, 0, YC - .64 - .48, .98); bar(.62, 2.5, .4, -1.78, YC, .98); bar(.62, 2.5, .4, 1.78, YC, .98);
    [-.49, .49].forEach(x => bar(.06, 1.3, .3, x, YC, .88, dark));
    const glass = new GL.Node(GL.mesh.quad(3.0, 1.3), mat({ color: [1, 1, 1, .07], spec: 1, shine: 90, refl: .5, blend: 'blend', depthWrite: false, fog: false })); glass.at(0, YC, 1.02); eng.add(glass);
    const line = new GL.Node(GL.mesh.quad(3.05, .035), mat({ color: [1, .15, .25, .9], unlit: true, blend: 'add', depthWrite: false, fog: false })); line.at(0, YC, .93); eng.add(line);
    [-1, 1].forEach(sd => { const t = new GL.Node(GL.mesh.cylinder(0, .12, .2, 3, true), mat({ color: [1, .2, .3, 1], emissive: [.9, .1, .2], unlit: false })); t.at(sd * 1.62, YC, .98); t.rot[2] = sd * -Math.PI / 2; eng.add(t); });
    /* top sign + tray */
    const sign = bar(3.7, .9, .4, 0, 2.55, .7, mat({ color: [.07, .03, .16, 1], spec: .6, shine: 60, refl: .15 })), signTex = Mo.labelPlane('WEST SLOTS', 3.5, .7, { glow: '#ff3df2', color: '#fff', w: 1024, h: 256 }); signTex.at(0, 2.55, .93); eng.add(signTex); const sg = Mo.sprite('#ff3df2', 4.6, { alpha: .55 }); sg.at(0, 2.55, .98); eng.add(sg);
    bar(2.0, .22, .6, 0, -1.2, 1.0, mat({ color: [.1, .08, .12, 1], spec: .8, shine: 60, refl: .2 }));
    /* marquee bulbs */
    const onM = mat({ color: [1, .85, .4, 1], emissive: [1, .8, .3], spec: .8 }), offM = mat({ color: [.35, .22, .12, 1], emissive: [.05, .03, 0], spec: .6 }), bulbs = [];
    const bulbMesh = GL.mesh.sphere(.07, 12, 8), addBulb = (x, y) => { const b = new GL.Node(bulbMesh, offM); b.at(x, y, 1.2); eng.add(b); bulbs.push(b); };
    for(let i = 0; i < 9; i++){ addBulb(-1.84 + i * .46, 2.21); addBulb(-1.84 + i * .46, -.9 + .0); }
    for(let i = 0; i < 5; i++){ addBulb(-1.98, .0 + i * .32 - .15); addBulb(1.98, 0 + i * .32 - .15); }
    /* lever */
    const lv = new GL.Node(); lv.at(2.62, .2, .35); const arm = new GL.Node(GL.mesh.cylinder(.06, .06, 1.15, 14, true), chrome); arm.pos[1] = .58; const knob = new GL.Node(GL.mesh.sphere(.2, 20, 14), mat({ color: [.9, .08, .15, 1], spec: 1, shine: 90, refl: .35 })); knob.pos[1] = 1.2; lv.add(arm); lv.add(knob); eng.add(lv); arm.castShadow = true; knob.castShadow = true;
    /* effects */
    const coins = eng.particles({ max: 320, blend: 'blend', shape: 'dot', gravity: -9, drag: .15 }), sparks = eng.particles({ max: 160, blend: 'add', shape: 'star', gravity: -1, drag: 1.2 });
    let flash = 0, lose = 0, spinning = false, shake = 0, tt = 0, lever = 0;
    eng.onUpdate = (dt, t) => {
      tt = t; reels.forEach(r => { if(r.mode === 'spin'){ r.vel = Math.min(r.vmax || 15, r.vel + 40 * dt); r.ang += r.vel * dt; } r.pv.rot[0] = r.ang; });
      flash = Math.max(0, flash - dt); lose = Math.max(0, lose - dt); shake = Math.max(0, shake - dt * 2.2);
      bulbs.forEach((b, i) => { const on = flash > 0 ? ((Math.floor(t * 9) + i) % 2 === 0) : spinning ? ((Math.floor(t * 12) + i) % 3 === 0) : ((Math.floor(t * 1.5) + i) % 4 === 0); b.mat = on ? onM : offM; });
      lv.rot[0] = lever; const sw = eng.calm ? 0 : Math.sin(t * .5) * .22, base = eng.camBase; cam.target = [sw * .3, .75, 0]; cam.pos = [base[0] + sw + (Math.random() - .5) * shake * .12, base[1] + (Math.random() - .5) * shake * .08, base[2]];
      eng.lights.points[0].intensity = lose > 0 ? .15 : (.9 + (flash > 0 ? Math.sin(t * 30) * .4 : 0)); eng.lights.points[2].color = flash > 0 ? [1, .85, .2] : [1, .85, .55];
      eng.lights.points[2].intensity = flash > 0 ? 1.3 : .5;
    };
    const symAngle = (r, sym) => { const base = cellAngle(sym + (Math.random() < .5 ? 0 : 6)), need = r.ang + TAU * 1.1; return base + TAU * Math.ceil((need - base) / TAU); };
    const S = { eng, reels,
      start(){ spinning = true; coins.clear(); sparks.clear(); reels.forEach((r, i) => { r.mode = 'spin'; r.vel = 2 + i; r.vmax = 15 + i * 1.5; }); eng.tween(180, k => { lever = k * 1.0; }, 'outQuad').then(() => eng.tween(260, k => { lever = 1 - k; }, 'outBack')); },
      setSymbols(arr){ reels.forEach((r, i) => { r.mode = 'idle'; r.vel = 0; r.ang = cellAngle(arr[i] + 6); r.pv.rot[0] = r.ang; }); },
      reset(){ spinning = false; reels.forEach(r => { r.mode = 'idle'; r.vel = 0; }); },
      async stop(res){ for(let i = 0; i < 3; i++){ const r = reels[i]; r.mode = 'stopping'; const from = r.ang, to = symAngle(r, res[i]), dur = eng.calm ? 260 : 780 + i * 60; await eng.tween(dur, k => { r.ang = from + (to - from) * k; }, 'outBack'); r.ang = to; r.mode = 'idle'; r.vel = 0; shake = Math.max(shake, .6); await eng.wait(eng.calm ? 40 : 130); } spinning = false; },
      celebrate(mult){ if(!(mult > 0)) return; flash = mult >= 40 ? 3.5 : mult >= 10 ? 2.2 : 1.1; const n = Math.min(260, 24 + mult * 5); coinShower(coins, [0, YC + .1, 1.25], n, 3.6 + Math.min(3, mult / 25)); sparks.burst(Math.min(90, 14 + mult), [0, YC, 1.3], 3, { color: [1, .9, .5, 1], size: .3, life: 1.1, grow: .2 }); if(mult >= 40) shake = 1.4; },
      lose(){ lose = .9; },
      destroy(){ eng.destroy(); eng.canvasEl.remove(); } };
    S.setSymbols([5, 5, 5]); eng.start(); return S;
  }

  /* ========================================================= CARD TABLE ========================================================= */
  const LAYOUT = {
    blackjack: { dealer: { x0: -.75, z: -1.2, dx: .5 }, player: { x0: -.75, z: .95, dx: .5 }, shoe: [3.4, .5, -1.9], chips: { bet: [0, 0, 1.74] } },
    bus: { stage: { x0: -1.95, z: .05, dx: 1.3, cap: 4, s: 1.12 }, shoe: [3.5, .5, -1.9], chips: { bet: [-3.0, 0, 1.1] } },
    poker: { board: { x0: -1.56, z: -.1, dx: .78, cap: 5 }, h0: { x0: -.3, z: 1.62, dx: .56, cap: 2 }, h1: { x0: -2.7, z: -1.6, dx: .56, cap: 2 }, h2: { x0: -.3, z: -1.6, dx: .56, cap: 2 }, h3: { x0: 2.1, z: -1.6, dx: .56, cap: 2 }, shoe: [3.4, .5, -.9], chips: { pot: [0, 0, .82] } }
  };
  function table(host, kind, o){
    if(!enabled() || !LAYOUT[kind]) return null; o = o || {}; const LY = LAYOUT[kind];
    const eng = make(host, o.aspect || (kind === 'bus' ? '2.4/1' : '2.1/1'), { bg: [.03, .02, .07], fog: { color: [.03, .02, .08], density: .018 }, maxH: o.maxH || 380 }); if(!eng) return null;
    eng.setBackdrop(T.backdrop([[0, '#06030d'], [1, '#1a0a3a']])); neon(eng, { dir: [-.35, -1, -.55] }); eng.camera.fov = 40 * D2R; eng.shadow.y = 0; eng.shadow.alpha = .42;
    eng.add(Mo.table(kind)); fitWidth(eng, 9.4, V.norm([0, 1.05, .95]), [0, 0, .3], 7);
    const floor = new GL.Node(GL.mesh.plane(60, 60, 1, 1, 20, 20), mat({ map: T.carpet().map, spec: 0 })); floor.pos[1] = -.5; eng.add(floor);
    const outline = (() => { const [c, g] = A.mk(128, 192); A.roundRect(g, 6, 6, 116, 180, 12); g.lineWidth = 4; g.strokeStyle = 'rgba(255,225,77,.45)'; g.stroke(); g.fillStyle = 'rgba(0,0,0,.18)'; g.fill(); return new GL.Texture(c, { repeat: false }); })();
    const groups = {}, SC = {}, ps = eng.particles({ max: 300, blend: 'blend', shape: 'dot', gravity: -9, drag: .15 }), sp = eng.particles({ max: 120, blend: 'add', shape: 'star', gravity: -1, drag: 1.2 });
    Object.keys(LY).forEach(k => { if(k === 'shoe' || k === 'chips') return; groups[k] = []; const l = LY[k]; SC[k] = l.s || 1; if(l.cap) for(let i = 0; i < l.cap; i++){ const n = new GL.Node(GL.mesh.quad(1, 1), mat({ map: outline, color: [1, 1, 1, 1], blend: 'blend', depthWrite: false, unlit: true, fog: false })); n.rot[0] = -Math.PI / 2; n.scaleTo(A.CARD.w * SC[k], A.CARD.h * SC[k], 1); n.at(l.x0 + i * l.dx, .006, l.z); eng.add(n); } });
    const posOf = (name, i) => { const l = LY[name]; return [l.x0 + i * l.dx, .03 + i * .004, l.z]; };
    const yaw = (name, i) => Math.sin(name.length * 7 + i * 3.1) * .05;
    let delay = 0, flash = 0, lose = 0;
    const settle = c => { const p = posOf(c.name, c.i); c.node.pos = p.slice(); c.node.rot = [c.code >= 0 ? -Math.PI / 2 : Math.PI / 2, yaw(c.name, c.i), 0]; };
    function mkCard(name, i, code){ const node = Mo.card(code, { scale: SC[name] }); node.each(n => { n.order = 0; }); eng.add(node); return { node, code, name, i, tok: 0 }; }
    async function fly(c, withFlip, wait){
      const tok = ++c.tok, from = LY.shoe.slice(), to = posOf(c.name, c.i), n = c.node, ms = eng.calm ? 120 : 380; n.visible = false; if(wait) await eng.wait(wait); if(c.tok !== tok || c.dead) return; n.visible = true; n.pos = from.slice(); n.rot = [Math.PI / 2, rnd(-.6, .6), 0];
      const y0 = yaw(c.name, c.i);
      await eng.tween(ms, k => { n.pos = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k + Math.sin(k * Math.PI) * .7, from[2] + (to[2] - from[2]) * k]; n.rot[1] = (1 - k) * -.5 + y0 * k; }, 'outCubic'); if(c.tok !== tok || c.dead) return;
      if(withFlip) await flip(c); else settle(c);
    }
    async function flip(c){ const tok = ++c.tok, n = c.node, to = posOf(c.name, c.i), ms = eng.calm ? 120 : 420; await eng.tween(ms, k => { n.pos = [to[0], to[1] + Math.sin(k * Math.PI) * .55, to[2]]; n.rot[0] = Math.PI / 2 - Math.PI * k; n.rot[1] = yaw(c.name, c.i) + Math.sin(k * Math.PI) * .12; }, 'inOutQuad'); if(c.tok === tok && !c.dead) settle(c); }
    async function discard(c){ c.dead = true; c.tok++; const n = c.node, from = n.pos.slice(); await eng.tween(eng.calm ? 80 : 260, k => { n.pos = [from[0] - k * 3.2, from[1] + Math.sin(k * Math.PI) * .3, from[2] - k * 1.8]; const s = 1 - k * .6; n.scaleTo(s, s, s); }, 'inQuad'); n.dispose(); }
    const X = { eng, groups,
      show(state){ state = state || {}; const tasks = [], names = Object.keys(groups);
        names.forEach(name => { const want = state[name] || [], g = groups[name]; let cut = -1;
          for(let i = 0; i < g.length; i++){ const c = g[i], w = want[i]; if(w == null || (c.code >= 0 && w !== c.code)){ cut = i; break; } }
          if(cut >= 0) g.splice(cut).forEach(discard);
          g.forEach((c, i) => { if(c.code < 0 && want[i] != null && want[i] >= 0){ c.code = want[i]; Mo.setCard(c.node, want[i]); flip(c); } });
          for(let i = g.length; i < want.length; i++) if(want[i] != null) tasks.push({ name, i, code: want[i] }); });
        tasks.sort((a, b) => (a.i - b.i) || (names.indexOf(a.name) - names.indexOf(b.name)));
        let d = 0; tasks.forEach(t => { const c = mkCard(t.name, t.i, t.code); groups[t.name][t.i] = c; settle(c); fly(c, t.code >= 0, d); d += eng.calm ? 30 : 190; }); },
      clear(){ X.show({}); X.chips('bet', 0); X.chips('pot', 0); },
      chips(name, amount){ const at = LY.chips[name]; if(!at) return; const old = X['_c_' + name]; if(old && old.amount === amount) return; if(old){ old.node.dispose(); X['_c_' + name] = null; } if(!(amount >= 1)) return;
        const pile = Mo.chipPile(amount), W = pile.children.length ? 1 : 0; pile.at(at[0] - .25, at[1], at[2]); eng.add(pile); X['_c_' + name] = { node: pile, amount }; eng.tween(eng.calm ? 60 : 260, k => { pile.scaleTo(.4 + .6 * k, .4 + .6 * k, .4 + .6 * k); }, 'outBack'); },
      async payout(name, toPlayer){ const c = X['_c_' + name]; if(!c) return; X['_c_' + name] = null; const n = c.node, f = n.pos.slice(), dz = toPlayer ? 2.6 : -4.6; await eng.tween(eng.calm ? 60 : 520, k => { n.pos = [f[0], f[1] + Math.sin(k * Math.PI) * .4, f[2] + dz * k]; }, 'inOutCubic'); n.dispose(); },
      labels(name, arr, active){ const l = LY[name]; (X['_l_' + name] || []).forEach(n => n.dispose()); X['_l_' + name] = (arr || []).map((tx, i) => { const n = Mo.labelPlane(tx, 1.2, .3, { w: 512, h: 128, color: i === active ? '#ffe14d' : 'rgba(255,255,255,.5)', glow: i === active ? '#ffe14d' : null, size: 48 }); n.rot[0] = -Math.PI / 2; n.at(l.x0 + i * l.dx, .012, l.z + A.CARD.h * (SC[name]) / 2 + .24); eng.add(n); return n; }); },
      celebrate(n){ flash = 1.6; coinShower(ps, [0, .5, .2], Math.min(220, 30 + (n || 3) * 10), 3.8); sp.burst(40, [0, .6, .2], 2.6, { color: [1, .9, .5, 1], size: .3, life: 1, grow: .2 }); },
      lose(){ lose = .9; },
      destroy(){ eng.destroy(); eng.canvasEl.remove(); } };
    eng.onUpdate = (dt, t) => { flash = Math.max(0, flash - dt); lose = Math.max(0, lose - dt); eng.lights.points[0].intensity = lose > 0 ? .1 : .9 + (flash > 0 ? Math.sin(t * 28) * .4 : 0); eng.lights.points[1].color = lose > 0 ? [1, .1, .1] : [.15, .9, 1]; if(!eng.calm){ const sw = Math.sin(t * .35) * .5; eng.camera.target = [sw * .3, 0, .3]; eng.lights.points[2].pos = [Math.sin(t * .5) * 3, 4, 1]; } };
    eng.start(); return X;
  }

  /* ========================================================= HERO BANNER ========================================================= */
  function hero(host, o){
    if(!enabled()) return null; o = o || {};
    const eng = make(host, o.aspect || '4.4/1', { bg: [.03, .01, .08], fog: { color: [.16, .04, .3], density: .035 }, maxH: o.maxH || 220 }); if(!eng) return null;
    eng.setBackdrop(T.backdrop()); neon(eng, { dir: [-.3, -.7, -.6] }); eng.camera.fov = 38 * D2R; eng.shadow.y = 0; eng.shadow.alpha = .35;
    fitWidth(eng, 9.2, V.norm([0, .2, 1]), [0, 1.35, 0], 6.5);
    const grid = T.neonGrid('#27e8ff'), gmat = mat({ map: grid.map, emap: grid.emissive, emissive: [.05, .02, .1], spec: 0, uv: [34, 34, 0, 0] }), floor = new GL.Node(GL.mesh.plane(60, 60, 1, 1, 1, 1), gmat); eng.add(floor);
    const sign = Mo.labelPlane('ARCADE', 6.6, 1.5, { glow: '#ff3df2', color: '#fff', w: 1024, h: 256 }); sign.at(0, 2.35, -2.6); eng.add(sign); const sg = Mo.sprite('#ff3df2', 8, { alpha: .45 }); sg.at(0, 2.35, -2.7); eng.add(sg);
    const coin = Mo.coin(); coin.scaleTo(1.25); coin.at(0, 1.4, .2); coin.rot[0] = Math.PI / 2; eng.add(coin);
    const dice = [-3.2, 3.4].map((x, i) => { const d = Mo.die(.62); d.at(x, .6, i ? -.2 : .3); eng.add(d); return d; });
    const cards = [[-1.9, 12], [-1.25, 25], [1.35, 51], [2.0, 38]].map(([x, code], i) => { const c = Mo.card(code, { scale: 1.1 }); c.at(x, 1.2 + (i % 2) * .15, .2 - Math.abs(x) * .1); eng.add(c); return c; });
    const chips = [-4.3, 4.4].map((x, i) => { const p = Mo.chipPile(i ? 125 : 60); p.at(x, 0, .6); eng.add(p); return p; });
    const sp = eng.particles({ max: 140, blend: 'add', shape: 'star', gravity: .2, drag: .8 }); let mx = 0, acc = 0;
    eng.canvasEl.addEventListener('pointermove', e => { const r = eng.canvasEl.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width - .5) * 2; });
    eng.onUpdate = (dt, t) => { const k = eng.calm ? 0 : 1; gmat.uv[3] = (t * .5 * k) % 1; coin.rot[1] = t * 1.3 * k; coin.rot[0] = Math.PI / 2 + Math.sin(t * .9) * .25 * k; coin.pos[1] = 1.4 + Math.sin(t * 1.4) * .12 * k;
      dice.forEach((d, i) => { d.rot[0] = t * (.7 + i * .3) * k; d.rot[1] = t * (.9 - i * .2) * k; d.pos[1] = .62 + Math.abs(Math.sin(t * 1.6 + i * 2)) * .5 * k; });
      cards.forEach((c, i) => { c.rot[1] = Math.sin(t * .6 + i) * .45 * k; c.rot[2] = Math.sin(t * .8 + i * 2) * .18 * k; c.pos[1] = 1.2 + Math.sin(t * 1.1 + i * 1.7) * .14 * k; });
      const cb = eng.camBase; eng.camera.pos = [cb[0] + mx * .7, cb[1], cb[2]]; eng.camera.target = [mx * .35, 1.35, 0]; acc += dt; if(acc > .09 && !eng.calm){ acc = 0; sp.emit({ pos: [rnd(-2.4, 2.4), rnd(.4, 2.6), rnd(-.6, .8)], vel: [0, rnd(.1, .5), 0], color: pick([[1, .24, .95, 1], [.15, .9, 1, 1], [1, .9, .4, 1]]), size: rnd(.16, .34), life: rnd(1, 2) }); }
      eng.lights.points[1].color = [.15 + Math.sin(t) * .1, .9, 1]; };
    eng.start(); return { eng, destroy(){ eng.destroy(); eng.canvasEl.remove(); } };
  }

  root.Arcade3D = { enabled, slots, table, hero, make, fitWidth, coinShower, LAYOUT, cellAngle };
})(typeof window !== 'undefined' ? window : globalThis);
