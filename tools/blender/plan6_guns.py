"""Builds the Plan 6 first-person guns (shotgun, rifle) and exports one GLB each.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/plan6_guns.py -- public/assets/props [preview_dir]

Same conventions as the pistol in plan3_props.py: Blender +Y (barrel) -> three -Z, +Z up -> three +Y,
origin at the hand (pistol grip), so the same VIEW_POSITION in gun.ts puts it in the right hand.
Optional preview_dir gets a side-view PNG per gun.
"""

import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = Path(ARGS[0] if ARGS else "public/assets/props")
PREVIEW = Path(ARGS[1]) if len(ARGS) > 1 else None


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


def preview(name: str, cx: float) -> None:
    """Orthographic side view (looking along -X) to PREVIEW/plan6_<name>.png."""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = 900, 400
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_backface_culling = "STUDIO", "MATERIAL", True
    cam = bpy.data.cameras.new("cam")
    cam.type, cam.ortho_scale = "ORTHO", 1.3
    co = bpy.data.objects.new("cam", cam)
    bpy.context.collection.objects.link(co)
    co.location = (1, cx, 0.02)
    co.rotation_euler = (Vector((-1, 0, 0))).to_track_quat("-Z", "Y").to_euler()
    sc.camera = co
    sc.render.filepath = str(PREVIEW / f"plan6_{name}.png")
    bpy.ops.render.render(write_still=True)


def export(name: str, cx: float) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")
    if PREVIEW:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        preview(name, cx)


def shotgun() -> None:
    """~1.0 m pump-action. Origin at the pistol grip, barrel toward Blender +Y (three -Z), stock to -Y."""
    reset()
    metal = material("metal", (0.045, 0.045, 0.05))
    steel = material("steel", (0.08, 0.08, 0.088))
    wood = material("wood", (0.13, 0.065, 0.035))
    dark = material("pad", (0.025, 0.022, 0.022))
    parts = [
        box("receiver", (0.04, 0.22, 0.06), (0, 0.06, 0.04), steel),
        box("port", (0.042, 0.07, 0.015), (0, 0.08, 0.062), metal),
        span((0, 0.14, 0.058), (0, 0.69, 0.058), 0.014, metal),
        span((0, 0.17, 0.024), (0, 0.62, 0.024), 0.012, metal),
        box("magcap", (0.03, 0.02, 0.03), (0, 0.63, 0.04), steel),
        box("pump", (0.046, 0.2, 0.038), (0, 0.4, 0.012), wood),
        box("grip", (0.032, 0.04, 0.09), (0, -0.045, -0.03), wood, (-0.3, 0, 0)),
        box("guardF", (0.014, 0.008, 0.04), (0, 0.075, -0.0), metal),
        box("guardB", (0.014, 0.05, 0.008), (0, 0.05, -0.02), metal),
        box("trigger", (0.008, 0.008, 0.022), (0, 0.035, 0.0), metal),
        box("bead", (0.006, 0.01, 0.01), (0, 0.68, 0.077), steel),
        prism("stock", [(-0.05, 0.075), (-0.05, 0.005), (-0.33, -0.04), (-0.345, 0.075)], -0.02, 0.02, wood),
        box("butt", (0.044, 0.02, 0.12), (0, -0.338, 0.015), dark, (0.2, 0, 0)),
    ]
    join(parts, "shotgun")
    export("shotgun", 0.17)


def rifle() -> None:
    """~0.85 m automatic rifle. Origin at the pistol grip, barrel toward Blender +Y (three -Z)."""
    reset()
    metal = material("metal", (0.045, 0.045, 0.05))
    steel = material("steel", (0.08, 0.08, 0.088))
    poly = material("poly", (0.035, 0.035, 0.032))
    wood = material("wood", (0.12, 0.06, 0.035))
    parts = [
        box("receiver", (0.04, 0.3, 0.06), (0, 0.1, 0.04), steel),
        box("cover", (0.036, 0.26, 0.02), (0, 0.1, 0.08), metal),
        box("handguard", (0.046, 0.22, 0.05), (0, 0.36, 0.048), wood),
        box("handguardTop", (0.04, 0.16, 0.025), (0, 0.38, 0.082), wood),
        span((0, 0.4, 0.058), (0, 0.6, 0.058), 0.009, metal),
        box("muzzle", (0.022, 0.04, 0.022), (0, 0.6, 0.058), steel),
        box("sightBase", (0.016, 0.03, 0.02), (0, 0.53, 0.07), steel),
        box("sightF", (0.005, 0.008, 0.035), (0, 0.53, 0.095), steel),
        box("sightR", (0.02, 0.02, 0.012), (0, 0.0, 0.092), steel),
        box("mag", (0.03, 0.05, 0.15), (0, 0.15, -0.045), poly, (0.3, 0, 0)),
        box("grip", (0.032, 0.04, 0.09), (0, -0.04, -0.035), poly, (-0.3, 0, 0)),
        box("guardF", (0.014, 0.008, 0.04), (0, 0.075, -0.0), metal),
        box("guardB", (0.014, 0.05, 0.008), (0, 0.05, -0.02), metal),
        box("trigger", (0.008, 0.008, 0.022), (0, 0.035, 0.0), metal),
        box("handle", (0.01, 0.03, 0.012), (0.026, 0.12, 0.06), metal),
        prism("stock", [(-0.05, 0.07), (-0.05, 0.015), (-0.25, -0.02), (-0.26, 0.07)], -0.018, 0.018, poly),
    ]
    join(parts, "rifle")
    export("rifle", 0.17)


for build in (shotgun, rifle):
    build()
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
