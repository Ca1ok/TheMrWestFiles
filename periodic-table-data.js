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
