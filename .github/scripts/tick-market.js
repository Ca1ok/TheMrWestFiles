// Advances the MrWestCoin market simulation and writes the result back to market-data.json.
// Run on a schedule by .github/workflows/update-market.yml — this IS the "algorithm" updating
// the price. There are two outputs, kept deliberately separate:
//   market-data.json      — small "hot" file every visitor polls. Holds current price plus a
//                            bounded rolling window (recent history only), so it never grows.
//   history/YYYY-MM-DD.json — the permanent, full-resolution archive. One file per UTC day,
//                            only ever appended to (never rewritten), and only touched on days
//                            it actually changes — so old days sit untouched in git forever.
//                            Stored as compact [price, t] pairs instead of {price, t} objects
//                            to roughly halve the size on disk.
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DATA_PATH = path.join(REPO_ROOT, 'market-data.json');
const HISTORY_DIR = path.join(REPO_ROOT, 'history');

const TICK_INTERVAL_MS = 60 * 1000;       // matches the cron schedule (every 1 minute — the fastest a scheduled Action can run)
const ROLLING_WINDOW_POINTS = 720;        // ~720 * 1min = 12 hours kept in the small hot file
const MAX_CATCHUP_TICKS = 20;             // safety cap if the workflow was paused for a while

function advanceOneTick(m) {
  m.fairValue *= (1 + (Math.random() - 0.5) * 0.01);
  const volShock = Math.abs(Math.random() - 0.5) * 0.03;
  m.vol = Math.min(0.06, Math.max(0.004, m.vol * 0.85 + volShock * 0.15));
  const shock = (Math.random() - 0.5) * 2 * m.vol;
  m.momentum = m.momentum * 0.55 + shock * 0.45;
  const reversion = (m.fairValue - m.price) / m.price * 0.03;
  const spike = Math.random() < 0.03 ? (Math.random() - 0.5) * 0.12 : 0;
  m.price = Math.max(0.01, m.price * (1 + m.momentum + reversion + spike));
  return { price: m.price, t: Date.now() };
}

function dayFileFor(t) {
  const iso = new Date(t).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return path.join(HISTORY_DIR, `${iso}.json`);
}

function appendToArchive(points) {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  // group new points by which day-file they belong to, in case a catch-up run spans midnight
  const byFile = new Map();
  for (const p of points) {
    const file = dayFileFor(p.t);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push([Math.round(p.price * 10000) / 10000, p.t]); // compact tuple, price rounded to avoid float noise bloating the file
  }
  for (const [file, tuples] of byFile) {
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    existing.push(...tuples);
    fs.writeFileSync(file, JSON.stringify(existing)); // no pretty-print — this file is for storage, not reading by hand
  }
}

const market = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const now = Date.now();
// If this has never run before (updatedAt is 0), don't compute elapsed time since epoch —
// that produces a huge, wild multi-tick catch-up on the very first run. Just take one gentle tick.
const isFirstRun = !market.updatedAt;
const elapsed = isFirstRun ? TICK_INTERVAL_MS : now - market.updatedAt;
const ticksOwed = isFirstRun ? 1 : Math.min(MAX_CATCHUP_TICKS, Math.max(1, Math.round(elapsed / TICK_INTERVAL_MS)));

const newPoints = [];
for (let i = 0; i < ticksOwed; i++) newPoints.push(advanceOneTick(market));
market.updatedAt = now;

market.history = [...(market.history || []), ...newPoints];
if (market.history.length > ROLLING_WINDOW_POINTS) {
  market.history = market.history.slice(market.history.length - ROLLING_WINDOW_POINTS);
}

appendToArchive(newPoints);
fs.writeFileSync(DATA_PATH, JSON.stringify(market, null, 2));
console.log(`Advanced ${ticksOwed} tick(s). New price: $${market.price.toFixed(2)}. Archived ${newPoints.length} point(s).`);
