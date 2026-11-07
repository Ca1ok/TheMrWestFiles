// The list of minigames shown in the Games app. To add a game: drop <id>.js in this folder (see any existing file) and add a line here.
const GAME_MANIFEST = [
 {
  "id": "titration",
  "category": "educational",
  "icon": "🧪",
  "name": "Titration Drop",
  "desc": "Find the endpoint"
 },
 {
  "id": "balance",
  "category": "educational",
  "icon": "⚖️",
  "name": "Balance the Equation",
  "desc": "Stoichiometry"
 },
 {
  "id": "reaction",
  "category": "fun",
  "icon": "⚡",
  "name": "Reaction Timer",
  "desc": "Test your reflexes"
 },
 {
  "id": "projectile",
  "category": "fun",
  "icon": "🎯",
  "name": "Projectile Launch",
  "desc": "Hit the target"
 },
 {
  "id": "memoryMatch",
  "category": "fun",
  "icon": "🃏",
  "name": "Element Memory Match",
  "desc": "Flip and match"
 },
 {
  "id": "whackAtom",
  "category": "fun",
  "icon": "🔨",
  "name": "Whack-an-Atom",
  "desc": "Fast clicking"
 },
 {
  "id": "atomBuilder",
  "category": "fun",
  "icon": "🧩",
  "name": "Atom Builder",
  "desc": "Build the atom"
 },
 {
  "id": "fallingCatch",
  "category": "fun",
  "icon": "🎣",
  "name": "Falling Elements Catch",
  "desc": "Quick reflexes"
 },
 {
  "id": "luckyAssay",
  "category": "fun",
  "icon": "🍀",
  "name": "Lucky Assay",
  "desc": "Pick a vial"
 },
 {
  "id": "mazePaint",
  "category": "puzzle",
  "icon": "brush",
  "name": "Reagent Trail",
  "desc": "Slide, stain every tile"
 },
 {
  "id": "sandfall",
  "category": "puzzle",
  "icon": "hourglass",
  "name": "Sand Cascade",
  "desc": "Draw glass, fill the beaker"
 },
 {
  "id": "colourBlocks",
  "category": "puzzle",
  "icon": "blocks",
  "name": "Colour Blocks",
  "desc": "Pop matching metals"
 },
 {
  "id": "tubeSort",
  "category": "puzzle",
  "icon": "tubes",
  "name": "Test Tube Sort",
  "desc": "Pour until each is one colour"
 },
 {
  "id": "elementMerge",
  "category": "fun",
  "icon": "merge",
  "name": "Element Merge",
  "desc": "Fuse H into heavier atoms"
 },
 {
  "id": "flappyElectron",
  "category": "fun",
  "icon": "feather",
  "name": "Flappy Electron",
  "desc": "Hop between charged plates"
 }
];
const GAME_CATEGORIES = { educational:'Chemistry & Physics', puzzle:'Puzzles', fun:'Arcade' };
