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

// Click-power upgrades. The first 10 are flat multipliers (each simply doubles click power) —
// great early/mid-game when buildings haven't caught up yet, but a flat number like that becomes
// meaningless once idle production reaches the billions/sec: doubling a tiny number stays tiny.
// The four "synergy" upgrades below fix that WITHOUT letting clicking become the dominant
// strategy (which is what "broken" would look like here) — each adds a small, capped percentage
// of your CURRENT production per click (via cpsPercent, read in ecClickPower()) instead of
// another flat multiplier, so a click stays meaningfully rewarding at any stage of the game while
// never being worth more than a modest fraction of a second of idle output. All four together
// only ever add up to 7% of your cps per click — clicking stays a nice boost, not a shortcut that
// makes buildings optional. Unlocked by production milestones (unlockCps, checked in the
// upgrades-tab render) rather than cost/ownership like everything else, since they're meant to
// show up as your idle output actually grows, not as soon as you can afford them.
const CLICKER_CLICK_UPGRADES = [
  { id:'click1', name:'Sharper Tweezers',  icon:'🥢', cost:50,      mult:2, desc:'Doubles atoms per click.' },
  { id:'click2', name:'Diamond Forceps',   icon:'💎', cost:500,     mult:2, desc:'Doubles atoms per click again.' },
  { id:'click3', name:'Laser Scalpel',     icon:'🔦', cost:5000,    mult:2, desc:'Doubles atoms per click again.' },
  { id:'click4', name:'Quantum Pincer',    icon:'🌌', cost:50000,   mult:2, desc:'Doubles atoms per click again.' },
  { id:'click5', name:'Singularity Grip',  icon:'🕳️', cost:500000,  mult:2, desc:'Doubles atoms per click again.' },
  { id:'click6', name:'Antimatter Tongs',      icon:'✨', cost:5000000,       mult:2, desc:'Doubles atoms per click again.' },
  { id:'click7', name:'Graviton Pincer',       icon:'🪐', cost:50000000,      mult:2, desc:'Doubles atoms per click again.' },
  { id:'click8', name:'Neural-Linked Gauntlet', icon:'🧠', cost:500000000,     mult:2, desc:'Doubles atoms per click again.' },
  { id:'click9', name:'Chrono-Displaced Claw', icon:'⏳', cost:5000000000,    mult:2, desc:'Doubles atoms per click again.' },
  { id:'click10',name:'Hand of Creation',      icon:'🌟', cost:50000000000,   mult:2, desc:'Doubles atoms per click again.' },
  { id:'click_synergy1', name:'Harmonized Grip',      icon:'🔗', cost:2000000,        unlockCps:100,      cpsPercent:0.01,  desc:'Each click also delivers 1% of your current production. Unlocks once you reach 100 atoms/sec.' },
  { id:'click_synergy2', name:'Synced Extraction',    icon:'🔗', cost:200000000,      unlockCps:10000,    cpsPercent:0.015, desc:'Each click also delivers 1.5% of your current production. Unlocks at 10,000 atoms/sec.' },
  { id:'click_synergy3', name:'Resonant Clicking',    icon:'🔗', cost:20000000000,    unlockCps:1000000,  cpsPercent:0.02,  desc:'Each click also delivers 2% of your current production. Unlocks at 1,000,000 atoms/sec.' },
  { id:'click_synergy4', name:'Unified Field Tap',    icon:'🔗', cost:2000000000000,  unlockCps:100000000,cpsPercent:0.025, desc:'Each click also delivers 2.5% of your current production. Unlocks at 100,000,000 atoms/sec.' },
];

// Building upgrades — each DOUBLES that one building's per-unit production once unlocked (by
// owning enough of it). Four tiers per building (10/25/50/100 owned), same pattern Cookie
// Clicker uses, extended one step further than the original two tiers.
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
  // --- tier 3 (owned 50) ---
  { id:'electron_u3',    name:'Entangled Electron Pairs', icon:'⚛️', building:'electron',    unlockOwned:50, cost:5400,           mult:2, desc:'Doubles Electron Cloud production again.' },
  { id:'burner_u3',      name:'Catalytic Burners',        icon:'🔥', building:'burner',      unlockOwned:50, cost:36000,          mult:2, desc:'Doubles Bunsen Burner production again.' },
  { id:'beaker_u3',      name:'Magnetically Stirred Rig', icon:'⚗️', building:'beaker',      unlockOwned:50, cost:396000,         mult:2, desc:'Doubles Beaker Rig production again.' },
  { id:'centrifuge_u3',  name:'Ferrofluid Bearings',      icon:'🌀', building:'centrifuge',  unlockOwned:50, cost:4320000,        mult:2, desc:'Doubles Centrifuge production again.' },
  { id:'cyclotron_u3',   name:'Resonant Cavity Array',    icon:'💫', building:'cyclotron',   unlockOwned:50, cost:46800000,       mult:2, desc:'Doubles Cyclotron production again.' },
  { id:'reactor_u3',     name:'Deuterium Injectors',      icon:'☢️', building:'reactor',     unlockOwned:50, cost:504000000,      mult:2, desc:'Doubles Fusion Reactor production again.' },
  { id:'accelerator_u3', name:'Superfluid Cooling Loop',  icon:'🚀', building:'accelerator', unlockOwned:50, cost:7200000000,     mult:2, desc:'Doubles Particle Accelerator production again.' },
  { id:'star_u3',        name:'Event Horizon Skimmer',    icon:'⭐', building:'star',        unlockOwned:50, cost:118800000000,   mult:2, desc:'Doubles Neutron Star Core production again.' },
  // --- tier 4 (owned 100) ---
  { id:'electron_u4',    name:'Zero-Point Harvester',     icon:'⚛️', building:'electron',    unlockOwned:100, cost:32400,           mult:2, desc:'Doubles Electron Cloud production again.' },
  { id:'burner_u4',      name:'Plasma-Core Burners',      icon:'🔥', building:'burner',      unlockOwned:100, cost:216000,          mult:2, desc:'Doubles Bunsen Burner production again.' },
  { id:'beaker_u4',      name:'Autonomous Titration Rig', icon:'⚗️', building:'beaker',      unlockOwned:100, cost:2376000,         mult:2, desc:'Doubles Beaker Rig production again.' },
  { id:'centrifuge_u4',  name:'Cryo-Centrifuge Array',    icon:'🌀', building:'centrifuge',  unlockOwned:100, cost:25920000,        mult:2, desc:'Doubles Centrifuge production again.' },
  { id:'cyclotron_u4',   name:'Overdriven Magnet Ring',   icon:'💫', building:'cyclotron',   unlockOwned:100, cost:280800000,       mult:2, desc:'Doubles Cyclotron production again.' },
  { id:'reactor_u4',     name:'Tokamak Overclock',        icon:'☢️', building:'reactor',     unlockOwned:100, cost:3024000000,      mult:2, desc:'Doubles Fusion Reactor production again.' },
  { id:'accelerator_u4', name:'Twin-Ring Collider Mode',  icon:'🚀', building:'accelerator', unlockOwned:100, cost:43200000000,     mult:2, desc:'Doubles Particle Accelerator production again.' },
  { id:'star_u4',        name:'Hawking Radiation Tap',    icon:'⭐', building:'star',        unlockOwned:100, cost:712800000000,    mult:2, desc:'Doubles Neutron Star Core production again.' },
  // --- tier 5 (owned 200) ---
  { id:'electron_u5',    name:'Casimir Effect Array',     icon:'⚛️', building:'electron',    unlockOwned:200, cost:194400,             mult:2, desc:'Doubles Electron Cloud production again.' },
  { id:'burner_u5',      name:'Combustion Cascade',       icon:'🔥', building:'burner',      unlockOwned:200, cost:1296000,            mult:2, desc:'Doubles Bunsen Burner production again.' },
  { id:'beaker_u5',      name:'Parallel Reaction Racks',  icon:'⚗️', building:'beaker',      unlockOwned:200, cost:14256000,           mult:2, desc:'Doubles Beaker Rig production again.' },
  { id:'centrifuge_u5',  name:'Contra-Rotating Drums',    icon:'🌀', building:'centrifuge',  unlockOwned:200, cost:155520000,          mult:2, desc:'Doubles Centrifuge production again.' },
  { id:'cyclotron_u5',   name:'Harmonic Frequency Lock',  icon:'💫', building:'cyclotron',   unlockOwned:200, cost:1684800000,         mult:2, desc:'Doubles Cyclotron production again.' },
  { id:'reactor_u5',     name:'Breeder Core Conversion',  icon:'☢️', building:'reactor',     unlockOwned:200, cost:18144000000,        mult:2, desc:'Doubles Fusion Reactor production again.' },
  { id:'accelerator_u5', name:'Beam Splitter Array',      icon:'🚀', building:'accelerator', unlockOwned:200, cost:259200000000,       mult:2, desc:'Doubles Particle Accelerator production again.' },
  { id:'star_u5',        name:'Accretion Disk Funnel',    icon:'⭐', building:'star',        unlockOwned:200, cost:4276800000000,      mult:2, desc:'Doubles Neutron Star Core production again.' },
  // --- tier 6 (owned 500) ---
  { id:'electron_u6',    name:'Vacuum Fluctuation Tap',   icon:'⚛️', building:'electron',    unlockOwned:500, cost:1166400,            mult:2, desc:'Doubles Electron Cloud production again.' },
  { id:'burner_u6',      name:'Self-Replicating Flame',   icon:'🔥', building:'burner',      unlockOwned:500, cost:7776000,            mult:2, desc:'Doubles Bunsen Burner production again.' },
  { id:'beaker_u6',      name:'Fractal Distillation',     icon:'⚗️', building:'beaker',      unlockOwned:500, cost:85536000,           mult:2, desc:'Doubles Beaker Rig production again.' },
  { id:'centrifuge_u6',  name:'Nested Rotor Assembly',    icon:'🌀', building:'centrifuge',  unlockOwned:500, cost:933120000,          mult:2, desc:'Doubles Centrifuge production again.' },
  { id:'cyclotron_u6',   name:'Recursive Beam Folding',   icon:'💫', building:'cyclotron',   unlockOwned:500, cost:10108800000,        mult:2, desc:'Doubles Cyclotron production again.' },
  { id:'reactor_u6',     name:'Cascading Fusion Chain',   icon:'☢️', building:'reactor',     unlockOwned:500, cost:108864000000,       mult:2, desc:'Doubles Fusion Reactor production again.' },
  { id:'accelerator_u6', name:'Recursive Collision Loop', icon:'🚀', building:'accelerator', unlockOwned:500, cost:1555200000000,      mult:2, desc:'Doubles Particle Accelerator production again.' },
  { id:'star_u6',        name:'Singularity Feedback Loop',icon:'⭐', building:'star',        unlockOwned:500, cost:25660800000000,     mult:2, desc:'Doubles Neutron Star Core production again.' },
];

// Global upgrades — unlocked by TOTAL buildings owned across every type (not any one building),
// each adding a flat percentage to ALL production at once. A different progression axis than the
// per-building tiers above: these reward breadth (a varied lab) rather than stacking into one
// building, and stack additively with each other and multiplicatively with everything else
// (prestige shards, achievement bonuses, per-building upgrades).
const CLICKER_GLOBAL_UPGRADES = [
  { id:'global_u1', name:'Lab Assistant',          icon:'🧑‍🔬', unlockTotalOwned:20,  cost:50000,         bonus:0.10, desc:'+10% production from every building, unlocked by owning 20 buildings total.' },
  { id:'global_u2', name:'Research Grant',         icon:'📜',   unlockTotalOwned:50,  cost:500000,        bonus:0.15, desc:'+15% production from every building, unlocked by owning 50 buildings total.' },
  { id:'global_u3', name:'Shared Infrastructure',  icon:'🏗️',   unlockTotalOwned:100, cost:5000000,       bonus:0.20, desc:'+20% production from every building, unlocked by owning 100 buildings total.' },
  { id:'global_u4', name:'Automated Logistics',    icon:'🤖',   unlockTotalOwned:200, cost:50000000,      bonus:0.25, desc:'+25% production from every building, unlocked by owning 200 buildings total.' },
  { id:'global_u5', name:'AI-Optimized Scheduling',icon:'🧠',   unlockTotalOwned:350, cost:500000000,     bonus:0.30, desc:'+30% production from every building, unlocked by owning 350 buildings total.' },
  { id:'global_u6', name:'Quantum Computing Grid', icon:'🖥️',   unlockTotalOwned:500, cost:5000000000,    bonus:0.35, desc:'+35% production from every building, unlocked by owning 500 buildings total.' },
  { id:'global_u7', name:'Orbital Research Array', icon:'🛰️',   unlockTotalOwned:750, cost:50000000000,   bonus:0.40, desc:'+40% production from every building, unlocked by owning 750 buildings total.' },
  { id:'global_u8', name:'Dyson Swarm Logistics',  icon:'☀️',   unlockTotalOwned:1000,cost:500000000000,  bonus:0.50, desc:'+50% production from every building, unlocked by owning 1,000 buildings total.' },
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
