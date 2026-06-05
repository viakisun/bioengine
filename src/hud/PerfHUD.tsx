// ★ S140-A — Runtime perf HUD.
//   Babylon engine/scene 폴링 → FPS / draw call / active meshes /
//   vertices / triangles / JS heap. ?perfHud=1 또는 키보드 'P' 토글.
//
// 측정은 매 frame _아닌_ 200ms 폴링 (React 부하 ↓). Mesh 순회는
// scene.meshes 한 번 (active 메시만 카운트 — getActiveMeshes()는 frame-internal).
//
// 측정 대상:
//   - FPS:    engine.getFps()
//   - Draw call: scene.getActiveMeshes().length (근사 — multi-pass 미반영)
//   - Active meshes: scene.getActiveMeshes().length
//   - Total meshes:  scene.meshes.length
//   - Vertices total:  Σ mesh.getTotalVertices()  (enabled only)
//   - Triangles:       Σ floor(mesh.getTotalIndices() / 3)
//   - JS heap (MB): performance.memory.usedJSHeapSize / 1024² (Chromium only)

import { useEffect, useState } from 'react';
import type { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';

interface PerfSnapshot {
  fps: number;
  activeMeshCount: number;
  totalMeshCount: number;
  vertices: number;
  triangles: number;
  drawCalls: number | null;
  heapMB: number | null;
}

const EMPTY: PerfSnapshot = {
  fps: 0,
  activeMeshCount: 0,
  totalMeshCount: 0,
  vertices: 0,
  triangles: 0,
  drawCalls: null,
  heapMB: null,
};

function getScene(): Scene | null {
  const w = window as unknown as { __debugScene?: Scene };
  return w.__debugScene ?? null;
}

function getEngine(): Engine | null {
  const w = window as unknown as { __debugEngine?: { engine?: Engine } | Engine };
  const handle = w.__debugEngine;
  if (!handle) return null;
  if ('engine' in handle && handle.engine) return handle.engine;
  return handle as Engine;
}

function measure(): PerfSnapshot {
  const scene = getScene();
  const engine = getEngine();
  if (!scene || !engine) return EMPTY;

  const fps = Math.round(engine.getFps());
  let activeMeshCount = 0;
  try {
    activeMeshCount = scene.getActiveMeshes().length;
  } catch {
    /* getActiveMeshes() 호출 시점 외부 — fallback 0 */
  }
  let vertices = 0;
  let triangles = 0;
  for (const m of scene.meshes) {
    if (!m.isEnabled() || !m.isVisible) continue;
    vertices += m.getTotalVertices();
    triangles += Math.floor(m.getTotalIndices() / 3);
  }
  const memAny = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const heapMB = memAny ? Math.round(memAny.usedJSHeapSize / (1024 * 1024)) : null;
  // Babylon engine._drawCalls (PerfCounter) — _ prefix internal but stable API.
  const drawCalls = (engine as unknown as { _drawCalls?: { current: number } })
    ._drawCalls?.current ?? null;
  return {
    fps,
    activeMeshCount,
    totalMeshCount: scene.meshes.length,
    vertices,
    triangles,
    drawCalls,
    heapMB,
  };
}

function initialVisible(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('perfHud') === '1';
}

function formatK(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const valColor =
    tone === 'ok' ? '#3ecf8e' :
    tone === 'warn' ? '#f59e0b' :
    tone === 'bad' ? '#ef4444' :
    '#ededed';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: '#a1a1aa' }}>{label}</span>
      <span style={{ color: valColor, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export function PerfHUD() {
  const [visible, setVisible] = useState<boolean>(initialVisible);
  const [snap, setSnap] = useState<PerfSnapshot>(EMPTY);

  // 키보드 토글 — Shift+P (단순 P는 textarea/input과 충돌 우려).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = 0;
    // ★ S142 후속 — drawCalls 누적 카운터 → per-frame derive.
    //   engine._drawCalls.current 는 frame과 무관하게 누적. delta를 시간 + fps로
    //   나눠 per-frame 추정. 첫 sample은 null (prev 없음).
    let prevDrawCallsRaw: number | null = null;
    let prevDrawCallsTs = 0;
    const tick = (ts: number) => {
      if (ts - last >= 200) {
        const m = measure();
        let drawCallsPerFrame: number | null = null;
        if (m.drawCalls != null) {
          if (prevDrawCallsRaw != null && prevDrawCallsTs > 0) {
            const deltaCalls = m.drawCalls - prevDrawCallsRaw;
            const deltaSec = (ts - prevDrawCallsTs) / 1000;
            if (deltaSec > 0 && m.fps > 0) {
              const callsPerSec = deltaCalls / deltaSec;
              drawCallsPerFrame = Math.max(0, Math.round(callsPerSec / m.fps));
            }
          }
          prevDrawCallsRaw = m.drawCalls;
          prevDrawCallsTs = ts;
        }
        setSnap({ ...m, drawCalls: drawCallsPerFrame });
        last = ts;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  // FPS tone — 55+ ok, 30-55 warn, <30 bad
  const fpsTone: 'ok' | 'warn' | 'bad' = snap.fps >= 55 ? 'ok' : snap.fps >= 30 ? 'warn' : 'bad';
  // verts tone — 0.5M ok, <1.5M warn, ≥1.5M bad
  const vertTone: 'ok' | 'warn' | 'bad' = snap.vertices < 500_000 ? 'ok' : snap.vertices < 1_500_000 ? 'warn' : 'bad';

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 100,
        minWidth: 180,
        padding: '10px 14px',
        background: 'rgba(20, 20, 20, 0.86)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: 8,
        fontFamily: '"JetBrains Mono", Menlo, monospace',
        fontSize: 11,
        lineHeight: 1.55,
        color: '#ededed',
        pointerEvents: 'auto',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          color: '#71717a',
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>PERF</span>
        <span style={{ color: '#52525b' }}>shift+P</span>
      </div>
      <Row label="fps" value={String(snap.fps)} tone={fpsTone} />
      <Row label="meshes" value={`${snap.activeMeshCount}/${snap.totalMeshCount}`} />
      <Row label="verts" value={formatK(snap.vertices)} tone={vertTone} />
      <Row label="tris" value={formatK(snap.triangles)} />
      {snap.drawCalls != null && <Row label="dc/frame" value={String(snap.drawCalls)} />}
      {snap.heapMB != null && <Row label="heap" value={`${snap.heapMB}MB`} />}
    </div>
  );
}
