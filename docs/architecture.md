# 아키텍처 상세 — 생육 엔진 & 렌더링 파이프라인

---

## 1. 시스템 레이어 구조

```
┌───────────────────────────────────────────────────┐
│                  Presentation Layer                 │
│  UI (Timeline, InfoPanel) + Interaction (Picker)   │
├───────────────────────────────────────────────────┤
│                  Rendering Layer                    │
│  Engine + PostProcessing + Generators + Materials   │
├───────────────────────────────────────────────────┤
│                  Simulation Layer                   │
│  GrowthModel + PhysicsModel + GrowthEngine         │
├───────────────────────────────────────────────────┤
│                  Data Layer                         │
│  PlantGenome + PlantState + SeededRandom            │
└───────────────────────────────────────────────────┘
```

**핵심 설계 원칙:**
- **Simulation Layer는 Three.js에 의존하지 않음** — `GrowthEngine`, `GrowthModel`, `PhysicsModel`, `PlantGenome`은 순수 수학/데이터 코드
- **Rendering Layer만 Three.js 의존** — 엔진 교체 시 이 레이어만 다시 구현
- **PlantState 인터페이스가 두 레이어를 연결** — Simulation → PlantState → Rendering

---

## 2. 생육 엔진 (Simulation Layer)

### 2.1 PlantGenome — 유전 파라미터 (62종)

`generateGenome(seed)` 함수가 Seed에서 결정론적으로 62개 파라미터를 생성.

| 카테고리 | 파라미터 예시 | 범위 |
|----------|-------------|------|
| 성장 곡선 | `heightMaxCm`, `heightSigmoidK`, `heightSigmoidMid` | 160-200cm, 0.07-0.09, 38-42 |
| 노드 생성 | `nodeStartDay`, `nodeInterval`, `phyllotaxisBase` | 6-8일, 2.5-3.5일, 130-140° |
| 잎 형태 | `leafSizeMultiplier`, `leafletCountBias`, `leafDroop` | 0.8-1.2, -1~+1, 10-30° |
| 화방/과실 | `trussStartNode`, `trussInterval`, `maxFruitDiameterMm` | 8-10, 3, 55-75mm |
| 생체역학 | `stemStrength`, `youngsModulus`, `wireHeight` | 0.7-1.3, 2.5-4.5 GPa, 2.8-3.2m |
| 절간 생물학 | `internodeLenCm`, `internodeElongDelay`, `internodeElongMid` | 5.5-7.5cm, 3-5일, 6-10일 |

### 2.2 GrowthModel — Apex-Driven 생장 알고리즘

**핵심 개념:** 전체 높이를 sigmoid로 결정하지 않고, 각 절간이 독립적으로 신장.

```
Plant Height = Hypocotyl(하배축) + Σ(각 절간의 현재 길이)
```

#### 2.2.1 노드 생성 (Phyllotaxis)

```
노드 수 = (day - nodeStartDay) / nodeInterval + 1
```

- SAM(정단분열조직)이 `nodeInterval` (2.5-3.5일) 마다 새 노드를 생성
- Phyllotaxis angle: ~137.5° (황금각) ± jitter
- 최대 50개 노드 (120일 생육)

#### 2.2.2 절간 신장 (Internode Elongation)

```typescript
// 각 절간이 독립적인 sigmoid 곡선으로 신장
elongAge = (currentDay - nodeCreationDay) - ELONGATION_DELAY  // 3-5일 지연
elongation = sigmoid(elongAge, k=0.4, mid=8)

currentLength = finalLength × elongation
```

**생물학적 근거:**
1. SAM에서 잎 원기 생성 (Day 0)
2. 잎이 전개되어 GA(지베렐린) 생산 시작 (Day 3-5)
3. GA가 아래 절간으로 이동, 세포 신장 촉진 (Day 5-7)
4. 절간이 sigmoid 곡선으로 최종 길이까지 신장 (Day 5-25)

**효과:**
- Day 10: 로제트 형태 (잎이 꼭대기에 압축, 줄기 거의 안 보임)
- Day 25: 하부 절간 신장 시작, 잎 간격 벌어짐
- Day 50+: 모든 절간 완전 신장, 기존 모델과 유사

#### 2.2.3 잎 전개 (Leaf Expansion)

```typescript
leafAge = currentDay - nodeCreationDay
expansion = sigmoid(leafAge, leafExpK=0.35, mid=7)
leafSize = leafSizeGenome × expansion × vigor
```

- 잎은 생성 후 14-21일에 걸쳐 최종 크기 도달
- Vigor = `4S(1-S)` (성장 중반에 가장 큰 잎)

#### 2.2.4 화방 & 과실 발달

```
화방 위치: node index = trussStartNode + n × trussInterval
개화: nodeCreationDay + 10일
수분: 개화 후 3-5일
과실 성장: 수분 후 sigmoid (40일)
숙성: 6단계 (Green → Breaker → Turning → Pink → Light Red → Red)
```

#### 2.2.5 물리 모델 (PhysicsModel)

```
각 노드에 대해 (위→아래 순회):
  1. 누적 질량 = Σ(위 노드의 줄기질량 + 잎질량 + 과실질량)
  2. 줄기 반경 = allometric(질량) — 12mm(기부) → 2mm(정단)
  3. 굽힘 모멘트 = 누적질량 × 중력 × 레버암
  4. 탄성 변형 = M / (E × I) — E=Young's modulus, I=단면2차모멘트
  5. 변형 방향 = 과실 무게 중심 방향 + 유전적 편향
```

### 2.3 GrowthEngine — 렌더러 독립 데이터 레이어

```typescript
class GrowthEngine {
  addPlant(seed: number): PlantGenome      // 식물 등록
  computeState(seed, day): PlantState       // 특정 일의 상태 계산
  getSnapshot(day): SimulationSnapshot      // 전체 식물 상태
  toJSON(day): string                       // 직렬화 (API 전송용)
}
```

**Three.js 코드 없음** — Unity, Unreal, 혹은 서버사이드에서도 그대로 사용 가능.

---

## 3. 렌더링 파이프라인 (Rendering Layer)

### 3.1 Engine 초기화

```
WebGLRenderer (antialias, PCFSoftShadow, sRGB)
    ↓
Scene (sky background + fog)
    ↓
PMREMGenerator → 절차적 환경맵 (IBL)
    ↓
EffectComposer
  ├── RenderPass (씬 렌더링)
  ├── UnrealBloomPass (strength=0.15, threshold=0.85)
  └── OutputPass (ACES Filmic tone mapping, exposure=1.2)
```

### 3.2 조명 시스템

```
태양광 (DirectionalLight)
  ├── 강도: state.intensity × 4.5 × 0.78(폴리카보네이트 투과율)
  ├── 색온도: 2500K(일출) → 5500K(정오) → 2500K(일몰)
  ├── 그림자: PCFSoft, 1024×1024, frustum -6~+6
  └── 태양 위치: 35°N 위도 태양고도 계산

반구광 (HemisphereLight)
  ├── 하늘: 0xe8e4d8 (폴리카보네이트 산란광)
  ├── 지면: 0x3a3530 (어두운 반사)
  └── 강도: 0.2 + intensity × 0.2

환경광 (AmbientLight)
  └── 강도: 0.10 + intensity × 0.08 (순흑 방지 최소치)

보조광 (Fill DirectionalLight)
  └── 강도: 0.1 (온실 측벽 투과광)
```

**설계 원칙:** 태양이 총 조도의 67%+ 차지 → 명확한 광원 방향성

### 3.3 머티리얼 체계

| 오브젝트 | 머티리얼 | 주요 설정 |
|----------|---------|----------|
| 잎 | MeshStandardMaterial | roughness 0.65, 불투명, DoubleSide, envMap 0.2 |
| 줄기 | MeshStandardMaterial | roughness 0.7, 녹색 |
| 과실 | MeshPhysicalMaterial | clearcoat 0.3, roughness 0.28 |
| 온실 프레임 | MeshStandardMaterial | roughness 0.30, metalness 0.75 (아연도금) |
| 지붕 패널 | MeshStandardMaterial | transparent, opacity 0.25 |
| 코코배지 | MeshStandardMaterial | roughness 0.85 (유기물) |

**주의:** `MeshPhysicalMaterial.transmission`은 사용하지 않음 — 패널당 씬 전체 재렌더링 발생으로 심각한 성능 저하.

### 3.4 3D 메시 생성 (Generators)

#### 줄기 (StemGenerator)
```
노드 위치 배열 → Catmull-Rom 스플라인 → TubeGeometry
  - 반경: PhysicsModel에서 계산한 tapered radius
  - 세그먼트: 노드 간 8개 보간점
  - 색상: 녹색(상부) → 갈색(기부) 그라데이션
```

#### 잎 (LeafGenerator)
```
복엽 구조:
  잎자루(petiole) → 엽축(rachis) → 소엽(leaflet) × 5-9개

  각 소엽:
    타원형 기본 → 톱니(serration) 3-5쌍 → 곡면 왜곡(waviness)

  텍스처:
    256×256 Canvas → 엽맥 패턴(Bezier) → Color + Normal map
    중심맥(midrib) + 2차맥 6쌍 + 표면 노이즈
```

#### 화방 (TrussGenerator)
```
화경(peduncle) → 소화경(pedicel) × N개
  ├── 꽃 메시 (노란색 5-6판, 개화 중일 때)
  └── 과실 메시 (sphere + 꽃받침 calyx)
      - 불규칙 구형 (noise 변형)
      - 6단계 숙성 색상
      - 과실 질량에 의한 화방 처짐
```

### 3.5 LOD (Level of Detail) 시스템

| LOD 단계 | 카메라 거리 | 잎 메시 | 과실 메시 | 줄기 |
|----------|-----------|---------|----------|------|
| Full | < 3m | 복엽 (5-9 소엽) | 개별 구 + 꽃받침 | Tube spline |
| Medium | 3-8m | 3개 타원 오버레이 | 단순 구 | Cylinder |
| Simple | > 8m | 십자 평면 2장 | 구 클러스터 | Line |

### 3.6 환경 맵 (IBL)

```glsl
// 절차적 하늘 셰이더 (SphereGeometry + ShaderMaterial)
sky = mix(horizonColor, topColor, pow(y, 0.4))    // 위쪽
sky = mix(horizonColor, bottomColor, pow(-y, 0.6)) // 아래쪽
sky += sunColor × (pow(dot, 8) × 0.5 + pow(dot, 256) × 3.0)  // 태양 디스크 + 글로우

→ PMREMGenerator.fromScene() → scene.environment (간접광에 사용)
```

---

## 4. 온실 인프라 모델

### 4.1 행잉거터 시스템 (HangingBed.ts)

```
높이 기준 (바닥=0):

3.5m ─── 유인줄 고정선 (training wire) × 2본
  │       │
  │     유인줄 (training string) 0.35m 간격, 수직
  │       │
0.75m ── 거터 (V-channel, 240mm × 80mm)
  │       ├── 코코배지 (200mm × 75mm, 1m 간격)
  │       └── 점적관수 라인 (4mm PE)
  │
0.30m ── 튜브레일 × 2본 (51mm, 500mm 간격)
  │       └── 지지 브라켓 (3m 간격)
  │
0.00m ── 콘크리트 바닥 + 통로
```

### 4.2 온실 골조 (Greenhouse.ts)

```
A-frame 구조:
  - 4m 간격 리브
  - 측면 높이 4m, 용마루 5m
  - 폴리카보네이트 지붕 패널 (opacity 0.25)
  - 아연도금 파이프 (40mm)
```

---

## 5. 인터페이스 정의 (핵심 타입)

### PlantState

```typescript
interface PlantState {
  day: number;
  heightCm: number;
  nodes: NodeState[];
  stage: string;           // '육묘기' | '영양생장기' | ...
  stageColor: string;
  genome: PlantGenome;
}
```

### NodeState

```typescript
interface NodeState {
  index: number;
  heightCm: number;
  angle: number;           // phyllotaxis (rad)
  leafSizeFactor: number;  // 0-1
  leafExpansion: number;   // 0-1 (전개율)
  leafDroopRad: number;    // 중력 처짐
  hasLeaf: boolean;
  pruned: boolean;         // 적엽 여부
  truss?: TrussState;
  stemRadiusMm?: number;
  deflectionRad?: number;  // 줄기 휨 각도
  deflectionAzimuth?: number;
}
```

### FruitState

```typescript
interface FruitState {
  diameterMm: number;
  ripenStage: number;      // 0-5
  ripenName: string;       // 'Green' → 'Red'
  daysSincePollination: number;
}
```

---

## 6. 성능 프로파일

### 현재 병목 (10주 기준, Day 90)

| 항목 | 수치 |
|------|------|
| 총 메시 수 | ~3,500개 |
| Draw calls | ~2,900회 |
| 삼각형 수 | ~640K |
| Geometry 수 | ~3,000개 |
| Shadow casters | ~260개 |

### 성능에 영향을 주는 주요 요인

1. **개별 메시 draw call** — 잎, 줄기 세그먼트, 소엽이 모두 개별 오브젝트
2. **Shadow map** — castShadow 메시 수 × shadow pass
3. **MeshPhysicalMaterial.transmission** — 사용 시 패널당 씬 재렌더링 (현재 비활성)
4. **Bloom 포스트프로세싱** — 4-pass downscale + blur

### 최적화 기회

| 방법 | 예상 효과 | 난이도 |
|------|----------|--------|
| InstancedMesh (잎) | Draw call 90% 감소 | 중 |
| BufferGeometry merge (식물별) | Draw call 80% 감소 | 중 |
| Geometry 캐싱 (동일 크기 잎 재사용) | Memory 50% 감소 | 하 |
| LOD 거리 조정 | Draw call 상황 의존 | 하 |
| Shadow map cascading | 그림자 품질 유지 + 범위 확대 | 중 |
