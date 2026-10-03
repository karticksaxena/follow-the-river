export type HintId =
  'pickup' | 'shack' | 'bow' | 'fish' | 'wait' | 'night' | 'hurt' | 'tape' | 'gun';

/** Player-paced pages, each shown once per run (ids are kept in `RunState.hints`). */
export const HINTS: Readonly<Record<HintId, readonly string[]>> = {
  pickup: [
    'Things you can use glow faintly in the dark: batteries, arrows, fish packs.',
    'Walk up to one and press E to pick it up.',
    'Click to shoot your bow. F turns your flashlight on and off.',
  ],
  shack: [
    'It is pitch black in here.',
    'Press F for your flashlight. It eats battery — watch the meter in the corner.',
  ],
  bow: ['Click to shoot your bow. It is silent.', 'Walk over your arrows to pick them back up.'],
  fish: [
    "Stand at the water's edge and press E to throw a fish pack in.",
    'Every pack you feed it by day makes it hunt harder for you at night.',
  ],
  wait: [
    'When you are ready, rest by the campfire and wait for dark.',
    'You cannot come back here after.',
  ],
  night: [
    'Night. They are fast now.',
    'Click shoots the bow. F is your flashlight.',
    'Run downstream to the boathouse. Shine your flashlight in their faces to stop them for a moment.',
    'Stay close to the water. Something in the river is hunting them too.',
  ],
  hurt: ['You are hurt. Three hits and you are dead.'],
  tape: ["A video tape. Mom's handwriting on the label."],
  gun: [
    'A police gun. Press 2 for the gun, 1 for the bow.',
    'The gun stops anything — but every shot is loud, and they will come.',
  ],
};
