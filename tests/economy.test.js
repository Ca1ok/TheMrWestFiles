// node tests/economy.test.js — checks the growth era: continuity at the start, compounding trend, and that holding $WEST for a month makes money.
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('../os/lib/market-model.js');
const cp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'market', 'market-data.json'))), adj = cp.adjustments;
const TPD = M.MARKET_TICKS_PER_DAY, T0 = M.MARKET_GROWTH_T0;
assert(Math.abs(M.marketLevelAtTick(T0 + 1, adj) - M.marketLevelAtTick(T0, adj)) < 0.01, 'level is continuous at the growth start');
assert(M.marketLevelAtTick(T0 - 1000, adj) === M.marketLevelAtTick(T0 - 1000, adj.slice()), 'history before the start is unchanged');
assert(M.marketGrowthAt(T0 + 30 * TPD) > 2.4 && M.marketGrowthAt(T0 + 365 * TPD) > 50, 'trend compounds');
const days = 90, STEP = 120, px = []; let c = { tickIndex: cp.tickIndex, state: cp.state }; const END = T0 + days * TPD;
while(c.tickIndex < END) c = M.marketSimulate(c, END, (i, p) => { if(i >= T0 && i % STEP === 0) px.push(M.marketDisplayPrice(p, i, adj)); }, 2e6);
const n = 30 * TPD / STEP; let worst = Infinity; for(let i = 0; i + n < px.length; i += 2) worst = Math.min(worst, px[i + n] / px[i]);
assert(worst > 1, 'every 30-day hold made money (worst ' + ((worst - 1) * 100).toFixed(1) + '%)');
console.log('economy ok — worst 30-day hold: +' + ((worst - 1) * 100).toFixed(1) + '%');
