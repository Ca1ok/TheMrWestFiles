// WestLab exports (run hourly by .github/workflows/export-lab-cache.yml):
//  1) discoveries:  Firebase labCache/<reaction>  ->  lab-cache/discoveries.json   (newest 300; who made what first)
//  (Compound structures are no longer built here: the browser calculates them on the player's own computer â€” PubChem + MMFF94, see os/lib/ff.js â€” and the maintainer's
//   machine commits them to lab-cache/ff/. lab-cache/compounds/ is the legacy fallback and is left untouched.)
//  2) reaction library:  Firebase labSubmit/<id>  ->  lab-cache/reactions/<shard>.json
//     Players only submit the INPUTS of a reaction they calculated (reagents, temperature, pressure, equipment). This script RECOMPUTES each one with the
//     very same engine (os/lib/chem.js + os/lib/phys.js) and commits the result only if it is a valid, feasible reaction. A client can therefore never put a
//     wrong number into the library â€” the library holds nothing but what the engine itself produced.
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), load = require('./westlab-loader.js');
const DB = 'https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app', OUTD = path.join(ROOT, 'lab-cache'), RX = path.join(OUTD, 'reactions');
const getJSON = async u => { const r = await fetch(DB + u); if(!r.ok) throw new Error(u + ' -> ' + r.status); return r.json(); };
const write = (f, o) => { const next = JSON.stringify(o); if(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === next) return false; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, next); return true; };

async function discoveries(){
  // The registry only keeps what the CURRENT engine can still reproduce. Each kept entry is stamped with the engine version it was verified under; entries recorded by an older engine
  // (e.g. reactions between free F/H/N/O atoms) are re-derived once per version and dropped if the engine no longer makes them. Firebase keeps the raw record; this file is the checked view.
  const { Phys } = load(ROOT); Phys.init(); const { verifyDiscovery } = require('./lab-verify.js'), EV = Phys.ENGINE_VERSION;
  const outF = path.join(OUTD, 'discoveries.json'), rejF = path.join(OUTD, 'discoveries-rejected.json');
  let prev = {}, rej = { ev: EV, keys: {} }; try{ prev = JSON.parse(fs.readFileSync(outF, 'utf8')); }catch(e){} try{ const r = JSON.parse(fs.readFileSync(rejF, 'utf8')); if(r && r.ev === EV) rej = r; }catch(e){}
  const data = (await getJSON('/labCache.json')) || {}, clean = {}; let checked = 0, dropped = 0;
  Object.keys(data).filter(k => data[k] && typeof data[k].by === 'string').sort((a, b) => (data[b].t || 0) - (data[a].t || 0)).slice(0, 300).forEach(k => {
    const d = data[k]; if(rej.keys[k]) { dropped++; return; }
    let eq = prev[k] && prev[k].ev === EV ? prev[k].eq : null;
    if(!eq){ checked++; eq = verifyDiscovery(Phys, k); if(!eq){ rej.keys[k] = 1; dropped++; console.log('Dropped (current engine does not make it): ' + k + '  [' + String(d.eq || '').slice(0, 80) + ']'); return; } }
    clean[k] = { by: String(d.by).slice(0, 20), t: +d.t || 0, eq: eq.slice(0, 240), n: String(d.n || '').slice(0, 240), ev: EV };
  });
  console.log(write(outF, clean) ? 'Wrote ' + Object.keys(clean).length + ' discoveries (' + checked + ' verified, ' + dropped + ' dropped).' : 'Discoveries: no change.');
  if(Object.keys(rej.keys).length || fs.existsSync(rejF)) write(rejF, rej);
}
async function reactions(){
  const { Phys } = load(ROOT); Phys.init(); const fresh = [], EV = Phys.ENGINE_VERSION, PFX = 'e' + EV + '|';
  const stateF = path.join(RX, '_state.json'), state = fs.existsSync(stateF) ? JSON.parse(fs.readFileSync(stateF, 'utf8')) : { t: 0 };
  // New engine version → cards computed by an older engine are dropped and every submission still in Firebase is recomputed from t = 0 (the Action is the only writer; the inputs are all we trust).
  const stale = state.ev !== EV; if(stale){ state.t = 0; console.log('ENGINE_VERSION changed (' + (state.ev || 1) + ' → ' + EV + '): old entries will be purged and all submissions recomputed.'); }
  let sub; try{ sub = (await getJSON('/labSubmit.json?orderBy="t"&startAt=' + (state.t + 1))) || {}; }catch(e){ sub = (await getJSON('/labSubmit.json')) || {}; }   // (needs ".indexOn": ["t"] in the rules; falls back to a full read)
  const shards = {}, getShard = id => shards[id] || (shards[id] = (() => { const f = path.join(RX, id + '.json'); if(!fs.existsSync(f)) return {}; const o = JSON.parse(fs.readFileSync(f, 'utf8')); Object.keys(o).forEach(k => { if(k.indexOf(PFX) !== 0) delete o[k]; }); return o; })());
  let added = 0, rejected = 0, maxT = state.t;
  Object.keys(sub).sort((a, b) => (sub[a].t || 0) - (sub[b].t || 0)).forEach(id => {
    const s = sub[id]; if(!s || typeof s !== 'object') return; maxT = Math.max(maxT, +s.t || 0);
    const keys = Array.isArray(s.r) ? s.r.filter(x => typeof x === 'string' && x.length < 40).slice(0, 4) : [], target = typeof s.g === 'string' ? s.g.slice(0, 60) : '';
    if(!target && !keys.length) return; const T = Math.round(+s.T), P = +s.P || 1;
    if(!(T >= 75 && T <= 1500) || ![1, 2, 5, 10, 20, 50, 100, 200, 500].includes(P)) { rejected++; return; }
    let card; try{ card = Phys.card({ keys, target, T, P, cat: !!s.c, elec: !!s.e, ign: !!s.i }); }catch(e){ rejected++; return; }
    if(!card || !card.ok){ rejected++; return; }
    const sh = getShard(Phys.shardOf(card.key)); if(sh[card.key]) return;
    if(Phys.fnv(card.key) !== id){ rejected++; return; }                                   // the id must be the hash of the recomputed key
    sh[card.key] = card; fresh.push(card); added++;
  });
  if(stale) fs.readdirSync(RX).filter(f => /^[0-9a-f]{2}\.json$/.test(f)).forEach(f => { getShard(f.slice(0, 2)); });   // load every shard so stale entries are purged even when nothing new lands in it
  let changed = 0; Object.keys(shards).forEach(id => { if(write(path.join(RX, id + '.json'), shards[id])) changed++; });
  if(maxT !== state.t || stale) write(stateF, { t: maxT, ev: EV });
  console.log('Reaction library: ' + added + ' added, ' + rejected + ' rejected, ' + changed + ' shard file(s) written.');
  return fresh;
}
(async () => { await discoveries(); await reactions(); })().catch(e => { console.error(e); process.exit(1); });
