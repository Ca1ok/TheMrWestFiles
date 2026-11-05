// Widget: bank balance and tax status (links to Bank).
(window.__OSW = window.__OSW || []).push({ id: 'bank', name: 'Bank', app: 'Bank', desc: 'Your balance and any tax bill.', sizes: ['xs', 'h', 'v', 's', 'w', 'b', 'm'], on: ['cash', 'bank'],
  mount(el, size, c){
    el.innerHTML = '<div class="wh">' + c.tile('Bank') + '<span>Balance</span></div><div class="grow"></div><div class="big" data-b>$0</div><div class="sub" data-t>&nbsp;</div>';
    const B = el.querySelector('[data-b]'), T = el.querySelector('[data-t]');
    function paint(){
      const b = c.OS.bank; const bal = b.balance(); B.textContent = bal >= 1000 ? '$' + Math.round(bal).toLocaleString() : c.money(bal);
      const open = b.open();
      if(open.length){ const soon = Math.min(...open.map(x => x.due)); const h = Math.max(0, (soon - c.OS.now()) / 3600000); T.textContent = '⚠ ' + c.money(b.owed()) + ' tax due in ' + (h < 1 ? '<1h' : Math.round(h) + 'h'); T.className = 'sub down'; }
      else { const p = b.preview(); T.textContent = p.amount > 0 ? 'Tomorrow’s tax ≈ ' + c.money(p.amount) : 'No tax owed'; T.className = 'sub'; }
    }
    if(size === 'xs' || size === 'h' || size === 'b') el.classList.add('row-layout'); const t = setInterval(paint, 60000);
    paint(); return { update: paint, destroy(){ clearInterval(t); } };
  } });
