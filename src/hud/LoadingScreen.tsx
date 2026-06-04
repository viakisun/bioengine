// ★ S141-C — Phytosim loading screen (Supabase dark theme, BootOverlay 대체).
//
// 목표 인상: minimal + professional dev tool. 사용자가 처음 보는 부팅 화면.
// 중심 영역에 active mode + 현재 stage + progress bar만 표시.
// 진단 정보 (stage list, live log, env) 는 _Details_ disclosure로 숨김 — 평소엔 깔끔, 필요 시 열어볼 수 있음.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTwinStore, BOOT_STAGES, type BootStage, type StageInfo } from '../state/twinStore';
import { getActiveMode } from '../modes/activeMode';
import { MODES } from '../modes/registry';
import { BRAND, getBuildHash } from '../modes/brand';
import '../styles/phytosim.css';

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

const LOG_LEVEL_COLOR: Record<'log' | 'info' | 'warn' | 'error', string> = {
  log: 'var(--p-fg-dim)',
  info: 'var(--p-info)',
  warn: 'var(--p-warn)',
  error: 'var(--p-bad)',
};
const LOG_LEVEL_PREFIX = { log: ' ', info: 'ℹ', warn: '⚠', error: '✕' } as const;

function formatMs(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatLogTs(ts: number, originTs: number): string {
  return `+${((ts - originTs) / 1000).toFixed(2)}s`;
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
  const icon = isDone ? '✓' : isCurrent ? '◌' : '○';
  const elapsed = info.startedAt != null && info.completedAt != null
    ? info.completedAt - info.startedAt
    : null;
  const color = isCurrent ? 'var(--p-fg)' : isDone ? 'var(--p-ok)' : 'var(--p-fg-dim)';
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--p-mono)',
        fontSize: 12,
        color,
        fontWeight: isCurrent ? 600 : 400,
      }}>
        <span><span style={{ marginRight: 6 }}>{icon}</span>{STAGE_LABELS[stage]}</span>
        <span style={{ fontSize: 11, color: 'var(--p-fg-faint)' }}>
          {elapsed != null ? formatMs(elapsed) : isCurrent ? `${(info.progress * 100).toFixed(0)}%` : ''}
        </span>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  const boot = useTwinStore((s) => s.boot);
  const isReady = boot.currentStage === 'ready';
  const [showDetails, setShowDetails] = useState(false);

  // tick for elapsed time
  const [, setTick] = useState(0);
  useEffect(() => {
    if (isReady) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [isReady]);

  // fade-out
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!isReady) return;
    const id = window.setTimeout(() => setHidden(true), 350);
    return () => window.clearTimeout(id);
  }, [isReady]);

  // auto-scroll log
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showDetails && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [boot.liveLog.length, showDetails]);

  if (boot.hasEverReached) return null;
  if (hidden) return null;

  const elapsed = (performance.now() - boot.startedAt) / 1000;
  const totalStages = VISIBLE_STAGES.length;
  const overallProgress = VISIBLE_STAGES.reduce((acc, s) => {
    const info = boot.stages[s];
    if (info.completedAt != null) return acc + 1 / totalStages;
    if (s === boot.currentStage) return acc + info.progress / totalStages;
    return acc;
  }, 0);

  const etaText = boot.etaSecondsMin != null && boot.etaSecondsMax != null
    ? `예상 ${boot.etaSecondsMin}~${boot.etaSecondsMax}초`
    : `${elapsed.toFixed(1)}초 경과`;

  // active mode 표시 — Entry에서 setActiveMode() 직전 호출되므로 안전.
  const active = getActiveMode();
  const modeSpec = MODES[active.mode];

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
    background: 'var(--p-bg)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'opacity 250ms ease',
    opacity: isReady ? 0 : 1,
    pointerEvents: isReady ? 'none' : 'auto',
  };

  return (
    <div className="phytosim-entry" style={overlayStyle}>
      {/* Top brand bar — minimal */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '20px 32px',
          borderBottom: '1px solid var(--p-border)',
        }}
      >
        <span className="p-dot" />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {BRAND.name}
        </span>
      </header>

      {/* Center panel — mode + progress */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 32,
        }}
      >
        {/* Mode identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'var(--p-accent-muted)',
              border: '1px solid var(--p-border-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            {modeSpec.icon}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {modeSpec.name}
          </div>
          <div className="p-mono" style={{ color: 'var(--p-fg-dim)', fontSize: 11 }}>
            {modeSpec.key} · quality={active.quality.level}
          </div>
        </div>

        {/* Progress block */}
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              color: 'var(--p-fg-muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--p-accent)', fontFamily: 'var(--p-mono)' }}>◌</span>
              <span style={{ color: 'var(--p-fg)' }}>{STAGE_LABELS[boot.currentStage]}</span>
            </span>
            <span className="p-mono" style={{ color: 'var(--p-fg-dim)', fontSize: 12 }}>
              {(overallProgress * 100).toFixed(0)}%
            </span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: 4,
              background: 'var(--p-bg-deep)',
              borderRadius: 2,
              overflow: 'hidden',
              border: '1px solid var(--p-border)',
            }}
          >
            <div
              style={{
                width: `${(overallProgress * 100).toFixed(1)}%`,
                height: '100%',
                background: 'var(--p-accent)',
                transition: 'width 200ms ease',
                boxShadow: '0 0 8px var(--p-accent-glow)',
              }}
            />
          </div>

          <div
            className="p-mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--p-fg-faint)',
            }}
          >
            <span>{etaText}</span>
            <button
              className="p-link"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--p-mono)',
                fontSize: 11,
              }}
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>

        {/* Details disclosure */}
        {showDetails && (
          <div
            className="p-surface"
            style={{
              width: '100%',
              maxWidth: 760,
              padding: 20,
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr',
              gap: 24,
              minHeight: 240,
              maxHeight: 320,
            }}
          >
            {/* Stage list */}
            <div style={{ overflow: 'auto' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: 'var(--p-fg-dim)',
                  marginBottom: 10,
                }}
              >
                Stages
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
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: 'var(--p-fg-dim)',
                  marginBottom: 10,
                }}
              >
                Live log ({boot.liveLog.length})
              </div>
              <div
                ref={logRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  fontFamily: 'var(--p-mono)',
                  fontSize: 11,
                  lineHeight: 1.55,
                  background: 'var(--p-bg-deep)',
                  border: '1px solid var(--p-border)',
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                {boot.liveLog.map((entry) => (
                  <div
                    key={entry.id}
                    style={{ color: LOG_LEVEL_COLOR[entry.level], whiteSpace: 'pre-wrap' }}
                  >
                    <span style={{ color: 'var(--p-fg-faint)' }}>
                      {formatLogTs(entry.ts, boot.startedAt)}
                    </span>
                    {'  '}
                    <span>{LOG_LEVEL_PREFIX[entry.level]}</span>
                    {'  '}
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer — version */}
      <footer
        style={{
          padding: '16px 32px',
          borderTop: '1px solid var(--p-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
        }}
      >
        <span className="p-mono" style={{ color: 'var(--p-fg-faint)' }}>
          {boot.env.backend} · {boot.env.viewport.w}×{boot.env.viewport.h}
        </span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span className="p-mono" style={{ color: 'var(--p-fg-dim)' }}>
            v{BRAND.version}
          </span>
          <span className="p-mono" style={{ color: 'var(--p-fg-faint)' }}>
            · {getBuildHash()}
          </span>
        </span>
      </footer>
    </div>
  );
}
