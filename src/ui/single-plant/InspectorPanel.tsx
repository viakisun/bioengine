// InspectorPanel — right dock for the single-plant analysis layout.
// 4 collapsible sections: Cultivar / Plant State / Truss Table / Genome.
//
// Reads the live PlantPhysiologyState from GrowthEngine on every scrub.
// Pure data display — no editing (read-only for Phase C; Sandbox mode
// will own editing).

import { useEffect, useMemo, useState } from 'react';
import { useTwinStore } from '../../store/twinStore';
import { getCultivar, type PlantPhysiologyState, type Cultivar, type RipenStage } from '@farmsim/tomato-engine';
import { FONT_MONO, FONT_SANS, C_BORDER, C_FG, C_FG_MUTE, C_FG_DIM, C_BAD, C_WARN, C_OK, PANEL_HEADER_LABEL } from './styles';
import { useSinglePlantState } from './useSinglePlantState';

const CULTIVAR_NAME = 'tomimaru-muchoo';

export function InspectorPanel() {
  const open = useTwinStore((s) => s.singlePlantInspectorOpen);
  const toggle = useTwinStore((s) => s.toggleSinglePlantInspector);
  const state = useSinglePlantState();
  const cultivar = useMemo(() => getCultivar(CULTIVAR_NAME), []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '14px 16px',
      gap: 14,
      borderLeft: `1px solid ${C_BORDER}`,
      background: '#fff',
      fontFamily: FONT_SANS,
      fontSize: 12,
      color: C_FG,
      overflow: 'auto',
    }}>
      <Section
        title="Cultivar"
        isOpen={open.cultivar}
        onToggle={() => toggle('cultivar')}
      >
        <CultivarTable cultivar={cultivar} />
      </Section>

      <Section
        title="Plant State"
        isOpen={open.state}
        onToggle={() => toggle('state')}
      >
        <PlantStateTable state={state} />
      </Section>

      <Section
        title="Truss Table"
        isOpen={open.truss}
        onToggle={() => toggle('truss')}
      >
        <TrussTable state={state} cultivar={cultivar} />
      </Section>

      <Section
        title="Genome"
        isOpen={open.genome}
        onToggle={() => toggle('genome')}
      >
        <GenomeTable state={state} />
      </Section>
    </div>
  );
}

function Section({
  title, isOpen, onToggle, children,
}: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          ...PANEL_HEADER_LABEL,
          cursor: 'pointer',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: FONT_MONO }}>{isOpen ? '▾' : '▸'}</span>
        <span>{title}</span>
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 1fr 50px',
      gap: 8,
      fontFamily: FONT_MONO,
      fontSize: 11,
      padding: '2px 0',
      lineHeight: 1.5,
    }}>
      <span style={{ color: C_FG_MUTE }}>{label}</span>
      <span style={{ color: C_FG, textAlign: 'right' }}>{value}</span>
      <span style={{ color: C_FG_DIM, fontSize: 10 }}>{unit ?? ''}</span>
    </div>
  );
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(digits);
}

function CultivarTable({ cultivar }: { cultivar: Cultivar }) {
  return (
    <div>
      <Row label="name" value={cultivar.name} />
      <Row label="type" value={cultivar.type} />
      <Row label="source" value={cultivar.source} />
      <Row label="T_base" value={fmt(cultivar.T_base, 1)} unit="°C" />
      <Row label="GDD_first_flower" value={fmt(cultivar.GDD_to_first_flower, 0)} unit="°C·d" />
      <Row label="GDD_per_truss" value={fmt(cultivar.GDD_per_truss, 0)} unit="°C·d" />
      <Row label="fruitSetRate" value={fmt(cultivar.fruitSetRate, 2)} />
      <Row label="trussTarget" value={fmt(cultivar.trussTargetFruitCount, 0)} />
      <Row label="hw_ratio μ±σ" value={`${fmt(cultivar.heightWidthRatio.mu, 2)}±${fmt(cultivar.heightWidthRatio.sigma, 2)}`} />
      <Row label="ribbing μ±σ" value={`${fmt(cultivar.ribbingStrength.mu, 2)}±${fmt(cultivar.ribbingStrength.sigma, 2)}`} />
      <Row label="locule μ±σ" value={`${fmt(cultivar.loculeCount.mu, 1)}±${fmt(cultivar.loculeCount.sigma, 1)}`} />
      <Row label="mass μ±σ" value={`${fmt(cultivar.potentialFruitMassG.mu, 0)}±${fmt(cultivar.potentialFruitMassG.sigma, 0)}`} unit="g" />
      <Row label="defoliation" value={fmt(cultivar.defoliationAggressiveness, 2)} />
      <Row label="SLA" value={fmt(cultivar.SLA, 3)} unit="m²/g" />
    </div>
  );
}

function PlantStateTable({ state }: { state: PlantPhysiologyState | null }) {
  if (!state) {
    return <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C_FG_DIM }}>no state yet</div>;
  }
  const HI = state.W > 0 ? state.W_f / state.W : 0;
  return (
    <div>
      <Row label="day" value={fmt(state.day, 0)} />
      <Row label="TT" value={fmt(state.TT, 1)} unit="°C·d" />
      <Row label="N" value={fmt(state.N, 0)} unit="nodes" />
      <Row label="LAI" value={fmt(state.LAI, 2)} unit="m²/m²" />
      <Row label="W" value={fmt(state.W, 1)} unit="g DM" />
      <Row label="W_f" value={fmt(state.W_f, 1)} unit="g DM" />
      <Row label="W_m" value={fmt(state.W_m, 1)} unit="g DM" />
      <Row label="HI" value={fmt(HI, 3)} />
      <Row label="height" value={fmt(state.heightCm, 0)} unit="cm" />
      <Row label="trusses" value={fmt(state.trusses.length, 0)} />
    </div>
  );
}

const STAGE_ABBR = ['G', 'B', 'T', 'P', 'L', 'R'];
function stageLetter(s: RipenStage | -1): string {
  if (s < 0) return '·';
  return STAGE_ABBR[s] ?? '·';
}

function TrussTable({
  state, cultivar,
}: { state: PlantPhysiologyState | null; cultivar: Cultivar }) {
  if (!state || state.trusses.length === 0) {
    return <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C_FG_DIM }}>no trusses yet</div>;
  }
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '20px 28px repeat(8, 18px) 32px',
        gap: 2,
        color: C_FG_MUTE,
        marginBottom: 4,
      }}>
        <span>T</span>
        <span style={{ textAlign: 'right' }}>N</span>
        {[1,2,3,4,5,6,7,8].map((i) => <span key={i} style={{ textAlign: 'center' }}>F{i}</span>)}
        <span style={{ textAlign: 'right' }}>abrt</span>
      </div>
      {state.trusses.map((truss, ti) => {
        const live = truss.fruits.filter((f) => !f.aborted);
        const aborted = truss.fruits.length - live.length;
        const wasPruned = live.length === cultivar.trussTargetFruitCount &&
          truss.fruits.length > cultivar.trussTargetFruitCount;
        return (
          <div key={ti} style={{
            display: 'grid',
            gridTemplateColumns: '20px 28px repeat(8, 18px) 32px',
            gap: 2,
            padding: '1px 0',
          }}>
            <span style={{ color: C_FG_MUTE }}>{ti + 1}</span>
            <span style={{ color: C_FG, textAlign: 'right' }}>
              {live.length}{wasPruned ? '*' : ''}
            </span>
            {Array.from({ length: 8 }, (_, i) => {
              const fruit = truss.fruits[i];
              if (!fruit) return <span key={i} style={{ textAlign: 'center', color: C_FG_DIM }}>·</span>;
              if (fruit.aborted) return <span key={i} style={{ textAlign: 'center', color: C_BAD }}>×</span>;
              if (fruit.fertilizationTT < 0) {
                return <span key={i} style={{ textAlign: 'center', color: C_FG_DIM }}>○</span>;
              }
              const letter = stageLetter(fruit.ripenStage);
              const color = fruit.ripenStage >= 4 ? C_BAD : fruit.ripenStage >= 2 ? C_WARN : C_OK;
              return <span key={i} style={{ textAlign: 'center', color }}>{letter}</span>;
            })}
            <span style={{ color: C_FG_DIM, textAlign: 'right' }}>{aborted}</span>
          </div>
        );
      })}
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: C_FG_DIM, marginTop: 6, lineHeight: 1.5 }}>
        G green · B breaker · T turning · P pink · L light-red · R red<br />
        ○ flower bud · × aborted · * pruned to target
      </div>
    </div>
  );
}

function GenomeTable({ state }: { state: PlantPhysiologyState | null }) {
  if (!state) {
    return <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C_FG_DIM }}>no state yet</div>;
  }
  return (
    <div>
      <Row label="seed" value={state.seed} />
      <Row label="rngCounter" value={state.rngCounter} />
      <Row label="hash" value={`cv=tomimaru-muchoo seed=${state.seed}`} />
    </div>
  );
}
