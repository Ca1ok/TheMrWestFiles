/* WestLab synthesis data (reference tables for os/lib/synth*.js). Nothing here is game state.
 * CATALOG rows: [name, SMILES, tags, opts]   tags (space separated) are the ROLES a reagent plays in the reaction templates:
 *   solv:<class> solvent (p protic, a aprotic-polar, n non-polar, e dry ether, c chlorinated, ac acidic)   buy = sold in WestShop
 *   acid-strong acid-weak base-strong base-mild ox-strong ox-mild hyd-mild hyd-strong x2 hx chlorinating nuc-cn nuc-i nitrite lewis cat ...
 * opts: k = inventory key (legacy registry formulas keep their key; carbon-free species use their formula), tb/tm = boiling/melting point (K),
 *       buy:false = a target/name only (not sold), w = water-soluble, wear = uses before 1 mol of a catalyst is spent.
 * Everything else a molecule needs (boiling point, polarity, state) is estimated from its structure in synth.js, so any molecule works. */
const SYNTH_CATALOG = [
  // ---- solvents
  ['Water', 'O', 'solv:p w', { k: 'H2O', tb: 373, tm: 273, free: 1 }],
  ['Ethanol', 'CCO', 'solv:p w alcohol', { k: 'C2H5OH', tb: 351, tm: 159 }],
  ['Methanol', 'CO', 'solv:p w alcohol', { k: 'CH3OH', tb: 338, tm: 176 }],
  ['Isopropanol', 'CC(C)O', 'solv:p w alcohol', { k: 'C3H7OH', tb: 356, tm: 184 }],
  ['Acetone', 'CC(=O)C', 'solv:a w ketone', { k: 'CH3COCH3', tb: 329, tm: 178 }],
  ['Acetonitrile', 'CC#N', 'solv:a w', { tb: 355, tm: 229 }],
  ['Dimethylformamide', 'CN(C)C=O', 'solv:a w', { tb: 426, tm: 212 }],
  ['Dimethyl sulfoxide', 'CS(C)=O', 'solv:a w', { tb: 462, tm: 291 }],
  ['Tetrahydrofuran', 'C1CCOC1', 'solv:e', { tb: 339, tm: 164 }],
  ['Diethyl ether', 'CCOCC', 'solv:e', { tb: 308, tm: 157 }],
  ['Dichloromethane', 'ClCCl', 'solv:c', { tb: 313, tm: 178 }],
  ['Chloroform', 'ClC(Cl)Cl', 'solv:c', { k: 'CHCl3', tb: 334, tm: 209 }],
  ['Toluene', 'Cc1ccccc1', 'solv:n arene', { tb: 384, tm: 178 }],
  ['Hexane', 'CCCCCC', 'solv:n alkane', { tb: 342, tm: 178 }],
  ['Cyclohexane', 'C1CCCCC1', 'solv:n alkane', { tb: 354, tm: 279 }],
  ['Ethyl acetate', 'CCOC(C)=O', 'solv:a ester', { k: 'C4H8O2', tb: 350, tm: 189 }],
  ['Acetic acid', 'CC(=O)O', 'solv:ac acid-weak carboxylic w', { k: 'CH3COOH', tb: 391, tm: 290 }],
  ['Pyridine', 'c1ccncc1', 'solv:a base-mild w', { tb: 388, tm: 231 }],
  ['Triethylamine', 'CCN(CC)CC', 'solv:n base-mild', { tb: 362, tm: 158 }],
  // ---- inorganic reagents
  ['Hydrogen chloride', 'Cl', 'acid-strong hx w', { k: 'HCl', tb: 188, tm: 159 }],
  ['Hydrogen bromide', 'Br', 'acid-strong hx w', { k: 'HBr', tb: 207, tm: 186 }],
  ['Sulfuric acid', 'OS(=O)(=O)O', 'acid-strong dehydrating w', { k: 'H2SO4', tb: 610, tm: 283 }],
  ['Phosphoric acid', 'OP(=O)(O)O', 'acid-mid dehydrating w', { k: 'H3PO4', tb: 431, tm: 315 }],
  ['Nitric acid', 'O[N+](=O)[O-]', 'acid-strong nitrating ox-strong w', { k: 'HNO3', tb: 356, tm: 231 }],
  ['p-Toluenesulfonic acid', 'Cc1ccc(cc1)S(=O)(=O)O', 'acid-strong w', { tb: 9999, tm: 379, buy: true }],
  ['Sodium hydroxide', '[Na+].[OH-]', 'base-strong w', { k: 'NaOH', tb: 1661, tm: 591 }],
  ['Potassium hydroxide', '[K+].[OH-]', 'base-strong w', { k: 'KOH', tb: 1600, tm: 633 }],
  ['Sodium ethoxide', 'CC[O-].[Na+]', 'base-strong alkoxide', { tb: 9999, tm: 543 }],
  ['Potassium tert-butoxide', 'CC(C)(C)[O-].[K+]', 'base-strong bulky', { tb: 9999, tm: 530 }],
  ['Sodium carbonate', '[Na+].[Na+].[O-]C([O-])=O', 'base-mild w', { k: 'Na2CO3', tb: 9999, tm: 1124 }],
  ['Potassium carbonate', '[K+].[K+].[O-]C([O-])=O', 'base-mild w', { k: 'K2CO3', tb: 9999, tm: 1164 }],
  ['Sodium bicarbonate', '[Na+].OC([O-])=O', 'base-mild w', { k: 'NaHCO3', tb: 9999, tm: 543 }],
  ['Ammonia', 'N', 'base-mild nuc-n w', { k: 'NH3', tb: 240, tm: 195 }],
  ['Sodium cyanide', '[Na+].[C-]#N', 'nuc-cn w', { k: 'NaCN', tb: 1769, tm: 837 }],
  ['Sodium nitrite', '[Na+].[O-]N=O', 'nitrite w', { k: 'NaNO2', tb: 9999, tm: 544 }],
  ['Sodium iodide', '[Na+].[I-]', 'nuc-i w', { k: 'NaI', tb: 1577, tm: 934 }],
  ['Sodium chloride', '[Na+].[Cl-]', 'salt w', { k: 'NaCl', tb: 1686, tm: 1074 }],
  ['Sodium acetate', 'CC(=O)[O-].[Na+]', 'nuc-o base-mild w', { tb: 9999, tm: 601 }],
  ['Sodium borohydride', '[Na+].[BH4-]', 'hyd-mild', { k: 'NaBH4', tb: 9999, tm: 673 }],
  ['Lithium aluminium hydride', '[Li+].[AlH4-]', 'hyd-strong', { k: 'LiAlH4', tb: 9999, tm: 398 }],
  ['Potassium permanganate', '[K+].[O-][Mn](=O)(=O)=O', 'ox-strong w', { k: 'KMnO4', tb: 9999, tm: 513 }],
  ['Potassium dichromate', '[K+].[K+].[O-][Cr](=O)(=O)O[Cr]([O-])(=O)=O', 'ox-strong w', { k: 'K2Cr2O7', tb: 9999, tm: 671 }],
  ['Pyridinium chlorochromate', '[O-][Cr](=O)(=O)Cl.c1cc[nH+]cc1', 'ox-mild', { tb: 9999, tm: 478 }],
  ['Sodium hypochlorite', '[Na+].[O-]Cl', 'ox-mild w', { k: 'NaOCl', tb: 9999, tm: 291 }],
  ['Manganese dioxide', 'O=[Mn]=O', 'ox-allylic cat', { k: 'MnO2', tb: 9999, tm: 808, wear: 30 }],
  ['Hydrogen peroxide', 'OO', 'ox-mild w', { k: 'H2O2', tb: 423, tm: 273 }],
  ['Thionyl chloride', 'O=S(Cl)Cl', 'chlorinating', { k: 'SOCl2', tb: 349, tm: 222 }],
  ['Phosphorus tribromide', 'BrP(Br)Br', 'brominating', { k: 'PBr3', tb: 446, tm: 233 }],
  ['Bromine', 'BrBr', 'x2', { k: 'Br2', tb: 332, tm: 266 }],
  ['Chlorine', 'ClCl', 'x2', { k: 'Cl2', tb: 239, tm: 172 }],
  ['Iodine', 'II', 'x2', { k: 'I2', tb: 457, tm: 387 }],
  ['Hydrogen', '[H][H]', 'h2', { k: 'H2', tb: 20, tm: 14 }],
  ['Oxygen', 'O=O', 'o2', { k: 'O2', tb: 90, tm: 54 }],
  ['Carbon dioxide', 'O=C=O', 'co2', { k: 'CO2', tb: 195, tm: 217 }],
  ['Carbon monoxide', '[C-]#[O+]', 'co', { k: 'CO', tb: 82, tm: 68 }],
  ['Aluminium chloride', 'Cl[Al](Cl)Cl', 'lewis cat', { k: 'AlCl3', tb: 453, tm: 463, wear: 3 }],
  ['Iron(III) bromide', 'Br[Fe](Br)Br', 'lewis cat', { k: 'FeBr3', tb: 9999, tm: 460, wear: 5 }],
  ['Iron(III) chloride', 'Cl[Fe](Cl)Cl', 'lewis cat', { k: 'FeCl3', tb: 589, tm: 577, wear: 5 }],
  ['Zinc chloride', 'Cl[Zn]Cl', 'lewis cat', { k: 'ZnCl2', tb: 1005, tm: 563, wear: 5 }],
  ['Copper(I) iodide', 'I[Cu]', 'cat', { k: 'CuI', tb: 9999, tm: 861, wear: 20 }],
  ['Vanadium pentoxide', 'O=[V](=O)O[V](=O)=O', 'cat', { k: 'V2O5', tb: 9999, tm: 963, wear: 60 }],
  ['Titanium dioxide', 'O=[Ti]=O', 'cat photo', { k: 'TiO2', tb: 9999, tm: 2116, wear: 60 }],
  // ---- hydrocarbons & arenes
  ['Methane', 'C', 'alkane', { k: 'CH4', tb: 112, tm: 91 }],
  ['Ethane', 'CC', 'alkane', { k: 'C2H6', tb: 184, tm: 90 }],
  ['Propane', 'CCC', 'alkane', { k: 'C3H8', tb: 231, tm: 85 }],
  ['Butane', 'CCCC', 'alkane', { k: 'C4H10', tb: 273, tm: 135 }],
  ['Octane', 'CCCCCCCC', 'alkane', { k: 'C8H18', tb: 399, tm: 216 }],
  ['Isobutane', 'CC(C)C', 'alkane', { tb: 261, tm: 114 }],
  ['Ethylene', 'C=C', 'alkene', { k: 'C2H4', tb: 169, tm: 104 }],
  ['Propene', 'CC=C', 'alkene', { tb: 226, tm: 88 }],
  ['1-Butene', 'C=CCC', 'alkene', { tb: 267, tm: 88 }],
  ['Cyclohexene', 'C1=CCCCC1', 'alkene', { tb: 356, tm: 169 }],
  ['1,3-Butadiene', 'C=CC=C', 'diene', { tb: 269, tm: 164 }],
  ['Cyclopentadiene', 'C1C=CC=C1', 'diene', { tb: 314, tm: 188 }],
  ['Acetylene', 'C#C', 'alkyne', { k: 'C2H2', tb: 189, tm: 192 }],
  ['Phenylacetylene', 'C#Cc1ccccc1', 'alkyne', { tb: 416, tm: 228 }],
  ['Vinyl chloride', 'C=CCl', 'alkene', { k: 'C2H3Cl', tb: 259, tm: 119 }],
  ['Styrene', 'C=Cc1ccccc1', 'alkene arene', { tb: 418, tm: 243 }],
  ['Benzene', 'c1ccccc1', 'arene', { k: 'C6H6', tb: 353, tm: 279 }],
  ['Toluene (substrate)', 'Cc1ccccc1', 'arene', { tb: 384, tm: 178, dup: 1 }],
  ['Isobutylbenzene', 'CC(C)Cc1ccccc1', 'arene', { tb: 445, tm: 221 }],
  ['Anisole', 'COc1ccccc1', 'arene ether', { tb: 427, tm: 235 }],
  ['Naphthalene', 'c1ccc2ccccc2c1', 'arene', { tb: 491, tm: 353 }],
  // ---- alcohols & phenols
  ['1-Propanol', 'CCCO', 'alcohol w', { tb: 370, tm: 147 }],
  ['1-Butanol', 'CCCCO', 'alcohol', { tb: 391, tm: 183 }],
  ['tert-Butanol', 'CC(C)(C)O', 'alcohol w', { tb: 356, tm: 298 }],
  ['Isoamyl alcohol', 'CC(C)CCO', 'alcohol', { tb: 404, tm: 155 }],
  ['Benzyl alcohol', 'OCc1ccccc1', 'alcohol', { tb: 478, tm: 258 }],
  ['Cyclohexanol', 'OC1CCCCC1', 'alcohol', { tb: 434, tm: 298 }],
  ['Ethylene glycol', 'OCCO', 'alcohol diol w', { tb: 470, tm: 261 }],
  ['Glycerol', 'OCC(O)CO', 'alcohol triol w', { tb: 563, tm: 291 }],
  ['Phenol', 'Oc1ccccc1', 'phenol w', { k: 'C6H5OH', tb: 455, tm: 314 }],
  ['4-Aminophenol', 'Nc1ccc(O)cc1', 'phenol amine', { tb: 9999, tm: 460 }],
  ['4-Nitrophenol', 'Oc1ccc(cc1)[N+](=O)[O-]', 'phenol nitro', { tb: 9999, tm: 387, buy: false }],
  // ---- carbonyls
  ['Formaldehyde', 'C=O', 'aldehyde w', { k: 'HCHO', tb: 254, tm: 181 }],
  ['Acetaldehyde', 'CC=O', 'aldehyde w', { tb: 294, tm: 150 }],
  ['Propanal', 'CCC=O', 'aldehyde', { tb: 321, tm: 193 }],
  ['Benzaldehyde', 'O=Cc1ccccc1', 'aldehyde', { tb: 452, tm: 247 }],
  ['Butanone', 'CCC(C)=O', 'ketone', { tb: 353, tm: 187 }],
  ['Cyclohexanone', 'O=C1CCCCC1', 'ketone', { tb: 428, tm: 242 }],
  ['Acetophenone', 'CC(=O)c1ccccc1', 'ketone', { tb: 475, tm: 293 }],
  // ---- acids, anhydrides, acid chlorides
  ['Formic acid', 'OC=O', 'carboxylic w', { tb: 374, tm: 282 }],
  ['Propionic acid', 'CCC(=O)O', 'carboxylic w', { tb: 414, tm: 252 }],
  ['Benzoic acid', 'OC(=O)c1ccccc1', 'carboxylic', { tb: 523, tm: 395 }],
  ['Salicylic acid', 'OC(=O)c1ccccc1O', 'carboxylic phenol', { tb: 9999, tm: 432 }],
  ['Oxalic acid', 'OC(=O)C(O)=O', 'carboxylic w', { tb: 9999, tm: 462 }],
  ['Adipic acid', 'OC(=O)CCCCC(O)=O', 'carboxylic', { tb: 538, tm: 425 }],
  ['Stearic acid', 'CCCCCCCCCCCCCCCCCC(=O)O', 'carboxylic fatty', { tb: 656, tm: 343 }],
  ['Lactic acid', 'CC(O)C(=O)O', 'carboxylic alcohol w', { tb: 395, tm: 291 }],
  ['Glycine', 'NCC(=O)O', 'amino-acid w', { tb: 9999, tm: 506 }],
  ['Alanine', 'CC(N)C(=O)O', 'amino-acid w', { tb: 9999, tm: 571 }],
  ['Acetic anhydride', 'CC(=O)OC(C)=O', 'anhydride', { tb: 413, tm: 200 }],
  ['Maleic anhydride', 'O=C1C=CC(=O)O1', 'anhydride dienophile', { tb: 473, tm: 326 }],
  ['Acetyl chloride', 'CC(Cl)=O', 'acylcl', { tb: 324, tm: 161 }],
  ['Benzoyl chloride', 'O=C(Cl)c1ccccc1', 'acylcl', { tb: 471, tm: 273 }],
  ['Adipoyl chloride', 'ClC(=O)CCCCC(Cl)=O', 'acylcl', { tb: 546, tm: 263 }],
  // ---- esters & fats
  ['Methyl acetate', 'COC(C)=O', 'ester', { tb: 330, tm: 175 }],
  ['Methyl salicylate', 'COC(=O)c1ccccc1O', 'ester phenol', { tb: 496, tm: 264, buy: false }],
  ['Isoamyl acetate', 'CC(C)CCOC(C)=O', 'ester', { tb: 415, tm: 195, buy: false }],
  ['Tristearin (animal fat)', 'CCCCCCCCCCCCCCCCCC(=O)OCC(OC(=O)CCCCCCCCCCCCCCCCC)COC(=O)CCCCCCCCCCCCCCCCC', 'ester triglyceride fat', { tb: 9999, tm: 345 }],
  ['Triolein (olive oil)', 'CCCCCCCCC=CCCCCCCCC(=O)OCC(OC(=O)CCCCCCCC=CCCCCCCCC)COC(=O)CCCCCCCC=CCCCCCCCC', 'ester triglyceride fat', { tb: 9999, tm: 278 }],
  // ---- amines, amides, nitriles
  ['Methylamine', 'CN', 'amine-1 w', { tb: 267, tm: 180 }],
  ['Ethylamine', 'CCN', 'amine-1 w', { tb: 290, tm: 192 }],
  ['Dimethylamine', 'CNC', 'amine-2 w', { tb: 280, tm: 180 }],
  ['Aniline', 'Nc1ccccc1', 'amine-1 aniline', { tb: 457, tm: 267 }],
  ['Hexamethylenediamine', 'NCCCCCCN', 'amine-1 diamine', { tb: 478, tm: 315 }],
  ['Urea', 'NC(N)=O', 'amide w', { k: 'CO(NH2)2', tb: 9999, tm: 406 }],
  ['Acetamide', 'CC(N)=O', 'amide w', { tb: 494, tm: 354, buy: false }],
  ['Acetanilide', 'CC(=O)Nc1ccccc1', 'amide', { tb: 577, tm: 387, buy: false }],
  ['Benzonitrile', 'N#Cc1ccccc1', 'nitrile', { tb: 464, tm: 260, buy: false }],
  // ---- halides
  ['Chloromethane', 'CCl', 'alkylhalide', { tb: 249, tm: 175 }],
  ['Bromoethane', 'CCBr', 'alkylhalide', { tb: 311, tm: 154 }],
  ['Iodomethane', 'CI', 'alkylhalide', { tb: 315, tm: 207 }],
  ['1-Bromobutane', 'CCCCBr', 'alkylhalide', { tb: 375, tm: 160 }],
  ['2-Bromopropane', 'CC(C)Br', 'alkylhalide', { tb: 332, tm: 183 }],
  ['tert-Butyl chloride', 'CC(C)(C)Cl', 'alkylhalide', { tb: 324, tm: 247 }],
  ['Benzyl chloride', 'ClCc1ccccc1', 'alkylhalide benzylic', { tb: 452, tm: 235 }],
  ['Bromobenzene', 'Brc1ccccc1', 'arylhalide', { tb: 429, tm: 242 }],
  ['Chlorobenzene', 'Clc1ccccc1', 'arylhalide', { tb: 405, tm: 227 }],
  ['Iodobenzene', 'Ic1ccccc1', 'arylhalide', { tb: 461, tm: 241 }],
  ['4-Bromotoluene', 'Cc1ccc(Br)cc1', 'arylhalide', { tb: 457, tm: 301, buy: false }],
  ['Carbon tetrachloride', 'ClC(Cl)(Cl)Cl', 'solv:c', { k: 'CCl4', tb: 350, tm: 250, buy: false }],
  ['Phenylboronic acid', 'OB(O)c1ccccc1', 'boronic', { tb: 9999, tm: 490 }],
  ['Nitrobenzene', '[O-][N+](=O)c1ccccc1', 'nitro arene', { tb: 484, tm: 279, buy: false }],
  // ---- named targets (names only: so a product that matches is recognised)
  ['Aspirin (acetylsalicylic acid)', 'CC(=O)Oc1ccccc1C(=O)O', 'ester carboxylic drug', { tb: 9999, tm: 408, buy: false }],
  ['Paracetamol (acetaminophen)', 'CC(=O)Nc1ccc(O)cc1', 'amide phenol drug', { tb: 9999, tm: 441, buy: false }],
  ['Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'carboxylic drug', { tb: 9999, tm: 349, buy: false }],
  ['4-Isobutylacetophenone', 'CC(=O)c1ccc(CC(C)C)cc1', 'ketone', { tb: 540, tm: 303, buy: false }],
  ['1-(4-Isobutylphenyl)ethanol', 'CC(O)c1ccc(CC(C)C)cc1', 'alcohol', { tb: 560, tm: 300, buy: false }],
  ['Benzocaine', 'CCOC(=O)c1ccc(N)cc1', 'ester amine drug', { tb: 9999, tm: 363, buy: false }],
  ['Methyl orange (acid form)', 'CN(C)c1ccc(cc1)N=Nc1ccc(cc1)S(=O)(=O)O', 'dye', { tb: 9999, tm: 573, buy: false }],
  ['Sulfanilic acid', 'Nc1ccc(cc1)S(=O)(=O)O', 'amine-1 aniline', { tb: 9999, tm: 561, buy: false }],
  ['N,N-Dimethylaniline', 'CN(C)c1ccccc1', 'amine-3 aniline', { tb: 466, tm: 275 }],
  ['Chalcone', 'O=C(C=Cc1ccccc1)c1ccccc1', 'ketone', { tb: 618, tm: 331, buy: false }],
  ['Dibenzalacetone', 'O=C(C=Cc1ccccc1)C=Cc1ccccc1', 'ketone dye', { tb: 9999, tm: 384, buy: false }],
  ['Benzalacetone', 'CC(=O)C=Cc1ccccc1', 'ketone', { tb: 535, tm: 314, buy: false }],
  ['Ethyl acetoacetate', 'CCOC(=O)CC(C)=O', 'ester ketone', { tb: 453, tm: 228, buy: false }],
  ['Diethyl ether (product)', 'CCOCC', 'ether', { tb: 308, tm: 157, dup: 1 }],
  ['Biphenyl', 'c1ccc(cc1)-c1ccccc1', 'arene', { tb: 528, tm: 342, buy: false }],
  ['Diphenylmethanol', 'OC(c1ccccc1)c1ccccc1', 'alcohol', { tb: 570, tm: 338, buy: false }],
  ['Triphenylmethanol', 'OC(c1ccccc1)(c1ccccc1)c1ccccc1', 'alcohol', { tb: 653, tm: 435, buy: false }],
  ['Sodium stearate (soap)', 'CCCCCCCCCCCCCCCCCC(=O)[O-].[Na+]', 'soap salt', { tb: 9999, tm: 540, buy: false }],
  ['Sodium oleate (soap)', 'CCCCCCCCC=CCCCCCCCC(=O)[O-].[Na+]', 'soap salt', { tb: 9999, tm: 508, buy: false }],
  ['Biodiesel (methyl stearate)', 'CCCCCCCCCCCCCCCCCC(=O)OC', 'ester fame', { tb: 629, tm: 311, buy: false }],
  ['Biodiesel (methyl oleate)', 'CCCCCCCCC=CCCCCCCCC(=O)OC', 'ester fame', { tb: 622, tm: 253, buy: false }],
  ['Nylon 6,6 salt precursor (hexamethylene adipamide)', 'NCCCCCCNC(=O)CCCCC(Cl)=O', 'amide acylcl', { tb: 9999, tm: 400, buy: false }],
  ['Acrylonitrile', 'C=CC#N', 'alkene nitrile', { tb: 350, tm: 189, buy: false }],
  ['Cyclohexane-1,2-diol', 'OC1CCCCC1O', 'alcohol diol', { tb: 500, tm: 371, buy: false }],
];

/* element roles: an element key used as a reagent or catalyst. */
const SYNTH_ELEMENT_ROLES = { Mg: 'mg', Li: 'alkali', Na: 'alkali', K: 'alkali', Zn: 'red-metal', Sn: 'red-metal', Fe: 'red-metal cat', Al: 'red-metal', Cu: 'cat', Ni: 'cat', Pd: 'cat', Pt: 'cat', Rh: 'cat', Ru: 'cat', Ag: 'cat', Au: 'cat', Co: 'cat', Mn: 'cat', Ti: 'cat', Mo: 'cat', W: 'cat', Ir: 'cat', H: 'h2', O: 'o2', Cl: 'x2', Br: 'x2', I: 'x2', N: 'n2', C: 'carbon', S: 'sulfur', P: 'phosphorus' };

/* solvent classes → behaviour (p protic, a aprotic polar, n non-polar, e ether (dry), c chlorinated, ac acidic) */
const SYNTH_SOLVENT_CLASS = { p: 'protic', a: 'aprotic polar', n: 'non-polar', e: 'ether (dry)', c: 'chlorinated', ac: 'acidic' };

/* catalyst materials: how fast a heterogeneous / homogeneous catalyst of this material makes the named reaction families go, and its wear (uses before 1 mol is spent).
 * Reaction templates list the factors they accept; anything not listed does nothing for that reaction. */
const SYNTH_CATALYSTS = {
  Pd: { name: 'Palladium (Pd/C, Pd complexes)', wear: 40 }, Pt: { name: 'Platinum (PtO₂, Pt gauze)', wear: 60 }, Ni: { name: 'Nickel (Raney Ni)', wear: 15 }, Cu: { name: 'Copper', wear: 30 }, Fe: { name: 'Iron', wear: 80 },
  Rh: { name: 'Rhodium', wear: 80 }, Ru: { name: 'Ruthenium', wear: 80 }, Ag: { name: 'Silver', wear: 60 }, Co: { name: 'Cobalt', wear: 50 }, Mn: { name: 'Manganese', wear: 30 }, Ti: { name: 'Titanium', wear: 60 }
};

/* equipment you buy once (ids of the older tools are kept so existing saves keep what they own). req = tool id that unlocks it. */
const SYNTH_EQUIP = [
  { id: 'stirrer', name: 'Magnetic Stirrer–Hotplate', cost: 120, desc: 'Stir bar and heated oil bath (to 480 K). Stirring doubles the rate of two-phase reactions.' },
  { id: 'reflux', name: 'Reflux Condenser Set', cost: 300, desc: 'Round-bottom flask + condenser + heating mantle (to 560 K). Lets a solvent boil without being lost.' },
  { id: 'parr', name: 'Hydrogenation Apparatus', cost: 1000, desc: 'Shaker for H₂ at up to 5 bar — needed for catalytic hydrogenation.' },
  { id: 'rotavap', name: 'Rotary Evaporator', cost: 700, desc: 'Removes solvent under vacuum and recovers it. Workup: evaporate.' },
  { id: 'schlenk', name: 'Schlenk Line', cost: 1800, desc: 'Dry glassware under nitrogen, argon or vacuum — for air- and moisture-sensitive chemistry (Grignard, hydrides).' },
  { id: 'uv', name: 'UV Photoreactor', cost: 900, desc: 'Lamp for light-driven (radical) reactions.' },
  { id: 'column', name: 'Chromatography Column', cost: 1600, desc: 'Separates almost any organic mixture — slow but gentle. Workup: column.' }
];

/* vessels: what the player picks as "the flask". need = tool id (basic = always owned). */
const SYNTH_VESSELS = {
  beaker:  { name: 'Beaker (open)', need: 'basic', Tmax: 400, open: 1 },
  flask:   { name: 'Round-bottom flask', need: 'basic', Tmax: 480, open: 1 },
  reflux:  { name: 'Reflux apparatus', need: 'reflux', Tmax: 560, reflux: 1 },
  schlenk: { name: 'Schlenk flask (dry, inert)', need: 'schlenk', Tmax: 560, reflux: 1, inert: 1, dry: 1, vac: 1 },
  autoclave: { name: 'Autoclave (sealed)', need: 'pressure', Tmax: 800, sealed: 1, Pmax: 500 },
  parr:    { name: 'Hydrogenator', need: 'parr', Tmax: 400, sealed: 1, Pmax: 5 },
  crucible: { name: 'Crucible / furnace', need: 'burner', Tmax: 1500, open: 1, dryheat: 1 },
  cell:    { name: 'Electrolysis cell', need: 'electrolysis', Tmax: 400, cell: 1 },
  bed:     { name: 'Catalyst bed (flow)', need: 'catalysis', Tmax: 1100, sealed: 1, Pmax: 300, flow: 1 },
  photo:   { name: 'Photoreactor', need: 'uv', Tmax: 400, reflux: 1, uv: 1 }
};

/* heating / cooling: T range reachable and the equipment that provides it */
const SYNTH_HEAT = {
  none:   { name: 'Room temperature', need: 'basic', T: [285, 305] },
  ice:    { name: 'Ice bath (0 °C)', need: 'basic', T: [263, 280] },
  hot:    { name: 'Hot plate / water bath', need: 'basic', T: [295, 395] },
  oil:    { name: 'Oil bath', need: 'stirrer', T: [295, 480] },
  mantle: { name: 'Heating mantle', need: 'reflux', T: [295, 560] },
  flame:  { name: 'Bunsen / furnace', need: 'burner', T: [295, 1500] },
  dry:    { name: 'Dry-ice bath', need: 'cryo', T: [180, 260] }
};

const SYNTH_WORKUP = {
  none:    { name: 'None — leave in flask', need: 'basic' },
  filter:  { name: 'Filter solids', need: 'basic' },
  crystal: { name: 'Cool & crystallise', need: 'basic' },
  extract: { name: 'Extract (water / solvent)', need: 'basic' },
  acidify: { name: 'Acidify, then filter', need: 'basic' },
  quench:  { name: 'Quench with dilute acid + extract', need: 'basic' },
  saltout: { name: 'Salt out (brine) and skim', need: 'basic' },
  distill: { name: 'Distil', need: 'distillation' },
  evap:    { name: 'Evaporate solvent', need: 'rotavap' },
  column:  { name: 'Column chromatography', need: 'column' }
};

const SYNTH_TIMES = [1, 5, 15, 30, 60, 120, 240, 480, 1440, 4320];       // minutes
if(typeof module !== 'undefined' && module.exports) module.exports = { SYNTH_CATALOG, SYNTH_ELEMENT_ROLES, SYNTH_SOLVENT_CLASS, SYNTH_CATALYSTS, SYNTH_EQUIP, SYNTH_VESSELS, SYNTH_HEAT, SYNTH_WORKUP, SYNTH_TIMES };
