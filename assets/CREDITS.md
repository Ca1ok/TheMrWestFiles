# Kenney asset library — credits

All 3D models in this folder, and the baked copies in `assets/world/kenney/`, are by **Kenney** — <https://www.kenney.nl> (support him: <https://www.patreon.com/kenney>).
They are released under **Creative Commons CC0 1.0 (public domain)**, so credit is not required — it is given here because the work deserves it. Each pack keeps its own `License.txt`.

Packs used by the realworld (see `assets/world/manifest.json`):

| Pack | Used for |
|---|---|
| City Kit (Suburban) | the houses, the two tree models |
| City Kit (Commercial) | apartments, shops, bank, hall, university, downtown towers |
| City Kit (Industrial) | laboratory, freight depot, power plant |
| City Kit (Roads) | street lamps |
| Car Kit | NPC traffic (8 models) |
| Blocky Characters | people and players (8 of the 18 characters) |
| Furniture Kit, Mini Arcade | benches, plants, sofas, beds, arcade and claw machines |

The other packs are kept in `assets/kenney/` for future use. Only the `.glb` models, their palette textures, licences and previews are included (the FBX/OBJ/DAE/STL copies were left out to keep the repo small — they are in the original download from kenney.nl).

The game does **not** load these originals at runtime. `tools/bake-kenney.py` converts them into `assets/world/kenney/` (palette texture → vertex colours, scaled, oriented, with a lighter LOD 1 of each model) — see `assets/world/README.md`.
