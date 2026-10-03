"""Builds the Plan 3 props (pistol, barn, cabin, dam) and exports one GLB each (+ a Workbench preview PNG each).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/plan3_props.py -- public/assets/props

Axes: Blender +Z -> three +Y, Blender -Y -> three +Z, Blender +Y -> three -Z.
Previews (<name>.png) are written next to the GLBs; delete them before committing.
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/props")


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    world = bpy.data.worlds.new("w")
    world.color = (0.25, 0.25, 0.28)
    bpy.context.scene.world = world


def material(name: str, color: tuple, emission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    mat.diffuse_color = (*color, 1.0)  # Workbench MATERIAL colour
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def box(name, size, location, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def span(a, b, radius, mat, verts=8):
    """Cylinder between two points."""
    pa, pb = Vector(a), Vector(b)
    d = pb - pa
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length, location=(pa + pb) / 2)
    obj = bpy.context.active_object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = d.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    return obj


def prism(name, pts, x0, x1, mat):
    """Convex polygon in (y, z) extruded along x from x0 to x1, outward normals."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x0, y, z)) for y, z in pts])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(x1 - x0, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cut(obj, size, location):
    """Boolean-subtract a box from obj."""
    tool = box("cut", size, location, obj.data.materials[0])
    mod = obj.modifiers.new("cut", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", tool
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(tool)
    return obj


def slab(name, p, q, thick, length, mat):
    """Roof panel along x (length) between (y,z) points p->q, hanging inward (below) of that line."""
    dy, dz = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dy, dz)
    nrm = (dz / n, -dy / n)
    if nrm[1] > 0:
        nrm = (-nrm[0], -nrm[1])  # point downward
    cy = (p[0] + q[0]) / 2 + nrm[0] * thick / 2
    cz = (p[1] + q[1]) / 2 + nrm[1] * thick / 2
    return box(name, (length, n + 0.12, thick), (0, cy, cz), mat, (math.atan2(dz, dy), 0, 0))


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return joined


def preview(name, shots):
    """shots: [(suffix, camera location, target, lens)] -> Workbench PNGs next to the GLB."""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = 600, 400
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_backface_culling = "STUDIO", "MATERIAL", True
    for suffix, loc, target, lens in shots:
        cam = bpy.data.cameras.new("cam")
        cam.lens, cam.clip_end = lens, 500
        co = bpy.data.objects.new("cam", cam)
        bpy.context.collection.objects.link(co)
        co.location = loc
        co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        sc.camera = co
        sc.render.filepath = str(OUT / f"{name}{suffix}.png")
        bpy.ops.render.render(write_still=True)


def export(name, shots):
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")
    preview(name, shots)


def pistol() -> None:
    """0.19 x 0.13 x 0.035. Origin at the grip, barrel toward Blender +Y (three -Z)."""
    reset()
    metal = material("metal", (0.05, 0.05, 0.055))
    slide = material("slide", (0.085, 0.085, 0.095))
    grip = material("grip", (0.03, 0.025, 0.025))
    parts = [
        box("slide", (0.034, 0.19, 0.036), (0, 0.065, 0.027), slide),
        box("frame", (0.03, 0.14, 0.02), (0, 0.04, 0.0), metal),
        box("grip", (0.036, 0.04, 0.095), (0, -0.015, -0.035), grip, (-0.2, 0, 0)),
        box("guardF", (0.014, 0.008, 0.035), (0, 0.075, -0.02), metal),
        box("guardB", (0.014, 0.05, 0.008), (0, 0.05, -0.036), metal),
        box("trigger", (0.008, 0.008, 0.022), (0, 0.035, -0.012), metal),
        box("sightF", (0.006, 0.01, 0.008), (0, 0.15, 0.049), metal),
        box("sightR", (0.016, 0.01, 0.008), (0, -0.015, 0.049), metal),
        box("hammer", (0.008, 0.012, 0.016), (0, -0.034, 0.03), metal),
    ]
    join(parts, "pistol")
    export("pistol", [("", (0.2, -0.3, 0.12), (0, 0.04, -0.01), 50), ("_b", (-0.3, -0.1, 0.2), (0, 0.04, -0.01), 50)])


def barn() -> None:
    """10 x 7 x 8 gambrel barn, door (3 x 3.5) open on three +X. Hollow; floor top at z=0, origin floor centre."""
    reset()
    wood = material("wood", (0.18, 0.07, 0.05))
    roof = material("roof", (0.08, 0.08, 0.09))
    hay = material("hay", (0.35, 0.3, 0.15))
    prof = [(-4, 0), (4, 0), (4, 4.0), (2.4, 5.75), (0, 6.85), (-2.4, 5.75), (-4, 4.0)]
    parts = [box("floor", (10, 8, 0.2), (0, 0, -0.1), wood)]
    for s in (-1, 1):
        parts.append(box("wall", (10, 0.2, 4.0), (0, s * 3.9, 2.0), wood))
        for i in range(9):  # battens
            parts.append(box("batten", (0.14, 0.05, 3.9), (-4.4 + i * 1.1, s * 4.02, 1.95), wood))
        parts.append(slab("roof", (s * 4.0, 4.1), (s * 2.4, 5.85), 0.15, 10, roof))
        parts.append(slab("roof", (s * 2.4, 5.85), (0, 7.0), 0.15, 10, roof))
    parts.append(prism("gableB", prof, -5.0, -4.8, wood))
    front = prism("gableF", prof, 4.8, 5.0, wood)
    parts.append(cut(front, (0.6, 3.0, 3.6), (4.9, 0, 1.7)))  # 3 wide x 3.5 tall doorway (cutter dips 0.1 below z=0)
    for s in (-1, 1):  # door frame posts + lintel beam
        parts.append(box("jamb", (0.3, 0.2, 3.6), (5.0, s * 1.6, 1.8), wood))
    parts.append(box("lintel", (0.3, 3.4, 0.2), (5.0, 0, 3.6), wood))
    # hayloft at the back: platform, posts, front beam, ridge beam, tie beam, hay
    parts.append(box("loft", (3.6, 7.6, 0.15), (-3.0, 0, 3.0), wood))
    parts.append(box("loftBeam", (0.3, 7.8, 0.3), (-1.15, 0, 2.85), wood))
    for s in (-1, 1):
        parts.append(box("post", (0.25, 0.25, 2.8), (-1.15, s * 3.6, 1.4), wood))
    parts.append(box("ridge", (9.8, 0.3, 0.3), (0, 0, 6.5), wood))
    parts.append(box("tie", (0.25, 7.4, 0.25), (1.5, 0, 4.4), wood))
    for i, (x, y, w) in enumerate([(-3.5, -2, 1.6), (-3.0, 1.5, 2.0), (-2.2, -0.3, 1.0), (-4.0, 3.0, 1.2)]):
        parts.append(box("hay", (w, 1.1, 0.7 + 0.1 * i), (x, y, 3.075 + 0.35 + 0.05 * i), hay))
    for i, (x, y) in enumerate([(-3.8, -3.0), (-3.8, -2.0), (-3.8, -3.0), (-3.0, 3.0)]):
        parts.append(box("bale", (0.9, 0.45, 0.45), (x, y, 0.225 + (0.45 if i == 2 else 0)), hay))
    join(parts, "barn")
    export("barn", [("", (17, -13, 8), (0, 0, 3.2), 32), ("_b", (13, -1.5, 1.7), (0, 0, 2.6), 28)])


def log_row(parts, mat, axis, fixed, z, lo, hi, gaps):
    """Horizontal log along 'x' (at y=fixed) or 'y' (at x=fixed) from lo..hi, skipping gap intervals."""
    edges = [lo] + [e for g in gaps for e in g] + [hi]
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a < 0.01:
            continue
        p, q = ((a, fixed, z), (b, fixed, z)) if axis == "x" else ((fixed, a, z), (fixed, b, z))
        parts.append(span(p, q, 0.125, mat, 8))


def cabin() -> None:
    """5 x 3.6 x 4 ranger cabin, door (1 x 2.1) on three +X, hollow. Origin floor centre (floor top z=0)."""
    reset()
    wood = material("wood", (0.12, 0.07, 0.045))
    roof = material("roof", (0.06, 0.06, 0.065))
    glass = material("window", (1.0, 0.6, 0.25), emission=0.8)
    lamp = material("lantern", (1.0, 0.65, 0.25), emission=2.0)
    iron = material("metal", (0.05, 0.05, 0.055))
    parts = [box("floor", (4.2, 3.9, 0.15), (0, 0, -0.075), wood)]
    for i in range(10):
        z = 0.125 + i * 0.24
        low = z - 0.125 < 2.1
        win = [(-1.5, -0.5)] if 1.1 < z + 0.125 and z - 0.125 < 1.9 else []
        log_row(parts, wood, "x", 1.8, z, -2.0, 2.0, [])
        log_row(parts, wood, "x", -1.8, z, -2.0, 2.0, win)
        log_row(parts, wood, "y", -1.88, z, -1.92, 1.92, [])
        log_row(parts, wood, "y", 1.88, z, -1.92, 1.92, [(-0.5, 0.5)] if low else [])
    prof = [(-1.95, 2.4), (1.95, 2.4), (0, 3.45)]
    parts += [prism("gable", prof, s * 1.88 - 0.1, s * 1.88 + 0.1, wood) for s in (-1, 1)]
    for s in (-1, 1):
        parts.append(slab("roof", (s * 2.0, 2.5), (0, 3.6), 0.1, 5.0, roof))
    parts.append(box("deck", (0.6, 2.0, 0.12), (2.3, 0, 0.06), wood))  # porch deck, roof overhangs it
    parts += [box("post", (0.12, 0.12, 2.4), (2.4, s * 0.95, 1.2), wood) for s in (-1, 1)]
    parts.append(box("frame", (0.1, 1.1, 0.1), (1.95, 0, 2.2), wood))  # door lintel
    parts.append(box("sill", (1.0, 0.1, 0.06), (-1.0, -1.9, 1.07), wood))  # window sill
    parts.append(box("pane", (0.9, 0.06, 0.7), (-1.0, -1.8, 1.5), glass))
    parts.append(box("bracket", (0.2, 0.04, 0.04), (2.0, 0.9, 1.95), iron))
    parts.append(box("lantern", (0.12, 0.12, 0.2), (2.12, 0.9, 1.78), lamp))
    parts.append(box("lanternCap", (0.16, 0.16, 0.03), (2.12, 0.9, 1.9), iron))
    join(parts, "cabin")
    export("cabin", [("", (8, -6.5, 3.5), (0.3, 0, 1.7), 32), ("_b", (6.5, 0.4, 1.6), (0, 0, 1.4), 30)])


def stair(parts, mat, x0, x1, z0, z1, face_y):
    """Solid concrete steps (0.3 rise) from (x0,z0) to (x1,z1) hugging the sloped downstream face."""
    n = max(1, round(abs(z1 - z0) / 0.3))
    for i in range(n):
        top = z0 + (i + 1) * (z1 - z0) / n
        xa, xb = x0 + i * (x1 - x0) / n, x0 + (i + 1) * (x1 - x0) / n
        y_out, y_in = face_y(z0) - 1.2, face_y(top) + 0.3
        parts.append(box("step", (abs(xb - xa) + 0.001, y_in - y_out, top - z0), ((xa + xb) / 2, (y_out + y_in) / 2, (z0 + top) / 2), mat))


def dam() -> None:
    """44 m gravity dam, 18 m tall, base 10 -> 4 m. Downstream face toward three +Z (Blender -Y). Origin base centre."""
    reset()
    conc = material("concrete", (0.32, 0.33, 0.32))
    stain = material("stain", (0.12, 0.13, 0.12))
    iron = material("metal", (0.06, 0.06, 0.06))
    glass = material("window", (1.0, 0.65, 0.3), emission=1.2)
    face_y = lambda z: -5 + z / 3  # downstream face: (-5, 0) -> (1, 18)
    body = prism("body", [(-5, 0), (5, 0), (5, 18), (1, 18)], -22, 22, conc)
    cut(body, (8, 12, 3.0), (0, 0, 17.5))  # spillway notch, crest drops to z=16
    parts = [body]
    theta = math.atan(1 / 3)
    nrm = Vector((-math.cos(theta), math.sin(theta)))
    for x, w, z1 in [(0, 3.0, 16), (-1.6, 0.5, 11), (1.4, 0.7, 9), (0.3, 1.2, 6)]:
        zc = z1 / 2
        c = Vector((face_y(zc), zc)) + nrm * 0.03
        parts.append(box("streak", (w, 0.05, z1 / math.cos(theta)), (x, c.x, c.y), stain, (-theta, 0, 0)))
    for sy in (1.2, 4.8):  # walkway rails, skipping the spillway
        for x in range(-22, 23, 2):
            if abs(x) > 5:
                parts.append(box("rp", (0.1, 0.1, 1.1), (x * 0.99, sy, 18.55), iron))
        for a, b in ((-21.9, -5), (5, 21.9)):
            parts.append(box("rail", (b - a, 0.08, 0.08), ((a + b) / 2, sy, 19.55), iron))
    parts.append(box("house", (6, 4, 3.5), (-15, 3, 19.75), conc))
    parts.append(box("hroof", (6.6, 4.5, 0.2), (-15, 3, 21.6), iron))
    parts.append(box("hwin", (1.2, 0.08, 0.9), (-16.5, 0.98, 19.9), glass))
    parts.append(box("hdoor", (1.0, 0.08, 2.0), (-13.5, 0.98, 19.0), iron))
    for z0, z1, xa, xb in [(0, 1.8, -18, -16), (1.8, 5.4, -16, -20), (5.4, 9.0, -20, -16), (9.0, 12.6, -16, -20), (12.6, 16.2, -20, -16), (16.2, 18, -16, -18)]:
        stair(parts, conc, xa, xb, z0, z1, face_y)
    parts.append(box("landing", (2.2, 1.6, 0.15), (-18, -5.8, 0.075), conc))
    join(parts, "dam")
    export("dam", [("", (-30, -48, 16), (-4, 0, 9), 36), ("_b", (-24, -20, 8), (-17, -4, 9), 40)])


for build in (pistol, barn, cabin, dam):
    build()
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
