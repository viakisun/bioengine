import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { FruitState } from '@farmsim/tomato-engine';

/**
 * Create the calyx (5-petal green star at the fruit top) as raw VertexData.
 * Returns the chunk to be applied to a mesh.
 */
function createCalyxVertexData(): VertexData {
  const positions: number[] = [];
  const indices: number[] = [];

  const petalCount = 5;
  const innerR = 0.3;
  const outerR = 1.2;
  const height = 0.2;

  // Center vertex at top
  positions.push(0, 1, 0);

  for (let i = 0; i < petalCount; i++) {
    const angle1 = (i / petalCount) * Math.PI * 2;
    const angle2 = ((i + 0.5) / petalCount) * Math.PI * 2;
    positions.push(Math.cos(angle1) * outerR, 1 + height, Math.sin(angle1) * outerR);
    positions.push(Math.cos(angle2) * innerR, 1, Math.sin(angle2) * innerR);
  }

  for (let i = 0; i < petalCount; i++) {
    const outer = 1 + i * 2;
    const inner = 2 + i * 2;
    const nextOuter = 1 + ((i + 1) % petalCount) * 2;
    indices.push(0, inner, outer);
    indices.push(0, nextOuter, inner);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  return vd;
}

let cachedCalyxMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCalyxMaterial(scene: Scene): PBRMaterial {
  let mat = cachedCalyxMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('calyxMat', scene);
    mat.albedoColor = Color3.FromHexString('#3a7a30');
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.backFaceCulling = false;
    cachedCalyxMaterial.set(scene, mat);
  }
  return mat;
}

function fruitColorFromState(fruit: FruitState): Color3 {
  return new Color3(fruit.color[0] / 255, fruit.color[1] / 255, fruit.color[2] / 255);
}

/**
 * Create a fruit with calyx, sized from FruitState.diameterMm,
 * colored from FruitState.color (per-ripen-stage interpolation
 * already done by GrowthModel).
 *
 * Returns a TransformNode containing the fruit body + (optional) calyx.
 * Use `parent.parent = trussNode` to wire into the truss.
 */
export function createFruitNode(
  name: string,
  scene: Scene,
  fruit: FruitState,
  rng: SeededRandom
): TransformNode {
  const root = new TransformNode(name, scene);
  const radiusM = fruit.diameterMm / 2 / 1000;

  // Body: sphere with slight per-vertex noise for irregularity
  const body = MeshBuilder.CreateSphere(
    `${name}_body`,
    { diameter: 1, segments: 10 },
    scene
  );
  const vd = VertexData.ExtractFromMesh(body);
  if (vd.positions) {
    const pos = vd.positions as number[];
    for (let i = 0; i < pos.length; i += 3) {
      const noise = 1 + rng.gaussian(0, 0.03);
      pos[i] *= noise;
      pos[i + 1] *= noise;
      pos[i + 2] *= noise;
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(pos as number[], vd.indices as number[], normals);
    vd.normals = normals;
    vd.applyToMesh(body);
  }
  body.scaling = new Vector3(radiusM, radiusM, radiusM);
  body.parent = root;

  const bodyMat = new PBRMaterial(`${name}_mat`, scene);
  bodyMat.albedoColor = fruitColorFromState(fruit);
  bodyMat.metallic = 0;
  bodyMat.roughness = 0.28;
  bodyMat.clearCoat.isEnabled = true;
  bodyMat.clearCoat.intensity = 0.4;
  bodyMat.clearCoat.roughness = 0.12;
  body.material = bodyMat;

  // Calyx (only for visible-size fruits)
  if (radiusM > 0.005) {
    const calyx = new Mesh(`${name}_calyx`, scene);
    createCalyxVertexData().applyToMesh(calyx);
    calyx.scaling = new Vector3(radiusM * 0.4, radiusM * 0.4, radiusM * 0.4);
    calyx.position = new Vector3(0, radiusM * 0.8, 0);
    calyx.material = getCalyxMaterial(scene);
    calyx.parent = root;
  }

  return root;
}
