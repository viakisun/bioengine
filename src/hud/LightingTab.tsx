/**
 * 조명 탭 — interactive lighting controls for the Babylon scene.
 *
 * State lives in twinStore.lighting; BabylonEngine's subscribe handler
 * pushes any change into the scene via applyLightingToScene.
 *
 * Layout: grouped sections (each with an Eyebrow header).
 *   프리셋 / 시간대 / 태양 / 환경광 / 그림자 / 톤매핑 / 블룸 / 비네팅 / 샤프닝 / SSAO
 */

import { useTwinStore } from '../state/twinStore';
import type { LightingPresetName, ToneMappingMode } from '../state/twinStore';
import { Eyebrow } from './controls';
import { TabStrip, type TabItem } from './controls/TabStrip';
import { SliderRow, ToggleBtn, ColorRow } from './controls/Controls';

const PRESET_TABS: ReadonlyArray<TabItem<LightingPresetName>> = [
  { id: 'default', label: '기본' },
  { id: 'golden', label: '골든아워' },
  { id: 'overcast', label: '흐린날' },
  { id: 'noon-bright', label: '화려한낮' },
  { id: 'grow-light', label: '그로우' },
];

const TONE_TABS: ReadonlyArray<TabItem<ToneMappingMode>> = [
  { id: 'aces', label: 'ACES' },
  { id: 'standard', label: 'Standard' },
  { id: 'none', label: 'OFF' },
];

const QUALITY_LABELS: Record<number, string> = {
  1: 'Minimum', 2: 'Very Low', 3: 'Low', 4: 'Medium-Low',
  5: 'Medium', 6: 'High', 7: 'Very High', 8: 'Ultra',
  9: 'Extreme', 10: 'Showpiece',
};

const QUALITY_HINTS: Record<number, string> = {
  1: '저사양 / 모바일 친화',
  2: '5년+ 기기',
  3: '일반 노트북',
  4: '미드 노트북',
  5: '종전 셋팅 (baseline)',
  6: 'M1/M2 / 게이밍 노트북',
  7: '데스크탑 GPU',
  8: 'RTX급 — DOF + SSR + PCSS',
  9: '고사양 — God Rays + Lens Flare',
  10: 'Babylon web 한계 — M2 Max+ 권장',
};

export function LightingTab() {
  const L = useTwinStore((s) => s.lighting);
  const set = useTwinStore((s) => s.setLighting);
  const reset = useTwinStore((s) => s.resetLighting);
  const applyPreset = useTwinStore((s) => s.applyLightingPreset);
  // SSAO is unavailable on the WebGPU backend; published as null in the
  // SceneSetupHandle. We mirror that via the backend label.
  const backend = useTwinStore((s) => s.backend);
  const ssaoUnavailable = backend === 'webgpu';

  const renderQuality = useTwinStore((s) => s.renderQuality);
  const setRenderQuality = useTwinStore((s) => s.setRenderQuality);

  return (
    <div className="panel env-panel">
      <Eyebrow>렌더링 품질</Eyebrow>
      <SliderRow
        label="품질 레벨"
        value={renderQuality}
        onChange={(v) => setRenderQuality(Math.round(v))}
        valueText={`Lv ${renderQuality} · ${QUALITY_LABELS[renderQuality] ?? ''}`}
        min={1}
        max={10}
        step={1}
      />
      <div className="quality-hint">{QUALITY_HINTS[renderQuality] ?? ''}</div>
      <div className="quality-note">
        Lv 슬라이더가 아래 lighting / post-FX 값을 일괄 세팅합니다.
        활성 베드 수 변경은 다음 페이지 리로드부터 적용됩니다.
      </div>

      <Eyebrow>프리셋</Eyebrow>
      <TabStrip<LightingPresetName>
        items={PRESET_TABS}
        active={null}
        onSelect={applyPreset}
      />
      <button type="button" className="btn-ghost" onClick={reset}>
        전체 리셋
      </button>

      <Eyebrow>시간대</Eyebrow>
      <SliderRow
        label="시각"
        value={L.manualHour}
        onChange={(v) => set({ manualHour: v })}
        valueText={formatHour(L.manualHour)}
        min={0}
        max={24}
        step={0.25}
      />

      <Eyebrow>태양</Eyebrow>
      <SliderRow
        label="강도"
        value={L.sunIntensity}
        onChange={(v) => set({ sunIntensity: v })}
        min={0}
        max={6}
        step={0.05}
      />
      <ColorRow
        label="색"
        value={L.sunColorHex}
        onChange={(hex) => set({ sunColorHex: hex })}
      />

      <Eyebrow>환경광</Eyebrow>
      <SliderRow
        label="Hemi 강도"
        value={L.hemiIntensity}
        onChange={(v) => set({ hemiIntensity: v })}
        min={0}
        max={2}
        step={0.05}
      />
      <ColorRow
        label="Hemi 색"
        value={L.hemiColorHex}
        onChange={(hex) => set({ hemiColorHex: hex })}
      />
      <ColorRow
        label="Hemi 바닥색"
        value={L.hemiGroundColorHex}
        onChange={(hex) => set({ hemiGroundColorHex: hex })}
      />
      <SliderRow
        label="HDRI 강도"
        value={L.hdriIntensity}
        onChange={(v) => set({ hdriIntensity: v })}
        min={0}
        max={2}
        step={0.05}
      />
      <SliderRow
        label="앰비언트"
        value={L.ambientGray}
        onChange={(v) => set({ ambientGray: v })}
        min={0}
        max={0.5}
        step={0.01}
      />

      <Eyebrow>그림자</Eyebrow>
      <ToggleBtn on={L.shadowsEnabled} onClick={() => set({ shadowsEnabled: !L.shadowsEnabled })}>
        그림자 {L.shadowsEnabled ? 'ON' : 'OFF'}
      </ToggleBtn>
      <SliderRow
        label="어두움"
        value={L.shadowDarkness}
        onChange={(v) => set({ shadowDarkness: v })}
        min={0}
        max={1}
        step={0.02}
      />
      <SliderRow
        label="Bias"
        value={L.shadowBias}
        onChange={(v) => set({ shadowBias: v })}
        valueText={L.shadowBias.toFixed(4)}
        min={0}
        max={0.01}
        step={0.0001}
      />
      <SliderRow
        label="Normal Bias"
        value={L.shadowNormalBias}
        onChange={(v) => set({ shadowNormalBias: v })}
        min={0}
        max={0.2}
        step={0.005}
      />

      <Eyebrow>톤매핑</Eyebrow>
      <TabStrip<ToneMappingMode>
        items={TONE_TABS}
        active={L.toneMapping}
        onSelect={(mode) => set({ toneMapping: mode })}
      />
      <SliderRow
        label="노출"
        value={L.exposure}
        onChange={(v) => set({ exposure: v })}
        min={0.2}
        max={3}
        step={0.05}
      />
      <SliderRow
        label="대비"
        value={L.contrast}
        onChange={(v) => set({ contrast: v })}
        min={0.5}
        max={2}
        step={0.05}
      />

      <Eyebrow>블룸</Eyebrow>
      <ToggleBtn on={L.bloomEnabled} onClick={() => set({ bloomEnabled: !L.bloomEnabled })}>
        블룸 {L.bloomEnabled ? 'ON' : 'OFF'}
      </ToggleBtn>
      <SliderRow
        label="Threshold"
        value={L.bloomThreshold}
        onChange={(v) => set({ bloomThreshold: v })}
        min={0}
        max={1}
        step={0.02}
      />
      <SliderRow
        label="Weight"
        value={L.bloomWeight}
        onChange={(v) => set({ bloomWeight: v })}
        min={0}
        max={2}
        step={0.05}
      />

      <Eyebrow>비네팅</Eyebrow>
      <ToggleBtn on={L.vignetteEnabled} onClick={() => set({ vignetteEnabled: !L.vignetteEnabled })}>
        비네팅 {L.vignetteEnabled ? 'ON' : 'OFF'}
      </ToggleBtn>
      <SliderRow
        label="Weight"
        value={L.vignetteWeight}
        onChange={(v) => set({ vignetteWeight: v })}
        min={0}
        max={4}
        step={0.1}
      />

      <Eyebrow>샤프닝</Eyebrow>
      <ToggleBtn on={L.sharpenEnabled} onClick={() => set({ sharpenEnabled: !L.sharpenEnabled })}>
        샤프닝 {L.sharpenEnabled ? 'ON' : 'OFF'}
      </ToggleBtn>
      <SliderRow
        label="Edge"
        value={L.sharpenEdge}
        onChange={(v) => set({ sharpenEdge: v })}
        min={0}
        max={2}
        step={0.05}
      />

      <Eyebrow>SSAO {ssaoUnavailable && '(WebGPU 미지원)'}</Eyebrow>
      <ToggleBtn
        on={L.ssaoEnabled}
        onClick={() => set({ ssaoEnabled: !L.ssaoEnabled })}
        disabled={ssaoUnavailable}
      >
        SSAO {L.ssaoEnabled ? 'ON' : 'OFF'}
      </ToggleBtn>
      <SliderRow
        label="강도"
        value={L.ssaoStrength}
        onChange={(v) => set({ ssaoStrength: v })}
        min={0}
        max={3}
        step={0.05}
        disabled={ssaoUnavailable}
      />
      <SliderRow
        label="반경"
        value={L.ssaoRadius}
        onChange={(v) => set({ ssaoRadius: v })}
        min={0}
        max={2}
        step={0.05}
        disabled={ssaoUnavailable}
      />
    </div>
  );
}

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
