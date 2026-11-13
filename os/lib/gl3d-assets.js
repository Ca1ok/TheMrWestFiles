/* GL3DAssets — procedurally generated textures and ready-made models for GL3D. Nothing is downloaded: every texture is painted on a <canvas> the first
 * time it is asked for (then cached), so the site stays tiny and works offline.
 *
 *   const T = GL3DAssets.tex;               T.felt('#0e6b3a')  → { map, bump }   T.wood()  T.metal('#c9ccd4')  T.carpet()  T.neonGrid('#27e8ff')  T.label('HELLO', { glow:'#f0f' })
 *   const card = GL3DAssets.model.card(12)  → Node (a playing card, face up on the +Z side)      GL3DAssets.model.chip('#c0392b', 25)   GL3DAssets.model.die()   GL3DAssets.model.coin()
 *
 * DROP-IN REPLACEMENTS: put a real PNG/JPG in assets/3d/textures/ and register it once —  GL3DAssets.useFiles('../assets/3d/textures/', { felt:'felt.png', wood:'oak.jpg' })
 * — the procedural texture is used until the file arrives and is then swapped in place (same Texture object, so nothing else has to change). OBJ models: GL3DAssets.loadModel('name', url).
 * Texture sizes are powers of two so they repeat and mip-map. All colours are CSS strings; materials take [r,g,b,a] 0..1 (use GL3DAssets.rgb('#ff8800')). */
(function(root){
  'use strict';
  const GL = root.GL3D || (typeof require !== 'undefined' ? require('./gl3d.js') : null); if(!GL) throw new Error('GL3DAssets needs GL3D loaded first');
  const TAU = Math.PI * 2, cache = {}, files = {}, models = {}, named = {};
  const once = (k, f) => cache[k] || (cache[k] = f());
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const rgb = (css, a) => { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = css; const s = g.fillStyle; if(s[0] === '#'){ const n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, a == null ? 1 : a]; } const m = s.match(/[\d.]+/g) || [255, 255, 255]; return [m[0] / 255, m[1] / 255, m[2] / 255, a == null ? (m[3] == null ? 1 : +m[3]) : a]; };
  const tex = (c, o) => { const t = new GL.Texture(c, o); return t; };
  function swap(t, url){ GL.loadImage(url).then(im => { t.src = im; t.update(); }).catch(() => {}); }
  function reg(name, texture){ (named[name] = named[name] || []).push(texture); if(files[name]) swap(texture, files[name]); return texture; }
  function useFiles(base, map){ Object.keys(map).forEach(k => { files[k] = base + map[k]; (named[k] || []).forEach(t => swap(t, files[k])); }); }
  function loadModel(name, url, o){ return GL.loadOBJ(url, o).then(m => { models[name] = m; return m; }); }

  /* ------------------------------ painted surfaces ------------------------------ */
  function noiseData(w, h, fn){ const [c, g] = mk(w, h), im = g.createImageData(w, h), d = im.data; for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ const k = (y * w + x) * 4, v = fn(x, y); d[k] = v[0]; d[k + 1] = v[1]; d[k + 2] = v[2]; d[k + 3] = v[3] == null ? 255 : v[3]; } g.putImageData(im, 0, 0); return c; }
  function felt(color){ color = color || '#0e6b3a'; return once('tex:felt:' + color, () => { const R = rgb(color), r = rng(7), N = 512, h = new Float32Array(N * N);
    for(let i = 0; i < N * N; i++) h[i] = r();
    const blur = () => { const o = new Float32Array(N * N); for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){ let s = 0; for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++) s += h[((y + dy + N) % N) * N + (x + dx + N) % N]; o[y * N + x] = s / 9; } return o; }, b = blur();
    const map = noiseData(N, N, (x, y) => { const v = .82 + (h[y * N + x] - .5) * .12 + (b[y * N + x] - .5) * .3; return [R[0] * 255 * v, R[1] * 255 * v, R[2] * 255 * v]; });
    const bump = noiseData(N, N, (x, y) => { const v = (h[y * N + x] * .6 + b[y * N + x] * .4) * 255; return [v, v, v]; });
    return { map: reg('felt', tex(map)), bump: tex(bump) }; }); }
  function wood(base){ base = base || '#6b3f1f'; return once('tex:wood:' + base, () => { const R = rgb(base), r = rng(21), N = 512, [c, g] = mk(N, N), [bc, bg] = mk(N, N);
    g.fillStyle = base; g.fillRect(0, 0, N, N); bg.fillStyle = '#808080'; bg.fillRect(0, 0, N, N);
    for(let i = 0; i < 260; i++){ const y0 = r() * N, amp = 2 + r() * 8, f = .004 + r() * .012, ph = r() * 9, lw = .6 + r() * 2.6, dark = r() < .55, a = .05 + r() * .22; g.strokeStyle = dark ? 'rgba(20,8,0,' + a + ')' : 'rgba(255,200,140,' + a * .7 + ')'; g.lineWidth = lw; g.beginPath(); for(let x = 0; x <= N; x += 8){ const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * .3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      bg.strokeStyle = dark ? 'rgba(0,0,0,' + a * 1.2 + ')' : 'rgba(255,255,255,' + a + ')'; bg.lineWidth = lw; bg.beginPath(); for(let x = 0; x <= N; x += 8){ const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * .3; x ? bg.lineTo(x, y) : bg.moveTo(x, y); } bg.stroke(); }
    const gr = g.createLinearGradient(0, 0, N, 0); gr.addColorStop(0, 'rgba(0,0,0,.12)'); gr.addColorStop(.5, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.12)'); g.fillStyle = gr; g.fillRect(0, 0, N, N);
    return { map: reg('wood', tex(c)), bump: tex(bc) }; }); }
  function metal(base){ base = base || '#b9bec8'; return once('tex:metal:' + base, () => { const r = rng(5), N = 512, [c, g] = mk(N, N), [bc, bg] = mk(N, N); g.fillStyle = base; g.fillRect(0, 0, N, N); bg.fillStyle = '#808080'; bg.fillRect(0, 0, N, N);
    for(let i = 0; i < 1500; i++){ const y = r() * N, l = 40 + r() * 300, x = r() * N, a = r() * .16, w = r() < .5; g.fillStyle = w ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; g.fillRect(x, y, l, 1); bg.fillStyle = w ? 'rgba(255,255,255,' + a * 2 + ')' : 'rgba(0,0,0,' + a * 2 + ')'; bg.fillRect(x, y, l, 1); }
    return { map: reg('metal', tex(c)), bump: tex(bc) }; }); }
  /* the loud arcade carpet: dark navy with neon squiggles, rings and triangles; tiles seamlessly */
  function carpet(){ return once('tex:carpet', () => { const N = 512, [c, g] = mk(N, N), cols = ['#ff3df2', '#27e8ff', '#ffe14d', '#7dff6a'];
    g.fillStyle = '#120a2c'; g.fillRect(0, 0, N, N);
    const draw = (x, y) => { const r = rng(33); for(let i = 0; i < 38; i++){ const px = r() * N, py = r() * N, col = cols[(r() * 4) | 0], k = r(), rot = r() * TAU, sz = r(); g.save(); g.translate(px + x, py + y); g.rotate(rot); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.globalAlpha = .85;
        if(k < .3){ g.beginPath(); g.arc(0, 0, 10 + sz * 10, 0, TAU); g.stroke(); } else if(k < .55){ g.beginPath(); g.moveTo(-16, 10); g.lineTo(0, -14); g.lineTo(16, 10); g.closePath(); g.stroke(); } else if(k < .8){ g.beginPath(); for(let s = 0; s <= 30; s++){ const t = s / 30; s ? g.lineTo(-24 + t * 48, Math.sin(t * 9) * 7) : g.moveTo(-24, 0); } g.stroke(); } else { g.fillRect(-5, -5, 10, 10); } g.restore(); } };
    [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N]].forEach(([x, y]) => draw(x, y)); return { map: reg('carpet', tex(c)) }; }); }
  function neonGrid(color, bg){ color = color || '#27e8ff'; bg = bg || '#0a0620'; return once('tex:grid:' + color + bg, () => { const N = 512, [c, g] = mk(N, N), [ec, eg] = mk(N, N); g.fillStyle = bg; g.fillRect(0, 0, N, N); eg.fillStyle = '#000'; eg.fillRect(0, 0, N, N);
    [[g, 1], [eg, 1]].forEach(([x]) => { x.strokeStyle = color; x.shadowColor = color; x.shadowBlur = 14; x.lineWidth = 5; x.strokeRect(2, 2, N - 4, N - 4); x.lineWidth = 2; x.beginPath(); x.moveTo(N / 2, 0); x.lineTo(N / 2, N); x.moveTo(0, N / 2); x.lineTo(N, N / 2); x.stroke(); });
    return { map: reg('neonGrid', tex(c)), emissive: tex(ec) }; }); }
  function label(text, o){ o = o || {}; const W = o.w || 512, H = o.h || 128, key = 'tex:label:' + text + '|' + JSON.stringify(o); return once(key, () => { const [c, g] = mk(W, H); if(o.bg){ g.fillStyle = o.bg; if(o.radius){ g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, H, o.radius) : g.rect(0, 0, W, H); g.fill(); } else g.fillRect(0, 0, W, H); }
    let size = o.size || H * .6; g.font = (o.weight || 800) + ' ' + size + 'px ' + (o.family || 'ui-monospace,"SF Mono","Courier New",monospace'); while(g.measureText(text).width > W * .92 && size > 10){ size -= 4; g.font = (o.weight || 800) + ' ' + size + 'px ' + (o.family || 'ui-monospace,"SF Mono","Courier New",monospace'); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; if(o.glow){ g.shadowColor = o.glow; g.shadowBlur = H * .14; } g.fillStyle = o.color || '#fff'; g.fillText(text, W / 2, H / 2 + size * .04); if(o.glow){ g.fillText(text, W / 2, H / 2 + size * .04); } return tex(c, { repeat: false }); }); }
  function glow(color){ color = color || '#fff'; return once('tex:glow:' + color, () => { const [c, g] = mk(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, color); gr.addColorStop(.35, color.length === 7 ? color + '88' : color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c, { repeat: false }); }); }
  /* vertical gradient backdrop (sunset arcade sky) with stars */
  function backdrop(stops){ stops = stops || [[0, '#05020f'], [.55, '#1b0b46'], [.8, '#6a1b7a'], [1, '#ff4fa8']]; return once('tex:bd:' + JSON.stringify(stops), () => { const [c, g] = mk(256, 256), gr = g.createLinearGradient(0, 0, 0, 256); stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const r = rng(9); for(let i = 0; i < 90; i++){ const y = r() * 150; g.fillStyle = 'rgba(255,255,255,' + (.2 + r() * .6) + ')'; g.fillRect(r() * 256, y, 1 + (r() < .15 ? 1 : 0), 1); } return tex(c, { repeat: false, mip: false }); }); }

  /* ------------------------------ playing cards ------------------------------ */
  const SUIT_COL = ['#16161d', '#d81f2a', '#d81f2a', '#16161d'], RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  function suit(g, s, x, y, size, color){ const k = size / 2; g.fillStyle = color; g.beginPath();
    if(s === 1){ g.moveTo(x, y + .95 * k); g.bezierCurveTo(x + 1.6 * k, y - .1 * k, x + 1.1 * k, y - 1.05 * k, x, y - .4 * k); g.bezierCurveTo(x - 1.1 * k, y - 1.05 * k, x - 1.6 * k, y - .1 * k, x, y + .95 * k); g.fill(); }
    else if(s === 2){ g.moveTo(x, y - k * 1.05); g.lineTo(x + .72 * k, y); g.lineTo(x, y + k * 1.05); g.lineTo(x - .72 * k, y); g.closePath(); g.fill(); }
    else if(s === 0){ g.moveTo(x, y - .95 * k); g.bezierCurveTo(x + 1.6 * k, y + .1 * k, x + 1.1 * k, y + 1.0 * k, x, y + .4 * k); g.bezierCurveTo(x - 1.1 * k, y + 1.0 * k, x - 1.6 * k, y + .1 * k, x, y - .95 * k); g.fill(); g.beginPath(); g.moveTo(x - .1 * k, y + .3 * k); g.lineTo(x + .1 * k, y + .3 * k); g.lineTo(x + .5 * k, y + 1.05 * k); g.lineTo(x - .5 * k, y + 1.05 * k); g.closePath(); g.fill(); }
    else { [[0, -.5], [-.55, .22], [.55, .22]].forEach(p => { g.beginPath(); g.arc(x + p[0] * k, y + p[1] * k, .48 * k, 0, TAU); g.fill(); }); g.beginPath(); g.moveTo(x - .1 * k, y); g.lineTo(x + .1 * k, y); g.lineTo(x + .5 * k, y + 1.05 * k); g.lineTo(x - .5 * k, y + 1.05 * k); g.closePath(); g.fill(); } }
  const PIPS = { 2: [[1, 0], [1, 6]], 3: [[1, 0], [1, 3], [1, 6]], 4: [[0, 0], [2, 0], [0, 6], [2, 6]], 5: [[0, 0], [2, 0], [1, 3], [0, 6], [2, 6]], 6: [[0, 0], [2, 0], [0, 3], [2, 3], [0, 6], [2, 6]], 7: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [0, 6], [2, 6]], 8: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [1, 4.5], [0, 6], [2, 6]], 9: [[0, 0], [2, 0], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [0, 6], [2, 6]], 10: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4], [1, 5], [0, 6], [2, 6]] };
  function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function cardFace(code){ return once('tex:card:' + code, () => { const [c, g] = mk(256, 512); g.scale(1, 512 / 358); const rank = code % 13 + 2, s = Math.floor((code % 52) / 13), col = SUIT_COL[s], nm = RANK_NAMES[rank - 2], W = 256, H = 358;
    roundRect(g, 3, 3, W - 6, H - 6, 18); const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#ebe7dc'); g.fillStyle = bg; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.28)'; g.stroke();
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    const corner = () => { g.font = '800 ' + (nm === '10' ? 40 : 48) + 'px "Georgia","Times New Roman",serif'; g.fillText(nm, 32, 44); suit(g, s, 32, 86, 30, col); };
    corner(); g.save(); g.translate(W, H); g.rotate(Math.PI); corner(); g.restore();
    if(rank === 14){ suit(g, s, W / 2, H / 2, 120, col); }
    else if(rank >= 11){ g.save(); roundRect(g, 58, 50, W - 116, H - 100, 12); g.clip(); const st = g.createLinearGradient(0, 0, W, H); st.addColorStop(0, s === 1 || s === 2 ? '#fde1e3' : '#e4e8f4'); st.addColorStop(1, s === 1 || s === 2 ? '#f6b9be' : '#b9c3e4'); g.fillStyle = st; g.fillRect(0, 0, W, H);
      g.strokeStyle = col; g.globalAlpha = .18; g.lineWidth = 6; for(let i = -H; i < W + H; i += 22){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); } g.globalAlpha = 1; g.restore();
      g.lineWidth = 4; g.strokeStyle = col; roundRect(g, 58, 50, W - 116, H - 100, 12); g.stroke(); g.fillStyle = col; g.font = '900 150px "Georgia","Times New Roman",serif'; g.fillText(nm, W / 2, H / 2 + 6); suit(g, s, 88, 82, 30, col); g.save(); g.translate(W, H); g.rotate(Math.PI); suit(g, s, 88, 82, 30, col); g.restore(); }
    else { const pts = PIPS[rank], x0 = 84, x1 = 172, y0 = 76, y1 = 282; pts.forEach(p => { const x = x0 + (x1 - x0) * p[0] / 2, y = y0 + (y1 - y0) * p[1] / 6; if(p[1] > 3){ g.save(); g.translate(x, y); g.rotate(Math.PI); suit(g, s, 0, 0, 44, col); g.restore(); } else suit(g, s, x, y, 44, col); }); }
    return reg('card' + code, tex(c)); }); }
  function cardBack(){ return once('tex:cardback', () => { const [c, g] = mk(256, 512); g.scale(1, 512 / 358); const W = 256, H = 358; roundRect(g, 3, 3, W - 6, H - 6, 18); g.fillStyle = '#f4f1ea'; g.fill(); roundRect(g, 14, 14, W - 28, H - 28, 12); const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#3b1a86'); gr.addColorStop(1, '#14083a'); g.fillStyle = gr; g.fill(); g.save(); roundRect(g, 14, 14, W - 28, H - 28, 12); g.clip();
    g.strokeStyle = '#ff3df2'; g.lineWidth = 2; g.shadowColor = '#ff3df2'; g.shadowBlur = 6; for(let i = -H; i < W + H; i += 26){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i + H, 0); g.lineTo(i, H); g.stroke(); } g.restore();
    g.shadowBlur = 0; g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(W / 2, H / 2, 42, 0, TAU); g.fill(); g.fillStyle = '#14083a'; g.font = '900 54px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('W', W / 2, H / 2 + 3); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.3)'; roundRect(g, 3, 3, W - 6, H - 6, 18); g.stroke();
    return reg('cardBack', tex(c)); }); }

  /* ------------------------------ chips / coins / dice / reels ------------------------------ */
  function chipTop(color, label){ return once('tex:chiptop:' + color + label, () => { const N = 256, [c, g] = mk(N, N), C = N / 2; g.fillStyle = color; g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; for(let i = 0; i < 8; i++){ g.save(); g.translate(C, C); g.rotate(i / 8 * TAU); g.fillRect(-16, -C, 32, 44); g.restore(); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; g.beginPath(); g.arc(C, C, 92, 0, TAU); g.stroke(); g.fillStyle = color; g.beginPath(); g.arc(C, C, 88, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(C, C, 80, 0, TAU); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 ' + (String(label).length > 3 ? 56 : 74) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, C, C + 4); return tex(c, { repeat: false }); }); }
  function chipSide(color){ return once('tex:chipside:' + color, () => { const [c, g] = mk(256, 32); g.fillStyle = color; g.fillRect(0, 0, 256, 32); g.fillStyle = '#fff'; for(let i = 0; i < 8; i++) g.fillRect(i * 32 + 6, 0, 20, 32); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 29, 256, 3); return tex(c); }); }
  function coinFace(){ return once('tex:coin', () => { const N = 256, [c, g] = mk(N, N), C = N / 2, gr = g.createRadialGradient(C, C, 10, C, C, C); gr.addColorStop(0, '#ffe98a'); gr.addColorStop(.7, '#f3b72c'); gr.addColorStop(1, '#b57a10'); g.fillStyle = gr; g.fillRect(0, 0, N, N);
    g.strokeStyle = '#8a5a08'; g.lineWidth = 8; g.beginPath(); g.arc(C, C, 108, 0, TAU); g.stroke(); g.fillStyle = '#8a5a08'; g.beginPath(); for(let i = 0; i < 10; i++){ const a = i / 10 * TAU - Math.PI / 2, a2 = a + TAU / 20; g.lineTo(C + Math.cos(a) * 70, C + Math.sin(a) * 70); g.lineTo(C + Math.cos(a2) * 30, C + Math.sin(a2) * 30); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(C - 40, C - 56, 54, 20, -.6, 0, TAU); g.fill(); return reg('coin', tex(c, { repeat: false })); }); }
  function dieAtlas(){ return once('tex:die', () => { const [c, g] = mk(512, 256), P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }, face = [1, 6, 3, 4, 2, 5];
    g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, 512, 256); for(let f = 0; f < 6; f++){ const cx = (f % 4) * 128 + 64, cy = Math.floor(f / 4) * 128 + 64; g.fillStyle = '#e4ddc9'; g.fillRect((f % 4) * 128, Math.floor(f / 4) * 128, 128, 128); const gr = g.createRadialGradient(cx, cy, 4, cx, cy, 90); gr.addColorStop(0, '#fffdf6'); gr.addColorStop(1, '#ebe4d0'); g.fillStyle = gr; g.fillRect((f % 4) * 128 + 4, Math.floor(f / 4) * 128 + 4, 120, 120);
      g.fillStyle = face[f] === 1 ? '#d81f2a' : '#15151a'; P[face[f]].forEach(p => { g.beginPath(); g.arc(cx + p[0] * 30, cy + p[1] * 30, face[f] === 1 ? 17 : 11, 0, TAU); g.fill(); }); } return reg('die', tex(c, { repeat: false, mip: true })); }); }
  /* reel strip: 12 symbols laid out around the drum (u = around). order matches ArcadeGames.SLOT_SYMBOLS: cherry lemon bell clover diamond seven */
  function sym(g, k, cx, cy, S){ g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
    const blob = (x, y, r, c1, c2) => { const gr = g.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = S * .025; g.stroke(); };
    if(k === 0){ g.strokeStyle = '#2f8f3a'; g.lineWidth = S * .05; g.beginPath(); g.moveTo(-S * .22, S * .15); g.quadraticCurveTo(-S * .08, -S * .3, S * .12, -S * .42); g.moveTo(S * .2, S * .2); g.quadraticCurveTo(S * .2, -S * .2, S * .12, -S * .42); g.stroke(); g.fillStyle = '#3fc24f'; g.beginPath(); g.ellipse(S * .22, -S * .42, S * .16, S * .07, -.35, 0, TAU); g.fill(); blob(-S * .22, S * .22, S * .24, '#ff7a86', '#c40f2a'); blob(S * .22, S * .27, S * .24, '#ff7a86', '#c40f2a'); }
    else if(k === 1){ g.rotate(-.35); const gr = g.createRadialGradient(-S * .1, -S * .12, S * .05, 0, 0, S * .5); gr.addColorStop(0, '#fff6a0'); gr.addColorStop(1, '#e6b800'); g.fillStyle = gr; g.beginPath(); g.moveTo(-S * .48, 0); g.quadraticCurveTo(-S * .3, -S * .34, 0, -S * .34); g.quadraticCurveTo(S * .3, -S * .34, S * .48, 0); g.quadraticCurveTo(S * .3, S * .34, 0, S * .34); g.quadraticCurveTo(-S * .3, S * .34, -S * .48, 0); g.fill(); g.strokeStyle = 'rgba(120,80,0,.6)'; g.lineWidth = S * .03; g.stroke(); g.fillStyle = '#3fc24f'; g.beginPath(); g.ellipse(S * .42, -S * .1, S * .12, S * .05, -.8, 0, TAU); g.fill(); }
    else if(k === 2){ const gr = g.createLinearGradient(-S * .4, 0, S * .4, 0); gr.addColorStop(0, '#ffd75a'); gr.addColorStop(.5, '#fff3b0'); gr.addColorStop(1, '#d09a1c'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -S * .46); g.bezierCurveTo(S * .3, -S * .46, S * .34, -S * .1, S * .4, S * .22); g.lineTo(S * .5, S * .3); g.lineTo(-S * .5, S * .3); g.lineTo(-S * .4, S * .22); g.bezierCurveTo(-S * .34, -S * .1, -S * .3, -S * .46, 0, -S * .46); g.fill(); g.strokeStyle = '#8a5a08'; g.lineWidth = S * .03; g.stroke(); g.fillStyle = '#b57a10'; g.beginPath(); g.arc(0, S * .4, S * .1, 0, TAU); g.fill(); }
    else if(k === 3){ g.fillStyle = '#22a55b'; for(let i = 0; i < 4; i++){ g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-S * .42, -S * .1, -S * .3, -S * .52, 0, -S * .22); g.bezierCurveTo(S * .3, -S * .52, S * .42, -S * .1, 0, 0); g.fill(); g.strokeStyle = '#0d6a36'; g.lineWidth = S * .025; g.stroke(); g.restore(); } g.strokeStyle = '#0d6a36'; g.lineWidth = S * .06; g.beginPath(); g.moveTo(0, S * .05); g.quadraticCurveTo(S * .08, S * .3, S * .2, S * .45); g.stroke(); }
    else if(k === 4){ const gr = g.createLinearGradient(-S * .4, -S * .4, S * .4, S * .4); gr.addColorStop(0, '#b9f6ff'); gr.addColorStop(.5, '#29c9f0'); gr.addColorStop(1, '#0a6fb0'); g.fillStyle = gr; g.beginPath(); g.moveTo(-S * .32, -S * .3); g.lineTo(S * .32, -S * .3); g.lineTo(S * .48, -S * .06); g.lineTo(0, S * .46); g.lineTo(-S * .48, -S * .06); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = S * .03; g.stroke(); g.beginPath(); g.moveTo(-S * .48, -S * .06); g.lineTo(S * .48, -S * .06); g.moveTo(-S * .16, -S * .3); g.lineTo(-S * .26, -S * .06); g.lineTo(0, S * .46); g.lineTo(S * .26, -S * .06); g.lineTo(S * .16, -S * .3); g.stroke(); }
    else { g.font = '900 ' + S * 1.05 + 'px Georgia,"Times New Roman",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = S * .12; g.strokeStyle = '#ffd24a'; g.strokeText('7', 0, S * .04); g.lineWidth = S * .04; g.strokeStyle = '#7a0010'; g.strokeText('7', 0, S * .04); const gr = g.createLinearGradient(0, -S * .5, 0, S * .5); gr.addColorStop(0, '#ff6b78'); gr.addColorStop(1, '#c3001d'); g.fillStyle = gr; g.fillText('7', 0, S * .04); }
    g.restore(); }
  const REEL_CELLS = 12;
  function reelStrip(){ return once('tex:reel', () => { const W = 256, H = 2048, [c, g] = mk(W, H), ch = H / REEL_CELLS; for(let i = 0; i < REEL_CELLS; i++){ const y = i * ch, gr = g.createLinearGradient(0, y, 0, y + ch); gr.addColorStop(0, '#d9d4c6'); gr.addColorStop(.22, '#fffdf4'); gr.addColorStop(.78, '#fffdf4'); gr.addColorStop(1, '#d9d4c6'); g.fillStyle = gr; g.fillRect(0, y, W, ch); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, W, 3); sym(g, i % 6, W / 2, y + ch / 2, 118); } return reg('reel', tex(c, { aniso: 8 })); }); }

  /* ------------------------------ models ------------------------------ */
  const M3 = {};
  const mat = GL.material;
  function sh(n){ n.castShadow = true; return n; }
  /* a playing card as a Node group: front face up toward +Z. node.data = { code, w, h }. Width/height follow the poker card ratio. */
  const CW = .63, CH = .88;
  M3.card = function(code, o){ o = o || {}; const w = CW * (o.scale || 1), h = CH * (o.scale || 1), g = new GL.Node(); g.data = { code, w, h };
    const q = once('mesh:cardquad', () => GL.mesh.quad(1, 1)), eg = once('mesh:cardedge', () => GL.mesh.roundedBox(1, 1, 1, .02, 2));
    const f = new GL.Node(q, mat({ map: code >= 0 ? cardFace(code) : cardBack(), alphaCut: .45, spec: .5, shine: 70, refl: .06, fog: false })); f.scaleTo(w, h, 1); f.pos[2] = .0035; g.add(f);
    const b = new GL.Node(q, mat({ map: cardBack(), alphaCut: .45, spec: .35, shine: 50, refl: .06, fog: false })); b.scaleTo(w, h, 1); b.rot[1] = Math.PI; b.pos[2] = -.0035; g.add(b);
    const e = new GL.Node(eg, mat({ color: [.93, .92, .88, 1], spec: .1, fog: false })); e.scaleTo(w - .035, h - .035, .006); g.add(e); g.front = f; g.back = b; g.castShadow = false; f.castShadow = true; return g; };
  M3.setCard = function(card, code){ if(card.data.code === code) return; card.data.code = code; card.front.mat = mat({ map: code >= 0 ? cardFace(code) : cardBack(), alphaCut: .45, spec: .5, shine: 70, refl: .06, fog: false }); };
  M3.CHIP_COLORS = [[1, '#e8e8ef', '#555'], [5, '#d63a3a', '#fff'], [25, '#1f9d55', '#fff'], [100, '#1d1d28', '#ffe14d'], [500, '#7a3ac8', '#fff'], [1000, '#f1b72b', '#3a2300']];
  M3.chip = function(value, o){ o = o || {}; const row = M3.CHIP_COLORS.slice().reverse().find(r => value >= r[0]) || M3.CHIP_COLORS[0], label = value >= 1000 ? (value / 1000) + 'K' : String(value), g = new GL.Node(), R = .3, H = .06;
    const side = once('mesh:chipside', () => GL.mesh.cylinder(R, R, H, 36, false, 1)), disc = once('mesh:chipdisc', () => GL.mesh.disc(R * .985, 36));
    const sn = new GL.Node(side, mat({ map: chipSide(row[1]), spec: .5, shine: 40, refl: .04 })); sn.rot[0] = 0; g.add(sn);
    const t = new GL.Node(disc, mat({ map: chipTop(row[1], label), spec: .55, shine: 60, refl: .05 })); t.pos[1] = H / 2 + .0008; g.add(t);
    const b = new GL.Node(disc, mat({ map: chipTop(row[1], label), spec: .4 })); b.pos[1] = -H / 2 - .0008; b.rot[2] = Math.PI; g.add(b); sn.castShadow = true; g.height = H; g.value = value; return g; };
  /* amount → a few stacks of chips (largest denominations first, at most `max` chips). Returns { node, count } */
  M3.chipPile = function(amount, max){ max = max || 26; const g = new GL.Node(); let left = Math.max(0, Math.floor(amount)), n = 0; const list = [];
    M3.CHIP_COLORS.slice().reverse().forEach(r => { let k = Math.floor(left / r[0]); if(k > 0){ k = Math.min(k, 8); left -= k * r[0]; for(let i = 0; i < k; i++) list.push(r[0]); } });
    while(left >= 1 && list.length < max){ list.push(1); left -= 1; } list.length = Math.min(list.length, max);
    const stacks = []; list.forEach(v => { let s = stacks.find(s => s.v === v && s.n < 8); if(!s){ s = { v, n: 0 }; stacks.push(s); } s.n++; });
    stacks.forEach((s, si) => { const col = si % 3, row = Math.floor(si / 3), x = (col - 1) * .62 + (row % 2) * .12, z = row * .56; for(let i = 0; i < s.n; i++){ const c = M3.chip(s.v); c.pos = [x + (((si * 7 + i * 3) % 5) - 2) * .004, .03 + i * .062, z + (((si * 5 + i * 11) % 5) - 2) * .004]; c.rot[1] = (si * 1.3 + i * .7) % TAU; g.add(c); n++; } });
    g.count = n; return g; };
  M3.coin = function(){ const m = once('mesh:coin', () => GL.mesh.lathe([[0, -.03], [.46, -.03], [.5, -.012], [.5, .012], [.46, .03], [0, .03]], 40, false, 1)), face = once('mesh:coinface', () => GL.mesh.disc(.44, 40)), g = new GL.Node();
    const body = new GL.Node(m, mat({ color: [.96, .74, .2, 1], spec: .9, shine: 90, refl: .45 })); g.add(body);
    [1, -1].forEach(sd => { const f = new GL.Node(face, mat({ map: coinFace(), spec: .9, shine: 80, refl: .35 })); f.pos[1] = .0305 * sd; if(sd < 0) f.rot[2] = Math.PI; g.add(f); }); body.castShadow = true; return g; };
  M3.dieMesh = function(size, r){ const m = GL.mesh.roundedBox(size, size, size, r, 3), vf = 4 * 4 * 1, per = m.v.length / 8 / 6; for(let f = 0; f < 6; f++) for(let k = 0; k < per; k++){ const o = (f * per + k) * 8 + 6, u = m.v[o], v = m.v[o + 1]; m.v[o] = ((f % 4) + u * .94 + .03) / 4; m.v[o + 1] = (Math.floor(f / 4) + v * .94 + .03) / 2; } return m; };
  M3.die = function(size){ size = size || .5; const m = once('mesh:die:' + size, () => M3.dieMesh(size, size * .14)); const n = new GL.Node(m, mat({ map: dieAtlas(), spec: .6, shine: 60, refl: .06 })); n.castShadow = true; return n; };
  /* the arcade casino table: felt top with printed decals, padded rail, wooden apron. size = [w, d] in world units. kind decides the printing. */
  function tableFelt(kind){ return once('tex:tablefelt:' + kind, () => { const W = 1024, H = 512, [c, g] = mk(W, H), f = felt('#0b6a3c'), src = f.map.src; g.drawImage(src, 0, 0, 512, 512); g.drawImage(src, 512, 0, 512, 512);
    const vg = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .62); vg.addColorStop(0, 'rgba(255,255,255,.08)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,225,77,.75)'; g.fillStyle = 'rgba(255,225,77,.8)'; g.lineWidth = 3; g.textAlign = 'center'; g.font = '800 26px Georgia,serif';
    if(kind === 'blackjack'){ g.beginPath(); g.arc(W / 2, 40, 330, .12 * Math.PI, .88 * Math.PI); g.stroke(); g.fillText('BLACKJACK PAYS 3 TO 2', W / 2, 262); g.font = '600 20px Georgia,serif'; g.fillText('DEALER STANDS ON ALL 17s', W / 2, 292); g.strokeRect(W / 2 - 54, 410, 108, 70); }
    else if(kind === 'poker'){ g.beginPath(); g.ellipse(W / 2, H / 2, 420, 190, 0, 0, TAU); g.stroke(); g.font = '800 30px Georgia,serif'; g.fillText('TEXAS HOLD\'EM', W / 2, 74); }
    else { g.beginPath(); g.ellipse(W / 2, H / 2, 430, 205, 0, 0, TAU); g.stroke(); g.font = '800 30px Georgia,serif'; g.fillText('RIDE THE BUS', W / 2, 70); }
    return tex(c, { repeat: false, mip: true }); }); }
  M3.table = function(kind, o){ o = o || {}; const W = o.w || 8, D = o.d || 4.6, g = new GL.Node(), f = felt('#0b6a3c'), wd = wood('#5a3216'), mt = metal('#caa24a');
    const top = new GL.Node(once('mesh:tabletop:' + W + D, () => GL.mesh.plane(W, D, 1, 1, 1, 1)), mat({ map: tableFelt(kind), bump: f.bump, bumpK: .006, spec: .06, shine: 10 })); g.add(top);
    const rail = (x, z, w, d) => { const n = new GL.Node(GL.mesh.roundedBox(w, .28, d, .1, 3), mat({ color: [.42, .12, .14, 1], map: wd.map, bump: wd.bump, bumpK: .004, spec: .55, shine: 36, refl: .05, uv: [w, 1, 0, 0] })); n.pos = [x, .1, z]; n.castShadow = false; g.add(n); return n; };
    rail(0, -D / 2 - .14, W + .56, .3); rail(0, D / 2 + .14, W + .56, .3); rail(-W / 2 - .14, 0, .3, D); rail(W / 2 + .14, 0, .3, D);
    const apron = new GL.Node(GL.mesh.roundedBox(W + 1.2, .3, D + 1.1, .08, 2), mat({ map: wd.map, bump: wd.bump, bumpK: .004, spec: .4, shine: 30, uv: [4, 3, 0, 0] })); apron.pos[1] = -.2; g.add(apron);
    const trim = new GL.Node(GL.mesh.torus(.01, .01, 3, 3), mat({ map: mt.map })); trim.visible = false; g.add(trim); return g; };
  /* a rounded-rectangle felt/card placeholder: dark translucent outline on the felt */
  M3.slotOutline = function(w, h){ const n = new GL.Node(once('mesh:slotout', () => GL.mesh.plane(1, 1)), mat({ map: label('', { w: 128, h: 128 }), color: [1, 1, 1, .0] })); return n; };
  M3.labelPlane = function(text, w, h, o){ o = o || {}; const n = new GL.Node(once('mesh:lblquad', () => GL.mesh.quad(1, 1)), mat({ map: label(text, Object.assign({ w: 512, h: 128 }, o)), unlit: true, blend: 'blend', depthWrite: false, fog: false, cull: false })); n.scaleTo(w, h, 1); n.pickable = false; return n; };
  M3.sprite = function(color, size, o){ const n = new GL.Node(once('mesh:sprite', () => GL.mesh.quad(1, 1)), mat({ map: glow(color), unlit: true, blend: 'add', depthWrite: false, fog: false, cull: false, color: [1, 1, 1, (o && o.alpha) || 1] })); n.billboard = 'full'; n.scaleTo(size, size, 1); return n; };

  const GL3DAssets = { rgb, rng, mk, roundRect, useFiles, loadModel, models, files, REEL_CELLS, CARD: { w: CW, h: CH },
    tex: { felt, wood, metal, carpet, neonGrid, label, glow, backdrop, cardFace, cardBack, chipTop, chipSide, coin: coinFace, dieAtlas, reelStrip, tableFelt },
    model: M3, paint: { suit, symbol: sym } };
  if(typeof module !== 'undefined' && module.exports) module.exports = GL3DAssets; else root.GL3DAssets = GL3DAssets;
})(typeof window !== 'undefined' ? window : globalThis);
