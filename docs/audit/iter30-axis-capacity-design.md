# Iter 30 — Axis Capacity Model Design Audit

> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §3
> 작성: 2026-05-30 (Iter 30 Phase 7 docs)

---

## 결정 사항

**Axis structural capacity는 _proxy_, NOT physical load-bearing model.**

수식:
```
axisStructuralCapacity = meanStemRadiusMm² × axisLengthCm × structuralCapacityCoeff
axisOrganDemand = Σ leaf.potentialAreaCm2
axisCapacityFactor = clamp(capacity / demand, 0.35, 1.0)
```

## 왜 R²×L proxy인가 (R⁴ Euler-Bernoulli 아님)

**옵션 비교**:

| 모델 | 산식 | 장단 |
|---|---|---|
| 진짜 bending stiffness | EI = E × π R⁴ / 4 | 정확. 단, E(elastic modulus) 식물 종별 측정값 필요. 본 작업 scope 넘음 |
| R²×L proxy (선택) | radius² × length × coeff | unitless. 'capacity vs demand' ratio만 필요. cultivar coeff로 calibrate |
| R³ 중간 | radius³ × length | sublinear bending과 mass support 중간. literature 근거 없음 |
| 단일 R | radius × length | 너무 약함. 측지 차이 안 보임 |

**판단**: R²×L은 _transport area_ + _길이 비례 부하_ 의 직관 모델. 결과를 _ratio_ 로
사용하므로 unit 의미 없음 — `structuralCapacityCoeff` (cultivar) 가 absolute scale을
calibrate.

**의무 표기**: `computeAxisStructuralCapacity` JSDoc에 "proxy, NOT physical
load-bearing model" 명시 (Plan AXIS-CAPACITY-PROXY-LABEL-01). Iter 23~24 Stem PR
1의 정직 표기 패턴과 동일.

## clamp 범위 [0.35, 1.0] 근거

- **min 0.35**: capacity 매우 부족해도 leaf가 _완전히 멈추진_ 않음. 노화 가속 가정.
- **max 1.0**: capacity 여유 있어도 _과대 성장 X_. cultivar.maxLeafAreaCm2가 진짜 상한.

비교:
- `plantSourceFactor` (Iter 29 P2B): clamp(0.65, 1.15) — supply 여유 시 leaf overshoot 허용
- `axisCapacityFactor`: clamp(0.35, 1.0) — supply가 capacity 초과 못 함

이 차이는 _capacity = 구조적 상한, supply = 일시적 변동_ 라는 의미 구분.

## demand 정의 — potentialAreaCm2 합

- _현재_ areaCm2 X (recursive 됨 — demand가 result에 영향, result가 demand에 영향)
- `cultivar.maxLeafAreaCm2 × position × vigor` 만으로 _이상적_ demand 계산
- senescence 제외 (생장기 정점 capacity가 검증 대상)

## Side-shoot 별도 적용

Phase 4 `computeSideShootAllocationFactor` 와 _분리_:
- `axisCapacityFactor`: 측지 _자기 stem_ 의 구조 한계
- `sideShootAllocationFactor`: parent main-axis의 _vigor 양보_

둘 모두 leaf.allocation product에 곱해짐 → 측지는 _이중 제약_.

```
finalAllocationFactor =
  plantSourceFactor          (Iter 29)
  × axisCapacityFactor       (Phase 1)
  × axisSourceFactor         (Phase 3)
  × sideShootAllocationFactor (Phase 4, main = 1.0)
  × stressFactor             (Iter 29)
```

## Pass 순서

```
Pass 1: phytomer count + initiationTT (cultivar phyllochron)
Pass 2: ageTT + senescence + leafExpansion
Pass 3:
  3a. Main-axis leaf 1차 — placeholder allocation factor = 1.0
  3b. Side-shoot chain populate
  3c. Axis 통계 — mean stem radius / length / Σ potential
  3d. computeAxisStructuralCapacity + computeAxisCapacityFactor
  3e. Re-compose leaf.allocation per node (실측 axisCapacityFactor + axisSourceFactor)
  3f. leaf.targetAreaCm2 갱신 = potentialAreaCm2 × finalAllocationFactor
  3g. leaf.currentAreaCm2 = targetAreaCm2 × leafExpansion
```

3a → 3e는 _두 번 계산_ — 1차 result로 axis 통계, 2차로 정밀 allocation. 약간 비효율이지만
순환 의존 해소를 위한 일반적 fixed-point 패턴.

## 미래 확장 (Phase 7+, 본 작업 외)

- **Per-node capacity**: `nodeVigorFactor` — 동일 axis 안에서도 위/아래 node 차이
- **Reproductive sink competition**: truss-bearing node vs leaf-only node 다른 supply 경쟁
- **Dynamic E**: 셀룰로오스 deposition 진행에 따라 E ↑ (어린 stem이 더 휘청) — 현재 무시
- **Multi-order side shoot**: side-of-side 측지 (order ≥ 2)

## 검증

- `tests/architecture/iter30-axis-capacity.spec.ts` (Phase 1, 5/5)
- D=30/45 dump: `tests/architecture/zz-iter30-axis-budget-dump.spec.ts` (Plan §9.5.2)
- Calibration band: `tomato-growth-targets.jsonc` `axis` 섹션 (Phase 6)
