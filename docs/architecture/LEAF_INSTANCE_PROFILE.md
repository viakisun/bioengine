# LeafInstanceProfile — Per-Compound-Leaf Variation (Iter 39 Phase F4)

> Single source of truth for **잎 1장당 macro-level traits** — leaflet 단위
> 미세 jitter와 _분리_되어 같은 잎 내부의 일관성 + 잎 간의 자연 variation을
> 동시에 보장.

## 배경

Iter 39 Phase B에서 per-leaflet plane mesh가 graph node 위치에 정확히 부착됐지만,
사용자 비판 (plan v1 review): "leaflet 단위 jitter만 있고 _한 잎 전체 성격_이
부족 → 각 잎이 같은 템플릿 복사본처럼 보임".

해결: **2-tier variation system**:
1. **leaf-level** (LeafInstanceProfile) — 잎 1장당 1번 산출 → 같은 잎 내부의
   leaflet들이 _공유_하는 macro traits (asymmetry, droop, openness, spacing).
2. **leaflet-level** (per-leaflet jitter) — leaflet 1장당 1번 — _독립적_ shape
   variation (aspectJitter / sharpnessJitter ±10%).

## API

`src/scene/leaf-engine/leafInstanceProfile.ts:`

```ts
export interface LeafInstanceProfile {
  rachisCurvature:     number;  // ±0.15 — rachis 휘어짐
  leafDroopDeg:        number;  // -10° ~ +30° — maturity 의존
  leftRightImbalance:  number;  // ±0.20 — 좌우 leaflet 크기/배치 불균형
  spacingBias:         number;  // ±0.05 — primary 간격 bias (rachisU)
  opennessFactor:      number;  // 0.2 ~ 1.0 — 펼쳐짐 정도
  overallTwist:        number;  // ±0.10 rad — 잎 전체 회전
}

export function computeLeafInstanceProfile(
  leafNodeIdx: number,
  maturity: number,           // expansionProgress 0~1
  nodePositionT: number,      // 줄기 위치 0 (base) ~ 1 (apex)
  globalSeed: number,         // plant seed
): LeafInstanceProfile;
```

## 산식 (deterministic)

```
seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0
h(i) = ((seed × (i × 7919 + 1) + 49297) % 1000) / 1000     // [0, 1)
signed(i) = h(i) * 2 - 1                                    // [-1, +1)

rachisCurvature    = signed(1) × 0.15
leafDroopDeg       = lerp(-10°, +30°, maturity) + signed(2) × 8°
leftRightImbalance = signed(3) × 0.20 × (nodePositionT > 0.85 ? 1.3 : 1.0)
spacingBias        = signed(4) × 0.05
opennessBase       = lerp(0.2, 1.0, smoothstep(0.15, 0.85, maturity))
opennessFactor     = clamp(opennessBase + signed(5) × 0.1, 0.15, 1.05)
overallTwist       = signed(6) × 0.10  // rad
```

## 적용 지점

### 1. `addLeafletNodesForLeaf` (`buildTomatoSkeletonGraph.ts`)

Primary pair 루프에서 `+0.02` ladder mirror _대신_:

```ts
sfL = baseSf × (1 - profile.leftRightImbalance × 0.5)
sfR = baseSf × (1 + profile.leftRightImbalance × 0.5)
uL  = primaryUs[i]        + profile.spacingBias + jitterL  (±0.025)
uR  = primaryUs[i] + 0.04 + profile.spacingBias + jitterR
```

→ 좌우가 _다른_ rachisU + _다른_ sf. ladder-like symmetric 해소.

### 2. `buildLeafletMeshes` (`buildLeafletMeshes.ts`) — Phase F5 maturity pose

leafProfile.opennessFactor는 _maturity envelope_ (smoothstep 0.15→0.85)와 결합되어
per-leaflet pose 진폭 결정:

```ts
pitchRad = (foldDroopDeg × π/180 + pitchNoise) × opennessFactor
rollRad  = rollNoise  × opennessFactor
twistRad = twistNoise × opennessFactor
```

young leaf (maturity < 0.3): opennessFactor ≈ 0.2 → 모든 pose ×0.2 (접힘).
mature leaf (maturity > 0.8): opennessFactor ≈ 1.0 → 자연 진폭 (펼쳐짐).

## Deterministic 보장

- 같은 plant seed → 같은 graph node → 같은 (leafNodeIdx, nodePositionT) → 같은 profile.
- byte-identical 재현 — re-render 시 잎 모양 변화 0.
- 적용 위치 (skeleton/buildTomatoSkeletonGraph) 와 사용 (rendering) 둘 다
  deterministic seed 동일.

## 비-목표

- ❌ Per-frame variation (animation): profile은 graph build 시점에 고정.
- ❌ Cultivar-specific: 모든 cultivar가 같은 산식 (생물학적 baseline). 미세 차이는
  agePreset / cultivar shape override가 별도로 담당.
- ❌ User-tunable: skeleton 구조 결정성 보장. UI tuning은 cultivar growthProfile
  편집을 통해.

## History

- Iter 39 Phase F4 (commit 5d3d070): 신규 도입.
- v1 plan: per-leaflet jitter만 — _복사본 인상_ 결함.
- v2 plan: leaf-level + leaflet-level 분리 (사용자 비판 반영).

## 참조

- `tests/architecture/mesh-anchor-contracts.spec.ts:ANCHOR-05` — leaflet
  mesh.position == graph node.pos.
- `docs/architecture/MESH_ANCHORS.md` §2 — per-leaflet mesh contract.
