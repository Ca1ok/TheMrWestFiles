# WestOS — The Mr West Files

A phone/tablet operating system in the browser. The page is an **iPad** on desktop and an **iPhone** on phones; every app is its own HTML file that opens with a zoom animation from its icon. One shared wallet runs through the whole thing: stocks, a chemistry shop and lab, real estate, a bank that taxes you, and a Messages app that tells you when you’re in trouble.

## Folder structure

```
/                         ← repo root (served by GitHub Pages)
├─ index.html             ← the OS shell: device frame, lock screen, home screen, widgets, app windows
├─ .nojekyll              ← REQUIRED: stops GitHub Pages from ignoring files that start with "_"
├─ CNAME  robots.txt
├─ database.rules.json    ← Firebase Realtime Database rules (paste into the Firebase console)
├─ README.md
│
├─ apps/                  ← one HTML file per app (this is what the OS opens in a window)
│  ├─ Messages.html  Stocks.html  News.html  WestShop.html  WestLab.html  RealEstate.html
│  ├─ Bank.html  Games.html  Photos.html  Notes.html  Files.html  Settings.html
│  └─ games/              ← every minigame is one file + a line in manifest.js
│     ├─ manifest.js      ← list of games (id, name, icon, category)
│     └─ titration.js  elementRecall.js  … (20 games)
│
├─ os/
│  ├─ config.js           ← Firebase keys, ADMIN EMAIL, tax numbers, data-saving knobs
│  ├─ icons.js            ← the icon set + the app registry (OS_APPS) — add an app here
│  ├─ tokens.css          ← design tokens (light/dark palette, fonts, easing)
│  ├─ os.css  poster.css  ← shell styles, the WANTED poster
│  ├─ shell.js            ← home screen, edit mode, drag & drop, windows, gestures, notifications, lock screen
│  ├─ widgets/            ← one file per home-screen widget (wanted, stocks, bank, news, …)
│  ├─ app/
│  │  ├─ kit.css          ← the Apple-style UI kit apps use (lists, buttons, sheets, large titles)
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
└─ tests/                 ← Node + Playwright tests (not needed in production)
```

## Deploying

1. **Replace the repo contents** with this folder. Delete the old files: `app.js, styles.css, notice.html, market.html, coin.html, cookin.html, leaderboard.html, settings.html, periodic.html, databook.html, life.html, market-model.js, market-data.json, history/` and the old `data/element-clicker-data.js`, `data/life-data.js`. (Keep `CNAME`.)
2. **Firebase rules:** Firebase console → Realtime Database → Rules → paste `database.rules.json` → Publish. These rules replace your old ones and include the Photos archive and its monthly data budget. *Test them in the Rules Playground first.*
3. **Firebase Auth:** keep the **Google**, **Email/Password** and **Anonymous** providers enabled (anonymous is only used to let guests view photos — it never stores progress), and keep your site’s domain under *Authorized domains*.
4. **Admin:** the only administrator is the email in `os/config.js` **and** in `database.rules.json` (search for `kirattdhaliwal@gmail.com`). Change both together. The account must have a verified email (Google sign-in is).
5. **GitHub Actions:** the market ticker workflow now commits to `market/`; a new hourly workflow exports WestLab discoveries to `lab-cache/`. Make sure *Settings → Actions → General → Workflow permissions* allows read & write.

## How the pieces work

* **Shell ↔ apps.** Apps run in iframes of the same origin and talk to the shell through a frozen `OS` object (`window.parent.OS`). Opening `apps/News.html` directly just redirects to the OS.
* **Guests vs. signed in.** A guest’s progress exists only in memory — it is *never* written to localStorage or the cloud. Signing in loads your saved record (or turns your guest session into your first save). Signing out wipes memory. Only display settings (theme, wallpaper, layout) are stored in the browser.
* **Prices cost no bandwidth.** $WEST, the news, property prices and element price swings are pure functions of the clock and a shared seed, so every player computes the same thing locally.
* **WestLab** is a real engine, not a lookup table: it parses formulas, balances equations exactly, builds compounds from oxidation states, applies solubility and activity-series rules, and refuses what chemistry doesn’t allow. Every client recomputes reactions, so a shared cache can’t be poisoned; the cache (Firebase `labCache` → `lab-cache/discoveries.json`) only records who discovered what first.
* **Tax.** Above $100,000 cash the bank issues a daily bill (`rate = 1% × (e^(0.35·excess) − 1)`, capped at 50%). It appears in Bank + Messages, with a reminder 12 h before the 48 h deadline. Unpaid → assets worth **2×** the bill are seized (inventory → shares → property; any overshoot is refunded). Tune it in `os/config.js`.

## Extending it

| To add… | Do this |
|---|---|
| **An app** | Create `apps/MyApp.html` (copy a small one such as `Messages.html`), add one entry to `OS_APPS` in `os/icons.js` (and a glyph in `OS_GLYPHS`). It appears in the Add-to-Home sheet automatically. |
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

Element Clicker, the Life simulator, contracts/crafting benches and the standalone leaderboard page. The OS is built so any of them can be added back as an app. (Old save files migrate automatically: cash, shares, elements, compounds, equipment, discoveries.)

## Tests

`node tests/chem.test.js` — the chemistry engine (60+ checks). `python3 tests/flows.py` — sign-in, saving, tax, seizure, admin visibility (needs `pip install playwright`). `tests/shot*.py` take screenshots.
