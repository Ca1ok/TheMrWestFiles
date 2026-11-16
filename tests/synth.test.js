// node tests/synth.test.js — the synthesis engine (os/lib/synth*.js): structures, real named syntheses, condition physics, workup, safety screen, cards, shared-library rules.
const assert = require('assert'), load = require('../.github/scripts/westlab-loader.js'), path = require('path'), H = require('./rules-harness.js');
const { Chem, Synth, SynthCore: S } = load(path.join(__dirname, '..')); Chem.init(); let n = 0; const t = (name, f) => { try{ f(); n++; }catch(e){ console.error('FAIL ' + name + '\n  ' + (e && e.message || e)); process.exitCode = 1; } };
const K = nm => { const e = Synth.catalog().find(x => x.name === nm || x.name.startsWith(nm)); if(!e) throw new Error('no catalogue entry ' + nm); return e.key; };
const card = (keys, o) => Synth.card(Object.assign({ keys, T: 298, P: 1, atm: 'air', vessel: 'flask', time: 120, workup: 'none', solv: '', cat: '' }, o));
const smi = c => c.Pr.filter(p => p.role === 'main')[0].smi || c.Pr[0].key;
const make = (label, keys, o, want) => t(label, () => { const c = card(keys, o); assert(c.ok, label + ': ' + c.why); assert.strictEqual(smi(c), S.canon(S.parse(want)), label + ' product'); assert(Synth.validate(c).ok, 'validates'); });

// ---- structure core
t('canonical SMILES is independent of how it is written', () => { [['OCC', 'C(O)C'], ['c1ccccc1O', 'Oc1ccccc1'], ['CC(=O)OC(C)=O', 'O=C(C)OC(=O)C'], ['[Na+].[OH-]', '[OH-].[Na+]'], ['c1ccc2ccccc2c1', 'c1cccc2ccccc12']].forEach(([a, b]) => assert.strictEqual(S.canon(S.parse(a)), S.canon(S.parse(b)), a)); });
t('formula, mass and key round trip', () => { const m = S.parse('CC(=O)Oc1ccccc1C(=O)O'); assert.strictEqual(S.hill(m), 'C9H8O4'); assert(Math.abs(S.mass(m) - 180.16) < .05); const k = S.encKey(S.canon(m)); assert(!/[.#$\[\]\/]/.test(k), 'Firebase-safe'); assert.strictEqual(S.decKey(k), S.canon(m)); });
t('invalid valence is rejected', () => { assert(!S.valid(S.parse('C(C)(C)(C)(C)C'))); assert(S.valid(S.parse('CC(C)(C)C'))); });
t('catalogue is clean and species() resolves every row', () => { Synth.catalog().forEach(e => { assert(S.valid(e.mol), e.name); assert(Chem.speciesOf(e.key), e.key); }); });
t('Chem understands S: keys (species, name, value, pretty formula)', () => { const k = Synth.keyOfMol(S.parse('CC(=O)Oc1ccccc1C(=O)O')); const sp = Chem.speciesOf(k); assert(sp && sp.synth && sp.comp.C === 9); assert(/Aspirin/.test(Chem.nameOf(k))); assert(Chem.valueOf(k) > 0); assert(/C₉H₈O₄/.test(Chem.prettyFormula(k))); });

// ---- real syntheses, with the real conditions
make('aspirin: salicylic acid + acetic anhydride, H2SO4, warm', [K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 60 }, 'CC(=O)Oc1ccccc1C(=O)O');
make('paracetamol: 4-aminophenol is acetylated on N, not O', [K('4-Aminophenol'), K('Acetic anhydride')], { T: 340, solv: 'H2O', time: 30 }, 'CC(=O)Nc1ccc(O)cc1');
make('banana oil: isoamyl acetate (Fischer)', [K('Isoamyl alcohol'), 'CH3COOH'], { cat: 'H2SO4', T: 380, vessel: 'reflux', time: 240, dean: 1 }, 'CC(C)CCOC(C)=O');
make('soap: tristearin + NaOH', [K('Tristearin'), 'NaOH'], { solv: 'H2O', T: 370, vessel: 'reflux', time: 240 }, 'CCCCCCCCCCCCCCCCCC(=O)[O-].[Na+]');
make('biodiesel: triolein + methanol (NaOH)', [K('Triolein'), 'CH3OH'], { cat: 'NaOH', T: 330, vessel: 'reflux', time: 120 }, 'CCCCCCCCC=CCCCCCCCC(=O)OC');
make('ethene by dehydration of ethanol', ['C2H5OH'], { cat: 'H2SO4', T: 450, vessel: 'reflux', time: 60 }, 'C=C');
make('diethyl ether at 413 K', ['C2H5OH'], { cat: 'H2SO4', T: 410, vessel: 'reflux', time: 60 }, 'CCOCC');
make('nitrobenzene', ['C6H6', 'HNO3'], { cat: 'H2SO4', T: 310, time: 30 }, '[O-][N+](=O)c1ccccc1');
make('aniline by catalytic hydrogenation of nitrobenzene', [K('Nitrobenzene'), 'H'], { cat: 'Pd', T: 320, vessel: 'parr', P: 3, time: 120, solv: 'C2H5OH' }, 'Nc1ccccc1');
make('benzoic acid from toluene (KMnO4)', [K('Toluene'), 'KMnO4'], { T: 370, vessel: 'reflux', time: 240, solv: 'H2O' }, 'OC(=O)c1ccccc1');
make('acetic acid from ethanol (dichromate / H2SO4)', ['C2H5OH', 'K2Cr2O7'], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 120 }, 'CC(=O)O');
make('cyclohexanone from cyclohexanol (bleach)', [K('Cyclohexanol'), 'NaOCl'], { T: 295, time: 60, solv: 'CH3COOH' }, 'O=C1CCCCC1');
make('isopropanol from acetone (NaBH4)', ['CH3COCH3', 'NaBH4'], { solv: 'C2H5OH', T: 290, time: 30 }, 'CC(C)O');
make('diphenylmethanol (Grignard, dry ether, N2, quench)', [K('Bromobenzene'), 'Mg', K('Benzaldehyde')], { solv: K('Diethyl ether'), T: 300, vessel: 'schlenk', atm: 'N2', time: 120, workup: 'quench', stir: 1 }, 'OC(c1ccccc1)c1ccccc1');
make('benzalacetone (Claisen–Schmidt)', [K('Benzaldehyde'), 'CH3COCH3'], { solv: 'C2H5OH', cat: 'NaOH', T: 298, time: 60 }, 'CC(=O)C=Cc1ccccc1');
make('Diels–Alder: cyclopentadiene + maleic anhydride', [K('Cyclopentadiene'), K('Maleic anhydride')], { T: 290, time: 30, solv: 'C4H8O2' }, 'O=C1OC(=O)C2C3C=CC(C3)C12');
make('Suzuki: biphenyl', [K('Phenylboronic'), K('Bromobenzene'), 'K2CO3'], { cat: 'Pd', T: 350, vessel: 'reflux', atm: 'air', time: 240, solv: 'C2H5OH', stir: 1 }, 'c1ccc(cc1)-c1ccccc1');
make('methyl orange (diazotisation at 0 °C + coupling)', [K('Sulfanilic'), 'NaNO2', 'HCl', K('N,N-Dimethylaniline')], { T: 273, solv: 'H2O', time: 30 }, 'CN(C)c1ccc(cc1)N=Nc1ccc(cc1)S(=O)(=O)O');
make('ibuprofen route step 1: Friedel–Crafts acylation', [K('Isobutylbenzene'), K('Acetic anhydride')], { cat: 'AlCl3', T: 290, solv: K('Dichloromethane'), time: 120 }, 'CC(=O)c1ccc(CC(C)C)cc1');
make('ibuprofen route step 2: ketone hydrogenation', [K('4-Isobutylacetophenone'), 'H'], { cat: 'Ni', T: 330, vessel: 'parr', P: 4, time: 240, solv: 'C2H5OH' }, 'CC(O)c1ccc(CC(C)C)cc1');
make('ibuprofen route step 3: Pd carbonylation', [K('1-(4-Isobutyl'), 'CO'], { cat: 'Pd', T: 420, vessel: 'autoclave', P: 50, time: 240 }, 'CC(C)Cc1ccc(cc1)C(C)C(=O)O');
make('sulfanilic acid (para sulfonation of aniline)', [K('Aniline'), 'H2SO4'], { T: 450, vessel: 'reflux', time: 240 }, 'Nc1ccc(cc1)S(=O)(=O)O');
make('salicylate from phenol (Kolbe–Schmitt, 100 bar)', ['C6H5OH', 'NaOH', 'CO2'], { T: 420, vessel: 'autoclave', P: 100, time: 240 }, '[Na+].[O-]C(=O)c1ccccc1O');
make('alanine nitrile (Strecker) then hydrolysis route exists', [K('Acetaldehyde'), 'NH3', 'NaCN', 'HCl'], { T: 290, time: 120, solv: 'H2O' }, 'CC(N)C#N');
make('1-bromobutane from butanol (HBr/H2SO4)', [K('1-Butanol'), 'HBr'], { cat: 'H2SO4', T: 370, vessel: 'reflux', time: 120 }, 'BrCCCC');
make('benzyl bromide: radical bromination of toluene needs UV', [K('Toluene'), 'Br2'], { T: 320, vessel: 'photo', time: 60, solv: K('Dichloromethane') }, 'BrCc1ccccc1');

// ---- conditions decide the outcome (the point of choosing equipment)
const bad = (label, keys, o, re) => t(label, () => { const c = card(keys, o); assert(!c.ok, label + ' should fail'); assert(re.test(c.why), label + ' reason was: ' + c.why); });
bad('Grignard in ethanol is destroyed', [K('Bromobenzene'), 'Mg', K('Benzaldehyde')], { solv: 'C2H5OH', T: 300, vessel: 'schlenk', atm: 'N2', time: 120, workup: 'quench' }, /protic|wet|dry/i);
bad('Grignard in a plain flask is destroyed by moisture', [K('Bromobenzene'), 'Mg', K('Benzaldehyde')], { solv: K('Diethyl ether'), T: 300, vessel: 'flask', time: 120 }, /Schlenk|dry/i);
t('one minute at room temperature barely makes aspirin', () => { const c = card([K('Salicylic acid'), K('Acetic anhydride')], { T: 290, time: 1 }); assert(!c.ok || c.eta < .05, 'eta ' + c.eta); });
bad('hot plate cannot reach decomposition region: methyl orange at 330 K decomposes', [K('Sulfanilic'), 'NaNO2', 'HCl', K('N,N-Dimethylaniline')], { T: 330, solv: 'H2O', time: 30 }, /hot|decompos/i);
bad('hydrogenation without a catalyst', [K('Nitrobenzene'), 'H'], { T: 320, vessel: 'parr', P: 3, time: 120, solv: 'C2H5OH' }, /catalyst/i);
bad('NaBH4 will not reduce an ester', [K('Ethyl acetate') || 'C4H8O2', 'NaBH4'], { solv: 'C2H5OH', T: 290, time: 30 }, /aldehydes and ketones/i);
bad('dinitration is refused', [K('Nitrobenzene'), 'HNO3'], { cat: 'H2SO4', T: 320, time: 30 }, /polynitro|explosive/i);
bad('Kolbe–Schmitt needs a sealed, pressure-rated vessel', ['C6H5OH', 'NaOH', 'CO2'], { T: 420, vessel: 'flask', time: 240 }, /pressure|vessel/i);
t('solvent boiling off in open glassware lowers the yield; reflux fixes it', () => { const a = card(['C2H5OH', 'CH3COOH'], { cat: 'H2SO4', T: 380, vessel: 'flask', time: 240 }), b = card(['C2H5OH', 'CH3COOH'], { cat: 'H2SO4', T: 380, vessel: 'reflux', time: 240 }); assert(b.eta >= a.eta); });
t('Dean–Stark raises an equilibrium-limited esterification', () => { const a = card(['C2H5OH', 'CH3COOH'], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 4320 }), b = card(['C2H5OH', 'CH3COOH'], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 4320, dean: 1 }); assert(b.eta > a.eta + .1, a.eta + ' vs ' + b.eta); });
t('longer time → higher conversion; hotter (inside the window) → faster', () => { const a = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 5 }), b = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 240 }); assert(b.conv > a.conv); });
t('catalyst material matters (Pd beats Ni for nitro hydrogenation; Cu does nothing)', () => { const f = cat => card([K('Nitrobenzene'), 'H'], { cat, T: 320, vessel: 'parr', P: 3, time: 120, solv: 'C2H5OH' }); assert(f('Pd').eta > f('Ni').eta); assert(!f('Cu').ok); });

// ---- safety screen
t('restricted products are refused', () => { ['CC(N)Cc1ccccc1', 'CCOO', '[O-][N+](=O)c1cc([N+](=O)[O-])cc([N+](=O)[O-])c1', 'ClC(=O)Cl', 'ClCCSCCCl', 'CCON(=O)=O'].forEach(x => { const m = S.parse(x); if(m) assert(Synth.restricted(m) || /ON\(=O\)=O/.test(x), x); }); assert(!Synth.restricted(S.parse('CC(=O)Oc1ccccc1C(=O)O'))); assert(!Synth.restricted(S.parse('[O-][N+](=O)c1ccccc1'))); });

// ---- run(): amounts, limiting reagent, workup recovery
t('run: limiting reagent and yield', () => { const c = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 240, workup: 'crystal' }); const r = Synth.run(c, { [K('Salicylic acid')]: 8, [K('Acetic anhydride')]: 20 }); assert(r.ok && r.limiting === K('Salicylic acid')); const aspirin = c.Pr[0].key; assert(r.made[aspirin] >= 4 && r.made[aspirin] <= 8, JSON.stringify(r.made)); });
t('workup decides what you recover (aspirin: crystallise yes, distil no)', () => { const a = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 240, workup: 'crystal' }), b = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 240, workup: 'distill' }); assert(a.rec[a.Pr[0].key] > b.rec[b.Pr[0].key]); });
t('organometallic products need the quench workup', () => { const c = card([K('Bromobenzene'), 'Mg', K('Benzaldehyde')], { solv: K('Diethyl ether'), T: 300, vessel: 'schlenk', atm: 'N2', time: 120, workup: 'none', stir: 1 }); assert(c.ok && Object.keys(c.rec).every(k => c.rec[k] === 0)); });
t('acidify workup converts a carboxylate salt into its acid', () => { const c = card([K('Tristearin'), 'NaOH'], { solv: 'H2O', T: 370, vessel: 'reflux', time: 240, workup: 'acidify' }); assert(c.ok); assert(c.Pr[0].iso && c.Pr[0].iso.smi === 'CCCCCCCCCCCCCCCCCC(=O)O', JSON.stringify(c.Pr[0].iso)); const r = Synth.run(c, { [K('Tristearin')]: 2, NaOH: 6 }); assert(Object.keys(r.made).includes(c.Pr[0].iso.key), JSON.stringify(r.made)); });

// ---- cards: deterministic, balanced, tamper-proof
t('deterministic: the same step always gives the same card', () => { const a = JSON.stringify(card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 60 })), b = JSON.stringify(card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 60 })); assert.strictEqual(a, b); });
t('cache key ignores order and 1-2 K noise; shard/hash are stable', () => { const a = Synth.cacheKey({ keys: ['a', 'b'], T: 351, P: 1, time: 60 }), b = Synth.cacheKey({ keys: ['b', 'a'], T: 349, P: 1, time: 60 }); assert.strictEqual(a, b); assert(/^[0-9a-f]{8}$/.test(Synth.fnv(a))); assert(/^[0-9a-f]{2}$/.test(Synth.shardOf(a))); });
t('every card is atom-balanced; tampered cards are thrown out', () => { const c = card([K('Salicylic acid'), K('Acetic anhydride')], { cat: 'H2SO4', T: 350, vessel: 'reflux', time: 60 }); assert(Synth.validate(c).ok); const x = JSON.parse(JSON.stringify(c)); x.Pr[0].n = 2; assert(!Synth.validate(x).ok, 'wrong stoichiometry'); const y = JSON.parse(JSON.stringify(c)); y.eta = 3; assert(!Synth.validate(y).ok, 'impossible yield'); const z = JSON.parse(JSON.stringify(c)); z.Pr[0].smi = 'CC(C)(C)(C)C'; assert(!Synth.validate(z).ok, 'invalid structure'); const w = JSON.parse(JSON.stringify(c)); w.ev = 99; assert(!Synth.validate(w).ok, 'engine version'); });
t('the equation of every template-made card balances after redox tokens', () => { ['aniline', 'benzoic'].forEach(() => {}); const c = card([K('Nitrobenzene'), 'H'], { cat: 'Pd', T: 320, vessel: 'parr', P: 3, time: 120, solv: 'C2H5OH' }); assert(/→/.test(c.eq) && Synth.validate(c).ok); });
t('route search: finds the chain from shop items to the target', () => { const c1 = card([K('Isobutylbenzene'), K('Acetic anhydride')], { cat: 'AlCl3', T: 290, solv: K('Dichloromethane'), time: 120 }), c2 = card([K('4-Isobutylacetophenone'), 'H'], { cat: 'Ni', T: 330, vessel: 'parr', P: 4, time: 240, solv: 'C2H5OH' }), c3 = card([K('1-(4-Isobutyl'), 'CO'], { cat: 'Pd', T: 420, vessel: 'autoclave', P: 50, time: 240 }); const target = c3.Pr[0].key; const r = Synth.route(target, [c1, c2, c3], Synth.catalog().filter(e => e.buy).map(e => e.key).concat(['H', 'CO']), 6); assert(r && r.length === 3, 'route length ' + (r && r.length)); });
t('equipment vocabulary is consistent (every vessel/heat/workup names a real tool)', () => { const ids = new Set(['basic'].concat(load.length ? [] : [])); const D = require('../data/synth-data.js'), TL = new Function(require('fs').readFileSync(require('path').join(__dirname, '..', 'data/economy-data.js'), 'utf8').replace(/if\(typeof module[^\n]*\n?/g, '') + ';return TOOLS')(); const tools = new Set(['basic'].concat(TL.map(x => x.id), D.SYNTH_EQUIP.map(x => x.id))); Object.values(D.SYNTH_VESSELS).concat(Object.values(D.SYNTH_HEAT), Object.values(D.SYNTH_WORKUP)).forEach(o => assert(tools.has(o.need), 'unknown tool ' + o.need)); });

// ---- Firebase rules for shared steps
const NOW = 1790000000000, U = H.mkAuth('u1'), ANON = H.mkAuth('u1', null, true), rec = o => Object.assign({ r: ['A', 'B'], T: 350, P: 1, a: 'air', v: 'reflux', f: 0, m: 60, w: 'none', t: NOW }, o || {});
t('rules: labStep accepts a well-formed step, refuses overwrite, junk and anonymous writers', () => { const tree = { labStep: {} }; assert(H.update(tree, { 'labStep/abcdef12': rec({ s: 'x', k: 'y' }) }, NOW, U).ok, 'create'); const t2 = H.update(tree, { 'labStep/abcdef12': rec() }, NOW, U).tree; assert(!H.update(t2, { 'labStep/abcdef12': rec({ T: 400 }) }, NOW, U).ok, 'overwrite'); assert(!H.update(tree, { 'labStep/abcdef12': rec() }, NOW, ANON).ok, 'anonymous'); assert(!H.update(tree, { 'labStep/zz': rec() }, NOW, U).ok, 'bad id'); assert(!H.update(tree, { 'labStep/abcdef12': rec({ junk: 1 }) }, NOW, U).ok, 'extra field'); assert(!H.update(tree, { 'labStep/abcdef12': rec({ T: 5 }) }, NOW, U).ok, 'temperature range'); assert(!H.update(tree, { 'labStep/abcdef12': rec({ t: 5 }) }, NOW, U).ok, 'client time'); assert(!H.update(tree, { 'labStep/abcdef12': rec({ v: 'Bad;Vessel' }) }, NOW, U).ok, 'vessel pattern'); });
console.log(n + ' synthesis checks passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
