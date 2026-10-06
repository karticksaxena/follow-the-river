export type HintId =
  | 'pickup'
  | 'day2'
  | 'day3'
  | 'shack'
  | 'bow'
  | 'bowStory'
  | 'fish'
  | 'wait'
  | 'night'
  | 'hurt'
  | 'tape'
  | 'battery'
  | 'ammo'
  | 'pistol'
  | 'shotgun'
  | 'rifle'
  | 'wave'
  | 'waveHouse'
  | 'clear'
  | 'night1'
  | 'night2'
  | 'night3';

/** Player-paced pages, each shown once per run (ids are kept in `RunState.hints`). */
export const HINTS: Readonly<Record<HintId, readonly string[]>> = {
  pickup: [
    'Batteries, arrows and fish packs lie about. Walk up to one and press E to pick it up.',
    'Explore the sheds by the road. Supplies and a tape are inside: go in and search them with your flashlight (F).',
    "Feed Dras: at the water's edge, press E to throw her a fish pack. The more you feed her, the hungrier she gets, and the more she helps you at night.",
    'Keep moving downstream and follow the river. Hold Shift to run. Click to shoot your bow.',
  ],
  shack: [
    'It is pitch black in here.',
    'Press F for your flashlight. It drains while it is on - watch the meter in the corner.',
    'Switched off, it slowly charges back up.',
  ],
  battery: ['A spare battery. When the flashlight runs low, press R to put it in.'],
  ammo: [
    'An ammo box: bullets for every gun you own. The weapon list at the bottom left shows how many each gun has.',
    'No gun yet? You keep the bullets for the first gun you find.',
  ],
  bow: [
    'Click to shoot your bow. It is silent.',
    'Walk over arrows that missed to pick them back up. One that hits a zombie stays in it.',
  ],
  /** Story keeps arrows that hit (difficulty.ts `keepHitArrows`). */
  bowStory: [
    'Click to shoot your bow. It is silent.',
    'Walk over your arrows to pick them back up, even ones that hit.',
  ],
  fish: [
    "Stand at the water's edge and press E to throw a fish pack in.",
    'Every fish pack you feed her makes her hungrier.',
  ],
  wait: [
    'When you are ready, rest by the campfire and wait for dark.',
    'You cannot come back here after.',
  ],
  night: [
    'Night. They are fast now.',
    'Click shoots. F is your flashlight: off, it charges back up; R puts in a spare battery.',
    'Shine the light in their faces to stop them for a moment.',
    'Downstream, a barricade holds you at each wave. They keep coming until the wave is dead; then it falls.',
    "Dras hunts near you: she takes some, you must kill the rest. Out of ammo? Lead them to the water's edge and keep moving.",
  ],
  wave: ['They are coming, and they will keep coming. Find the crate.'],
  waveHouse: [
    'They are coming, and they will keep coming. The crate is in one of the houses here: take your flashlight.',
  ],
  clear: ['The barricade is down and you catch your breath. Keep going downstream.'],
  hurt: ['You are hurt. Three hits and you are dead.'],
  tape: ["A video tape. Mom's handwriting on the label."],
  night1: [
    "Ammo is scarce. Search the dark houses along the road with your flashlight: ammo, arrows and each wave's crate are inside. Mind the corners.",
    "Keep following the river, and feed Dras at the water's edge: the more she eats, the more she helps you.",
  ],
  day2: [
    'The suburbs. Search the sheds for supplies, and feed Dras at the water.',
    'Keep following the river.',
  ],
  day3: [
    'The forest. Search the cabin for supplies, and feed Dras at the water.',
    'Keep following the river.',
  ],
  night2: [
    'Corn hides them. Listen.',
    "Keep following the river. Search the sheds for ammo, and feed Dras at the water's edge: she helps more the hungrier she is.",
  ],
  night3: [
    'The lake. Mom is waiting at the lake.',
    'Keep following the river. Search the cabin, and feed Dras: the more fish she eats, the harder she hunts for you.',
  ],
  pistol: [
    'A police pistol. Press 2 for it, 1 for the bow.',
    'It stops anything - but every shot is loud, and they will come.',
  ],
  shotgun: ['A shotgun. Press 3. Close up, one blast can drop a group.'],
  rifle: ['A rifle. Press 4 and hold the trigger. Mind the rounds.'],
};
