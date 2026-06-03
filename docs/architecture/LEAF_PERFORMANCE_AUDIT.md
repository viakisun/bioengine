# Leaf Performance Audit (Phase L6-B)

> L6-A (quality) 완료 시점의 _렌더링 성능 baseline_과 _L6-B 개선 plan_.
> 정량 측정은 dev server (port 8090) + Babylon Inspector 사용.

## L6-A 완료 시점 baseline (예상)

### Per-leaflet metrics (변화 없음 from L5)

| 항목 | Low quality | High quality |
|---|---|---|
| lengthSegs | 15 | 22 |
| COLS | 9 | 9 |
| Vertex count | ~144 | ~286 |
| Triangle count | ~256 | ~408 |
| Normal | per-vertex | per-vertex |

### Per-plant metrics

| 항목 | Mature plant (예상) |
|---|---|
| Leaves | 30 |
| Leaflets per leaf | 8~12 (avg 10) |
| Total leaflets | ~300 |
| **Draw calls (leaf mesh only)** | **~300** ⚠️ |
| Total leaf vertices | 43,200 (low) / 85,800 (high) |
| Total leaf triangles | 76,800 / 122,400 |

### Material/shader cost

| 항목 | 비용 |
|---|---|
| PBR base | 표준 |
| Clearcoat | 추가 fragment 비용 (~10%) |
| Subsurface translucency | 추가 fragment 비용 (~15%) |
| Shader wind (WebGL2) | per-vertex ~30 instructions |
| Interaction loop | per-vertex × 8 = 8 iterations |
| Total material cost | _moderate-heavy_ |

### Memory

| 항목 | per plant |
|---|---|
| Mesh objects | ~300 |
| VertexData objects | ~300 |
| Texture cache | 2 (color + normal, Scene-shared) |
| Per-vertex data | 144 × 32B = ~4.6KB / leaflet |
| Total leaf vertex memory | ~1.4MB / plant |

## L6-B 개선 plan

### B1 — Per-leaf merge (★ critical)

목표: 300 draw call → 30 (10× 감소).

산식:
```text
Before: leaflet마다 Mesh, mesh.position = node.pos, mesh.rotationQuaternion = poseQuat
After:  leaf마다 Mesh, leaflet pose가 vertex position에 baked

bakedVertex = poseQuat × localVertex + (leafletNode.pos - leafBladeRootNode.pos)
```

검증: **각 leaflet vertex의 final plant-local position 동일** (1e-6 tolerance).
   _local vertex byte-identical 아님_.

신규 spec: `LEAF-MESH-BATCHING-PARITY-01`, `LEAF-COORD-HIERARCHY-01`,
`LEAF-DRAW-CALL-REDUCTION-01`.

### B2 — LOD (distance-based quality)

`LEAF_MESH_RESOLUTION` 확장:
- `ultra-low`: lengthSegs=8, ~80 vertices/leaflet (40% 감소)
- `low`: lengthSegs=15, ~144 vertices/leaflet (현재 default)
- `high`: lengthSegs=22, ~286 vertices/leaflet

거리별 switch:
- camera distance < 5m → `high` (286 vert)
- 5~15m → `low` (144 vert) ← 현재 default
- > 15m → `ultra-low` (80 vert)

영향:
- background plant (>15m) 잎 vertex 40% 감소
- 5m 이내 hero plant outline 매끄러움 ↑

### B3 — Material opt-out (background plant)

LeafEngine.getMaterial은 _full PBR_ (clearcoat + subsurface).

LOD far 분기:
- ultra-low quality → `getMaterial(scene, 'simple')` — clearcoat/subsurface off
- 가까운 plant만 full PBR

영향:
- background plant fragment 비용 ~25% 감소
- 시각 차이 인지 minimum

## Risk + Tradeoff

| 위험 | 영향 | 완화 |
|---|---|---|
| **per-leaflet posture 손실** | leaflet 독립 wind/interaction 어려움 | Mesh-level wind은 유지. per-leaflet은 vertex shader uv 기반 distinguish. |
| **debug mode picking** | 개별 leaflet inspector 불가 | debug 모드 scene flag — `leafBatching: 'production' \| 'debug'` |
| **LOD switch flicker** | 거리 경계에서 popping | hysteresis (전환 5m / 14m vs 6m / 16m) |
| **memory 일시 증가** | batching 중 임시 buffer | 진행 후 free |

## Acceptance Criteria (L6-B 완료 시)

1. `LEAF-DRAW-CALL-REDUCTION-01`: per-plant draw call <= 60 (current 300)
2. `LEAF-MESH-BATCHING-PARITY-01`: vertex final plant-local distance <= 1e-6
3. `LEAF-COORD-HIERARCHY-01`: leaf mesh.parent === lushGroup (per-leaf merge 후에도)
4. `LEAF-LOD-SWITCH-01`: distance-based quality 자동 전환 동작
5. visual quality regression 0 — L6-A 결과 보존

## Snapshot reference

L6-A 마지막 commit (S52) 시점 mesh structure가 _baseline reference_.
L6-B-1 batching parity 검증 시 이 reference 와 비교.

## 측정 도구

- Babylon `scene.getEngine().getRenderer()` draw call counter
- `scene.totalVerticesPerformanceCounter` vertex count
- `scene.getActiveMeshes()` mesh array length
- Chrome DevTools Performance panel frame time

## 후속 phase 매핑

| Sub-phase | Critical files | 신규 invariants |
|---|---|---|
| S54 L6-B-1 | LeafMaterial.ts (wrapAsLeafBatch 신규) + LeafEngine | 3 신규 |
| S55 L6-B-2 | LeafletProfile.ts (LEAF_MESH_RESOLUTION + LOD) | 1 신규 |
| S56 L6-B-3 | LeafMaterial.ts (material options) | 0 (옵션 toggle) |
