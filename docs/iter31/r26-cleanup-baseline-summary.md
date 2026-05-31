# Iter 31 R26 Cleanup — Baseline Summary (v0.18 — Iter 32 + 33 mesh)

★ Iter 32 (area-based mesh gravity droop) + Iter 33 V3 (petioleLengthM cultivar
fix) 이후 mesh vertex 산출 _변경됨_ — 의도된 baseline 재생성.

anchor.position / anchor.rotation _불변_ (R26 contract 보존, petioleCurve 변경은
mesh-local vertex만 영향, anchor 위치/회전은 stem attach point + bonePath tangent로
변화 0).

Captured: 2026-05-31 — Iter 32+33 동작 검증 후 재생성
Source spec: tests/architecture/iter31-r26-numeric-baseline.spec.ts

## Per-day counts

| Day | leaf_blade anchors | leaf meshes |
|-----|--------------------|-------------|
| D=20 | 1 | 1 |
| D=30 | 9 | 9 |
| D=45 | 8 | 8 |
| D=90 | 22 | 22 |

## Position/rotation distribution (per day)

| Day | pos.x range | pos.y range | pos.z range | rot.w range |
|-----|-------------|-------------|-------------|-------------|
| D=20 | [0.035, 0.035] | [0.355, 0.355] | [-0.133, -0.133] | [0.908, 0.908] |
| D=30 | [-0.166, 0.302] | [0.320, 0.541] | [-0.465, 0.279] | [-0.356, 0.998] |
| D=45 | [-0.270, 0.326] | [0.335, 0.861] | [-0.351, 0.244] | [-0.282, 0.960] |
| D=90 | [-0.365, -0.050] | [0.362, 1.941] | [-0.527, -0.077] | [-0.419, 0.996] |

## How to use

1. Run this spec on R26 commit (4029b6b) to generate baseline.json.
2. Move `docs/iter31/r26-cleanup-baseline.json` to `/tmp/` (gitignored).
3. Execute Phase A~H refactoring.
4. Run `iter31-r26-numeric-equivalence.spec.ts` with baseline.json in place.
5. All 4 acceptance criteria (position/rotation/vertex/hash) must pass.
