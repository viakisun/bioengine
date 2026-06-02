# Probe + Snapshot Archive — Iter 39 K0/K1/K2/K3

K0~K3 phase 진단 시 사용된 임시 probe / snapshot 스크립트. **현재 활성 spec
으로 모두 이식됨** — 그래도 미래 mesh 산식 변경 시 _live 진단_에 재사용
가능하므로 archive 보존.

## Files

| 파일 | phase | 역할 | 영구 spec |
|---|---|---|---|
| `_probe-k0-leaf-tube.mjs` | K0-1 | leaf tube edge type 5개 audit + leaflet/edge count 대응 | `tests/architecture/leaf-tube-audit.spec.ts` LEAF-TUBE-AUDIT-01 |
| `_probe-k2-mesh-anchor.mjs` | K2/K3 | leafletNode.pos vs mesh.position + stem-side vertex yzOffset 측정 | `tests/architecture/mesh-anchor-contracts.spec.ts` ANCHOR-01 (3D), ANCHOR-04 (3D), ANCHOR-05 |
| `_probe-l0-leaf-shape.mjs` | L0-1 | cup_max / droop_max measurement (Track A baseline — 가설 반박 + 폐기) | history (no spec — Track A 폐기) |
| `_probe-l0-leaflet-pose.mjs` | L0-1c/D-1 | per-leaflet rotationQuaternion → planeNormalDotUp 분포 (root cause 진단 + L0-D-1 검증) | `tests/architecture/leaf-leaflet-pitch.spec.ts` LEAF-LEAFLET-PITCH-01 |
| `_snapshot-k0-tube.mjs` | K0-4/K1-3/K2-4/K3-3/L0-D-1 | full-plant / close-up snapshot | (snapshot은 spec 아님, history reference) |

## 사용 (재사용 시)

```bash
# Probe 실행 — dev server 8090 활성 필요.
node _archive/probes/_probe-k2-mesh-anchor.mjs

# Snapshot — phase label + leafId + mode.
node _archive/probes/_snapshot-k0-tube.mjs k4 axis0:n13 close
```

## History

- **K0** (J0 + 부분): `lateral-vein 0.0 → 0.65 / petiolule 0.30 → 0.50` (K0-3A).
  forward truncate에서 leaflet 쪽 35% gap 잔존.
- **K1** (end-anchored truncate): `truncateBonePathByArcLength` 방향 역순화.
  K2 후 _guardrail_ 역할.
- **K2** (connector visibility 1.0): `lateral-vein 1.0 / petiolule 1.0`.
  fraction 영역의 양쪽 gap 모두 해소.
- **K3** (mesh anchor 3D shift): `normalizeLeafMeshVertices`가 x만 shift →
  3D (x, y, z) shift. stem-side vertex의 yzOffset 91mm max → 0. _사용자
  진단 정확_.
- **L0-D-1** (per-leaflet pitch envelope): K3 후에도 close-up "안쪽 cup"
  잔존 → Track A (vertex cup/droop) baseline 측정으로 _반박_ 후 폐기. Root
  cause = `foldDroopDeg = -10 + 40×maturity` (mature 30° pitch). Fix:
  `-5 + 15×maturity` (mature 10°). planeNormalDotUp p50 0.854 → 0.951.
  _사용자 의심 정확 (per-leaflet rotation 영역)_.
