# Iter 35+ 후보 (Iter 34 cleanup 이후 분리된 작업)

> Iter 34 (잡코드 정리)에서 _범위 밖_으로 분리한 후보들.
> 각 항목 _근거_ + _위험도_ + _범위_ 명시.

---

## P10 — `SkeletonNode.phytomer?` → Required migration

### 현황

`SkeletonNode.phytomer?: PhytomerNodeRef` — 옵셔널 (Iter 29 Phase 3 마이그레이션 잔존).

```ts
// src/plant/skeleton/PlantSkeletonGraph.ts:123
export interface SkeletonNode {
  phytomer?: PhytomerNodeRef;  // optional during migration
}
```

### 검증

`SKELETON-PHYTOMER-01` spec — populator 100% bind 보장.

### Iter 35 작업

1. interface `phytomer: PhytomerNodeRef` (required)
2. 모든 `?.` chain 제거 (SkinMeshPlant, populator)
3. populator `bindPhytomer` non-null 보장 검증

### 위험도

**MEDIUM** — populator 100% bind 검증 통과 시 안전. 단 _옵셔널 chain_ 의존
코드 grep 광범위.

---

## P11 — ShowcasePlant + SupportingPlant → canonical Skin path 통합

### 현황

Iter 34 C2에서 `buildLeafChunk` → `buildLeafChunkLegacy` rename만. 함수 _자체_는 보존:
- `buildLeafChunkLegacy` (petiole + rachis + petiolules _포함_ full mesh)
- `buildLeafChunkSkin` (leaflets _만_, petiole은 SkeletonGraph stem tube)

ShowcasePlant + SupportingPlant는 _legacy_ full mesh path 사용. SkinMeshPlant
canonical path와 _다른_ 시각.

### Iter 35 작업

옵션 A — _Skin 통합_:
- ShowcasePlant도 `buildLeafChunkSkin` 사용
- petiole은 SkeletonOverlay stem tube로 표현
- 시각 검증 필수 (full mesh → blade only 차이)
- _큰 작업_ — 시각 회귀 위험

옵션 B — _legacy 유지_:
- ShowcasePlant은 "전체 식물" 시각 (skeleton 없이)
- SupportingPlant은 "배경 LOD" 시각
- legacy 유지가 자연 (Iter 35 변경 _안 함_)

### 위험도

옵션 A: **HIGH** (시각 회귀 + petiole 표현 변경)
옵션 B: 변경 0 — _이번 Iter 35 분리만_ 의미

### 권장

옵션 B (현 상태 유지). _진짜_ 통합이 필요한 시점에 별도 작업.

---

## P12 — `node.leaf.*` legacy 필드 제거 (Iter 29 migration 완료)

### 현황

`NodeState` 구조 (GrowthModel.ts:161+):
- `node.leaf: LeafOrganState` (Iter 29 Phase 2A 신규 — canonical)
- `node.leafSizeFactor`, `node.leafMaturity`, `node.leafletCount`, `node.leafAreaCm2`,
  `node.yellowing` 등 (legacy alias)

PlantBase는 _둘 다_ 채움 (sync). Skin은 `phytomer.leaf` (= `node.leaf`) 선호.

### Iter 35 작업

1. legacy alias 필드 _하나씩_ 제거 (사용처 audit + migrate)
2. `node.leaf.*` only로 통합
3. 관련 spec 갱신 (legacy alias 검증 제거)

### 위험도

**HIGH** — _많은 사용처_ (GrowthEngine, PhysicsModel, SupportingPlant, etc.).
phase 별 분리 + 시각 회귀 검증 필수.

---

## P13 — Truss/fruit/flower mesh _live spec_ 확장

### 현황

Iter 33 V1 `iter33-leaf-render-live.spec.ts` (9 invariants) — leaf만 검증.

truss/fruit/flower mesh도 _동일 패턴_:
- anchor.position == mesh.position
- anchor.rotation 적용
- bbox scale (geometry projection)
- material 분기

### Iter 35 작업

`iter35-truss-render-live.spec.ts`, `iter35-fruit-render-live.spec.ts` 등 작성.

### 위험도

**LOW** — spec 신규만, 기존 code 변경 0.

---

## P14 — Per-leaflet 개별 gravity droop (rachis 내부)

### 현황

Iter 32 G3 — leaf _전체_ gravity droop (마지막 vertex sin × t² × size).
개별 _leaflet_은 동일 droop 적용 (rachis 따라).

### Iter 35 작업

각 leaflet의 _마지막 vertex_에 _자체 gravity_ 추가 — small per-leaflet sag.

### 위험도

**MEDIUM** — leafChunk.ts 산식 추가, 시각 회귀 가능.

---

## P15 — Wind sway interaction (skinTreeSwayAnimation)

### 현황

Iter 31 R26 contract — _static_ petioleCurve. wind sway는 _frame별 회전_ 추가
없이는 표현 어려움.

### Iter 35 작업

`skinTreeSwayAnimation`이 petioleCurve를 _동적_ 수정 → leaf rotation _자동_ 갱신
(R26 contract 그대로).

### 위험도

**MEDIUM-HIGH** — animation loop 영향, performance 검증.

---

## 우선순위 권장

| Priority | Item | 시간 | 위험 | 가치 |
|---|---|---|---|---|
| **HIGH** | P13 (truss/fruit live spec) | 3h | LOW | HIGH (검증 확장) |
| **MEDIUM** | P10 (phytomer required) | 4h | MEDIUM | MEDIUM (잡코드) |
| **MEDIUM** | P14 (per-leaflet droop) | 2h | MEDIUM | MEDIUM (시각) |
| **LOW** | P11 (ShowcasePlant Skin 통합) | 1d+ | HIGH | LOW (이미 동작) |
| **LOW** | P12 (node.leaf.* legacy 제거) | 1d+ | HIGH | LOW (수동) |
| **DEFER** | P15 (wind sway) | 1w | HIGH | LOW (별도 feature) |
