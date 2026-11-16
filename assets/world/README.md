# World models (.glb) — optional

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
