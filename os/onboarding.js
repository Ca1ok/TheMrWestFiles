/* ONBOARDING — the first thing every player does in the WestEconomy (and what a homeless player is asked to do again):
 *   1 welcome (+ choose a display name)  →  2 claim the welcome grant ($100,000 from the pool; OG players get more)  →  3 pick a home to live in
 *   (buy it, or rent it by the day)  →  4 you're in. Skipping it is allowed — but a player without a home is homeless (limited earnings, no casino, no loans) until they pick one. */
(window.__OSM = window.__OSM || []).push(function(K){
  const OS = K.facade;
  let el = null, step = 0, busy = false, msg = '', tab = 'rent', more = 12, mode = 'new', snoozed = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f0 = n => '$' + Math.round(n).toLocaleString(), f2 = n => '$' + (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const css = `#onb{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(8,6,4,.62);backdrop-filter:blur(10px);padding:16px;font-family:var(--font,system-ui)}
#onb .card{width:min(720px,100%);max-height:92vh;overflow:auto;background:var(--bg2,#16110c);color:var(--label,#f3e9d8);border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:26px 26px 22px;border:1px solid rgba(255,255,255,.08)}
#onb h1{margin:0 0 6px;font-size:26px;letter-spacing:-.02em} #onb p{margin:8px 0;line-height:1.5;color:var(--label2,#c9bda8)} #onb .dots{display:flex;gap:6px;margin-bottom:14px} #onb .dots i{height:5px;flex:1;border-radius:3px;background:var(--fill,rgba(255,255,255,.12))} #onb .dots i.on{background:var(--tint,#e8924f)}
#onb .big{font:800 44px/1.1 var(--font,system-ui);letter-spacing:-.03em;color:var(--good,#5cc06e);margin:10px 0 2px} #onb .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center} #onb .gift{background:var(--tint-dim,rgba(232,146,79,.18));color:var(--tint2,#f2b27a);border-radius:12px;padding:10px 12px;font-weight:600;margin:10px 0}
#onb button.b{background:var(--tint,#e8924f);color:#fff;border:0;border-radius:12px;padding:11px 18px;font:700 15px var(--font,system-ui);cursor:pointer} #onb button.b:disabled{opacity:.5;cursor:default} #onb button.g{background:var(--fill,rgba(255,255,255,.1));color:inherit}
#onb input{background:var(--card,#1d1711);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 12px;font:600 15px var(--font,system-ui);min-width:220px} #onb .err{color:var(--bad,#ee6259);font-weight:600;min-height:20px;margin-top:6px}
#onb .tabs{display:flex;gap:6px;margin:12px 0} #onb .tabs button{flex:1;background:var(--card,#1d1711);color:inherit;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px;font:700 14px var(--font,system-ui);cursor:pointer} #onb .tabs button.on{background:var(--tint-dim,rgba(232,146,79,.2));border-color:var(--tint,#e8924f);color:var(--tint2,#f2b27a)}
#onb .opt{display:flex;gap:12px;align-items:center;background:var(--card,#1d1711);border-radius:14px;padding:11px 13px;margin:8px 0} #onb .opt .sw{width:40px;height:40px;border-radius:11px;flex:none} #onb .opt .t{flex:1;min-width:0} #onb .opt b{display:block} #onb .opt small{color:var(--label2,#c9bda8);font-size:12.5px} #onb .opt .pr{text-align:right;font-weight:800;white-space:nowrap}`;
  function build(){ if(!document.getElementById('onb-css')){ const s = document.createElement('style'); s.id = 'onb-css'; s.textContent = css; document.head.appendChild(s); } el = document.createElement('div'); el.id = 'onb'; document.body.appendChild(el); }
  function close(){ if(el){ el.remove(); el = null; } }
  const dots = n => '<div class="dots">' + [1, 2, 3, 4].map(i => '<i class="' + (i <= n ? 'on' : '') + '"></i>').join('') + '</div>';
  function homeList(){
    const H = OS.homes, w = H.world(), cfg = H.cfg(), cash = K.S.cash, out = [];
    Object.keys(w).forEach(id => { const h = w[id]; if(!h || h.o !== 'bank' || h.t) return; const g = H.house(id); out.push({ id, h, g, buy: h.v / 100, duty: cfg.dutyBp / 10000 * h.v / 100, rent: h.rh * 24 / 100, tax: h.v * cfg.propTaxBpDay / 10000 / 100 }); });
    return out.filter(o => o.h.dm < 40);
  }
  function render(){
    if(!el) return; const H = OS.homes, c = el.querySelector('.card') || el.appendChild(Object.assign(document.createElement('div'), { className: 'card' })); let html = '';
    if(step === 0){
      html = dots(1) + '<h1>Welcome to the WestEconomy</h1><p>One shared pool of money — <b>$100 trillion</b> — runs the whole country. Nothing is ever printed or deleted: when you earn, the pool pays you; when you spend, it goes back to the pool, to the city, or to another player. The treasury takes a small tax on every trade and pays for the city services (fire, police, ambulance) and the bots’ public jobs.</p>' +
        '<p>Everyone starts the same way: a welcome grant, then <b>a place to live</b>. You’ll share WestCountry with 100 bots who work, rent, buy houses and trade with you.</p>' +
        (K.S.meta.name ? '<p>You’ll appear as <b>' + esc(K.S.meta.name) + '</b>.</p>' : '<p>First, pick the name other players will see:</p><div class="row"><input id="onb-name" maxlength="20" placeholder="Display name" autocomplete="off"></div>') +
        '<div class="err">' + esc(msg) + '</div><div class="row"><button class="b" id="onb-next"' + (busy ? ' disabled' : '') + '>Let’s go</button></div>';
    } else if(step === 1){
      html = dots(2) + '<h1>Your welcome grant</h1><p>Paid out of the WestEconomy pool — it’s yours to keep.</p><div class="big">' + f0(H.grantAmount()) + '</div>' +
        (H.isOG() ? '<div class="gift">★ OG player bonus: +$50,000, 10 mol of gold and 10 mol of silver — thank you for being here from the start.</div>' : '') +
        '<div class="err">' + esc(msg) + '</div><div class="row"><button class="b" id="onb-claim"' + (busy ? ' disabled' : '') + '>Claim ' + f0(H.grantAmount()) + '</button></div>';
    } else if(step === 2){
      const list = homeList(), cash = K.S.cash, cfg = H.cfg(); H.watch();
      const items = (tab === 'rent' ? list.filter(o => o.h.rh > 0).sort((a, b) => a.rent - b.rent) : list.sort((a, b) => a.buy - b.buy)).slice(0, more);
      html = dots(3) + '<h1>' + (mode === 'homeless' ? 'You’re homeless — find a home' : 'Choose where you live') + '</h1><p>Everyone needs a roof — without one you’re homeless (limited earnings, no casino, no loans). <b>Rent</b> is cheap to start but paid every day (it tops up automatically while you play). <b>Buying</b> costs more up front and then only a small property tax of ' + (cfg.propTaxBpDay / 100).toFixed(2) + '%/day — and you can rent it out later. You can move any time in <b>WestMap</b>.</p>' +
        '<div class="row"><span>Your cash: <b>' + f2(cash) + '</b></span></div><div class="tabs"><button data-tab="rent" class="' + (tab === 'rent' ? 'on' : '') + '">Rent</button><button data-tab="buy" class="' + (tab === 'buy' ? 'on' : '') + '">Buy</button></div>';
      if(!Object.keys(H.world()).length) html += '<p>Loading the city…</p>';
      else if(!items.length) html += '<p>Nothing available here right now. Open WestMap to look around, or ask for more houses to be built.</p>';
      items.forEach(o => { const can = tab === 'rent' ? cash >= o.rent : cash >= o.buy + o.duty;
        html += '<div class="opt"><span class="sw" style="background:' + o.g.c + '"></span><div class="t"><b>' + esc(o.g.addr) + '</b><small>' + esc(o.g.typeName) + (o.g.beds ? ' · ' + o.g.beds + ' bed' : '') + ' · ' + esc(o.g.district) + '</small></div><div class="pr">' +
          (tab === 'rent' ? f2(o.rent) + '<small style="display:block;font-weight:500;color:var(--label2)">per day</small>' : f0(o.buy) + '<small style="display:block;font-weight:500;color:var(--label2)">+ ' + f0(o.duty) + ' duty</small>') +
          '</div><button class="b" data-pick="' + o.id + '"' + (!can || busy ? ' disabled' : '') + '>' + (tab === 'rent' ? 'Rent' : 'Buy') + '</button></div>'; });
      if(list.length > more) html += '<div class="row"><button class="b g" id="onb-more">Show more</button></div>';
      html += '<div class="err">' + esc(msg) + '</div>' + '<div class="row"><button class="b g" id="onb-later">' + (mode === 'homeless' ? 'Look around in WestMap first' : 'Skip — I’ll be homeless for now') + '</button></div>';
    } else {
      const lv = H.home();
      html = dots(4) + '<h1>You’re home</h1>' + (lv ? '<p><b>' + esc(lv.g.addr) + '</b>, ' + esc(lv.g.district) + (lv.owned ? ' — yours.' : ' — rented.') + '</p>' : '') +
        '<p>• <b>WestMap</b> shows every house in WestCountry and who lives there — buy, sell, rent out, or move.<br>• <b>Bank</b> has your bills, taxes and loans.<br>• Sell items in WestShop, trade $WEST, make things in WestLab and WestFactory — all of it moves money in and out of the shared pool.<br>• Fires, break-ins and emergencies happen to everyone with equal chance; the city’s services respond.</p><div class="row"><button class="b" id="onb-done">Start playing</button><button class="b g" id="onb-map">Open WestMap</button></div>';
    }
    c.innerHTML = html; if(c.dataset.step !== String(step)){ c.dataset.step = String(step); c.scrollTop = 0; } bind(c);
  }
  function bind(c){
    const $ = s => c.querySelector(s);
    if($('#onb-next')) $('#onb-next').onclick = async () => {
      const inp = $('#onb-name'); busy = true; msg = '';
      if(inp){ try{ await OS.auth.setName(inp.value); }catch(e){ msg = e.message || 'That name does not work.'; busy = false; return render(); } }
      busy = false; step = OS.homes.home() ? 3 : (K.ledger.acct.ob ? 2 : 1); render();
    };
    if($('#onb-claim')) $('#onb-claim').onclick = async () => { busy = true; msg = ''; render(); const r = await OS.homes.claimGrant(); busy = false; if(r.ok){ step = 2; msg = ''; } else msg = r.msg; render(); };
    c.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; more = 12; render(); });
    if($('#onb-more')) $('#onb-more').onclick = () => { more += 12; render(); };
    c.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { busy = true; msg = ''; render(); const id = b.dataset.pick; const r = tab === 'rent' ? await OS.homes.rent(id, 24) : await OS.homes.buy(id, true); busy = false; if(r.ok){ step = 3; } else msg = r.msg; render(); });
    if($('#onb-later')) $('#onb-later').onclick = () => { if(mode !== 'homeless' && !confirm('Without a home you are HOMELESS: games pay a tenth of the daily limit, the Arcade is closed, and the bank will not lend to you. You can pick one any time in WestMap. Skip anyway?')) return; snoozed = Date.now() + 30 * 60000; close(); OS.open('WestMap'); };
    if($('#onb-done')) $('#onb-done').onclick = close; if($('#onb-map')) $('#onb-map').onclick = () => { close(); OS.open('WestMap'); };
  }
  function open(m){ if(el) return; mode = m || 'new'; build(); step = mode === 'homeless' ? 2 : (K.S.meta.name ? (K.ledger.acct.ob ? 2 : 1) : 0); if(mode === 'homeless') OS.homes.watch(); render(); if(step === 2) OS.homes.watch(); }
  function check(){
    if(el || !OS.auth.signedIn() || !K.loaded || !OS.homes.ready() || K.sessionLost || Date.now() < snoozed) return;
    if(OS.homes.needsOnboarding()) open(K.ledger.acct.ob ? 'homeless' : 'new');
  }
  K.on('ready', () => setTimeout(check, 800)); K.on('home', () => { if(el && step === 2 && OS.homes.home()){ step = 3; render(); } else setTimeout(check, 300); });
  K.on('world', () => { if(el && step === 2 && !busy) render(); });
  setInterval(check, 30000);
});
