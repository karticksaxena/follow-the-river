# Rebuilding the assets

Everything in `public/assets/` is CC0 (see `public/assets/LICENSES.md`). Binary assets are committed; these are the
steps that made them, so they can be rebuilt or changed.

## Blender props (Follow the River)

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/river_props.py -- public/assets/river
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/dream1_props.py -- public/assets/props
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/orca.py -- public/assets/characters/orca.glb
```

## Zombies

Sources (download, unzip):

- Quaternius **Universal Animation Library 2** (Standard): https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip
  → `Unreal-Godot/UAL2_Standard.glb`
- Quaternius **Universal Animation Library** (Standard): https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip
  → `Unreal Engine/AL_Standard.fbx`
- Quaternius **Ultimate Modular Men** and **Ultimate Modular Women** from poly.pizza
  (https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ, https://poly.pizza/bundle/Ultimate-Modular-Women-Pack-aCBDXDdTNN):
  one GLB per character, saved as `<men dir>/<poly.pizza id>.glb` and `<women dir>/<id>.glb` (ids are listed in `OUTFITS` in the script).

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/zombify.py -- UAL2_Standard.glb AL_Standard.fbx <men dir> <women dir> public/assets/characters
```

Mom is the women's pack "Formal" character (`nIItLV9nxS.glb`), copied as `characters/mom.glb`.

## Compression

Skinned characters are compressed with meshoptimizer (the game's `GLTFLoader` has the Meshopt decoder):

```bash
pnpm dlx @gltf-transform/cli@latest optimize in.glb out.glb --compress meshopt \
  --join false --flatten false --palette false --instance false --simplify false --texture-compress auto
```

## Kenney kits

Download the kits from kenney.nl (City Kit Commercial, City Kit Roads, Car Kit, Survival Kit, City Kit Suburban). Copy the
listed `Models/GLB format/*.glb` into `public/assets/kits/<kit>/` together with that kit's own `Textures/colormap.png`
(each kit has a different `colormap.png`, so kits never share a folder).

## Sounds

macOS `afconvert` to AAC in `.m4a` (plays in Chrome, Safari and Firefox):

```bash
afconvert -f m4af -d aac -b 64000 -c 1 zombie-1.wav public/assets/sounds/zombie/groan-01.m4a   # mono groans
afconvert -f m4af -d aac -b 96000 water_flowing.ogg public/assets/sounds/ambience/water.m4a     # stereo loops
```
