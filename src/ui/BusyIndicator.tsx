// BusyIndicator — 우하단 작은 corner spinner.
//
// 사용자 의도: "들어가서 로딩창 띄울 필요는 없을거 같은데? 이건
// 로딩창이 아니라, 어딘가에 그냥 빙빙 돌리는게 있는게 차라리 좀
// 자연스럽지 않을까."
//
// store.busy.active 가 true 일 때만 표시. 옵션 message 라벨.
// 위치: 우하단 16px, BootOverlay (z 900) 보다 낮은 z=850.

import { useTwinStore } from '../store/twinStore';

export function BusyIndicator() {
  const busy = useTwinStore((s) => s.busy);
  if (!busy.active) return null;

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      zIndex: 850,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(25, 30, 25, 0.12)',
      borderRadius: 20,
      fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
      fontSize: 11,
      color: '#3a3f3a',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <Spinner />
      {busy.message && <span>{busy.message}</span>}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      style={{ animation: 'fs-spin 700ms linear infinite' }}
    >
      <defs>
        <style>{`
          @keyframes fs-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </defs>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="2.5" />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
