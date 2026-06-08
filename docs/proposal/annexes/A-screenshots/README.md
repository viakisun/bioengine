# Annex A — Screenshots & Videos

**책임**: 외주사 / 사내 구현 시 Playwright headless 자동
**채움 시점**: Phase 3 시나리오 통과 시 즉시 추가, S7 검수 직전 완성
**검수**: 비아 PM·디자이너

## 자동 캡처 (W3.h — sleepy-roaming-lagoon §18.8)

```bash
# 1. dev server 기동 (다른 터미널)
pnpm dev

# 2. Playwright headless 자동 캡처 (20 시나리오 + 모드 메인 PNG)
pnpm playwright test tests/architecture/_probe-scenario-20.spec.ts

# 3. 결과 복사
cp -r test-results/scenarios/*.png docs/proposal/annexes/A-screenshots/scenarios/
```

Spec 파일: [`tests/architecture/_probe-scenario-20.spec.ts`](../../../../tests/architecture/_probe-scenario-20.spec.ts).
모드 메인 3장 (workbench-main, foundry-matrix, twin-heatmap)은 spec에 추가하거나 수동 캡처.

## 채워야 할 파일

### 모드별 메인 (4장)
- `workbench-main.png` — Workbench 메인 화면 (scenario thin-D70-truss3-multi, D70, 객관 카메라)
- `workbench-ee.png` — Workbench end-effector 뷰 (위 시나리오, 2번 단축키, T3 화방 접근)
- `foundry-matrix.png` — Foundry Matrix Setup (recog-batch-fruit-classification, 7 차원 체크)
- `foundry-progress.png` — Foundry 진행률 (30~80% 사이, WS 연결 표시)
- `twin-heatmap.png` — Twin zone heatmap (bed 3~7, 다구역 모드)

### 시나리오 통과 갤러리
`scenarios/` 서브폴더에 15종 시나리오 각 1장.
- `scenarios/drive-D15-standard-sunny.png`
- `scenarios/drive-D45-standard-overcast.png`
- `scenarios/drive-D90-narrow-sunny.png`
- `scenarios/drive-D90-narrow-backlit.png`
- `scenarios/drive-multi-bed-traverse.png`
- `scenarios/thin-D50-truss1-single.png`
- `scenarios/thin-D70-truss3-multi.png`
- `scenarios/thin-D90-multi-truss.png`
- `scenarios/thin-occluded-fruit.png`
- `scenarios/prune-D40-sucker-only.png`
- `scenarios/prune-D80-apex-topping.png`
- `scenarios/spray-D60-high-LAI.png`
- `scenarios/recog-batch-fruit-classification.png`
- `scenarios/recog-batch-organ-segmentation.png`
- `scenarios/recog-batch-occlusion.png`
- `scenarios/_index.png` — 15장 4×4 grid 합성

### 모드 전환 영상 (옵션)
- `mode-transition.mp4` — Workbench → Foundry → Twin 전환 ≤1초 데모 (V6)

## 캡처 규약

- **해상도**: 1280×720 PNG (시나리오 갤러리는 800×450 OK)
- **포함 요소**: 헤더 ValueChip (V1~V5) + WireStatus (Twin) + PassFailChip
- **개인정보**: 시연자 ID·실측 데이터 path 등 마스킹
- **파일명**: kebab-case, ASCII only
- **메타데이터**: 각 PNG의 EXIF 또는 sidecar `.json` 에 `scenarioId` · `seed` · `reproducibilitySeal` 기록

## 검수 체크리스트

- [ ] 모드별 메인 4장 모두 첨부
- [ ] 시나리오 갤러리 15장 + _index.png 첨부
- [ ] 모든 PNG가 1280×720 (또는 800×450)
- [ ] ValueChip 가시
- [ ] reproducibility seal 메타데이터 기록
