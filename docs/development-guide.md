# 개발 가이드 — 향후 과제 & 엔진 전환 방법론

---

## 1. 현재 상태 요약

### 완료된 항목
- [x] Apex-driven 생장 모델 (절간 독립 신장)
- [x] 62개 유전 파라미터 기반 개체 변이
- [x] 구조역학 물리 모델 (질량 기반 줄기 굽힘)
- [x] 복엽 잎 절차적 생성 (소엽 5-9개, 톱니, 잎맥 텍스처)
- [x] 6단계 과실 숙성 모델
- [x] 네덜란드식 온실 인프라 (거터, 코코배지, 튜브레일, 유인줄)
- [x] PBR 조명 (IBL + 태양광 + ACES 톤매핑 + Bloom)
- [x] LOD 3단계 시스템
- [x] 과실 클릭 수확 인터랙션
- [x] 120일 타임라인 재생/스크러빙

### 미완료 항목
- [ ] InstancedMesh 최적화 (현재 10주 제한)
- [ ] SSAO 포스트프로세싱 (성능 문제로 비활성)
- [ ] 줄기 낙하 유인 (하강재배 시뮬레이션)
- [ ] 엽면적 지수(LAI) 기반 캐노피 광 차단
- [ ] 로봇 시점 카메라 (고정 위치에서의 뎁스맵)
- [ ] 과실 오클루전 분석 (잎에 가려진 과실 비율)
- [ ] 환경 센서 데이터 연동 (온도, 습도, CO₂)
- [ ] 다중 Row 온실 (현재 단일 Row)
- [ ] 곁순 제거, 적심 등 추가 재배 관리 시뮬레이션

---

## 2. 남은 핵심 과제

### 2.1 성능 최적화 (최우선)

**문제:** 10주에서도 3,500개 개별 메시 → draw call 병목
**목표:** 86주 이상에서 30fps

#### 방법 A: InstancedMesh (추천)

```typescript
// 동일 geometry를 하나의 InstancedMesh로 통합
// 각 인스턴스는 transform matrix만 다름
const leafGeo = createLeafGeometry(params);
const leafInstanced = new THREE.InstancedMesh(leafGeo, leafMaterial, maxLeaves);
for (let i = 0; i < leafCount; i++) {
  const matrix = new THREE.Matrix4();
  matrix.compose(position, quaternion, scale);
  leafInstanced.setMatrixAt(i, matrix);
}
```

- 장점: 1회 draw call로 수천 개 잎 렌더링
- 단점: 잎 크기/형태가 모두 다르면 geometry를 몇 종류로 그룹핑 필요
- 예상 효과: draw call 2,900 → ~100

#### 방법 B: BufferGeometry Merge (차선)

```typescript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// 식물 1그루의 모든 geometry를 하나로 병합
const merged = mergeGeometries(allGeos);
const plantMesh = new THREE.Mesh(merged, sharedMaterial);
```

- 장점: 구현 간단, 식물당 1-2 draw call
- 단점: 동적 업데이트 불가 (잎 제거 시 전체 재생성)

### 2.2 로봇 비전 시뮬레이션

**목적:** 수확 로봇의 카메라가 보는 것과 유사한 영상 생성

필요한 기능:
1. **고정 시점 카메라** — 로봇 팔 위치에서의 뷰
2. **Depth map 출력** — 과실까지 거리 정보
3. **Segmentation map** — 잎/줄기/과실/배경 구분 (색상 코딩)
4. **Occlusion 분석** — 각 과실의 가시 비율 (%)
5. **Bounding box 출력** — 2D/3D bbox (학습 데이터 생성)

#### 구현 방향

```typescript
// 1. 별도 렌더 타겟에 세그멘테이션 렌더
const segTarget = new THREE.WebGLRenderTarget(w, h);
scene.traverse(obj => {
  if (obj.userData.type === 'leaf') obj.material = segMaterials.leaf;
  if (obj.userData.type === 'fruit') obj.material = segMaterials.fruit;
});
renderer.setRenderTarget(segTarget);
renderer.render(scene, robotCamera);

// 2. Depth는 WebGLRenderer.readRenderTargetPixels로 추출
```

### 2.3 하강재배 (Lowering) 시뮬레이션

실제 네덜란드식 토마토 재배에서는 줄기가 유인줄을 따라 위로 자라다가, 와이어 높이(3.5m)에 도달하면 줄기를 아래로 내리면서(lowering) 수평으로 이동시킴.

```
현재: 줄기가 일직선으로 위로만 성장
목표: wireHeight 도달 후 줄기가 수평으로 이동하며 늘어지는 형태

구현:
  - wireHeight 이후 노드는 수평 방향(Row 방향)으로 이동
  - 줄기 경로가 L자 형태
  - StemGenerator가 이 경로를 따라 Catmull-Rom 스플라인 생성
```

---

## 3. 엔진 전환 가이드

### 3.1 현재 아키텍처의 이식성

```
┌─────────────────────────────────────┐
│  이식 가능 (엔진 무관)               │
│                                      │
│  PlantGenome.ts     — 순수 TS       │
│  GrowthModel.ts     — 순수 TS       │
│  PhysicsModel.ts    — 순수 TS       │
│  GrowthEngine.ts    — 순수 TS       │
│  SeededRandom.ts    — 순수 TS       │
│  SunPosition.ts     — Three.Vector3 │
│                       만 교체 필요   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  재구현 필요 (엔진 종속)             │
│                                      │
│  Engine.ts           → 렌더러 교체   │
│  PlantGenerator.ts   → 메시 생성     │
│  StemGenerator.ts    → 메시 생성     │
│  LeafGenerator.ts    → 메시 생성     │
│  FruitGenerator.ts   → 메시 생성     │
│  TrussGenerator.ts   → 메시 생성     │
│  LeafTexture.ts      → 텍스처 생성   │
│  Greenhouse.ts       → 환경 모델링   │
│  HangingBed.ts       → 환경 모델링   │
│  Lighting.ts         → 조명 시스템   │
│  GrowthController.ts → 업데이트 루프 │
└─────────────────────────────────────┘
```

### 3.2 Unreal Engine 전환 (추천)

**추천 이유:**
1. **Nanite** — 수백만 폴리곤 자동 LOD, draw call 문제 근본 해결
2. **Lumen** — 실시간 글로벌 일루미네이션 (SSAO 불필요)
3. **Virtual Shadow Maps** — 수천 개 오브젝트에도 고품질 그림자
4. **Niagara** — 잎 떨림, 물방울 등 파티클 이펙트
5. **물리 엔진 내장** — 줄기/잎 물리를 Chaos Physics로 대체 가능
6. **Blueprint + C++** — 비프로그래머도 파라미터 조정 가능

#### 전환 전략

```
Phase 1: Simulation Core 이식 (1-2주)
  - PlantGenome, GrowthModel, PhysicsModel을 C++ 클래스로 변환
  - PlantState 구조체 정의
  - SeededRandom → FRandomStream (UE 내장)
  - SunPosition → UE의 SunSky actor로 대체

Phase 2: Procedural Mesh 생성 (2-3주)
  - UProceduralMeshComponent 사용
  - StemGenerator → Spline Mesh Component
  - LeafGenerator → Procedural Mesh (또는 Foliage System)
  - FruitGenerator → Static Mesh + Material Instance Dynamic

Phase 3: 환경 구축 (1주)
  - 온실 골조: Static Mesh (Blender에서 모델링 권장)
  - 거터/튜브레일: Spline Mesh
  - 폴리카보네이트: Translucent Material
  - 조명: Directional Light + Sky Light (Lumen)

Phase 4: 로봇 시뮬레이션 (2-3주)
  - SceneCapture2D → RGB + Depth + Segmentation 동시 출력
  - Custom Stencil → 오브젝트 세그멘테이션
  - Unreal에서 직접 학습 데이터 export
```

#### UE5 핵심 이점 비교

| 기능 | Three.js (현재) | Unreal Engine 5 |
|------|----------------|-----------------|
| Draw call 제한 | ~3,000에서 1fps | Nanite: 수백만 폴리곤 OK |
| 그림자 | 1024 shadow map, 좁은 범위 | Virtual Shadow Map: 무한 범위 |
| AO | GTAO 비활성 (성능) | Lumen: 실시간 GI+AO |
| 투명 재질 | transmission 사용 불가 (16× 비용) | Translucent: 정상 비용 |
| 로봇 카메라 | 별도 구현 필요 | SceneCapture + Depth 내장 |
| 물리 | 자체 간단 모델 | Chaos Physics 통합 |

### 3.3 Unity 전환 (대안)

**장점:**
- C# (TypeScript 경험자에게 친숙)
- ML-Agents (로봇 학습 시뮬레이션 통합)
- HDRP (High Definition Render Pipeline)의 SSAO, Bloom 품질
- WebGL 빌드 지원 (웹 배포 유지 가능)

**단점 (Unreal 대비):**
- Nanite 없음 — SRP Batcher + GPU Instancing 수동 설정 필요
- GI 품질 낮음 (Lumen 대비)
- 식물 메시 최적화를 직접 해야 함

#### 전환 시 참고

```
PlantGenome.ts  → PlantGenome.cs (ScriptableObject)
GrowthModel.ts  → GrowthModel.cs (MonoBehaviour 아님, 순수 C# 클래스)
PhysicsModel.ts → PhysicsModel.cs
PlantState      → struct PlantState (value type 권장)

메시 생성:
  Mesh mesh = new Mesh();
  mesh.vertices = ...;
  mesh.triangles = ...;
  // 또는 ProBuilder API 사용
```

### 3.4 전환하지 않고 Three.js 유지 시

**InstancedMesh + geometry 캐싱**으로 86주 30fps 달성 가능 (추정).
다만 아래 기능은 Three.js에서 한계:

| 기능 | Three.js 한계 |
|------|--------------|
| 글로벌 일루미네이션 | 없음 (IBL로 근사) |
| 실시간 AO | GTAO 성능 비용 높음 |
| Subsurface scattering | 잎 투과광 표현 불가 |
| Depth of Field | 가능하나 추가 패스 |
| 물리 시뮬레이션 | 없음 (자체 구현) |
| 대규모 씬 | draw call 수동 관리 |

---

## 4. 코드 컨벤션 & 개발 가이드

### 4.1 파일 구조 규칙

- `simulation/` — Three.js import 금지 (SunPosition.ts의 Vector3 제외)
- `generators/` — PlantState를 입력받아 THREE.Group을 반환
- `environment/` — 정적 환경 오브젝트 생성
- `core/` — 렌더러, 카메라, 제어 기반 인프라

### 4.2 새로운 식물 기관 추가 방법

```
1. PlantGenome.ts에 유전 파라미터 추가
   예: rootLength, rootBranchCount

2. GrowthModel.ts의 computePlantState()에 상태 계산 추가
   예: NodeState에 rootState 필드 추가

3. generators/에 새 생성기 추가
   예: RootGenerator.ts → function generateRoot(state): THREE.Group

4. PlantGenerator.ts에서 조립
   예: group.add(generateRoot(node.rootState))
```

### 4.3 유전 파라미터 조정 팁

```typescript
// PlantGenome.ts의 generateGenome()에서 범위 조정
// 예: 더 큰 잎을 원하면
leafSizeMultiplier: 1.0 + rng.gaussian(0, 0.15),
// → 범위를 넓히면 개체 변이 증가
leafSizeMultiplier: 1.0 + rng.gaussian(0, 0.3),
```

### 4.4 디버깅

```typescript
// main.ts에서 window.__engine으로 런타임 접근 가능
const engine = window.__engine;
engine.renderer.info  // draw call, triangle count
engine.scene.traverse(obj => { ... })  // 씬 탐색
```

---

## 5. 참고 자료

### 토마토 생육 모델
- De Koning, A.N.M. (1994) — *Development and dry matter distribution in glasshouse tomato*
- Heuvelink, E. (2005) — *Tomatoes (Crop Production Science in Horticulture)*
- Jones et al. (1991) — *TOMGRO: A dynamic tomato growth model*

### 네덜란드식 온실 재배
- Priva 온실 자동화 시스템
- HortiDaily (hortiDailey.com) — 온실 재배 기술 뉴스
- 네덜란드 Wageningen University — 온실 연구

### Three.js 최적화
- Three.js InstancedMesh 문서
- BufferGeometryUtils.mergeGeometries
- GTAOPass / SSAOPass 파라미터 가이드

### 수확 로봇 비전
- Agrobot (딸기 수확 로봇)
- AppHarvest / Root AI (토마토 수확)
- Sweeper Project (EU, 고추 수확 로봇)
