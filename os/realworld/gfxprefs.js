/* REALWORLD · gfxprefs — every real-world graphics setting, the presets, and how a saved choice turns into the numbers the engine uses. PURE (no DOM, no engine).
 *   Used by game.js (applies them) and by apps/Settings.html (the Graphics page). Stored in ONE pref, `rwGfx` = { p: 'auto'|'low'|'medium'|'high'|'ultra'|'custom', o: { …your custom values… } }.
 *   Changing any single value in Settings switches `p` to 'custom'; picking a preset keeps your custom values safe for later.
 * EXTEND: add a field to FIELDS + a value in every PRESETS entry, then read it in game.js applyGfx(). */
(function(root){
  const PRESETS = {
    low:    { shadows: 0, shadowSize: 1024, refl: 0, dpr: 1,    view: 14, props: 380, npc: 170, car: 360, fov: 72, adaptive: 1, aa: 1 },
    medium: { shadows: 0, shadowSize: 1024, refl: 1, dpr: 1.5,  view: 21, props: 570, npc: 230, car: 480, fov: 72, adaptive: 1, aa: 1 },
    high:   { shadows: 0, shadowSize: 2048, refl: 1, dpr: 2,    view: 28, props: 700, npc: 280, car: 600, fov: 72, adaptive: 1, aa: 1 },
    ultra:  { shadows: 1, shadowSize: 2048, refl: 1, dpr: 2,    view: 32, props: 820, npc: 320, car: 700, fov: 72, adaptive: 1, aa: 1 }
  };
  const TIERS = ['low', 'medium', 'high', 'ultra'], ORDER = ['auto', 'low', 'medium', 'high', 'ultra', 'custom'];
  const LABEL = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' };
  /* type: bool | range | select. `fmt` turns a value into the text shown next to the control. */
  const FIELDS = [
    { group: 'Image', k: 'dpr', label: 'Render resolution', sub: 'Sharpness. Lower it for a big frame-rate gain on slow GPUs.', type: 'range', min: 0.5, max: 2, step: 0.25, fmt: v => Math.round(v * 100) + '%' },
    { group: 'Image', k: 'aa', label: 'Anti-aliasing', sub: 'Smooth edges. Applies the next time the page is loaded.', type: 'bool' },
    { group: 'Image', k: 'fov', label: 'Field of view', sub: 'How wide the camera sees.', type: 'range', min: 60, max: 100, step: 2, fmt: v => v + '°' },
    { group: 'Light', k: 'shadows', label: 'Sun shadows', sub: 'Real shadows from the sun (daytime, outdoors). Heavy.', type: 'bool' },
    { group: 'Light', k: 'shadowSize', label: 'Shadow sharpness', sub: 'Only used when sun shadows are on.', type: 'select', opts: [[1024, 'Soft'], [2048, 'Sharp'], [4096, 'Very sharp']] },
    { group: 'Light', k: 'refl', label: 'Reflections & gloss', sub: 'Shiny paint, wet-look sea and sky glints.', type: 'bool' },
    { group: 'Distance', k: 'view', label: 'World view distance', sub: 'How far the land is drawn (far land is simplified automatically).', type: 'range', min: 4, max: 32, step: 1, fmt: v => (v * 0.128).toFixed(1) + ' km' },
    { group: 'Distance', k: 'props', label: 'Trees & street furniture', sub: 'How far trees, lamps and benches are drawn.', type: 'range', min: 150, max: 1000, step: 50, fmt: v => v + ' m' },
    { group: 'Distance', k: 'npc', label: 'People distance', sub: 'How far away people are drawn.', type: 'range', min: 60, max: 400, step: 10, fmt: v => v + ' m' },
    { group: 'Distance', k: 'car', label: 'Traffic distance', sub: 'How far away cars are drawn.', type: 'range', min: 120, max: 800, step: 20, fmt: v => v + ' m' },
    { group: 'Performance', k: 'adaptive', label: 'Keep it smooth automatically', sub: 'Lowers resolution and view distance if the frame rate drops, and raises them again when there is room. Off = exactly what you set.', type: 'bool' }
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /* make any stored object safe: unknown keys dropped, numbers clamped to the field's range, booleans as 0/1 */
  function clean(o, base){
    const out = Object.assign({}, base || PRESETS.medium); if(!o || typeof o !== 'object') return out;
    FIELDS.forEach(f => { if(!(f.k in o)) return; let v = o[f.k];
      if(f.type === 'bool') out[f.k] = v ? 1 : 0;
      else if(f.type === 'range'){ v = +v; if(isFinite(v)) out[f.k] = clamp(Math.round(v / f.step) * f.step, f.min, f.max); }
      else if(f.type === 'select'){ v = +v; if(f.opts.some(x => x[0] === v)) out[f.k] = v; } });
    return out;
  }
  /* what is saved (rwGfx, or the old rwQuality string) → { p, o } */
  function read(pref, legacy){
    if(pref && typeof pref === 'object' && ORDER.includes(pref.p)) return { p: pref.p, o: clean(pref.o, PRESETS.high) };
    if(typeof legacy === 'string' && PRESETS[legacy]) return { p: legacy, o: clean(null, PRESETS.high) };
    return { p: 'auto', o: clean(null, PRESETS.high) };
  }
  /* the numbers in force. `tier` (0-3) is the level Auto has chosen. */
  function resolve(sel, tier){
    if(sel.p === 'custom') return clean(sel.o, PRESETS.high);
    if(sel.p === 'auto') return Object.assign({}, PRESETS[TIERS[clamp(tier == null ? 1 : tier, 0, 3)]]);
    return Object.assign({}, PRESETS[sel.p] || PRESETS.medium);
  }
  /* which preset a set of values equals exactly (or null) — lets the panel say "Medium" instead of "Custom" */
  const matches = o => TIERS.find(t => FIELDS.every(f => PRESETS[t][f.k] === o[f.k])) || null;
  const api = { PRESETS, TIERS, ORDER, LABEL, FIELDS, clean, read, resolve, matches };
  root.RealWorld = root.RealWorld || {}; root.RealWorld.GfxPrefs = api; if(typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
