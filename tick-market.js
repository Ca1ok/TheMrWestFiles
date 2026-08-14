// Advances the MrWestCoin market simulation and writes the result back to market-data.json.
// Run on a schedule by .github/workflows/update-market.yml — this IS the "algorithm" updating the price.
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'market-data.json');
const TICK_INTERVAL_MS = 10 * 60 * 1000; // matches the cron schedule (every 10 minutes)
const MAX_HISTORY_POINTS = 1000;          // ~1000 * 10min = ~1 week of history
const MAX_CATCHUP_TICKS = 50;             // safety cap if the workflow was paused for a while

function advanceOneTick(m) {
  m.fairValue *= (1 + (Math.random() - 0.5) * 0.01);
  const volShock = Math.abs(Math.random() - 0.5) * 0.03;
  m.vol = Math.min(0.06, Math.max(0.004, m.vol * 0.85 + volShock * 0.15));
  const shock = (Math.random() - 0.5) * 2 * m.vol;
  m.momentum = m.momentum * 0.55 + shock * 0.45;
  const reversion = (m.fairValue - m.price) / m.price * 0.03;
  const spike = Math.random() < 0.03 ? (Math.random() - 0.5) * 0.12 : 0;
  m.price = Math.max(0.01, m.price * (1 + m.momentum + reversion + spike));
  m.history.push({ price: m.price, t: Date.now() });
  if (m.history.length > MAX_HISTORY_POINTS) m.history.shift();
  return m;
}

const market = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const now = Date.now();
const elapsed = market.updatedAt ? now - market.updatedAt : TICK_INTERVAL_MS;
const ticksOwed = Math.min(MAX_CATCHUP_TICKS, Math.max(1, Math.round(elapsed / TICK_INTERVAL_MS)));

for (let i = 0; i < ticksOwed; i++) advanceOneTick(market);
market.updatedAt = now;

fs.writeFileSync(DATA_PATH, JSON.stringify(market, null, 2));
console.log(`Advanced ${ticksOwed} tick(s). New price: $${market.price.toFixed(2)}`);
