// Babylon wrapper for the engine-agnostic leaf chunk generator.
// Algorithm lives in @farmsim/tomato-geometry; this file:
//   - applies GeoChunk to a Babylon Mesh
//   - owns Scene-keyed PBR material caches (regular + yellow senescent + diseased)
//   - wires NodeState/PlantGenome into stage-aware leaf params

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  SeededRandom,
  // Iter 35 PR 2 Phase L: getLeafStage 제거 (createLeafMeshFromNode archived).
  getLeafBlendedColor,
  LeafStage,
  // Iter 35 PR 2 Phase L: NodeState type 제거 (createLeafMeshFromNode archived).
  type PlantGenome,
  type LeafStageInfo,
} from '@farmsim/tomato-engine';
import {
  buildLeafChunkLegacy,        // Legacy ShowcasePlant path.
  buildLeafChunkSkin,    // Iter 18B PR 7 Skin preset (omit-all leaflets-only).
  type GeoChunk,
  type LeafShapeParams,
} from '@farmsim/tomato-geometry';
import {
  getLeafColorTexture,
  getLeafNormalTexture,
  // Iter 35 PR 2 Phase L: getDiseasedLeafColorTexture import 제거 (getDiseasedLeafMaterial archived).
} from './LeafTexture';
// SSOT #186 — Iter 24 acfad71 vertex shift logic을 anchors/ utility로 분리.
import { normalizeLeafMeshVertices } from './anchors';
// Iter 36 v5 Phase E — leaf-engine procedural variation (Conservative 분리).
import { buildCompoundLeaf as leafEngineBuildCompoundLeaf } from '../scene/leaf-engine';
import type { LeafBladeRef, SkeletonNode } from './skeleton/PlantSkeletonGraph';

/** Simple djb2 string hash → deterministic numeric seed (per leaf instance). */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

function applyChunkToMesh(chunk: GeoChunk, mesh: Mesh, vertexColors?: number[]) {
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  if (vertexColors) vd.colors = vertexColors;
  vd.applyToMesh(mesh);
}

/**
 * Bake the guideline §12 smooth color blend into vertex colors so the
 * shared PBRMaterial can do per-leaf tinting via useVertexColors=true
 * without per-instance shader uniforms. RGB is the multiplicative tint
 * (relative to the base mature green so the texture's natural color
 * shows through unchanged at age=mature/stress=0/yellow=0). Alpha is
 * always 1 — material uses RGB only.
 */
function bakeLeafVertexColors(
  vertexCount: number,
  ageFrac: number,
  waterStress: number,
  yellowing: number
): number[] {
  const blended = getLeafBlendedColor(ageFrac, waterStress, yellowing);
  // Normalize relative to mature so that mature/unstressed/green = (1,1,1) tint
  // and we only deviate when actually aged/stressed/senescent.
  // Must mirror LEAF_COLOR_MATURE in @farmsim/tomato-engine/LeafColors.
  // Mature/normal leaves end up with tint (1,1,1) so the texture's
  // baseline green shows unchanged; aged/stressed/senescent leaves
  // deviate from there.
  const MATURE_R = 0.165, MATURE_G = 0.400, MATURE_B = 0.125;
  const r = blended.r / MATURE_R;
  const g = blended.g / MATURE_G;
  const b = blended.b / MATURE_B;
  const out = new Array<number>(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 1;
  }
  return out;
}

/**
 * Legacy positional-args wrapper — used by 29 static neighbor plants
 * in GreenhouseScene where there's no NodeState. Group 3 replaces
 * those with GrowthEngine-driven Light LOD plants.
 */
export function createLeafMesh(
  name: string,
  scene: Scene,
  leafletCount: number,
  sizeFactor: number,
  maturity: number,
  curl: number,
  rng: SeededRandom,
  shapeParams?: LeafShapeParams,
  ageFrac?: number
): Mesh {
  const chunk = buildLeafChunkLegacy(
    {
      leafletCount,
      sizeFactor,
      maturity,
      curl,
      ageFrac: ageFrac ?? 0,
      shape: shapeParams,
    },
    rng
  );
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh);
  return mesh;
}

// Iter 35 PR 2 Phase L — createLeafMeshFromNode 제거 (ShowcasePlant 전용, 사용처 0).
// Canonical entry는 buildLeafMeshFromPhytomer (Iter 33 LEAF-LIVE-FALLBACK-NEVER-01).

// ★ Iter 34 C1 — `createLeafBladeOnlyMesh` (NodeState 기반 dead fallback) 제거.
// LEAF-LIVE-FALLBACK-NEVER-01 (Iter 33 V1)가 _0% 진입_ 검증 — populator가 100%
// phytomer-bind 보장. canonical entry = `buildLeafMeshFromPhytomer` (line 213).

// ---------------------------------------------------------------------------
// Iter 29 Phase 4 — canonical Skin builder: data-driven from LeafOrganState.
// ---------------------------------------------------------------------------

/**
 * Iter 29 Phase 4 canonical Skin leaf-mesh builder.
 *
 * Plan §13.3 (sleepy-growing-pretzel.md):
 *   buildLeafMesh(leafOrganState, anchor, visualProfile) — Skin reads
 *   `phytomer.leaf` + `anchor` only. No growth-state recomputation
 *   (SKIN-NO-GROWTH-LOGIC-01). No `plantAge` parameter (SKIN-DATA-DRIVEN-01).
 *   No LeafBase.azimuthRad/droopRad direct reads (SKIN-DATA-DRIVEN-03).
 *
 * Derives the existing LeafStageInfo struct from LeafOrganState fields so
 * `buildLeafChunkSkin` keeps the same biology — only the input plumbing
 * changes. `getLeafStage` is NOT called.
 *
 * Visual-only parameters (serration frequency, waviness, petiole length
 * texture) still flow via `genome` for Phase 4; Phase 5 fully migrates
 * those onto `cultivar.visualProfile`.
 *
 * @param leafOrganState  PlantBase-computed canonical leaf state
 * @param visualGenome    shape/texture parameters (Phase 5 → visualProfile)
 * @param rng             seeded RNG per-leaf
 * @param name            mesh name
 * @param scene           Babylon Scene
 */
export function buildLeafMeshFromPhytomer(
  name: string,
  scene: Scene,
  leafOrganState: {
    expansionProgress: number;
    leafletCount: number;
    currentAreaCm2: number;
    targetAreaCm2: number;
    stage: string;
    posture: { droopDeg: number; curl: number; gravityDroopDeg?: number };
    senescence: { progress: number; colorDullness: number; curl: number };
    morphology: { serrationDepth: number; lobeDepth: number; petioleLengthM: number };
    // Iter 31 Phase 2 (R5 fix) — optional canonical geometry projection.
    geometryProjection?: {
      leafAxisLengthScale: number;
      leafletBladeScale: number;
      referenceRachisLengthM: number;
      referencePetioleLengthM: number;
    };
  },
  visualGenome: PlantGenome,
  rng: SeededRandom,
  // Iter 36 v5 Phase C — skeleton 3-tier separation.
  //   Skeleton (LeafBladeRef + SkeletonNode[]) → Rendering engine read.
  //   Iter 39 Phase B — leafletNodes 타입을 SkeletonNode[]로 widen (node.id 보존).
  bladeRef?: LeafBladeRef,
  leafletNodes?: ReadonlyArray<SkeletonNode>,
  // Iter 38 S4 — Cultivar shape override (cherry 더 둥근 / beef 더 길쭉).
  cultivarShapeOverride?: {
    aspectRatioMultiplier?: number;
    baseShapeBias?: number;
    tipSharpnessMultiplier?: number;
  },
): Mesh {
  // Iter 36 v5 Phase E — leaf-engine 통합. bladeRef + leafletNodes 있을 때
  //   buildCompoundLeaf 호출 → CompoundLeafDescriptor.
  //   descriptor.resolved 의 serrationAmp/lobeDepth/serrationFreq 등을 shape에
  //   전달 → mesh vertex variation 결과 반영.
  //   leafletCount는 leaflet skeleton nodes 길이 사용 (4 position types 합).
  //
  //   ★ buildLeafChunkSkin은 외부 패키지 (변경 X). 산출값만 leaf-engine 경유.
  //   ★ Phase E 시점에 intercalary/secondary 별도 mesh 생성은 추후 (skeleton
  //     marker로 _기본_ 시각화 — buildLeafChunkSkin이 leafletCount 기반).
  let leafEngineLeafletCount = leafOrganState.leafletCount;
  let leafEngineSerrationDepth = leafOrganState.morphology.serrationDepth;
  let leafEngineLobeDepth = leafOrganState.morphology.lobeDepth;
  // ★ Iter 38 S1 — Hybrid 4 신규 shape params (AGE_PRESETS baseline + jitter).
  let leafEngineAspectRatio: number | undefined;
  let leafEngineBaseShape: number | undefined;
  let leafEngineTipSharpness: number | undefined;
  let leafEngineAsymmetry: number | undefined;
  if (bladeRef && leafletNodes && leafletNodes.length > 0) {
    const seed = hashStr(name);
    const descriptor = leafEngineBuildCompoundLeaf(
      bladeRef, leafletNodes, seed, cultivarShapeOverride,
    );
    // primary + intercalary + secondary leaflet 수의 합 (4 types).
    leafEngineLeafletCount = leafletNodes.length;
    leafEngineSerrationDepth = descriptor.resolved.serrationAmp;
    leafEngineLobeDepth = descriptor.resolved.lobeDepth;
    // ★ Iter 38 S1 — 4 신규 shape params from descriptor.resolved.
    //   baseShape + tipSharpness는 S3에서 ResolvedLeafParams에 추가 — 우선 type-safe access.
    const resolved = descriptor.resolved as typeof descriptor.resolved & {
      baseShape?: number;
      tipSharpness?: number;
    };
    leafEngineAspectRatio = resolved.aspectRatio;
    leafEngineBaseShape = resolved.baseShape;
    leafEngineTipSharpness = resolved.tipSharpness;
    leafEngineAsymmetry = resolved.asymmetry;
  }
  if (leafOrganState.expansionProgress < 0.01 && leafOrganState.currentAreaCm2 < 0.5) {
    return new Mesh(name, scene);
  }

  // ─── LeafStageInfo derived from LeafOrganState (NO getLeafStage call) ──
  const stageInfo = leafStageInfoFromOrganState(leafOrganState);

  // Shape: morphology values come from PlantBase (Phase 2A computed); visual
  // detail params (waviness, serrationFreq, petioleLength texture) still
  // flow via genome until Phase 5 visualProfile.
  // Iter 36 v5 Phase E — leaf-engine 산출값 (serration/lobe)이 있으면 우선 사용.
  const shape: LeafShapeParams = {
    serrationDepth: leafEngineSerrationDepth,
    serrationFreq: visualGenome.leafSerrationFreq,
    lobeDepth: leafEngineLobeDepth,
    waviness: visualGenome.leafWaviness,
    petioleLength: visualGenome.leafPetioleLength,
    // ★ Iter 38 S1 — Hybrid 4 신규 shape params (optional, descriptor 있을 때만).
    aspectRatio: leafEngineAspectRatio,
    baseShape: leafEngineBaseShape,
    tipSharpness: leafEngineTipSharpness,
    asymmetry: leafEngineAsymmetry,
  };

  // ageFrac mirrors PlantBase senescence — Skin applies value, doesn't recompute.
  // visibleAreaFactor (PlantBase senescence) reduces vertex-color baseline.
  const ageFrac = Math.min(1, leafOrganState.senescence.progress);
  const curl = leafOrganState.posture.curl + leafOrganState.senescence.curl * 0.5;

  // ─── Iter 31 Phase 2 (R5 fix) — Geometry projection ───
  //
  // ★ PlantBase가 _계산_, Skin은 _읽고 곱하기만_. 어떤 ageTT / cultivar / sigmoid
  //   계산도 Skin에서 하지 않음 (Iter 29 책임 분리 보존).
  //
  // canonical: leafOrganState.geometryProjection (PlantBase computeLeafGeometryProjection)
  // legacy fallback: 기존 (current/target) ratio _sqrt 적용_ (mature-small leaf 문제 완화).
  const projection = leafOrganState.geometryProjection;
  // Legacy sizeFactor (back compat for state shapes without geometryProjection).
  // ★ 정정: legacy도 sqrt 적용 — current/target ratio가 1.0이라도 _sqrt 효과_는 minimal.
  const referenceArea = Math.max(1, leafOrganState.targetAreaCm2);
  const legacySizeFactor =
    Math.sqrt(Math.max(0, leafOrganState.currentAreaCm2 / referenceArea))
    * visualGenome.leafSizeMultiplier;

  const chunk = buildLeafChunkSkin(
    {
      stageInfo,
      // Iter 36 v5 Phase E — leaf-engine 통합 시 leaflet skeleton nodes 길이 사용 (4 types 합).
      leafletCount: leafEngineLeafletCount,
      // sizeFactor — legacy fallback (canonical path는 leafAxisLengthScale + leafletBladeScale 사용)
      sizeFactor: legacySizeFactor,
      maturity: leafOrganState.expansionProgress,
      curl,
      ageFrac,
      shape,
      // ★ Iter 31 Phase 2 canonical fields (PlantBase 계산값 그대로 전달).
      leafAxisLengthScale: projection?.leafAxisLengthScale,
      // ★ Iter 31 R23 fix — leaflet도 length gate 적용 (어린 leaf size 정합).
      //   이전: leafletBladeScale = linearAreaScale (length maturity 제외)
      //   결함: 어린 leaf의 leaflet이 _상대적으로 큼_ → leaf rangeZ > rangeX (a0_n13: 2 leaflets,
      //   rangeX=5.6cm, rangeZ=6.0cm, dominant=z 결함).
      //   Fix: leafletBladeScale도 leafAxisLengthScale 사용 → leaflet도 어린 leaf에서 작아짐.
      leafletBladeScale: projection?.leafAxisLengthScale,
      referenceRachisLengthM: projection?.referenceRachisLengthM,
      referencePetioleLengthM: projection?.referencePetioleLengthM,
      // ★ Iter 32 — area-based gravity droop (mesh deformation only).
      //   PlantBase가 leaf.posture.gravityDroopDeg에 미리 저장 (G1 main+side
      //   computeGravityDroopDeg 호출). Skin은 _읽고 그대로 전달_ — 산수 0.
      //   leafChunk.ts의 longitudinalDroop 산식에 sin(deg) × size × t² 적용.
      gravityDroopDeg: leafOrganState.posture.gravityDroopDeg ?? 0,
    },
    rng,
  );
  // SSOT #186 — Mesh anchor contract (Iter 24 acfad71 vertex shift).
  normalizeLeafMeshVertices(chunk.positions);
  const vertexCount = chunk.positions.length / 3;
  // Senescence colorDullness drives the yellowing channel; waterStress flows
  // through PlantBase plant-level signal (Phase 4: zero on the leaf entry — Phase 5
  // wires per-leaf stress from PhytomerNode.leaf.stress).
  const vertexColors = bakeLeafVertexColors(
    vertexCount,
    ageFrac,
    0,
    leafOrganState.senescence.colorDullness,
  );
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh, vertexColors);
  return mesh;
}

/**
 * Build a LeafStageInfo struct from LeafOrganState fields WITHOUT calling
 * the engine-level `getLeafStage`. Maps PhytomerNode-side stage enum
 * ('primordium' | 'simple_leaf' | …) to the legacy LeafStage enum
 * (COTYLEDON | EARLY_TRUE | …) so `buildLeafChunkSkin` consumers keep
 * working unchanged.
 *
 * SKIN-NO-GROWTH-LOGIC-01: this function does NOT call getLeafStage,
 * leafletCountFromMaturity, computeLeafExpansion, or computeSenescence —
 * all values are read from the already-populated LeafOrganState fields.
 */
function leafStageInfoFromOrganState(input: {
  expansionProgress: number;
  leafletCount: number;
  stage: string;
  senescence: { progress: number };
}): LeafStageInfo {
  const expansion = Math.max(0, Math.min(1, input.expansionProgress));
  const senescenceP = Math.max(0, Math.min(1, input.senescence.progress));

  // Senescent / pruned override regardless of expansion
  if (senescenceP >= 0.3 && input.stage === 'senescent') {
    return {
      stage: LeafStage.SENESCENT,
      blendT: senescenceP,
      leafletCount: input.leafletCount,
      serrationStrength: 1,
      lobeStrength: 1,
    };
  }
  if (input.stage === 'removed') {
    return {
      stage: LeafStage.PRUNED,
      blendT: 0,
      leafletCount: 0,
      serrationStrength: 0,
      lobeStrength: 0,
    };
  }

  // EARLY_TRUE (expansion < 0.4)
  if (expansion < 0.4) {
    const blendT = expansion / 0.4;
    return {
      stage: LeafStage.EARLY_TRUE,
      blendT,
      leafletCount: input.leafletCount,
      serrationStrength: blendT * 0.4,
      lobeStrength: blendT * 0.3,
    };
  }
  // COMPOUND_DEVELOPING / COMPOUND_MATURE
  const t = (expansion - 0.4) / 0.6;
  return {
    stage: t < 0.5 ? LeafStage.COMPOUND_DEVELOPING : LeafStage.COMPOUND_MATURE,
    blendT: t,
    leafletCount: input.leafletCount,
    serrationStrength: 0.4 + t * 0.6,
    lobeStrength: 0.5 + t * 0.5,
  };
}

const cachedLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedYellowLeafMaterial = new WeakMap<Scene, PBRMaterial>();
// Iter 35 PR 2 Phase L: cachedDiseasedLeafMaterial 제거.

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
      // LeafGenerator bakes RGB tint from getLeafBlendedColor(); PBR
      // material auto-detects vertex colors from the bound VertexBuffer
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
      // Same baked-color path as WebGL2 — vertex colors auto-detected
      // from the mesh's VertexBuffer.ColorKind data; no flag required.

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

// Iter 35 PR 2 Phase L — getDiseasedLeafMaterial 제거 (ShowcasePlant 전용, 사용처 0).
