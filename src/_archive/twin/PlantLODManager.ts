// Phase D — distance-based LOD switcher with hysteresis.
//
// Each supporting plant gets a paired billboard quad (LOD2). When the
// camera moves beyond LOD_FAR meters the full geometry is hidden and
// the billboard becomes visible; coming back inside LOD_NEAR brings
// the geometry back. The deadband between NEAR and FAR prevents
// pop-flicker when the camera lingers at the threshold.
//
// Not implemented (deferred from the plan):
//   - LOD3 instanced billboard cluster (single-quad per zone) — current
//     count (29 supporting plants) doesn't push the draw-call budget
//     enough to need it; revisit if neighbor count grows.
//   - ThinInstance master mesh for the 29 light plants — would require
//     reworking the per-plant baked vertex colors path added in Phase B,
//     which is a larger refactor than the current frame budget needs.
//   - Alpha cross-fade between LOD0 and LOD2 — instant swap is fine
//     for the current hysteresis margin (4m deadband).

import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { SupportingPlantHandle } from './SupportingPlant';
import { getLeafColorTexture } from '../plant/LeafTexture';

// Bed is 30 m end-to-end, so a camera in the centre still sees the
// far plants at ~15 m. Old 14/18 threshold meant overview cameras
// flipped end plants to billboards mid-frame; pushed out to 24/30
// so only true distance shots (>30 m) trigger the swap.
const LOD_NEAR = 24;
const LOD_FAR = 30;

interface PlantSlot {
  plant: SupportingPlantHandle;
  billboard: Mesh;
  isFar: boolean;
  worldPos: Vector3;
}

export interface PlantLODManagerHandle {
  /** Call every frame (or every N frames) with current camera position. */
  update: (cameraPos: Vector3) => void;
  /** Force all plants to LOD0 (debug / analysis mode). */
  forceFull: () => void;
  /** Resume distance-based LOD. */
  resumeAuto: () => void;
  dispose: () => void;
}

export function createPlantLODManager(
  scene: Scene,
  _camera: Camera,
  plants: SupportingPlantHandle[]
): PlantLODManagerHandle {
  // One shared billboard material — alpha-tested leaf-texture quad.
  // Emissive boost is small so it reads as foliage from any sun angle.
  const billboardMat = new PBRMaterial('plantBillboardMat', scene);
  billboardMat.albedoTexture = getLeafColorTexture(scene);
  billboardMat.albedoColor = Color3.FromHexString('#3a7a30');
  billboardMat.metallic = 0;
  billboardMat.roughness = 0.7;
  billboardMat.backFaceCulling = false;
  billboardMat.twoSidedLighting = true;
  billboardMat.environmentIntensity = 0.6;
  if (billboardMat.albedoTexture) {
    billboardMat.albedoTexture.hasAlpha = true;
    billboardMat.useAlphaFromAlbedoTexture = true;
  }
  billboardMat.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST;
  billboardMat.alphaCutOff = 0.4;

  const slots: PlantSlot[] = plants.map((plant) => {
    const billboard = MeshBuilder.CreatePlane(
      `plant_bb_${plant.root.name}`,
      { width: 0.4, height: 1.2, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    billboard.parent = plant.root;
    billboard.position.y = 0.6;
    billboard.material = billboardMat;
    billboard.billboardMode = Mesh.BILLBOARDMODE_Y;
    billboard.isPickable = false;
    billboard.setEnabled(false);
    return {
      plant,
      billboard,
      isFar: false,
      worldPos: plant.root.position.clone(),
    };
  });

  let auto = true;
  let lastCheck = 0;

  function update(cameraPos: Vector3) {
    if (!auto) return;
    // Throttle distance checks — 30 plants × every frame is fine but
    // throttling to ~10Hz removes any chance of contributing to
    // mid-frame churn.
    const t = performance.now();
    if (t - lastCheck < 100) return;
    lastCheck = t;

    for (const slot of slots) {
      const dx = slot.worldPos.x - cameraPos.x;
      const dz = slot.worldPos.z - cameraPos.z;
      const distSq = dx * dx + dz * dz;
      if (slot.isFar) {
        if (distSq < LOD_NEAR * LOD_NEAR) {
          slot.isFar = false;
          slot.plant.setVisible(true);
          slot.billboard.setEnabled(false);
        }
      } else {
        if (distSq > LOD_FAR * LOD_FAR) {
          slot.isFar = true;
          slot.plant.setVisible(false);
          slot.billboard.setEnabled(true);
        }
      }
    }
  }

  function forceFull() {
    auto = false;
    for (const slot of slots) {
      slot.plant.setVisible(true);
      slot.billboard.setEnabled(false);
      slot.isFar = false;
    }
  }

  function resumeAuto() {
    auto = true;
  }

  function dispose() {
    for (const slot of slots) slot.billboard.dispose();
    billboardMat.dispose();
  }

  return { update, forceFull, resumeAuto, dispose };
}
