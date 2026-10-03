"""Builds Follow the River's zombies: everyday people (Quaternius' CC0 Ultimate Modular Men and
Women — the same family as Mom) given Walking-Dead rot, and moving with zombie clips retargeted
from Quaternius' CC0 Universal Animation Library.

Per gender, every outfit is joined into one mesh bound to one shared skeleton and painted into
its own 512² texture: rotting grey-green skin with bruises and veins, milky eyes in dark sockets,
blood from the mouth down the chin and chest, bloody hands, filthy torn clothes.

Run headless from the repo root (paths are the downloaded packs):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/zombify.py -- <UAL2_Standard.glb> <AL_Standard.fbx> <men dir> <women dir> \
    public/assets/characters
Writes zombie-m.glb and zombie-f.glb (one mesh per outfit, all sharing that skeleton and the
clips Idle, Walk, Run, Attack, Hit, Death, GetUp).
"""

import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Matrix, Vector, noise

UAL2, UAL1_FBX, MEN, WOMEN, OUT = sys.argv[sys.argv.index("--") + 1 :]
OUT = Path(OUT)
SIZE = 512

# poly.pizza ids of the everyday outfits. Women's "Formal" (nIItLV9nxS) is Mom: never a zombie.
OUTFITS = {
    "m": {
        "farmer": "7pn3R6hPvE", "punk": "BTALZymknF", "swat": "Btfn3G5Xv4", "beach": "DojKLcO34E",
        "hoodie": "gKLBoRsyKe", "suit": "JFrLIKqvCH", "casual": "kZ3DmIoGip", "worker": "Yg2bQZO6Hj",
    },
    "f": {
        "punk": "djXoqejw6w", "worker": "E8079Ahx7k", "soldier": "oAArCNHjFB",
        "casual": "qJ2gsTUBHL", "suit": "sOUciDsoVV",
    },
}

KEEP_UAL2 = {
    "Zombie_Idle_Loop": "Idle",
    "Zombie_Walk_Fwd_Loop": "Walk",
    "Zombie_Scratch": "Attack",
    "Hit_Knockback": "Hit",
    "LayToIdle": "GetUp",
}
KEEP_UAL1 = {"Death01": "Death", "Sprint_Loop": "Sprint"}
UPPER = ("clavicle", "upperarm", "lowerarm", "hand", "neck", "Head", "index", "middle", "pinky", "ring", "thumb")

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

SKIN = Vector((0.50, 0.53, 0.43))
BRUISE = Vector((0.36, 0.30, 0.36))
BLOOD = Vector((0.22, 0.025, 0.02))
FRESH = Vector((0.36, 0.03, 0.025))
SOCKET = Vector((0.07, 0.05, 0.05))
MILKY = Vector((0.70, 0.71, 0.64))


# ---------- clips ----------

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    meshes = [o for o in new if o.type == "MESH" and o.find_armature() is arm]
    for extra in [o for o in new if o.type == "MESH" and o not in meshes]:
        bpy.data.objects.remove(extra, do_unlink=True)
    for pose_bone in arm.pose.bones:
        pose_bone.custom_shape = None
        for c in list(pose_bone.constraints):
            pose_bone.constraints.remove(c)
    return arm, meshes


def bag(action):
    return anim_utils.action_get_channelbag_for_slot(action, action.slots[0])


def is_upper(data_path):
    return any(f'"{name}' in data_path for name in UPPER)


def make_run(sprint, walk):
    """Sprint legs and torso, zombie-walk arms and head, squeezed to the sprint's cycle."""
    run = sprint.copy()
    run.name = "src_Run"
    run_bag, walk_bag = bag(run), bag(walk)
    s0, s1 = sprint.frame_range
    w0, w1 = walk.frame_range
    scale = (s1 - s0) / (w1 - w0)
    for fc in [fc for fc in run_bag.fcurves if is_upper(fc.data_path)]:
        run_bag.fcurves.remove(fc)
    for fc in walk_bag.fcurves:
        if not is_upper(fc.data_path):
            continue
        new = run_bag.fcurves.new(fc.data_path, index=fc.array_index, group_name=fc.group.name if fc.group else "")
        new.keyframe_points.add(len(fc.keyframe_points))
        for i, key in enumerate(fc.keyframe_points):
            new.keyframe_points[i].co = (s0 + (key.co[0] - w0) * scale, key.co[1])
            new.keyframe_points[i].interpolation = "LINEAR"
        new.update()
    return run


def source_clips():
    src, meshes = import_glb(UAL2)
    for mesh in meshes:
        bpy.data.objects.remove(mesh, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=UAL1_FBX)
    for obj in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(obj, do_unlink=True)
    clips = {}
    for action in list(bpy.data.actions):
        base = action.name.split("|")[-1]
        rename = KEEP_UAL2.get(base) if "|" not in action.name else KEEP_UAL1.get(base)
        if rename:
            action.name = "src_" + rename
            clips[rename] = action
        else:
            bpy.data.actions.remove(action)
    clips["Run"] = make_run(clips["Sprint"], clips["Walk"])
    bpy.data.actions.remove(clips.pop("Sprint"))
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


def bake(src, dst, name, src_action, rest, ratio):
    src.animation_data.action = src_action
    src.animation_data.action_slot = src_action.slots[0]
    action = bpy.data.actions.new(name)
    dst.animation_data_create()
    dst.animation_data.action = action
    f0, f1 = (int(round(v)) for v in src_action.frame_range)
    inv = dst.matrix_world.inverted()
    # The armature object may be rotated (FBX → glTF); pose matrices live in its space.
    to_arm = dst.matrix_world.to_3x3().normalized().to_quaternion().inverted()
    for frame in range(f0, f1 + 1):
        bpy.context.scene.frame_set(frame)
        for s, t, located in MAP:
            r = rest[s]
            ps, pt = src.pose.bones[s], dst.pose.bones[t]
            q = world_rot(src, ps.matrix) @ r["s_rot"].inverted() @ r["t_ref"]
            if located:
                loc = inv @ (r["t_loc"] + ((src.matrix_world @ ps.head) - r["s_loc"]) * ratio)
            else:
                loc = pt.matrix.translation.copy()
            pt.matrix = Matrix.LocRotScale(loc, to_arm @ q, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
            pt.keyframe_insert("rotation_quaternion", frame=frame - f0)
            if located:
                pt.keyframe_insert("location", frame=frame - f0)
    action.use_fake_user = True
    return action


# ---------- one skeleton per gender ----------

def gather(folder, outfits):
    """Imports every outfit, joins each into one mesh named after it, binds all to one skeleton."""
    shared = None
    bodies = {}
    for name, poly_id in outfits.items():
        arm, meshes = import_glb(Path(folder) / f"{poly_id}.glb")
        if arm.animation_data:
            arm.animation_data.action = None
        bpy.ops.object.select_all(action="DESELECT")
        for mesh in meshes:
            mesh.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        body = bpy.context.active_object
        body.name = name
        if shared is None:
            shared = arm
        else:
            body.parent = shared
            for mod in body.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = shared
            bpy.data.objects.remove(arm, do_unlink=True)
        bodies[name] = body
    return shared, bodies


# ---------- painting ----------

def region_of(bone):
    for prefix, region in (
        ("Head", "head"), ("Neck", "neck"), ("Wrist", "hand"), ("Index", "hand"), ("Middle", "hand"),
        ("Ring", "hand"), ("Pinky", "hand"), ("Thumb", "hand"), ("Foot", "foot"),
    ):
        if bone.startswith(prefix):
            return region
    return "body"


def vertex_regions(body):
    names = {g.index: g.name for g in body.vertex_groups}
    out = []
    for v in body.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        out.append(region_of(names[best.group]) if best else "body")
    return out


def kind_of(material_name):
    n = material_name.lower()
    if n.startswith("skin"):
        return "skin"
    if n == "eye":
        return "eye"
    if "hair" in n or "eyebrow" in n or "moustache" in n:
        return "hair"
    return "cloth"


def base_colour(material):
    bsdf = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    rgb = bsdf.inputs["Base Color"].default_value[:3] if bsdf else material.diffuse_color[:3]
    # Linear → sRGB, since the texture is painted in sRGB.
    return Vector([c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055 for c in rgb])


def face_frame(body):
    """Eyes from the 'Eye' faces (or the head's front if a visor hides them); mouth below them."""
    me = body.data
    eye_index = next((i for i, m in enumerate(me.materials) if m and m.name.lower() == "eye"), None)
    head = [v.co for v, r in zip(me.vertices, vertex_regions(body)) if r == "head"]
    front = min(p.y for p in head)
    zs = sorted(p.z for p in head)
    eye_z = zs[len(zs) // 2]
    if eye_index is not None:
        pts = [me.vertices[vi].co for poly in me.polygons if poly.material_index == eye_index for vi in poly.vertices]
        if pts:
            eye_z = sum(p.z for p in pts) / len(pts)
            front = min(p.y for p in pts)
    return {"front": front, "eye_z": eye_z, "mouth_z": eye_z - 0.075}


def skin(p):
    c = SKIN * (0.74 + 0.3 * noise.noise(p * 6)) * (0.9 + 0.1 * noise.noise(p * 40))
    if noise.noise(p * 3 + Vector((5, 1, 2))) > 0.32:
        c = c.lerp(BRUISE, 0.6)
    if abs(noise.noise(p * 24)) < 0.035:
        c = c * 0.72
    return c


def cloth(p, colour, seed):
    grey = (colour.x + colour.y + colour.z) / 3
    c = colour.lerp(Vector((grey, grey, grey)), 0.3) * 0.8  # faded, filthy
    c = c * (0.8 + 0.2 * noise.noise(p * 90)) * (0.62 + 0.38 * min(1.0, max(0.0, p.z / 1.2)))
    tear = noise.noise(p * 9 + Vector((seed, 0, 0)))
    if tear > 0.5:
        return skin(p)
    return c * 0.45 if tear > 0.4 else c


def face(p, c, frame):
    on_front = p.y < frame["front"] + 0.05
    for side in (-1, 1):
        d = math.hypot(p.x - side * 0.035, (p.z - frame["eye_z"]) * 1.2)
        if on_front and d < 0.03:
            c = c.lerp(SOCKET, min(1.0, (0.03 - d) / 0.012))
    if on_front and abs(p.x) < 0.028 and abs(p.z - frame["mouth_z"]) < 0.01:
        c = Vector((0.08, 0.02, 0.02))
    return c


def bleed(p, region, c, frame, spots):
    below = frame["mouth_z"] - p.z
    drip = abs(p.x) < 0.035 + 0.02 * noise.noise(p * 15) and p.y < frame["front"] + 0.14
    if drip and 0 < below < 0.4 and noise.noise(Vector((p.x * 90, 0, p.z * 3))) > 0.15 + below:
        c = c.lerp(FRESH if below < 0.08 else BLOOD, 0.8)
    if region == "hand" and noise.noise(p * 12) > 0.1:
        c = c.lerp(BLOOD, 0.55)
    for centre, radius in spots:
        d = (p - centre).length + 0.035 * noise.noise(p * 25)
        if d < radius:
            c = c.lerp(FRESH if d < radius * 0.4 else BLOOD, 0.45 + 0.35 * (1 - d / radius))
    return c


def shade(p, kind, region, colour, frame, spots, seed):
    if kind == "eye":
        return MILKY * (0.9 + 0.1 * noise.noise(p * 300))
    if kind == "hair":
        c = colour * 0.75
    elif kind == "skin":
        c = skin(p)
    else:
        c = cloth(p, colour, seed)
    if region in ("head", "neck") and kind == "skin":
        c = face(p, c, frame)
    return bleed(p, region, c, frame, spots)


def stains(body, seed):
    rng = random.Random(seed)
    verts = [v.co.copy() for v in body.data.vertices if 0.9 < v.co.z < 1.5]
    return [(rng.choice(verts), rng.uniform(0.04, 0.09)) for _ in range(rng.randint(2, 5))]


def raster_triangle(img, uvs, pos, shade_at):
    a, b, c = uvs
    den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    if abs(den) < 1e-12:
        return
    for y in range(max(0, int(min(u.y for u in uvs))), min(SIZE, int(max(u.y for u in uvs)) + 2)):
        for x in range(max(0, int(min(u.x for u in uvs))), min(SIZE, int(max(u.x for u in uvs)) + 2)):
            px, py = x + 0.5, y + 0.5
            w0 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / den
            w1 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / den
            w2 = 1 - w0 - w1
            if min(w0, w1, w2) < -0.02:
                continue
            col = shade_at(pos[0] * w0 + pos[1] * w1 + pos[2] * w2)
            img[y, x] = (min(col.x, 1), min(col.y, 1), min(col.z, 1), 1)


def paint(body, seed):
    me = body.data
    regions = vertex_regions(body)
    frame = face_frame(body)
    spots = stains(body, seed)
    kinds = [kind_of(m.name) if m else "cloth" for m in me.materials]
    colours = [base_colour(m) if m else Vector((0.5, 0.5, 0.5)) for m in me.materials]
    uv = me.uv_layers.active.data
    img = np.zeros((SIZE, SIZE, 4), np.float32)
    me.calc_loop_triangles()
    for tri in me.loop_triangles:
        kind, colour = kinds[tri.material_index], colours[tri.material_index]
        region = regions[tri.vertices[0]]
        uvs = [Vector(uv[li].uv) * SIZE for li in tri.loops]
        pos = [me.vertices[vi].co.copy() for vi in tri.vertices]
        raster_triangle(img, uvs, pos, lambda p: shade(p, kind, region, colour, frame, spots, seed))
    return dilate(img)


def dilate(img, steps=4):
    """Bleed island edges outward so texture filtering never samples the empty background."""
    for _ in range(steps):
        empty = img[:, :, 3] == 0
        grown = img.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(np.roll(img, dy, 0), dx, 1)
            take = empty & (shifted[:, :, 3] > 0) & (grown[:, :, 3] == 0)
            grown[take] = shifted[take]
        img = grown
    return img


def unwrap(body):
    me = body.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def to_rest_space(body):
    """Paint in metres, Z up, facing −Y, whatever the import put on the object."""
    me = body.data
    me.transform(body.matrix_world)
    body.matrix_world = Matrix.Identity(4)
    return me


def textured(body, pixels, gender):
    image = bpy.data.images.new(f"zombie-{gender}-{body.name}", SIZE, SIZE, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    mat = bpy.data.materials.new(f"zombie-{gender}-{body.name}")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    body.data.materials.clear()
    body.data.materials.append(mat)


def zombify_body(body, gender, seed):
    unwrap(body)
    # Paint from world-space rest positions (metres) without moving the bound mesh.
    world = body.matrix_world.copy()
    probe = body.copy()
    probe.data = body.data.copy()
    bpy.context.collection.objects.link(probe)
    to_rest_space(probe)
    pixels = paint(probe, seed)
    bpy.data.objects.remove(probe, do_unlink=True)
    textured(body, pixels, gender)
    body.matrix_world = world


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_animation_mode="NLA_TRACKS",
        export_vertex_color="NONE",
        export_image_format="JPEG",
        export_image_quality=85,
    )


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    OUT.mkdir(parents=True, exist_ok=True)
    src, clips = source_clips()
    for gender, folder in (("m", MEN), ("f", WOMEN)):
        arm, bodies = gather(folder, OUTFITS[gender])
        # Drop the packs' own clips (and the other gender's bakes); only zombie clips ship.
        for action in [a for a in bpy.data.actions if not a.name.startswith("src_")]:
            bpy.data.actions.remove(action)
        if arm.animation_data:
            for track in list(arm.animation_data.nla_tracks):
                arm.animation_data.nla_tracks.remove(track)
        for i, body in enumerate(bodies.values()):
            zombify_body(body, gender, seed=i + (20 if gender == "f" else 0))
        rest = rest_frames(src, arm)
        ratio = rest["pelvis"]["t_loc"].z / rest["pelvis"]["s_loc"].z
        made = [bake(src, arm, name, act, rest, ratio) for name, act in clips.items()]
        # One NLA track per clip, so the export carries exactly this skeleton's clips.
        arm.animation_data.action = None
        for action in made:
            track = arm.animation_data.nla_tracks.new()
            track.name = action.name
            track.strips.new(action.name, 0, action)
        export(OUT / f"zombie-{gender}.glb", [arm, *bodies.values()])
        print("EXPORTED", gender, sorted(bodies), [a.name for a in made])
        for obj in [arm, *bodies.values()]:
            bpy.data.objects.remove(obj, do_unlink=True)


main()
