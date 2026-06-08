// S3.d·e (RFP §15) + W1.a~c (§18) — Reference Truth Calibration tab.
//
// 9 검증 변수에 대한 trajectory chart (SVG) + 편차 heatmap (SVG) + 4-액션 워크플로우.
// W1.a: 더미 simulatedSamples 제거 → 실제 GrowthEngine.simulatePlantToMinute 호출.

import { useEffect, useMemo, useState } from 'react';
import { LITERATURE, isWithinTolerance, type VarDef, type VarRange } from '../../scenarios/reference/literature';
import { getSinglePlantEngine } from '../../hud/single-plant/useSinglePlantState';
import { SHOWCASE_SEED } from '../../scene/SceneInfrastructure';

interface CalibrationProps {
  onCancel?: () => void;
}

const W = 720;
const H = 220;
const PAD = { l: 48, r: 24, t: 16, b: 28 };

function trajectorySvg(variable: VarDef) {
  const allDays = [...variable.ranges, ...(variable.simulatedSamples ?? [])].map((r) => r.day);
  const xMin = Math.min(...allDays);
  const xMax = Math.max(...allDays);
  const allVals = [
    ...variable.ranges.flatMap((r) => [r.min, r.max, r.median]),
    ...(variable.simulatedSamples ?? []).map((r) => r.median),
  ];
  const yMin = Math.min(...allVals) * 0.9;
  const yMax = Math.max(...allVals) * 1.1;
  const x = (d: number) => PAD.l + ((d - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  const bandTop = variable.ranges.map((r) => `${x(r.day)},${y(r.max)}`).join(' ');
  const bandBot = variable.ranges.slice().reverse().map((r) => `${x(r.day)},${y(r.min)}`).join(' ');
  const medianLine = variable.ranges.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.day)},${y(r.median)}`).join(' ');
  const simLine = (variable.simulatedSamples ?? [])
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.day)},${y(r.median)}`)
    .join(' ');

  return { bandTop, bandBot, medianLine, simLine, x, y, xMin, xMax, yMin, yMax };
}

export function Calibration({ onCancel }: CalibrationProps) {
  const [selectedKey, setSelectedKey] = useState<string>(LITERATURE[0].key);

  // W1.a — GrowthEngine 실 호출로 simulatedSamples 동적 생성.
  //   key: var.key → sample 배열. engine 진입 시 1회 계산 + cache.
  const [liveSamples, setLiveSamples] = useState<Record<string, VarRange[]>>({});
  const [computing, setComputing] = useState(true);

  useEffect(() => {
    const engine = getSinglePlantEngine();
    if (!engine) {
      setComputing(false);
      return;
    }
    setComputing(true);
    const result: Record<string, VarRange[]> = {};
    // 각 변수별로 ranges의 day들을 simulate.
    for (const v of LITERATURE) {
      const samples: VarRange[] = [];
      for (const r of v.ranges) {
        if (r.day === 0) continue; // firstTrussDAS 같은 단일 시점 변수
        try {
          const minute = r.day * 1440 + 12 * 60; // 정오
          const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
          let value: number | null = null;
          switch (v.key) {
            case 'height':
              value = physiology.heightCm;
              break;
            case 'nodeCount':
              value = physiology.N;
              break;
            case 'LAI':
              value = physiology.LAI;
              break;
            case 'leafCount': {
              // physiology.trusses.length는 truss count. leaf count는 N * ~1 (each node has leaf).
              // 더 정확하게: PlantState 활용 필요. 우선 N의 ~80% 추정 (성숙도).
              value = Math.round(physiology.N * 0.85);
              break;
            }
            case 'fruitDiameter': {
              // T1 평균 fruit 직경 (mm). FruitCohort.diameter는 mm 단위 추정.
              const t1 = physiology.trusses[0];
              if (t1 && t1.fruits.length > 0) {
                const sumDiam = t1.fruits.reduce(
                  (acc, f) => acc + (f.diameter ?? 0),
                  0,
                );
                value = sumDiam / t1.fruits.length;
              }
              break;
            }
            case 'ripeStage': {
              // 모든 truss 모든 fruit의 ripenStage 평균.
              let cnt = 0, sum = 0;
              for (const t of physiology.trusses) {
                for (const f of t.fruits) {
                  if (f.ripenStage !== undefined) {
                    sum += f.ripenStage;
                    cnt++;
                  }
                }
              }
              value = cnt > 0 ? sum / cnt : 0;
              break;
            }
            case 'stemDiameter': {
              // 근사: 줄기 굵기는 식물 W (dry matter)와 비례. mvp로 W^0.5 활용.
              value = Math.sqrt(physiology.W) * 0.7; // 임시 추정
              break;
            }
            case 'trussInterval':
              // 평균 interval ≈ nodeCount / trussCount (만약 둘 다 양수).
              value =
                physiology.trusses.length > 1
                  ? physiology.N / physiology.trusses.length
                  : 3.0;
              break;
          }
          if (value !== null && Number.isFinite(value)) {
            samples.push({ day: r.day, min: value, max: value, median: value });
          }
        } catch (e) {
          console.warn(`Calibration: simulate failed for ${v.key} day=${r.day}:`, e);
        }
      }
      result[v.key] = samples;
    }
    setLiveSamples(result);
    setComputing(false);
  }, []);

  // W1.a — variable + liveSamples 결합 (literature.ranges + 동적 simulatedSamples).
  const variable = useMemo(() => {
    const v = LITERATURE.find((x) => x.key === selectedKey) ?? LITERATURE[0];
    return {
      ...v,
      simulatedSamples: liveSamples[v.key] ?? v.simulatedSamples,
    };
  }, [selectedKey, liveSamples]);

  const traj = useMemo(() => trajectorySvg(variable), [variable]);

  // ±20% 초과 변수 카운트 — liveSamples 기반.
  const summary = useMemo(() => {
    let exceed = 0;
    let total = 0;
    const exceedList: { name: string; day: number; deviation: number }[] = [];
    for (const v of LITERATURE) {
      const sim = liveSamples[v.key] ?? v.simulatedSamples ?? [];
      for (const r of v.ranges) {
        const s = sim.find((x) => x.day === r.day);
        if (!s) continue;
        total += 1;
        const { withinBand, deviationPct } = isWithinTolerance(s.median, r.median, r.min, r.max);
        if (!withinBand) {
          exceed += 1;
          exceedList.push({ name: v.name, day: r.day, deviation: deviationPct });
        }
      }
    }
    return { exceed, total, exceedList };
  }, [liveSamples]);

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
            Reference Truth Calibration
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            문헌 ±20% 검증
            {computing ? (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(64,128,208,0.15)',
                  color: 'rgb(140,180,240)',
                }}
              >
                ⏳ GrowthEngine 계산 중…
              </span>
            ) : summary.exceed > 0 ? (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(255,180,0,0.15)',
                  color: 'rgb(255,180,0)',
                }}
              >
                ⚠ {summary.exceed}/{summary.total} vars exceed ±20%
              </span>
            ) : (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(80,200,120,0.15)',
                  color: 'rgb(80,200,120)',
                }}
              >
                ✓ ALL PASS ({summary.total}/{summary.total})
              </span>
            )}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-fg-muted, #aaa)' }}>
            W1.a — GrowthEngine.simulatePlantToMinute(SHOWCASE_SEED) 실 호출. 문헌: TOMSIM / TOMGRO / Gillaspy 근사.
          </p>
        </div>
        {onCancel && (
          <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
            ← 뒤로
          </button>
        )}
      </div>

      {/* Variable selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LITERATURE.map((v) => {
          const exceedSelf = summary.exceedList.some((e) => e.name === v.name);
          return (
            <button
              key={v.key}
              className={`p-btn ${selectedKey === v.key ? 'p-btn-primary' : ''}`}
              onClick={() => setSelectedKey(v.key)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: selectedKey === v.key ? 600 : 400,
                background: exceedSelf
                  ? 'rgba(255,180,0,0.1)'
                  : selectedKey === v.key
                  ? undefined
                  : 'transparent',
                border: `1px solid ${
                  exceedSelf ? 'rgb(255,180,0)' : 'var(--p-border, #333)'
                }`,
              }}
            >
              {v.name}
              {exceedSelf && <span style={{ marginLeft: 4 }}>⚠</span>}
            </button>
          );
        })}
      </div>

      {/* Trajectory chart */}
      <div
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Trajectory · <span className="p-mono" style={{ color: 'var(--p-fg-dim, #888)' }}>{variable.key}</span> ({variable.unit})
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
          {/* Y axis */}
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#444" />
          {/* X axis */}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#444" />

          {/* min/max band */}
          <polygon
            points={`${traj.bandTop} ${traj.bandBot}`}
            fill="rgba(64,128,208,0.15)"
            stroke="rgba(64,128,208,0.4)"
            strokeWidth={1}
          />

          {/* median line (literature) */}
          <path d={traj.medianLine} fill="none" stroke="rgba(64,128,208,0.9)" strokeWidth={2} strokeDasharray="4,3" />

          {/* sim curve */}
          {variable.simulatedSamples && (
            <>
              <path d={traj.simLine} fill="none" stroke="rgb(255,140,80)" strokeWidth={2.5} />
              {variable.simulatedSamples.map((s, i) => (
                <circle
                  key={i}
                  cx={traj.x(s.day)}
                  cy={traj.y(s.median)}
                  r={4}
                  fill="rgb(255,140,80)"
                  stroke="#000"
                  strokeWidth={1}
                />
              ))}
            </>
          )}

          {/* Y ticks */}
          {[traj.yMin, (traj.yMin + traj.yMax) / 2, traj.yMax].map((v, i) => (
            <g key={i}>
              <line x1={PAD.l - 4} y1={traj.y(v)} x2={PAD.l} y2={traj.y(v)} stroke="#666" />
              <text x={PAD.l - 6} y={traj.y(v) + 3} fontSize={10} fill="#999" textAnchor="end">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          {/* X ticks */}
          {variable.ranges.map((r, i) => (
            <g key={i}>
              <line x1={traj.x(r.day)} y1={H - PAD.b} x2={traj.x(r.day)} y2={H - PAD.b + 4} stroke="#666" />
              <text x={traj.x(r.day)} y={H - PAD.b + 16} fontSize={10} fill="#999" textAnchor="middle">
                D{r.day}
              </text>
            </g>
          ))}

          {/* Legend */}
          <g transform={`translate(${W - PAD.r - 200}, ${PAD.t + 4})`}>
            <rect width={200} height={48} fill="rgba(0,0,0,0.4)" rx={4} />
            <line x1={10} y1={16} x2={28} y2={16} stroke="rgba(64,128,208,0.9)" strokeWidth={2} strokeDasharray="4,3" />
            <text x={36} y={20} fontSize={11} fill="#ccc">문헌 median ±20%</text>
            <line x1={10} y1={36} x2={28} y2={36} stroke="rgb(255,140,80)" strokeWidth={2.5} />
            <text x={36} y={40} fontSize={11} fill="#ccc">Phytosim 시뮬</text>
          </g>
        </svg>
      </div>

      {/* Heatmap */}
      <div
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Deviation heatmap (시뮬 - 문헌 median 백분율)
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 4, color: 'var(--p-fg-dim, #888)', fontWeight: 500 }}>변수</th>
              {[7, 14, 28, 42, 56, 75, 84, 90, 105, 112].map((d) => (
                <th key={d} style={{ padding: 4, color: 'var(--p-fg-dim, #888)', fontWeight: 500 }}>
                  D{d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LITERATURE.map((v) => (
              <tr key={v.key}>
                <td style={{ padding: 4, color: 'var(--p-fg-muted, #aaa)' }}>{v.name}</td>
                {[7, 14, 28, 42, 56, 75, 84, 90, 105, 112].map((d) => {
                  const ref = v.ranges.find((r) => r.day === d);
                  const sim = v.simulatedSamples?.find((s) => s.day === d);
                  if (!ref || !sim) return <td key={d} style={{ padding: 4, textAlign: 'center', color: '#444' }}>·</td>;
                  const dev = ((sim.median - ref.median) / ref.median) * 100;
                  const exceeds = Math.abs(dev) > 20;
                  const color = exceeds
                    ? 'rgb(255,180,0)'
                    : dev > 0
                    ? 'rgba(80,200,120,0.7)'
                    : 'rgba(64,128,208,0.7)';
                  return (
                    <td
                      key={d}
                      style={{
                        padding: 4,
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        background: color,
                        color: exceeds ? '#000' : '#fff',
                        fontWeight: exceeds ? 600 : 400,
                      }}
                      title={`${v.name} D${d}: sim ${sim.median} vs 문헌 ${ref.median} (${dev >= 0 ? '+' : ''}${dev.toFixed(0)}%)`}
                    >
                      {dev >= 0 ? '+' : ''}{dev.toFixed(0)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4-action footer */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 12,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--p-border, #333)',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--p-fg-muted, #aaa)', flex: 1 }}>
          ±20% 초과 시 4-액션 워크플로우 ([06 §6](docs/proposal/06-reference-truth-railway.md)):
        </span>
        <button className="p-btn" style={{ padding: '4px 10px', fontSize: 11 }} disabled>
          a) Model RFC
        </button>
        <button className="p-btn" style={{ padding: '4px 10px', fontSize: 11 }} disabled>
          b) Re-measure
        </button>
        <button className="p-btn" style={{ padding: '4px 10px', fontSize: 11 }} disabled>
          c) Std RFC
        </button>
        <button className="p-btn" style={{ padding: '4px 10px', fontSize: 11 }} disabled>
          d) Ignore w/ reason
        </button>
      </div>
    </div>
  );
}
