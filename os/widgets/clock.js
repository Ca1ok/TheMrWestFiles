// Widget: clock + date (links to Settings).
(window.__OSW = window.__OSW || []).push({ id: 'clock', name: 'Clock', app: 'Settings', desc: 'Time and date.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm'], on: [],
  mount(el, size, c){
    el.innerHTML = '<div class="grow"></div><div class="big" data-t style="font-size:' + (size === 'xs' || size === 'v' ? 22 : size === 's' || size === 'h' ? 34 : 44) + 'px"></div><div class="sub" data-d></div>';
    const T = el.querySelector('[data-t]'), D = el.querySelector('[data-d]');
    function paint(){ const d = new Date(), P = c.OS.prefs; T.textContent = d.toLocaleTimeString([], { hour: P.get('clock24') ? '2-digit' : 'numeric', minute: '2-digit', second: P.get('clockSeconds') ? '2-digit' : undefined, hour12: !P.get('clock24') }); D.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); }
    paint(); const t = setInterval(paint, c.OS.prefs.get('clockSeconds') ? 1000 : 5000); return { destroy(){ clearInterval(t); } };
  } });
