// Widget: everything you own — houses, cars and planes (links to the Assets app, id RealEstate).
(window.__OSW = window.__OSW || []).push({ id: 'realestate', name: 'Assets', app: 'RealEstate', desc: 'Your houses, cars and planes, and what they are worth.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm'], on: ['props', 'cash', 'garage', 'home'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('RealEstate') + '<span>Assets</span></div><div class="grow"></div><div class="big" data-v>$0</div><div class="sub" data-r>&nbsp;</div>';
    const V = el.querySelector('[data-v]'), R = el.querySelector('[data-r]');
    function paint(){ let houses = [], cars = [], val = 0; try{ const H = c.OS.homes; houses = H.mine(); cars = H.garage(); val = houses.reduce((s, x) => s + H.sellValue(x.v), 0) + H.garageValue(); }catch(e){}
      const pl = cars.filter(x => x.model.kind === 'plane').length, ca = cars.length - pl, n = houses.length + cars.length;
      V.textContent = n ? c.money(val, true) : 'Nothing yet'; R.textContent = n ? [houses.length && houses.length + (houses.length === 1 ? ' house' : ' houses'), ca && ca + (ca === 1 ? ' car' : ' cars'), pl && pl + (pl === 1 ? ' plane' : ' planes')].filter(Boolean).join(' · ') : 'Buy a house, a car or a plane'; R.className = 'sub'; }
    paint(); const t = setInterval(paint, 30000); if(size === 'xs' || size === 'h' || size === 'b') el.classList.add('row-layout'); return { update: paint, destroy(){ clearInterval(t); } };
  } });
