/* REALWORLD · env — the sky, sun and fog for a moment in time, graded by the active WestOS theme.
 * The world clock is the same one the NPCs use: a world "day" is 30 slots of 2 real minutes; the first 7 are NIGHT (everybody is home asleep). So when the sky is dark the streets really are quiet. */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {};
  const SLOT = 120000, DAY = 30 * SLOT, NF = 7 / 30, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const K = { zenD: [0.07, 0.22, 0.6], horD: [0.5, 0.66, 0.86], zenN: [0.004, 0.008, 0.03], horN: [0.02, 0.03, 0.07], zenS: [0.1, 0.17, 0.42], horS: [0.95, 0.42, 0.2] };
  /* now = ms on the world clock; grade = the theme's three{} grade (or null) */
  function state(now, grade){
    const ph = ((now % DAY) + DAY) % DAY / DAY, day = ph >= NF, t = day ? (ph - NF) / (1 - NF) : ph / NF, a = Math.PI * t, s = Math.sin(a), c = Math.cos(a);
    let dir = [c * 0.85, Math.max(0.02, s * 0.95), 0.35]; const L = Math.hypot(dir[0], dir[1], dir[2]); dir = [dir[0] / L, dir[1] / L, dir[2] / L];
    const lum = day ? sm(0, 0.2, s) : 0, dusk = day ? 1 - sm(0, 0.42, s) : 0, nightAmt = 1 - lum;
    let zen = mix(K.zenN, mix(K.zenD, K.zenS, dusk), lum), hor = mix(K.horN, mix(K.horD, K.horS, dusk * 0.9), lum);
    let sunCol = day ? mix([0.05, 0.07, 0.14], mix([1.2, 1.08, 0.9], [1.35, 0.78, 0.45], dusk), lum) : [0.05, 0.07, 0.14];
    let sky = mix([0.035, 0.05, 0.1], mix([0.4, 0.48, 0.6], [0.34, 0.3, 0.38], dusk), lum), gnd = mix([0.02, 0.02, 0.04], mix([0.2, 0.18, 0.14], [0.2, 0.14, 0.12], dusk), lum), fog = mix(hor, [hor[0] * 0.9, hor[1] * 0.92, hor[2] * 0.95], 0.2);
    let disc = day ? mix([0.1, 0.1, 0.12], mix([4, 3.5, 2.4], [5, 2.4, 1.2], dusk), lum) : [0.55, 0.62, 0.8];
    let cloud = 1;
    if(grade){ const k = (grade.k == null ? 0.6 : grade.k) * 0.55, lin = c => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
      const gf = lin(grade.fog || grade.bg || hor), gs = lin(grade.sky || sky), gg = lin(grade.ground || gnd), gd = lin(grade.dir || sunCol);
      fog = mix(fog, mul(gf, 1.3), k); hor = mix(hor, mul(gf, 1.3), k); zen = mix(zen, mul(lin(grade.bg || zen), 1.1), k * 0.8); sky = mix(sky, mul(gs, 0.55), k); gnd = mix(gnd, mul(gg, 0.4), k); sunCol = mix(sunCol, mul(gd, 1.1), k * 0.5); disc = mix(disc, mul(gd, 4), k * 0.5); }
    return { sunDir: dir, sunCol, sunDisc: disc, sky, ground: gnd, fog, zenith: zen, horizon: hor, fogD: 0.00042 + 0.0003 * nightAmt, night: nightAmt, phase: ph, isDay: day, cloud };
  }
  /* indoors: warm, flat and a little dim; "glowing" surfaces (lamps, screens, neon) are always on */
  const INDOOR = { sunDir: [0.2, 1, 0.1], sunCol: [0.45, 0.42, 0.38], sunDisc: [0, 0, 0], sky: [0.52, 0.48, 0.44], ground: [0.26, 0.23, 0.2], fog: [0.04, 0.035, 0.03], zenith: [0, 0, 0], horizon: [0, 0, 0], fogD: 0.016, night: 1, phase: 0, isDay: false, cloud: 0 };
  RW.Env = { state, INDOOR, DAY, SLOT, NF };
})(typeof self !== 'undefined' ? self : this);
