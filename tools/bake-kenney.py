#!/usr/bin/env python3
"""Bake the Kenney asset library (assets/kenney/) into what the REALWORLD engine can draw (assets/world/kenney/).

Why: the realworld shader is vertex-colour only (no textures), but Kenney's models take their colour from a small palette texture
(`colormap.png`, one UV per vertex). So every model is converted ONCE here:
  * the palette is sampled at each vertex's UV -> an sRGB vertex colour (the palette swatches are gradients, so the baked shading survives)
  * node transforms are applied, the model is turned so its FRONT faces -Z (north, the engine's convention), scaled to metres, centred on x/z, sitting on y = 0
  * a second, lower-detail model (LOD 1) is made by vertex clustering (colour-aware, so windows/doors/roofs stay separate colours)
  * buildings get their DOOR position detected (lateral x + the front plane) so doors/interiors line up with the model
  * the output is a tiny uncompressed .glb with interleaved POSITION f32x3 | NORMAL i8x3 | COLOR_0 u8x4 (= the engine's own 20-byte vertex), flagged
    `asset.extras.rwSrgb` so os/realworld/glb.js reads the colours as sRGB and keeps the alpha byte (255 normal, 128 glow, 200+n = actor body part n)
  * assets/world/manifest.json is (re)written with everything below plus the credit.

Run from the repo root:   python3 tools/bake-kenney.py            (needs Pillow + numpy; only a maintainer ever runs it, the site needs none of this)
Models: Kenney (www.kenney.nl), CC0 1.0 - see assets/kenney/CREDITS.md
"""
import json, math, os, struct, sys
import numpy as np
from PIL import Image

LIB = 'assets/kenney'
OUT = 'assets/world'
BAKED = OUT + '/kenney'
GLB = 'Models/GLB format'
FURN = 'Models/GLTF format'
CREDIT = 'Models by Kenney (www.kenney.nl), Creative Commons CC0 1.0. Baked for WestOS by tools/bake-kenney.py.'

# ------------------------------------------------------------------ reading glb
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read(); off = 12; js = None; bn = None
    while off + 8 <= len(b):
        ln, tp = struct.unpack('<II', b[off:off + 8])
        if tp == 0x4E4F534A: js = json.loads(b[off + 8:off + 8 + ln])
        elif tp == 0x004E4942 and bn is None: bn = b[off + 8:off + 8 + ln]
        off += 8 + ln + ((4 - ln % 4) % 4)
    return js, np.frombuffer(bn, dtype=np.uint8)


def accessor(js, raw, i):
    a = js['accessors'][i]; v = js['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
    st = v.get('byteStride') or dt.itemsize * nc; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = np.empty((a['count'], nc), dtype=np.float64)
    for c in range(nc):
        base = o + np.arange(a['count']) * st + c * dt.itemsize
        out[:, c] = np.stack([raw[base + k] for k in range(dt.itemsize)], axis=1).copy().view(dt).reshape(-1)
    if a.get('normalized') and a['componentType'] != 5126:
        out = np.maximum(out / {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[a['componentType']], -1)
    return out


def node_matrix(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1]); x, y, z, w = q
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M


class Model:
    """merged triangles of one .glb with sRGB vertex colours; `part` = per-vertex group id (character body parts)"""
    def __init__(self, pos, nrm, col, idx, part=None):
        self.pos, self.nrm, self.col, self.idx = pos, nrm, col, idx
        self.part = np.zeros(len(pos), np.int32) if part is None else part

    def copy(self): return Model(self.pos.copy(), self.nrm.copy(), self.col.copy(), self.idx.copy(), self.part.copy())
    @property
    def tris(self): return len(self.idx) // 3
    def bbox(self): return self.pos.min(0), self.pos.max(0)


def load_model(rel, part_of=None):
    path = os.path.join(LIB, rel); js, raw = read_glb(path)
    scene = js['scenes'][js.get('scene', 0)]['nodes'] if js.get('scenes') else list(range(len(js['nodes'])))
    tex_cache = {}; P = []; N = []; C = []; I = []; G = []; off = 0

    def texture(mi):
        if mi in tex_cache: return tex_cache[mi]
        t = None
        bt = ((js['materials'][mi] if mi is not None else {}).get('pbrMetallicRoughness') or {}).get('baseColorTexture')
        if bt is not None:
            img = js['images'][js['textures'][bt['index']]['source']]
            t = np.array(Image.open(os.path.join(os.path.dirname(path), img['uri'])).convert('RGBA'))
        tex_cache[mi] = t; return t

    def visit(ni, parent, chain):
        nonlocal off
        n = js['nodes'][ni]; W = parent @ node_matrix(n); chain = chain + [n.get('name', '')]
        if 'mesh' in n:
            for pr in js['meshes'][n['mesh']]['primitives']:
                if pr.get('mode', 4) != 4: continue
                at = pr['attributes']; pos = accessor(js, raw, at['POSITION']); nr = accessor(js, raw, at['NORMAL']) if 'NORMAL' in at else None
                uv = accessor(js, raw, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
                idx = accessor(js, raw, pr['indices'])[:, 0].astype(np.int64) if 'indices' in pr else np.arange(len(pos))
                mi = pr.get('material'); mat = js['materials'][mi] if mi is not None else {}
                t = texture(mi)
                if t is not None and uv is not None:
                    h, w = t.shape[:2]; x = np.minimum((np.clip(uv[:, 0], 0, 1) * w).astype(int), w - 1); y = np.minimum((np.clip(uv[:, 1], 0, 1) * h).astype(int), h - 1); col = t[y, x, :3].astype(float)
                else:
                    bc = np.array((mat.get('pbrMetallicRoughness') or {}).get('baseColorFactor', [1, 1, 1, 1])[:3]); col = np.tile((bc ** (1 / 2.2)) * 255, (len(pos), 1))
                q = (np.c_[pos, np.ones(len(pos))] @ W.T)[:, :3]
                if nr is not None: nn = nr @ W[:3, :3].T; nn /= (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12)
                else: nn = np.zeros((len(pos), 3)); nn[:, 1] = 1
                tri = idx.reshape(-1, 3)
                if np.linalg.det(W[:3, :3]) < 0: tri = tri[:, [0, 2, 1]]          # mirrored node: restore the winding
                P.append(q); N.append(nn); C.append(col); I.append(tri.reshape(-1) + off); off += len(pos)
                G.append(np.full(len(pos), part_of(chain) if part_of else 0, np.int32))
        for c in n.get('children', []): visit(c, W, chain)
    for r in scene: visit(r, np.eye(4), [])
    return Model(np.vstack(P), np.vstack(N), np.vstack(C), np.concatenate(I), np.concatenate(G))


# ------------------------------------------------------------------ editing
def yaw_rot(m, deg):
    if not deg: return m
    a = math.radians(deg); c, s = math.cos(a), math.sin(a); R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    m.pos = m.pos @ R.T; m.nrm = m.nrm @ R.T; return m


def fit(m, scale=None, height=None, width=None, scale3=None, center=True):
    """uniform scale (or `height` / `width` in metres, or per-axis scale3), centre on x/z, stand on y = 0"""
    lo, hi = m.bbox()
    if scale3 is not None: k = np.array(scale3, float)
    else:
        s = scale if scale else (height / (hi[1] - lo[1]) if height else width / (hi[0] - lo[0])); k = np.array([s, s, s])
    m.pos = m.pos * k
    if scale3 is not None:
        m.nrm = m.nrm / k; m.nrm /= (np.linalg.norm(m.nrm, axis=1, keepdims=True) + 1e-12)
    lo, hi = m.bbox()
    m.pos[:, 1] -= lo[1]
    if center: m.pos[:, 0] -= (lo[0] + hi[0]) / 2; m.pos[:, 2] -= (lo[2] + hi[2]) / 2
    return m


def decimate(m, keep):
    """vertex clustering towards ~`keep` of the triangles: vertices that share a grid cell AND a colour bucket merge (so a window never melts into a wall)"""
    lo, hi = m.bbox(); ext = float(np.max(hi - lo)); target = max(24, int(m.tris * keep))
    best = None
    for k in np.geomspace(0.004, 0.35, 28):
        cell = ext * k; key = np.floor((m.pos - lo) / cell).astype(np.int64); cb = np.minimum(m.col // 56, 4).astype(np.int64)
        kk = (((key[:, 0] * 4099 + key[:, 1]) * 4099 + key[:, 2]) * 1000003 + cb[:, 0] * 25 + cb[:, 1] * 5 + cb[:, 2]) * 8 + (m.part % 8)
        u, inv = np.unique(kk, return_inverse=True)
        T = inv[m.idx.reshape(-1, 3)]; ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
        if best is None or abs(ok.sum() - target) < abs(best[0] - target): best = (int(ok.sum()), u, inv, T[ok])
        if ok.sum() <= target: break
    n, u, inv, T = best; cnt = np.bincount(inv, minlength=len(u)).astype(float)[:, None]
    pos = np.zeros((len(u), 3)); nrm = np.zeros((len(u), 3)); col = np.zeros((len(u), 3)); part = np.zeros(len(u), np.int32)
    for d in range(3): pos[:, d] = np.bincount(inv, m.pos[:, d], len(u)); nrm[:, d] = np.bincount(inv, m.nrm[:, d], len(u)); col[:, d] = np.bincount(inv, m.col[:, d], len(u))
    pos /= cnt; col /= cnt; nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12); part[inv] = m.part
    # drop duplicate triangles, keep what is used
    T = np.unique(T, axis=0)
    used = np.unique(T); remap = -np.ones(len(u), np.int64); remap[used] = np.arange(len(used))
    return Model(pos[used], nrm[used], col[used], remap[T].reshape(-1), part[used])


# ------------------------------------------------------------------ writing
def write_glb(path, m, glow=None, part_alpha=False):
    """interleaved 20-byte vertices. alpha: 255 normal, 128 where `glow` (bool per vertex), 200+part for actor bodies"""
    n = len(m.pos); vb = np.zeros(n, dtype=[('p', '<f4', 3), ('n', 'i1', 3), ('pad', 'u1'), ('c', 'u1', 3), ('a', 'u1')])
    vb['p'] = m.pos; vb['n'] = np.round(np.clip(m.nrm, -1, 1) * 127).astype(np.int8); vb['c'] = np.clip(np.round(m.col), 0, 255).astype(np.uint8)
    a = np.full(n, 255, np.uint8)
    if glow is not None: a[glow] = 128
    if part_alpha: a = (200 + m.part).astype(np.uint8)
    vb['a'] = a
    big = n > 65535; idx = m.idx.astype('<u4' if big else '<u2'); ib = idx.tobytes(); ib += b'\0' * ((4 - len(ib) % 4) % 4); vbb = vb.tobytes()
    lo, hi = m.pos.min(0), m.pos.max(0)
    js = {'asset': {'version': '2.0', 'generator': 'tools/bake-kenney.py', 'copyright': 'Kenney (www.kenney.nl) CC0 1.0', 'extras': {'rwSrgb': True}},
          'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
          'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'mode': 4}]}],
          'accessors': [{'bufferView': 0, 'byteOffset': 0, 'componentType': 5126, 'count': n, 'type': 'VEC3', 'min': lo.tolist(), 'max': hi.tolist()},
                        {'bufferView': 0, 'byteOffset': 12, 'componentType': 5120, 'normalized': True, 'count': n, 'type': 'VEC3'},
                        {'bufferView': 0, 'byteOffset': 16, 'componentType': 5121, 'normalized': True, 'count': n, 'type': 'VEC4'},
                        {'bufferView': 1, 'componentType': 5125 if big else 5123, 'count': len(idx), 'type': 'SCALAR'}],
          'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(vbb), 'byteStride': 20, 'target': 34962}, {'buffer': 0, 'byteOffset': len(vbb), 'byteLength': len(ib), 'target': 34963}],
          'buffers': [{'byteLength': len(vbb) + len(ib)}]}
    j = json.dumps(js, separators=(',', ':')).encode(); j += b' ' * ((4 - len(j) % 4) % 4); body = vbb + ib
    total = 12 + 8 + len(j) + 8 + len(body)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total)); f.write(struct.pack('<I4s', len(j), b'JSON')); f.write(j); f.write(struct.pack('<I4s', len(body), b'BIN\0')); f.write(body)
    return os.path.getsize(path)


# ------------------------------------------------------------------ doors (buildings; front = -Z)
# Entrance x (metres, +x = right when looking at the front) per model at the baked scale. Colour/geometry detection was unreliable across the
# packs, so these were read off front-view renders with a metre grid. Missing id = centred. z is always the front plane.
DOORS = {'h_a': 0, 'h_b': 2.2, 'h_c': 0, 'h_d': 1.3, 'h_e': 0, 'h_f': 0.6, 'h_g': 0, 'h_h': 0, 'h_i': 3.4, 'h_j': 0, 'h_k': -1.5, 'h_l': -2.0, 'h_m': 0.6, 'h_n': -1.1,
         'h_o': 3.3, 'h_p': 3.2, 'h_q': 0.1, 'h_r': -1.1, 'h_s': 0, 'h_t': 0, 'h_u': 0.5, 'm_a': 2.0, 'm_b': -1.0, 'm_c': -1.5, 'm_d': 1.8, 'm_e': 1.8, 'm_f': -1.2,
         'm_g': -0.8, 'm_h': -1.4, 'm_i': 0, 'm_j': 0, 'm_k': 0, 'm_l': 0, 'm_m': 0, 'm_n': 3.0, 'i_l': 2.7, 'i_q': 6.6, 'i_s': -6.2, 'i_m': 0}


def find_door(m, id):
    lo, hi = m.bbox()
    return float(DOORS.get(id, 0.0)), float(lo[2]), 1.2, id in DOORS


# ------------------------------------------------------------------ the list of what gets baked
SUB = 'Environments/City/Suburban'; COM = 'Environments/City/Commercial'; IND = 'Environments/City/Industrial'; ROADS = 'Environments/City/Roads'
CARS = 'Vehicles/Car Kit'; CHARS = 'Characters/Blocky Characters'; FURNITURE = 'Props/Furniture Kit'; ARC = 'Props/Mini Arcade'; FACT = 'Environments/Factory Kit'
MAX_TRIS0 = 2400       # triangle budget of a full-detail building
M_PER_UNIT = 8.0       # a Kenney city building is ~1 unit wide: x8 gives a 10 m house, a 2.1 m door
CAR_SCALE = 1.5        # a Kenney sedan is 2.55 units long: x1.5 = 3.8 m
CHAR_K = 0.667         # blocky characters are 2.7 units tall: x0.667 = 1.8 m


def build_list():
    L = []
    for c in 'abcdefghijklmnopqrstu': L.append(dict(id='h_' + c, kind='house', rel=f'{SUB}/{GLB}/building-type-{c}.glb', scale=M_PER_UNIT, keep=0.34))
    for c in 'abcdefghijklmn': L.append(dict(id='m_' + c, kind='mid', rel=f'{COM}/{GLB}/building-{c}.glb', scale=M_PER_UNIT, keep=0.34))
    for c in 'abcde': L.append(dict(id='t_' + c, kind='tower', rel=f'{COM}/{GLB}/building-skyscraper-{c}.glb', scale=M_PER_UNIT, keep=0.30))
    for c in 'lqsm': L.append(dict(id='i_' + c, kind='industrial', rel=f'{IND}/{GLB}/building-{c}.glb', scale=M_PER_UNIT, keep=0.34))
    return L


def bake_all():
    manifest = {'version': 2, 'credit': CREDIT, 'props': {}, 'cars': {}, 'people': {}, 'buildings': {}, 'furniture': {}}
    total = 0
    def emit(id, m, m1, glow=None, glow1=None, part_alpha=False):
        nonlocal total
        a = write_glb(f'{BAKED}/{id}.glb', m, glow, part_alpha); b = write_glb(f'{BAKED}/{id}_lod1.glb', m1, glow1, part_alpha) if m1 is not None else 0; total += a + b; return a, b

    # ---- buildings
    for b in build_list():
        m = fit(load_model(b['rel']), scale=b['scale'])
        if m.tris > MAX_TRIS0: m = decimate(m, MAX_TRIS0 / m.tris)       # the wide commercial blocks have 3-5k tris of window trim: thin them so a street of them stays cheap
        lo, hi = m.bbox(); dx, dz, dw, ok = find_door(m, b['id'])
        m1 = decimate(m, b['keep']); win = lambda q: (q.col[:, 2] - q.col[:, 0] > 45) & (q.col[:, 2] > 140)    # window glass = the blue swatches: they light up at night
        emit(b['id'], m, m1, win(m), win(m1))
        manifest['buildings'][b['id']] = dict(kind=b['kind'], glb=f"kenney/{b['id']}.glb", lod1=f"kenney/{b['id']}_lod1.glb", w=round(float(hi[0] - lo[0]), 2), d=round(float(hi[2] - lo[2]), 2), h=round(float(hi[1] - lo[1]), 2),
                                              door=dict(x=round(dx, 2), z=round(dz, 2), w=round(dw, 2), found=bool(ok)), tris=[m.tris, m1.tris])

    # ---- instanced street props (tree / lamp / bench): front = -Z, origin on the ground
    def prop(name, variants):
        out = []
        for v in variants:
            m = load_model(v['rel']); yaw_rot(m, v.get('yaw', 0)); fit(m, height=v.get('height'), width=v.get('width'), scale=v.get('scale'), scale3=v.get('scale3'))
            glow = None
            if v.get('glow'): glow = (m.col.min(axis=1) > 245) & (m.pos[:, 1] > m.pos[:, 1].max() * 0.8)
            m1 = decimate(m, v.get('keep', 0.4)); glow1 = None
            if glow is not None:
                glow1 = (m1.col.min(axis=1) > 235) & (m1.pos[:, 1] > m1.pos[:, 1].max() * 0.8)
            emit(v['id'], m, m1, glow, glow1); lo, hi = m.bbox()
            out.append(dict(glb=f"kenney/{v['id']}.glb", lod1=f"kenney/{v['id']}_lod1.glb", height=round(float(hi[1]), 2), tris=[m.tris, m1.tris]))
        manifest['props'][name] = dict(variants=out)
    prop('tree', [dict(id='tree_a', rel=f'{SUB}/{GLB}/tree-large.glb', height=8.5, keep=0.35), dict(id='tree_b', rel=f'{SUB}/{GLB}/tree-small.glb', height=6.0, keep=0.35)])
    prop('lamp', [dict(id='lamp_a', rel=f'{ROADS}/{GLB}/light-square.glb', height=5.4, glow=True, keep=0.5)])
    prop('bench', [dict(id='bench_a', rel=f'{FURNITURE}/{FURN}/bench.glb', scale3=(4.5, 1.0, 2.2), keep=0.6)])

    # ---- cars: front +Z in the kit -> turn 180° so the front faces -Z
    for c in ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery']:
        m = load_model(f'{CARS}/{GLB}/{c}.glb'); yaw_rot(m, 180); fit(m, scale=CAR_SCALE); m1 = decimate(m, 0.30); emit('car_' + c, m, m1); lo, hi = m.bbox()
        manifest['cars'][c] = dict(glb=f'kenney/car_{c}.glb', lod1=f'kenney/car_{c}_lod1.glb', length=round(float(hi[2] - lo[2]), 2), width=round(float(hi[0] - lo[0]), 2), height=round(float(hi[1]), 2), tris=[m.tris, m1.tris])


    # ---- interior furniture (Room.model in os/realworld/interiors.js): kit faces +Z -> turned so the front faces -Z like everything else
    # the Furniture Kit pieces the interiors use (name -> kit file; the baked name is furn_<name>.glb and Room.model('<name>') places it). One scale for the whole kit (K) keeps the pieces in proportion to each other.
    K = 2.0; KIT = ['loungeSofaLong', 'loungeSofaCorner', 'loungeChair', 'loungeChairRelax', 'loungeDesignSofa', 'loungeDesignChair', 'loungeSofaOttoman', 'tableCoffee', 'tableCoffeeGlass', 'sideTable', 'sideTableDrawers',
      'cabinetTelevision', 'cabinetTelevisionDoors', 'televisionModern', 'televisionVintage', 'bookcaseClosed', 'bookcaseClosedWide', 'bookcaseClosedDoors', 'bookcaseOpen', 'bookcaseOpenLow', 'books', 'rugRectangle', 'rugRound', 'rugRounded', 'rugSquare', 'rugDoormat',
      'lampRoundFloor', 'lampSquareFloor', 'lampRoundTable', 'lampSquareTable', 'lampSquareCeiling', 'lampWall', 'speaker', 'speakerSmall', 'radio', 'plantSmall1', 'plantSmall2', 'plantSmall3', 'pillow', 'pillowBlue', 'coatRack', 'coatRackStanding', 'trashcan', 'ceilingFan',
      'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetUpper', 'kitchenCabinetUpperDouble', 'kitchenCabinetCornerInner', 'kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenFridgeBuiltIn', 'kitchenSink', 'kitchenStove', 'kitchenStoveElectric',
      'kitchenMicrowave', 'kitchenCoffeeMachine', 'kitchenBar', 'kitchenBarEnd', 'hoodModern', 'hoodLarge', 'toaster', 'kitchenBlender', 'table', 'tableRound', 'tableCloth', 'tableGlass', 'chair', 'chairCushion', 'chairModernCushion', 'chairRounded', 'stoolBar', 'stoolBarSquare', 'benchCushion', 'bench',
      'bedSingle', 'bedBunk', 'cabinetBed', 'cabinetBedDrawer', 'cabinetBedDrawerTable', 'desk', 'deskCorner', 'chairDesk', 'computerScreen', 'computerKeyboard', 'laptop', 'bear',
      'bathroomSink', 'bathroomSinkSquare', 'toilet', 'toiletSquare', 'bathtub', 'shower', 'showerRound', 'bathroomMirror', 'bathroomCabinet', 'washer', 'dryer', 'washerDryerStacked', 'cardboardBoxClosed', 'cardboardBoxOpen']
    for name, rel, k in [('plant', f'{FURNITURE}/{FURN}/pottedPlant.glb', 2.3), ('sofa', f'{FURNITURE}/{FURN}/loungeSofa.glb', 2.04), ('bed', f'{FURNITURE}/{FURN}/bedDouble.glb', 2.0),
                         ('arcade', f'{ARC}/{GLB}/arcade-machine.glb', 2.5), ('claw', f'{ARC}/{GLB}/claw-machine.glb', 2.2)] + [(n, f'{FURNITURE}/{FURN}/{n}.glb', K) for n in KIT]:
        m = load_model(rel); yaw_rot(m, 180); fit(m, scale=k); lo, hi = m.bbox(); total += write_glb(f'{BAKED}/furn_{name}.glb', m)
        manifest['furniture'][name] = dict(glb=f'kenney/furn_{name}.glb', w=round(float(hi[0] - lo[0]), 2), d=round(float(hi[2] - lo[2]), 2), h=round(float(hi[1]), 2), tris=m.tris)

    # ---- people: 6 parts -> the engine's 5 swinging parts (0 body+head, 1/2 legs, 3/4 arms); alpha = 200 + part
    PART = lambda chain: 1 if 'leg-left' in chain else 2 if 'leg-right' in chain else 3 if 'arm-left' in chain else 4 if 'arm-right' in chain else 0
    for c in 'abcdefgh':
        m = load_model(f'{CHARS}/{GLB}/character-{c}.glb', PART); fit(m, scale=CHAR_K, center=True)
        manifest['people'][c] = dict(glb=f'kenney/person_{c}.glb', tris=m.tris, height=round(float(m.pos[:, 1].max()), 2)); total += write_glb(f'{BAKED}/person_{c}.glb', m, None, True)
    # pivots the actor shader swings the limbs around (hip, shoulder), measured on the baked model
    m = load_model(f'{CHARS}/{GLB}/character-a.glb', PART); fit(m, scale=CHAR_K)
    legs = m.pos[(m.part == 1) | (m.part == 2)]; arms = m.pos[(m.part == 3) | (m.part == 4)]
    manifest['peoplePivot'] = dict(hip=round(float(legs[:, 1].max()), 3), shoulder=round(float(arms[:, 1].max() - 0.12), 3))
    return manifest, total


if __name__ == '__main__':
    os.makedirs(BAKED, exist_ok=True)
    man, total = bake_all()
    man['note'] = 'Generated by tools/bake-kenney.py - do not edit by hand (re-run the tool).'
    json.dump(man, open(OUT + '/manifest.json', 'w'), indent=1)
    n = sum(1 for _ in os.listdir(BAKED)); print(f'baked {n} files, {total / 1e6:.2f} MB -> {BAKED}; manifest {OUT}/manifest.json')
    miss = [k for k, v in man['buildings'].items() if not v['door']['found']]
    if miss: print('no door detected (centre used):', ', '.join(miss))
