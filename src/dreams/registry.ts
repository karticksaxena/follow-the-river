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
      'Press F to turn your flashlight on or off.',
      'Press Esc any time to pause. The pause menu has every rule.',
    ],
    howToPlay: ['W A S D: move. Mouse: look. Shift: run.', 'F: flashlight on/off.', 'Esc: pause.'],
    load: async () => (await import('./follow-the-river/index')).createDream(),
  },
];
