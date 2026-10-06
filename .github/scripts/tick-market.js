// MrWestCoin checkpoint writer. Runs on a schedule (GitHub Actions) and does three jobs:
//
//   1. market-data.json    — a CHECKPOINT of the seeded noise process, so a browser loading the
//                            page only replays the last few minutes/hours instead of every tick
//                            since genesis. Always aligned to a 5-minute boundary so it joins
//                            the candle history below with no gap.
//   2. history/recent.json — 5-minute candles for the last 48 hours  (about 17 KB, + the end-state)
//      history/hourly.json — 1-hour candles for all time              (about 32 KB, ~0.8 KB/day)
//                            Candles keep each bucket's open, high, low and close, so spikes stay
//                            visible no matter how far you zoom out. They hold the NORMALISED
//                            noise only — the browser multiplies by the trend level (base + $1/day
//                            + admin adjustments), so these files NEVER go stale when an admin
//                            raises or drops the price.
//   3. admin adjustments   — an append-only ledger copied from Firebase into market-data.json, so
//                            a brand-new page load has them even before Firebase connects.
//
// The price math itself lives in market-model.js (shared with the browser). GitHub's cron is
// best-effort (runs can be minutes-to-hours apart) — that is fine: the simulation is deterministic,
// so a late run just simulates the longer gap and produces exactly the same numbers.
const fs = require('fs');
const path = require('path');
const M = require('../../market-model.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DATA_PATH = path.join(REPO_ROOT, 'market-data.json');
const HISTORY_DIR = path.join(REPO_ROOT, 'history');
const RECENT_PATH = path.join(HISTORY_DIR, 'recent.json');
const HOURLY_PATH = path.join(HISTORY_DIR, 'hourly.json');

const RES_5M = 1200;                 // ticks in 5 minutes (250ms ticks)
const RES_1H = 14400;                // ticks in 1 hour
const FIVE_PER_HOUR = RES_1H / RES_5M; // 12
const RECENT_BUCKETS = 576;          // 48 hours of 5-minute candles
const DAY_BUCKETS = 288;             // 5-minute candles in 24 hours

// Plain unauthenticated GET — the path is world-readable in the Realtime Database rules, same as
// the site's own client reads. No credential involved, nothing to leak.
const MARKET_ADJUSTMENTS_URL = 'https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app/marketAdjustments.json';

function cleanAdjustment(id, a){
  if(!a || typeof a.tickIndex !== 'number' || typeof a.delta !== 'number') return null;
  if(!isFinite(a.tickIndex) || !isFinite(a.delta) || a.tickIndex < 0 || Math.abs(a.delta) > 1e7) return null;
  const out = { tickIndex: Math.floor(a.tickIndex), delta: a.delta, at: typeof a.at === 'number' ? a.at : 0 };
  if(id) out.id = id;
  if(typeof a.fadeSec === 'number' && a.fadeSec > 0 && a.fadeSec <= 30 * 86400) out.fadeSec = a.fadeSec;
  return out;
}
function adjKey(a){ return a.id || (a.tickIndex + ':' + a.delta + ':' + a.at); }

async function fetchAdjustments(){
  try{
    const res = await fetch(MARKET_ADJUSTMENTS_URL);
    if(!res.ok) return null;
    const raw = await res.json();
    if(!raw) return [];
    return Object.entries(raw).map(([id, a]) => cleanAdjustment(id, a)).filter(Boolean);
  } catch(e){
    console.log('Could not fetch marketAdjustments from Firebase this run — keeping the list from the last checkpoint:', e.message);
    return null; // "fetch failed", distinct from "fetched, and it's empty"
  }
}

// The ledger is APPEND-ONLY: whatever the last checkpoint knew is kept, and anything new from
// Firebase is added. A transient fetch failure (or an entry that vanished) can never silently
// change history.
function mergeAdjustments(previous, fetched){
  const map = new Map();
  (previous || []).forEach(a => { const c = cleanAdjustment(a.id, a); if(c) map.set(adjKey(c), c); });
  (fetched || []).forEach(a => {
    // a legacy entry (no id) may now arrive WITH its Firebase id — upgrade it instead of duplicating
    const legacyKey = a.tickIndex + ':' + a.delta + ':' + a.at;
    if(map.has(legacyKey)) map.delete(legacyKey);
    map.set(adjKey(a), a);
  });
  return Array.from(map.values()).sort((a, b) => a.tickIndex - b.tickIndex || a.at - b.at);
}

function readJson(p){
  try{ return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch(e){ return null; }
}

// Builds one hourly candle out of the twelve 5-minute candles that make it up. Each 5-minute
// candle contributes its four samples in time order, so the hour's high/low and which came first
// are exact to within the 5-minute candles' own resolution.
function hourlyFromFiveMinute(twelve){
  const seq = [];
  twelve.forEach(c => { seq.push(c[0], c[1], c[2], c[3]); });
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
  seq.forEach((v, i) => { if(v > hi){ hi = v; hiI = i; } if(v < lo){ lo = v; loI = i; } });
  const pair = hiI <= loI ? [hi, lo] : [lo, hi];
  return [seq[0], pair[0], pair[1], seq[seq.length - 1]];
}

(async () => {
  const now = process.env.MARKET_NOW_MS ? Number(process.env.MARKET_NOW_MS) : Date.now(); // override is for testing only
  const targetTick = M.marketTickIndexForTime(now);
  // last tick of the last COMPLETE 5-minute bucket — the checkpoint always lands exactly here
  const alignedTarget = Math.floor((targetTick + 1) / RES_5M) * RES_5M - 1;

  let cp = readJson(DATA_PATH);
  let recent = readJson(RECENT_PATH);
  let hourly = readJson(HOURLY_PATH);

  const cpValid = cp && cp.model === M.MARKET_MODEL_VERSION && cp.state && typeof cp.tickIndex === 'number' && (cp.tickIndex + 1) % RES_5M === 0;
  const endBucket5 = cpValid ? (cp.tickIndex + 1) / RES_5M : 0;
  const recentValid = cpValid && recent && Array.isArray(recent.c) && recent.b0 + recent.c.length === endBucket5;
  const hourlyValid = cpValid && hourly && Array.isArray(hourly.c) && hourly.b0 === 0 && hourly.c.length <= Math.floor(endBucket5 / FIVE_PER_HOUR);
  const rebuild = !(cpValid && recentValid && hourlyValid);
  if(rebuild){
    console.log('No usable v' + M.MARKET_MODEL_VERSION + ' checkpoint/history on disk — rebuilding everything deterministically from genesis.');
    cp = null; recent = { res: RES_5M, b0: 0, c: [] }; hourly = { res: RES_1H, b0: 0, c: [] };
  }

  const fetched = await fetchAdjustments();
  const adjustments = mergeAdjustments(cp ? cp.adjustments : (readJson(DATA_PATH) || {}).adjustments, fetched);

  // --- simulate everything since the checkpoint, up to the last complete 5-minute bucket ---
  let state = cp ? cp.state : null;
  let tickIndex = cp ? cp.tickIndex : -1;
  const newFive = [];
  if(alignedTarget > tickIndex){
    const builder = M.marketCandleBuilder(RES_5M, (b, candle) => newFive.push(candle));
    let from = cp ? { tickIndex: cp.tickIndex, state: cp.state } : null;
    let simulated = 0;
    while((from ? from.tickIndex : -1) < alignedTarget){
      const r = M.marketSimulate(from, alignedTarget, (i, p) => builder.push(i, p), 2000000);
      from = { tickIndex: r.tickIndex, state: r.state };
      simulated = r.tickIndex;
    }
    builder.flush(); // alignedTarget is a bucket's last tick, so the final bucket is complete
    state = from.state; tickIndex = from.tickIndex;
    console.log('Simulated up to tick ' + tickIndex + ' (' + newFive.length + ' new 5-minute candle(s)).');
  } else {
    console.log('Already at the latest complete 5-minute boundary — nothing to simulate.');
  }

  // --- 5-minute candles: append, then keep only the last 48 hours ---
  const combinedStart = recent.b0;
  const combined = recent.c.concat(newFive);
  const combinedEnd = combinedStart + combined.length; // exclusive bucket index

  // --- hourly candles: build every newly COMPLETED hour from its twelve 5-minute candles ---
  for(let h = hourly.c.length; (h + 1) * FIVE_PER_HOUR <= combinedEnd; h++){
    const from5 = h * FIVE_PER_HOUR - combinedStart;
    if(from5 < 0){ throw new Error('Hour ' + h + ' predates the 5-minute window — history is not contiguous; delete history/*.json and market-data.json to rebuild.'); }
    hourly.c.push(hourlyFromFiveMinute(combined.slice(from5, from5 + FIVE_PER_HOUR)));
  }

  const keepFrom = Math.max(0, combined.length - RECENT_BUCKETS);
  // `end` + `state` make this file self-contained: the browser restarts its live simulation from
  // exactly where these candles stop, so the chart is contiguous with no seam.
  const newRecent = { res: RES_5M, b0: combinedStart + keepFrom, end: tickIndex, state: state, c: combined.slice(keepFrom) };

  // price ~24 hours before the checkpoint (normalised; the browser applies the level) — lets a
  // page WITHOUT the chart show a real "24h change" without downloading any history
  let dayAgo = { tickIndex: 0, n: 1 };
  const agoBucket = combinedEnd - DAY_BUCKETS;
  if(agoBucket >= combinedStart && agoBucket - combinedStart < combined.length){
    dayAgo = { tickIndex: agoBucket * RES_5M, n: combined[agoBucket - combinedStart][0] };
  }

  // --- write only what actually changed, so an idle run makes no commit ---
  const lastAdjKey = adjustments.filter(a => a.id).map(a => a.id).sort().pop() || null;
  const newCp = { model: M.MARKET_MODEL_VERSION, tickIndex, state, t: now, adjustments, lastAdjKey, dayAgo };
  const prevCp = readJson(DATA_PATH);
  const sameCore = prevCp && prevCp.model === newCp.model && prevCp.tickIndex === newCp.tickIndex &&
    JSON.stringify(prevCp.adjustments) === JSON.stringify(newCp.adjustments);
  if(!sameCore || rebuild){
    if(!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(newCp, null, 2));
    fs.writeFileSync(RECENT_PATH, JSON.stringify(newRecent));
    fs.writeFileSync(HOURLY_PATH, JSON.stringify(hourly));
    console.log('Checkpoint saved at tick ' + tickIndex + '. ' + hourly.c.length + ' hourly + ' + newRecent.c.length + ' five-minute candles, ' + adjustments.length + ' admin adjustment(s) on the ledger.');
  } else {
    console.log('Nothing changed this run.');
  }
})();
