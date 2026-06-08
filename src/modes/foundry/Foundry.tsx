// S5.b·c·d (RFP §15) + D5 (§17) — Foundry Mode page.
//
// docs/proposal/07-foundry-batch-and-labels.md §2 매트릭스 차원 + §5 출력 포맷.
// D5: 진입 시 Picker → recog 시나리오 선택 → scenario.foundry.matrix 자동 채움.

import { useEffect, useMemo, useState } from 'react';
import { ValueChip } from '../../hud/ValueChip';
import { MODES } from '../registry';
import { Picker } from '../scenarios/Picker';
import type { ScenarioSpec } from '../../scenarios/types';

interface FoundryProps {
  onCancel?: () => void;
}

interface MatrixDim {
  key: string;
  label: string;
  values: readonly (string | number)[];
}

const MATRIX_DIMS: readonly MatrixDim[] = [
  { key: 'time-of-day', label: 'time-of-day', values: [6, 9, 12, 15, 18] },
  { key: 'light-preset', label: 'light-preset', values: ['default', 'overcast', 'golden', 'grow-light'] },
  { key: 'growth-day', label: 'growth-day', values: [15, 30, 45, 60, 75, 90, 105] },
  { key: 'leaf-density-perturb', label: 'leaf-density-perturb', values: [0.8, 1.0, 1.2] },
  { key: 'camera-angle', label: 'camera-angle', values: [0, 30, 60, 90, 120, 180, 240, 300] },
  { key: 'camera-height', label: 'camera-height', values: [0.5, 1.0, 1.5, 2.0] },
  { key: 'wind-strength', label: 'wind-strength', values: [0.0, 0.3, 0.7] },
] as const;

const OUTPUT_FORMATS = [
  { key: 'coco', label: 'COCO', required: true },
  { key: 'yolo', label: 'YOLO', required: false },
  { key: 'voc', label: 'VOC', required: false },
  { key: 'mask', label: 'mask PNG', required: true },
  { key: 'depth', label: 'depth PNG', required: false },
  { key: 'bbox3d', label: '3D bbox JSONL', required: false },
] as const;

export function Foundry({ onCancel }: FoundryProps) {
  // D5 (RFP §17) — Picker 진입 → 시나리오 선택 후 Matrix 자동 채움.
  const [active, setActive] = useState<ScenarioSpec | null>(null);
  const [showPicker, setShowPicker] = useState(true);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    'time-of-day': true,
    'light-preset': true,
    'growth-day': true,
    'leaf-density-perturb': false,
    'camera-angle': true,
    'camera-height': true,
    'wind-strength': false,
  });
  const [seeds, setSeeds] = useState(16);
  const [outputs, setOutputs] = useState<Record<string, boolean>>({
    coco: true,
    yolo: false,
    voc: false,
    mask: true,
    depth: true,
    bbox3d: false,
  });
  const [progress, setProgress] = useState<{ running: boolean; pct: number; produced: number }>({
    running: false,
    pct: 0,
    produced: 0,
  });

  // D5 — 시나리오 선택 시 matrix·seeds·outputs 자동 채움.
  useEffect(() => {
    if (!active?.foundry) return;
    const m = active.foundry;
    if (m.matrix) {
      const next: Record<string, boolean> = { ...enabled };
      for (const dim of Object.keys(enabled)) {
        next[dim] = dim in m.matrix;
      }
      setEnabled(next);
    }
    if (m.seeds) setSeeds(m.seeds);
    if (m.outputs) {
      const next: Record<string, boolean> = { ...outputs };
      for (const out of Object.keys(outputs)) {
        next[out] = m.outputs.some((o) => o.toLowerCase().includes(out));
      }
      setOutputs(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function handleSelectScenario(s: ScenarioSpec) {
    setActive(s);
    setShowPicker(false);
  }

  if (showPicker) {
    return (
      <Picker
        onSelect={handleSelectScenario}
        onCancel={active ? () => setShowPicker(false) : onCancel}
        modeFilter="Foundry"
      />
    );
  }

  const stats = useMemo(() => {
    let perSeed = 1;
    for (const d of MATRIX_DIMS) {
      if (enabled[d.key]) perSeed *= d.values.length;
    }
    const total = perSeed * seeds;
    const storageGB = Math.round((total * 0.18) / 100) / 10; // 대략 180KB/frame.
    return { perSeed, total, storageGB };
  }, [enabled, seeds]);

  // D6 + W3.f·g (§17·§18) — BabylonEngine canvas 실 캡처 + COCO writer.
  //   각 frame 사이 store.singlePlantMinute 조정 → 식물 day sweep.
  //   완료 후 coco.json (W3.f) + meta.json 함께 다운로드.
  async function startRealRun() {
    setProgress({ running: true, pct: 0, produced: 0 });
    const canvas = document.querySelector('canvas.canvas-fill') as HTMLCanvasElement | null;
    if (!canvas) {
      alert('canvas를 찾지 못했습니다 (BabylonEngine 부트 안 됨).');
      setProgress({ running: false, pct: 0, produced: 0 });
      return;
    }
    const NUM_FRAMES = 10;
    const baseDay = active?.crop.day ?? 75;
    const baseSeed = active?.crop.seed ?? '0xFEED';
    const { useTwinStore } = await import('../../state/twinStore');
    const setMinute = useTwinStore.getState().setSinglePlantMinute;

    const { buildCocoDataset, downloadCoco } = await import(
      '../../../packages/phytosim-foundry/cocoWriter'
    );
    const frames: Array<{
      frameIndex: number;
      fileName: string;
      width: number;
      height: number;
      day: number;
      seed: string;
      ripenStage: number;
    }> = [];

    for (let i = 0; i < NUM_FRAMES; i++) {
      const day = baseDay + (i - 5) * 2; // ±10일 sweep
      setMinute(Math.max(1, day) * 1440 + 12 * 60);
      await new Promise((r) => setTimeout(r, 200));

      const dataUrl = canvas.toDataURL('image/png');
      const fileName = `${active?.id ?? 'frame'}-d${day}-${String(i).padStart(3, '0')}.png`;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      frames.push({
        frameIndex: i,
        fileName,
        width: canvas.width,
        height: canvas.height,
        day,
        seed: baseSeed,
        ripenStage: Math.min(5, Math.max(0, Math.round((day - 60) / 9))),
      });

      setProgress({
        running: i < NUM_FRAMES - 1,
        pct: ((i + 1) / NUM_FRAMES) * 100,
        produced: i + 1,
      });
    }

    // W3.f — COCO JSON 다운로드 + meta.json
    const coco = buildCocoDataset(active?.id ?? 'unknown', baseSeed, frames);
    downloadCoco(coco, `${active?.id ?? 'foundry'}-coco.json`);

    const meta = {
      scenarioId: active?.id,
      seeds: [baseSeed],
      generatedAt: new Date().toISOString(),
      framesPerSeed: NUM_FRAMES,
      conditions: { 'growth-day': frames.map((f) => f.day) },
      outputs: ['png', 'coco-json'],
    };
    const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    const metaUrl = URL.createObjectURL(metaBlob);
    const ma = document.createElement('a');
    ma.href = metaUrl;
    ma.download = `${active?.id ?? 'foundry'}-meta.json`;
    document.body.appendChild(ma);
    ma.click();
    document.body.removeChild(ma);
    setTimeout(() => URL.revokeObjectURL(metaUrl), 5_000);
  }

  // 기존 mock (참조 유지)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function startMockRun() {
    setProgress({ running: true, pct: 0, produced: 0 });
    const start = performance.now();
    const total = stats.total;
    const tick = () => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, (elapsed / 8000) * 100);
      const produced = Math.floor((pct / 100) * total);
      setProgress({ running: pct < 100, pct, produced });
      if (pct < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const valueProps = MODES.foundry.valueProps ?? [];

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
            Foundry Mode (S5 mvp)
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
            Batch Matrix Setup <ValueChip active={valueProps} compact />
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-fg-muted, #aaa)' }}>
            {active ? <>scenario: <strong className="p-mono">{active.id}</strong> · D5 — matrix·seeds·outputs 자동 채움</> : '시나리오 미선택'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="p-btn"
            onClick={() => setShowPicker(true)}
            style={{ padding: '6px 14px' }}
            title="다른 시나리오 선택"
          >
            ▼ 시나리오 변경
          </button>
          {onCancel && (
            <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>

      {/* Matrix dims */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>차원 (7)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {MATRIX_DIMS.map((d) => (
            <label
              key={d.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 200px 1fr 48px',
                gap: 8,
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                background: enabled[d.key] ? 'rgba(64,128,208,0.05)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={enabled[d.key]}
                onChange={(e) => setEnabled((p) => ({ ...p, [d.key]: e.currentTarget.checked }))}
              />
              <span className="p-mono" style={{ fontSize: 12 }}>{d.label}</span>
              <span style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)' }}>
                [{d.values.join(', ')}]
              </span>
              <span
                className="p-mono"
                style={{ fontSize: 11, textAlign: 'right', color: 'var(--p-fg-muted, #aaa)' }}
              >
                ({d.values.length})
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(64,128,208,0.04)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase' }}>Per seed</div>
          <div className="p-mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.perSeed.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>frames</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase' }}>Seeds</div>
          <input
            type="number"
            value={seeds}
            min={1}
            max={64}
            onChange={(e) => setSeeds(Number(e.currentTarget.value))}
            className="p-mono"
            style={{
              width: 80,
              padding: '4px 8px',
              background: 'var(--p-bg-deep, #0c0c0c)',
              color: 'var(--p-fg, #ddd)',
              border: '1px solid var(--p-border, #333)',
              borderRadius: 4,
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase' }}>Total</div>
          <div className="p-mono" style={{ fontSize: 22, fontWeight: 600, color: 'rgb(64,200,120)' }}>
            {stats.total.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>frames</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase' }}>Storage est.</div>
          <div className="p-mono" style={{ fontSize: 18, fontWeight: 600 }}>~{stats.storageGB} GB</div>
        </div>
      </section>

      {/* Outputs */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Outputs</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {OUTPUT_FORMATS.map((o) => (
            <label
              key={o.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                background: outputs[o.key] ? 'rgba(64,128,208,0.1)' : 'transparent',
                border: `1px solid ${outputs[o.key] ? 'rgba(64,128,208,0.4)' : 'var(--p-border, #333)'}`,
                fontSize: 12,
                cursor: o.required ? 'default' : 'pointer',
                opacity: o.required ? 0.85 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={outputs[o.key]}
                disabled={o.required}
                onChange={(e) => setOutputs((p) => ({ ...p, [o.key]: e.currentTarget.checked }))}
              />
              {o.label}
              {o.required && (
                <span style={{ fontSize: 9, color: 'var(--p-fg-dim, #888)', marginLeft: 4 }}>(필수)</span>
              )}
            </label>
          ))}
        </div>
      </section>

      {/* Run + Progress */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="p-btn p-btn-primary"
            onClick={startRealRun}
            disabled={progress.running}
            style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600 }}
            title="실 BabylonEngine canvas 10 frame 캡처 → 다운로드 (mvp)"
          >
            {progress.running ? `⏳ Capturing…` : '▶ Run (실 캡처 10 frame)'}
          </button>
          <button className="p-btn" style={{ padding: '8px 16px' }} disabled>
            📅 Schedule
          </button>
          <button className="p-btn" style={{ padding: '8px 16px' }} disabled>
            ↻ Resume
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)' }}>
            WS ● · Q: <strong>0 jobs</strong> · workers: <strong>0/4</strong>
          </span>
        </div>
        {(progress.running || progress.pct > 0) && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                height: 8,
                background: 'var(--p-bg-deep, #0c0c0c)',
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid var(--p-border, #333)',
              }}
            >
              <div
                style={{
                  width: `${progress.pct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, rgb(64,128,208), rgb(80,200,120))',
                  transition: 'width 100ms linear',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--p-fg-dim, #888)' }}>
              <span>{progress.pct.toFixed(0)}%</span>
              <span className="p-mono">
                {progress.produced.toLocaleString()} / {stats.total.toLocaleString()} frames
              </span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--p-fg-dim, #888)' }}>
          D6 mvp: 실 BabylonEngine canvas를 day=baseDay±10 sweep으로 10장 캡처 → 사용자 다운로드. <br />
          headless Playwright worker pool · sqlite queue · pycocotools 검증 · COCO/mask는 V2 evolution.
        </div>
      </section>
    </div>
  );
}
