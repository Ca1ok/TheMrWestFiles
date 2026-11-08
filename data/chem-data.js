// Chemistry reference data for the WestLab engine and the WestShop catalogue.
// Prices are "$ per mole of atoms" (a game-scale analogy of real market prices). Edit freely.

// ---- prices for every element NOT already priced in economy-data.js (so the shop sells all 118) ----
const EXTRA_PRICES = {
  Rb:90, Y:140, Nb:60, Tc:9000, Ru:1200, In:300, Te:40, Cs:900, La:45, Ce:30, Pr:110, Nd:80, Pm:25000, Sm:70, Eu:900, Gd:120, Tb:700,
  Dy:300, Ho:600, Er:200, Tm:1500, Yb:250, Lu:2500, Hf:750, Ta:300, Re:2200, Os:12000, Ir:60000, Tl:150, Po:150000, At:300000,
  Rn:2000, Fr:500000, Ra:90000, Ac:150000, Th:150, Pa:400000, Np:120000, Pu:250000, Am:350000, Cm:900000, Bk:2e6, Cf:3e6, Es:6e6,
  Fm:9e6, Md:1.4e7, No:2e7, Lr:3e7, Rf:5e7, Db:7e7, Sg:1e8, Bh:1.5e8, Hs:2e8, Mt:3e8, Ds:4e8, Rg:5e8, Cn:6e8, Nh:7e8, Fl:8e8, Mc:9e8, Lv:1e9, Ts:1.2e9, Og:1.5e9
};

// ---- common oxidation states, most typical first ----
const OXIDATION = {
  H:[1,-1], He:[], Li:[1], Be:[2], B:[3], C:[4,-4,2], N:[-3,5,3,4,2,1], O:[-2,-1], F:[-1], Ne:[],
  Na:[1], Mg:[2], Al:[3], Si:[4,-4], P:[5,3,-3], S:[-2,6,4], Cl:[-1,1,3,5,7], Ar:[], K:[1], Ca:[2],
  Sc:[3], Ti:[4,3], V:[5,4,3,2], Cr:[3,6,2], Mn:[2,4,7,3], Fe:[3,2], Co:[2,3], Ni:[2], Cu:[2,1], Zn:[2],
  Ga:[3], Ge:[4,2], As:[3,5,-3], Se:[-2,4,6], Br:[-1,1,5], Kr:[], Rb:[1], Sr:[2], Y:[3], Zr:[4], Nb:[5,3], Mo:[6,4], Tc:[7,4], Ru:[3,4], Rh:[3], Pd:[2,4], Ag:[1], Cd:[2],
  In:[3], Sn:[4,2], Sb:[3,5,-3], Te:[-2,4,6], I:[-1,1,5,7], Xe:[], Cs:[1], Ba:[2],
  La:[3], Ce:[3,4], Pr:[3,4], Nd:[3], Pm:[3], Sm:[3,2], Eu:[3,2], Gd:[3], Tb:[3,4], Dy:[3], Ho:[3], Er:[3], Tm:[3], Yb:[3,2], Lu:[3],
  Hf:[4], Ta:[5], W:[6,4], Re:[7,4], Os:[4,8], Ir:[3,4], Pt:[4,2], Au:[3,1], Hg:[2,1], Tl:[1,3], Pb:[2,4], Bi:[3,5], Po:[4,2], At:[-1], Rn:[],
  Fr:[1], Ra:[2], Ac:[3], Th:[4], Pa:[5,4], U:[6,4,3,5], Np:[5,4,3,6], Pu:[4,3,6,5], Am:[3], Cm:[3], Bk:[3], Cf:[3], Es:[3], Fm:[3], Md:[3], No:[2], Lr:[3],
  Rf:[4], Db:[5], Sg:[6], Bh:[7], Hs:[8], Mt:[3], Ds:[2], Rg:[3], Cn:[2], Nh:[1], Fl:[2], Mc:[1], Lv:[2], Ts:[-1], Og:[]
};
// ---- Pauling electronegativity (approximate; unknowns default by block) ----
const ELECTRONEG = {
  H:2.20, Li:0.98, Be:1.57, B:2.04, C:2.55, N:3.04, O:3.44, F:3.98, Na:0.93, Mg:1.31, Al:1.61, Si:1.90, P:2.19, S:2.58, Cl:3.16,
  K:0.82, Ca:1.00, Sc:1.36, Ti:1.54, V:1.63, Cr:1.66, Mn:1.55, Fe:1.83, Co:1.88, Ni:1.91, Cu:1.90, Zn:1.65, Ga:1.81, Ge:2.01, As:2.18, Se:2.55, Br:2.96,
  Rb:0.82, Sr:0.95, Y:1.22, Zr:1.33, Nb:1.6, Mo:2.16, Tc:1.9, Ru:2.2, Rh:2.28, Pd:2.20, Ag:1.93, Cd:1.69, In:1.78, Sn:1.96, Sb:2.05, Te:2.1, I:2.66,
  Cs:0.79, Ba:0.89, Hf:1.3, Ta:1.5, W:2.36, Re:1.9, Os:2.2, Ir:2.20, Pt:2.28, Au:2.54, Hg:2.00, Tl:1.62, Pb:2.33, Bi:2.02, Po:2.0, At:2.2, Fr:0.7, Ra:0.9
};
const DIATOMIC = new Set(['H','N','O','F','Cl','Br','I']);                         // elements that exist as X2 in their standard state
const ACTIVITY = ['Cs','Rb','K','Ba','Sr','Ca','Na','Li','Mg','Be','Al','Mn','Zn','Cr','Fe','Cd','Co','Ni','Sn','Pb','H','Cu','Ag','Hg','Pt','Au']; // most → least reactive
const VIOLENT_WITH_WATER = new Set(['Cs','Rb','K','Ba','Sr','Ca','Na','Li']);

// ---- ions the engine can build salts, acids and bases from (formula, charge, name) ----
const ION_TABLE = [
  ['NH4', 1, 'ammonium'], ['OH', -1, 'hydroxide'], ['NO3', -1, 'nitrate'], ['NO2', -1, 'nitrite'], ['SO4', -2, 'sulfate'], ['SO3', -2, 'sulfite'],
  ['HSO4', -1, 'hydrogen sulfate'], ['CO3', -2, 'carbonate'], ['HCO3', -1, 'hydrogen carbonate'], ['PO4', -3, 'phosphate'], ['HPO4', -2, 'hydrogen phosphate'],
  ['H2PO4', -1, 'dihydrogen phosphate'], ['ClO', -1, 'hypochlorite'], ['ClO2', -1, 'chlorite'], ['ClO3', -1, 'chlorate'], ['ClO4', -1, 'perchlorate'],
  ['MnO4', -1, 'permanganate'], ['CrO4', -2, 'chromate'], ['Cr2O7', -2, 'dichromate'], ['CN', -1, 'cyanide'], ['SCN', -1, 'thiocyanate'],
  ['C2H3O2', -1, 'acetate'], ['C2O4', -2, 'oxalate'], ['O2', -2, 'peroxide'], ['BrO3', -1, 'bromate'], ['IO3', -1, 'iodate'], ['S2O3', -2, 'thiosulfate']
];
// ---- simple English names for the first-row elements used in covalent naming ----
const ROOT_NAMES = { H:'hydr', C:'carb', N:'nitr', O:'ox', F:'fluor', P:'phosph', S:'sulf', Cl:'chlor', Br:'brom', I:'iod', Se:'selen', As:'arsen', B:'bor', Si:'silic', Te:'tellur', At:'astat', Ge:'german', Sb:'antimon' };

// ---- NAMED REACTIONS: reactions whose real products the generic rules cannot (or wrongly) derive. Consulted FIRST by Chem.solve; the engine still balances the equation,
// looks up thermochemistry and decides spontaneity/kinetics itself — nothing here stores a number except the optional Ea (kJ/mol) for textbook-slow/fast cases.
//   r: reagent formulas (a bare 'N' / 'H' / 'O' means the element in its standard state X2)   p: product formulas   n: conditions the reaction needs   Ea: activation energy override, kJ/mol
//   notModelled: the engine deliberately refuses (e.g. complex-ion equilibria it has no data for) and says so, instead of inventing products.   obs: what a player sees in the real world.
//   src: reference. Ea values are textbook/qualitative figures chosen for gameplay, not measured constants (stated per entry where used).
const NAMED_REACTIONS = [
  { id: 'contact', type: 'Contact process (SO₂ → SO₃)', r: ['SO2', 'O2'], p: ['SO3'], n: ['heat', 'catalyst'], obs: 'SO₂ and O₂ over vanadium(V) oxide at ~700–750 K: exothermic, so the equilibrium conversion falls as the temperature rises (the industrial compromise between rate and yield).', src: 'ΔH298 = −198 kJ per 2 SO₂ (NBS)' },
  { id: 'water-gas-shift', type: 'Water–gas shift', r: ['CO', 'H2O'], p: ['H2', 'CO2'], n: ['heat'], obs: 'Steam converts CO to CO₂ and extra H₂ over iron/copper catalysts; mildly exothermic (ΔH298 = −41 kJ), equilibrium conversion drops as T rises.', src: 'Moe 1962: K = exp(4577.8/T − 4.33)' },
  { id: 'no-oxidation', type: 'Oxidation of nitric oxide', r: ['NO', 'O2'], p: ['NO2'], n: [], Ea: 5, obs: 'Colourless NO meets air and instantly turns into brown NO₂ gas.', src: 'Textbook; the reaction is fast at room temperature (Ea ≈ 0 – gameplay value 5 kJ/mol)' },
  { id: 'no2-dimerisation', type: 'NO₂ ⇌ N₂O₄ equilibrium', r: ['NO2'], p: ['N2O4'], n: [], Ea: 5, obs: 'Brown NO₂ pales to colourless N₂O₄ in the cold and darkens again when heated (ΔH = −57 kJ per N₂O₄); the classic Le Chatelier demo.', src: 'Kp(298 K) of N₂O₄ → 2 NO₂ ≈ 0.15 bar (NBS)' },
  { id: 'steam-reforming', type: 'Steam reforming', r: ['CH4', 'H2O'], p: ['CO', 'H2'], n: ['heat', 'catalyst'], obs: 'Syngas (CO + H₂) from methane and steam over a nickel catalyst at 800–1000 °C; strongly endothermic (ΔH298 = +206 kJ/mol CH₄).', src: 'CRC/NBS ΔHf; industrial process' },
  { id: 'ostwald', type: 'Ostwald process (step 1)', r: ['NH3', 'O2'], p: ['NO', 'H2O'], n: ['heat', 'catalyst'], obs: 'Ammonia burns on a hot platinum gauze to nitric oxide (ΔH298 = −905 kJ per 4 NH₃, steam as product); the NO is then oxidised and absorbed to make nitric acid.', src: 'NBS ΔHf' },
  { id: 'cu-silver-nitrate', type: 'Single displacement', r: ['Cu', 'AgNO3'], p: ['Cu(NO3)2', 'Ag'], n: [], obs: 'Silver crystals grow on the copper and the solution turns blue (Cu²⁺).', src: 'Activity series: Cu is above Ag; copper(II) is its stable ion' },
  { id: 'chlor-alkali', type: 'Electrolysis of brine (chlor-alkali)', r: ['NaCl', 'H2O'], p: ['NaOH', 'H2', 'Cl2'], n: ['spark'], obs: 'Chlorine gas at the anode, hydrogen at the cathode, sodium hydroxide left in solution.', src: 'Industrial chlor-alkali cell' },
  { id: 'copper-sulfate-electrolysis', type: 'Electrolysis of copper(II) sulfate solution', r: ['CuSO4', 'H2O'], p: ['Cu', 'O2', 'H2SO4'], n: ['spark'], obs: 'Copper plates onto the cathode, oxygen bubbles at an inert anode, the solution becomes acidic.', src: 'Standard electrolysis result (inert electrodes)' },
  { id: 'rusting', type: 'Corrosion (rusting)', r: ['Fe', 'O2', 'H2O'], p: ['Fe(OH)3'], n: [], Ea: 55, obs: 'Iron in damp air slowly turns to orange-brown hydrated iron(III) oxide (modelled as Fe(OH)₃). Water is needed; salt speeds it up. Takes days to years — Ea ≈ 55 kJ/mol is a gameplay figure for the electrochemical mechanism.', src: 'Textbook; Fe(OH)3 from CRC' },
  { id: 'lead-iodide', type: 'Precipitation', r: ['Pb(NO3)2', 'KI'], p: ['PbI2', 'KNO3'], n: [], obs: 'A bright yellow precipitate of lead(II) iodide (“golden rain” when it is re-crystallised from hot water).', src: 'Ksp(PbI2) = 9.8e-9 (CRC)' },
  { id: 'solvay', type: 'Solvay process (key step)', r: ['NaCl', 'NH3', 'CO2', 'H2O'], p: ['NaHCO3', 'NH4Cl'], n: [], obs: 'Sodium hydrogencarbonate precipitates from cold ammoniacal brine (it is the least soluble salt present); heating it later gives soda ash (Na₂CO₃).', src: 'Industrial Solvay process' },
  { id: 'no2-absorption', type: 'Nitric acid absorption (Ostwald, last step)', r: ['NO2', 'H2O'], p: ['HNO3', 'NO'], n: [], obs: 'Brown NO\u2082 is bubbled through water: it disproportionates to nitric acid and nitric oxide, and the NO is sent back to be oxidised again (3 NO\u2082 + H\u2082O \u2192 2 HNO\u2083 + NO).', src: 'Ostwald process, industrial nitric acid' },
  { id: 'urea-synthesis', type: 'Bosch-Meiser urea process', r: ['NH3', 'CO2'], p: ['CH4N2O', 'H2O'], n: ['heat', 'pressure'], obs: 'Ammonia and carbon dioxide at ~450 K and ~150 bar give ammonium carbamate, which loses water to urea (2 NH\u2083 + CO\u2082 \u2192 CO(NH\u2082)\u2082 + H\u2082O).', src: 'Industrial fertiliser chemistry' },
  { id: 'methanol-synthesis', type: 'Methanol synthesis', r: ['CO', 'H2'], p: ['CH3OH'], n: ['heat', 'catalyst', 'pressure'], obs: 'Syngas over a copper/zinc oxide catalyst at 50-100 bar makes methanol (CO + 2 H\u2082 \u2192 CH\u2083OH).', src: 'ICI low-pressure process' },
  { id: 'ethene-hydration', type: 'Catalytic hydration of ethene', r: ['C2H4', 'H2O'], p: ['C2H5OH'], n: ['heat', 'catalyst', 'pressure'], obs: 'Steam and ethene over phosphoric acid on silica at ~570 K and 70 bar give ethanol (C\u2082H\u2084 + H\u2082O \u2192 C\u2082H\u2085OH).', src: 'Industrial ethanol' },
  { id: 'calcination-soda', type: 'Calcination of sodium hydrogencarbonate', r: ['NaHCO3'], p: ['Na2CO3', 'H2O', 'CO2'], n: ['heat'], obs: 'Heated NaHCO\u2083 decomposes to soda ash, steam and CO\u2082 (2 NaHCO\u2083 \u2192 Na\u2082CO\u2083 + H\u2082O + CO\u2082) \u2014 the CO\u2082 goes back into the Solvay carbonator.', src: 'Solvay process' },
  { id: 'ammonia-recovery', type: 'Ammonia recovery (Solvay)', r: ['NH4Cl', 'CaO'], p: ['NH3', 'CaCl2', 'H2O'], n: ['heat'], obs: 'Lime frees the ammonia from ammonium chloride so it can be used again; calcium chloride is the waste (2 NH\u2084Cl + CaO \u2192 2 NH\u2083 + CaCl\u2082 + H\u2082O).', src: 'Solvay process' },
  { id: 'silver-mirror', type: 'Tollens’ test (silver mirror)', r: ['AgNO3', 'C6H12O6'], notModelled: true, why: 'The silver mirror needs the diammine silver complex [Ag(NH₃)₂]⁺ and an aldehyde reducing sugar in alkaline solution; WestLab has no complex-ion or aldehyde-oxidation data, so it will not guess products.', obs: 'A shiny silver mirror forms on the glass.', src: 'Textbook' },
  { id: 'cu-ammonia', type: 'Complex-ion formation', r: ['CuSO4', 'NH3'], notModelled: true, why: 'Cu²⁺ + NH₃ forms the deep-blue tetraammine complex [Cu(NH₃)₄]²⁺ (first a pale-blue Cu(OH)₂ precipitate that redissolves). WestLab has no complex-ion data, so it will not guess products.', obs: 'Pale-blue precipitate → deep-blue solution.', src: 'Textbook' },
  { id: 'fe-thiocyanate', type: 'Complex-ion formation', r: ['FeCl3', 'KSCN'], notModelled: true, why: 'Fe³⁺ + SCN⁻ ⇌ [Fe(SCN)]²⁺ is a blood-red complex equilibrium in solution (not a precipitate). WestLab has no complex-ion data, so it will not guess products.', obs: 'Instant blood-red colour; fades when Fe³⁺ is removed (Le Chatelier demo).', src: 'Textbook' },
  { id: 'amphoteric-al', type: 'Amphoteric hydroxide', r: ['Al(OH)3', 'NaOH'], notModelled: true, why: 'Al(OH)₃ dissolves in excess base as the aluminate ion [Al(OH)₄]⁻ — a complex ion WestLab has no data for, so it will not guess products.', obs: 'White precipitate redissolves in excess NaOH.', src: 'Textbook' }
];
