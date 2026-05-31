# Leaf Mesh Build Flow (★ Iter 33 verified live)

> 사용자 비판 "이미 있다 ≠ 잘 동작한다" — 본 docs는 _코드_와 _live 측정 spec_을
> 모두 인용해 실제 동작 보장.
>
> Iter 32 (area-based mesh gravity droop) + Iter 33 V1 (live spec) + V3 (cultivar
> petioleLengthM) 이후 단일 source pipeline 완성.

---

## Single-Source Pipeline (검증된 실제 흐름)

```
PlantBase.tick (Pass 3)
  ↓ computeGravityDroopDeg (area + cultivar.droopSensitivity, double-droop 보정)
  ↓ computeLeafGeometryProjection (area sqrt + cultivar references)
  ↓ classifyLeafStage, composePosture, computeSenescence, ...
  ↓
PhytomerNode.leaf : LeafOrganState  ← ★ 단일 source (growth state)
  ├─ currentAreaCm2, leafletCount, stage
  ├─ posture {
  │    gravityDroopDeg,      // ★ Iter 32 — area-based, double-droop 보정 후 net
  │    curl, droopDeg (legacy),
  │  }
  ├─ geometryProjection {
  │    leafAxisLengthScale,   // sqrt(area/ref) × lengthMaturity × ageGate
  │    referenceRachisLengthM,
  │    referencePetioleLengthM,  // ★ Iter 33 V3 — cultivar에서 (이전 hardcoded)
  │  }
  ├─ senescence {colorDullness, visibleAreaFactor}
  └─ morphology {serrationDepth, lobeDepth, petioleLengthM (★ V3 cultivar)}
  ↓
SkeletonGraph populator (populateAnchorMorphology.fillLeafAnchor)
  ↓ R26 contract:
  ↓   anchor.position = meshAnchorNode.pos
  ↓   anchor.rotation = makeLeafQuaternion(edge.bonePath[last] tangent, WORLD_UP)
  ↓
OrganAnchor (leaf_blade)  ← ★ R26 contract (transform)
  ├─ .position
  └─ .rotation
  ↓
SkinMeshPlant per-leaf loop (4 lines, line 702-720):

  const phytomerLeaf = meshAnchorNode.phytomer?.leaf;     // ← growth state
  const leafMesh = buildLeafMeshFromPhytomer(
    name, scene, phytomerLeaf, genome, rng,                // mesh-local vertices
  );
  leafMesh.parent = lushGroup;
  leafMesh.position = new Vector3(...meshAnchorNode.pos);  // anchor position
  leafMesh.rotationQuaternion = new Quaternion(...anchor.rotation);  // R26
  leafMesh.material = yellowing > 0.4 ? yellowMat : greenMat;
  ↓
Babylon Mesh (rendered)
```

---

## 2 객체 + 1 hub (정합)

```
SkeletonNode (= meshAnchorNode)   ← ★ 단일 hub
  ├─ .phytomer.leaf : LeafOrganState    (growth — scale/droop/color/shape)
  └─ .edge.organAnchors[leaf_blade]     (transform — rotation/position)
```

**왜 _완전 1 객체_가 아닌가**:

- `OrganAnchor`는 _generic organ 추상_ (leaf/fruit/flower 공통). leaf만 합치면
  organ 일관성 깸.
- Babylon **scene-graph 표준** — _mesh data_ + _transform_ 분리.
- 통합은 표준 위배 + 가치 < 비용.

**그러나 _SkeletonNode 차원에서 단일_** — `meshAnchorNode` 한 노드에서 _2 인접 객체_
모두 접근. 사용자 비전 "끝 노드 정보 모아" _정확히 충족_.

---

## Iter 32 mesh gravity droop 흐름

```
[GrowthModel.ts Pass 3]
  rawGravityDroopDeg = computeGravityDroopDeg(currentArea, refArea, sensitivity)
  ★ double-droop 보정: gravityDroopDeg = max(0, raw - droopExtra)
                       (petiole이 이미 처진 만큼 차감)
  → leaf.posture.gravityDroopDeg
  
[LeafGenerator.ts:354]
  → buildLeafChunkSkin({ ...phytomer.leaf, gravityDroopDeg })
  
[leafChunk.ts createOvateLeaflet]
  gravityComponent = sin(gravityDroopDeg × π/180) × size × t²
  ageComponent = (0.10 + ageFrac × 0.30) × t² × size  ← 기존 R17 약화
  longitudinalDroop = ageComponent + gravityComponent
  y = transverseCup - longitudinalDroop  ← mesh local vertex y
  ↓ mesh-local +x 마지막 vertex가 아래로 휨
```

**실측 (round cultivar default, D=60)**:
- mean gravityDroopDeg: 3.0° (double-droop 보정 후 — 대부분 0)
- max net gravityDroopDeg: 11.8° (cherry-like rigid petiole leaf)
- max mesh y변위: ~1.66cm (mature leaf의 마지막 vertex)

---

## Iter 31 R26 contract

```ts
// populateAnchorMorphology.ts:fillLeafAnchor (218-228)
if (edge.bonePath.length > 0) {
  const lastBone = edge.bonePath[edge.bonePath.length - 1];
  const petioleTipTangent = {
    x: lastBone.p1.x - lastBone.p0.x,
    y: lastBone.p1.y - lastBone.p0.y,
    z: lastBone.p1.z - lastBone.p0.z,
  };
  anchor.rotation = makeLeafQuaternion(petioleTipTangent, { x: 0, y: 1, z: 0 });
}
```

★ leaf rotation = _PlantBase petioleCurve_의 마지막 segment tangent _그대로_. 산수
추가 0. populator는 _thin layer_.

자세히: [`STEM_LOCAL_FRAME.md`](./STEM_LOCAL_FRAME.md).

---

## 검증 spec (live)

`tests/architecture/iter33-leaf-render-live.spec.ts` (Iter 33 V1, 9 invariants):

| Spec ID | 검증 |
|---|---|
| `LEAF-LIVE-POSITION-MATCHES-ANCHOR-01` | mesh.position == anchor.position (1e-6) |
| `LEAF-LIVE-ROTATION-MATCHES-ANCHOR-01` | mesh.rotationQuaternion == anchor.rotation (1e-9) |
| `LEAF-LIVE-BBOX-SCALE-01` | bbox가 (petiole + rachis) × axisScale 비례 |
| `LEAF-LIVE-MESH-DROOP-GRAVITY-01` | gravityDroopDeg가 mesh y변위에 _작동_ |
| `LEAF-LIVE-CULTIVAR-DEFAULT-DROOPSENSITIVITY-01` | cultivar sensitivity 적용 + 45° clamp |
| `LEAF-LIVE-PHYTOMER-COMPLETE-01` | 모든 leaf LeafOrganState 필드 완전 |
| `LEAF-LIVE-FALLBACK-NEVER-01` | canonical path 100% (mesh vertex > 0) |
| `LEAF-LIVE-D90-SENESCENCE-VISIBLE-01` | D=90 yellow leaf 발생 |
| `LEAF-LIVE-MULTI-TIMEPOINT-SUMMARY-01` | D=30/60/90 통계 출력 |

R26 contract regression:
- `iter31-r26-leaf-rotation-contract.spec.ts` (6 invariants)
- `iter31-r26-numeric-equivalence.spec.ts` (anchor + mesh hash)

---

## 왜 _thin wrapper_ 함수 추가 안 했나

`buildLeafMeshFromAnchor(meshNode, anchor, ...)` 같은 통합 wrapper를 _고려_했으나:

1. **이미 통합 100%** — `buildLeafMeshFromPhytomer`가 mesh build entry, anchor가
   transform entry. _2 개념_ 분리가 _정합_.
2. **Babylon scene-graph 표준** — mesh + transform 분리는 표준 패턴.
3. **wrapping 가치 < 비용** — 4줄 inline이 _이미 명확_, wrapper는 _abstraction 더 추가_.
4. **R26 contract 위험** — wrapper 안에 rotation 계산을 다시 _캡슐화_하면 R26
   "populator가 다시 계산 말라" 원칙 _우회 위험_.

★ 사용자 비전 "끝 노드 정보 모아 메시" — 이미 _SkeletonNode_가 hub로 충족.
_명시 wrapper_는 _과한 abstraction_.

---

## 관련 commits

### Iter 32 (gravity droop)
- `3a856a5` — G1+G2+G3: area-based mesh gravity droop + cultivar sensitivity +
  double-droop 보정

### Iter 33 (live spec + cultivar fix)
- `9db17e3` — V1+V3: live 동작 측정 spec (9 invariants) + petioleLengthM cultivar fix

### Iter 31 R26 (background contract)
- `4029b6b` — R26: petioleCurve 마지막 tangent → anchor.rotation
- `d799ad4` — Phase Z: numeric equivalence

---

## Iter 34+ 후보

- truss/fruit/flower mesh _live spec_ — leaf 패턴 검증 후 확장
- per-leaflet 개별 gravity droop (rachis 내부)
- wind sway interaction (petioleCurve dynamic)
- phototropism (lightSeekingBladePlaneTiltDeg dynamic)
