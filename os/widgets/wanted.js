// Widget: WANTED poster. Clicking it opens the full poster as a page (preview.html) in a new tab.
(window.__OSW = window.__OSW || []).push({ id: 'wanted', name: 'Wanted Poster', app: 'News', url: 'preview.html', desc: 'The famous poster. Click to open it as a page.', sizes: ['xs', 'h', 'v', 's', 'w', 'b', 'm', 'l'], cls: 'wanted',
  mount(el, size, c){
    const W = c.OS.data.WANTED_DATA, n = ({ m: 3, w: 3, l: 7, v: 2 })[size] || 0, top = W.charges.slice(0, n), flat = size === 'h' || size === 'b' || size === 'xs';
    el.innerHTML = '<div class="wp' + (flat ? ' flat' : '') + '">' + (flat ? '' : '<div class="stamp">FEDERAL<br>NOTICE</div><div class="eyebrow">By order of the court</div>') + '<h1>WANTED</h1><div class="subject">Colin West</div>' +
      (n ? '<div class="rule"></div><ul>' + top.map(x => '<li><b>' + c.esc(x.count) + '</b><span>' + c.esc(x.text) + '</span></li>').join('') + '</ul>' + (size === 'l' ? '<div class="lbl">Sentence if apprehended</div><ul>' + W.sentence.slice(0, 3).map(x => '<li><span>' + c.esc(x.text) + '</span></li>').join('') + '</ul>' : '') : (flat ? '' : '<div class="final">Dead or detention</div>')) + '</div>';
    el.title = 'Open the poster as a page';
    return {};
  } });
