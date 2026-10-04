"""Builds the river's guardian: Dras, a 7 m female freshwater orca, smooth, rigged, with Swim and Lunge clips.

Real killer-whale anatomy: blunt rounded head (no beak), girth peak ~38 % back, laterally compressed
tail stock, falcate female dorsal fin, paddle pectorals, notched flukes. Black body; white chin, belly
band with a flank lobe behind the fin, oval eye patches, white fluke undersides; grey saddle patch.
Small glossy eyes sit just above the mouth line and below the front of each eye patch. The lower jaw is
its own shell, weighted 100 % to bone `Jaw` (code opens it); mouth interior and 11 teeth per jaw side.

Head toward Blender +Y (three -Z, downstream), up +Z (three +Y), origin at the body centre, length exactly 7 m.
Bones: Head, Jaw (child of Head), Spine1..5, Tail1, Tail2. Clips: Swim (48, loops), Lunge (24), and the beached death:
Beached (96, loops, 4 s), TailLift (36, 1.5 s), Exhale (72, 3 s, holds still). Those three assume she lies on her belly.
Prints one `ANATOMY {...}` JSON line (metres, three.js axes) measured from the built mesh.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/orca.py -- public/assets/characters/orca.glb
"""

import bisect
import json
import math
import sys

import bmesh
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
LENGTH, HALF = 7.0, 3.5
RINGS, SIDES, SUPER = 48, 24, 2.4
MAX_TRIS = 12000
JAW_OPEN = 0.55
# Body sections: t (0 nose .. 1 fluke tips), top, bottom, full width, mouth-line height (metres, z up).
TABLE = [(0.0, -0.12, -0.20, 0.0, -0.16), (0.006, -0.04, -0.28, 0.17, -0.16), (0.02, 0.12, -0.38, 0.42, -0.15),
         (0.05, 0.33, -0.46, 0.65, -0.14), (0.10, 0.54, -0.54, 0.86, -0.12), (0.14, 0.63, -0.58, 0.99, -0.10),
         (0.20, 0.64, -0.62, 1.09, -0.08), (0.26, 0.66, -0.66, 1.15, -0.07), (0.38, 0.71, -0.69, 1.20, -0.065),
         (0.46, 0.70, -0.67, 1.12, -0.06), (0.54, 0.65, -0.62, 0.95, -0.05), (0.62, 0.58, -0.55, 0.76, -0.04),
         (0.70, 0.50, -0.45, 0.55, -0.02), (0.78, 0.38, -0.34, 0.38, 0.0), (0.85, 0.31, -0.29, 0.21, 0.0),
         (0.91, 0.19, -0.17, 0.13, 0.0), (0.955, 0.15, -0.15, 0.09, 0.0)]
T_END, T_CORNER = 0.955, 0.135
MATS = {"black": ((0.012, 0.012, 0.014), 0.5), "white": ((0.80, 0.82, 0.84), 0.5), "grey": ((0.16, 0.17, 0.18), 0.5),
        "mouth": ((0.25, 0.12, 0.13), 0.6), "eye": ((0.01, 0.01, 0.01), 0.05)}
MI = {n: i for i, n in enumerate(MATS)}
BN = ["Head", "Spine1", "Spine2", "Spine3", "Spine4", "Spine5", "Tail1", "Tail2"]
JOINTS = [0, 0.18, 0.32, 0.46, 0.60, 0.72, 0.84, 0.94, 1.12]
GROUPS = BN + ["Jaw"]
MIDS = [(JOINTS[i] + JOINTS[i + 1]) / 2 for i in range(8)]
JAW_FALL = [1.0, 0.65, 0.3, 0.1]  # lower-arc jaw weight at ring m, m+1, ...
JAW_FALL_EQ = [0.5, 0.3, 0.12, 0.0]


def pchip(xs, ys):
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        x = min(max(x, xs[0]), xs[-1])
        i = min(bisect.bisect_right(xs, x) - 1, n - 2)
        s = (x - xs[i]) / h[i]
        return ((2 * s**3 - 3 * s**2 + 1) * ys[i] + (s**3 - 2 * s**2 + s) * h[i] * m[i]
                + (-2 * s**3 + 3 * s**2) * ys[i + 1] + (s**3 - s**2) * h[i] * m[i + 1])
    return f


_ts = [r[0] for r in TABLE]
TOP, BOT, WID, ZEQ = (pchip(_ts, [r[k] for r in TABLE]) for k in (1, 2, 3, 4))


def y_of(t):
    return HALF - t * LENGTH


def t_of(y):
    return (HALF - y) / LENGTH


def section(t, ang):
    """(x, z) on the superellipse cross-section at t; ang 0 = right equator (the mouth line), 90 deg = top."""
    c, s = math.cos(ang), math.sin(ang)
    zq = ZEQ(t)
    a = (TOP(t) - zq) if s > 0 else (zq - BOT(t))
    e = 2 / SUPER
    return (WID(t) / 2 * math.copysign(abs(c) ** e, c), zq + a * math.copysign(abs(s) ** e, s))


def spine_w(t):
    if t <= MIDS[0]:
        return {"Head": 1.0}
    if t >= MIDS[-1]:
        return {"Tail2": 1.0}
    k = bisect.bisect_right(MIDS, t) - 1
    f = (t - MIDS[k]) / (MIDS[k + 1] - MIDS[k])
    f = f * f * (3 - 2 * f)
    return {BN[k]: 1 - f, BN[k + 1]: f}


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()

    def vert(self, p, w):
        v = self.bm.verts.new(p)
        for name, val in w.items():
            if val > 0:
                v[self.dl][GROUPS.index(name)] = val
        return v

    def face(self, vs, mat):
        out = [v for i, v in enumerate(vs) if v is not vs[i - 1]]
        if len(out) >= 3 and len(set(out)) == len(out):
            self.bm.faces.new(out).material_index = MI[mat]


def body_cage(b):
    """Body loft; the head is split into an upper shell and a lower jaw shell joined by a lip band."""
    ts = [T_END * (i / RINGS) ** 1.3 for i in range(RINGS + 1)]
    m = next(i for i, t in enumerate(ts) if t >= T_CORNER)
    ang = [2 * math.pi * j / SIDES for j in range(SIDES)]
    half = SIDES // 2
    U, Lw = {}, {}
    for i in range(1, m):
        t, sw = ts[i], spine_w(ts[i])
        U[i] = [b.vert((*section(t, ang[j])[:1], y_of(t), section(t, ang[j])[1]), sw) for j in range(half + 1)]
        row = []
        for k in range(half, SIDES + 1):
            x, z = section(t, ang[k % SIDES])
            if k in (half, SIDES):  # a hairline lip gap
                x, z = x - math.copysign(0.003, x), z - 0.003
            row.append(b.vert((x, y_of(t), z), {"Jaw": 1.0}))
        Lw[i] = row
    ring = {}
    for i in range(m, RINGS + 1):
        t, sw = ts[i], spine_w(ts[i])
        k = i - m
        row = []
        for j in range(SIDES):
            w = dict(sw)
            if k < len(JAW_FALL):
                jw = (JAW_FALL_EQ if j in (0, half) else JAW_FALL)[k] if (j == 0 or j >= half) else 0.0
                w = {n: v * (1 - jw) for n, v in sw.items()}
                w["Jaw"] = jw
            x, z = section(t, ang[j])
            row.append(b.vert((x, y_of(t), z), w))
        ring[i] = row
    U[m] = ring[m][:half + 1]
    Lw[m] = [ring[m][k % SIDES] for k in range(half, SIDES + 1)]
    # Mouth interior: palate and tongue run inward from the lips to a recessed side wall that stretches when the jaw opens.
    pal, ton, wall = {}, {}, {}
    for i in range(1, m):
        t, sw = ts[i], spine_w(ts[i])
        xi = max(section(t, 0.0)[0] - 0.08, 0.02)
        z = ZEQ(t)
        wu = [b.vert((s_ * xi, y_of(t), z), sw) for s_ in (1, -1)]
        wl = [b.vert((s_ * xi, y_of(t), z), {"Jaw": 1.0}) for s_ in (1, -1)]
        pal[i], ton[i], wall[i] = [U[i][0], *wu, U[i][half]], [Lw[i][half], *wl, Lw[i][0]], (wu, wl)
    pal[m], ton[m] = [ring[m][0]] * 2 + [ring[m][half]] * 2, [ring[m][0]] * 2 + [ring[m][half]] * 2
    wall[m] = ([ring[m][0], ring[m][half]], [ring[m][0], ring[m][half]])
    for i in range(1, m):
        for j in range(half):
            b.face([U[i][j], U[i][j + 1], U[i + 1][j + 1], U[i + 1][j]], "black")
            b.face([Lw[i][j], Lw[i][j + 1], Lw[i + 1][j + 1], Lw[i + 1][j]], "white")
        for k in range(3):
            b.face([pal[i][k], pal[i][k + 1], pal[i + 1][k + 1], pal[i + 1][k]], "mouth")
            b.face([ton[i][k], ton[i][k + 1], ton[i + 1][k + 1], ton[i + 1][k]], "mouth")
        for s_ in (0, 1):
            b.face([wall[i][0][s_], wall[i + 1][0][s_], wall[i + 1][1][s_], wall[i][1][s_]], "mouth")
    lips = {v for i in range(1, m) for v in (U[i][0], U[i][half], Lw[i][half], Lw[i][0])} | {ring[m][0], ring[m][half]}
    cl = b.bm.edges.layers.float.new("crease_edge")
    for e in b.bm.edges:
        if e.verts[0] in lips and e.verts[1] in lips:
            e[cl] = 1.0  # keeps the closed lip line sharp through the subdivision
    zn = (TOP(0) + BOT(0)) / 2
    pu = b.vert((0, HALF, zn + 0.02), {"Head": 1.0})
    pl = b.vert((0, HALF - 0.035, ZEQ(0) - 0.03), {"Jaw": 1.0})
    for j in range(half):
        b.face([pu, U[1][j + 1], U[1][j]], "black")
        b.face([pl, Lw[1][j], Lw[1][j + 1]], "white")
    for k in range(3):
        b.face([pu, pal[1][k], pal[1][k + 1]], "mouth")
        b.face([pl, ton[1][k + 1], ton[1][k]], "mouth")
    for i in range(m, RINGS):
        for j in range(SIDES):
            b.face([ring[i][j], ring[i][(j + 1) % SIDES], ring[i + 1][(j + 1) % SIDES], ring[i + 1][j]], "black")
    tail = b.vert((0, y_of(T_END + 0.012), 0), {"Tail2": 1.0})
    for j in range(SIDES):
        b.face([tail, ring[RINGS][(j + 1) % SIDES], ring[RINGS][j]], "black")
    return ts[m]


def tooth(b, p, d, group):
    d = Vector(d).normalized()
    ax = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    u = d.cross(ax).normalized() * 0.016
    v = d.cross(u).normalized() * 0.016
    w = {group: 1.0}
    base = [b.vert(p + u * math.cos(a) + v * math.sin(a), w) for a in (2 * math.pi * k / 5 for k in range(5))]
    apex = b.vert(p + d * 0.045, w)
    for k in range(5):
        b.face([base[k], base[(k + 1) % 5], apex], "white")


def teeth(b, t_corner):
    n, y0, y1 = 11, HALF - 0.12, y_of(t_corner) + 0.08
    for side in (-1, 1):
        for k in range(n):
            for up in (True, False):
                y = y0 + (y1 - y0) * (k + (0 if up else 0.5)) / n
                x, _ = section(t_of(y), 0.0)
                z = ZEQ(t_of(y))
                if up:
                    tooth(b, Vector((side * (abs(x) - 0.07), y, z + 0.008)), (0, 0, -1), "Head")
                else:
                    tooth(b, Vector((side * (abs(x) - 0.07), y, z - 0.019)), (0, 0, 1), "Jaw")


EYE_R, EYE_IN, SOCKET_R, SOCKET_D = 0.048, 0.030, 0.075, 0.014


def eye_hits(body):
    """Where each eye sits on the skin: (side, surface point)."""
    y, z = y_of(0.12), ZEQ(0.12) + 0.065
    return [(side, body.ray_cast(Vector((side * 3, y, z)), Vector((-side, 0, 0)))[1]) for side in (-1, 1)]


def prep_eyes(body, hits):
    """Refine the skin around each eye and press in a shallow socket so the eye sits flush."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    near = [f for f in bm.faces if f.material_index == MI["black"]
            and any((f.calc_center_median() - h).length < 0.16 for _, h in hits)]
    refine(bm, near, 2)
    for v in bm.verts:
        for side, h in hits:
            d = (v.co - h).length
            if d < SOCKET_R and v.co.x * side > 0 and v.co.z > h.z - 0.07:
                v.co.x -= side * SOCKET_D * (1 - d / SOCKET_R) ** 2
    bm.to_mesh(body.data)
    bm.free()


def sphere(b, c, r, mat, seg=(16, 12)):
    sph = bmesh.new()
    bmesh.ops.create_uvsphere(sph, u_segments=seg[0], v_segments=seg[1], radius=r)
    vm = {v: b.vert(v.co + c, {"Head": 1.0}) for v in sph.verts}
    for f in sph.faces:
        b.face([vm[v] for v in f.verts], mat)
    sph.free()


def eyes(b, hits):
    """Glossy near-black eyes (visible radius ~4.5 cm) with a tiny white glint up and forward."""
    centres = []
    for side, hit in hits:
        c = Vector((hit.x - side * EYE_IN, hit.y, hit.z))
        centres.append(c)
        sphere(b, c, EYE_R, "eye")
        sphere(b, c + Vector((side * 0.8, 0.35, 0.45)).normalized() * (EYE_R - 0.002), 0.009, "white", (8, 6))
    return centres


def fin(b, outline, thick, dref, origin, ub, vb, wb, group, edge=0.24, lead=0.0):
    """A solid lens-shaped fin from a 2D outline (u, v): knife edge, thickest inside. Basis ub, vb, wb."""
    fb = bmesh.new()
    fb.faces.new([fb.verts.new((u, v, 0)) for u, v in outline])
    bmesh.ops.triangulate(fb, faces=fb.faces[:])
    for _ in range(4):
        long = [e for e in fb.edges if e.calc_length() > edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(fb, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(fb, faces=fb.faces[:])
    segs = list(zip(outline, outline[1:] + outline[:1]))

    def dist(p):
        best = 9.0
        for (au, av), (bu, bv) in segs:
            sx, sy, px, py = bu - au, bv - av, p[0] - au, p[1] - av
            k = max(0.0, min(1.0, (px * sx + py * sy) / (sx * sx + sy * sy)))
            best = min(best, math.hypot(px - k * sx, py - k * sy))
        return best

    front, back = {}, {}
    w = {group: 1.0}
    umin, umax = min(p[0] for p in outline), max(p[0] for p in outline)
    for v in fb.verts:
        d = dist(v.co)
        h = thick / 2 * (1 - (1 - min(d / dref, 1)) ** 2) * (1 + lead * (1 - (v.co.x - umin) / (umax - umin))) if d > 1e-6 else 0.0
        o = origin + ub * v.co.x + vb * v.co.y
        front[v] = b.vert(o + wb * h, w)
        back[v] = front[v] if h == 0 else b.vert(o - wb * h, w)
    for f in fb.faces:
        vs = list(f.verts)
        b.face([front[v] for v in vs], "black")
        if any(back[v] is not front[v] for v in vs):
            b.face([back[v] for v in reversed(vs)], "black")
    fb.free()


def fins(b):
    top_y = y_of(0.46)
    base_z = TOP(0.5) - 0.04
    # Female dorsal fin: tall as 0.9 m, falcate, base ~0.9 m, front edge at 46 % of the length.
    lead = [(0.74 * s**2.2, 0.88 * s) for s in (k / 8 for k in range(0, 9))]
    trail = [(0.74 + 0.20 * (1 - s) ** 1.8, 0.88 * s) for s in (k / 8 for k in range(7, -1, -1))]
    outline = [(-0.02, -0.25)] + lead + trail + [(0.94, -0.25)]
    fin(b, outline, 0.07, 0.14, Vector((0, top_y, base_z)), Vector((0, -1, 0)), Vector((0, 0, 1)),
        Vector((1, 0, 0)), "Spine3")
    # Pectoral paddles 0.9 x 0.5 m, low on the flank, angled down and back.
    for side in (-1, 1):
        x, z = section(0.245, math.radians(-38) if side > 0 else math.radians(218))
        span = Vector((side * 0.75, -0.35, -0.45)).normalized()
        chord = (Vector((0, -1, 0)) - Vector((0, -1, 0)).dot(span) * span).normalized()
        chord = (chord * math.cos(0.3) + span.cross(chord) * math.sin(0.3) * side).normalized()  # rolled: paddle shows a face head-on
        outline = []
        for k in range(24):
            a = 2 * math.pi * k / 24
            sp, sn = 0.15 + 0.85 * math.cos(a), math.sin(a)
            outline.append((0.10 * sp + 0.31 * sn, sp))
        fin(b, outline, 0.09, 0.17, Vector((x - side * 0.1, y_of(0.245), z + 0.1)), chord, span,
            span.cross(chord) * -side, "Spine1", edge=0.24, lead=0.7)
    # Flukes: 1.5 m span, swept tips, central notch; chord reaches the 7 m mark.
    yr = y_of(0.92)
    right = [(-0.12, 0.1), (0.10, 0.40), (0.24, 0.62), (0.38, 0.72), (0.56, 0.75)]
    notch = [(0.53, 0.62), (0.50, 0.45), (0.46, 0.28), (0.41, 0.12)]
    outline = [(-0.12, 0)] + right + notch + [(0.37, 0.0)] + [(u, -v) for u, v in reversed(notch)] \
        + [(0.56, -0.75)] + [(u, -v) for u, v in reversed(right[:-1])]
    fin(b, outline, 0.05, 0.13, Vector((0, yr, 0)), Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)),
        "Tail2")


def make_obj(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for g in GROUPS:
        obj.vertex_groups.new(name=g)
    for n, (rgb, rough) in MATS.items():
        mat = bpy.data.materials.get(f"orca-{n}") or bpy.data.materials.new(f"orca-{n}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = rough
        mat.diffuse_color = (*rgb, 1)
        obj.data.materials.append(mat)
    return obj


def lerp_curve(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return lambda x: ys[0] if x <= xs[0] else ys[-1] if x >= xs[-1] else (
        lambda i: ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]))(bisect.bisect_right(xs, x) - 1)


BELLY = lerp_curve([(0.0, -90), (0.13, -90), (0.136, 0), (0.22, -48), (0.30, -62), (0.42, -60), (0.50, -45),
                    (0.575, -10), (0.64, 25), (0.69, 10), (0.74, -45), (0.9, -55), (0.93, -90), (1.0, -90)])


def regions():
    """Marking regions as (fn(co) < 0 inside, material), from the cage functions; used to cut the mesh along them."""
    c25, s25 = math.cos(math.radians(25)), math.sin(math.radians(25))

    def coords(c):
        t = t_of(c.y)
        h = c.z - ZEQ(t)
        a = (TOP(t) - ZEQ(t)) if h > 0 else (ZEQ(t) - BOT(t))
        return t, h, math.degrees(math.atan2(h / max(a, 1e-3), abs(c.x) / max(WID(t) / 2, 1e-3)))

    def patch(c):
        _, h, _ = coords(c)
        u, v = (HALF - c.y) - 1.06, h - 0.225
        return ((u * c25 + v * s25) / 0.21) ** 2 + ((-u * s25 + v * c25) / 0.095) ** 2 - 1

    def belly(c):
        t, _, pd = coords(c)
        return (pd - BELLY(t)) / 20

    def saddle(c):
        t, _, pd = coords(c)
        return ((t - 0.63) / 0.045) ** 2 + ((90 - pd) / 32) ** 2 - 1
    return [(patch, "white", 2, None), (belly, "white", 0, None), (saddle, "grey", 2, None)]


def in_reach(c, near):
    return (Vector((abs(c.x), c.y, c.z)) - near[0]).length < near[1]


def refine(bm, faces, cuts):
    bmesh.ops.subdivide_edges(bm, edges=list({e for f in faces for e in f.edges}), cuts=cuts, use_grid_fill=True)


def cut(bm, fn, cuts=0, near=None):
    """Split the all-black faces along fn == 0 so markings have smooth edges instead of stair-steps."""
    black = MI["black"]
    if cuts:
        v0 = {v: fn(v.co) for v in bm.verts}
        refine(bm, [f for f in bm.faces if f.material_index == black and (not near or in_reach(f.calc_center_median(), near))
                    and min(v0[v] for v in f.verts) < 0.6 and max(v0[v] for v in f.verts) > -0.6], cuts)
    val = {v: fn(v.co) for v in bm.verts}
    fresh = set()
    for e in list(bm.edges):
        a, b = e.verts
        if val[a] * val[b] < 0 and all(f.material_index in (black, MI["white"]) for f in e.link_faces):
            fresh.add(bmesh.utils.edge_split(e, a, val[a] / (val[a] - val[b]))[1])
    for f in list(bm.faces):
        vs = [v for v in f.verts if v in fresh]
        if len(vs) == 2:
            try:
                bmesh.utils.face_split(f, vs[0], vs[1])
            except (ValueError, RuntimeError):
                pass


def paint_body(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for fn, mat, cuts, near in regions():
        cut(bm, fn, cuts, near)
        for f in bm.faces:
            if f.material_index == MI["black"] and fn(f.calc_center_median()) < 0:
                f.material_index = MI[mat]
    bm.to_mesh(obj.data)
    bm.free()


def paint_fins(obj):
    for p in obj.data.polygons:
        if p.material_index == MI["black"] and p.normal.z < -0.25 and abs(p.center.x) > 0.12 and p.center.y < 2.2:
            p.material_index = MI["white"]  # pectoral and fluke undersides (dorsal fin is at x ~ 0)


def top_z(body, y, x=0.0):
    hit = body.ray_cast(Vector((x, y, 3)), Vector((0, 0, -1)))
    return hit[1].z


def decimate_body(body, target, keep_pts=()):
    """Collapse-decimate to `target` triangles, keeping the marking boundaries and the mouth (group `keep`) dense."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    keep = set()
    for e in bm.edges:
        if len({f.material_index for f in e.link_faces}) > 1:
            keep.update(v.index for v in e.verts)
    keep.update(v.index for f in bm.faces if f.material_index == MI["mouth"] for v in f.verts)
    keep.update(v.index for v in bm.verts if any((v.co - h).length < 0.12 for h in keep_pts))
    bm.free()
    g = body.vertex_groups.new(name="keep")
    g.add(sorted(keep), 1.0, "REPLACE")
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    mod = body.modifiers.new("Dec", "DECIMATE")
    mod.ratio, mod.vertex_group, mod.vertex_group_factor = target / tris, "keep", 1.0
    mod.invert_vertex_group = True
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="Dec")
    print("DEC", tris, "->", sum(len(p.vertices) - 2 for p in body.data.polygons), "keep", len(keep), "ratio", mod.ratio)
    body.vertex_groups.remove(body.vertex_groups["keep"])


def fit_length(objs):
    """Subdivision shrinks the ends a little: stretch y so the whole model is exactly LENGTH long."""
    ys = [v.co.y for o in objs for v in o.data.vertices]
    lo, hi = min(ys), max(ys)
    for o in objs:
        for v in o.data.vertices:
            v.co.y = (v.co.y - lo) / (hi - lo) * LENGTH - HALF


def measure(body, parts_obj, eye_c, t_corner):
    fin_verts = [v for v in parts_obj.data.vertices if any(g.group == parts_obj.vertex_groups["Spine3"].index and g.weight > 0.5 for g in v.groups)]
    tip = max(fin_verts, key=lambda v: v.co.z).co
    by = y_of(0.16)
    ys = [y_of(0.16) - 0.02 * k for k in range(0, 70)]
    prof = [top_z(body, y) for y in ys]
    ymax = y_of(0.38)
    line = lambda y: prof[0] + (top_z(body, ymax) - prof[0]) * (ys[0] - y) / (ys[0] - ymax)
    dent = [y for y, z in zip(ys, prof) if y > ymax and z < line(y) - 0.004]
    ym = (HALF + y_of(t_corner)) / 2
    xs = [v.co.x for v in body.data.vertices]
    out = {
        "length": LENGTH, "halfLength": HALF,
        "halfWidth": round(max(abs(x) for x in xs), 3),
        "finHeight": round(tip.z - top_z(body, tip.y), 3),
        "blowhole": {"ahead": round(by, 3), "up": round(top_z(body, by), 3)},
        "eye": {"ahead": round(eye_c[0].y, 3), "up": round(eye_c[0].z, 3), "side": round(abs(eye_c[0].x) + EYE_R, 3)},
        "bite": {"ahead": round(ym, 3), "below": round(-ZEQ(t_of(ym)), 3)},
        "jawOpen": JAW_OPEN,
        "dentZ": [round(-max(dent), 3), round(-min(dent), 3)] if dent else [round(-by, 3), round(-by + 0.5, 3)],
        "finTip": [round(c, 3) for c in tip], "dentCount": len(dent),
    }
    print("ANATOMY", json.dumps(out))


def rig(obj, t_corner):
    arm_data = bpy.data.armatures.new("OrcaRig")
    arm = bpy.data.objects.new("OrcaRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    parent = None
    for i, name in enumerate(BN):
        bone = arm_data.edit_bones.new(name)
        bone.head, bone.tail = (0, y_of(JOINTS[i]), 0), (0, y_of(JOINTS[i + 1]), 0)
        bone.parent, bone.use_connect = parent, parent is not None
        parent = bone
    jaw = arm_data.edit_bones.new("Jaw")
    jaw.head, jaw.tail = (0, y_of(t_corner), ZEQ(t_corner) - 0.05), (0, HALF - 0.05, ZEQ(0) - 0.08)
    jaw.parent = arm_data.edit_bones["Head"]
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.parent = arm
    obj.modifiers.new("Armature", "ARMATURE").object = arm
    return arm


def clip(arm, name, frames, pose, step=2):
    """Keys `pose(bone_index, frame) -> pitch (positive = tail-ward part goes down)`; tail-ward bones point -Y."""
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for f in range(0, frames + 1, step):
        for i, bone in enumerate(BN):
            pb = arm.pose.bones[bone]
            sign = 1 if pb.bone.matrix_local.to_3x3().col[0].x > 0 else -1
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (sign * pose(i, f), 0, 0)
            pb.keyframe_insert("rotation_euler", frame=f)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    arm.animation_data.action = None


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    b = Builder()
    t_corner = body_cage(b)
    body = make_obj("Orca", b.bm)
    mod = body.modifiers.new("Sub", "SUBSURF")
    mod.levels = mod.render_levels = 1
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="Sub")
    paint_body(body)
    hits = eye_hits(body)
    prep_eyes(body, hits)
    pb_ = Builder()
    fins(pb_)
    teeth(pb_, t_corner)
    parts_tris = sum(len(f.verts) - 2 for f in pb_.bm.faces) + 760
    budget = MAX_TRIS - 300 - parts_tris
    if sum(len(p.vertices) - 2 for p in body.data.polygons) > budget:
        decimate_body(body, budget, [h for _, h in hits])
    eye_c = eyes(pb_, hits)
    parts = make_obj("Parts", pb_.bm)
    paint_fins(parts)
    fit_length([body, parts])
    measure(body, parts, eye_c, t_corner)
    for o in (parts, body):
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    mesh = body.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    ys = [v.co.y for v in mesh.vertices]
    print("LENGTH", max(ys) - min(ys), "tris", sum(len(p.vertices) - 2 for p in mesh.polygons))
    arm = rig(body, t_corner)
    amp = [0.015, 0.02, 0.03, 0.045, 0.065, 0.09, 0.14, 0.22]
    clip(arm, "Swim", 48, lambda i, f: amp[i] * math.sin(2 * math.pi * f / 48 - 0.55 * i))
    arch = [0.35, -0.30, -0.05, -0.02, 0.05, 0.12, 0.25, 0.25]
    clip(arm, "Lunge", 24, lambda i, f: arch[i] * math.sin(math.pi * f / 24))
    beached_clips(arm)
    return arm


# --- The beached death. Bones only (no root motion). Pitch: positive = the tail-ward part goes down; the
# chain pivots at each bone's head, so the Spine1..5 pitches roughly cancel to keep the rear body in place.
# BEACHED_REST is the pose she lies in; Beached, TailLift and Exhale all start from it (TailLift ends in it).
#            Head   S1      S2      S3      S4     S5     T1     T2
BEACHED_REST = [0.0, 0.0, 0.0, 0.03, 0.06, 0.07, 0.09, 0.07]
BEACHED_JAW = 0.010  # radians open at rest: lips a hair apart, the weight of the jaw


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def breath(p):
    """0 = rest, 1 = full in-breath. A slow in-breath, a held moment, then a quicker out-breath, then still."""
    if p < 0.46:
        return smooth(p / 0.46)
    if p < 0.58:
        return 1.0 + 0.06 * smooth((p - 0.46) / 0.12)  # the held moment creeps up a touch
    if p < 0.84:
        return 1.06 * (1 - smooth((p - 0.58) / 0.26) ** 0.8)
    return 0.0


def beached_pose(f):
    """Beached: frame f of 96 -> (bone pitches, jaw open). The chest heaves (Spine1-3), the head lifts on the in-breath."""
    p, v = f / 96, breath(f / 96)
    twitch = math.exp(-((p - 0.72) / 0.025) ** 2)  # one tiny quick flick of the flukes on the out-breath
    d = [0.0] * 8
    d[0] = -0.011 * v   # head: the nose lifts a little
    d[1] = -0.012 * v   # chest: the ribs swing up off the pebbles ...
    d[2] = 0.025 * v    # ... and the pitches cancel, so the rear body only lifts a little
    d[3] = -0.002 * v
    d[6] = -0.012 * v + 0.03 * twitch
    d[7] = 0.045 * twitch - 0.015 * v
    jaw = BEACHED_JAW + 0.065 * smooth((p - 0.10) / 0.36) * (1 - smooth((p - 0.62) / 0.18))
    return [BEACHED_REST[i] + d[i] for i in range(8)], jaw


def taillift_pose(f):
    """TailLift: frame f of 36. One weak, trembling lift of the flukes, a held instant, a heavy drop and a small rebound."""
    t = f / 36
    if t < 0.38:
        a = smooth(t / 0.38) ** 0.7 + 0.03 * math.sin(t * 60) * smooth(t / 0.38)  # lift, a little shaky
    elif t < 0.47:
        a = 1.0 - 0.02 * (t - 0.38) / 0.09
    elif t < 0.70:
        a = 0.98 * (1 - ((t - 0.47) / 0.23) ** 2)  # gravity: the drop accelerates
    elif t < 0.80:
        a = -0.06 * math.sin(math.pi * (t - 0.70) / 0.10)  # it lands, sinks a hair, comes back
    else:
        a = 0.0
    d = [0.0] * 8
    d[4], d[5], d[6], d[7] = -0.02 * a, -0.06 * a, -0.17 * a, -0.19 * a  # flukes up 0.36 rad (~21 deg) over rest at 1.0
    return [BEACHED_REST[i] + d[i] for i in range(8)], BEACHED_JAW + 0.01 * a


# Exhale ends here: lower than rest, everything slack. The head and back settle, the jaw closes.
EXHALE_END = [r + x for r, x in zip(BEACHED_REST, [0.0, -0.002, 0.008, 0.012, 0.004, 0.004, 0.012, 0.02])]


def exhale_pose(f):
    """Exhale: frame f of 72. A last small in-breath, one long sigh as the body sags, then still for the last 0.5 s."""
    t = f / 72
    up = smooth(t / 0.16) * (1 - smooth((t - 0.16) / 0.10))  # a final catch of breath
    sag = smooth((t - 0.16) / 0.67) ** 1.3 if t < 0.83 else 1.0  # the long slow sag, done at 2.5 s, then held
    d = [0.0] * 8
    d[0], d[1], d[2], d[3] = -0.003 * up, -0.014 * up, 0.020 * up, -0.003 * up
    pose = [BEACHED_REST[i] + d[i] + (EXHALE_END[i] - BEACHED_REST[i]) * sag for i in range(8)]
    jaw = (BEACHED_JAW + 0.06 * up) * (1 - sag)  # the jaw closes completely
    return pose, jaw


def pose_clip(arm, name, frames, pose, step=2):
    """Keys every bone each `step` frames from pose(f) -> (8 pitches for BN, jaw open). Bones only, no root motion."""
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for f in range(0, frames + 1, step):
        pitches, jaw = pose(f)
        for i, bone in enumerate(BN + ["Jaw"]):
            pb = arm.pose.bones[bone]
            sign = 1 if pb.bone.matrix_local.to_3x3().col[0].x > 0 else -1
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (sign * (-jaw if bone == "Jaw" else pitches[i]), 0, 0)
            pb.keyframe_insert("rotation_euler", frame=f)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    arm.animation_data.action = None


def beached_clips(arm):
    pose_clip(arm, "Beached", 96, beached_pose)
    pose_clip(arm, "TailLift", 36, taillift_pose)
    pose_clip(arm, "Exhale", 72, exhale_pose)
    for pb in arm.pose.bones:  # the export reads the live pose for the node tree: leave her in the bind pose
        pb.rotation_euler = (0, 0, 0)


def main():
    arm = build()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS")
    print("EXPORTED", OUT)


if __name__ == "__main__":
    main()
