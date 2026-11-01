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
  "id": "elementRecall",
  "category": "educational",
  "icon": "⚛️",
  "name": "Element Recall",
  "desc": "Symbol → name"
 },
 {
  "id": "halfLife",
  "category": "educational",
  "icon": "☢️",
  "name": "Half-Life Guess",
  "desc": "Decay math"
 },
 {
  "id": "balance",
  "category": "educational",
  "icon": "⚖️",
  "name": "Balance the Equation",
  "desc": "Stoichiometry"
 },
 {
  "id": "phMatch",
  "category": "educational",
  "icon": "🧫",
  "name": "pH Match",
  "desc": "Acid or base?"
 },
 {
  "id": "ohms",
  "category": "educational",
  "icon": "🔌",
  "name": "Ohm's Law",
  "desc": "Quick circuit math"
 },
 {
  "id": "moleculeMatch",
  "category": "educational",
  "icon": "🧬",
  "name": "Molecule Speed Match",
  "desc": "Name → formula"
 },
 {
  "id": "waveMatch",
  "category": "educational",
  "icon": "🌊",
  "name": "Wave Match",
  "desc": "Wavelength → frequency"
 },
 {
  "id": "gasLaw",
  "category": "educational",
  "icon": "💨",
  "name": "Ideal Gas Law Solver",
  "desc": "PV = nRT"
 },
 {
  "id": "isotope",
  "category": "educational",
  "icon": "🔬",
  "name": "Isotope ID",
  "desc": "Protons + neutrons"
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
  "id": "trivia",
  "category": "other",
  "icon": "📜",
  "name": "Wanted Poster Trivia",
  "desc": "Site lore quiz"
 },
 {
  "id": "luckyAssay",
  "category": "other",
  "icon": "🍀",
  "name": "Lucky Assay",
  "desc": "Pick a vial"
 },
 {
  "id": "wordScramble",
  "category": "other",
  "icon": "🔤",
  "name": "Word Scramble",
  "desc": "Unscramble the term"
 },
 {
  "id": "boilingPoint",
  "category": "other",
  "icon": "🌡️",
  "name": "Guess the Boiling Point",
  "desc": "Thermal trivia"
 }
];
const GAME_CATEGORIES = { educational:'Chemistry & Physics', fun:'Arcade', other:'Other' };
