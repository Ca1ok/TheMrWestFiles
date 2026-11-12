# WestEconomy — owner setup guide

This update turns the website's money into a **closed, server-checked ledger**: $100 trillion exists, it only ever moves (players ↔ market pool ↔ casino ↔ bank ↔ treasury ↔ city ↔ bots), and the database rules refuse any save that would create or lose a cent. Everything runs on the free Firebase plan + free GitHub Actions.

## One-time setup (≈10 minutes)
1. **Deploy the files** (this zip is the whole site; replace the repo contents and push to GitHub Pages as before).
2. **Publish the new rules**: Firebase console → Realtime Database → Rules → paste the contents of `database.rules.json` → Publish. (Use the Rules Playground to try a few reads/writes if you like.) *Do this before the next step.*
3. **Start the world server**: Firebase console → Project settings → Service accounts → *Generate new private key*. In GitHub → repo → Settings → Secrets and variables → Actions → *New repository secret* named `FIREBASE_SERVICE_ACCOUNT`, paste the whole JSON. Then Actions → *WestEconomy world server* → Run workflow once to check it says `written.` or `Nothing to do`.
4. **Back up** (Firebase console → Realtime Database → ⋮ → Export JSON) — the reset in the next step cannot be undone.
5. **Start the economy**: sign in as the admin → Settings → Administrator → **Economy** → type `RESET` → *Start the economy*. This deletes every player's progress (money, items, discovered elements, houses), builds WestCountry (512 houses) and 100 bots (each gets $100k from the pool), makes everybody redo the onboarding, and marks everyone who had already played as an **OG player** (+$50,000, 10 mol gold, 10 mol silver, a quiet ★ OG on the leaderboard). Open tabs reload by themselves.

Until step 5, players can look around but nothing is saved (the site says so). Without step 3 the economy still works for players, but there are no bots, taxes/bills, loans enforcement, fires or new houses.

## What's in it
- **Onboarding**: welcome → $100,000 grant from the pool → pick a home (rent by the day, or buy). Homeless players earn half from games and can't borrow.
- **WestMap**: a suburban country: houses along winding streets, highways from downtown to every district (express roads to the cities where the expensive houses are), a University Quarter and an Industrial Estate, NPC dots you can click to see where they are going, and every player's dot, which moves to the Arcade, Bank, WestShop, Exchange, Estate Agency, their lab or their factory depending on their front window (home screen = home). Plus buy/sell/list/rent out/evict, fires with fire engines, ambulances and police, an economy dashboard.
- **Taxes everywhere**: 4% on every trade with the market pool (shop, $WEST, games) and on casino payouts, 2% stamp duty on houses, daily property tax, daily wealth tax above $250k, 10% estate tax when a bot dies, hospital/fire bills. The treasury pays public-sector bots; bills are paid automatically when you can afford them and enforced by the city (collect cash → seize houses).
- **Loans**: Bank → Loans: three plans (7/30/90 days), interest fixed up front, three loans at a time, late fees grow 2%/day.
- **Bots**: 100 with unique characters, +10 a week, 40–100-day lives; they work, rent, buy and sell houses, buy items from the market, pay tax, and can be your tenants or landlords.
- **Stock market**: a small permanent price step follows the economy's health (every ≥6 h).

## Admin
Settings → Administrator → Economy: stats, a full audit button, tax/grant/loan settings (enforced by the rules), and the reset.

## How browser editing is limited (read this)
Nothing on the free plan can run trusted code in real time, so the database rules are the referee. Layers:
1. **Cash, houses, loans, bills, rent, the inbox** are fully rule-checked — a modified browser simply cannot change them.
2. **Money from the market pool** (shop, $WEST, games, lab/factory sales) depends on prices and item counts the browser reports. It is bounded by a **lifetime earning allowance**: the most an account can ever draw from the pool is *welcome grant + $100,000 × days since it was created* (`earnPerDay`, adjustable in Settings → Economy), plus a daily net limit. A cheater can therefore extract at most what a top legitimate player earns, and the game clamps honest players to the same numbers so their saves are never refused. Homeless players get a tenth of the daily limit.
3. **Player market purchases** are checked against the listing's price and quantity inside the rules.
4. The admin Economy page flags accounts above 85% of their allowance.
Casino outcomes and minigame scores are still reported by the browser (capped per write and per day, and closed to homeless players). Truly preventing those requires server code (Firebase Cloud Functions, which need the paid Blaze plan).

## Wallet cap and taxes
No account can hold more than **$50 trillion** (rule-enforced). The wealth tax is progressive: 0.5%/day above $250k, rising through 1.5%, 4%, 8%, 15%, 25% to **40%/day above $250 billion** — a $50T wallet would lose ~90% within ten days, so balances stay far below the cap.

## Industrial plots and laboratories
WestFactory only opens if you own a plot in the Industrial Estate ($250,000, `plotFee`); WestLab only opens if you own a laboratory in the University Quarter ($150,000, `labFee`). Each is bought once and the money goes to the city (the same closed loop as house sales: it only moves). Plot ownership is `world/plot/<uid>/<f|l>`; the rules require the exact fee, the server clock and the ledger tag `plot-f` / `plot-l`, and refuse a second purchase. The admin can change both fees in Settings → Economy (0 = free). Where a player stands on the map (`world/loc`) is cosmetic and never moves money.

## Building licences
Council licence ($50,000, 30 days) → order up to three houses (studio … villa) with a deposit → within ~10 minutes the world server builds the next plot of that type, charges its real value + 5% and refunds the rest. Building and immediately selling to the city can't profit (105% in, 90% out).

## Homeless
If you skip choosing a home you are **homeless**: a tenth of the daily earning limit, no Arcade, no loans, until you rent or buy somewhere.

## Honest limits
- The rules guarantee conservation, caps and price checks where the price is on record (houses, rent, loans, market listings); for shop/stock/game income they guarantee a hard ceiling (the earning allowance), not that each individual price was fair.
- Money totals are exact integers of cents; no single balance can exceed $50T by rule (JavaScript's exact-number limit is ~$90T).
- Casino payouts are now taxed (4%), which lowers players' return slightly; change `taxBp` if you want.
- The rules were tested with an evaluator written for this repo (`tests/rules-harness.js`), not Google's emulator — keep the Firebase backup handy.

## Tests
`node tools/build-rules.js && node tests/rules.test.js`, `node tests/eco-sim.test.js`, `node tests/eco-tick.test.js`, `node tests/e2e.test.js` (needs Playwright), plus the older suites.
