// §19/§21 — Phenotyping runtime controls.
//
// 좌하단 (적엽 slider 위) — Quality preset 1~10 + Plant count 0~max.
//   - Quality 변경 시 RenderFX patch → BabylonEngine subscribe가 applyRenderQuality 자동 호출.
//   - Plant count 변경 시 PlantManager.setCount() — R1~R4 fix 자동 적용.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/twinStore';
import { QUALITY_PRESETS } from '../scene/RenderQuality';
import { getActivePlantManager, type SafeMaxStatus } from '../scene/PlantManager';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './single-plant/styles';

interface PhenotypingControlsProps {
  /** 기본 boot quality preset (URL ?qualityPreset). default 1. */
  initialQuality?: number;
}

const CHIP_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(255, 255, 255, 0.88)',
  backdropFilter: 'blur(12px)' as const,
  WebkitBackdropFilter: 'blur(12px)' as const,
  border: `1px solid ${C_BORDER}`,
  borderRadius: 8,
  padding: '8px 12px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  fontFamily: FONT_MONO,
  fontSize: 10,
  color: C_FG,
  userSelect: 'none' as const,
  width: 280,
  height: 36,
  boxSizing: 'content-box' as const,
};

export function PhenotypingControls({ initialQuality = 1 }: PhenotypingControlsProps) {
  const [quality, setQualityState] = useState(initialQuality);
  const [plantCount, setPlantCountState] = useState(0);
  const [plantSafeMax, setPlantSafeMax] = useState(0);
  const [plantGeomMax, setPlantGeomMax] = useState(0);
  const [avgKBPerPlant, setAvgKB] = useState(0);
  const [safeStatus, setSafeStatus] = useState<SafeMaxStatus>('ok');
  const [statusReason, setStatusReason] = useState<string | undefined>(undefined);
  const [abortReason, setAbortReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setRenderFX = useTwinStore((s) => s.setRenderFX);

  useEffect(() => {
    let prev = -1;
    const id = setInterval(() => {
      const mgr = getActivePlantManager();
      if (!mgr) return;
      const cur = mgr.getCount();
      const geom = mgr.getGeomMax();
      const safe = mgr.getSafeMax();
      const avgKB = mgr.getAvgKBPerPlant();
      setPlantCountState(cur);
      setPlantGeomMax(geom);
      setPlantSafeMax(safe.value);
      setSafeStatus(safe.status);
      setStatusReason(safe.reason);
      setAvgKB(avgKB);
      if (geom !== prev) {
        prev = geom;
        // eslint-disable-next-line no-console
        console.log(`[PhenotypingControls] ctx: cur=${cur} safe=${safe.value} (${safe.status}) geom=${geom} avg=${avgKB.toFixed(0)}KB/plant`);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  function onQualityChange(n: number) {
    setQualityState(n);
    const preset = QUALITY_PRESETS[n];
    if (!preset) return;
    // store renderFX 변경 → BabylonEngine subscribe 가 applyRenderQuality 자동 호출.
    setRenderFX(preset.fx);
  }

  async function onPlantCountChange(target: number) {
    if (busy) return;
    const mgr = getActivePlantManager();
    if (!mgr) return;
    setBusy(true);
    setAbortReason(null);
    try {
      await mgr.setCount(target, {
        onProgress: (cur) => setPlantCountState(cur),
        onAbort: (_cur, _tgt, reason) => setAbortReason(reason),
      });
    } finally {
      setBusy(false);
    }
  }

  const preset = QUALITY_PRESETS[quality];

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 114,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Plant count bar — slider max = heap 70% 안전치, label은 geom max도 표시. */}
      <div style={CHIP_STYLE}>
        <span style={{ fontSize: 10, color: C_FG_MUTE, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          작물
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, plantSafeMax)}
          step={1}
          value={plantCount}
          onChange={(e) => onPlantCountChange(parseInt(e.target.value, 10))}
          disabled={busy || plantSafeMax === 0}
          style={{ flex: 1, accentColor: C_ACCENT, cursor: busy ? 'wait' : 'pointer' }}
          aria-label="작물 개수"
          title={`heap 70% 안전치 ${plantSafeMax}개 · 기하 max ${plantGeomMax}개 · ~${avgKBPerPlant.toFixed(0)} KB/plant`}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: plantCount > 0 ? C_ACCENT : C_FG_MUTE, fontVariantNumeric: 'tabular-nums', minWidth: 76, textAlign: 'right' }}>
          {plantCount}
          <span style={{ fontSize: 9, color: C_FG_MUTE, marginLeft: 2 }}>
            /{plantSafeMax}
            {plantGeomMax > plantSafeMax && (
              <span style={{ opacity: 0.5 }}> ({plantGeomMax})</span>
            )}
          </span>
        </span>
      </div>

      {/* §21 — status·abort 라벨 (R1/R4 가시성) */}
      {(safeStatus !== 'ok' || abortReason) && (
        <div
          style={{
            fontSize: 10,
            fontFamily: FONT_MONO,
            color: safeStatus === 'at-limit' || abortReason ? '#dc2626' : '#d97706',
            padding: '2px 8px',
            background: 'rgba(255,255,255,0.6)',
            borderRadius: 4,
            marginTop: -2,
            width: 280,
          }}
        >
          {abortReason ?? statusReason ?? (safeStatus === 'near-limit' ? 'heap near 60%' : '')}
        </div>
      )}

      {/* Quality bar */}
      <div style={CHIP_STYLE}>
        <span style={{ fontSize: 10, color: C_FG_MUTE, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          품질
        </span>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={quality}
          onChange={(e) => onQualityChange(parseInt(e.target.value, 10))}
          style={{ flex: 1, accentColor: C_ACCENT, cursor: 'pointer' }}
          aria-label="렌더 품질"
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: C_ACCENT, fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>
          {quality}
          <span style={{ fontSize: 9, color: C_FG_MUTE, marginLeft: 4 }}>{preset?.label.split(' ')[0] ?? ''}</span>
        </span>
      </div>
    </div>
  );
}
