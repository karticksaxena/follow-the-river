"""Renders the intro living room (Kenney furniture placed as in intro-room.ts) from above and from the spawn.

Run: Blender --background --python tools/blender/intro_room_preview.py -- <out dir>
Keep PLACEMENTS in step with FURNITURE in src/dreams/follow-the-river/intro-room.ts (room-local x, z; Y-up game axes).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "public", "assets")
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
SCALE = 2
PI = math.pi
# kind, x, z, rot, y
PLACEMENTS = [
    ("rugRectangle", 0, -0.45, 0, 0),
    ("tableCoffee", 0, -0.45, 0, 0),
    ("books", 0.25, -0.4, 0.4, 0.46),
    ("sideTable", 1.3, 1.2, PI / 2, 0),
    ("lampRoundTable", 1.3, 1.2, 0, 0.76),
    ("bookcaseOpen", 1.6, -2.25, PI, 0),
    ("bookcaseOpen", 2.4, -2.25, PI, 0),
    ("loungeChair", -2.85, -0.9, PI / 2, 0),
    ("pottedPlant", -3.1, -2.1, 0, 0),
]


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    return (
        Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
        Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))),
    )


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def root_of(objs):
    root = bpy.data.objects.new("root", None)
    bpy.context.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    return root


def place(path, x, z, rot, y, scale=1.0, centre=True):
    """Game (x, y, z) -> Blender (x, -z, y). Model is centred on its footprint, base at y."""
    objs = load(path)
    root = root_of(objs)
    bpy.context.view_layer.update()
    lo, hi = bounds(objs)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for o in objs:
        if o.parent is root:
            o.location = o.location - Vector((cx, cy, lo.z)) if centre else o.location
    root.scale = (scale, scale, scale)
    root.rotation_euler = (0, 0, rot)  # game +Y rotation = Blender +Z (sign flips with z axis)
    root.location = (x, -z, y)


def camera(name, loc, target, lens=18, ortho=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    obj = bpy.data.objects.new(name, cam)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return obj


def render(cam, path):
    bpy.context.scene.camera = cam
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
room = load(os.path.join(ASSETS, "props", "livingroom.glb"))
for o in room:  # hide the ceiling for the top view
    if o.type == "MESH":
        for slot in o.material_slots:
            if slot.material and slot.material.name == "windowGlass":
                lo, hi = bounds([o])
                print("WINDOW MESH bounds", tuple(lo), tuple(hi))
place(os.path.join(ASSETS, "props", "couch.glb"), 0, 1.2, 0, 0)
place(os.path.join(ASSETS, "props", "tv.glb"), 0, -1.98, 0, 0, scale=1.4)
for kind, x, z, rot, y in PLACEMENTS:
    place(os.path.join(ASSETS, "home", kind + ".glb"), x, z, rot, y, scale=SCALE)

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[1].default_value = 8.0
for o in bpy.data.objects:  # drop the ceiling so the top view sees in
    if o.type == "MESH" and o.name.startswith("livingroom"):
        for i, slot in enumerate(o.material_slots):
            if slot.material and slot.material.name == "ceiling":
                import bmesh

                bm = bmesh.new()
                bm.from_mesh(o.data)
                bm.faces.ensure_lookup_table()
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == i], context="FACES")
                bm.to_mesh(o.data)
                bm.free()
top = camera("top", (0, 0, 9), (0, 0, 0), ortho=8)
render(top, os.path.join(OUT, "room-top.png"))
# spawn eye (-1.8, 1.6, 1.05) looking at the TV: game (x, y, z) -> Blender (x, -z, y)
eye = camera("eye", (-1.8, -1.05, 1.6), (0, 1.98, 0.9), lens=20)
render(eye, os.path.join(OUT, "room-spawn.png"))
side = camera("side", (-3.3, -2.3, 1.9), (1.5, 0.5, 0.5), lens=18)
render(side, os.path.join(OUT, "room-corner.png"))
