/* KERNEL · minigames — points-based payouts, saved high scores and the mini-game leaderboard.
 * Kept in its own file (loaded right after api.js) and attached to the facade here, so api.js stays untouched.
 *   OS.games.submit(id, points)  → decides the payout from POINTS (os/lib/game-scoring.js), records a personal best, queues a leaderboard publish
 *   OS.games.info()/scoring(id)/estimate(id, pts)   → daily bar, personal bests, "what would this score pay?"
 *   OS.gameBoards.list(id, n)    → top n for one game (or id 'all' = sum of every personal best), cached 30 s
 * Personal bests live in K.S.games.hi (saved with the account, survive the daily reset). The public board is gameScores/<game>/<uid>
 * (create/raise-only, see database.rules.json); the score is computed on the player's device, like every other minigame result, so it is
 * clamped per game here AND bounded by the rules. Guests keep scores in memory only, exactly like the rest of their progress. */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG, GS = GameScoring, C = K.cloud, D = K.diag || { error(){}, warn(){}, info(){} };
  const r2 = K.round2, no = (msg, extra) => Object.assign({ ok: false, paid: false, msg }, extra);
  const maxBase = () => (CFG.game && CFG.game.maxBase) || GS.DEFAULT_MAX_BASE;
  const hiMap = () => { const g = K.gameDay(); if(!g.hi || typeof g.hi !== 'object') g.hi = {}; return g.hi; };
  const total = () => { const hi = hiMap(); return Object.keys(hi).reduce((s, k) => s + (hi[k].s || 0), 0); };

  /* what a score would pay right now (the same factors K.award applies) — used for the "this score pays about …" hint */
  function estimate(id, pts){
    if(!GS.has(id)) return { base: 0, amount: 0 };
    const g = K.gameDay(), plays = (g.plays[id] || 0) + 1, ec = K.econ(), dim = Math.max(0.15, 1 - (plays - 1) * 0.12), soft = g.earned >= CFG.game.dailySoftcap * ec ? 0.25 : 1;
    const base = GS.baseFor(id, pts, maxBase());
    return { base, amount: r2(base * dim * soft * K.collectionBonus() * ec) };
  }

  /* ---- submit a finished run ---- */
  function submit(id, raw){
    id = String(id || '').slice(0, 30);
    if(!GS.has(id)) return no('This game has no score table.');
    { const m = K.maint.appMsg('Games'); if(m) return no(m); }
    const t = GS.TABLE[id], pts = GS.clampPoints(id, raw), hi = hiMap(), prev = hi[id] ? hi[id].s : 0;
    if(pts < t.min || pts <= 0) return no('You need at least ' + t.min + ' points to earn.', { points: pts, min: t.min, par: t.par, best: { s: prev, prev, isNew: false } });
    const base = GS.baseFor(id, pts, maxBase()), r = K.award(id, base), isNew = pts > prev;
    if(isNew){ hi[id] = { s: pts, t: K.now(), p: hi[id] ? hi[id].p || 0 : 0 }; K.touch('games'); schedulePublish(id); }
    return { ok: true, paid: true, points: pts, min: t.min, par: t.par, base, amount: r.amount, bonus: r.bonus, drop: r.drop, earnedToday: r.earnedToday, softcap: r.softcap, capped: base >= maxBase() - 0.005, best: { s: isNew ? pts : prev, prev, isNew }, total: total() };
  }

  /* ---- publish personal bests to the public board (raise-only; needs a signed-in account with a display name) ---- */
  const pending = new Set(); let pubT = null, pubBusy = false;
  function schedulePublish(id){ if(id) pending.add(id); clearTimeout(pubT); pubT = setTimeout(flushPublish, 2500); }
  const ready = () => C.signedIn() && K.loaded && C.db && K.S.meta.name && !K.sessionLost && typeof firebase !== 'undefined';
  async function putScore(id, node){
    const ref = C.db.ref('gameScores/' + id + '/' + C.user.uid);
    try{ await ref.set(node); return true; }
    catch(e){
      if(e && /permission/i.test((e.code || '') + ' ' + (e.message || ''))){                               // the server may already hold an equal/higher score (e.g. an older device): then there is nothing to publish
        try{ const s = await ref.once('value'), v = s.val(); if(v && +v.s >= node.s) return true; }catch(_){}
      }
      D.error('minigames.publish', e, { game: id, score: node.s }); return false;
    }
  }
  async function flushPublish(){
    if(pubBusy){ schedulePublish(); return; } if(!ready()) return; pubBusy = true;
    try{
      const ids = [...pending]; pending.clear(); let changed = false; const TS = firebase.database.ServerValue.TIMESTAMP;
      for(const id of ids){ const h = hiMap()[id]; if(!h || h.s <= (h.p || 0)) continue; if(await putScore(id, { n: K.S.meta.name, s: h.s, t: TS })){ h.p = h.s; changed = true; BC.clear(); } else pending.add(id); }
      const tot = total(), g = K.gameDay();
      if(tot > 0 && tot > (g.pAll || 0)){ if(await putScore('all', { n: K.S.meta.name, s: tot, t: TS, c: Object.keys(hiMap()).length })){ g.pAll = tot; changed = true; BC.clear(); } }
      if(changed) K.touch('games');
    }catch(e){ D.error('minigames.flushPublish', e); }
    finally{ pubBusy = false; if(pending.size) { clearTimeout(pubT); pubT = setTimeout(flushPublish, 30000); } }
  }
  /* after sign-in / after picking a name: publish every best that the board hasn't seen yet */
  function publishAll(){ const hi = hiMap(); Object.keys(hi).forEach(id => { if(hi[id].s > (hi[id].p || 0)) pending.add(id); }); if(total() > (K.S.games.pAll || 0)) pending.add('all'); if(pending.size) schedulePublish(); }
  K.on('loaded', () => setTimeout(publishAll, 1500));
  { const setName = C.setName; C.setName = async function(){ const r = await setName.apply(this, arguments); publishAll(); return r; }; }

  /* ---- reading the boards ---- */
  const BC = new Map();
  async function list(id, n){
    id = String(id || 'all'); if(id !== 'all' && !GS.has(id)) return []; n = Math.max(5, Math.min(50, n || 25)); const key = id + ':' + n, hit = BC.get(key);
    if(hit && Date.now() - hit.at < 30000) return hit.rows; if(!C.db) return [];
    try{
      if(ready()) await flushPublish();                                                                         // your own latest best shows up even if it was only queued a moment ago
      const s = await C.db.ref('gameScores/' + id).orderByChild('s').limitToLast(n).once('value'), rows = [];
      s.forEach(c => { const v = c.val(); if(v && typeof v.s === 'number') rows.push({ uid: c.key, n: String(v.n || 'Player').slice(0, 20), s: v.s, t: +v.t || 0, c: +v.c || 0 }); });
      rows.sort((a, b) => b.s - a.s); BC.set(key, { at: Date.now(), rows }); return rows;
    }catch(e){ D.error('minigames.list', e, { game: id }); throw e; }
  }
  const mine = () => { const hi = hiMap(), out = { all: total() }; Object.keys(hi).forEach(id => { out[id] = hi[id].s; }); return out; };

  /* ---- facade ---- */
  const base = K.facade.games;
  K.facade.games = Object.assign({}, base, {
    submit, estimate, scoring: id => GS.info(id), ids: () => GS.list(),
    info(){ const g = K.gameDay(), hi = hiMap(), best = {}; Object.keys(hi).forEach(id => { best[id] = hi[id].s; }); return { earned: g.earned, softcap: Math.round(CFG.game.dailySoftcap * K.econ()), plays: Object.assign({}, g.plays), bonus: K.collectionBonus(), best, total: total(), maxBase: maxBase() }; }
  });
  K.facade.gameBoards = { list, mine, refresh: () => BC.clear(), publishNow: publishAll };
  K.minigames = { submit, publishAll };
});
