// node tools/preseed-lab-cache.js [--out lab-cache/reactions] [--dry] [--grid]
// PRE-SEED JOB: computes the common WestLab reactions in bulk with the SAME engine the browser and the export Action use, and writes them as lab-cache/reactions/<shard>.json
// so players hit the cache on day one. Inputs: (1) every reaction of data/reaction-catalogue.js, (2) every registry compound alone (decomposition) at 300 K,
// (3) every element × registry-compound pair (common elements) at 300 K (edit GRID_T to widen), with and without a spark. Only cards that RUN are stored (same rule as the Action);
// a card that is blocked is cheap to recompute and would only bloat the repo. Deterministic: running it twice gives byte-identical files. Run by the "Pre-seed WestLab cache" workflow.
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..'), load = require('../.github/scripts/westlab-loader.js'), { Chem, Phys } = load(ROOT); Phys.init();
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; }, DRY = process.argv.includes('--dry');
const OUT = path.resolve(arg('--out') || path.join(ROOT, 'lab-cache', 'reactions')), PFX = 'e' + Phys.ENGINE_VERSION + '|';
const CAT = require('../data/reaction-catalogue.js'), GRID_T = [300], ELS = ['H', 'O', 'N', 'Cl', 'Na', 'K', 'Li', 'Mg', 'Ca', 'Al', 'Zn', 'Fe', 'Cu', 'Ag', 'C', 'S'];
const reg = Chem.registryList().map(r => r.formula).filter(f => Chem.parse(f)), pool = [...new Set(reg.concat(ELS))].sort();
const inputs = []; CAT.forEach(e => inputs.push(e.in)); GRID_T.forEach(T => reg.forEach(f => inputs.push({ keys: [f], T, P: 1, ign: false })));
ELS.forEach(e => reg.forEach(f => { if(f === e) return; GRID_T.forEach(T => [false, true].forEach(ign => inputs.push({ keys: [e, f].sort(), T, P: 1, ign }))); }));   // element × compound; compound × compound pairs are left to the Action (they hit the slow Gibbs search)
const shards = {}; let tried = 0, kept = 0, dup = 0; const t0 = Date.now();
inputs.forEach(a => { tried++; let c; try{ c = Phys.card(a); }catch(e){ return; } if(!c || !c.ok || c.key.indexOf(PFX) !== 0) return;
  const id = Phys.shardOf(c.key), sh = shards[id] || (shards[id] = {}); if(sh[c.key]){ dup++; return; } sh[c.key] = c; kept++; });
const keys = Object.keys(shards).sort(); let bytes = 0, maxB = 0;
keys.forEach(id => { const o = {}; Object.keys(shards[id]).sort().forEach(k => { o[k] = shards[id][k]; }); const txt = JSON.stringify(o); bytes += txt.length; maxB = Math.max(maxB, txt.length); if(!DRY){ fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, id + '.json'), txt); } });
console.log(JSON.stringify({ engine: Phys.ENGINE_VERSION, inputsTried: tried, cardsKept: kept, duplicates: dup, shards: keys.length, totalBytes: bytes, avgBytesPerCard: Math.round(bytes / Math.max(1, kept)), kBPer1000Cards: Math.round(bytes / Math.max(1, kept) * 1000 / 1024), largestShardKB: +(maxB / 1024).toFixed(1), seconds: +((Date.now() - t0) / 1000).toFixed(1), dry: DRY }, null, 1));
