# Leaflet Layout — Layout-first SSOT (Iter 39 Phase I)

> **사용자 핵심 강제**: "모든 leaflet의 _최종_ U/side/sf를 _먼저_ 확정 →
> attachUs는 layout 결과에서. nearest fallback 금지."

`addLeafletNodesForLeaf` 내부 layout-first 모델 — `buildTomatoSkeletonGraph.ts`.

## 흐름

```
1. computeLeafletLayout(bladeRef, profile, leafNodeIdx)
   ├─ pushPrimaryLayoutItems   — primaryUs(pairCount template) × side(±) × stagger ±0.0125
   ├─ pushIntercalaryAndTerminalLayoutItems
   │  ├─ computeIntercalaryUs  — 3-tier slot (midpoints + edge + 1/3-2/3 subdiv)
   │  └─ terminal              — U = 1.0 (rachis tip)
   └─ uniqueAttachUs           — items rachisU의 uKey unique sorted
2. attachUs ← layout.uniqueAttachUs
3. rachis sub-edges + attach nodes 생성 (uKey 기반 Map<string, ...>)
4. materializeLeafletSpec(item)  ─ 각 layout item을 leaflet node + edge로 구체화
```

## Primary Template (pair count별, J0-7B 적용)

| pairCount | primaryUs (J0-7B) | J0-4 | 비고 |
|---|---|---|---|
| 1 | `[0.50]` | `[0.52]` | single |
| 2 | `[0.34, 0.68]` | `[0.36, 0.68]` | single gap (CV 정의 불가, exempt) |
| 3 | `[0.27, 0.48, 0.74]` | `[0.28, 0.52, 0.74]` | gap 0.21/0.26, CV 0.108 |
| 4 | `[0.22, 0.41, 0.63, 0.79]` | `[0.22, 0.40, 0.60, 0.78]` | gap 0.19/0.22/0.16, CV 0.137 |

`getPrimaryUsForPairCount(n)` — clamp(1, 4). pairCount 외 값은 round 후 clamp.
좌측 primary는 `baseU - 0.020`, 우측은 `baseU + 0.020`.

**TERMINAL-CLEARANCE-01**: 4쌍 lastPrimaryU = 0.79 + 0.020 = 0.81 ≤ 0.82,
terminal 1.0 - 0.81 = 0.19 gap ≥ 0.15 ✓.

**ATTACH-SPACING-CV-01** (J0-7B): pair ≥ 3 잎에서 쌍 단위 baseU 간격 CV
∈ [0.05, 0.30]. 등간격 grammar 부재 catch.

## Intercalary Slot Tiers

```
tier1: primary 사이 midpoints       — 가장 자연스러운 slot
tier2: edge slots (start, end)      — primary 양 끝 외부
tier3: 각 interval의 1/3, 2/3       — count > 사용 가능 slot 시 보충
```

순서대로 결합 후 `slice(0, count)`. 부족 시 silent slice (호출 측에서 graph.diagnostics
로 기록 가능). 균등 분포(0.25 + i/count × 0.5)는 _truss 인상_의 원인 → 폐기.

## Position별 Branch Direction (weight model)

`POSITION_DIR_WEIGHT` — angle-based(sinA/cosA) 폐기, 고정 weight로:

| position | lateral | forward |
|---|---|---|
| primary | 0.72 | 0.28 |
| intercalary | 0.62 | 0.38 |
| secondary | 0.55 | 0.45 |
| terminal | 0.00 | 1.00 |

`computeBranchDir(position, side, lateralDir, src, rachisU)`:
- `forwardDir = src.tangentAt?.(rachisU) ?? src.rachisDir`
- `RachisDirSource.tangentAt(u)`는 _현재 fallback only_. I 이후 phase에서 `RachisChain`
  도입 시 곡선 rachis 한 줄 추가로 대응.

좌우 모두 `dot(branchDir, forwardDir) > 0` 보장 (rachis 진행 방향 일관성).

## Rachis Curvature (J0-7A 신규 — single arc)

`rachisPointAt(u)` 산식 (직선 + leaf-level macro arc + side bend):
```
forward  = rachisDir × u × rachisLen
droop    = WORLD_DOWN × rachisLen × 0.025 × 4u(1-u)        (hat, peak u=0.5)
sideBend = lateralDir × rachisLen × 0.015 × sin(πu) × leafSideBias
```

- `leafSideBias`: `((axisIdx × 1009 + leafNodeIdx × 7919) % 100) / 50 - 1` → [-1, +1].
  deterministic (LEAFLET-DETERMINISM-01 보존).
- droop peak = 2.5% × rachisLen (30cm rachis → 7.5mm sag, 100cm → 25mm).
- side peak = 1.5% × rachisLen.
- segment 누적 X — _한 번_만 적용.

**RACHIS-CURVATURE-PRESENCE-01**: midpoint sag / rachisLen ≥ 0.5% (산식 design
2.5% 대비 안전 floor).

## Primary Direction per-Pair-Index (J0-7C 신규 — fan progression)

| pairIndex | lateral | forward | 의미 |
|---|---|---|---|
| 0 (base) | 0.76 | 0.24 | 더 옆으로 (base 쌍) |
| 1 | 0.70 | 0.30 | |
| 2 | 0.73 | 0.27 | rhythm |
| 3 (terminal 쪽) | 0.68 | 0.32 | 더 forward (부채꼴) |

- 좌우 pair는 _같은_ weight 공유. side 차이는 sign으로만 분기.
- intercalary/secondary/terminal은 기존 POSITION_DIR_WEIGHT 유지.
- pair index > 3은 last entry로 clamp.

**BRANCH-DIR-VARIATION-01** (pair ≥ 2): pair 단위 forward 평균 variance > 0.0001.

## Position별 Branch Length (J0-7D 재채택)

`computeBranchLength(position, sf, rachisLen)` — 위계 시각 구분 + leaflet
응집.

| position | factor (J0-7D) | J0-3B | I2 |
|---|---|---|---|
| primary | `sf × rachisLen × 0.10` | × 0.08 | × 0.22 |
| intercalary | `sf × rachisLen × 0.05` | × 0.04 | × 0.14 |
| secondary | `sf × rachisLen × 0.10` | × 0.10 (disabled) | × 0.10 |
| terminal | `0` (rachis tip 자체) | 0 | 0 |

채택 사유 (3-way metrics 비교):

| | 3A 0.12 | 3B 0.08 | **3D 0.10** | 평가 |
|---|---|---|---|---|
| primPetio avg | 0.084 | 0.056 | 0.083 | — |
| primPetio max | 0.120 | 0.080 | 0.112 | 3D 12% 위반이나 metric 기반 재정의 |
| hierarchy prim/inter | 1.76 | 1.76 | **2.82** | 3D _60% 강화_ ★ |
| 시각 인상 (참고) | 자연 | 구슬 꿰기 | mid | — |

→ **J0-7D 3D 채택**. 시각 _구슬 꿰기_의 직접 원인은 hierarchy 약화였고,
3D가 60% 강화. metric 근거 (active 원칙 #21).

**PETIOLULE-LEN-01 _재정의_** (J0-7D, active 원칙 #22):
- primary:     avg ≤ 0.10 AND max ≤ 0.12 AND min ≥ 0.04 (floor 신규)
- intercalary: avg ≤ 0.06 AND max ≤ 0.07 AND min ≥ 0.015 (산식 lower bound)

max 0.12 = 산식 `0.10 × max sf 1.0` (산식 자체의 upper bound).
intercalary min 0.015 = `factor 0.05 × min sf 0.30` (산식 lower bound).
ad-hoc raise X — 모두 산식에서 도출.

## `uKey(u): string` Rounding Convention

```ts
uKey(u) = (Math.round(u * 1000) / 1000).toFixed(3)
```

- 모든 attach U map key는 _이 함수_ 통해 통일.
- `Map<string, string>` 사용 → floating-point hash collision 0.
- attachNodeId suffix도 `uKey(u)` (이전 `toFixed(2)`는 layout-first의 stagger와
  collision 발생).

## `leftRightImbalance` Convention

```
leftRightImbalance > 0  →  right side larger  (sfR > sfL)
leftRightImbalance < 0  →  left  side larger  (sfL > sfR)
```

clamp ±0.15. _skeleton U 영향 0_ — sizeFactor만 변경 (pose/shape layer 영향
없음). `profile.spacingBias`는 skeleton U에 _절대_ 적용 금지 (pose layer 전용).

## `getExactAttachNodeId` Strict Lookup

```ts
function getExactAttachNodeId(u: number): string {
  const key = uKey(u);
  const id = attachNodeByU.get(key);
  if (!id) throw new Error(`LEAFLET-ATTACH-COHERENCE violated: no attach node for u=${key}`);
  return id;
}
```

nearest fallback _금지_. layout-first가 `attachUs ⊇ 모든 leaflet U`를 보장하므로
miss는 _개발 버그_. dev/test에서 즉시 catch (production은 graph.diagnostics 경유).

## Invariants

- **LEAFLET-ATTACH-COHERENCE-01** (primary + intercalary):
  - `leafletRef.attachNodeId`가 `rachis-attach-node` 가리킴
  - leaflet edge(`petiolule`/`lateral-vein`)의 `startNodeId == attachNodeId`
  - graph-native (재계산 0, SKELETON-EDGE-01 + NODE-EDGE-INCIDENCE-01 합성)
- **SECONDARY-ATTACH-01** (I3 disable 상태 — _future_):
  - `secondary.attachNodeId == parentPrimary.lid`
  - `secondary edge.startNodeId == parentPrimary.lid`
  - `secondary edge.parentEdgeId == parentPrimary.edgeId`
  - I3 복원 시 활성.

## Secondary Disable (I3)

```ts
const ENABLE_SECONDARY_LEAFLETS = false;
```

`addSubLeaflet` 함수 자체는 보존 — flag만 false. I5 acceptance 후 conditional
복원:

```ts
const enableSecondary =
  bladeRef.agePreset === 'complex' && maturity > 0.75;
```

## SkeletonOverlay 색상 (I4)

| node | color | size |
|---|---|---|
| leaflet terminal | `#7bff3a` (bright green) | 4.0mm ★ 강조 |
| leaflet primary | `#3aaa3a` (medium green) | 2.5mm |
| leaflet intercalary | `#cfd83a` (yellow-green) | 1.8mm |
| leaflet secondary | `#5ac9b5` (teal) | 1.5mm |
| rachis-attach-node | `#236b23` (dark green) | tiny |

flower/fruit는 `#FF6347/#FF3A3A` (빨강/주황) — leaflet anchor에 _빨간색 금지_.

## 참고

- `docs/architecture/SKELETON_SSOT.md` — 절대 원칙 + Layout-first 원칙
- `docs/architecture/EDGE_RENDER_POLICY.md` — skin 시각 truncation
- `tests/architecture/leaflet-attach-coherence.spec.ts` — LEAFLET-ATTACH-COHERENCE-01

## History

Phase F/G/H가 SSOT integrity (edge.bonePath endpoint == node.pos)를 회복했지만
`addLeafletNodesForLeaf` 내부 `attachUs`가 `primaryUs` 기준으로 _먼저_ 생성된
뒤 실제 우측 primary는 `uR = primaryUs[i] + 0.04`로 attach되면서
`findAttachNodeForU` nearest fallback이 작동 → `rachisPos`와 `attachNode.pos`
불일치 → skeleton이 _truss/fishbone_ 인상으로 읽힘. Phase I0가 layout-first
구조 전환으로 근본 해결 + I1-I5가 weight branch direction / slot intercalary /
position branch length / secondary disable / overlay 색 분리 / 신규 invariant
로 완성.
