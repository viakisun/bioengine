// S4.c + D11 (RFP §15·§17) — Camera Dock.
//
// 좌측에 1~9 단축키 카메라 뷰 전환 UI. D11: BabylonEngine CameraRig.setPreset 실 호출.
//
// docs/proposal/08-entry-and-ux.md §4 UI 컴포넌트 카탈로그 — CameraDock.

import { useEffect } from 'react';
import { getCameraRig } from './single-plant/useSinglePlantState';
import { DOCK_PRESETS } from '../scene/CameraRig';
import { useTwinStore } from '../state/twinStore';
import { createLogger } from '../utils/logger';

const log = createLogger('scene');

export interface CameraView {
  /** 1~9 단축키. */
  key: number;
  /** 짧은 이름 (Obj·EE·Head 등). */
  short: string;
  /** 한 줄 설명 — tooltip. */
  description: string;
  /** mvp: emoji icon. S4+에서 thumbnail PNG. */
  icon: string;
}

export const DEFAULT_VIEWS: readonly CameraView[] = [
  { key: 1, short: 'Obj',   description: '객관 카메라 (orbit)', icon: '' },
  { key: 2, short: 'EE',    description: 'End-effector close-up', icon: '' },
  { key: 3, short: 'Head',  description: 'Robot head (RGB front)', icon: '' },
  { key: 4, short: 'Top',   description: 'Top-down (zone heatmap)', icon: '' },
  { key: 5, short: 'Side',  description: '베드 측면 (작물 정면)', icon: '' },
  { key: 6, short: 'Depth', description: 'Depth (false color)', icon: '' },
  { key: 7, short: 'Mask',  description: 'Segmentation mask', icon: '' },
  { key: 8, short: 'Frust', description: 'FOV frustum visual', icon: '' },
  { key: 9, short: 'Free',  description: 'Free fly (debug)', icon: '' },
] as const;

interface CameraDockProps {
  /** 현재 선택된 카메라 view key. */
  active: number;
  /** 카메라 view 전환 콜백. */
  onSelect: (key: number) => void;
  /** 사용 가능한 views. 기본은 9개 모두. */
  views?: readonly CameraView[];
}

export function CameraDock({ active, onSelect, views = DEFAULT_VIEWS }: CameraDockProps) {
  // D11 — CameraDock 변경 시 BabylonEngine CameraRig.setPreset 실 호출.
  //   EE(2) / Depth(6)는 동적 preset (store 파라미터 반영).
  const eeParams = useTwinStore((s) => s.eeCameraParams);
  useEffect(() => {
    const rig = getCameraRig();
    if (!rig) return;
    try {
      if ((active === 2 || active === 6) && rig.setEePresetDynamic) {
        rig.setEePresetDynamic(eeParams);
      } else {
        const presetName = DOCK_PRESETS[active - 1];
        if (presetName) rig.setPreset(presetName);
      }
    } catch (e) {
      log.warn('CameraDock setPreset failed:', e);
    }
  }, [active, eeParams]);

  // S4.c 단축키 — 1~9 keydown 처리.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // input 등 포커스 시 무시.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && views.some((v) => v.key === n)) {
        onSelect(n);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelect, views]);

  // Instrument Workstation — left sensor rail (62px wide, docked under top bar).
  return (
    <nav
      className="phytosim-cameradock"
      role="toolbar"
      aria-label="Sensor rail (1-9)"
      style={{
        position: 'fixed',
        top: 46,
        left: 0,
        bottom: 54,
        width: 62,
        zIndex: 999,
        background: 'var(--iw-bg-2)',
        borderRight: '1px solid var(--iw-line-1)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 8,
        fontFamily: 'var(--iw-font-ui)',
      }}
    >
      <div
        className="iw-mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--iw-fg-faint)',
          textAlign: 'center',
          padding: '4px 0 8px',
        }}
      >
        VIEW
      </div>
      {views.map((v) => {
        const isActive = active === v.key;
        return (
          <button
            key={v.key}
            onClick={() => onSelect(v.key)}
            title={`[${v.key}] ${v.description}`}
            aria-label={v.description}
            aria-pressed={isActive}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              width: '100%',
              padding: '7px 0',
              background: isActive ? 'var(--iw-accent-soft)' : 'transparent',
              border: 'none',
              borderLeft: isActive ? '2px solid var(--iw-accent)' : '2px solid transparent',
              color: isActive ? 'var(--iw-fg-hi)' : 'var(--iw-fg-dim)',
              cursor: 'pointer',
              fontFamily: 'var(--iw-font-ui)',
            }}
          >
            <span
              className="iw-mono"
              style={{
                fontSize: 10,
                color: isActive ? 'var(--iw-accent)' : 'var(--iw-fg-faint)',
                fontWeight: 600,
              }}
            >
              {v.key}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.01em' }}>{v.short}</span>
          </button>
        );
      })}
    </nav>
  );
}
