// Widget: compact WANTED poster (links to News).
(window.__OSW = window.__OSW || []).push({ id: 'wanted', name: 'Wanted Poster', app: 'News', desc: 'The famous poster, compact.', sizes: ['s', 'm'], cls: 'wanted',
  mount(el, size, c){
    const W = c.OS.data.WANTED_DATA, top = W.charges.slice(0, size === 'm' ? 3 : 0);
    el.innerHTML = '<div class="wp"><div class="stamp">FEDERAL<br>NOTICE</div><div class="eyebrow">By order of the court</div><h1>WANTED</h1><div class="subject">Colin West</div>' +
      (size === 'm' ? '<div class="rule"></div><ul>' + top.map(x => '<li><b>' + c.esc(x.count) + '</b><span>' + c.esc(x.text) + '</span></li>').join('') + '</ul>' : '<div class="final">Dead or detention</div>') + '</div>';
    return {};
  } });
