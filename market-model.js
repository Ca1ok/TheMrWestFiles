// Deterministic MrWestCoin market model (v2) — loaded by BOTH the browser (every page, before
// app.js) and the GitHub Action (tick-market.js, via require()). Every machine given the same
// tick index independently computes the identical price from the fixed seed, so nobody ever
// needs to ask anybody else "what's the price right now."
//
// HOW THE PRICE IS BUILT (this is the part that makes admin spikes/drops sync perfectly):
//
//   displayed price(tick) = simulated noise(tick)  x  trend level(tick)
//
//   1. simulated noise  — a seeded, mean-reverting process centred on 1.0 (a slow wander, fast
//                         tiny jitter, and rare spikes that fade over a few minutes). It depends
//                         ONLY on the seed and the tick index. Admin actions can never change it,
//                         so a stored checkpoint of it is valid forever.
//   2. trend level      — a pure function: base value + $1/real day + every admin adjustment
//                         (see marketLevelAtTick). Because it is a pure function of the tick and
//                         the (append-only) adjustment list, a browser that learns about an admin
//                         action late simply recomputes — it lands on the exact same price, and
//                         the jump appears at the exact same moment in everyone's chart.
//
// The OLD model baked admin jumps into the simulation's own state, which made the result depend
// on WHEN each browser heard about them (different prices per tab, double-applied jumps in the
// admin's own tab, jumps that only "drifted in" for everyone else). This design removes that
// whole class of bug.

const MARKET_MODEL_VERSION = 2;
const MARKET_SEED = 20260821;             // change this only if you want a brand new market history
const MARKET_GENESIS_T = 1787270400000;   // fixed epoch ms = tick 0 (2026-08-21T00:00:00Z)
const MARKET_TICK_MS = 250;               // one simulated tick every 250ms
const MARKET_CALLS_PER_TICK = 5;          // ALWAYS exactly 5 random draws per tick, whatever the branch —
                                          // that fixed count is what makes the RNG seekable in O(1)
const MARKET_BASE_VALUE = 12.50;          // trend level at genesis
const MARKET_TICKS_PER_DAY = 86400000 / MARKET_TICK_MS; // 345600
const MARKET_DAILY_DRIFT = 1.00;          // dollars the trend level rises per real day
const MARKET_MIN_PRICE = 0.01;
const MARKET_GENESIS_STATE = { fairValue: 1, momentum: 0, vol: 0.0014, spike: 0, price: 1 };

// --- noise process tuning (all in "fraction of the trend level" units) ---
const MARKET_FV_THETA = 4.0e-6;   // pull of the slow wander back to 1.0 (half-life ~12 hours)
const MARKET_FV_SIGMA = 2.8e-4;   // per-tick push of the slow wander (~±10% typical swing, hours long)
const MARKET_NOISE_KEEP = 0.92;   // how long the fast jitter lingers tick to tick
const MARKET_SPIKE_CHANCE = 1.5e-5; // per tick -> roughly 5 spikes a day
const MARKET_SPIKE_DECAY = 0.9990;  // per tick -> a spike fades with a ~3 minute half-life
const SQRT12 = 3.4641016151377544;  // turns a uniform(-0.5,0.5) draw into unit variance

function marketTickIndexForTime(t){
  return Math.max(0, Math.floor((t - MARKET_GENESIS_T) / MARKET_TICK_MS));
}
function marketTimeForTickIndex(i){
  return MARKET_GENESIS_T + i * MARKET_TICK_MS;
}

// Trend level at a tick: base + steady $/day climb + every admin adjustment in effect.
//
// `adjustments` is the small, append-only list of admin actions: {tickIndex, delta, fadeSec?}.
//   fadeSec absent/0  -> a permanent SHIFT: the level steps by `delta` at tickIndex and stays.
//   fadeSec > 0       -> a SPIKE/DIP: the level steps by `delta` at tickIndex, then the effect
//                        dies away smoothly (about 95% gone after fadeSec seconds).
// The noise process is multiplied by this level, so after a big jump the swings scale with the
// new price exactly like a real stock's would.
function marketLevelAtTick(tickIndex, adjustments){
  let level = MARKET_BASE_VALUE + (tickIndex / MARKET_TICKS_PER_DAY) * MARKET_DAILY_DRIFT;
  if(adjustments){
    for(let k = 0; k < adjustments.length; k++){
      const a = adjustments[k];
      if(a.tickIndex > tickIndex) continue;
      if(a.fadeSec > 0){
        const fadeTicks = (a.fadeSec * 1000) / MARKET_TICK_MS;
        level += a.delta * Math.exp(-3 * (tickIndex - a.tickIndex) / fadeTicks);
      } else {
        level += a.delta;
      }
    }
  }
  return level;
}

// What every player actually sees and trades at. Rounded to 4 decimals so two engines that
// differ in the last floating-point bit of Math.exp still agree on the exact same number.
function marketDisplayPrice(norm, tickIndex, adjustments){
  const p = norm * marketLevelAtTick(tickIndex, adjustments);
  return Math.round(Math.max(MARKET_MIN_PRICE, p) * 10000) / 10000;
}

// mulberry32, but seekable: rather than calling next() n times to reach the n-th draw, compute
// what the internal state WOULD be after n calls directly (it's linear addition mod 2^32).
function marketRngFromCallCount(callsAlreadyMade){
  // Math.imul does correct mod-2^32 multiplication — plain `*` silently loses precision once
  // callsAlreadyMade gets into the thousands.
  let s = (MARKET_SEED + Math.imul(callsAlreadyMade, 0x6D2B79F5)) | 0;
  return function(){
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Advances the NORMALISED noise state by one tick and returns the new normalised price.
// Exactly 5 rng() calls per tick, always (see MARKET_CALLS_PER_TICK). Only + - * / and clamps
// are used, which every JavaScript engine computes bit-identically.
//   fairValue : slow wander around 1.0 (hours-long swings)
//   vol       : how jumpy the fast jitter currently is (volatility clustering)
//   momentum  : the fast jitter itself (a short-memory AR(1) term)
//   spike     : fading news-style shock (rare, 4–15%, ~3 minute half-life)
function marketAdvanceOneTick(state, rng){
  const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
  state.fairValue += MARKET_FV_THETA * (1 - state.fairValue) + (r1 - 0.5) * SQRT12 * MARKET_FV_SIGMA;
  if(state.fairValue < 0.5) state.fairValue = 0.5;
  state.vol = Math.min(0.004, Math.max(0.0003, state.vol * 0.99 + 0.01 * (0.0002 + 0.0035 * r2 * r2)));
  state.momentum = state.momentum * MARKET_NOISE_KEEP + (r3 - 0.5) * SQRT12 * state.vol;
  state.spike *= MARKET_SPIKE_DECAY;
  if(r4 < MARKET_SPIKE_CHANCE){
    const mag = 0.04 + 0.11 * Math.abs(2 * r5 - 1);
    state.spike += (r5 < 0.5 ? -mag : mag);
  }
  state.price = Math.max(0.05, state.fairValue * (1 + state.spike) * (1 + state.momentum));
  return state.price;
}

// Simulates every tick from (checkpoint.tickIndex + 1) up to targetTickIndex (inclusive),
// starting from checkpoint.state (or the fixed genesis state if there's no checkpoint).
// Streams each tick to onTick(tickIndex, normalisedPrice) instead of building a giant array.
// maxTicks keeps one call bounded (callers loop until they reach the target they want).
function marketSimulate(checkpoint, targetTickIndex, onTick, maxTicks){
  const fromTick = checkpoint ? checkpoint.tickIndex : -1;
  const limit = Math.min(targetTickIndex, fromTick + (maxTicks || 2000000));
  const state = checkpoint
    ? { fairValue: checkpoint.state.fairValue, momentum: checkpoint.state.momentum, vol: checkpoint.state.vol,
        spike: checkpoint.state.spike || 0, price: checkpoint.state.price }
    : { ...MARKET_GENESIS_STATE };
  const rng = marketRngFromCallCount((fromTick + 1) * MARKET_CALLS_PER_TICK);
  for(let i = fromTick + 1; i <= limit; i++){
    const p = marketAdvanceOneTick(state, rng);
    if(onTick) onTick(i, p);
  }
  return { state, tickIndex: Math.max(fromTick, limit) };
}

// --- candles ------------------------------------------------------------------------------
// A candle summarises a fixed bucket of ticks as [open, x1, x2, close], where x1/x2 are the
// bucket's high and low IN THE ORDER THEY HAPPENED. Storing the extremes (not just the close)
// is what keeps spikes visible when you zoom out to days or weeks. Values are NORMALISED noise;
// whoever draws them multiplies by the trend level, so stored history never goes stale when an
// admin adds an adjustment.
function marketCandleBuilder(resTicks, onCandle){
  let bucket = -1, o = 0, c = 0, hi = 0, lo = 0, hiTick = 0, loTick = 0;
  const r4 = v => Math.round(v * 10000) / 10000;
  function flush(){
    if(bucket < 0) return;
    const pair = hiTick <= loTick ? [hi, lo] : [lo, hi];
    onCandle(bucket, [r4(o), r4(pair[0]), r4(pair[1]), r4(c)]);
    bucket = -1;
  }
  return {
    push(tick, v){
      const b = Math.floor(tick / resTicks);
      if(b !== bucket){ flush(); bucket = b; o = v; hi = v; lo = v; hiTick = tick; loTick = tick; }
      else {
        if(v > hi){ hi = v; hiTick = tick; }
        if(v < lo){ lo = v; loTick = tick; }
      }
      c = v;
    },
    flush
  };
}

// Where the four samples of a candle sit in time (open, first extreme, second extreme, close).
function marketCandleTicks(bucket, resTicks){
  const t0 = bucket * resTicks;
  return [t0, t0 + Math.floor(resTicks / 3), t0 + Math.floor(2 * resTicks / 3), t0 + resTicks - 1];
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    MARKET_MODEL_VERSION, MARKET_SEED, MARKET_GENESIS_T, MARKET_TICK_MS, MARKET_CALLS_PER_TICK,
    MARKET_GENESIS_STATE, MARKET_BASE_VALUE, MARKET_TICKS_PER_DAY, MARKET_DAILY_DRIFT, MARKET_MIN_PRICE,
    marketTickIndexForTime, marketTimeForTickIndex, marketLevelAtTick, marketDisplayPrice,
    marketRngFromCallCount, marketAdvanceOneTick, marketSimulate,
    marketCandleBuilder, marketCandleTicks
  };
}
