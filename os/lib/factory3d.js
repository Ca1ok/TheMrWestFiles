/* Factory3D — the 3D industrial estate for WestFactory. One plot per line slot; every plant is BUILT IN STAGES as the player's flowsheet grows:
 *   0 empty plot (survey stakes) → 1 foundation slab → 2 steel frame + crane → 3 walls & roof → 4 equipment (tanks, reactors, pipes, warehouse) → 5 operating (smoke, lit windows, beacon)
 * Tier adds storeys. Plots beyond the bought slots show a "for sale" sign. Pieces rise out of the ground with a tween when a stage is reached.
 * VISUAL ONLY — the numbers come from OS.factory. Built on GL3D (os/lib/gl3d.js) + GL3DAssets.
 *
 *   const F3 = Factory3D.create(hostEl, { quality, onPick: lineId => … });   // null without WebGL
 *   F3.update({ slots, maxSlots, sel, lines:[{ id, tier, ns, nr, on, running, fill, colors:[css…] }] });   F3.destroy()
 * Drag to orbit, click a plot to select that line, double-click to reset the view. */
(function(root){
  'use strict';
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
  const STAGES = ['Empty plot', 'Foundation', 'Steel frame', 'Walls & roof', 'Equipment', 'Operating'];
  /* which construction stage a line has reached (pure, Node-testable) */
  function stageOf(l){ if(!l) return 0; const ns = l.ns | 0, nr = l.nr | 0; let s = 1; if(ns + nr >= 1) s = 2; if(nr >= 1) s = 3; if(nr >= 1 && ns >= 1) s = 4; if(s === 4 && l.on && l.running) s = 5; return s; }
  let _cx = null; function css(c){ if(Array.isArray(c)) return c; try{ if(!_cx){ const k = document.createElement('canvas'); k.width = k.height = 1; _cx = k.getContext('2d', { willReadFrequently: true }); } _cx.clearRect(0, 0, 1, 1); _cx.fillStyle = '#888'; _cx.fillStyle = String(c); _cx.fillRect(0, 0, 1, 1); const d = _cx.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255]; }catch(e){ return [.5, .6, .9]; } }
  const tex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return new root.GL3D.Texture(c); };
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  function create(host, opt){
    opt = opt || {}; const GL = root.GL3D, A = root.GL3DAssets; if(!GL || !GL.supported()) return null;
    const cv = document.createElement('canvas'); cv.className = 'f3d'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    host.insertBefore(cv, host.firstChild); const low = opt.quality === 'low';
    const eng = GL.create(cv, { quality: low ? 'low' : 'high', maxFps: low ? 30 : 60, bg: [.62, .76, .9], fog: { color: [.74, .84, .93], density: .018 } }); if(!eng){ cv.remove(); return null; } eng.canvasEl = cv;
    const M = GL.mesh, mat = GL.material, COLS = 4, GAP = 3.7;
    eng.lights.sky = [.7, .76, .86]; eng.lights.ground = [.34, .3, .26]; eng.lights.dir = { dir: [-.5, -1, -.35], color: [1, .96, .86] }; eng.lights.points = []; eng.shadow.y = 0; eng.shadow.alpha = .3;
    if(A) eng.setBackdrop(A.tex.backdrop([[0, '#5e9be0'], [.55, '#a9cdee'], [1, '#f3ead2']]));

    /* ---- textures ---- */
    const grass = tex(256, 256, (g, w, h) => { g.fillStyle = '#5d8c45'; g.fillRect(0, 0, w, h); for(let i = 0; i < 2600; i++){ g.fillStyle = 'rgba(' + (60 + rnd() * 50 | 0) + ',' + (110 + rnd() * 60 | 0) + ',' + (40 + rnd() * 30 | 0) + ',.5)'; g.fillRect(rnd() * w, rnd() * h, 2, 3); } });
    const asphalt = tex(128, 128, (g, w, h) => { g.fillStyle = '#3a3d42'; g.fillRect(0, 0, w, h); for(let i = 0; i < 900; i++){ const v = 50 + rnd() * 40 | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 4) + ')'; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
    const gravel = tex(128, 128, (g, w, h) => { g.fillStyle = '#9b958a'; g.fillRect(0, 0, w, h); for(let i = 0; i < 1400; i++){ const v = 120 + rnd() * 70 | 0; g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 12) + ')'; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
    const wallTex = lit => tex(128, 128, (g, w, h) => { g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c3c8cf'; for(let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h); for(let r = 0; r < 2; r++) for(let c = 0; c < 4; c++){ g.fillStyle = lit ? '#ffe08a' : '#41576b'; g.fillRect(8 + c * 30, 22 + r * 50, 20, 26); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(8 + c * 30, 22 + r * 50, 20, 4); } });
    const wallOff = wallTex(false), wallOn = wallTex(true), roofTex = tex(64, 64, (g, w, h) => { g.fillStyle = '#6a7078'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a6068'; for(let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2); });
    const stripe = tex(64, 64, (g, w, h) => { for(let y = 0; y < 4; y++){ g.fillStyle = y % 2 ? '#f4f4f4' : '#d8412f'; g.fillRect(0, y * 16, w, 16); } });

    /* ---- ground, roads ---- */
    eng.node(M.plane(60, 40, 1, 1, 12, 8), mat({ map: grass, color: [.78, .84, .74, 1], spec: .02, uv: [1, 1, 0, 0] }), GAP * 1.5, -.01, GAP * .5);
    eng.node(M.plane(60, 1.5, 1, 1, 30, 1), mat({ map: asphalt, spec: .05 }), GAP * 1.5, 0, GAP * .5);                                    // road between the two rows
    eng.node(M.plane(60, .06, 1, 1, 1, 1), mat({ color: [.95, .85, .3, 1], unlit: true }), GAP * 1.5, .004, GAP * .5);

    const plots = [];                                                                                                                 // one per slot
    const mk = (parent, mesh, mt, x, y, z, h, shadow) => { const g = new GL.Node(); g.at(x, y, z); const n = new GL.Node(mesh, mt); n.at(0, h / 2, 0); if(shadow !== false) n.castShadow = true; g.add(n); parent.add(g); return g; };
    const steel = mat({ color: [.93, .55, .15, 1], spec: .5, shine: 40 }), conc = mat({ map: gravel, color: [1, 1, 1, 1], spec: .1 }), metal = mat({ color: [.75, .78, .82, 1], spec: 1, shine: 70, refl: .06 }), dark = mat({ color: [.2, .22, .25, 1], spec: .5, shine: 40 });
    const ease = GL.ease.outBack;

    function makePlot(i){
      const col = i % COLS, row = (i / COLS) | 0, cx = col * GAP, cz = row * GAP * 1.0 + (row ? 1.1 : -1.1), root3 = eng.node(null, null, cx, 0, cz); const P = { i, root: root3, parts: [], stage: -1, tier: 0, lineId: null, built: false, sig: '', owned: false, smokeT: 0, crane: null, spin: [], lights: [], lit: false };
      const pad = new GL.Node(M.roundedBox(3.1, .06, 3.1, .02, 2), mat({ map: gravel, spec: .1 })); pad.at(0, .03, 0); pad.pickable = true; pad.data = { slot: i }; root3.add(pad); P.pad = pad;
      // survey stakes
      P.stakes = new GL.Node(); root3.add(P.stakes); [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]].forEach(([x, z]) => { const s = mk(P.stakes, M.cylinder(.03, .03, .45, 8), mat({ color: [.95, .8, .1, 1] }), x, 0, z, .45); const f = mk(P.stakes, M.box(.16, .1, .02), mat({ color: [.9, .25, .2, 1] }), x, .38, z, .1); });
      // for-sale sign
      P.sign = new GL.Node(); root3.add(P.sign); mk(P.sign, M.cylinder(.04, .04, .9, 8), dark, 0, 0, .9, .9); const bd = new GL.Node(M.quad(1.2, .55), mat({ map: A ? A.tex.label('FOR SALE', { w: 256, h: 128, bg: '#c93a2e', radius: 14 }) : null, color: [1, 1, 1, 1], cull: false })); bd.at(0, .95, .92); P.sign.add(bd);
      // selection ring
      P.ring = new GL.Node(M.torus(2.0, .035, 48, 6), mat({ color: [.3, .8, 1, 1], unlit: true, fog: false })); P.ring.at(0, .08, 0); P.ring.visible = false; root3.add(P.ring);
      plots.push(P); return P;
    }

    /* ---- plant parts: each has a stage; they rise (scale-Y tween) when their stage is reached ---- */
    function part(P, stage, node, o){ o = o || {}; P.parts.push({ stage, node, t: 0, el: 0, delay: o.delay || 0, tier: o.tier || 0 }); node.scl[1] = .001; node.visible = false; return node; }
    function build(P, L){
      P.parts.forEach(p => p.node.parent && p.node.parent.remove(p.node)); P.parts.length = 0; P.spin.length = 0; P.crane = null; P.lights.length = 0; P.walls = []; P.stack = null; P.beacon = null; P.crates = [];
      const R = P.root, tier = clamp(L.tier | 0, 1, 5), H = .95, floors = Math.min(tier, 4), HT = H * floors, add = (stage, g, o) => { R.add(g); return part(P, stage, g, o); };
      // 1 foundation
      add(1, mk(R, M.roundedBox(2.7, .14, 2.7, .03, 2), conc, 0, .06, 0, .14));
      // 2 steel frame — corner columns, beams per floor
      for(let f = 0; f < floors; f++){ const y0 = .2 + f * H; [[-1.15, -1.1], [1.15, -1.1], [1.15, 1.1], [-1.15, 1.1]].forEach(([x, z], k) => add(2, mk(R, M.box(.1, H, .1), steel, x, y0, z, H), { delay: f * .25 + k * .05 }));
        [[0, -1.1, 2.4, .08, .08], [0, 1.1, 2.4, .08, .08]].forEach(([x, z, w, hh, d], k) => add(2, mk(R, M.box(w, hh, d), steel, x, y0 + H - .05, z, hh), { delay: f * .25 + .3 })); [[-1.15, 0], [1.15, 0]].forEach(([x, z]) => add(2, mk(R, M.box(.08, .08, 2.2), steel, x, y0 + H - .05, z, .08), { delay: f * .25 + .35 })); }
      // 3 walls (back + sides, front open to show the door) and roof; tier = more storeys
      for(let f = 0; f < floors; f++){ const y0 = .2 + f * H, wm = mat({ map: wallOff, spec: .2, shine: 20, uv: [2, 1, 0, 0] }); P.walls.push(wm);
        add(3, mk(R, M.box(2.3, H - .06, .06), wm, 0, y0, -1.1, H - .06), { delay: f * .25 }); add(3, mk(R, M.box(.06, H - .06, 2.2), wm, -1.15, y0, 0, H - .06), { delay: f * .25 + .1 }); add(3, mk(R, M.box(.06, H - .06, 2.2), wm, 1.15, y0, 0, H - .06), { delay: f * .25 + .2 });
        add(3, mk(R, M.box(2.3, .04, 2.2), mat({ color: [.7, .72, .76, 1], spec: .2 }), 0, y0 + H - .02, 0, .04), { delay: f * .25 + .3 }); }
      add(3, mk(R, M.box(2.5, .1, 2.4), mat({ map: roofTex, spec: .2, uv: [3, 3, 0, 0] }), 0, .2 + HT, 0, .1), { delay: floors * .25 + .2 });
      add(3, mk(R, M.box(.55, .5, .55), metal, -.7, .3 + HT, -.5, .5), { delay: floors * .25 + .35 }); const fan = mk(R, M.cylinder(.22, .22, .05, 16), dark, .55, .3 + HT, .5, .05); fan.userSpin = true; add(3, fan, { delay: floors * .25 + .45 }); P.spin.push(fan);   // roof unit + rotating vent
      // 4 equipment: warehouse (left), tanks (front), reactors (right), pipes
      const wh = new GL.Node(); wh.at(-2.0, 0, -.3); R.add(wh); part(P, 4, wh);
      mk(wh, M.box(.9, .7, 1.0), mat({ color: [.78, .8, .84, 1], spec: .3 }), 0, .1, 0, .7); mk(wh, M.box(1.0, .06, 1.1), mat({ color: [.4, .42, .46, 1] }), 0, .8, 0, .06); mk(wh, M.box(.4, .5, .04), dark, 0, .12, .5, .5);
      const fillN = Math.round(clamp(L.fill || 0, 0, 1) * 6); for(let k = 0; k < 6; k++){ const c = mk(wh, M.roundedBox(.22, .2, .22, .02, 1), mat({ color: [.76, .56, .32, 1] }), -.12 + (k % 3) * .26, .08, .7 + ((k / 3) | 0) * .26, .2); c.node = c; P.crates.push(c); c.visible = k < fillN; }
      const cols = (L.colors && L.colors.length ? L.colors : ['#6aa7ff']).slice(0, 4);
      cols.forEach((c, k) => { const rgb = css(c), x = -.95 + k * .62, t = new GL.Node(); t.at(x, 0, 1.75); R.add(t); part(P, 4, t, { delay: k * .12 }); mk(t, M.cylinder(.24, .24, .75, 24), mat({ color: [rgb[0] * .8 + .15, rgb[1] * .8 + .15, rgb[2] * .8 + .15, 1], spec: .8, shine: 60, refl: .05 }), 0, .06, 0, .75); mk(t, M.sphere(.24, 20, 10), mat({ color: [.8, .83, .88, 1], spec: .9, shine: 70 }), 0, .8, 0, .01).scl[1] = .5; });
      const nR = clamp(L.nr | 0, 1, 4); for(let k = 0; k < nR; k++){ const g = new GL.Node(); g.at(1.95, 0, -.9 + k * .62); R.add(g); part(P, 4, g, { delay: .1 + k * .15 }); const hh = .9 + HT * .25;
        mk(g, M.cylinder(.22, .22, hh, 24), mat({ color: [.55, .7, .9, 1], spec: .9, shine: 80, refl: .08 }), 0, .06, 0, hh); mk(g, M.torus(.22, .035, 24, 8), metal, 0, .06 + hh * .35, 0, .01); mk(g, M.torus(.22, .035, 24, 8), metal, 0, .06 + hh * .7, 0, .01); mk(g, M.sphere(.22, 20, 10), mat({ color: [.7, .82, .95, 1], spec: .9, shine: 80 }), 0, .06 + hh, 0, .01).scl[1] = .6; }
      const pipeM = mat({ color: [.72, .2, .18, 1], spec: .8, shine: 50 }); const pipeA = mk(R, M.cylinder(.04, .04, 2.9, 10), pipeM, .1, .22, 1.35, 2.9); pipeA.rot[2] = Math.PI / 2; pipeA.pos[0] = .05; pipeA.pos[1] = .3; pipeA.userRot = true; add(4, pipeA, { delay: .25 }); pipeA.scl[0] = 1;
      add(4, mk(R, M.cylinder(.04, .04, .9, 10), pipeM, 1.15, .3, 1.35, .9), { delay: .35 });
      const pb = mk(R, M.cylinder(.04, .04, 1.25, 10), pipeM, 1.35, .3, -.2, 1.25); pb.rot[2] = Math.PI / 2; add(4, pb, { delay: .3 });
      // 5 operating: smokestack + beacon + lit windows
      const st = new GL.Node(); st.at(-.85, 0, -1.4); R.add(st); P.stack = st; part(P, 5, st); mk(st, M.cylinder(.12, .17, HT + .9, 20), mat({ map: stripe, spec: .2, uv: [1, 1, 0, 0] }), 0, .2, 0, HT + .9); mk(st, M.cylinder(.19, .19, .06, 20), dark, 0, HT + 1.1, 0, .06);
      const bc = new GL.Node(M.sphere(.07, 12, 8), mat({ color: [.3, 1, .4, 1], unlit: true, fog: false })); bc.at(-.85, HT + 1.28, -1.4); R.add(bc); P.beacon = bc; part(P, 5, bc); bc.scl[1] = 1;
      // crane while building
      const cr = new GL.Node(); cr.at(1.6, 0, -1.5); R.add(cr); P.crane = cr; const ch = HT + 1.2; mk(cr, M.box(.12, ch, .12), mat({ color: [.98, .8, .1, 1], spec: .4 }), 0, .1, 0, ch);
      const jib = new GL.Node(); jib.at(0, ch + .1, 0); cr.add(jib); const jm = mat({ color: [.98, .8, .1, 1], spec: .4 }); const jb = new GL.Node(M.box(2.6, .1, .1), jm); jb.at(-.7, 0, 0); jib.add(jb); const cw = new GL.Node(M.box(.3, .24, .24), dark); cw.at(.7, 0, 0); jib.add(cw);
      const rope = new GL.Node(M.cylinder(.012, .012, 1, 6), dark); rope.at(-1.6, -.5, 0); jib.add(rope); const hook = new GL.Node(M.box(.14, .1, .14), mat({ color: [.9, .2, .15, 1] })); hook.at(-1.6, -1, 0); jib.add(hook); P.craneJib = jib; P.craneRope = rope; P.craneHook = hook; P.craneBase = ch;
      P.tier = tier; P.sig = P.lineSig; P.built = true; P.stage = -1;
    }
    const sigOf = L => [L.tier | 0, Math.min(4, L.nr | 0), (L.colors || []).slice(0, 4).join(','), Math.round(clamp(L.fill || 0, 0, 1) * 6)].join('|');

    for(let i = 0; i < 8; i++) makePlot(i);
    /* ---- camera + input ---- */
    let yaw = .62, pit = .56, dist = 9.4, tx = 0, tz = 0, ctx = 0, ctz = 0, dragging = false, moved = 0, lx = 0, ly = 0, sel = null, t0 = 0; const st = { lines: [], slots: 2, maxSlots: 8 };
    cv.addEventListener('pointerdown', e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; cv.style.cursor = 'grabbing'; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
    cv.addEventListener('pointermove', e => { if(!dragging) return; const dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy); yaw -= dx * .006; pit = clamp(pit + dy * .004, .2, 1.2); lx = e.clientX; ly = e.clientY; });
    cv.addEventListener('pointerup', e => { dragging = false; cv.style.cursor = 'grab'; if(moved < 5){ const pk = eng.pick(e.clientX, e.clientY), n = pk && pk.node; if(n && n.data && n.data.slot != null){ const L = st.lines[n.data.slot]; if(L && opt.onPick) opt.onPick(L.id); } } });
    cv.addEventListener('wheel', e => { e.preventDefault(); dist = clamp(dist + e.deltaY * .01, 5, 16); }, { passive: false }); cv.addEventListener('dblclick', () => { yaw = .62; pit = .56; dist = 9.4; });
    const smoke = eng.particles({ shape: 'glow', blend: 'blend', max: 160, gravity: .35, drag: .7 }), dust = eng.particles({ shape: 'glow', blend: 'blend', max: 90, gravity: .1, drag: 1 });

    const F3 = { engine: eng, canvas: cv, STAGES, stageOf,
      update(s){ Object.assign(st, s); sel = s.sel; plots.forEach((P, i) => { const L = st.lines[i] || null, owned = i < st.slots; P.owned = owned; P.stakes.visible = owned && !L; P.sign.visible = !owned;
          if(!L){ P.lineId = null; P.parts.forEach(p => { p.node.visible = false; }); P.stage = -1; P.built = false; return; }
          const sg = sigOf(L); if(!P.built || P.sig !== sg || P.lineId !== L.id){ const first = !P.built && !P._seen; build(P, L); P.sig = sg; P.lineId = L.id; P._seen = true; P.skip = first || !!opt.noAnim; if(P.skip) P.parts.forEach(p => { p.t = 1; p.el = 9; }); }
          P.line = L; P.target = stageOf(L); P.on = !!(L.on && L.running); }); }, select(id){ sel = id; }, destroy(){ try{ eng.destroy(); }catch(e){} cv.remove(); } };

    eng.onUpdate = (dt, t) => {
      dt = Math.min(dt, .05); t0 += dt; const k = 1 - Math.exp(-dt * 3.5);
      const si = Math.max(0, st.lines.findIndex(l => l.id === sel)), col = si % COLS, row = (si / COLS) | 0; tx = col * GAP; tz = row * GAP + (row ? 1.1 : -1.1); ctx += (tx - ctx) * k; ctz += (tz - ctz) * k;
      eng.camera.target = [ctx, .9, ctz]; eng.camera.pos = [ctx + Math.sin(yaw) * Math.cos(pit) * dist, Math.sin(pit) * dist + .3, ctz + Math.cos(yaw) * Math.cos(pit) * dist];
      plots.forEach((P, i) => { P.ring.visible = !!(P.line && P.lineId === sel && P.owned); if(P.ring.visible) P.ring.rot[1] = t0 * .5;
        if(!P.built) return; const target = P.target || 0;
        P.parts.forEach(p => { const want = p.stage <= target, was = p.node.visible; if(want){ if(!was){ p.node.visible = true; if(P.skip){ p.t = 1; p.el = 9; } else { p.t = 0; p.el = 0; if(p.stage >= 1) dust.burst(8, [P.root.pos[0] + p.node.pos[0], .15, P.root.pos[2] + p.node.pos[2]], .5, { color: [.8, .75, .65, .3], size: .3, life: 1.2, up: true, grow: .3, gravity: .05 }); } }
            p.el += dt; p.t = clamp((p.el - p.delay) / .6, 0, 1); p.node.scl[1] = Math.max(.001, p.t >= 1 ? 1 : ease(p.t)); } else if(was){ p.node.visible = false; p.node.scl[1] = .001; p.t = 0; p.el = 0; } });
        P.skip = P.skip && P.parts.some(p => p.t < 1) ? P.skip : false;
        // crane: visible while under construction, swings its hook over the plot
        if(P.crane){ const building = target >= 1 && target < 5; P.crane.visible = building; if(building){ P.craneJib.rot[1] = Math.sin(t0 * .45 + i) * 1.1; const hy = -.6 - (Math.sin(t0 * .9 + i) * .5 + .5) * (P.craneBase * .55); P.craneHook.pos[1] = hy; P.craneRope.pos[1] = hy / 2; P.craneRope.scl[1] = Math.abs(hy); P.craneRope.pos[0] = P.craneHook.pos[0] = -1.6; } }
        // operating: lit windows, smoke, spinning vent, beacon blink
        const on = target >= 5; if(P.lit !== on){ P.lit = on; P.walls.forEach(m => { m.map = on ? wallOn : wallOff; }); }
        P.spin.forEach(n => { n.rot[1] += dt * (on ? 8 : 0); });
        if(on && P.stack){ P.smokeT += dt * 14; while(P.smokeT > 1){ P.smokeT--; const hh = .2 + ((P.tier || 1) > 0 ? Math.min(4, P.tier) * .95 : .95) + .9 + .2; smoke.emit({ pos: [P.root.pos[0] - .85, hh + .1, P.root.pos[2] - 1.4], vel: [.1 + Math.random() * .08, .45 + Math.random() * .3, (Math.random() - .5) * .1], color: [.82, .83, .86, .5], size: .22, life: 3.4, grow: .5, gravity: .1 }); } }
        if(P.beacon) P.beacon.mat.color = on ? (Math.sin(t0 * 5) > 0 ? [.3, 1, .4, 1] : [.1, .4, .15, 1]) : [.5, .2, .2, 1];
        if(P.line && P.crates){ const fn = Math.round(clamp(P.line.fill || 0, 0, 1) * 6); P.crates.forEach((c, j) => { c.visible = j < fn; }); } });
    };
    eng.start(); return F3;
  }
  root.Factory3D = { create, stageOf, STAGES };
  if(typeof module !== 'undefined') module.exports = { stageOf, STAGES };
})(typeof window !== 'undefined' ? window : globalThis);
