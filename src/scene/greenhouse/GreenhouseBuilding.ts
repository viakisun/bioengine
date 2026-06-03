/**
 * GreenhouseBuilding — frame + roof + walls + overhead training wires.
 *
 * ★ S119 (Iter 40) — archive `_archive/twin/GreenhouseScene.ts`에서 추출.
 *   해당 archive는 SharedEnvContext + 거대 함수 (700+ lines)였음.
 *   사용자 요청 "온실 건물, 유인줄, 행잉베드, 튜브레일 복원" 대응 — 모듈화.
 *
 * 구조 (원본 Kimje smart-farm 24m × 34m):
 *   - galvanized A-frame posts every 4m along length
 *   - ridge beam (top long axis)
 *   - eave beams (long axis at eave height)
 *   - end-cap frames (front/back walls)
 *   - polycarbonate roof + side walls + end walls (translucent)
 *   - overhead training wire pair per bed (Y=3.4m)
 *   - per-plant vertical training strings (white twine)
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SCENARIO } from '../../data/mockScenario';

export interface GreenhouseBuildingOptions {
  /** Bed length along X axis (m). default SCENARIO.bedLengthM (30m). */
  bedLengthM?: number;
  /** Bed Z positions (centers). default 13 beds × 1.6m pitch centered at 0. */
  bedZPositions?: number[];
  /** Indices of beds that have plants (strings only on these). default all. */
  activePlantBedIndices?: number[];
  /** Substrate top Y (plant root level) — strings 시작점. */
  substrateTopY: number;
  /** Overhead wire Y. default 3.4m. */
  wireY?: number;
}

export interface GreenhouseBuildingHandle {
  meshes: Mesh[];
}

export const BED_PITCH_DEFAULT = 1.6;
export const BED_COUNT_DEFAULT = 13;
export const BED_DEPTH = 0.6;

export function defaultBedZPositions(): number[] {
  return Array.from(
    { length: BED_COUNT_DEFAULT },
    (_, i) => (i - (BED_COUNT_DEFAULT - 1) / 2) * BED_PITCH_DEFAULT,
  );
}

export function defaultAisleZPositions(): number[] {
  const beds = defaultBedZPositions();
  return Array.from(
    { length: beds.length - 1 },
    (_, i) => (beds[i] + beds[i + 1]) / 2,
  );
}

export function createGreenhouseBuilding(
  scene: Scene,
  opts: GreenhouseBuildingOptions,
): GreenhouseBuildingHandle {
  const meshes: Mesh[] = [];
  const bedLen = opts.bedLengthM ?? SCENARIO.bedLengthM;
  const bedZPositions = opts.bedZPositions ?? defaultBedZPositions();
  const activeBedIndices = opts.activePlantBedIndices ?? bedZPositions.map((_, i) => i);
  const wireY = opts.wireY ?? 3.4;
  const substrateTopY = opts.substrateTopY;

  // ─── Bed slabs ──────────────────────────────────────────────────────
  const bedMat = new PBRMaterial('bedMat', scene);
  bedMat.albedoColor = Color3.FromHexString('#c0c0b8');
  bedMat.metallic = 0.75;
  bedMat.roughness = 0.3;
  for (const [bedIdx, bedZ] of bedZPositions.entries()) {
    const bed = MeshBuilder.CreateBox(
      `bed_${bedIdx}`,
      { width: bedLen, height: 0.15, depth: BED_DEPTH },
      scene,
    );
    bed.position = new Vector3(0, SCENARIO.bedY - 0.075, bedZ);
    bed.material = bedMat;
    bed.receiveShadows = true;
    meshes.push(bed);
  }

  // ─── Frame (galvanized A-frames + ridge + eaves + end-caps) ────────
  const frameMat = new PBRMaterial('frameMat', scene);
  frameMat.albedoColor = Color3.FromHexString('#c8c8c0');
  frameMat.metallic = 0.85;
  frameMat.roughness = 0.3;

  const ridgeY = 7.0;
  const eaveY = 5.5;
  const halfWidth = 12.0;
  const endMargin = 2.0;
  const halfLen = bedLen / 2 + endMargin;

  // A-frames every 4m
  for (let i = 0; i <= bedLen / 4; i++) {
    const x = -bedLen / 2 + i * 4;
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(`post_${i}_${side}`, { height: eaveY, diameter: 0.08 }, scene);
      post.position = new Vector3(x, eaveY / 2, side * halfWidth);
      post.material = frameMat;
      meshes.push(post);
    }
    for (const side of [-1, 1]) {
      const rafterLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
      const rafter = MeshBuilder.CreateCylinder(`rafter_${i}_${side}`, { height: rafterLen, diameter: 0.06 }, scene);
      rafter.position = new Vector3(x, (ridgeY + eaveY) / 2, side * halfWidth / 2);
      rafter.rotation.x = -side * Math.atan2(halfWidth, ridgeY - eaveY);
      rafter.material = frameMat;
      meshes.push(rafter);
    }
  }

  // End-cap frames
  for (const xSign of [-1, 1]) {
    const xEnd = xSign * halfLen;
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(`endpost_${xSign}_${side}`, { height: eaveY, diameter: 0.08 }, scene);
      post.position = new Vector3(xEnd, eaveY / 2, side * halfWidth);
      post.material = frameMat;
      meshes.push(post);
    }
    const center = MeshBuilder.CreateCylinder(`endcenter_${xSign}`, { height: ridgeY, diameter: 0.08 }, scene);
    center.position = new Vector3(xEnd, ridgeY / 2, 0);
    center.material = frameMat;
    meshes.push(center);
  }

  // Ridge beam
  const ridge = MeshBuilder.CreateCylinder('ridge', { height: halfLen * 2, diameter: 0.08 }, scene);
  ridge.position = new Vector3(0, ridgeY, 0);
  ridge.rotation.z = Math.PI / 2;
  ridge.material = frameMat;
  meshes.push(ridge);

  // Eave beams
  for (const side of [-1, 1]) {
    const eave = MeshBuilder.CreateCylinder(`eave_${side}`, { height: halfLen * 2, diameter: 0.06 }, scene);
    eave.position = new Vector3(0, eaveY, side * halfWidth);
    eave.rotation.z = Math.PI / 2;
    eave.material = frameMat;
    meshes.push(eave);
  }

  // ─── Roof + walls (polycarbonate translucent) ────────────────────────
  // depth-prepass + low envIntensity = clean alpha-tested leaves visible behind
  const roofMat = new PBRMaterial('roofMat', scene);
  roofMat.albedoColor = Color3.FromHexString('#dfe8e0');
  roofMat.alpha = 0.08;
  roofMat.metallic = 0.0;
  roofMat.roughness = 0.12;
  roofMat.indexOfRefraction = 1.49;
  roofMat.backFaceCulling = false;
  roofMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  roofMat.environmentIntensity = 0.5;
  roofMat.needDepthPrePass = true;

  const slopeLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
  for (const side of [-1, 1]) {
    const panel = MeshBuilder.CreatePlane(`roof_${side}`, { width: halfLen * 2, height: slopeLen }, scene);
    panel.position = new Vector3(0, (ridgeY + eaveY) / 2, side * halfWidth / 2);
    panel.rotation.x = -side * Math.atan2(halfWidth, ridgeY - eaveY);
    panel.rotation.y = side > 0 ? 0 : Math.PI;
    panel.material = roofMat;
    meshes.push(panel);
  }
  for (const side of [-1, 1]) {
    const wall = MeshBuilder.CreatePlane(`wall_${side}`, { width: halfLen * 2, height: eaveY }, scene);
    wall.position = new Vector3(0, eaveY / 2, side * halfWidth);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.material = roofMat;
    meshes.push(wall);
  }
  for (const xSign of [-1, 1]) {
    const endWall = MeshBuilder.CreatePlane(`endwall_${xSign}`, { width: halfWidth * 2, height: ridgeY }, scene);
    endWall.position = new Vector3(xSign * halfLen, ridgeY / 2, 0);
    endWall.rotation.y = xSign > 0 ? -Math.PI / 2 : Math.PI / 2;
    endWall.material = roofMat;
    meshes.push(endWall);
  }

  // ─── Overhead training wires (pair per bed) ────────────────────────
  const wireMat = new PBRMaterial('wireMat', scene);
  wireMat.albedoColor = Color3.FromHexString('#888888');
  wireMat.metallic = 0.8;
  wireMat.roughness = 0.4;
  for (const [bedIdx, bedZ] of bedZPositions.entries()) {
    for (const wireOffset of [-0.15, 0.15]) {
      const wire = MeshBuilder.CreateCylinder(
        `wire_b${bedIdx}_${wireOffset}`,
        { height: bedLen + 0.5, diameter: 0.004 },
        scene,
      );
      wire.position = new Vector3(0, wireY, bedZ + wireOffset);
      wire.rotation.z = Math.PI / 2;
      wire.material = wireMat;
      meshes.push(wire);
    }
  }

  // ─── Per-plant vertical training strings (twine) ───────────────────
  const stringMat = new PBRMaterial('stringMat', scene);
  stringMat.albedoColor = Color3.FromHexString('#e0d8c8');
  stringMat.metallic = 0;
  stringMat.roughness = 0.9;

  for (const bedIdx of activeBedIndices) {
    const bedZ = bedZPositions[bedIdx];
    const stringMeshes: Mesh[] = [];
    for (const plant of SCENARIO.plants) {
      for (const stringOffset of [-0.15, 0.15]) {
        const str = MeshBuilder.CreateCylinder(
          `tmpString_${bedIdx}_${plant.id}_${stringOffset}`,
          { height: wireY - substrateTopY, diameter: 0.002, tessellation: 6 },
          scene,
        );
        str.position = new Vector3(
          plant.position[0],
          (wireY + substrateTopY) / 2,
          bedZ + stringOffset,
        );
        stringMeshes.push(str);
      }
    }
    const merged = Mesh.MergeMeshes(stringMeshes, true, true, undefined, false, true);
    if (merged) {
      merged.name = `strings_bed${bedIdx}`;
      merged.material = stringMat;
      meshes.push(merged);
    }
  }

  return { meshes };
}
