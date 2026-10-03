"""Builds the river's guardian: a 7 m orca, low poly but smooth, rigged with Swim and Lunge clips.

Black body, white eye patch, white belly and flank, grey saddle behind the tall dorsal fin.
Head toward Blender +Y (three −Z, downstream), so it swims the way the player runs.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/orca.py -- public/assets/characters/orca.glb
"""

import math
import sys

import bmesh
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
LENGTH = 7.0
RINGS = 56
SIDES = 24
# Body radius along the length: t = 0 at the nose, 1 at the tail stock.
PROFILE = [(0.0, 0.0), (0.03, 0.30), (0.10, 0.58), (0.22, 0.82), (0.35, 0.92), (0.5, 0.85),
           (0.65, 0.62), (0.8, 0.36), (0.9, 0.2), (1.0, 0.11)]
COLOURS = {"black": (0.012, 0.012, 0.014), "white": (0.80, 0.82, 0.84), "grey": (0.16, 0.17, 0.18)}
# Spine bones: (name, t start, t end).
BONES = [("Head", 0.0, 0.3), ("Spine1", 0.3, 0.55), ("Spine2", 0.55, 0.75), ("Spine3", 0.75, 0.9), ("Tail", 0.9, 1.12)]


def radius(t):
    for (t0, r0), (t1, r1) in zip(PROFILE, PROFILE[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return r0 + (r1 - r0) * (0.5 - 0.5 * math.cos(math.pi * k))
    return PROFILE[-1][1]


def y_of(t):
    return LENGTH / 2 - t * LENGTH


def body(bm):
    rings = []
    for i in range(1, RINGS):
        t = i / RINGS
        r = radius(t)
        ring = []
        for j in range(SIDES):
            a = 2 * math.pi * j / SIDES
            x, z = math.cos(a) * r, math.sin(a) * r * 1.05
            if z < 0:
                z *= 0.85  # flatter belly
            ring.append(bm.verts.new((x, y_of(t), z + 0.1 * r)))
        rings.append(ring)
    nose = bm.verts.new((0, LENGTH / 2, 0.02))
    tail = bm.verts.new((0, y_of(1.0), 0.0))
    for j in range(SIDES):
        k = (j + 1) % SIDES
        bm.faces.new((nose, rings[0][k], rings[0][j]))
        bm.faces.new((tail, rings[-1][j], rings[-1][k]))
        for a, b in zip(rings, rings[1:]):
            bm.faces.new((a[j], a[k], b[k], b[j]))


def fin(bm, outline, thickness, at, along="z"):
    """A thin fin from a 2D outline [(u, v)], extruded `thickness` across, placed at `at`."""
    front, back = [], []
    for u, v in outline:
        off = Vector((thickness / 2, 0, 0)) if along == "z" else Vector((0, 0, thickness / 2))
        p = Vector((0, u, v)) if along == "z" else Vector((v, u, 0))
        front.append(bm.verts.new(at + p + off))
        back.append(bm.verts.new(at + p - off))
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))


def fins(bm):
    t = 0.36
    top = Vector((0, y_of(t), radius(t) * 1.05 + 0.05))
    # Tall, slightly back-swept dorsal fin.
    fin(bm, [(0.45, 0), (0.2, 0.7), (-0.15, 1.45), (-0.3, 1.4), (-0.25, 0.6), (-0.5, 0)], 0.09, top)
    for side in (-1, 1):
        t = 0.2
        at = Vector((side * radius(t) * 0.8, y_of(t), -radius(t) * 0.45))
        paddle = [(0.15, 0), (0.05, 0.55 * side), (-0.25, 0.8 * side), (-0.45, 0.6 * side), (-0.25, 0)]
        fin(bm, paddle, 0.07, at, along="x")
    at = Vector((0, y_of(1.0), 0))
    flukes = [(0.15, 0), (-0.25, 1.05), (-0.55, 1.1), (-0.35, 0.3), (-0.45, 0), (-0.35, -0.3), (-0.55, -1.1), (-0.25, -1.05)]
    fin(bm, flukes, 0.06, at, along="x")


def colour_of(c, top_z):
    """Orca markings from a face centre."""
    t = (LENGTH / 2 - c.y) / LENGTH
    r = max(radius(min(max(t, 0), 1)), 0.05)
    up = c.z / r
    side = abs(c.x) / r
    eye_patch = side > 0.4 and ((t - 0.175) / 0.065) ** 2 + ((up - 0.38) / 0.2) ** 2 < 1
    belly = up < -0.3 + 0.25 * max(0.0, t - 0.45) and t < 0.6
    # The white flank sweeps up and back behind the belly.
    flank = side > 0.35 and 0.5 < t < 0.8 and up < -0.1 + 0.7 * math.sin(math.pi * (t - 0.5) / 0.3) * 0.5
    chin = t < 0.11 and up < -0.05
    saddle = ((t - 0.46) / 0.07) ** 2 + ((up - 0.9) / 0.25) ** 2 < 1 and c.z < top_z
    if c.z < -0.02 and t > 0.95:
        return "white"  # underside of the flukes
    if eye_patch or belly or flank or chin:
        return "white"
    return "grey" if saddle else "black"


def build_mesh():
    bm = bmesh.new()
    body(bm)
    fins(bm)
    mesh = bpy.data.meshes.new("Orca")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Orca", mesh)
    bpy.context.collection.objects.link(obj)
    names = list(COLOURS)
    for name, rgb in COLOURS.items():
        mat = bpy.data.materials.new(f"orca-{name}")
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = 0.55
        mesh.materials.append(mat)
    top_z = radius(0.36) * 1.05 + 0.04
    for poly in mesh.polygons:
        poly.material_index = names.index(colour_of(poly.center, top_z))
        poly.use_smooth = True
    return obj


def rig(obj):
    arm_data = bpy.data.armatures.new("OrcaRig")
    arm = bpy.data.objects.new("OrcaRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    parent = None
    for name, t0, t1 in BONES:
        bone = arm_data.edit_bones.new(name)
        bone.head = (0, y_of(t0), 0)
        bone.tail = (0, y_of(t1), 0)
        bone.parent = parent
        bone.use_connect = parent is not None
        parent = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, _, _ in BONES:
        obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        t = (LENGTH / 2 - v.co.y) / LENGTH
        for name, t0, t1 in BONES:
            mid0 = (t0 + t1) / 2
            w = max(0.0, 1 - abs(t - mid0) / ((t1 - t0) * 0.9))
            if w > 0:
                obj.vertex_groups[name].add([v.index], w, "REPLACE")
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    return arm


def clip(arm, name, frames, pose):
    """Keyframes `pose(bone_index, phase) -> pitch radians` over `frames`, looping smoothly."""
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for f in range(0, frames + 1, 4):
        phase = 2 * math.pi * f / frames
        for i, (bone, _, _) in enumerate(BONES):
            pb = arm.pose.bones[bone]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (pose(i, phase), 0, 0)
            pb.keyframe_insert("rotation_euler", frame=f)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    arm.animation_data.action = None


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = build_mesh()
    arm = rig(obj)
    swing = [0.02, 0.05, 0.11, 0.2, 0.32]
    clip(arm, "Swim", 40, lambda i, ph: swing[i] * math.sin(ph - i * 0.7))
    # Lunge: the head rears up and the tail drives down once, then settles.
    arch = [0.45, 0.2, -0.15, -0.3, -0.4]
    clip(arm, "Lunge", 24, lambda i, ph: arch[i] * math.sin(ph / 2))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS")
    print("EXPORTED", OUT, len(obj.data.polygons), "faces")


main()
