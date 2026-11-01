// Exports the WestLab discovery registry from Firebase into the repo as a static file, so players read it from GitHub Pages
// (free, cached) instead of from the database. Players only WRITE to Firebase when they make a brand-new discovery.
//   labCache/<reaction>  ->  lab-cache/discoveries.json   (newest 300 entries; each: { by, t, eq, n })
// The chemistry itself is never cached or trusted: every client recomputes reactions with the same deterministic engine
// (os/lib/chem.js), so a poisoned cache entry can't change what a reaction makes or what it is worth.
const fs = require('fs'), path = require('path');
const DB = 'https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app';
const OUT = path.join(__dirname, '..', '..', 'lab-cache', 'discoveries.json');
(async () => {
  const res = await fetch(DB + '/labCache.json');
  if(!res.ok) throw new Error('Firebase read failed: ' + res.status);
  const data = (await res.json()) || {};
  const clean = {};
  Object.keys(data).filter(k => data[k] && typeof data[k].by === 'string').sort((a, b) => (data[b].t || 0) - (data[a].t || 0)).slice(0, 300).forEach(k => {
    const d = data[k]; clean[k] = { by: String(d.by).slice(0, 20), t: +d.t || 0, eq: String(d.eq || '').slice(0, 240), n: String(d.n || '').slice(0, 240) };
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const next = JSON.stringify(clean);
  if(fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === next){ console.log('No change.'); return; }
  fs.writeFileSync(OUT, next); console.log('Wrote ' + Object.keys(clean).length + ' discoveries.');
})().catch(e => { console.error(e); process.exit(1); });
