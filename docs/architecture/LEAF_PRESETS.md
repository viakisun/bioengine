# Leaf Age Presets — 5 종 (Iter 36 v5)

> 사용자 botanical reference §7 직접 인용. 각 cultivar는 5 preset의 _사용 비율_을
> 지정 (`growthProfile.leafPresetDistribution`).

본 문서는 5 leaf age preset의 botanical 특성과 코드 매핑입니다.

---

## 5 Preset 표

### A. young — 어린 잎 / 위쪽 새잎

```
leafLength          2~8cm
majorLeafletPairs   1~2
intercalary         0~2
aspectRatio         1.2~1.8 (둥근)
serrationAmp        낮음
lobeDepth           낮음~중간
color               밝은 연녹색
pose                위로 말림, 덜 펼쳐짐 (droopDeg -15 ~ -5)
```

형태는 작고 덜 복잡하며, 소엽도 둥근 편.

### B. mature — 보통 성숙 잎 ★ 기본 60-70%

```
leafLength          10~25cm
majorLeafletPairs   2~4
intercalary         2~6
aspectRatio         1.8~3.0
serrationAmp        중간
lobeDepth           중간
pose                수평 또는 약간 아래 (droopDeg -5 ~ +15)
```

기본 토마토 잎. 60-70% 비율로 가장 많이 사용.

### C. old — 오래된 아래쪽 잎

```
leafLength          14~28cm
majorLeafletPairs   3~4
intercalary         3~8
aspectRatio         2.0~3.5
serrationAmp        중간~강함
lobeDepth           중간~강함
pose                아래로 처짐 (droopDeg +15 ~ +35)
edgeDamage          약간
curl                큼 (0.4)
color               yellowing
```

완전히 예쁜 대칭보다 **처짐, 비틀림, 가장자리 손상, 일부 소엽 축소**.

### D. complex — 복잡한 잎

```
leafLength          16~30cm
majorLeafletPairs   4
intercalary         5~10
secondary           3~8
lobeDepth           강함
serrationFreq       높음
asymmetry           큼 (0.3 baseline + correlation)
```

토마토 잎 특유의 "복잡한 덤불 같은 느낌".

### E. potato-leaf — _토마토_ potato-leaf trait (smooth-margin tomato leaf)

★ **_감자 잎이 아닙니다_** (★ L8-0 명명 명확화).

`potato-leaf`는 _토마토_ cultivar 중 **smooth-margin variant** 학명입니다.
UC ANR (University of California Agriculture and Natural Resources)에서
'regular leaf tomato' (scalloped/serrated edge)와 대비되는 토마토 leaf type
분류로 등록.

실 cultivars: **Brandywine, Pruden's Purple, Mortgage Lifter** 등.

```
leafLength          보통보다 1.1~1.4배 (leafLengthFactor 1.2)
leafletCount        적게 (leafletCountFactor 0.7)
aspectRatio         1.3~2.2
serrationAmp        거의 없음 (smoothMargin = true) ★ L8-1 실제 적용
lobeDepth           낮음
surfaceWrinkle      품종에 따라 중간~강함
```

botanical reference (UC ANR):
- regular leaf tomato — scalloped/serrated edge
- potato-leaf tomato — smooth margin + 더 큰 잎

---

## Cultivar별 사용 비율 (Iter 36 v5 Phase F)

| Cultivar | young | mature | old | complex | potato-leaf |
|---|---|---|---|---|---|
| cherry-generic | 30% | 60% | 5% | 5% | 0 |
| round-generic (baseline) | 20% | 65% | 10% | 5% | 0 |
| roma-generic | 25% | 60% | 10% | 5% | 0 |
| tomimaru-muchoo | 15% | 60% | 15% | 10% | 0 |
| beefsteak-generic | 15% | 50% | 20% | 15% | 0 |

★ potato-leaf 0% 모두 (비-potato 품종). Iter 37+에서 별도 cultivar JSONC 추가 시
5% 정도로 활성화.

---

## 코드 위치

| 영역 | 파일 |
|---|---|
| Preset table | `src/scene/leaf/agePresets.ts` |
| Cultivar 분포 (5 JSONC) | `packages/tomato-engine/models/cultivars/*.jsonc` |
| Schema | `packages/tomato-engine/src/CultivarGrowthProfile.ts` (`leafPresetDistribution`) |
| Sampling 산식 | `src/scene/leaf/index.ts` (`buildCompoundLeaf`) |

---

## Procedural 변환 흐름

```
1. Skeleton populator (buildTomatoSkeletonGraph)
   → 각 leaf-blade-root에 LeafBladeRef.agePreset 지정 (sizeFactor 기반 baseline)

2. Rendering engine (leaf/index.ts)
   → AGE_PRESETS[agePreset] lookup
   → applyCorrelation(complexity, preset) → ResolvedLeafParams
   → 각 leaflet에 shape + lobe + serration + pose 적용
```

---

## References (사용자 제공)

- [PLB Lab — Tomato Leaf Anatomy](https://labs.plb.ucdavis.edu/rost/tomato/Leaves/leafanat.html)
- [NC State — Plant Toolbox: Solanum lycopersicum](https://plants.ces.ncsu.edu/plants/solanum-lycopersicum/)
- [UC ANR — Tomato Leaf Shapes and Sunscald](https://ucanr.edu/blog/savvy-sage/article/tomato-leaf-shapes-and-sunscald)
- [NC State Extension Handbook — Botany](https://content.ces.ncsu.edu/extension-gardener-handbook/3-botany)

## Related Documentation

- [SKELETON_3TIER.md](./SKELETON_3TIER.md) — 3-tier 데이터 흐름
- [LEAF_ONTOGENY.md](./LEAF_ONTOGENY.md) — 6단계 botanical model
- [LEAF_VARIATION_RULES.md](./LEAF_VARIATION_RULES.md) — correlation rules
