/* WestWorld — the shared, deterministic "world": daily news, real-estate prices and element price swings.
 * Everything is a pure function of (time, fixed seed), so every player sees exactly the same world with ZERO server traffic —
 * the same trick the $WEST market uses. Pure functions: loads in the browser and in Node tests.
 * Depends on (by bare name): NEWS_TEMPLATES, NEWS_CITIES, PROPERTIES, PROPERTY_SECTORS, and Chem (os/lib/chem.js). */
const World = (function(){
  'use strict';
  const DAY = 86400000, EPOCH = 1787270400000, SEED = 77123;           // day 0 = 2026-08-21 (same as the market)
  const ARTICLES_PER_DAY = 12, NEWS_DECAY_DAYS = 5, EL_DECAY_DAYS = 3;
  const hash = (a, b, c) => {                                          // integer hash -> [0,1)
    let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x7F4A7C15, 0xC2B2AE35) ^ Math.imul((c | 0) + 0x165667B1, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return (h >>> 0) / 4294967296;
  };
  const dayIndex = t => Math.floor((t - EPOCH) / DAY);
  const dayStart = d => EPOCH + d * DAY;
  const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
  const pricedElements = () => Object.keys(Object.assign({}, typeof EXTRA_PRICES !== 'undefined' ? EXTRA_PRICES : {}, ELEMENT_PRICES)).filter(s => Chem.price(s) < 5000);   // news moves everyday elements, not 1e9 superheavies

  // ---------------------------------------------------------------- news
  const dayCache = new Map();
  function articlesForDay(d){
    if(dayCache.has(d)) return dayCache.get(d);
    const els = pricedElements(), used = new Set(), out = [];
    for(let i = 0; i < ARTICLES_PER_DAY; i++){
      let idx, tries = 0;
      do { idx = Math.floor(hash(d, i, 11 + tries) * NEWS_TEMPLATES.length); tries++; } while(used.has(idx) && tries < 12);
      used.add(idx); const tpl = NEWS_TEMPLATES[idx];
      const el = pick(els, hash(d, i, 21)), el2 = pick(els.filter(x => x !== el), hash(d, i, 22));
      const city = pick(NEWS_CITIES, hash(d, i, 23)), num = 20 + Math.floor(hash(d, i, 24) * 480);
      const fill = s => s.replace(/\{el2\}/g, Chem.elements[el2].name).replace(/\{el\}/g, Chem.elements[el].name).replace(/\{city\}/g, city).replace(/\{num\}/g, num);
      const t = dayStart(d) + Math.floor((i + 0.15 + 0.7 * hash(d, i, 25)) / ARTICLES_PER_DAY * DAY);
      const mag = tpl.pct ? tpl.pct[0] + (tpl.pct[1] - tpl.pct[0]) * hash(d, i, 26) : 0;
      const filler = NEWS_FILLER[Math.floor(hash(d, i, 28) * NEWS_FILLER.length)], paras = [fill(tpl.b)];
      if(tpl.x) paras.push(fill(tpl.x)); paras.push(filler);
      const a = { id: d + '-' + i, t, kind: tpl.kind, cat: tpl.cat || NEWS_DEFAULT_CAT[tpl.kind] || 'News', by: NEWS_BYLINES[Math.floor(hash(d, i, 29) * NEWS_BYLINES.length)], headline: fill(tpl.h), body: fill(tpl.b), paras: paras, mins: Math.max(1, Math.round(paras.join(' ').split(' ').length / 70)), img: Math.floor(hash(d, i, 27) * 1e6), impact: null };
      if(tpl.kind === 'el') a.impact = { el, pct: mag };
      if(tpl.kind === 'sec') a.impact = { sector: tpl.sector, pct: mag, city };
      out.push(a);
    }
    out.sort((x, y) => x.t - y.t);
    dayCache.set(d, out); return out;
  }
  function latestArticles(now, count){                                 // newest first, only what has "been published" by `now`
    const out = [], d0 = dayIndex(now);
    for(let d = d0; d >= d0 - 6 && out.length < count; d--) articlesForDay(d).slice().reverse().forEach(a => { if(a.t <= now && out.length < count) out.push(a); });
    return out;
  }
  function impactsBefore(now, days){
    const out = [], d0 = dayIndex(now);
    for(let d = d0 - days; d <= d0; d++) articlesForDay(d).forEach(a => { if(a.impact && a.t <= now) out.push(a); });
    return out;
  }
  // ---------------------------------------------------------------- element + item price multipliers (news-driven)
  function elementMult(sym, now){
    let s = 0;
    impactsBefore(now, 14).forEach(a => { if(a.impact.el === sym) s += a.impact.pct * Math.exp(-(now - a.t) / (EL_DECAY_DAYS * DAY)); });
    return Math.max(0.5, Math.min(2.2, 1 + s));
  }
  function elementMults(now){                                          // { sym: mult } for every element currently moved by the news
    const m = {}; impactsBefore(now, 14).forEach(a => { if(a.impact.el) m[a.impact.el] = elementMult(a.impact.el, now); }); return m;
  }
  function itemMult(key, now){                                         // value-weighted average of an item's elements
    const comp = Chem.parse(key); if(!comp) return 1;
    let base = 0, weighted = 0;
    Object.keys(comp).forEach(e => { const v = Chem.price(e) * comp[e]; base += v; weighted += v * elementMult(e, now); });
    return base > 0 ? weighted / base : 1;
  }
  // ---------------------------------------------------------------- real estate
  const walk = [0];                                                     // cumulative sector random walk, per day, per sector (cached)
  const sectorKeys = () => Object.keys(PROPERTY_SECTORS);
  const walks = {};
  function walkAt(sector, d){
    if(!walks[sector]) walks[sector] = [0];
    const w = walks[sector], si = sectorKeys().indexOf(sector);
    while(w.length <= d){ const k = w.length; w.push(w[k - 1] * 0.985 + (hash(k, si, SEED) - 0.5) * 0.02 + 0.0006); }   // slow drift with mean reversion
    return w[Math.max(0, d)];
  }
  function sectorIndex(sector, now){
    const d = Math.max(0, dayIndex(now)), frac = (now - dayStart(d)) / DAY;
    const w = walkAt(sector, d) * (1 - frac) + walkAt(sector, d + 1) * frac;
    let news = 0; impactsBefore(now, 20).forEach(a => { if(a.impact.sector === sector) news += a.impact.pct * Math.exp(-(now - a.t) / (NEWS_DECAY_DAYS * DAY)); });
    return Math.max(0.35, Math.exp(w + news));
  }
  const propNoise = (id, now) => {                                      // property-specific wobble (±2%), smooth over days
    let h = 0; for(let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const x = (now - EPOCH) / DAY, i0 = Math.floor(x), f = x - i0, sm = f * f * (3 - 2 * f);
    const a = hash(h, i0, 5) * 2 - 1, b = hash(h, i0 + 1, 5) * 2 - 1; return 1 + 0.02 * (a + (b - a) * sm);
  };
  function propertyPrice(p, now){ return Math.round(p.base * sectorIndex(p.sector, now) * propNoise(p.id, now)); }
  function propertyHistory(p, now, days, points){                       // [[t, price]] for sparklines
    const out = [], span = days * DAY; for(let i = 0; i <= points; i++){ const t = now - span + span * i / points; out.push([t, propertyPrice(p, t)]); } return out;
  }
  return { DAY, EPOCH, dayIndex, dayStart, articlesForDay, latestArticles, impactsBefore, elementMult, elementMults, itemMult, sectorIndex, propertyPrice, propertyHistory, hash };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = World;
