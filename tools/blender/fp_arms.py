"""Kartik's first-person arms (public/assets/characters/kartik-arms.glb): one static posed mesh per weapon.

Cut from the already recoloured body in `public/assets/characters/kartik.glb` (grey-navy tee, brown skin): both arms are posed
by a two-bone solver plus finger curls, evaluated through the skin, cut off above the elbow (the short sleeve and its hem stay)
and baked to a plain mesh, so the game skins nothing. Four nodes, `arms_bow`, `arms_pistol`, `arms_shotgun`, `arms_rifle`,
each in its weapon's own frame (Blender +Y = the barrel, the frame plan6_guns.py / plan3_props.py / dream1_props.py build the
props in), so a node is added as a child of the weapon's viewmodel and needs no offset.

The arms are scaled ARM_SCALE (the guns are held out far in front of the eye, the usual first-person trick) and the shoulders
sit off screen, wherever the arm needs them: only the forearms and hands are ever seen.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/fp_arms.py -- \\
    public/assets/characters/kartik.glb public/assets/props <out.glb> [preview_dir]
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

KARTIK, PROPS, OUT, *REST = sys.argv[sys.argv.index("--") + 1 :]
PREVIEW = Path(REST[0]) if REST else None

ARM_SCALE = 1.25
HEM_REACH = 0.16  # metres of upper arm kept above the elbow, before ARM_SCALE (as kartik.py)
REACH = 0.9  # how far the arm is stretched, of its full length
PALM = 0.06  # metres from the wrist to the middle of the palm, before ARM_SCALE
FOV = 70.0  # the game's vertical field of view, degrees (src/engine/stage.ts)
FINGERS = ("Index", "Middle", "Ring", "Pinky")

# Where each viewmodel sits in the camera (three.js camera space: x right, y up, -z ahead) and its XYZ Euler turn.
VIEWS = {
    "bow": ((-0.32, -0.15, -0.55), (0.0, -0.1, 0.15)),
    "pistol": ((0.26, -0.2, -0.52), (0, 0, 0)),
    "shotgun": ((0.24, -0.27, -0.62), (0, 0, 0)),
    "rifle": ((0.25, -0.26, -0.55), (0, 0, 0)),
}


FOCUS = {"pistol": Vector((0, 0.0, -0.03)), "shotgun": Vector((0, 0.4, 0.0)), "rifle": Vector((0, 0.36, 0.0)), "bow": Vector((0, -0.05, 0))}


def hand(shoulder, centre, f, u, pole, curl, thumb, swing=0.0):
    """One arm (gun frame, metres): the direction from the wrist back to the (off-screen) shoulder, the palm-centre position,
    fingers direction f, back-of-hand u, where the elbow points, the finger curls at knuckle / middle / tip and the thumb's
    three curls (degrees), the thumb's swing."""
    return dict(S=Vector(shoulder).normalized(), H=Vector(centre), f=Vector(f), u=Vector(u), pole=Vector(pole), curl=curl, thumb=thumb, swing=swing)


HEMS = {"rifle": 0.08, "shotgun": 0.08}  # the long guns: the sleeve runs on out of frame (the others keep HEM_REACH)
SCALES = {"bow": 1.25, "pistol": 1.0, "shotgun": 1.25, "rifle": 1.25}  # the pistol is small: smaller hands leave the slide in sight
RIGHT = ((0.5, -0.6, -0.6), (0.02, -0.055, -0.03), (0, 1, -0.25), (1, 0.05, 0.1), (0.5, -0.2, -1), (70, 80, 60), (40, 50, 35))
FOREND = ((-0.95, -0.25, -0.45), (-0.035, 0.0, -0.005), (1, 0.1, 0.0), (0, 0, -1), (-0.3, 0, -1), (70, 80, 60), (10, 15, 10))
POSES = {
    "pistol": {
        "R": hand((0.35, -0.7, -0.55), (0.025, -0.045, -0.045), (0, 1, -0.2), (1, 0.05, 0.1), (0.5, -0.2, -1), (70, 80, 60), (25, 30, 20)),
        "L": hand((-0.35, -0.7, -0.55), (-0.025, -0.03, -0.075), (0.05, 1, 0.0), (-1, 0, 0.1), (-0.5, -0.2, -1), (70, 80, 60), (10, 10, 0)),
    },
    "shotgun": {"R": hand(*RIGHT), "L": hand(*FOREND[:1], (-0.035, 0.34, -0.01), *FOREND[2:])},
    "rifle": {"R": hand(*RIGHT), "L": hand(*FOREND[:1], (-0.035, 0.25, -0.005), *FOREND[2:])},
    "bow": {
        "L": hand((-0.25, -0.2, -1.0), (-0.045, 0.0, 0.0), (0, 1, 0), (-1, 0, 0), (-0.5, -0.2, -1), (75, 85, 65), (30, 30, 20)),
        "R": hand((0.45, -0.35, -0.85), (0.07, -0.17, 0.0), (-0.5, 0.85, 0.1), (1, 0, 0), (0.5, -0.2, -1), (75, 85, 65), (20, 20, 10)),
    },
}


# ---- the pose ------------------------------------------------------------------------------------------------------


class Rig:
    """World-space (scaled) rest data of one arm's bones and a way to pose them."""

    def __init__(self, arm, side):
        self.arm, self.side = arm, side
        self.M = arm.matrix_world
        names = [b.name for b in arm.data.bones if b.name.endswith("." + side)]
        self.head = {n: self.M @ arm.data.bones[n].head_local for n in names}
        self.turn = self.M.to_3x3().normalized()  # the importer leaves the armature turned and scaled 100x
        self.rest = {n: self.turn @ arm.data.bones[n].matrix_local.to_3x3().normalized() for n in names}

    def n(self, name):
        return f"{name}.{self.side}"

    def vec(self, a, b):
        return self.head[self.n(b)] - self.head[self.n(a)]

    def place(self, name, head, delta):
        """Pose bone `name` so its head is at world `head` and it is turned by `delta` from its rest."""
        pb = self.arm.pose.bones[self.n(name)]
        pb.matrix = Matrix.Translation(self.M.inverted() @ head) @ (self.turn.inverted() @ delta @ self.rest[self.n(name)]).to_4x4()
        bpy.context.view_layer.update()


def arc(a, b):
    return a.normalized().rotation_difference(b.normalized()).to_matrix()


def solve_elbow(s, w, l1, l2, pole):
    """Elbow of a two-bone arm from shoulder s to wrist w, bending toward `pole`; returns (elbow, wrist pulled into reach)."""
    d = (w - s).length
    if d > l1 + l2:
        print(f"  WARN out of reach by {d - l1 - l2:.3f} m (d {d:.3f}, reach {l1 + l2:.3f})", flush=True)
    d = min(d, l1 + l2 - 1e-4)
    axis = (w - s).normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    side = (pole - axis * pole.dot(axis)).normalized()
    return s + axis * a + side * h, s + axis * d


def hand_frame(side, f, u):
    """Orthonormal (thumb, back of hand, fingers) of a hand, right-handed for R and mirrored for L."""
    f = f.normalized()
    u = (u - f * u.dot(f)).normalized()
    return (u.cross(f) if side == "R" else f.cross(u)), u, f


def flex(axis, degrees):
    return Quaternion(axis, math.radians(degrees)).to_matrix()


def curl_chain(rig, names, head, d, angles, axis, swing_axis=None, swing=0.0):
    """Forward kinematics down a finger: bone i is turned by angles[i] about `axis` on top of its parent's turn."""
    for i, name in enumerate(names):
        d = flex(axis, angles[i]) @ d
        if i == 0 and swing_axis is not None:
            d = flex(swing_axis, swing) @ d
        rig.place(name, head, d)
        if i + 1 < len(names):
            head = head + d @ rig.vec(name, names[i + 1])


def roll_about(delta, axis):
    """Angle (degrees) of rotation matrix `delta` that is twist about `axis`."""
    q = delta.to_quaternion()
    return math.degrees(2 * math.atan2(Vector((q.x, q.y, q.z)).dot(axis), q.w))


def pose_arm(arm, side, spec):
    """Poses one arm to `spec`; returns the elbow's and the shoulder's world positions."""
    rig = Rig(arm, side)
    t, u, f = hand_frame(side, spec["f"], spec["u"])
    l1, l2 = rig.vec("UpperArm", "LowerArm").length, rig.vec("LowerArm", "Wrist").length
    w = spec["H"] - f * PALM * ARM_SCALE
    s = w + spec["S"] * (l1 + l2) * REACH
    elbow, w = solve_elbow(s, w, l1, l2, spec["pole"])
    rest = hand_frame(side, rig.vec("Wrist", "Middle2"), Vector((0, 0, 1)))  # a T-pose, palms down
    d_hand = Matrix((t, u, f)).transposed() @ Matrix(rest)
    d_upper = arc(rig.vec("UpperArm", "LowerArm"), elbow - s)
    d_lower = arc(rig.vec("LowerArm", "Wrist"), w - elbow)
    axis = (w - elbow).normalized()
    twist = flex(axis, roll_about(d_hand @ d_lower.inverted(), axis) * 0.5)  # share the hand's roll: no candy-wrapper wrist
    rig.place("Shoulder", s - d_upper @ rig.vec("Shoulder", "UpperArm"), d_upper)  # the skin of the sleeve follows it
    rig.place("UpperArm", s, d_upper)
    rig.place("LowerArm", elbow, twist @ d_lower)
    rig.place("Wrist", w, d_hand)
    bend = f.cross(-u).normalized()  # turning about this takes the fingers toward the palm
    for finger in FINGERS:
        curl_chain(rig, [f"{finger}{i}" for i in (1, 2, 3, 4)], w, d_hand, (0, *spec["curl"]), bend)
    thumb_dir = d_hand @ rig.vec("Wrist", "Thumb2")
    curl_chain(rig, ["Thumb1", "Thumb2", "Thumb3"], w, d_hand, spec["thumb"], thumb_dir.cross(-u).normalized(), u, spec["swing"])
    return elbow, s


# ---- cutting and baking --------------------------------------------------------------------------------------------


def cut_side(body, side, elbow, shoulder):
    """A mesh of one posed arm: hand and forearm, and the sleeve down from HEM_REACH above the elbow."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(body.matrix_world)
    groups = [g.name for g in body.vertex_groups]
    hands = {"LowerArm", "Wrist", *[f"{n}{i}" for n in (*FINGERS, "Thumb") for i in range(1, 5)]}
    mine = [groups.index(n) for n in groups if n.endswith("." + side) and n.split(".")[0] in hands]
    upper = groups.index(f"UpperArm.{side}")
    up = (elbow - shoulder).normalized()
    bm = bmesh.new()
    bm.from_mesh(me)
    deform = bm.verts.layers.deform.active
    drop = []
    for face in bm.faces:
        weight = lambda idx: sum(v[deform].get(i, 0) for v in face.verts for i in idx) / len(face.verts)
        reach = (elbow - face.calc_center_median()).dot(up)
        sleeve = weight([upper]) > 0.5 and reach < (HEM + 0.05) * ARM_SCALE
        foreign = max(sum(w for i, w in v[deform].items() if not groups[i].endswith("." + side)) for v in face.verts)
        stretched = max(e.calc_length() for e in face.edges) > 0.2  # a vertex left behind in the T-pose
        if stretched or foreign > 0.2 or not (weight(mine) > 0.5 or sleeve):  # a vertex held by the torso stays behind in the T-pose
            drop.append(face)
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=elbow - up * HEM * ARM_SCALE, plane_no=-up, clear_outer=True)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"half_{side}", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bake(name, specs, arm, body):
    """Pose both arms for one weapon and join them into the object `arms_<name>`."""
    global ARM_SCALE
    ARM_SCALE = SCALES[name]
    global HEM
    HEM = HEMS.get(name, HEM_REACH)
    arm.scale = BASE_SCALE * ARM_SCALE
    bpy.context.view_layer.update()
    halves = [cut_side(body, side, *pose_arm(arm, side, spec)) for side, spec in specs.items()]
    bpy.ops.object.select_all(action="DESELECT")
    for o in halves:
        o.select_set(True)
    bpy.context.view_layer.objects.active = halves[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = obj.data.name = f"arms_{name}"
    obj.vertex_groups.clear()
    bpy.ops.object.material_slot_remove_unused()
    return obj


# ---- previews ------------------------------------------------------------------------------------------------------


def view_inverse(weapon):
    """Viewmodel-local to camera space, inverted: where the eye is in the weapon's frame (three.js axes)."""
    (px, py, pz), (rx, ry, rz) = VIEWS[weapon]
    rot = Matrix.Rotation(rx, 3, "X") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rz, 3, "Z")
    return (Matrix.Translation((px, py, pz)) @ rot.to_4x4()).inverted()


def to_blender(v):
    return Vector((v.x, -v.z, v.y))  # three (x, y, z) -> Blender gun frame


def render(weapon, shot, eye, forward, up, ortho=None, size=(1280, 720)):
    sc = bpy.context.scene
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
    cam.data.sensor_fit, cam.data.clip_start = "VERTICAL", 0.02
    cam.data.type = "ORTHO" if ortho else "PERSP"
    cam.data.ortho_scale = ortho or 1.0
    cam.data.angle = math.radians(FOV)
    right = forward.cross(up).normalized()
    up = right.cross(forward).normalized()
    cam.matrix_world = Matrix(((right.x, up.x, -forward.x, eye.x), (right.y, up.y, -forward.y, eye.y), (right.z, up.z, -forward.z, eye.z), (0, 0, 0, 1)))
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.filepath = str(PREVIEW / f"arms_{weapon}_{shot}.png")
    bpy.ops.render.render(write_still=True)


def preview(weapon, arms):
    """first-person (the game's camera and FOV), side and top PNGs of the arms with the weapon prop."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(PROPS) / f"{weapon}.glb"))
    gun = [o for o in bpy.data.objects if o not in before]
    for o in [*gun, arms]:
        for m in getattr(o.data, "materials", []):
            m.diffuse_color = m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value
    arms.hide_render = False
    inv = view_inverse(weapon)
    eye = to_blender(inv @ Vector((0, 0, 0)))
    forward, up = (to_blender(inv.to_3x3() @ Vector(v)) for v in ((0, 0, -1), (0, 1, 0)))
    render(weapon, "fp", eye, forward, up)
    centre = Vector((0, 0.1, -0.05)) if weapon != "bow" else Vector((0, 0, 0))
    render(weapon, "side", centre + Vector((-1.4, 0, 0.1)), Vector((1, 0, 0)), Vector((0, 0, 1)), ortho=1.6, size=(900, 700))
    render(weapon, "top", centre + Vector((0, 0.0, 1.4)), Vector((0, 0, -1)), Vector((0, 1, 0)), ortho=1.6, size=(900, 700))
    render(weapon, "right", centre + Vector((1.4, 0, 0.1)), Vector((-1, 0, 0)), Vector((0, 0, 1)), ortho=0.8, size=(900, 700))
    focus = FOCUS[weapon]  # the left hand's grip: seen from in front and from above, close up
    render(weapon, "front", focus + Vector((0, 0.25, 0)), Vector((0, -1, 0)), Vector((0, 0, 1)), ortho=0.5, size=(700, 700))
    render(weapon, "zoom", focus + Vector((0, 0, 0.5)), Vector((0, 0, -1)), Vector((0, 1, 0)), ortho=0.5, size=(700, 700))
    for o in gun:
        bpy.data.objects.remove(o, do_unlink=True)
    arms.hide_render = True


def one_material(obj):
    """Skin and sleeve colours into vertex colours under a single material: one draw call per weapon."""
    me = obj.data
    colours = [m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value[:] for m in me.materials]
    attr = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        for i in poly.loop_indices:
            attr.data[i].color = colours[poly.material_index]
    mat = bpy.data.materials.new("Arms")
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Color"
    mat.node_tree.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.clear()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.material_index = 0


# ---- main ----------------------------------------------------------------------------------------------------------


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=KARTIK)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.data.objects if o.name.endswith("_Body"))
    global BASE_SCALE
    BASE_SCALE = arm.scale.copy()
    bpy.context.view_layer.update()
    baked = [bake(name, specs, arm, body) for name, specs in POSES.items()]
    for o in [o for o in bpy.data.objects if o not in baked]:
        bpy.data.objects.remove(o, do_unlink=True)
    if PREVIEW:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.display.shading.light, sc.display.shading.color_type = "STUDIO", "MATERIAL"
        sc.world = bpy.data.worlds.new("w")
        sc.world.color = (0.18, 0.18, 0.2)
        for o in baked:
            o.hide_render = True
        for o in baked:
            preview(o.name.removeprefix("arms_"), o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in baked:
        one_material(o)
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True)
    print("TRIS", {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in baked})


main()
