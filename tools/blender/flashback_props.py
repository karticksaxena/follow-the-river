"""Builds the Plan 5 tape-flashback props (lab, tank, cage) and exports one GLB each (+ a Workbench preview PNG each).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/flashback_props.py -- public/assets/props

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


def dims(name: str, obj) -> None:
    d = obj.dimensions
    print(f"DIMS {name} x={d.x:.3f} y(three z)={d.y:.3f} z(three y)={d.z:.3f} mats={[m.name for m in obj.data.materials]}")


def lab() -> None:
    """8 (x) x 6 (three z) x 3 (three y) dim lab. Open side toward three +Z (Blender -Y); floor top z=0.1 is part of the 3 m."""
    reset()
    conc = material("Concrete", (0.17, 0.18, 0.19))
    floor = material("Floor", (0.09, 0.1, 0.11))
    steel = material("Steel", (0.28, 0.3, 0.32))
    teal = material("Teal", (0.05, 0.22, 0.22))
    jar = material("Jar", (0.1, 0.3, 0.25))
    screen = material("Screen", (0.08, 0.12, 0.2), emission=0.6)
    lamp = material("Lamp", (1.0, 0.05, 0.03), emission=2.0)
    parts = [
        box("floor", (8, 6, 0.1), (0, 0, 0.05), floor),
        box("ceiling", (8, 6, 0.1), (0, 0, 2.95), conc),
        box("back", (8, 0.1, 2.8), (0, 2.95, 1.5), conc),
        box("left", (0.1, 6, 2.8), (-3.95, 0, 1.5), conc),
        box("right", (0.1, 6, 2.8), (3.95, 0, 1.5), conc),
    ]
    # door frame on the right wall (three +X), opening 1 x 2.1
    parts += [box("jamb", (0.14, 0.1, 2.1), (3.88, y, 1.15), steel) for y in (-0.5, 0.5)]
    parts.append(box("lintel", (0.14, 1.1, 0.1), (3.88, 0, 2.25), steel))
    parts.append(box("door", (0.04, 0.9, 2.05), (3.88, 0, 1.125), teal))
    # long bench along the back wall
    parts.append(box("bench", (5.6, 0.8, 0.08), (-0.4, 2.5, 0.9), steel))
    for x in (-3.1, -0.4, 2.3):
        parts.append(box("benchLeg", (0.08, 0.7, 0.8), (x, 2.5, 0.5), steel))
    for x in (-2.0, 0.9):  # monitors: body, screen on the -Y (open) face, stand
        parts.append(box("monitor", (0.7, 0.08, 0.45), (x, 2.6, 1.3), steel))
        parts.append(box("screen", (0.6, 0.02, 0.35), (x, 2.55, 1.3), screen))
        parts.append(box("stand", (0.12, 0.12, 0.12), (x, 2.62, 1.0), steel))
    # red warning lamp on the back wall
    parts.append(box("lampBase", (0.3, 0.08, 0.3), (2.6, 2.86, 2.4), steel))
    parts.append(box("lamp", (0.22, 0.12, 0.22), (2.6, 2.78, 2.4), lamp))
    # shelves with jars on the left wall
    for z in (0.9, 1.5, 2.1):
        parts.append(box("shelf", (0.35, 3.0, 0.05), (-3.75, 0.6, z), steel))
        for i in range(8):
            parts.append(box("jar", (0.14, 0.14, 0.2 + 0.03 * (i % 3)), (-3.75, -0.7 + i * 0.37, z + 0.14), jar))
    obj = join(parts, "lab")
    dims("lab", obj)
    export("lab", [("", (0, -11, 2.2), (0, 0, 1.4), 32), ("_b", (6, -7, 2.0), (-1, 1, 1.2), 30)])


def tank() -> None:
    """5 (x) x 3 (three z) x 2.5 (three y) aquarium on a 0.3 plinth. Origin floor centre."""
    reset()
    plinth = material("Plinth", (0.1, 0.1, 0.11))
    steel = material("Steel", (0.25, 0.27, 0.29))
    glass = material("Glass", (0.4, 0.6, 0.65))
    water = material("Water", (0.02, 0.1, 0.13))
    W, D, H, P, T = 5.0, 3.0, 2.5, 0.3, 0.05
    parts = [box("plinth", (W - 0.2, D - 0.2, P), (0, 0, P / 2), plinth)]
    parts.append(box("water", (W - 0.3, D - 0.3, H - P - 0.3), (0, 0, P + (H - P - 0.3) / 2), water))
    for x in (-1, 1):
        for y in (-1, 1):
            parts.append(box("post", (0.1, 0.1, H - P), (x * (W / 2 - 0.05), y * (D / 2 - 0.05), P + (H - P) / 2), steel))
    for z in (P + 0.05, H - 0.05):  # bottom and top frame rails
        for y in (-1, 1):
            parts.append(box("railX", (W, 0.1, 0.1), (0, y * (D / 2 - 0.05), z), steel))
        for x in (-1, 1):
            parts.append(box("railY", (0.1, D - 0.2, 0.1), (x * (W / 2 - 0.05), 0, z), steel))
    gh = H - P - 0.2
    gz = P + 0.1 + gh / 2
    for y in (-1, 1):
        parts.append(box("glassF", (W - 0.2, T, gh), (0, y * (D / 2 - 0.05), gz), glass))
    for x in (-1, 1):
        parts.append(box("glassS", (T, D - 0.2, gh), (x * (W / 2 - 0.05), 0, gz), glass))
    obj = join(parts, "tank")
    dims("tank", obj)
    export("tank", [("", (4, -9, 3), (0, 0, 1.2), 32)])


def cage() -> None:
    """0.5 x 0.35 x 0.35 mouse cage, front (-Y) door bent open. Origin floor centre."""
    reset()
    plastic = material("Tray", (0.3, 0.3, 0.32))
    wire = material("Wire", (0.45, 0.46, 0.5))
    X, Y, Z, t = 0.5, 0.3, 0.35, 0.006
    parts = [box("tray", (X, Y, 0.05), (0, 0, 0.025), plastic)]
    for x in (-1, 1):
        parts.append(box("postX", (0.01, 0.01, Z - 0.05), (x * (X / 2 - 0.005), 0, 0.05 + (Z - 0.05) / 2), wire))
    for i in range(-5, 6):  # back and side bars
        parts.append(box("barBack", (t, t, Z - 0.05), (i * 0.04, Y / 2 - 0.01, 0.05 + (Z - 0.05) / 2), wire))
    for s in (-1, 1):
        for i in range(-3, 4):
            parts.append(box("barSide", (t, t, Z - 0.05), (s * (X / 2 - 0.005), i * 0.04, 0.05 + (Z - 0.05) / 2), wire))
    parts.append(box("topFrame", (X, 0.01, 0.01), (0, Y / 2 - 0.01, Z - 0.005), wire))
    parts.append(box("topFrameF", (X, 0.01, 0.01), (0, -Y / 2 + 0.01, Z - 0.005), wire))
    for s in (-1, 1):
        parts.append(box("topFrameS", (0.01, Y, 0.01), (s * (X / 2 - 0.005), 0, Z - 0.005), wire))
    for i in range(-5, 6):  # lid bars
        parts.append(box("lid", (t, Y - 0.02, t), (i * 0.04, 0, Z - 0.01), wire))
    # front: fixed left half; right half is the door, hinged at x=0.245 and bent open ~100 degrees
    for i in range(-5, 0):
        parts.append(box("barFront", (t, t, Z - 0.05), (i * 0.04, -Y / 2 + 0.01, 0.05 + (Z - 0.05) / 2), wire))
    parts.append(box("frontRail", (0.22, 0.01, 0.01), (-0.135, -Y / 2 + 0.01, 0.12), wire))
    hinge = (X / 2 - 0.005, -Y / 2 + 0.01)
    ang = math.radians(100)  # door swings outward around the right post
    for i in range(0, 6):
        d = 0.04 * i
        px = hinge[0] + d * math.cos(math.pi - ang)
        py = hinge[1] - d * math.sin(math.pi - ang)
        parts.append(box("doorBar", (t, t, Z - 0.1), (px, py, 0.05 + (Z - 0.1) / 2 + 0.02), wire))
    ex, ey = hinge[0] + 0.2 * math.cos(math.pi - ang), hinge[1] - 0.2 * math.sin(math.pi - ang)
    for z in (0.08, Z - 0.06):
        parts.append(span((hinge[0], hinge[1], z), (ex, ey, z), 0.004, wire, 6))
    obj = join(parts, "cage")
    dims("cage", obj)
    export("cage", [("", (0.8, -1.1, 0.7), (0, 0, 0.15), 40)])


for build in (lab, tank, cage):
    build()
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
