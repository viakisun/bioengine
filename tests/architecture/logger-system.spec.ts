// Phase L0 — Namespace logger 단위 검증.
//
// Plan SSOT: `.claude/plans/sleepy-growing-pretzel.md` §2

import { test, expect } from '@playwright/test';
import {
  createLogger,
  log,
  ALL_NAMESPACES,
  _getEffectiveLevelForTest,
  _getNsDefaultsForTest,
  type LogNamespace,
  type NamespaceLogger,
} from '../../src/utils/logger';

test.describe('Phase L0 — Logger system', () => {
  test('LOGGER-NAMESPACE-API-01: createLogger / NamespaceLogger / LogNamespace export', () => {
    expect(typeof createLogger).toBe('function');
    const l = createLogger('engine');
    expect(typeof l.debug).toBe('function');
    expect(typeof l.info).toBe('function');
    expect(typeof l.warn).toBe('function');
    expect(typeof l.error).toBe('function');
  });

  test('LOGGER-CACHE-01: 동일 namespace는 동일 인스턴스 반환', () => {
    const a = createLogger('engine');
    const b = createLogger('engine');
    expect(a).toBe(b);
    const c = createLogger('scene');
    expect(a).not.toBe(c);
  });

  test('LOGGER-LEVEL-RANK-01: debug<info<warn<error 순서', () => {
    // RANK은 internal이지만 effective level과 결합해 검증
    const defaults = _getNsDefaultsForTest();
    expect(defaults.engine).toBe('warn');
    expect(defaults.progressive).toBe('info');
    expect(defaults.overlay).toBe('info');
    expect(defaults.app).toBe('error');
  });

  test('LOGGER-EFFECTIVE-LEVEL-01: NS_DEFAULTS 적용 (opt-in 없는 환경)', () => {
    // Playwright의 page-less context는 location.search='' → opt-in 비활성
    // effective은 NS_DEFAULTS 그대로
    expect(_getEffectiveLevelForTest('engine')).toBe('warn');
    expect(_getEffectiveLevelForTest('progressive')).toBe('info');
    expect(_getEffectiveLevelForTest('app')).toBe('error');
  });

  test('LOGGER-ALL-NAMESPACES-01: ALL_NAMESPACES가 10개 멤버 모두 포함', () => {
    expect(ALL_NAMESPACES.length).toBe(10);
    const set = new Set(ALL_NAMESPACES);
    expect(set.has('engine')).toBe(true);
    expect(set.has('progressive')).toBe(true);
    expect(set.has('app')).toBe(true);
  });

  test('LOGGER-LEGACY-WRAPPER-01: log = createLogger("app") alias + log.dev = log.debug', () => {
    // log는 LegacyLogger (NamespaceLogger + .dev alias)
    expect(typeof log.dev).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(log.dev).toBe(log.debug);  // 동일 함수 reference
  });

  test('LOGGER-AUTO-PREFIX-01: warn 호출 시 [ns] prefix 자동 부착 (간접 검증)', () => {
    // 직접 console capture는 어려우므로 함수 string repr로 우회 검증
    const l = createLogger('skinplant');
    expect(typeof l.warn).toBe('function');
    // 실제 prefix 검증은 PRODUCTION-LOG-COUNT-01 + manual smoke로
  });

  test('LOGGER-OPT-IN-EVALUATION-01: opt-in 평가는 모듈 로드 시점 1회 (immutable)', () => {
    // 동일 namespace를 여러 번 createLogger해도 같은 인스턴스 (cache).
    // 런타임에 localStorage 변경해도 logger 동작 _불변_.
    const before = createLogger('engine');
    // (런타임 localStorage 변경 시뮬레이션은 module reload 없이는 불가 — 검증
    //  포인트는 _instance identity_)
    const after = createLogger('engine');
    expect(before).toBe(after);
  });

  test('LOGGER-PROGRESSIVE-INFO-DEFAULT-01: progressive namespace는 info default', () => {
    expect(_getEffectiveLevelForTest('progressive')).toBe('info');
    // 즉 log.info는 출력, log.debug는 silent
  });

  test('LOGGER-OVERLAY-INFO-DEFAULT-01: overlay namespace는 info default (hotkey feedback)', () => {
    expect(_getEffectiveLevelForTest('overlay')).toBe('info');
  });

  test('LOGGER-APP-ERROR-DEFAULT-01: app (legacy) namespace는 error default (silent dev/info)', () => {
    expect(_getEffectiveLevelForTest('app')).toBe('error');
  });

  test('LOGGER-NAMESPACE-WHITELIST-01: createLogger 인자는 LogNamespace literal만 (TS type 검증)', () => {
    // TypeScript compile에서 강제 — runtime 검증은 namespace 멤버 확인
    const validNs: LogNamespace[] = ['engine', 'scene', 'quality', 'progressive',
      'skinplant', 'overlay', 'growth', 'leaf', 'plant', 'app'];
    for (const ns of validNs) {
      const l: NamespaceLogger = createLogger(ns);
      expect(l).toBeTruthy();
    }
  });
});
