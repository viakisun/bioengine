# Edge Render Policy — Skin vs Skeleton 분리 (Iter 39 Phase H4)

> **사용자 핵심 원칙**: "skeleton geometry vs render policy 분리".
>
> Skeleton bonePath는 항상 _완전한 생물학적 연결_ (SKELETON-EDGE-01 contract).
> Visual truncation은 _render time_에 `EdgeRenderPolicy`로만.

## 배경

Phase G2에서 petiolule을 _짧게_ 보이게 하려고 `buildTomatoSkeletonGraph`의 bonePath
를 truncate했음. 결과 — graph SSOT 위반:
- `edge.bonePath.last.p1 ≠ edge.endNode.pos`
- SkeletonOverlay에서 leaflet 노드가 _공중에 떠 있는 것처럼_ 보임
- skin/overlay/mesh가 _서로 다른_ 위치를 가리킴

Phase H0가 truncation을 _revert_했고, H4가 이 시각 의도를 **render policy**로 옮김.

## API

`src/plant/skeleton/PlantSkeletonGraph.ts:EdgeRenderPolicy`:

```ts
export interface EdgeRenderPolicy {
  radius: { biological; render; min; };
  junction: { embedDepthM; radialDir; parentContext?; };
  material?: { role; };
  visualHint?: { color; lineWidth?; };
  // ★ H4:
  /** Skin tube가 bonePath의 _arc length_ 얼마나를 그릴지 (0-1). 기본 1.0. */
  skinVisibleFraction?: number;
  /** Skin tube radius scale (graph radius × scale). 기본 1.0. */
  skinRadiusScale?: number;
}
```

## Type별 default (`populateEdgePolicies.ts`)

```ts
const SKIN_VISIBLE_FRACTION_BY_TYPE = {
  mainStem: 1.0, sideShoot: 1.0,
  petiole: 1.0, peduncle: 1.0, rachis: 1.0, pedicel: 1.0,
  'leaf-rachis':  1.0,
  petiolule:      0.30,   // ★ 이전 G2 truncation 의도가 여기로
  'lateral-vein': 0.0,    // SDF skip (vein은 surface feature로)
  'sub-vein':     0.0,    // SDF skip
};
```

## Arc length 기준 truncate (`StemFamilyTubeNetworkBuilder.ts`)

**중요 (사용자 plan v7 review #6)**: bone count 슬라이스가 아닌 **arc length 누적**.
segment 길이가 비균일해도 정확한 시각 비율 보장.

```ts
function truncateBonePathByArcLength(
  bones: SkeletonBone[],
  fraction: number,
): SkeletonBone[] {
  if (fraction >= 1.0) return bones;
  if (fraction <= 0.0) return [];
  let total = 0;
  for (const b of bones) total += distance(b.p0, b.p1);
  const target = total * fraction;
  let accumulated = 0;
  const out: SkeletonBone[] = [];
  for (const b of bones) {
    const segLen = distance(b.p0, b.p1);
    if (accumulated + segLen <= target) {
      out.push(b);
      accumulated += segLen;
    } else {
      const remainFrac = (target - accumulated) / segLen;
      out.push({
        p0: { ...b.p0 },
        p1: lerpV3(b.p0, b.p1, remainFrac),
        r0: b.r0,
        r1: b.r0 + (b.r1 - b.r0) * remainFrac,
      });
      break;
    }
  }
  return out;
}
```

## SkeletonOverlay 영향 0

Overlay는 _full bonePath_를 그대로 그림. policy 무시. 결과:
- Overlay: 전체 구조 (skeleton SSOT)
- Skin: policy에 따라 짧게 (시각 의도)

→ **노드는 정확히 부착, 시각만 정책에 따라 다양**.

## Skeleton SSOT 보존

- `SKELETON-EDGE-01`: 모든 edge `bonePath.first.p0 == startNode.pos`, `bonePath.last.p1 == endNode.pos` (≤1mm).
- 이 contract는 _renderPolicy.skinVisibleFraction과 무관_.
- skin truncate는 `swollenBones` _clone copy_에 적용 — `edge.bonePath` 원본은 _불변_.

## Trade-off

| 옵션 | 장점 | 단점 |
|---|---|---|
| Skeleton truncate (G2) | builder 단순 | SSOT 위반, overlay/mesh inconsistency |
| **Render policy (H4)** | SSOT 보존, overlay/mesh 정합 | builder 한 줄 더 (truncate helper) |

## History

- Phase G2 (commit 6a88487): `PETIOLULE_VISIBLE_RATIO_BY_POSITION`로 skeleton bonePath truncate. _SSOT 위반_.
- Phase H0 (commit 78d38b3): truncation _revert_, SKELETON-EDGE-01 강제.
- Phase H4 (commit 1aef524): `EdgeRenderPolicy.skinVisibleFraction` 신규 — 시각 의도를 render policy로.

## 참고

- `docs/architecture/SKELETON_SSOT.md` — 핵심 원칙 정식 명세
- `docs/architecture/MESH_ANCHORS.md` §2 — per-leaflet mesh contract
- `tests/architecture/skeleton-edge-consistency.spec.ts` — SKELETON-EDGE-01 검증
