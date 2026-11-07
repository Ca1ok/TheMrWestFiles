// Minigame: Reagent Trail (Mazepaint) — slide the drop until it hits a wall; every tile it crosses gets stained. Stain them all.
Games.register({ id: 'mazePaint', play(content, api){
  const n = 5 + Math.floor(Math.random() * 3), rnd = k => Math.floor(Math.random() * k), D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  function gen(){
    for(let attempt = 0; attempt < 300; attempt++){
      const mk = v => Array.from({ length: n }, () => new Array(n).fill(v)), vis = mk(false), blk = mk(false); let r = rnd(n), c = rnd(n); const start = [r, c]; vis[r][c] = true;
      const free = (a, b) => a >= 0 && b >= 0 && a < n && b < n && !blk[a][b];
      for(let t = 0; t < n * 5; t++){
        const cands = [];
        D.forEach(d => { let k = 0; while(free(r + d[0] * (k + 1), c + d[1] * (k + 1))) k++;
          for(let len = 1; len <= k; len++){ const nr = r + d[0] * (len + 1), nc = c + d[1] * (len + 1); if(len < k && vis[nr][nc]) continue; let nw = 0; for(let i = 1; i <= len; i++) if(!vis[r + d[0] * i][c + d[1] * i]) nw++; if(nw) cands.push({ d, len, nw }); } });
        if(!cands.length) break; const m = cands[rnd(cands.length)];
        for(let i = 1; i <= m.len; i++) vis[r + m.d[0] * i][c + m.d[1] * i] = true;
        const br = r + m.d[0] * (m.len + 1), bc = c + m.d[1] * (m.len + 1); if(br >= 0 && bc >= 0 && br < n && bc < n) blk[br][bc] = true;
        r += m.d[0] * m.len; c += m.d[1] * m.len;
      }
      let open = 0; for(let i = 0; i < n; i++) for(let j = 0; j < n; j++){ if(!vis[i][j]) blk[i][j] = true; else open++; }
      if(open >= n * n * 0.55) return { blk, start, open };
    }
    return { blk: Array.from({ length: n }, () => new Array(n).fill(false)), start: [0, 0], open: n * n };
  }
  const lv = gen(); let pos, paint, moves;
  content.innerHTML = '<h3>Reagent Trail</h3><p class="gx-hint">Swipe, use the arrow keys or the pad. The drop slides until it hits a wall — stain every clear tile.</p><div class="gx-bar"><span id="mzInfo"></span><button class="gx-btn" id="mzReset">Restart</button></div><div id="mzGrid" class="mz-grid" style="--n:' + n + '"></div><div class="gx-pad"><span></span><button data-d="3" aria-label="Up">▲</button><span></span><button data-d="2" aria-label="Left">◀</button><button data-d="1" aria-label="Down">▼</button><button data-d="0" aria-label="Right">▶</button></div><div id="mzRes"></div>';
  const grid = content.querySelector('#mzGrid'), info = content.querySelector('#mzInfo'), res = content.querySelector('#mzRes');
  function reset(){ pos = lv.start.slice(); paint = Array.from({ length: n }, () => new Array(n).fill(false)); paint[pos[0]][pos[1]] = true; moves = 0; draw(); }
  function count(){ let k = 0; paint.forEach(r => r.forEach(v => { if(v) k++; })); return k; }
  function draw(){
    grid.innerHTML = ''; for(let i = 0; i < n; i++) for(let j = 0; j < n; j++){ const d = document.createElement('div'); d.className = 'mz-c' + (lv.blk[i][j] ? ' wall' : paint[i][j] ? ' ink' : ''); if(i === pos[0] && j === pos[1]) d.innerHTML = '<i class="mz-ball"></i>'; grid.appendChild(d); }
    info.textContent = 'Stained ' + count() + ' / ' + lv.open + ' · ' + moves + ' slides';
  }
  let over = false;
  function move(di){
    if(over || !content.isConnected) return; const d = D[di]; let r = pos[0], c = pos[1], k = 0;
    while(true){ const nr = r + d[0], nc = c + d[1]; if(nr < 0 || nc < 0 || nr >= n || nc >= n || lv.blk[nr][nc]) break; r = nr; c = nc; paint[r][c] = true; k++; }
    if(!k) return; pos = [r, c]; moves++; draw();
    if(count() === lv.open){ over = true; api.win('mazePaint', n - 2, res, 'Every tile stained in ' + moves + ' slides!'); }
  }
  content.querySelectorAll('.gx-pad button').forEach(b => b.addEventListener('click', () => move(+b.dataset.d)));
  content.querySelector('#mzReset').addEventListener('click', () => { if(!over) reset(); });
  const keyh = e => { if(!content.isConnected){ window.removeEventListener('keydown', keyh); return; } const m = { ArrowRight: 0, d: 0, ArrowDown: 1, s: 1, ArrowLeft: 2, a: 2, ArrowUp: 3, w: 3 }[e.key]; if(m != null){ e.preventDefault(); move(m); } };
  window.addEventListener('keydown', keyh); try{ window.parent.addEventListener('keydown', keyh); }catch(_){}
  let t0 = null; grid.addEventListener('pointerdown', e => { t0 = [e.clientX, e.clientY]; });
  window.addEventListener('pointerup', e => { if(!t0) return; const dx = e.clientX - t0[0], dy = e.clientY - t0[1]; t0 = null; if(Math.abs(dx) + Math.abs(dy) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3)); });
  reset();
} });
