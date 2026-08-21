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

const now = Date.now();
const targetTick = marketTickIndexForTime(now);

let checkpoint = null;
if (fs.existsSync(DATA_PATH)) {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (raw && raw.tickIndex !== undefined && raw.state) checkpoint = raw;
}

const { state, points, tickIndex } = marketSimulate(checkpoint, targetTick);

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
const newCheckpoint = { tickIndex, state: roundedState, t: now };
fs.writeFileSync(DATA_PATH, JSON.stringify(newCheckpoint, null, 2));

// Archive: one compact [price, t] entry per RUN (not per tick — full 250ms resolution is always
// regenerable client-side from the seed, so archiving every tick would just be wasted storage).
// One file per UTC day, only ever appended to, never rewritten.
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
const dayFile = path.join(HISTORY_DIR, new Date(now).toISOString().slice(0, 10) + '.json');
const existing = fs.existsSync(dayFile) ? JSON.parse(fs.readFileSync(dayFile, 'utf8')) : [];
existing.push([Math.round(state.price * 10000) / 10000, now]); // rounded — avoids storing noisy float tails
fs.writeFileSync(dayFile, JSON.stringify(existing));

console.log(`Checkpoint saved at tick ${tickIndex} (${points.length} tick(s) simulated since last run). Price: $${state.price.toFixed(4)}`);
