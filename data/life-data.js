// WestLife — data tables for the life simulator (life.html). Tune the whole game from here.
// Money always goes through the site's single wallet; these numbers are deliberately modest next to the stock market,
// so a career is a steady climb and the big money comes from risk (businesses, the $WEST exchange, WestLab).

const LIFE_MONTH_COOLDOWN_MS = 8000;   // real seconds between "Next month" presses (stops macro-clicking a fortune)
const LIFE_START_AGE = 18;
const LIFE_ACTIONS_PER_MONTH = 2;      // action points you get each month
const LIFE_FOOD_COST = 80;             // groceries per month
const LIFE_MONTHS_PER_PROMOTION = 10;  // months at a level before a promotion can happen
const LIFE_FUNERAL_COST = 1500;
const LIFE_ESTATE_TAX = 0.20;          // share of cash above TAX_THRESHOLD taken when you die
const LIFE_MAX_AGE = 100;

const LIFE_NAMES = ['Alex','Sam','Jordan','Riley','Casey','Morgan','Taylor','Avery','Quinn','Rowan','Jamie','Skyler','Dana','Robin','Devon','Harper'];
const LIFE_SURNAMES = ['West','Carter','Nguyen','Okafor','Silva','Patel','Kowalski','Brooks','Haddad','Murphy','Tanaka','Rossi'];

const LIFE_EDU = [                      // index = education level
  { name: 'High school diploma', cost: 0,     months: 0,  smarts: 0  },
  { name: 'Community college',   cost: 2400,  months: 12, smarts: 30 },
  { name: 'University degree',   cost: 12000, months: 36, smarts: 50 },
  { name: 'Professional school', cost: 30000, months: 36, smarts: 70 }
];

const LIFE_CAREERS = [                  // levels: [title, monthly pay]
  { id: 'retail',   name: 'Retail',      icon: '🛒', edu: 0, smarts: 0,  levels: [['Cashier', 220], ['Shift Lead', 320], ['Store Manager', 520], ['Regional Director', 900]] },
  { id: 'kitchen',  name: 'Restaurant',  icon: '🍳', edu: 0, smarts: 20, levels: [['Dishwasher', 210], ['Line Cook', 330], ['Sous Chef', 520], ['Head Chef', 950]] },
  { id: 'office',   name: 'Office',      icon: '💼', edu: 1, smarts: 35, levels: [['Receptionist', 300], ['Analyst', 480], ['Manager', 850], ['Director', 1500]] },
  { id: 'teacher',  name: 'Education',   icon: '🍎', edu: 2, smarts: 45, levels: [['Teaching Assistant', 420], ['Teacher', 700], ['Head of Department', 1100], ['Principal', 1700]] },
  { id: 'tech',     name: 'Technology',  icon: '💻', edu: 2, smarts: 55, levels: [['Junior Developer', 700], ['Developer', 1200], ['Senior Developer', 2000], ['CTO', 3600]] },
  { id: 'law',      name: 'Law',         icon: '⚖️', edu: 3, smarts: 65, levels: [['Paralegal', 800], ['Associate', 1700], ['Partner', 3500], ['Judge', 4800]] },
  { id: 'medicine', name: 'Medicine',    icon: '🩺', edu: 3, smarts: 70, levels: [['Resident', 1100], ['Doctor', 2300], ['Specialist', 3800], ['Chief of Surgery', 5200]] }
];

const LIFE_HOMES = [                    // rent = monthly rent; price > 0 means you BUY it (then upkeep is charged instead of rent)
  { id: 'couch',     name: 'Couch surfing',      icon: '🛋️', rent: 0,   price: 0,      upkeep: 0,   mood: -4, health: -1 },
  { id: 'parents',   name: "Parents' place",     icon: '🏠', rent: 0,   price: 0,      upkeep: 0,   mood: -1, health: 0, maxAge: 24 },
  { id: 'studio',    name: 'Studio flat',        icon: '🏢', rent: 160, price: 0,      upkeep: 0,   mood: 0,  health: 0 },
  { id: 'apartment', name: 'Nice apartment',     icon: '🌆', rent: 380, price: 0,      upkeep: 0,   mood: 1,  health: 0 },
  { id: 'house',     name: 'House (own it)',     icon: '🏡', rent: 0,   price: 55000,  upkeep: 90,  mood: 2,  health: 1 },
  { id: 'mansion',   name: 'Mansion (own it)',   icon: '🏰', rent: 0,   price: 380000, upkeep: 700, mood: 4,  health: 1 }
];

const LIFE_BIZ = [                      // monthly profit is random between min and max (negative = a losing month)
  { id: 'lemon',   name: 'Lemonade stand', icon: '🍋', cost: 250,   min: 12,    max: 38 },
  { id: 'truck',   name: 'Food truck',     icon: '🚚', cost: 6000,  min: -120,  max: 520 },
  { id: 'shop',    name: 'Corner shop',    icon: '🏪', cost: 25000, min: -400,  max: 1700 },
  { id: 'startup', name: 'Tech startup',   icon: '🚀', cost: 80000, min: -2500, max: 7500, jackpotChance: 0.02, jackpot: 150000 }
];

const LIFE_ACTIONS = [                  // each costs 1 action point
  { id: 'study',    name: 'Study',            icon: '📚', cost: 0,   fx: { smarts: 3, happy: -1 } },
  { id: 'gym',      name: 'Hit the gym',      icon: '🏋️', cost: 30,  fx: { health: 4, happy: 1 } },
  { id: 'friends',  name: 'See friends',      icon: '🍻', cost: 25,  fx: { happy: 5 } },
  { id: 'doctor',   name: 'Doctor visit',     icon: '🩺', cost: 150, fx: { health: 10 } },
  { id: 'vacation', name: 'Take a vacation',  icon: '🏝️', cost: 450, fx: { happy: 14, health: 2 } },
  { id: 'hustle',   name: 'Work extra hard',  icon: '🔥', cost: 0,   fx: { health: -2, happy: -2 }, career: 1, needsJob: true }
];

// Random events. `fx(L)` returns { cash, health, happy, smarts, msg }. `choices` events pause the game until you pick one.
const lifeRnd = (a, b) => Math.round(a + Math.random() * (b - a));
const LIFE_EVENTS = [
  { id: 'coat',    w: 3,   fx: () => { const c = lifeRnd(20, 120); return { cash: c, happy: 1, msg: `Found $${c} in an old coat.` }; } },
  { id: 'bill',    w: 4,   fx: () => { const c = lifeRnd(60, 260); return { cash: -c, happy: -2, msg: `Unexpected bill: −$${c}.` }; } },
  { id: 'fine',    w: 3,   fx: () => ({ cash: -60, happy: -1, msg: 'Parking fine: −$60.' }) },
  { id: 'flu',     w: 3,   fx: () => ({ health: -8, happy: -2, msg: 'You caught the flu.' }) },
  { id: 'injury',  w: 1.5, fx: () => ({ health: -6, msg: 'You pulled something. Ouch.' }) },
  { id: 'dinner',  w: 4,   fx: () => ({ cash: -30, happy: 4, msg: 'Great dinner with friends (−$30).' }) },
  { id: 'viral',   w: 1,   fx: () => { const c = lifeRnd(300, 1200); return { cash: c, happy: 3, msg: `A clip of you went viral — +$${c} in tips.` }; } },
  { id: 'burglar', w: 1.5, fx: () => { const c = lifeRnd(100, 400); return { cash: -c, happy: -4, msg: `Burglary! −$${c}.` }; } },
  { id: 'pet',     w: 1.5, fx: () => ({ cash: -100, happy: 6, msg: 'You adopted a pet (−$100). Worth it.' }) },
  { id: 'heir',    w: 0.4, fx: () => { const c = lifeRnd(1000, 5000); return { cash: c, happy: 2, msg: `A distant relative left you $${c}.` }; } },
  { id: 'lottery', w: 0.15, fx: () => ({ cash: 20000, happy: 10, msg: '🎉 You won the lottery! +$20,000.' }) },
  { id: 'bonus',   w: 2,   when: L => !!L.job, fx: (L, pay) => ({ cash: Math.round(pay * 0.5), happy: 3, msg: `Surprise bonus at work: +$${Math.round(pay * 0.5)}.` }) },
  { id: 'wallet', w: 2, text: 'You find a wallet stuffed with cash on the pavement.', choices: [
      { label: 'Keep it (+$150)',        fx: () => ({ cash: 150, happy: -4, msg: 'You kept the wallet. It feels a bit gross.' }) },
      { label: 'Hand it in',             fx: () => ({ happy: 5, smarts: 1, msg: 'You handed it in. The owner was so grateful.' }) } ] },
  { id: 'pitch', w: 1.5, text: 'A friend pitches you on their "can’t-miss" side project. They want $500.', choices: [
      { label: 'Invest $500', cost: 500, fx: () => Math.random() < 0.45 ? { cash: 2200, happy: 6, msg: 'It actually worked! Your $500 became $2,200.' } : { happy: -3, msg: 'The project fizzled. $500 gone.' } },
      { label: 'Pass',                   fx: () => ({ msg: 'You politely passed.' }) } ] },
  { id: 'quiz', w: 1.5, text: 'Mr West springs a surprise pop quiz on you!', choices: [
      { label: 'Cram for it',            fx: () => ({ smarts: 4, happy: -3, msg: 'You crammed hard and aced it.' }) },
      { label: 'Wing it',                fx: () => Math.random() < 0.5 ? { smarts: 2, msg: 'You winged it and got lucky.' } : { smarts: -3, happy: -2, msg: 'You winged it. It showed.' } } ] }
];
