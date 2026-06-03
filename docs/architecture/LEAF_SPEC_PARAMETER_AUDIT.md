# Leaf Spec Parameter Audit (Phase L5)

> L4 후 LeafMeshBuilder.ts에 잔존하는 botanical magic numbers의 _완전 목록_과
> JSON spec migration plan. 모든 entry는 L5 migration 후 _tomato.json_의
> 명시된 field에서 읽혀야 함 (코드 hardcoded 0).

## Section 1 — Migration Table (botanical magic → JSON)

### Lobe noise (sin 3-wave synthesis)

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:156](src/scene/leaf/LeafMeshBuilder.ts#L156) | `freq1 = 2.0 + (seed % 1.5)` | wave 1 base + seed-mod freq | `lobeNoiseRules.waves[0].{baseFrequency,seedFrequencyMod,seedMultiplier=1}` | L5-3 |
| [LeafMeshBuilder.ts:157](src/scene/leaf/LeafMeshBuilder.ts#L157) | `freq2 = 3.7 + ((seed*7) % 1.2)` | wave 2 freq | `lobeNoiseRules.waves[1].{baseFrequency=3.7,seedFrequencyMod=1.2,seedMultiplier=7}` | L5-3 |
| [LeafMeshBuilder.ts:158](src/scene/leaf/LeafMeshBuilder.ts#L158) | `freq3 = 5.1 + ((seed*13) % 1.0)` | wave 3 freq | `lobeNoiseRules.waves[2].{baseFrequency=5.1,seedFrequencyMod=1.0,seedMultiplier=13}` | L5-3 |
| [LeafMeshBuilder.ts:160](src/scene/leaf/LeafMeshBuilder.ts#L160) | `phase1 = (seed*0.7) % (2π)` | wave 1 phase mul | `lobeNoiseRules.waves[0].phaseMultiplier=0.7` | L5-3 |
| [LeafMeshBuilder.ts:161](src/scene/leaf/LeafMeshBuilder.ts#L161) | `phase2 = (seed*1.3) % (2π)` | wave 2 phase mul | `lobeNoiseRules.waves[1].phaseMultiplier=1.3` | L5-3 |
| [LeafMeshBuilder.ts:162](src/scene/leaf/LeafMeshBuilder.ts#L162) | `phase3 = (seed*2.1) % (2π)` | wave 3 phase mul | `lobeNoiseRules.waves[2].phaseMultiplier=2.1` | L5-3 |
| [LeafMeshBuilder.ts:165](src/scene/leaf/LeafMeshBuilder.ts#L165) | wave 1 weight `0.5` | wave 1 amplitude weight | `lobeNoiseRules.waves[0].weight=0.5` | L5-3 |
| [LeafMeshBuilder.ts:166](src/scene/leaf/LeafMeshBuilder.ts#L166) | wave 2 weight `0.3` | wave 2 amplitude weight | `lobeNoiseRules.waves[1].weight=0.3` | L5-3 |
| [LeafMeshBuilder.ts:167](src/scene/leaf/LeafMeshBuilder.ts#L167) | wave 3 weight `0.2` | wave 3 amplitude weight | `lobeNoiseRules.waves[2].weight=0.2` | L5-3 |
| [LeafMeshBuilder.ts:171](src/scene/leaf/LeafMeshBuilder.ts#L171) | `Math.max(0, v)` (positive only) | outline 항상 바깥쪽 | `lobeNoiseRules.positiveOnly=true` | L5-3 |

### Leaflet pose noise (mesh-affecting — `applyLeafletPose` only)

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:693](src/scene/leaf/LeafMeshBuilder.ts#L693) | `pitchDivisor = 100/poseRules.pitchNoiseRange` | pitch rad noise | _이미 L4-5에서 spec_ — **rename** `pitchNoiseRange` → `pitchNoiseRangeRad` (semantic 명확) | L5-5 |
| [LeafMeshBuilder.ts:694](src/scene/leaf/LeafMeshBuilder.ts#L694) | `rollDivisor` | roll rad | `pitchNoiseRange` → `rollNoiseRangeRad` rename | L5-5 |
| [LeafMeshBuilder.ts:695](src/scene/leaf/LeafMeshBuilder.ts#L695) | `twistDivisor` | twist rad | `pitchNoiseRange` → `twistNoiseRangeRad` rename | L5-5 |

> Note: `computeLeafletPose` (line 239-259, deg-based) **완전 dead** — Section 3 참조. 제거 대상.

### Shape profile (mesh outline)

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:506](src/scene/leaf/LeafMeshBuilder.ts#L506) | `u < 0.2` base wedge threshold | base→shape transition end | `shapeProfileRules.baseTransitionEndU=0.2` | L5-6a |
| [LeafMeshBuilder.ts:506](src/scene/leaf/LeafMeshBuilder.ts#L506) | `(1 - u / 0.2)` 분모 | 위 threshold와 동일 | (위와 같은 entry) | L5-6a |

### Cultivar clamp ranges

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:587](src/scene/leaf/LeafMeshBuilder.ts#L587) | `Math.max(0.7, Math.min(1.0, ...))` | baseShape cultivar 후 bound | `shapeProfileRules.baseShapeClamp=[0.7, 1.0]` | L5-6a |
| [LeafMeshBuilder.ts:591](src/scene/leaf/LeafMeshBuilder.ts#L591) | `Math.max(1.0, Math.min(2.0, ...))` | tipSharpness cultivar 후 bound | `shapeProfileRules.tipSharpnessClamp=[1.0, 2.0]` | L5-6a |

### Maturity envelope (F5 smoothstep)

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:601](src/scene/leaf/LeafMeshBuilder.ts#L601) | `(maturity - 0.2) / (0.8 - 0.2)` | envelope start/end | `shapeProfileRules.maturityEnvelopeStart=0.2`, `maturityEnvelopeEnd=0.8` | L5-6b |
| [LeafMeshBuilder.ts:602](src/scene/leaf/LeafMeshBuilder.ts#L602) | `0.2 + (1.0 - 0.2) * smoothstep` | opennessFactor base min/max | `shapeProfileRules.opennessBaseMin=0.2`, `opennessBaseMax=1.0` | L5-6b |

### Edge asymmetry weights

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:668](src/scene/leaf/LeafMeshBuilder.ts#L668) | left `lobe + teeth` (weights `1.0, 1.0`) | left edge lobe/serration weight | `edgeAsymmetryRules.{leftLobeWeight=1.0, leftSerrationWeight=1.0}` | L5-6b |
| [LeafMeshBuilder.ts:669](src/scene/leaf/LeafMeshBuilder.ts#L669) | right `lobe*0.85 + teeth*1.1` | right edge weights | `edgeAsymmetryRules.{rightLobeWeight=0.85, rightSerrationWeight=1.1}` | L5-6b |

### Senescence curl factor

| 위치 | 현재 값 | botanical 의미 | JSON destination | migration phase |
|---|---|---|---|---|
| [LeafMeshBuilder.ts:597](src/scene/leaf/LeafMeshBuilder.ts#L597) | `senescence.curl * 0.5` | senescence curl 가중 | `shapeProfileRules.senescenceCurlWeight=0.5` | L5-6a |

### Dead code (제거 대상, S46 L5-7)

| 위치 | 항목 | 처리 |
|---|---|---|
| [LeafMeshBuilder.ts:239-259](src/scene/leaf/LeafMeshBuilder.ts#L239) | `computeLeafletPose` 함수 + `LeafletPose` interface | **완전 제거** — 호출처 0 (Section 3) |
| [LeafMeshBuilder.ts:285-357](src/scene/leaf/LeafMeshBuilder.ts#L285) | `AGE_PRESETS` 상수 (5 presets 전체) | **제거** — tomato.json과 100% 중복 (engine은 spec 사용) |
| [LeafMeshBuilder.ts:179-229](src/scene/leaf/LeafMeshBuilder.ts#L179) | `LeafInstanceProfile` 4 dead fields | **부분 제거** — `rachisCurvature`/`leafDroopDeg`/`opennessFactor`/`overallTwist` (Section 3) |

### leafInstanceRules (부분 dead — Section 3 참조)

| 위치 | 현재 값 | botanical 의미 | 처리 |
|---|---|---|---|
| [LeafMeshBuilder.ts:211](src/scene/leaf/LeafMeshBuilder.ts#L211) | `rachisCurvature = signed(1) * 0.15` | rachis 곡률 | **dead — 제거** |
| [LeafMeshBuilder.ts:212](src/scene/leaf/LeafMeshBuilder.ts#L212) | `droopBase = lerp(-10, 30, maturity)` | leaf-level droop | **dead — 제거** |
| [LeafMeshBuilder.ts:213](src/scene/leaf/LeafMeshBuilder.ts#L213) | `signed(2) * 8` (droop noise) | droop noise | **dead — 제거** |
| [LeafMeshBuilder.ts:214-215](src/scene/leaf/LeafMeshBuilder.ts#L214) | `nodePositionT > 0.85 ? 1.3 : 1.0` | apex boost threshold | `leafInstanceRules.apexImbalanceThreshold=0.85`, `apexImbalanceBoost=1.3` — _live_ (leftRightImbalance에 기여) |
| [LeafMeshBuilder.ts:215](src/scene/leaf/LeafMeshBuilder.ts#L215) | `signed(3) * 0.20 * apexBoost` | leftRightImbalance amplitude | `leafInstanceRules.leftRightImbalanceRange=0.20` — **live** (skeleton size factor 영향) |
| [LeafMeshBuilder.ts:216](src/scene/leaf/LeafMeshBuilder.ts#L216) | `signed(4) * 0.05` | spacingBias | **dead — 제거** (`void profile.spacingBias` line 979) |
| [LeafMeshBuilder.ts:217-218](src/scene/leaf/LeafMeshBuilder.ts#L217) | `lerp(0.25, 1.0, smoothstep(0.15, 0.85, maturity))` | opennessBase | **dead — 제거** |
| [LeafMeshBuilder.ts:218](src/scene/leaf/LeafMeshBuilder.ts#L218) | `0.25, 1.05` clamp | openness clamp | **dead — 제거** |
| [LeafMeshBuilder.ts:219](src/scene/leaf/LeafMeshBuilder.ts#L219) | `signed(6) * 0.10` | overallTwist | **dead — 제거** |

→ **L5-4 결과**: function _분리_ — `computeLeafInstanceProfile` 폐기, 대신 `computeLeftRightImbalance(spec.leafInstanceRules, leafNodeIdx, nodePositionT, globalSeed)` 작은 함수 신설 (live field 1개만).

JSON destination:
```json
"leafInstanceRules": {
  "leftRightImbalanceRange": 0.20,
  "apexImbalanceThreshold": 0.85,
  "apexImbalanceBoost": 1.3
}
```

## Section 2 — Non-botanical Allowlist (intentionally kept in code)

이 상수들은 _botanical parameter가 아님_. 코드에 유지되며 LEAF-SPEC-COVERAGE-01에서 자동 허용.

### Hash / RNG constants (deterministic seed algorithm)

| 위치 | 값 | 목적 |
|---|---|---|
| `djb2` (line 92-96) | `5381` (init), `33` via `(h<<5)+h`, `charCodeAt` | DJB2 hash algorithm |
| `buildLeafletPatch:720` | `0.7919`, `31` | per-leaflet seed mixing |
| `applyLeafletPose:696-698` | `17`, `19`, `13` (mod step) | pitch/roll/twist seed step |
| `sampleHybrid:393` | `13`, `100`, `200` | hybrid sampling seed step |
| `computeLeafInstanceProfile:207` | `1009`, `31` | global seed mixing |
| `computeLeafInstanceProfile:208` | `7919`, `49297`, `1000` | h() hash primes |
| `LeafEngine.createLeaf` (caller) | `1009`, `9173`, `31`, `11` | plant seed × axis × node mix |

### Quaternion / trig math constants

| 위치 | 값 | 목적 |
|---|---|---|
| `quatFromYawPitchRoll:48-50` | `0.5` (half-angle) | YPR → quat conversion |
| `applyLeafletPose:699` | `Math.PI / 180` | deg → rad |
| `lobeNoise:160-162` | `Math.PI * 2` | phase mod period |
| `buildShapeProfile:486` | `Math.PI` | sin(πu) shape function |
| `endpointTaperWeight` (LeafletProfile.ts) | `Math.PI` | sin(πt) cap taper |

### Float-point safety

| 위치 | 값 | 목적 |
|---|---|---|
| `buildLeafletOutlineWithNoise:657` | `0.02` m (noise length cap) | G3 broken-mesh prevention — _geometry safety, not botanical_. Allowlist OK. |
| typical | `1e-5`, `1e-6`, `1e-9` | EPS bounds |

### Array / clamp / loop constants

| 값 | 목적 |
|---|---|
| `0`, `1`, `-1`, `2` | clamp bounds (0-1 range), array index, loop step |
| `0.5` | half, half-range, averaging |
| `'low'`, `'high'` | quality enum literals |

### Babylon-related

| 위치 | 값 | 목적 |
|---|---|---|
| `quatFromYawPitchRoll` | Y-X-Z order | Babylon Quaternion.RotationYawPitchRoll match |

## Section 3 — Instance State vs World Transform Separation

사용자 architectural 질문 "instance와 world는 분리되고 있는가?"에 대한 정직한 audit.

### Current architecture (L4 완료 시점)

```
Physiology (tomato-engine)
  ├─ LeafOrganState { expansionProgress, posture, senescence, morphology }
  └─ per-step update
       ↓
Skeleton (PlantSkeletonGraph)
  ├─ SkeletonNode { id, pos (plant-local), leafBladeRef, phytomer.leaf, ... }
  ├─ SkeletonEdge { bonePath (plant-local), endNodeId, ... }
  └─ leftRightImbalance (skeleton size factor — Section 1 leafInstanceRules entry)
       ↓
Leaf Engine (src/scene/leaf)
  ├─ ctx.leafOrganState (physiology) → buildLeafShapeDescriptor
  ├─ ctx.spec (botanical parameter) → all formulas
  ├─ skeleton node.pos → patch.position (plant-local)
  └─ output: LeafMeshPatch[] (pure data, Babylon 의존 0)
       ↓
Babylon Rendering
  ├─ Mesh + VertexData(chunk)
  ├─ mesh.position = patch.position (plant-local)
  ├─ mesh.rotationQuaternion = patch.rotationQuat
  └─ mesh.parent = lushGroup (world transform)
       ↓
World
  └─ Babylon computeWorldMatrix(true) — lushGroup × mesh local
```

### Verdict

| 영역 | 분리 상태 |
|---|---|
| Pure mesh data vs Babylon | ✅ 완전 분리 (LeafMeshPatch L3-F) |
| Plant-local vs World | ✅ 완전 분리 (lushGroup 단독 책임, SSOT #186) |
| Physiology state vs Mesh | ✅ 분리 (ctx.leafOrganState 통한 단방향 주입) |
| Botanical spec vs Engine | ✅ 분리 (L4-5 ctx.spec, L5 강화) |
| **Leaf-instance macro vs Mesh path** | ⚠️ **부분 dead** — `computeLeafInstanceProfile` 6 fields 중 1만 사용 (skeleton path), 4 fields dead, 1 field void |

### Dead path 결정 (사용자 선택)

> "L5에서 단순 제거" 선택됨.

L5-4 처리:
1. `computeLeafInstanceProfile` 함수 _분해_:
   - 6-field 반환 → 1-field 반환 (`leftRightImbalance`)
   - 함수명 변경: `computeLeftRightImbalance(spec.leafInstanceRules, ...)` (단일 책임)
   - spec param 추가 (leftRightImbalanceRange, apexImbalanceThreshold, apexImbalanceBoost)
2. 호출처 `buildTomatoSkeletonGraph.ts:386` 갱신:
   - 6-field destructuring 제거
   - `leftRightImbalance` 만 받음
   - `spacingBias` 인자 제거 (이미 `void`)
3. `LeafInstanceProfile` interface 제거, `LeafletPose` interface 제거 (computeLeafletPose도 dead)

검증:
- 신규 spec `LEAF-INSTANCE-PROFILE-PARITY-01`: `computeLeftRightImbalance(spec, ...)` 동일 seed → 동일 값 (1e-9)
- REFACTOR-PARITY-01 strict — `buildTomatoSkeletonGraph` size factor 변화 0
- skeleton spec 회귀 PASS (leftRightImbalance 영향 — i-position-profile, leaflet-attach-coherence 등)

## Section 4 — Migration Plan Summary (sub-phase mapping)

| Sub-phase | Audit entries 다룸 |
|---|---|
| L5-1 (S39) | Schema 확장 — 모든 신규 sections 정의 |
| L5-2 (S40) | tomato.json — 모든 Section 1 entries에 현재 값 배치 |
| L5-3 (S41) | Lobe noise (10 entries) |
| L5-4 (S42) | leafInstanceRules (3 live + 5 dead 제거) + `computeLeafInstanceProfile` 분해 + `computeLeafletPose` 제거 |
| L5-5 (S43) | pose rename pitchNoiseRange → pitchNoiseRangeRad (3 entries) |
| L5-6a (S44) | shape profile (4 entries) + cultivar clamp (2 entries) + senescence curl (1 entry) |
| L5-6b (S45) | maturity envelope (2 entries) + edge asymmetry (4 entries) |
| L5-7 (S46) | AGE_PRESETS 제거 + coverage invariant |

## ★ Acceptance Criteria (L5 완료 시)

1. `LeafMeshBuilder.ts` 안 botanical magic = 0 (이 문서 Section 1의 모든 entries가 _migrated_ 또는 _removed_)
2. `tomato.json` schemaVersion '1.1', 모든 Section 1 destinations 존재
3. 35/35 leaf architecture invariants PASS
4. REFACTOR-PARITY-01 strict (vertex byte-identical)
5. Section 3 dead path 정리 — `computeLeafletPose` 제거, `computeLeafInstanceProfile` 분해

## ★ L5 완료 status (S38~S45)

| Phase | Commit | Status |
|---|---|---|
| L5-0 audit | S38 `87a73b4` | ✅ |
| L5-1+2 schema v1.1 + JSON atomic | S39 `b4f31b0` | ✅ |
| L5-3 lobeNoise migration | S40 `b124f54` | ✅ |
| L5-4 computeLeafInstanceProfile 분해 + computeLeafletPose 제거 | S41 `63c7c35` | ✅ |
| L5-5 pose Rad rename | (S39에 atomic 포함) | ✅ |
| L5-6a shape + cultivar clamp + senescence | S42 `e5f5cb5` | ✅ |
| L5-6b envelope + edge asymmetry | S43 `d34fe16` | ✅ |
| L5-7 AGE_PRESETS 제거 + COVERAGE + SCHEMA-V11 | S44 `102cad5` | ✅ |
| L5-8 docs | S45 | ✅ |

검증:
- 4 신규 L5 invariants PASS (LOBE-NOISE-PARITY, INSTANCE-PROFILE-PARITY, SCHEMA-V11, COVERAGE)
- 30 기존 leaf invariants 회귀 PASS (refactor-parity strict, position-profile, anchor 5, layer 5, L4 5, etc.)
- REFACTOR-PARITY-01 strict 모든 commit 유지 (mesh byte-identical)
- typecheck PASS
