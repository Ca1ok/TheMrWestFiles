#!/usr/bin/env python3
"""WestLab structure pipeline — the batch twin of os/lib/ff.js (same record schema, same shard files).

  PHASE 1  PubChem ingestion       pubchempy → CID, title, IUPAC name, formula, mol. weight, formal charge, isomeric + connectivity SMILES
  PHASE 2  empirical force field   RDKit ETKDG distance geometry (many conformers) → MMFF94 minimisation (UFF if MMFF94 has no parameters)
                                   → potential energy, Gasteiger + MMFF94 partial charges, bond types, interatomic distance matrix
  PHASE 3  persistence             lab-cache/ff/<shard>.json  (database keyed by Hill formula → CID → record), then git add / commit / pull --rebase / push

No quantum chemistry anywhere. Runs on YOUR computer — nothing touches Firebase.

  pip install rdkit pubchempy
  python tools/westlab_pipeline.py Caffeine Aspirin 2244 C2H6O          # names, CIDs or Hill formulas
  python tools/westlab_pipeline.py --file list.txt                      # one per line
  python tools/westlab_pipeline.py --registry                           # every compound the game's registry knows (needs node)
  python tools/westlab_pipeline.py "caffeine=CN1C=NC2=C1C(=O)N(C(=O)N2C)C" --no-push    # name=SMILES skips PubChem (offline test)
Flags: --nconf N (default 40)  --no-commit  --no-push  --branch main  --force (recompute records already in the database)
"""
import argparse, json, math, os, re, subprocess, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_DIR = os.path.join(ROOT, 'lab-cache', 'ff')


def fnv(s):                                              # identical to Phys.fnv / WestFF.fnv in the browser, so both sides pick the same shard file
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return '%08x' % h


def shard_of(hill):
    return fnv(hill)[:2]


# ───────────────────────── PHASE 1 ─────────────────────────
def resolve(item):
    """'Caffeine' | '2519' | 'C8H10N4O2' | 'name=SMILES' → metadata dict (or None)."""
    import pubchempy as pcp
    if '=' in item and not item.startswith('='):
        name, smi = item.split('=', 1)
        return {'cid': 0, 'name': name.strip(), 'iupac': '', 'formula': '', 'mw': 0.0, 'charge': 0, 'smiles': smi.strip(), 'smc': smi.strip(), 'src': 'user'}
    item = item.strip()
    hill = ''
    if item.isdigit():
        cids = [int(item)]
    elif re.fullmatch(r'([A-Z][a-z]?\d*)+', item) and re.search(r'\d|^[A-Z][a-z]?$', item):
        hill = item
        cids = [c.cid for c in pcp.get_compounds(item, 'formula', listkey_count=10)][:10]
    else:
        cids = [c.cid for c in pcp.get_compounds(item, 'name')][:1]
    if not cids:
        return None
    rows = []
    for names in (['Title', 'IUPACName', 'MolecularFormula', 'MolecularWeight', 'Charge', 'SMILES', 'ConnectivitySMILES'],
                  ['Title', 'IUPACName', 'MolecularFormula', 'MolecularWeight', 'Charge', 'IsomericSMILES', 'CanonicalSMILES']):
        try:
            rows = pcp.get_properties(names, cids, 'cid')
        except Exception:
            rows = []
        if rows:
            break
    out = []
    for p in rows:
        smi = p.get('SMILES') or p.get('IsomericSMILES') or p.get('ConnectivitySMILES') or p.get('CanonicalSMILES') or ''
        smc = p.get('ConnectivitySMILES') or p.get('CanonicalSMILES') or smi
        m = {'cid': int(p['CID']), 'name': p.get('Title', ''), 'iupac': p.get('IUPACName', ''), 'formula': p.get('MolecularFormula', ''),
             'mw': float(p.get('MolecularWeight') or 0), 'charge': int(p.get('Charge') or 0), 'smiles': smi, 'smc': smc, 'src': 'pubchem'}
        if smi and (not hill or (m['formula'] == hill and m['charge'] == 0)):
            out.append(m)
    out.sort(key=lambda m: m['cid'])                    # lowest CID = the best-known isomer, same rule as the browser
    time.sleep(0.25)                                    # PubChem: ≤ 5 requests per second
    return out[0] if out else None


# ───────────────────────── PHASE 2 ─────────────────────────
def hill_of(symbols):
    c = {}
    for s in symbols:
        c[s] = c.get(s, 0) + 1
    keys = sorted(k for k in c if k not in ('C', 'H')) if 'C' in c else sorted(c)
    order = (['C'] + (['H'] if 'H' in c else []) + keys) if 'C' in c else keys
    return ''.join(k + (str(c[k]) if c[k] > 1 else '') for k in order)


PYK = {'C': (.75, .67, .60), 'N': (.71, .60, .54), 'O': (.63, .57, .53), 'F': (.64, .59, .53), 'P': (1.11, 1.02, .94), 'S': (1.03, .94, .95), 'Cl': (.99, .95, .93), 'Br': (1.14, 1.09, 1.10),
       'I': (1.33, 1.29, 1.29), 'Si': (1.16, 1.07, 1.00), 'B': (.85, .78, .73), 'Se': (1.16, 1.07, 1.07), 'As': (1.19, 1.14, 1.06)}
PEN = {'H': 2.20, 'C': 2.55, 'N': 3.04, 'O': 3.44, 'F': 3.98, 'P': 2.19, 'S': 2.58, 'Cl': 3.16, 'Br': 2.96, 'I': 2.66, 'Si': 1.90, 'B': 2.04, 'Se': 2.55, 'As': 2.18}
TOL = 0.14


def bond_dev(mol, xyz):
    """Largest miss of any heavy-atom bond vs Pyykkö radii + Schomaker–Stevenson shortening (MMFF94 is organic-only: it puts CO2 at C–O 1.41 Å)."""
    from rdkit import Chem
    w = 0.0
    for bd in mol.GetBonds():
        i, j = bd.GetBeginAtomIdx(), bd.GetEndAtomIdx()
        ea, eb = mol.GetAtomWithIdx(i).GetSymbol(), mol.GetAtomWithIdx(j).GetSymbol()
        if ea not in PYK or eb not in PYK:
            continue
        t = 1.5 if bd.GetIsAromatic() else {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}.get(bd.GetBondType(), 1)
        if t == 1 and ea == eb and ea in 'NOF':
            continue
        rad = lambda e, k: PYK[e][min(k, 3) - 1]
        ex = (rad(ea, 1) + rad(ea, 2) + rad(eb, 1) + rad(eb, 2)) / 2 if t == 1.5 else rad(ea, int(t)) + rad(eb, int(t))
        ex -= 0.09 * abs(PEN[ea] - PEN[eb])
        w = max(w, abs(math.dist(xyz[i], xyz[j]) - ex))
    return w


def fragment(smi, nconf, seed=42):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    m0 = Chem.MolFromSmiles(smi)
    if m0 is None:
        return None
    mol = Chem.AddHs(m0)
    if mol.GetNumAtoms() == 1:
        return dict(mol=mol, xyz=[[0.0, 0.0, 0.0]], E=0.0, conv=1, tier='atom', ff=None, nconf=1, cid=-1, warn=0, dev=0.0)
    ps = AllChem.ETKDGv3()
    ps.randomSeed = seed
    ps.useRandomCoords = True                            # robust for odd inorganics; still distance geometry
    ids = list(AllChem.EmbedMultipleConfs(mol, numConfs=nconf, params=ps))
    if not ids:
        return None
    best, ff_name, warn = None, None, 0
    xyz_of = lambda m, c: [[m.GetConformer(c).GetAtomPosition(i).x, m.GetConformer(c).GetAtomPosition(i).y, m.GetConformer(c).GetAtomPosition(i).z] for i in range(m.GetNumAtoms())]
    def run(kind):
        m2 = Chem.Mol(mol)
        r = (AllChem.MMFFOptimizeMoleculeConfs if kind == 'MMFF94' else AllChem.UFFOptimizeMoleculeConfs)(m2, maxIters=20000, numThreads=0)
        k = sorted(range(len(r)), key=lambda i: (r[i][0] != 0, r[i][1]))[0]
        return m2, r, bond_dev(m2, xyz_of(m2, ids[k]))
    res = None
    cands = []
    if AllChem.MMFFHasAllMoleculeParams(mol):
        cands.append(('MMFF94',) + run('MMFF94'))
    if not cands or cands[0][3] > TOL:                       # MMFF94 missing or geometrically off → try UFF (covers the whole periodic table)
        try:
            cands.append(('UFF',) + run('UFF'))
        except Exception:
            pass
    if cands:
        ff_name, mol, res, dev = min(cands, key=lambda c: c[3]) if cands[0][3] > TOL else cands[0]
        warn = 1 if dev > TOL else 0
    if res:
        rank = sorted(range(len(res)), key=lambda i: (res[i][0] != 0, res[i][1]))   # converged first, then lowest energy
        best = rank[0]
        E, conv = float(res[best][1]), 1 if res[best][0] == 0 else 0
        tier = 'ff'
    else:
        best, E, conv, tier = 0, None, 0, 'embed'
    cid = ids[best]
    conf = mol.GetConformer(cid)
    xyz = [[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z] for i in range(mol.GetNumAtoms())]
    return dict(mol=mol, xyz=xyz, E=E, conv=conv, tier=tier, ff=ff_name, nconf=len(ids), cid=cid, warn=warn, dev=bond_dev(mol, xyz) if tier != 'atom' else 0.0)


def build(meta, nconf=40):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    parts = [s for s in (meta['smiles'] or meta['smc']).split('.') if s]
    a, b, xyz, fi, gq, qp, fc = [], [], [], [], [], [], []
    E, conv, tier, ffn, nconf_used, anyE, off, x0, dev, warn = 0.0, 1, 'ff', None, 0, False, 0, 0.0, 0.0, 0
    for k, s in enumerate(parts):
        g = fragment(s, nconf)
        if g is None:
            return None
        mol = g['mol']
        n = mol.GetNumAtoms()
        # partial charges (Gasteiger works for everything RDKit has parameters for; MMFF94 charges only when MMFF94 applies)
        AllChem.ComputeGasteigerCharges(mol)
        q = [float(mol.GetAtomWithIdx(i).GetProp('_GasteigerCharge')) for i in range(n)]
        q = [v if math.isfinite(v) else 0.0 for v in q]
        mp = AllChem.MMFFGetMoleculeProperties(mol) if g['ff'] == 'MMFF94' else None
        gq += q
        qp += ([mp.GetMMFFPartialCharge(i) for i in range(n)] if mp else [None] * n)
        cx = [sum(p[i] for p in g['xyz']) / n for i in range(3)]
        r = max(math.dist(p, cx) for p in g['xyz'])
        shift = (0.0 if k == 0 else x0 + r + 3.0) if len(parts) > 1 else 0.0
        if len(parts) > 1:
            x0 = shift + r
        for p in g['xyz']:
            xyz.append([p[0] - cx[0] + shift, p[1] - cx[1], p[2] - cx[2]])
        for i in range(n):
            at = mol.GetAtomWithIdx(i)
            a.append(at.GetSymbol())
            fi.append(k)
            if at.GetFormalCharge():
                fc.append([off + i, at.GetFormalCharge()])
        for bd in mol.GetBonds():
            t = 1.5 if bd.GetIsAromatic() else {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}.get(bd.GetBondType(), 1)
            b.append([off + bd.GetBeginAtomIdx(), off + bd.GetEndAtomIdx(), t])
        off += n
        if g['tier'] == 'ff':
            E += g['E']; anyE = True; ffn = g['ff']
        elif g['tier'] == 'embed':
            tier, E = 'embed', None
        conv = conv and g['conv']
        dev, warn = max(dev, g['dev']), warn or g['warn']
        nconf_used = max(nconf_used, g['nconf'])
    hill = hill_of(a)
    if meta['formula'] and meta['formula'] != hill:
        return None                                       # must reproduce PubChem's own formula
    if tier != 'embed':
        tier = 'ff' if anyE else 'atom'
    if E is None or not anyE:
        E = 0.0 if tier == 'atom' else None
    n = len(a)
    D = []
    for i in range(n):
        for j in range(i + 1, n):
            D.append(round(math.dist(xyz[i], xyz[j]) * 100) if fi[i] == fi[j] else -1)
    rec = {'v': 1, 'cid': meta['cid'], 'hill': hill, 'n': meta['name'], 'iupac': meta['iupac'], 'smi': meta['smiles'], 'smc': meta['smc'], 'mw': meta['mw'],
           'chg': int(sum(c for _, c in fc)), 'tier': tier, 'ff': ffn if tier == 'ff' else None, 'E': None if E is None else round(E, 3), 'conv': 1 if conv else 0, 'nconf': nconf_used,
           'a': a, 'b': b, 'q': [round(v, 4) for v in gq], 'qm': 'Gasteiger', 'xyz': [[round(v, 3) for v in p] for p in xyz], 'D': D,
           'eng': 'rdkit ' + __import__('rdkit').__version__, 'src': 'python', 't': int(time.time() * 1000)}
    if any(v is not None for v in qp):
        rec['qp'] = [None if v is None else round(v, 4) for v in qp]
    rec['dev'] = round(dev, 3)
    if warn:
        rec['warn'] = 1
    if fc:
        rec['fc'] = fc
    if len(parts) > 1:
        rec['ion'] = 1
        rec['fr'] = fi
    return rec


# ───────────────────────── PHASE 3 ─────────────────────────
def shard_path(hill):
    return os.path.join(DB_DIR, shard_of(hill) + '.json')


def load_shard(hill):
    p = shard_path(hill)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    return {}


def write_records(recs):
    """Merge records into their shard files (sorted keys → stable, diff-friendly commits). Returns the touched files."""
    by = {}
    for r in recs:
        by.setdefault(shard_of(r['hill']), []).append(r)
    touched = []
    os.makedirs(DB_DIR, exist_ok=True)
    for sh, rs in by.items():
        p = os.path.join(DB_DIR, sh + '.json')
        db = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
        for r in rs:
            ent = db.setdefault(r['hill'], {})
            old = ent.get(str(r['cid']))
            if old and not (old['tier'] != 'ff' and r['tier'] == 'ff') and not (old['tier'] == 'ff' and r['tier'] == 'ff' and r['E'] < old['E'] - 0.001):
                continue                                   # keep the lower-energy conformer; upgrade an embed-only record when a force-field one arrives
            ent[str(r['cid'])] = r
        db = {h: {c: db[h][c] for c in sorted(db[h], key=lambda x: int(x))} for h in sorted(db)}
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(db, f, separators=(',', ':'), ensure_ascii=False)
        touched.append(p)
    return touched


def git(*args, check=True):
    return subprocess.run(['git', '-C', ROOT, *args], check=check, capture_output=True, text=True)


def commit_push(recs, branch, push=True):
    msg = 'WestLab FF cache: +%d compound%s (python)' % (len(recs), '' if len(recs) == 1 else 's')
    for attempt in range(4):
        try:
            git('pull', '--rebase', '--autostash', 'origin', branch)
        except subprocess.CalledProcessError as e:
            print('  git pull failed:', (e.stderr or '').strip()[:200]); return False
        files = write_records(recs)                       # merged into whatever the remote now holds → no JSON merge conflicts, ever
        git('add', *[os.path.relpath(f, ROOT) for f in files])
        if git('diff', '--cached', '--quiet', check=False).returncode == 0:
            print('  nothing new to commit'); return True
        git('commit', '-m', msg)
        if not push:
            print('  committed locally (--no-push)'); return True
        r = git('push', 'origin', 'HEAD:' + branch, check=False)
        if r.returncode == 0:
            print('  pushed:', msg); return True
        git('reset', '--hard', 'HEAD~1')                  # somebody pushed first → drop our commit, re-merge on top of theirs, try again
        time.sleep(1 + attempt)
    print('  push failed after 4 attempts'); return False


def registry_hills():
    js = ("const L=require('./.github/scripts/westlab-loader.js')('.');const C=L.Chem;C.init&&C.init();"
          "console.log(JSON.stringify(C.registryList().map(r=>C.speciesOf(r.formula)).filter(s=>s&&s.kind==='compound').map(s=>C.hill(s.comp))));")
    return sorted(set(json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('items', nargs='*')
    ap.add_argument('--file'); ap.add_argument('--registry', action='store_true')
    ap.add_argument('--nconf', type=int, default=40); ap.add_argument('--branch', default='main')
    ap.add_argument('--no-commit', action='store_true'); ap.add_argument('--no-push', action='store_true'); ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    items = list(a.items)
    if a.file:
        items += [l.strip() for l in open(a.file, encoding='utf-8') if l.strip() and not l.startswith('#')]
    if a.registry:
        items += registry_hills()
    if not items:
        ap.print_help(); return 1
    done, skipped, failed = [], 0, []
    for k, it in enumerate(items, 1):
        try:
            meta = resolve(it)
            if not meta:
                print('[%d/%d] %-18s not found on PubChem' % (k, len(items), it)); failed.append(it); continue
            if not a.force and meta['cid'] and str(meta['cid']) in load_shard(meta['formula']).get(meta['formula'], {}):
                skipped += 1; print('[%d/%d] %-18s already in the database (CID %d)' % (k, len(items), it, meta['cid'])); continue
            rec = build(meta, a.nconf)
            if not rec:
                print('[%d/%d] %-18s could not be built (formula check / force field failed)' % (k, len(items), it)); failed.append(it); continue
            done.append(rec)
            print('[%d/%d] %-18s CID %-8s %-12s %s  E=%s kcal/mol  %d atoms' % (k, len(items), it, rec['cid'], rec['hill'], rec['ff'] or rec['tier'], rec['E'], len(rec['a'])))
        except Exception as e:
            print('[%d/%d] %-18s ERROR %s' % (k, len(items), it, e)); failed.append(it)
    if done:
        if a.no_commit:
            write_records(done); print('wrote %d record(s); not committed (--no-commit)' % len(done))
        else:
            commit_push(done, a.branch, push=not a.no_push)
    print('done: %d new, %d already known, %d failed' % (len(done), skipped, len(failed)))
    return 0 if not failed else 2


if __name__ == '__main__':
    sys.exit(main())
