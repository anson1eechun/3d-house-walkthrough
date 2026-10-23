// Render layers. The main camera sees all of them; auxiliary cameras pick subsets.
//  - DEFAULT: regular geometry.
//  - MAIN_ONLY: glass, rain, splashes, droplets. Skipped by the planar reflection,
//    reflection probes, the rain occlusion map and the AO normal pass.
//  - GROUND: exterior ground surfaces that receive the planar reflection (and so
//    must not appear inside it).
export const LAYER = {
  DEFAULT: 0,
  MAIN_ONLY: 1,
  GROUND: 2,
};
