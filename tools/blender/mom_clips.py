"""Adds Sit, Kneel, Throw and Row clips to Mom (public/assets/characters/mom.glb), keeping everything
she already has (meshes, materials, skin, every existing clip).

Sit, Kneel and Throw are retargeted from Quaternius' CC0 Universal Animation Libraries (same approach
as zombify.py: bone map, rest-pose handling and bake are copied from it). Row is authored here: the
Sit pose plus a twisting torso and two arms (arms solved to a moving double-bladed paddle shaft).

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/mom_clips.py -- <UAL1 AL_Standard.fbx> <UAL2_Standard.glb> public/assets/characters/mom.glb
Re-running is safe: the four clips are replaced, not duplicated. The hips never travel (root motion is
pinned to the first frame); the game moves the character itself.
"""

import math
import sys
from pathlib import Path

import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

UAL1_FBX, UAL2, MOM = sys.argv[sys.argv.index("--") + 1 :]
FPS = 24
PREFIX = "CharacterArmature|"
# new clip -> (source pack, source action). Row is authored, built from Sit.
SOURCES = {"Sit": ("ual1", "Sitting_Idle_Loop"), "Kneel": ("ual1", "Fixing_Kneeling"), "Throw": ("ual2", "OverhandThrow")}
ROW_FRAMES = 58  # 2.4 s
TWIST = math.radians(20)
SHAFT_YAW = math.radians(28)  # the shaft swings this far each side, in the horizontal plane
SHAFT_ROLL = math.radians(15)  # ... and dips an end this far, a quarter-cycle out of phase
SHAFT_FWD = 0.42  # metres in front of the chest
ROW_MOVING = ("Abdomen", "Torso", "Head", "UpperArm.L", "LowerArm.L", "UpperArm.R", "LowerArm.R")
SHAFT_HALF = 0.23  # half the hand spacing

# (UAL bone, CharacterArmature bone, also copy location). Parents before children.
MAP = [
    ("pelvis", "Body", True), ("spine_01", "Abdomen", False), ("spine_02", "Torso", False),
    ("spine_03", "Chest", False), ("neck_01", "Neck", False), ("Head", "Head", False),
    ("clavicle_l", "Shoulder.L", False), ("upperarm_l", "UpperArm.L", False),
    ("lowerarm_l", "LowerArm.L", False), ("hand_l", "Wrist.L", False),
    ("clavicle_r", "Shoulder.R", False), ("upperarm_r", "UpperArm.R", False),
    ("lowerarm_r", "LowerArm.R", False), ("hand_r", "Wrist.R", False),
    ("thigh_l", "UpperLeg.L", False), ("calf_l", "LowerLeg.L", False),
    ("thigh_r", "UpperLeg.R", False), ("calf_r", "LowerLeg.R", False),
    ("foot_l", "Foot.L", True), ("foot_r", "Foot.R", True),
]


def remove_new(objs_before):
    for obj in [o for o in bpy.data.objects if o not in objs_before]:
        bpy.data.objects.remove(obj, do_unlink=True)


def source_clips():
    """UAL2 glb armature (drives every source clip, bone names match UAL1's), plus the wanted actions."""
    bpy.ops.import_scene.gltf(filepath=UAL2)
    src = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=UAL1_FBX)
    remove_new(before)
    fps = {"ual1": bpy.context.scene.render.fps, "ual2": FPS}  # the fbx import sets the scene to 30 fps
    bpy.context.scene.render.fps = FPS
    clips = {}
    for action in list(bpy.data.actions):
        pack = "ual1" if "|" in action.name else "ual2"
        for name, (want_pack, want) in SOURCES.items():
            if want_pack == pack and action.name.split("|")[-1] == want:
                clips[name] = (action, FPS / fps[pack])
    for action in list(bpy.data.actions):
        if all(action is not a for a, _ in clips.values()):
            bpy.data.actions.remove(action)
    src.animation_data_create()
    return src, clips


def world_rot(arm, matrix):
    return (arm.matrix_world @ matrix).to_3x3().normalized().to_quaternion()


def rest_frames(src, dst):
    out = {}
    for s, t, _ in MAP:
        sb, tb = src.data.bones[s], dst.data.bones[t]
        s_dir = (src.matrix_world.to_3x3() @ (sb.tail_local - sb.head_local)).normalized()
        t_dir = (dst.matrix_world.to_3x3() @ (tb.tail_local - tb.head_local)).normalized()
        out[s] = {
            "s_rot": world_rot(src, sb.matrix_local),
            "t_ref": t_dir.rotation_difference(s_dir) @ world_rot(dst, tb.matrix_local),
            "s_loc": src.matrix_world @ sb.head_local,
            "t_loc": dst.matrix_world @ tb.head_local,
        }
    return out


def bake(src, dst, name, src_action, rest, ratio, time_scale, frames=None):
    """zombify.py's bake, plus: time_scale to 24 fps, and the hips pinned to frame 0's horizontal spot."""
    src.animation_data.action = src_action
    src.animation_data.action_slot = src_action.slots[0]
    action = bpy.data.actions.new(name)
    dst.animation_data_create()
    dst.animation_data.action = action
    f0, f1 = (int(round(v)) for v in src_action.frame_range)
    frames = frames or list(range(f0, f1 + 1))
    f0 = frames[0]
    inv = dst.matrix_world.inverted()
    to_arm = dst.matrix_world.to_3x3().normalized().to_quaternion().inverted()
    pin = None
    for i, frame in enumerate(frames):
        bpy.context.scene.frame_set(frame)
        t = i * time_scale
        for s, t_name, located in MAP:
            r = rest[s]
            ps, pt = src.pose.bones[s], dst.pose.bones[t_name]
            q = world_rot(src, ps.matrix) @ r["s_rot"].inverted() @ r["t_ref"]
            if located:
                world = r["t_loc"] + ((src.matrix_world @ ps.head) - r["s_loc"]) * ratio
                if t_name == "Body":  # no root motion: keep height, pin the horizontal (world X/Y) spot
                    pin = pin or world.copy()
                    world.x, world.y = pin.x, pin.y
                loc = inv @ world
            else:
                loc = pt.matrix.translation.copy()
            pt.matrix = Matrix.LocRotScale(loc, to_arm @ q, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
            pt.keyframe_insert("rotation_quaternion", frame=t)
            if located:
                pt.keyframe_insert("location", frame=t)
    return action


def loop_frames(src, action, min_len, kneeling=0.7):
    """Source frames [a..b-1, a] of the stretch where the pose at b best matches the pose at a, among the
    frames where the hips are low (kneeling), so a one-off stand-kneel-stand clip becomes a seamless hold."""
    src.animation_data.action = action
    src.animation_data.action_slot = action.slots[0]
    f0, f1 = (int(round(v)) for v in action.frame_range)
    sig = {}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        sig[f] = (
            src.pose.bones["pelvis"].head.z,
            [world_rot(src, src.pose.bones[n].matrix) for n, _, _ in MAP],
        )
    top = max(z for z, _ in sig.values())
    low = [f for f in sig if sig[f][0] < top * kneeling]
    best = None
    for a in low:
        for b in low:
            if b - a < min_len:
                continue
            d = sum(qa.rotation_difference(qb).angle for qa, qb in zip(sig[a][1], sig[b][1])) + 5 * abs(sig[a][0] - sig[b][0])
            if best is None or d < best[0]:
                best = (d, a, b)
    print("LOOP", action.name, "window", best)
    return list(range(best[1], best[2])) + [best[1]]


def sample(dst, action, frame):
    dst.animation_data.action = action
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def pose_state(dst):
    return {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in dst.pose.bones}


def restore(dst, state):
    for pb in dst.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = state[pb.name]
    bpy.context.view_layer.update()


# ---------- Row ----------

def spin(dst, pb, angle):
    """Rotates a pose bone about its own head and the WORLD vertical (the armature object is rotated
    and scaled, so its own axes are not up); the bone's children follow."""
    mw = dst.matrix_world
    h = mw @ pb.head
    turn = Matrix.Translation(h) @ Matrix.Rotation(angle, 4, "Z") @ Matrix.Translation(-h)
    pb.matrix = mw.inverted() @ turn @ mw @ pb.matrix
    bpy.context.view_layer.update()


def grip_targets(dst, phase):
    """World-space hand grips on the shaft, which swings in yaw and dips an end in roll."""
    mw = dst.matrix_world
    chest = mw @ dst.pose.bones["Chest"].head
    fwd = Vector((0, -1, 0))  # she faces -Y (Blender), +Z in glTF
    centre = chest + fwd * SHAFT_FWD + Vector((0, 0, -0.04))
    yaw, roll = SHAFT_YAW * math.sin(phase), SHAFT_ROLL * math.cos(phase)
    axis = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(roll, 3, "Y")
    side = axis @ Vector((SHAFT_HALF, 0, 0))
    return centre + side, centre - side  # left (+X) grip, right (-X) grip


def aim(dst, pb, want):
    """Swings a pose bone about its head so it points along world direction `want` (children follow)."""
    mw = dst.matrix_world
    h = mw @ pb.head
    cur = (mw @ pb.tail - h).normalized()
    turn = Matrix.Translation(h) @ cur.rotation_difference(want).to_matrix().to_4x4() @ Matrix.Translation(-h)
    pb.matrix = mw.inverted() @ turn @ mw @ pb.matrix
    bpy.context.view_layer.update()


def reach(dst, side, target, pole_dir):
    """Two-bone arm solve: upper arm and forearm meet `target` (clamped to arm length), elbow toward pole_dir."""
    mw = dst.matrix_world
    upper, lower = dst.pose.bones[f"UpperArm.{side}"], dst.pose.bones[f"LowerArm.{side}"]
    s = mw @ upper.head
    l1, l2 = (mw @ upper.tail - s).length, (mw @ lower.tail - mw @ lower.head).length
    to = target - s
    d = min(max(to.length, abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999)
    axis = to.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    perp = pole_dir - axis * pole_dir.dot(axis)
    elbow = s + axis * a + perp.normalized() * math.sqrt(max(l1 * l1 - a * a, 0))
    aim(dst, upper, (elbow - s).normalized())
    aim(dst, lower, (s + axis * d - elbow).normalized())


def row_frame(dst, base, phase):
    """One Row frame's rotations: Sit's pose, torso twisted, both hands on the swinging shaft."""
    restore(dst, base)
    twist = TWIST * math.sin(phase)
    spin(dst, dst.pose.bones["Abdomen"], twist * 0.4)
    spin(dst, dst.pose.bones["Torso"], twist * 0.6)
    spin(dst, dst.pose.bones["Head"], -twist * 0.5)  # eyes stay roughly forward
    gl, gr = grip_targets(dst, phase)
    reach(dst, "L", gl, Vector((0.5, 0.1, -1.0)))  # elbows low and a little out
    reach(dst, "R", gr, Vector((-0.5, 0.1, -1.0)))
    return {n: dst.pose.bones[n].rotation_quaternion.copy() for n in ROW_MOVING}


def make_row(dst, sit):
    """Sit pose + torso twist + both hands on a swinging paddle shaft. Keys every frame; loops exactly."""
    sample(dst, sit, 0)
    base = pose_state(dst)
    dst.animation_data.action = None  # solve with no action, or every update re-applies old keys
    frames = [row_frame(dst, base, 2 * math.pi * f / ROW_FRAMES) for f in range(ROW_FRAMES)]
    frames.append(frames[0])  # exact loop
    restore(dst, base)
    action = bpy.data.actions.new(PREFIX + "Row")
    dst.animation_data.action = action
    for pb in dst.pose.bones:  # every other bone holds Sit's first frame
        if pb.name not in ROW_MOVING:
            for frame in (0, ROW_FRAMES):
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                if pb.name == "Body":
                    pb.keyframe_insert("location", frame=frame)
    for frame, quats in enumerate(frames):
        for name, q in quats.items():
            pb = dst.pose.bones[name]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)
    return action


def pin_unkeyed(dst, action, static):
    """Key every channel a clip leaves alone at the file's static pose. The exporter samples tracks one
    after another on one live pose, so an unkeyed bone would otherwise inherit the previous clip's value."""
    dst.animation_data.action = action
    dst.animation_data.action_slot = action.slots[0]
    have = {(fc.data_path, fc.array_index) for fc in anim_utils.action_get_channelbag_for_slot(action, action.slots[0]).fcurves}
    end = action.frame_range[1]
    for pb in dst.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = static[pb.name]
        for attr, size in (("location", 3), ("rotation_quaternion", 4), ("scale", 3)):
            path = f'pose.bones["{pb.name}"].{attr}'
            for i in [i for i in range(size) if (path, i) not in have]:
                pb.keyframe_insert(attr, index=i, frame=0)
                if end:
                    pb.keyframe_insert(attr, index=i, frame=end)


def normalize_rest(dst, meshes):
    """mom.glb's skin binds Mom 1.375 m below her feet and the Root bone's pose lifts her back (the
    importer keeps that as rest + a Root pose offset). Bake the lift into the rest pose and the meshes, so
    the exporter writes Root where the file had it and unkeyed Root needs no pose."""
    root = dst.pose.bones["Root"]
    delta = root.head - dst.data.bones["Root"].head_local  # armature space
    bpy.context.view_layer.objects.active = dst
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in dst.data.edit_bones:
        eb.head += delta
        eb.tail += delta
    bpy.ops.object.mode_set(mode="OBJECT")
    for m in meshes:
        m.data.transform(Matrix.Translation(delta))
    root.location = (0, 0, 0)
    bpy.context.view_layer.update()


# ---------- main ----------

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    src, clips = source_clips()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=MOM)
    new = [o for o in bpy.data.objects if o not in before]
    dst = next(o for o in new if o.type == "ARMATURE")
    # The glTF's own node transforms are the pose the file ships with (Root sits at the floor, Hips are
    # tilted). Clips don't key those bones, so keep this pose for every bone a clip leaves alone.
    meshes = [o for o in new if o.type == "MESH" and o.find_armature() is dst]
    normalize_rest(dst, meshes)
    static = pose_state(dst)
    for pb in dst.pose.bones:
        pb.custom_shape = None
    for o in [o for o in new if o.name.startswith("Icosphere")]:  # the importer's bone-shape helper
        bpy.data.objects.remove(o, do_unlink=True)
    for name in SOURCES.keys() | {"Row"}:  # re-run: drop the previous clips
        old = bpy.data.actions.get(PREFIX + name)
        if old:
            bpy.data.actions.remove(old)
    keep = [a for a in bpy.data.actions if a.name.startswith(PREFIX)]
    rest = rest_frames(src, dst)
    # Mom's armature object sits at z=-137 m in the importer, so measure the hips above her feet, not the origin.
    floor = (dst.matrix_world @ dst.data.bones["Root"].head_local).z
    ratio = (rest["pelvis"]["t_loc"].z - floor) / rest["pelvis"]["s_loc"].z
    made = {}
    for name, (act, scale) in clips.items():
        restore(dst, static)
        frames = loop_frames(src, act, round(1.5 * 30)) if name == "Kneel" else None
        made[name] = bake(src, dst, PREFIX + name, act, rest, ratio, scale, frames)
    restore(dst, static)
    made["Row"] = make_row(dst, made["Sit"])
    for track in list(dst.animation_data.nla_tracks):
        dst.animation_data.nla_tracks.remove(track)
    for action in keep + list(made.values()):
        pin_unkeyed(dst, action, static)
        action.use_fake_user = True
        track = dst.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 0, action)
    dst.animation_data.action = None
    restore(dst, static)
    for a in [a for a in bpy.data.actions if a not in keep and a not in made.values()]:
        bpy.data.actions.remove(a)
    for obj in [o for o in bpy.data.objects if o is not dst and o not in new and o.type != "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for o in [o for o in bpy.data.objects if o.type == "ARMATURE" and o is not dst]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=MOM, export_format="GLB", use_selection=True, export_animation_mode="NLA_TRACKS")
    print("EXPORTED", sorted(a.name for a in keep + list(made.values())))


main()
