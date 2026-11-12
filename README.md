# WestOS — The Mr West Files

A desktop operating system in the browser, built for keyboard and mouse. The whole browser window is the screen: a menu bar on top, a desktop of live widgets, a dock of app icons at the bottom, and every app opens as a real **window** (red = close, yellow = minimize, green = maximize; drag by the title bar, resize from any edge or corner, double-click the title bar to maximize). Each app is its own HTML file. One shared wallet runs through everything: stocks, a chemistry shop and lab, real estate, a bank that taxes you, and a Messages app that tells you when you’re in trouble.

## Folder structure

```
/                         ← repo root (served by GitHub Pages)
├─ index.html             ← the OS shell: menu bar, desktop, dock, windows
├─ .nojekyll              ← REQUIRED: stops GitHub Pages from ignoring files that start with "_"
├─ CNAME  robots.txt
├─ database.rules.json    ← Firebase Realtime Database rules (paste into the Firebase console)
├─ README.md
│
├─ assets/
│  └─ icons/              ← one PNG per app (Messages.png, Stocks.png …) + WestOS.png (favicon / logo)
├─ apps/                  ← one HTML file per app (this is what the OS opens in a window)
│  ├─ Messages.html  Stocks.html  News.html  WestShop.html  WestLab.html  RealEstate.html
│  ├─ Bank.html  Games.html  Arcade.html  WestFactory.html  Photos.html  Preview.html  Leaderboard.html  Notes.html  Files.html  Settings.html
│  └─ games/              ← every minigame is one file + a line in manifest.js
│     ├─ manifest.js      ← list of games (id, name, icon, category)
│     └─ titration.js  elementRecall.js  … (20 games)
│
├─ os/
│  ├─ config.js           ← Firebase keys, ADMIN EMAIL, tax numbers, data-saving knobs
│  ├─ icons.js            ← UI glyphs + the app registry (OS_APPS) — add an app here
│  ├─ tokens.css          ← design tokens (light/dark palette, fonts, easing)
│  ├─ os.css  poster.css  ← shell styles, the WANTED poster
│  ├─ shell.js            ← menu bar, desktop edit mode, dock, the window manager, notifications, optional lock screen
│  ├─ widgets/            ← one file per desktop widget (wanted, stocks, bank, news, map, …)
│  ├─ app/
│  │  ├─ kit.css          ← the UI kit apps use (lists, buttons, sheets, large titles)
│  │  └─ kit.js           ← page stack, sheets, alerts, toasts, OS bridge
│  ├─ kernel/             ← private game logic; nothing here is reachable from the console
│  │  ├─ state.js         ← wallet, inventory, mail, shop pricing, properties, minigame payouts
│  │  ├─ cloud.js         ← sign-in, saving, mailbox, broadcasts, leaderboard, admin tools
│  │  ├─ market.js        ← the live $WEST price + trading
│  │  ├─ bank.js          ← tax bills, reminders, seizure
│  │  ├─ gallery.js       ← the Photos archive client (shared cache)
│  │  ├─ api.js           ← the narrow `OS` facade apps are allowed to call
│  │  └─ boot.js          ← starts everything, then loads Firebase after first paint
│  └─ lib/                ← pure libraries (also used by the GitHub Actions and the tests)
│     ├─ chem.js          ← the WestLab reaction engine
│     ├─ world.js         ← deterministic daily news, real-estate prices, element price swings
│     └─ market-model.js  ← the $WEST price model
│
├─ data/                  ← reference data: chem-data.js, economy-data.js, periodic-table-data.js,
│                           databook-data.js, news-data.js, property-data.js, wanted-data.js, moderation-data.js
├─ market/                ← written by the GitHub Action: market-data.json + history/*.json (candles)
├─ lab-cache/             ← written by the GitHub Action: discoveries.json
├─ .github/               ← workflows + scripts (market ticker, lab-cache export)
├─ tools/make-icons.py    ← regenerates assets/icons/*.png from os/icons.js (optional, dev only)
└─ tests/                 ← Node + Playwright tests (not needed in production)
```

## Deploying

1. **Replace the repo contents** with this folder. Delete the old files: `app.js, styles.css, notice.html, market.html, coin.html, cookin.html, leaderboard.html, settings.html, periodic.html, databook.html, life.html, market-model.js, market-data.json, history/` and the old `data/element-clicker-data.js`, `data/life-data.js`. (Keep `CNAME`.)
2. **Firebase rules:** Firebase console → Realtime Database → Rules → paste `database.rules.json` → Publish. These rules replace your old ones and include the Photos archive and its monthly data budget. *Test them in the Rules Playground first.*
3. **Firebase Auth:** keep the **Google**, **Email/Password** and **Anonymous** providers enabled (anonymous is only used to let guests view photos — it never stores progress), and keep your site’s domain under *Authorized domains*.
4. **Admin:** the only administrator is the email in `os/config.js` **and** in `database.rules.json` (search for `kirattdhaliwal@gmail.com`). Change both together. The account must have a verified email (Google sign-in is).
5. **GitHub Actions:** the market ticker workflow now commits to `market/`; a new hourly workflow exports WestLab discoveries to `lab-cache/`. Make sure *Settings → Actions → General → Workflow permissions* allows read & write.

## Using it

* **Windows:** drag by the title bar, resize from any edge/corner, double-click the title bar or press the green button to maximize, yellow to minimize (click the dock icon to bring it back). Fling a window to the top edge to maximize it. In a very narrow browser window every app opens maximized.
* **Desktop:** click **Edit desktop** (top left) to add widgets (resizable), drag them around and remove them. Settings → *Dock apps* chooses what lives in the dock.
* **Menu bar:** sync status (click to sign in or save now), unread messages, and your balance (click for Bank). There is deliberately no clock or battery.
* **Lock screen:** optional — Settings → *Show lock screen on start*.

## How the pieces work

* **Shell ↔ apps.** Apps run in iframes of the same origin and talk to the shell through a frozen `OS` object (`window.parent.OS`). Opening `apps/News.html` directly just redirects to the OS.
* **Guests vs. signed in.** A guest’s progress exists only in memory — it is *never* written to localStorage or the cloud. Signing in loads your saved record (or turns your guest session into your first save). Signing out wipes memory. Only display settings (theme, wallpaper, layout) are stored in the browser.
* **Prices cost no bandwidth.** $WEST, the news, property prices and element price swings are pure functions of the clock and a shared seed, so every player computes the same thing locally.
* **WestLab** is a physical-chemistry simulator. `os/lib/chem.js` decides *what* can happen (balanced equation, products, solubility and activity rules); `os/lib/phys.js` (WestPhys) decides *whether and how*: ΔH/ΔS/ΔG(T) from tabulated NBS/CRC data (`data/thermo-data.js`) with heat capacities and phase changes, the true equilibrium for the amounts you load (limiting reagent, % yield, Le Chatelier), Evans–Polanyi + Eyring kinetics, adiabatic temperature and sealed-vessel pressure, electrolysis voltage (E = ΔG/nF), Ksp precipitation and pH. Species without tabulated data are *estimated* and flagged. Equipment changes the reachable physics (temperature, pressure, catalyst, electrolysis, product removal).
* **Reactor UI.** `apps/WestLab.html` has three tabs (Reactor / Equipment / Library). Drag reagents from the inventory into the reactor; products land in an output tray and are added to the inventory manually (or dragged back in as reagents). `os/lib/mol.js` (WestMol) builds a molecular graph for any formula from valence rules (or takes the real structure from PubChem) and maps every reactant atom onto a product atom, so the reactor shows bonds breaking and forming with average-bond-energy bookkeeping.
* **Structure pipeline (no quantum chemistry).** `os/lib/ff.js` (WestFF) runs on the *player's own computer*: Phase 1 asks PubChem (free REST API) for the CID, name, IUPAC name, formal charge, mass and isomeric/connectivity SMILES; Phase 2 searches conformers and minimises them with the **MMFF94** force field (OpenChemLib, loaded from a CDN on first use), then extracts the potential energy, Gasteiger partial charges, bond types and an interatomic distance matrix. Checked against RDKit: MMFF94 energies agree to ≤ 0.01 kcal/mol on rigid molecules, charges to 0.001. MMFF94 is organic-only, so every geometry is also checked against empirical bond lengths (Pyykkö radii + Schomaker–Stevenson); species that fail (CO₂, N₂, SO₂…) fall back to crystallographic bond lengths and show no energy. The reactor now draws the minimised 3-D geometry, and Library → molecule opens a rotatable 3-D viewer (distance lookup, bond table, charges).
* **Structure database.** Lookup order: shared `lab-cache/ff/<shard>.json` on GitHub → this device (IndexedDB) → calculate here. The database is keyed Hill formula → CID → record. Only a maintainer machine writes to GitHub: Library → *Structure database* (admin) takes a fine-grained token (this repo, Contents read/write; kept in that browser's localStorage only) and `os/lib/ff-sync.js` commits new records in one batch per shard file. Firebase is never used. For bulk work run `python tools/westlab_pipeline.py --registry` (pubchempy + RDKit ETKDG + MMFF94/UFF, same schema, does the git commit and push itself).
* **Legacy compound library.** `lab-cache/compounds/` (valence-built or PubChem 2-D structures from the old Action) stays as the last fallback; the Action no longer writes to it.
* **Reaction library.** Lookup order: this session → `lab-cache/reactions/<shard>.json` on GitHub → calculate locally. A newly calculated valid reaction submits only its *inputs* to Firebase `labSubmit`; the hourly Action recomputes it with the same engine and commits the verified card, so nobody can write a wrong result into the library. `node tests/phys.test.js` checks the engine against textbook values.
* **Tax.** Above $100,000 cash the bank issues a daily bill (`rate = 1% × (e^(0.35·excess) − 1)`, capped at 50%). It appears in Bank + Messages, with a reminder 12 h before the 48 h deadline. Unpaid → assets worth **2×** the bill are seized (inventory → shares → property; any overshoot is refunded). Tune it in `os/config.js`.

## Extending it

| To add… | Do this |
|---|---|
| **An app** | Create `apps/MyApp.html` (copy a small one such as `Messages.html`), add one entry to `OS_APPS` in `os/icons.js` (plus a glyph in `OS_GLYPHS`), then run `python3 tools/make-icons.py` — or drop your own 512×512 PNG at `assets/icons/MyApp.png`. It shows up in the dock automatically. |
| **A widget** | Create `os/widgets/mywidget.js` (see `clock.js`), add its `<script>` line to `index.html`. |
| **A minigame** | Create `apps/games/<id>.js` (see `titration.js`) and one line in `apps/games/manifest.js`. Call `api.win(id, baseReward, resultEl, label)` / `api.lose(resultEl, label)`. |
| **News stories** | Add templates to `data/news-data.js` (`kind: 'el'` moves an element’s price, `'sec'` moves a property sector). |
| **A property** | Add a line to `data/property-data.js`. |
| **A compound for sale** | Add it to `RECIPES` / `COMPOUND_LOOKUP`; the lab can make *any* valid formula anyway. |

## Staying inside Firebase’s free tier (Spark: 10 GB/month download)

* One read of your save at sign-in; writes are batched (≤ one burst per 20 s, only changed fields, ~1–5 KB).
* No polling and no streamed prices. Two near-empty listeners only (your mailbox and the admin ledger).
* Photos: thumbnails are tiny and cached in the browser forever; the ~1600 px preview is fetched once per device; originals are download-only; News loads at most 6 thumbnails; wallpapers download once. Every byte is added to a shared monthly counter, and the rules stop media loading past 7 GB.
* Apps and data are static files on GitHub Pages — they cost Firebase nothing.
* Settings → *Data & storage* shows what this session used.

## Security: what is and isn’t protected

* Console/DevTools: the wallet, state and kernel are private; the `OS` API has no “add money”; the local save no longer exists; data tables are not reachable.
* Server: `database.rules.json` limits every write to the owner (or the admin), blocks anonymous accounts from player data, makes market ledgers/broadcasts/mailbox admin-only, bounds cash and names, and rate-limits the photo counters.
* **Honest limit:** this is still a static site, so the game rules run in the player’s browser. Someone who writes to Firebase directly (bypassing the app) could still set their own numbers within the validated ranges. Full protection needs server-side code (Cloud Functions). The $WEST price is also computable in advance from the public seed — the same limit.

## Not carried over from the old site

Element Clicker, the Life simulator and contracts/crafting benches. The OS is built so any of them can be added back as an app. (Old save files migrate automatically: cash, shares, elements, compounds, equipment, discoveries.)

## Tests

`node tests/chem.test.js` — the chemistry engine (60+ checks). `python3 tests/flows.py` — sign-in, saving, tax, seizure, admin visibility. `python3 tests/windows.py` — close/minimize/maximize, drag, resize, focus, reduce-motion, edit mode. `python3 tests/smoke_all.py` — every app at several screen sizes. (The Python tests need `pip install playwright`.)

* **Engine (v2).** Beyond the rule engine, `Phys.card` falls back to a Gibbs-energy search over every known species (tabulated + registry + the elements) for the balanced reaction that releases the most free energy, with chemistry-sense filters (no soot, no shredded carbon skeletons, no invented hydrocarbons, no oxoacids without water; metal + acid/salt stay with the activity-series rules). Every element 1–118 has thermodynamic data (CRC tables, or an estimator flagged as estimated). **Ignite (spark)** models a local hot-spot: a reaction that is blocked at room temperature but exothermic enough to keep itself above ≈ 800 K (and with Ea ≤ 200 kJ/mol) runs; N₂ + H₂ does not. **Open vessels** (1 bar, vented) let produced gases escape — their partial pressure stays near what air holds — which is why vinegar + baking soda fizzes at room temperature and limestone calcines near 1000 K. Run `node tests/engine.test.js`.

## Leaderboard, Preview and the growing economy (Nov 2026)

* **WestMap & workplaces:** WestFactory needs an industrial plot and WestLab a laboratory in the University Quarter (bought once in WestMap; fees `plotFee` / `labFee` in Settings → Economy). The map shows NPCs (a pure timetable, nothing stored) and where each player is (`world/loc`, only while a map is open). **After updating, paste the new `database.rules.json` into the Firebase console** (new nodes `world/plot` and `world/loc`).
* **Leaderboard** is its own app (the Bank no longer ranks anyone). Nine rankings from one tiny record per player (`leaderboard/<uid>`, ~170 bytes): Net worth, Bank, Real estate, Stocks, Inventory, Discoveries, Reactions, Properties, Elements. A ranking is one query of at most 50 rows, cached 30 s; your own row uses your live numbers. To add a ranking: a line in `C.LB` and `boardEntry()` in `os/kernel/cloud.js`, plus its field in `database.rules.json`.
* **Preview** is the photo viewer app. Photos, News and the Wanted widget open pictures with `OS.preview({ kind: 'gallery', list, index })` or `{ kind: 'poster' }`; it zooms, pans, flips through, saves and sets wallpapers. `preview.html` no longer exists.
* **Growing economy.** `World.econ(now)` (os/lib/world.js) is a deterministic index: 1.0 until 2026-11-07, then about +2%/day easing to +0.4%/day (×12.6 in a year). Element/compound values, property prices (and so rent), game payouts, the shop’s demand scale and the tax threshold all ride it. The $WEST trend compounds faster (`marketGrowthAt`, ×2.6 in 30 days) and its slow wander is calmed, so holding makes money: in a 120-day simulation every 30-day hold was profitable (`node tests/economy.test.js`). Short flips are still a gamble.
* **Faster, synced events.** A news story every 15 minutes (effects fade in hours), a busier $WEST pump/dump generator (about one every 8 minutes) and alerts for holders. Everything is a pure function of the clock and a fixed seed, so every player sees the same thing at the same second with zero network traffic.
