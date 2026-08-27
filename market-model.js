// Deterministic MrWestCoin market model — loaded by BOTH the browser (every page, before
// app.js) and the GitHub Action (tick-market.js, via require()). Because both sides run this
// exact same code against the exact same fixed seed, any two machines given the same tick
// index independently compute the identical price — nobody needs to sync live with anybody
// else for the market to agree. That's what makes it "predetermined."

const MARKET_SEED = 20260821;             // change this only if you want a brand new market history
const MARKET_GENESIS_T = 1787270400000;   // fixed epoch ms = tick 0 (2026-08-21T00:00:00Z) — kept
                                           // recent on purpose: at 250ms/tick, a genesis a year in
                                           // the past would mean ~126 MILLION ticks to catch up to
                                           // "now" on the very first run
const MARKET_TICK_MS = 250;               // one simulated tick every 250ms — sub-second, "near real time"
const MARKET_CALLS_PER_TICK = 5;          // ALWAYS exactly 5 random draws per tick (fairValue,
                                           // volShock, shock, spikeRoll, spikeMag) — even on
                                           // branches that don't end up using all of them. This
                                           // fixed count is what makes the RNG seekable in O(1).
const MARKET_BASE_VALUE = 12.50;          // fairValue reverts toward this — see note below
const MARKET_DRIFT_PER_TICK = 1.000000008; // slight upward trend — see marketBaseValueAtTick()
const MARKET_GENESIS_STATE = { fairValue: 12.50, momentum: 0, vol: 0.012, price: 12.50 };

function marketTickIndexForTime(t){
  return Math.max(0, Math.floor((t - MARKET_GENESIS_T) / MARKET_TICK_MS));
}
function marketTimeForTickIndex(i){
  return MARKET_GENESIS_T + i * MARKET_TICK_MS;
}

// A slight upward trend, but still a pure function of tick index — not real accumulated
// randomness, and not anything fetched from a server. Every client (and the GitHub Action's
// periodic checkpoint) computes the exact same base value for the exact same tick, so the trend
// stays perfectly seed-synced without anyone needing to agree on it live. At 250ms/tick this
// compounds to roughly +0.3%/day — noticeable over weeks, not a moon mission by lunchtime.
function marketBaseValueAtTick(tickIndex){
  return MARKET_BASE_VALUE * Math.pow(MARKET_DRIFT_PER_TICK, tickIndex);
}

// mulberry32, but seekable: rather than always starting from MARKET_SEED and calling next()
// n times to reach the n-th draw, we compute what the internal state WOULD be after n calls
// directly (it's just linear addition mod 2^32) and start there. That turns "replay from the
// beginning of time" into "jump straight to now."
function marketRngFromCallCount(callsAlreadyMade){
  // Math.imul does correct mod-2^32 wraparound multiplication — a plain `*` here silently loses
  // precision once callsAlreadyMade gets into the thousands, since JS multiplication happens in
  // double-precision float before the `|0` truncation, which is too late to recover the lost bits.
  let s = (MARKET_SEED + Math.imul(callsAlreadyMade, 0x6D2B79F5)) | 0;
  return function(){
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function marketAdvanceOneTick(state, rng, tickIndex){
  // fairValue reverts toward a (slightly, deterministically drifting) base instead of doing an
  // unanchored multiplicative random walk. This matters a lot more here than it did in the old
  // 12-second-tick version: at 250ms/tick this model gets replayed for hundreds of millions of
  // ticks over the site's lifetime, and an unanchored random walk is mathematically guaranteed
  // to drift to an extreme (near-zero or huge) over that many compounding steps — it's not a
  // "might happen" edge case, it's certain given enough ticks. Reverting toward a (slowly
  // rising) base keeps the whole system statistically stationary around a moving target,
  // instead of either flatlining forever or blowing up.
  const base = marketBaseValueAtTick(tickIndex);
  state.fairValue += (base - state.fairValue) * 0.0004 + (rng() - 0.5) * 0.02;
  state.fairValue = Math.max(0.5, state.fairValue);
  const volShock = Math.abs(rng() - 0.5) * 0.03;
  state.vol = Math.min(0.06, Math.max(0.004, state.vol * 0.85 + volShock * 0.15));
  const shock = (rng() - 0.5) * 2 * state.vol;
  state.momentum = state.momentum * 0.55 + shock * 0.45;
  const reversion = (state.fairValue - state.price) / state.price * 0.03;
  // both spike draws happen unconditionally, every tick, regardless of the outcome — that's
  // what keeps the call count fixed at exactly 5 and therefore keeps the RNG seekable
  const spikeRoll = rng();
  const spikeMag = rng();
  const spike = spikeRoll < 0.03 ? (spikeMag - 0.5) * 0.12 : 0;
  state.price = Math.max(0.01, state.price * (1 + state.momentum + reversion + spike));
  return state.price;
}

// Simulates every tick from (checkpoint.tickIndex + 1) through targetTickIndex inclusive,
// starting from checkpoint.state (or the fixed genesis state if there's no checkpoint yet).
// Returns the resulting state plus every {price, t} point generated along the way. Safety-capped
// so an extremely stale checkpoint (e.g. the Action was paused for days) can't make a single
// call take an unreasonable amount of time — the price just catches up in the next call instead.
const MARKET_MAX_TICKS_PER_CALL = 2000000; // ~140 hours' worth at 250ms/tick — generous, still fast

function marketSimulate(checkpoint, targetTickIndex){
  const fromTick = checkpoint ? checkpoint.tickIndex : -1;
  const cappedTarget = Math.min(targetTickIndex, fromTick + MARKET_MAX_TICKS_PER_CALL);
  const state = checkpoint ? { ...checkpoint.state } : { ...MARKET_GENESIS_STATE };
  const startCall = (fromTick + 1) * MARKET_CALLS_PER_TICK;
  const rng = marketRngFromCallCount(startCall);
  const points = [];
  for(let i = fromTick + 1; i <= cappedTarget; i++){
    const price = marketAdvanceOneTick(state, rng, i);
    points.push({ price: Math.round(price * 10000) / 10000, t: marketTimeForTickIndex(i) });
  }
  return { state, points, tickIndex: cappedTarget, rng, nextTickIndex: cappedTarget + 1 };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    MARKET_SEED, MARKET_GENESIS_T, MARKET_TICK_MS, MARKET_CALLS_PER_TICK, MARKET_GENESIS_STATE,
    marketTickIndexForTime, marketTimeForTickIndex, marketRngFromCallCount, marketAdvanceOneTick, marketSimulate
  };
}
