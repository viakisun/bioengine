# Annex C — COCO Samples

**책임**: 외주사 + 인식 알고리즘 파트너
**채움 시점**: T15 (Phase 3) 완료 시 자동 생성
**검수**: 인식 알고리즘 파트너 (V5 PASS 판정 + 외부 COCO 파서)

## 채워야 할 파일

### 자동 생성 (T15)
- `coco.json` — 100~1000 frame 샘플 (전체 데이터셋의 통계적 대표 sample)
- `mask-001.png` ~ `mask-010.png` — segmentation mask 샘플 10장
- `mask-grid.png` — 위 10장을 2×5 grid 합성
- `class-distribution.csv` — 라벨 클래스 분포 통계 (전체 데이터셋 기준)
- `occlusion-distribution.csv` — `visible_fraction` 분포
- `pycocotools.log` — 외부 COCO 파서 검증 로그
- `meta.json` — 데이터셋 메타 (시드 list · 매트릭스 차원 · seal list)

### 외부 데이터셋 (인수 시 별도 저장소)
- 전체 데이터셋 (≥10만 장)은 S3 또는 동급 저장소에 별도 저장.
- 본 폴더에는 위 sample + index URL만 commit.

## 검증 절차

[07-foundry-batch-and-labels.md](../../07-foundry-batch-and-labels.md) §10 참조.

1. COCO JSON 외부 pycocotools 로 PASS 확인
2. mask 비공백 비율 100%
3. 라벨 클래스 분포 balance ≥1%
4. 가림 attribute 분포 정상
5. reproducibility seal 메타데이터 무결성

## 검수 체크리스트

- [ ] coco.json 파서 무오류 (pycocotools.log)
- [ ] mask 10장 모두 비공백
- [ ] 라벨 클래스 ≥1% (class-distribution.csv)
- [ ] meta.json에 seal list 기록
- [ ] 전체 데이터셋 저장소 URL 공유 (내부 Notion/Confluence link)
- [ ] 인식 알고리즘 파트너 sign-off
