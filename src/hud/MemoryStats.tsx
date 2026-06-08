// §19 — Memory & scene stats HUD.
//
// 우상단 (TaskPanel 위쪽 또는 헤더 아래) — 매 1초 갱신.
//   - JS Heap: used / total / limit + bar (Chrome `performance.memory`)
//   - Babylon: mesh count, drawCalls (rough), active vertices
//   - Plant count: PlantManager (getActivePlantManager)
//
// 좌하단의 PhenotypingControls와 짝 — 사용자가 plant/quality 조정 시 변화 실시간 확인.

import { useEffect, useState } from 'react';
import { getActivePlantManager } from '../scene/PlantManager';
import { getSinglePlantSkinMesh } from './single-plant/useSinglePlantState';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './single-plant/styles';

interface MemorySnapshot {
  heapUsedMB: number;
  heapTotalMB: number;
  heapLimitMB: number;
  heapPctUsed: number; // 0~100 (used / limit)
  heapPctReserved: number; // 0~100 (total / limit)
  meshCount: number;
  activeMeshes: number;
  totalVertices: number;
  drawCalls: number;
  fps: number;
  plantCount: number;
  plantMax: number;
}

function snapshot(): MemorySnapshot {
  const perfMem = (performance as unknown as {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  const used = perfMem?.usedJSHeapSize ?? 0;
  const total = perfMem?.totalJSHeapSize ?? 0;
  const limit = perfMem?.jsHeapSizeLimit ?? 0;

  let meshCount = 0;
  let activeMeshes = 0;
  let totalVertices = 0;
  let drawCalls = 0;
  let fps = 0;
  try {
    const skin = getSinglePlantSkinMesh();
    const scene = skin?.root.getScene();
    if (scene) {
      meshCount = scene.meshes.length;
      activeMeshes = scene.getActiveMeshes?.().length ?? 0;
      totalVertices = scene.getTotalVertices?.() ?? 0;
      drawCalls = (scene as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;
      const eng = scene.getEngine();
      fps = eng.getFps?.() ?? 0;
    }
  } catch {
    /* */
  }

  return {
    heapUsedMB: used / 1024 / 1024,
    heapTotalMB: total / 1024 / 1024,
    heapLimitMB: limit / 1024 / 1024,
    heapPctUsed: limit > 0 ? (used / limit) * 100 : 0,
    heapPctReserved: limit > 0 ? (total / limit) * 100 : 0,
    meshCount,
    activeMeshes,
    totalVertices,
    drawCalls,
    fps,
    plantCount: getActivePlantManager()?.getCount() ?? 0,
    plantMax: getActivePlantManager()?.getGeomMax() ?? 0,
  };
}

export function MemoryStats() {
  const [s, setS] = useState<MemorySnapshot>(() => snapshot());

  useEffect(() => {
    const id = setInterval(() => setS(snapshot()), 1000);
    return () => clearInterval(id);
  }, []);

  const heapColor =
    s.heapPctUsed > 80 ? '#f87171' : s.heapPctUsed > 60 ? '#fbbf24' : C_ACCENT;
  const fpsColor = s.fps < 20 ? '#f87171' : s.fps < 40 ? '#fbbf24' : '#34d399';

  return (
    <div
      style={{
        position: 'fixed',
        right: 304,
        top: 64,
        width: 240,
        padding: 10,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: C_FG,
        zIndex: 998,
        userSelect: 'none',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          fontSize: 9,
          color: C_FG_MUTE,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Stats</span>
        <span style={{ color: fpsColor, fontWeight: 600 }}>{s.fps.toFixed(0)} fps</span>
      </div>

      {/* JS Heap bar */}
      <div style={{ marginBottom: 8 }}>
        <Row label="JS Heap" value={`${s.heapUsedMB.toFixed(0)} / ${s.heapLimitMB.toFixed(0)} MB`} valueColor={heapColor} />
        <HeapBar pctUsed={s.heapPctUsed} pctReserved={s.heapPctReserved} color={heapColor} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C_FG_MUTE, marginTop: 2 }}>
          <span>{s.heapPctUsed.toFixed(1)}% used</span>
          <span>reserved {s.heapTotalMB.toFixed(0)} MB</span>
        </div>
      </div>

      {/* Scene */}
      <Row label="Mesh" value={`${s.activeMeshes} / ${s.meshCount}`} title="active / total" />
      <Row label="Vertices" value={fmtNum(s.totalVertices)} />
      <Row label="Draw calls" value={s.drawCalls > 0 ? `${s.drawCalls}` : '—'} />

      {/* Plant */}
      <div style={{ borderTop: `1px solid ${C_BORDER}`, marginTop: 6, paddingTop: 6 }}>
        <Row label="Plants" value={`${s.plantCount} / ${s.plantMax || '—'}`} valueColor={C_ACCENT} />
      </div>

      {!performance || !(performance as unknown as { memory?: unknown }).memory ? (
        <div style={{ fontSize: 9, color: '#f87171', marginTop: 6 }}>
          performance.memory 미지원 (Chrome 외 브라우저)
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
  title,
}: {
  label: string;
  value: string;
  valueColor?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        margin: '2px 0',
      }}
    >
      <span style={{ color: C_FG_MUTE }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: valueColor ?? C_FG,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function HeapBar({ pctUsed, pctReserved, color }: { pctUsed: number; pctReserved: number; color: string }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 6,
        borderRadius: 3,
        background: 'rgba(0,0,0,0.08)',
        overflow: 'hidden',
        marginTop: 3,
      }}
    >
      {/* reserved (lighter) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${Math.min(100, pctReserved)}%`,
          background: 'rgba(0,0,0,0.12)',
        }}
      />
      {/* used (color) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${Math.min(100, pctUsed)}%`,
          background: color,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
