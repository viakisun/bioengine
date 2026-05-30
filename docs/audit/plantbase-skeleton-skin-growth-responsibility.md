# Iter 29 Phase 0 — PlantBase / Skeleton / Skin Growth Responsibility Audit

> **Iter 29 v3.3 plan, Phase 0 산출물** (read-only).
> 이 문서는 v3.3 architecture refactor의 _현재 상태 스냅샷_이다.
> 의견·권고가 아닌 **file:line 사실**만 기록한다.
>
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../../.claude/plans/sleepy-growing-pretzel.md)
>
> 작성 시점: Iter 29 v3.3 approved (Phase 0 진입).

---

## 0. Executive Summary — 4 Layer 책임 분리 현황

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Layer            │  현재 상태              │  Phase 1~6 변경 범위         │
├──────────────────────────────────────────────────────────────────────────┤
│  PlantBase /      │  day-based, NodeState   │  Phase 1: PhytomerNode +    │
│  GrowthModel      │  flat, currentTT 없음   │  currentTT + TT-based       │
│  (1256 LOC)       │                         │  Phase 2A/2B: LeafOrganState│
│                   │                         │  + SourceSinkProxyV1         │
├──────────────────────────────────────────────────────────────────────────┤
│  Skeleton         │  SkeletonNode.phytomer  │  Phase 3: phytomer 직접     │
│  (Iter 26 자산)   │  없음, OrganAnchor에    │  참조 + anchor purity 회복  │
│                   │  morphology/state 보유   │  (morphology/state 제거)    │
├──────────────────────────────────────────────────────────────────────────┤
│  Skin             │  plantAge 직접 받음,    │  Phase 4: plantAge 제거,    │
│  SkinMeshPlant +  │  leafBase.azimuth/      │  growth fn 호출 0건         │
│  LeafGenerator    │  droopRad 직접 참조     │  data-driven only           │
├──────────────────────────────────────────────────────────────────────────┤
│  Cultivar Profile │  39 필드, growthProfile │  Phase 1-Pre: growthProfile │
│                   │  nested bundle 없음     │  schema (11 fields)         │
│                   │                         │  Phase 5: full integration  │
├──────────────────────────────────────────────────────────────────────────┤
│  Calibration Pack │  reference pack v0.1만  │  Phase 6: growth-targets    │
│                   │  존재 (CSV+JSON)        │  jsonc (NEW), CalibrationWarn│
└──────────────────────────────────────────────────────────────────────────┘
```

**완료된 Iter 29 v1 commit 3건은 모두 보존** (revert 0건).
새 v3.3 구조 안에서 _재배치_만 한다.

---

## 1. 현재 구현 책임 분리 도식

### 1.1 Data flow (현재 — Iter 28 baseline)

```text
PlantState (day-based)                   GrowthModel.ts (1256 LOC)
  │ day: number                          │ computePlantState(day, ...)
  │ nodes: NodeState[]   ──────────────► │   ├─ node.age = day - emergeDay
  │                                      │   ├─ leafMaturity = sigmoid(age)
  │  (currentTT 없음)                    │   ├─ if (age > 60) yellowing++
  ▼                                      │   └─ BASE_LEAF_AREA_CM2 = 880
PlantBase.ts (geometry cache)               × stemVigorFactor (Iter 29 v1 P3)
  │ leafAxes, sideShoots
  ▼
PlantSkeletonGraph (Iter 26)             SkeletonNode
  │ build via PlantSkeleton                │ id, pos, radius, edgeIds
  │   populator                            │ (phytomer 필드 없음)
  │ OrganAnchor                            ▼
  │   ├─ morphology (sizeFactor 등)     populateAnchorMorphology
  │   ├─ state (visibility, yellowing)    (NodeState → AnchorMorphologyHint)
  │   └─ chain
  ▼
SkinMeshPlant.ts (890 LOC)               LeafGenerator.ts
  │ createLeafBladeOnlyMesh(             │ createLeafBladeOnlyMesh(
  │   node, genome, state.day, ...)   ──►│   node, genome, plantAge, rng)
  │                                       │   ├─ getLeafStage(node, plantAge)
  │ leafBase.azimuthRad ★ 직접 참조       │   └─ buildLeafChunk(...)
  │ leafBase.droopRad ★ 직접 참조         │
  ▼                                       ▼
Babylon Mesh (PlantBase에서 컴포지트)
```

★ = Phase 3 SKIN-NO-LEAFBASE-01 violation.

### 1.2 Data flow (목표 — Iter 29 v3.3 종료)

```text
PlantState                               Growth modules (Phase 1 boundary)
  │ currentTT: number ★ canonical        │ ThermalTime / PhytomerModel /
  │ nodes: PhytomerNode[] ──────────────►│ InternodeGrowthModel /
  │   ├─ initiationTT, visibleTT, ageTT  │ LeafGrowthModel / SenescenceModel /
  │   ├─ internode: InternodeState       │ SourceSinkProxyV1 / TrussRuleModel
  │   ├─ leaf: LeafOrganState
  │   ├─ truss?: TrussOrganState (shell) Cultivar.growthProfile (Phase 1-Pre)
  │   ├─ sideShoot?: SideShootState       │ phyllochronTT, maxLeafAreaCm2,
  │   └─ status (phytomer 전체)           │ maxLeafletCount, leafLifespanTT…
  ▼
PlantSkeletonGraph (Phase 3)
  │ SkeletonNode
  │   ├─ pos, radius, edgeIds
  │   └─ phytomer ★ 직접 참조 (PhytomerNode)
  │ OrganAnchor (purity 회복)
  │   ├─ position, rotation (Quaternion) ★ 공간 변환 정보만
  │   ├─ organKind, organId
  │   └─ debugHint (growth state 0)
  ▼
SkinMeshPlant (Phase 4 — data-driven)
  │ buildLeafMesh(leafOrganState, anchor, visualProfile)
  │   ├─ leafOrganState.currentAreaCm2 → scale
  │   ├─ leafOrganState.leafletCount → compound geometry
  │   ├─ anchor.rotation → transform
  │   └─ leafOrganState.senescence.{colorDullness, visibleAreaFactor, curl, droop}
  │       → material/geometry parameter 적용만
  │
  │ ★ 호출 0건: getLeafStage, leafletCountFromMaturity,
  │            computeLeafExpansion, computeSenescence
  ▼
Babylon Mesh
```

---

## 2. 기존 Iter 29 v1 commit 3건 처분

| Commit | 내용 | 처분 | 새 plan 위치 |
|---|---|---|---|
| `d91b492` (v1 P0) | `leafletCountFromMaturity()` SSOT, 1→3→5→7→9 진화 ([`LeafStage.ts:63-73`](../../packages/tomato-engine/src/LeafStage.ts#L63-L73)) | ✓ **보존** | Phase 2A `LEAF-STAGE-01` 기반. `maturity` 인자가 _ageTT 기반_ `expansionProgress`로 재해석되지만 함수 자체는 그대로. 단 implicit `max = 9`는 Phase 1-Pre `cultivar.growthProfile.maxLeafletCount`로 이관 (LeafStage.ts:72의 `5 + t * 4` 수식 cultivar driven으로). |
| `f045ccb` (v1 P2) | Cotyledon `BotanicalSpec.cotyledon` ([`BotanicalSpec.ts:252-286`](../../packages/tomato-engine/src/BotanicalSpec.ts#L252-L286), [`PlantBase.ts:849`](../../src/plant/PlantBase.ts#L849), [`SkinMeshPlant.ts:267`](../../src/twin/SkinMeshPlant.ts#L267)) | ✓ **보존** | Skin이 spec _값을 적용만_ 하는 패턴은 Phase 4 SKIN-DATA-DRIVEN-01 정합. Cotyledon은 별개 organ이므로 LeafOrganState 트리에 들어가지 않음 (Phase 1 PhytomerNode 외 별도 organ). |
| `382dcc2` (v1 P3) | `stemVigorFactor = clamp(pow(h/50, 0.5), 0.5, 1.5)` ([`GrowthModel.ts:806-810`](../../packages/tomato-engine/src/GrowthModel.ts#L806-L810)) | ⚠️ **재배치** | Phase 2A `plantVigorFactor`로 이름 변경 + formula 점진 변경 (`currentStemRadius / referenceStemRadius`). `BASE_LEAF_AREA_CM2 = 880`은 Phase 1-Pre `cultivar.growthProfile.maxLeafAreaCm2`로 이관. lightweight proxy 의미는 그대로 (정직 표기 강제). |

**revert 0건. 모두 새 구조에서 _재배치_.**

---

## 3. Layer별 현재 상태 (file:line)

### 3.1 PlantBase / GrowthModel — 1256 LOC

**File**: [`packages/tomato-engine/src/GrowthModel.ts`](../../packages/tomato-engine/src/GrowthModel.ts)

**현재 책임 (excess)**:
- node 생장 (heightCm, leafMaturity, leafSizeFactor, leafAreaCm2)
- leaf morphology proxy (leafletCount)
- senescence (yellowing, droopExtra) — **day-based**
- truss 생성 + ripening
- side shoot (StemAxis 재귀)
- defoliation

**Top-level export**:
- [`overlayPhysiologyFruits()`](../../packages/tomato-engine/src/GrowthModel.ts#L191) — 191
- [`computePlantState(day, genome, stress, cultivar, simContext)`](../../packages/tomato-engine/src/GrowthModel.ts#L600) — 600

**NodeState** ([GrowthModel.ts:93-135](../../packages/tomato-engine/src/GrowthModel.ts#L93-L135)):

| 필드 | 타입 | Phase 1 이관 위치 |
|---|---|---|
| `index, heightCm, phyllotaxisAngle` | number | 유지 (PhytomerNode top-level) |
| `leafMaturity, leafSizeFactor, leafAreaCm2, leafletCount, yellowing, droopExtra` | number | `leaf: LeafOrganState` (getter alias 유지) |
| `truss: TrussState \| null` | | `truss?: TrussOrganState` (rename + shell) |
| `age` (days since emergence) | number | `ageTT` (TT 기반) — `age`는 legacy alias |
| `emergence` (0–1 newest node fraction) | number | LeafOrganState.expansionProgress로 흡수 가능 |
| `internodeLenCm, stemRadiusMm` | number | `internode: InternodeState` |
| `massAboveKg, bendingMomentNm, deflectionRad, deflectionAzimuth` | number | physics 별도 — phytomer state 외 |
| `waterStress, diseaseLoad` | number | `leaf.stress` 또는 plant-level |
| `position, growthDir` | Vec3 | 유지 (skeleton 변환 입력) |
| `budState, sideShoot, sideShootAngleDeg` | | `sideShoot?: SideShootState` (Phase 2A shell) |

**★ TT-based 필드 0건 — `initiationTT`, `ageTT`, `visibleTT` 모두 없음**.

**PlantState** ([GrowthModel.ts:137-164](../../packages/tomato-engine/src/GrowthModel.ts#L137-L164)):

| 필드 | line | 처분 |
|---|---|---|
| `day: number` | 139 | **★ canonical 자리에서 강등** — Phase 1에서 `currentTT` 추가, day는 diagnostic ago |
| `seed, heightCm, nodes, nodeCount, leafCount, trussCount` | 138–144 | 유지 |
| `currentTT` | — | **★ 신규 — Phase 1 GROWTH-CLOCK-01 필수** |
| `cotyledonSize, hasCotyledons` | 148–149 | 유지 |
| `waterStress, diseaseLoad` | 151–152 | 유지 |
| `mainAxis, allAxes, geometryMode` | 156–163 | 유지 |

**Day-based conditional branches (6건 — Phase 1 DAY-LEGACY-01 대상)**:

| Line | 조건 | TT 이관 안 |
|---|---|---|
| 700–702 | `day < hypoEmergeDay` (hypocotyl emergence) | `currentTT < hypoEmergeTT` |
| 791 | `day < 15` (juvenile leaf scale ramp 0.3→1.0) | `currentTT < juvenileTT` (or LeafOrganState 내부 흡수) |
| 819 | `age > 60` (yellowing onset) | `leaf.ageTT > senescenceStartTT` (Phase 2A LEAF-SENESCENCE-TT-01) |
| 1011 | `node.age > 80` (leafMaturity senescence fade) | 동상 |
| 1018 | `day >= 3 && day < 25` (cotyledon visibility window) | `currentTT >= cotEmergeTT && currentTT < cotSenescenceTT` |
| 1129 | `day >= defo.startDay` (defoliation trigger) | `currentTT >= defo.startTT` (또는 cultivar rule) |

**Senescence — 전부 day-based**:
- [`age > 60` yellowing onset](../../packages/tomato-engine/src/GrowthModel.ts#L819) (line 819)
- [`(age - 60) / 30` ramp to 1.0 at age 90](../../packages/tomato-engine/src/GrowthModel.ts#L518) (line 518, 819)
- [`age > 80 senFade = (age - 80) / 35`](../../packages/tomato-engine/src/GrowthModel.ts#L1011) (line 1011–1015)

**Phase 2A LEAF-SENESCENCE-TT-01에서 모두 TT 기반 sigmoid로 전환**.

**BASE_LEAF_AREA_CM2 중복 정의 (Phase 1-Pre PROFILE-PRE-03 0건 대상)**:
- [GrowthModel.ts:512](../../packages/tomato-engine/src/GrowthModel.ts#L512) — side-shoot path
- [GrowthModel.ts:815](../../packages/tomato-engine/src/GrowthModel.ts#L815) — main-axis path

→ `cultivar.growthProfile.maxLeafAreaCm2`로 통합.

**stemVigorFactor (Iter 29 v1 P3 보존)**:
- [GrowthModel.ts:806-810](../../packages/tomato-engine/src/GrowthModel.ts#L806-L810)
- Phase 2A에서 `plantVigorFactor`로 rename + formula 점진 변경 (height → currentStemRadius)

### 3.2 Skeleton (Iter 26 자산) — 90% 재사용

**File**: [`src/plant/skeleton/PlantSkeletonGraph.ts`](../../src/plant/skeleton/PlantSkeletonGraph.ts)

**SkeletonNode** ([PlantSkeletonGraph.ts:98-114](../../src/plant/skeleton/PlantSkeletonGraph.ts#L98-L114)):
```typescript
export interface SkeletonNode {
  id: string;
  pos: V3;                          // plant-local (SSOT #185 / INV-01)
  radius: number;
  edgeIds: string[];
  type?: SkeletonNodeType;          // Iter 26 PR 1-1 (optional migration)
  frame?: LocalFrame;               // Iter 26 PR 1-1
  visualHint?: NodeVisualHint;      // Iter 26 PR 1-1
}
```

★ **`phytomer` 필드 없음** — Phase 3 SKELETON-PHYTOMER-01 핵심 신규.

**OrganAnchor** ([PlantSkeletonGraph.ts:230-266](../../src/plant/skeleton/PlantSkeletonGraph.ts#L230-L266)):
```typescript
export interface OrganAnchor {
  id: string;
  kind: OrganAnchorKind;
  anchorNodeId: string;                  // Iter 27 redefined: joint anchor
  meshAnchorNodeId?: string;             // Iter 27: mesh.position source
  morphology?: AnchorMorphologyHint;     // Iter 26 PR 1-2 — ★ PhytomerNode 이관 대상
  state?: OrganState;                    // Iter 26 PR 1-2 — ★ PhytomerNode 이관 대상
  chain?: OrganChain;                    // Iter 26 PR 1-2 — 유지
  visualHint?: AnchorVisualHint;         // overlay self-description
}
```

★ **`position`, `rotation` 필드 없음** — Phase 3 SKELETON-ANCHOR-TRANSFORM-01 핵심 신규.

**AnchorMorphologyHint** ([PlantSkeletonGraph.ts:149-172](../../src/plant/skeleton/PlantSkeletonGraph.ts#L149-L172)) — Phase 3 PhytomerNode 이관:

| 필드 | → PhytomerNode 이관 위치 |
|---|---|
| `sizeFactor, maturity, leafletCount, droopFactor` | `PhytomerNode.leaf.{expansionProgress, leafletCount, posture.droopDeg}` |
| `targetDiameterM, ripeness, fruitGenome` | `PhytomerNode.truss.floralSites[].*` |
| `ageFracForGravity` | `PhytomerNode.leaf.ageTT` 기반 재계산 |

**OrganState** ([PlantSkeletonGraph.ts:181-194](../../src/plant/skeleton/PlantSkeletonGraph.ts#L181-L194)) — Phase 3 PhytomerNode 이관:

| 필드 | → PhytomerNode 이관 위치 |
|---|---|
| `visibility, growthStage` | `PhytomerNode.status` + `LeafOrganState.stage` |
| `vigor, yellowing, waterStress, diseaseLoad` | `LeafOrganState.senescence.*` + plant-level stress |

**Populator** ([`populateAnchorMorphology.ts`](../../src/plant/skeleton/populator/populateAnchorMorphology.ts)):
- Per-kind populate (leaf / fruit / flower / calyx)
- **★ 한계: NodeState lookup은 main-axis만** (line 81: `state.nodes.find((n) => n.index === nodeIdx)`)
- Side-shoot leaf state 미지원 (line 76–77 명시)

Phase 3에서 populator는 _이중 작업_:
1. `populatePhytomer(graph, plantState)` — NodeState → PhytomerNode 복사 (또는 직접 참조 binding)
2. `populateAnchorTransform(graph, plantBase, plantState)` — anchor.position + anchor.rotation (Quaternion)

**기존 ANCHOR-COMP-01~04 invariant 처분** ([anchor-completeness.spec.ts](../../tests/architecture/anchor-completeness.spec.ts)):
- 01 (line 31): `chain + morphology + state + visualHint` → **PhytomerNode purity로 재해석** (PHYTOMER-COMP-01)
- 02 (line 77): leaf anchor `sizeFactor + leafletCount` → PhytomerNode.leaf 검증 (PHYTOMER-COMP-02)
- 03 (line 116): fruit anchor `fruitGenome` → PhytomerNode.truss.floralSites[].fruitGenome (PHYTOMER-COMP-03)
- 04 (line 160): `graph.cultivarGenomeSnapshot` → 유지 (PHYTOMER-COMP-04)

### 3.3 Skin — 90% 재사용 + 1 violation

**Files**:
- [`src/twin/SkinMeshPlant.ts`](../../src/twin/SkinMeshPlant.ts) — 890 LOC
- [`src/plant/LeafGenerator.ts`](../../src/plant/LeafGenerator.ts) — 418 LOC
- [`src/twin/ShowcasePlant.ts`](../../src/twin/ShowcasePlant.ts) — 515 LOC (legacy parallel)

**SkinMeshPlant 진입** ([SkinMeshPlant.ts:143](../../src/twin/SkinMeshPlant.ts#L143)):
```typescript
createSkinMeshPlant(scene, engine, seed, worldPosition): SkinMeshPlantHandle
```

**Iter 28 fix 유지** ([SkinMeshPlant.ts:773](../../src/twin/SkinMeshPlant.ts#L773)): `m.computeWorldMatrix(true)` — stale matrix 방지.

**Phase 4 위반 시그니처 (4건)**:
1. [`LeafGenerator.createLeafBladeOnlyMesh(name, scene, node, genome, plantAge, rng)`](../../src/plant/LeafGenerator.ts#L187) — 187, **plantAge 인자**
2. [`LeafGenerator.createLeafMeshFromNode(name, scene, node, genome, plantAge, rng)`](../../src/plant/LeafGenerator.ts#L121) — 121, **plantAge 인자**
3. [`SkinMeshPlant.ts:697`](../../src/twin/SkinMeshPlant.ts#L697) — `state.day` → `createLeafBladeOnlyMesh()`로 전달
4. Both call [`getLeafStage(node, plantAge)`](../../src/plant/LeafGenerator.ts#L131) (131, 196)

**Phase 3 SKIN-NO-LEAFBASE-01 위반 (2건)** ([SkinMeshPlant.ts:701-702](../../src/twin/SkinMeshPlant.ts#L701-L702)):
```typescript
const azimuthQ = Quaternion.RotationAxis(Vector3.Up(), leafBase.azimuthRad);    // line 701
const droopQ   = Quaternion.RotationAxis(..., -leafBase.droopRad);              // line 702
```

→ Phase 3 anchor.rotation으로 _대체_, Phase 4에서 leafBase 직접 참조 0건 강제.

**Senescence rendering** — _현재는 OK_ ([SkinMeshPlant.ts:705-706](../../src/twin/SkinMeshPlant.ts#L705-L706)):
```typescript
const yellowing = anchor.state?.yellowing ?? node.yellowing;
const material  = yellowing > 0.4 ? yellowLeafMat : leafMat;
```
yellowing scalar 통과만 — Phase 2A SKIN-SENESCENCE-APPLY-01 정합. 단 Phase 3에서 `anchor.state` 제거 후 `phytomer.leaf.senescence.colorDullness` 직접 참조로 변경 필요.

**Cotyledon spec usage** ([SkinMeshPlant.ts:267, 273-277](../../src/twin/SkinMeshPlant.ts#L267)):
```typescript
const cotyledonSpec = ACTIVE_BOTANICAL.tomato?.cotyledon ?? DEFAULT_COTYLEDON_SPEC;
// ...
applyCotyledonChunk(scene, name, cotSize, cotyledonSpec.widthLengthRatio);
```
Iter 29 v1 P2 정합 — 유지.

**ShowcasePlant** ([ShowcasePlant.ts](../../src/twin/ShowcasePlant.ts)) — 515 LOC legacy parallel:
- Per-axis stem mesh + per-leaf petiole tube (SkinMeshPlant은 unified skin)
- Cotyledon `0.03 * state.cotyledonSize` hardcoded ([ShowcasePlant.ts:220](../../src/twin/ShowcasePlant.ts#L220)) — Phase 2 fix 미적용 (legacy)
- Phase 4 SKIN-LEGACY-01: 9/9 _구조 회귀 0_ 요구 (시각 0% pixel match 아님)

### 3.4 Cultivar Profile — 45%

**File**: [`packages/tomato-engine/src/Cultivar.ts`](../../packages/tomato-engine/src/Cultivar.ts)

**Cultivar interface** ([Cultivar.ts:29-134](../../packages/tomato-engine/src/Cultivar.ts#L29-L134)) — 39 필드, 주요:

| 필드 (기존) | Phase 5 마이그레이션 |
|---|---|
| `phyllochronGDD` (47) | `growthProfile.phyllochronTT` (getter alias) |
| `firstTrussNodeIdx` (71) | `growthProfile.firstTrussNodeIndex` (rename + getter alias) |
| `trussIntervalNodes` (74) | `growthProfile.trussIntervalNodes` (참조만 변경) |
| `sinkStrengthLeaf/Stem/Root` (98–100) | `growthProfile.sourceSinkSensitivity` 단일 또는 nested (Phase 5 결정) |
| `T_base, GDD_to_first_flower, GDD_flower_to_red, GDD_per_truss` (37–43) | growthProfile에 흡수 가능 |
| `leafShape*` (CultivarJson 안) | 유지 (visualProfile 분리 검토) |

**★ `growthProfile` 필드 0건** — Phase 1-Pre 신규 (11개 필드).

**★ `maxLeafletCount` 필드 0건** — Cultivar에 없음. Phase 1-Pre `growthProfile.maxLeafletCount` 신규.

**5 cultivar JSONC** (`packages/tomato-engine/models/cultivars/`):
- `cherry-generic.jsonc`, `round-generic.jsonc`, `beefsteak-generic.jsonc`, `roma-generic.jsonc`, `tomimaru-muchoo.jsonc`
- 모두 `leafShape` provenance bundle 보유 (sourceLevel, confidence, sourceRefs, notes, lastReviewed)
- **`growthProfile` key 0건** — Phase 1-Pre 5건 모두 추가 필요

**generateGenome** ([PlantGenome.ts:77-78](../../packages/tomato-engine/src/PlantGenome.ts#L77)):
```typescript
export function generateGenome(seed: number): PlantGenome   // ★ cultivar param 없음
```
Phase 5 GENOME-CULTIVAR-API-01/02: `generateGenome(seed, { cultivar?, botanical? })` 확장.

### 3.5 Calibration Pack — 0% (greenfield)

**Reference pack v0.1** (이미 존재):
- `growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1/`
- 8 CSV + 2 JSON + 1 manifest
- schemaVersion: `referenceObservationBundle.v0.1`
- 추가: `growth-calibration/reference/tomato/tomimaru-muchoo_22C_reference.json` (derived)

**Phase 6 NEW** (현재 미존재):
- `packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc` ★
- `CalibrationPackSpec` interface + loader + validator
- `assertWithinCalibrationBand` 헬퍼
- `CalibrationWarning` struct

---

## 4. 가장 큰 5개 리팩토링 포인트 (Phase 우선순위)

| # | 포인트 | 영향 file | 현재 상태 | Phase | acceptance |
|---|---|---|---|---|---|
| 1 | **SkeletonNode.phytomer 직접 참조** (anchor 우회 금지) | PlantSkeletonGraph.ts:98-114 (interface 변경) + populator 전면 재구조화 | 미구현 | Phase 3 | SKELETON-PHYTOMER-01 |
| 2 | **OrganAnchor.position + rotation (Quaternion)** — anchor purity 회복 | PlantSkeletonGraph.ts:230-266 (interface 변경) + 새 transform populator | 미구현 (현재 morphology/state 보유) | Phase 3 | SKELETON-ANCHOR-PURE-01 + SKELETON-ANCHOR-TRANSFORM-01 |
| 3 | **`BASE_LEAF_AREA_CM2 = 880` hardcoded 제거** — cultivar.growthProfile.maxLeafAreaCm2로 이관 | GrowthModel.ts:512, 815 (중복 정의) | hardcoded | Phase 1-Pre | PROFILE-PRE-03 |
| 4 | **`node.ageTT` 추가 + senescence TT 변환** — day-based 6개 분기 → TT 기반 | GrowthModel.ts:700, 791, 819, 1011, 1018, 1129 (6 branches) | 전부 day-based | Phase 1 + 2A | GROWTH-CLOCK-01 + LEAF-SENESCENCE-TT-01 |
| 5 | **`LeafGenerator` 시그니처 변경** — `(leafOrganState, anchorTransform, cultivarVisualProfile)` | LeafGenerator.ts:121, 187 (createLeafMeshFromNode, createLeafBladeOnlyMesh) | plantAge 인자 보유 | Phase 4 | SKIN-DATA-DRIVEN-01 |

추가 (보조 6 ~ 9):

| # | 포인트 | 영향 file | Phase |
|---|---|---|---|
| 6 | `currentTT` PlantState 추가 (canonical) | GrowthModel.ts:137-164 | Phase 1 GROWTH-CLOCK-01 |
| 7 | GrowthModel 함수 boundary 분리 (ThermalTime / Phytomer / Internode / Leaf / Senescence / SourceSink / TrussRule) | GrowthModel.ts 전체 | Phase 1 GROWTH-MODULE-BOUNDARY-01 |
| 8 | Skin: leafBase.azimuthRad/droopRad 직접 참조 제거 | SkinMeshPlant.ts:701, 702 | Phase 3 SKIN-NO-LEAFBASE-01 (anchor.rotation으로 대체) |
| 9 | Skin: `getLeafStage` 호출 제거 | LeafGenerator.ts:131, 196 | Phase 4 SKIN-NO-GROWTH-LOGIC-01 |

---

## 5. Iter 26 자산 활용도 매트릭스

| Iter 26 asset | 위치 | Iter 29 재사용도 | 변경 |
|---|---|---|---|
| PlantSkeletonGraph (SkeletonNode 구조) | PlantSkeletonGraph.ts:98-114 | **95%** | 새 필드 1개 추가 (`phytomer`) |
| OrganAnchor (chain, visualHint) | PlantSkeletonGraph.ts:230-266 | **70%** | morphology/state 제거 + position/rotation 추가 |
| `meshAnchorNodeId` (Iter 27 PR) | PlantSkeletonGraph.ts:257 | **100%** | 그대로 유지 |
| Anchor visualHint (semantic overlay) | PlantSkeletonGraph.ts | **100%** | 그대로 유지 |
| edge.renderPolicy (PR 2-3) | edge-policy-completeness.spec.ts | **100%** | 그대로 유지 |
| populator (NodeState → AnchorMorphology) | populateAnchorMorphology.ts | **40%** | 책임 _이중화_: PhytomerNode populate + AnchorTransform populate (morphology 제거) |
| ANCHOR-COMP-01~04 invariants | anchor-completeness.spec.ts:31, 77, 116, 160 | **재해석 100%** | PHYTOMER-COMP-01~04로 _재명명_ + PhytomerNode 기반 검증 |
| Coordinate contracts (INV-01~05) | coordinate-contracts.spec.ts | **100%** | 그대로 유지 |
| Mesh anchor contracts (ANCHOR-01~04) | mesh-anchor-contracts.spec.ts | **100%** | 그대로 유지 |
| `normalizeLeafMeshVertices` (Iter 24 acfad71) | `src/plant/anchors/leafAnchor.ts` | **100%** | 그대로 유지 |
| ShowcasePlant (legacy parallel) | ShowcasePlant.ts | **100% (legacy)** | Phase 4 SKIN-LEGACY-01 — 구조 회귀 0 검증 |
| SkinMeshPlant (PR 5-1 plantBase 제거) | SkinMeshPlant.ts | **80%** | leafBase 직접 참조 제거 + plantAge param 제거 |
| LeafGenerator | LeafGenerator.ts | **70%** | 시그니처 전면 변경 (LeafOrganState 입력) |
| Cotyledon spec consumer (Iter 29 v1 P2) | SkinMeshPlant.ts:267, 273 | **100%** | 그대로 유지 |
| computeWorldMatrix(true) (Iter 28 fix) | SkinMeshPlant.ts:773 | **100%** | 그대로 유지 |

**평균 재사용도: 약 88%** (가중치 미적용 단순 평균). _재작성 없음, 확장/재배치 위주_.

---

## 6. Phase별 invariant 매핑 요약 (자가검증 v3.3 §16.4.1)

| Phase | 신규 invariant 개수 | Spec 파일 (NEW) |
|---|---|---|
| Phase 1-Pre | 5 (PROFILE-PRE-01~05) | `tests/architecture/cultivar-growth-profile.spec.ts` |
| Phase 1 | 6 (GROWTH-CLOCK-01~02, NODE-PHYLLOCHRON-01, INTERNODE-STATE-01, DAY-LEGACY-01, GROWTH-MODULE-BOUNDARY-01) | `tests/architecture/phytomer-growth-clock.spec.ts` |
| Phase 2A | 9 (LEAF-AGE-TT-01, LEAF-TARGET-01, LEAF-EXPANSION-01, LEAF-STAGE-01, LEAF-POSTURE-01, LEAF-SENESCENCE-TT-01, LEAF-SENESCENCE-PLANTBASE-01, DAY-LEGACY-LEAF-01, PHYTOMER-ORGAN-SHELL-01) | `tests/architecture/leaf-organ-state.spec.ts` |
| Phase 2B | 3 (LEAF-SOURCESINK-PROXY-01~03) | `tests/architecture/source-sink-proxy.spec.ts` |
| Phase 3 | 10 (SKELETON-PHYTOMER-01, SKELETON-ANCHOR-PURE-01, SKELETON-ANCHOR-TRANSFORM-01, SKELETON-ANCHOR-POSTURE-01, SKELETON-NO-GROWTH-CALC-01, SKIN-NO-LEAFBASE-01, PHYTOMER-COMP-01~04) | `tests/architecture/skeleton-phytomer-binding.spec.ts` |
| Phase 4 | 7 (SKIN-DATA-DRIVEN-01~03, SKIN-NO-GROWTH-LOGIC-01, SKIN-LEAF-01, SKIN-LEGACY-01, SKIN-SENESCENCE-APPLY-01) | `tests/architecture/skin-data-driven.spec.ts` |
| Phase 5 | 9 (CULTIVAR-GROWTH-01, CULTIVAR-MAXLEAFLET-01, CULTIVAR-LEGACY-01, GENOME-CULTIVAR-API-01~02, VARIANCE-01, VARIANCE-CLAMP-01, PROVENANCE-01, LEGACY-ALIAS-STRICT-01) | `tests/architecture/cultivar-integration.spec.ts` |
| Phase 6 | 10 (CALIBRATION-01~04, CALIBRATION-WARNING-01, LEGACY-ALIAS-REMOVE-01~03, DOCS-01, DEFORMATION-FUTURE-01) | `tests/architecture/calibration-pack.spec.ts` |

**총 신규 invariant: 59건** + 기존 30 = **89 invariant**.

진단 dump spec (zz-*) 6건 추가 — 사용자 wake 없이 자동 catch (§16.4.3).

---

## 7. Gate A 진입 체크리스트

- [x] Iter 29 v1 commit 3건 처분 결정 (§2) — 모두 _보존_ + 재배치
- [x] 5개 핵심 리팩토링 포인트 확정 (§4)
- [x] PlantBase / Skeleton / Skin / Cultivar / Calibration 책임 분리 도식 (§1.2)
- [x] Iter 26 자산 활용도 매트릭스 (§5)
- [x] Phase별 invariant 매핑 (§6, §16.4.1)
- [ ] 사용자 Gate A 승인

Gate A 승인 후 → **Phase 1-Pre** (CultivarGrowthProfile schema + BASE_LEAF_AREA / maxLeafletCount hardcoded 제거).

---

## Appendix A — 파일 라인 빠른 참조

| 작업 | file:line |
|---|---|
| NodeState → PhytomerNode rename | [GrowthModel.ts:93-135](../../packages/tomato-engine/src/GrowthModel.ts#L93-L135) |
| PlantState.currentTT 추가 | [GrowthModel.ts:137-164](../../packages/tomato-engine/src/GrowthModel.ts#L137-L164) |
| BASE_LEAF_AREA_CM2 제거 (2건) | [GrowthModel.ts:512](../../packages/tomato-engine/src/GrowthModel.ts#L512), [GrowthModel.ts:815](../../packages/tomato-engine/src/GrowthModel.ts#L815) |
| stemVigorFactor → plantVigorFactor | [GrowthModel.ts:806-810](../../packages/tomato-engine/src/GrowthModel.ts#L806-L810) |
| day-based 분기 6건 | [GrowthModel.ts:700, 791, 819, 1011, 1018, 1129](../../packages/tomato-engine/src/GrowthModel.ts#L700) |
| leafletCountFromMaturity (max 9 hardcoded) | [LeafStage.ts:63-73](../../packages/tomato-engine/src/LeafStage.ts#L63-L73) |
| Cultivar interface (39 fields) | [Cultivar.ts:29-134](../../packages/tomato-engine/src/Cultivar.ts#L29-L134) |
| CotyledonSpec + DEFAULT | [BotanicalSpec.ts:252-286](../../packages/tomato-engine/src/BotanicalSpec.ts#L252-L286) |
| cotSize 적용 | [PlantBase.ts:849](../../src/plant/PlantBase.ts#L849) |
| SkeletonNode interface | [PlantSkeletonGraph.ts:98-114](../../src/plant/skeleton/PlantSkeletonGraph.ts#L98-L114) |
| OrganAnchor interface | [PlantSkeletonGraph.ts:230-266](../../src/plant/skeleton/PlantSkeletonGraph.ts#L230-L266) |
| AnchorMorphologyHint | [PlantSkeletonGraph.ts:149-172](../../src/plant/skeleton/PlantSkeletonGraph.ts#L149-L172) |
| OrganState | [PlantSkeletonGraph.ts:181-194](../../src/plant/skeleton/PlantSkeletonGraph.ts#L181-L194) |
| populateAnchorMorphology | [populateAnchorMorphology.ts](../../src/plant/skeleton/populator/populateAnchorMorphology.ts) |
| ANCHOR-COMP-01~04 → PHYTOMER-COMP-01~04 | [anchor-completeness.spec.ts:31, 77, 116, 160](../../tests/architecture/anchor-completeness.spec.ts#L31) |
| SkinMeshPlant 진입 | [SkinMeshPlant.ts:143](../../src/twin/SkinMeshPlant.ts#L143) |
| Skin leafBase 직접 참조 (Phase 3 제거) | [SkinMeshPlant.ts:701-702](../../src/twin/SkinMeshPlant.ts#L701-L702) |
| computeWorldMatrix(true) (Iter 28 유지) | [SkinMeshPlant.ts:773](../../src/twin/SkinMeshPlant.ts#L773) |
| Cotyledon spec consumer (Iter 29 v1 P2) | [SkinMeshPlant.ts:267, 273-277](../../src/twin/SkinMeshPlant.ts#L267) |
| createLeafBladeOnlyMesh signature | [LeafGenerator.ts:187-192](../../src/plant/LeafGenerator.ts#L187-L192) |
| getLeafStage call (Phase 4 제거) | [LeafGenerator.ts:131, 196](../../src/plant/LeafGenerator.ts#L131) |
| generateGenome (Phase 5 확장) | [PlantGenome.ts:77](../../packages/tomato-engine/src/PlantGenome.ts#L77) |
| Cultivar JSONC 5건 | `packages/tomato-engine/models/cultivars/{cherry,round,beefsteak,roma}-generic.jsonc`, `tomimaru-muchoo.jsonc` |
| Reference pack v0.1 | `growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1/` |
| tomato-growth-targets.jsonc | (NEW — Phase 6) `packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc` |
