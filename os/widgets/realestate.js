// Widget: property portfolio (links to Real Estate).
(window.__OSW = window.__OSW || []).push({ id: 'realestate', name: 'Real Estate', app: 'RealEstate', desc: 'Property value and rent waiting for you.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm'], on: ['props', 'cash'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('RealEstate') + '<span>Properties</span></div><div class="grow"></div><div class="big" data-v>$0</div><div class="sub" data-r>&nbsp;</div>';
    const V = el.querySelector('[data-v]'), R = el.querySelector('[data-r]');
    function paint(){ const v = c.OS.props.value(), r = c.OS.props.rentDue(), n = c.OS.props.list().filter(p => p.owned).length; V.textContent = n ? c.money(v, true) : 'None yet'; R.textContent = n ? (r >= 1 ? c.money(r) + ' rent ready' : n + (n === 1 ? ' property' : ' properties')) : 'Click to browse listings'; R.className = 'sub' + (r >= 1 ? ' up' : ''); }
    paint(); const t = setInterval(paint, 30000); if(size === 'xs' || size === 'h' || size === 'b') el.classList.add('row-layout'); return { update: paint, destroy(){ clearInterval(t); } };
  } });
