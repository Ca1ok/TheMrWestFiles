# AGENTS.md — WestOS / The Mr West Files (read this first, then open only the files you need)

Static site on GitHub Pages (no build step, no npm deps at runtime). A browser "OS": menu bar + desktop (icons/widgets) + dock + real app windows (each app = iframe of `apps/<Id>.html`). One shared wallet/economy. Backend = Firebase Realtime DB + Auth (public web keys; security lives in `database.rules.json`). Admin = one verified Google email set in `os/config.js` and mirrored in the rules.

## 0. Owner's standing rules (follow without being told)
- **Deliver changed files only, in repo folder structure, as a `.zip`** the owner drag-drops over the repo. Zips can't delete: list files to delete in the reply.
- Do NOT add/bump `?v=` cache-busting query strings on script/link tags (the owner removed them; `index.html` still has old ones — leave alone).
- Keep the architecture (multi-file, `OS` facade, kernel/app split). Add features by adding files + one registry line, not by rewriting.
- Money must stay **balanced** and work through the one wallet (see §6). Free Firebase tier: keep reads/writes minimal.
- Reply short: what changed, what's untested, files to delete. No fluff.
- Verify in a real headless browser before delivering (see §9). Don't claim tested what wasn't.

## 1. Repo map (what to touch for what)
```
index.html                 shell page; loads ALL scripts in a fixed order (see §2). New kernel/widget/lib file => add a <script> line here.
os/config.js               Firebase keys, adminEmail, tax numbers, game.dailySoftcap(75)/dropChance, factory knobs, epoch (world-clock tick 0)
os/icons.js                OS_GLYPHS (24px line SVGs), OS_EMOJI map, OS_APPS registry, osIcon(name,size,sw), osEmoji(e|glyph,size), osAppTile(app,size)
os/tokens.css              CSS vars (light/dark palette, --tint, --card, --fill, --label*, --ease, --spring)
os/os.css  os/poster.css   shell styles / WANTED poster
os/shell.js  (~450 lines)  menu bar, desktop grid, edit mode, drag/drop, dock, window manager, notifications, lock screen, add-to-desktop sheet
os/widgets/*.js            one desktop widget per file (wanted, stocks, bank, news, messages, realestate, clock, element, games)
os/app/kit.js + kit.css    UI kit every app uses (window.Kit) + OS bridge
os/kernel/                 PRIVATE logic (closed over, not on window): state.js (wallet/inv/mail/shop/props/award), maint.js (maintenance switches), cloud.js (auth/save/one-window lock/mailbox/leaderboard/admin),
                           market.js ($WEST), bank.js (tax), arcade.js, factory.js, gallery.js (Photos), api.js (builds the public `OS` facade), boot.js
os/lib/                    PURE libs, also run by Node tests/Actions: chem.js (WestLab engine), phys.js, mol.js, ff.js, ff-sync.js, world.js (news/property/element-price swings),
                           market-model.js, factory-sim.js, arcade-games.js
apps/<Id>.html             one app per file (Messages Stocks News WestShop WestLab RealEstate Bank Games Arcade WestFactory Photos Preview Leaderboard Notes Files WestReport Settings)
apps/games/<id>.js         minigames; apps/games/manifest.js = list + categories
data/*.js                  reference data (periodic table, chem, economy, thermo, properties, news, wanted poster, databook, moderation)
assets/icons/<AppId>.png   app tile PNGs (regen: tools/make-icons.py)
market/ lab-cache/         WRITTEN BY GitHub Actions (market-data.json + history/*.json; lab-cache/{compounds,reactions}/*.json + discoveries.json). Don't hand-edit.
.github/workflows+scripts  update-market.yml (every 10 min, tick-market.js), export-lab-cache.yml
tests/*.test.js            Node tests (economy, engine, factory, mol, phys, arcade)
tools/                     make-icons.py, westlab_pipeline.py (offline PubChem/RDKit batch)
```
**STALE, ignore (not loaded by index.html):** root `shell.js`, `os.css`, `tokens.css`, `icons.js`, `kernel/`, `app/`, `widgets/`. Always edit under `os/`.
`database.rules.json` is not in the zip the owner uploads; the owner pastes rules into the Firebase console (they supply the current rules when needed — give back a full replacement, not a diff).

## 2. Runtime architecture
- Script order in `index.html`: config → icons → data/* → os/lib/* → os/kernel/* → os/widgets/* → shell.js → boot.js.
- Kernel/shell modules register with `(window.__OSM = window.__OSM||[]).push(function(K){...})`; `boot.js` runs them all with shared private `K` (events `K.on/K.emit`, `K.S` state, `K.prefs`, `K.cloud`, `K.market`…), freezes the facade, sets `window.OS`, then loads Firebase SDK **after first paint**.
- Widgets register with `(window.__OSW = window.__OSW||[]).push({id,name,app,desc,sizes:[...],on:[events],cls?,mount(el,size,ctx){...;return {update(evt),destroy()}}})`. `ctx = {OS,esc,money,tile,spark}`. `on` limits which events repaint it. Sizes: xs 1×1, h 2×1, v 1×2, s 2×2, x3 3×2, b 4×1, m 4×2, l 4×4. Add the widget id to `defaultLayout()` in shell.js only if it should be on by default.
- Apps run in iframes of the same origin and reach the shell through `window.parent.OS` (Kit does this; opened standalone they redirect to `index.html#open=<Id>`).
- Events (K.on / OS.on): cash inv mail bank props market lab games arcade factory stock auth loaded prefs theme screen focus sync notify preview volatility maint session.
- **Boot screen:** `index.html` ships `#screen.locked` + the lock screen with a spinner, so a reload never shows a stock desktop. shell.js opens it once `OS.auth.ready()` and `K.maint.ready()` (min 650 ms, 12 s failsafe), or waits for a click if pref `lock` is on. Dock/menubar/windows are hidden while `.locked`.
- **Saving (money-safe):** anything touching cash/inv/lots/props/factory/lab/shop/bank saves within `cashSyncMs` (3 s); mail/prefs/meta in the 20 s batch. `C.flushNow()` resolves TRUE only when the server has it — never delete/move something on the server because of local money until it does (see `FA.claim`: credit → flush → delete, plus a local claimed-id list so nothing pays twice). Failed saves retry with backoff and flash the sync icon. **One window per browser:** the newest window owns the account (localStorage `westos_active`); an older one flushes, sets `K.sessionLost`, shows "open in another window" and never writes/ticks/claims (reload = take over).
- Persistence: `K.S` (game state, schema `v:3`: cash, inv{e,c}, lots, props, bank, mail, lab, games, shop, meta, arcade, factory) saved to `players/<uid>` in Firebase, debounced (`syncDebounceMs` 20s, only changed fields) + localStorage; UI prefs live in `K.prefs` (keys: theme wall iconSize dock layout seenApps winGeom reduceMotion reduceTransparency banners lock updateSpeed clock24 clockSeconds) via `OS.prefs.get/set` — free-form, no rules change needed. Signed-out players aren't saved.

## 3. The `OS` facade (what apps may call) — defined in `os/kernel/api.js` (grep `K.facade =`)
`on, now, today, cash(), prefs{get,all,set}, shop, lab, props, bank, mail, auth, stock, games{award(id,base),info()}, arcade, factory, files, world, admin, gallery, leaderboard, maintenance{app(id),sys(key),site(),note(),config(),systems(),lockedApps()}, report, chem, phys, mol, worldModel, data{ELEMENTS,TOOLS,PROPERTIES,...}, netWorth, nameOk, sync(), notify(n), econ()`; shell adds `open(id), close(id), home(), focused(), openApps(), theme(), screen(), toast(msg), openPage(url), apps(), preview(item), previewTake(), shell{resetLayout,relayout}, reportContext()`.
New capability for apps = add to api.js (and to the freeze list in boot.js if it's a new object).

## 4. Shell internals (os/shell.js) — desktop grid & windows
- Layout item: `{t:'a'|'w', id, k, size?, pos?:{p,r,c}}` stored in `prefs.layout`. Apps in the dock are not on the desk. `pos` = page/row/col cell; unpinned items first-fit. `pinAll()` freezes every item to its current `rec.slot` before any structural change (remove/resize/drop/add) so nothing slides.
- `metrics()` derives cols/rows/cell size/icon size from window size (≈128×118 px cells, min 4×3, fills the area between menu bar and dock) → re-run on resize (`relayoutHome`). `pack()` = pinned (clamped, nearest-free fallback) then first-fit. Drag: ghost snaps to nearest free cell (`dropSpot`), edge-hover flips pages (one extra empty page allowed while dragging). Arrow keys move the focused item in edit mode; Enter/Space opens.
- Windows: `wins` Map(appId→{el,g{x,y,w,h,max,prev},iframe}); `openApp/closeApp/minimizeWin/restoreWin/toggleMax/setFocus`; geometry saved in `prefs.winGeom`; `DEFAULT_SIZE` per app; screens <700px force maximized. Title-bar buttons magnify near the pointer (`wireLights`, CSS var `--s`; coarse pointers always large).
- Dock icon size scales with width; `NEW_APPS` list appends newly shipped apps for existing accounts (add new app ids there).
- Add an app: entry in `OS_APPS` (icons.js) + glyph + `assets/icons/<Id>.png` + `apps/<Id>.html` + `DEFAULT_SIZE` entry + `NEW_APPS`.

## 5. App contract (apps/*.html)
```html
<link rel=stylesheet href="../os/tokens.css"><link rel=stylesheet href="../os/app/kit.css">
<script src="../os/icons.js"></script><script src="../os/app/kit.js"></script>
<script> const {h,row,group,money,esc,num}=Kit; Kit.app({title:'X', right:[{icon,label,onClick}], build:(body,P)=>{ ... }}) </script>
```
Kit exports: `row group h esc money num ago icon tile ico toast confirm alert sheet seg toggle app cashChip spark live debounce raf`. `Kit.app` gives a page stack with large titles; `A.push({title,backLabel,build})` pushes a page. `Kit.live(evt,fn)` subscribes and auto-unsubscribes on close. `h(tag,attrs,...kids)` supports `class, html, style(obj), onclick…`. CSS classes in kit.css: card, row, group, chip(s), seg, btn, field, num, grow, hstack, stack, empty, reveal, switch, bar-prog, section-label, cap…

## 6. Economy (keep balanced)
- Start cash $1000 (`startCash`). `OS.econ()` is a growing multiplier; payouts/softcaps scale with it. Tax: bank bills over `threshold` $100k, rate grows to 50%, due 48h, seizure if ignored.
- **Minigame payout** `K.award(id, base)`: base clamped 0–40 (keep ≤6); amount = base × diminishing(1 − 0.12×(plays−1), floor .15) × collectionBonus × econ; ×0.25 once daily earned ≥ `dailySoftcap`(75)×econ; 18% chance of an element drop. Existing bases: 1–5; new games use 2–5.
- Other sinks/sources: WestShop (element prices swing via world.js), WestLab (reactions, discoveries), RealEstate (props, daily sector prices), $WEST stock (deterministic model shared by browser + GitHub Action), WestFactory (idle production, market fee), Arcade (casino; limits live in Firebase `arcadeConfig`, enforced by rules).
- Leaderboard categories are defined in `os/kernel/cloud.js` (`C.LB`); records are written ≤ every 15 s.

## 6b. Maintenance mode
Firebase `maintenance` = `{all:bool, apps:{AppId:true}, sys:{trading|market:true}, msg, t}` (public read, admin write, live listener). `os/kernel/maint.js`: `appMsg(id)/sysMsg(key)/siteMsg()` return '' when fine (verified admin always exempt). Enforced in shell `openApp` (dialog), open windows (`.mcover`), icon wrench badge, whole-site overlay `#maint`, `mguard()` wrappers in `api.js`, `arcade.begin`, `FA.tick/claim/pushMarket`. Settings and Bank can't be switched off alone. New money-moving action => wrap it in `mguard`. Client-side only.

## 7. Minigames (apps/games)
`manifest.js`: `GAME_MANIFEST=[{id,category,icon,name,desc}]`, `GAME_CATEGORIES={educational,puzzle,fun}`. `icon` = a glyph name from OS_GLYPHS (or emoji mapped in OS_EMOJI). Game file: `Games.register({id, play(content, api){...}})`; call `api.win(id, base, resultEl, msg)` or `api.lose(resultEl, msg)` exactly once (the Games app handles payout, "Play again", daily bar). Games must stop loops/listeners when `!content.isConnected`. Shared CSS helpers in Games.html: `.gx-hint .gx-bar .gx-btn .gx-cv .gx-pad .mz-* .cb-* .ts-*`.
Current: titration, balance (educational) · mazePaint, sandfall, colourBlocks, tubeSort (puzzle) · reaction, projectile, memoryMatch, whackAtom, atomBuilder, fallingCatch, luckyAssay, elementMerge, flappyElectron (fun).

## 8. Data, Firebase & Actions
- DB paths (see rules): `players/$uid` (owner write; `cash/inv/lots/props/bank/mail/lab/games/arcade/factory/shop/prefs/meta` sub-writes), `leaderboard/$uid`, `market/{listings,proceeds}`, `mailbox/$uid`, `broadcast`, `marketAdjustments`, `marketVolatility` (admin ledgers), `arcadeConfig`, `labCache`/`labSubmit`, `gallery/*` (private photo store, monthly byte budget), `reports` (bug/feature, admin-read), `maintenance` (public read, admin write). Any new top-level path needs a rules addition — hand the owner the **full updated rules JSON**. Anonymous auth never stores progress.
- GitHub Action `update-market.yml` (cron 10 min): `tick-market.js` advances `market/market-data.json` + `market/history/{recent,hourly}.json`, reading admin ledgers from Firebase; retry-by-recompute on push race. Price = seeded noise × trend (base + growth) + admin ledger; browser recomputes identically. `export-lab-cache.yml` writes `lab-cache/`.
- WestLab: engine in `os/lib/chem.js` (+phys/mol/ff); results cached to GitHub `lab-cache/` so repeat combos aren't recomputed.

## 9. Test & verify recipe (works in this sandbox)
```bash
cd <repo>; (python3 -m http.server 8123 >/dev/null 2>&1 &); sleep 1.5; python3 test.py   # server dies between tool calls: start it in the SAME command
```
Python Playwright + Chromium are preinstalled (`from playwright.sync_api import sync_playwright`). Pattern: `pg.goto('http://localhost:8123/index.html')`, wait ~2 s, `pg.evaluate("OS.open('Games')")`, find the app frame with `[f for f in pg.frames if 'Games.html' in f.url][0]`, drive DOM, `pg.screenshot(path)`, collect `pageerror`. Set prefs for layout tests with `OS.prefs.set('layout',[...]); OS.shell.relayout()`. Firebase/Google hosts are unreachable offline (expected `ERR_NAME_NOT_RESOLVED` console noise; play is signed-out). Pure libs: `node tests/<name>.test.js`. Syntax check: `node -e "new Function(require('fs').readFileSync(f,'utf8'))"`.

## 10. Delivery checklist
1. Edit under `os/`, `apps/`, `data/` only. 2. Syntax-check + headless-run the feature. 3. `zip -q out.zip <changed files>` from repo root (paths relative to root). 4. Reply: what changed, tested vs untested, files to delete, any required Firebase rules change (full JSON). 5. If behaviour changes in a durable way, update this file.

## 11. Gotchas learned
- Games/Arcade tiles must not use raw emoji (blank boxes on emoji-less systems) → use `osEmoji`/glyph names; `osIcon` falls back to a dot for unknown names.
- Single-script, shared state: one thrown error in a kernel module can kill later code — wrap listener bodies in try/catch.
- Don't replace in-memory state wholesale when an async fetch resolves (loses actions taken meanwhile); use pending-save flags and MAX-merges for ticking counters.
- Timers in background tabs are throttled: catch up using elapsed wall time, flush saves on `visibilitychange`/`pagehide`.
- Deterministic systems (market, news, property prices, world.js) must stay seed/clock-pure so every client and the Action agree.
- Window iframes are `pointer-events:none` while dragging/resizing; apps must clean up subscriptions on `pagehide`.

## 12. Future ideas (for later consideration — not started, owner hasn't approved)
**Moving off plain JavaScript.** Browsers only run JS and WebAssembly (WASM), so "another language" means one of these:
- **TypeScript + Vite (best next step):** types would catch whole classes of bugs here (missing `K.maint`, stale money fields, wrong facade names). Needs a build step; a GitHub Action can build and publish to Pages (still free). Would break the current "no build step, owner drag-drops files" workflow, so migrate only if the owner agrees; keep the `OS` facade / kernel-app split.
- **Rust (or C++/Zig) → WASM, only for hot maths:** WestLab chem/force-field (`os/lib/chem.js, phys.js, ff.js`), market model, factory catch-up loop. Not for UI (WASM can't touch the DOM directly). Do it only if profiling shows these are slow.
- **WebGL/WebGPU:** only if we add lots of moving graphics (particles, big animated flow diagrams). WebGPU support is still uneven.
- **UI framework (Svelte/Solid/React):** only worth it if the apps grow much larger or update very often.
- Note: the window-drag lag was rendering cost (backdrop blur, big shadows), not JS speed — fixed with the `.moving` / `perf-low` CSS and the Graphics setting, so a language rewrite would not have helped there.
Suggested order if ever pursued: (1) TypeScript + Vite + Action deploy, (2) Rust/WASM for WestLab maths only if slow, (3) leave the rest alone.
