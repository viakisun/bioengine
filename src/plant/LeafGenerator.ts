// Babylon material wrapper for leaf mesh.
//
// ★ Iter 39 Phase L3-A (S19) — pure Babylon wrapper로 축소.
//   Previous: GeoChunk → Mesh + material + fallback path 혼재.
//   Current: getLeafMaterial / getYellowLeafMaterial / shader wind toggle.
//   Mesh 산식은 LeafMeshBuilder.ts (canonical SSOT) 진입.
//
// 책임 분리 (active 원칙 #39):
//   LeafMeshBuilder.ts = pure mesh algorithm (GeoChunk 산출)
//   LeafGenerator.ts   = Babylon Mesh + Material wrapper (이 파일)

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  getLeafColorTexture,
  getLeafNormalTexture,
} from './LeafTexture';
import type { LeafMeshPatch } from '../scene/leaf';

/**
 * ★ Iter 39 L3-F (S27) — Babylon Mesh wrapper.
 *
 * LeafMeshBuilder가 산출한 LeafMeshPatch[] (pure data, GeoChunk + position +
 * rotation)를 Babylon Mesh[]로 변환. 책임 분리 (원칙 #39):
 *   LeafMeshBuilder = pure mesh algorithm (Babylon 의존 0)
 *   LeafGenerator   = Babylon Mesh / Material wrapper (이 파일)
 *
 * 각 Mesh:
 *   - new Mesh + VertexData(chunk) applyToMesh
 *   - position (plant-local)
 *   - rotationQuaternion (Quat4 → Babylon Quaternion)
 *   - computeWorldMatrix(true) (SSOT #185 stale matrix prevention)
 */
export function wrapLeafChunksAsMeshes(patches: LeafMeshPatch[], scene: Scene): Mesh[] {
  const meshes: Mesh[] = [];
  for (const patch of patches) {
    const mesh = new Mesh(patch.meshName, scene);
    const vd = new VertexData();
    vd.positions = patch.chunk.positions;
    vd.normals = patch.chunk.normals;
    vd.uvs = patch.chunk.uvs;
    vd.indices = patch.chunk.indices;
    vd.applyToMesh(mesh);

    mesh.position = new Vector3(patch.position.x, patch.position.y, patch.position.z);
    mesh.rotationQuaternion = new Quaternion(
      patch.rotationQuat.x, patch.rotationQuat.y, patch.rotationQuat.z, patch.rotationQuat.w,
    );
    mesh.computeWorldMatrix(true);

    meshes.push(mesh);
  }
  return meshes;
}

const cachedLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedYellowLeafMaterial = new WeakMap<Scene, PBRMaterial>();

/**
 * Shader-side wind toggle.
 *
 * Spike result (Phase S): PBRCustomMaterial's GLSL injection (AddUniform +
 * Vertex_Before_PositionUpdated) fails to compile on Babylon 9 WebGPU
 * backend ("GLSL compilation failed" page error, plant invisible).
 * Works on WebGL2.
 *
 * BabylonEngine calls setShaderWindEnabled(backend === 'webgl2') at boot.
 * When false, getLeafMaterial returns plain PBRMaterial (no wind). Wind
 * on WebGPU is delivered via CPU sine fallback in Phase B (plant root
 * TransformNode rotation per frame).
 */
let _useShaderWind = false;
export function setShaderWindEnabled(enabled: boolean) {
  _useShaderWind = enabled;
}
export function isShaderWindEnabled() {
  return _useShaderWind;
}

export function getLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedLeafMaterial.get(scene);
  if (!mat) {
    if (_useShaderWind) {
      const customMat = new PBRCustomMaterial('leafMat', scene);
      customMat.albedoColor = new Color3(1, 1, 1);
      customMat.albedoTexture = getLeafColorTexture(scene);
      customMat.bumpTexture = getLeafNormalTexture(scene);
      customMat.invertNormalMapY = false;
      customMat.invertNormalMapX = false;
      customMat.metallic = 0.0;
      customMat.roughness = 0.48;          // 0.6 → 0.48 — leaves have soft sheen
      customMat.backFaceCulling = false;
      customMat.twoSidedLighting = true;
      customMat.environmentIntensity = 0.85;  // 0.6 → 0.85 — IBL fills shaded leaves
      // Phase B — per-leaf smooth color blend via baked vertex colors.
      // PBR material auto-detects vertex colors from the bound VertexBuffer
      // and multiplies them against the albedo texture (no flag needed).

      // Cuticle wax — real tomato leaves have a thin waxy layer. clearcoat
      // adds the subtle specular sheen visible on healthy leaves under
      // greenhouse lighting.
      customMat.clearCoat.isEnabled = true;
      customMat.clearCoat.intensity = 0.35;
      customMat.clearCoat.roughness = 0.25;

      customMat.subSurface.isTranslucencyEnabled = true;
      customMat.subSurface.translucencyIntensity = 0.75;  // 0.45 → 0.75 (more backlight)
      customMat.subSurface.tintColor = Color3.FromHexString('#3d8a25');  // brighter green
      customMat.subSurface.minimumThickness = 0.05;
      customMat.subSurface.maximumThickness = 0.3;

      // 3-layer wind — guideline §10. windWeight biases the offset toward
      // leaflet tips & edges so the petiole base stays mostly anchored.
      customMat.AddUniform('windTime', 'float', 0);
      customMat.AddUniform('windStrength', 'float', 0.5);
      customMat.AddUniform('flutterStrength', 'float', 0.6);
      customMat.AddUniform('windDir', 'vec3', new Color3(1, 0, 0.3));
      // Phase C — interaction array. xyz = world-space push origin,
      // w = strength (already exponentially decayed CPU-side). Up to
      // 8 simultaneous interactions; robot + a couple of workers fits.
      customMat.AddUniform('interactionCount', 'int', 0);
      customMat.AddUniform('interactionData', 'vec4[8]', null);
      customMat.Vertex_Before_PositionUpdated(`
        float windV = clamp(uv.y, 0.0, 1.0);
        float windU = uv.x * 2.0 - 1.0;
        float windWeight = clamp(pow(windV, 1.4) + pow(abs(windU), 0.8) * 0.35, 0.0, 1.0);
        float largeSway = sin(windTime * 0.6 + position.x * 0.15 + position.z * 0.1) * 0.08;
        float mediumSway = sin(windTime * 1.4 + position.x * 0.8) * 0.035;
        float smallFlutter = sin(windTime * 6.0 + position.x * 3.0 + position.z * 2.0) * 0.012 * flutterStrength;
        float total = (largeSway + mediumSway + smallFlutter) * windStrength;
        positionUpdated += windDir * total * windWeight;

        // Interaction push — radial repulsion from each active point.
        // World position is approximate: leaf vertex is in mesh-local
        // space (plant root TransformNode already applied), so we use
        // position directly + the mesh's world origin. For petal-scale
        // accuracy this would need the full worldMatrix; the 0.5m
        // radius is forgiving enough that the approximation looks fine.
        for (int i = 0; i < 8; i++) {
          if (i >= interactionCount) break;
          vec3 ipos = interactionData[i].xyz;
          float strength = interactionData[i].w;
          float dist = distance(position, ipos);
          if (dist < 0.55) {
            float push = smoothstep(0.55, 0.0, dist) * strength;
            vec3 dir = normalize(position - ipos + vec3(0.0001));
            positionUpdated += dir * push * 0.04 * windWeight;
          }
        }
      `);

      // Midrib brightness (guideline §13) is already baked into
      // getLeafColorTexture's procedural vein pass — no shader-side
      // boost needed. Skipping that injection also keeps the GLSL
      // surface minimal, which lowered the risk of WebGPU breakage
      // (the same reason the wind shader is WebGL2-only here).

      mat = customMat;
    } else {
      // WebGPU fallback path — plain PBRMaterial; wind comes from CPU
      // sine rotation on plant root TransformNodes (driven in BabylonEngine).
      mat = new PBRMaterial('leafMat', scene);
      mat.albedoColor = new Color3(1, 1, 1);
      mat.albedoTexture = getLeafColorTexture(scene);
      mat.bumpTexture = getLeafNormalTexture(scene);
      mat.invertNormalMapY = false;
      mat.invertNormalMapX = false;
      mat.metallic = 0.0;
      mat.roughness = 0.48;
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true;
      mat.environmentIntensity = 0.85;

      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = 0.35;
      mat.clearCoat.roughness = 0.25;

      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = 0.75;
      mat.subSurface.tintColor = Color3.FromHexString('#3d8a25');
      mat.subSurface.minimumThickness = 0.05;
      mat.subSurface.maximumThickness = 0.3;
    }

    cachedLeafMaterial.set(scene, mat);
  }
  return mat;
}

export function getYellowLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedYellowLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('yellowLeafMat', scene);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.albedoColor = Color3.FromHexString('#cccc80');
    mat.metallic = 0.0;
    mat.roughness = 0.6;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.5;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.6;
    mat.subSurface.tintColor = Color3.FromHexString('#a89030');

    cachedYellowLeafMaterial.set(scene, mat);
  }
  return mat;
}
