"""Builds Kartik's bedroom ceiling fan (metres, Z up in Blender, hangs down from z = 0 = the ceiling).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/ceiling_fan.py
Optional output path: ... -- public/assets/home/ceilingFan.glb

Nodes: CeilingFan (empty, origin = ceiling mount point) > Fixture (canopy, rod, motor, trim, glass bowl)
and Blades (blades + irons; origin on the spin axis, so the game spins just this node about Y).
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/home/ceilingFan.glb")

SEGMENTS = 32  # round parts
BLADES = 4
BLADE_ROOT, BLADE_TIP = 0.17, 0.575  # radial extent, m (span = 2 * BLADE_TIP = 1.15 m)
BLADE_WIDTH, BLADE_THICK = 0.15, 0.014
BLADE_PITCH = math.radians(12)
BLADE_Z = -0.385  # blade underside height below the ceiling
IRON_Z = -0.372
SPIN_Z = -0.372  # Blades origin height (motor mid-height)


def material(name, color, metal, rough):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def wood_material():
    """Walnut: streaks along the blade length with a little waviness, baked to a 256 px image."""
    size = 256
    rng = np.random.default_rng(11)
    v = np.linspace(0, 1, size)[:, None]
    u = np.linspace(0, 1, size)[None, :]
    grain = np.zeros((size, size))
    for freq in (9, 23, 61):
        grain += rng.uniform(0.5, 1) / freq * np.sin(freq * 6.28 * v + rng.uniform(0, 6.28) + 1.4 * np.sin(2.3 * u + freq))
    grain += rng.normal(0, 0.02, (size, size))
    t = np.clip(0.5 + grain * 3.0, 0, 1)
    dark, light = np.array([0.075, 0.036, 0.018]), np.array([0.17, 0.088, 0.045])  # linear walnut
    rgb = dark + (light - dark) * t[..., None]
    img = bpy.data.images.new("walnutGrain", size, size)
    img.pixels = np.concatenate([rgb, np.ones((size, size, 1))], axis=2).ravel().tolist()
    img.pack()
    mat = bpy.data.materials.new("walnut")
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def make_object(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def lathe(name, profile, mat, closed=False):
    """Revolves (radius, z) points about Z. A radius of 0 is a single pole vertex."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r == 0:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(i * math.tau / SEGMENTS), r * math.sin(i * math.tau / SEGMENTS), z)) for i in range(SEGMENTS)])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            quad = [a[i % len(a)], a[j % len(a)], b[j % len(b)], b[i % len(b)]]
            quad = list(dict.fromkeys(quad))  # collapse the pole
            if len(quad) >= 3:
                bm.faces.new(quad)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return make_object(name, bm, mat)


def blade_outline():
    w, length = BLADE_WIDTH / 2, BLADE_TIP - BLADE_ROOT
    cut, tip_r = 0.012, BLADE_WIDTH / 2 * 0.98
    pts = [(cut, -w), (length - tip_r, -w)]
    pts += [(length - tip_r + tip_r * math.sin(t), -tip_r * math.cos(t)) for t in np.linspace(0.3, math.pi - 0.3, 9)]
    pts += [(length - tip_r, w), (cut, w), (0, w - cut), (0, -w + cut)]
    return pts


def beveled(obj, width):
    """Applies a bevel to the object's mesh (so the exported mesh has real rounded edges)."""
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width, mod.segments, mod.limit_method = width, 2, "ANGLE"
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)
    return obj


def blade(k, mat):
    """One blade: root at BLADE_ROOT along +X, pitched about its radial axis, rotated k quarter turns."""
    length = BLADE_TIP - BLADE_ROOT
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in blade_outline()])
    top = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in top["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, 0, BLADE_THICK))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.x / length, (co.y + BLADE_WIDTH / 2) / BLADE_WIDTH)
    m = Matrix.Rotation(k * math.tau / BLADES, 4, "Z") @ Matrix.Translation((BLADE_ROOT, 0, BLADE_Z)) @ Matrix.Rotation(BLADE_PITCH, 4, "X")
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return beveled(make_object(f"blade{k}", bm, mat), 0.004)


def iron(k, mat):
    """A flat bar from the motor out under the blade root."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = ((v.co.x + 0.5) * 0.17 + 0.095, v.co.y * 0.04, IRON_Z + v.co.z * 0.011)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(k * math.tau / BLADES, 4, "Z"), verts=bm.verts)
    return beveled(make_object(f"iron{k}", bm, mat), 0.002)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.active_object
    out.name = name
    return out


def smooth(obj, deg=40):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


def build_fixture(bronze, glass):
    canopy = [(0, 0), (0.1, 0), (0.104, -0.008), (0.098, -0.028), (0.072, -0.05), (0.04, -0.062), (0.02, -0.066), (0, -0.066)]
    rod = [(0, -0.06), (0.014, -0.06), (0.014, -0.3), (0, -0.3)]
    housing = [(0, -0.29), (0.05, -0.292), (0.085, -0.31), (0.108, -0.338), (0.118, -0.372), (0.108, -0.406),
               (0.088, -0.424), (0.07, -0.428), (0, -0.428)]
    trim = [(0.07, -0.424), (0.118, -0.424), (0.128, -0.431), (0.13, -0.44), (0.122, -0.448), (0.07, -0.448)]
    arc = [(0.086 * math.cos(a), -0.448 - 0.07 * math.sin(a)) for a in (i * math.pi / 2 / 9 for i in range(9))]
    bowl = [(0, -0.448)] + arc + [(0, -0.518)]
    fixture = join([
        lathe("canopy", canopy, bronze),
        lathe("rod", rod, bronze),
        lathe("housing", housing, bronze),
        lathe("trim", trim, bronze, closed=True),
        lathe("bowl", bowl, glass),
    ], "Fixture")
    smooth(fixture)
    return fixture


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bronze = material("bronze", (0.16, 0.085, 0.04), 0.7, 0.4)
    glass = material("glassBowl", (0.82, 0.79, 0.7), 0.0, 0.3)
    walnut = wood_material()

    root = bpy.data.objects.new("CeilingFan", None)
    bpy.context.scene.collection.objects.link(root)
    fixture = build_fixture(bronze, glass)
    parts = []
    for k in range(BLADES):
        parts += [blade(k, walnut), iron(k, bronze)]
    blades = join(parts, "Blades")
    smooth(blades)
    bpy.context.scene.cursor.location = (0, 0, SPIN_Z)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")  # origin on the spin axis
    for o in (fixture, blades):
        o.parent = root
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB")
    tris = sum(len(p.vertices) - 2 for o in (fixture, blades) for p in o.data.polygons)
    print("EXPORTED", OUT, "tris", tris, "span", 2 * BLADE_TIP)


main()
