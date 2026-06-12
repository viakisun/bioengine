// Instrument Workstation — Settings Drawer (right slide-in)
//
// Hosts: Crop count, Quality, Defoliation sliders + HUD toggles + Calibration/Fork buttons.
// Replaces the floating bottom-left sliders + scattered controls.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../../state/twinStore';
import { QUALITY_PRESETS } from '../../scene/RenderQuality';
import { getActivePlantManager } from '../../scene/PlantManager';

interface SettingsDrawerProps {
  defoliationMaxCm?: number;
  defoliationEnabled: boolean;
  onOpenCalibration: () => void;
  onFork: () => void;
}

export function SettingsDrawer({ defoliationMaxCm = 100, defoliationEnabled, onOpenCalibration, onFork }: SettingsDrawerProps) {
  const open = useTwinStore((s) => s.settingsOpen);
  const close = () => useTwinStore.getState().setSettingsOpen(false);

  // Quality
  const renderQuality = useTwinStore((s) => s.renderQuality);
  const setRenderQuality = useTwinStore((s) => s.setRenderQuality);
  // Defoliation
  const defoliationHeightCm = useTwinStore((s) => s.defoliationHeightCm);
  const setDefoliationHeightCm = useTwinStore((s) => s.setDefoliationHeightCm);
  // Stats toggle (mirrors statsOpen)
  const statsOpen = useTwinStore((s) => s.statsOpen);
  const setStatsOpen = useTwinStore((s) => s.setStatsOpen);

  // Plant count (poll once on open)
  const [cropCount, setCropCount] = useState(0);
  const [cropMax, setCropMax] = useState(0);
  const [cropGeomMax, setCropGeomMax] = useState(0);
  const [cropBusy, setCropBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const mgr = getActivePlantManager();
      if (!mgr) return;
      setCropCount(mgr.getCount());
      setCropMax(mgr.getSafeMax().value);
      setCropGeomMax(mgr.getGeomMax());
    }, 500);
    return () => clearInterval(id);
  }, [open]);

  async function onCropChange(target: number) {
    if (cropBusy) return;
    const mgr = getActivePlantManager();
    if (!mgr) return;
    setCropBusy(true);
    try {
      await mgr.setCount(target, { onProgress: (cur) => setCropCount(cur) });
    } finally {
      setCropBusy(false);
    }
  }

  const preset = QUALITY_PRESETS[renderQuality];
  const qualityLabel = preset?.label ?? '—';

  return (
    <>
      {/* Scrim */}
      <div
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
          zIndex: 1190,
        }}
      />

      {/* Drawer */}
      <aside style={{ ...drawerS, transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
        <div style={headRowS}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Settings</span>
          <button style={closeBtnS} onClick={close} aria-label="close">×</button>
        </div>

        <div style={bodyS}>
          {/* Scene section */}
          <SectionHeader>SCENE</SectionHeader>

          <Field>
            <FieldHead label="Crop count" value={
              <>{cropCount}<span style={dimS}> /{cropMax} ({cropGeomMax})</span></>
            } />
            <input
              type="range"
              className="iw-range"
              min={0}
              max={Math.max(1, cropGeomMax)}
              value={cropCount}
              onChange={(e) => onCropChange(Number(e.currentTarget.value))}
              disabled={cropBusy}
              style={{ width: '100%' }}
            />
          </Field>

          <Field>
            <FieldHead label="Quality" value={
              <>Lv{renderQuality} <span style={{ color: 'var(--iw-warn)' }}>{qualityLabel}</span></>
            } />
            <input
              type="range"
              className="iw-range"
              min={1}
              max={10}
              value={renderQuality}
              onChange={(e) => setRenderQuality(Number(e.currentTarget.value))}
              style={{ width: '100%' }}
            />
          </Field>

          {defoliationEnabled && (
            <Field>
              <FieldHead label="Defoliation" value={
                <span style={dimS}>{defoliationHeightCm}/{defoliationMaxCm}cm · {defoliationHeightCm > 0 ? 'ON' : 'OFF'}</span>
              } />
              <input
                type="range"
                className="iw-range"
                min={0}
                max={defoliationMaxCm}
                value={defoliationHeightCm}
                onChange={(e) => setDefoliationHeightCm(Number(e.currentTarget.value))}
                style={{ width: '100%' }}
              />
            </Field>
          )}

          {/* Debug overlays */}
          <SectionHeader topGap>DEBUG OVERLAYS</SectionHeader>
          <Toggle label="Stats HUD" on={statsOpen} onClick={() => setStatsOpen(!statsOpen)} />

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--iw-line-1)' }}>
            <button style={primaryBtnS} onClick={() => { close(); onOpenCalibration(); }}>Open Calibration</button>
            <button style={accentBtnS} onClick={() => { close(); onFork(); }}>Fork Scenario</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function SectionHeader({ children, topGap }: { children: React.ReactNode; topGap?: boolean }) {
  return (
    <div className="iw-mono" style={{
      fontSize: 10,
      letterSpacing: '0.1em',
      color: 'var(--iw-fg-mute)',
      marginBottom: 14,
      marginTop: topGap ? 8 : 0,
      paddingTop: topGap ? 6 : 0,
      borderTop: topGap ? '1px solid var(--iw-line-1)' : undefined,
    }}>{children}</div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 18 }}>{children}</div>;
}

function FieldHead({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="iw-mono" style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      whiteSpace: 'nowrap',
      fontSize: 12,
      marginBottom: 7,
    }}>
      <span style={{ color: 'var(--iw-fg-mid)' }}>{label}</span>
      <span style={{ color: 'var(--iw-fg-hi)' }}>{value}</span>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={toggleRowS}>
      <span style={{ fontSize: 12, color: 'var(--iw-fg-mid)' }}>{label}</span>
      <span style={{
        width: 34,
        height: 19,
        borderRadius: 12,
        display: 'inline-flex',
        alignItems: 'center',
        padding: 2,
        background: on ? 'var(--iw-accent)' : 'rgba(255,255,255,0.12)',
        transition: 'background 0.15s',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}>
        <span style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: on ? '#06070a' : 'var(--iw-fg-dim)',
          display: 'block',
        }} />
      </span>
    </button>
  );
}

const drawerS: React.CSSProperties = {
  position: 'fixed',
  top: 46,
  right: 0,
  bottom: 0,
  width: 316,
  background: '#0c0f12',
  borderLeft: '1px solid var(--iw-line-2)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.28s ease',
  boxShadow: '-16px 0 40px rgba(0,0,0,0.45)',
  zIndex: 1200,
  fontFamily: 'var(--iw-font-ui)',
  color: 'var(--iw-fg-hi)',
};

const headRowS: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 16px 14px',
  borderBottom: '1px solid var(--iw-line-1)',
};

const closeBtnS: React.CSSProperties = {
  color: 'var(--iw-fg-mute)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
};

const bodyS: React.CSSProperties = {
  padding: 16,
  overflowY: 'auto',
  flex: 1,
};

const dimS: React.CSSProperties = { color: 'var(--iw-fg-faint)' };

const toggleRowS: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '9px 0',
  fontFamily: 'var(--iw-font-ui)',
};

const primaryBtnS: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: 'var(--iw-fg-hi)',
  background: 'var(--iw-bg-3)',
  border: '1px solid var(--iw-line-3)',
  borderRadius: 7,
  padding: 10,
  cursor: 'pointer',
};

const accentBtnS: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: 'var(--iw-accent)',
  background: 'var(--iw-accent-soft)',
  border: '1px solid var(--iw-accent-line)',
  borderRadius: 7,
  padding: 10,
  cursor: 'pointer',
};
