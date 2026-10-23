// Quality presets. Each knob maps to a real rendering cost:
//  maxPixelRatio  - internal resolution on HiDPI screens
//  msaa           - samples of the HDR scene target (0 = off)
//  aa             - post AA when MSAA is off: 'fxaa' | 'smaa' | null
//  ao             - GTAO on/off and its buffer scale
//  bloom          - bloom on/off
//  shadowMap      - sun shadow map resolution; interiorShadowMap = shadowed room spot lights
//  transmission   - refractive glass (extra opaque pass) and its resolution scale
//  reflection     - planar reflection scale for wet ground (0 = env map only), update interval
//  rain           - rain streak / splash instance counts
export const QUALITY = {
  low: {
    maxPixelRatio: 1, msaa: 0, aa: 'fxaa', ao: false, aoScale: 0.5, bloom: false,
    shadowMap: 1024, shadowRadius: 2, interiorShadowMap: 256,
    transmission: false, transmissionScale: 0.5,
    reflection: { scale: 0, interval: 0 },
    rain: { streaks: 7000, splashes: 600 },
  },
  medium: {
    maxPixelRatio: 1, msaa: 0, aa: 'smaa', ao: true, aoScale: 0.5, bloom: true,
    shadowMap: 2048, shadowRadius: 3, interiorShadowMap: 512,
    transmission: true, transmissionScale: 0.5,
    reflection: { scale: 0.33, interval: 2 },
    rain: { streaks: 16000, splashes: 1600 },
  },
  high: {
    maxPixelRatio: 1.5, msaa: 4, aa: null, ao: true, aoScale: 1, bloom: true,
    shadowMap: 4096, shadowRadius: 3, interiorShadowMap: 1024,
    transmission: true, transmissionScale: 0.75,
    reflection: { scale: 0.5, interval: 1 },
    rain: { streaks: 30000, splashes: 3000 },
  },
};

export const QUALITY_LABEL = { low: '低', medium: '中', high: '高' };
