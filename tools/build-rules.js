// node tools/build-rules.js  →  writes database.rules.json (paste its contents into Firebase console → Realtime Database → Rules).
// The unchanged parts of the rules live in tools/rules-base.json; this script adds players / leaderboard / eco / world, the parts that enforce the
// WestEconomy law "money is never created or destroyed" (see os/lib/economy.js). Every rule is built from small named pieces so it stays readable,
// and tests/rules.test.js runs the generated strings against honest and cheating writes.
const fs = require('fs'), path = require('path');
const ADMIN_EMAIL = 'kirattdhaliwal@gmail.com';
const ADMIN = `(auth != null && auth.token.email === '${ADMIN_EMAIL}' && auth.token.email_verified === true)`;
const NONANON = `(auth != null && auth.token.firebase.sign_in_provider !== 'anonymous')`;
const OWNER = u => `(${NONANON} && auth.uid === ${u})`;
const OWNER_OR_ADMIN = u => `(${OWNER(u)} || ${ADMIN})`;
const DAY = 86400000, TODAY = `(now - now % ${DAY})`;

/* config numbers: eco/cfg overrides the default baked in here (the defaults match os/lib/economy.js DEFAULTS) */
const cfg = (k, d) => `(root.child('eco/cfg/${k}').exists() ? root.child('eco/cfg/${k}').val() : ${d})`;
const TAX = cfg('taxBp', 400), DUTY = cfg('dutyBp', 200), SELLBP = cfg('sellBp', 9000), GRACE = `(${cfg('graceHours', 24)} * 3600000)`;
const START = cfg('startGrant', 10000000), OGX = cfg('ogExtra', 5000000), POOLD = cfg('poolDaily', 500000000), MAXACCT = cfg('maxAcct', 5000000000000000), EPD = cfg('earnPerDay', 10000000), SLACK = cfg('earnSlack', 100000), HDIV = cfg('homelessPoolDiv', 10), MFEE = cfg('marketFeeBp', 500);
const ARC = k => `root.child('arcadeConfig/${k}')`;
const ARC_STAKE = `(${ARC('betCap')}.exists() ? ${ARC('betCap')}.val() * 100 : 2500000)`;
const ARC_WIN = `(${ARC('betCap')}.exists() ? ${ARC('betCap')}.val() * 100 * (${ARC('maxMult')}.exists() ? ${ARC('maxMult')}.val() : 100) : 250000000)`;
const ARC_DAILY = `(${ARC('dailyCap')}.exists() ? ${ARC('dailyCap')}.val() * 100 : 10000000)`;
const ARC_ON = `(${ARC('enabled')}.exists() ? ${ARC('enabled')}.val() === true : true)`;

/* ---------- eco/acct/$uid : the ledger account ---------- */
const n = f => `newData.child('${f}').val()`, o = f => `(data.exists() ? data.child('${f}').val() : 0)`, D = f => `(${n(f)} - ${o(f)})`;
const INTS = ['b', 's', 'r', 'rev', 'c0', 'dp', 'pin', 'an', 'ob', 'sys/pool', 'sys/arcade', 'sys/bank', 'sys/gov', 'sys/city'];
const isInt = f => `(newData.child('${f}').isNumber() && ${n(f)} % 1 === 0)`;
const R3 = `newData.parent().parent().parent()`;                                // eco/acct/$uid → the (new) root
const day0 = `(${o('dp')} === ${TODAY})`;
const SAMEDAY = (f) => `(${day0} ? ${o(f)} : 0)`;
const L = `${R3}.child('eco/loan/' + $uid + '/' + ${n('lop')})`, L0 = `root.child('eco/loan/' + $uid + '/' + ${n('lop')})`;
const HOME = `${R3}.child('world/home/' + $uid + '/h').exists()`;
const H = `${R3}.child('world/own/' + ${n('hop')})`, H0 = `root.child('world/own/' + ${n('hop')})`;
const PI = `(root.child('world/meta/pi').exists() ? root.child('world/meta/pi').val() : 10000)`;
const inbox = (path) => `${R3}.child('eco/inbox/' + ${path})`;

const ACCT_CORE = [
  `newData.exists()`,
  `newData.hasChildren(['b','sys','s','r','rev','c0','dp','pin','an','ob','cl','si','bp','lop','hop'])`,
  ...INTS.map(isInt),
  `${n('b')} >= 0 && ${n('b')} <= ${MAXACCT} && ${n('s')} >= 0 && ${n('r')} >= 0 && ${n('rev')} >= 1`,
  `${D('s')} >= 0 && ${D('r')} >= 0`,
  // THE LAW: cash + (what I paid into every system account) + sent − claimed = 0
  `${n('b')} + ${n('sys/pool')} + ${n('sys/arcade')} + ${n('sys/bank')} + ${n('sys/gov')} + ${n('sys/city')} + ${n('s')} - ${n('r')} === 0`,
  `${n('rev')} === ${o('rev')} + 1`,
  `${n('c0')} === (data.exists() ? ${o('c0')} : now)`,                                  // when the account was created (set once by the server clock)
  // THE BROWSER-EDIT LIMIT: all the money a player has ever drawn from the market pool (−sys.pool) is capped at grant + allowance × days alive
  `(0 - ${n('sys/pool')}) <= ${START} + ${OGX} + ${SLACK} + ${EPD} * (now - ${n('c0')}) / 86400000`,                                                    // optimistic concurrency: a stale writer is refused, never merged over newer data
  `${D('sys/gov')} >= 0`,                                                                // players can pay the treasury, never draw from it
  // onboarding grant: once, exact amount (+OG bonus), nothing else moving in the same write
  `(${D('ob')} === 0 || (${D('ob')} === 1 && ${o('ob')} === 0 && ${D('sys/pool')} === 0 - (${START} + (root.child('eco/og/' + $uid).exists() ? ${OGX} : 0)) && ${D('sys/arcade')} === 0 && ${D('sys/bank')} === 0 && ${D('sys/gov')} === 0 && ${D('sys/city')} === 0 && ${D('s')} === 0 && ${D('r')} === 0))`,
  // universal tax: every flow between a player and the market pool carries ≥ taxBp of the amount to the treasury
  `(${D('ob')} === 1 || (${D('sys/pool')} * ${TAX} <= ${D('sys/gov')} * 10000 && (0 - ${D('sys/pool')}) * ${TAX} <= ${D('sys/gov')} * 10000))`,
  // daily limits: net money drawn from the pool today, casino net winnings today
  `${n('dp')} === ${TODAY}`,
  `${n('pin')} === (${SAMEDAY('pin')} - ${D('sys/pool')} > 0 ? ${SAMEDAY('pin')} - ${D('sys/pool')} : 0)`,
  `${n('pin')} <= (${HOME} ? ${POOLD} : ${POOLD} / ${HDIV})`,                                  // homeless players may draw only a tenth
  `${n('an')} === ${SAMEDAY('an')} - ${D('sys/arcade')}`,
  `(${n('an')} <= ${ARC_DAILY} || ${n('an')} <= ${SAMEDAY('an')})`,
  `${D('sys/arcade')} <= 2 * ${ARC_STAKE} && (0 - ${D('sys/arcade')}) <= ${ARC_WIN} && (${D('sys/arcade')} <= 0 || (${ARC_ON} && ${HOME}))`,
  `(${D('sys/arcade')} >= 0 || (0 - ${D('sys/arcade')}) * ${TAX} <= ${D('sys/gov')} * 10000)`,
  // inbox: a send must create exactly the inbox entry it paid for; a claim must delete exactly the entry it credits
  `(${D('s')} === 0 || (${D('s')} > 0 && ${inbox(n('si') + ' + \'/a\'')}.val() === ${D('s')} && !root.child('eco/inbox/' + ${n('si')}).exists()))`,
  `(${D('r')} === 0 || (${D('r')} > 0 && root.child('eco/inbox/' + $uid + '/' + ${n('cl')} + '/a').val() === ${D('r')} && !${inbox('$uid + \'/\' + ' + n('cl'))}.exists()))`,
  // bills: paying one must delete it and pay at least its amount to the treasury
  `(${n('bp')} === ${o('bp')} || (root.child('eco/bill/' + $uid + '/' + ${n('bp')} + '/a').val() <= ${D('sys/gov')} && !${R3}.child('eco/bill/' + $uid + '/' + ${n('bp')}).exists()))`,
  // loans: money may only move to/from the bank together with a loan record changing by exactly that amount
  `(${D('sys/bank')} === 0 || ((!${L0}.exists() && ${L}.exists() && ${n('ob')} === 1 && ${D('sys/bank')} === 0 - ${L}.child('p').val()) || (${L0}.exists() && ${D('sys/bank')} > 0 && ${D('sys/bank')} === ${L0}.child('o').val() - (${L}.exists() ? ${L}.child('o').val() : 0) && (!${L}.exists() || ${L}.child('p').val() === ${L0}.child('p').val()))))`,
  // city: money may only move to/from the city when a house changes hands with it, at exactly the house's value (or rent for a bank-owned house)
  `(${D('sys/city')} === 0 || ((${H0}.child('o').val() === 'bank' && ${H}.child('o').val() === $uid && ${D('sys/city')} === ${H0}.child('v').val() && ${D('sys/gov')} * 10000 >= ${H0}.child('v').val() * ${DUTY})` +
    ` || (${H0}.child('o').val() === $uid && ${H}.child('o').val() === 'bank' && ${D('sys/city')} * 10000 === 0 - (${H0}.child('v').val() * ${SELLBP} - (${H0}.child('v').val() * ${SELLBP}) % 10000))` +
    ` || (${H0}.child('o').val() === 'bank' && ${H}.child('o').val() === 'bank' && ${H}.child('t').val() === $uid && ${D('sys/city')} === (${H}.child('th').val() - (${H0}.child('t').val() === $uid ? ${H0}.child('th').val() : 0)) * ${H0}.child('rh').val())` +
    // a building licence from the council
    ` || (${n('hop')} === 'lic' && ${D('sys/city')} === ${cfg('licFee', 5000000)} && ${R3}.child('world/lic/' + $uid + '/t0').val() === now)` +
    // escrow for a house the council will build (the exact price is charged when it is built; the rest is refunded)
    ` || (${n('hop')} === 'bld' && !root.child('world/build/' + $uid + '/' + ${n('lop')}).exists() && ${R3}.child('world/build/' + $uid + '/' + ${n('lop')}).exists() && ${D('sys/city')} === (root.child('eco/cfg/builds/' + ${R3}.child('world/build/' + $uid + '/' + ${n('lop')} + '/y').val() + '/c').val() * ${PI} - (root.child('eco/cfg/builds/' + ${R3}.child('world/build/' + $uid + '/' + ${n('lop')} + '/y').val() + '/c').val() * ${PI}) % 10000) / 10000)))`
];
const acctWrite = `${ADMIN} || (${OWNER('$uid')} && ${ACCT_CORE.map(x => '(' + x + ')').join(' && ')})`;
const acctRules = {
  '.read': OWNER_OR_ADMIN('$uid'),
  '.write': acctWrite,
  b: {}, s: {}, r: {}, rev: {}, c0: {}, dp: {}, pin: {}, an: {}, ob: {},
  sys: { pool: {}, arcade: {}, bank: {}, gov: {}, city: {}, $other: { '.validate': false } },
  cl: { '.validate': 'newData.isString() && newData.val().length <= 60' }, si: { '.validate': 'newData.isString() && newData.val().length <= 120' },
  bp: { '.validate': 'newData.isString() && newData.val().length <= 60' }, lop: { '.validate': 'newData.isString() && newData.val().length <= 4' }, hop: { '.validate': 'newData.isString() && newData.val().length <= 12' },
  $other: { '.validate': false }
};
['b', 's', 'r', 'rev', 'c0', 'dp', 'pin', 'an', 'ob'].forEach(k => { acctRules[k]['.validate'] = 'newData.isNumber()'; });
['pool', 'arcade', 'bank', 'gov', 'city'].forEach(k => { acctRules.sys[k]['.validate'] = 'newData.isNumber()'; });

/* ---------- eco/inbox/$to/$id : money in flight ---------- */
const inboxRules = { '.read': OWNER_OR_ADMIN('$to'), $id: {
  '.write': `${ADMIN} || (${NONANON} && ((!data.exists() && newData.exists() && ${n('f')} === auth.uid && ${n('a')} === newData.parent().parent().parent().child('acct/' + auth.uid + '/s').val() - root.child('eco/acct/' + auth.uid + '/s').val() && newData.parent().parent().parent().child('acct/' + auth.uid + '/si').val() === $to + '/' + $id) || (data.exists() && !newData.exists() && auth.uid === $to && newData.parent().parent().parent().child('acct/' + $to + '/cl').val() === $id)))`,
  '.validate': `!newData.exists() || (newData.hasChildren(['f','a','k','t']) && newData.child('a').isNumber() && ${n('a')} > 0 && ${n('a')} % 1 === 0 && ${n('a')} <= 9000000000000000 && newData.child('k').isString() && ${n('k')}.length <= 16 && ${n('t')} === now && (${n('k')} !== 'market' || (newData.child('l').isString() && ${n('n')} >= 1 && ${n('n')} % 1 === 0 && newData.parent().parent().parent().parent().child('market/listings/' + ${n('l')} + '/q').val() === root.child('market/listings/' + ${n('l')} + '/q').val() - ${n('n')} && ${n('a')} * 10000 >= root.child('market/listings/' + ${n('l')} + '/p').val() * 100 * ${n('n')} * (10000 - ${MFEE}) - 20000)))`,
  f: {}, a: {}, k: {}, t: {}, l: { '.validate': 'newData.isString() && newData.val().length <= 80' }, n: { '.validate': 'newData.isNumber()' }, ref: { '.validate': 'newData.isString() && newData.val().length <= 60' }, $other: { '.validate': false } } };
['f', 'a', 'k', 't'].forEach(k => { inboxRules.$id[k]['.validate'] = k === 'a' || k === 't' ? 'newData.isNumber()' : 'newData.isString() && newData.val().length <= 60'; });

/* ---------- eco/bill/$uid/$bid : charges the Action issues; the owner may only delete one by paying it ---------- */
const billRules = { '.read': OWNER_OR_ADMIN('$uid'), $bid: { '.write': `${ADMIN} || (${OWNER('$uid')} && data.exists() && !newData.exists() && newData.parent().parent().parent().child('acct/' + $uid + '/bp').val() === $bid && newData.parent().parent().parent().child('acct/' + $uid + '/sys/gov').val() - root.child('eco/acct/' + $uid + '/sys/gov').val() >= data.child('a').val())` } };

/* ---------- eco/loan/$uid/$slot ---------- */
const LN = f => `newData.child('${f}').val()`, LD = f => `data.child('${f}').val()`;
const PLAN = k => `root.child('eco/cfg/plans/' + ${LN('pl')} + '/${k}')`, PLANV = k => PLAN(k) + '.val()';
const loanRules = { '.read': OWNER_OR_ADMIN('$uid'), $slot: {
  '.write': `${ADMIN} || (${OWNER('$uid')} && (` +
    // take a loan: empty slot, onboarded and housed, within the limit, interest from the published plan, paid out by the bank (the account rule checks the money)
    `(!data.exists() && newData.exists() && $slot.matches(/^l[1-3]$/) && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/ob').val() === 1 && newData.parent().parent().parent().parent().child('world/home/' + $uid + '/h').exists() && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/lop').val() === $slot && ${LN('p')} >= 100000 && ${LN('p')} <= ${cfg('loanMax', 50000000)} && ${PLAN('bp')}.exists() && ${LN('o')} === ${LN('p')} + (${LN('p')} * ${PLANV('bp')} - (${LN('p')} * ${PLANV('bp')}) % 10000) / 10000 && ${LN('dd')} === ${PLANV('days')} && ${LN('t0')} === now)` +
    // repay (part of) a loan: the principal/plan never change, what is owed only goes down (the account rule checks the money), paying it all deletes it
    ` || (data.exists() && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/lop').val() === $slot && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/rev').val() === root.child('eco/acct/' + $uid + '/rev').val() + 1 && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/sys/bank').val() - root.child('eco/acct/' + $uid + '/sys/bank').val() === ${LD('o')} - (newData.exists() ? ${LN('o')} : 0) && (!newData.exists() || (${LN('p')} === ${LD('p')} && ${LN('pl')} === ${LD('pl')} && ${LN('dd')} === ${LD('dd')} && ${LN('t0')} === ${LD('t0')} && ${LN('o')} < ${LD('o')} && ${LN('o')} > 0 && ${LN('l')} === ${LD('l')}))) ))`,
  '.validate': `!newData.exists() || (newData.hasChildren(['p','o','pl','dd','t0']) && newData.child('p').isNumber() && newData.child('o').isNumber() && newData.child('pl').isString() && newData.child('dd').isNumber() && newData.child('t0').isNumber())`,
  p: {}, o: {}, pl: {}, dd: {}, t0: {}, l: {}, $other: { '.validate': false } } };
['p', 'o', 'dd', 't0', 'l'].forEach(k => { loanRules.$slot[k]['.validate'] = 'newData.isNumber() && newData.val() >= 0'; }); loanRules.$slot.pl['.validate'] = 'newData.isString() && newData.val().length <= 12';

/* ---------- world/own/$h : one house ---------- */
const nd = f => `newData.child('${f}').val()`, dd = f => `data.child('${f}').val()`;
const same = fs => fs.map(f => `${nd(f)} === ${dd(f)}`).join(' && ');
const ACC = `newData.parent().parent().parent().child('eco/acct/' + auth.uid)`, ACC0 = `root.child('eco/acct/' + auth.uid)`;
const dS = `(${ACC}.child('s').val() - ${ACC0}.child('s').val())`, dGov = `(${ACC}.child('sys/gov').val() - ${ACC0}.child('sys/gov').val())`, dCity = `(${ACC}.child('sys/city').val() - ${ACC0}.child('sys/city').val())`;
const HOP = `(${ACC}.child('hop').val() === $h && ${ACC}.child('rev').val() === ${ACC0}.child('rev').val() + 1)`;
const NAME = `(${nd('on')} === newData.parent().parent().parent().child('leaderboard/' + auth.uid + '/name').val())`;
const pay = amt => `(${dd('o')} === 'bank' ? (${HOP} && ${dCity} === ${amt}) : (${ACC}.child('si').val().beginsWith(${dd('o')} + '/') && ${dS} === ${amt} && ${ACC}.child('rev').val() === ${ACC0}.child('rev').val() + 1))`;
const ALLF = ['o', 'on', 'v', 'a', 'rh', 't', 'tn', 'ts', 'th', 'dm', 'f'];
const houseCases = [
  // owner changes the asking price / rent, or evicts the tenant
  `(${dd('o')} === auth.uid && ${nd('o')} === auth.uid && ${nd('a')} >= 0 && ${nd('rh')} >= 0 && ${nd('a')} <= 1000000000000 && ${nd('rh')} <= ${dd('v')} / 2000 && ${same(['on', 'v', 'dm', 'f'])} && ((${same(['t', 'tn', 'ts', 'th'])}) || (${nd('t')} === '' && ${nd('tn')} === '' && ${nd('ts')} === 0 && ${nd('th')} === 0 && ${dd('ts')} + ${dd('th')} * 3600000 < now)))`,
  // buy from the bank (the city): pays the house's value + duty; a sitting tenant stays
  `(${dd('o')} === 'bank' && ${nd('o')} === auth.uid && ${nd('a')} === 0 && ${NAME} && ${same(['v', 'rh', 't', 'tn', 'ts', 'th', 'dm', 'f'])} && ${HOP})`,
  // buy from another player or a bot who put it up for sale: pays their asking price to them (inbox) + duty
  `(${dd('o')} !== 'bank' && ${dd('o')} !== auth.uid && ${dd('a')} > 0 && ${nd('o')} === auth.uid && ${nd('a')} === 0 && ${NAME} && ${same(['v', 'rh', 't', 'tn', 'ts', 'th', 'dm', 'f'])} && ${ACC}.child('si').val().beginsWith(${dd('o')} + '/') && ${dS} === ${dd('a')} && ${dGov} * 10000 >= ${dd('a')} * ${DUTY} && ${ACC}.child('rev').val() === ${ACC0}.child('rev').val() + 1)`,
  // sell to the city at its buy-back price (must be vacant)
  `(${dd('o')} === auth.uid && ${nd('o')} === 'bank' && ${nd('on')} === 'City' && ${nd('a')} === 0 && ${nd('rh')} === 0 && ${nd('t')} === '' && ${nd('tn')} === '' && ${nd('ts')} === 0 && ${nd('th')} === 0 && ${same(['v', 'dm', 'f'])} && ${HOP})`,
  // move in: pay the first hours of rent up front
  `(${dd('t')} === '' && ${dd('o')} !== auth.uid && ${dd('rh')} > 0 && ${nd('t')} === auth.uid && ${nd('tn')} !== '' && ${nd('ts')} === now && ${nd('th')} >= 1 && ${nd('th')} <= 720 && ${same(['o', 'on', 'v', 'a', 'rh', 'dm', 'f'])} && ${pay(`${nd('th')} * ${dd('rh')}`)})`,
  // top up rent while the tenancy is still current
  `(${dd('t')} === auth.uid && ${nd('t')} === auth.uid && ${nd('th')} > ${dd('th')} && ${nd('th')} - ${dd('th')} <= 720 && ${dd('ts')} + ${dd('th')} * 3600000 + ${GRACE} >= now && ${same(['o', 'on', 'v', 'a', 'rh', 'tn', 'ts', 'dm', 'f'])} && ${pay(`(${nd('th')} - ${dd('th')}) * ${dd('rh')}`)})`,
  // move out
  `(${dd('t')} === auth.uid && ${nd('t')} === '' && ${nd('tn')} === '' && ${nd('ts')} === 0 && ${nd('th')} === 0 && ${same(['o', 'on', 'v', 'a', 'rh', 'dm', 'f'])})`
];
const houseRules = { '.read': true, '.indexOn': ['o'], $h: {
  '.write': `${ADMIN} || (${NONANON} && data.exists() && newData.exists() && (${houseCases.join(' || ')}))`,
  '.validate': `!newData.exists() || (newData.hasChildren(${JSON.stringify(ALLF).replace(/"/g, "'")}) && newData.child('o').isString() && newData.child('on').isString() && newData.child('v').isNumber() && newData.child('a').isNumber() && newData.child('rh').isNumber() && newData.child('t').isString() && newData.child('tn').isString() && newData.child('ts').isNumber() && newData.child('th').isNumber() && newData.child('dm').isNumber() && newData.child('f').isNumber())`,
  o: { '.validate': 'newData.val().length <= 40' }, on: { '.validate': 'newData.val().length <= 20' }, tn: { '.validate': 'newData.val().length <= 20' }, t: { '.validate': 'newData.val().length <= 40' },
  v: {}, a: {}, rh: {}, ts: {}, th: {}, dm: {}, f: {}, $other: { '.validate': false } } };
['v', 'a', 'rh', 'ts', 'th', 'dm', 'f'].forEach(k => { houseRules.$h[k]['.validate'] = 'newData.val() % 1 === 0 && newData.val() >= 0'; });

/* ---------- assemble ---------- */
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules-base.json'), 'utf8'));
const GUARD = `newData.parent().parent().parent().child('eco/acct/' + $uid + '/rev').val() === root.child('eco/acct/' + $uid + '/rev').val() + 1`;
const guarded = { '.write': `${ADMIN} || (${OWNER('$uid')} && ${GUARD})` }, light = { '.write': `${ADMIN} || ${OWNER('$uid')}` };
const g = (extra) => Object.assign({}, guarded, extra || {}), l = (extra) => Object.assign({}, light, extra || {});
const players = { '.read': ADMIN, '.write': ADMIN, $uid: {
  '.read': OWNER_OR_ADMIN('$uid'), '.write': ADMIN,
  inv: g(), lots: g(), bank: g(), lab: g(), games: g(),                                          // guarded: only written together with a ledger revision, so a stale save is refused whole
  factory: g({ '.validate': `newData.hasChildren(['slots']) && newData.child('slots').isNumber() && newData.child('slots').val() >= 2 && newData.child('slots').val() <= 8` }),
  mail: l(), shop: l(), prefs: l(),
  meta: l({ name: { '.validate': `newData.val() === '' || (newData.isString() && newData.val().length >= 2 && newData.val().length <= 20 && !newData.val().matches(/.*[<>&\\"'\`].*/))` } }),
  updatedAt: l({ '.validate': 'newData.isNumber()' })
} };
const lbNum = hi => ({ '.validate': `newData.isNumber() && newData.val() >= 0 && newData.val() <= ${hi}` });
const leaderboard = { '.read': true, '.write': ADMIN, '.indexOn': ['value', 'nw', 're', 'stk', 'inv', 'disc', 'runs', 'props', 'els', 'fac', 'made'], $uid: {
  '.write': `${OWNER_OR_ADMIN('$uid')}`,
  name: { '.validate': `newData.isString() && newData.val().length >= 2 && newData.val().length <= 20 && !newData.val().matches(/.*[<>&\\"'\`].*/)` },
  updatedAt: { '.validate': 'newData.isNumber()' }, value: lbNum(1e13), nw: lbNum(1e13), re: lbNum(1e13), stk: lbNum(1e13), inv: lbNum(1e13), fac: lbNum(1e6), made: lbNum(1e12), disc: lbNum(1e6), runs: lbNum(1e6), props: lbNum(1e6), els: lbNum(1e6),
  og: { '.validate': `newData.val() === 1 && root.child('eco/og/' + $uid).exists()` }, $other: { '.validate': false } } };
const eco = { '.read': ADMIN, '.write': ADMIN, epoch: { '.read': true }, cfg: { '.read': true }, stats: { '.read': true }, bots: { '.read': true }, og: { $uid: { '.read': OWNER_OR_ADMIN('$uid') } }, acct: { $uid: acctRules }, inbox: { $to: inboxRules }, bill: { $uid: billRules }, loan: { $uid: loanRules } };
const world = { '.write': ADMIN, own: houseRules, meta: { '.read': true }, ev: { '.read': true }, home: { '.read': true, $uid: { '.write': `${ADMIN} || (${OWNER('$uid')} && (!newData.exists() || (newData.child('h').isString() && (newData.parent().parent().child('own/' + newData.child('h').val() + '/o').val() === auth.uid || newData.parent().parent().child('own/' + newData.child('h').val() + '/t').val() === auth.uid))))` } },
  lic: { $uid: { '.read': OWNER_OR_ADMIN('$uid'), '.write': `${ADMIN} || (${OWNER('$uid')} && newData.exists() && newData.child('t0').val() === now && newData.parent().parent().parent().child('eco/acct/' + $uid + '/hop').val() === 'lic' && newData.parent().parent().parent().child('eco/acct/' + $uid + '/rev').val() === root.child('eco/acct/' + $uid + '/rev').val() + 1)`, '.validate': `newData.hasChildren(['t0']) && newData.child('t0').isNumber()`, t0: {}, $other: { '.validate': false } } },
  build: { $uid: { '.read': OWNER_OR_ADMIN('$uid'), $bid: { '.write': `${ADMIN} || (${OWNER('$uid')} && !data.exists() && newData.exists() && $bid.matches(/^b[1-3]$/) && newData.child('t').val() === now && now < root.child('world/lic/' + $uid + '/t0').val() + ${cfg('licDays', 30)} * 86400000 && root.child('eco/cfg/builds/' + newData.child('y').val() + '/c').exists() && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/lop').val() === $bid && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/hop').val() === 'bld' && newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/rev').val() === root.child('eco/acct/' + $uid + '/rev').val() + 1 && newData.child('c').val() === newData.parent().parent().parent().parent().child('eco/acct/' + $uid + '/sys/city').val() - root.child('eco/acct/' + $uid + '/sys/city').val() && newData.child('on').val() === newData.parent().parent().parent().parent().child('leaderboard/' + $uid + '/name').val())`,
    '.validate': `!newData.exists() || (newData.hasChildren(['y','t','c','on']) && newData.child('y').isString() && newData.child('t').isNumber() && newData.child('c').isNumber() && newData.child('on').isString())`, y: {}, t: {}, c: {}, on: {}, $other: { '.validate': false } } } },
  req: { '.read': ADMIN, $uid: { '.write': `${OWNER('$uid')} && newData.exists() && newData.child('t').val() === now && (!data.exists() || now > data.child('t').val() + 3600000)`, '.validate': `newData.hasChildren(['t']) && newData.child('t').isNumber()` } } };
const out = { rules: Object.assign({}, base.rules, { players, leaderboard, eco, world }) };
fs.writeFileSync(path.join(__dirname, '..', 'database.rules.json'), JSON.stringify(out, null, 2) + '\n');
console.log('database.rules.json written (' + fs.statSync(path.join(__dirname, '..', 'database.rules.json')).size + ' bytes)');
if(process.env.RULES_DEBUG) fs.writeFileSync('/tmp/acct-clauses.json', JSON.stringify(ACCT_CORE));
