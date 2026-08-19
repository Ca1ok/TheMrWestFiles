// Element Economy game data: element prices, compound recipes, and crafting tools.
// Edit here to add elements, compounds, or tools without touching site logic.
//
// Everything here is the ONLY source of truth for the economy and the Compound Lab — there is
// no external API call anywhere in this game anymore. PubChem was removed entirely after
// proving unreliable (CORS failures / unreachable), so results are instant and never fail.

const ELEMENT_PRICES = {
  H: 0.50, He: 4, C: 0.30, N: 0.25, O: 0.20, Na: 3, Mg: 3, Al: 2, Si: 2, P: 3,
  S: 0.40, Cl: 1, K: 5, Ca: 1.5, Fe: 2, Cu: 8, Zn: 2.5, Ag: 700, Pt: 30000, Au: 62000
}; // approx USD per "unit" (rough mole-scale analogy)

const RECIPES = [
  { formula:'H2', name:'Hydrogen Gas', need:{H:2}, tool:'basic', desc:'The simplest diatomic molecule — two hydrogen atoms bonded together.' },
  { formula:'O2', name:'Oxygen Gas', need:{O:2}, tool:'basic', desc:'What you\'re breathing right now, more or less.' },
  { formula:'N2', name:'Nitrogen Gas', need:{N:2}, tool:'basic', desc:'Makes up about 78% of Earth\'s atmosphere.' },
  { formula:'H2O', name:'Water', need:{H:2,O:1}, tool:'basic', desc:'Two hydrogens, one oxygen. The universal solvent.' },
  { formula:'CO2', name:'Carbon Dioxide', need:{C:1,O:2}, tool:'basic', desc:'What you exhale, and what plants breathe in.' },
  { formula:'NaCl', name:'Sodium Chloride (Table Salt)', need:{Na:1,Cl:1}, tool:'basic', desc:'An explosive metal and a toxic gas, combined into something you sprinkle on fries.' },
  { formula:'HCl', name:'Hydrochloric Acid', need:{H:1,Cl:1}, tool:'basic', desc:'A strong acid — also naturally present in your stomach.' },
  { formula:'MgO', name:'Magnesium Oxide', need:{Mg:1,O:1}, tool:'basic', desc:'A white solid used in antacids and refractory bricks.' },
  { formula:'KCl', name:'Potassium Chloride', need:{K:1,Cl:1}, tool:'basic', desc:'A common salt substitute and fertilizer component.' },
  { formula:'MgCl2', name:'Magnesium Chloride', need:{Mg:1,Cl:2}, tool:'basic', desc:'Used for de-icing roads and as a coagulant in tofu-making.' },
  { formula:'CaCl2', name:'Calcium Chloride', need:{Ca:1,Cl:2}, tool:'basic', desc:'Highly hygroscopic — used as a drying agent and de-icer.' },
  { formula:'CH4', name:'Methane', need:{C:1,H:4}, tool:'burner', desc:'The simplest hydrocarbon, and the main component of natural gas.' },
  { formula:'SO2', name:'Sulfur Dioxide', need:{S:1,O:2}, tool:'burner', desc:'Produced when sulfur burns — a major component of acid rain.' },
  { formula:'Fe2O3', name:'Iron(III) Oxide (Rust)', need:{Fe:2,O:3}, tool:'burner', desc:'What iron becomes when it oxidizes over time.' },
  { formula:'CaCO3', name:'Calcium Carbonate', need:{Ca:1,C:1,O:3}, tool:'burner', desc:'The main component of limestone, marble, and seashells.' },
  { formula:'ZnO', name:'Zinc Oxide', need:{Zn:1,O:1}, tool:'burner', desc:'A white pigment used in sunscreen and ointments.' },
  { formula:'CuO', name:'Copper(II) Oxide', need:{Cu:1,O:1}, tool:'burner', desc:'A black solid formed when copper is heated in air.' },
  { formula:'SiO2', name:'Silicon Dioxide (Quartz)', need:{Si:1,O:2}, tool:'burner', desc:'The main component of sand and most glass.' },
  { formula:'NaOH', name:'Sodium Hydroxide (Lye)', need:{Na:1,O:1,H:1}, tool:'electrolysis', desc:'A caustic base produced industrially via electrolysis of brine.' },
  { formula:'Al2O3', name:'Aluminium Oxide', need:{Al:2,O:3}, tool:'electrolysis', desc:'Also known as alumina — extremely hard, used as an abrasive.' },
  { formula:'CuSO4', name:'Copper(II) Sulfate', need:{Cu:1,S:1,O:4}, tool:'electrolysis', desc:'A bright blue crystal used in fungicides and electroplating.' },
  { formula:'AgNO3', name:'Silver Nitrate', need:{Ag:1,N:1,O:3}, tool:'electrolysis', desc:'The key precursor to most other silver compounds, including photographic film.' },
  { formula:'NH3', name:'Ammonia', need:{N:1,H:3}, tool:'pressure', desc:'Made industrially via the Haber process, which needs high pressure and heat.' },
  { formula:'SiC', name:'Silicon Carbide', need:{Si:1,C:1}, tool:'pressure', desc:'An extremely hard synthetic abrasive, also used in semiconductors.' },
  { formula:'AuCl3', name:'Gold(III) Chloride', need:{Au:1,Cl:3}, tool:'pressure', desc:'A rare, expensive compound used in gold plating and catalysis.' },
  { formula:'PtO2', name:"Platinum(IV) Oxide (Adams' Catalyst)", need:{Pt:1,O:2}, tool:'pressure', desc:'A dense brown catalyst used to speed up hydrogenation reactions.' },
];

const TOOLS = [
  { id:'basic', name:'Basic Glassware', cost:0, desc:'Beakers and tubing — free, unlocks simple combinations.' },
  { id:'burner', name:'Bunsen Burner', cost:50, desc:'Unlocks combustion and heat-driven reactions.' },
  { id:'electrolysis', name:'Electrolysis Rig', cost:200, desc:'Splits compounds using electric current — unlocks more advanced synthesis.' },
  { id:'pressure', name:'High-Pressure Reactor', cost:800, desc:'Unlocks industrial-scale reactions like ammonia synthesis and precious-metal compounds.' },
];
