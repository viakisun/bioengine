# Leaf Variation Correlation Rules (Iter 36 v5)

> 사용자 botanical reference §8 직접 인용. variation을 _완전 random_으로 하면
> 잎이 이상해짐. **묶음으로 변해야** 자연스러움.

본 문서는 leaf의 correlation rules와 procedural noise 산식입니다.

---

## 묶음 변화 원칙 (사용자 §8)

### 잎이 클수록

```
잎이 클수록
→ 소엽 수 증가
→ intercalary leaflet 증가
→ serration 증가
→ 처짐 증가
```

### 어린 잎일수록

```
어린 잎일수록
→ 작음
→ 둥근 소엽
→ 톱니 약함
→ 잎자루와 소엽이 위로 들림
```

### 복잡한 잎일수록

```
복잡한 잎일수록
→ primary leaflet 많음
→ secondary/intercalary 많음
→ 좌우 비대칭 증가
→ outline이 더 울퉁불퉁함
```

### potato-leaf일수록

```
potato-leaf일수록
→ 소엽 경계가 덜 분리됨
→ 가장자리 톱니 감소
→ 넓고 부드러운 덩어리 형태
```

---

## 산식 (correlationRules.ts)

`complexity` seed (0-1)가 모든 fields를 _동시_ 변경:

| 출력 | 산식 |
|---|---|
| `leafLengthM` | `lerp(preset.leafLengthCmRange, c) × factor / 100` |
| `primaryPairs` | `floor(lerp(preset.majorLeafletPairsRange, c) × leafletFactor)` |
| `intercalaryCount` | `floor(lerp(preset.intercalaryRange, c²))` ★ **complexity² (큰 잎에서 더 빠르게)** |
| `secondaryCount` | `floor(lerp(preset.secondaryRange, c))` |
| `aspectRatio` | `lerp(preset.aspectRatioRange, c)` |
| `serrationAmp` | `lerp(preset.serrationAmpRange, c)` |
| `serrationFreq` | `floor(10 + c × 18)` (10-28 한쪽당) |
| `lobeDepth` | `lerp(preset.lobeDepthRange, c)` |
| `asymmetry` | `0.02 + c × 0.06` (2-8% rachis offset) |
| `poseDroopDeg` | `lerp(preset.poseDroopDegRange, c)` |

★ `complexity²` for intercalary — 큰 잎에서 _더 빠르게_ 증가 (사용자 §8 "잎이 클수록
→ intercalary↑").

---

## Procedural Noise 산식 (사용자 §5)

### 기본 shape (shapeProfile.ts)

```
x = 0.0 at base, 1.0 at tip
baseWidth(x) = sin(π × x) ^ shapePower
```

- `shapePower < 1`: 둥근 (mid_width 우세)
- `shapePower > 1`: 뾰족 (tip 우세)

좌우 비대칭:
```
asymmetryOffset = asymmetry × baseWidth
halfWidthLeft  = max(0, baseWidth - asymmetryOffset × 0.5)
halfWidthRight = max(0, baseWidth + asymmetryOffset × 0.5)
```

### 큰 lobe noise (lobeNoise.ts)

낮은 빈도, 큰 진폭 — 잎 outline에 _큰 갈라짐_.

```
lobeNoise(u) = max(0, sin(2π × f1 × u + p1) × 0.5
                + sin(2π × f2 × u + p2) × 0.3
                + sin(2π × f3 × u + p3) × 0.2) × amp

freq1 ∈ [2.0, 3.5] Hz
freq2 ∈ [3.7, 4.9] Hz
freq3 ∈ [5.1, 6.1] Hz
phase ∈ seed 기반 deterministic
```

### 작은 톱니 (serrationNoise.ts)

높은 빈도, 작은 진폭 — 가장자리 거칠게.

```
triangleWave(x) = x < 0.5 ? x × 2 : 2 - x × 2  (period 1)
serrationNoise(u) = triangleWave(u × freq + phase) × amp

amp ≤ 0 || freq ≤ 0 → 0  (potato-leaf smoothMargin)
```

### Pose individual variation (poseVariation.ts)

각 leaflet마다 high-frequency variation:

```
attachAngleDeg (rachis 기준):
  terminal:    0°
  primary:     55-65° (60 + seed%10 - 5)
  secondary:   70-85°
  intercalary: 75-85°

pitchDeg = poseDroopDeg + sin(seed × 1.3 + rachisU × 6) × 5  (±5° noise)
rollDeg  = sin(seed × 2.7) × 18                              (±18° 말림)
twistDeg = sin(seed × 3.1 + rachisU × 4) × 12                (±12°)
```

사용자 §6 명시:
> "왼쪽 소엽은 조금 처지고, 오른쪽 소엽은 조금 위로 들리고, 끝소엽은 빛 방향으로
> 살짝 틀어짐"

각 leaflet은 _같은 평면 부착 금지_ — 자연스러움 핵심.

---

## Deterministic Seed

모든 procedural noise는 `seed` 입력 (leaf instance ID 기반 djb2 hash):

```ts
// LeafGenerator.ts
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

const seed = hashStr(leafName);  // 같은 leaf instance = 같은 seed = 같은 mesh
```

→ Re-render 시 mesh _완전 동일_. Frame-별 jitter 부재 (사용자 결정 보존).

---

## Cultivar 간 차이

cultivar별 `leafPresetDistribution` (LEAF_PRESETS.md) + `growthProfile` 차이로
variation 강도 자동 조절:

| Cultivar | mature 비율 | complex 비율 | 결과 |
|---|---|---|---|
| cherry | 60% | 5% | 단순 + 균일 |
| round | 65% | 5% | baseline |
| beefsteak | 50% | 15% | 복잡 + 다양 |

---

## References (사용자 §5, §8)

- [PLB Lab — Tomato Leaf Anatomy](https://labs.plb.ucdavis.edu/rost/tomato/Leaves/leafanat.html)
  - "잎맥은 가운데 큰 맥에서 옆맥이 나오고, 다시 더 작은 맥으로 갈라지는 그물맥
    구조" — vertex 배치 시 midrib → lateral vein → edge tooth/lobe 방향 권장.

## Related Documentation

- [SKELETON_3TIER.md](./SKELETON_3TIER.md) — 3-tier 데이터 흐름
- [LEAF_ONTOGENY.md](./LEAF_ONTOGENY.md) — 6단계 botanical model
- [LEAF_PRESETS.md](./LEAF_PRESETS.md) — 5 age presets
