/* DATA · vehicles — the car dealership's and the private airport's catalogue. PURE (browser global `VehicleData`, Node `require`).
 * Used by: tools/build-rules.js (the exact price of every model is written into the database rules), os/kernel/ledger.js (buy / sell / repaint),
 * os/realworld/vehicles.js + interiors.js (what the 3-D world draws), apps/RealEstate.html (the "Assets" app).
 *
 * PRICES ARE IN CENTS (like all money in the WestEconomy). Changing a price here changes it for the client AND, after `node tools/build-rules.js`
 * and pasting database.rules.json into the Firebase console, for the server — until the rules are republished a changed price is simply refused.
 *
 * RENTALS: a model with `rent` (cents per real day) can be hired for 24 h at the dealership / airport (garage record gets r:1, see os/kernel/ledger.js). Hatch $100/day, Skylark $1,000/day.
 *
 * Every model carries the numbers the driving / flying controller (os/realworld/drive.js) reads: `drive` or `fly` (top speed in m/s, acceleration, braking, grip,
 * mass, dimensions…). `driveable` is true: owned vehicles can be driven / flown in the 3-D world (see os/realworld/README.md → "Vehicles"). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.VehicleData = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const KMH = 1 / 3.6;
  /* body colours a buyer can choose (index stored in the garage record: 0..7) */
  const COLORS = [
    { id: 0, name: 'Signal red',   hex: '#d94a4a' }, { id: 1, name: 'Ocean blue',  hex: '#2f6fd0' }, { id: 2, name: 'Pearl white', hex: '#f2f2f0' }, { id: 3, name: 'Midnight',    hex: '#26272b' },
    { id: 4, name: 'Silver',       hex: '#9aa3ad' }, { id: 5, name: 'Sun yellow',  hex: '#e8b92e' }, { id: 6, name: 'Forest',      hex: '#3fa56b' }, { id: 7, name: 'Tangerine',   hex: '#e8792e' }
  ];
  /* kind 'car' | 'plane'. style = which 3-D body is drawn (gfx.js actorMeshes). price in cents. */
  const CARS = [
    { id: 'wren',    kind: 'car', style: 'hatch',  name: 'Wren Hatch',    tag: 'City runabout',     price: 1450000,  rent: 10000, seats: 4, top: 150, zero100: 11.0, range: 620, blurb: 'Small, thrifty and easy to park. Everyone’s first car.',
      drive: { top: 150 * KMH, accel: 3.2, brake: 9, grip: 1.0, turn: 1.15, mass: 1050, len: 3.7, wid: 1.7, hgt: 1.5 } },
    { id: 'alder',   kind: 'car', style: 'sedan',  name: 'Alder Sedan',   tag: 'Family saloon',     price: 3200000,  seats: 5, top: 190, zero100: 8.5,  range: 740, blurb: 'Roomy, quiet and sensible. Does the school run and the motorway.',
      drive: { top: 190 * KMH, accel: 3.8, brake: 9.5, grip: 1.05, turn: 1.0, mass: 1450, len: 4.5, wid: 1.8, hgt: 1.45 } },
    { id: 'ridge',   kind: 'car', style: 'pickup', name: 'Ridge Pickup',  tag: 'Work truck',        price: 4800000,  seats: 5, top: 175, zero100: 8.0,  range: 810, blurb: 'A proper load bed and a proper engine. Built for the Industrial Estate.',
      drive: { top: 175 * KMH, accel: 3.6, brake: 8.5, grip: 0.95, turn: 0.85, mass: 2100, len: 5.4, wid: 2.0, hgt: 1.9 } },
    { id: 'summit',  kind: 'car', style: 'suv',    name: 'Summit SUV',    tag: 'Seven-seat 4x4',    price: 7200000,  seats: 7, top: 200, zero100: 7.0,  range: 780, blurb: 'Seven seats, all-wheel drive and a view over everybody else.',
      drive: { top: 200 * KMH, accel: 4.2, brake: 9, grip: 1.1, turn: 0.9, mass: 2250, len: 4.9, wid: 2.0, hgt: 1.8 } },
    { id: 'vesper',  kind: 'car', style: 'coupe',  name: 'Vesper GT',     tag: 'Grand tourer',      price: 18500000, seats: 2, top: 270, zero100: 4.5,  range: 600, blurb: 'Two seats, a long bonnet and a very good reason to take the long way home.',
      drive: { top: 270 * KMH, accel: 6.2, brake: 11, grip: 1.25, turn: 1.1, mass: 1600, len: 4.6, wid: 1.9, hgt: 1.3 } },
    { id: 'apex',    kind: 'car', style: 'coupe',  name: 'Apex R',        tag: 'Track supercar',    price: 89000000, seats: 2, top: 340, zero100: 2.9,  range: 480, blurb: 'Carbon, a screaming engine and a price tag that turns heads before the car does.',
      drive: { top: 340 * KMH, accel: 9.0, brake: 14, grip: 1.5, turn: 1.2, mass: 1380, len: 4.5, wid: 2.0, hgt: 1.15 } }
  ];
  /* planes need a runway, a ceiling (m) and a take-off / stall speed (m/s) when flying arrives */
  const PLANES = [
    { id: 'skylark', kind: 'plane', style: 'prop',  name: 'Skylark 2',  tag: 'Two-seat trainer',  price: 32000000,   rent: 100000, seats: 2,  top: 220, range: 1000, ceiling: 4000,  blurb: 'A cheerful single-engine high-wing. Slow, forgiving, and yours.',
      fly: { cruise: 200 * KMH, vr: 28, stall: 24, climb: 3.5, ceiling: 4000, runway: 280, mass: 760, span: 9.5, len: 6.8, hgt: 2.6 } },
    { id: 'kestrel', kind: 'plane', style: 'turbo', name: 'Kestrel T6', tag: 'Turboprop',         price: 190000000,  seats: 6,  top: 480, range: 2400, ceiling: 8500,  blurb: 'Six seats, twin turboprops and short-field manners.',
      fly: { cruise: 440 * KMH, vr: 40, stall: 34, climb: 8, ceiling: 8500, runway: 520, mass: 3800, span: 12.5, len: 10.5, hgt: 4.0 } },
    { id: 'falcon',  kind: 'plane', style: 'jet',   name: 'Falcon J1',  tag: 'Light jet',         price: 680000000,  seats: 8,  top: 780, range: 3800, ceiling: 12500, blurb: 'The classic private jet. Eight seats and a galley the size of a wardrobe.',
      fly: { cruise: 720 * KMH, vr: 62, stall: 52, climb: 14, ceiling: 12500, runway: 900, mass: 7600, span: 13.5, len: 15.5, hgt: 5.0 } },
    { id: 'zenith',  kind: 'plane', style: 'jet',   name: 'Zenith X',   tag: 'Long-range jet',    price: 2400000000, seats: 12, top: 900, range: 9800, ceiling: 15500, blurb: 'Twelve seats, a bedroom aft and enough range to leave the country behind.',
      fly: { cruise: 850 * KMH, vr: 70, stall: 58, climb: 18, ceiling: 15500, runway: 1300, mass: 21000, span: 13.5, len: 15.5, hgt: 5.0 } }
  ];
  const ALL = CARS.concat(PLANES), BY = {}; ALL.forEach(v => { v.driveable = true; BY[v.id] = v; });
  const SELL_BP = 7000, MAX_SLOTS = 12;
  const RENT_MS = 86400000;                                                   // a rental lasts ONE real day (24 h) from the moment it is paid; then it is gone. Only models with a `rent` price (in cents) are in the rental fleet.                                       // the dealer buys a vehicle back at 70 % of what you paid; at most 12 vehicles
  const slotIds = () => Array.from({ length: MAX_SLOTS }, (_, i) => 'v' + (i + 1));
  const get = id => BY[id] || null, price = id => BY[id] ? BY[id].price : 0;
  const resale = paid => Math.floor(paid * SELL_BP / 10000);                  // = the database rule: floor(c * 7000 / 10000)
  const rentPrice = id => BY[id] && BY[id].rent ? BY[id].rent : 0, RENT_COLOR = 2;       // cents per day; rentals are always Pearl white (no repaint)
  const colorHex = i => (COLORS[i] || COLORS[0]).hex;
  const hexRgb = hex => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  /* what a garage record is worth if sold right now, and a short "parked at" word for the Assets app */
  return { COLORS, CARS, PLANES, ALL, BY, SELL_BP, MAX_SLOTS, RENT_MS, RENT_COLOR, rentPrice, rentable: () => ALL.filter(v => v.rent), slotIds, get, price, resale, colorHex, hexRgb, ids: () => ALL.map(v => v.id) };
});
