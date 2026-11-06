/* ArcadeGames — the pure maths behind the Arcade app: an unbiased random source, slots, blackjack, ride the bus and Texas hold'em with bots.
 * No DOM, no money, no state of its own — os/kernel/arcade.js owns the wallet and the rounds, this file only decides what the cards and reels do.
 * Loads in the browser and in Node (tests/arcade.test.js).
 *
 * FAIRNESS: every random choice comes from crypto.getRandomValues through rejection sampling (no modulo bias). Nothing is weighted, nothing is
 * "due", the deck is reshuffled for every round, and bots only ever see their own cards and the board. The ONLY house edges are the printed
 * paytables below (slots) and the standard blackjack rules; ride the bus pays exactly the true odds and poker is player-vs-bot with no rake. */
const ArcadeGames = (function(){
  'use strict';
  const round2 = n => Math.round(n * 100) / 100;

  /* ---------------- random source ---------------- */
  function makeRng(u32){                                       // uniform integer in [0, n) with no modulo bias
    return function(n){
      if(!(n >= 1) || n > 4294967296) throw new Error('rng range');
      const lim = 4294967296 - (4294967296 % n); let x;
      do{ x = u32(); }while(x >= lim);
      return x % n;
    };
  }
  function cryptoU32(){
    const g = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto, buf = new Uint32Array(1);
    return () => g.getRandomValues(buf)[0];
  }
  const rng = makeRng(cryptoU32());
  function shuffled(arr, r){ const a = arr.slice(); for(let i = a.length - 1; i > 0; i--){ const j = (r || rng)(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const newDeck = n => { const d = []; for(let k = 0; k < (n || 1); k++) for(let c = 0; c < 52; c++) d.push(c); return d; };
  const rankOf = c => (c % 13) + 2, suitOf = c => Math.floor((c % 52) / 13);          // rank 2..14 (14 = ace), suit 0..3 = ♠ ♥ ♦ ♣
  const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'], SUITS = ['♠', '♥', '♦', '♣'];
  const cardName = c => RANK_NAMES[rankOf(c) - 2] + SUITS[suitOf(c)];
  const isRed = c => suitOf(c) === 1 || suitOf(c) === 2;

  /* ---------------- limits (shared by the kernel, the tests and mirrored by the database rules) ---------------- */
  const DEFAULT_CFG = { enabled: true, games: { slots: true, bus: true, poker: true, blackjack: true }, betPct: 0.10, betCap: 25000, minBet: 1, dailyCap: 100000, cooldownMs: 1500, maxMult: 100 };
  function mergeCfg(raw){
    const c = JSON.parse(JSON.stringify(DEFAULT_CFG)); if(!raw || typeof raw !== 'object') return c;
    const num = (k, lo, hi) => { const v = +raw[k]; if(isFinite(v) && raw[k] !== null && v >= lo && v <= hi) c[k] = v; };
    if(raw.enabled === false || raw.enabled === 0) c.enabled = false;
    if(raw.games && typeof raw.games === 'object') Object.keys(c.games).forEach(g => { if(raw.games[g] === false || raw.games[g] === 0) c.games[g] = false; });
    num('betPct', 0.001, 1); num('betCap', 1, 1e9); num('minBet', 1, 1e6); num('dailyCap', 0, 1e12); num('cooldownMs', 0, 600000); num('maxMult', 1, 1000);
    return c;
  }
  /* The most you may stake right now: a share of your bank, never above the hard cap, never below the minimum bet, never more than you hold. Whole dollars. */
  function maxBet(cash, c){ const raw = Math.min(c.betCap, cash * c.betPct); return Math.max(0, Math.min(Math.floor(cash), Math.max(c.minBet, Math.floor(raw)))); }
  /* What a finished round may actually pay: at most maxMult × the stake, and never enough to lift today's net winnings above the daily cap. */
  function settleAmount(open, wanted, netToday, c){
    let pay = Math.max(0, Math.min(wanted, open * c.maxMult));
    if(pay > open && netToday + (pay - open) > c.dailyCap) pay = open + Math.max(0, c.dailyCap - netToday);
    return round2(pay);
  }

  /* ---------------- slots: three reels, six symbols, every symbol equally likely on every reel (216 equally likely outcomes) ---------------- */
  const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '🍀', '💎', '7️⃣'];
  const SLOT_PAYS = { triple: [8, 10, 15, 20, 40, 100], twoCherries: 1 };           // ×stake: 🍒🍒🍒 8, 🍋 10, 🔔 15, 🍀 20, 💎 40, 7️⃣ 100; exactly two 🍒 returns the stake
  function slotsPay(reels){
    if(reels[0] === reels[1] && reels[1] === reels[2]) return { mult: SLOT_PAYS.triple[reels[0]], label: SLOT_SYMBOLS[reels[0]].repeat(3) + ' — three of a kind' };
    const ch = reels.filter(x => x === 0).length;
    if(ch === 2) return { mult: SLOT_PAYS.twoCherries, label: 'Two cherries — stake back' };
    return { mult: 0, label: 'No win' };
  }
  const slotsSpin = r => [(r || rng)(6), (r || rng)(6), (r || rng)(6)];
  function slotsRtp(){ let t = 0; for(let a = 0; a < 6; a++) for(let b = 0; b < 6; b++) for(let c = 0; c < 6; c++) t += slotsPay([a, b, c]).mult; return t / 216; }

  /* ---------------- blackjack: fresh 6-deck shoe every round, dealer stands on all 17s, blackjack pays 3:2, double on any two cards, no split, no insurance ---------------- */
  function bjValue(cards){
    let t = 0, aces = 0; cards.forEach(c => { const r = rankOf(c); if(r === 14){ aces++; t += 11; } else t += Math.min(10, r); });
    while(t > 21 && aces){ t -= 10; aces--; }
    return { total: t, soft: aces > 0, bj: cards.length === 2 && t === 21 };
  }
  function bjNew(r){ const shoe = shuffled(newDeck(6), r), st = { shoe, i: 0, player: [], dealer: [], doubled: false, over: false, stake: 0, outcome: null, mult: 0 }; const d = () => shoe[st.i++]; st.player.push(d()); st.dealer.push(d()); st.player.push(d()); st.dealer.push(d()); return st; }
  function bjFinish(st, outcome, mult){ st.over = true; st.outcome = outcome; st.mult = mult; return st; }   // mult = fraction of the (possibly doubled) stake handed back
  function bjSettleNaturals(st){
    const p = bjValue(st.player), d = bjValue(st.dealer);
    if(p.bj && d.bj) return bjFinish(st, 'push', 1);
    if(p.bj) return bjFinish(st, 'blackjack', 2.5);
    if(d.bj) return bjFinish(st, 'dealer-blackjack', 0);
    return st;
  }
  function bjDealerPlays(st){
    while(bjValue(st.dealer).total < 17) st.dealer.push(st.shoe[st.i++]);
    const p = bjValue(st.player).total, d = bjValue(st.dealer).total;
    if(d > 21) return bjFinish(st, 'dealer-bust', 2);
    if(p > d) return bjFinish(st, 'win', 2);
    if(p < d) return bjFinish(st, 'lose', 0);
    return bjFinish(st, 'push', 1);
  }
  function bjHit(st){ st.player.push(st.shoe[st.i++]); const v = bjValue(st.player).total; if(v > 21) return bjFinish(st, 'bust', 0); if(v === 21) return bjDealerPlays(st); return st; }
  const bjStand = st => bjDealerPlays(st);
  function bjDouble(st){ st.doubled = true; st.player.push(st.shoe[st.i++]); if(bjValue(st.player).total > 21) return bjFinish(st, 'bust', 0); return bjDealerPlays(st); }

  /* ---------------- ride the bus: four questions, one card each, pays exactly the true odds (stake × 1/p for every question you survive) ---------------- */
  function busNew(r){ return { deck: shuffled(newDeck(1), r), i: 0, cards: [], stage: 0, mult: 1, over: false, won: false }; }
  function busOptions(st){
    const rem = st.deck.slice(st.i), n = rem.length, cnt = f => rem.filter(f).length, c = st.cards, o = [];
    const add = (id, label, k) => o.push({ id, label, p: k / n, ok: k > 0 });
    if(st.stage === 0){ add('red', 'Red', cnt(isRed)); add('black', 'Black', cnt(x => !isRed(x))); }
    else if(st.stage === 1){ const r0 = rankOf(c[0]); add('higher', 'Higher', cnt(x => rankOf(x) > r0)); add('lower', 'Lower', cnt(x => rankOf(x) < r0)); }
    else if(st.stage === 2){ const lo = Math.min(rankOf(c[0]), rankOf(c[1])), hi = Math.max(rankOf(c[0]), rankOf(c[1])); add('inside', 'Inside', cnt(x => rankOf(x) > lo && rankOf(x) < hi)); add('outside', 'Outside', cnt(x => rankOf(x) < lo || rankOf(x) > hi)); }
    else { SUITS.forEach((s, i) => add('s' + i, s + ' ' + ['Spades', 'Hearts', 'Diamonds', 'Clubs'][i], cnt(x => suitOf(x) === i))); }
    return o;
  }
  function busPick(st, id){
    const opt = busOptions(st).find(x => x.id === id); if(!opt || !opt.ok || st.over) return null;
    const card = st.deck[st.i++]; let win;
    const c = st.cards;
    if(st.stage === 0) win = (id === 'red') === isRed(card);
    else if(st.stage === 1) win = id === 'higher' ? rankOf(card) > rankOf(c[0]) : rankOf(card) < rankOf(c[0]);
    else if(st.stage === 2){ const lo = Math.min(rankOf(c[0]), rankOf(c[1])), hi = Math.max(rankOf(c[0]), rankOf(c[1])), x = rankOf(card); win = id === 'inside' ? (x > lo && x < hi) : (x < lo || x > hi); }
    else win = suitOf(card) === +id.slice(1);
    c.push(card);
    if(!win){ st.over = true; st.won = false; st.mult = 0; return { card, win: false }; }
    st.mult *= 1 / opt.p; st.stage++;
    if(st.stage >= 4){ st.over = true; st.won = true; }
    return { card, win: true, p: opt.p };
  }

  /* ---------------- poker: no-limit Texas hold'em. Chips are integer cents. ---------------- */
  function score5(cs){
    const r = cs.map(rankOf).sort((a, b) => b - a), flush = cs.every(c => suitOf(c) === suitOf(cs[0]));
    let straight = false, hi = r[0];
    if(new Set(r).size === 5){ if(r[0] - r[4] === 4) straight = true; else if(r[0] === 14 && r[1] === 5 && r[2] === 4 && r[3] === 3 && r[4] === 2){ straight = true; hi = 5; } }
    const cnt = {}; r.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    const g = Object.keys(cnt).map(k => [cnt[k], +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let cat, tb;
    if(straight && flush){ cat = 8; tb = [hi]; } else if(g[0][0] === 4){ cat = 7; tb = [g[0][1], g[1][1]]; } else if(g[0][0] === 3 && g[1][0] === 2){ cat = 6; tb = [g[0][1], g[1][1]]; }
    else if(flush){ cat = 5; tb = r; } else if(straight){ cat = 4; tb = [hi]; } else if(g[0][0] === 3){ cat = 3; tb = g.map(x => x[1]); }
    else if(g[0][0] === 2 && g[1][0] === 2){ cat = 2; tb = g.map(x => x[1]); } else if(g[0][0] === 2){ cat = 1; tb = g.map(x => x[1]); } else { cat = 0; tb = r; }
    let s = cat; for(let i = 0; i < 5; i++) s = s * 15 + (tb[i] || 0); return s;
  }
  const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  function bestOf(cards){                                   // best five-card score from 5–7 cards
    if(cards.length === 5) return score5(cards);
    let best = -1; const n = cards.length, pick = [];
    (function rec(start){ if(pick.length === 5){ const s = score5(pick.map(i => cards[i])); if(s > best) best = s; return; } for(let i = start; i < n; i++){ pick.push(i); rec(i + 1); pick.pop(); } })(0);
    return best;
  }
  const handName = s => HAND_NAMES[Math.floor(s / Math.pow(15, 5))];

  function pokerNew(r, o){                                  // o: { n, stack (cents), sb, bb, dealer }
    const n = o.n, deck = shuffled(newDeck(1), r), hole = []; let di = 0;
    for(let i = 0; i < n; i++) hole.push([deck[di++], deck[di++]]);
    const st = { n, deck, di, hole, board: [], stacks: Array(n).fill(o.stack), bets: Array(n).fill(0), contrib: Array(n).fill(0), folded: Array(n).fill(false), allin: Array(n).fill(false), acted: Array(n).fill(false),
      dealer: o.dealer, sb: o.sb, bb: o.bb, street: 0, curBet: 0, minRaise: o.bb, toAct: -1, over: false, showdown: false, result: null, log: [] };
    put(st, (o.dealer + 1) % n, o.sb); put(st, (o.dealer + 2) % n, o.bb); st.curBet = Math.max(st.bets[(o.dealer + 1) % n], st.bets[(o.dealer + 2) % n]);
    st.toAct = nextToAct(st, (o.dealer + 2) % n);
    return st;
  }
  function put(st, i, amt){ const a = Math.min(amt, st.stacks[i]); st.stacks[i] -= a; st.bets[i] += a; st.contrib[i] += a; if(st.stacks[i] === 0) st.allin[i] = true; return a; }
  const aliveCount = st => st.folded.filter(f => !f).length;
  const canAct = (st, i) => !st.folded[i] && !st.allin[i];
  function nextToAct(st, from){ for(let k = 1; k <= st.n; k++){ const j = (from + k) % st.n; if(canAct(st, j) && (!st.acted[j] || st.bets[j] < st.curBet)) return j; } return -1; }
  const potTotal = st => st.contrib.reduce((a, b) => a + b, 0);
  function pokerLegal(st, i){
    const toCall = Math.min(st.curBet - st.bets[i], st.stacks[i]), maxTo = st.bets[i] + st.stacks[i], others = st.stacks.some((s, j) => j !== i && canAct(st, j));
    return { toCall, canCheck: toCall === 0, canRaise: st.stacks[i] > st.curBet - st.bets[i] && others, minTo: Math.min(st.curBet + st.minRaise, maxTo), maxTo, pot: potTotal(st) };
  }
  function pokerAct(st, i, type, to){
    if(st.over || st.toAct !== i) return false;
    const L = pokerLegal(st, i);
    if(type === 'fold'){ if(L.canCheck) type = 'call'; else st.folded[i] = true; }
    if(type === 'call'){ put(st, i, st.curBet - st.bets[i]); }
    else if(type === 'raise'){
      if(!L.canRaise) type = 'call', put(st, i, st.curBet - st.bets[i]);
      else {
        to = Math.max(L.minTo, Math.min(L.maxTo, Math.round(+to || 0)));
        put(st, i, to - st.bets[i]);
        if(st.bets[i] > st.curBet){ const inc = st.bets[i] - st.curBet; st.curBet = st.bets[i]; if(inc >= st.minRaise){ st.minRaise = inc; st.acted = st.acted.map((x, j) => j === i ? true : (canAct(st, j) ? false : x)); } }
      }
    }
    st.acted[i] = true; st.log.push({ i, type: st.folded[i] ? 'fold' : type, to: st.bets[i] });
    advance(st, i); return true;
  }
  function advance(st, from){
    if(aliveCount(st) === 1){ return award(st); }
    const nx = nextToAct(st, from); if(nx >= 0){ st.toAct = nx; return; }
    // betting round complete
    st.bets.fill(0); st.curBet = 0; st.minRaise = st.bb; st.acted.fill(false);
    const live = []; for(let j = 0; j < st.n; j++) if(canAct(st, j)) live.push(j);
    if(live.length <= 1){ while(st.board.length < 5) dealBoard(st); return award(st); }          // everyone left is all-in: run the board out
    if(st.street >= 3) return award(st);
    st.street++; dealBoard(st); st.toAct = nextToAct(st, st.dealer);
  }
  function dealBoard(st){ if(st.board.length === 0) st.board.push(st.deck[st.di++], st.deck[st.di++], st.deck[st.di++]); else st.board.push(st.deck[st.di++]); }
  function award(st){
    st.over = true; st.toAct = -1; const live = []; for(let j = 0; j < st.n; j++) if(!st.folded[j]) live.push(j);
    const pots = [], levels = [...new Set(live.map(j => st.contrib[j]))].sort((a, b) => a - b); let prev = 0;
    levels.forEach(L => { let amt = 0; for(let p = 0; p < st.n; p++) amt += Math.min(st.contrib[p], L) - Math.min(st.contrib[p], prev); pots.push({ amount: amt, eligible: live.filter(j => st.contrib[j] >= L) }); prev = L; });
    const extra = st.contrib.reduce((a, b) => a + b, 0) - pots.reduce((a, p) => a + p.amount, 0); if(extra > 0 && pots.length) pots[pots.length - 1].amount += extra;
    st.showdown = live.length > 1; if(st.showdown){ while(st.board.length < 5) dealBoard(st); }
    const scores = {}; if(st.showdown) live.forEach(j => { scores[j] = bestOf(st.hole[j].concat(st.board)); });
    const order = []; for(let k = 1; k <= st.n; k++) order.push((st.dealer + k) % st.n);
    st.result = { pots: [], scores, names: {} };
    pots.forEach(p => {
      const el = p.eligible; let winners = el;
      if(el.length > 1){ const top = Math.max(...el.map(j => scores[j])); winners = el.filter(j => scores[j] === top); }
      const share = Math.floor(p.amount / winners.length); let rem = p.amount - share * winners.length;
      winners.forEach(j => { st.stacks[j] += share; }); order.filter(j => winners.includes(j)).forEach(j => { if(rem > 0){ st.stacks[j] += 1; rem--; } });
      st.result.pots.push({ amount: p.amount, winners });
    });
    if(st.showdown) live.forEach(j => { st.result.names[j] = handName(scores[j]); });
  }

  /* ---- bots: they only know their own cards and the board; strength is a Monte-Carlo estimate against random opponent hands ---- */
  function equity(hole, board, opp, r, iters){
    const known = new Set(hole.concat(board)), rest = newDeck(1).filter(c => !known.has(c)); let win = 0;
    for(let t = 0; t < iters; t++){
      const d = shuffled(rest, r), my = hole.slice(), b = board.slice(); let k = 0; while(b.length < 5) b.push(d[k++]);
      const mine = bestOf(my.concat(b)); let best = true, tie = 0;
      for(let o = 0; o < opp; o++){ const s = bestOf([d[k++], d[k++]].concat(b)); if(s > mine){ best = false; break; } if(s === mine) tie++; }
      if(best) win += 1 / (tie + 1);
    }
    return win / iters;
  }
  const BOTS = [ { name: 'Ada', tight: 0.55, aggr: 0.35, bluff: 0.10 }, { name: 'Moe', tight: 0.15, aggr: 0.15, bluff: 0.25 }, { name: 'Rex', tight: 0.35, aggr: 0.85, bluff: 0.35 } ];
  function botAct(st, seat, style, r){
    const L = pokerLegal(st, seat), opp = st.folded.filter((f, j) => !f && j !== seat).length, eq = equity(st.hole[seat], st.board, Math.max(1, opp), r, 100), pot = L.pot;
    const rnd = () => r(1000) / 1000, odds = L.toCall / (pot + L.toCall || 1), size = f => Math.round(st.curBet + Math.max(st.minRaise, pot * f));
    if(L.toCall === 0){
      if(L.canRaise && (eq > 0.58 - style.aggr * 0.12 || rnd() < style.bluff * 0.45 * (1 - eq))) return pokerAct(st, seat, 'raise', size(eq > 0.8 ? 0.9 : 0.5));
      return pokerAct(st, seat, 'call');
    }
    if(L.canRaise && eq > 0.74 - style.aggr * 0.12 && rnd() < 0.5 + style.aggr * 0.4) return pokerAct(st, seat, 'raise', size(eq > 0.88 ? 1 : 0.6));
    if(eq < odds * (1 + style.tight * 0.3) && rnd() > style.bluff * 0.35 && L.toCall > st.bb) return pokerAct(st, seat, 'fold');
    if(L.canRaise && rnd() < style.bluff * 0.12) return pokerAct(st, seat, 'raise', size(0.6));
    return pokerAct(st, seat, 'call');
  }

  return { round2, makeRng, rng, shuffled, newDeck, rankOf, suitOf, cardName, isRed, SUITS, DEFAULT_CFG, mergeCfg, maxBet, settleAmount,
    SLOT_SYMBOLS, SLOT_PAYS, slotsPay, slotsSpin, slotsRtp, bjValue, bjNew, bjSettleNaturals, bjHit, bjStand, bjDouble, busNew, busOptions, busPick,
    score5, bestOf, handName, pokerNew, pokerLegal, pokerAct, potTotal, equity, BOTS, botAct };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = ArcadeGames;
