// S1.d (RFP §15) — Scenario loader.
//
// docs/proposal/scenarios/*.scenario.jsonc 를 Vite의 import.meta.glob 로 일괄 로드,
// jsonc-parser 로 파싱, Zod 로 validate.
//
// 카탈로그 호출 패턴:
//   const all = await loadCatalog();
//   const drive = all.filter(s => s.domain === 'autonomous-driving');
//
// 추가 시나리오는 docs/proposal/scenarios/ 또는 src/scenarios/catalog/ 에 .scenario.jsonc 드롭.

import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { ScenarioSchema, type ScenarioSpec } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('scenarios');

// Vite glob — RFP scenarios/ + 로컬 catalog/ 둘 다 수용.
//   ?raw 로 텍스트 가져온 뒤 jsonc-parser 통과.
const rfpScenarios = import.meta.glob('../../docs/proposal/scenarios/*.scenario.jsonc', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const localScenarios = import.meta.glob('./catalog/*.scenario.jsonc', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface ScenarioLoadResult {
  spec: ScenarioSpec;
  /** 원본 파일 경로 (디버그·trace). */
  path: string;
}

export interface ScenarioLoadError {
  path: string;
  reason: string;
}

interface CatalogResult {
  loaded: ScenarioLoadResult[];
  errors: ScenarioLoadError[];
}

/** S2.a — JSONC parse error 코드를 사람이 읽을 수 있는 메시지로. */
function describeJsoncError(code: number): string {
  // jsonc-parser ParseErrorCode enum (안정 범주만 명시, 나머지는 'code N').
  switch (code) {
    case 1: return 'InvalidSymbol';
    case 2: return 'InvalidNumberFormat';
    case 3: return 'PropertyNameExpected';
    case 4: return 'ValueExpected';
    case 5: return 'ColonExpected';
    case 6: return 'CommaExpected';
    case 7: return 'CloseBraceExpected';
    case 8: return 'CloseBracketExpected';
    case 9: return 'EndOfFileExpected';
    case 10: return 'InvalidCommentToken';
    case 11: return 'UnexpectedEndOfComment';
    case 12: return 'UnexpectedEndOfString';
    case 13: return 'UnexpectedEndOfNumber';
    case 14: return 'InvalidUnicode';
    case 15: return 'InvalidEscapeCharacter';
    case 16: return 'InvalidCharacter';
    default: return `code ${code}`;
  }
}

function parseOne(path: string, raw: string): ScenarioLoadResult | ScenarioLoadError {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    // S2.a — 코드 + offset 표시 (디버깅에 유용).
    const detail = errors
      .slice(0, 3)
      .map((e) => `${describeJsoncError(e.error)}@offset=${e.offset}`)
      .join(', ');
    return { path, reason: `jsonc parse: ${detail}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}` };
  }
  const result = ScenarioSchema.safeParse(parsed);
  if (!result.success) {
    // S2.a — Zod issues를 경로별 한 줄씩 (사용자가 어느 필드인지 즉시 파악).
    const issueLines = result.error.issues
      .slice(0, 5)
      .map((iss) => {
        const dotPath = iss.path.length > 0 ? iss.path.join('.') : '(root)';
        return `${dotPath}: ${iss.message}`;
      });
    const more = result.error.issues.length > 5 ? ` (+${result.error.issues.length - 5} more)` : '';
    return { path, reason: `zod: ${issueLines.join('; ')}${more}` };
  }
  return { spec: result.data, path };
}

/** 동기 로드 — Vite eager glob 사용. 페이지 진입 시 즉시 사용 가능. */
export function loadCatalogSync(): CatalogResult {
  const loaded: ScenarioLoadResult[] = [];
  const errors: ScenarioLoadError[] = [];
  const all: Array<[string, string]> = [
    ...Object.entries(rfpScenarios),
    ...Object.entries(localScenarios),
  ];

  for (const [path, raw] of all) {
    const r = parseOne(path, raw);
    if ('spec' in r) {
      loaded.push(r);
    } else {
      errors.push(r);
      log.warn(`Scenario load failed: ${r.path} — ${r.reason}`);
    }
  }

  // id 중복 검사 — 같은 id 발견 시 경로 함께 경고.
  const seen = new Map<string, string>();
  for (const r of loaded) {
    const existing = seen.get(r.spec.id);
    if (existing) {
      log.warn(`Duplicate scenario id "${r.spec.id}" — ${existing} vs ${r.path}`);
    }
    seen.set(r.spec.id, r.path);
  }

  return { loaded, errors };
}

/** id로 단건 조회. 카탈로그 1회 로드 결과를 캐시. */
let cached: CatalogResult | null = null;

export function getCatalog(): CatalogResult {
  if (cached === null) {
    cached = loadCatalogSync();
  }
  return cached;
}

export function getScenarioById(id: string): ScenarioSpec | null {
  const { loaded } = getCatalog();
  return loaded.find((r) => r.spec.id === id)?.spec ?? null;
}
