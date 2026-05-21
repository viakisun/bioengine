// Smooth leaf-color palette for shader-side mix (guideline §12).
//
// Phase B will inject these constants into the leaf vertex/fragment
// shader so albedoColor smoothly interpolates between:
//   young → mature       (by leaf age)
//   mature → stressed    (by waterStress)
//   stressed → senescent (by yellowing)
//
// Until Phase B lands, getLeafBlendedColor() is a JS reference impl —
// used by CPU material picker for cache lookups + matches what the
// shader will compute. Keep the four constants and the blend formula
// in sync between this file and the GLSL/WGSL snippet.

export interface LeafColorRGB {
  r: number; // 0–1 linear
  g: number;
  b: number;
}

export const LEAF_COLOR_YOUNG: LeafColorRGB      = { r: 0.373, g: 0.659, b: 0.188 }; // #5fa830 — fresh new leaf
export const LEAF_COLOR_MATURE: LeafColorRGB     = { r: 0.227, g: 0.478, b: 0.188 }; // #3a7a30 — adult chlorophyll
export const LEAF_COLOR_STRESS: LeafColorRGB     = { r: 0.478, g: 0.525, b: 0.208 }; // #7a8635 — water-stressed olive
export const LEAF_COLOR_SENESCENCE: LeafColorRGB = { r: 0.659, g: 0.565, b: 0.188 }; // #a89030 — senescent yellow

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(a: LeafColorRGB, b: LeafColorRGB, t: number): LeafColorRGB {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: mix(a.r, b.r, k),
    g: mix(a.g, b.g, k),
    b: mix(a.b, b.b, k),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * CPU reference for the shader-side leaf color blend.
 *
 * @param ageFrac      0 = young, 1 = mature (smoothstepped to delay maturity feel)
 * @param waterStress  0 = unstressed, 1 = severe water stress
 * @param yellowing    0 = green, 1 = fully senescent
 */
export function getLeafBlendedColor(
  ageFrac: number,
  waterStress: number,
  yellowing: number
): LeafColorRGB {
  let col = mixColor(LEAF_COLOR_YOUNG, LEAF_COLOR_MATURE, smoothstep(0, 0.5, ageFrac));
  col = mixColor(col, LEAF_COLOR_STRESS, waterStress * 0.35);
  col = mixColor(col, LEAF_COLOR_SENESCENCE, yellowing * 0.6);
  return col;
}
