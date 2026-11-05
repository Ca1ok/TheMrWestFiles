// Widget: live $WEST price with a sparkline (links to Stocks). Updates every market tick.
(window.__OSW = window.__OSW || []).push({ id: 'stocks', name: 'Stocks', app: 'Stocks', desc: 'Live $WEST price and trend.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm', 'l'], on: ['market'],
  mount(el, size, c){
    const tiny = size === 'xs' || size === 'h' || size === 'b';
    el.innerHTML = '<div class="wh">' + c.tile('Stocks') + '<span>$WEST</span></div>' + (tiny ? '' : '<div class="grow" style="max-height:6px"></div>') + '<div class="big" data-p>$--</div><div class="sub" data-c>&nbsp;</div>' + (size === 'xs' ? '' : '<canvas></canvas>');
    if(tiny) el.classList.add('row-layout');
    const P = el.querySelector('[data-p]'), C = el.querySelector('[data-c]'), cv = el.querySelector('canvas'); let pts = null, base = null, alive = true, last = 0;
    function paint(){
      const p = c.OS.stock.price(); P.textContent = '$' + p.toFixed(2);
      if(base){ const ch = (p - base) / base * 100; C.textContent = (ch >= 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(2) + '%' + (size === 'xs' ? '' : ' today'); C.className = 'sub ' + (ch >= 0 ? 'up' : 'down'); }
      const now = performance.now(); if(cv && pts && cv.clientWidth && now - last > 900){ last = now; c.spark(cv, pts.concat([[Date.now(), p]]), base != null && p < base ? 'var(--bad)' : 'var(--good)'); }
    }
    const load = async () => { try{ const s = await c.OS.stock.series('1D'); if(!alive) return; pts = s; base = s.length ? s[0][1] : null; last = 0; paint(); }catch(e){} };
    setTimeout(load, 600); const t = setInterval(load, 120000);
    paint(); return { update: paint, destroy(){ alive = false; clearInterval(t); } };
  } });
