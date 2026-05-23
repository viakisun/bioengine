// SkeletonTab — controls for the SkeletonOverlay (Plan 3a Phase ζ).
// 두께 / 색상 / 표시 토글 / 곡선 sampling. localStorage 자동 저장
// (twinStore subscribe).
//
// 같은 UI 패턴 (Eyebrow + SliderRow + ColorRow + ToggleBtn) 을 LightingTab
// 에서 빌려 일관성 유지.

import { useTwinStore } from '../store/twinStore';
import type { SkeletonConfig } from '../store/twinStore';
import { Eyebrow } from '../ui/Eyebrow';
import { SliderRow, ColorRow, ToggleBtn } from '../ui/Controls';

type WidthKey =
  | 'axisMainWidth' | 'axisOrder1Width' | 'axisOrder2Width'
  | 'petioleWidth' | 'rachisWidth' | 'pedicelWidth' | 'calyxWidth';

type ColorKey =
  | 'axisMainColor' | 'axisOrder1Color' | 'axisOrder2Color'
  | 'petioleColor' | 'rachisColor' | 'pedicelColor' | 'calyxColor';

type ToggleKey =
  | 'showPetiole' | 'showTruss' | 'showCalyx'
  | 'showFruitDots' | 'showDormantBuds' | 'showPrunedBuds';

export function SkeletonTab() {
  const skel = useTwinStore((s) => s.skeleton);
  const set = useTwinStore((s) => s.setSkeleton);
  const reset = useTwinStore((s) => s.resetSkeleton);
  const showSkeleton = useTwinStore((s) => s.showSkeleton);
  const setShowSkeleton = useTwinStore((s) => s.setShowSkeleton);
  const debugDiag = useTwinStore((s) => s.debugDiagnostics);
  const setDebugDiag = useTwinStore((s) => s.setDebugDiagnostics);

  const widthSlider = (key: WidthKey, label: string) => (
    <SliderRow
      label={label}
      value={skel[key] * 1000}                  // m → mm 표시
      onChange={(v) => set({ [key]: v / 1000 } as Partial<SkeletonConfig>)}
      valueText={`${(skel[key] * 1000).toFixed(1)} mm`}
      min={0.5}
      max={12}
      step={0.1}
    />
  );

  const colorPicker = (key: ColorKey, label: string) => (
    <ColorRow
      label={label}
      value={skel[key]}
      onChange={(hex) => set({ [key]: hex } as Partial<SkeletonConfig>)}
    />
  );

  const toggleBtn = (key: ToggleKey, label: string) => (
    <ToggleBtn on={skel[key]} onClick={() => set({ [key]: !skel[key] } as Partial<SkeletonConfig>)}>
      {label} {skel[key] ? 'ON' : 'OFF'}
    </ToggleBtn>
  );

  return (
    <div className="panel env-panel">
      <Eyebrow>표시 모드</Eyebrow>
      <ToggleBtn
        on={showSkeleton}
        onClick={() => setShowSkeleton(!showSkeleton)}
      >
        Skeleton {showSkeleton ? 'ON' : 'OFF'}
      </ToggleBtn>
      <div className="quality-note">
        ON 일 때 실제 mesh 가 hide 되고 wireframe + node 마커만 표시됩니다.
      </div>

      <Eyebrow>곡선 sampling</Eyebrow>
      <SliderRow
        label="Subdivisions / Internode"
        value={skel.subdivisionsPerInternode}
        onChange={(v) => set({ subdivisionsPerInternode: Math.round(v) })}
        valueText={`${skel.subdivisionsPerInternode}`}
        min={1}
        max={10}
        step={1}
      />

      <Eyebrow>줄기 두께</Eyebrow>
      {widthSlider('axisMainWidth', '메인 줄기')}
      {widthSlider('axisOrder1Width', '1차 곁가지')}
      {widthSlider('axisOrder2Width', '2차 곁가지')}
      {widthSlider('petioleWidth', '잎자루')}
      {widthSlider('rachisWidth', '꽃대 (Rachis)')}
      {widthSlider('pedicelWidth', '꼭지 (Pedicel)')}
      {widthSlider('calyxWidth', '꽃받침 (Calyx)')}

      <Eyebrow>색상</Eyebrow>
      {colorPicker('axisMainColor', '메인 줄기')}
      {colorPicker('axisOrder1Color', '1차 곁가지')}
      {colorPicker('axisOrder2Color', '2차 곁가지')}
      {colorPicker('petioleColor', '잎자루')}
      {colorPicker('rachisColor', '꽃대')}
      {colorPicker('pedicelColor', '꼭지')}
      {colorPicker('calyxColor', '꽃받침')}

      <Eyebrow>마커 크기</Eyebrow>
      <SliderRow
        label="노드 마커 (mm)"
        value={skel.nodeMarkerSize * 1000}
        onChange={(v) => set({ nodeMarkerSize: v / 1000 })}
        valueText={`${(skel.nodeMarkerSize * 1000).toFixed(1)} mm`}
        min={3}
        max={30}
        step={0.5}
      />
      <SliderRow
        label="Apex 마커 (mm)"
        value={skel.apexMarkerSize * 1000}
        onChange={(v) => set({ apexMarkerSize: v / 1000 })}
        valueText={`${(skel.apexMarkerSize * 1000).toFixed(1)} mm`}
        min={3}
        max={40}
        step={0.5}
      />
      <SliderRow
        label="과실 마커 scale"
        value={skel.fruitMarkerScale}
        onChange={(v) => set({ fruitMarkerScale: v })}
        valueText={skel.fruitMarkerScale.toFixed(2)}
        min={0.1}
        max={3}
        step={0.05}
      />

      <Eyebrow>표시 토글</Eyebrow>
      {toggleBtn('showPetiole', '잎자루')}
      {toggleBtn('showTruss', '화방')}
      {toggleBtn('showCalyx', '꽃받침')}
      {toggleBtn('showFruitDots', '과실 점')}
      {toggleBtn('showDormantBuds', 'Dormant Bud')}
      {toggleBtn('showPrunedBuds', 'Pruned Bud')}

      <Eyebrow>진단</Eyebrow>
      <ToggleBtn on={debugDiag} onClick={() => setDebugDiag(!debugDiag)}>
        진단 로그 {debugDiag ? 'ON' : 'OFF'}
      </ToggleBtn>
      <div className="quality-note">
        ON 일 때 Skeleton 토글 / update 마다 console 에 [diag:1-4]
        4단계 dump (lush vs skel mesh count + bbox + root transform).
        lush ↔ skel 위치 mismatch 진단용.
      </div>

      <Eyebrow>리셋</Eyebrow>
      <button type="button" className="btn-ghost" onClick={reset}>
        전체 리셋 (defaults)
      </button>
    </div>
  );
}
