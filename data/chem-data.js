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
