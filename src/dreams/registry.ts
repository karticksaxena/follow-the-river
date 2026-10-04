import type { DreamInfo } from './types';

export const DREAMS: readonly DreamInfo[] = [
  {
    id: 'follow-the-river',
    title: 'Follow the River',
    minutes: 12,
    warnings: ['Horror', 'Jumpscares', 'Loud sounds'],
    intro: [
      'Follow the river. Survive 3 nights.',
      'Move with W A S D. Look around with the mouse. Hold Shift to run.',
      'Press E to use things. Press F for your flashlight.',
      'Press Esc any time to pause. The pause menu has every rule.',
    ],
    howToPlay: [
      'W A S D: move. Mouse: look. Shift: run. Space: jump. E: use / pick up. F: flashlight. Click: shoot the bow.',
      'By day: search the area for batteries, arrows and fish packs. Zombies are slow, and hide in the dark.',
      "Throw fish packs into the river (E at the water's edge). The more you feed Dras, the harder she hunts for you at night.",
      'Rest by the campfire to wait for dark. You cannot go back.',
      'By night: zombies keep coming in waves. Clear each wave and the barricade falls. Follow the river downstream. Your flashlight stuns them for a moment; it uses battery.',
      '1 to 4: switch weapons. R: put in a spare battery.',
      'The bow is silent. Walk over arrows to pick them up again.',
      'Three hits and you die. Dying restarts the day or night with what you had when it began.',
    ],
    load: async () => (await import('./follow-the-river/index')).createDream(),
  },
];
