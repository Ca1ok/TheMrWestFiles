// node tests/arcade.test.js — the Arcade maths: unbiased RNG, slot RTP, blackjack rules, hand ranking, chip conservation in poker, ride-the-bus fairness, limits.
const assert = require('assert'), C = require('../os/lib/arcade-games.js');

// 1) RNG: uniform (chi-square) and in range
{ const N = 600000, k = 7, c = new Array(k).fill(0); for(let i = 0; i < N; i++) c[C.rng(k)]++;
  const exp = N / k, chi = c.reduce((s, x) => s + (x - exp) * (x - exp) / exp, 0); assert(chi < 22.5, 'rng looks uniform (chi² ' + chi.toFixed(1) + ')'); // df=6, p≈0.001 at 22.46
  const seq = [5, 0, 4294967295, 4294967294]; const r = C.makeRng(() => seq.shift()); assert.strictEqual(r(10), 5); assert.strictEqual(r(10), 0); assert.strictEqual(r(3), 4294967294 % 3 === 2 ? 2 : r(3) , 'rejection sampling skips the biased top range'); }
{ const d = C.shuffled(C.newDeck(1)); assert.strictEqual(new Set(d).size, 52); }

// 2) slots: exact RTP from all 216 outcomes
{ const rtp = C.slotsRtp(); assert(Math.abs(rtp - 208 / 216) < 1e-12, 'slots RTP is 208/216'); console.log('slots RTP ' + (rtp * 100).toFixed(2) + '%');
  const N = 300000; let paid = 0; for(let i = 0; i < N; i++) paid += C.slotsPay(C.slotsSpin()).mult; assert(Math.abs(paid / N - rtp) < 0.03, 'simulated slots RTP ≈ exact (' + (paid / N).toFixed(3) + ')'); }

// 3) blackjack
{ const card = (rank, suit) => (rank - 2) + 13 * (suit || 0);
  assert.deepStrictEqual(C.bjValue([card(14), card(13)]), { total: 21, soft: true, bj: true });
  assert.strictEqual(C.bjValue([card(14), card(14), card(9)]).total, 21);
  assert.strictEqual(C.bjValue([card(10), card(7), card(5)]).total, 22);
  const rig = (p, d, rest) => { const shoe = [p[0], d[0], p[1], d[1]].concat(rest || [card(2), card(3), card(4), card(5), card(6), card(7), card(8), card(9)]); return { shoe, i: 4, player: [shoe[0], shoe[2]], dealer: [shoe[1], shoe[3]], doubled: false, over: false, outcome: null, mult: 0 }; };
  let s = C.bjSettleNaturals(rig([card(14), card(13)], [card(9), card(8)])); assert.strictEqual(s.mult, 2.5);
  s = C.bjSettleNaturals(rig([card(14), card(13)], [card(14), card(12)])); assert.strictEqual(s.outcome, 'push');
  s = C.bjSettleNaturals(rig([card(9), card(8)], [card(14), card(12)])); assert.strictEqual(s.mult, 0);
  s = C.bjStand(rig([card(10), card(9)], [card(10), card(7)])); assert.strictEqual(s.outcome, 'win');
  s = C.bjStand(rig([card(10), card(7)], [card(10), card(7)])); assert.strictEqual(s.outcome, 'push');
  s = C.bjStand(rig([card(10), card(6)], [card(10), card(6)], [card(10)])); assert.strictEqual(s.outcome, 'dealer-bust');
  s = C.bjHit(rig([card(10), card(6)], [card(10), card(7)], [card(10)])); assert.strictEqual(s.outcome, 'bust');
  // long-run return with a simple "stand on 17" player is below 100% but not wildly so
  let ret = 0; const N = 200000; for(let i = 0; i < N; i++){ let st = C.bjSettleNaturals(C.bjNew()); while(!st.over){ st = C.bjValue(st.player).total < 17 ? C.bjHit(st) : C.bjStand(st); } ret += st.mult; }
  assert(ret / N > 0.9 && ret / N < 1.0, 'basic blackjack return ' + (ret / N).toFixed(3)); console.log('blackjack (stand on 17+) return ' + (ret / N * 100).toFixed(1) + '%'); }

// 4) hand ranking
{ const h = (...c) => c.map(x => { const r = '23456789TJQKA'.indexOf(x[0]), s = 'shdc'.indexOf(x[1]); return r + 13 * s; });
  const order = [h('2s', '3h', '5d', '7c', '9s'), h('2s', '2h', '5d', '7c', '9s'), h('2s', '2h', '5d', '5c', '9s'), h('2s', '2h', '2d', '7c', '9s'), h('As', '2h', '3d', '4c', '5s'), h('2s', '5s', '8s', 'Js', 'Ks'), h('2s', '2h', '2d', '7c', '7s'), h('2s', '2h', '2d', '2c', '9s'), h('Ts', 'Js', 'Qs', 'Ks', 'As')];
  for(let i = 1; i < order.length; i++) assert(C.score5(order[i]) > C.score5(order[i - 1]), 'category ' + i + ' beats ' + (i - 1));
  assert(C.score5(h('As', 'Ah', 'Kd', '7c', '2s')) > C.score5(h('Ks', 'Kh', 'Ad', '7c', '2s')), 'pair of aces beats pair of kings');
  assert(C.score5(h('As', 'Ah', 'Kd', '7c', '2s')) > C.score5(h('As', 'Ah', 'Qd', '7c', '2s')), 'kicker decides');
  assert(C.score5(h('6s', '5h', '4d', '3c', '2s')) > C.score5(h('As', '2h', '3d', '4c', '5s')), 'six-high straight beats the wheel');
  assert.strictEqual(C.bestOf(h('As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '2c')), C.score5(h('As', 'Ks', 'Qs', 'Js', 'Ts')), 'best five of seven'); }

// 5) poker: chips are conserved, hands always finish, side pots work
{ let hands = 0; for(let t = 0; t < 400; t++){
    const st = C.pokerNew(C.rng, { n: 4, stack: 10000, sb: 250, bb: 500, dealer: t % 4 }); let guard = 0;
    while(!st.over){ if(++guard > 200) throw new Error('hand did not finish'); const i = st.toAct, L = C.pokerLegal(st, i), x = C.rng(10);
      if(x < 2) C.pokerAct(st, i, 'fold'); else if(x < 4 && L.canRaise) C.pokerAct(st, i, 'raise', L.minTo + C.rng(L.maxTo - L.minTo + 1)); else if(x === 9 && L.canRaise) C.pokerAct(st, i, 'raise', L.maxTo); else C.pokerAct(st, i, 'call'); }
    assert.strictEqual(st.stacks.reduce((a, b) => a + b, 0), 40000, 'chips conserved'); assert(st.stacks.every(s => s >= 0)); hands++; }
  // hand-built side pot: A all-in short and best, B and C bigger
  const st = C.pokerNew(C.rng, { n: 3, stack: 10000, sb: 100, bb: 200, dealer: 0 }); st.stacks = [1000, 5000, 5000]; st.bets.fill(0); st.contrib.fill(0); st.curBet = 0; st.toAct = 1; st.dealer = 0;
  const h = (...c) => c.map(x => '23456789TJQKA'.indexOf(x[0]) + 13 * 'shdc'.indexOf(x[1])); st.hole = [h('As', 'Ah'), h('Ks', 'Kh'), h('Qs', 'Qh')]; st.board = h('2d', '7c', '9h', '4s'); st.street = 2; st.deck = C.shuffled(C.newDeck()).filter(c => !st.hole.flat().concat(st.board).includes(c)); st.di = 0;
  st.deck = [h('3d')].concat(st.deck);
  C.pokerAct(st, 1, 'raise', 3000); C.pokerAct(st, 2, 'call'); C.pokerAct(st, 0, 'call');
  while(!st.over) C.pokerAct(st, st.toAct, 'call');                    // river: everyone checks
  assert.deepStrictEqual(st.stacks, [3000, 6000, 2000], 'main pot to the aces (3×1000), side pot to the kings (2×2000)'); console.log('poker: ' + hands + ' random hands conserved chips'); }

// 6) ride the bus: exactly fair — expected return 100% whatever you pick
{ const N = 200000; let ret = 0; for(let t = 0; t < N; t++){ const st = C.busNew(); while(!st.over){ const o = C.busOptions(st).filter(x => x.ok), pick = o[C.rng(o.length)]; C.busPick(st, pick.id); if(!st.over && C.rng(3) === 0) break; } ret += st.over && !st.won ? 0 : st.mult; }
  assert(Math.abs(ret / N - 1) < 0.06, 'bus return ' + (ret / N).toFixed(3)); console.log('ride the bus return ' + (ret / N * 100).toFixed(1) + '% (fair = 100%)'); }

// 7) limits
{ const c = C.mergeCfg({}); assert.strictEqual(C.maxBet(100, c), 10); assert.strictEqual(C.maxBet(5, c), 1); assert.strictEqual(C.maxBet(0.5, c), 0); assert.strictEqual(C.maxBet(1e9, c), 25000);
  assert.strictEqual(C.maxBet(1, Object.assign({}, c, { minBet: 5 })), 1, 'never more than you hold');
  assert.strictEqual(C.settleAmount(100, 5000, 0, c), 5000 > 100 * 100 ? 10000 : 5000); assert.strictEqual(C.settleAmount(100, 20000, 0, c), 10000, 'max multiplier');
  assert.strictEqual(C.settleAmount(1000, 5000, 98000, c), 3000, 'daily cap trims the win: 1000 back + 2000 headroom');
  assert.strictEqual(C.settleAmount(1000, 5000, 100000, c), 1000, 'at the cap a win pays only the stake back');
  assert.strictEqual(C.settleAmount(1000, 0, 100000, c), 0, 'losses are unaffected');
  assert.strictEqual(C.mergeCfg({ betPct: 99, dailyCap: -5, enabled: false }).dailyCap, 100000, 'garbage config is ignored'); assert.strictEqual(C.mergeCfg({ enabled: false }).enabled, false); }
console.log('arcade ok');
