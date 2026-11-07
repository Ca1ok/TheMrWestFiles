// Minigame: Test Tube Sort (Water Sort) — pour solutions between tubes until every tube holds a single colour.
Games.register({ id: 'tubeSort', play(content, api){
  const POOL = [['#e5484d', 'HCl+dye'], ['#3e8ef7', 'CuSO₄'], ['#46c37b', 'NiCl₂'], ['#f5c542', 'K₂CrO₄'], ['#a56bd9', 'KMnO₄'], ['#f08a3c', 'I₂'], ['#3dd1c4', 'CoCl₂']];
  const NC = 4 + Math.floor(Math.random() * 3), CAP = 4, cols = POOL.slice().sort(() => Math.random() - .5).slice(0, NC);
  let tubes, sel = null, hist = [], over = false;
  const solved = t => t.every(x => x.length === 0 || (x.length === CAP && x.every(v => v === x[0])));
  function mix(){ do{ const u = []; cols.forEach((c, i) => { for(let k = 0; k < CAP; k++) u.push(i); }); u.sort(() => Math.random() - .5); tubes = []; for(let i = 0; i < NC; i++) tubes.push(u.slice(i * CAP, i * CAP + CAP)); tubes.push([], []); }while(solved(tubes)); sel = null; hist = []; }
  content.innerHTML = '<h3>Test Tube Sort</h3><p class="gx-hint">Tap a tube, then another, to pour the top solution across. It only pours onto the same colour or an empty tube.</p><div class="gx-bar"><span id="tsInfo"></span><span><button class="gx-btn" id="tsUndo">Undo</button> <button class="gx-btn" id="tsRe">Restart</button> <button class="gx-btn" id="tsNew">New mix</button></span></div><div id="tsRack" class="ts-rack"></div><div id="tsRes"></div>';
  const rack = content.querySelector('#tsRack'), res = content.querySelector('#tsRes'), info = content.querySelector('#tsInfo'); let start;
  function draw(){
    rack.innerHTML = ''; tubes.forEach((t, i) => { const d = document.createElement('button'); d.className = 'ts-tube' + (sel === i ? ' sel' : ''); d.setAttribute('aria-label', 'Tube ' + (i + 1));
      for(let k = 0; k < CAP; k++){ const v = t[k], l = document.createElement('i'); if(v != null){ l.style.background = cols[v][0]; l.title = cols[v][1]; l.textContent = cols[v][1].slice(0, 3); } d.appendChild(l); }
      d.addEventListener('click', () => tap(i)); rack.appendChild(d); });
    info.textContent = hist.length + ' pours';
  }
  function tap(i){
    if(over) return; if(sel === null){ if(tubes[i].length) sel = i; draw(); return; } if(sel === i){ sel = null; draw(); return; }
    const a = tubes[sel], b = tubes[i]; if(!a.length) { sel = null; return draw(); } const top = a[a.length - 1]; let run = 0; while(run < a.length && a[a.length - 1 - run] === top) run++;
    if(b.length && b[b.length - 1] !== top || b.length >= CAP){ sel = b.length ? i : null; if(b.length === 0) sel = null; draw(); return; }
    const n = Math.min(run, CAP - b.length); hist.push(JSON.stringify(tubes)); for(let k = 0; k < n; k++) b.push(a.pop()); sel = null; draw();
    if(solved(tubes)){ over = true; api.win('tubeSort', NC - 1, res, 'Sorted in ' + hist.length + ' pours!'); }
  }
  content.querySelector('#tsUndo').addEventListener('click', () => { if(over || !hist.length) return; tubes = JSON.parse(hist.pop()); sel = null; draw(); });
  content.querySelector('#tsRe').addEventListener('click', () => { if(over) return; tubes = JSON.parse(start); hist = []; sel = null; draw(); });
  content.querySelector('#tsNew').addEventListener('click', () => { if(over) return; mix(); start = JSON.stringify(tubes); draw(); });
  mix(); start = JSON.stringify(tubes); draw();
} });
