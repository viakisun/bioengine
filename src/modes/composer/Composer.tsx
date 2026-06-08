// S2.b·c (RFP §15) — Scenario Composer (L3.5).
//
// 5 dial fine-tune (day · seed · cultivar · leafDensityScale · manualHour) +
// Lock/Variable 토글 + Save / Fork / Diff / Run.
// 본 S2 mvp는 5 dial만. 후속 슬라이스에서 25 dial 풀 확장.

import { useMemo, useState } from 'react';
import {
  useComposerStore,
  dialsToScenarioPatch,
  diffDials,
  type DialKey,
  type DialState,
} from './composerStore';
import { useMyScenariosStore, type SavedScenario } from './myScenariosStore';
import type { ScenarioSpec } from '../../scenarios/types';

interface ComposerProps {
  /** "Run" 클릭 시. Composer가 작성한 시나리오로 Workbench 진입. */
  onRun: (spec: ScenarioSpec) => void;
  /** "취소" 또는 "← 뒤로" 시. */
  onCancel?: () => void;
}

interface DialDef {
  key: DialKey;
  label: string;
  category: 'Crop' | 'Env';
  kind: 'slider' | 'text' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  description: string;
}

const DIAL_DEFS: readonly DialDef[] = [
  {
    key: 'day',
    label: 'day',
    category: 'Crop',
    kind: 'slider',
    min: 0,
    max: 120,
    step: 1,
    description: '생육 일자 (DAS)',
  },
  {
    key: 'seed',
    label: 'seed',
    category: 'Crop',
    kind: 'text',
    description: 'cultivar genome RNG seed (hex)',
  },
  {
    key: 'cultivar',
    label: 'cultivar',
    category: 'Crop',
    kind: 'select',
    options: ['tomimaru', 'momotaro', 'roma'] as const,
    description: '품종 (Crop SSOT에 등록된 ID)',
  },
  {
    key: 'leafDensityScale',
    label: 'leafDensityScale',
    category: 'Crop',
    kind: 'slider',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    description: '잎 밀도 perturbation (1.0 = 기준)',
  },
  {
    key: 'manualHour',
    label: 'manualHour',
    category: 'Env',
    kind: 'slider',
    min: 0,
    max: 24,
    step: 0.5,
    description: '시간대 (0~24h)',
  },
] as const;

function genSavedSpec(
  draftId: string,
  base: ScenarioSpec | null,
  dials: Record<DialKey, DialState>,
): ScenarioSpec {
  const patch = dialsToScenarioPatch(dials);
  // Base가 있으면 그것을 fork. 없으면 thin-D70-truss3-multi 기반 ad-hoc default.
  if (base) {
    return {
      ...base,
      id: draftId,
      crop: { ...base.crop, ...patch.crop },
      env: { ...base.env, ...patch.env },
      meta: {
        ...(base.meta ?? {}),
        parentId: base.id,
        createdBy: 'user-composer',
        createdAt: new Date().toISOString(),
      },
    };
  }
  return {
    id: draftId,
    version: '1.0',
    domain: 'thinning',
    consumableBy: ['Workbench'],
    world: { greenhouseConfig: 'default-24x34-13beds', activeBeds: [3], plantPlacement: 'showcase-D60' },
    crop: {
      day: patch.crop.day,
      seed: patch.crop.seed,
      cultivar: patch.crop.cultivar,
      perturbation: patch.crop.perturbation,
    },
    env: { manualHour: patch.env.manualHour, lightingPreset: 'default' },
    task: { type: 'noop', speedMps: 0 },
    verify: { successCriteria: [] },
    meta: {
      parentId: null,
      createdBy: 'user-composer',
      createdAt: new Date().toISOString(),
    },
  };
}

export function Composer({ onRun, onCancel }: ComposerProps) {
  const { base, dials, draftId, savedId, setDial, toggleDialMode, setDraftId, setSavedId, resetToAdHoc } =
    useComposerStore();
  const addMy = useMyScenariosStore((s) => s.add);
  const myItems = useMyScenariosStore((s) => s.items);

  const [showDiff, setShowDiff] = useState(false);

  // Base 시나리오의 초기 dials와 현재 dials 비교 (diff).
  const baseDials = useMemo(() => {
    if (!base) return null;
    return {
      day: { value: base.crop.day, mode: 'lock' as const },
      seed: { value: base.crop.seed, mode: 'lock' as const },
      cultivar: { value: base.crop.cultivar ?? 'tomimaru', mode: 'lock' as const },
      leafDensityScale: {
        value: base.crop.perturbation?.leafDensityScale ?? 1.0,
        mode: 'lock' as const,
      },
      manualHour: { value: base.env.manualHour, mode: 'lock' as const },
    };
  }, [base]);

  const diff = useMemo(() => (baseDials ? diffDials(baseDials, dials) : []), [baseDials, dials]);

  function handleSave() {
    const id = draftId.trim() || `my-scenario-${Date.now().toString(36)}`;
    const spec = genSavedSpec(id, base, dials);
    const saved: SavedScenario = {
      id,
      spec,
      dials,
      parentId: base?.id ?? null,
      createdAt: spec.meta?.createdAt ?? new Date().toISOString(),
      description: base?.meta?.description ?? 'User scenario (Composer)',
    };
    addMy(saved);
    setSavedId(id);
  }

  function handleRun() {
    const id = savedId ?? (draftId.trim() || `adhoc-${Date.now().toString(36)}`);
    const spec = genSavedSpec(id, base, dials);
    onRun(spec);
  }

  function handleFork() {
    if (!savedId) {
      // 아직 save 안 됐으면 base 그대로 두고 draftId만 변경.
      setDraftId(`${base?.id ?? 'adhoc'}-fork-${Date.now().toString(36).slice(-4)}`);
      return;
    }
    // 이미 save 됐으면 base 갱신 (현재를 새 base로) + draftId 새로.
    const current = useMyScenariosStore.getState().byId(savedId);
    if (current) {
      useComposerStore.getState().loadFromScenario(current.spec);
      setDraftId(`${savedId}-fork-${Date.now().toString(36).slice(-4)}`);
    }
  }

  return (
    <div
      className="phytosim-composer"
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
            Scenario Composer (L3.5)
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            {base ? (
              <>fork: <span className="p-mono" style={{ color: 'var(--p-accent, #4080d0)' }}>{base.id}</span></>
            ) : (
              <>새 시나리오 (ad-hoc)</>
            )}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-fg-muted, #aaa)' }}>
            S2 mvp 5 dial — Lock 🔒 / Variable ⚡ 토글. Save → My Scenarios. Run → Workbench 진입.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>

      {/* Draft id input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--p-border, #333)',
        }}
      >
        <label style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)' }} htmlFor="composer-id">
          scenario id
        </label>
        <input
          id="composer-id"
          type="text"
          value={draftId}
          onChange={(e) => setDraftId(e.currentTarget.value)}
          placeholder="my-scenario-001"
          className="p-mono"
          style={{
            flex: 1,
            minWidth: 220,
            padding: '6px 10px',
            border: '1px solid var(--p-border, #333)',
            background: 'var(--p-bg-deep, #0c0c0c)',
            color: 'var(--p-fg, #ddd)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        {savedId && (
          <span className="p-pill" style={{ background: 'var(--p-accent-muted, #1a2540)', color: 'var(--p-fg, #ddd)' }}>
            saved · {savedId}
          </span>
        )}
        {diff.length > 0 && (
          <span
            className="p-pill"
            style={{ background: 'rgba(255,180,0,0.1)', color: 'rgb(255,180,0)' }}
            title={diff.map((d) => `${d.key}: ${d.base} → ${d.next}`).join('\n')}
          >
            {diff.length} dial 변경됨
          </span>
        )}
      </div>

      {/* Dial grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DIAL_DEFS.map((def) => {
          const state = dials[def.key];
          const isVar = state.mode === 'variable';
          const isChanged = baseDials && baseDials[def.key].value !== state.value;
          return (
            <div
              key={def.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 90px 1fr 90px',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 8,
                background: isChanged ? 'rgba(64,128,208,0.08)' : 'rgba(255,255,255,0.02)',
                border: isChanged
                  ? '1px solid var(--p-border-accent, #4080d0)'
                  : '1px solid var(--p-border, #333)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--p-fg-dim, #888)',
                }}
              >
                {def.category}
              </span>
              <span className="p-mono" style={{ fontSize: 12, color: 'var(--p-fg, #ddd)' }}>
                {def.label}
              </span>

              {def.kind === 'slider' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={Number(state.value)}
                    onChange={(e) => setDial(def.key, Number(e.currentTarget.value))}
                    style={{ flex: 1, accentColor: 'var(--p-accent, #4080d0)' }}
                    aria-label={def.label}
                  />
                  <span
                    className="p-mono"
                    style={{
                      minWidth: 48,
                      textAlign: 'right',
                      fontSize: 12,
                      color: 'var(--p-fg, #ddd)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Number(state.value).toFixed(def.step && def.step < 1 ? 2 : 0)}
                  </span>
                </div>
              )}
              {def.kind === 'text' && (
                <input
                  type="text"
                  value={String(state.value)}
                  onChange={(e) => setDial(def.key, e.currentTarget.value)}
                  className="p-mono"
                  style={{
                    padding: '4px 8px',
                    border: '1px solid var(--p-border, #333)',
                    background: 'var(--p-bg-deep, #0c0c0c)',
                    color: 'var(--p-fg, #ddd)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
              )}
              {def.kind === 'select' && (
                <select
                  value={String(state.value)}
                  onChange={(e) => setDial(def.key, e.currentTarget.value)}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid var(--p-border, #333)',
                    background: 'var(--p-bg-deep, #0c0c0c)',
                    color: 'var(--p-fg, #ddd)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  {def.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}

              <button
                className="p-btn"
                onClick={() => toggleDialMode(def.key)}
                title={
                  isVar
                    ? 'Variable — Foundry 매트릭스 차원 (S5에서 활용)'
                    : 'Lock — 고정 값'
                }
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: isVar ? 'rgba(255,180,0,0.15)' : 'transparent',
                  color: isVar ? 'rgb(255,200,80)' : 'var(--p-fg-muted, #aaa)',
                  border: `1px solid ${isVar ? 'rgb(255,180,0)' : 'var(--p-border, #333)'}`,
                }}
              >
                {isVar ? '⚡ Variable' : '🔒 Lock'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Diff panel (toggle) */}
      {baseDials && diff.length > 0 && (
        <details
          open={showDiff}
          onToggle={(e) => setShowDiff((e.currentTarget as HTMLDetailsElement).open)}
          style={{
            border: '1px solid var(--p-border, #333)',
            borderRadius: 8,
            padding: 12,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <summary
            style={{
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--p-fg, #ddd)',
            }}
          >
            Diff (base: {base?.id}) — {diff.length} 변경
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {diff.map((d) => (
              <div
                key={d.key}
                className="p-mono"
                style={{
                  fontSize: 12,
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr 8px 1fr',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--p-fg-dim, #888)' }}>{d.key}</span>
                <span style={{ color: 'rgb(220,80,80)' }}>{String(d.base)}</span>
                <span style={{ color: 'var(--p-fg-dim, #888)' }}>→</span>
                <span style={{ color: 'rgb(80,200,120)' }}>{String(d.next)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 0',
          borderTop: '1px solid var(--p-border, #333)',
          marginTop: 8,
        }}
      >
        <button className="p-btn" onClick={resetToAdHoc} style={{ padding: '6px 14px' }}>
          ↺ Reset
        </button>
        <button className="p-btn" onClick={handleFork} style={{ padding: '6px 14px' }}>
          ⑂ Fork
        </button>
        <button className="p-btn" onClick={handleSave} style={{ padding: '6px 14px' }}>
          💾 Save (My Scenarios · {myItems.length})
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="p-btn p-btn-primary"
          onClick={handleRun}
          style={{ padding: '6px 16px', fontWeight: 600 }}
        >
          ▶ Run in Workbench
        </button>
      </div>
    </div>
  );
}
