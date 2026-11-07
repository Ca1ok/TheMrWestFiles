/* KERNEL · arcade — the only place a arcade round touches your money.
 *   - The app never sees a random number it can swap and never hands in a result: it asks "deal / hit / spin" and this module draws the cards
 *     (os/lib/arcade-games.js, crypto RNG), keeps the hidden state private, and pays out what the rules say.
 *   - The stake leaves your bank BEFORE any card is shown and is saved to the server first (flushNow). Refreshing or closing the tab mid-round
 *     therefore cannot undo a loss: the unfinished round is forfeited the next time the account loads.
 *   - Limits (max bet as a % of your bank, hard cap, minimum, daily net-winnings cap, cooldown, game switches) come from `arcadeConfig`, which only
 *     the admin can edit. database.rules.json enforces the same limits again on the server for every ledger write (players/$uid/arcade).
 *   - A guest (not signed in) can play with the in-memory balance; nothing is saved, so there is nothing to exploit. */
(window.__OSM = window.__OSM || []).push(function(K){
  const G = ArcadeGames, C = K.cloud, r2 = K.round2, DAY = 86400000;
  const CS = K.arcade = {};
  let cfg = G.mergeCfg(null), cfgAt = 0, R = null, lastEnd = 0, busy = false;       // R = the live round (private)
  const fmt = n => '$' + (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dayStart = () => { const t = K.now(); return t - (t % DAY); };

  /* ---- config (one small read, cached 60 s) ---- */
  CS.loadConfig = async function(force){
    if(!force && Date.now() - cfgAt < 60000) return cfg;
    cfgAt = Date.now();
    if(C.db){ try{ const s = await C.db.ref('arcadeConfig').once('value'); cfg = G.mergeCfg(s.val()); }catch(e){} }
    return cfg;
  };
  CS.config = () => JSON.parse(JSON.stringify(cfg));

  /* ---- ledger: today's net winnings and any stake still at risk ---- */
  const led = () => { const L = K.S.arcade; if(L.d !== dayStart()){ L.d = dayStart(); L.net = 0; } return L; };
  CS.status = function(){
    const L = led(), mb = G.maxBet(K.S.cash - 0, cfg), headroom = Math.max(0, r2(cfg.dailyCap - L.net));
    return { enabled: cfg.enabled, games: Object.assign({}, cfg.games), cash: K.S.cash, minBet: cfg.minBet, maxBet: cfg.enabled && headroom > 0 ? mb : 0, betPct: cfg.betPct, betCap: cfg.betCap, dailyCap: cfg.dailyCap, netToday: r2(L.net), headroom, cooldownMs: cfg.cooldownMs, maxMult: cfg.maxMult, open: L.open, round: !!R };
  };
  function save(){ K.touch('cash', 'bank', 'arcade'); K.emit('cash'); K.emit('arcade'); return C.flushNow(); }
  async function persist(){                                                         // the round only goes ahead if the server accepted the new ledger
    if(!C.signedIn()) return true;
    await save(); await new Promise(r => setTimeout(r, 0));
    return K.dirty.size === 0 || !(K.dirty.has('arcade') || K.dirty.has('cash'));
  }
  /* Other apps save cash on a 20 s delay. Before a round touches the ledger, push everything else first, so the server's balance matches ours and
     the ledger check (cash moved by exactly the stake / payout) can't be confused by unrelated income. */
  async function syncFirst(){ if(!C.signedIn() || !K.dirty.size) return true; await C.flushNow(); return K.dirty.size === 0; }
  const MARGIN = 350;                                                                   // covers network delay so the server-side cooldown never trips on an honest click
  const no = (msg, extra) => Object.assign({ ok: false, msg }, extra);

  /* ---- start / finish a round ---- */
  async function begin(game, bet){
    if(busy) return no('One moment…'); busy = true;
    try{
      { const mm = K.maint.appMsg('Arcade'); if(mm) return no(mm); }                 // maintenance mode: no new rounds (a round already in progress can still finish and pay out)
      await CS.loadConfig();
      if(R) return no('Finish your current round first.');
      const L = led();
      if(L.open > 0) await CS.recover();
      if(!cfg.enabled) return no('The arcade is closed right now.');
      if(!cfg.games[game]) return no('That game is switched off right now.');
      bet = Math.floor(+bet);
      if(!(bet >= 1)) return no('Enter a whole-dollar bet.');
      if(bet > K.S.cash) return no('You only have ' + fmt(K.S.cash) + ' in the bank.');
      const st = CS.status();
      if(st.headroom <= 0) return no('You have reached today’s arcade limit of ' + fmt(cfg.dailyCap) + ' in winnings. Come back tomorrow (UTC).');
      if(bet < Math.min(cfg.minBet, K.S.cash)) return no('Minimum bet is ' + fmt(cfg.minBet) + '.');
      if(bet > st.maxBet) return no('Your maximum bet right now is ' + fmt(st.maxBet) + ' (' + Math.round(cfg.betPct * 100) + '% of your bank, up to ' + fmt(cfg.betCap) + ').');
      const wait = lastEnd + cfg.cooldownMs + MARGIN - Date.now(); if(wait > 0) await new Promise(r => setTimeout(r, wait));
      if(!(await syncFirst())) return no('Your account is still saving — try again in a moment.');
      if(K.S.cash < bet) return no('You only have ' + fmt(K.S.cash) + ' in the bank.');
      const before = { cash: K.S.cash, open: L.open, net: L.net, hist: K.S.bank.hist.slice() };
      if(!K.spend(bet, 'Arcade: ' + game + ' stake')) return no('Couldn’t place that bet.');
      L.open = bet; L.t = K.now(); R = { game, stake: bet, total: bet };
      if(!(await persist())){                                                       // server said no → undo, nothing happened
        K.S.cash = before.cash; L.open = before.open; L.net = before.net; K.S.bank.hist = before.hist; R = null; K.dirty.delete('arcade'); K.emit('cash'); K.emit('arcade');
        return no('The server couldn’t record your bet, so the round was cancelled. Nothing was taken.');
      }
      return { ok: true };
    } finally { busy = false; }
  }
  async function finish(wanted, label){                                              // pays the round out and clears the stake
    await syncFirst();
    const L = led(), open = L.open, stake = R ? R.total : open;
    const pay = G.settleAmount(open, wanted, L.net, cfg), trimmed = wanted > pay + 0.004;
    if(pay > 0) K.earn(pay, 'Arcade: ' + (R ? R.game : 'round'));
    L.net = r2(L.net + pay - open); L.open = 0; L.t = K.now(); const game = R && R.game; R = null;
    await save(); lastEnd = Date.now();
    return { stake, payout: pay, profit: r2(pay - open), net: L.net, trimmed, headroom: Math.max(0, r2(cfg.dailyCap - L.net)), game, label };
  }
  /* an unfinished round (refresh / closed tab / another tab) is lost: the stake was already taken, so just clear the ledger */
  CS.recover = async function(){
    const L = led(); if(!(L.open > 0) || R) return false;
    const lost = L.open; L.net = r2(L.net - lost); L.open = 0; L.t = K.now(); await save(); lastEnd = Date.now();
    K.mailAdd({ id: 'arcade-' + K.now().toString(36), from: 'West Arcade', kind: 'info', subj: 'Unfinished round forfeited: ' + fmt(lost), body: 'You left a arcade round before it finished, so the ' + fmt(lost) + ' stake was forfeited. (Stakes are taken before the cards are dealt so a refresh can’t undo a loss.)', app: 'Arcade', notify: false });
    return true;
  };
  K.on('loaded', () => { CS.loadConfig(true).then(() => CS.recover()).catch(() => {}); });

  /* ================= SLOTS ================= */
  const slots = {
    async spin(bet){
      const b = await begin('slots', bet); if(!b.ok) return b;
      const reels = G.slotsSpin(), pay = G.slotsPay(reels), res = await finish(r2(R.stake * pay.mult), pay.label);
      return Object.assign({ ok: true, reels, symbols: G.SLOT_SYMBOLS, mult: pay.mult }, res);
    },
    paytable: () => ({ symbols: G.SLOT_SYMBOLS.slice(), triple: G.SLOT_PAYS.triple.slice(), twoCherries: G.SLOT_PAYS.twoCherries, rtp: G.slotsRtp() })
  };

  /* ================= BLACKJACK ================= */
  const bjView = (st, reveal) => ({ player: st.player.slice(), dealer: reveal || st.over ? st.dealer.slice() : [st.dealer[0], -1], pv: G.bjValue(st.player), dv: reveal || st.over ? G.bjValue(st.dealer) : { total: G.bjValue([st.dealer[0]]).total }, over: st.over, outcome: st.outcome, doubled: st.doubled, stake: R ? R.total : 0, canDouble: !st.over && st.player.length === 2 && K.S.cash >= (R ? R.stake : 0) && (R ? R.stake : 0) * 2 <= cfg.betCap * 2 });
  const bjEnd = async st => { const res = await finish(r2(R.total * st.mult), ({ blackjack: 'Blackjack! Pays 3:2', 'dealer-blackjack': 'Dealer has blackjack', push: 'Push — stake returned', win: 'You win', 'dealer-bust': 'Dealer busts — you win', lose: 'Dealer wins', bust: 'Bust' })[st.outcome] || 'Round over'); return Object.assign({ ok: true, over: true, state: bjView(st, true) }, res); };
  const blackjack = {
    async deal(bet){
      const b = await begin('blackjack', bet); if(!b.ok) return b;
      const st = G.bjSettleNaturals(G.bjNew()); R.bj = st;
      if(st.over) return bjEnd(st);
      return { ok: true, over: false, state: bjView(st) };
    },
    async hit(){ if(!R || !R.bj || R.bj.over || busy) return no('No hand in progress.'); const st = G.bjHit(R.bj); return st.over ? bjEnd(st) : { ok: true, over: false, state: bjView(st) }; },
    async stand(){ if(!R || !R.bj || R.bj.over || busy) return no('No hand in progress.'); return bjEnd(G.bjStand(R.bj)); },
    async double(){
      if(!R || !R.bj || R.bj.over || busy || R.bj.player.length !== 2) return no('You can only double on your first two cards.');
      const extra = R.stake; if(extra > K.S.cash) return no('You need ' + fmt(extra) + ' more in the bank to double.');
      busy = true;
      try{
        if(!(await syncFirst())) return no('Your account is still saving — try again in a moment.');
        const L = led(), prev = { cash: K.S.cash, open: L.open, hist: K.S.bank.hist.slice() };
        if(!K.spend(extra, 'Arcade: blackjack double')) return no('Couldn’t double.'); L.open += extra; L.t = K.now(); R.total += extra;
        if(!(await persist())){ K.S.cash = prev.cash; L.open = prev.open; K.S.bank.hist = prev.hist; R.total -= extra; K.dirty.delete('arcade'); K.emit('cash'); return no('The server couldn’t record the double. Nothing was taken.'); }
      } finally { busy = false; }
      return bjEnd(G.bjDouble(R.bj));
    },
    view: () => R && R.bj ? bjView(R.bj) : null
  };

  /* ================= RIDE THE BUS ================= */
  const busView = st => ({ cards: st.cards.slice(), stage: st.stage, options: st.over ? [] : G.busOptions(st).map(o => ({ id: o.id, label: o.label, p: o.p, ok: o.ok, pays: r2(Math.min(R.stake * st.mult / o.p, R.stake * cfg.maxMult)) })), mult: st.mult, now: st.over ? 0 : r2(Math.min(R.stake * st.mult, R.stake * cfg.maxMult)), stake: R ? R.stake : 0, over: st.over, won: st.won });
  const bus = {
    async start(bet){ const b = await begin('bus', bet); if(!b.ok) return b; R.bus = G.busNew(); return { ok: true, state: busView(R.bus) }; },
    async pick(id){
      if(!R || !R.bus || R.bus.over || busy) return no('No ride in progress.');
      const st = R.bus, out = G.busPick(st, String(id)); if(!out) return no('That choice isn’t available.');
      if(!out.win) return Object.assign({ ok: true, hit: false, card: out.card, state: busView(st) }, await finish(0, 'Wrong call — you got off the bus'));
      if(st.over) return Object.assign({ ok: true, hit: true, card: out.card, state: busView(st) }, await finish(r2(R.stake * st.mult), 'You rode the whole bus!'));
      return { ok: true, hit: true, card: out.card, state: busView(st) };
    },
    async cashOut(){
      if(!R || !R.bus || R.bus.over || R.bus.stage < 1 || busy) return no('You can cash out after at least one correct call.');
      const st = R.bus; st.over = true; st.won = true; return Object.assign({ ok: true, state: busView(st) }, await finish(r2(R.stake * st.mult), 'Cashed out'));
    },
    view: () => R && R.bus ? busView(R.bus) : null
  };

  /* ================= POKER (no-limit hold'em vs three bots; your stake is your buy-in, the same size for every seat) ================= */
  const NAMES = ['You'].concat(G.BOTS.map(b => b.name));
  const pkView = (st, reveal) => {
    const L = st.toAct === 0 ? G.pokerLegal(st, 0) : null, show = i => i === 0 || (reveal && st.showdown && !st.folded[i]);
    return { names: NAMES, hole: st.hole.map((h, i) => show(i) ? h.slice() : [-1, -1]), board: st.board.slice(), stacks: st.stacks.slice(), bets: st.bets.slice(), folded: st.folded.slice(), allin: st.allin.slice(), dealer: st.dealer, toAct: st.toAct, pot: G.potTotal(st), street: st.street, over: st.over, showdown: st.showdown,
      legal: L, myTurn: st.toAct === 0 && !st.over, log: st.log.slice(-6), handNames: st.over && st.showdown ? st.result.names : {}, winners: st.over ? st.result.pots.map(p => p.winners) : [], bb: st.bb, stake: R ? R.stake : 0 };
  };
  async function pkEnd(st){ const res = await finish(r2(st.stacks[0] / 100), st.stacks[0] / 100 > R.stake ? 'You won chips' : st.stacks[0] / 100 === R.stake ? 'You got your buy-in back' : 'You lost chips'); return Object.assign({ ok: true, over: true, state: pkView(st, true) }, res); }
  const poker = {
    async start(bet){
      const b = await begin('poker', bet); if(!b.ok) return b;
      const cents = R.stake * 100, st = G.pokerNew(G.rng, { n: 4, stack: cents, sb: Math.max(1, Math.round(cents / 40)), bb: Math.max(2, Math.round(cents / 20)), dealer: G.rng(4) }); R.pk = st;
      return st.over ? pkEnd(st) : { ok: true, over: false, state: pkView(st) };
    },
    async act(type, to){                                                              // your move: fold | call (also check) | raise to `to` (dollars)
      if(!R || !R.pk || R.pk.over || busy) return no('No hand in progress.'); const st = R.pk;
      if(st.toAct !== 0) return no('It isn’t your turn.');
      if(!['fold', 'call', 'raise'].includes(type)) return no('Unknown action.');
      G.pokerAct(st, 0, type, Math.round((+to || 0) * 100));
      return st.over ? pkEnd(st) : { ok: true, over: false, state: pkView(st) };
    },
    async next(){                                                                     // one bot move (the app calls this on a timer so you can follow the action)
      if(!R || !R.pk || R.pk.over || busy) return no('No hand in progress.'); const st = R.pk;
      if(st.toAct === 0) return { ok: true, over: false, state: pkView(st), waiting: true };
      G.botAct(st, st.toAct, G.BOTS[st.toAct - 1], G.rng);
      return st.over ? pkEnd(st) : { ok: true, over: false, state: pkView(st), waiting: st.toAct === 0 };
    },
    async fastForward(){                                                              // after you fold: let the bots finish the hand
      if(!R || !R.pk || busy) return no('No hand in progress.'); const st = R.pk; let guard = 0;
      while(!st.over && st.toAct !== 0 && guard++ < 200) G.botAct(st, st.toAct, G.BOTS[st.toAct - 1], G.rng);
      return st.over ? pkEnd(st) : { ok: true, over: false, state: pkView(st) };
    },
    view: () => R && R.pk ? pkView(R.pk) : null
  };

  CS.games = { slots, blackjack, bus, poker };
  CS.round = () => R ? { game: R.game, stake: R.total } : null;
});
