// Widget: element of the day (links to Notes).
(window.__OSW = window.__OSW || []).push({ id: 'element', name: 'Element of the Day', app: 'Notes', desc: 'A different element every day.', sizes: ['xs', 'h', 'v', 's', 'x3', 'b', 'm'], on: [],
  mount(el, size, c){
    const E = c.OS.data.ELEMENTS, W = c.OS.worldModel, e = E[Math.floor(W.hash(W.dayIndex(c.OS.now()), 99, 5) * E.length)], col = c.OS.data.CATEGORY_COLORS[e[4]] || '#c9a876';
    el.innerHTML = '<div class="wh"><span>Element of the day</span></div><div class="grow"></div><div style="display:flex;align-items:baseline;gap:10px"><div class="big" style="font-size:' + (size === 's' ? 46 : 54) + 'px;color:' + col + '">' + c.esc(e[1]) + '</div><div><div style="font:700 15px var(--font)">' + c.esc(e[2]) + '</div><div class="sub">No. ' + e[0] + ' · ' + (+e[3]).toFixed(2) + ' u</div></div></div>';
    return {};
  } });
