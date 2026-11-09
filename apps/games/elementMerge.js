// Minigame: Element Merge (the fruit-merge idea, with the periodic table) — drop atoms into the flask; two of the same fuse into the next element.
Games.register({ id: 'elementMerge', play(content, api){
  const W = 340, H = 460, LINE = 78, G = 1100, SYM = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na'], HUE = [200, 175, 140, 100, 60, 28, 0, 330, 290, 255, 225];
  const rad = l => 13 + l * 4.3;
  content.innerHTML = '<h3>Element Merge</h3><p class="gx-hint">Move to aim, click to drop. Two matching atoms fuse into the next element. Reach Boron or beyond, then Cash out (or fill the flask).</p><div class="gx-bar"><span id="emInfo"></span><button class="gx-btn pri" id="emCash">Cash out</button></div><canvas class="gx-cv" id="emCv" width="' + W + '" height="' + H + '" style="width:' + W + 'px"></canvas><div id="emRes"></div>';
  const cv = content.querySelector('#emCv'), ctx = cv.getContext('2d'), info = content.querySelector('#emInfo'), res = content.querySelector('#emRes');
  const balls = []; let nid = 1, aim = W / 2, cool = 0, maxL = 0, next = Math.floor(Math.random() * 4), over = false, score = 0, prev = performance.now();
  const add = (x, y, l) => { const b = { id: nid++, x, y, vx: 0, vy: 0, l, r: rad(l), age: 0, over: 0 }; balls.push(b); return b; };
  function step(dt){
    balls.forEach(b => { b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt; });
    for(let it = 0; it < 4; it++){
      for(let i = 0; i < balls.length; i++) for(let j = i + 1; j < balls.length; j++){
        const a = balls[i], c = balls[j]; if(a.dead || c.dead) continue; const dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r, d2 = dx * dx + dy * dy; if(d2 >= min * min) continue; const d = Math.sqrt(d2) || .001;
        if(a.l === c.l && a.l < SYM.length - 1){ a.dead = c.dead = true; const m = add((a.x + c.x) / 2, (a.y + c.y) / 2, a.l + 1); m.vy = -40; score += a.l + 1; maxL = Math.max(maxL, m.l); continue; }
        const nx = dx / d, ny = dy / d, ov = min - d, ma = a.r * a.r, mc = c.r * c.r, t = ma + mc; a.x -= nx * ov * mc / t; a.y -= ny * ov * mc / t; c.x += nx * ov * ma / t; c.y += ny * ov * ma / t;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny; if(rv < 0){ const jn = -rv * 1.1; a.vx -= nx * jn * mc / t; a.vy -= ny * jn * mc / t; c.vx += nx * jn * ma / t; c.vy += ny * jn * ma / t; }
      }
      balls.forEach(b => { if(b.x < b.r){ b.x = b.r; b.vx = Math.abs(b.vx) * .2; } if(b.x > W - b.r){ b.x = W - b.r; b.vx = -Math.abs(b.vx) * .2; } if(b.y > H - b.r){ b.y = H - b.r; b.vy = -Math.abs(b.vy) * .1; b.vx *= .96; } });
    }
    for(let i = balls.length - 1; i >= 0; i--) if(balls[i].dead) balls.splice(i, 1);
  }
  function end(why){
    if(over) return; over = true; const nm = SYM[maxL] + ' (element ' + (maxL + 1) + ')', msg = why + ' Best element: ' + nm + '.';
    if(maxL >= 4) api.score('elementMerge', score * 4, res, msg); else api.lose(res, msg + ' Reach Boron or beyond to earn.');          // score = every fusion, worth its new element number (each step up doubles it)
  }
  const mx = e => { const r = cv.getBoundingClientRect(); aim = Math.max(rad(next), Math.min(W - rad(next), (e.clientX - r.left) / r.width * W)); };
  cv.addEventListener('pointermove', mx); cv.addEventListener('pointerdown', e => { mx(e); if(over || cool > 0) return; const b = add(aim, 40, next); b.vy = 0; cool = .5; next = Math.floor(Math.random() * 4); });
  content.querySelector('#emCash').addEventListener('click', () => end('Cashed out.'));
  function draw(){
    ctx.fillStyle = '#2a2118'; ctx.fillRect(0, 0, W, H); ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(238,98,89,.6)'; ctx.beginPath(); ctx.moveTo(0, LINE); ctx.lineTo(W, LINE); ctx.stroke(); ctx.setLineDash([]);
    const at = (x, y, l, a) => { ctx.globalAlpha = a; const r = rad(l), gr = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); gr.addColorStop(0, 'hsl(' + HUE[l] + ',80%,72%)'); gr.addColorStop(1, 'hsl(' + HUE[l] + ',70%,42%)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#1b130c'; ctx.font = '700 ' + Math.round(r * .8) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SYM[l], x, y + 1); ctx.globalAlpha = 1; };
    balls.forEach(b => at(b.x, b.y, b.l, 1)); if(!over) at(aim, 30, next, cool > 0 ? .3 : .85);
    info.textContent = 'Best: ' + SYM[maxL] + ' · next ' + SYM[next] + ' · score ' + score;
  }
  (function loop(now){
    if(over || !content.isConnected) return; let dt = Math.min(.033, (now - prev) / 1000 || .016); prev = now; cool = Math.max(0, cool - dt); step(dt / 2); step(dt / 2);
    balls.forEach(b => { if(b.age > 1 && b.y - b.r < LINE && Math.abs(b.vy) < 60) b.over += dt; else b.over = 0; if(b.over > 1.8) end('The flask overflowed.'); });
    draw(); requestAnimationFrame(loop);
  })(performance.now());
} });
