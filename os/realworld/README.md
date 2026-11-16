# The real world (3D, first person)

Close WestOS with the red ✕ left of "WestOS" in the menu bar and you are standing in WestCountry: the same city the WestMap shows, walkable.
Phone button / `P` brings WestOS back as your phone; ✕ again returns to the street. `M` = WestMap (click a spot, click the pin again, you are there). `E` = use / open doors. Touch screens get a stick + buttons.

## Why it is cheap
* **Nothing is downloaded.** No models, no textures. Every street, building, tree and hill is generated: the street plan by `layout.js`, building shapes by `os/lib/buildgen.js`, the roster/timetable by `os/lib/worldgen.js`. (The 3D street layout is independent of the 2D map; the map is meant to follow it later.)
* **Only `boot.js` (~2 KB) ships with WestOS.** The engine (~110 KB JS+CSS) is fetched the first time someone steps outside, then cached.
* **Network**: other players are one ~60-byte record each, written ≤1×/s, sharded in 256 m cells (`world/rt/<cell>/<uid>`), you only listen to the 3×3 cells around you. NPCs are never networked (pure timetable).
* **CPU + GPU**: chunk meshes are built in Web Workers (1–3, `worker.js`) while the main thread only uploads (≤2 per frame) and draws; people/cars are instanced (1 draw call each, walk cycle in the vertex shader); each chunk is ONE draw call, frustum-culled.
* **LOD**: 4 levels per chunk (see header of `chunkgen.js`), chosen by distance in `streamer.js`, cross-faded with a dither (no popping); chunks fade in; skirts hide seams. Dynamic resolution + view distance keep ~50 fps on weak GPUs (`adapt()` in `game.js`); `perf-low` mode (Settings) uses 1× pixels, no MSAA and a shorter view.

## One city, one place to edit
**WestMap is this engine seen from above.** `apps/WestMap.html` loads the same `layout.js → chunkgen.js → worker.js → streamer.js → gfx.js` and draws the city with an orbit camera (`mapview.js`). Change a building, road, park, tree or bench in `chunkgen.js` / `os/lib/buildgen.js` / `layout.js` / `props.js` and the first-person world **and** the map both change — there is no second copy. Positions of houses, landmarks, plots, people and districts in WestMap come from `layout.js` (adapter `G` at the top of the app's script); WorldGen only supplies *what* things are.
* Map level of detail: LOD 0–1 close, 2–3 mid, **LOD 4 = map level** (every road + building as a plain shape, ≈ 4–14 KB per chunk) for the whole-city view; chosen from the *eye* distance, frustum-culled, LRU-cached (`streamer.js` `updateView`).
* Fast travel: first click drops a pin (`Nav.safeSpot` moves it out of buildings/ponds), clicking the pin again / `Enter` / "Travel here" calls `OS.realworld.travelTo(x, z, yaw)` — works from the desktop too (it steps outside at that spot). `M` closes the map again, `Esc` clears the pin.

## Seamless interiors, stairs, physics
* **No loading doors.** `cells.js` builds a building's inside *in place* (world coordinates) when you come within ~32 m of an enterable door (landmarks; your home / a rented house; your plots) and drops it beyond ~62 m. The cell replaces the building's solid collision box by a hollow shell with a doorway, so you just walk in. Closed buildings cost nothing; inside, only that cell + its clerks + its screens are drawn, with indoor lighting (`gfx.env = Env.INDOOR` for the cell pass only — the street stays visible/lit outside).
* Rooms (`interiors.js`) are built at their own size; `Cells.make` slides the doorway to the real door, shrinks the room sideways to the footprint if needed (never in height) and moves everything to world space. Several floors: `r.at(y)`, `r.slab(y, hole)`, `r.stairs(x, z0, width, rise)` (homes with 2–3 storeys, the Library mezzanine).
* **`phys.js`** is the collision world: boxes/cylinders *with a height* (stride-8 chunk colliders, stride-10 cell colliders), 0.55 m step-up (kerbs, stair treads, bench seats), standing on whatever is under you, head-bumps, glued to stairs on the way down. Why not a triangle BVH (three-mesh-bvh / Rapier)? Every solid here is a turned box or cylinder, so queries are analytic and the streamer is already the spatial partition; a BVH would only add a dependency. `tests/realworld-phys.test.js` + `tests/realworld-cells.test.js`.

## Instanced props and `.glb` models
Trees, street lamps and benches are **instanced**: the chunk worker only emits 32-byte instances, `streamer.drawProps()` draws one instanced call per (kind, LOD) with a distance dither and wind sway. Procedural placeholders live in `props.js`; to use a model drop a `.glb` in `assets/world/` and list it in `assets/world/manifest.json` (see `assets/world/README.md`). Nothing is downloaded unless the manifest names a file.

## Files
| file | job |
|---|---|
| `boot.js` | OSM module: ✕ button, `OS.realworld`, lazy loader |
| `layout.js` | THE STREET PLAN: lattice of blocks bent by one smooth warp; streets, lots, houses, landmarks, plots, trees, lamps, street routing (pure) |
| `terrain.js` | `height(x,z)`: rolling hills, with the city on a flat plateau (pure) |
| `mesh.js` | vertex-colour mesh builder (box/cyl/cone/ribbon/poly), glow flag |
| `chunkgen.js` | one 128 m chunk → mesh + colliders + doors, per LOD (pure; used by worker, Node tests, fallback) |
| `worker.js` | runs `chunkgen` off the main thread |
| `streamer.js` | which chunks, which LOD, worker queue, uploads (count + byte budget), fades; walk mode (player) and view mode (map); instanced-prop batching |
| `phys.js` | collision world for the player (heights, stairs, floors, ceilings) — pure |
| `cells.js` | seamless interiors: place a room into the real building, load/unload by distance |
| `props.js` | instanced scenery templates (tree, lamp, bench) + LOD rules |
| `glb.js` | `.glb` reader + `assets/world/manifest.json` loader |
| `nav.js` | districts, nearest place, safe landing spots, arrival poses — shared by the game and WestMap (pure) |
| `mapview.js` | WestMap's renderer: orbit camera on this engine + 2D overlay (pins, labels, people) |
| `gfx.js` | WebGL 2: world/actor/sky/particle shaders, culling |
| `env.js` | sky/sun/fog from the world clock (night = the NPCs' sleeping hours), graded by the active theme |
| `interiors.js` | the rooms (registry of builders + tiny Room DSL): clerks (`npc` with services) and wall screens |
| `screens.js` | live information screens on walls (canvas → texture): prices, news, balance, leaderboard… |
| `npcs.js` | townspeople routes along the streets from the shared timetable |
| `net.js` | other players (presence) |
| `game.js` | player, physics, doors, cells, NPCs, HUD, input, map/travel, loop |
| `realworld.css` | styles (loaded with the engine) |

## Extending
* **New enterable landmark**: (it is walk-in automatically) add its block to `POI_BLOCK` in `layout.js`, a line to `BUILDINGS` in `game.js`, and `RealWorld.Interiors.register('kind', c => { const r = new Room(w, d, h, {...}); r.npc(x, z, yaw, 'Name', 'greeting', shirt, pants, [{ label: 'Open the shop', app: 'WestShop' }]); r.screen('news', x, y, z, w, h, 'e'); return r; })`. Apps are reached through clerks (E → dialogue → option → `OS.open`); wall screens are read-only (`screens.js`).
* **Street plan / look of the city**: `SU`, `SV`, the warp, `POI_BLOCK`, `ZONE_BLOCKS` in `layout.js`. Anything placed through the lattice keeps its margins from the streets, so it cannot clip (`tests/realworld.test.js` checks this at 512 and 3000 houses).
* **New LOD / longer view**: `RES`, `RAISE`, `SK` in `chunkgen.js` + `LOD_AT` in `streamer.js`; `RealWorld.config.radius`.
* **Look**: `env.js` (palette), `COMMON` shader in `gfx.js` (lighting/fog/glass), colours in `chunkgen.js` (`C`).
* **Movement feel**: `RealWorld.config` (walk, run, jump, sens, fov).
* **New actor kind** (bikes, dogs): add a mesh in `actorMeshes()` (gfx.js) and a buffer in `fillActors()`.
* Debug: `RealWorld.timeShift = ms` (move the clock), `RealWorld.botSource = async () => map` (fake NPC roster), `OS.realworld.state()` (fps, chunks, calls, tris).

## Rules
`world/rt` is generated by `tools/build-rules.js` (tested in `tests/rules.test.js`). Without the rule players simply don't see each other; everything else works. Tests: `node tests/realworld.test.js tests/realworld-phys.test.js tests/realworld-cells.test.js tests/realworld-glb.test.js` (each separately).

## Vehicles (car dealership + private airport)
`vehicles.js` (pure) decides where every car and plane stands (showroom models, plus your own garage from `OS.homes.garage()`); `game.js` draws them instanced (`gfx.actors(style)`), makes them solid and lets E open the Assets app. Buying happens in the Assets app while you stand at the dealership / airport (`OS.realworld.at(id)`). Driving/flying is NOT implemented: see `RWVehicles.canDrive()` and the `drive` / `fly` numbers in `data/vehicle-data.js`. Test: `node tests/vehicles.test.js`.
