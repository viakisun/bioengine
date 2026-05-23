// SinglePlantLayout — 4-pane composition for the Single-Plant Analysis
// mode. CSS grid:
//
//   topBar           topBar             topBar
//   tools            viewport           inspector
//   timelineChart    timelineChart      timelineChart
//   timelineSlider   timelineSlider     timelineSlider
//   statusBar        statusBar          statusBar

import { useTwinStore } from '../store/twinStore';
import { SinglePlantScene } from './SinglePlantScene';
import { ToolsPanel } from '../ui/single-plant/ToolsPanel';
import { InspectorPanel } from '../ui/single-plant/InspectorPanel';
import { TimelineChart } from '../ui/single-plant/TimelineChart';
import { TimelineSlider } from '../ui/single-plant/TimelineSlider';
import { StatusBar } from '../ui/single-plant/StatusBar';
import { PARGauge } from '../ui/single-plant/PARGauge';
import { FONT_SERIF, FONT_MONO, C_BG, C_FG, C_FG_MUTE, C_BORDER } from '../ui/single-plant/styles';

const PLANT_SEED = 1001;

function formatTopBarSimId(minute: number): string {
  return `cv=tomimaru-muchoo seed=${PLANT_SEED}`;
}

export function SinglePlantLayout() {
  const setMode = useTwinStore((s) => s.setMode);
  const minute = useTwinStore((s) => s.singlePlantMinute);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: C_BG,
      color: C_FG,
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto auto auto',
      gridTemplateColumns: '220px 1fr 340px',
      gridTemplateAreas: `
        "topbar topbar topbar"
        "tools viewport inspector"
        "chart chart chart"
        "slider slider slider"
        "status status status"
      `,
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        gridArea: 'topbar',
        padding: '10px 18px',
        borderBottom: `1px solid ${C_BORDER}`,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <button
          type="button"
          onClick={() => setMode('lobby')}
          style={{
            background: 'none',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 3,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: FONT_MONO,
            cursor: 'pointer',
            color: C_FG,
          }}
        >
          ◂ Lobby
        </button>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 600 }}>
          Single-Plant Analysis
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG_MUTE,
        }}>
          Sim: {formatTopBarSimId(minute)} +M{minute}
        </span>
      </div>

      {/* Tools */}
      <div style={{ gridArea: 'tools', minHeight: 0, overflow: 'auto' }}>
        <ToolsPanel />
      </div>

      {/* Viewport */}
      <div style={{ gridArea: 'viewport', position: 'relative', overflow: 'hidden' }}>
        <SinglePlantScene />
        <PARGauge />
      </div>

      {/* Inspector */}
      <div style={{ gridArea: 'inspector', minHeight: 0, overflow: 'auto' }}>
        <InspectorPanel />
      </div>

      {/* Timeline chart */}
      <div style={{ gridArea: 'chart', height: 180, minHeight: 0, overflow: 'hidden' }}>
        <TimelineChart />
      </div>

      {/* Timeline slider */}
      <div style={{ gridArea: 'slider' }}>
        <TimelineSlider />
      </div>

      {/* Status bar */}
      <div style={{ gridArea: 'status' }}>
        <StatusBar />
      </div>
    </div>
  );
}
