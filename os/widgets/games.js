// Widget: today's minigame earnings ring (links to Games).
(window.__OSW = window.__OSW || []).push({ id: 'games', name: 'Games', app: 'Games', desc: 'Daily minigame earnings.', sizes: ['xs', 'v', 's', 'w'], on: ['games'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('Games') + '<span>Today</span></div><div class="grow" style="display:grid;place-items:center"><svg viewBox="0 0 80 80" width="78" height="78"><circle cx="40" cy="40" r="32" fill="none" stroke="var(--fill2)" stroke-width="9"/><circle data-r cx="40" cy="40" r="32" fill="none" stroke="var(--tint)" stroke-width="9" stroke-linecap="round" stroke-dasharray="201" stroke-dashoffset="201" transform="rotate(-90 40 40)" style="transition:stroke-dashoffset .8s var(--ease)"/><text data-t x="40" y="45" text-anchor="middle" font-size="15" font-weight="700" fill="var(--label)" font-family="var(--font)">$0</text></svg></div>';
    const R = el.querySelector('[data-r]'), T = el.querySelector('[data-t]');
    function paint(){ const g = c.OS.games.info(); R.style.strokeDashoffset = 201 * (1 - Math.min(1, g.earned / g.softcap)); T.textContent = '$' + Math.round(g.earned); }
    paint(); return { update: paint };
  } });
