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
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/flashback_props.py -- public/assets/props   # lab, tank, cage (delete the preview PNGs after)
```

## Bedroom ceiling fan (home screen)

Metres, hangs down from the ceiling mount point (origin). Nodes `CeilingFan` > `Fixture` + `Blades` (blades and irons, origin on the
spin axis). Plain GLB, not compressed:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/ceiling_fan.py
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

## Dras (orca.glb)

`tools/blender/orca.py` writes the raw GLB and prints an `ANATOMY {...}` line (measured metres). Rebuild, compress, then copy the
numbers into `src/dreams/follow-the-river/dras-anatomy.ts` (never eyeball them):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/orca.py -- /tmp/orca-raw.glb
pnpm dlx @gltf-transform/cli@latest optimize /tmp/orca-raw.glb public/assets/characters/orca.glb --compress meshopt \
  --join false --flatten false --palette false --instance false --simplify false --texture-compress auto
```

Materials `orca-black|white|grey|mouth|eye`, bones `Head Jaw Spine1-5 Tail1 Tail2`, clips `Swim` `Lunge` and the beached
death `Beached` (4 s loop), `TailLift` (1.5 s, starts and ends in the Beached rest pose), `Exhale` (3 s, ends still): bones
only, no root motion, they assume she lies on her belly. The `Jaw` rest quaternion is not identity: open it by composing
`-open` about local X on top of it. The new clips add ~16 KB (3 x 27 TRS channels of JSON). If `orca-model.test.ts` fails with a
JSON parse error after a rebuild, the GLB's JSON-length header bytes decode oddly under `?raw` (UTF-8): nudge a pose constant.

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

### Dras' sounds (`public/assets/sounds/dras/`)

Sources are decoded to 16-bit WAV with `afconvert -f WAVE -d LEI16 in.mp3|ogg out.wav` (no ffmpeg). Pick cuts by eye with
`python3 tools/assets/spectrogram.py in.wav out.png --start S --end S --pps 80` and `Read` the PNG. `tools/assets/cut_sound.py` trims, mixes to mono,
resamples to 48 kHz, high-passes, fades and normalises to -3 dBFS (`--fadein 0.003` keeps a splash's attack; `--loop S` makes a seamless loop).
Encode: `afconvert -f m4af -d aac -b 96000 -c 1 x.wav public/assets/sounds/dras/x.m4a`.

Blows: `whales-spouting-fws.wav` (U.S. Fish and Wildlife Service, public domain, SoundBible 276, 32 kHz stereo). The take is windy and repeats every
15.4 s (second half = first half), so only the first 15.4 s was used; all cuts `--hp 80 --mono --fadein 0.01 --fadeout 0.08`.

```bash
python3 tools/assets/cut_sound.py whales-spouting-fws.wav blow-1.wav --start 3.10  --end 4.05  --hp 80 --mono --fadein 0.01 --fadeout 0.08
python3 tools/assets/cut_sound.py whales-spouting-fws.wav blow-2.wav --start 4.75  --end 5.85  --hp 80 --mono --fadein 0.01 --fadeout 0.08
python3 tools/assets/cut_sound.py whales-spouting-fws.wav blow-3.wav --start 7.45  --end 8.55  --hp 80 --mono --fadein 0.01 --fadeout 0.08
python3 tools/assets/cut_sound.py whales-spouting-fws.wav blow-4.wav --start 13.25 --end 14.35 --hp 80 --mono --fadein 0.01 --fadeout 0.08
```

Splashes (CC0; Freesound HQ previews `https://cdn.freesound.org/previews/<id first 3 digits>/<id>_..-hq.mp3`, rubberduck's pack from OpenGameArt). Rubberduck
files rejected: 01, 04, 06-11, 14, 15 (too short, too tonal/bubbly or synthetic-sounding) and all `bubble_*`, `slime_*`, `loop_*`.

```bash
python3 tools/assets/cut_sound.py splash_02.wav splash-small-1.wav --start 0 --end 0.72 --mono --hp 80 --fadein 0.003 --fadeout 0.06
python3 tools/assets/cut_sound.py splash_05.wav splash-small-2.wav --start 0 --end 1.0  --mono --hp 80 --fadein 0.003 --fadeout 0.08
python3 tools/assets/cut_sound.py splash_12.wav splash-small-3.wav --start 0 --end 0.78 --mono --hp 80 --fadein 0.003 --fadeout 0.06
python3 tools/assets/cut_sound.py large-splash-roboroo-436792.wav       splash-big-1.wav --start 0 --end 1.75 --mono --hp 60 --fadein 0.003 --fadeout 0.15
python3 tools/assets/cut_sound.py big-splash-birdman-316744.wav         splash-big-2.wav --start 0 --end 1.7  --mono --hp 60 --fadein 0.003 --fadeout 0.15
python3 tools/assets/cut_sound.py big-water-splash-qubodup-442773.wav   splash-big-3.wav --start 0 --end 2.1  --mono --hp 60 --fadein 0.01  --fadeout 0.15
```

Voice and clicks: NPS Glacier Bay killer whale files (public domain), `killer_whale.wav` (29.8 s) and `killer_whale_2.wav` (85 s; broadband bursts with click
trains). Not reused: the cry (kw 7.5-10.4) and answer (kw 16.3-17.55); `orca-underwater-nps.wav` is the same cry looped twice, so it adds nothing.
`call-short-1` is the series of falling whistles; 2 and 3 are pulsed/burst calls (hum floor below ~1 kHz is not removable).

```bash
python3 tools/assets/cut_sound.py killer_whale.wav   call-short-1.wav --start 0.65  --end 1.4   --hp 250 --mono
python3 tools/assets/cut_sound.py killer_whale_2.wav call-short-2.wav --start 33.8  --end 34.85 --hp 250 --mono
python3 tools/assets/cut_sound.py killer_whale_2.wav call-short-3.wav --start 26.3  --end 27.35 --hp 250 --mono
python3 tools/assets/cut_sound.py killer_whale_2.wav clicks.wav       --start 62.5  --end 65.5  --hp 150 --mono --loop 0.2   # 2.8 s loop of low-frequency ticks
```

### Weapon sounds

Source: "The Free Firearm Sound Library" (Ben Jaszczak et al., CC0), https://opengameart.org/content/the-free-firearm-sound-library
→ download `Prepared SFX Library.7z`, extract with `bsdtar -xf`. Each file is a long 96 kHz 24-bit stereo take; `tools/assets/cut_shot.py`
(stdlib only) takes mono, trims to the first shot, cuts to a fixed length, fades out, normalises to -1 dBFS, resamples to 48 kHz.

```bash
L="Prepared SFX Library"
python3 tools/assets/cut_shot.py "$L/1911/A_34P.wav"      pistol.wav  1.0    # .45 1911, mid distance
python3 tools/assets/cut_shot.py "$L/Model 12/K_22P.wav"  shotgun.wav 1.4    # Winchester Model 12, 12 gauge, near
python3 tools/assets/cut_shot.py "$L/AR-15/D_32P.wav"     rifle.wav   0.45   # one AR-15 shot, near
afconvert -f m4af -d aac -b 96000 -c 1 pistol.wav public/assets/sounds/weapons/pistol.m4a   # same for shotgun, rifle
```

No CC0 bow, shotgun-pump or dry-fire clip was found (OpenGameArt bow sounds are CC-BY / CC-BY-SA), so those stay procedural.

## Mom's extra clips

`tools/blender/mom_clips.py` adds `Sit`, `Kneel`, `Throw` and `Row` to `public/assets/characters/mom.glb` (named `CharacterArmature|<name>` like her
Quaternius clips; every existing clip, mesh and material is kept). `Sit`, `Kneel` (a seamless hold cut from `Fixing_Kneeling`) and `Throw` are retargeted
from Quaternius' CC0 Universal Animation Libraries 1 (`AL_Standard.fbx`) and 2 (`UAL2_Standard.glb`); `Row` is authored (Sit + torso twist + both hands on a
swinging paddle shaft). Hips never travel. Re-running is safe (the four clips are replaced). Inputs are the downloaded packs from the zombie step:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/mom_clips.py -- \
  "<UAL1>/Unreal Engine/AL_Standard.fbx" "<UAL2>/Unreal-Godot/UAL2_Standard.glb" public/assets/characters/mom.glb
```

The script rewrites `mom.glb` in place, so keep a copy of the original if you want to diff it. Sources: https://opengameart.org/content/universal-animation-library and
https://opengameart.org/content/universal-animation-library-2

## Quaternius nature (MegaKit)

Source: Quaternius "Stylized Nature MegaKit" (Standard, CC0), https://opengameart.org/content/stylized-nature-megakit
(`https://opengameart.org/sites/default/files/stylized_nature_megakitstandard.zip`, 104 MB; unzip it, the models are in `glTF/`).
Five category GLBs land in `public/assets/kits/megakit/`: `trees.glb`, `trees-far.glb`, `plants.glb`, `grass.glb`, `rocks.glb`. Each model is a separately
named top-level node (`Pine_1`, `Fern_1`, …) at the origin, scale 1 (metres), with textures shared between models (deduplicated) and WebP-compressed.

```bash
tools/assets/megakit/build.sh "<unzipped pack>/glTF"
```

What the script does (read it for the exact flags; every `gltf-transform` flag was checked with `--help` on v4):
`prep.py` picks the models and forces the `Bark_*` materials to `OPAQUE` (the pack marks some bark `MASK`); `merge --merge-scenes` + `dedup` per category;
`optimize --compress meshopt --texture-compress webp --texture-size 1024` (512 for grass, rocks and the far trees) with `--flatten/--join/--instance/--palette false`
so node names and the one-node-per-model layout survive. Leaves and flowers keep `alphaMode MASK` (cutoff 0.2) and `doubleSided`.
`trees-far.glb` is made by `far.mjs`, because `gltf-transform simplify` stalls at ~80 % of the triangles (leaf cards are loose pieces): it keeps every 4th leaf card
(scaled up about 1.9x to hold the canopy) and runs meshoptimizer `simplify` with `Prune` + `Permissive` on the bark, about 25 % of the triangles overall.
The files need `EXT_meshopt_compression`, `EXT_texture_webp` and `KHR_mesh_quantization` (GLTFLoader supports all three; register `MeshoptDecoder`).
