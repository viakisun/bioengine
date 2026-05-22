/**
 * TubeRail — pair of parallel galvanized-steel pipes laid on the floor
 * between two adjacent hanging beds. Robots and worker carts roll on top.
 *
 * Real Korean smart-farm reference: two ~40mm steel tubes spaced 55cm
 * apart (gauge), running the length of the bed row, connected at each
 * end by a U-shaped hairpin loop so the cart can turn around.
 *
 *      X axis (along the bed length)
 *      ─────────────────────────────────────────►
 *
 *      ╭──────────────────────────────────────────╮
 *      │   pipe A (Z = centerZ − gauge/2)          │
 *      │                                            │  hairpin loop
 *      │   pipe B (Z = centerZ + gauge/2)          │  (end cap)
 *      ╰──────────────────────────────────────────╯
 *
 * Pipes sit just above the floor (Y = diameter/2) so wheels straddle
 * them on the inside.
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface TubeRailOptions {
  /** World-Z of the rail-pair center (the aisle midline). */
  centerZ: number;
  /** Length along X (typically matches bed length). */
  lengthM: number;
  /** Distance between the two pipes. Default 0.55m (real K-smartfarm spec). */
  gaugeM?: number;
  /** Pipe diameter. Default 0.04m. */
  diameterM?: number;
  /** Add hairpin U-loops at both X ends. Default true. */
  withEndLoops?: boolean;
  /** Optional tag for unique mesh names when many rails are spawned. */
  instanceTag?: string;
}

export interface TubeRailHandle {
  meshes: Mesh[];
  dispose(): void;
}

export function createTubeRail(scene: Scene, opts: TubeRailOptions): TubeRailHandle {
  const gauge = opts.gaugeM ?? 0.55;
  const diameter = opts.diameterM ?? 0.04;
  const withLoops = opts.withEndLoops ?? true;
  const tag = opts.instanceTag ?? `aisle_${opts.centerZ.toFixed(1)}`;
  const railY = diameter / 2;

  // Material shared across all rail instances. First call creates,
  // subsequent calls reuse — keeps draw-call count down and lets
  // every rail render with identical PBR.
  let mat = scene.getMaterialByName('tubeRailMat') as PBRMaterial | null;
  if (!mat) {
    mat = new PBRMaterial('tubeRailMat', scene);
    mat.albedoColor = Color3.FromHexString('#bdbeb8');
    mat.metallic = 0.85;
    mat.roughness = 0.35;
    mat.environmentIntensity = 0.9;
  }

  const meshes: Mesh[] = [];

  // Two parallel pipes along X axis. Cylinder default is Y-aligned, so
  // we rotate by π/2 around Z to lay it on its side along X.
  for (const side of [-1, 1] as const) {
    const pipe = MeshBuilder.CreateCylinder(
      `tubeRail_${tag}_pipe_${side === -1 ? 'a' : 'b'}`,
      { height: opts.lengthM, diameter, tessellation: 12 },
      scene,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position = new Vector3(0, railY, opts.centerZ + side * (gauge / 2));
    pipe.material = mat;
    pipe.receiveShadows = true;
    meshes.push(pipe);
  }

  // Hairpin U-loops at both X ends. A torus laid in the X-Z plane gives
  // a full ring; we only need the half facing outward, so we use a
  // full torus and accept the back half being inside the wall area —
  // it's hidden by the building's end wall and saves a custom mesh.
  // Diameter of the loop = gauge (so its ends meet the two pipes).
  if (withLoops) {
    for (const xSign of [-1, 1] as const) {
      const loop = MeshBuilder.CreateTorus(
        `tubeRail_${tag}_loop_${xSign === -1 ? 'left' : 'right'}`,
        { diameter: gauge, thickness: diameter, tessellation: 16 },
        scene,
      );
      // Torus default lies in the X-Z plane; that's already what we want.
      loop.position = new Vector3(
        xSign * (opts.lengthM / 2),
        railY,
        opts.centerZ,
      );
      loop.material = mat;
      loop.receiveShadows = true;
      meshes.push(loop);
    }
  }

  return {
    meshes,
    dispose() {
      for (const m of meshes) m.dispose(false, false);
      // Shared material — intentionally not disposed.
    },
  };
}
