// Babylon material wrapper for leaf mesh.
//
// ★ Iter 39 Phase L4-1 (S29) — LeafGenerator.ts → src/scene/leaf/LeafMaterial.ts.
//   Babylon Mesh wrapping + material 산식 한 곳. 산식 SSOT는 LeafMeshBuilder.ts.
//
// 책임 분리 (원칙 #39, #42):
//   LeafMeshBuilder.ts = pure mesh algorithm (GeoChunk 산출, Babylon 의존 0)
//   LeafMaterial.ts    = Babylon Mesh + Material wrapper (이 파일)

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  type GeoChunk,
  newChunk,
  transformChunk,
  translateChunk,
  mergeChunks,
} from '@farmsim/tomato-geometry';
import {
  attachExternalLeafTextureSlots,
  getLeafColorTexture,
  getLeafNormalTexture,
  type LeafTextureVariant,
} from './LeafTexture';
import { quatToMat4 } from './LeafMeshBuilder';
import type { LeafMeshPatch } from './LeafMeshBuilder';

type V3 = { x: number; y: number; z: number };

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

/**
 * ★ L6-B-1a (S56) — Per-leaf mesh batching.
 *
 * Merge all leaflet patches belonging to a _single compound leaf_ into one
 * Babylon Mesh. Leaflet rotation/translation은 vertex에 baked, mesh.position은
 * leaf-blade-root (plant-local).
 *
 * 산식 (parity 보장):
 *   bakedVertex = patch.rotationQuat × localVertex + (patch.position - leafBladeRootPos)
 *   vertex_plantlocal = mesh.position + bakedVertex
 *                     = leafBladeRootPos + bakedVertex
 *                     = patch.position + patch.rotationQuat × localVertex
 *                     ← per-leaflet (mesh.position=patch.position) 산식과 identical
 *
 * 재사용 utility (tomato-geometry):
 *   - quatToMat4 (LeafMeshBuilder)  → 4×4 rotation Mat4
 *   - transformChunk                → vertex/normal 변환 + normalize 자동
 *   - translateChunk                → leafletPos - leafBladeRootPos shift
 *   - mergeChunks                   → index offset 자동 + colors/uvs/normals merge
 *
 * Contract:
 *   - patches는 _단일 compound leaf_의 leaflet patches (caller 보장)
 *   - empty patches → null 반환
 *   - 현재 LeafletPlaneChunk는 vertex color 생성 0 — colors 처리 불필요
 *     (미래 vertex color 추가 시 mergeChunks + 이 함수 갱신 의무)
 *
 * @param patches             단일 compound leaf의 leaflet patches
 * @param leafBladeRootPos    plant-local position of leaf-blade-root node
 * @param scene               Babylon scene
 * @param meshName            batched mesh name
 * @returns                   Mesh, 또는 patches.length === 0 시 null
 */
export function wrapLeafChunksAsLeafBatch(
  patches: LeafMeshPatch[],
  leafBladeRootPos: V3,
  scene: Scene,
  meshName: string,
): Mesh | null {
  if (patches.length === 0) return null;

  // 1. Per-patch bake (rotation + translation), then merge.
  const bakedChunks: GeoChunk[] = [];
  for (const patch of patches) {
    const baked = cloneChunk(patch.chunk);
    transformChunk(baked, quatToMat4(patch.rotationQuat));
    translateChunk(
      baked,
      patch.position.x - leafBladeRootPos.x,
      patch.position.y - leafBladeRootPos.y,
      patch.position.z - leafBladeRootPos.z,
    );
    bakedChunks.push(baked);
  }
  const merged = mergeChunks(bakedChunks);

  // 2. Babylon Mesh + VertexData.
  const mesh = new Mesh(meshName, scene);
  const vd = new VertexData();
  vd.positions = merged.positions;
  vd.normals = merged.normals;
  vd.uvs = merged.uvs;
  vd.indices = merged.indices;
  vd.applyToMesh(mesh);

  // 3. mesh.position = leafBladeRootPos (plant-local), rotation = identity.
  mesh.position = new Vector3(leafBladeRootPos.x, leafBladeRootPos.y, leafBladeRootPos.z);
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.computeWorldMatrix(true);   // SSOT #185 — stale worldMatrix prevention
  return mesh;
}

/** Deep-copy GeoChunk (positions/normals/uvs/indices). colors 미지원 (현재 없음). */
function cloneChunk(chunk: GeoChunk): GeoChunk {
  const out = newChunk();
  out.positions = chunk.positions.slice();
  out.normals = chunk.normals.slice();
  out.uvs = chunk.uvs.slice();
  out.indices = chunk.indices.slice();
  if (chunk.colors !== undefined) {
    // Future: vertex color migration. 현재 LeafletPlaneChunk가 colors 생성 안 함.
    out.colors = chunk.colors.slice();
  }
  return out;
}

const cachedLeafMaterial = new WeakMap<Scene, Map<LeafTextureVariant, PBRMaterial>>();
const cachedYellowLeafMaterial = new WeakMap<Scene, PBRMaterial>();

const LEAF_VARIANT_TINT: Record<LeafTextureVariant, Color3> = {
  young: Color3.FromHexString('#b7d36a'),
  mature: Color3.FromHexString('#7fa84c'),
  old: Color3.FromHexString('#5f7b35'),
  back: Color3.FromHexString('#9caf82'),
  stressed: Color3.FromHexString('#9e9b4f'),
};

function leafMatName(variant: LeafTextureVariant): string {
  return variant === 'mature' ? 'leafMat' : `leafMat_${variant}`;
}

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

export function getLeafMaterial(scene: Scene, variant: LeafTextureVariant = 'mature'): PBRMaterial {
  let bucket = cachedLeafMaterial.get(scene);
  if (!bucket) {
    bucket = new Map();
    cachedLeafMaterial.set(scene, bucket);
  }
  let mat = bucket.get(variant);
  if (!mat) {
    const tint = LEAF_VARIANT_TINT[variant] ?? LEAF_VARIANT_TINT.mature;
    if (_useShaderWind) {
      const customMat = new PBRCustomMaterial(leafMatName(variant), scene);
      customMat.albedoColor = tint;
      customMat.albedoTexture = getLeafColorTexture(scene);
      customMat.bumpTexture = getLeafNormalTexture(scene);
      customMat.invertNormalMapY = false;
      customMat.invertNormalMapX = false;
      customMat.metallic = 0.0;
      customMat.roughness = 0.82;
      customMat.backFaceCulling = false;
      customMat.twoSidedLighting = true;
      customMat.environmentIntensity = 0.45;
      // Phase B — per-leaf smooth color blend via baked vertex colors.
      // PBR material auto-detects vertex colors from the bound VertexBuffer
      // and multiplies them against the albedo texture (no flag needed).

      // Cuticle wax — real tomato leaves have a thin waxy layer. clearcoat
      // adds the subtle specular sheen visible on healthy leaves under
      // greenhouse lighting.
      customMat.clearCoat.isEnabled = true;
      customMat.clearCoat.intensity = 0.08;
      customMat.clearCoat.roughness = 0.55;

      customMat.subSurface.isTranslucencyEnabled = true;
      customMat.subSurface.translucencyIntensity = 0.28;
      customMat.subSurface.tintColor = Color3.FromHexString('#4f7f2d');
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
      mat = new PBRMaterial(leafMatName(variant), scene);
      mat.albedoColor = tint;
      mat.albedoTexture = getLeafColorTexture(scene);
      mat.bumpTexture = getLeafNormalTexture(scene);
      mat.invertNormalMapY = false;
      mat.invertNormalMapX = false;
      mat.metallic = 0.0;
      mat.roughness = 0.82;
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true;
      mat.environmentIntensity = 0.45;

      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = 0.08;
      mat.clearCoat.roughness = 0.55;

      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = 0.28;
      mat.subSurface.tintColor = Color3.FromHexString('#4f7f2d');
      mat.subSurface.minimumThickness = 0.05;
      mat.subSurface.maximumThickness = 0.3;
    }

    attachExternalLeafTextureSlots(mat, scene, variant);
    bucket.set(variant, mat);
  }
  return mat;
}

export function getYellowLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedYellowLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('yellowLeafMat', scene);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.albedoColor = Color3.FromHexString('#a3a05f');
    mat.metallic = 0.0;
    mat.roughness = 0.88;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.35;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.22;
    mat.subSurface.tintColor = Color3.FromHexString('#85792d');

    cachedYellowLeafMaterial.set(scene, mat);
  }
  return mat;
}

const cachedSimpleLeafMaterial = new WeakMap<Scene, PBRMaterial>();

/**
 * ★ L6-B-3 (S59) — Simplified leaf material for far LOD (background plant).
 *
 * vs `getLeafMaterial` (full):
 *   - clearCoat: _off_   (was 0.35 intensity, 0.25 roughness)
 *   - subSurface translucency: _off_ (was 0.75 intensity)
 *   - shader wind: _off_ (uses plain PBRMaterial — no GLSL injection)
 *   - environmentIntensity: 0.65 (was 0.85)
 *
 * Use case: ultra-low quality plant (>15m from camera) — fragment cost
 * reduction ~25% vs full PBR. visual 차이 minimal at distance.
 */
export function getSimpleLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedSimpleLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('leafMatSimple', scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.invertNormalMapY = false;
    mat.invertNormalMapX = false;
    mat.metallic = 0.0;
    mat.roughness = 0.86;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.38;
    // No clearcoat, no subsurface, no shader wind — perf 우선.
    cachedSimpleLeafMaterial.set(scene, mat);
  }
  return mat;
}
