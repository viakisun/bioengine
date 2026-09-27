// S1.e + S2.d (RFP §15) — Scenario Picker.
//
// docs/proposal/scenarios/ 카탈로그를 도메인별 그룹으로 표시.
// 사용자가 카드 클릭 → onSelect(scenario.id).
//
// S1 mvp: 검색·필터 없음.
// S2.d: 검색창 + 도메인·시기·모드 필터 + "+ 새 시나리오" 버튼 (Composer 진입).

import { useMemo, useState } from 'react';
import { getCatalog } from '../../scenarios/loader';
import type { ScenarioDomain, ScenarioSpec } from '../../scenarios/types';

interface PickerProps {
  /** 사용자가 시나리오를 선택했을 때. */
  onSelect: (scenario: ScenarioSpec) => void;
  /** 닫기 / 뒤로 가기. */
  onCancel?: () => void;
  /** 현재 모드 기준 필터 (consumableBy에 포함된 시나리오만). 미지정 시 전체. */
  modeFilter?: 'Workbench' | 'Foundry' | 'Twin';
  /** S2.d — "+ 새 시나리오" 클릭 시 Composer ad-hoc 진입. */
  onCompose?: (baseScenario?: ScenarioSpec) => void;
  /** S2.c — My Scenarios 진입. */
  onOpenMyScenarios?: () => void;
}

const DOMAIN_LABELS: Record<ScenarioDomain, string> = {
  'autonomous-driving': '자율주행',
  thinning: '적과',
  pruning: '적심',
  spray: '방제',
  recognition: '인식 (Foundry)',
  phenotyping: '생육 분석',
};

const DOMAIN_ORDER: ScenarioDomain[] = [
  'autonomous-driving',
  'thinning',
  'pruning',
  'spray',
  'recognition',
  'phenotyping',
];

/** S2.d — 시기 필터 옵션 (생육 단계 3구간 + 전체). */
type StageFilter = 'all' | 'early' | 'mid' | 'late';

const STAGE_RANGE: Record<StageFilter, (day: number) => boolean> = {
  all: () => true,
  early: (d) => d <= 30,
  mid: (d) => d > 30 && d <= 70,
  late: (d) => d > 70,
};

const STAGE_LABELS: Record<StageFilter, string> = {
  all: '전체',
  early: '초기 D0~30',
  mid: '중기 D30~70',
  late: '후기 D70~120',
};

export function Picker({ onSelect, onCancel, modeFilter, onCompose, onOpenMyScenarios }: PickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // S2.d — 검색·필터 상태.
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<ScenarioDomain | 'all'>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');

  const groups = useMemo(() => {
    const { loaded, errors } = getCatalog();
    const q = search.trim().toLowerCase();

    const all = loaded
      .map((r) => r.spec)
      .filter((s) => (modeFilter ? s.consumableBy.includes(modeFilter) : true))
      .filter((s) => (domainFilter === 'all' ? true : s.domain === domainFilter))
      .filter((s) => STAGE_RANGE[stageFilter](s.crop.day))
      .filter((s) => {
        if (!q) return true;
        return (
          s.id.toLowerCase().includes(q) ||
          (s.meta?.description ?? '').toLowerCase().includes(q)
        );
      });

    const byDomain: Record<ScenarioDomain, ScenarioSpec[]> = {
      'autonomous-driving': [],
      thinning: [],
      pruning: [],
      spray: [],
      recognition: [],
      phenotyping: [],
    };
    for (const s of all) byDomain[s.domain].push(s);
    return { byDomain, total: all.length, errors: errors.length };
  }, [modeFilter, search, domainFilter, stageFilter]);

  return (
    <div
      className="phytosim-picker"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--p-bg, #111)',
        color: 'var(--p-fg, #ddd)',
        overflow: 'auto',
        padding: '32px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Header */}
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
            Scenario Catalog
          </div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            시나리오 선택
            {modeFilter && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--p-fg-dim, #888)', marginLeft: 12 }}>
                · {modeFilter} 모드
              </span>
            )}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--p-fg-muted, #aaa)' }}>
            {groups.total}개 시나리오 · {groups.errors > 0 ? <span style={{ color: '#d66' }}>{groups.errors} 로드 실패</span> : '모두 정상'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onOpenMyScenarios && (
            <button
              className="p-btn"
              onClick={onOpenMyScenarios}
              style={{ padding: '6px 14px' }}
              title="저장한 변형 시나리오"
            >
              ★ My Scenarios
            </button>
          )}
          {onCompose && (
            <button
              className="p-btn p-btn-primary"
              onClick={() => onCompose()}
              style={{ padding: '6px 14px' }}
              title="조건 dial로 새 시나리오 작성 (L3.5 Composer)"
            >
              + 새 시나리오
            </button>
          )}
          {onCancel && (
            <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>

      {/* S2.d — 검색 + 도메인·시기 필터 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: 12,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--p-border, #333)',
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="시나리오 id 또는 설명 검색…"
          aria-label="시나리오 검색"
          style={{
            flex: '1 1 220px',
            minWidth: 180,
            padding: '6px 10px',
            border: '1px solid var(--p-border, #333)',
            background: 'var(--p-bg-deep, #0c0c0c)',
            color: 'var(--p-fg, #ddd)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          <span style={{ color: 'var(--p-fg-dim, #888)' }}>도메인</span>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.currentTarget.value as ScenarioDomain | 'all')}
            aria-label="도메인 필터"
            style={{
              padding: '4px 8px',
              border: '1px solid var(--p-border, #333)',
              background: 'var(--p-bg-deep, #0c0c0c)',
              color: 'var(--p-fg, #ddd)',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <option value="all">전체</option>
            {DOMAIN_ORDER.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          <span style={{ color: 'var(--p-fg-dim, #888)' }}>시기</span>
          <div className="p-seg" style={{ display: 'flex', gap: 2 }}>
            {(Object.keys(STAGE_LABELS) as StageFilter[]).map((s) => (
              <button
                key={s}
                className={`p-seg-item ${stageFilter === s ? 'active' : ''}`}
                onClick={() => setStageFilter(s)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: stageFilter === s ? 600 : 400,
                }}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {(search || domainFilter !== 'all' || stageFilter !== 'all') && (
          <button
            className="p-btn"
            onClick={() => {
              setSearch('');
              setDomainFilter('all');
              setStageFilter('all');
            }}
            style={{ padding: '4px 10px', fontSize: 11 }}
            title="필터 초기화"
          >
            ✕ 초기화
          </button>
        )}
      </div>

      {/* Domain groups */}
      {DOMAIN_ORDER.map((domain) => {
        const items = groups.byDomain[domain];
        if (items.length === 0) return null;
        return (
          <section key={domain} aria-label={DOMAIN_LABELS[domain]}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--p-fg-dim, #888)',
                marginBottom: 10,
              }}
            >
              {DOMAIN_LABELS[domain]} · {items.length}개
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {items.map((s) => {
                const isSelected = selected === s.id;
                return (
                  <button
                    key={s.id}
                    className="p-surface p-surface-hover"
                    onClick={() => {
                      setSelected(s.id);
                      onSelect(s);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: 14,
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      border: isSelected
                        ? '1px solid var(--p-border-accent, #4080d0)'
                        : '1px solid var(--p-border, #333)',
                      background: isSelected ? 'var(--p-accent-muted, #1a2540)' : 'transparent',
                      color: 'inherit',
                    }}
                  >
                    <div
                      className="p-mono"
                      style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)' }}
                    >
                      {s.id}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-fg, #ddd)' }}>
                      Day {s.crop.day} · {s.consumableBy.join(' / ')}
                    </div>
                    {s.meta?.description && (
                      <div
                        style={{
                          fontSize: 11,
                          lineHeight: 1.4,
                          color: 'var(--p-fg-muted, #aaa)',
                        }}
                      >
                        {s.meta.description}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
