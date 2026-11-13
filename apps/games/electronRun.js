// Minigame: Electron Run (3D) — steer an electron down a neon accelerator tube: grab photons, dodge the nuclei.
// Built on GL3D via api.gl3d(); copy apps/games/_template3d.js to start your own.
Games.register({ id: 'electronRun', play(content, api){
  content.innerHTML = '<h3>Electron Run</h3><p class="gx-hint">← → / A D (or tap the left / right side) to change lane. Grab the golden photons, dodge the red nuclei — it gets faster. 250+ points to earn.</p><div class="gx-bar"><span id="erInfo">0 pts</span></div><div id="erHost"></div><div id="erRes"></div>';
  const host = content.querySelector('#erHost'), info = content.querySelector('#erInfo'), res = content.querySelector('#erRes'), eng = api.gl3d(host, { w: 640, h: 400, bg: [.03, .01, .08], fog: { color: [.05, .02, .14], density: .028 } });
  if(!eng){ content.querySelector('.gx-hint').textContent = 'This game needs WebGL, which this browser or device has turned off.'; return api.lose(res, '3D isn’t available here.'); }
  const GL = GL3D, A = GL3DAssets, mat = GL.material, LANES = [-1.7, 0, 1.7];
  eng.setBackdrop(A.tex.backdrop()); eng.camera.fov = 58 * GL.D2R; eng.camera.set([0, 2.3, 5.2], [0, .7, -8]); eng.shadow.y = 0; eng.shadow.alpha = .35;
  const L = eng.lights; L.sky = [.35, .3, .6]; L.ground = [.12, .08, .2]; L.dir.dir = [-.3, -1, -.4]; L.points = [{ pos: [0, 2.5, 3], color: [.3, .8, 1], range: 12, intensity: 1 }];
  /* tube: scrolling neon floor + two glowing walls */
  const grid = A.tex.neonGrid('#27e8ff'), mk = (w, h, rx, x, y, rz) => { const m = mat({ map: grid.map, emap: grid.emissive, emissive: [.04, .02, .08], spec: 0, uv: [w / 4, h / 4, 0, 0] }), n = new GL.Node(GL.mesh.plane(w, h, 1, 1, 1, 1), m); n.at(x, y, -40); n.rot[2] = rz || 0; eng.add(n); return m; };
  const floorM = mk(7, 120, 0, 0, 0, 0), wallL = mk(7, 120, 0, -4.2, 3.4, -Math.PI / 2 * 1), wallR = mk(7, 120, 0, 4.2, 3.4, Math.PI / 2);
  /* the electron: bright core, soft halo, spinning orbit ring */
  const core = new GL.Node(GL.mesh.sphere(.34, 24, 16), mat({ color: [.7, .9, 1, 1], emissive: [.5, .8, 1], spec: 1, shine: 90 })); core.castShadow = true; eng.add(core);
  const halo = A.model.sprite('#7ac8ff', 2.2, { alpha: .8 }); core.add(halo); const ring = new GL.Node(GL.mesh.torus(.6, .035, 40, 8), mat({ color: [.5, .8, 1, 1], emissive: [.3, .6, 1], unlit: false })); core.add(ring);
  const nucM = mat({ color: [.9, .12, .15, 1], emissive: [.35, .02, .04], spec: .9, shine: 50, refl: .25 }), nucMesh = GL.mesh.sphere(.55, 20, 14), shell = GL.mesh.torus(.85, .05, 36, 8), phM = mat({ color: [1, .85, .3, 1], emissive: [1, .75, .2], spec: 1 }), phMesh = GL.mesh.sphere(.2, 14, 10);
  const parts = eng.particles({ max: 260, blend: 'add', shape: 'glow', gravity: -2, drag: .8 }), objs = [];
  let lane = 1, x = 0, speed = 15, dist = 0, photons = 0, started = false, over = false, shake = 0;
  const pts = () => Math.floor(dist * 1.5) + photons * 50;
  function spawnRow(z){ const nuc = [0, 1, 2].sort(() => Math.random() - .5).slice(0, Math.random() < (.3 + Math.min(.35, dist / 1500)) ? 2 : 1), safe = [0, 1, 2].filter(i => !nuc.includes(i)), ph = safe[(Math.random() * safe.length) | 0];
    nuc.forEach(i => { const n = new GL.Node(nucMesh, nucM), r = new GL.Node(shell, nucM); n.add(r); n.at(LANES[i], .6, z); n.castShadow = true; eng.add(n); objs.push({ n, r, lane: i, kind: 'n' }); });
    if(Math.random() < .8){ const p = new GL.Node(phMesh, phM); p.add(A.model.sprite('#ffd24a', 1.1, { alpha: .8 })); p.at(LANES[ph], .6, z); eng.add(p); objs.push({ n: p, lane: ph, kind: 'p' }); } }
  const go = d => { if(over) return; started = true; lane = Math.max(0, Math.min(2, lane + d)); };
  eng.canvasEl.addEventListener('pointerdown', e => { const r = eng.canvasEl.getBoundingClientRect(); go(e.clientX < r.left + r.width / 2 ? -1 : 1); });
  const keyh = e => { if(!content.isConnected){ window.removeEventListener('keydown', keyh); return; } const k = e.key; if(k === 'ArrowLeft' || k === 'a' || k === 'A'){ e.preventDefault(); go(-1); } else if(k === 'ArrowRight' || k === 'd' || k === 'D'){ e.preventDefault(); go(1); } };
  window.addEventListener('keydown', keyh); try{ window.parent.addEventListener('keydown', keyh); }catch(_){}
  function end(){ if(over) return; over = true; parts.burst(70, core.pos.slice(), 6, { colors: [[1, .3, .2, 1], [1, .8, .3, 1], [.6, .9, 1, 1]], size: .35, life: 1.2 }); core.visible = false; shake = 1;
    const p = pts(); setTimeout(() => api.score('electronRun', p, res, photons + ' photon' + (photons === 1 ? '' : 's') + ', ' + Math.floor(dist) + ' m.'), 900); }
  eng.onUpdate = (dt, t) => {
    const tgt = LANES[lane]; x += (tgt - x) * Math.min(1, dt * 12); core.pos = [x, .6 + Math.sin(t * 6) * .05, 0]; core.rot[2] = -(tgt - x) * .3; ring.rot[0] = t * 4; ring.rot[2] = t * 2.4;
    shake = Math.max(0, shake - dt * 2); eng.camera.pos = [x * .35 + (Math.random() - .5) * shake * .3, 2.3 + (Math.random() - .5) * shake * .2, 5.2]; eng.camera.target = [x * .2, .7, -8];
    if(!started || over){ [floorM, wallL, wallR].forEach(m => { m.uv[3] = (m.uv[3] - dt * (over ? 0 : 1.2)) % 1; }); return; }
    speed = Math.min(34, speed + dt * .55); dist += speed * dt; info.textContent = pts() + ' pts · ' + photons + ' photons';
    [floorM, wallL, wallR].forEach(m => { m.uv[3] = (m.uv[3] - speed * dt / 4) % 1; });
    if(!objs.length || objs[objs.length - 1].n.pos[2] > -42) spawnRow(-60);
    for(let i = objs.length - 1; i >= 0; i--){ const o = objs[i], z = o.n.pos[2] + speed * dt; o.n.pos[2] = z; if(o.kind === 'n'){ o.n.rot[1] += dt * 1.2; o.r.rot[0] = t * 2; o.r.rot[2] = t * 1.3; } else { o.n.rot[1] += dt * 3; o.n.pos[1] = .6 + Math.sin(t * 5 + i) * .1; }
      if(z > -.7 && z < .7 && Math.abs(LANES[o.lane] - x) < .85){ if(o.kind === 'p'){ photons++; parts.burst(16, o.n.worldPos(), 3, { colors: [[1, .85, .3, 1], [1, 1, .7, 1]], size: .25, life: .6 }); o.n.dispose(); objs.splice(i, 1); continue; } end(); }
      if(z > 8){ o.n.dispose(); objs.splice(i, 1); } }
  };
  eng.start();
} });
