# 3D assets for WestOS

The site ships its own small WebGL engine (`os/lib/gl3d.js`) plus a procedural art library (`os/lib/gl3d-assets.js`). **Nothing here is required** — every texture and model is painted/built in the browser, so the site stays tiny and works offline. Put files in this folder only when you want real art.

```
assets/3d/
  textures/   PNG / JPG (any size; powers of two — 256, 512, 1024 — repeat and mip-map best)
  models/     Wavefront .obj (Y-up, ≤ 65 535 vertices per file, v / vt / vn / f)
  manifest.js list of what you added (optional)
```

## Replace a built-in texture
```html
<script src="../os/lib/gl3d.js"></script><script src="../os/lib/gl3d-assets.js"></script><script src="../assets/3d/manifest.js"></script>
<script>GL3DAssets.useFiles('../assets/3d/textures/', ASSETS_3D.textures)</script>
```
Names you can override: `felt wood metal carpet neonGrid cardBack coin die reel card0…card51`. The procedural texture shows first and is swapped in place when your file arrives.

## Use a model
```js
const mesh = await GL3D.loadOBJ('../assets/3d/models/chair.obj', { scale: .01 });
const tex  = await GL3D.loadTexture('../assets/3d/textures/chair.png');
const node = eng.node(mesh, GL3D.material({ map: tex }), 0, 0, 0); node.castShadow = true;
```

## Make a 3D minigame in 10 lines
Copy `apps/games/_template3d.js`, add it to `apps/games/manifest.js` and a row to `GameScoring.TABLE`. The Games app gives every game `api.gl3d(content, {w,h,bg,fog})` → an engine (or `null` without WebGL). The loop stops by itself when the game leaves the page.

## Use 3D in any other app
```js
await Kit.use3D();                       // loads GL3D, GL3DAssets, Arcade3D on demand (resolves false when WebGL is off)
const cv = document.createElement('canvas'); host.appendChild(cv);
const eng = GL3D.create(cv, { bg:[.05,.04,.1] }); if(!eng) return /* 2D fallback */;
eng.camera.set([0,3,6],[0,0,0]);  eng.node(GL3D.mesh.sphere(1), GL3D.material({ color:[1,.5,.2,1] }));  eng.start();
```

## Cheat sheet
| What | How |
|---|---|
| Shapes | `GL3D.mesh.plane / quad / box / roundedBox / cylinder / sphere / torus / lathe / disc` |
| Materials | `GL3D.material({ color, map, bump, bumpK, emap (glow map), emissive, spec, shine, refl, unlit, blend:'none'\|'blend'\|'add', alphaCut, cull, uv:[sx,sy,ox,oy] })` |
| Textures | `GL3DAssets.tex.felt() / wood() / metal() / carpet() / neonGrid() / label(text) / cardFace(0..51) / cardBack() / chipTop() / reelStrip() / backdrop()` |
| Models | `GL3DAssets.model.card / chip / chipPile / coin / die / table / labelPlane / sprite` |
| Lights | `eng.lights.dir`, `eng.lights.points` (max 4), `sky` / `ground` ambient; `eng.shadow` (planar shadows on y = `eng.shadow.y`) |
| Motion | `eng.onUpdate = (dt,t) => …`; `await eng.tween(ms, k => …, 'outBack')`; `eng.particles({shape:'glow'\|'square'\|'star'\|'dot'})` |
| Input | `eng.ray(x,y)`, `eng.pick(x,y)` (set `node.pickable = true`), `eng.rayPlane(ray, y)` |
| Quality | pass `quality:'low'` (no shadows, dpr 1) — the Games/Arcade helpers already follow Settings → Graphics |

## Themes in 3D
Every engine is re-coloured by the active WestOS theme automatically (sky / fog / light colours, a backdrop gradient, snow or embers) — see `os/themes/README.md`. Procedural textures and models are untouched. Opt a scene out with `GL3D.create(canvas, { skin:false })`.
