// Minigame: Colour Blocks — pop groups of two or more matching metal tiles; the rest fall and slide together. Leave as few as you can.
Games.register({ id: 'colourBlocks', play(content, api){
  const R = 9, C = 9, METAL = [['Cu', '#2fb3a3'], ['Fe', '#d2622e'], ['Au', '#e8b64f']];
  let b = Array.from({ length: R }, () => Array.from({ length: C }, () => Math.floor(Math.random() * METAL.length)));        // -1 = empty
  content.innerHTML = '<h3>Colour Blocks</h3><p class="gx-hint">Click a group of two or more touching tiles of the same metal to pop it. Fewer left over pays more.</p><div class="gx-bar"><span id="cbInfo"></span></div><div id="cbGrid" class="cb-grid" style="--c:' + C + '"></div><div id="cbRes"></div>';
  const grid = content.querySelector('#cbGrid'), info = content.querySelector('#cbInfo'), res = content.querySelector('#cbRes'); let over = false, hov = [];
  const group = (r, c) => { const t = b[r][c]; if(t < 0) return []; const seen = new Set([r * C + c]), q = [[r, c]]; for(let i = 0; i < q.length; i++){ [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => { const a = q[i][0] + d[0], e = q[i][1] + d[1]; if(a >= 0 && e >= 0 && a < R && e < C && b[a][e] === t && !seen.has(a * C + e)){ seen.add(a * C + e); q.push([a, e]); } }); } return q; };
  const remaining = () => b.flat().filter(v => v >= 0).length;
  const movesLeft = () => { for(let r = 0; r < R; r++) for(let c = 0; c < C; c++) if(b[r][c] >= 0 && group(r, c).length > 1) return true; return false; };
  function collapse(){ for(let c = 0; c < C; c++){ const col = []; for(let r = R - 1; r >= 0; r--) if(b[r][c] >= 0) col.push(b[r][c]); for(let r = R - 1, i = 0; r >= 0; r--, i++) b[r][c] = i < col.length ? col[i] : -1; }
    const cols = []; for(let c = 0; c < C; c++) if(b.some(row => row[c] >= 0)) cols.push(c); const nb = Array.from({ length: R }, () => new Array(C).fill(-1)); cols.forEach((c, i) => { for(let r = 0; r < R; r++) nb[r][i] = b[r][c]; }); b = nb; }
  function draw(){
    grid.innerHTML = ''; const hs = new Set(hov.map(p => p[0] * C + p[1]));
    for(let r = 0; r < R; r++) for(let c = 0; c < C; c++){ const v = b[r][c], d = document.createElement(v < 0 ? 'div' : 'button'); d.className = 'cb-t' + (v < 0 ? ' e' : '') + (hs.has(r * C + c) ? ' h' : ''); if(v >= 0){ d.style.background = METAL[v][1]; d.textContent = METAL[v][0]; d.setAttribute('aria-label', METAL[v][0] + ' tile'); d.addEventListener('mouseenter', () => { hov = group(r, c); if(hov.length < 2) hov = []; draw(); }); d.addEventListener('click', () => pop(r, c)); } grid.appendChild(d); }
    info.textContent = remaining() + ' tiles left';
  }
  function pop(r, c){
    if(over) return; const gp = group(r, c); if(gp.length < 2) return; gp.forEach(p => { b[p[0]][p[1]] = -1; }); collapse(); hov = []; draw();
    if(!movesLeft()){ over = true; const k = remaining(), msg = k + ' tile' + (k === 1 ? '' : 's') + ' left.';
      api.score('colourBlocks', Math.max(0, 1000 - k * 60), res, k === 0 ? 'Board cleared!' : msg); }          // 1000 for a clear, 60 off per tile left
  }
  grid.addEventListener('mouseleave', () => { if(hov.length){ hov = []; draw(); } });
  draw();
} });
