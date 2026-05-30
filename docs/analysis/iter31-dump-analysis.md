# Iter 31 Phase 5-6 — Dump Analysis (5 detector)

> Source: `docs/iter31-multi-timepoint-leaf-node-data.md` (Phase 1-3 적용 후).
> Detectors: projection / mature-small / stem-collapse / frame-lock / clamp-saturation.
> Generated: 2026-05-30T14:04:49.262Z

---

## Detector 1 — Projection anomaly (bbox / sqrt(current))

★ Iter 30 baseline에서 D=30 side:0 idx=0: 55.6 / sqrt(102) ≈ 5.5× — 폭주.
★ Iter 31 Phase 2 후 D=30 side:0 idx=0: ~30 / sqrt(102) ≈ 3.0× — 회복.

| Day | axisId | idx | current | bbox | score |
|-----|--------|-----|---------|------|-------|
| 30 | side:0 | 3 | 119 | 36.4 | **3.34** |
| 30 | main | 10 | 374 | 45.6 | 2.36 |
| 30 | side:0 | 1 | 119 | 30.0 | 2.75 |
| 30 | side:0 | 2 | 126 | 30.0 | 2.67 |
| 30 | side:0 | 0 | 102 | 26.9 | 2.66 |
| 30 | main | 11 | 359 | 34.8 | 1.84 |
| 30 | main | 12 | 205 | 21.6 | 1.51 |
| 30 | side:0 | 4 | 102 | 23.4 | 2.32 |
| 30 | main | 13 | 80 | 9.5 | 1.06 |

→ 정상 range: score 1-2 typical. ≥ 3 잔존 anomaly (Iter 32 후보).
→ Phase 2 R5 fix가 side 5.5× → ~3× 회복 (★ 핵심 effect).


## Detector 2 — Mature small leaf (full-size geometry 검출)

조건: stage = 'mature' + current < reference (700) × 0.25 = 175cm² + bbox > 25cm.

Phase 2 R5 fix 후 측정:
| Day | axisId | idx | stage | current | bbox | 평가 |
|-----|--------|-----|-------|---------|------|------|
| 30 | side:0 | 0 | mature | 102 | 26.9 | ⚠️ 잔존 (bbox > 25, but better than 55.6) |
| 30 | side:0 | 1 | mature | 119 | 30.0 | ⚠️ 잔존 |
| 30 | side:0 | 2 | mature | 126 | 30.0 | ⚠️ 잔존 |
| 30 | side:0 | 3 | mature | 119 | 36.4 | ⚠️ 잔존 |

→ Iter 30 baseline 55.6 / 56.0 / 52.4 / 54.8 vs Iter 31 26.9 / 30 / 30 / 36.4 = **~45% 회복**.
→ 추가 fix는 cultivar.referenceLeafAreaCm2 재보정 (Iter 32 R9 후보).

## Detector 3 — Stem collapse (apical 연속 collapse + tangent.y < 0)

| Day | 마지막 5 Δy (Phase 1 후) | 연속 collapse (Δy<0.2) | 평가 |
|-----|--------------------------|------------------------|------|
| 20  | [5.31, 5.29, 5.27, 3.93, 0.06] | 1 | ✅ |
| 30  | [5.59, 4.15, 2.00, 0.64, 0.07] | 1 | ✅ |
| 40  | [6.17, 4.57, 2.14, 0.70, 0.06] | 1 | ✅ |
| 50  | [6.92, 4.26, 2.05, 0.71, 0.08] | 1 | ✅ |

→ 마지막 1개 Δy ≈ 0.06cm은 _방금 형성된_ internode (정상). _연속_ 2+ collapse 0건 (R6 fix).

## Detector 4 — Frame XZ-plane lock

★ Iter 30 baseline: 모든 frame.normal.y = 0.000 (XZ lock 완전).
★ Iter 31 Phase 3 R4 fix 후:

| Day | axisId | normal.y values | 평가 |
|-----|--------|------------------|------|
| 30 | main | [0,0,0,0,0,0,0,0,0.059] | ✅ 일부 회복 (main 직립 → 자연 lock) |
| 30 | side:0 | [-0.275, -0.275, -0.275, -0.275, -0.319] | ✅ **DIVERSE** (XZ lock 해소) |

→ Side-shoot normal.y 비-zero 분포 → fern frond stack 해소 확인.

## Detector 5 — Allocation clamp saturation (Iter 32 후보)

| Factor | Min clamp | 박힘 패턴 | Iter 32 후보 |
|--------|-----------|-----------|--------------|
| plantSrc | 0.65 | D=20~D=60 _모두_ 박힘 | **R8** sourceSinkProxyV1 dynamic range |
| axisCap (side) | 0.35 | D=30 side:0 5/5 박힘 | R7 axis capacity 재보정 |
| sideShoot | 0.20 | side:0 5/5 박힘 (사용자 사진 evidence) | **R7** sideShootPotential cultivar 재보정 |
| final (side) | 0.15 | side:0 5/5 박힘 (final = min clamp) | R7 + R8 결합 |

## Before/After Delta (Iter 30 → Iter 31)

| 지표 | Iter 30 baseline | Iter 31 측정 | Δ |
|------|------------------|--------------|---|
| D=30 side max bbox | 55.6cm | 36.4cm | **-35%** |
| D=30 main max bbox | 48.6cm | 45.6cm | -6% |
| D=30 apex Δy 마지막 | 0.07cm | 0.07cm + 직립 회복 | R6 fix |
| frame.normal.y | 0 (모두) | -0.275 (side) | **XZ lock 해소** |
| D=30 side leaf XZ spread | (lock) | 11.5cm | fern stack 해소 |
| D=30 main mean current | 254.5cm² | 254.3cm² | Δ 0.1% (보존) |

---

## Iter 32 후보 자동 분류 (docs/iter32-candidates.md)

위 Detector 5 결과 기반 자동 생성. Iter 32 진입 시 우선순위:

1. **R7 — sideShootPotential cultivar 재보정** (sideShoot 0.20 5/5 박힘)
2. **R8 — plantSourceFactor 0.65 lower clamp 동적화** (D=20~D=60 박힘)
3. R9 — cultivar referenceLeafAreaCm2 차등화 (D=30/45 main max bbox 추가 회복)
