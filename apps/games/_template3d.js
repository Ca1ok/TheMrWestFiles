// TEMPLATE — a minimal 3D minigame. Copy to apps/games/<id>.js, change the id, then:
//   1. add a row to apps/games/manifest.js            { id, category, icon, name, desc }
//   2. add a row to GameScoring.TABLE in os/lib/game-scoring.js   (par / min / max points) and keep tests/game-scoring.test.js green
// Files starting with "_" are never listed; this one is just documentation that runs.
Games.register({ id: '_template3d', play(content, api){
  content.innerHTML = '<h3>My 3D game</h3><p class="gx-hint">Click a cube to pop it.</p><div class="gx-bar"><span id="info">0</span></div><div id="host"></div><div id="res"></div>';
  const eng = api.gl3d(content.querySelector('#host'), { w: 640, h: 400, bg: [.05, .04, .12] });       // null when WebGL is off → show a fallback
  if(!eng) return api.lose(content.querySelector('#res'), '3D isn’t available here.');
  const GL = GL3D, A = GL3DAssets, mat = GL.material, info = content.querySelector('#info');
  eng.camera.set([0, 4, 7], [0, 0, 0]);                                                            // position, look-at
  const floor = eng.node(GL.mesh.plane(20, 20), mat({ map: A.tex.felt().map, bump: A.tex.felt().bump, bumpK: .006 }));    // procedural felt texture
  const cubes = []; for(let i = 0; i < 6; i++){ const c = A.model.die(.8); c.at((i - 2.5) * 1.5, .5, 0); c.pickable = true; eng.add(c); cubes.push(c); }
  let score = 0, t0 = performance.now();
  eng.canvasEl.addEventListener('pointerdown', e => { const hit = eng.pick(e.clientX, e.clientY); if(hit && hit.node.pickable){ hit.node.dispose(); score++; info.textContent = score; if(score === cubes.length) api.score('_template3d', score * 100, content.querySelector('#res'), 'All popped!'); } });
  eng.onUpdate = (dt, t) => cubes.forEach((c, i) => { c.rot[1] = t + i; c.pos[1] = .5 + Math.abs(Math.sin(t * 2 + i)) * .4; });   // runs every frame; dt in seconds
  eng.start();                                                                                      // stops & frees the GPU by itself when the game leaves the page
} });
