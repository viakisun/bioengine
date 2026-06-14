// Phenotyping — Survey Result Sheet (post-completion modal).
//
// Shows full summary of a completed survey + Export JSON + Discard.
// Auto-opens when twinStore.lastSurveyId is set; also opens when user clicks
// a row in SurveyHistoryDrawer (twinStore.viewingSurveyId).

import { useEffect, useState } from 'react';
import { useTwinStore } from '../../state/twinStore';
import { surveyStore, downloadBlob, type SurveyRecord } from '../../scenarios/phenotyping/surveyStore';
import { RipenessHistogram } from './charts/RipenessHistogram';
import { BedZoneHeatmap, type ZoneCell } from './charts/BedZoneHeatmap';
import { KpiCard } from './charts/KpiCard';

export function SurveyResultSheet() {
  const lastSurveyId = useTwinStore((s) => s.lastSurveyId);
  const viewingSurveyId = useTwinStore((s) => s.viewingSurveyId);
  const setLastSurveyId = useTwinStore((s) => s.setLastSurveyId);
  const setViewingSurveyId = useTwinStore((s) => s.setViewingSurveyId);

  // Either lastSurveyId (auto-open after completion) OR viewingSurveyId (from history)
  const activeId = viewingSurveyId ?? lastSurveyId;
  const open = activeId != null;

  const [record, setRecord] = useState<SurveyRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeId) { setRecord(null); return; }
    setLoading(true);
    surveyStore.get(activeId)
      .then((r) => setRecord(r))
      .catch(() => setRecord(null))
      .finally(() => setLoading(false));
  }, [activeId]);

  const close = () => {
    setLastSurveyId(null);
    setViewingSurveyId(null);
  };

  if (!open) return null;

  return (
    <>
      <div onClick={close} style={scrimS} />
      <div style={sheetS} role="dialog" aria-label="Survey result">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--iw-fg-mute)' }}>Loading…</div>
        ) : !record ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--iw-fg-mute)' }}>
            Survey not found.
            <button onClick={close} style={ghostBtnS}>Close</button>
          </div>
        ) : (
          <SurveyResultContent record={record} onClose={close} />
        )}
      </div>
    </>
  );
}

function SurveyResultContent({ record, onClose }: { record: SurveyRecord; onClose: () => void }) {
  const startedDate = new Date(record.startedAt);
  const elapsedSec = Math.round(record.elapsedMs / 1000);
  const t = record.totals;

  const zoneCells: ZoneCell[] = record.zones.map((z, i) => ({
    zoneId: z.zoneId,
    bedId: z.targetBedId,
    index: i,
    bedSide: z.bedSide,
    weightedCount: z.weightedCount,
    bins: z.bins,
  }));

  function onExport() {
    surveyStore.exportJSON(record.id).then((blob) => {
      const filename = `phytosim-survey-${record.scenarioId}-d${record.cropDay}-${record.id.slice(0, 8)}.json`;
      downloadBlob(blob, filename);
    });
  }

  function onDelete() {
    if (!confirm(`Delete survey ${record.id.slice(0, 8)}?`)) return;
    surveyStore.delete(record.id).then(onClose);
  }

  return (
    <>
      {/* Header */}
      <div style={headerS}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Survey Result</div>
          <div className="iw-mono" style={{ fontSize: 11, color: 'var(--iw-fg-mute)', marginTop: 3 }}>
            {record.scenarioId} · day {record.cropDay} · seed {record.cropSeed}
            <span style={{ color: 'var(--iw-fg-faint)' }}> · {startedDate.toLocaleString()}</span>
          </div>
        </div>
        <button onClick={onClose} style={closeXBtnS} aria-label="close">×</button>
      </div>

      <div style={bodyS}>
        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 22 }}>
          <KpiCard label="Zones" value={t.zoneCount} />
          <KpiCard label="Fruits (raw)" value={t.fruitCount} />
          <KpiCard label="Weighted" value={t.weightedCount.toFixed(1)} color="var(--iw-accent)" />
          <KpiCard
            label="Coverage"
            value={(t.coverage * 100).toFixed(0)}
            unit="%"
            color={t.coverage >= 0.85 ? 'var(--iw-ok)' : t.coverage >= 0.6 ? 'var(--iw-warn)' : 'var(--iw-err)'}
          />
          <KpiCard label="Avg conf" value={t.avgConfidence.toFixed(2)} />
          <KpiCard label="Path" value={record.pathLengthM.toFixed(1)} unit="m" />
          <KpiCard label="Elapsed" value={elapsedSec} unit="s" />
          <KpiCard
            label="Status"
            value={record.status}
            color={record.status === 'completed' ? 'var(--iw-ok)' : 'var(--iw-warn)'}
          />
        </div>

        {/* Ripeness histogram */}
        <SectionHeader label="RIPENESS DISTRIBUTION" />
        <div style={{ marginBottom: 22 }}>
          <RipenessHistogram bins={t.bins} weightedBins={t.weightedBins} height={140} />
        </div>

        {/* Bed × Zone heatmap */}
        <SectionHeader label="BED × ZONE" trailing={`${zoneCells.length} cells`} />
        <div style={{ marginBottom: 22 }}>
          <BedZoneHeatmap zones={zoneCells} />
        </div>

        {/* Run metadata */}
        <SectionHeader label="RUN METADATA" />
        <div style={metaGridS}>
          <Meta k="scenario" v={`${record.scenarioId} v${record.scenarioVersion}`} />
          <Meta k="cultivar" v={record.cropCultivar} />
          <Meta k="day · minute" v={`${record.cropDay} · ${record.cropMinute}`} />
          <Meta k="env" v={`${record.envLightingPreset} · h${record.envManualHour}`} />
          <Meta k="robot" v={record.robotProfile} />
          <Meta k="camera" v={`${record.cameraConfig.lensFovDeg}° · h${record.cameraConfig.mountHeightM}m`} />
          <Meta k="rule" v={record.rule} />
          <Meta k="detector" v={`${record.detector.version} · wd ${record.detector.workingDistanceM.min}~${record.detector.workingDistanceM.max}m`} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--iw-line-1)' }}>
          <button onClick={onExport} style={primaryBtnS}>Export JSON</button>
          <button onClick={onDelete} style={dangerBtnS}>Delete</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtnS}>Close</button>
        </div>
      </div>
    </>
  );
}

function SectionHeader({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <div className="iw-mono" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      fontSize: 10,
      letterSpacing: '0.1em',
      color: 'var(--iw-fg-mute)',
      marginBottom: 10,
    }}>
      <span>{label}</span>
      {trailing && <span style={{ color: 'var(--iw-fg-faint)' }}>{trailing}</span>}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="iw-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--iw-fg-mid)' }}>
      <span style={{ color: 'var(--iw-fg-mute)' }}>{k}</span>
      <span style={{ textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}

const scrimS: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 1250,
};

const sheetS: React.CSSProperties = {
  position: 'fixed',
  top: '8%',
  bottom: '8%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(720px, 90vw)',
  background: '#0c0f12',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 10,
  boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  zIndex: 1260,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--iw-font-ui)',
  color: 'var(--iw-fg-hi)',
  overflow: 'hidden',
};

const headerS: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '18px 22px 14px',
  borderBottom: '1px solid var(--iw-line-1)',
};

const bodyS: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '18px 22px',
};

const closeXBtnS: React.CSSProperties = {
  color: 'var(--iw-fg-mute)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 22,
  lineHeight: 1,
  padding: 0,
};

const metaGridS: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '6px 22px',
  marginBottom: 20,
  background: 'var(--iw-bg-2)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 6,
  padding: '10px 14px',
};

const primaryBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: '#06070a',
  background: 'var(--iw-accent)',
  border: '1px solid var(--iw-accent)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 600,
};

const ghostBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: 'var(--iw-fg-mid)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
};

const dangerBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: 'var(--iw-err)',
  background: 'transparent',
  border: '1px solid rgba(240,88,76,0.4)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
};
