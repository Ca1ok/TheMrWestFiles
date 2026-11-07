// Minigame: Sand Cascade (Sandfall) — draw glass walls so the falling sand lands in the beaker.
Games.register({ id: 'sandfall', play(content, api){
  const W = 120, H = 90, S = 4, GRAINS = 160, CUPW = 22, CUPH = 10, INK0 = 700, rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const g = new Uint8Array(W * H);                       // 0 air · 1 sand · 2 drawn glass · 3 fixed
  const ex = rnd(18, W - 19), cx0 = ex < W / 2 ? rnd(W / 2 + 6, W - CUPW - 4) : rnd(4, W / 2 - CUPW - 6);
  const idx = (x, y) => y * W + x, inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  for(let y = H - CUPH - 1; y < H; y++){ g[idx(cx0, y)] = 3; g[idx(cx0 + CUPW + 1, y)] = 3; } for(let x = cx0; x <= cx0 + CUPW + 1; x++) g[idx(x, H - 1)] = 3;
  const bx = rnd(30, W - 60), by = rnd(36, 52); for(let x = bx; x < bx + 30; x++){ g[idx(x, by)] = 3; g[idx(x, by + 1)] = 3; }     // a shelf in the way
  content.innerHTML = '<h3>Sand Cascade</h3><p class="gx-hint">Draw glass with your mouse or finger to steer the sand into the beaker. Press Pour when ready — you can keep drawing while it falls.</p><div class="gx-bar"><span id="sfInfo"></span><span><button class="gx-btn pri" id="sfGo">Pour</button> <button class="gx-btn" id="sfClr">Clear drawing</button></span></div><canvas class="gx-cv" id="sfCv" width="' + W + '" height="' + H + '" style="width:' + W * S + 'px;image-rendering:pixelated"></canvas><div id="sfRes"></div>';
  const cv = content.querySelector('#sfCv'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), info = content.querySelector('#sfInfo'), res = content.querySelector('#sfRes'), go = content.querySelector('#sfGo');
  let ink = INK0, pouring = false, emitted = 0, still = 0, frames = 0, over = false, tick = 0;
  const col = (v, x, y) => v === 1 ? [232, 196, 110] : v === 2 ? [120, 200, 230] : v === 3 ? [150, 135, 120] : (x > cx0 && x < cx0 + CUPW + 1 && y > H - CUPH - 2 ? [52, 60, 50] : [38, 30, 22]);
  function cupCount(){ let k = 0; for(let y = H - CUPH - 1; y < H - 1; y++) for(let x = cx0 + 1; x <= cx0 + CUPW; x++) if(g[idx(x, y)] === 1) k++; return k; }
  function stepSand(){
    let moved = false;
    for(let y = H - 2; y >= 0; y--){ const dir = Math.random() < .5; for(let i = 0; i < W; i++){ const x = dir ? i : W - 1 - i, p = idx(x, y); if(g[p] !== 1) continue;
      if(g[p + W] === 0){ g[p + W] = 1; g[p] = 0; moved = true; continue; }
      const l = x > 0 && g[p + W - 1] === 0, r = x < W - 1 && g[p + W + 1] === 0;
      if(l || r){ const q = l && r ? (Math.random() < .5 ? -1 : 1) : l ? -1 : 1; g[p + W + q] = 1; g[p] = 0; moved = true; } } }
    for(let x = 0; x < W; x++){ const p = idx(x, H - 1); if(g[p] === 1) g[p] = 0; }      // sand that misses the beaker is lost
    return moved;
  }
  function draw(){ for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){ const c = col(g[idx(x, y)], x, y), o = idx(x, y) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } ctx.putImageData(img, 0, 0); ctx.fillStyle = '#e8924f'; ctx.fillRect(ex - 2, 0, 5, 3); }
  function paint(x, y){ for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){ const a = x + dx, b = y + dy; if(!inb(a, b) || ink <= 0) continue; if(g[idx(a, b)] === 0){ g[idx(a, b)] = 2; ink--; } } }
  let last = null; const pt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)]; };
  cv.addEventListener('pointerdown', e => { last = pt(e); paint(last[0], last[1]); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if(!last) return; const p = pt(e), n = Math.max(Math.abs(p[0] - last[0]), Math.abs(p[1] - last[1]), 1); for(let i = 1; i <= n; i++) paint(Math.round(last[0] + (p[0] - last[0]) * i / n), Math.round(last[1] + (p[1] - last[1]) * i / n)); last = p; });
  const up = () => { last = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  go.addEventListener('click', () => { pouring = true; go.disabled = true; });
  content.querySelector('#sfClr').addEventListener('click', () => { for(let i = 0; i < g.length; i++) if(g[i] === 2) g[i] = 0; ink = INK0; });
  function finish(){
    over = true; const pct = cupCount() / GRAINS, msg = Math.round(pct * 100) + '% of the sand reached the beaker.';
    if(pct >= 0.9) api.win('sandfall', 5, res, msg + ' Perfect pour!'); else if(pct >= 0.75) api.win('sandfall', 4, res, msg); else if(pct >= 0.5) api.win('sandfall', 3, res, msg); else api.lose(res, msg + ' You need at least 50%.');
  }
  (function loop(){
    if(over || !content.isConnected) return; frames++;
    for(let s = 0; s < 2; s++){ if(pouring && emitted < GRAINS && frames % 2 === 0){ const x = ex + rnd(-1, 1); if(g[idx(x, 3)] === 0){ g[idx(x, 3)] = 1; emitted++; } } const m = stepSand(); still = (pouring && emitted >= GRAINS && !m) ? still + 1 : 0; }
    draw(); info.textContent = (pouring ? 'In beaker: ' + cupCount() + ' / ' + GRAINS : 'Ready') + ' · glass left ' + Math.max(0, Math.round(ink / INK0 * 100)) + '%';
    if(still > 40 || (pouring && frames > 60 * 45)) return finish(); requestAnimationFrame(loop);
  })();
} });
