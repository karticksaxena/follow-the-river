"""Builds the Dream 1 props (bow, arrows, pickups, TV, couch, rooms) and exports one GLB each.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/dream1_props.py -- public/assets/props

Axes: Blender +Z -> three +Y, Blender -Y -> three +Z, Blender +Y -> three -Z.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/props")


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple, emission: float = 0.0, alpha: float = 1.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def box(name: str, size: tuple, location: tuple, mat: bpy.types.Material, rot: tuple = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def span(kind: str, a: tuple, b: tuple, radius: float, mat: bpy.types.Material, verts: int = 8) -> bpy.types.Object:
    """Cylinder or cone (tip at b) between two points."""
    pa, pb = Vector(a), Vector(b)
    d = pb - pa
    add = bpy.ops.mesh.primitive_cone_add if kind == "cone" else bpy.ops.mesh.primitive_cylinder_add
    kw = {"radius1": radius} if kind == "cone" else {"radius": radius}
    add(vertices=verts, depth=d.length, location=(pa + pb) / 2, **kw)
    obj = bpy.context.active_object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = d.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    return obj


def smooth(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()


def join(objects: list, name: str) -> bpy.types.Object:
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


def ground(obj: bpy.types.Object) -> None:
    """Move the mesh so the origin sits at bottom centre."""
    pts = [v.co for v in obj.data.vertices]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    obj.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))


def export(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")


def bow() -> None:
    """1.2 m recurve. Grip at origin, limbs along Z, string toward Blender -Y (three +Z)."""
    reset()
    wood = material("wood", (0.1, 0.065, 0.04))
    string = material("string", (0.16, 0.15, 0.12))
    curve = [(0.0, 0.0), (0.2, -0.04), (0.4, -0.09), (0.54, -0.125), (0.6, -0.105)]
    parts = []
    for sign in (1, -1):
        for i in range(len(curve) - 1):
            r = 0.016 - 0.0025 * i
            a = (0, curve[i][1], sign * curve[i][0])
            b = (0, curve[i + 1][1], sign * curve[i + 1][0])
            parts.append(span("cyl", a, b, r, wood, 8))
    parts.append(span("cyl", (0, 0.002, -0.07), (0, 0.002, 0.07), 0.022, wood, 10))
    for p in parts:
        smooth(p)
    parts.append(span("cyl", (0, -0.105, -0.6), (0, -0.105, 0.6), 0.003, string, 6))
    join(parts, "bow")
    export("bow")


def arrow_parts(x: float, z: float, roll: float = 0.0) -> list:
    shaft = material("shaft", (0.12, 0.09, 0.06))
    tip = material("tip", (0.13, 0.13, 0.14))
    fletch = material("fletch", (0.16, 0.05, 0.05))
    parts = [
        span("cyl", (x, -0.36, z), (x, 0.36, z), 0.004, shaft, 8),
        span("cone", (x, 0.36, z), (x, 0.42, z), 0.007, tip, 6),
    ]
    for i in range(3):
        a = roll + i * 2 * math.pi / 3
        r = 0.004 + 0.015
        parts.append(box("fletch", (0.03, 0.12, 0.002), (x + r * math.cos(a), -0.28, z + r * math.sin(a)), fletch, (0, -a, 0)))
    return parts


def arrow() -> None:
    """Shaft along Blender +Y, so the tip points to three -Z."""
    reset()
    join(arrow_parts(0, 0), "arrow")
    export("arrow")


def arrows() -> None:
    reset()
    parts = []
    for i, (x, z) in enumerate([(-0.0045, 0.0), (0.0045, 0.0), (0.0, 0.0078)]):
        parts += arrow_parts(x, z, roll=i * 0.5)
    parts.append(span("cyl", (0, 0.05, 0.0035), (0, 0.08, 0.0035), 0.0105, material("band", (0.1, 0.08, 0.05)), 8))
    obj = join(parts, "arrows")
    ground(obj)
    export("arrows")


def battery() -> None:
    """D cell, 2x scaled so it reads in the dark. Origin at bottom centre."""
    reset()
    metal = material("metal", (0.08, 0.08, 0.09))
    glow = material("glowBand", (1.0, 0.85, 0.2), emission=1.5)
    parts = [
        span("cyl", (0, 0, 0), (0, 0, 0.112), 0.034, metal, 12),
        span("cyl", (0, 0, 0.112), (0, 0, 0.12), 0.012, metal, 12),
        span("cyl", (0, 0, 0.035), (0, 0, 0.075), 0.0348, glow, 12),
    ]
    for p in parts:
        smooth(p)
    join(parts, "battery")
    export("battery")


def tape() -> None:
    """Cassette 0.20 x 0.128 x 0.024 (2x scaled), flat, origin at bottom centre."""
    reset()
    plastic = material("plastic", (0.03, 0.03, 0.035))
    label = material("label", (0.8, 0.78, 0.7), emission=0.6)
    parts = [
        box("body", (0.2, 0.128, 0.022), (0, 0, 0.011), plastic),
        box("label", (0.15, 0.06, 0.002), (0, 0.025, 0.023), label),
    ]
    for x in (-0.04, 0.04):
        parts.append(span("cyl", (x, -0.03, 0.0), (x, -0.03, 0.0235), 0.016, plastic, 10))
    join(parts, "tape")
    export("tape")


def fishpack() -> None:
    """Styrofoam tray with two fish under (translucent) pale-blue plastic wrap."""
    reset()
    tray = material("tray", (0.3, 0.3, 0.28))
    fish = material("fish", (0.2, 0.22, 0.24))
    wrap = material("wrap", (0.5, 0.65, 0.8), emission=0.4, alpha=0.4)
    parts = [box("tray", (0.3, 0.18, 0.03), (0, 0, 0.015), tray)]
    for y in (-0.04, 0.045):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(-0.02, y, 0.056))
        body = bpy.context.active_object
        body.scale = (0.1, 0.03, 0.026)
        bpy.ops.object.transform_apply(scale=True)
        body.data.materials.append(fish)
        smooth(body)
        parts.append(body)
        parts.append(span("cone", (0.15, y, 0.056), (0.09, y, 0.056), 0.03, fish, 4))
    parts.append(box("wrap", (0.3, 0.18, 0.065), (0, 0, 0.0625), wrap))
    join(parts, "fishpack")
    export("fishpack")


def tv() -> None:
    """CRT on a low stand. Front faces Blender -Y (three +Z). Separate 'Screen' quad."""
    reset()
    case = material("case", (0.07, 0.065, 0.06))
    wood = material("wood", (0.1, 0.065, 0.04))
    screen_mat = material("Screen", (0.02, 0.025, 0.025))
    h = 0.55
    zc = 0.5 + h / 2
    parts = [box("stand", (0.6, 0.4, 0.5), (0, 0, 0.25), wood)]
    parts.append(box("back", (0.5, 0.26, 0.42), (0, 0.12, zc - 0.02), case))
    parts.append(box("inner", (0.7, 0.22, h), (0, -0.14, zc), case))
    for sx in (-1, 1):
        parts.append(box("side", (0.1, 0.03, h), (sx * 0.3, -0.265, zc), case))
    for sz in (-1, 1):
        parts.append(box("rim", (0.5, 0.03, 0.085), (0, -0.265, zc + sz * 0.2325), case))
    for dz in (-0.08, 0.08):
        parts.append(span("cyl", (0.3, -0.28, zc + dz), (0.3, -0.25, zc + dz), 0.022, case, 8))
    # 6 mm proud of the case front (y -0.25): flush, the two faces z-fight and the news vanishes.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.256, zc), rotation=(math.pi / 2, 0, 0))
    screen = bpy.context.active_object
    screen.name = "Screen"
    screen.scale = (0.5, 0.38, 1)
    bpy.ops.object.transform_apply(scale=True)
    screen.data.materials.append(screen_mat)
    parts.append(screen)
    join(parts, "tv")
    export("tv")


def couch() -> None:
    """2.0 x 0.9 x 0.85. Front faces Blender +Y (three -Z). Origin at floor centre."""
    reset()
    fabric = material("fabric", (0.09, 0.07, 0.06))
    wood = material("wood", (0.1, 0.065, 0.04))
    parts = [box("leg", (0.1, 0.1, 0.12), (sx * 0.9, sy * 0.36, 0.06), wood) for sx in (-1, 1) for sy in (-1, 1)]
    parts.append(box("base", (2.0, 0.85, 0.23), (0, 0, 0.235), fabric))
    parts.append(box("back", (2.0, 0.2, 0.55), (0, -0.325, 0.625), fabric))
    for sx in (-1, 1):
        parts.append(box("arm", (0.2, 0.85, 0.35), (sx * 0.9, 0, 0.475), fabric))
        parts.append(box("cushion", (0.8, 0.65, 0.16), (sx * 0.4, 0.1, 0.43), fabric))
    join(parts, "couch")
    export("couch")


def livingroom() -> None:
    """Outer 7 x 5 x 2.8 shell. Door in the -X wall at three z=+1.2 (Blender y=-1.2), window in three +Z wall."""
    reset()
    wall = material("wall", (0.17, 0.15, 0.12))
    floor = material("floor", (0.08, 0.06, 0.045))
    ceil = material("ceiling", (0.15, 0.14, 0.12))
    glass = material("windowGlass", (0.3, 0.4, 0.6), emission=0.3)

    def seg(x0, x1, y0, y1, z0, z1, mat=wall):
        return box("w", (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat)

    parts = [seg(-3.5, 3.5, -2.5, 2.5, -0.1, 0.0, floor), seg(-3.5, 3.5, -2.5, 2.5, 2.6, 2.7, ceil)]
    parts += [seg(-3.5, 3.5, 2.35, 2.5, -0.1, 2.7), seg(3.35, 3.5, -2.35, 2.35, -0.1, 2.7)]
    # -X wall with doorway y -1.75..-0.65, z up to 2.1
    parts += [seg(-3.5, -3.35, -2.35, -1.75, -0.1, 2.7), seg(-3.5, -3.35, -0.65, 2.35, -0.1, 2.7)]
    parts.append(seg(-3.5, -3.35, -1.75, -0.65, 2.1, 2.7))
    # -Y wall (three +Z) with window x -0.7..0.7, z 1.0..2.0
    y0, y1 = -2.5, -2.35
    parts += [seg(-3.5, -0.7, y0, y1, -0.1, 2.7), seg(0.7, 3.5, y0, y1, -0.1, 2.7)]
    parts += [seg(-0.7, 0.7, y0, y1, -0.1, 1.0), seg(-0.7, 0.7, y0, y1, 2.0, 2.7)]
    parts.append(seg(-0.7, 0.7, -2.44, -2.42, 1.0, 2.0, glass))
    # skirting
    parts += [seg(-3.35, 3.35, 2.32, 2.35, 0, 0.12, floor), seg(-3.35, 3.35, -2.35, -2.32, 0, 0.12, floor)]
    parts += [seg(3.32, 3.35, -2.35, 2.35, 0, 0.12, floor), seg(-3.35, -3.32, -2.35, -1.75, 0, 0.12, floor)]
    parts.append(seg(-3.35, -3.32, -0.65, 2.35, 0, 0.12, floor))
    join(parts, "livingroom")
    export("livingroom")


def boathouse() -> None:
    """Shed x -3..1 (open toward +X), dock to x=3, gabled roof, lantern from the ridge. Origin: floor centre."""
    reset()
    timber = material("timber", (0.08, 0.06, 0.045))
    roof = material("roof", (0.05, 0.05, 0.055))
    lamp = material("lantern", (1.0, 0.65, 0.25), emission=3.0)
    parts = []
    for i in range(12):  # dock planks, across Y
        x = -2.75 + i * 0.5
        w = 5.0 if x < 1.0 else 3.0
        parts.append(box("deck", (0.45, w, 0.12), (x, 0, -0.06), timber))
    for i in range(12):  # wall planks, 0.2 tall, back and both sides
        z = 0.1 + i * 0.2
        parts.append(box("back", (0.12, 4.9, 0.18), (-2.94, 0, z), timber))
        for s in (-1, 1):
            parts.append(box("side", (3.9, 0.12, 0.18), (-1.0, s * 2.44, z), timber))
    for i in range(4):  # gable above back wall
        z = 2.5 + i * 0.2
        parts.append(box("gable", (0.12, 4.8 * (1 - (i * 0.2 + 0.1) / 0.8), 0.18), (-2.94, 0, z), timber))
    parts += [box("post", (0.14, 0.14, 2.4), (1.0, s * 2.44, 1.2), timber) for s in (-1, 1)]
    a = math.atan(0.8 / 2.5)
    for s in (-1, 1):
        parts.append(box("roof", (4.4, 2.78, 0.07), (-1.0, s * 1.325, 3.2 - 0.32 * 1.325), roof, (-s * a, 0, 0)))
    parts.append(span("cyl", (-1.0, 0, 3.15), (-1.0, 0, 2.62), 0.012, timber, 6))
    parts += [box("cap", (0.2, 0.2, 0.03), (-1.0, 0, 2.6), timber), box("cap", (0.2, 0.2, 0.03), (-1.0, 0, 2.3), timber)]
    parts.append(box("flame", (0.14, 0.14, 0.27), (-1.0, 0, 2.45), lamp))
    join(parts, "boathouse")
    export("boathouse")


for build in (bow, arrow, arrows, battery, tape, fishpack, tv, couch, livingroom, boathouse):
    build()
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
