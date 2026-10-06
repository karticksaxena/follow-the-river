/** The ending steps that are only pages. */
export type PagedStep = 'mom' | 'home' | 'credits';

export const ENDING_PAGES: Readonly<Record<PagedStep, readonly string[]>> = {
  mom: [
    'Mom: "It\'s you. You followed the river."',
    'Mom: "I\'m so sorry. For all of it."',
    'Mom: "They\'re coming, all of them. Take this, and stay by the water. Dras will fight with us."',
  ],
  home: ['Mom: "Come on. Let\'s go home."'],
  // Every source in public/assets/LICENSES.md (ending.test.ts checks the names).
  credits: [
    "Kartik's Dreams - Follow the River",
    'A dream by Kartik',
    'Models: Kenney (kenney.nl): Furniture Kit, City Kit (Commercial, Roads, Suburban), Car Kit, Survival Kit, Nature Kit. CC0.',
    'Characters, animation and plants: Quaternius (quaternius.com): Ultimate Modular Men, Ultimate Modular Women, Universal Animation Library 1 and 2, Stylized Nature MegaKit. CC0.',
    'Textures: Poly Haven (polyhaven.com). CC0. Everything else (Dras, the guns, the bow, the river town) was made for this game in Blender.',
    'Gunshots: The Free Firearm Sound Library by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney. The bow: Medieval Sound Effects by Ben Jaszczak and Brian Nelson. Zombies: Zombies Sound Pack by artisticdude. All on OpenGameArt. CC0.',
    'Ambience and water: 30 CC0 SFX loops, Ambient Bird Sounds by isaiah658, and 40 CC0 water, splash and slime SFX by rubberduck (OpenGameArt). Splashes by roboroo, Bird_man and qubodup, paddle strokes by EpicWizard (Freesound). CC0.',
    "Dras's voice and breath: killer whale recordings by the U.S. National Park Service (Glacier Bay) and the U.S. Fish and Wildlife Service. Public domain.",
    'Fonts: IM Fell English (SIL Open Font License 1.1) and Special Elite (Apache License 2.0), from Google Fonts via Fontsource.',
    'Made with three.js (MIT License) and Vite.',
    'Thank you for playing.',
  ],
};
