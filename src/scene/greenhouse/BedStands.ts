/**
 * BedStands — vertical galvanized-steel posts that hold each hanging
 * bed up off the floor. Without these the bed mesh appears to float
 * in mid-air, which reads as a bug from any angle that includes the
 * underside of the bed.
 *
 * Real K-smartfarm reference: a pair of front/back posts every ~2m
 * along the bed, sometimes with an inverted-V brace. We model the
 * simpler form (two vertical pillars per station) since it reads
 * correctly under PBR and merges to one draw call per bed.
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface BedStandsOptions {
  /** World-Z of the bed's centerline. */
  centerZ: number;
  /** Bed length along X. Posts are placed evenly along this span. */
  lengthM: number;
  /** Y of the bed's top surface — post height ends here. */
  bedTopY: number;
  /** Bed depth (Z extent). Two posts straddle the bed, one at
   *  centerZ − depth/2 and one at centerZ + depth/2. Default 0.35. */
  bedDepthM?: number;
  /** X spacing between consecutive posts. Default 2.0m. */
  spacingM?: number;
  /** Material to apply (typically the greenhouse frameMat for galvanized look). */
  material: Material;
  /** Unique tag for the merged mesh name. */
  instanceTag?: string;
}

export interface BedStandsHandle {
  mesh: Mesh;
  dispose(): void;
}

export function createBedStands(scene: Scene, opts: BedStandsOptions): BedStandsHandle {
  const bedDepth = opts.bedDepthM ?? 0.35;
  const spacing = opts.spacingM ?? 2.0;
  const tag = opts.instanceTag ?? `bed_${opts.centerZ.toFixed(1)}`;
  const postDiameter = 0.04;
  const halfDepth = bedDepth / 2;

  // Create one cylinder per post, then merge for a single draw call.
  // Number of stations across the length (inclusive of both ends).
  const stationCount = Math.max(2, Math.floor(opts.lengthM / spacing) + 1);
  const xStep = opts.lengthM / (stationCount - 1);
  const xStart = -opts.lengthM / 2;

  const posts: Mesh[] = [];
  for (let s = 0; s < stationCount; s++) {
    const x = xStart + s * xStep;
    for (const zSide of [-1, 1] as const) {
      const post = MeshBuilder.CreateCylinder(
        `bedStand_${tag}_${s}_${zSide === -1 ? 'front' : 'back'}`,
        { height: opts.bedTopY, diameter: postDiameter, tessellation: 8 },
        scene,
      );
      post.position = new Vector3(x, opts.bedTopY / 2, opts.centerZ + zSide * halfDepth);
      posts.push(post);
    }
  }

  const merged = Mesh.MergeMeshes(posts, true, true, undefined, false, true);
  if (!merged) {
    throw new Error(`createBedStands: MergeMeshes returned null for ${tag}`);
  }
  merged.name = `bedStands_${tag}`;
  merged.material = opts.material;
  merged.receiveShadows = true;

  return {
    mesh: merged,
    dispose() {
      merged.dispose(false, false);
    },
  };
}
