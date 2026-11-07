// Minigame: Flappy Electron (flappy-bird style) — tap to hop the electron through the gaps between charged plates.
Games.register({ id: 'flappyElectron', play(content, api){
  const W = 340, H = 460, GAP = 135, SP = 125, GRAV = 1250, FLAP = -380, DIST = 185, PW = 54, R = 11;
  content.innerHTML = '<h3>Flappy Electron</h3><p class="gx-hint">Click, tap or press Space to hop. Slip through the gaps between the plates — score 5+ to earn, 35+ for the top payout.</p><div class="gx-bar"><span id="feInfo">Score 0</span></div><canvas class="gx-cv" id="feCv" width="' + W + '" height="' + H + '" style="width:' + W + 'px"></canvas><div id="feRes"></div>';
  const cv = content.querySelector('#feCv'), ctx = cv.getContext('2d'), info = content.querySelector('#feInfo'), res = content.querySelector('#feRes');
  let y = H / 2, vy = 0, score = 0, started = false, over = false, pipes = [], dist = 0, prev = performance.now(), t = 0;
  const addPipe = x => pipes.push({ x, gy: 80 + Math.random() * (H - 160 - GAP), got: false });
  for(let i = 0; i < 4; i++) addPipe(W + 80 + i * DIST);
  const flap = () => { if(over) return; started = true; vy = FLAP; };
  cv.addEventListener('pointerdown', flap);
  const keyh = e => { if(!content.isConnected){ window.removeEventListener('keydown', keyh); return; } if(e.key === ' ' || e.key === 'ArrowUp'){ e.preventDefault(); flap(); } };
  window.addEventListener('keydown', keyh); try{ window.parent.addEventListener('keydown', keyh); }catch(_){}
  function end(){ if(over) return; over = true; const msg = 'You passed ' + score + ' gate' + (score === 1 ? '' : 's') + '.';
    if(score >= 35) api.win('flappyElectron', 5, res, msg + ' Superconducting!'); else if(score >= 20) api.win('flappyElectron', 4, res, msg); else if(score >= 10) api.win('flappyElectron', 3, res, msg); else if(score >= 5) api.win('flappyElectron', 2, res, msg); else api.lose(res, msg + ' Reach 5 to earn.'); }
  function draw(){
    ctx.fillStyle = '#2a2118'; ctx.fillRect(0, 0, W, H);
    pipes.forEach(p => { ctx.fillStyle = '#c9772e'; ctx.fillRect(p.x, 0, PW, p.gy); ctx.fillRect(p.x, p.gy + GAP, PW, H - p.gy - GAP); ctx.fillStyle = '#f2b27a'; ctx.fillRect(p.x - 4, p.gy - 12, PW + 8, 12); ctx.fillRect(p.x - 4, p.gy + GAP, PW + 8, 12); ctx.fillStyle = '#1b130c'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('+', p.x + PW / 2, p.gy - 22); ctx.fillText('−', p.x + PW / 2, p.gy + GAP + 34); });
    const gr = ctx.createRadialGradient(70, y, 1, 70, y, R * 2.4); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, '#7ac8ff'); gr.addColorStop(1, 'rgba(122,200,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(70, y, R * 2.4, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(122,200,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(70, y, R * 1.9, R * .7, t * 6, 0, 7); ctx.stroke();
    if(!started){ ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Tap to start', W / 2, H / 2 + 60); }
  }
  (function loop(now){
    if(over || !content.isConnected) return; const dt = Math.min(.033, (now - prev) / 1000 || .016); prev = now; t += dt;
    if(started){ vy += GRAV * dt; y += vy * dt; pipes.forEach(p => { p.x -= SP * dt; if(!p.got && p.x + PW < 70 - R){ p.got = true; score++; info.textContent = 'Score ' + score; } });
      if(pipes[0].x + PW < -10){ pipes.shift(); addPipe(pipes[pipes.length - 1].x + DIST); }
      if(y < R || y > H - R) end(); pipes.forEach(p => { if(70 + R > p.x && 70 - R < p.x + PW && (y - R < p.gy || y + R > p.gy + GAP)) end(); }); }
    else y = H / 2 + Math.sin(t * 4) * 8;
    draw(); requestAnimationFrame(loop);
  })(performance.now());
} });
