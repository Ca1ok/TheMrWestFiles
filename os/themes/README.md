# WestOS themes

Every theme is one small file in this folder. The engine (`engine.js`) knows nothing about specific themes; `runtime.js` plugs it into WestOS.

## Add a theme (3 steps)
1. Copy `christmas.js` (a date-based theme) or one block of `manual.js` (a pick-it-yourself theme) and change `id`, `name`, colours.
2. Add one line to `index.html`, next to the other theme files: `<script src="os/themes/<yourfile>.js?v=…"></script>`.
3. Done — it appears in **Settings → Themes**. Dates, wallpaper, 3D scenes, snow/embers all follow from the definition. (Optional: CSS-only extras in `os/skins.css` under `html[data-skin="<id>"]`.)

## A theme definition
```js
WestThemes.register({
  id: 'my-theme',                 // lowercase letters, digits, dashes — saved in the player's prefs, never rename it later
  name: 'My theme', blurb: 'One line for the picker.',
  mode: 'dark',                   // 'dark' | 'light' — which base the tokens sit on (menu bar, maps, apps follow this)
  swatch: ['#hex', '#hex', '#hex'],// three dots shown on the picker card
  schedule: { from:[11,19], to:[11,26], years:[2026] },   // OPTIONAL — makes it automatic. See below.
  priority: 10,                   // OPTIONAL — if two scheduled themes overlap, the higher number wins
  vars: { '--bg':'#…', '--card':'#…', '--label':'#…', '--tint':'#…', … },   // same names as os/tokens.css; leave one out and the base theme's value is used
  wall: 'linear-gradient(…)',     // OPTIONAL default wallpaper (any CSS `background`). A wallpaper the player chose themselves always wins.
  three: { k:.6, bg:'#…', fog:'#…', sky:'#…', ground:'#…', dir:'#…', point:'#…', backdrop:[[0,'#…'],[1,'#…']], stars:true },   // OPTIONAL — see "3D"
  fx: { kind:'snow' | 'embers', colors:['#fff'], rate:34, size:.011, fall:.15, dir:-1, shape:'glow', blend:'blend', alpha:.9 }   // OPTIONAL particles
});
```

## Dates
* `{ from:[month,day], to:[month,day] }` — both days included. Wrapping the new year (`from:[12,18], to:[1,1]`) works.
* `{ anchor:[12,25], before:7, after:7 }` — N days either side of a date.
* `years:[2026]` — only windows that start in that year (a one-off event). Leave it out to repeat yearly.
* Times use the player's local midnight. The site re-checks every minute, so a window opens/closes without a reload.
* **Preview any day without waiting:** `index.html?skindate=2026-12-24`, or force a theme: `index.html?skin=gta6`.

## What players control (Settings → Themes)
* **Theme**: *Automatic* (follows the calendar; falls back to Classic light/dark), *Classic*, or any theme by hand (even a seasonal one, any time).
* **Accent colour** — overrides the theme's `--tint` everywhere.
* **Snow & sparkle effects** — turns the particles off (also off with Reduce motion).
* Prefs: `skin`, `seasonal`, `accent`, `skinFx` (all in `K.prefs`, synced like the other UI prefs).

## 3D
`gl3d.js` asks `OS.skin3d()` every frame and blends it over whatever the scene set (so every scene — casino, WestLab, WestFactory, the minigames — re-colours with no per-scene code):
* `bg`, `fog`, `sky`, `ground`, `dir` (sun colour), mixed into the scene by `k` (0 = ignore the theme … 1 = fully replace).
* `point` — tints the scene's coloured point lights by `pk`.
* `backdrop` — gradient stops painted behind the scene (`stars:true` adds stars).
* `fx` — ambient particles (snow, embers) around the camera target; scales with camera distance, so it works at any scene size.
A scene can opt out with `GL3D.create(canvas, { skin:false })`.

## Files
`engine.js` (pure; tested in `tests/themes.test.js`) · `runtime.js` (kernel glue, desktop particles, 1-minute clock) · one file per theme · `../skins.css` (CSS-only extras) · Settings → Themes (`apps/Settings.html`) · `../app/kit.js` (applies a theme inside every app) · `../lib/gl3d.js` (3D grade).
