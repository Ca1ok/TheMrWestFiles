/* KERNEL · bank — taxes and bills, seen from the browser.
 * The world server (GitHub Action, os/lib/eco-sim.js) issues the bills — property tax, wealth tax, fire repairs, hospital bills — and enforces them
 * (collects from your cash, then takes houses). They live in eco/bill/<uid>, so they can't be dodged by editing or deleting anything locally.
 * This module only presents them (K.ledger pays them automatically when you can afford it; the Bank app shows the rest). */
(window.__OSM = window.__OSM || []).push(function(K){
  const B = K.bank = {}, LG = () => K.ledger, DAY = 86400000;
  B.threshold = () => Math.round(LG().cfg.wealthFree / 100);
  B.rate = cash => { const th = B.threshold(); return cash > th ? Math.min(0.02, 0.005 + 0.01 * (cash - th) / th) : 0; };      // same curve as the server's daily wealth tax
  B.bills = () => LG().billList().map(b => ({ id: b.id, amt: b.a / 100, label: b.n || b.k, kind: b.k, issued: b.t, due: b.due, status: 'open', rate: 0, original: (b.a0 || b.a) / 100 }));
  B.open = B.bills;
  B.owed = () => K.round2(LG().owed());
  B.preview = () => { const base = Math.max(0, K.S.cash), r = B.rate(base); return { base, rate: r, amount: K.round2(Math.max(0, base - B.threshold()) * r), threshold: B.threshold() }; };
  B.pay = id => LG().payBill(id).then(r => r.ok ? { ok: true, msg: 'Paid $' + r.paid.toFixed(2) } : { ok: false, msg: r.msg });
  B.payAll = async () => { let n = 0; for(const b of LG().billList()){ const r = await LG().payBill(b.id); if(r.ok) n++; else break; } return n; };
});
