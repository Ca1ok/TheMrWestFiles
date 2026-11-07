// WestLab calculation worker: runs Phys.card off the main thread so a cache miss never freezes the page. Same engine files, same results as the browser/Action (deterministic).
// Loaded by os/kernel/api.js (computeCard); if a Worker can't start there, api.js calculates synchronously as before.
importScripts('../../data/periodic-table-data.js', '../../data/economy-data.js', '../../data/chem-data.js', '../../data/thermo-data.js', 'chem.js', 'phys.js');
Phys.init();
onmessage = e => { const { id, a } = e.data; let card = null, err = null; try{ card = Phys.card(a); }catch(x){ err = String(x && x.message || x); } postMessage({ id, card, err }); };
