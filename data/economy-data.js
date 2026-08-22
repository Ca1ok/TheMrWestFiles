// Element Economy game data: element prices, compound recipes, and crafting tools.
// Edit here to add elements, compounds, or tools without touching site logic.
//
// Everything here is the ONLY source of truth for the economy and the Compound Lab — there is
// no external API call anywhere in this game. Recipes can require raw elements (`need`),
// already-crafted compounds (`needCompounds`), or both — so compounds can be reacted with other
// compounds to build up genuinely complex targets, the same way real synthesis works in stages.

const ELEMENT_PRICES = {
  // Main-group + common transition/precious/heavy metals — enough for a real range of
  // inorganic AND organic chemistry, without pricing in the fully synthetic superheavy elements
  // (Rf and beyond) that have no practical chemistry to react with anyway.
  H: 0.50, He: 4, Li: 4, Be: 15, B: 6, C: 0.30, N: 0.25, O: 0.20, F: 2, Ne: 8,
  Na: 3, Mg: 3, Al: 2, Si: 2, P: 3, S: 0.40, Cl: 1, Ar: 3, K: 5, Ca: 1.5,
  Sc: 120, Ti: 8, V: 25, Cr: 9, Mn: 5, Fe: 2, Co: 30, Ni: 12, Cu: 8, Zn: 2.5,
  Ga: 150, Ge: 900, As: 2, Se: 15, Br: 3, Kr: 60, Sr: 6, Zr: 35, Mo: 40, Rh: 15000,
  Pd: 1500, Ag: 700, Cd: 3, Sn: 20, Sb: 6, I: 35, Xe: 1800, Ba: 4, W: 35, Pt: 30000,
  Au: 62000, Hg: 35, Pb: 2, Bi: 25, U: 100
}; // approx USD per "unit" (rough mole-scale analogy)

const TOOLS = [
  { id:'basic', name:'Basic Glassware', cost:0, desc:'Beakers and tubing — free, unlocks simple combinations at room temperature.' },
  { id:'burner', name:'Bunsen Burner', cost:50, desc:'Unlocks combustion and heat-driven reactions.' },
  { id:'electrolysis', name:'Electrolysis Rig', cost:200, desc:'Splits compounds using electric current — unlocks more advanced inorganic synthesis.' },
  { id:'pressure', name:'High-Pressure Reactor', cost:800, desc:'Unlocks industrial-scale reactions like ammonia synthesis, strong-acid production, and precious-metal compounds.' },
  { id:'catalysis', name:'Catalytic Converter', cost:1500, desc:'Uses a catalyst bed to unlock hydrocarbon cracking, reforming, and other organic-chemistry reactions that need a catalyst rather than raw heat.' },
  { id:'distillation', name:'Distillation Column', cost:2500, desc:'Fractional distillation and esterification — unlocks separating and combining organic liquids by boiling point.' },
  { id:'polymer', name:'Polymerization Chamber', cost:4000, desc:'Strings monomers together into long chains — unlocks plastics and other polymer materials.' },
  { id:'cryo', name:'Cryogenic Condenser', cost:6000, desc:'Cools gases far enough to liquefy or freeze them — unlocks cryogenic liquids and solids.' },
];

const RECIPES = [
  // ---------- BASIC GLASSWARE: simple binary compounds, room temperature ----------
  { formula:'H2', name:'Hydrogen Gas', need:{H:2}, tool:'basic', desc:'The simplest diatomic molecule — two hydrogen atoms bonded together.' },
  { formula:'O2', name:'Oxygen Gas', need:{O:2}, tool:'basic', desc:'What you\'re breathing right now, more or less.' },
  { formula:'N2', name:'Nitrogen Gas', need:{N:2}, tool:'basic', desc:'Makes up about 78% of Earth\'s atmosphere.' },
  { formula:'H2O', name:'Water', need:{H:2,O:1}, tool:'basic', desc:'Two hydrogens, one oxygen. The universal solvent.' },
  { formula:'CO2', name:'Carbon Dioxide', need:{C:1,O:2}, tool:'basic', desc:'What you exhale, and what plants breathe in.' },
  { formula:'NaCl', name:'Sodium Chloride (Table Salt)', need:{Na:1,Cl:1}, tool:'basic', desc:'An explosive metal and a toxic gas, combined into something you sprinkle on fries.' },
  { formula:'HCl', name:'Hydrochloric Acid', need:{H:1,Cl:1}, tool:'basic', desc:'A strong acid — also naturally present in your stomach.' },
  { formula:'LiCl', name:'Lithium Chloride', need:{Li:1,Cl:1}, tool:'basic', desc:'Highly soluble — used as a drying agent and in brazing flux.' },
  { formula:'LiF', name:'Lithium Fluoride', need:{Li:1,F:1}, tool:'basic', desc:'Has the highest melting point of any lithium halide — used in optics.' },
  { formula:'BeCl2', name:'Beryllium Chloride', need:{Be:1,Cl:2}, tool:'basic', desc:'A covalent, polymeric solid — beryllium compounds are notably more covalent than other alkaline-earth halides.' },
  { formula:'BF3', name:'Boron Trifluoride', need:{B:1,F:3}, tool:'basic', desc:'A classic Lewis acid — its boron atom is electron-deficient and eager to accept a pair.' },
  { formula:'MgO', name:'Magnesium Oxide', need:{Mg:1,O:1}, tool:'basic', desc:'A white solid used in antacids and refractory bricks.' },
  { formula:'MgF2', name:'Magnesium Fluoride', need:{Mg:1,F:2}, tool:'basic', desc:'Extremely low solubility — used as an anti-reflective optical coating.' },
  { formula:'CaF2', name:'Calcium Fluoride (Fluorite)', need:{Ca:1,F:2}, tool:'basic', desc:'The main natural source of fluorine, and the mineral fluorite.' },
  { formula:'KCl', name:'Potassium Chloride', need:{K:1,Cl:1}, tool:'basic', desc:'A common salt substitute and fertilizer component.' },
  { formula:'KF', name:'Potassium Fluoride', need:{K:1,F:1}, tool:'basic', desc:'Used to introduce fluorine into organic molecules.' },
  { formula:'MgCl2', name:'Magnesium Chloride', need:{Mg:1,Cl:2}, tool:'basic', desc:'Used for de-icing roads and as a coagulant in tofu-making.' },
  { formula:'CaCl2', name:'Calcium Chloride', need:{Ca:1,Cl:2}, tool:'basic', desc:'Highly hygroscopic — used as a drying agent and de-icer.' },
  { formula:'SrCl2', name:'Strontium Chloride', need:{Sr:1,Cl:2}, tool:'basic', desc:'Used in some toothpastes for sensitive teeth.' },
  { formula:'ZnCl2', name:'Zinc Chloride', need:{Zn:1,Cl:2}, tool:'basic', desc:'A strong dehydrating agent, also used as a soldering flux.' },
  { formula:'ZnCl2', name:'Zinc Chloride', need:{Zn:1,Cl:2}, tool:'basic', desc:'Used as a flux in soldering and galvanizing.' },
  { formula:'BaCl2', name:'Barium Chloride', need:{Ba:1,Cl:2}, tool:'basic', desc:'Toxic and water-soluble — used in fireworks for a green flame color.' },

  // ---------- BUNSEN BURNER: oxidation and combustion products ----------
  { formula:'CH4', name:'Methane', need:{C:1,H:4}, tool:'burner', desc:'The simplest hydrocarbon, and the main component of natural gas.' },
  { formula:'CO', name:'Carbon Monoxide', need:{C:1,O:1}, tool:'burner', desc:'Formed by incomplete combustion — colorless, odorless, and dangerous.' },
  { formula:'SO2', name:'Sulfur Dioxide', need:{S:1,O:2}, tool:'burner', desc:'Produced when sulfur burns — a major component of acid rain.' },
  { formula:'Li2O', name:'Lithium Oxide', need:{Li:2,O:1}, tool:'burner', desc:'Used in specialty glasses and ceramic glazes.' },
  { formula:'BeO', name:'Beryllium Oxide', need:{Be:1,O:1}, tool:'burner', desc:'An excellent electrical insulator with unusually high thermal conductivity for a ceramic.' },
  { formula:'B2O3', name:'Boron Trioxide', need:{B:2,O:3}, tool:'burner', desc:'The main ingredient of borosilicate (Pyrex-style) glass.' },
  { formula:'TiO2', name:'Titanium Dioxide', need:{Ti:1,O:2}, tool:'burner', desc:'The white pigment in most paint, sunscreen, and toothpaste.' },
  { formula:'Cr2O3', name:'Chromium(III) Oxide', need:{Cr:2,O:3}, tool:'burner', desc:'A green pigment, and the abrasive in green rouge polishing compound.' },
  { formula:'MnO2', name:'Manganese Dioxide', need:{Mn:1,O:2}, tool:'burner', desc:'The cathode material in ordinary alkaline batteries.' },
  { formula:'NiO', name:'Nickel(II) Oxide', need:{Ni:1,O:1}, tool:'burner', desc:'A green solid used to color ceramic glazes and in battery electrodes.' },
  { formula:'Fe2O3', name:'Iron(III) Oxide (Rust)', need:{Fe:2,O:3}, tool:'burner', desc:'What iron becomes when it oxidizes over time.' },
  { formula:'CaCO3', name:'Calcium Carbonate', need:{Ca:1,C:1,O:3}, tool:'burner', desc:'The main component of limestone, marble, and seashells.' },
  { formula:'ZnO', name:'Zinc Oxide', need:{Zn:1,O:1}, tool:'burner', desc:'A white pigment used in sunscreen and ointments.' },
  { formula:'CuO', name:'Copper(II) Oxide', need:{Cu:1,O:1}, tool:'burner', desc:'A black solid formed when copper is heated in air.' },
  { formula:'Ga2O3', name:'Gallium(III) Oxide', need:{Ga:2,O:3}, tool:'burner', desc:'A wide-bandgap semiconductor used in some power electronics.' },
  { formula:'GeO2', name:'Germanium Dioxide', need:{Ge:1,O:2}, tool:'burner', desc:'Used to make high-refractive-index glass for camera and fiber-optic lenses.' },
  { formula:'SiO2', name:'Silicon Dioxide (Quartz)', need:{Si:1,O:2}, tool:'burner', desc:'The main component of sand and most glass.' },
  { formula:'SnO2', name:'Tin(IV) Oxide', need:{Sn:1,O:2}, tool:'burner', desc:'Used as a mild abrasive in polishing compounds and in transparent conductive coatings.' },
  { formula:'PbO', name:'Lead(II) Oxide', need:{Pb:1,O:1}, tool:'burner', desc:'Known as "litharge" — used historically in lead-glass and old-style batteries.' },
  { formula:'Bi2O3', name:'Bismuth(III) Oxide', need:{Bi:2,O:3}, tool:'burner', desc:'A yellow pigment and a component of some lead-free solders.' },
  { formula:'SrO', name:'Strontium Oxide', need:{Sr:1,O:1}, tool:'burner', desc:'Reacts vigorously with water — used in some specialty ceramics.' },
  { formula:'BaO', name:'Barium Oxide', need:{Ba:1,O:1}, tool:'burner', desc:'Used as a drying agent and in the manufacture of other barium compounds.' },

  // ---------- ELECTROLYSIS RIG: salts of transition metals, oxidizers, organics with O ----------
  { formula:'NaOH', name:'Sodium Hydroxide (Lye)', need:{Na:1,O:1,H:1}, tool:'electrolysis', desc:'A caustic base produced industrially via electrolysis of brine.' },
  { formula:'Al2O3', name:'Aluminium Oxide', need:{Al:2,O:3}, tool:'electrolysis', desc:'Also known as alumina — extremely hard, used as an abrasive.' },
  { formula:'CuSO4', name:'Copper(II) Sulfate', need:{Cu:1,S:1,O:4}, tool:'electrolysis', desc:'A bright blue crystal used in fungicides and electroplating.' },
  { formula:'FeSO4', name:'Iron(II) Sulfate', need:{Fe:1,S:1,O:4}, tool:'electrolysis', desc:'Used to treat iron-deficiency anemia and as a lawn-moss killer.' },
  { formula:'NiSO4', name:'Nickel(II) Sulfate', need:{Ni:1,S:1,O:4}, tool:'electrolysis', desc:'The main electrolyte used in nickel electroplating baths.' },
  { formula:'ZnSO4', name:'Zinc Sulfate', need:{Zn:1,S:1,O:4}, tool:'electrolysis', desc:'Used as a dietary zinc supplement and an agricultural micronutrient.' },
  { formula:'AgNO3', name:'Silver Nitrate', need:{Ag:1,N:1,O:3}, tool:'electrolysis', desc:'The key precursor to most other silver compounds, including photographic film.' },
  { formula:'AgCl', name:'Silver Chloride', need:{Ag:1,Cl:1}, tool:'electrolysis', desc:'Famously light-sensitive — darkens on exposure, the basis of early photography.' },
  { formula:'PbI2', name:'Lead(II) Iodide', need:{Pb:1,I:2}, tool:'electrolysis', desc:'Forms brilliant golden-yellow crystals — the classic "golden rain" demonstration.' },
  { formula:'CoCl2', name:'Cobalt(II) Chloride', need:{Co:1,Cl:2}, tool:'electrolysis', desc:'Changes color with humidity (blue when dry, pink when hydrated) — used in humidity indicators.' },
  { formula:'NiCl2', name:'Nickel(II) Chloride', need:{Ni:1,Cl:2}, tool:'electrolysis', desc:'A yellow-green solid used in nickel electroplating.' },
  { formula:'HgCl2', name:'Mercury(II) Chloride', need:{Hg:1,Cl:2}, tool:'electrolysis', desc:'Historically called "corrosive sublimate" — highly toxic, once used as a disinfectant.' },
  { formula:'KMnO4', name:'Potassium Permanganate', need:{K:1,Mn:1,O:4}, tool:'electrolysis', desc:'A deep purple, powerful oxidizer used as a disinfectant and in classic redox titrations.' },
  { formula:'K2Cr2O7', name:'Potassium Dichromate', need:{K:2,Cr:2,O:7}, tool:'electrolysis', desc:'A bright orange oxidizer — the color-change basis of old-style breathalyzer tests.' },
  { formula:'CH3OH', name:'Methanol', need:{C:1,H:4,O:1}, tool:'electrolysis', desc:'The simplest alcohol — toxic to drink, used as antifreeze and a fuel additive.' },
  { formula:'C2H5OH', name:'Ethanol', need:{C:2,H:6,O:1}, tool:'electrolysis', desc:'The alcohol in alcoholic drinks and hand sanitizer.' },
  { formula:'HCHO', name:'Formaldehyde', need:{C:1,H:2,O:1}, tool:'electrolysis', desc:'A pungent preservative gas — the "formal-" in formalin.' },

  // ---------- HIGH-PRESSURE REACTOR: strong acids/bases, industrial gas synthesis ----------
  { formula:'NH3', name:'Ammonia', need:{N:1,H:3}, tool:'pressure', desc:'Made industrially via the Haber process, which needs high pressure and heat.' },
  { formula:'H2SO4', name:'Sulfuric Acid', need:{H:2,S:1,O:4}, tool:'pressure', desc:'The world\'s most-produced industrial chemical by mass — the "king of chemicals."' },
  { formula:'HNO3', name:'Nitric Acid', need:{H:1,N:1,O:3}, tool:'pressure', desc:'A strong, corrosive acid made industrially via the Ostwald process.' },
  { formula:'H3PO4', name:'Phosphoric Acid', need:{H:3,P:1,O:4}, tool:'pressure', desc:'Gives cola its tangy flavor, and is a key ingredient in fertilizer production.' },
  { formula:'KOH', name:'Potassium Hydroxide', need:{K:1,O:1,H:1}, tool:'pressure', desc:'A strong base used to make liquid soaps and as an electrolyte in alkaline batteries.' },
  { formula:'Ca(OH)2', name:'Calcium Hydroxide (Slaked Lime)', need:{Ca:1,O:2,H:2}, tool:'pressure', desc:'Used in mortar, plaster, and to raise soil pH.' },
  { formula:'Mg(OH)2', name:'Magnesium Hydroxide', need:{Mg:1,O:2,H:2}, tool:'pressure', desc:'The active ingredient in Milk of Magnesia antacid.' },
  { formula:'AuCl3', name:'Gold(III) Chloride', need:{Au:1,Cl:3}, tool:'pressure', desc:'A rare, expensive compound used in gold plating and catalysis.' },
  { formula:'PtO2', name:"Platinum(IV) Oxide (Adams' Catalyst)", need:{Pt:1,O:2}, tool:'pressure', desc:'A dense brown catalyst used to speed up hydrogenation reactions.' },
  { formula:'UO2', name:'Uranium Dioxide', need:{U:1,O:2}, tool:'pressure', desc:'The ceramic fuel pellet material used in most nuclear power reactors.' },

  // ---------- CATALYTIC CONVERTER: hydrocarbons that need a catalyst, not just heat ----------
  { formula:'C2H6', name:'Ethane', need:{C:2,H:6}, tool:'catalysis', desc:'A two-carbon alkane — a major component of natural gas liquids.' },
  { formula:'C3H8', name:'Propane', need:{C:3,H:8}, tool:'catalysis', desc:'The fuel in gas grills and portable camping stoves.' },
  { formula:'C2H4', name:'Ethylene', need:{C:2,H:4}, tool:'catalysis', desc:'The most-produced organic compound in the world — the monomer for polyethylene.' },
  { formula:'C2H2', name:'Acetylene', need:{C:2,H:2}, tool:'catalysis', desc:'Burns extremely hot — used in oxy-acetylene welding and cutting torches.' },
  { formula:'C6H6', name:'Benzene', need:{C:6,H:6}, tool:'catalysis', desc:'The simplest aromatic ring — made industrially by catalytic reforming.' },
  { formula:'C2H3Cl', name:'Vinyl Chloride', need:{C:2,H:3,Cl:1}, tool:'catalysis', desc:'The monomer used to manufacture PVC plastic.' },
  { formula:'CH3COOH', name:'Acetic Acid', need:{O:2}, needCompounds:{C2H5OH:1}, tool:'catalysis', desc:'Catalytic oxidation of ethanol — the acid that gives vinegar its bite.' },

  // ---------- DISTILLATION COLUMN: separating/combining organic liquids ----------
  { formula:'C6H12O6', name:'Glucose', need:{C:6,H:12,O:6}, tool:'distillation', desc:'The simple sugar your body actually burns for energy.' },
  { formula:'C4H8O2', name:'Ethyl Acetate', need:{}, needCompounds:{C2H5OH:1, CH3COOH:1}, tool:'distillation', desc:'A fruity-smelling ester, made by reacting ethanol with acetic acid — classic esterification.' },

  // ---------- POLYMERIZATION CHAMBER: monomers strung into materials ----------
  { formula:'PE', name:'Polyethylene', need:{}, needCompounds:{C2H4:4}, tool:'polymer', desc:'The world\'s most common plastic — grocery bags, bottles, and packaging film. (Abstracted here as 4 monomer units — a real chain is thousands long.)' },
  { formula:'PVC', name:'Polyvinyl Chloride (PVC)', need:{}, needCompounds:{C2H3Cl:4}, tool:'polymer', desc:'Rigid, durable plastic used in pipes, siding, and flooring. (Abstracted as 4 monomer units for gameplay.)' },

  // ---------- CRYOGENIC CONDENSER: liquefying/freezing existing gases ----------
  { formula:'LN2', name:'Liquid Nitrogen', need:{}, needCompounds:{N2:1}, tool:'cryo', desc:'Nitrogen gas cooled to -196°C until it liquefies — a physical change, not a new substance, but useful enough to track separately.' },
  { formula:'LOX', name:'Liquid Oxygen', need:{}, needCompounds:{O2:1}, tool:'cryo', desc:'Oxygen gas cooled to -183°C until it liquefies — used as rocket propellant oxidizer.' },
  { formula:'DryIce', name:'Dry Ice', need:{}, needCompounds:{CO2:1}, tool:'cryo', desc:'Carbon dioxide frozen solid at -78°C — sublimates straight to gas without melting.' },

  // ---------- REACTIVITY BENCH: reactions with a SECOND product (byproducts), not just one
  // output — metal + acid gives a salt AND hydrogen gas, acid + base gives a salt AND water,
  // and one metal can displace another straight out of its compound. All of these use `basic`
  // or `burner` tooling since none actually need pressure/electrolysis/catalysis to happen. ----------
  { formula:'MgSO4', name:'Magnesium Sulfate (Epsom Salt)', need:{Mg:1}, needCompounds:{H2SO4:1}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Magnesium metal displaces hydrogen straight out of sulfuric acid — the classic "metal + acid" reaction. Also known as Epsom salt.' },
  { formula:'ZnSO4', name:'Zinc Sulfate', need:{Zn:1}, needCompounds:{H2SO4:1}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Zinc dissolving in sulfuric acid, fizzing hydrogen gas as it goes.' },
  { formula:'FeSO4', name:'Iron(II) Sulfate', need:{Fe:1}, needCompounds:{H2SO4:1}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Iron dissolving in dilute sulfuric acid — same reaction family as magnesium and zinc.' },
  { formula:'MgCl2', name:'Magnesium Chloride', need:{Mg:1}, needCompounds:{HCl:2}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Magnesium reacting with hydrochloric acid — vigorous fizzing as hydrogen escapes.' },
  { formula:'CaCl2', name:'Calcium Chloride', need:{Ca:1}, needCompounds:{HCl:2}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Calcium reacting with hydrochloric acid to give a salt plus hydrogen gas.' },
  { formula:'ZnCl2', name:'Zinc Chloride', need:{Zn:1}, needCompounds:{HCl:2}, tool:'basic', byproducts:[{type:'compound', formula:'H2', qty:1}], desc:'Zinc reacting with hydrochloric acid — one of the most common school-lab metal+acid demonstrations.' },
  { formula:'NaCl', name:'Sodium Chloride (Table Salt)', need:{}, needCompounds:{NaOH:1, HCl:1}, tool:'basic', byproducts:[{type:'compound', formula:'H2O', qty:1}], desc:'Neutralization: a strong base and a strong acid cancel each other out, leaving a neutral salt plus water.' },
  { formula:'KCl', name:'Potassium Chloride', need:{}, needCompounds:{KOH:1, HCl:1}, tool:'basic', byproducts:[{type:'compound', formula:'H2O', qty:1}], desc:'The same acid-base neutralization pattern as table salt, using potassium hydroxide instead.' },
  { formula:'CaCl2', name:'Calcium Chloride', need:{}, needCompounds:{'Ca(OH)2':1, HCl:2}, tool:'basic', byproducts:[{type:'compound', formula:'H2O', qty:2}], desc:'Slaked lime neutralizing hydrochloric acid — a second route to calcium chloride, producing water instead of hydrogen gas.' },
  { formula:'FeSO4', name:'Iron(II) Sulfate', need:{Fe:1}, needCompounds:{CuSO4:1}, tool:'basic', byproducts:[{type:'element', symbol:'Cu', qty:1}], desc:'Iron is more reactive than copper, so it displaces copper straight out of solution — the classic "copper-plated nail" demonstration. Watch for the reddish copper coating.' },
  { formula:'ZnSO4', name:'Zinc Sulfate', need:{Zn:1}, needCompounds:{CuSO4:1}, tool:'basic', byproducts:[{type:'element', symbol:'Cu', qty:1}], desc:'Zinc is more reactive than copper and displaces it out of solution the same way iron does.' },
];
