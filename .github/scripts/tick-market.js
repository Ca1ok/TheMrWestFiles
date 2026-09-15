// Writes the current market checkpoint to market-data.json, and appends a compact record to
// today's archive file. The actual PRICE MATH lives in market-model.js (shared with the
// browser) — this script's only job is to persist a checkpoint periodically so:
//   1. Browsers loading the page don't have to replay every tick since genesis (potentially
//      millions of them after a while) — just since the last checkpoint, which stays cheap
//      forever as long as this runs reasonably often.
//   2. There's a permanent historical record on GitHub, even though technically any client
//      could regenerate the exact same numbers from the seed alone.
// The live, moment-to-moment ticking itself happens entirely client-side (see app.js) — this
// script does NOT need to run every 250ms. It just needs to run often enough that no browser
// is ever forced into a huge catch-up replay.
const fs = require('fs');
const path = require('path');
const {
  marketTickIndexForTime, marketSimulate
} = require('../../market-model.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DATA_PATH = path.join(REPO_ROOT, 'market-data.json');
const HISTORY_DIR = path.join(REPO_ROOT, 'history');

// Same database this site's Firebase config already points at (see firebaseConfig in app.js) —
// hardcoded here rather than passed in as a secret because this is a plain, unauthenticated GET
// against a path that's world-readable in the Realtime Database rules (".read": true), same as
// the site's own "marketplace" path already is. No credential needed, nothing to leak.
const MARKET_ADJUSTMENTS_URL = 'https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app/marketAdjustments.json';

async function fetchAdjustments(){
  // Admin-triggered raise/drop actions live in Firebase (see the admin panel in settings.html)
  // rather than being committed to git directly — a browser can't safely push to GitHub itself
  // (that would mean shipping a repo-write token to every visitor), but it CAN write to Firebase,
  // gated by the same admin-email rule the rest of the site's admin actions already use. This
  // script is what bridges that gap: it's the one thing with `contents: write` permission on the
  // repo, so each run it picks up whatever's currently in Firebase and bakes it into the
  // committed checkpoint — after which the static file is authoritative again, no further
  // Firebase reads needed for anyone just replaying the seed.
  try{
    const res = await fetch(MARKET_ADJUSTMENTS_URL);
    if(!res.ok) return [];
    const raw = await res.json();
    if(!raw) return [];
    // stored as push-keyed entries (Firebase's usual pattern for a growing list written by
    // multiple independent actions) — flatten to the plain {tickIndex, delta}[] the model wants
    return Object.values(raw)
      .filter(a => a && typeof a.tickIndex === 'number' && typeof a.delta === 'number')
      .sort((a, b) => a.tickIndex - b.tickIndex);
  } catch(e){
    console.log('Could not fetch marketAdjustments from Firebase this run — using whatever was in the last checkpoint instead:', e.message);
    return null; // signals "fetch failed" distinctly from "fetched, and it's empty"
  }
}

(async () => {
  const now = Date.now();
  const targetTick = marketTickIndexForTime(now);

  let checkpoint = null;
  if (fs.existsSync(DATA_PATH)) {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    if (raw && raw.tickIndex !== undefined && raw.state) checkpoint = raw;
  }

  const fetched = await fetchAdjustments();
  // If the fetch genuinely failed (network hiccup), fall back to whatever adjustments list was
  // already baked into the last checkpoint rather than silently reverting to an empty list —
  // that would incorrectly "undo" a past adjustment's permanent effect on the base target for
  // this one run (it would self-correct next run once the fetch succeeds again, but there's no
  // reason to let a transient failure cause even a momentary wobble when we already have a
  // perfectly good last-known list sitting right there).
  const adjustments = fetched !== null ? fetched : ((checkpoint && checkpoint.adjustments) || []);

  const { state, points, tickIndex } = marketSimulate(checkpoint, targetTick, adjustments);

  // round for a clean, compact file — safe to do because every future resume (by any client,
  // or the next Action run) starts FROM this stored value anyway, so everyone still agrees with
  // each other going forward; it just means "everyone agrees" from here, not "matches an
  // idealized unrounded continuous simulation," which nobody can observe or care about anyway
  const roundedState = {
    fairValue: Math.round(state.fairValue * 10000) / 10000,
    momentum: Math.round(state.momentum * 1000000) / 1000000,
    vol: Math.round(state.vol * 1000000) / 1000000,
    price: Math.round(state.price * 10000) / 10000
  };
  // adjustments is small (a handful of entries even after years of occasional admin actions) and
  // stored here in full each time — negligible size, and it's what lets a BRAND NEW page load
  // (before it's even had a chance to attach its own live Firebase listener) still compute the
  // correct, already-adjusted price straight from this one static file.
  const newCheckpoint = { tickIndex, state: roundedState, t: now, adjustments };
  fs.writeFileSync(DATA_PATH, JSON.stringify(newCheckpoint, null, 2));

  // Archive: one compact [price, t] entry per RUN (not per tick — full 250ms resolution is always
  // regenerable client-side from the seed, so archiving every tick would just be wasted storage).
  // One file per UTC day, only ever appended to, never rewritten.
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const dayFile = path.join(HISTORY_DIR, new Date(now).toISOString().slice(0, 10) + '.json');
  const existing = fs.existsSync(dayFile) ? JSON.parse(fs.readFileSync(dayFile, 'utf8')) : [];
  existing.push([Math.round(state.price * 10000) / 10000, now]); // rounded — avoids storing noisy float tails
  fs.writeFileSync(dayFile, JSON.stringify(existing));

  console.log(`Checkpoint saved at tick ${tickIndex} (${points.length} tick(s) simulated since last run, ${adjustments.length} total adjustment(s) applied). Price: $${state.price.toFixed(4)}`);
})();
