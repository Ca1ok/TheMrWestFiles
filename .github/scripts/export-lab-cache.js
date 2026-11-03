// WestLab exports (run hourly by .github/workflows/export-lab-cache.yml):
//  1) discoveries:  Firebase labCache/<reaction>  ->  lab-cache/discoveries.json   (newest 300; who made what first)
//  3) compound library: every compound that appears in a verified reaction (and the built-in registry) is looked up on PubChem (free, no key) and its real name + structure saved to
//     lab-cache/compounds/<shard>.json — so the browser doesn't have to ask PubChem again. Compounds PubChem doesn't know get a structure built from valence rules (flagged real:0).
//  2) reaction library:  Firebase labSubmit/<id>  ->  lab-cache/reactions/<shard>.json
//     Players only submit the INPUTS of a reaction they calculated (reagents, temperature, pressure, equipment). This script RECOMPUTES each one with the
//     very same engine (os/lib/chem.js + os/lib/phys.js) and commits the result only if it is a valid, feasible reaction. A client can therefore never put a
//     wrong number into the library — the library holds nothing but what the engine itself produced.
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), load = require('./westlab-loader.js');
const DB = 'https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app', OUTD = path.join(ROOT, 'lab-cache'), RX = path.join(OUTD, 'reactions');
const getJSON = async u => { const r = await fetch(DB + u); if(!r.ok) throw new Error(u + ' -> ' + r.status); return r.json(); };
const write = (f, o) => { const next = JSON.stringify(o); if(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === next) return false; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, next); return true; };

async function discoveries(){
  const data = (await getJSON('/labCache.json')) || {}, clean = {};
  Object.keys(data).filter(k => data[k] && typeof data[k].by === 'string').sort((a, b) => (data[b].t || 0) - (data[a].t || 0)).slice(0, 300).forEach(k => { const d = data[k]; clean[k] = { by: String(d.by).slice(0, 20), t: +d.t || 0, eq: String(d.eq || '').slice(0, 240), n: String(d.n || '').slice(0, 240) }; });
  console.log(write(path.join(OUTD, 'discoveries.json'), clean) ? 'Wrote ' + Object.keys(clean).length + ' discoveries.' : 'Discoveries: no change.');
}
async function reactions(){
  const { Phys } = load(ROOT); Phys.init(); const fresh = [];
  const stateF = path.join(RX, '_state.json'), state = fs.existsSync(stateF) ? JSON.parse(fs.readFileSync(stateF, 'utf8')) : { t: 0 };
  let sub; try{ sub = (await getJSON('/labSubmit.json?orderBy="t"&startAt=' + (state.t + 1))) || {}; }catch(e){ sub = (await getJSON('/labSubmit.json')) || {}; }   // (needs ".indexOn": ["t"] in the rules; falls back to a full read)
  const shards = {}, getShard = id => shards[id] || (shards[id] = (() => { const f = path.join(RX, id + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })());
  let added = 0, rejected = 0, maxT = state.t;
  Object.keys(sub).sort((a, b) => (sub[a].t || 0) - (sub[b].t || 0)).forEach(id => {
    const s = sub[id]; if(!s || typeof s !== 'object') return; maxT = Math.max(maxT, +s.t || 0);
    const keys = Array.isArray(s.r) ? s.r.filter(x => typeof x === 'string' && x.length < 40).slice(0, 4) : [], target = typeof s.g === 'string' ? s.g.slice(0, 60) : '';
    if(!target && !keys.length) return; const T = Math.round(+s.T), P = +s.P || 1;
    if(!(T >= 75 && T <= 1500) || ![1, 2, 5, 10, 20, 50, 100, 200, 500].includes(P)) { rejected++; return; }
    let card; try{ card = Phys.card({ keys, target, T, P, cat: !!s.c, elec: !!s.e }); }catch(e){ rejected++; return; }
    if(!card || !card.ok){ rejected++; return; }
    const sh = getShard(Phys.shardOf(card.key)); if(sh[card.key]) return;
    if(Phys.fnv(card.key) !== id){ rejected++; return; }                                   // the id must be the hash of the recomputed key
    sh[card.key] = card; fresh.push(card); added++;
  });
  let changed = 0; Object.keys(shards).forEach(id => { if(write(path.join(RX, id + '.json'), shards[id])) changed++; });
  if(maxT !== state.t) write(stateF, { t: maxT });
  console.log('Reaction library: ' + added + ' added, ' + rejected + ' rejected, ' + changed + ' shard file(s) written.');
  return fresh;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function compounds(fresh){
  const { Chem, Phys, Mol } = load(ROOT); Phys.init(); const CD = path.join(OUTD, 'compounds'), shards = {}, getShard = id => shards[id] || (shards[id] = (() => { const f = path.join(CD, id + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })());
  const want = []; fresh.forEach(c => c.R.concat(c.Pr).forEach(x => x[4] === 'compound' && want.push(x[3]))); Chem.registryList().forEach(r => want.push(r.formula));
  let done = 0, real = 0;
  for(const f0 of want){ if(done >= 40) break; const sp = Chem.speciesOf(f0); if(!sp || sp.kind !== 'compound') continue; const f = sp.f, sh = getShard(Phys.fnv(f).slice(0, 2)); if(sh[f]) continue;
    let rec = null; try{ rec = await Mol.lookup(f, sp.comp); }catch(e){}
    if(rec){ if(!rec.n) rec.n = Chem.nameOf(f); real++; } else { const g = Mol.layout(Mol.build(sp)); if(!g.a.length) continue; rec = Mol.record(f, Chem.nameOf(f), g, false, 0); }
    sh[f] = rec; done++; await sleep(300); }                                           // PubChem asks for ≤ 5 requests/second
  let changed = 0; Object.keys(shards).forEach(id => { if(write(path.join(CD, id + '.json'), shards[id])) changed++; });
  console.log('Compound library: ' + done + ' added (' + real + ' found on PubChem), ' + changed + ' shard file(s) written.');
}
(async () => { await discoveries(); const fresh = await reactions(); await compounds(fresh); })().catch(e => { console.error(e); process.exit(1); });
