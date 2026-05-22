/**
 * Sidebar — tabbed analysis panel.
 *
 * Three tabs:
 *   • 구역 — MiniUWB row + 6 zone cards in a 2-col grid; selecting a
 *     zone reveals metrics + sparkline + capture thumbs below.
 *   • 이벤트 — flat list of recent events (most recent first).
 *   • 환경 — wind / water-stress sliders (EnvironmentControls inline)
 *     plus a couple of read-only environment metrics.
 *
 * Reference: _ref/Sim UI v2 _standalone_.html .zone / .evt / .uwb classes.
 */

import { useMemo, useState } from 'react';
import { useTwinStore } from '../store/twinStore';
import {
  SCENARIO,
  HEALTH_LABELS_KO,
  zoneHealthMix,
  getDailySnapshot,
} from '../data/mockScenario';
import { CaptureThumbs } from './CaptureThumbs';
import { PatrolMap } from './PatrolMap';
import {
  Eyebrow,
  TabStrip,
  type TabItem,
  ZoneCard,
  EventRow,
  Sparkline,
} from '../ui';

type SidebarTab = 'zones' | 'events' | 'patrol' | 'env';

const TABS: ReadonlyArray<TabItem<SidebarTab>> = [
  { id: 'zones', label: '구역' },
  { id: 'events', label: '이벤트' },
  { id: 'patrol', label: '경로' },
  { id: 'env', label: '환경' },
];

export function AnalysisPanel() {
  const [tab, setTab] = useState<SidebarTab>('zones');

  return (
    <div
      className="scroll-y"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '14px 14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <TabStrip<SidebarTab> items={TABS} active={tab} onSelect={setTab} />
      </div>

      {tab === 'zones' && <ZonesTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'patrol' && <PatrolMap />}
      {tab === 'env' && <EnvTab />}
    </div>
  );
}

/* ===================== Zones tab ===================== */

function ZonesTab() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const selectedZoneId = useTwinStore((s) => s.selectedZoneId);
  const hoveredZoneId = useTwinStore((s) => s.hoveredZoneId);
  const selectZone = useTwinStore((s) => s.selectZone);

  const displayZoneId = hoveredZoneId ?? selectedZoneId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SCENARIO.zones.map((zone) => {
          const { dominant } = zoneHealthMix(zone, currentDay);
          const bad = dominant !== 'normal';
          return (
            <ZoneCard
              key={zone.zoneId}
              num={zone.zoneId + 1}
              title={`구역 ${zone.zoneId + 1}`}
              state={HEALTH_LABELS_KO[dominant]}
              bad={bad}
              selected={displayZoneId === zone.zoneId}
              onClick={() => selectZone(zone.zoneId)}
            />
          );
        })}
      </div>

      {displayZoneId !== null && <ZoneDetail zoneId={displayZoneId} />}
    </div>
  );
}

function ZoneDetail({ zoneId }: { zoneId: number }) {
  const currentDay = useTwinStore((s) => s.currentDay);
  const zone = SCENARIO.zones[zoneId];

  const { totals, sparkValues, session, dominant } = useMemo(() => {
    let totalH = 0,
      totalLA = 0,
      totalFruits = 0,
      totalRipen = 0;
    const n = zone.plantIds.length;
    for (const pid of zone.plantIds) {
      const snap = getDailySnapshot(SCENARIO.plants[pid], currentDay);
      totalH += snap.heightCm;
      totalLA += snap.leafAreaCm2;
      totalFruits += snap.fruitCount;
      totalRipen += snap.ripenScore;
    }
    const spark: number[] = [];
    for (let d = Math.max(0, currentDay - 14); d <= currentDay; d += 1) {
      let h = 0;
      for (const pid of zone.plantIds) {
        h += getDailySnapshot(SCENARIO.plants[pid], d).heightCm;
      }
      spark.push(h / n);
    }
    const session = SCENARIO.captureSessions.find(
      (s) => s.zoneId === zone.zoneId && s.day <= currentDay && currentDay - s.day < 3
    );
    return {
      totals: {
        avgH: totalH / n,
        avgLA: totalLA / n,
        avgFruits: totalFruits / n,
        avgRipen: totalRipen / n,
      },
      sparkValues: spark,
      session,
      dominant: zoneHealthMix(zone, currentDay).dominant,
    };
  }, [zone, currentDay]);

  return (
    <div
      className="panel"
      style={{
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          구역 {zone.zoneId + 1}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color:
              dominant === 'normal'
                ? 'var(--ok)'
                : dominant === 'disease'
                ? 'var(--bad)'
                : 'var(--warn)',
          }}
        >
          {HEALTH_LABELS_KO[dominant]}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
        {zone.startX.toFixed(1)} ~ {zone.endX.toFixed(1)} m · {zone.plantIds.length}그루
      </div>

      <Eyebrow>생육 지표 · 평균</Eyebrow>
      <MetricRow label="초장">
        <span className="mono">{totals.avgH.toFixed(1)} cm</span>
      </MetricRow>
      <MetricRow label="엽면적">
        <span className="mono">{totals.avgLA.toFixed(0)} cm²</span>
      </MetricRow>
      <MetricRow label="착과수">
        <span className="mono">{totals.avgFruits.toFixed(1)} 개/그루</span>
      </MetricRow>
      <MetricRow label="숙도">
        <span className="mono">{(totals.avgRipen * 100).toFixed(0)} %</span>
      </MetricRow>

      <div
        style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--bd)',
          borderRadius: 8,
          padding: '6px 8px',
          marginTop: 4,
        }}
      >
        <Sparkline
          values={sparkValues}
          cursorIndex={sparkValues.length - 1}
          color="var(--ok)"
          label="최근 14일 초장 추이"
          height={56}
        />
      </div>

      {session && (
        <>
          <Eyebrow>최근 촬영 세션</Eyebrow>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: -4 }}
          >
            Day {session.day} · {session.hour}:00 · #{session.targetPlantId + 1}
          </div>
          <CaptureThumbs session={session} healthLabel={dominant} />
        </>
      )}
    </div>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        borderBottom: '1px solid var(--bd)',
        fontSize: 12,
        color: 'var(--fg)',
      }}
    >
      <span style={{ color: 'var(--fg-mute)' }}>{label}</span>
      {children}
    </div>
  );
}

/* ===================== Events tab ===================== */

function EventsTab() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const setDay = useTwinStore((s) => s.setDay);

  // Most recent up to 30 events at/before current day (skip future).
  const events = useMemo(() => {
    return [...SCENARIO.events]
      .filter((e) => e.day <= currentDay + 0.5)
      .sort((a, b) => b.day - a.day)
      .slice(0, 30);
  }, [currentDay]);

  return (
    <div
      className="panel"
      style={{ padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {events.length === 0 ? (
        <div
          style={{
            padding: 16,
            fontSize: 12,
            color: 'var(--fg-mute)',
            textAlign: 'center',
          }}
        >
          아직 이벤트가 없습니다.
        </div>
      ) : (
        events.map((evt) => (
          <EventRow
            key={evt.id}
            severity={evt.severity}
            title={evt.descriptionKo}
            sub={`구역 ${evt.zoneId + 1} · 식물 #${evt.plantId + 1}`}
            meta={`Day ${evt.day}`}
            onClick={() => setDay(evt.day)}
          />
        ))
      )}
    </div>
  );
}

/* ===================== Env tab ===================== */

function EnvTab() {
  const windStrength = useTwinStore((s) => s.windStrength);
  const setWindStrength = useTwinStore((s) => s.setWindStrength);
  const waterStressOverride = useTwinStore((s) => s.waterStressOverride);
  const setWaterStressOverride = useTwinStore((s) => s.setWaterStressOverride);

  const heatmapVisible = useTwinStore((s) => s.heatmapVisible);
  const fovVisible = useTwinStore((s) => s.fovVisible);
  const pathTrailVisible = useTwinStore((s) => s.pathTrailVisible);
  const toggleHeatmap = useTwinStore((s) => s.toggleHeatmap);
  const toggleFov = useTwinStore((s) => s.toggleFov);
  const togglePathTrail = useTwinStore((s) => s.togglePathTrail);

  return (
    <div
      className="panel"
      style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <Eyebrow>환경 제어</Eyebrow>
      <SliderRow
        label="바람 세기"
        value={windStrength}
        onChange={setWindStrength}
        valueText={windStrength.toFixed(2)}
      />
      <SliderRow
        label="수분 스트레스"
        value={waterStressOverride}
        onChange={setWaterStressOverride}
        valueText={waterStressOverride > 0 ? waterStressOverride.toFixed(2) : 'OFF'}
      />

      <Eyebrow>레이어</Eyebrow>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <ToggleBtn on={heatmapVisible} onClick={toggleHeatmap}>
          히트맵
        </ToggleBtn>
        <ToggleBtn on={fovVisible} onClick={toggleFov}>
          FOV
        </ToggleBtn>
        <ToggleBtn on={pathTrailVisible} onClick={togglePathTrail}>
          경로
        </ToggleBtn>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  valueText,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  valueText: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
      >
        <span style={{ color: 'var(--fg-mute)' }}>{label}</span>
        <span className="mono" style={{ color: 'var(--ok)' }}>
          {valueText}
        </span>
      </div>
      <input
        type="range"
        className="slim"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function ToggleBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn${on ? ' is-active' : ''}`}
      style={{ padding: '0 12px' }}
    >
      {children}
    </button>
  );
}
