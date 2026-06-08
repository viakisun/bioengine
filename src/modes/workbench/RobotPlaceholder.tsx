// S4.a (RFP §15) — Robot placeholder.
//
// URL `?robotProfile=phenotyping` 일 때 phenotyping trolley SVG (흰색 chassis · 4 스트럿 ·
// hybrid wheel · 짐벌 카메라). 그 외에는 기존 AGV+6DOF arm.

interface RobotPlaceholderProps {
  /** 현재 선택된 카메라 view (EE/Head 시점에서 강조). */
  activeView: number;
}

function getProfile(): 'phenotyping' | 'agv-arm' {
  if (typeof window === 'undefined') return 'agv-arm';
  const p = new URL(window.location.href).searchParams.get('robotProfile');
  return p === 'phenotyping' ? 'phenotyping' : 'agv-arm';
}

export function RobotPlaceholder({ activeView }: RobotPlaceholderProps) {
  const profile = getProfile();
  const showFrustum = activeView === 8;
  const showEE = activeView === 2;
  const showHead = activeView === 3;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 64,
        right: 12,
        width: 180,
        padding: 10,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 999,
        color: 'var(--p-fg, #ddd)',
        fontSize: 11,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', marginBottom: 6 }}>
        Robot · {profile === 'phenotyping' ? 'via-phenotyping-v1' : 'via-agv-6dof-v1'}
      </div>

      {profile === 'phenotyping' ? (
        <PhenotypingSvg showHead={showHead} showFrustum={showFrustum} />
      ) : (
        <AgvArmSvg showEE={showEE} showHead={showHead} showFrustum={showFrustum} />
      )}

      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--p-fg-dim, #888)', lineHeight: 1.3 }}>
        {profile === 'phenotyping' ? (
          <>
            {showHead && <>Gimbal · 60° side scan</>}
            {showFrustum && <>FOV 60° · pan ±90°</>}
            {!showHead && !showFrustum && <>Phenotyping trolley · 4 strut · gimbal cam</>}
          </>
        ) : (
          <>
            {showFrustum && <>FOV cone · 45° lens</>}
            {showEE && <>EE close-up · cutter blade</>}
            {showHead && <>Head RGB · 60° front</>}
            {!showFrustum && !showEE && !showHead && <>AGV chassis · 6DOF arm · cutter</>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Phenotyping trolley ───────────────────────────────────────────────
function PhenotypingSvg({ showHead, showFrustum }: { showHead: boolean; showFrustum: boolean }) {
  return (
    <svg viewBox="0 0 160 110" style={{ width: '100%', display: 'block' }}>
      {/* 튜브레일 — 2개 파이프 단면 (정면도) */}
      <circle cx={64} cy={100} r={4} fill="#bdbeb8" stroke="#888" strokeWidth={0.5} />
      <circle cx={96} cy={100} r={4} fill="#bdbeb8" stroke="#888" strokeWidth={0.5} />
      <line x1={10} y1={104} x2={150} y2={104} stroke="#5a5a5a" strokeWidth={1.5} />

      {/* 외측 큰 타이어 (좌·우) + 내측 튜브휠 (좌·우) */}
      <ellipse cx={28} cy={96} rx={9} ry={9} fill="#222" stroke="#555" strokeWidth={0.5} />
      <ellipse cx={132} cy={96} rx={9} ry={9} fill="#222" stroke="#555" strokeWidth={0.5} />
      <ellipse cx={64} cy={96} rx={5} ry={5} fill="#777" stroke="#aaa" strokeWidth={0.5} />
      <ellipse cx={96} cy={96} rx={5} ry={5} fill="#777" stroke="#aaa" strokeWidth={0.5} />
      {/* axle hint — wheel 간 직선 */}
      <line x1={28} y1={96} x2={64} y2={96} stroke="#3a3a3a" strokeWidth={1} />
      <line x1={96} y1={96} x2={132} y2={96} stroke="#3a3a3a" strokeWidth={1} />

      {/* 4 스트럿 (검은 강관, 코너 4개) */}
      <rect x={26} y={42} width={4} height={50} fill="#0a0a0a" />
      <rect x={130} y={42} width={4} height={50} fill="#0a0a0a" />
      <rect x={56} y={42} width={3} height={50} fill="#0a0a0a" opacity={0.6} />
      <rect x={101} y={42} width={3} height={50} fill="#0a0a0a" opacity={0.6} />

      {/* 흰색 trolley chassis (얇은 베드) */}
      <rect x={20} y={36} width={120} height={10} rx={3} fill="#f5f5f0" stroke="#bbb" strokeWidth={0.5} />
      <rect x={20} y={36} width={120} height={2} rx={1} fill="#e2e2dc" />

      {/* 짐벌 mount post */}
      <rect x={78} y={26} width={4} height={10} fill="#1a1a1d" />

      {/* 짐벌 camera body + lens */}
      <rect x={70} y={16} width={20} height={11} rx={2} fill="#1f2025" stroke="#444" strokeWidth={0.5} />
      <circle cx={86} cy={21} r={3.5} fill="#08111f" stroke="#3a3a3a" strokeWidth={0.5} />
      <circle cx={86} cy={21} r={1.5} fill="#0a3a6a" />

      {/* Head highlight (view 3) — 짐벌 카메라 강조 */}
      {showHead && (
        <circle cx={80} cy={22} r={14} fill="none" stroke="rgb(64,200,120)" strokeWidth={1.5} strokeDasharray="3,2" />
      )}

      {/* FOV cone (view 8) — 짐벌 측면 시야 */}
      {showFrustum && (
        <>
          <path
            d="M 86 21 L 156 4 L 156 38 Z"
            fill="rgba(64,128,208,0.15)"
            stroke="rgba(64,128,208,0.55)"
            strokeWidth={1}
          />
          <path
            d="M 86 21 L 4 4 L 4 38 Z"
            fill="rgba(64,128,208,0.08)"
            stroke="rgba(64,128,208,0.35)"
            strokeWidth={0.8}
            strokeDasharray="2,2"
          />
        </>
      )}
    </svg>
  );
}

// ── Legacy AGV + 6DOF arm ─────────────────────────────────────────────
function AgvArmSvg({
  showEE,
  showHead,
  showFrustum,
}: {
  showEE: boolean;
  showHead: boolean;
  showFrustum: boolean;
}) {
  return (
    <svg viewBox="0 0 160 110" style={{ width: '100%', display: 'block' }}>
      <rect x={30} y={70} width={100} height={26} rx={4} fill="rgba(220,220,220,0.85)" stroke="#444" />
      <circle cx={48} cy={102} r={6} fill="#333" />
      <circle cx={112} cy={102} r={6} fill="#333" />
      <rect x={68} y={56} width={24} height={16} fill="#555" />
      <rect x={74} y={36} width={12} height={22} fill="rgba(200,200,200,0.7)" stroke="#333" transform="rotate(-12 80 47)" />
      <rect x={86} y={22} width={10} height={18} fill="rgba(200,200,200,0.7)" stroke="#333" transform="rotate(20 91 31)" />
      <g transform="translate(102, 18)">
        <rect x={-3} y={-2} width={10} height={6} fill="#888" />
        <path d="M 7 -2 L 14 0 L 7 4 Z" fill="rgb(255,140,80)" />
      </g>
      {showFrustum && (
        <path d="M 110 22 L 156 8 L 156 36 Z" fill="rgba(64,128,208,0.18)" stroke="rgba(64,128,208,0.6)" strokeWidth={1} />
      )}
      {showEE && (
        <circle cx={108} cy={22} r={14} fill="none" stroke="rgb(255,180,0)" strokeWidth={1.5} strokeDasharray="3,2" />
      )}
      {showHead && (
        <circle cx={80} cy={56} r={10} fill="none" stroke="rgb(64,200,120)" strokeWidth={1.5} strokeDasharray="3,2" />
      )}
      <line x1={20} y1={102} x2={140} y2={102} stroke="#666" strokeWidth={2} strokeDasharray="6,3" />
    </svg>
  );
}
