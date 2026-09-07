// ---------------------------------------------------------------------------------------------
// ELEMENT CLICKER — the flagship minigame on cookin.html. A Cookie-Clicker-style idle game: click
// the atom to generate Atoms, spend them on Buildings (idle production) and Upgrades (multipliers),
// and eventually Transmute (prestige) for a permanent boost. Its own currency ("Atoms") is
// completely separate from $WEST cash — achievements are the only thing that pay out a little real
// cash, and those payouts are small, one-time, and bounded, same spirit as the other minigames.
// ---------------------------------------------------------------------------------------------

// Cost of the Nth building follows the classic idle-game curve: baseCost * 1.15^owned.
const CLICKER_COST_SCALE = 1.15;

const CLICKER_BUILDINGS = [
  { id:'electron',     name:'Electron Cloud',        icon:'⚛️', baseCost:15,         baseCps:0.1,     desc:'A faint, buzzing haze of electrons — barely a trickle of atoms.' },
  { id:'burner',       name:'Bunsen Burner',         icon:'🔥', baseCost:100,        baseCps:1,       desc:'Steady heat, steady output.' },
  { id:'beaker',       name:'Beaker Rig',            icon:'⚗️', baseCost:1100,       baseCps:8,       desc:'A rack of beakers, always mid-reaction.' },
  { id:'centrifuge',   name:'Centrifuge',            icon:'🌀', baseCost:12000,      baseCps:47,      desc:'Spins samples apart faster than you can label them.' },
  { id:'cyclotron',    name:'Cyclotron',             icon:'💫', baseCost:130000,     baseCps:260,     desc:'Particles chasing their own tail at relativistic speed.' },
  { id:'reactor',      name:'Fusion Reactor',        icon:'☢️', baseCost:1400000,    baseCps:1400,    desc:'A small, well-behaved star, mostly under control.' },
  { id:'accelerator',  name:'Particle Accelerator',  icon:'🚀', baseCost:20000000,   baseCps:7800,    desc:'Kilometers of magnets pointed at nothing but progress.' },
  { id:'star',         name:'Neutron Star Core',     icon:'⭐', baseCost:330000000,  baseCps:44000,   desc:'Illegally dense. Extremely productive.' },
];

// Click-power upgrades — flat multiplier stack applied to the base click value (1 atom).
const CLICKER_CLICK_UPGRADES = [
  { id:'click1', name:'Sharper Tweezers',  icon:'🥢', cost:50,      mult:2, desc:'Doubles atoms per click.' },
  { id:'click2', name:'Diamond Forceps',   icon:'💎', cost:500,     mult:2, desc:'Doubles atoms per click again.' },
  { id:'click3', name:'Laser Scalpel',     icon:'🔦', cost:5000,    mult:2, desc:'Doubles atoms per click again.' },
  { id:'click4', name:'Quantum Pincer',    icon:'🌌', cost:50000,   mult:2, desc:'Doubles atoms per click again.' },
  { id:'click5', name:'Singularity Grip',  icon:'🕳️', cost:500000,  mult:2, desc:'Doubles atoms per click again.' },
];

// Building upgrades — each DOUBLES that one building's per-unit production once unlocked (by
// owning enough of it). Two tiers per building, same pattern Cookie Clicker uses.
const CLICKER_BUILDING_UPGRADES = [
  { id:'electron_u1',    name:'Focused Electron Cloud',   icon:'⚛️', building:'electron',    unlockOwned:10, cost:150,          mult:2, desc:'Doubles Electron Cloud production.' },
  { id:'electron_u2',    name:'Bound Electron Shells',    icon:'⚛️', building:'electron',    unlockOwned:25, cost:900,          mult:2, desc:'Doubles Electron Cloud production again.' },
  { id:'burner_u1',      name:'Blue-Flame Burners',       icon:'🔥', building:'burner',      unlockOwned:10, cost:1000,         mult:2, desc:'Doubles Bunsen Burner production.' },
  { id:'burner_u2',      name:'Auto-Igniting Burners',    icon:'🔥', building:'burner',      unlockOwned:25, cost:6000,         mult:2, desc:'Doubles Bunsen Burner production again.' },
  { id:'beaker_u1',      name:'Insulated Beakers',        icon:'⚗️', building:'beaker',      unlockOwned:10, cost:11000,        mult:2, desc:'Doubles Beaker Rig production.' },
  { id:'beaker_u2',      name:'Self-Stirring Beakers',    icon:'⚗️', building:'beaker',      unlockOwned:25, cost:66000,        mult:2, desc:'Doubles Beaker Rig production again.' },
  { id:'centrifuge_u1',  name:'Balanced Rotors',          icon:'🌀', building:'centrifuge',  unlockOwned:10, cost:120000,       mult:2, desc:'Doubles Centrifuge production.' },
  { id:'centrifuge_u2',  name:'Vacuum-Sealed Rotors',     icon:'🌀', building:'centrifuge',  unlockOwned:25, cost:720000,       mult:2, desc:'Doubles Centrifuge production again.' },
  { id:'cyclotron_u1',   name:'Superconducting Coils',    icon:'💫', building:'cyclotron',   unlockOwned:10, cost:1300000,      mult:2, desc:'Doubles Cyclotron production.' },
  { id:'cyclotron_u2',   name:'Phase-Locked Coils',       icon:'💫', building:'cyclotron',   unlockOwned:25, cost:7800000,      mult:2, desc:'Doubles Cyclotron production again.' },
  { id:'reactor_u1',     name:'Redundant Containment',    icon:'☢️', building:'reactor',     unlockOwned:10, cost:14000000,     mult:2, desc:'Doubles Fusion Reactor production.' },
  { id:'reactor_u2',     name:'Tritium Boosters',         icon:'☢️', building:'reactor',     unlockOwned:25, cost:84000000,     mult:2, desc:'Doubles Fusion Reactor production again.' },
  { id:'accelerator_u1', name:'Extended Beamline',        icon:'🚀', building:'accelerator', unlockOwned:10, cost:200000000,    mult:2, desc:'Doubles Particle Accelerator production.' },
  { id:'accelerator_u2', name:'Cryogenic Focusing',       icon:'🚀', building:'accelerator', unlockOwned:25, cost:1200000000,   mult:2, desc:'Doubles Particle Accelerator production again.' },
  { id:'star_u1',        name:'Gravitic Stabilizers',     icon:'⭐', building:'star',        unlockOwned:10, cost:3300000000,   mult:2, desc:'Doubles Neutron Star Core production.' },
  { id:'star_u2',        name:'Exotic Matter Lattice',    icon:'⭐', building:'star',        unlockOwned:25, cost:19800000000,  mult:2, desc:'Doubles Neutron Star Core production again.' },
];

// Achievements double as the game's "quests" — each has a short/long-term flavor, a one-time
// small $WEST cash reward, and (for the bigger ones) a small PERMANENT global production bonus,
// so chasing them meaningfully shapes both short-term play and the long-term production curve.
const CLICKER_ACHIEVEMENTS = [
  { id:'click_100',    name:'Getting Started',     icon:'👆', desc:'Click 100 times.',                       cash:1,  globalBonus:0,    check:s => s.totalClicks >= 100 },
  { id:'click_1000',   name:'Repetitive Strain',   icon:'👆', desc:'Click 1,000 times.',                     cash:2,  globalBonus:0.02, check:s => s.totalClicks >= 1000 },
  { id:'click_10000',  name:'Carpal Tunnel Club',  icon:'👆', desc:'Click 10,000 times.',                    cash:5,  globalBonus:0.03, check:s => s.totalClicks >= 10000 },
  { id:'atoms_1k',     name:'First Thousand',      icon:'⚛️', desc:'Earn 1,000 lifetime atoms.',             cash:1,  globalBonus:0,    check:s => s.totalAtoms >= 1e3 },
  { id:'atoms_1m',     name:'Mole-cular',          icon:'⚛️', desc:'Earn 1,000,000 lifetime atoms.',         cash:3,  globalBonus:0.02, check:s => s.totalAtoms >= 1e6 },
  { id:'atoms_1b',     name:'Avogadro Approves',   icon:'⚛️', desc:'Earn 1,000,000,000 lifetime atoms.',     cash:6,  globalBonus:0.04, check:s => s.totalAtoms >= 1e9 },
  { id:'atoms_1t',     name:'Cosmic Abundance',    icon:'⚛️', desc:'Earn 1,000,000,000,000 lifetime atoms.', cash:10, globalBonus:0.06, check:s => s.totalAtoms >= 1e12 },
  { id:'own_one_each', name:'Well-Stocked Lab',    icon:'🧫', desc:'Own at least 1 of every building.',      cash:3,  globalBonus:0.03, check:s => CLICKER_BUILDINGS.every(b => (s.buildings[b.id]||0) >= 1) },
  { id:'own_25_one',   name:'Specialist',          icon:'🧫', desc:'Own 25 of any single building.',         cash:2,  globalBonus:0,    check:s => CLICKER_BUILDINGS.some(b => (s.buildings[b.id]||0) >= 25) },
  { id:'own_100_total',name:'Sprawling Facility',  icon:'🏭', desc:'Own 100 buildings in total.',            cash:5,  globalBonus:0.03, check:s => CLICKER_BUILDINGS.reduce((a,b) => a+(s.buildings[b.id]||0),0) >= 100 },
  { id:'rate_100',     name:'Triple Digits',       icon:'📈', desc:'Reach 100 atoms/sec.',                   cash:2,  globalBonus:0,    check:s => s.cps >= 100 },
  { id:'rate_10k',     name:'Industrial Scale',    icon:'📈', desc:'Reach 10,000 atoms/sec.',                cash:6,  globalBonus:0.04, check:s => s.cps >= 10000 },
  { id:'transmute_1',  name:'First Transmutation', icon:'🔮', desc:'Transmute (prestige) for the first time.', cash:5, globalBonus:0.05, check:s => s.prestige.level >= 1 },
  { id:'transmute_5',  name:'Alchemist',           icon:'🔮', desc:'Reach prestige level 5.',                cash:10, globalBonus:0.05, check:s => s.prestige.level >= 5 },
  { id:'shards_100',   name:'Shard Collector',     icon:'🔷', desc:'Accumulate 100 Isotope Shards.',         cash:8,  globalBonus:0.05, check:s => s.prestige.shards >= 100 },
];

// Isotope Shards (prestige currency): each grants a permanent +2% global production multiplier.
const CLICKER_SHARD_BONUS = 0.02;
// How many atoms of THIS run are required before Transmute becomes available at all.
const CLICKER_PRESTIGE_MIN_ATOMS = 1000000;
// Offline production is paid out at a reduced rate, capped at this many seconds (4 hours) —
// keeps it a nice "welcome back" bonus without letting the game fully play itself unattended.
const CLICKER_OFFLINE_RATE = 0.5;
const CLICKER_OFFLINE_CAP_SECONDS = 4 * 3600;
