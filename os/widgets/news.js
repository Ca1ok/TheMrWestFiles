// Widget: latest headline with a thumbnail from the Photos archive (links to News).
(window.__OSW = window.__OSW || []).push({ id: 'news', name: 'News', app: 'News', desc: 'The latest chemistry headlines.', sizes: ['xs', 'h', 'v', 's', 'w', 'b', 'm', 'l'], photo: true, on: [],
  mount(el, size, c){
    const n = size === 'l' ? 4 : size === 'm' || size === 'w' ? 2 : 1; el.classList.add('photo');
    el.innerHTML = '<div class="thumb"></div><div class="shade"></div><div class="wh">' + c.tile('News') + '<span>News</span></div><div class="grow"></div><div data-h></div>';
    const H = el.querySelector('[data-h]'), T = el.querySelector('.thumb'); let key = '', alive = true;
    function paint(){
      const a = c.OS.world.articles(n), k = a.map(x => x.id).join(); if(k === key) return; key = k;
      H.innerHTML = a.map((x, i) => '<div class="hl" style="' + (i ? 'margin-top:8px;font-size:13px;-webkit-line-clamp:2' : '') + '">' + c.esc(x.headline) + '</div>').join('');
    }
    (async () => { try{ const l = await c.OS.gallery.list(); const imgs = l.filter(m => m.type !== 'video'); if(!imgs.length || !alive) return; const m = imgs[Math.floor(c.OS.worldModel.hash(c.OS.worldModel.dayIndex(c.OS.now()), 7, 3) * imgs.length)]; const t = await c.OS.gallery.thumb(m); if(t && alive){ T.style.backgroundImage = 'url("' + t + '")'; T.classList.add('on'); } }catch(e){} })();
    paint(); const t = setInterval(paint, 60000); return { update: paint, destroy(){ alive = false; clearInterval(t); } };
  } });
