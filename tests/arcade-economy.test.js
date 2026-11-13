// node tests/arcade-economy.test.js [-v] — the casino is a $250B bankroll fed by bot gamblers, paying bot staff, and every other flow in the bot economy is a ledger move.
// Checks, over 120 simulated days: the supply never changes · bots really gamble, work casino jobs, get paid by other bots and shop at other bots · the bankroll stays near its base.
const assert = require('assert'), E = require('../os/lib/economy.js'), S = require('../os/lib/eco-sim.js');
const DAY = 86400000, T0 = 1790000000000 - (1790000000000 % DAY), STEP = 30 * 60000, V = process.argv.includes('-v');
assert.strictEqual(E.SEED.arcade, 2.5e13, 'casino base bankroll is $250 billion'); assert.strictEqual(Object.values(E.SEED).reduce((a, b) => a + b, 0), E.SUPPLY, 'seeds sum to the supply');
Object.values(E.SEED).forEach(v => assert.ok(v < 2 ** 53, 'every seed stays an exact double'));
const db = {}; S.genesis(db, T0, []); let minArc = Infinity, maxArc = 0, minPool = Infinity;
for(let t = T0 + STEP; t <= T0 + 120 * DAY; t += STEP){ S.step(db, t, t / 1000 | 0); const A = E.audit(db); assert.ok(A.ok && A.total === E.SUPPLY, 'audit @ day ' + ((t - T0) / DAY).toFixed(1)); minArc = Math.min(minArc, A.sys.arcade); maxArc = Math.max(maxArc, A.sys.arcade); minPool = Math.min(minPool, A.sys.pool);
  if(V && (t - T0) % (20 * DAY) < STEP) console.log('day', Math.round((t - T0) / DAY), 'arcade $' + Math.round(A.sys.arcade / 100).toLocaleString(), 'pool $' + Math.round(A.sys.pool / 100).toLocaleString()); }
const c = db.world.meta.cas, A = E.audit(db), $ = n => '$' + Math.round(n / 100).toLocaleString();
console.log('casino: ' + c.n + ' bot bets, staked ' + $(c.staked) + ', paid out ' + $(c.paid) + ' (house keeps ' + $(c.staked - c.paid) + '), staff wages ' + $(c.wages) + ', dividend to market ' + $(c.div));
console.log('bot economy: wages paid by other bots ' + $(c.emp) + ', spent in bot-run shops ' + $(c.shop) + '; bankroll now ' + $(A.sys.arcade) + ' (min ' + $(minArc) + ', max ' + $(maxArc) + ')');
assert.ok(c.n > 500, 'bots gamble'); assert.ok(c.staked > c.paid, 'the house edge is positive'); assert.ok(c.wages > 0, 'casino staff are paid from the bankroll'); assert.ok(c.emp > 0, 'business owners pay other bots'); assert.ok(c.shop > 0, 'bots shop at bot-run businesses');
const base = E.SEED.arcade; assert.ok(minArc > base * 0.97 && maxArc < base * 1.12, 'the bankroll stays within a few percent of its base'); assert.ok(minPool > E.SEED.pool * 0.9, 'the market pool is not being drained');
console.log('arcade-economy ok');
