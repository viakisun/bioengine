// Full-screen boot overlay — 4 regions (stages, live log, env, progress).
//
// Renders whenever store.boot.currentStage !== 'ready'. Once ready, fades
// out over 250ms then unmounts. Inline-styled because:
//   - it must render before any CSS module from src/ui/ui-kit.css is
//     guaranteed to be parsed (it's the first thing the user sees)
//   - the layout is one-of-a-kind; no point bloating ui-kit.css
//
// All timings + counters live in twinStore.boot — see plan
// a-drifting-wigderson.md.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTwinStore, BOOT_STAGES, type BootStage, type StageInfo } from '../state/twinStore';

const STAGE_LABELS: Record<BootStage, string> = {
  init: '초기화',
  engine: '엔진 (WebGL/WebGPU)',
  setup: '씬 셋업 (IBL · 그림자)',
  greenhouse: '온실 인프라',
  plants: '식물 빌드',
  quality: '렌더 품질',
  shaders: '셰이더 컴파일',
  ready: '준비 완료',
};

const VISIBLE_STAGES = BOOT_STAGES.filter((s) => s !== 'init' && s !== 'ready');

function formatMs(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}초`;
}

function formatLogTs(ts: number, originTs: number): string {
  const delta = ts - originTs;
  const s = (delta / 1000).toFixed(2);
  return `+${s}s`;
}

function StageRow({
  stage,
  info,
  isCurrent,
  isDone,
}: {
  stage: BootStage;
  info: StageInfo;
  isCurrent: boolean;
  isDone: boolean;
}) {
  const icon = isDone ? '✓' : isCurrent ? '⏳' : '○';
  const elapsed = info.startedAt != null && info.completedAt != null
    ? info.completedAt - info.startedAt
    : null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'monospace',
        fontSize: 13,
        color: isCurrent ? 'var(--fg)' : isDone ? 'var(--ok)' : 'var(--fg-dim)',
        fontWeight: isCurrent ? 600 : 400,
      }}>
        <span><span style={{ marginRight: 6 }}>{icon}</span>{STAGE_LABELS[stage]}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-mute)' }}>
          {elapsed != null ? formatMs(elapsed) : isCurrent ? `${(info.progress * 100).toFixed(0)}%` : ''}
        </span>
      </div>
      {isCurrent && info.detail && (
        <div style={{ paddingLeft: 18, fontSize: 12, color: 'var(--fg-mute)' }}>
          └ {info.detail}
        </div>
      )}
      {isCurrent && info.subCounters && info.subCounters.length > 0 && (
        <div style={{ paddingLeft: 26, fontSize: 11, color: 'var(--fg-dim)' }}>
          {info.subCounters.map((c, i) => (
            <span key={i} style={{ marginRight: 10 }}>· {c.label}: {c.value}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const LOG_LEVEL_COLOR = {
  log: 'var(--fg-dim)',
  info: 'var(--accent)',
  warn: 'var(--warn)',
  error: 'var(--bad)',
} as const;
const LOG_LEVEL_PREFIX = { log: ' ', info: 'ℹ', warn: '⚠', error: '✕' } as const;

export function BootOverlay() {
  const boot = useTwinStore((s) => s.boot);
  const isReady = boot.currentStage === 'ready';

  // Tick for elapsed-time display — 200ms is the sweet spot (visible
  // motion without React thrashing).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (isReady) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [isReady]);

  // Fade-out 250ms after 'ready' — keep mounted until the transition ends.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!isReady) return;
    const id = window.setTimeout(() => setHidden(true), 350);
    return () => window.clearTimeout(id);
  }, [isReady]);

  // Auto-scroll live log to bottom on new entries.
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [boot.liveLog.length]);

  // Early returns must come AFTER all hook calls (React Rules of Hooks).
  // 첫 부팅 (ready 도달 전) 만 풀스크린 표시. 한 번 ready 도달 후엔
  // 모드 전환 / 카메라 조작 / 시뮬레이션 trigger 로 stage 가 다시
  // 'engine' 같은 값으로 와도 풀스크린 안 띄움 (사용자 의도).
  if (boot.hasEverReached) return null;
  if (hidden) return null;

  const elapsed = (performance.now() - boot.startedAt) / 1000;

  // Overall progress — weighted average of stages (each weighs 1/N).
  const totalStages = VISIBLE_STAGES.length;
  const overallProgress = VISIBLE_STAGES.reduce((acc, s) => {
    const info = boot.stages[s];
    if (info.completedAt != null) return acc + 1 / totalStages;
    if (s === boot.currentStage) return acc + info.progress / totalStages;
    return acc;
  }, 0);

  const etaText = boot.etaSecondsMin != null && boot.etaSecondsMax != null
    ? ` · 예상 ${boot.etaSecondsMin}~${boot.etaSecondsMax}초`
    : '';

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
    background: 'rgba(248, 247, 243, 0.96)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 48px',
    transition: 'opacity 250ms ease',
    opacity: isReady ? 0 : 1,
    pointerEvents: isReady ? 'none' : 'auto',
    color: 'var(--fg)',
  };

  return (
    <div style={overlayStyle}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, textAlign: 'center' }}>
        🌱 FarmSim 로딩중
      </div>

      {/* Two columns — stages on the left, live log on the right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24, flex: 1, minHeight: 0 }}>
        {/* Stages */}
        <div style={{
          background: 'var(--bg-panel-solid)',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          overflow: 'auto',
        }}>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em' }}>
            단계
          </div>
          {VISIBLE_STAGES.map((stage) => {
            const info = boot.stages[stage];
            const isCurrent = stage === boot.currentStage;
            const isDone = info.completedAt != null;
            return (
              <StageRow key={stage} stage={stage} info={info} isCurrent={isCurrent} isDone={isDone} />
            );
          })}
        </div>

        {/* Live log */}
        <div style={{
          background: 'var(--bg-panel-solid)',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em' }}>
            라이브 로그 ({boot.liveLog.length})
          </div>
          <div ref={logRef} style={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
            fontSize: 11,
            lineHeight: 1.55,
          }}>
            {boot.liveLog.map((entry) => (
              <div key={entry.id} style={{ color: LOG_LEVEL_COLOR[entry.level], whiteSpace: 'pre-wrap' }}>
                <span style={{ color: 'var(--fg-dim)' }}>{formatLogTs(entry.ts, boot.startedAt)}</span>
                {'  '}
                <span>{LOG_LEVEL_PREFIX[entry.level]}</span>
                {'  '}
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Environment panel */}
      <div style={{
        marginTop: 16,
        background: 'var(--bg-softer)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        color: 'var(--fg-mute)',
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <span>백엔드: <strong style={{ color: 'var(--fg)' }}>{boot.env.backend}</strong></span>
        <span>장치: <strong style={{ color: 'var(--fg)' }}>{boot.env.gpuDevice || '—'}</strong></span>
        <span>해상도: {boot.env.viewport.w}×{boot.env.viewport.h} @ {boot.env.dpr}dpr</span>
        <span>메쉬: {boot.env.counters.meshes.toLocaleString()}</span>
        <span>삼각형: {(boot.env.counters.triangles / 1000).toFixed(0)}K</span>
        <span>텍스처: {boot.env.counters.textures}</span>
        <span>머티리얼: {boot.env.counters.materials}</span>
        {boot.env.counters.memoryMB != null && (
          <span>메모리: {boot.env.counters.memoryMB} MB</span>
        )}
      </div>

      {/* Overall progress bar */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          width: '100%',
          height: 6,
          background: 'var(--bg-softer)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(overallProgress * 100).toFixed(1)}%`,
            height: '100%',
            background: 'var(--accent)',
            transition: 'width 200ms ease',
          }} />
        </div>
        <div style={{
          marginTop: 6,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: 'var(--fg-mute)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>{(overallProgress * 100).toFixed(0)}% · {elapsed.toFixed(1)}초 경과{etaText}</span>
          <span>{STAGE_LABELS[boot.currentStage]}</span>
        </div>
      </div>
    </div>
  );
}
