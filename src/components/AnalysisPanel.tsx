import { useTwinStore } from '../store/twinStore';
import {
  SCENARIO,
  HEALTH_COLORS,
  HEALTH_LABELS_KO,
  zoneHealthMix,
  getDailySnapshot,
  type HealthLabel,
} from '../data/mockScenario';

const panelStyle: React.CSSProperties = {
  padding: '16px 16px 20px',
  fontSize: 12,
  color: '#e0e0e0',
  height: '100%',
  overflowY: 'auto',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.7,
  fontWeight: 600,
  marginTop: 16,
  marginBottom: 6,
};

const metricRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid #2a2e36',
};

const chipStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  background: color,
  color: '#0a0d12',
  padding: '2px 8px',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: 0.3,
});

function delta(value: number, format: (v: number) => string = (v) => v.toFixed(1)) {
  const positive = value >= 0;
  const color = Math.abs(value) < 0.01 ? '#6b7280' : positive ? '#6ee7b7' : '#ef4444';
  const sign = positive ? '+' : '';
  return <span style={{ color, fontWeight: 600 }}>{sign}{format(value)}</span>;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120;
  const H = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function AnalysisPanel() {
  const selectedZoneId = useTwinStore((s) => s.selectedZoneId);
  const hoveredZoneId = useTwinStore((s) => s.hoveredZoneId);
  const currentDay = useTwinStore((s) => s.currentDay);
  const analysisMode = useTwinStore((s) => s.analysisMode);
  const compareMode = useTwinStore((s) => s.compareMode);
  const toggleAnalysisMode = useTwinStore((s) => s.toggleAnalysisMode);
  const setCompareMode = useTwinStore((s) => s.setCompareMode);

  const displayZoneId = hoveredZoneId ?? selectedZoneId;

  if (displayZoneId === null) {
    return (
      <div style={panelStyle}>
        <div style={sectionTitle}>분석 패널</div>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          베드 위 색상 구역을 클릭하면 생육 지표, AI 분석 결과, 변화량이 표시됩니다.
        </p>
        <div style={sectionTitle}>전체 현황</div>
        <ZoneOverviewGrid currentDay={currentDay} />
      </div>
    );
  }

  const zone = SCENARIO.zones[displayZoneId];
  const { dominant, counts } = zoneHealthMix(zone, currentDay);

  let totalH = 0, totalLA = 0, totalFruits = 0, totalRipen = 0, totalConf = 0, sampleN = 0;
  for (const pid of zone.plantIds) {
    const snap = getDailySnapshot(SCENARIO.plants[pid], currentDay);
    totalH += snap.heightCm;
    totalLA += snap.leafAreaCm2;
    totalFruits += snap.fruitCount;
    totalRipen += snap.ripenScore;
    sampleN++;
  }
  const session = SCENARIO.captureSessions.find(
    (s) => s.zoneId === zone.zoneId && s.day <= currentDay && currentDay - s.day < 3
  );
  totalConf = session?.aiConfidence ?? 0;

  const avgH = totalH / sampleN;
  const avgLA = totalLA / sampleN;
  const avgRipen = totalRipen / sampleN;

  const yest = Math.max(0, currentDay - 1);
  const sevenDaysAgo = Math.max(0, currentDay - 7);
  let yestH = 0, sevenH = 0;
  for (const pid of zone.plantIds) {
    yestH += getDailySnapshot(SCENARIO.plants[pid], yest).heightCm;
    sevenH += getDailySnapshot(SCENARIO.plants[pid], sevenDaysAgo).heightCm;
  }
  yestH /= sampleN;
  sevenH /= sampleN;

  const sparkValues: number[] = [];
  for (let d = Math.max(0, currentDay - 14); d <= currentDay; d += 1) {
    let h = 0;
    for (const pid of zone.plantIds) h += getDailySnapshot(SCENARIO.plants[pid], d).heightCm;
    sparkValues.push(h / sampleN);
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>
          구역 {zone.zoneId + 1}
        </div>
        <span style={chipStyle(HEALTH_COLORS[dominant])}>{HEALTH_LABELS_KO[dominant]}</span>
      </div>
      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 12 }}>
        {zone.startX.toFixed(1)} ~ {zone.endX.toFixed(1)} m · {zone.plantIds.length}그루
      </div>

      <div style={sectionTitle}>생육 지표 (구역 평균)</div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>초장</span>
        <span>{avgH.toFixed(1)} cm</span>
      </div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>엽면적</span>
        <span>{avgLA.toFixed(0)} cm²</span>
      </div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>착과수</span>
        <span>{(totalFruits / sampleN).toFixed(1)} 개/그루</span>
      </div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>숙도</span>
        <span>{(avgRipen * 100).toFixed(0)} %</span>
      </div>

      <div style={sectionTitle}>변화량</div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>어제 대비</span>
        {delta(avgH - yestH, (v) => `${v.toFixed(2)} cm`)}
      </div>
      <div style={metricRow}>
        <span style={{ color: '#9ca3af' }}>7일 전 대비</span>
        {delta(((avgH - sevenH) / Math.max(0.01, sevenH)) * 100, (v) => `${v.toFixed(1)} %`)}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>최근 14일 초장 추이</div>
        <Sparkline values={sparkValues} color="#6ee7b7" />
      </div>

      <div style={sectionTitle}>구역 상태 구성</div>
      {(Object.keys(counts) as HealthLabel[]).map((k) =>
        counts[k] > 0 ? (
          <div key={k} style={metricRow}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 4,
                background: HEALTH_COLORS[k], display: 'inline-block',
              }} />
              {HEALTH_LABELS_KO[k]}
            </span>
            <span>{counts[k]} / {zone.plantIds.length}</span>
          </div>
        ) : null
      )}

      {session && (
        <>
          <div style={sectionTitle}>최근 촬영 세션</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
            Day {session.day} · {session.hour}:00 · 식물 #{session.targetPlantId + 1}
          </div>
          <div style={metricRow}>
            <span style={{ color: '#9ca3af' }}>AI 분석 신뢰도</span>
            <span style={{ color: session.aiConfidence > 0.9 ? '#6ee7b7' : '#fbbf24' }}>
              {(session.aiConfidence * 100).toFixed(1)} %
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <ThumbnailPlaceholder label="RGB" color="#3a8a30" />
            <ThumbnailPlaceholder label="Depth" color="#60a5fa" />
            <ThumbnailPlaceholder label="Mask" color="#fbbf24" />
          </div>
        </>
      )}

      <div style={sectionTitle}>분석 모드</div>
      <button
        type="button"
        onClick={toggleAnalysisMode}
        style={{
          background: analysisMode ? '#6ee7b7' : '#2a2e36',
          color: analysisMode ? '#0a0d12' : '#e0e0e0',
          border: '1px solid #3a3e46',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          cursor: 'pointer',
          width: '100%',
          fontWeight: 600,
        }}
      >
        세그멘테이션 오버레이 {analysisMode ? 'ON' : 'OFF'}
      </button>

      <div style={sectionTitle}>비교</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['off', 'yesterday', '7days'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setCompareMode(mode)}
            type="button"
            style={{
              background: compareMode === mode ? '#6ee7b7' : '#2a2e36',
              color: compareMode === mode ? '#0a0d12' : '#9ca3af',
              border: '1px solid #3a3e46',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 10,
              cursor: 'pointer',
              flex: 1,
              fontWeight: 600,
            }}
          >
            {mode === 'off' ? '없음' : mode === 'yesterday' ? '어제' : '7일'}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThumbnailPlaceholder({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        aspectRatio: '1',
        background: `linear-gradient(135deg, ${color}33, ${color}11)`,
        border: `1px solid ${color}55`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: '#9ca3af',
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function ZoneOverviewGrid({ currentDay }: { currentDay: number }) {
  const selectZone = useTwinStore((s) => s.selectZone);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {SCENARIO.zones.map((zone) => {
        const { dominant } = zoneHealthMix(zone, currentDay);
        return (
          <button
            key={zone.zoneId}
            type="button"
            onClick={() => selectZone(zone.zoneId)}
            style={{
              background: '#22262e',
              border: `1px solid ${HEALTH_COLORS[dominant]}44`,
              borderRadius: 6,
              padding: 8,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#e0e0e0',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600 }}>구역 {zone.zoneId + 1}</div>
            <div style={{
              fontSize: 9, color: HEALTH_COLORS[dominant], marginTop: 2, fontWeight: 600,
            }}>
              {HEALTH_LABELS_KO[dominant]}
            </div>
          </button>
        );
      })}
    </div>
  );
}
