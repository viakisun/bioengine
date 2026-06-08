// S1.f (RFP §15) — TimelineBar.
//
// 0~120일 글로벌 시간 슬라이더 (UX 원칙 §3.6 #3 — 모든 모드 동일 위치).
// BabylonEngine playback state (currentDay/setDay/togglePlay/playSpeed) 와 연결.
//
// S1 mvp: 슬라이더 + play/pause + 속도 ×0.5/×1/×2/×4/×8.
// S2 이후: 시나리오 키 이벤트 마커, 압축/확장.

import { useEffect, useState } from 'react';

export interface TimelinePlayback {
  /** 0~120 (또는 설정에 따라 더 큼). */
  currentDay: number;
  playing: boolean;
  playSpeed: number;
  setDay(day: number): void;
  togglePlay(): void;
  setPlaySpeed(speed: number): void;
}

interface TimelineBarProps {
  /** BabylonEngine 또는 zustand 등에서 playback state 주입. */
  playback: TimelinePlayback;
  /** 0~120일 범위 (기본). 시나리오에 따라 조정 가능. */
  minDay?: number;
  maxDay?: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export function TimelineBar({ playback, minDay = 0, maxDay = 120 }: TimelineBarProps) {
  // 외부 playback 변화에 동기 (BabylonEngine이 update할 때마다).
  // RAF 폴링 — playback이 react state가 아닐 가능성 있어 30 fps tick.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 33) {
        last = t;
        setTick((x) => (x + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const day = playback.currentDay;
  const pct = ((day - minDay) / Math.max(1, maxDay - minDay)) * 100;

  return (
    <div
      className="phytosim-timelinebar"
      data-tick={tick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: 'var(--p-surface, #1a1a1a)',
        borderTop: '1px solid var(--p-border, #333)',
        color: 'var(--p-fg, #ddd)',
        fontSize: 12,
        userSelect: 'none',
      }}
    >
      <button
        className="p-btn"
        onClick={playback.togglePlay}
        aria-label={playback.playing ? '일시정지' : '재생'}
        style={{
          padding: '4px 10px',
          minWidth: 32,
          fontWeight: 600,
        }}
      >
        {playback.playing ? '⏸' : '▶'}
      </button>

      <span style={{ minWidth: 80, fontVariantNumeric: 'tabular-nums' }}>
        Day <strong>{day.toFixed(1)}</strong> / {maxDay}
      </span>

      <input
        type="range"
        min={minDay}
        max={maxDay}
        step={0.5}
        value={day}
        onChange={(e) => playback.setDay(Number(e.currentTarget.value))}
        style={{
          flex: 1,
          accentColor: 'var(--p-accent, #4080d0)',
        }}
        aria-label="식물 생육 일자"
      />

      <div
        className="p-seg"
        role="radiogroup"
        aria-label="재생 속도"
        style={{ display: 'flex', gap: 2 }}
      >
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            className={`p-seg-item ${playback.playSpeed === s ? 'active' : ''}`}
            onClick={() => playback.setPlaySpeed(s)}
            style={{
              padding: '2px 8px',
              fontWeight: playback.playSpeed === s ? 600 : 400,
              fontSize: 11,
            }}
          >
            ×{s}
          </button>
        ))}
      </div>

      <span
        style={{
          minWidth: 36,
          textAlign: 'right',
          color: 'var(--p-fg-dim, #888)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
