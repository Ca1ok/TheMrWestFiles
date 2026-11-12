// Periodic table reference data — element list, category colors, and state/block color schemes.
// Edit here to add elements or change the color scheme without touching site logic.

const CATEGORY_COLORS = {
  'alkali-metal': '#e05a5a',
  'alkaline-earth': '#f0925a',
  'transition-metal': '#f0c04a',
  'post-transition': '#7bd17b',
  'metalloid': '#3fc7a6',
  'nonmetal': '#5aa9f0',
  'halogen': '#8f8ff0',
  'noble-gas': '#c77bdb',
  'lanthanide': '#e87fb0',
  'actinide': '#c98fe0',
  'unknown': '#8a8a8a'
};
const CATEGORY_LABELS = {
  'alkali-metal':'Alkali metal','alkaline-earth':'Alkaline earth metal','transition-metal':'Transition metal',
  'post-transition':'Post-transition metal','metalloid':'Metalloid','nonmetal':'Nonmetal','halogen':'Halogen',
  'noble-gas':'Noble gas','lanthanide':'Lanthanide','actinide':'Actinide','unknown':'Unknown'
};

// [num, sym, name, mass, category, period, group]  (group 0 = placed in lanthanide/actinide rows)
const ELEMENTS = [
[1,'H','Hydrogen',1.01,'nonmetal',1,1],[2,'He','Helium',4.00,'noble-gas',1,18],
[3,'Li','Lithium',6.94,'alkali-metal',2,1],[4,'Be','Beryllium',9.01,'alkaline-earth',2,2],
[5,'B','Boron',10.81,'metalloid',2,13],[6,'C','Carbon',12.01,'nonmetal',2,14],
[7,'N','Nitrogen',14.01,'nonmetal',2,15],[8,'O','Oxygen',16.00,'nonmetal',2,16],
[9,'F','Fluorine',19.00,'halogen',2,17],[10,'Ne','Neon',20.18,'noble-gas',2,18],
[11,'Na','Sodium',22.99,'alkali-metal',3,1],[12,'Mg','Magnesium',24.31,'alkaline-earth',3,2],
[13,'Al','Aluminium',26.98,'post-transition',3,13],[14,'Si','Silicon',28.09,'metalloid',3,14],
[15,'P','Phosphorus',30.97,'nonmetal',3,15],[16,'S','Sulfur',32.07,'nonmetal',3,16],
[17,'Cl','Chlorine',35.45,'halogen',3,17],[18,'Ar','Argon',39.95,'noble-gas',3,18],
[19,'K','Potassium',39.10,'alkali-metal',4,1],[20,'Ca','Calcium',40.08,'alkaline-earth',4,2],
[21,'Sc','Scandium',44.96,'transition-metal',4,3],[22,'Ti','Titanium',47.87,'transition-metal',4,4],
[23,'V','Vanadium',50.94,'transition-metal',4,5],[24,'Cr','Chromium',52.00,'transition-metal',4,6],
[25,'Mn','Manganese',54.94,'transition-metal',4,7],[26,'Fe','Iron',55.85,'transition-metal',4,8],
[27,'Co','Cobalt',58.93,'transition-metal',4,9],[28,'Ni','Nickel',58.69,'transition-metal',4,10],
[29,'Cu','Copper',63.55,'transition-metal',4,11],[30,'Zn','Zinc',65.38,'transition-metal',4,12],
[31,'Ga','Gallium',69.72,'post-transition',4,13],[32,'Ge','Germanium',72.63,'metalloid',4,14],
[33,'As','Arsenic',74.92,'metalloid',4,15],[34,'Se','Selenium',78.97,'nonmetal',4,16],
[35,'Br','Bromine',79.90,'halogen',4,17],[36,'Kr','Krypton',83.80,'noble-gas',4,18],
[37,'Rb','Rubidium',85.47,'alkali-metal',5,1],[38,'Sr','Strontium',87.62,'alkaline-earth',5,2],
[39,'Y','Yttrium',88.91,'transition-metal',5,3],[40,'Zr','Zirconium',91.22,'transition-metal',5,4],
[41,'Nb','Niobium',92.91,'transition-metal',5,5],[42,'Mo','Molybdenum',95.95,'transition-metal',5,6],
[43,'Tc','Technetium',98,'transition-metal',5,7],[44,'Ru','Ruthenium',101.07,'transition-metal',5,8],
[45,'Rh','Rhodium',102.91,'transition-metal',5,9],[46,'Pd','Palladium',106.42,'transition-metal',5,10],
[47,'Ag','Silver',107.87,'transition-metal',5,11],[48,'Cd','Cadmium',112.41,'transition-metal',5,12],
[49,'In','Indium',114.82,'post-transition',5,13],[50,'Sn','Tin',118.71,'post-transition',5,14],
[51,'Sb','Antimony',121.76,'metalloid',5,15],[52,'Te','Tellurium',127.60,'metalloid',5,16],
[53,'I','Iodine',126.90,'halogen',5,17],[54,'Xe','Xenon',131.29,'noble-gas',5,18],
[55,'Cs','Caesium',132.91,'alkali-metal',6,1],[56,'Ba','Barium',137.33,'alkaline-earth',6,2],
[57,'La','Lanthanum',138.91,'lanthanide',6,0],[58,'Ce','Cerium',140.12,'lanthanide',6,0],
[59,'Pr','Praseodymium',140.91,'lanthanide',6,0],[60,'Nd','Neodymium',144.24,'lanthanide',6,0],
[61,'Pm','Promethium',145,'lanthanide',6,0],[62,'Sm','Samarium',150.36,'lanthanide',6,0],
[63,'Eu','Europium',151.96,'lanthanide',6,0],[64,'Gd','Gadolinium',157.25,'lanthanide',6,0],
[65,'Tb','Terbium',158.93,'lanthanide',6,0],[66,'Dy','Dysprosium',162.50,'lanthanide',6,0],
[67,'Ho','Holmium',164.93,'lanthanide',6,0],[68,'Er','Erbium',167.26,'lanthanide',6,0],
[69,'Tm','Thulium',168.93,'lanthanide',6,0],[70,'Yb','Ytterbium',173.05,'lanthanide',6,0],
[71,'Lu','Lutetium',174.97,'lanthanide',6,3],
[72,'Hf','Hafnium',178.49,'transition-metal',6,4],[73,'Ta','Tantalum',180.95,'transition-metal',6,5],
[74,'W','Tungsten',183.84,'transition-metal',6,6],[75,'Re','Rhenium',186.21,'transition-metal',6,7],
[76,'Os','Osmium',190.23,'transition-metal',6,8],[77,'Ir','Iridium',192.22,'transition-metal',6,9],
[78,'Pt','Platinum',195.08,'transition-metal',6,10],[79,'Au','Gold',196.97,'transition-metal',6,11],
[80,'Hg','Mercury',200.59,'transition-metal',6,12],[81,'Tl','Thallium',204.38,'post-transition',6,13],
[82,'Pb','Lead',207.2,'post-transition',6,14],[83,'Bi','Bismuth',208.98,'post-transition',6,15],
[84,'Po','Polonium',209,'post-transition',6,16],[85,'At','Astatine',210,'halogen',6,17],
[86,'Rn','Radon',222,'noble-gas',6,18],
[87,'Fr','Francium',223,'alkali-metal',7,1],[88,'Ra','Radium',226,'alkaline-earth',7,2],
[89,'Ac','Actinium',227,'actinide',7,0],[90,'Th','Thorium',232.04,'actinide',7,0],
[91,'Pa','Protactinium',231.04,'actinide',7,0],[92,'U','Uranium',238.03,'actinide',7,0],
[93,'Np','Neptunium',237,'actinide',7,0],[94,'Pu','Plutonium',244,'actinide',7,0],
[95,'Am','Americium',243,'actinide',7,0],[96,'Cm','Curium',247,'actinide',7,0],
[97,'Bk','Berkelium',247,'actinide',7,0],[98,'Cf','Californium',251,'actinide',7,0],
[99,'Es','Einsteinium',252,'actinide',7,0],[100,'Fm','Fermium',257,'actinide',7,0],
[101,'Md','Mendelevium',258,'actinide',7,0],[102,'No','Nobelium',259,'actinide',7,0],
[103,'Lr','Lawrencium',266,'actinide',7,3],
[104,'Rf','Rutherfordium',267,'transition-metal',7,4],[105,'Db','Dubnium',268,'transition-metal',7,5],
[106,'Sg','Seaborgium',269,'transition-metal',7,6],[107,'Bh','Bohrium',270,'transition-metal',7,7],
[108,'Hs','Hassium',269,'transition-metal',7,8],[109,'Mt','Meitnerium',278,'unknown',7,9],
[110,'Ds','Darmstadtium',281,'unknown',7,10],[111,'Rg','Roentgenium',282,'unknown',7,11],
[112,'Cn','Copernicium',285,'unknown',7,12],[113,'Nh','Nihonium',286,'post-transition',7,13],
[114,'Fl','Flerovium',289,'post-transition',7,14],[115,'Mc','Moscovium',290,'post-transition',7,15],
[116,'Lv','Livermorium',293,'post-transition',7,16],[117,'Ts','Tennessine',294,'halogen',7,17],
[118,'Og','Oganesson',294,'noble-gas',7,18]
];

const GAS_AT_25C = new Set([1,2,7,8,9,10,17,18,36,54,86]);
const LIQUID_AT_25C = new Set([35,80]);
const UNKNOWN_STATE = new Set([109,110,111,112,113,114,115,116,117,118]); // too unstable/short-lived to measure directly

const STATE_COLORS = { solid:'#c9a876', liquid:'#5aa9f0', gas:'#e05a5a', unknown:'#6b5a41' };
const STATE_LABELS = { solid:'Solid', liquid:'Liquid', gas:'Gas', unknown:'Unknown / too unstable to measure' };
const BLOCK_COLORS = { s:'#e05a5a', p:'#5aa9f0', d:'#f0c04a', f:'#c77bdb' };
const BLOCK_LABELS = { s:'s-block', p:'p-block', d:'d-block', f:'f-block' };

// ---------------------------------------------------------------------------------------------
// COMPOUND LOOKUP — powers the "type a combo, get its name" panel on the Periodic Table page.
// Each entry's `comp` is its FULL elemental composition (symbol -> atom count), independent of
// display formula order, so the lookup matches purely on composition — Hx2,O and Ox1,Hx2 hit the
// same entry. `category` is one of: oxide, acid, base, salt, organic, hydrocarbon, gas.
// `charge` is the compound's net (always 0 for a neutral formula unit — everything here is a
// balanced neutral compound); `ions` is an optional plain-language note on the ions/oxidation
// states involved, since "charge" alone isn't very meaningful for a neutral salt.
// A combination NOT in this list still works in the lookup — it just gets a computed molar mass
// and elemental breakdown with no name attached, and this list is easy to extend: add an entry
// with a `comp` object and it's found immediately, no other code changes needed.
// ---------------------------------------------------------------------------------------------
const COMPOUND_LOOKUP = [
  // ---- oxides ----
  { comp:{H:2,O:1}, name:'Water', formula:'H2O', common:'Water', category:'oxide', charge:0, desc:'The universal solvent — two hydrogens bonded to one oxygen.' },
  { comp:{C:1,O:2}, name:'Carbon Dioxide', formula:'CO2', common:'Dry ice (solid form)', category:'oxide', charge:0, desc:'Produced by respiration and combustion; frozen it becomes dry ice.' },
  { comp:{C:1,O:1}, name:'Carbon Monoxide', formula:'CO', category:'oxide', charge:0, desc:'Colorless, odorless, and dangerous — formed by incomplete combustion.' },
  { comp:{S:1,O:2}, name:'Sulfur Dioxide', formula:'SO2', category:'oxide', charge:0, desc:'Released when sulfur burns; a major contributor to acid rain.' },
  { comp:{S:1,O:3}, name:'Sulfur Trioxide', formula:'SO3', category:'oxide', charge:0, desc:'Reacts violently with water to form sulfuric acid.' },
  { comp:{N:1,O:1}, name:'Nitric Oxide', formula:'NO', category:'oxide', charge:0, desc:'A signalling molecule in the body, and an air pollutant from combustion.' },
  { comp:{N:1,O:2}, name:'Nitrogen Dioxide', formula:'NO2', category:'oxide', charge:0, desc:'A reddish-brown toxic gas, a major component of smog.' },
  { comp:{N:2,O:1}, name:'Nitrous Oxide', formula:'N2O', common:'Laughing gas', category:'oxide', charge:0, desc:'Used as a mild anesthetic/analgesic and as an aerosol propellant.' },
  { comp:{N:2,O:5}, name:'Dinitrogen Pentoxide', formula:'N2O5', category:'oxide', charge:0, desc:'The anhydride of nitric acid — reacts with water to reform HNO3.' },
  { comp:{P:2,O:5}, name:'Phosphorus Pentoxide', formula:'P2O5', category:'oxide', charge:0, desc:'An extremely powerful desiccant — used to dry other chemicals.' },
  { comp:{Si:1,O:2}, name:'Silicon Dioxide', formula:'SiO2', common:'Quartz / Silica', category:'oxide', charge:0, desc:'The main component of sand and most glass.' },
  { comp:{Al:2,O:3}, name:'Aluminium Oxide', formula:'Al2O3', common:'Alumina', category:'oxide', charge:0, desc:'Extremely hard — used as an abrasive and in refractory ceramics.' },
  { comp:{Fe:2,O:3}, name:'Iron(III) Oxide', formula:'Fe2O3', common:'Rust', category:'oxide', charge:0, desc:'What iron becomes when it oxidizes over time.' },
  { comp:{Fe:3,O:4}, name:'Iron(II,III) Oxide', formula:'Fe3O4', common:'Magnetite', category:'oxide', charge:0, desc:'A naturally magnetic iron ore.' },
  { comp:{Cu:1,O:1}, name:'Copper(II) Oxide', formula:'CuO', category:'oxide', charge:0, desc:'A black solid formed when copper is heated in air.' },
  { comp:{Cu:2,O:1}, name:'Copper(I) Oxide', formula:'Cu2O', category:'oxide', charge:0, desc:'A red solid, historically used as a pigment and antifouling paint.' },
  { comp:{Zn:1,O:1}, name:'Zinc Oxide', formula:'ZnO', category:'oxide', charge:0, desc:'A white pigment used in sunscreen and skin ointments.' },
  { comp:{Mg:1,O:1}, name:'Magnesium Oxide', formula:'MgO', category:'oxide', charge:0, desc:'Used in antacids and as a refractory brick material.' },
  { comp:{Ca:1,O:1}, name:'Calcium Oxide', formula:'CaO', common:'Quicklime', category:'oxide', charge:0, desc:'Made by roasting limestone — reacts vigorously with water.' },
  { comp:{Na:2,O:1}, name:'Sodium Oxide', formula:'Na2O', category:'oxide', charge:0, desc:'Reacts violently with water to form sodium hydroxide.' },
  { comp:{K:2,O:1}, name:'Potassium Oxide', formula:'K2O', category:'oxide', charge:0, desc:'A component of some fertilizers, expressed as "potash".' },
  { comp:{Li:2,O:1}, name:'Lithium Oxide', formula:'Li2O', category:'oxide', charge:0, desc:'Used in specialty glasses and ceramic glazes.' },
  { comp:{Ba:1,O:1}, name:'Barium Oxide', formula:'BaO', category:'oxide', charge:0, desc:'Used as a drying agent and precursor to other barium compounds.' },
  { comp:{Sr:1,O:1}, name:'Strontium Oxide', formula:'SrO', category:'oxide', charge:0, desc:'Reacts vigorously with water — used in specialty ceramics.' },
  { comp:{Ti:1,O:2}, name:'Titanium Dioxide', formula:'TiO2', category:'oxide', charge:0, desc:'The white pigment in most paint, sunscreen, and toothpaste.' },
  { comp:{Mn:1,O:2}, name:'Manganese Dioxide', formula:'MnO2', category:'oxide', charge:0, desc:'The cathode material in ordinary alkaline batteries.' },
  { comp:{Ni:1,O:1}, name:'Nickel(II) Oxide', formula:'NiO', category:'oxide', charge:0, desc:'A green solid used to color ceramic glazes.' },
  { comp:{Pb:1,O:1}, name:'Lead(II) Oxide', formula:'PbO', common:'Litharge', category:'oxide', charge:0, desc:'Used historically in lead glass and old-style batteries.' },
  { comp:{Pb:1,O:2}, name:'Lead(IV) Oxide', formula:'PbO2', category:'oxide', charge:0, desc:'The positive-plate material in lead-acid car batteries.' },
  { comp:{Sn:1,O:2}, name:'Tin(IV) Oxide', formula:'SnO2', category:'oxide', charge:0, desc:'Used in mild abrasives and transparent conductive coatings.' },
  { comp:{B:2,O:3}, name:'Boron Trioxide', formula:'B2O3', category:'oxide', charge:0, desc:'The main ingredient of borosilicate (Pyrex-style) glass.' },
  { comp:{Cr:2,O:3}, name:'Chromium(III) Oxide', formula:'Cr2O3', category:'oxide', charge:0, desc:'A green pigment and polishing abrasive.' },
  { comp:{Ga:2,O:3}, name:'Gallium(III) Oxide', formula:'Ga2O3', category:'oxide', charge:0, desc:'A wide-bandgap semiconductor used in power electronics.' },
  { comp:{Ge:1,O:2}, name:'Germanium Dioxide', formula:'GeO2', category:'oxide', charge:0, desc:'Used to make high-refractive-index camera and fiber-optic glass.' },
  { comp:{Bi:2,O:3}, name:'Bismuth(III) Oxide', formula:'Bi2O3', category:'oxide', charge:0, desc:'A yellow pigment and component of some lead-free solders.' },
  { comp:{Pt:1,O:2}, name:"Platinum(IV) Oxide", formula:'PtO2', common:"Adams' Catalyst", category:'oxide', charge:0, desc:'A hydrogenation catalyst.' },
  { comp:{U:1,O:2}, name:'Uranium Dioxide', formula:'UO2', category:'oxide', charge:0, desc:'The ceramic fuel pellet material used in most nuclear reactors.' },
  { comp:{U:1,O:3}, name:'Uranium Trioxide', formula:'UO3', category:'oxide', charge:0, desc:'An intermediate in nuclear fuel processing.' },
  { comp:{Cl:1,O:2}, name:'Chlorine Dioxide', formula:'ClO2', category:'oxide', charge:0, desc:'A strong disinfectant and bleaching agent.' },

  // ---- acids ----
  { comp:{H:1,Cl:1}, name:'Hydrochloric Acid', formula:'HCl', category:'acid', charge:0, ions:'H+ and Cl-', desc:'A strong acid, also present naturally in stomach acid.' },
  { comp:{H:1,F:1}, name:'Hydrofluoric Acid', formula:'HF', category:'acid', charge:0, ions:'H+ and F-', desc:'Weak as an acid, but notorious for etching glass.' },
  { comp:{H:1,Br:1}, name:'Hydrobromic Acid', formula:'HBr', category:'acid', charge:0, ions:'H+ and Br-', desc:'A strong acid used in organic bromination reactions.' },
  { comp:{H:1,I:1}, name:'Hydroiodic Acid', formula:'HI', category:'acid', charge:0, ions:'H+ and I-', desc:'One of the strongest common hydrohalic acids.' },
  { comp:{H:2,S:1,O:4}, name:'Sulfuric Acid', formula:'H2SO4', category:'acid', charge:0, ions:'2H+ and SO4²-', desc:'The world\'s most-produced industrial chemical by mass — the "king of chemicals."' },
  { comp:{H:2,S:1,O:3}, name:'Sulfurous Acid', formula:'H2SO3', category:'acid', charge:0, ions:'2H+ and SO3²-', desc:'Formed when sulfur dioxide dissolves in water.' },
  { comp:{H:1,N:1,O:3}, name:'Nitric Acid', formula:'HNO3', category:'acid', charge:0, ions:'H+ and NO3-', desc:'A strong, corrosive acid made industrially via the Ostwald process.' },
  { comp:{H:1,N:1,O:2}, name:'Nitrous Acid', formula:'HNO2', category:'acid', charge:0, ions:'H+ and NO2-', desc:'Unstable — decomposes readily into nitric oxide and nitric acid.' },
  { comp:{H:3,P:1,O:4}, name:'Phosphoric Acid', formula:'H3PO4', category:'acid', charge:0, ions:'3H+ and PO4³-', desc:'Gives cola its tang and is key to fertilizer production.' },
  { comp:{H:2,C:1,O:3}, name:'Carbonic Acid', formula:'H2CO3', category:'acid', charge:0, ions:'2H+ and CO3²-', desc:'Forms when CO2 dissolves in water — what makes soda fizzy and acidic.' },
  { comp:{C:2,H:4,O:2}, name:'Acetic Acid', formula:'CH3COOH', common:'Vinegar (dilute solution)', category:'acid', charge:0, desc:'The acid that gives vinegar its bite; also a key industrial solvent precursor.' },
  { comp:{H:1,C:1,N:1}, name:'Hydrocyanic Acid', formula:'HCN', category:'acid', charge:0, desc:'Extremely toxic — blocks cellular respiration.' },
  { comp:{H:2,S:1}, name:'Hydrogen Sulfide', formula:'H2S', category:'acid', charge:0, desc:'A toxic, flammable gas with the smell of rotten eggs.' },
  { comp:{H:1,Cl:1,O:1}, name:'Hypochlorous Acid', formula:'HClO', category:'acid', charge:0, desc:'The active disinfectant in chlorinated pool water and bleach solutions.' },
  { comp:{H:1,Cl:1,O:4}, name:'Perchloric Acid', formula:'HClO4', category:'acid', charge:0, desc:'One of the strongest common mineral acids; a powerful oxidizer.' },

  // ---- bases ----
  { comp:{Na:1,O:1,H:1}, name:'Sodium Hydroxide', formula:'NaOH', common:'Lye', category:'base', charge:0, ions:'Na+ and OH-', desc:'A caustic base produced industrially via electrolysis of brine.' },
  { comp:{K:1,O:1,H:1}, name:'Potassium Hydroxide', formula:'KOH', category:'base', charge:0, ions:'K+ and OH-', desc:'Used to make liquid soaps and as an alkaline-battery electrolyte.' },
  { comp:{Ca:1,O:2,H:2}, name:'Calcium Hydroxide', formula:'Ca(OH)2', common:'Slaked lime', category:'base', charge:0, ions:'Ca²+ and 2OH-', desc:'Used in mortar and plaster, and to raise soil pH.' },
  { comp:{Mg:1,O:2,H:2}, name:'Magnesium Hydroxide', formula:'Mg(OH)2', common:'Milk of Magnesia', category:'base', charge:0, ions:'Mg²+ and 2OH-', desc:'The active ingredient in a common antacid/laxative.' },
  { comp:{N:1,H:3}, name:'Ammonia', formula:'NH3', category:'base', charge:0, desc:'Made industrially via the Haber process — a pungent, water-soluble gas.' },
  { comp:{N:1,H:5,O:1}, name:'Ammonium Hydroxide', formula:'NH4OH', category:'base', charge:0, desc:'Ammonia dissolved in water — household "ammonia" cleaner.' },
  { comp:{Al:1,O:3,H:3}, name:'Aluminium Hydroxide', formula:'Al(OH)3', category:'base', charge:0, desc:'An amphoteric compound used in antacids and as a flame retardant.' },
  { comp:{Fe:1,O:2,H:2}, name:'Iron(II) Hydroxide', formula:'Fe(OH)2', category:'base', charge:0, desc:'A pale green solid that oxidizes readily in air.' },

  // ---- salts (halides, carbonates, sulfates, nitrates, phosphates) ----
  { comp:{Na:1,Cl:1}, name:'Sodium Chloride', formula:'NaCl', common:'Table salt', category:'salt', charge:0, ions:'Na+ and Cl-', desc:'An explosive metal and a toxic gas, combined into what you sprinkle on fries.' },
  { comp:{K:1,Cl:1}, name:'Potassium Chloride', formula:'KCl', category:'salt', charge:0, ions:'K+ and Cl-', desc:'A common salt substitute and fertilizer component.' },
  { comp:{Li:1,Cl:1}, name:'Lithium Chloride', formula:'LiCl', category:'salt', charge:0, ions:'Li+ and Cl-', desc:'Highly soluble — used as a drying agent and brazing flux.' },
  { comp:{Mg:1,Cl:2}, name:'Magnesium Chloride', formula:'MgCl2', category:'salt', charge:0, ions:'Mg²+ and 2Cl-', desc:'Used for road de-icing and as a tofu coagulant.' },
  { comp:{Ca:1,Cl:2}, name:'Calcium Chloride', formula:'CaCl2', category:'salt', charge:0, ions:'Ca²+ and 2Cl-', desc:'Highly hygroscopic — used as a drying agent and de-icer.' },
  { comp:{Ba:1,Cl:2}, name:'Barium Chloride', formula:'BaCl2', category:'salt', charge:0, ions:'Ba²+ and 2Cl-', desc:'Toxic and water-soluble — gives fireworks a green flame.' },
  { comp:{Zn:1,Cl:2}, name:'Zinc Chloride', formula:'ZnCl2', category:'salt', charge:0, ions:'Zn²+ and 2Cl-', desc:'A strong dehydrating agent, also used as a soldering flux.' },
  { comp:{Fe:1,Cl:2}, name:'Iron(II) Chloride', formula:'FeCl2', category:'salt', charge:0, ions:'Fe²+ and 2Cl-', desc:'A pale green solid used as a reducing agent and water treatment coagulant.' },
  { comp:{Fe:1,Cl:3}, name:'Iron(III) Chloride', formula:'FeCl3', category:'salt', charge:0, ions:'Fe³+ and 3Cl-', desc:'Used to etch copper circuit boards and treat wastewater.' },
  { comp:{Cu:1,Cl:2}, name:'Copper(II) Chloride', formula:'CuCl2', category:'salt', charge:0, ions:'Cu²+ and 2Cl-', desc:'A blue-green solid used as a catalyst and wood preservative.' },
  { comp:{Ag:1,Cl:1}, name:'Silver Chloride', formula:'AgCl', category:'salt', charge:0, ions:'Ag+ and Cl-', desc:'Famously light-sensitive — the basis of early photography.' },
  { comp:{Hg:1,Cl:2}, name:'Mercury(II) Chloride', formula:'HgCl2', category:'salt', charge:0, desc:'Historically called "corrosive sublimate" — highly toxic.' },
  { comp:{Pb:1,Cl:2}, name:'Lead(II) Chloride', formula:'PbCl2', category:'salt', charge:0, desc:'A white solid, poorly soluble in cold water.' },
  { comp:{Al:1,Cl:3}, name:'Aluminium Chloride', formula:'AlCl3', category:'salt', charge:0, desc:'A key Lewis-acid catalyst in Friedel-Crafts organic reactions.' },
  { comp:{N:1,H:4,Cl:1}, name:'Ammonium Chloride', formula:'NH4Cl', category:'salt', charge:0, ions:'NH4+ and Cl-', desc:'Used in dry-cell batteries and as a soldering flux.' },
  { comp:{Na:1,Br:1}, name:'Sodium Bromide', formula:'NaBr', category:'salt', charge:0, desc:'Historically used as a sedative; now mostly a chemical intermediate.' },
  { comp:{K:1,Br:1}, name:'Potassium Bromide', formula:'KBr', category:'salt', charge:0, desc:'Used in photography and as an anticonvulsant in veterinary medicine.' },
  { comp:{Na:1,I:1}, name:'Sodium Iodide', formula:'NaI', category:'salt', charge:0, desc:'Added to table salt to prevent iodine deficiency.' },
  { comp:{K:1,I:1}, name:'Potassium Iodide', formula:'KI', category:'salt', charge:0, desc:'Used to protect the thyroid from radioactive iodine exposure.' },
  { comp:{Na:1,F:1}, name:'Sodium Fluoride', formula:'NaF', category:'salt', charge:0, desc:'Added to water supplies and toothpaste to prevent tooth decay.' },
  { comp:{Ca:1,F:2}, name:'Calcium Fluoride', formula:'CaF2', common:'Fluorite', category:'salt', charge:0, desc:'The main natural source of fluorine, and the mineral fluorite.' },
  { comp:{Na:2,C:1,O:3}, name:'Sodium Carbonate', formula:'Na2CO3', common:'Soda ash / Washing soda', category:'salt', charge:0, ions:'2Na+ and CO3²-', desc:'Used in glassmaking, water softening, and laundry detergent.' },
  { comp:{Na:1,H:1,C:1,O:3}, name:'Sodium Bicarbonate', formula:'NaHCO3', common:'Baking soda', category:'salt', charge:0, ions:'Na+ and HCO3-', desc:'A mild base used in baking, cleaning, and as an antacid.' },
  { comp:{Ca:1,C:1,O:3}, name:'Calcium Carbonate', formula:'CaCO3', common:'Limestone / Chalk', category:'salt', charge:0, ions:'Ca²+ and CO3²-', desc:'The main component of limestone, marble, and seashells.' },
  { comp:{Mg:1,C:1,O:3}, name:'Magnesium Carbonate', formula:'MgCO3', category:'salt', charge:0, desc:'Used as an antacid and as chalk for gymnasts and climbers.' },
  { comp:{K:2,C:1,O:3}, name:'Potassium Carbonate', formula:'K2CO3', common:'Potash', category:'salt', charge:0, desc:'Used in glass and soap manufacture.' },
  { comp:{Na:2,S:1,O:4}, name:'Sodium Sulfate', formula:'Na2SO4', category:'salt', charge:0, ions:'2Na+ and SO4²-', desc:'Used in the manufacture of detergents and glass.' },
  { comp:{Ca:1,S:1,O:4}, name:'Calcium Sulfate', formula:'CaSO4', common:'Gypsum', category:'salt', charge:0, ions:'Ca²+ and SO4²-', desc:'The mineral gypsum — used to make plaster and drywall.' },
  { comp:{Cu:1,S:1,O:4}, name:'Copper(II) Sulfate', formula:'CuSO4', common:'Blue vitriol', category:'salt', charge:0, ions:'Cu²+ and SO4²-', desc:'A bright blue crystal used in fungicides and electroplating.' },
  { comp:{Fe:1,S:1,O:4}, name:'Iron(II) Sulfate', formula:'FeSO4', category:'salt', charge:0, ions:'Fe²+ and SO4²-', desc:'Used to treat iron-deficiency anemia and as a lawn-moss killer.' },
  { comp:{Zn:1,S:1,O:4}, name:'Zinc Sulfate', formula:'ZnSO4', category:'salt', charge:0, ions:'Zn²+ and SO4²-', desc:'Used as a dietary zinc supplement and micronutrient fertilizer.' },
  { comp:{Ni:1,S:1,O:4}, name:'Nickel(II) Sulfate', formula:'NiSO4', category:'salt', charge:0, desc:'The main electrolyte in nickel electroplating baths.' },
  { comp:{Mg:1,S:1,O:4}, name:'Magnesium Sulfate', formula:'MgSO4', common:'Epsom salt', category:'salt', charge:0, ions:'Mg²+ and SO4²-', desc:'Used in bath soaks and as a soil/fertilizer additive.' },
  { comp:{Al:2,S:3,O:12}, name:'Aluminium Sulfate', formula:'Al2(SO4)3', category:'salt', charge:0, desc:'Used in water treatment and as a mordant in dyeing.' },
  { comp:{N:2,H:8,S:1,O:4}, name:'Ammonium Sulfate', formula:'(NH4)2SO4', category:'salt', charge:0, desc:'A widely used nitrogen fertilizer.' },
  { comp:{Na:1,N:1,O:3}, name:'Sodium Nitrate', formula:'NaNO3', category:'salt', charge:0, desc:'Used as a fertilizer and food preservative.' },
  { comp:{K:1,N:1,O:3}, name:'Potassium Nitrate', formula:'KNO3', common:'Saltpeter', category:'salt', charge:0, desc:'A key ingredient of gunpowder and a food preservative.' },
  { comp:{Ag:1,N:1,O:3}, name:'Silver Nitrate', formula:'AgNO3', category:'salt', charge:0, desc:'The key precursor to most other silver compounds, including photographic film.' },
  { comp:{Ca:1,N:2,O:6}, name:'Calcium Nitrate', formula:'Ca(NO3)2', category:'salt', charge:0, desc:'Used as a fertilizer and in some coolant/de-icing mixes.' },
  { comp:{N:2,H:4,O:3}, name:'Ammonium Nitrate', formula:'NH4NO3', category:'salt', charge:0, desc:'A widely used nitrogen fertilizer, also a powerful oxidizer.' },
  { comp:{Na:3,P:1,O:4}, name:'Sodium Phosphate', formula:'Na3PO4', category:'salt', charge:0, desc:'Used as a food additive and in cleaning products.' },
  { comp:{Ca:3,P:2,O:8}, name:'Calcium Phosphate', formula:'Ca3(PO4)2', category:'salt', charge:0, desc:'The main mineral component of bones and teeth.' },
  { comp:{K:2,Cr:2,O:7}, name:'Potassium Dichromate', formula:'K2Cr2O7', category:'salt', charge:0, desc:'A bright orange oxidizer — the basis of old-style breathalyzer tests.' },
  { comp:{K:1,Mn:1,O:4}, name:'Potassium Permanganate', formula:'KMnO4', category:'salt', charge:0, desc:'A deep purple oxidizer used as a disinfectant and in redox titrations.' },
  { comp:{Na:2,Si:1,O:3}, name:'Sodium Silicate', formula:'Na2SiO3', common:'Water glass', category:'salt', charge:0, desc:'Used in cements, adhesives, and fireproofing.' },
  { comp:{Pb:1,I:2}, name:'Lead(II) Iodide', formula:'PbI2', category:'salt', charge:0, desc:'Forms brilliant golden crystals — the classic "golden rain" demonstration.' },
  { comp:{Co:1,Cl:2}, name:'Cobalt(II) Chloride', formula:'CoCl2', category:'salt', charge:0, desc:'Changes color with humidity — used in humidity indicators.' },
  { comp:{Au:1,Cl:3}, name:'Gold(III) Chloride', formula:'AuCl3', category:'salt', charge:0, desc:'A rare compound used in gold plating and catalysis.' },

  // ---- organics / hydrocarbons ----
  { comp:{C:1,H:4}, name:'Methane', formula:'CH4', category:'hydrocarbon', charge:0, desc:'The simplest hydrocarbon, and the main component of natural gas.' },
  { comp:{C:2,H:6}, name:'Ethane', formula:'C2H6', category:'hydrocarbon', charge:0, desc:'A two-carbon alkane — a major component of natural gas liquids.' },
  { comp:{C:3,H:8}, name:'Propane', formula:'C3H8', category:'hydrocarbon', charge:0, desc:'The fuel in gas grills and portable camping stoves.' },
  { comp:{C:4,H:10}, name:'Butane', formula:'C4H10', category:'hydrocarbon', charge:0, desc:'The fuel in lighters and portable camping stoves.' },
  { comp:{C:2,H:4}, name:'Ethylene', formula:'C2H4', category:'hydrocarbon', charge:0, desc:'The most-produced organic compound in the world — the monomer for polyethylene.' },
  { comp:{C:2,H:2}, name:'Acetylene', formula:'C2H2', category:'hydrocarbon', charge:0, desc:'Burns extremely hot — used in oxy-acetylene welding.' },
  { comp:{C:6,H:6}, name:'Benzene', formula:'C6H6', category:'hydrocarbon', charge:0, desc:'The simplest aromatic ring — made industrially by catalytic reforming.' },
  { comp:{C:8,H:18}, name:'Octane', formula:'C8H18', category:'hydrocarbon', charge:0, desc:'A major component of gasoline; the basis of the "octane rating."' },
  { comp:{C:1,H:4,O:1}, name:'Methanol', formula:'CH3OH', category:'organic', charge:0, desc:'The simplest alcohol — toxic to drink, used as antifreeze and fuel additive.' },
  { comp:{C:2,H:6,O:1}, name:'Ethanol', formula:'C2H5OH', category:'organic', charge:0, desc:'The alcohol in alcoholic drinks and hand sanitizer.' },
  { comp:{C:3,H:8,O:1}, name:'Isopropanol', formula:'C3H7OH', common:'Rubbing alcohol', category:'organic', charge:0, desc:'A common disinfectant and cleaning solvent.' },
  { comp:{C:1,H:2,O:1}, name:'Formaldehyde', formula:'HCHO', category:'organic', charge:0, desc:'A pungent preservative gas — the "formal-" in formalin.' },
  { comp:{C:3,H:6,O:1}, name:'Acetone', formula:'CH3COCH3', category:'organic', charge:0, desc:'A common solvent — the active ingredient in nail-polish remover.' },
  { comp:{C:1,H:1,Cl:3}, name:'Chloroform', formula:'CHCl3', category:'organic', charge:0, desc:'A dense, sweet-smelling solvent, once used as a surgical anesthetic.' },
  { comp:{C:1,Cl:4}, name:'Carbon Tetrachloride', formula:'CCl4', category:'organic', charge:0, desc:'A former dry-cleaning solvent, now restricted for ozone/toxicity reasons.' },
  { comp:{C:6,H:6,O:1}, name:'Phenol', formula:'C6H5OH', category:'organic', charge:0, desc:'A caustic aromatic compound, historically used as an antiseptic.' },
  { comp:{C:6,H:12,O:6}, name:'Glucose', formula:'C6H12O6', category:'organic', charge:0, desc:'The simple sugar your body actually burns for energy.' },
  { comp:{C:12,H:22,O:11}, name:'Sucrose', formula:'C12H22O11', common:'Table sugar', category:'organic', charge:0, desc:'Ordinary table sugar — a glucose and fructose bonded together.' },
  { comp:{C:1,O:1,N:2,H:4}, name:'Urea', formula:'CO(NH2)2', category:'organic', charge:0, desc:'The main nitrogen-containing waste product in urine; also a common fertilizer.' },
];
const CATEGORY_LOOKUP_LABELS = {
  oxide:'Oxide', acid:'Acid', base:'Base', salt:'Salt', organic:'Organic compound',
  hydrocarbon:'Hydrocarbon', gas:'Gas'
};

// ---------------------------------------------------------------------------------------------
// POLYATOMIC / MONATOMIC IONS — for the Compound Lookup's ion support (e.g. typing "SO42-" or
// "NO3-"). Matched the same way as COMPOUND_LOOKUP — by composition — but a `charge` on top, so
// the sulfate ion (SO4, charge -2) and neutral SO4-with-4-oxygens-somehow are distinct lookups.
// `formula` is the plain (no-charge) formula string; the charge is appended separately at
// render time so it always displays as a proper superscript regardless of magnitude.
// ---------------------------------------------------------------------------------------------
const POLYATOMIC_IONS = [
  // ---- common monatomic ions ----
  { comp:{H:1}, charge:1, formula:'H', name:'Hydrogen ion (proton)' },
  { comp:{Na:1}, charge:1, formula:'Na', name:'Sodium ion' },
  { comp:{K:1}, charge:1, formula:'K', name:'Potassium ion' },
  { comp:{Li:1}, charge:1, formula:'Li', name:'Lithium ion' },
  { comp:{Ag:1}, charge:1, formula:'Ag', name:'Silver ion' },
  { comp:{Cu:1}, charge:1, formula:'Cu', name:'Copper(I) ion' },
  { comp:{Ca:1}, charge:2, formula:'Ca', name:'Calcium ion' },
  { comp:{Mg:1}, charge:2, formula:'Mg', name:'Magnesium ion' },
  { comp:{Ba:1}, charge:2, formula:'Ba', name:'Barium ion' },
  { comp:{Zn:1}, charge:2, formula:'Zn', name:'Zinc ion' },
  { comp:{Cu:1}, charge:2, formula:'Cu', name:'Copper(II) ion' },
  { comp:{Fe:1}, charge:2, formula:'Fe', name:'Iron(II) ion' },
  { comp:{Fe:1}, charge:3, formula:'Fe', name:'Iron(III) ion' },
  { comp:{Pb:1}, charge:2, formula:'Pb', name:'Lead(II) ion' },
  { comp:{Al:1}, charge:3, formula:'Al', name:'Aluminium ion' },
  { comp:{F:1}, charge:-1, formula:'F', name:'Fluoride ion' },
  { comp:{Cl:1}, charge:-1, formula:'Cl', name:'Chloride ion' },
  { comp:{Br:1}, charge:-1, formula:'Br', name:'Bromide ion' },
  { comp:{I:1}, charge:-1, formula:'I', name:'Iodide ion' },
  { comp:{O:1}, charge:-2, formula:'O', name:'Oxide ion' },
  { comp:{S:1}, charge:-2, formula:'S', name:'Sulfide ion' },
  { comp:{N:1}, charge:-3, formula:'N', name:'Nitride ion' },
  { comp:{O:2}, charge:-2, formula:'O2', name:'Peroxide ion' },

  // ---- common polyatomic ions ----
  { comp:{O:1,H:1}, charge:-1, formula:'OH', name:'Hydroxide' },
  { comp:{N:1,H:4}, charge:1, formula:'NH4', name:'Ammonium' },
  { comp:{N:1,O:3}, charge:-1, formula:'NO3', name:'Nitrate' },
  { comp:{N:1,O:2}, charge:-1, formula:'NO2', name:'Nitrite' },
  { comp:{S:1,O:4}, charge:-2, formula:'SO4', name:'Sulfate' },
  { comp:{S:1,O:3}, charge:-2, formula:'SO3', name:'Sulfite' },
  { comp:{H:1,S:1,O:4}, charge:-1, formula:'HSO4', name:'Hydrogen sulfate (bisulfate)' },
  { comp:{C:1,O:3}, charge:-2, formula:'CO3', name:'Carbonate' },
  { comp:{H:1,C:1,O:3}, charge:-1, formula:'HCO3', name:'Bicarbonate' },
  { comp:{P:1,O:4}, charge:-3, formula:'PO4', name:'Phosphate' },
  { comp:{H:1,P:1,O:4}, charge:-2, formula:'HPO4', name:'Hydrogen phosphate' },
  { comp:{H:2,P:1,O:4}, charge:-1, formula:'H2PO4', name:'Dihydrogen phosphate' },
  { comp:{Cl:1,O:1}, charge:-1, formula:'ClO', name:'Hypochlorite' },
  { comp:{Cl:1,O:2}, charge:-1, formula:'ClO2', name:'Chlorite' },
  { comp:{Cl:1,O:3}, charge:-1, formula:'ClO3', name:'Chlorate' },
  { comp:{Cl:1,O:4}, charge:-1, formula:'ClO4', name:'Perchlorate' },
  { comp:{C:1,N:1}, charge:-1, formula:'CN', name:'Cyanide' },
  { comp:{S:1,C:1,N:1}, charge:-1, formula:'SCN', name:'Thiocyanate' },
  { comp:{C:2,H:3,O:2}, charge:-1, formula:'CH3COO', name:'Acetate' },
  { comp:{Mn:1,O:4}, charge:-1, formula:'MnO4', name:'Permanganate' },
  { comp:{Cr:2,O:7}, charge:-2, formula:'Cr2O7', name:'Dichromate' },
  { comp:{Cr:1,O:4}, charge:-2, formula:'CrO4', name:'Chromate' },
];
