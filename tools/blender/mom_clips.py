"""Adds Sit, Kneel, Throw, Row, Talk, SitTalk, SitDown, StandUp, Lantern, Crouch, Yes, No and Film clips to Mom (public/assets/characters/mom.glb), keeping everything
she already has (meshes, materials, skin, every existing clip).

Sit and Throw (and the rest below) are retargeted from Quaternius' CC0 Universal Animation Libraries (same approach
as zombify.py: bone map, rest-pose handling and bake are copied from it). Row is authored here: the
Sit pose plus a twisting torso and two arms (arms solved to a moving double-bladed paddle shaft). Kneel is
authored too: UAL1's Fixing_Kneeling read as a sprinter's lunge (one leg stretched back, hips high), so it is a
grieving double kneel: both knees and shins on the ground, hips low over the heels, torso upright leaning a
little forward, hands resting on the thighs, and a slow breathing loop.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/mom_clips.py -- <UAL1 AL_Standard.fbx> <UAL2_Standard.glb> public/assets/characters/mom.glb
Re-running is safe: the clips named here are replaced, not duplicated. The hips never travel (root motion is
pinned to the first frame); the game moves the character itself.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Matrix, Vector
from ual_retarget import FPS, MAP, PREFIX, bake, export_with_clips, normalize_rest, pose_state, rest_frames, restore, sample, source_clips

UAL1_FBX, UAL2, MOM = sys.argv[sys.argv.index("--") + 1 :]
# new clip -> (source pack, source action). Row (built from Sit) and Kneel are authored.
SOURCES = {
    "Sit": ("ual1", "Sitting_Idle_Loop"), "Throw": ("ual2", "OverhandThrow"),
    "Talk": ("ual1", "Idle_Talking_Loop"), "SitTalk": ("ual1", "Sitting_Talking_Loop"),
    "SitDown": ("ual1", "Sitting_Enter"), "StandUp": ("ual1", "Sitting_Exit"),
    "Lantern": ("ual2", "Idle_Lantern_Loop"), "Crouch": ("ual1", "Crouch_Idle_Loop"),
    "Yes": ("ual2", "Yes"), "No": ("ual2", "Idle_No_Loop"),
    # Film: both arms out in front at chest height, her right hand forward like holding a phone to film the water.
    # (Idle_Torch_Loop was the other candidate: only her LEFT fist is raised at the shoulder, so it was rejected.)
    "Film": ("ual1", "Pistol_Aim_Neutral"),
}
ROW_FRAMES = 58  # 2.4 s
TWIST = math.radians(20)
SHAFT_YAW = math.radians(28)  # the shaft swings this far each side, in the horizontal plane
SHAFT_ROLL = math.radians(15)  # ... and dips an end this far, a quarter-cycle out of phase
SHAFT_FWD = 0.42  # metres in front of the chest
ROW_MOVING = ("Abdomen", "Torso", "Head", "UpperArm.L", "LowerArm.L", "UpperArm.R", "LowerArm.R")
SHAFT_HALF = 0.23  # half the hand spacing

# ---------- Row ----------

def spin(dst, pb, angle, axis="Z"):
    """Rotates a pose bone about its own head and a WORLD axis (default the vertical; "X" pitches her
    forward, since she faces -Y); the bone's children follow."""
    mw = dst.matrix_world
    h = mw @ pb.head
    turn = Matrix.Translation(h) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-h)
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


def aim(dst, pb, want, cur=None):
    """Swings a pose bone about its head so it points along world direction `want` (children follow).
    `cur`: the world direction it points now when that is not the bone's own axis."""
    mw = dst.matrix_world
    h = mw @ pb.head
    cur = cur if cur is not None else (mw @ pb.tail - h).normalized()
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


# ---------- Kneel ----------

KNEEL_FRAMES = 72  # 3 s
HIP_Y = -0.07  # hip joints sit this far ahead of the root (the knees then stop about 0.5 m ahead of it, short of Dras's snout)
HIP_Z = 0.33  # hip joint height: low, over the heels
KNEE_Z = 0.045  # knee and ankle joint height: the shin lies on the ground
KNEE_X, ANKLE_X = 0.15, 0.11  # each side's knee and ankle out from the centre line
FOOT_FLIP = math.radians(165)  # the foot plantar-flexes: toes back, instep down
LEAN = math.radians(18)  # torso leans forward in total (Abdomen, Torso, Chest share it)
LEAN_SHARE = (("Abdomen", 0.3), ("Torso", 0.4), ("Chest", 0.3))
HEAD_NOD = math.radians(10)  # eyes down toward her
BREATH = math.radians(1.3)
HAND_UP = 0.07  # the hand rests this far above the thigh's middle
KNEEL_KEYS = [t for _, t, _ in MAP]  # includes both Foot bones


def ankle_of(legs, sign):
    """The static ankle joint: the middle of this leg's lowest ring of the leg mesh (world)."""
    mesh = legs.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    pts = [legs.matrix_world @ v.co for v in mesh.vertices]
    low = min(p.z for p in pts) + 0.04
    ring = [p for p in pts if p.z < low and p.x * sign > 0]
    return sum(ring, Vector()) / len(ring)


def leg_statics(dst, side, ankle_s):
    """Before anything moves: the ankle in the shin bone's own frame, and the foot's frame and offset from the ankle."""
    mw = dst.matrix_world
    lo, foot = dst.pose.bones[f"LowerLeg.{side}"], dst.pose.bones[f"Foot.{side}"]
    foot_s = mw @ foot.matrix
    return (mw @ lo.matrix).inverted() @ ankle_s, foot_s.translation - ankle_s, foot_s.to_3x3().to_4x4()


def solve_leg(dst, side, sign, st):
    """Knee onto the ground ahead of the hip, shin flat behind it, foot flipped to point back (hips already placed)."""
    mw = dst.matrix_world
    la, v, rot = st
    up, lo, foot = (dst.pose.bones[f"{n}.{side}"] for n in ("UpperLeg", "LowerLeg", "Foot"))
    hip, knee0 = mw @ up.head, mw @ lo.head
    l1 = (knee0 - hip).length
    knee = Vector((sign * KNEE_X, 0, KNEE_Z))
    knee.y = hip.y - math.sqrt(l1**2 - (hip.x - knee.x) ** 2 - (hip.z - knee.z) ** 2)
    aim(dst, up, (knee - hip).normalized(), (knee0 - hip).normalized())
    k = mw @ lo.head
    cur = mw @ (lo.matrix @ la) - k
    a = Vector((sign * ANKLE_X, 0, KNEE_Z))
    a.y = k.y + math.sqrt(cur.length**2 - (a.x - k.x) ** 2 - (a.z - k.z) ** 2)
    aim(dst, lo, (a - k).normalized(), cur.normalized())
    ankle = mw @ (lo.matrix @ la)
    flip = Matrix.Rotation(FOOT_FLIP, 4, "X")
    foot.matrix = mw.inverted() @ Matrix.Translation(ankle + flip.to_3x3() @ v) @ flip @ rot
    bpy.context.view_layer.update()


def kneel_pose(dst, legs):
    """The held pose (no breathing): hips dropped, legs folded, torso leaned, hands on the thighs."""
    mw = dst.matrix_world
    pb = dst.pose.bones
    statics = {s: leg_statics(dst, s, ankle_of(legs, g)) for s, g in (("L", 1), ("R", -1))}
    mid = (mw @ pb["UpperLeg.L"].head + mw @ pb["UpperLeg.R"].head) / 2
    body = pb["Body"]
    body.matrix = mw.inverted() @ Matrix.Translation(Vector((0, HIP_Y, HIP_Z)) - mid) @ mw @ body.matrix
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        solve_leg(dst, side, sign, statics[side])
    for name, share in LEAN_SHARE:
        spin(dst, pb[name], LEAN * share, "X")
    spin(dst, pb["Head"], HEAD_NOD, "X")
    for side, sign in (("L", 1), ("R", -1)):
        thigh = (mw @ pb[f"UpperLeg.{side}"].head + mw @ pb[f"LowerLeg.{side}"].head) / 2
        reach(dst, side, thigh + Vector((0, -0.04, HAND_UP)), Vector((sign * 0.6, 0.8, 0.0)))


def kneel_frame(dst, base, phase):
    """One breathing frame: the held pose with the chest rising and falling a little."""
    restore(dst, base)
    b = BREATH * math.sin(phase)
    spin(dst, dst.pose.bones["Torso"], -b * 0.4, "X")
    spin(dst, dst.pose.bones["Chest"], -b * 0.6, "X")
    spin(dst, dst.pose.bones["Head"], b * 0.5, "X")
    return {n: (dst.pose.bones[n].location.copy(), dst.pose.bones[n].rotation_quaternion.copy()) for n in KNEEL_KEYS}


def make_kneel(dst, static, legs):
    """Authored double kneel, keyed every frame; loops exactly."""
    dst.animation_data.action = None  # first: an assigned action would re-pose every update
    restore(dst, static)
    kneel_pose(dst, legs)
    base = pose_state(dst)
    frames = [kneel_frame(dst, base, 2 * math.pi * f / KNEEL_FRAMES) for f in range(KNEEL_FRAMES)]
    frames.append(frames[0])
    restore(dst, base)
    action = bpy.data.actions.new(PREFIX + "Kneel")
    dst.animation_data.action = action
    for pb in dst.pose.bones:  # every other bone holds the static pose
        if pb.name not in KNEEL_KEYS:
            for frame in (0, KNEEL_FRAMES):
                pb.keyframe_insert("rotation_quaternion", frame=frame)
    for frame, state in enumerate(frames):
        for name, (loc, q) in state.items():
            pb = dst.pose.bones[name]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if name in ("Body", "Foot.L", "Foot.R"):
                pb.location = loc
                pb.keyframe_insert("location", frame=frame)
    return action


# ---------- main ----------

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    src, clips = source_clips(UAL1_FBX, UAL2, SOURCES)
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
    for name in SOURCES.keys() | {"Row", "Kneel"}:  # re-run: drop the previous clips
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
        made[name] = bake(src, dst, PREFIX + name, act, rest, ratio, scale)
    restore(dst, static)
    made["Row"] = make_row(dst, made["Sit"])
    made["Kneel"] = make_kneel(dst, static, next(o for o in meshes if o.name == "Formal_Legs"))
    export_with_clips(dst, new, keep, made, static, MOM)


main()
