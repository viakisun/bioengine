# PhytomerNode.growthContext + Axis Capacity Model

> Iter 30 Phase 1-Pre + Phase 1 산출물.
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §2-§3

---

## 개요

PhytomerNode가 자기 axis context를 _직접 보유_하도록 한 구조. plant-level
scalar로는 axis 불균형 못 잡음 — 사용자 review에서 식별된 R3 (측지 약함).

```
NodeGrowthContext (5 fields)
  axisId               'main' | 'side:N'
  localStemRadiusMm    축-local stem radius (mm)
  axisCapacityFactor   0.35-1.0 (Phase 1 계산)
  isSideShoot          true / false
  parentVigorFactor    측지: parent main vigor; main: 1.0
```

## API

### NodeGrowthContext.ts

```ts
type AxisId = 'main' | `side:${number}`;

interface NodeGrowthContext {
  axisId: AxisId;
  localStemRadiusMm: number;
  axisCapacityFactor: number;
  isSideShoot: boolean;
  parentVigorFactor: number;
}

DEFAULT_NODE_GROWTH_CONTEXT  // backward compat fallback

makeMainAxisGrowthContext({localStemRadiusMm, axisCapacityFactor?})
makeSideShootGrowthContext({sideShootIndex, localStemRadiusMm, axisCapacityFactor?, parentVigorFactor?})

assertGrowthContextValid(ctx, contextHint?)  // dev-only
```

### AxisCapacityModel.ts

```ts
computeAxisStructuralCapacity({meanStemRadiusMm, axisLengthCm, structuralCapacityCoeff?})
  → R² × L × coeff  (proxy, NOT physical load-bearing)

computeAxisCapacityFactor({axisStructuralCapacity, axisOrganDemand})
  → clamp(capacity / demand, 0.35, 1.0)

computeAxisOrganDemand({leafPotentialAreasCm2})  // sum of leaf potentials
computeAxisMeanStemRadius({nodeRadiiMm})          // mean
computeAxisLengthCm({nodeHeightsCm})              // max - min

assertAxisCapacityFactorValid(factor, contextHint?)
```

## NodeState에 wire-in

```ts
// GrowthModel.ts
interface NodeState {
  // ... 기존 필드
  growthContext?: NodeGrowthContext;  // Iter 30 Phase 1-Pre (optional, backward compat)
}

// Main-axis push:
node.growthContext = makeMainAxisGrowthContext({
  localStemRadiusMm: 10,
  axisCapacityFactor: 1.0,  // Pass 3 후 axis 계산값으로 갱신
});

// Side-shoot push:
node.growthContext = makeSideShootGrowthContext({
  sideShootIndex,   // computePlantState의 sideShootOrdinal
  localStemRadiusMm: stemRadiusMm,
  axisCapacityFactor: 1.0,
  parentVigorFactor: 1.0,  // Pass 후 parent vigor 정밀화
});
```

## Pass 3 후 axisCapacityFactor 갱신

```ts
// Main axis
for axis in [main]:
  capacity = R²·L·coeff
  demand = Σ leaf.potentialAreaCm2
  factor = clamp(capacity / demand, 0.35, 1.0)
  for node in axis:
    node.growthContext.axisCapacityFactor = factor
    leaf.allocation = composeLeafAllocation(... axisCapacityFactor: factor)
    leaf.targetAreaCm2 = leaf.potentialAreaCm2 × leaf.allocation.finalAllocationFactor

// Side-shoot axes (post-populateSideShootChain)
for axis in allAxes if order > 0:
  parent = mainAxis.nodes[axis.parentNodeIdx]
  parentVigor = clamp(sqrt(parent.heightCm / 50), 0.5, 1.5)
  apexRelease = computeApexDominanceReleaseFactor({parentNodeFracFromApex})
  sideShootAlloc = computeSideShootAllocationFactor({parentVigor, cultivar.sideShootPotential, apexRelease, lightFactor})
  axisSourceProxy = computeAxisSourceSinkProxyV1({... parentVigorFactor: parentVigor, sourceSinkSensitivity})
  capacity = R²·L·coeff
  demand = Σ leaf.potentialAreaCm2
  factor = clamp(capacity / demand, 0.35, 1.0)
  for node in axis:
    node.growthContext.{axisCapacityFactor, parentVigorFactor} = factor, parentVigor
    leaf.allocation = composeLeafAllocation(... axisSourceFactor: axisSourceProxy, axisCapacityFactor: factor, sideShootAllocationFactor: sideShootAlloc)
    leaf.targetAreaCm2 = leaf.potentialAreaCm2 × leaf.allocation.finalAllocationFactor
```

## "이 node가 이 잎을 키울 수 있는가" 검증

각 leaf는 trace 가능:
```
leaf.allocation
  ├ plantSourceFactor      (Iter 29 Phase 2B 유지)
  ├ axisSourceFactor       (Phase 3 신규)
  ├ axisCapacityFactor     (Phase 1 신규)
  ├ sideShootAllocationFactor (Phase 4 정밀화)
  ├ stressFactor           (Iter 29)
  ├ finalAllocationFactor  (product, clamp [0.15, 1.5])
  └ limitationReason       (가장 낮은 factor → 'plant_source_limited' | ...)
```

D=30 leaf의 `allocation.limitationReason`이 `'axis_source_limited'`이면
axis가 부족해서 작게 자란 것 (수식 trace 가능).

## Calibration band (Phase 6)

`tomato-growth-targets.jsonc`:
```jsonc
"axis": {
  "mainAxisCapacityFactor": { day: [{d: 45, min: 0.80, max: 1.0}, ...] },
  "sideShootAxisCapacityFactor": { day: [{d: 45, min: 0.50, max: 0.85}, ...] }
}
```

Main capacity 1.0 근처, side-shoot capacity 0.5-0.85 typical (얇은 stem).

## Phase 7+ 확장 candidate

- `nodeVigorFactor` (per-node, Phase 3 axisSource detail)
- `reproductiveCompetitionFactor` (Phase 4 truss vs leaf)
- `parentAxisId / parentNodeIndex` (chain traversal)
- `axisLengthCm / basalStemRadiusMm` (현재 함수 inline 계산)
