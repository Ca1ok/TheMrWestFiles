// Shared by export-lab-cache.js and tests/discoveries.test.js — re-derives a recorded WestLab discovery with the CURRENT engine.
// A discovery key is 'reagents>products' (e.g. 'NH3+O2>H2O+NO'); the registry stores no T/P, so we sweep the conditions a player can set and accept the
// discovery only if the engine today yields exactly that product set from exactly those reagents. Returns the engine's own equation string, or null.
const Ts = [300, 500, 700, 900, 1100, 1500], Ps = [1, 10, 100], FLAGS = [0, 1, 2, 3, 4, 5, 6, 7];   // flags: bit0 catalyst, bit1 electrolysis, bit2 ignition
const SHAPE = /^[A-Za-z0-9()]{1,24}(\+[A-Za-z0-9()]{1,24}){0,3}>[A-Za-z0-9()]{1,24}(\+[A-Za-z0-9()]{1,24}){0,5}$/;
function verifyDiscovery(Phys, key){
  if(typeof key !== 'string' || !SHAPE.test(key)) return null;
  const [lhs, rhs] = key.split('>'), keys = lhs.split('+'), want = rhs.split('+').slice().sort().join('+');
  for(const T of Ts) for(const P of Ps) for(const f of FLAGS){
    let c; try{ c = Phys.card({ keys, T, P, cat: !!(f & 1), elec: !!(f & 2), ign: !!(f & 4) }); }catch(e){ continue; }
    if(!c || !c.ok || !Array.isArray(c.Pr) || !Array.isArray(c.R)) continue;
    if(c.Pr.map(x => x[0]).sort().join('+') !== want) continue;
    const have = new Set(c.R.map(x => x[0])); const std = k => /^(H|N|O|F|Cl|Br|I)$/.test(k) ? k + '2' : k;      // a bare atom key means the X2 element
    if(!keys.every(k => have.has(std(k)))) continue;
    return c.eq;
  }
  return null;
}
module.exports = { verifyDiscovery };
