"""Adds Sit, Kneel, Throw, Row, Talk, SitTalk, SitDown, StandUp, Lantern, Crouch, Yes, No and Film clips to Mom (public/assets/characters/mom.glb), keeping everything
she already has (meshes, materials, skin, every existing clip).

Sit, Kneel and Throw are retargeted from Quaternius' CC0 Universal Animation Libraries (same approach
as zombify.py: bone map, rest-pose handling and bake are copied from it). Row is authored here: the
Sit pose plus a twisting torso and two arms (arms solved to a moving double-bladed paddle shaft).

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
from ual_retarget import FPS, PREFIX, bake, export_with_clips, loop_frames, normalize_rest, pose_state, rest_frames, restore, sample, source_clips

UAL1_FBX, UAL2, MOM = sys.argv[sys.argv.index("--") + 1 :]
# new clip -> (source pack, source action). Row is authored, built from Sit.
SOURCES = {
    "Sit": ("ual1", "Sitting_Idle_Loop"), "Kneel": ("ual1", "Fixing_Kneeling"), "Throw": ("ual2", "OverhandThrow"),
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
    export_with_clips(dst, new, keep, made, static, MOM)


main()
