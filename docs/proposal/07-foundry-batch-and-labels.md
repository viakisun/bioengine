# 07. Foundry — 배치 설계 + 라벨 스키마

**문서 분류**: 깊이 트랙 D · 외주 데이터·렌더·인식 알고리즘 파트너 spec
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §5.4

---

## §1. 목적

도구의 가치명제 V2 **Data Foundry** 실현. 헤드리스 배치로 학습/검증 데이터를 자동 주조. 인식 알고리즘 파트너(컨소시엄)와 비아 관제 학습용 표준 데이터셋 공급.

## §2. 배치 매트릭스 차원

| 차원 | 값 후보 | 카디널리티 |
|---|---|---|
| time-of-day | [6, 9, 12, 15, 18] | 5 |
| light-preset | [default, overcast, golden, grow-light] | 4 |
| growth-day | [15, 30, 45, 60, 75, 90, 105] | 7 |
| leaf-density-perturb | [0.8, 1.0, 1.2] | 3 |
| camera-angle | [0, 30, 60, 90, 120, 180, 240, 300] | 8 |
| camera-height | [0.5, 1.0, 1.5, 2.0] | 4 |
| wind-strength | [0.0, 0.3, 0.7] | 3 |

→ 단일 시드 당 5·4·7·3·8·4·3 = **20,160 frames**
→ 시드 16~64 다양화 시 32만~129만 장 가능.

### 2.1 선택형 차원
필요 시 추가:
- 베드 행간 (`aisleWidthScale`)
- 카메라 lens (FOV 30/45/60/90)
- occluder 추가 (`addLeafObstacle`)
- 시점 다양화 (eye-in-hand + observer 동시 캡처)

### 2.2 Composer Lock vs Variable
[04-scenario-catalog.md](04-scenario-catalog.md) §Composer 참조. 시나리오에서 Variable 토글된 dial이 Foundry 매트릭스 차원으로 자동 promote.

## §3. 라벨 스키마

### 3.1 객체 클래스 (instance 라벨)
```
apex (생장점)
main-stem-segment-{idx}
internode-{idx}
side-shoot-{axisId}-segment-{idx}
truss-{trussId}-peduncle
truss-{trussId}-rachis
truss-{trussId}-pedicel-{fruitIdx}
fruit-{trussId}-{fruitIdx}-stage-{0..5}
leaf-{nodeIdx}
leaflet-{nodeIdx}-{leafIdx}
wire-overhead
twine-{plantId}
bed-{bedIdx}
cocopeat-bag-{bedIdx}-{slotIdx}
aisle-{aisleIdx}
robot-chassis
robot-arm-segment-{jointIdx}
robot-end-effector
```

### 3.2 Attribute (per annotation)
| Attribute | 타입 | 의미 |
|---|---|---|
| `instance_id` | int | 전역 유일 |
| `visible_fraction` | float (0~1) | 가림 정도 (ray cast 계산) |
| `occluding_class` | string | 가린 객체 종류 (leaf/stem/fruit) |
| `reachable_from_pose` | bool[] | 로봇 자세별 도달 가능 여부 |
| `cut_point` | float[3] + float (각도) | 절단 가능 위치. 적심·적과 대상에만 |
| `bbox_3d` | float[24] (8 corners × 3) | 월드 좌표 |
| `bbox_2d` | float[4] (x, y, w, h) | 이미지 좌표 |
| `mask_rle` | string | run-length encoded segmentation |
| `world_coord` | float[3] | 객체 중심 월드 좌표 |
| `growth_day` | int | 캡처 시 식물 DAS |
| `seed` | hex | 캡처 시 시드 |

## §4. Segmentation Mask 렌더링

### 4.1 권장: 옵션 B (별도 mask material 패스)
- 모든 mesh에 unique RGB instance ID 할당.
- 별도 카메라 패스로 RTT(RenderTargetTexture)에 캡처.
- PNG 또는 RLE 인코딩.
- 장점: 안정적, 결정적.

### 4.2 옵션 A (per-mesh ID를 RGB 채널 packing + picking)
- GPU 효율 좋으나 디버깅 복잡.

### 4.3 옵션 C (custom shader)
- 최고 효율, 구현 비용 큼. V2 evolution에 검토.

### 4.4 Mesh ID 규약 (외주 초기 합의 의무)
- 시나리오 시작 시 mesh ID 결정적으로 할당.
- 같은 시드·시나리오 → 같은 mesh ID.
- ID 충돌 시 CI 실패.

## §5. 출력 포맷

### 5.1 COCO JSON (필수)
```json
{
  "info": {
    "description": "Phytosim Foundry",
    "scenarioId": "recog-batch-fruit-classification",
    "seed": "0xFEED",
    "reproducibilitySeal": "seal_abc123",
    "conditions": {
      "time-of-day": 12,
      "light-preset": "default",
      "growth-day": 75
    },
    "version": "1.0",
    "date_created": "2026-06-06"
  },
  "images": [
    {
      "id": 1,
      "file_name": "frame_000001.png",
      "width": 1280,
      "height": 720
    }
  ],
  "categories": [
    { "id": 100, "name": "fruit-stage-0", "supercategory": "fruit" },
    { "id": 101, "name": "fruit-stage-1", "supercategory": "fruit" }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 102,
      "bbox": [150, 220, 80, 90],
      "segmentation": [[...]],  // polygon or RLE
      "area": 6400,
      "iscrowd": 0,
      "attributes": {
        "instance_id": 19384055,
        "visible_fraction": 0.68,
        "occluding_class": "leaf",
        "world_coord": [0.42, 1.85, 0.12],
        "growth_day": 75,
        "seed": "0xFEED"
      }
    }
  ]
}
```

### 5.2 YOLO txt (옵션)
한 줄 = `<class_id> <cx> <cy> <w> <h>` (정규화). bbox만, 빠른 학습 호환.

### 5.3 3D bbox JSON Lines (옵션)
프레임별 `frame_id` + `annotations[]` 형식. 깊이 정보 포함.

### 5.4 Pascal-VOC (선택)
legacy 호환, default 미생성.

### 5.5 Sidecar 메타데이터
모든 출력에 `info.scenarioId`, `info.seed`, `info.conditions`, `info.reproducibilitySeal` 포함. 데이터셋 재현·감사 가능.

## §6. 파이프라인 운영

### 6.1 Worker 구조
```
[Foundry CLI / REST POST /v1/foundry/jobs]
        ↓
[Job Queue (sqlite or redis)]
        ↓
[N개 Playwright headless worker 풀]
        ↓
[Result indexing (jsonl)]
```

### 6.2 Job 정의
```json
{
  "jobId": "job-20260606-001",
  "scenarioId": "recog-batch-fruit-classification",
  "subCubes": [
    { "time-of-day": 6,  "light-preset": "default" },
    { "time-of-day": 9,  "light-preset": "default" }
    // ...
  ],
  "seeds": ["0xFEED", "0xFACE", "0xBEEF"],
  "outputs": ["coco-json", "mask-png", "depth-png"],
  "outputDir": "s3://phytosim/foundry/job-20260606-001/"
}
```

### 6.3 진행률·재개
- worker가 sub-cube 단위로 작업 → 실패 시 sub-cube 재실행.
- 진행률 streaming (`/foundry/jobs/{id}` REST polling).
- 결과 indexing: `index.jsonl` 한 줄에 `frame_id`, `scenario_id`, `conditions`, `paths`, `seal`.

### 6.4 결정성
- 시드 + 조건 hash로 frame ID 생성.
- 같은 시드·조건 → 같은 frame.
- 재실행 시 기존 frame skip 가능 (idempotent).

## §7. Composer-Foundry 연동

[04-scenario-catalog.md](04-scenario-catalog.md) §Composer의 Variable 토글 → Foundry 매트릭스 자동 promote.

UI:
```
[Workbench]에서 Composer 설정 → "Run as batch" 버튼
       ↓
[Foundry Matrix Builder] (variable로 토글된 dial 자동 채움)
       ↓
[Run] → headless worker pool 시작
```

## §8. 가림(occlusion) 라벨

[05-statement-of-work.md](01-statement-of-work.md) §5.6 D3.

- 각 instance의 `visible_fraction`을 ray cast로 계산:
  ```
  visible_fraction = visible_voxels / total_voxels
  ```
- `occluding_class`: 가린 객체의 cluster 라벨.
- 활용:
  - 인식 모델의 occlusion-aware regression
  - 적과 의사결정 시 "가려진 과실" 식별

## §9. 외주 작업 spec

> Task Card 상세: [03-gap-and-execution-plan.md §3.8](03-gap-and-execution-plan.md#38-task-cards-외주-즉시-작업-가능-단위).

| Task | 산출 | Task Card |
|---|---|---|
| T2 | RTT + mask material + 카메라 패스 | [03 §3.8 T2](03-gap-and-execution-plan.md) |
| T3 | 잎-과실 광학 가림 (ray cast) | [03 §3.8 T3](03-gap-and-execution-plan.md) |
| T10 | 배치 러너 + Job Queue + COCO writer | [03 §3.8 T10](03-gap-and-execution-plan.md) |
| T15 | 시드 16개 × 매트릭스 → ≥10만 장 생성·검증 | [03 §3.8 T15](03-gap-and-execution-plan.md) |

CI 통합:
- COCO 파서 (외부 pycocotools) PASS 자동 검증.
- mask 비공백 (empty mask 차단).
- frame hash 결정성 ([06-reference-truth-railway.md](06-reference-truth-railway.md) §7).

증빙 첨부: [annexes/C-coco-samples/](annexes/C-coco-samples/) — COCO JSON 샘플·mask PNG 10장·통계·pycocotools 로그.

## §10. 검증 (V5 PASS 기준)

[01-statement-of-work.md](01-statement-of-work.md) §7 V5 항목.

| 항목 | 임계 |
|---|---|
| COCO 파서 무오류 | 100% |
| 단일 시드 frame 수 | ≥10,000 |
| segmentation mask 비공백 비율 | 100% |
| 라벨 클래스 분포 (balance) | 각 클래스 ≥1% |
| 메타데이터 sidecar 완전성 | 100% |

## §11. 한 줄

> 7개 dial 매트릭스 × 16 시드 = ~30만 장 합성 데이터 자동 생성. COCO 필수, mask 옵션 B(별도 패스), Reproducibility Seal로 데이터셋 영구 재현. V5 검증은 외부 COCO 파서.
