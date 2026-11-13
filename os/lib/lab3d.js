/* Lab3D — the 3D WestLab bench: wooden table, Bunsen burner + tripod + gauze, an Erlenmeyer flask (liquid, bubbles, steam), a beaker, a test-tube rack and
 * reagent bottles on a tiled lab wall. Built on GL3D (os/lib/gl3d.js) + GL3DAssets. VISUAL ONLY: WestLab's chemistry decides everything, this just plays it back.
 *
 *   await Kit.use3D();                                   // loads GL3D + GL3DAssets
 *   const L3 = Lab3D.create(hostEl, { quality:'high'|'low' });   // → null when WebGL is unavailable (the 2D stage stays)
 *   L3.set({ heat:0..1, color:'#hex|hsl()|null', level:0..1, running:bool, tint:'css'|null })   // call as often as you like
 *   L3.pulse('#hex')  — end-of-reaction flash + sparkle;   L3.destroy()
 * Drag the canvas to look around the bench. The loop stops by itself when the canvas leaves the DOM (GL3D rule). */
(function(root){
  'use strict';
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
  let _cx = null;
  function css(c, fb){                                   // any CSS colour → [r,g,b] 0..1
    if(Array.isArray(c)) return c; if(!c) return fb || [.6, .8, 1];
    try{ if(!_cx){ const k = document.createElement('canvas'); k.width = k.height = 1; _cx = k.getContext('2d', { willReadFrequently: true }); }
      _cx.clearRect(0, 0, 1, 1); _cx.fillStyle = '#000'; _cx.fillStyle = String(c); _cx.fillRect(0, 0, 1, 1); const d = _cx.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255]; }catch(e){ return fb || [.6, .8, 1]; }
  }
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  function create(host, opt){
    opt = opt || {}; const GL = root.GL3D, A = root.GL3DAssets; if(!GL || !A || !GL.supported()) return null;
    const cv = document.createElement('canvas'); cv.className = 'l3d'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    host.insertBefore(cv, host.firstChild);
    const low = opt.quality === 'low', eng = GL.create(cv, { quality: low ? 'low' : 'high', maxFps: low ? 30 : 60, bg: [.10, .13, .16], fog: { color: [.10, .13, .16], density: .012 }, antialias: true });
    if(!eng){ cv.remove(); return null; } eng.canvasEl = cv;
    const M = GL.mesh, mat = GL.material, T = A.tex;

    /* ---- lights ---- */
    eng.lights.sky = [.62, .66, .72]; eng.lights.ground = [.25, .22, .2]; eng.lights.dir = { dir: [-.4, -1, -.55], color: [.95, .92, .85] };
    eng.lights.points = [{ pos: [0, 1.0, .2], color: [1, .6, .25], intensity: 0, range: 4 }, { pos: [0, 1.6, .6], color: [.5, .8, 1], intensity: 0, range: 4 }];
    eng.shadow.y = 0; eng.shadow.alpha = .34;

    /* ---- room: tiled wall + shelf, bench ---- */
    const wallTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#dfe9ec'; g.fillRect(0, 0, 256, 256);
      for(let y = 0; y < 4; y++) for(let x = 0; x < 4; x++){ const sh = 232 + ((x * 7 + y * 13) % 5) * 3; g.fillStyle = 'rgb(' + (sh - 14) + ',' + sh + ',' + (sh + 2) + ')'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 3); }
      return new GL.Texture(c); })();
    eng.node(M.plane(14, 6, 1, 1, 7, 3), mat({ map: wallTex, spec: .5, shine: 48, uv: [1, 1, 0, 0] }), 0, 3, -2.2).rotate(Math.PI / 2, 0, 0);
    eng.node(M.plane(14, 6, 1, 1, 1, 1), mat({ color: [.16, .17, .2, 1] }), 0, -.8, 0).rotate(0, 0, 0);                             // dark floor far below
    const wd = T.wood('#7a4a22'), top = eng.node(M.roundedBox(8.4, .22, 3.4, .05, 3), mat({ map: wd.map, bump: wd.bump, bumpK: .2, spec: .3, shine: 30, uv: [1.5, 1, 0, 0] }), 0, -.11, .35); top.castShadow = false;
    eng.node(M.roundedBox(8.6, .5, 3.5, .05, 3), mat({ map: wd.map, color: [.5, .5, .5, 1] }), 0, -.5, .35);
    // shelf with bottles on the wall
    eng.node(M.roundedBox(7, .08, .5, .02, 2), mat({ map: wd.map, color: [.8, .8, .8, 1] }), 0, 2.35, -1.95);
    const glassMat = c => mat({ color: [c[0], c[1], c[2], .2], blend: 'blend', spec: 1, shine: 90, refl: .25, depthWrite: false, cull: false });
    [[-2.8, [.3, .6, .9]], [-2.4, [.9, .5, .2]], [-1.9, [.4, .8, .5]], [1.6, [.9, .8, .3]], [2.1, [.8, .3, .4]], [2.6, [.6, .5, .9]]].forEach(([x, c], i) => {
      const bott = M.lathe([[0, 0], [.17, 0], [.18, .03], [.18, .38], [.12, .48], [.07, .55], [.07, .66], [.09, .68]], 20), liq = M.lathe([[0, .02], [.16, .02], [.165, .3], [0, .3]], 20);
      const g = eng.node(null, null, x, 2.39, -1.95); g.add(Object.assign(new GL.Node(liq, mat({ color: [c[0], c[1], c[2], .9], spec: .8, shine: 60 })), {})); g.add(new GL.Node(bott, glassMat([.8, .95, 1]))); g.scaleTo(1.0, 1.0 + (i % 3) * .08, 1.0); });

    /* ---- helpers ---- */
    const steel = T.metal('#b9bec8'), plain = mat({ color: [.78, .8, .84, 1], spec: 1, shine: 80, refl: .1 }), dark = mat({ color: [.16, .17, .19, 1], spec: .6, shine: 50 }), chrome = mat({ map: steel.map, bump: steel.bump, bumpK: .5, spec: 1, shine: 80, refl: .08, uv: [2, 1, 0, 0] });
    const part = (m, mt, x, y, z, parent, shadow) => { const n = new GL.Node(m, mt); n.at(x, y, z); (parent || eng.scene).add(n); if(shadow) n.castShadow = true; return n; };

    /* ---- Bunsen burner + tripod ---- */
    const BX = 0, BZ = .15, burner = eng.node(null, null, BX, 0, BZ);
    part(M.cylinder(.34, .38, .09, 40), mat({ color: [.14, .15, .17, 1], spec: .7, shine: 60 }), 0, .045, 0, burner, true);
    part(M.cylinder(.12, .2, .12, 32), dark, 0, .15, 0, burner);
    part(M.cylinder(.07, .07, .78, 24, true), plain, 0, .62, 0, burner, true);
    part(M.cylinder(.11, .11, .1, 28), mat({ color: [.75, .45, .2, 1], spec: .8, shine: 70 }), 0, .34, 0, burner);                          // brass air collar
    part(M.cylinder(.012, .012, .05, 6), mat({ color: [0, 0, 0, 1] }), .11, .34, 0, burner);                                           // air hole
    const hose = part(M.torus(.26, .028, 24, 8), mat({ color: [.1, .35, .15, 1], spec: .3 }), -.24, .12, 0, burner); hose.rotate(Math.PI / 2, 0, 0); hose.scaleTo(1, 1, 1);
    const tri = eng.node(null, null, BX, 0, BZ);
    for(let i = 0; i < 3; i++){ const a = i / 3 * TAU + .5, leg = part(M.cylinder(.025, .025, 1.34, 8), plain, Math.cos(a) * .52, .6, Math.sin(a) * .52, tri, true); leg.rot[2] = -Math.cos(a) * .24; leg.rot[0] = Math.sin(a) * .24; }
    part(M.torus(.45, .03, 32, 8), plain, 0, 1.2, 0, tri, true);
    const gz = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(210,214,220,.95)'; g.lineWidth = 2; for(let i = 0; i <= 16; i++){ g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8, 128); g.moveTo(0, i * 8); g.lineTo(128, i * 8); g.stroke(); } return new GL.Texture(c); })();
    part(M.disc(.47, 40), mat({ map: gz, blend: 'blend', alphaCut: .1, depthWrite: false, cull: false, spec: .2 }), 0, 1.215, 0, tri);

    /* ---- the flame (outer orange, inner blue; additive) ---- */
    const flameP = [[0, 0], [.07, .01], [.115, .14], [.1, .32], [.06, .52], [0, .78]], innerP = [[0, 0], [.04, .01], [.07, .1], [.045, .24], [0, .38]];
    const fo = new GL.Node(M.lathe(flameP, 20), mat({ color: [1, .55, .15, .55], blend: 'add', unlit: true, depthWrite: false, cull: false, fog: false })), fi = new GL.Node(M.lathe(innerP, 20), mat({ color: [.25, .45, 1, .85], blend: 'add', unlit: true, depthWrite: false, cull: false, fog: false }));
    fo.at(BX, 1.0, BZ); fi.at(BX, 1.0, BZ); eng.scene.add(fo); eng.scene.add(fi);
    const pilot = new GL.Node(M.lathe([[0, 0], [.03, .01], [.04, .08], [0, .22]], 12), mat({ color: [.3, .5, 1, .8], blend: 'add', unlit: true, depthWrite: false, cull: false, fog: false })); pilot.at(BX, 1.0, BZ); eng.scene.add(pilot);

    /* ---- Erlenmeyer flask + liquid (sits on the gauze) ---- */
    const FY = 1.235, flask = eng.node(null, null, BX, FY, BZ);
    const outer = [[0, 0], [.4, 0], [.435, .045], [.4, .12], [.19, .8], [.17, .95], [.2, 1.0], [.17, 1.03]], inner = [[0, .015], [.385, .015], [.41, .05], [.38, .12], [.18, .79], [.16, .95]];
    const glass = new GL.Node(M.lathe(outer, 48), glassMat([.82, .96, 1])); glass.order = 3; flask.add(glass);
    const liq = new GL.Node(M.lathe([[0, .02], [.385, .02], [.41, .05], [.395, .1], [.385, .12], [.30, .12], [0, .12]], 48), mat({ color: [.4, .7, 1, .85], spec: .9, shine: 70, blend: 'blend', depthWrite: false })); liq.order = 1; flask.add(liq);
    /* the liquid is rebuilt as a lathe of the flask interior up to the fill level (cheap: 48×~8 verts) */
    function liquidMesh(level){ const h = lerp(.0, .62, clamp(level, 0, 1)) + .04, pts = [[0, .02], [.385, .02], [.41, .05]], full = [[.38, .12], [.18, .79]];
      // interior radius at height y (linear between known profile points)
      const rAt = y => y <= .12 ? lerp(.41, .38, clamp((y - .05) / .07, 0, 1)) : lerp(.38, .18, clamp((y - .12) / .67, 0, 1));
      const steps = 5; for(let i = 1; i <= steps; i++){ const y = lerp(.06, h, i / steps); pts.push([rAt(y) - .005, y]); } pts.push([0, h]); return { mesh: M.lathe(pts, 40), top: h, r: rAt(h) }; }
    let lvKey = -1, liqTop = .3, liqR = .3;
    const surf = new GL.Node(M.disc(1, 28), mat({ color: [1, 1, 1, .5], blend: 'blend', spec: 1, shine: 100, depthWrite: false, unlit: false })); flask.add(surf);
    // cork-free neck lip glow line (just a thin torus for realism)
    part(M.torus(.185, .014, 24, 6), glassMat([.9, 1, 1]), 0, 1.0, 0, flask);

    /* ---- beaker (left), test-tube rack (right), small measuring cylinder ---- */
    const bk = eng.node(null, null, -2.0, 0, .55);
    const bkO = [[0, 0], [.44, 0], [.46, .03], [.46, 1.0], [.5, 1.04]], bkL = [[0, .03], [.44, .03], [.445, .62], [0, .62]]; const bkC = [.75, .6, .35];
    bk.add(Object.assign(new GL.Node(M.lathe(bkL, 40), mat({ color: [bkC[0], bkC[1], bkC[2], .8], blend: 'blend', depthWrite: false, spec: .9, shine: 60 })), { order: 1 })); const bg = new GL.Node(M.lathe(bkO, 40), glassMat([.85, .97, 1])); bg.order = 3; bk.add(bg);
    for(let i = 1; i <= 4; i++) part(M.cylinder(.465, .465, .008, 40, false), mat({ color: [1, 1, 1, .7], blend: 'blend', depthWrite: false, cull: false }), 0, .14 + i * .16, 0, bk);   // graduation rings
    const cy = eng.node(null, null, -1.15, 0, .95); const cyO = [[0, 0], [.22, 0], [.23, .03], [.12, .07], [.1, .1], [.1, 1.25], [.125, 1.28]]; { const gl2 = new GL.Node(M.lathe(cyO, 28), glassMat([.85, .97, 1])); gl2.order = 3; cy.add(gl2); cy.add(Object.assign(new GL.Node(M.lathe([[0, .1], [.09, .1], [.09, .55], [0, .55]], 24), mat({ color: [.9, .35, .4, .85], blend: 'blend', depthWrite: false, spec: .9, shine: 60 })), { order: 1 })); }
    const rack = eng.node(null, null, 2.1, 0, .5);
    part(M.roundedBox(1.7, .06, .6, .02, 2), mat({ map: wd.map, color: [.9, .8, .7, 1] }), 0, .55, 0, rack, true); part(M.roundedBox(1.7, .06, .6, .02, 2), mat({ map: wd.map, color: [.9, .8, .7, 1] }), 0, .12, 0, rack, true);
    [-.65, .65].forEach(x => part(M.roundedBox(.07, .56, .56, .02, 2), mat({ map: wd.map, color: [.85, .75, .65, 1] }), x, .33, 0, rack));
    const tubeCol = [[.9, .3, .3], [.3, .8, .4], [.3, .5, .95], [.95, .8, .25], [.7, .4, .9]];
    tubeCol.forEach((c, i) => { const x = -.6 + i * .3, tb = eng.node(null, null, x, 0, 0); rack.add(tb); tb.at(x, .08, 0);
      const to = [[0, 0], [.07, .005], [.095, .12], [.095, .85], [.108, .88]]; const g1 = new GL.Node(M.lathe(to, 18), glassMat([.85, .97, 1])); g1.order = 3; tb.add(g1);
      tb.add(Object.assign(new GL.Node(M.lathe([[0, .02], [.08, .03], [.088, .12], [.088, .2 + (i % 3) * .1], [0, .2 + (i % 3) * .1]], 16), mat({ color: [c[0], c[1], c[2], .85], blend: 'blend', depthWrite: false, spec: .9, shine: 60 })), { order: 1 })); });
    // notebook + safety goggles for flavour
    part(M.roundedBox(.9, .05, .65, .02, 2), mat({ color: [.2, .35, .6, 1], spec: .3 }), 1.1, .03, 1.15, null, true).rot[1] = -.3;
    part(M.roundedBox(.82, .012, .58, .01, 1), mat({ color: [.95, .95, .9, 1], spec: .1 }), 1.1, .06, 1.15).rot[1] = -.3;

    /* ---- particles ---- */
    const sparks = eng.particles({ shape: 'glow', blend: 'add', max: 160, gravity: -.6, drag: .4 }), bubbles = eng.particles({ shape: 'dot', blend: 'blend', max: 140, gravity: 1.1, drag: 1.2 }), steam = eng.particles({ shape: 'glow', blend: 'blend', max: 80, gravity: .5, drag: .9 });

    /* ---- state ---- */
    const S = { heat: 0, color: null, level: 0, running: false, tint: null }, cur = { col: [.4, .7, 1], lvl: 0, heat: 0 }; let flash = 0, yaw = 0, pit = 0, dragX = 0, dragY = 0, drag = false, sway = 0, bubT = 0, steT = 0;
    const L3 = { engine: eng, canvas: cv, set(o){ Object.assign(S, o || {}); return L3; }, pulse(color){ flash = 1; const c = css(color, [1, .9, .6]); sparks.burst(46, [BX, FY + .75, BZ], 2.4, { colors: [[c[0], c[1], c[2], 1], [1, 1, .8, 1]], size: .14, life: 1.1, up: true, cone: .8, gravity: -2.5 }); }, destroy(){ try{ eng.destroy(); }catch(e){} cv.remove(); } };

    /* ---- look around by dragging ---- */
    cv.addEventListener('pointerdown', e => { drag = true; dragX = e.clientX; dragY = e.clientY; cv.style.cursor = 'grabbing'; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
    cv.addEventListener('pointermove', e => { if(!drag) return; yaw = clamp(yaw + (e.clientX - dragX) * .006, -.9, .9); pit = clamp(pit + (e.clientY - dragY) * .004, -.15, .35); dragX = e.clientX; dragY = e.clientY; });
    const up = () => { drag = false; cv.style.cursor = 'grab'; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', () => { yaw = 0; pit = 0; });

    eng.onUpdate = (dt, t) => {
      dt = Math.min(dt, .05); sway += dt; const k = 1 - Math.exp(-dt * 4);
      cur.heat += (S.heat - cur.heat) * k; cur.lvl += (S.level - cur.lvl) * k; const tc = css(S.color, [.4, .7, 1]); cur.col = mixc(cur.col, tc, k * 1.2);
      // camera
      const ay = yaw + Math.sin(sway * .3) * .035, d = 8.6; eng.camera.fov = 46 * Math.PI / 180;
      eng.camera.pos = [Math.sin(ay) * d, 2.0 + pit * 3 + Math.sin(sway * .23) * .03, Math.cos(ay) * d + .1]; eng.camera.target = [0, 1.15, 0];
      // flame
      const hot = cur.heat > .02, fl = hot ? .35 + cur.heat * .95 : 0, fk = 1 + Math.sin(t * 23) * .04 + Math.sin(t * 37.3) * .03;
      fo.visible = fi.visible = hot; pilot.visible = !hot; if(hot){ fo.scaleTo(.8 + cur.heat * .5, fl * fk, .8 + cur.heat * .5); fi.scaleTo(.8, fl * .9 * fk, .8); fo.mat.color = [1, lerp(.7, .35, cur.heat), lerp(.2, .1, cur.heat), .5]; }
      pilot.scaleTo(1, .8 + Math.sin(t * 9) * .1, 1);
      const L = eng.lights.points; L[0].intensity = hot ? .5 + cur.heat * 1.3 + Math.sin(t * 31) * .08 : 0; L[1].color = cur.col; L[1].intensity = (S.running ? .9 : .25) * (cur.lvl > .02 ? 1 : 0) + flash * 1.4;
      // liquid
      const key = Math.round(cur.lvl * 30); if(key !== lvKey){ lvKey = key; const lm = liquidMesh(cur.lvl); liq.mesh = lm.mesh; liqTop = lm.top; liqR = lm.r; }
      const has = cur.lvl > .015; liq.visible = surf.visible = has; liq.mat.color = [Math.min(1, cur.col[0] * 1.15), Math.min(1, cur.col[1] * 1.15), Math.min(1, cur.col[2] * 1.15), .93]; const wob = S.running ? Math.sin(t * 11) * .012 : 0;
      surf.at(0, liqTop + .002 + wob, 0); surf.scaleTo(liqR, 1, liqR); surf.mat.color = [lerp(1, cur.col[0], .45), lerp(1, cur.col[1], .45), lerp(1, cur.col[2], .45), .55];
      // bubbles (boiling / reacting) and steam
      const boil = (S.running ? 1 : 0) + clamp((cur.heat - .22) * 1.4, 0, 1); if(has && boil > 0){ bubT += dt * (6 + boil * 30); while(bubT > 1){ bubT--; const a = Math.random() * TAU, r = Math.random() * liqR * .8, c = cur.col;
          bubbles.emit({ pos: [BX + Math.cos(a) * r, FY + .06, BZ + Math.sin(a) * r], vel: [0, .25 + Math.random() * .3, 0], color: [lerp(c[0], 1, .6), lerp(c[1], 1, .6), lerp(c[2], 1, .6), .75], size: .03 + Math.random() * .035, life: Math.max(.2, (liqTop - .06) / .5), gravity: 0 }); } }
      if(has && (cur.heat > .45 || S.running)){ steT += dt * (3 + cur.heat * 12); while(steT > 1){ steT--; steam.emit({ pos: [BX + (Math.random() - .5) * .2, FY + 1.04, BZ + (Math.random() - .5) * .2], vel: [(Math.random() - .5) * .12, .5 + Math.random() * .3, (Math.random() - .5) * .12], color: [.9, .94, 1, .22], size: .14, life: 1.8, grow: .3, gravity: 0 }); } }
      if(hot && Math.random() < dt * 18 * cur.heat) sparks.emit({ pos: [BX + (Math.random() - .5) * .1, 1.05 + Math.random() * .2, BZ + (Math.random() - .5) * .1], vel: [(Math.random() - .5) * .3, .6 + Math.random() * .5, (Math.random() - .5) * .3], color: [1, .7, .3, .8], size: .05, life: .6, gravity: 0 });
      flash = Math.max(0, flash - dt * 1.4);
    };
    eng.start(); return L3;
  }
  root.Lab3D = { create, rgb: css };
  if(typeof module !== 'undefined') module.exports = { css, mixc };
})(typeof window !== 'undefined' ? window : globalThis);
