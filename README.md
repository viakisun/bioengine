# FarmSim 3D — 스마트팜 토마토 생육 시뮬레이터

네덜란드식 행잉거터 온실 환경에서 토마토(Solanum lycopersicum)의 120일 생육 과정을 3D로 시뮬레이션하는 WebGL 애플리케이션.
수확 로봇 비전 시뮬레이션 및 스마트팜 교육 목적으로 설계됨.

---

## Quick Start

```bash
npm install
npm run dev        # http://localhost:8090
```

빌드:
```bash
npm run build      # dist/ 에 정적 파일 생성
npm run preview    # 빌드 결과 미리보기
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 언어 | TypeScript 5.9 (strict mode) |
| 3D 엔진 | Three.js r183 (WebGL2 / Metal) |
| 번들러 | Vite 8.0 |
| 포스트프로세싱 | EffectComposer (Bloom + ACES Tone Mapping) |
| 물리 | 자체 구현 (탄성 굽힘 모델) |
| 생육 모델 | Apex-driven internode elongation (자체 구현) |

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│                    main.ts (Entry)                   │
│  Engine 초기화 → 환경 구축 → 식물 배치 → 렌더 루프    │
└──────────┬──────────┬──────────┬───────────┬────────┘
           │          │          │           │
     ┌─────▼────┐ ┌───▼────┐ ┌──▼──────┐ ┌──▼────────┐
     │  core/   │ │environ-│ │simula-  │ │generators/│
     │          │ │ment/   │ │tion/    │ │           │
     │ Engine   │ │        │ │         │ │ Plant     │
     │ Controls │ │Green-  │ │Growth-  │ │ Stem      │
     │          │ │house   │ │Controller│ │ Leaf      │
     │          │ │Hanging │ │Growth-  │ │ LeafTex   │
     │          │ │Bed     │ │Engine   │ │ Fruit     │
     │          │ │Lighting│ │Growth-  │ │ Truss     │
     │          │ │SunPos  │ │Model    │ │           │
     │          │ │        │ │Physics  │ │           │
     │          │ │        │ │Genome   │ │           │
     └──────────┘ └────────┘ └─────────┘ └───────────┘
           │                      │              │
           │              ┌───────▼──────┐       │
           │              │  PlantState  │───────┘
           │              │  (데이터 전달)│
           │              └──────────────┘
           │
     ┌─────▼──────────────┐   ┌──────────────┐
     │  interaction/      │   │  ui/         │
     │  FruitPicker       │   │  Timeline    │
     └────────────────────┘   │  InfoPanel   │
                              └──────────────┘
```

### 데이터 흐름

```
PlantGenome (유전 파라미터)
    ↓
GrowthModel.computePlantState(day, genome)
    ↓  [Apex-driven: 노드 생성 → 절간 신장 → 잎 전개 → 과실 발달]
    ↓
PhysicsModel.computePhysics(nodes, genome)
    ↓  [질량 누적 → 줄기 반경 → 굽힘 모멘트 → 탄성 변형]
    ↓
PlantState (노드별 위치, 잎 크기, 과실 상태)
    ↓
PlantGenerator.generate(state) → THREE.Group
    ↓  [줄기 메시 + 잎 메시 + 화방 메시 + 과실 메시]
    ↓
Scene → EffectComposer → Canvas
```

---

## 디렉토리 구조

```
src/
├── main.ts                    # 앱 진입점
├── core/
│   ├── Engine.ts              # WebGL 렌더러, 카메라, 포스트프로세싱
│   └── Controls.ts            # 카메라 오빗 컨트롤
├── environment/
│   ├── Greenhouse.ts          # 온실 골조 (A-frame, 폴리카보네이트 지붕)
│   ├── HangingBed.ts          # 네덜란드식 행잉거터 시스템
│   ├── Lighting.ts            # 태양광 시뮬레이션 (시간대별)
│   └── SunPosition.ts         # 태양 위치 계산 (35°N)
├── simulation/
│   ├── GrowthController.ts    # 생육 애니메이션 오케스트레이터
│   ├── GrowthEngine.ts        # Three.js 비의존 데이터 레이어
│   ├── GrowthModel.ts         # 핵심 생육 모델 (apex-driven)
│   ├── PhysicsModel.ts        # 구조역학 (줄기 굽힘)
│   └── PlantGenome.ts         # 유전 파라미터 62종
├── generators/
│   ├── PlantGenerator.ts      # 3D 식물 조립기
│   ├── StemGenerator.ts       # 줄기 메시 생성
│   ├── LeafGenerator.ts       # 복엽 잎 메시 생성
│   ├── LeafTexture.ts         # 절차적 잎맥 텍스처
│   ├── FruitGenerator.ts      # 토마토 과실 메시
│   └── TrussGenerator.ts      # 화방(花房) 메시
├── interaction/
│   └── FruitPicker.ts         # 과실 클릭 수확 (레이캐스팅)
├── ui/
│   ├── Timeline.ts            # 재생/정지/슬라이더 UI
│   └── InfoPanel.ts           # (예약)
└── utils/
    ├── SeededRandom.ts        # 결정론적 난수 생성기
    └── LSystem.ts             # (예약: L-System 문법 엔진)
```

---

## 상세 문서

| 문서 | 설명 |
|------|------|
| [docs/architecture.md](docs/architecture.md) | 생육 엔진, 렌더링 파이프라인, 알고리즘 상세 |
| [docs/development-guide.md](docs/development-guide.md) | 남은 과제, 엔진 전환 가이드, 개발 방법론 |

---

## 주요 기능

### 생육 시뮬레이션 (120일)
- **Apex-driven 생장**: SAM(정단분열조직)에서 잎 원기 생성 → GA 매개 절간 신장
- **6단계 생육 스테이지**: 육묘기 → 영양생장기 → 개화기 → 착과기 → 과실비대기 → 숙성기
- **62개 유전 파라미터**: Seed 기반 결정론적 변이 (동일 seed = 동일 식물)
- **구조역학**: 과실 하중에 의한 줄기 휨, 잎의 중력 처짐
- **재배 관리**: 하엽 제거 (적엽), 화방 아래 잎 자동 제거

### 온실 환경
- 네덜란드식 행잉거터 (거터 + 코코배지 + 유인줄 + 튜브레일)
- 폴리카보네이트 지붕 (A-frame)
- 시간대별 태양광 시뮬레이션 (35°N 위도)
- IBL 환경맵 (절차적 하늘)

### 렌더링
- PBR 머티리얼 (MeshStandardMaterial)
- ACES Filmic 톤매핑 + UnrealBloom
- PCF 소프트 그림자
- 절차적 잎맥 텍스처 (Color + Normal map)
- LOD 시스템 (카메라 거리 기반 3단계)

---

## 라이선스

Private — 내부 사용 전용
