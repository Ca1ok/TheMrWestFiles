/* LIB · worldgen — the shape of WestCountry. Everything here is a PURE function of an index, so nothing about geometry is ever stored or downloaded:
 *   house i  → district floor(i/64), slot i%64, type, base value, address, x/y on the map
 *   district k → name, prestige, centre on a golden-angle spiral (so the country can grow forever, a new district every 64 houses)
 *   bot n    → name, job, traits, bio, lifespan
 * What IS stored in Firebase is only what changes: who owns a house, its value, its rent, damage… (world/own/<id>). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.WorldGen = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  const PER = 64, GA = 2.399963229728653;
  const h32 = (a, b) => { let x = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297A2D39) >>> 0; x ^= x >>> 15; return x >>> 0; };
  const f01 = (a, b) => h32(a, b) / 4294967296;
  const pick = (arr, a, b) => arr[h32(a, b) % arr.length];

  const DISTRICTS = [
    ['Harbour Quay', 1.25, '#3f7fbf'], ['Old Town', 1.0, '#b58a4a'], ['Maple Heights', 1.4, '#3fae78'], ['Riverside', 1.1, '#52b5b0'], ['Foundry Row', 0.75, '#a0583f'], ['Sunset Beach', 1.6, '#e8803d'],
    ['Pinewood', 0.9, '#5d8f4a'], ['Crown Hill', 1.9, '#9b7bff'], ['Market Square', 1.05, '#d9a441'], ['Stonebridge', 0.85, '#7c8696'], ['Lakeside', 1.35, '#4aa0d6'], ['Westgate', 0.95, '#c96a4a'],
    ['Cedar Park', 1.15, '#4f9d69'], ['Ironworks', 0.7, '#8a6a58'], ['Silver Bay', 1.5, '#8fb3d9'], ['Oakridge', 1.2, '#7a8f3f'], ['Kingsway', 1.7, '#c9a227'], ['Fernhollow', 0.95, '#69a37a'], ['Gullwing Point', 1.3, '#58a6c2'], ['Tanner’s Mill', 0.8, '#a67b5b']
  ];
  const STREETS = ['Maple Rd', 'Oak St', 'Harbour Way', 'Kiln Lane', 'Bridge St', 'Elm Ct', 'Foundry Rd', 'Orchard Ave', 'Beacon St', 'Willow Dr', 'Quarry Rd', 'Mill Lane', 'Copper St', 'Ash Grove', 'Station Rd', 'Cliff Walk', 'Hazel Way', 'Birch Ct', 'Anchor Lane', 'Lantern St', 'Rowan Rd', 'Tide St', 'Granite Ave', 'Fennel Close'];
  const TYPES = [   // key, label, weight, beds, value range (cents), colour
    { k: 'studio', n: 'Studio', w: 30, beds: 0, lo: 1500000, hi: 3500000, c: '#8fb3d9' },
    { k: 'apartment', n: 'Apartment', w: 28, beds: 2, lo: 4000000, hi: 9000000, c: '#52b5b0' },
    { k: 'townhouse', n: 'Townhouse', w: 18, beds: 3, lo: 10000000, hi: 20000000, c: '#3fae78' },
    { k: 'house', n: 'House', w: 14, beds: 4, lo: 22000000, hi: 45000000, c: '#d9a441' },
    { k: 'villa', n: 'Villa', w: 7, beds: 5, lo: 60000000, hi: 150000000, c: '#e8803d' },
    { k: 'mansion', n: 'Mansion', w: 3, beds: 8, lo: 200000000, hi: 600000000, c: '#9b7bff' }
  ];
  const TW = TYPES.reduce((s, t) => s + t.w, 0);
  const SEED = 7741;

  function district(k){
    const d = DISTRICTS[k % DISTRICTS.length], rep = Math.floor(k / DISTRICTS.length), r = 190 * Math.sqrt(k), a = k * GA;
    return { k, name: rep ? d[0] + ' ' + (rep + 1) : d[0], prestige: d[1], color: d[2], cx: Math.round(700 + r * Math.cos(a)), cy: Math.round(520 + r * Math.sin(a) * 0.8) };
  }
  function stations(k){ const d = district(k); return [{ t: 'fire', x: d.cx + 66, y: d.cy - 42, d: k }, { t: 'police', x: d.cx + 66, y: d.cy, d: k }, { t: 'ambulance', x: d.cx + 66, y: d.cy + 42, d: k }]; }
  function house(i){
    const k = Math.floor(i / PER), s = i % PER, d = district(k), col = s % 8, row = Math.floor(s / 8), roll = h32(i, SEED) % TW;
    let acc = 0, ty = TYPES[0]; for(const t of TYPES){ acc += t.w; if(roll < acc){ ty = t; break; } }
    const base = Math.round((ty.lo + (ty.hi - ty.lo) * f01(i, SEED + 1)) * d.prestige / 1000) * 1000;      // whole $10 steps (in cents)
    return { i, id: 'h' + i, k, district: d.name, type: ty.k, typeName: ty.n, beds: ty.beds, c: ty.c, base,
      x: d.cx + (col - 3.5) * 14 + (f01(i, 3) - 0.5) * 3, y: d.cy + (row - 3.5) * 14 + (f01(i, 4) - 0.5) * 3,
      addr: (1 + (h32(i, 5) % 98)) + ' ' + pick(STREETS, i, 6) };
  }
  const districtCount = n => Math.max(1, Math.ceil(n / PER));
  const bounds = n => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for(let k = 0; k < districtCount(n); k++){ const d = district(k); x0 = Math.min(x0, d.cx - 90); y0 = Math.min(y0, d.cy - 90); x1 = Math.max(x1, d.cx + 110); y1 = Math.max(y1, d.cy + 90); } return { x0, y0, x1, y1 }; };

  /* ---- bots: a unique little character per index ---- */
  const FIRST = ['Ada', 'Bruno', 'Cleo', 'Dmitri', 'Esme', 'Farid', 'Greta', 'Hiro', 'Ines', 'Jonas', 'Kavya', 'Leon', 'Mina', 'Nico', 'Odile', 'Pavel', 'Quinn', 'Rosa', 'Sven', 'Tala', 'Umar', 'Vera', 'Wren', 'Xavi', 'Yara', 'Zane', 'Amara', 'Boris', 'Chiara', 'Dev', 'Elif', 'Felix', 'Gwen', 'Hugo', 'Isla', 'Joss', 'Kira', 'Lars', 'Maeve', 'Noor'];
  const LAST = ['Okafor', 'Lindqvist', 'Marlow', 'Castellan', 'Petrov', 'Nakamura', 'Brightwell', 'Duarte', 'Haldane', 'Iyer', 'Kowalski', 'Leclerc', 'Moreau', 'Novak', 'Osei', 'Pryce', 'Quill', 'Rowntree', 'Sato', 'Thorne', 'Underhill', 'Varga', 'Whitlock', 'Yilmaz', 'Zielinski', 'Ashby', 'Bexley', 'Corrigan', 'Dunmore', 'Everett'];
  const JOBS = [   // name, income tier (1 = low), thrift tendency, landlord tendency
    ['baker', 1, 0.7, 0.1], ['barista', 1, 0.5, 0.0], ['courier', 1, 0.5, 0.0], ['chemist', 3, 0.6, 0.2], ['lab tech', 2, 0.6, 0.1], ['teacher', 2, 0.7, 0.2], ['nurse', 2, 0.6, 0.1], ['welder', 2, 0.5, 0.1],
    ['architect', 4, 0.5, 0.5], ['trader', 4, 0.2, 0.4], ['shopkeeper', 2, 0.7, 0.3], ['fisher', 1, 0.6, 0.1], ['electrician', 3, 0.6, 0.2], ['developer', 4, 0.5, 0.3], ['gardener', 1, 0.7, 0.0], ['mechanic', 2, 0.5, 0.1],
    ['landlord', 3, 0.8, 0.95], ['investor', 5, 0.4, 0.8], ['artist', 1, 0.3, 0.0], ['pilot', 4, 0.4, 0.2], ['librarian', 1, 0.8, 0.0], ['chef', 2, 0.4, 0.1], ['surveyor', 3, 0.6, 0.4], ['inventor', 3, 0.3, 0.1]
  ];
  const HOBBY = ['collects rare minerals', 'runs a tiny chemistry blog', 'never misses a market open', 'is saving for a bigger place', 'hates paying rent', 'swears by index funds', 'plays the arcade on Fridays', 'bakes for the whole street', 'repairs old radios', 'photographs the harbour at dawn', 'keeps bees on the roof', 'is always “one more reaction” from a discovery'];
  function bot(n){
    const j = JOBS[h32(n, 11) % JOBS.length], life = 40 + (h32(n, 12) % 61);       // lives 40–100 real days
    return { n, id: 'b' + n, name: FIRST[h32(n, 13) % FIRST.length] + ' ' + LAST[h32(n, 14) % LAST.length], job: j[0], tier: j[1], thrift: Math.min(0.95, j[2] + (f01(n, 15) - 0.5) * 0.3), landlord: Math.min(1, Math.max(0, j[3] + (f01(n, 16) - 0.5) * 0.3)),
      risk: f01(n, 17), social: f01(n, 18), lifespanDays: life, color: 'hsl(' + (h32(n, 19) % 360) + ',55%,55%)', hobby: HOBBY[h32(n, 20) % HOBBY.length],
      bio: 'A ' + j[0] + ' who ' + HOBBY[h32(n, 20) % HOBBY.length] + '.' };
  }
  return { PER, DISTRICTS, TYPES, h32, f01, district, stations, house, districtCount, bounds, bot, JOBS };
});
