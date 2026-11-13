/* Optional drop-in art for the 3D engine. Put PNG/JPG files in assets/3d/textures/ and OBJ files in assets/3d/models/, then list them here.
 * Nothing in this file is required: every texture has a procedural fallback, so the site works with this list empty. See assets/3d/README.md.
 * Load it from an app with:  <script src="../assets/3d/manifest.js"></script>  after gl3d-assets.js, then call  GL3DAssets.useFiles('../assets/3d/textures/', ASSETS_3D.textures). */
const ASSETS_3D = {
  textures: { /* felt: 'felt.png', wood: 'oak.jpg', metal: 'brushed.png', carpet: 'carpet.png', neonGrid: 'grid.png', cardBack: 'cardback.png', coin: 'coin.png', die: 'die-atlas.png', reel: 'reel-strip.png', card12: 'queen-of-hearts.png' */ },
  models: { /* chair: 'chair.obj' */ }
};
