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
      'By day: explore the sheds and houses and search them with your flashlight for batteries, arrows, fish packs and tapes. Zombies are slow, and hide in the dark. Keep moving forward.',
      "Feed Dras: throw fish packs into the river (E at the water's edge). The more fish you feed her, the more aggressive she gets and the more she helps you at night. Keep following the river.",
      'Rest by the campfire to wait for dark. You cannot go back.',
      'By night: zombies keep coming in waves. Clear each wave and the barricade falls. Follow the river downstream. Your flashlight stuns them for a moment; it uses battery.',
      "Night 1: ammo is scarce. Search the dark houses along the road with your flashlight. Ammo, arrows and each wave's crate are inside, and something may be asleep there.",
      'A head shot always kills. A body shot takes more the harder the game: one on Story, two on Normal, three on Hard.',
      'Dras helps near you and takes some of each wave. When you are out of ammo, lead them to the water and keep moving.',
      '1 to 4: switch weapons. R: put in a spare battery.',
      'The bow is silent. Walk over arrows that missed to pick them up again; on Story, ones that hit too.',
      'Three hits and you die. Dying restarts the day or night with what you had when it began.',
    ],
    load: async () => (await import('./follow-the-river/index')).createDream(),
  },
];
