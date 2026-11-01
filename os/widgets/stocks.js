// Widget: live $WEST price with a sparkline (links to Stocks).
(window.__OSW = window.__OSW || []).push({ id: 'stocks', name: 'Stocks', app: 'Stocks', desc: 'Live $WEST price and trend.', sizes: ['s', 'm', 'l'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('Stocks') + '<span>$WEST</span></div><div class="big" data-p>$--</div><div class="sub" data-c>&nbsp;</div><canvas></canvas>';
    const P = el.querySelector('[data-p]'), C = el.querySelector('[data-c]'), cv = el.querySelector('canvas'); let pts = null, base = null, alive = true;
    function paint(){
      const p = c.OS.stock.price(); P.textContent = '$' + p.toFixed(2);
      if(base){ const ch = (p - base) / base * 100; C.textContent = (ch >= 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(2) + '% today'; C.className = 'sub ' + (ch >= 0 ? 'up' : 'down'); }
      if(pts && cv.clientWidth){ c.spark(cv, pts.concat([[Date.now(), p]]), base != null && p < base ? 'var(--bad)' : 'var(--good)'); }
    }
    const load = async () => { try{ const s = await c.OS.stock.series('1D'); if(!alive) return; pts = s; base = s.length ? s[0][1] : null; paint(); }catch(e){} };
    setTimeout(load, 600); const t = setInterval(load, 120000);
    paint(); return { update: paint, destroy(){ alive = false; clearInterval(t); } };
  } });
