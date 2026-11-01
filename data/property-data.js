// Real-estate catalogue. `base` is the price at the world's epoch; the live price moves with the news (see os/lib/world.js).
// `rent` is the daily rent as a fraction of the current price. Sectors react differently to different headlines.
const PROPERTY_SECTORS = {
  land:        { name: 'Land',        color: '#8fae5a' },
  residential: { name: 'Residential', color: '#e0894a' },
  commercial:  { name: 'Commercial',  color: '#4aa3d9' },
  industrial:  { name: 'Industrial',  color: '#a08a6a' },
  luxury:      { name: 'Luxury',      color: '#c78be0' }
};
const PROPERTIES = [
  { id:'scrub-lot',     name:'Scrub Lot',           sector:'land',        base:6000,     rent:0.0010, desc:'A patch of dust and optimism on the edge of Fumeton.' },
  { id:'lakeside',      name:'Lakeside Acreage',    sector:'land',        base:28000,    rent:0.0012, desc:'Pleasant views. The lake is mostly water.' },
  { id:'quarry',        name:'Quarry Land',         sector:'land',        base:90000,    rent:0.0012, desc:'Rich in minerals, according to a rock someone showed you.' },
  { id:'starter-flat',  name:'Starter Flat',        sector:'residential', base:35000,    rent:0.0030, desc:'One bedroom, one window, one very loud pipe.' },
  { id:'suburban',      name:'Suburban House',      sector:'residential', base:120000,   rent:0.0028, desc:'Three bedrooms and a garage that is definitely not a lab.' },
  { id:'townhouse',     name:'Townhouse Row',       sector:'residential', base:260000,   rent:0.0026, desc:'Shared walls, shared opinions on fume extraction.' },
  { id:'villa',         name:'Hillside Villa',      sector:'residential', base:750000,   rent:0.0024, desc:'Overlooks Beakerville. The view is the only thing that isn’t boiling.' },
  { id:'corner-shop',   name:'Corner Shop',         sector:'commercial',  base:160000,   rent:0.0035, desc:'Sells milk, newspapers, and suspiciously large quantities of baking soda.' },
  { id:'office-floor',  name:'Office Floor',        sector:'commercial',  base:520000,   rent:0.0032, desc:'Open-plan, open-minded, closed on Sundays.' },
  { id:'arcade',        name:'Shopping Arcade',     sector:'commercial',  base:1400000,  rent:0.0030, desc:'Forty shops, one of which sells lab coats.' },
  { id:'storage',       name:'Storage Units',       sector:'industrial',  base:40000,    rent:0.0034, desc:'A row of steel doors. Don’t ask what’s inside number nine.' },
  { id:'chem-works',    name:'Chemical Works',      sector:'industrial',  base:900000,   rent:0.0038, desc:'Smells like money and sulfur.' },
  { id:'refinery',      name:'Refinery',            sector:'industrial',  base:3000000,  rent:0.0040, desc:'Towers, pipes, and a very serious safety record (of incidents).' },
  { id:'penthouse',     name:'Glass Penthouse',     sector:'luxury',      base:2000000,  rent:0.0022, desc:'Floor-to-ceiling windows. Floor-to-ceiling fingerprints.' },
  { id:'island',        name:'Private Island',      sector:'luxury',      base:12000000, rent:0.0020, desc:'Your own island. Population: you, and a heron.' },
  { id:'castle',        name:'Castle on the Moors', sector:'luxury',      base:30000000, rent:0.0018, desc:'Draughty, haunted, and an absolute bargain at this price.' }
];
