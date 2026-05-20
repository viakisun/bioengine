import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '../utils/SeededRandom';
import { createLeafMesh, getLeafMaterial } from '../plant/LeafGenerator';

export function buildSamplePoCScene(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 6, subdivisions: 2 }, scene);
  const groundMat = new PBRMaterial('groundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#9a9a92');
  groundMat.metallic = 0.0;
  groundMat.roughness = 0.85;
  ground.material = groundMat;
  ground.receiveShadows = true;

  const bed = MeshBuilder.CreateBox('bed', { width: 30, height: 0.15, depth: 0.3 }, scene);
  bed.position = new Vector3(0, 0.85, 0);
  const bedMat = new PBRMaterial('bedMat', scene);
  bedMat.albedoColor = Color3.FromHexString('#c0c0b8');
  bedMat.metallic = 0.75;
  bedMat.roughness = 0.3;
  bed.material = bedMat;
  bed.receiveShadows = true;

  const stem = MeshBuilder.CreateCylinder(
    'stem_placeholder',
    { height: 1.5, diameter: 0.04, tessellation: 8 },
    scene
  );
  stem.position = new Vector3(0, 1.6, 0);
  const stemMat = new PBRMaterial('stemMat', scene);
  stemMat.albedoColor = Color3.FromHexString('#3a5a25');
  stemMat.metallic = 0;
  stemMat.roughness = 0.8;
  stem.material = stemMat;

  const leafMat = getLeafMaterial(scene);

  // DEBUG visualizer to confirm leaf placement
  const debugMat = new PBRMaterial('debugLeaf', scene);
  debugMat.albedoColor = Color3.FromHexString('#ff3366');
  debugMat.emissiveColor = Color3.FromHexString('#ff3366');
  debugMat.metallic = 0;
  debugMat.roughness = 1;
  debugMat.backFaceCulling = false;
  void debugMat;

  const leaves: any[] = [];
  const leafCountPerSide = 6;
  for (let i = 0; i < leafCountPerSide; i++) {
    const t = i / (leafCountPerSide - 1);
    const heightY = 1.0 + t * 1.2;
    const ageFrac = Math.min(1, (1 - t) * 0.9);
    const maturity = 0.5 + (1 - t) * 0.5;

    for (const side of [-1, 1]) {
      const rng = new SeededRandom(1000 + i * 100 + (side > 0 ? 7 : 13));
      const leaf = createLeafMesh(
        `leaf_${i}_${side}`,
        scene,
        7,
        2.5,
        maturity,
        0.15,
        rng,
        undefined,
        ageFrac
      );
      leaf.material = leafMat;
      leaf.receiveShadows = true;
      leaf.position = new Vector3(0, heightY, 0);

      const azimuth = side > 0 ? 0 : Math.PI;
      const phyllotaxisOffset = i * 0.5;
      leaf.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Up(),
        azimuth + phyllotaxisOffset
      );
      leaves.push(leaf);
    }
  }
  console.log(`[PoCContent] built ${leaves.length} leaves; first leaf vertices: ${leaves[0]?.getTotalVertices()}`);

  return { ground, bed, stem, leaves };
}
