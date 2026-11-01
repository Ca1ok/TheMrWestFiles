// Widget: clock + date (links to Settings).
(window.__OSW = window.__OSW || []).push({ id: 'clock', name: 'Clock', app: 'Settings', desc: 'Time and date.', sizes: ['s', 'm'],
  mount(el, size){
    el.innerHTML = '<div class="grow"></div><div class="big" data-t style="font-size:' + (size === 's' ? 34 : 44) + 'px"></div><div class="sub" data-d></div>';
    const T = el.querySelector('[data-t]'), D = el.querySelector('[data-d]');
    function paint(){ const d = new Date(); T.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); D.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); }
    paint(); const t = setInterval(paint, 5000); return { destroy(){ clearInterval(t); } };
  } });
