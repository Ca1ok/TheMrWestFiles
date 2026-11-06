/* KERNEL · bank — the daily wealth tax as BILLS you have to pay, with consequences.
 *   - Once per UTC day, if your cash is above the threshold, the bank issues a tax bill = cash × rate (rate grows exponentially with how
 *     far over the threshold you are, capped). At or below the threshold there is no tax and no bill.
 *   - You get a notice in Messages, a reminder shortly before it is due, and if it is still unpaid at the deadline the bank SEIZES your
 *     stuff (inventory first, then shares, then property) worth DOUBLE the bill — and refunds any overshoot in cash.
 * Everything runs off the server-corrected clock, so changing your PC clock can't dodge a deadline. */
(window.__OSM = window.__OSM || []).push(function(K){
  const T = OS_CONFIG.tax, HOUR = 3600000, DAY = 86400000;
  const B = K.bank = {};
  B.threshold = () => Math.round(T.threshold * World.econ(K.now()));       // the free allowance grows with the economy index, so inflation never taxes you for standing still
  B.rate = cash => { const th = B.threshold(); return cash > th ? Math.min(T.maxRate, T.base * (Math.exp(T.growth * (cash - th) / th) - 1)) : 0; };
  B.bills = () => K.S.bank.bills.map(b => Object.assign({}, b));
  B.open = () => K.S.bank.bills.filter(b => b.status === 'open');
  B.owed = () => K.round2(B.open().reduce((s, b) => s + b.amt, 0));
  B.preview = function(){ const base = Math.max(0, K.S.cash - B.owed()), r = B.rate(base); return { base, rate: r, amount: K.round2(base * r), threshold: B.threshold() }; };
  const dayIdx = s => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY);
  const fmt = n => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = t => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  B.process = function(){
    if(!K.loaded && K.cloud.signedIn()) return;                          // never bill a half-loaded account
    const S = K.S.bank, now = K.now(), today = K.today();
    // 1) issue bills for any UTC days we haven't looked at yet
    if(!S.last){ S.last = today; K.touch('bank'); }
    else if(S.last < today){
      let days = Math.min(T.catchupDays, dayIdx(today) - dayIdx(S.last)); S.last = today; K.touch('bank');
      for(let i = 0; i < days; i++){
        const base = Math.max(0, K.S.cash - B.owed()), rate = B.rate(base), amt = K.round2(base * rate);
        if(amt < 1) break;
        const bill = { id: 'T' + now.toString(36) + i, amt, rate, base: K.round2(base), issued: now, due: now + T.dueHours * HOUR, status: 'open', reminded: false };
        S.bills.unshift(bill); if(S.bills.length > 30) S.bills.length = 30;
        K.mailAdd({ id: 'tax-' + bill.id, from: 'West Bank', kind: 'tax', subj: 'Tax notice: ' + fmt(amt) + ' due ' + when(bill.due),
          body: 'Your balance is above ' + fmt(B.threshold()) + ', so a daily wealth tax of ' + (rate * 100).toFixed(2) + '% applies.\n\nAmount due: ' + fmt(amt) + '\nDue by: ' + when(bill.due) + '\n\nPay it in the Bank app. If it is still unpaid at the deadline, we will seize assets worth DOUBLE the amount owed (' + fmt(amt * T.seizeMultiple) + ').', act: { app: 'Bank', label: 'Pay now' } });
        K.emit('bank');
      }
    }
    // 2) reminders and deadlines
    S.bills.forEach(b => {
      if(b.status !== 'open') return;
      if(now >= b.due){ seize(b); return; }
      if(!b.reminded && now >= b.due - T.remindHours * HOUR){
        b.reminded = true; K.touch('bank');
        K.mailAdd({ id: 'rem-' + b.id, from: 'West Bank', kind: 'tax', subj: 'FINAL NOTICE: ' + fmt(b.amt) + ' due ' + when(b.due),
          body: 'This is your final reminder. Unless ' + fmt(b.amt) + ' is paid by ' + when(b.due) + ', the bank will seize assets worth ' + fmt(b.amt * T.seizeMultiple) + '.', act: { app: 'Bank', label: 'Pay now' } });
      }
    });
  };
  B.pay = function(id){
    const b = K.S.bank.bills.find(x => x.id === id && x.status === 'open'); if(!b) return { ok: false, msg: 'That bill is no longer open.' };
    if(!K.spend(b.amt, 'Tax payment')) return { ok: false, msg: 'You need ' + fmt(b.amt) + ' to pay this.' };
    b.status = 'paid'; b.paidAt = K.now(); K.touch('bank'); K.emit('bank');
    K.mailAdd({ id: 'paid-' + b.id, from: 'West Bank', kind: 'info', subj: 'Payment received: ' + fmt(b.amt), body: 'Thank you. Your tax bill has been settled in full.', notify: false });
    return { ok: true, msg: 'Paid ' + fmt(b.amt) };
  };
  B.payAll = function(){ let n = 0; B.open().forEach(b => { if(B.pay(b.id).ok) n++; }); return n; };

  /* ---- seizure: take stuff worth 2× the bill, cheapest category to lose first ---- */
  function seize(b){
    const target = K.round2(b.amt * T.seizeMultiple); let left = target; const taken = [];
    // inventory (elements + compounds): most valuable units first
    const items = [];
    ['e', 'c'].forEach(t => Object.keys(K.S.inv[t]).forEach(k => items.push({ k, type: t === 'c' ? 'compound' : 'element', n: K.S.inv[t][k], v: Math.max(0.01, K.listValue(k)) })));
    items.sort((x, y) => y.v - x.v);
    for(const it of items){ if(left <= 0) break; const n = Math.min(it.n, Math.ceil(left / it.v)); K.invTake(it.type, it.k, n); left = K.round2(left - n * it.v); taken.push(n + '× ' + Chem.prettyFormula(it.k)); }
    // shares
    if(left > 0 && K.S.lots.length){
      const p = K.market.price(); K.S.lots.sort((x, y) => y.q - x.q);
      while(left > 0 && K.S.lots.length){ const l = K.S.lots[0], val = l.q * p; if(val <= left){ K.S.lots.shift(); left = K.round2(left - val); taken.push(l.q + ' $WEST'); } else { const q = Math.ceil(left / p * 10000) / 10000; l.q = Math.round((l.q - q) * 10000) / 10000; left = 0; taken.push(q + ' $WEST'); } }
      K.touch('lots'); K.emit('stock');
    }
    // property: indivisible, so the cheapest one that covers what is left (else the dearest, repeated)
    let refund = 0; if(left < 0){ refund = K.round2(-left); left = 0; }          // whole units overshoot the target — the bank gives change
    while(left > 0 && Object.keys(K.S.props).length){
      const owned = Object.keys(K.S.props).map(id => ({ id, p: K.propPrice(id) })).sort((x, y) => x.p - y.p);
      const pick = owned.find(o => o.p >= left) || owned[owned.length - 1];
      delete K.S.props[pick.id]; K.touch('props'); K.emit('props');
      const name = (PROPERTIES.find(p => p.id === pick.id) || {}).name || pick.id; taken.push(name);
      if(pick.p > left){ refund = K.round2(refund + pick.p - left); left = 0; } else left = K.round2(left - pick.p);
    }
    if(refund > 0) K.earn(refund, 'Seizure refund');
    b.status = 'seized'; b.seized = taken; b.shortfall = Math.max(0, left); K.touch('bank'); K.emit('bank');
    const worth = K.round2(target - left);
    K.mailAdd({ id: 'seize-' + b.id, from: 'West Bank', kind: 'seize', subj: 'Assets seized: ' + fmt(worth),
      body: 'Your tax bill of ' + fmt(b.amt) + ' was not paid by the deadline.\n\nWe have seized assets worth ' + fmt(worth) + ' (double the amount owed):\n' + (taken.length ? taken.map(x => '• ' + x).join('\n') : '• nothing — you had no assets') + (refund > 0 ? '\n\nA property sale overshot the amount owed; ' + fmt(refund) + ' has been credited to your account.' : '') + (left > 0 ? '\n\nYou did not own enough to cover the full penalty; the rest has been written off.' : '') + '\n\nThe bill is now closed. Pay on time next time!', act: { app: 'Bank', label: 'Open Bank' } });
    return taken;
  }
  setInterval(() => { try{ B.process(); }catch(e){ console.error(e); } }, 30000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) B.process(); });
  K.on('ready', () => B.process()); K.on('auth', () => { if(!K.cloud.signedIn()) setTimeout(B.process, 1500); });
});
