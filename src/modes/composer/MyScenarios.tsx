// S2.c (RFP §15) — My Scenarios 페이지.
//
// localStorage 영속 저장소(myScenariosStore)에서 사용자 변형 시나리오를 표시.
// 선택 → Workbench 진입 또는 Composer 재진입.

import { useMyScenariosStore } from './myScenariosStore';
import type { ScenarioSpec } from '../../scenarios/types';

interface MyScenariosProps {
  onSelect: (spec: ScenarioSpec) => void;
  onEditInComposer?: (spec: ScenarioSpec) => void;
  onCancel?: () => void;
}

export function MyScenarios({ onSelect, onEditInComposer, onCancel }: MyScenariosProps) {
  const items = useMyScenariosStore((s) => s.items);
  const remove = useMyScenariosStore((s) => s.remove);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--p-bg, #111)',
        color: 'var(--p-fg, #ddd)',
        overflow: 'auto',
        padding: '32px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'var(--p-fg-dim, #888)',
              marginBottom: 6,
            }}
          >
            My Scenarios (local · persisted)
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            저장한 변형 시나리오 · {items.length}개
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-fg-muted, #aaa)' }}>
            localStorage (phytosim:my-scenarios:v1) 영속. 공식 카탈로그 승격은 거버넌스 절차 후 별도.
          </p>
        </div>
        {onCancel && (
          <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
            ← 뒤로
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            border: '1px dashed var(--p-border, #333)',
            borderRadius: 8,
            textAlign: 'center',
            color: 'var(--p-fg-dim, #888)',
            fontSize: 13,
          }}
        >
          저장한 시나리오가 없습니다. Picker에서 "+ 새 시나리오" 또는 시나리오 카드의 Composer에서 Save하세요.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {items.map((s) => (
            <div
              key={s.id}
              className="p-surface"
              style={{
                padding: 14,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                border: '1px solid var(--p-border, #333)',
              }}
            >
              <div
                className="p-mono"
                style={{
                  fontSize: 11,
                  color: 'var(--p-accent, #4080d0)',
                  letterSpacing: '0.01em',
                }}
              >
                {s.id}
              </div>
              <div style={{ fontSize: 12, color: 'var(--p-fg, #ddd)' }}>
                Day {s.spec.crop.day} · seed {s.spec.crop.seed}
              </div>
              {s.parentId && (
                <div className="p-mono" style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>
                  parent: {s.parentId}
                </div>
              )}
              {s.description && (
                <div style={{ fontSize: 11, color: 'var(--p-fg-muted, #aaa)', lineHeight: 1.4 }}>
                  {s.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>
                {new Date(s.createdAt).toLocaleString('ko-KR')}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  className="p-btn p-btn-primary"
                  onClick={() => onSelect(s.spec)}
                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600 }}
                >
                  ▶ Run
                </button>
                {onEditInComposer && (
                  <button
                    className="p-btn"
                    onClick={() => onEditInComposer(s.spec)}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    ✎ Edit
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button
                  className="p-btn"
                  onClick={() => remove(s.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    color: 'rgb(220,80,80)',
                  }}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
