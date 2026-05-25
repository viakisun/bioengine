// getLeafBladeMaterial — single shared PBRMaterial for the procedural
// leaf blade mesh (Leaf Module v0.1).
//
// Differences from src/plant/LeafGenerator.getLeafMaterial:
//   - No leafColor/normal texture (v0.1 ships untextured; vein-as-normal-map
//     comes with leafShape.v2). Vertex color carries maturity/yellowing.
//   - useVertexColors=true so getLeafBlendedColor result baked into mesh
//     dominates albedo.
//   - backFaceCulling=false + twoSidedLighting=true so leaf reads correctly
//     from below (sun underside).
//   - Mild subSurface translucency for botanical leaf look.

import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';

const cachedLeafBladeMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();

export function getLeafBladeMaterial(scene: Scene): PBRMaterial {
  let mat = cachedLeafBladeMaterial.get(scene);
  if (mat) return mat;

  mat = new PBRMaterial('skinplant_leaf_blade_mat', scene);
  // Vertex colors drive base albedo (yellowing / waterStress baked at build).
  // NOTE: useVertexColors is a Mesh property, not Material — set on the
  // mesh in buildLeafBladeMesh / SkinMeshPlant integration.
  // Faint neutral so vertex color shows through with full saturation.
  mat.albedoColor = new Color3(1, 1, 1);
  mat.metallic = 0.0;
  mat.roughness = 0.62;
  mat.environmentIntensity = 0.55;

  // Thin plane — must render from both sides.
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;

  // Botanical translucency — sunlight scatters through real leaves; a tiny
  // hint lifts realism without committing to full SSS.
  mat.subSurface.isTranslucencyEnabled = true;
  mat.subSurface.translucencyIntensity = 0.45;
  mat.subSurface.tintColor = Color3.FromHexString('#3d8a25');
  mat.subSurface.minimumThickness = 0.02;
  mat.subSurface.maximumThickness = 0.15;

  cachedLeafBladeMaterial.set(scene, mat);
  return mat;
}
