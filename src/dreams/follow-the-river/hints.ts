export type HintId =
  | 'pickup'
  | 'shack'
  | 'bow'
  | 'fish'
  | 'wait'
  | 'night'
  | 'hurt'
  | 'tape'
  | 'battery'
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
    'Batteries, arrows and fish packs lie about. In the dark, your torch finds them.',
    'Walk up to one and press E to pick it up.',
    'Click to shoot your bow. F turns your flashlight on and off.',
  ],
  shack: [
    'It is pitch black in here.',
    'Press F for your flashlight. It drains while it is on - watch the meter in the corner.',
    'Switched off, it slowly charges back up.',
  ],
  battery: ['A spare battery. When the torch runs low, press R to put it in.'],
  bow: ['Click to shoot your bow. It is silent.', 'Walk over your arrows to pick them back up.'],
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
    'They are coming, and they will keep coming. The crate is in one of the houses here: take your torch.',
  ],
  clear: ['The barricade is down. Keep going downstream.'],
  hurt: ['You are hurt. Three hits and you are dead.'],
  tape: ["A video tape. Mom's handwriting on the label."],
  night1: [
    "Ammo is scarce. Search the dark houses along the road with your torch: ammo, arrows and each wave's crate are inside. Mind the corners.",
  ],
  night2: ['Corn hides them. Listen.'],
  night3: ['The lake. Mom is waiting at the lake.'],
  pistol: [
    'A police pistol. Press 2 for it, 1 for the bow.',
    'It stops anything - but every shot is loud, and they will come.',
  ],
  shotgun: ['A shotgun. Press 3. Close up, one blast can drop a group.'],
  rifle: ['A rifle. Press 4 and hold the trigger. Mind the rounds.'],
};
