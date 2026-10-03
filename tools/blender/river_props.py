"""Builds the low-poly river scenery and exports one GLB per prop.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/river_props.py -- public/assets/river
"""

import math
import random
import sys
from pathlib import Path

import bpy

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/river")
random.seed(7)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple, emission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def box(name: str, size: tuple, location: tuple, mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def join(objects: list, name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def export(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")


def building(name: str, width: float, depth: float, height: float, lit_ratio: float) -> None:
    """Concrete block, rooftop box, rows of dark windows with a few still lit."""
    reset()
    wall = material("concrete", (0.09, 0.1, 0.11))
    dark = material("windowDark", (0.02, 0.025, 0.03))
    lit = material("windowLit", (1.0, 0.72, 0.35), emission=2.5)
    parts = [box("body", (width, depth, height), (0, 0, height / 2), wall)]
    parts.append(box("roof", (width * 0.4, depth * 0.4, 1.2), (width * 0.15, 0, height + 0.6), wall))
    floors = int(height // 3)
    columns = max(1, int(width // 2))
    for f in range(floors):
        for c in range(columns):
            x = -width / 2 + (c + 0.5) * width / columns
            z = 1.6 + f * 3
            glass = lit if random.random() < lit_ratio else dark
            parts.append(box("win", (0.9, 0.05, 1.2), (x, -depth / 2 - 0.02, z), glass))
    join(parts, name)
    export(name)


def pine(name: str, height: float) -> None:
    """Three stacked low-poly cones on a trunk."""
    reset()
    bark = material("bark", (0.06, 0.04, 0.03))
    needles = material("needles", (0.04, 0.07, 0.04))
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=0.18, depth=height * 0.3, location=(0, 0, height * 0.15)
    )
    trunk = bpy.context.active_object
    trunk.data.materials.append(bark)
    parts = [trunk]
    for i in range(3):
        radius = height * (0.28 - i * 0.06)
        z = height * (0.3 + i * 0.22)
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=radius, depth=height * 0.4, location=(0, 0, z + height * 0.2)
        )
        cone = bpy.context.active_object
        cone.rotation_euler[2] = random.random() * math.pi
        cone.data.materials.append(needles)
        parts.append(cone)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


def dead_tree(name: str, height: float) -> None:
    """A leafless trunk with crooked branches."""
    reset()
    bark = material("bark", (0.05, 0.04, 0.035))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.15, depth=height, location=(0, 0, height / 2))
    parts = [bpy.context.active_object]
    for i in range(4):
        angle = i * math.pi / 2 + random.random() * 0.6
        length = height * 0.35
        z = height * (0.5 + i * 0.1)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.06,
            depth=length,
            location=(math.cos(angle) * length / 3, math.sin(angle) * length / 3, z),
        )
        branch = bpy.context.active_object
        branch.rotation_euler = (math.sin(angle) * 0.9, -math.cos(angle) * 0.9, 0)
        parts.append(branch)
    for part in parts:
        part.data.materials.append(bark)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


def limb(radius: float, length: float, location: tuple, tilt: tuple = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=length, location=location)
    part = bpy.context.active_object
    part.rotation_euler = tilt
    return part


def watcher(name: str) -> None:
    """Too tall and too thin: arms hang past the knees, the head tilts, two eyes glow faint red.
    Faces Blender -Y, which exports as glTF +Z (towards a player walking down the bank)."""
    reset()
    shadow = material("shadow", (0.012, 0.012, 0.014))
    glow = material("eyes", (0.7, 0.03, 0.03), emission=4.0)
    parts = [limb(0.07, 1.2, (side * 0.11, 0, 0.6)) for side in (-1, 1)]
    torso = limb(0.16, 1.0, (0, 0, 1.68))
    torso.scale = (1.0, 0.6, 1.0)
    parts.append(torso)
    parts += [limb(0.045, 1.5, (side * 0.24, 0, 1.32), (0, side * 0.07, 0)) for side in (-1, 1)]
    parts.append(limb(0.05, 0.22, (0.02, 0, 2.25), (0.2, 0.15, 0)))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.15, location=(0.05, -0.04, 2.45))
    head = bpy.context.active_object
    head.scale = (0.85, 0.95, 1.2)
    head.rotation_euler = (0.25, 0.35, 0)
    parts.append(head)
    for part in parts:
        part.data.materials.append(shadow)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.022, location=(0.05 + side * 0.055, -0.165, 2.47))
        eye = bpy.context.active_object
        eye.data.materials.append(glow)
        parts.append(eye)
    join(parts, name)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    bpy.ops.object.shade_smooth()
    export(name)


building("buildingTall", 6, 6, 27, 0.08)
building("buildingMid", 8, 6, 15, 0.12)
building("buildingLow", 10, 7, 9, 0.18)
pine("pine", 9)
dead_tree("deadTree", 7)
watcher("watcher")
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
