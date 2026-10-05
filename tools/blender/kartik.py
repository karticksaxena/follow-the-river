"""Kartik, the player's body (public/assets/characters/kartik.glb) and his first-person arm (kartik-arm.glb).

Both are cut from Quaternius' CC0 Ultimate Modular Men "Casual2" (kZ3DmIoGip.glb, the same outfit the casual
zombie wears, so every material is recoloured: brown skin, black hair, navy T-shirt, dark denim jeans, dark
shoes) and share its "CharacterArmature" rig with Mom. The body keeps its 24 Quaternius clips and gains
Sit, SitTalk, Kneel (a seamless hold cut from Fixing_Kneeling), Crouch and Talk, retargeted from the
Universal Animation Libraries with ual_retarget.py (hips never travel; the game moves the character).

The arm is a static mesh of his right forearm and hand plus the short-sleeve hem, cut from the body by bone
weights after posing the hand (wrist bent back, fingers and thumb fanned a little: a hand laid flat on a
surface with the forearm coming in from the player's side), then turned palm down with fingers forward:
origin at the middle of the palm, metres, +Z (glTF / three.js) toward the fingertips, +Y up (the back of the
hand), the thumb on the +X side, the forearm trailing behind and above. No skeleton.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/kartik.py -- \\
    <UAL1 AL_Standard.fbx> <UAL2_Standard.glb> <Casual2 kZ3DmIoGip.glb> public/assets/characters/kartik.glb public/assets/characters/kartik-arm.glb
"""

import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh
import bpy
from mathutils import Matrix, Vector
from ual_retarget import FPS, PREFIX, bake, export_with_clips, loop_frames, normalize_rest, pose_state, rest_frames, restore, source_clips

UAL1_FBX, UAL2, SRC_GLB, OUT_BODY, OUT_ARM = sys.argv[sys.argv.index("--") + 1 :]
SOURCES = {
    "Sit": ("ual1", "Sitting_Idle_Loop"), "SitTalk": ("ual1", "Sitting_Talking_Loop"),
    "Kneel": ("ual1", "Fixing_Kneeling"), "Crouch": ("ual1", "Crouch_Idle_Loop"), "Talk": ("ual1", "Idle_Talking_Loop"),
}
# material -> sRGB hex. In Casual2 LightBrown is the T-shirt, LightBlue the jeans, Red_Dark the shoe uppers and
# White the soles (checked mesh by mesh: the brief's names for shirt/shoes were the other way round).
COLOURS = {
    "Skin": "8a5a3c", "Skin_Darker": "6e4530", "Hair": "17120f", "Eyebrows": "17120f",
    "LightBrown": "1f2633", "LightBlue": "33475f", "Red_Dark": "3a2a20", "White": "2b2b2e",
}
FINGERS = re.compile(r"^(Index|Middle|Ring|Pinky|Thumb)\d\.R$")
ARM_BONES = {"LowerArm.R", "Wrist.R"}
HEM_REACH = 0.16  # metres of upper arm kept above the elbow: the short sleeve and its hem
WRIST_BACK = math.radians(20)  # the wrist bends back (hand pressed flat, forearm angled in from the player's side)
SPREAD = {"Index": 7, "Ring": 7, "Pinky": 13, "Thumb": 16}  # degrees each finger fans out from the middle finger


def linear(hexstr):
    c = [int(hexstr[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def recolour():
    for name, hexstr in COLOURS.items():
        mat = bpy.data.materials[name]
        col = linear(hexstr)
        base = mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"]
        for link in list(base.links):  # the jeans multiply a vertex colour into the base colour; drop it
            mat.node_tree.links.remove(link)
        base.default_value = col
        mat.diffuse_color = col


def world_head(arm, name):
    """Where the bone's head is in the pose the file ships with (the rest A-pose the mesh is drawn in)."""
    return arm.matrix_world @ arm.pose.bones[name].head


def arm_basis(arm):
    """Rows (thumb side, back of hand, fingers) of the right hand in world space, from bone positions."""
    f = (world_head(arm, "Middle2.R") - world_head(arm, "Wrist.R")).normalized()  # the *1 finger bones all start at the wrist
    t = world_head(arm, "Thumb2.R") - world_head(arm, "Pinky2.R")
    t = (t - f * t.dot(f)).normalized()
    return t, f.cross(t).normalized(), f


def rotate_about(arm, bone, point, axis, angle):
    """Turns a pose bone (and its children) by `angle` about `axis` through `point` (armature space)."""
    pb = arm.pose.bones[bone]
    move = Matrix.Translation(point)
    pb.matrix = move @ Matrix.Rotation(angle, 4, axis) @ move.inverted() @ pb.matrix
    bpy.context.view_layer.update()


def turn_toward(arm, bone, point, axis, angle, probe, goal):
    """rotate_about, in whichever direction brings the bone `probe`'s head nearer the world point `goal`."""
    before = (world_head(arm, probe) - goal).length
    rotate_about(arm, bone, point, axis, angle)
    if (world_head(arm, probe) - goal).length > before:
        rotate_about(arm, bone, point, axis, -2 * angle)


def pose_hand(arm):
    """Wrist bent back, fingers fanned. Returns the undo."""
    saved = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    to_arm = arm.matrix_world.inverted()
    local = lambda v: to_arm.to_3x3() @ v
    t, u, f = arm_basis(arm)
    wrist = to_arm @ world_head(arm, "Wrist.R")
    # the fingers move toward the back of the hand (+u): the wrist extends
    goal = world_head(arm, "Wrist.R") + f * 0.1 + u * 0.1
    turn_toward(arm, "Wrist.R", wrist, local(t), WRIST_BACK, "Middle2.R", goal)
    for finger, degrees in SPREAD.items():
        t, u, f = arm_basis(arm)  # the hand has moved
        head = world_head(arm, f"{finger}1.R")
        out = 1 if (world_head(arm, f"{finger}2.R") - world_head(arm, "Middle2.R")).dot(t) > 0 else -1
        goal = world_head(arm, f"{finger}2.R") + t * out * 0.1
        turn_toward(arm, f"{finger}1.R", to_arm @ head, local(u), math.radians(degrees), f"{finger}2.R", goal)

    def undo():
        for name, matrix in saved.items():
            arm.pose.bones[name].matrix_basis = matrix
        bpy.context.view_layer.update()

    return undo


def cut_arm(arm, body):
    """New mesh object: the right forearm, hand and sleeve hem of `body` (hand posed), turned palm down, origin mid-palm."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(body.matrix_world)  # world space, metres
    groups = [g.name for g in body.vertex_groups]
    elbow = world_head(arm, "LowerArm.R")
    up_dir = (elbow - world_head(arm, "UpperArm.R")).normalized()  # shoulder -> elbow: points down the upper arm

    def share(vert, wanted):
        return sum(g.weight for g in vert.groups if wanted(groups[g.group]))

    bm = bmesh.new()
    bm.from_mesh(me)
    deform = bm.verts.layers.deform.active
    drop = []
    for face in bm.faces:
        w = lambda names: sum(sum(v[deform].get(groups.index(n), 0) for v in face.verts) for n in names) / len(face.verts)
        hand = w([n for n in groups if n in ARM_BONES or FINGERS.match(n)])
        reach = (elbow - face.calc_center_median()).dot(up_dir)  # metres above the elbow along the upper arm
        sleeve = w(["UpperArm.R"]) > 0.5 and reach < HEM_REACH + 0.05
        if not (hand > 0.5 or sleeve):
            drop.append(face)
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # a clean flat cut across the upper arm, HEM_REACH above the elbow (the open end is never seen from the elbow down)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=elbow - up_dir * HEM_REACH, plane_no=-up_dir, clear_outer=True)
    bm.to_mesh(me)
    bm.free()
    t, u, f = arm_basis(arm)
    # glTF (x, y, z) = Blender (x, z, -y): thumb side +X, up +Y, fingers +Z -> Blender (1,0,0), (0,0,1), (0,-1,0)
    want = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed()  # columns: thumb, up, fingers targets
    have = Matrix((t, u, f))  # rows
    middle = world_head(arm, "Wrist.R").lerp(world_head(arm, "Middle2.R"), 0.5)  # the middle of the palm
    me.transform(Matrix.Translation(-middle))
    me.transform((want @ have).to_4x4())
    obj = bpy.data.objects.new("KartikArm", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_arm(arm, body):
    unpose = pose_hand(arm)
    obj = cut_arm(arm, body)
    unpose()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.material_slot_remove_unused()
    bpy.ops.export_scene.gltf(filepath=OUT_ARM, export_format="GLB", use_selection=True)
    bpy.data.objects.remove(obj, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    src, clips = source_clips(UAL1_FBX, UAL2, SOURCES)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    dst = next(o for o in new if o.type == "ARMATURE")
    meshes = [o for o in new if o.type == "MESH" and o.find_armature() is dst]
    for o in [o for o in new if o.name.startswith("Icosphere")]:  # the importer's bone-shape helper
        bpy.data.objects.remove(o, do_unlink=True)
    for pb in dst.pose.bones:
        pb.custom_shape = None
    recolour()
    for o in meshes:  # the jeans' painted vertex colours would be multiplied into the new colour on re-import
        for attr in list(o.data.color_attributes):
            o.data.color_attributes.remove(attr)
    export_arm(dst, next(o for o in meshes if o.name.endswith("_Body")))
    normalize_rest(dst, meshes)
    static = pose_state(dst)
    keep = [a for a in bpy.data.actions if a.name.startswith(PREFIX)]
    rest = rest_frames(src, dst)
    floor = (dst.matrix_world @ dst.data.bones["Root"].head_local).z
    ratio = (rest["pelvis"]["t_loc"].z - floor) / rest["pelvis"]["s_loc"].z
    made = {}
    for name, (act, scale) in clips.items():
        restore(dst, static)
        frames = loop_frames(src, act, round(1.5 * 30)) if name == "Kneel" else None
        made[name] = bake(src, dst, PREFIX + name, act, rest, ratio, scale, frames)
    export_with_clips(dst, new, keep, made, static, OUT_BODY)


main()
