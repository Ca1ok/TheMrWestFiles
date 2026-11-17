# World models (.glb)

## Kenney models (baked) — what ships now

The realworld's buildings, trees, street lamps, benches, cars, people and a few pieces of interior furniture are **Kenney's CC0 asset library** (<https://www.kenney.nl>, see `assets/kenney/CREDITS.md`).
The library itself lives in `assets/kenney/`; the game only loads the **baked** copies in `assets/world/kenney/`, listed in `manifest.json` (version 2).
Both are generated — **never edit them by hand**; run `python3 tools/bake-kenney.py` (Pillow + numpy) from the repo root after changing the tool or the library.

What the bake does: the world shader is vertex-colour only, so each model's palette texture is sampled into vertex colours; models are turned so their **front faces −Z**, scaled to metres, centred and put on y = 0; a lighter **LOD 1** is made for every model (colour-aware vertex clustering); window glass is flagged to glow at night; building **doors** come from the `DOORS` table in the tool (entrance x per model, read off renders). Each `.glb` is 20-byte vertices (the engine's own format) with `asset.extras.rwSrgb`.

| manifest section | used by | LOD |
|---|---|---|
| `props` (`tree` ×2 variants, `lamp`, `bench`) | `props.js` / `streamer.drawProps` (instanced; a tree variant is picked by the instance seed; lamps are turned to face the street by `layout.js`) | LOD 0 near, LOD 1 far |
| `buildings` (`house` ×21, `mid` ×14, `tower` ×5, `industrial`) | `chunkgen.js` via `models.js` — houses, the 10 landmarks (`POI_MODEL`), downtown towers. The model is scaled to fit the footprint; door/interior/collider follow the model | chunk LOD 0 = full, LOD 1 = lighter, 2–3 = boxes as before |
| `cars` (8) | `game.js drawCars` (instanced props) | near mesh < 90 m, lighter beyond |
| `people` (8) + `peoplePivot` | `gfx.setActorModel` (same walk-cycle shader, baked colours) | one mesh (72 tris) |
| `furniture` (plant, sofa, bed, arcade, claw) | `Room.model()` in `interiors.js` | — |

If the manifest or a file is missing, the procedural original is drawn (nothing depends on the models). Buildings are loaded inside the chunk worker; everything else on the main thread (`Assets.load`).

## Own models (optional)

The world runs with **no files here**: every prop is generated (`os/realworld/props.js`). To replace one with a model:

1. Export a **binary glTF (.glb)** from Blender (`File → Export → glTF 2.0`, format *glTF Binary*, **no compression**, *+Y up*). Origin at the ground, front facing −Z (north). Metres.
2. Colour comes from the **material's base colour** (and *Emission* → glows at night, like lamp heads). Textures are not used (the world shader is vertex-colour only) — give each colour its own material. Keep it small: a tree ≈ 100–400 triangles, a lamp ≈ 50.
3. Put the file in `assets/world/props/` and list it in `manifest.json`:
```json
{ "version": 1, "props": {
  "tree":  { "glb": "props/tree.glb",  "lod1": "props/tree_far.glb", "height": 7 },
  "lamp":  { "glb": "props/lamp.glb",  "height": 5 },
  "bench": { "glb": "props/bench.glb" } } }
```
`lod1` (optional) is used for chunks 3–4.6 chunk-widths away. `height` rescales the model to that many metres. Kinds are `tree`, `lamp`, `bench` (add more in `props.js`: a `KINDS` entry + a `build` placeholder + the chunk emitting it in `chunkgen.js`). (Instance-tinted foliage is only available to the built-in placeholder trees.)

Draco-compressed files are refused with a message. Meshopt-compressed files work if `meshopt_decoder.js` is loaded first (untested here). A model that fails to load is skipped and the procedural prop stays.
